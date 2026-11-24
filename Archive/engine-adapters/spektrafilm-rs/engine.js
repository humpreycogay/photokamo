// Worker client for the spektrafilm-rs engine. Loaded only when this engine is selected
// (see js/engines/registry.js); the UI talks to it through ./index.js.
//
//   render(imageBitmap, params, { quality: 'preview' | 'full', signal, onProgress, onStatus }) → ImageBitmap
//   warm(params, { onDownload })  downloads + compiles the engine and the data these settings need
//   dispose()                     stops the worker (frees its memory) when another engine is chosen
//
// Engine: spektrafilm-rs (GPL-3.0) compiled to WebAssembly (engines/spektrafilm-rs/runtime/spektrafilm.wasm), run in a
// module Worker (worker.js) so the UI never freezes. Everything runs on this device.
//   'preview' → colour-accurate LUT preview at engineInfo.previewEdge (≈1 s the first time per setting).
//   'full'    → the complete film model incl. grain, halation and blur, capped at engineInfo.fullMaxPixels.
// Cancelling (signal.abort()) terminates the worker, so a long render really stops; the next call
// starts a fresh worker (files come back from the browser cache).

const coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export const engineInfo = {
  name: 'spektrafilm',
  previewEdge: 1280,
  previewLabel: 'Fast preview',
  previewDetail: 'LUT · 1280 px',
  // A full render needs ~100 MB of memory per megapixel; phones get a lower cap.
  fullMaxPixels: coarsePointer ? 2.5e6 : 4e6
};

/** Size the full-quality render will produce for a photo of this size. */
export function fullRenderSize(width, height) {
  const scale = Math.min(1, Math.sqrt(engineInfo.fullMaxPixels / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), capped: scale < 1 };
}

let worker = null;
let workerImage = null; // the ImageBitmap the current worker holds
let nextId = 1;
const imageIds = new WeakMap();
const jobs = new Map();
const downloadListeners = new Set();

/** Listen to download progress ({ loaded, total, done }; total 0 = unknown). Returns an unsubscribe function. */
export function onDownload(listener) { downloadListeners.add(listener); return () => downloadListeners.delete(listener); }

function startWorker() {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  workerImage = null;
  worker.addEventListener('message', event => {
    const { type, jobId } = event.data;
    if (type === 'download') { for (const listener of downloadListeners) listener(event.data); return; }
    const job = jobs.get(jobId); if (!job) return;
    if (type === 'progress') job.onProgress?.(event.data.value);
    else if (type === 'status') job.onStatus?.(event.data.text);
    else if (type === 'done') { jobs.delete(jobId); job.onProgress?.(1); job.resolve(event.data.bitmap); }
    else if (type === 'error') { jobs.delete(jobId); job.reject(new Error(event.data.message)); }
  });
  worker.addEventListener('error', event => {
    for (const job of jobs.values()) job.reject(new Error(event.message || 'The film engine failed to start'));
    jobs.clear(); worker?.terminate(); worker = null; workerImage = null;
  });
}

function abortError() { return new DOMException('Render cancelled', 'AbortError'); }

function stopAll(error) {
  for (const job of jobs.values()) job.reject(error);
  jobs.clear(); worker?.terminate(); worker = null; workerImage = null;
}

/** Stops the worker and everything in flight (another engine was chosen). */
export function dispose() { stopAll(abortError()); }

/** Downloads and compiles the engine plus the data `params` need, so the first render starts at once. */
export function warm(params) {
  if (!worker) startWorker();
  const jobId = nextId++;
  return new Promise((resolve, reject) => {
    jobs.set(jobId, { resolve, reject });
    worker.postMessage({ type: 'warm', jobId, params });
  });
}

export async function render(imageBitmap, params, { quality = 'preview', signal, onProgress, onStatus } = {}) {
  if (signal?.aborted) throw abortError();
  if (!worker) startWorker();
  if (!imageIds.has(imageBitmap)) imageIds.set(imageBitmap, nextId++);
  const imageId = imageIds.get(imageBitmap);
  if (workerImage !== imageBitmap) {
    // Structured clone: the main thread keeps its own copy of the bitmap.
    worker.postMessage({ type: 'image', imageId, bitmap: imageBitmap });
    workerImage = imageBitmap;
  }
  const jobId = nextId++;
  return new Promise((resolve, reject) => {
    jobs.set(jobId, { resolve, reject, onProgress, onStatus });
    worker.postMessage({ type: 'render', jobId, imageId, params, quality, maxEdge: engineInfo.previewEdge, maxPixels: engineInfo.fullMaxPixels });
    signal?.addEventListener('abort', () => {
      if (!jobs.has(jobId)) return;
      // Stop everything in flight: terminate and let the next call start a fresh worker.
      stopAll(abortError());
    }, { once: true });
  });
}
