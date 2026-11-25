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
/** Path2D of a flat polygon. */
function polygonPath(points, path = new Path2D()) {
  path.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) path.lineTo(points[i], points[i + 1]);
  path.closePath();
  return path;
}
/** The clip outline of a laid-out slot (its polygon in a shaped sheet, rounded corners, its own shape or a rect). */
export function slotPath(slot) {
  if (slot.outline) return polygonPath(slot.outline);
  if (slot.shape) return shapePath(slot.shape, slot);
  if (slot.radius > 0) return shapePath({ kind: 'rounded', radius: slot.radius / Math.min(slot.w, slot.h) }, slot);
  return shapePath({ kind: 'rect' }, slot);
}
/** A sheet shape { shape, rect, hole } as one path; fill and clip it with 'evenodd' so the hole stays open. */
export function sheetPath({ shape, rect, hole }) {
  const path = shapePath(shape, rect);
  if (hole) path.addPath(shapePath(hole.shape, hole.rect));
  return path;
}

/** Sticker outline and shadow around a shaped sheet (drawn first, on a clear canvas, outside the shape only):
 *  the shadow comes from a copy drawn off-canvas (only the shadow lands) and is cut away inside the shape; the
 *  outline is the shape grown by its width, cut out inside, then a 2 px stroke along the edge, so the photos drawn
 *  on top overlap it by 1 px and no seam shows where they meet. */
function drawSticker(ctx, doc, layout, { shadow = true } = {}) {
  const { outline } = doc.sheet, short = Math.min(layout.width, layout.height), path = sheetPath(layout.paper);
  const ow = outline?.width ? outline.width * short : 0;
  const grown = () => { ctx.fill(path, 'evenodd'); if (ow) ctx.stroke(path); };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineWidth = 2 * ow;
  if (shadow && doc.sheet.shadow) {
    const away = layout.width + short; // the copy is drawn this far left; its shadow is offset back onto the sheet
    ctx.save();
    ctx.translate(-away, 0); ctx.shadowOffsetX = away; ctx.shadowOffsetY = short * .012; ctx.shadowBlur = short * .024;
    ctx.shadowColor = 'rgba(0,0,0,.38)'; ctx.fillStyle = ctx.strokeStyle = '#000'; grown();
    ctx.restore();
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = ctx.strokeStyle = '#000'; grown(); // outside only
    ctx.globalCompositeOperation = 'source-over';
  }
  if (ow) {
    ctx.fillStyle = ctx.strokeStyle = outline.color; grown();
    ctx.globalCompositeOperation = 'destination-out'; ctx.fill(path, 'evenodd');
    ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = Math.min(2, 2 * ow); ctx.stroke(path);
  }
  ctx.restore();
}

/** The sheet under the slots: cleared, then the sticker (shaped sheets) and the paper (inside the shape when
 *  shaped). A transparent sheet stays clear (alpha 0) there. `shadow: false` leaves out the sticker shadow. */
export function drawPaper(ctx, doc, layout, { shadow = true } = {}) {
  ctx.clearRect(0, 0, layout.width, layout.height);
  if (layout.shaped) drawSticker(ctx, doc, layout, { shadow });
  if (doc.sheet.background !== 'paper') return;
  ctx.fillStyle = doc.paper.color;
  if (layout.shaped) ctx.fill(sheetPath(layout.paper), 'evenodd'); else ctx.fillRect(0, 0, layout.width, layout.height);
}
/** For formats without alpha (JPEG): fills what is still transparent with `color`, under everything drawn, which
 *  composites exactly as drawing over that colour would, so edges never darken. */
export function flattenSheet(ctx, layout, color) {
  ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = color; ctx.fillRect(0, 0, layout.width, layout.height); ctx.restore();
}
/** One laid-out slot: its photo clipped to the slot (and the sheet shape), or `emptyFill` (preview only); then its
 *  print border (styles; its full width), centred on the outline, so a print laid over another covers that one's border too. */
export function drawSlot(ctx, doc, slot, image, emptyFill = null) {
  if (!image && !emptyFill) return;
  ctx.save();
  if (slot.clip) ctx.clip(sheetPath(slot.clip), 'evenodd');
  const path = slotPath(slot);
  ctx.clip(path);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (image) drawCover(ctx, image, slot, doc.slots[slot.index]);
  else { ctx.fillStyle = emptyFill; ctx.fillRect(slot.x, slot.y, slot.w, slot.h); }
  ctx.restore();
  if (slot.border) {
    ctx.save(); ctx.strokeStyle = slot.border.color; ctx.lineWidth = slot.border.width; ctx.lineJoin = 'miter'; ctx.stroke(path); ctx.restore();
  }
}
/** Slots in drawing order (z, then layout order). */
export const drawOrder = layout => [...layout.slots].sort((a, b) => a.z - b.z || a.index - b.index);

/** Draws the collage `doc` laid out as `layout` (js/collage/layout.js) on ctx (sized layout.width × height).
 *  imageFor(index) → the slot's photo edit (canvas or ImageBitmap) or null (empty or still rendering). */
export function drawCollage(ctx, doc, layout, imageFor, { emptyFill = 'rgba(128,128,128,.28)' } = {}) {
  drawPaper(ctx, doc, layout);
  for (const slot of drawOrder(layout)) drawSlot(ctx, doc, slot, imageFor(slot.index), emptyFill);
}
