// Optics off the main thread. In: { id, bitmap, optics } (bitmap transferred). Out: { id, bitmap } or { id, error }.
import { applyOptics } from './pipeline.js';

self.onmessage = ({ data: { id, bitmap, optics } }) => {
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.putImageData(applyOptics(image, optics), 0, 0);
    const result = canvas.transferToImageBitmap();
    self.postMessage({ id, bitmap: result }, [result]);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
};
