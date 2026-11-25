// Collage export sizes (pure: no DOM, checked by tools/collage-check.mjs). CollagePlan.md Task 3.
import { layoutTemplate, sheetSize } from './layout.js';
import { fillGeometry } from './fill.js';

/** Print papers at 300 dpi: [id, name, short side in inches, long side in inches]. */
export const PRINT_PAPERS = [['a4', 'A4', 8.27, 11.69], ['letter', 'Letter', 8.5, 11], ['4x6', '4 × 6 in', 4, 6], ['5x7', '5 × 7 in', 5, 7], ['8x10', '8 × 10 in', 8, 10]];
export const PRINT_DPI = 300;
const SHARE_SHORT = 1080, SHARE_LONG = 1920;

/** For sharing: 1080 px on the short edge, at most 1920 on the long one (4:5 → 1080 × 1350, 9:16 → 1080 × 1920). */
export function shareSize({ w, h }) {
  const landscape = w >= h, ratio = Math.max(w, h) / Math.min(w, h);
  const short = ratio * SHARE_SHORT > SHARE_LONG ? Math.round(SHARE_LONG / ratio) : SHARE_SHORT, long = Math.round(short * ratio);
  return landscape ? { width: long, height: short } : { width: short, height: long };
}

/** For print: the largest sheet of this aspect that fits the paper (turned to match) at 300 dpi. */
export function printSize({ w, h }, paperId) {
  const [, , short, long] = PRINT_PAPERS.find(([id]) => id === paperId) || PRINT_PAPERS[0];
  const landscape = w > h, pw = Math.round((landscape ? long : short) * PRINT_DPI), ph = Math.round((landscape ? short : long) * PRINT_DPI);
  const scale = Math.min(pw / w, ph / h);
  return { width: Math.min(pw, Math.round(w * scale)), height: Math.min(ph, Math.round(h * scale)) };
}

/** Full size: the sheet at which the most detailed slot shows its photo pixel for pixel (no more detail exists).
 *  photoSize(slotFill) → the photo's cropped size { width, height } or null for an empty slot. Never smaller than
 *  the sharing size. */
export function fullSize(doc, template, photoSize) {
  const reference = sheetSize([doc.aspect.w, doc.aspect.h], 1000), layout = layoutTemplate(template, reference.width, reference.height, doc);
  let long = 0;
  for (const slot of layout.slots) {
    const size = photoSize(doc.slots[slot.index]); if (!size) continue;
    const g = fillGeometry(size.width, size.height, slot.w, slot.h, doc.slots[slot.index]);
    long = Math.max(long, 1000 / g.scale);
  }
  const share = shareSize(doc.aspect);
  if (!long) return share;
  const full = sheetSize([doc.aspect.w, doc.aspect.h], Math.round(long));
  return full.width * full.height < share.width * share.height ? share : full;
}

/** A size scaled down (keeping its aspect) to at most `maxPixels`; capped says whether it had to shrink. */
export function capSize({ width, height }, maxPixels) {
  if (width * height <= maxPixels) return { width, height, capped: false };
  const scale = Math.sqrt(maxPixels / (width * height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), capped: true };
}

/** Long edge (px) a slot's photo needs for a sheet slot of w × h with this fill, for a photo of pw × ph px;
 *  Infinity when the full photo is needed (no point rendering larger than the photo itself). */
export function slotEdge(pw, ph, w, h, fill) {
  const g = fillGeometry(pw, ph, w + 2, h + 2, fill), edge = Math.ceil(Math.max(pw, ph) * g.scale);
  return edge >= Math.max(pw, ph) ? Infinity : edge;
}
