// Healing patches (plan_workflow.md Task 9, C4): no healed copy of the whole photo. Each stroke becomes a small patch,
// in the photo's own pixel space, drawn right after the photo inside drawOriented (js/renderer.js), so every crop,
// rotation, straighten, optics, look and export carries it. Patches are made at the scale of the render that needs
// them (a 256 px thumb, the preview, full size for export) and cached per decoded image and scale; a new stroke
// reuses the patches before it. Later strokes see earlier ones (a clone can copy a healed area).
import { blendPatch } from './blend.js';
import { hasHealing, strokeGeometry, strokeMask } from './model.js';
import { cropGeometry } from '../renderer.js';

const cache = new WeakMap(); // image → Map(scale → { keys: [], patches: [] })
const sizeOf = image => ({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
const newCanvas = (width, height) => (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height }));

/** The scale cropSource draws `image` at for `maxEdge` (render px per image px). */
export function healScale(image, crop, maxEdge = Infinity) {
  const { width, height } = sizeOf(image), g = cropGeometry(width, height, crop);
  return Math.min(1, maxEdge / Math.max(g.width, g.height));
}

/** Draws the photo and `patches` over the area `rect` (render px at `scale`) into a new canvas. */
function drawRegion(image, patches, rect, scale) {
  const canvas = newCanvas(rect.width, rect.height), ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, rect.x / scale, rect.y / scale, rect.width / scale, rect.height / scale, 0, 0, rect.width, rect.height);
  for (const patch of patches) {
    if (patch.rx >= rect.x + rect.width || patch.ry >= rect.y + rect.height || patch.rx + patch.canvas.width <= rect.x || patch.ry + patch.canvas.height <= rect.y) continue;
    ctx.drawImage(patch.canvas, patch.rx - rect.x, patch.ry - rect.y);
  }
  return { canvas, ctx };
}

/** The photo with the patches before it, around `rect` (render px at `scale`), as ImageData (the heal search's input). */
export function regionPixels(image, healing, rect, scale) {
  const patches = hasHealing(healing) ? healPatches(image, healing, scale) : [];
  return drawRegion(image, patches, rect, scale).ctx.getImageData(0, 0, rect.width, rect.height);
}

function makePatch(image, stroke, previous, scale) {
  const { width, height } = sizeOf(image), rw = Math.max(1, Math.round(width * scale)), rh = Math.max(1, Math.round(height * scale));
  const geo = strokeGeometry(stroke, rw, rh), b = geo.bounds;
  const rect = { x: Math.max(0, b.x), y: Math.max(0, b.y) };
  rect.width = Math.min(rw, b.x + b.width) - rect.x; rect.height = Math.min(rh, b.y + b.height) - rect.y;
  if (rect.width < 1 || rect.height < 1) return null;
  const dx = Math.round(geo.dx), dy = Math.round(geo.dy);
  const D = drawRegion(image, previous, rect, scale).ctx.getImageData(0, 0, rect.width, rect.height).data;
  // Source: the same rect moved by the offset; anything outside the photo stays transparent (and isn't painted).
  const src = { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height };
  const clip = { x: Math.max(0, src.x), y: Math.max(0, src.y) };
  clip.width = Math.min(rw, src.x + src.width) - clip.x; clip.height = Math.min(rh, src.y + src.height) - clip.y;
  const sCanvas = newCanvas(rect.width, rect.height), sctx = sCanvas.getContext('2d', { willReadFrequently: true });
  if (clip.width > 0 && clip.height > 0) {
    const part = drawRegion(image, previous, clip, scale).canvas;
    sctx.drawImage(part, clip.x - src.x, clip.y - src.y);
  }
  const S = sctx.getImageData(0, 0, rect.width, rect.height).data;
  const A = strokeMask(geo, rect, stroke.h, stroke.o);
  const pixels = blendPatch(D, S, A, stroke.m);
  const canvas = newCanvas(rect.width, rect.height);
  canvas.getContext('2d').putImageData(new ImageData(pixels, rect.width, rect.height), 0, 0);
  return { canvas, rx: rect.x, ry: rect.y, x: rect.x / scale, y: rect.y / scale, width: rect.width / scale, height: rect.height / scale };
}

/** Patches for `healing` on `image` at `scale` (render px per image px): [{ canvas, x, y, width, height }] in image px,
 *  in stroke order. Null without strokes. */
export function healPatches(image, healing, scale = 1) {
  if (!hasHealing(healing)) return null;
  const key = Math.min(1, Math.max(1 / 256, scale)).toFixed(5), s = Number(key);
  let byScale = cache.get(image); if (!byScale) cache.set(image, byScale = new Map());
  let entry = byScale.get(key); if (!entry) byScale.set(key, entry = { keys: [], patches: [] });
  const keys = healing.strokes.map(stroke => JSON.stringify(stroke));
  let same = 0; while (same < keys.length && same < entry.keys.length && keys[same] === entry.keys[same]) same++;
  for (const patch of entry.patches.slice(same)) if (patch) { patch.canvas.width = 0; patch.canvas.height = 0; }
  entry.keys = entry.keys.slice(0, same); entry.patches = entry.patches.slice(0, same);
  for (let i = same; i < keys.length; i++) {
    entry.patches.push(makePatch(image, healing.strokes[i], entry.patches.filter(Boolean), s));
    entry.keys.push(keys[i]);
  }
  // Keep a few scales per image (preview, zoom, thumb); drop the oldest beyond that.
  if (byScale.size > 4) { const [oldest] = byScale.keys(); if (oldest !== key) { for (const patch of byScale.get(oldest).patches) if (patch) patch.canvas.width = 0; byScale.delete(oldest); } }
  return entry.patches.filter(Boolean);
}

/** Patches for a cropSource call (null when there is nothing to heal). */
export const patchesFor = (image, healing, crop, maxEdge) => (hasHealing(healing) ? healPatches(image, healing, healScale(image, crop, maxEdge)) : null);

/** Image px → crop-output px (before scaling), the same transform as cropSource; and its inverse. */
export function cropMatrix(crop, width, height) {
  const g = cropGeometry(width, height, crop);
  let m = new DOMMatrix().translate(g.width / 2, g.height / 2).rotate(crop.straighten).translate(-g.cx, -g.cy);
  if (crop.flip) m = m.translate(g.W, 0).scale(-1, 1);
  const turns = ((crop.rotate / 90) % 4 + 4) % 4;
  if (turns === 1) m = m.translate(g.W, 0).rotate(90); else if (turns === 2) m = m.translate(g.W, g.H).rotate(180); else if (turns === 3) m = m.translate(0, g.H).rotate(-90);
  return { matrix: m, inverse: m.inverse(), g };
}
