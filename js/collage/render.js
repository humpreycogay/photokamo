// The one collage renderer (CollagePlan.md decision #3): preview and export call it with different sheet sizes.
// Main-thread compositing (V6): a few drawImage calls; the photos' edits were rendered by their own Workers.
import { shapePath } from './shapes.js';

/** Draws a photo to cover `rect`, panned (0–1, .5 = centred) and zoomed (≥ 1) inside its own crop. */
export function drawCover(ctx, image, rect, fill) {
  const iw = image.width, ih = image.height, zoom = Math.max(1, fill?.zoom || 1);
  const scale = Math.max(rect.w / iw, rect.h / ih) * zoom;
  const sw = rect.w / scale, sh = rect.h / scale;
  const sx = (iw - sw) * (fill?.pan?.x ?? .5), sy = (ih - sh) * (fill?.pan?.y ?? .5);
  ctx.drawImage(image, sx, sy, sw, sh, rect.x, rect.y, rect.w, rect.h);
}
/** The clip outline of a laid-out slot (rounded corners when it has a radius, else its own shape or a rect). */
export function slotPath(slot) {
  if (slot.shape) return shapePath(slot.shape, slot);
  if (slot.radius > 0) return shapePath({ kind: 'rounded', radius: slot.radius / Math.min(slot.w, slot.h) }, slot);
  return shapePath({ kind: 'rect' }, slot);
}

/** Draws the collage `doc` laid out as `layout` (js/collage/layout.js) on ctx (sized layout.width × height).
 *  imageFor(index) → the slot's photo edit (canvas or ImageBitmap) or null (empty or still rendering). */
export function drawCollage(ctx, doc, layout, imageFor, { emptyFill = 'rgba(128,128,128,.28)' } = {}) {
  ctx.save();
  ctx.clearRect(0, 0, layout.width, layout.height);
  if (doc.sheet.background === 'paper') { ctx.fillStyle = doc.paper.color; ctx.fillRect(0, 0, layout.width, layout.height); }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const order = [...layout.slots].sort((a, b) => a.z - b.z || a.index - b.index);
  for (const slot of order) {
    const image = imageFor(slot.index);
    ctx.save();
    ctx.clip(slotPath(slot));
    if (image) drawCover(ctx, image, slot, doc.slots[slot.index]);
    else { ctx.fillStyle = emptyFill; ctx.fillRect(slot.x, slot.y, slot.w, slot.h); }
    ctx.restore();
  }
  ctx.restore();
}
