// Worker client for the DuXun engine. Loaded only when DuXun is selected; the UI talks to it
// through ./index.js. Same message protocol as the other engines' clients.

const coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export const engineInfo = {
  name: 'duxun',
  previewEdge: 1280,
  previewLabel: 'Preview',
  previewDetail: 'full pipeline · 1280 px',
  // RGBA8 in and out plus small glow buffers: ~10 bytes per pixel.
  fullMaxPixels: coarsePointer ? 12e6 : 24e6
};

export function fullRenderSize(width, height) {
  const scale = Math.min(1, Math.sqrt(engineInfo.fullMaxPixels / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), capped: scale < 1 };
}

let worker = null;
let workerImage = null;
let nextId = 1;
const imageIds = new WeakMap();
const jobs = new Map();
export function onDownload() { return () => {}; } // nothing large to download

function startWorker() {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  workerImage = null;
  worker.addEventListener('message', event => {
    const { type, jobId } = event.data;
    const job = jobs.get(jobId); if (!job) return;
    if (type === 'progress') job.onProgress?.(event.data.value);
    else if (type === 'done') {
      jobs.delete(jobId);
      const backend = event.data.info?.backend;
      if (backend) engineInfo.previewDetail = `${backend === 'webgl' ? 'GPU' : 'CPU'} · full pipeline · 1280 px`;
      job.onProgress?.(1); job.resolve(event.data.bitmap);
    }
    else if (type === 'error') { jobs.delete(jobId); job.reject(new Error(event.data.message)); }
  });
  worker.addEventListener('error', event => stopAll(new Error(event.message || 'The film engine failed to start')));
}
function abortError() { return new DOMException('Render cancelled', 'AbortError'); }
function stopAll(error) {
  for (const job of jobs.values()) job.reject(error);
  jobs.clear(); worker?.terminate(); worker = null; workerImage = null;
}
export function dispose() { stopAll(abortError()); }

export function warm() {
  if (!worker) startWorker();
  const jobId = nextId++;
  return new Promise((resolve, reject) => { jobs.set(jobId, { resolve, reject }); worker.postMessage({ type: 'warm', jobId }); });
}

export async function render(imageBitmap, params, { quality = 'preview', signal, onProgress } = {}) {
  if (signal?.aborted) throw abortError();
  if (!worker) startWorker();
  if (!imageIds.has(imageBitmap)) imageIds.set(imageBitmap, nextId++);
  const imageId = imageIds.get(imageBitmap);
  if (workerImage !== imageBitmap) { worker.postMessage({ type: 'image', imageId, bitmap: imageBitmap }); workerImage = imageBitmap; }
  const jobId = nextId++;
  return new Promise((resolve, reject) => {
    jobs.set(jobId, { resolve, reject, onProgress });
    worker.postMessage({ type: 'render', jobId, imageId, params, quality, maxEdge: engineInfo.previewEdge, maxPixels: engineInfo.fullMaxPixels });
    signal?.addEventListener('abort', () => { if (jobs.has(jobId)) stopAll(abortError()); }, { once: true });
  });
}
