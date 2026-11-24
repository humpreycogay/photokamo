// Optics off the main thread. In: { id, bitmap, optics } (bitmap transferred). Out: { id, bitmap } or { id, error }.
// Memory: the decode canvas is released before the pipeline runs and a fresh one is made for the result,
// so a full-size photo is held as canvas + pixels only one at a time (plus the pipeline's own copy).
import { applyOptics } from './pipeline.js';

self.onmessage = ({ data: { id, bitmap, optics } }) => {
  try {
    const { width, height } = bitmap;
    let canvas = new OffscreenCanvas(width, height);
    let ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const image = ctx.getImageData(0, 0, width, height);
    canvas.width = canvas.height = 1; canvas = ctx = null;
    applyOptics(image, optics);
    const out = new OffscreenCanvas(width, height);
    out.getContext('2d').putImageData(image, 0, 0);
    const result = out.transferToImageBitmap();
    self.postMessage({ id, bitmap: result }, [result]);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
};
