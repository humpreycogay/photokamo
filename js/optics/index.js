// Main-thread side of the optics stage: hands a photo to js/optics/worker.js and returns an ImageBitmap.
export { sections, controls, controlByPath, cameraControls, cameraOf, sceneOf, defaultOptics, normalizeOptics, isNeutral, renderKey as opticsRenderKey } from './params.js';
export { formats, formatById, fieldOfView, mmPerPixel } from './formats.js';
export { profiles, profileById, expandProfile, matchesProfile } from './profiles.js';
import { isNeutral, normalizeOptics } from './params.js';

// One job in the Worker at a time. A newer *replaceable* request (a preview) takes the place of a replaceable
// one still waiting, and the waiting callers get the newer result: dragging a slider never builds a backlog.
// Their render is stale by then anyway; full-size and export jobs are never replaced.
let worker = null, running = null;
const queue = [];
function settle(job, error, bitmap) { for (const waiter of job.waiters) error ? waiter.reject(error) : waiter.resolve(bitmap); }
function startWorker() {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const job = running; running = null;
    if (job) settle(job, data.error ? new Error(data.error) : null, data.bitmap);
    pump();
  };
  worker.onerror = event => {
    const error = new Error(event.message || 'Optics worker failed');
    if (running) settle(running, error); running = null;
    for (const job of queue.splice(0)) { job.bitmap.close(); settle(job, error); }
    worker.terminate(); worker = null;
  };
}
function pump() {
  if (running || !queue.length) return;
  if (!worker) startWorker();
  running = queue.shift();
  worker.postMessage({ bitmap: running.bitmap, optics: running.optics }, [running.bitmap]);
}

/** `source` (image, canvas or bitmap) with the optics applied, at most `maxEdge` px on its long side.
 *  Neutral optics return `source` itself, so photos without optics stay byte-identical.
 *  `replaceable`: a preview request that a newer preview request may take over while it waits. */
export async function renderOptics(source, optics, maxEdge = Infinity, { replaceable = false } = {}) {
  if (isNeutral(optics)) return source;
  const width = source.naturalWidth || source.width, height = source.naturalHeight || source.height;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const bitmap = await createImageBitmap(source, scale < 1
    ? { resizeWidth: Math.max(1, Math.round(width * scale)), resizeHeight: Math.max(1, Math.round(height * scale)), resizeQuality: 'high' } : {});
  return new Promise((resolve, reject) => {
    const job = { bitmap, optics: normalizeOptics(optics), waiters: [{ resolve, reject }], replaceable };
    const older = replaceable ? queue.findIndex(item => item.replaceable) : -1;
    if (older >= 0) { const [stale] = queue.splice(older, 1); stale.bitmap.close(); job.waiters.push(...stale.waiters); }
    queue.push(job); pump();
  });
}
