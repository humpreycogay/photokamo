// Collage checks (node tools/collage-check.mjs): template validation, layout golden numbers and exact sums,
// shape areas and simple (non-self-intersecting) outlines. Exits 1 on any failure.
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { templates, slotCount } = await import(`${repo}/js/collage/templates.js`);
const { layoutTemplate, sheetSize } = await import(`${repo}/js/collage/layout.js`);
const { shapePolygon, polygonArea, pointInPolygon, SHAPE_KINDS } = await import(`${repo}/js/collage/shapes.js`);

let errors = 0, checks = 0;
const fail = message => { errors++; console.log('ERR', message); };
const check = (ok, message) => { checks++; if (!ok) fail(message); };
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---------- Templates ----------
const ids = new Set();
for (const t of templates) {
  check(!ids.has(t.id), `duplicate template id ${t.id}`); ids.add(t.id);
  check(typeof t.name === 'string' && t.name.length > 0, `${t.id} has no name`);
  check(t.aspect?.length === 2 && t.aspect.every(v => v > 0), `${t.id} bad aspect`);
  if (t.kind === 'grid') {
    check([...t.cols, ...t.rows].every(v => v > 0), `${t.id} has a zero-size track`);
    check(slotCount(t) >= 1 && slotCount(t) <= 9, `${t.id} holds ${slotCount(t)} photos (grids hold 1–9)`);
    const covered = t.rows.map(() => t.cols.map(() => 0));
    for (const [col, row, colSpan = 1, rowSpan = 1] of t.cells) {
      if (!(colSpan >= 1 && rowSpan >= 1 && col >= 0 && row >= 0 && col + colSpan <= t.cols.length && row + rowSpan <= t.rows.length)) { fail(`${t.id} cell ${[col, row, colSpan, rowSpan]} out of bounds`); continue; }
      for (let r = row; r < row + rowSpan; r++) for (let c = col; c < col + colSpan; c++) covered[r][c]++;
    }
    check(covered.flat().every(n => n === 1), `${t.id} cells must cover every grid cell exactly once`);
  } else fail(`${t.id} unexpected kind ${t.kind} (Task 0 ships grids only)`);
}

// ---------- Layout: golden numbers ----------
const rects = layout => layout.slots.map(({ x, y, w, h }) => [x, y, w, h]);
const golden = (name, actual, expected) => check(JSON.stringify(actual) === JSON.stringify(expected), `${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
const byId = id => templates.find(t => t.id === id);
golden('grid-4 1000² g.02 m.04', rects(layoutTemplate(byId('grid-4'), 1000, 1000, { gutter: .02, margin: .04 })),
  [[40, 40, 450, 450], [510, 40, 450, 450], [40, 510, 450, 450], [510, 510, 450, 450]]);
golden('grid-9 1000² g.01 m.03', rects(layoutTemplate(byId('grid-9'), 1000, 1000, { gutter: .01, margin: .03 })).slice(0, 3),
  [[30, 30, 307, 307], [347, 30, 307, 307], [664, 30, 306, 307]]);
golden('grid-3-left 1500×1000 g.02', rects(layoutTemplate(byId('grid-3-left'), 1500, 1000, { gutter: .02 })),
  [[0, 0, 987, 1000], [1007, 0, 493, 490], [1007, 510, 493, 490]]);
golden('grid-4 radius', layoutTemplate(byId('grid-4'), 1000, 1000, { gutter: .02, radius: .5 }).slots.map(s => s.radius), [245, 245, 245, 245]);

// ---------- Layout: exact at 3 sizes, every template and spacing ----------
const spacings = [{}, { gutter: .02, margin: .04, radius: .03 }, { gutter: .013, margin: .051, radius: .2 }];
for (const t of templates) {
  for (const [width, height] of [Object.values(sheetSize(t.aspect, 1080)), Object.values(sheetSize(t.aspect, 2999)), [1001, 1333]]) {
    for (const spacing of spacings) {
      const name = `${t.id} ${width}×${height} ${JSON.stringify(spacing)}`;
      const layout = layoutTemplate(t, width, height, spacing);
      for (const [axis, tracks, size] of [['cols', layout.cols, width], ['rows', layout.rows, height]]) {
        const sum = 2 * layout.margin + tracks.reduce((total, track) => total + track.size, 0) + layout.gutter * (tracks.length - 1);
        check(sum === size, `${name} ${axis} add up to ${sum}, not ${size}`);
        check(tracks.every((track, i) => i === 0 ? track.start === layout.margin : track.start === tracks[i - 1].start + tracks[i - 1].size + layout.gutter), `${name} ${axis} not contiguous`);
      }
      check(layout.slots.length === slotCount(t), `${name} slot count`);
      for (const s of layout.slots) {
        check([s.x, s.y, s.w, s.h, s.radius].every(Number.isInteger), `${name} slot ${s.index} not whole px`);
        check(s.w >= 1 && s.h >= 1, `${name} slot ${s.index} zero size`);
        check(s.x >= layout.margin && s.y >= layout.margin && s.x + s.w <= width - layout.margin && s.y + s.h <= height - layout.margin, `${name} slot ${s.index} outside the margin`);
        check(s.radius <= Math.min(s.w, s.h) / 2, `${name} slot ${s.index} radius too big`);
      }
      layout.slots.forEach((a, i) => layout.slots.slice(i + 1).forEach(b => check(!overlap(a, b), `${name} slots ${a.index} and ${b.index} overlap`)));
      for (const col of layout.cols) for (const row of layout.rows) { // no holes: every track cell sits in exactly one slot
        const inside = layout.slots.filter(s => s.x <= col.start && s.y <= row.start && s.x + s.w >= col.start + col.size && s.y + s.h >= row.start + row.size);
        check(inside.length === 1, `${name} track cell ${col.start},${row.start} is in ${inside.length} slots`);
      }
    }
  }
}
// Contact and free layouts (templates arrive in later tasks; the engine is checked now).
{
  const layout = layoutTemplate({ kind: 'contact', strips: 6, frames: 6, frame: [3, 2] }, 2550, 3300, { gutter: .03, margin: .05 });
  check(layout.slots.length === 36, 'contact slot count');
  check(layout.slots.every(s => s.x >= layout.margin && s.y >= layout.margin && s.x + s.w <= 2550 - layout.margin && s.y + s.h <= 3300 - layout.margin), 'contact frames outside the margin');
  check(layout.slots.every(s => Math.abs(s.w / s.h - 1.5) < .01), 'contact frames keep 3:2');
  layout.slots.forEach((a, i) => layout.slots.slice(i + 1).forEach(b => check(!overlap(a, b), `contact frames ${a.index}/${b.index} overlap`)));
  const free = layoutTemplate({ kind: 'free', slots: [{ x: .1, y: .1, w: .5, h: .4, rotate: -4, z: 1 }, { x: .4, y: .45, w: .5, h: .45 }] }, 1001, 1251);
  golden('free layout', rects(free), [[100, 125, 501, 501], [400, 563, 501, 563]]);
  check(free.slots[0].rotate === -4 && free.slots[0].z === 1, 'free slot keeps rotate and z');
}

// ---------- Shapes ----------
function selfIntersects(p) {
  const n = p.length / 2, seg = i => [p[2 * i], p[2 * i + 1], p[(2 * i + 2) % p.length], p[(2 * i + 3) % p.length]];
  const cross = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  for (let i = 0; i < n; i++) {
    const [ax, ay, bx, by] = seg(i);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // neighbours through the closing edge
      const [cx, cy, dx, dy] = seg(j);
      const d1 = cross(ax, ay, bx, by, cx, cy), d2 = cross(ax, ay, bx, by, dx, dy), d3 = cross(cx, cy, dx, dy, ax, ay), d4 = cross(cx, cy, dx, dy, bx, by);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    }
  }
  return false;
}
const bounds = p => { const xs = p.filter((_, i) => i % 2 === 0), ys = p.filter((_, i) => i % 2); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
const starRatio = (n, inner) => { // analytic star area / its bounding box, point up
  const pts = Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? inner : 1; return [Math.cos(a) * r, Math.sin(a) * r]; });
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return n * inner * Math.sin(Math.PI / n) / ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)));
};
const stampArea = (w, h) => { // rect minus half-disc bites (same rule as shapes.js)
  const bite = Math.max(.5, Math.min(w, h) * .025), count = length => Math.max(3, Math.round(length / (bite * 4)));
  return w * h - (2 * count(w) + 2 * count(h)) * Math.PI * bite * bite / 2;
};
// [ref, expected area as a fraction of reference (the rect, or the outline's own bounding box), tolerance (relative), use own bbox]
const shapeCases = (w, h) => [
  [{ kind: 'rect' }, 1, 1e-9],
  [{ kind: 'rounded', radius: .2 }, 1 - (4 - Math.PI) * (.2 * Math.min(w, h)) ** 2 / (w * h), .001],
  [{ kind: 'circle' }, Math.PI / 4 * Math.min(w, h) ** 2 / (w * h), .005],
  [{ kind: 'ellipse' }, Math.PI / 4, .005],
  [{ kind: 'hexagon' }, .75, .001, true],
  [{ kind: 'hexagon', top: 'flat' }, .75, .001, true],
  [{ kind: 'polygon', n: 8 }, null, 0, true],
  [{ kind: 'polygon', points: [.5, 0, 1, 1, 0, 1] }, .5, 1e-9],
  [{ kind: 'star' }, starRatio(5, .45), .001, true],
  [{ kind: 'star', n: 6 }, starRatio(6, .45), .001, true],
  [{ kind: 'heart' }, .66, .02 / .66],
  [{ kind: 'arch' }, (w * (h - Math.min(w / 2, h)) + Math.PI * Math.min(w / 2, h) * (w / 2) / 2) / (w * h), .002],
  [{ kind: 'stamp' }, stampArea(w, h) / (w * h), .002],
  [{ kind: 'path', d: 'M .5 0 L 1 .5 L .5 1 L 0 .5 Z' }, .5, 1e-9],
  [{ kind: 'path', d: 'M 0 1 Q .5 -1 1 1 Z' }, 2 / 3, .002]
];
const kindsSeen = new Set();
for (const [w, h] of [[1000, 1000], [1080, 1350], [397, 211]]) {
  const rect = { x: 13, y: 7, w, h };
  for (const [ref, expected, tolerance, ownBox] of shapeCases(w, h)) {
    kindsSeen.add(ref.kind);
    const name = `${JSON.stringify(ref)} in ${w}×${h}`, poly = shapePolygon(ref, rect, .1), b = bounds(poly);
    const area = polygonArea(poly);
    check(poly.length >= 6, `${name} has no outline`);
    check(area > 0, `${name} outline is not clockwise`);
    check(b.x >= rect.x - .01 && b.y >= rect.y - .01 && b.x + b.w <= rect.x + w + .01 && b.y + b.h <= rect.y + h + .01, `${name} leaves its rect`);
    check(!selfIntersects(poly), `${name} self-intersects`);
    check(pointInPolygon(poly, b.x + b.w / 2, b.y + b.h * .6), `${name} centre is not inside`);
    if (expected != null) {
      const ratio = area / (ownBox ? b.w * b.h : w * h);
      check(Math.abs(ratio / expected - 1) <= tolerance, `${name} area ratio ${ratio.toFixed(5)}, expected ${expected.toFixed(5)} ± ${(tolerance * 100).toFixed(2)} %`);
    }
  }
}
check(SHAPE_KINDS.every(kind => kindsSeen.has(kind)), `shapes without checks: ${SHAPE_KINDS.filter(kind => !kindsSeen.has(kind))}`);

// ---------- Fill: photo framing in a slot (Task 2) ----------
const { fillGeometry, photoPoint, panBy, normalizeFill } = await import(`${repo}/js/collage/fill.js`);
{
  let seed = 7; const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const corners = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  let worst = 0;
  for (let n = 0; n < 2000; n++) {
    const iw = 50 + random() * 4000, ih = 50 + random() * 4000, w = 20 + random() * 2000, h = 20 + random() * 2000;
    const fill = normalizeFill({ pan: { x: random(), y: random() }, zoom: 1 + random() * 4, rotate: Math.floor(random() * 4) * 90, angle: (random() * 2 - 1) * 45, flip: random() < .5 });
    if (n % 3 === 0) fill.pan = { x: Math.round(random()), y: Math.round(random()) }; // the extremes
    const g = fillGeometry(iw, ih, w, h, fill);
    // Covered: every slot corner maps inside the oriented photo (no paper at any pan, zoom or angle).
    for (const [x, y] of corners(w, h)) {
      const p = photoPoint(g, x, y), out = Math.max(-p.x, p.x - g.W, -p.y, p.y - g.H);
      if (out > 1e-6 * Math.max(g.W, g.H)) { fail(`fill leaves a gap: ${JSON.stringify({ iw, ih, w, h, fill })}`); break; }
    }
    // Preview and export: the same fill at another output scale shows the same part of the photo.
    const s = .2 + random() * 6, g2 = fillGeometry(iw, ih, w * s, h * s, fill);
    for (const [x, y] of corners(w, h)) {
      const a = photoPoint(g, x, y), b = photoPoint(g2, x * s, y * s);
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y) * g.scale); // in slot px of the first size
    }
    checks++;
  }
  check(worst < .01, `preview/export framing differs by ${worst.toFixed(4)} slot px`);
  // A drag moves the photo with the pointer, and pan stops at the photo's edge.
  const g = fillGeometry(1000, 500, 300, 300, { pan: { x: .5, y: .5 }, zoom: 2 });
  const moved = panBy(g, { x: .5, y: .5 }, 30, 0), before = photoPoint(g, 0, 0);
  const after = photoPoint(fillGeometry(1000, 500, 300, 300, { pan: moved, zoom: 2 }), 30, 0);
  check(Math.hypot(after.x - before.x, after.y - before.y) < 1e-9, 'a drag keeps the photo point under the pointer');
  check(JSON.stringify(panBy(g, { x: .5, y: .5 }, -1e6, 1e6)) === JSON.stringify({ x: 1, y: 0 }), 'pan clamps to the photo');
  const n = normalizeFill({ zoom: 9, angle: -80, rotate: -90, pan: { x: 2, y: -1 } });
  check(n.zoom === 5 && n.angle === -45 && n.rotate === 270 && n.pan.x === 1 && n.pan.y === 0, `normalizeFill ${JSON.stringify(n)}`);
}

// ---------- Export sizes (Task 3) ----------
{
  const { shareSize, printSize, fullSize, capSize, slotEdge } = await import(`${repo}/js/collage/sizes.js`);
  const { createDoc, fitSlots } = await import(`${repo}/js/collage/model.js`);
  golden('share sizes', [[1, 1], [4, 5], [3, 2], [2, 3], [9, 16], [16, 9]].map(([w, h]) => Object.values(shareSize({ w, h }))),
    [[1080, 1080], [1080, 1350], [1620, 1080], [1080, 1620], [1080, 1920], [1920, 1080]]);
  golden('print A4 4:5 / 3:2 / 8×10', [printSize({ w: 4, h: 5 }, 'a4'), printSize({ w: 3, h: 2 }, 'a4'), printSize({ w: 4, h: 5 }, '8x10')].map(Object.values),
    [[2481, 3101], [3507, 2338], [2400, 3000]]);
  const capped = capSize({ width: 9000, height: 6000 }, 16.7e6);
  check(capped.capped && capped.width * capped.height <= 16.7e6 && Math.abs(capped.width / capped.height - 1.5) < .001, `capSize ${JSON.stringify(capped)}`);
  check(!capSize({ width: 1000, height: 1000 }, 4e6).capped, 'capSize leaves small sizes');
  // Full size: the most detailed slot shows its photo 1:1.
  const t = byId('grid-2-side'), doc = fitSlots(createDoc([1, 2], t, '#fff'), 2);
  doc.slots[1].zoom = 2;
  const sizes = { 1: { width: 3000, height: 2000 }, 2: { width: 1200, height: 1600 } };
  const full = fullSize(doc, t, fill => sizes[fill.photoId] || null);
  const layout = layoutTemplate(t, full.width, full.height, doc);
  const scales = layout.slots.map(s => fillGeometry(sizes[doc.slots[s.index].photoId].width, sizes[doc.slots[s.index].photoId].height, s.w, s.h, doc.slots[s.index]).scale);
  check(Math.abs(Math.min(...scales) - 1) < .01, `full size shows the most detailed photo 1:1, no photo below 1:1 (scales ${scales.map(v => v.toFixed(3))})`);
  check(slotEdge(3000, 2000, 300, 300, {}) === Math.ceil(3000 * 302 / 2000) && slotEdge(3000, 2000, 5000, 5000, {}) === Infinity, 'slotEdge');
}

console.log(`${errors ? 'FAIL' : 'OK'}: ${checks} checks, ${errors} errors (${templates.length} templates, ${SHAPE_KINDS.length} shapes)`);
process.exit(errors ? 1 : 0);
