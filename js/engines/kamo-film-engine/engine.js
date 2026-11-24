const coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const engineInfo = { name: 'Kamo', previewEdge: 900, previewLabel: 'Preview', previewDetail: 'full spectral model · 900 px', fullMaxPixels: coarsePointer ? 2e6 : 4e6 };
export function fullRenderSize(width, height) {
  const scale = Math.min(1, Math.sqrt(engineInfo.fullMaxPixels / (width * height)));
  return { width: Math.max(2, Math.round(width * scale)), height: Math.max(2, Math.round(height * scale)), capped: scale < 1 };
}

let worker = null, workerImage = null, nextId = 1;
const imageIds = new WeakMap(), jobs = new Map(), downloadListeners = new Set();
export function onDownload(listener) { downloadListeners.add(listener); return () => downloadListeners.delete(listener); }
function abortError() { return new DOMException('Render cancelled', 'AbortError'); }
function stopAll(error) { for (const job of jobs.values()) job.reject(error); jobs.clear(); worker?.terminate(); worker = null; workerImage = null; }
export const dispose = () => stopAll(abortError());
function startWorker() {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); workerImage = null;
  worker.addEventListener('message', event => {
    const { type, jobId } = event.data;
    if (type === 'download') { for (const listener of downloadListeners) listener(event.data); return; }
    const job = jobs.get(jobId); if (!job) return;
    if (type === 'progress') job.onProgress?.(event.data.value);
    else if (type === 'status') job.onStatus?.(event.data.text);
    else if (type === 'done') { jobs.delete(jobId); job.onProgress?.(1); job.resolve(event.data.bitmap); }
    else if (type === 'error') { jobs.delete(jobId); job.reject(new Error(event.data.message)); }
  });
  worker.addEventListener('error', event => stopAll(new Error(event.message || 'Kamo failed to start')));
}
export function warm(job) {
  if (!worker) startWorker(); const jobId = nextId++;
  return new Promise((resolve, reject) => { jobs.set(jobId, { resolve, reject }); worker.postMessage({ type: 'warm', jobId, job }); });
}
export function render(bitmap, job, { quality = 'preview', signal, onProgress, onStatus } = {}) {
  if (signal?.aborted) return Promise.reject(abortError());
  if (!worker) startWorker();
  if (!imageIds.has(bitmap)) imageIds.set(bitmap, nextId++);
  const imageId = imageIds.get(bitmap);
  if (workerImage !== bitmap) { worker.postMessage({ type: 'image', imageId, bitmap }); workerImage = bitmap; }
  const jobId = nextId++;
  return new Promise((resolve, reject) => {
    jobs.set(jobId, { resolve, reject, onProgress, onStatus });
    worker.postMessage({ type: 'render', jobId, imageId, job, quality, maxEdge: engineInfo.previewEdge, maxPixels: engineInfo.fullMaxPixels });
    signal?.addEventListener('abort', () => { if (jobs.has(jobId)) stopAll(abortError()); }, { once: true });
  });
}