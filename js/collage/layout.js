// Collage layout engine (pure: no DOM, checked by tools/collage-check.mjs).
// A template + a sheet size in px → integer slot rects. Gutter, margin and corner radius are fractions of the
// sheet's short edge, rounded to whole px once, so every row and column adds up to the sheet size exactly
// (margin + tracks + gutters + margin); the last track absorbs the rounding.
import { shapePolygon, shapeCenter, clipConvex, clipHalfPlane, polygonArea, polygonBounds } from './shapes.js';
import { stripTransform } from './contact.js';

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

// ---------- Diptych / triptych dividers (Task 6) ----------
export const MIN_SPLIT = .15; // no photo narrower than 15 % of the room
/** The axis a grid's dividers move along: 'x' for one row of columns, 'y' for one column of rows, else null. */
export const splitAxis = template => (template?.kind !== 'grid' ? null
  : template.rows.length === 1 && template.cols.length > 1 ? 'x' : template.cols.length === 1 && template.rows.length > 1 ? 'y' : null);
/** Divider positions (cumulative, 0–1 of the room left after margins and gutters) as given by the template. */
export function defaultSplits(template) {
  const weights = splitAxis(template) === 'x' ? template.cols : template.rows, total = weights.reduce((a, b) => a + b, 0);
  let sum = 0; return weights.slice(0, -1).map(w => (sum += w) / total);
}
/** `splits` made valid for `count` tracks: ascending, each track ≥ MIN_SPLIT; null when they don't fit. */
export function clampSplits(splits, count) {
  if (!Array.isArray(splits) || splits.length !== count - 1 || !splits.every(Number.isFinite)) return null;
  const out = [...splits];
  for (let i = 0; i < out.length; i++) out[i] = Math.min(Math.max(out[i], (i ? out[i - 1] : 0) + MIN_SPLIT), 1 - MIN_SPLIT * (out.length - i));
  return out;
}
/** Moves divider `i` to `value` (0–1), keeping every track ≥ MIN_SPLIT; the others stay. */
export function moveSplit(splits, i, value) {
  const lo = (i ? splits[i - 1] : 0) + MIN_SPLIT, hi = (i < splits.length - 1 ? splits[i + 1] : 1) - MIN_SPLIT;
  const out = [...splits]; out[i] = Math.round(Math.min(hi, Math.max(lo, value)) * 1e4) / 1e4; return out;
}
const toWeights = splits => [...splits, 1].map((v, i) => v - (i ? splits[i - 1] : 0));
// Caption space under each photo (gallery style): this fraction of the short edge, at most this share of a cell.
export const CAPTION_SPACE = .07, CAPTION_MAX = .35;

/** Grid: `cols`/`rows` are relative track sizes; `cells` are [col, row, colSpan = 1, rowSpan = 1]. One-row and
 *  one-column grids take their track sizes from `splits` when set (dividers). `captionSpace` keeps a band of paper
 *  under each photo (slot.caption); `border` { width (fraction of the short edge), color } outlines each photo. */
export function layoutGrid(template, width, height, { gutter = 0, margin = 0, radius = 0, splits = null, captionSpace = false, border = null } = {}) {
  const short = Math.min(width, height), m = px(margin, short), g = px(gutter, short), r = px(radius, short);
  const axis = splitAxis(template), tracks = axis === 'x' ? template.cols.length : template.rows.length;
  const valid = axis ? clampSplits(splits, tracks) : null;
  const colWeights = valid && axis === 'x' ? toWeights(valid) : template.cols, rowWeights = valid && axis === 'y' ? toWeights(valid) : template.rows;
  const cols = splitTracks(m, width - 2 * m, colWeights, g), rows = splitTracks(m, height - 2 * m, rowWeights, g);
  const line = border?.width > 0 ? { width: Math.max(1, border.width * short), color: border.color } : null;
  const slots = template.cells.map(([col, row, colSpan = 1, rowSpan = 1], index) => {
    const first = cols[col], last = cols[col + colSpan - 1], top = rows[row], bottom = rows[row + rowSpan - 1];
    const rect = { x: first.start, y: top.start, w: last.start + last.size - first.start, h: bottom.start + bottom.size - top.start };
    let caption = null;
    if (captionSpace) {
      const band = Math.min(px(CAPTION_SPACE, short), Math.floor(rect.h * CAPTION_MAX));
      caption = { x: rect.x, y: rect.y + rect.h - band, w: rect.w, h: band }; rect.h -= band;
    }
    return slot(index, rect, { radius: cornerRadius(r, rect), caption, border: line });
  });
  return { width, height, margin: m, gutter: g, cols, rows, axis, slots };
}

/** Free: slots in normalised sheet coordinates { x, y, w, h, rotate, z, shape, shadow, border, tape, mount }; margin, gutter and
 *  corner radius don't apply. Styles give their prints a border ({ width: fraction of the short edge, color }; the
 *  document's `border` overrides the template's), stroked centred on each print's outline. Slots with a shape other
 *  than a rect carry `visible`, their outline polygon (hit tests, the stage overlay). `mount` { pad, bottom?, color,
 *  frame?: { width, color } } (fractions of the short edge) is a mat/polaroid card, and its frame, around the photo;
 *  template `decor` [{ kind: 'graph'|'lined'|'kraft'|'paper', x, y, w, h, rotate, color?, pattern?, ink?, edge?, shadow? }] are
 *  paper scraps and colour blocks under the prints (js/collage/render.js drawDecor). */
export function layoutFree(template, width, height, { border = null, slots: fills = [] } = {}) {
  const short = Math.min(width, height), spec = border || template.border || null;
  const slots = template.slots.map((item, index) => {
    const override = fills[index]?.layout || null;
    const nx = override?.x ?? item.x, ny = override?.y ?? item.y;
    const x = Math.round(nx * width), y = Math.round(ny * height);
    const rect = { x, y, w: Math.round((nx + item.w) * width) - x, h: Math.round((ny + item.h) * height) - y };
    const shape = item.shape && item.shape.kind !== 'rect' ? item.shape : null;
    const line = spec && item.border !== false && spec.width > 0 ? { width: Math.max(1, spec.width * short), color: spec.color } : null;
    const m = item.mount, mount = m ? { pad: px(m.pad, short), bottom: px(m.bottom ?? m.pad, short), color: m.color, frame: m.frame ? { width: Math.max(1, px(m.frame.width, short)), color: m.frame.color } : null } : null;
    return slot(index, rect, { rotate: override?.rotate ?? item.rotate ?? 0, z: override?.z ?? item.z ?? 0, shape, shadow: Boolean(item.shadow), tape: item.tape || null, tapeColor: item.tapeColor || null, border: line, mount, ...(shape ? { visible: shapePolygon(shape, rect, .5), holeVisible: null } : {}) });
  });
  const decor = (template.decor || []).map(d => ({ ...d, x: d.x * width, y: d.y * height, w: d.w * width, h: d.h * height, rotate: d.rotate || 0 }));
  return { width, height, margin: 0, gutter: 0, slots, decor };
}

/** Contact sheet: strips include the real film edge around photo gates. They are centred inside the margin and carry
 *  seeded transforms for the renderer; slots remain unrotated hit boxes so dense sheets stay easy to operate. */
export function layoutContact(template, width, height, { gutter = 0, margin = 0 } = {}) {
  const short = Math.min(width, height), m = px(margin, short), g = px(gutter, short);
  const [fw, fh] = template.frame, n = template.frames, s = template.strips;
  const innerW = width - 2 * m, innerH = height - 2 * m;
  const filmAcross = template.id === 'contact-35' ? 35 : 70, edge = (filmAcross - fh) / 2;
  // Largest gate that fits n across and s strips down. Adjacent medium-format gates have a small separator.
  const gapUnit = template.id === 'contact-35' ? 2 : 2.5;
  const unitW = n * fw + (n - 1) * gapUnit, unitH = s * (fh + edge * 2);
  const scale = Math.min(innerW / unitW, (innerH - g * (s - 1)) / unitH);
  const w = Math.max(1, Math.floor(fw * scale)), h = Math.max(1, Math.floor(fh * scale)), e = Math.max(1, Math.round(edge * scale)), gap = Math.max(0, Math.round(gapUnit * scale));
  const totalW = n * w + (n - 1) * gap, stripH = h + e * 2, totalH = s * stripH + (s - 1) * g;
  const x0 = m + Math.floor((innerW - totalW) / 2), y0 = m + Math.floor((innerH - totalH) / 2);
  const strips = [], slots = [];
  for (let row = 0; row < s; row++) {
    const y = y0 + row * (stripH + g), transform = stripTransform(row);
    strips.push({ index: row, x: x0, y, w: totalW, h: stripH, edge: e, gap, ...transform });
    for (let col = 0; col < n; col++) slots.push(slot(slots.length, { x: x0 + col * (w + gap), y: y + e, w, h }, { strip: row }));
  }
  return { width, height, margin: m, gutter: g, frameGap: gap, filmEdge: e, filmAcross, perforated: template.id === 'contact-35', strips, slots, contact: true };
}

// ---------- Shaped sheets (Task 5) ----------
/** Room around a shaped sheet for its sticker outline and shadow, as a fraction of the canvas's short edge. */
export const SHADOW_PAD = .05;
export const stickerPad = sheet => (sheet?.outline?.width || 0) + (sheet?.shadow ? SHADOW_PAD : 0);
/** Canvas aspect { w, h } that makes a proportional shape (aspect `a` = w / h) fill the canvas exactly once the
 *  sticker pad (fraction f of the short edge) is taken off each side. */
export function paddedAspect(a, f) {
  const round = v => Math.round(v * 1e4) / 1e4;
  return a >= 1 ? { w: round(a * (1 - 2 * f) + 2 * f), h: 1 } : { w: 1, h: round((1 - 2 * f) / a + 2 * f) };
}
/** A rect scaled about its centre by s. */
const scaled = (r, s) => ({ x: r.x + r.w * (1 - s) / 2, y: r.y + r.h * (1 - s) / 2, w: r.w * s, h: r.h * s });
/** A rect of size w × h centred on (cx, cy). */
const centred = (cx, cy, w, h) => ({ x: cx - w / 2, y: cy - h / 2, w, h });
const rectPolygon = r => [r.x, r.y, r.x + r.w, r.y, r.x + r.w, r.y + r.h, r.x, r.y + r.h];

/** Shaped: a sheet shape (template.sheet.shape, optional centre `hole` as a fraction of the shape's size) filled by
 *  `template.fill`, every slot clipped by the shape:
 *    { kind: 'grid', cols, rows, cells }  a grid over the shape's box (gutter between tracks)
 *    { kind: 'radial', slices, rotate }   pie slices from the shape's centre, the first edge at `rotate` degrees
 *    { kind: 'free', slots: [{ x, y, w, h, shape }] }  normalised slots in the shape's box (each inset by gutter / 2)
 *  The shape fills the canvas less the sticker pad; margin shrinks the shape the photos are clipped by (a paper rim,
 *  so only with paper).
 *  Each slot carries `outline` (its own straight-edged polygon, px), `clip` (the sheet shape it is cut by), `visible`
 *  (outline ∩ shape, flat polygon) and `holeVisible` (the hole's part in it); its x, y, w, h bound `visible`. */
export function layoutShaped(template, width, height, { gutter = 0, margin = 0, sheet = null } = {}) {
  const short = Math.min(width, height), pad = px(stickerPad(sheet), short), g = px(gutter, short);
  const shape = template.sheet.shape, outer = { x: pad, y: pad, w: width - 2 * pad, h: height - 2 * pad };
  // Margin is a paper rim inside the shape; on a transparent sheet it would only part the photos from the outline.
  const rim = sheet?.background === 'transparent' ? 0 : margin;
  const m = Math.min(px(rim, short), Math.floor(Math.min(outer.w, outer.h) / 2) - 1);
  const inner = scaled(outer, (Math.min(outer.w, outer.h) - 2 * m) / Math.min(outer.w, outer.h));
  const [cx, cy] = shapeCenter(shape, inner), holeFor = (rect, grow) => template.sheet.hole
    ? { shape, rect: centred(cx, cy, rect.w * template.sheet.hole + 2 * grow, rect.h * template.sheet.hole + 2 * grow) } : null;
  const paper = { shape, rect: outer, hole: holeFor(outer, 0) }, clip = { shape, rect: inner, hole: holeFor(outer, m) };
  const sheetPoly = shapePolygon(shape, inner, .25), holePoly = clip.hole ? shapePolygon(shape, clip.hole.rect, .25) : null;
  const fill = template.fill, outlines = [];
  if (fill.kind === 'grid') {
    const cols = splitTracks(inner.x, inner.w, fill.cols, g), rows = splitTracks(inner.y, inner.h, fill.rows, g);
    for (const [col, row, colSpan = 1, rowSpan = 1] of fill.cells) {
      const first = cols[col], last = cols[col + colSpan - 1], top = rows[row], bottom = rows[row + rowSpan - 1];
      outlines.push(rectPolygon({ x: first.start, y: top.start, w: last.start + last.size - first.start, h: bottom.start + bottom.size - top.start }));
    }
  } else if (fill.kind === 'radial') {
    const n = fill.slices, box = rectPolygon(inner), step = 2 * Math.PI / n, start = (fill.rotate || 0) * Math.PI / 180;
    for (let k = 0; k < n; k++) {
      if (n === 1) { outlines.push(box); break; }
      let poly = box;
      for (const [angle, sign] of [[start + k * step, 1], [start + (k + 1) * step, -1]]) {
        // Keep the slice's side of the edge, g / 2 away from it.
        const dx = Math.cos(angle) * sign, dy = Math.sin(angle) * sign, a = [cx - dy * g / 2, cy + dx * g / 2];
        poly = clipHalfPlane(poly, a, [a[0] + dx, a[1] + dy]);
      }
      outlines.push(poly);
    }
  } else if (fill.kind === 'free') {
    for (const item of fill.slots) {
      const r = { x: inner.x + item.x * inner.w + g / 2, y: inner.y + item.y * inner.h + g / 2, w: item.w * inner.w - g, h: item.h * inner.h - g };
      outlines.push(shapePolygon(item.shape || { kind: 'rect' }, r, .25));
    }
  } else throw new Error(`Unknown fill ${fill.kind}`);
  const slots = outlines.map((outline, index) => {
    const visible = clipConvex(sheetPoly, outline), holeVisible = holePoly ? clipConvex(holePoly, outline) : null;
    const b = visible.length ? polygonBounds(visible) : polygonBounds(outline);
    // Whole px, grown to hold the visible part (the photo covers this box).
    const x = Math.max(0, Math.floor(b.x) - 1), y = Math.max(0, Math.floor(b.y) - 1);
    const rect = { x, y, w: Math.min(width, Math.ceil(b.x + b.w) + 1) - x, h: Math.min(height, Math.ceil(b.y + b.h) + 1) - y };
    return { ...slot(index, rect), outline, clip, visible, holeVisible, area: Math.abs(polygonArea(visible)) - (holeVisible ? Math.abs(polygonArea(holeVisible)) : 0), slotArea: Math.abs(polygonArea(outline)) };
  });
  return { width, height, margin: m, gutter: g, pad, shaped: true, paper, clip, sheetPolygon: sheetPoly, holePolygon: holePoly, slots };
}

/** Slot rects for any template kind on a width × height px sheet. */
export function layoutTemplate(template, width, height, spacing = {}) {
  if (!(width > 0 && height > 0)) throw new Error(`Bad sheet size ${width} × ${height}`);
  if (template.kind === 'grid') return layoutGrid(template, width, height, spacing);
  if (template.kind === 'free') return layoutFree(template, width, height, spacing);
  if (template.kind === 'contact') return layoutContact(template, width, height, spacing);
  if (template.kind === 'shaped') return layoutShaped(template, width, height, spacing);
  throw new Error(`Unknown template kind ${template.kind}`);
}

/** Sheet size in px for an aspect [w, h] with `longEdge` px on its long side. */
export function sheetSize([aw, ah], longEdge) {
  return aw >= ah ? { width: longEdge, height: Math.max(1, Math.round(longEdge * ah / aw)) } : { width: Math.max(1, Math.round(longEdge * aw / ah)), height: longEdge };
}
