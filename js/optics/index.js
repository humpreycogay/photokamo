// Main-thread side of the optics stage: hands a photo to js/optics/worker.js and returns an ImageBitmap.
export { sections, controls, controlByPath, cameraControls, cameraOf, sceneOf, defaultOptics, normalizeOptics, isNeutral, renderKey as opticsRenderKey } from './params.js';
export { formats, formatById, fieldOfView, mmPerPixel } from './formats.js';
export { profiles, profileById, expandProfile, matchesProfile } from './profiles.js';
import { isNeutral, normalizeOptics } from './params.js';

let worker = null, nextId = 0;
const jobs = new Map();
function startWorker() {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const job = jobs.get(data.id); jobs.delete(data.id);
    if (data.error) job?.reject(new Error(data.error)); else job?.resolve(data.bitmap);
  };
  worker.onerror = event => {
    for (const job of jobs.values()) job.reject(new Error(event.message || 'Optics worker failed'));
    jobs.clear(); worker.terminate(); worker = null;
  };
}

/** `source` (image, canvas or bitmap) with the optics applied, at most `maxEdge` px on its long side.
 *  Neutral optics return `source` itself, so photos without optics stay byte-identical. */
export async function renderOptics(source, optics, maxEdge = Infinity) {
  if (isNeutral(optics)) return source;
  const width = source.naturalWidth || source.width, height = source.naturalHeight || source.height;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const bitmap = await createImageBitmap(source, scale < 1
    ? { resizeWidth: Math.max(1, Math.round(width * scale)), resizeHeight: Math.max(1, Math.round(height * scale)), resizeQuality: 'high' } : {});
  if (!worker) startWorker();
  return new Promise((resolve, reject) => {
    const id = ++nextId; jobs.set(id, { resolve, reject });
    worker.postMessage({ id, bitmap, optics: normalizeOptics(optics) }, [bitmap]);
  });
}
