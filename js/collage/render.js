// The one collage renderer (CollagePlan.md decision #3): preview and export call it with different sheet sizes.
// Main-thread compositing (V6): a few drawImage calls; the photos' edits were rendered by their own Workers.
import { shapePath } from './shapes.js';
import { fillGeometry } from './fill.js';
import { drawOriented } from '../renderer.js';

/** Draws a photo to cover `rect` with its fill (js/collage/fill.js). The cover is computed for the rect grown by
 *  1 px on each side, so resampling never lets paper show along a slot's edge. */
export function drawCover(ctx, image, rect, fill = {}) {
  const g = fillGeometry(image.width, image.height, rect.w + 2, rect.h + 2, fill);
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.rotate(g.angle * Math.PI / 180); ctx.scale(g.scale, g.scale); ctx.translate(-g.cx, -g.cy);
  drawOriented(ctx, image, { rotate: fill.rotate || 0, flip: Boolean(fill.flip) }, g.W, g.H);
  ctx.restore();
}
/** The clip outline of a laid-out slot (rounded corners when it has a radius, else its own shape or a rect). */
export function slotPath(slot) {
  if (slot.shape) return shapePath(slot.shape, slot);
  if (slot.radius > 0) return shapePath({ kind: 'rounded', radius: slot.radius / Math.min(slot.w, slot.h) }, slot);
  return shapePath({ kind: 'rect' }, slot);
}

/** The sheet under the slots: cleared, then the paper colour unless the background is transparent. */
export function drawPaper(ctx, doc, layout) {
  ctx.clearRect(0, 0, layout.width, layout.height);
  if (doc.sheet.background === 'paper') { ctx.fillStyle = doc.paper.color; ctx.fillRect(0, 0, layout.width, layout.height); }
}
/** One laid-out slot: its photo clipped to the slot, or `emptyFill` (preview only) when it has none. */
export function drawSlot(ctx, doc, slot, image, emptyFill = null) {
  if (!image && !emptyFill) return;
  ctx.save();
  ctx.clip(slotPath(slot));
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (image) drawCover(ctx, image, slot, doc.slots[slot.index]);
  else { ctx.fillStyle = emptyFill; ctx.fillRect(slot.x, slot.y, slot.w, slot.h); }
  ctx.restore();
}
/** Slots in drawing order (z, then layout order). */
export const drawOrder = layout => [...layout.slots].sort((a, b) => a.z - b.z || a.index - b.index);

/** Draws the collage `doc` laid out as `layout` (js/collage/layout.js) on ctx (sized layout.width × height).
 *  imageFor(index) → the slot's photo edit (canvas or ImageBitmap) or null (empty or still rendering). */
export function drawCollage(ctx, doc, layout, imageFor, { emptyFill = 'rgba(128,128,128,.28)' } = {}) {
  drawPaper(ctx, doc, layout);
  for (const slot of drawOrder(layout)) drawSlot(ctx, doc, slot, imageFor(slot.index), emptyFill);
}
