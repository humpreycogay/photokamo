// Applies Adjust edits to a full-size engine render off the main thread.
// In: { id, bitmap, adjustments } (bitmap transferred). Out: { id, bitmap } or { id, error }.
import { applyAdjustments } from './renderer.js';

self.onmessage = ({ data: { id, bitmap, adjustments } }) => {
  try {
    const output = applyAdjustments(bitmap, adjustments);
    const result = output === bitmap ? bitmap : output.transferToImageBitmap();
    if (result !== bitmap) bitmap.close();
    self.postMessage({ id, bitmap: result }, [result]);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
};
