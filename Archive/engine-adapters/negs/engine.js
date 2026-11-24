// Worker client for the negs engine. Loaded only when negs is selected; the UI talks to it
// through ./index.js. Same message protocol as the spektrafilm-rs client.
//
//   render(imageBitmap, job, { quality: 'preview' | 'full', signal, onProgress, onStatus }) → ImageBitmap
//   warm(job)    downloads + starts the engine (WebGPU or CPU) and the data the job needs
//   dispose()    stops the worker (frees its memory) when another engine is chosen

const coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

// The CPU engine needs a lot of memory per megapixel; WebGPU renders up to its own limits.
const CPU_MAX_PIXELS = coarsePointer ? 2.5e6 : 4e6;
const GPU_MAX_PIXELS = coarsePointer ? 8e6 : 16e6;
// The CPU engine needs ~11 µs per pixel: 512 px previews take about 3 s, 1280 px about 18 s.
const CPU_PREVIEW_EDGE = 512;

export const engineInfo = {
  name: 'negs',
  backend: null, // 'webgpu' | 'cpu', once started
  previewEdge: 1280,
  previewLabel: 'Preview',
  previewDetail: 'full model · 1280 px',
  fullMaxPixels: CPU_MAX_PIXELS
};
function setBackend(info) {
  if (!info?.backend || engineInfo.backend === info.backend && !info.limits) return;
  engineInfo.backend = info.backend;
  const gpu = info.backend === 'webgpu';
  engineInfo.previewDetail = gpu ? 'WebGPU · full model · 1280 px' : `CPU · full model · ${CPU_PREVIEW_EDGE} px (no WebGPU in this browser)`;
  engineInfo.fullMaxPixels = gpu ? Math.min(GPU_MAX_PIXELS, info.limits?.[1] || GPU_MAX_PIXELS) : CPU_MAX_PIXELS;
}

/** Size the full-quality render will produce for a photo of this size. */
export function fullRenderSize(width, height) {
  const scale = Math.min(1, Math.sqrt(engineInfo.fullMaxPixels / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), capped: scale < 1 };
}

// 'cpu' forces the CPU engine (testing, or a page with ?negs=cpu); otherwise WebGPU when available.
const preferredBackend = typeof location !== 'undefined' && new URLSearchParams(location.search).get('negs') === 'cpu' ? 'cpu' : 'auto';

let worker = null;
let workerImage = null;
let nextId = 1;
const imageIds = new WeakMap();
const jobs = new Map();
const downloadListeners = new Set();
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
    else if (type === 'done') { jobs.delete(jobId); setBackend(event.data.info); job.onProgress?.(1); job.resolve(event.data.bitmap); }
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

export function warm(job) {
  if (!worker) startWorker();
  const jobId = nextId++;
  return new Promise((resolve, reject) => {
    jobs.set(jobId, { resolve, reject });
    worker.postMessage({ type: 'warm', jobId, job, prefer: preferredBackend });
  });
}

export async function render(imageBitmap, job, { quality = 'preview', signal, onProgress, onStatus } = {}) {
  if (signal?.aborted) throw abortError();
  if (!worker) startWorker();
  if (!imageIds.has(imageBitmap)) imageIds.set(imageBitmap, nextId++);
  const imageId = imageIds.get(imageBitmap);
  if (workerImage !== imageBitmap) {
    worker.postMessage({ type: 'image', imageId, bitmap: imageBitmap });
    workerImage = imageBitmap;
  }
  const jobId = nextId++;
  return new Promise((resolve, reject) => {
    jobs.set(jobId, { resolve, reject, onProgress, onStatus });
    worker.postMessage({ type: 'render', jobId, imageId, job, quality, maxEdge: engineInfo.previewEdge, cpuMaxEdge: CPU_PREVIEW_EDGE, maxPixels: engineInfo.fullMaxPixels, prefer: preferredBackend });
    signal?.addEventListener('abort', () => { if (jobs.has(jobId)) stopAll(abortError()); }, { once: true });
  });
}
