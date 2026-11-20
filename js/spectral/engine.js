// The one interface the UI uses for Advanced (spectral) rendering:
//
//   renderSpectral(imageBitmap, params, { quality: 'preview' | 'full', signal, onProgress }) → ImageBitmap
//
// Rendering runs in a module Worker so the UI never freezes. Cancelling (signal.abort()) terminates
// the worker, so a long full-quality render really stops; the next call starts a fresh worker.
// Phase 6 swaps the worker's engine (stub → LUT or WebAssembly) without changing this interface.

export const engineInfo = { name: 'stub', previewEdge: 1280, previewLabel: 'Fast preview', previewDetail: '1280 px' };

let worker = null;
let workerImage = null; // the ImageBitmap the current worker holds
let nextId = 1;
const imageIds = new WeakMap();
const jobs = new Map();

function startWorker() {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  workerImage = null;
  worker.addEventListener('message', event => {
    const { type, jobId } = event.data;
    const job = jobs.get(jobId); if (!job) return;
    if (type === 'progress') job.onProgress?.(event.data.value);
    else if (type === 'done') { jobs.delete(jobId); job.onProgress?.(1); job.resolve(event.data.bitmap); }
    else if (type === 'error') { jobs.delete(jobId); job.reject(new Error(event.data.message)); }
  });
  worker.addEventListener('error', event => {
    for (const job of jobs.values()) job.reject(new Error(event.message || 'Spectral worker failed'));
    jobs.clear(); worker?.terminate(); worker = null;
  });
}

function abortError() { return new DOMException('Render cancelled', 'AbortError'); }

export async function renderSpectral(imageBitmap, params, { quality = 'preview', signal, onProgress } = {}) {
  if (signal?.aborted) throw abortError();
  if (!worker) startWorker();
  if (!imageIds.has(imageBitmap)) imageIds.set(imageBitmap, nextId++);
  const imageId = imageIds.get(imageBitmap);
  if (workerImage !== imageBitmap) {
    // Structured clone: the main thread keeps its own copy of the bitmap.
    worker.postMessage({ type: 'image', imageId, bitmap: imageBitmap });
    workerImage = imageBitmap;
  }
  const maxEdge = quality === 'full' ? Math.max(imageBitmap.width, imageBitmap.height) : engineInfo.previewEdge;
  const jobId = nextId++;
  return new Promise((resolve, reject) => {
    jobs.set(jobId, { resolve, reject, onProgress });
    worker.postMessage({ type: 'render', jobId, imageId, params, maxEdge });
    signal?.addEventListener('abort', () => {
      if (!jobs.has(jobId)) return;
      // Stop everything in flight: terminate and let the next call start a fresh worker.
      for (const job of jobs.values()) job.reject(abortError());
      jobs.clear(); worker.terminate(); worker = null; workerImage = null;
    }, { once: true });
  });
}
