// Adjust work off the main thread (bitmap transferred both ways).
// In: { id, bitmap, adjustments, edge? }. Without `edge`: Adjust edits on a full-size engine render. With `edge`: the
// whole Basic edit (scaled to `edge`, then adjusted), exactly as renderEdit draws it on the main thread.
// Out: { id, bitmap } or { id, error }.
import { applyAdjustments, renderEdit } from './renderer.js';

self.onmessage = ({ data: { id, bitmap, adjustments, edge } }) => {
  try {
    const output = edge ? renderEdit(bitmap, adjustments, edge) : applyAdjustments(bitmap, adjustments);
    const result = output === bitmap ? bitmap : output.transferToImageBitmap();
    if (result !== bitmap) bitmap.close();
    self.postMessage({ id, bitmap: result }, [result]);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
};
