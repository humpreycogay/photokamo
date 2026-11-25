// Collage layout engine (pure: no DOM, checked by tools/collage-check.mjs).
// A template + a sheet size in px → integer slot rects. Gutter, margin and corner radius are fractions of the
// sheet's short edge, rounded to whole px once, so every row and column adds up to the sheet size exactly
// (margin + tracks + gutters + margin); the last track absorbs the rounding.

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect  integer px */
/** @typedef {Rect & { index: number, rotate: number, z: number, radius: number, shape: object|null, shadow: boolean }} SlotRect */
/** @typedef {{ gutter?: number, margin?: number, radius?: number }} Spacing */

/** Splits `length` px into tracks proportional to `weights`, `gap` px apart, starting at `start`. */
export function splitTracks(start, length, weights, gap) {
  const avail = length - gap * (weights.length - 1), total = weights.reduce((sum, value) => sum + value, 0);
  const tracks = [];
  let pos = start, used = 0;
  weights.forEach((weight, i) => {
    const size = i === weights.length - 1 ? avail - used : Math.round(avail * weight / total);
    tracks.push({ start: pos, size });
    pos += size + gap; used += size;
  });
  return tracks;
}

const px = (fraction, short) => Math.max(0, Math.round((fraction || 0) * short));
const slot = (index, rect, extra = {}) => ({ index, ...rect, rotate: 0, z: 0, radius: 0, shape: null, shadow: false, ...extra });
const cornerRadius = (radius, rect) => Math.min(radius, Math.floor(Math.min(rect.w, rect.h) / 2));

/** Grid: `cols`/`rows` are relative track sizes; `cells` are [col, row, colSpan = 1, rowSpan = 1]. */
export function layoutGrid(template, width, height, { gutter = 0, margin = 0, radius = 0 } = {}) {
  const short = Math.min(width, height), m = px(margin, short), g = px(gutter, short), r = px(radius, short);
  const cols = splitTracks(m, width - 2 * m, template.cols, g), rows = splitTracks(m, height - 2 * m, template.rows, g);
  const slots = template.cells.map(([col, row, colSpan = 1, rowSpan = 1], index) => {
    const first = cols[col], last = cols[col + colSpan - 1], top = rows[row], bottom = rows[row + rowSpan - 1];
    const rect = { x: first.start, y: top.start, w: last.start + last.size - first.start, h: bottom.start + bottom.size - top.start };
    return slot(index, rect, { radius: cornerRadius(r, rect) });
  });
  return { width, height, margin: m, gutter: g, cols, rows, slots };
}

/** Free: slots in normalised sheet coordinates { x, y, w, h, rotate, z, shape, shadow }; margin and gutter don't apply. */
export function layoutFree(template, width, height, { radius = 0 } = {}) {
  const r = px(radius, Math.min(width, height));
  const slots = template.slots.map((item, index) => {
    const x = Math.round(item.x * width), y = Math.round(item.y * height);
    const rect = { x, y, w: Math.round((item.x + item.w) * width) - x, h: Math.round((item.y + item.h) * height) - y };
    return slot(index, rect, { rotate: item.rotate || 0, z: item.z || 0, shape: item.shape || null, shadow: Boolean(item.shadow), radius: cornerRadius(r, rect) });
  });
  return { width, height, margin: 0, gutter: 0, slots };
}

/** Contact sheet: `strips` rows of `frames` frames with aspect `frame` [w, h], centred inside the margin.
 *  The gutter separates strips; frames within a strip are a tenth of a frame's short side apart. */
export function layoutContact(template, width, height, { gutter = 0, margin = 0 } = {}) {
  const short = Math.min(width, height), m = px(margin, short), g = px(gutter, short);
  const [fw, fh] = template.frame, n = template.frames, s = template.strips;
  const innerW = width - 2 * m, innerH = height - 2 * m;
  // Largest frame (aspect fw:fh, gap = short side / 10) that fits n across and s down.
  const unitW = n * fw + (n - 1) * Math.min(fw, fh) / 10, unitH = s * fh;
  const scale = Math.min(innerW / unitW, (innerH - g * (s - 1)) / unitH);
  const w = Math.max(1, Math.floor(fw * scale)), h = Math.max(1, Math.floor(fh * scale)), gap = Math.round(Math.min(w, h) / 10);
  const totalW = n * w + (n - 1) * gap, totalH = s * h + (s - 1) * g;
  const x0 = m + Math.floor((innerW - totalW) / 2), y0 = m + Math.floor((innerH - totalH) / 2);
  const strips = [], slots = [];
  for (let row = 0; row < s; row++) {
    const y = y0 + row * (h + g);
    strips.push({ x: x0, y, w: totalW, h });
    for (let col = 0; col < n; col++) slots.push(slot(slots.length, { x: x0 + col * (w + gap), y, w, h }));
  }
  return { width, height, margin: m, gutter: g, frameGap: gap, strips, slots };
}

/** Slot rects for any template kind on a width × height px sheet. */
export function layoutTemplate(template, width, height, spacing = {}) {
  if (!(width > 0 && height > 0)) throw new Error(`Bad sheet size ${width} × ${height}`);
  if (template.kind === 'grid') return layoutGrid(template, width, height, spacing);
  if (template.kind === 'free') return layoutFree(template, width, height, spacing);
  if (template.kind === 'contact') return layoutContact(template, width, height, spacing);
  throw new Error(`Unknown template kind ${template.kind}`);
}

/** Sheet size in px for an aspect [w, h] with `longEdge` px on its long side. */
export function sheetSize([aw, ah], longEdge) {
  return aw >= ah ? { width: longEdge, height: Math.max(1, Math.round(longEdge * ah / aw)) } : { width: Math.max(1, Math.round(longEdge * aw / ah)), height: longEdge };
}
