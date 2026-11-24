// Module worker running the DuXun engine: on the GPU (gpu.js, WebGL2) when the browser can, else
// core.js, the JavaScript port of the plugin's CPU renderer. Both render the same thing (same
// constants, verified). The photo stays in this worker; nothing is fetched.
import { render as renderPixels } from './core.js';
import { createGpuRenderer } from './gpu.js';

let gpu; // undefined until tried; null when WebGL2 isn't usable here
function gpuRenderer() {
  if (gpu === undefined) { try { gpu = createGpuRenderer(); } catch { gpu = null; } }
  return gpu;
}

let source = null;   // { imageId, bitmap }
const scaled = new Map(); // `${imageId}:${width}` → { width, height, rgba }

const post = (message, transfer = []) => self.postMessage(message, transfer);

function pixelsAt(maxEdge, maxPixels) {
  const { width, height } = source.bitmap;
  const scale = Math.min(1, maxEdge / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const key = `${source.imageId}:${w}`;
  if (!scaled.has(key)) {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source.bitmap, 0, 0, w, h);
    if (scaled.size > 2) scaled.delete(scaled.keys().next().value);
    scaled.set(key, { width: w, height: h, rgba: ctx.getImageData(0, 0, w, h).data });
  }
  return scaled.get(key);
}

self.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'image') { source = { imageId: message.imageId, bitmap: message.bitmap }; scaled.clear(); return; }
  if (message.type === 'warm') { post({ type: 'done', jobId: message.jobId, bitmap: null, info: { backend: gpuRenderer() ? 'webgl' : 'cpu' } }); return; }
  if (message.type !== 'render') return;
  try {
    if (!source || source.imageId !== message.imageId) throw new Error('Image not loaded in the film engine');
    const full = message.quality === 'full';
    const image = pixelsAt(full ? Infinity : message.maxEdge, message.maxPixels);
    post({ type: 'progress', jobId: message.jobId, value: 0.1 });
    let bitmap = null, backend = 'webgl';
    try { bitmap = gpuRenderer()?.render(image.rgba, image.width, image.height, message.params) ?? null; }
    catch (error) { console.warn('DuXun GPU render failed; using the CPU renderer.', error); gpu = null; }
    if (!bitmap) { // no WebGL2, or larger than the GPU's texture limit
      backend = 'cpu';
      const out = renderPixels(image.rgba, image.width, image.height, message.params);
      const canvas = new OffscreenCanvas(image.width, image.height);
      canvas.getContext('2d').putImageData(new ImageData(out, image.width, image.height), 0, 0);
      bitmap = canvas.transferToImageBitmap();
    }
    post({ type: 'done', jobId: message.jobId, bitmap, info: { backend } }, [bitmap]);
  } catch (error) {
    post({ type: 'error', jobId: message.jobId, message: String(error?.message || error) });
  }
});
