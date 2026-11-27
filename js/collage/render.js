// The one collage renderer (CollagePlan.md decision #3): preview and export call it with different sheet sizes.
// Main-thread compositing (V6): a few drawImage calls; the photos' edits were rendered by their own Workers.
import { shapePath } from './shapes.js';
import { fillGeometry } from './fill.js';
import { drawOriented, drawTexts } from '../renderer.js';
import { perforations, filmWear } from '../film.js';
import { filmSettings, frameNumber } from './contact.js';
import { fibres, tapeRect, scrapPath, scrapPath4, noise } from './scrapbook.js';
import { drawStickers } from './stickers.js';

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
  if (doc.sheet.background === 'paper') drawSheetPaper(ctx, doc, layout);
  if (layout.decor?.length) drawDecor(ctx, layout);
}
function drawSheetPaper(ctx, doc, layout) {
  ctx.fillStyle = doc.paper.color;
  if (layout.shaped) ctx.fill(sheetPath(layout.paper), 'evenodd'); else ctx.fillRect(0, 0, layout.width, layout.height);
  if (doc.paper.texture === 'fibre') {
    const short = Math.min(layout.width, layout.height); ctx.save(); ctx.lineWidth = Math.max(.45, short * .00045); ctx.lineCap = 'round';
    for (const fibre of fibres(layout.width, layout.height)) {
      const x = fibre.x * short, y = fibre.y * short, dx = Math.cos(fibre.angle) * fibre.length * short, dy = Math.sin(fibre.angle) * fibre.length * short;
      ctx.strokeStyle = `rgba(71,55,35,${fibre.alpha})`; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
    }
    ctx.restore();
  }
}
// Paper scraps under scrapbook prints: presets by kind; a decor item's own color / pattern / ink / edge / shadow /
// shape / aged / rim win. Patterns: graph, lined (with a margin rule), dots, stripes (diagonal), gingham, map, script
// (handwriting), news (newsprint columns). Edges: torn (top and bottom), torn4 (all four sides) or straight. Shapes:
// rect, circle, arch (round top). aged: a warm tint deepening towards the edges; rim: the pale fibres of a torn edge.
// kind 'film': a black film strip with sprocket holes along its long sides (photos are slots laid over its frames).
const MUTED = { edge: 'torn4', aged: true, rim: true };
const SCRAPS = { graph: { color: '#f2efe6', pattern: 'graph', ink: 'rgba(84,112,140,.2)' }, lined: { color: '#f6f1e2', pattern: 'lined', ink: 'rgba(70,96,150,.24)' },
  kraft: { color: '#c9b48c' }, paper: { color: '#ffffff' },
  cream: { color: '#f5eedf', ...MUTED }, aged: { color: '#e8d9b9', ...MUTED }, tan: { color: '#d3b98f', ...MUTED }, sage: { color: '#b7bea5', ...MUTED },
  blush: { color: '#e5c6b8', ...MUTED }, rose: { color: '#c99a8c', ...MUTED }, peach: { color: '#e9b877', edge: 'straight', shadow: false },
  map: { color: '#ece0c3', pattern: 'map', ink: 'rgba(120,92,60,.32)', ...MUTED }, letter: { color: '#f1e7d2', pattern: 'script', ink: 'rgba(70,52,34,.5)', ...MUTED },
  news: { color: '#ebe4d3', pattern: 'news', ink: 'rgba(60,54,46,.42)', ...MUTED }, note: { color: '#f8f3e8', pattern: 'lined', ink: 'rgba(120,130,150,.28)', ...MUTED },
  grid: { color: '#f4efe3', pattern: 'graph', ink: 'rgba(120,110,90,.22)', ...MUTED }, check: { color: '#f3e9e4', pattern: 'gingham', ink: 'rgba(176,92,78,.42)', ...MUTED },
  card: { color: '#fbf8f2', edge: 'straight' }, tape: { color: 'rgba(222,204,166,.86)', edge: 'straight', shadow: false }, film: { color: '#1c1a18', edge: 'straight', pattern: 'film' } };
function decorPath(box, style, seed, tear) {
  const { x, y, w, h } = box, path = new Path2D();
  if (style.shape === 'circle') { path.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); return path; }
  if (style.shape === 'arch') { const r = w / 2; path.moveTo(x, y + h); path.lineTo(x, y + r); path.arc(x + r, y + r, r, Math.PI, 0); path.lineTo(x + w, y + h); path.closePath(); return path; }
  if (style.edge === 'torn') return scrapPath(box, seed, tear);
  if (style.edge === 'torn4') return scrapPath4(box, seed, tear);
  if (style.pattern === 'film') { path.roundRect(x, y, w, h, Math.min(w, h) * .03); return path; }
  path.rect(x, y, w, h); return path;
}
function drawDecor(ctx, layout) {
  const short = Math.min(layout.width, layout.height), hair = Math.max(.5, short * .0009);
  layout.decor.forEach((d, i) => {
    const style = { edge: 'torn', shadow: true, ...(SCRAPS[d.kind] || SCRAPS.kraft) };
    for (const key of ['color', 'pattern', 'ink', 'edge', 'shadow', 'shape', 'aged', 'rim']) if (d[key] !== undefined) style[key] = d[key];
    const box = { x: -d.w / 2, y: -d.h / 2, w: d.w, h: d.h }, tear = short * .004;
    const path = decorPath(box, style, 211 + i, tear);
    ctx.save(); ctx.translate(d.x + d.w / 2, d.y + d.h / 2); ctx.rotate(d.rotate * Math.PI / 180);
    if (style.shadow) { ctx.shadowColor = 'rgba(40,30,18,.18)'; ctx.shadowBlur = short * .008; ctx.shadowOffsetY = short * .003; }
    ctx.fillStyle = style.color; ctx.fill(path); ctx.shadowColor = 'transparent'; ctx.clip(path);
    const p = style.pattern, ink = style.ink || 'rgba(0,0,0,.12)', { x: left, y: top, w, h } = box;
    if (p === 'graph' || p === 'lined') {
      const step = short * (p === 'graph' ? .016 : .028); ctx.strokeStyle = ink; ctx.lineWidth = hair; ctx.beginPath();
      for (let y = top + step; y < top + h; y += step) { ctx.moveTo(left, y); ctx.lineTo(left + w, y); }
      if (p === 'graph') for (let x = left + step; x < left + w; x += step) { ctx.moveTo(x, top); ctx.lineTo(x, top + h); }
      ctx.stroke();
      if (p === 'lined') { ctx.strokeStyle = 'rgba(190,64,64,.32)'; ctx.beginPath(); ctx.moveTo(left + w * .12, top); ctx.lineTo(left + w * .12, top + h); ctx.stroke(); }
    } else if (p === 'dots') {
      const step = short * .045, r = step * .16; ctx.fillStyle = ink; ctx.beginPath();
      for (let row = 0, y = top + step / 2; y < top + h + step; row++, y += step * .866) for (let x = left + (row % 2 ? step / 2 : 0); x < left + w + step; x += step) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
      ctx.fill();
    } else if (p === 'stripes') {
      const step = short * .05; ctx.strokeStyle = ink; ctx.lineWidth = step * .42; ctx.beginPath();
      for (let x = left - h; x < left + w + h; x += step) { ctx.moveTo(x, top + h); ctx.lineTo(x + h, top); }
      ctx.stroke();
    } else if (p === 'gingham') {
      const step = short * (d.kind === 'check' ? .022 : .05); ctx.fillStyle = ink;
      for (let x = left; x < left + w; x += step * 2) ctx.fillRect(x, top, step, h);
      for (let y = top; y < top + h; y += step * 2) ctx.fillRect(left, y, w, step);
    } else if (p) drawPattern(ctx, p, box, ink, short, hair, 211 + i);
    if (style.aged) { // warm and darker towards the edges, like paper that has been handled
      const g = ctx.createRadialGradient(0, 0, Math.min(w, h) * .2, 0, 0, Math.hypot(w, h) / 2);
      g.addColorStop(0, 'rgba(120,84,40,0)'); g.addColorStop(1, 'rgba(120,84,40,.2)'); ctx.fillStyle = g; ctx.fillRect(left, top, w, h);
    }
    if (style.rim && style.edge !== 'straight' && !style.shape) { ctx.strokeStyle = 'rgba(255,252,244,.75)'; ctx.lineWidth = tear * 1.3; ctx.stroke(path); }
    ctx.restore();
  });
}
/** Map, handwriting, newsprint and film patterns inside a decor box (centred on 0, 0), seeded so preview and export match. */
function drawPattern(ctx, p, { x: left, y: top, w, h }, ink, short, hair, seed) {
  const rnd = (i, salt) => noise(seed, i, salt);
  if (p === 'map') {
    ctx.fillStyle = 'rgba(132,168,186,.28)'; ctx.beginPath(); // a stretch of water along one side
    ctx.moveTo(left + w, top); for (let i = 0; i <= 12; i++) ctx.lineTo(left + w * (.72 + rnd(i, 1) * .12 - i * .012), top + i / 12 * h); ctx.lineTo(left + w, top + h); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = hair;
    for (let k = 0; k < 9; k++) { // roads and contour lines
      ctx.beginPath(); const y0 = top + rnd(k, 2) * h; ctx.moveTo(left, y0);
      ctx.bezierCurveTo(left + w * .3, y0 + (rnd(k, 3) - .5) * h * .6, left + w * .6, y0 + (rnd(k, 4) - .5) * h * .6, left + w, top + rnd(k, 5) * h); ctx.stroke();
    }
    for (let k = 0; k < 4; k++) { const cx = left + rnd(k, 6) * w * .7, cy = top + rnd(k, 7) * h, r = short * (.02 + rnd(k, 8) * .03);
      for (let ring = 1; ring <= 3; ring++) { ctx.beginPath(); ctx.ellipse(cx, cy, r * ring * .7, r * ring * .45, rnd(k, 9) * 3, 0, Math.PI * 2); ctx.stroke(); } }
    ctx.strokeStyle = 'rgba(170,60,48,.55)'; ctx.lineWidth = hair * 2; ctx.setLineDash([short * .008, short * .006]); ctx.beginPath(); // a dashed route
    ctx.moveTo(left + w * .1, top + h * .85); ctx.bezierCurveTo(left + w * .35, top + h * .4, left + w * .55, top + h * .95, left + w * .85, top + h * .2); ctx.stroke(); ctx.setLineDash([]);
  } else if (p === 'script') {
    const step = short * .02, margin = w * .08; ctx.strokeStyle = ink; ctx.lineWidth = hair * 1.1; ctx.lineCap = 'round';
    for (let row = 0, y = top + step * 1.5; y < top + h - step * .5; row++, y += step) {
      let x = left + margin + (row % 5 === 0 ? w * .08 : 0); const end = left + w - margin - rnd(row, 1) * w * (row % 5 === 4 ? .5 : .1);
      while (x < end) { // a word: small loops along the line, then a gap
        const len = short * (.012 + rnd(row * 31 + Math.round(x), 2) * .03), stop = Math.min(end, x + len); ctx.beginPath(); ctx.moveTo(x, y);
        for (let t = x; t < stop; t += step * .18) ctx.lineTo(t, y - Math.abs(Math.sin((t - x) / step * 9)) * step * (.22 + rnd(Math.round(t), 3) * .2));
        ctx.stroke(); x = stop + step * .35;
      }
    }
  } else if (p === 'news') {
    const pad = w * .07, cols = w > short * .25 ? 2 : 1, gap = w * .05, colW = (w - 2 * pad - gap * (cols - 1)) / cols, line = short * .011;
    ctx.fillStyle = ink; ctx.fillRect(left + pad, top + pad, w - 2 * pad, short * .018); // headline
    for (let c = 0; c < cols; c++) for (let i = 0, y = top + pad + short * .035; y < top + h - pad; i++, y += line) {
      const end = i % 7 === 6 ? .4 + rnd(i, c) * .4 : .92 + rnd(i, c + 5) * .08; ctx.fillRect(left + pad + c * (colW + gap), y, colW * end, line * .38);
    }
  } else if (p === 'film') { // sprocket holes along both long sides
    const across = w >= h, len = across ? w : h, thick = across ? h : w, hole = thick * .055, stepLen = hole * 2.2;
    ctx.fillStyle = '#ece4d4';
    for (let t = stepLen * .6; t < len - hole; t += stepLen) for (const side of [thick * .045, thick - thick * .045 - hole * 1.3]) {
      const r = new Path2D(); if (across) r.roundRect(left + t, top + side, hole, hole * 1.3, hole * .25); else r.roundRect(left + side, top + t, hole * 1.3, hole, hole * .25); ctx.fill(r);
    }
  }
}
/** The mat (or polaroid card) and the frame's outer edge around a mounted print, in its unrotated space. */
export function mountRects(slot) {
  const m = slot.mount; if (!m) return null;
  const f = m.frame?.width || 0, mat = { x: slot.x - m.pad, y: slot.y - m.pad, w: slot.w + 2 * m.pad, h: slot.h + m.pad + m.bottom };
  return { mat, outer: { x: mat.x - f, y: mat.y - f, w: mat.w + 2 * f, h: mat.h + 2 * f } };
}
const rotateAbout = (ctx, slot) => { if (!slot.rotate) return; const cx = slot.x + slot.w / 2, cy = slot.y + slot.h / 2; ctx.translate(cx, cy); ctx.rotate(slot.rotate * Math.PI / 180); ctx.translate(-cx, -cy); };
/** A mounted print's frame and mat, with its shadow on the wall/paper; a faint line where the mat meets the photo. */
function drawMount(ctx, slot) {
  const { mat, outer } = mountRects(slot), m = slot.mount, short = Math.min(outer.w, outer.h), hair = Math.max(1, short * .002);
  ctx.save(); rotateAbout(ctx, slot);
  if (slot.shadow) { ctx.shadowColor = 'rgba(20,15,10,.3)'; ctx.shadowBlur = short * .04; ctx.shadowOffsetY = short * .018; }
  ctx.fillStyle = m.frame ? m.frame.color : m.color; ctx.fillRect(outer.x, outer.y, outer.w, outer.h);
  ctx.shadowColor = 'transparent'; ctx.lineWidth = hair;
  if (m.frame) {
    ctx.strokeStyle = 'rgba(0,0,0,.1)'; ctx.strokeRect(outer.x + hair / 2, outer.y + hair / 2, outer.w - hair, outer.h - hair);
    ctx.fillStyle = m.color; ctx.fillRect(mat.x, mat.y, mat.w, mat.h);
    ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.strokeRect(mat.x + hair / 2, mat.y + hair / 2, mat.w - hair, mat.h - hair);
  }
  ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.strokeRect(slot.x - hair / 2, slot.y - hair / 2, slot.w + hair, slot.h + hair);
  ctx.restore();
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
  const path = slotPath(slot), cx = slot.x + slot.w / 2, cy = slot.y + slot.h / 2;
  if (slot.mount) drawMount(ctx, slot);
  else if (slot.shadow) {
    ctx.save(); if (slot.rotate) { ctx.translate(cx, cy); ctx.rotate(slot.rotate * Math.PI / 180); ctx.translate(-cx, -cy); }
    ctx.shadowColor = 'rgba(20,15,10,.3)'; ctx.shadowBlur = Math.min(slot.w, slot.h) * .045; ctx.shadowOffsetY = Math.min(slot.w, slot.h) * .025;
    ctx.fillStyle = '#fff'; ctx.fill(path); ctx.restore();
  }
  ctx.save();
  if (slot.rotate) { ctx.translate(cx, cy); ctx.rotate(slot.rotate * Math.PI / 180); ctx.translate(-cx, -cy); }
  if (slot.clip) ctx.clip(sheetPath(slot.clip), 'evenodd');
  ctx.clip(path);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (image) drawCover(ctx, image, slot, doc.slots[slot.index]);
  else { ctx.fillStyle = emptyFill; ctx.fillRect(slot.x, slot.y, slot.w, slot.h); }
  ctx.restore();
  if (slot.border) {
    ctx.save();
    if (slot.rotate) { ctx.translate(cx, cy); ctx.rotate(slot.rotate * Math.PI / 180); ctx.translate(-cx, -cy); }
    ctx.strokeStyle = slot.border.color; ctx.lineWidth = slot.border.width; ctx.lineJoin = 'miter'; ctx.stroke(path); ctx.restore();
  }
  if (slot.tape) for (const corner of slot.tape) {
    const tape = tapeRect(slot.mount ? { ...mountRects(slot).outer, index: slot.index } : slot, corner);
    ctx.save(); rotateAbout(ctx, slot); ctx.translate(tape.x + tape.w / 2, tape.y + tape.h / 2); ctx.rotate(tape.rotate * Math.PI / 180);
    ctx.fillStyle = slot.tapeColor || 'rgba(225,211,165,.72)'; ctx.fillRect(-tape.w / 2, -tape.h / 2, tape.w, tape.h); ctx.strokeStyle = 'rgba(110,92,56,.13)'; ctx.lineWidth = Math.max(1, tape.h * .025); ctx.strokeRect(-tape.w / 2, -tape.h / 2, tape.w, tape.h); ctx.restore();
  }
}
/** Slots in drawing order (z, then layout order). */
export const drawOrder = layout => [...layout.slots].sort((a, b) => a.z - b.z || a.index - b.index);

/** The rectangle a collage text layer uses. Kept public so stage handles and rendering share the same geometry. */
export function collageTextRect(doc, layout, text) {
  if (text.target === 'sheet') return { x: 0, y: 0, width: layout.width, height: layout.height };
  const index = doc.slots.findIndex(slot => slot.id === text.target), slot = layout.slots[index];
  if (!slot) return null;
  const box = text.caption && slot.caption ? slot.caption : slot;
  return { x: box.x, y: box.y, width: box.w, height: box.h };
}

const stripSpace = (ctx, strip, draw) => {
  const cx = strip.x + strip.w / 2, cy = strip.y + strip.h / 2;
  ctx.save(); ctx.translate(cx + strip.dx * strip.w, cy + strip.dy * strip.h); ctx.rotate(strip.angle * Math.PI / 180); ctx.translate(-cx, -cy); draw(); ctx.restore();
};

const contactSlotSpace = (ctx, layout, slot, draw) => {
  if (!layout.contact) { draw(); return; }
  const strip = layout.strips[slot.strip]; stripSpace(ctx, strip, draw);
};

/** Draws a slot with its contact-strip transform when applicable. */
export function drawCollageSlot(ctx, doc, layout, slot, image, emptyFill = null) {
  contactSlotSpace(ctx, layout, slot, () => drawSlot(ctx, doc, slot, image, emptyFill));
}

/** Film base beneath contact-sheet gates. Photos are drawn after this, edge marks after the photos. */
export function drawContactBase(ctx, doc, layout) {
  const film = filmSettings(doc.film), color = film.base === 'bw' ? '#171716' : '#a34b21';
  for (const strip of layout.strips) stripSpace(ctx, strip, () => {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.42)'; ctx.shadowBlur = strip.edge * .45; ctx.shadowOffsetY = strip.edge * .18;
    ctx.fillStyle = color; ctx.fillRect(strip.x, strip.y, strip.w, strip.h); ctx.restore();
  });
}

function greaseMark(ctx, slot, kind, color, width) {
  const cx = slot.x + slot.w / 2, cy = slot.y + slot.h / 2;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'circle') ctx.ellipse(cx, cy, slot.w * .4, slot.h * .42, -.12, 0, Math.PI * 2);
  else { ctx.moveTo(slot.x + slot.w * .15, slot.y + slot.h * .15); ctx.lineTo(slot.x + slot.w * .85, slot.y + slot.h * .85); ctx.moveTo(slot.x + slot.w * .82, slot.y + slot.h * .12); ctx.lineTo(slot.x + slot.w * .18, slot.y + slot.h * .88); }
  ctx.stroke();
}

/** Wear, holes and generic edge printing on top of contact-sheet photos. */
export function drawContactMarks(ctx, doc, layout) {
  const film = filmSettings(doc.film), color = film.base === 'bw' ? '#171716' : '#a34b21';
  const ink = film.base === 'bw' ? 'rgba(236,231,203,.82)' : 'rgba(255,213,73,.88)';
  for (const strip of layout.strips) stripSpace(ctx, strip, () => {
    const mm = strip.h / layout.filmAcross;
    ctx.save(); ctx.beginPath(); ctx.rect(strip.x, strip.y, strip.w, strip.h);
    for (const slot of layout.slots.filter(item => item.strip === strip.index)) ctx.rect(slot.x, slot.y, slot.w, slot.h);
    ctx.clip('evenodd'); ctx.translate(strip.x, strip.y); filmWear(ctx, strip.w, strip.h, mm, .22, 17000 + strip.index * 101); ctx.restore();
    if (layout.perforated) {
      ctx.save(); ctx.translate(strip.x, strip.y); ctx.fillStyle = doc.paper.color; ctx.beginPath();
      perforations(ctx, strip.w, strip.h, mm, layout.slots[0].x - strip.x + layout.slots[0].w / 2 - 1.4 * mm); ctx.fill(); ctx.restore();
    }
    const rowSlots = layout.slots.filter(item => item.strip === strip.index), font = Math.max(3, strip.edge * .3);
    ctx.fillStyle = ink; ctx.font = `700 ${font}px Helvetica, Arial, sans-serif`; ctx.textBaseline = 'middle';
    ctx.textAlign = 'left'; ctx.fillText(String(film.stockText || '').slice(0, 32), strip.x + strip.edge * .25, strip.y + strip.edge * .38);
    ctx.textAlign = 'right'; if (film.date) ctx.fillText(String(film.date).slice(0, 16), strip.x + strip.w - strip.edge * .25, strip.y + strip.edge * .38);
    ctx.textAlign = 'center';
    for (const slot of rowSlots) {
      const label = frameNumber(film.startNumber, slot.index);
      ctx.fillText(label, slot.x + slot.w / 2, strip.y + strip.h - strip.edge * .38);
      ctx.font = `700 ${Math.max(2, font * .7)}px Helvetica, Arial, sans-serif`;
      ctx.fillText('– · – · –', slot.x + slot.w * .2, strip.y + strip.h - strip.edge * .38);
      ctx.font = `700 ${font}px Helvetica, Arial, sans-serif`;
    }
    ctx.save(); ctx.globalAlpha = .16; ctx.fillStyle = color; ctx.fillRect(strip.x, strip.y, strip.w, strip.h); ctx.restore();
  });
  const marked = layout.slots[film.markFrame - 1];
  if (marked && film.mark !== 'none') contactSlotSpace(ctx, layout, marked, () => greaseMark(ctx, marked, film.mark, 'rgba(224,45,42,.86)', Math.max(2, Math.min(marked.w, marked.h) * .035)));
}

/** Draws collage text with the existing photo text renderer. Sheet layers use the full canvas; slot layers use the
 * stable slot id, so swapping photos does not move captions between slots. Shaped sheets clip text by default. */
export function drawCollageTexts(ctx, doc, layout, fontFor = null) {
  for (const text of doc.text || []) {
    const rect = collageTextRect(doc, layout, text);
    if (!rect) continue;
    ctx.save();
    if (layout.shaped && !text.outsideShape) ctx.clip(sheetPath(layout.paper), 'evenodd');
    drawTexts(ctx, rect, [{ ...text, font: fontFor ? fontFor(text.font) : text.font }]);
    ctx.restore();
  }
}

/** Draws the collage `doc` laid out as `layout` (js/collage/layout.js) on ctx (sized layout.width × height).
 *  imageFor(index) → the slot's photo edit (canvas or ImageBitmap) or null (empty or still rendering). */
export function drawCollage(ctx, doc, layout, imageFor, { emptyFill = 'rgba(128,128,128,.28)', captionHint = null, fontFor = null } = {}) {
  drawPaper(ctx, doc, layout);
  if (layout.contact) drawContactBase(ctx, doc, layout);
  for (const slot of drawOrder(layout)) drawCollageSlot(ctx, doc, layout, slot, imageFor(slot.index), layout.contact ? null : emptyFill);
  if (layout.contact) drawContactMarks(ctx, doc, layout);
  drawStickers(ctx, doc, layout); // above the photos, under the text
  // Preview only: a placeholder bar where each caption will go (the text arrives with text layers, Task 7).
  if (captionHint) for (const { caption, index } of layout.slots) {
    if (!caption) continue;
    if (doc.text?.some(text => text.target === doc.slots[index]?.id && text.caption)) continue;
    const h = Math.max(2, caption.h * .16), w = Math.min(caption.w * .4, caption.h * 4);
    ctx.fillStyle = captionHint; ctx.beginPath(); ctx.roundRect(caption.x + (caption.w - w) / 2, caption.y + (caption.h - h) / 2, w, h, h / 2); ctx.fill();
  }
  drawCollageTexts(ctx, doc, layout, fontFor);
}
