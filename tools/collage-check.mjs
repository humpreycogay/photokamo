// Collage checks (node tools/collage-check.mjs): template validation, layout golden numbers and exact sums,
// shape areas and simple (non-self-intersecting) outlines. Exits 1 on any failure.
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { templates, slotCount } = await import(`${repo}/js/collage/templates.js`);
const { layoutTemplate, sheetSize } = await import(`${repo}/js/collage/layout.js`);
const { shapePolygon, polygonArea, pointInPolygon, SHAPE_KINDS } = await import(`${repo}/js/collage/shapes.js`);
const { DEFAULT_FILM, filmSettings, frameNumber, stripTransform } = await import(`${repo}/js/collage/contact.js`);
const { fibres, tapeRect, unrotatePoint } = await import(`${repo}/js/collage/scrapbook.js`);

let errors = 0, checks = 0;
const fail = message => { errors++; console.log('ERR', message); };
const check = (ok, message) => { checks++; if (!ok) fail(message); };
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const byId = id => templates.find(t => t.id === id);

// ---------- Draggable text position ----------
{
  const { moveCollageText } = await import(`${repo}/js/collage/mode.js`);
  const text = { x: .5, y: .5 }, rect = { width: 400, height: 200 };
  moveCollageText(text, rect, 20, -10, 2);
  check(text.x === .6 && text.y === .4, `text drag normalizes to its target ${JSON.stringify(text)}`);
  moveCollageText(text, rect, 1000, -1000, 1);
  check(text.x === 1 && text.y === 0, `text drag stays on its target ${JSON.stringify(text)}`);
}

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
  } else if (t.kind === 'shaped') {
    check(t.category === 'shape' && SHAPE_KINDS.includes(t.sheet?.shape?.kind), `${t.id} bad sheet shape`);
    check(slotCount(t) >= 1 && slotCount(t) <= 9, `${t.id} holds ${slotCount(t)} photos (shapes hold 1–9)`);
    check(['grid', 'radial', 'free'].includes(t.fill?.kind), `${t.id} bad fill`);
    check(!t.sheet.hole || (t.sheet.hole > 0 && t.sheet.hole < .8), `${t.id} bad hole`);
  } else if (t.kind === 'free') {
    check(['diptych', 'layout', 'collage'].includes(t.category) && /^#[0-9a-f]{6}$/i.test(t.paper || ''), `${t.id} free layout needs a paper colour`);
    check(slotCount(t) >= 2 && slotCount(t) <= 9, `${t.id} holds ${slotCount(t)} photos (styles hold 2–9)`);
    for (const [i, s] of t.slots.entries()) check(s.w > 0 && s.h > 0 && s.x >= -1e-9 && s.y >= -1e-9 && s.x + s.w <= 1 + 1e-9 && s.y + s.h <= 1 + 1e-9, `${t.id} slot ${i} leaves the sheet`);
    // Mounts (frames, polaroid cards) stay on the sheet at the template's own aspect (rotation aside, ±1 %).
    const [aw, ah] = t.aspect, own = layoutTemplate(t, 1000 * aw / Math.min(aw, ah), 1000 * ah / Math.min(aw, ah));
    for (const s of own.slots) if (s.mount) {
      const m = s.mount, f = m.frame?.width || 0, x0 = s.x - m.pad - f, y0 = s.y - m.pad - f, x1 = s.x + s.w + m.pad + f, y1 = s.y + s.h + m.bottom + f, tol = 10;
      check(x0 >= -tol && y0 >= -tol && x1 <= own.width + tol && y1 <= own.height + tol, `${t.id} slot ${s.index} mount leaves the sheet`);
      for (const o of own.slots) if (o !== s && o.mount && !t.slots[s.index].rotate && !t.slots[o.index].rotate) {
        const ox0 = o.x - o.mount.pad - f, oy0 = o.y - o.mount.pad - f, ox1 = o.x + o.w + o.mount.pad + f, oy1 = o.y + o.h + o.mount.bottom + f;
        check(x1 <= ox0 || ox1 <= x0 || y1 <= oy0 || oy1 <= y0, `${t.id} frames ${s.index} and ${o.index} overlap`);
      }
    }
    // Every print shows at least 40 % of itself (sampled on a 120 × 120 grid over its box, inside its shape).
    const layout = layoutTemplate(t, 1400, 1000), inShape = (s, x, y) => (s.visible ? pointInPolygon(s.visible, x, y) : true);
    for (const s of layout.slots) {
      let inside = 0, shown = 0;
      for (let i = 0; i < 120; i++) for (let j = 0; j < 120; j++) {
        const x = s.x + (i + .5) * s.w / 120, y = s.y + (j + .5) * s.h / 120; if (!inShape(s, x, y)) continue;
        inside++;
        if (!layout.slots.some(o => o.z > s.z && x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h && inShape(o, x, y))) shown++;
      }
      const minShown = t.slots[s.index].background ? .08 : .4;
      check(inside > 0 && shown / inside >= minShown, `${t.id} slot ${s.index} shows ${(100 * shown / inside).toFixed(0)} % of itself`);
    }
  } else if (t.kind === 'contact') {
    check(t.category === 'contact', `${t.id} bad contact category`);
    check(slotCount(t) >= 9 && slotCount(t) <= 36, `${t.id} holds ${slotCount(t)} photos (contact sheets hold 9–36)`);
    check(t.strips >= 1 && t.frames >= 1 && t.frame?.every(v => v > 0), `${t.id} bad contact geometry`);
  } else fail(`${t.id} unexpected kind ${t.kind}`);
}

// ---------- Scrapbook/free transforms (Task 9) ----------
{
  const { createDoc, resetTransforms } = await import(`${repo}/js/collage/model.js`);
  for (const count of [3, 4, 5]) check(slotCount(byId(`scrapbook-${count}`)) === count, `scrapbook-${count} slot count`);
  for (const id of ['arc-circle', 'arc-circle-right', 'arc-2-circles', 'arc-2-circles-right']) {
    const t = byId(id);
    check(t.slots[0].x === 0 && t.slots[0].y === 0 && t.slots[0].w === 1 && t.slots[0].h === 1 && t.slots[0].z < 0 && t.slots[0].border === false && t.slots[0].background, `${id} has a full-sheet background photo`);
  }
  check(slotCount(byId('arc-circle')) === 3 && slotCount(byId('arc-circle-right')) === 3, 'arc + circle variants hold a background, arc and circle photo');
  check(slotCount(byId('arc-2-circles')) === 4 && slotCount(byId('arc-2-circles-right')) === 4, 'arc + 2 circles variants hold a background, arc and two circle photos');
  const t = byId('scrapbook-3'), doc = { slots: [{ layout: { x: .2, y: .3, rotate: 17, z: 9 } }, {}, {}] };
  const moved = layoutTemplate(t, 1000, 1250, doc).slots[0];
  check(moved.x === 200 && moved.y === 375 && moved.rotate === 17 && moved.z === 9, `free override ${JSON.stringify(moved)}`);
  const p = unrotatePoint({ x: 100, y: 100, w: 200, h: 100, rotate: 90 }, 200, 50);
  check(Math.abs(p.x - 100) < 1e-9 && Math.abs(p.y - 150) < 1e-9, `unrotatePoint ${JSON.stringify(p)}`);
  const a = fibres(1080, 1350), b = fibres(4000, 5000);
  check(JSON.stringify(a) === JSON.stringify(b), 'fibre geometry is resolution-independent at the same aspect');
  check(JSON.stringify(a) === JSON.stringify(fibres(1080, 1350)), 'fibre geometry is deterministic');
  const tape = tapeRect({ x: 100, y: 80, w: 500, h: 300, index: 2 }, 'tl');
  check(tape.w > tape.h && Number.isFinite(tape.rotate), `tape geometry ${JSON.stringify(tape)}`);
  const transformed = createDoc([10, 20], byId('scrapbook-3'), '#fff');
  Object.assign(transformed.slots[0], { pan: { x: .1, y: .8 }, zoom: 3, rotate: 90, angle: 21, flip: true, layout: { x: .4, y: .2, rotate: -17, z: 12 } });
  resetTransforms(transformed);
  check(JSON.stringify(transformed.slots[0]) === JSON.stringify({ id: transformed.slots[0].id, photoId: 10, pan: { x: .5, y: .5 }, zoom: 1, rotate: 0, angle: 0, flip: false }), 'resetTransforms restores framing and template placement');
  check(transformed.slots[1].photoId === 20 && !('layout' in transformed.slots[1]), 'resetTransforms keeps photos and clears every layout override');
}

// ---------- Layout: golden numbers ----------
const rects = layout => layout.slots.map(({ x, y, w, h }) => [x, y, w, h]);
const golden = (name, actual, expected) => check(JSON.stringify(actual) === JSON.stringify(expected), `${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
golden('grid-4 1000² g.02 m.04', rects(layoutTemplate(byId('grid-4'), 1000, 1000, { gutter: .02, margin: .04 })),
  [[40, 40, 450, 450], [510, 40, 450, 450], [40, 510, 450, 450], [510, 510, 450, 450]]);
golden('grid-9 1000² g.01 m.03', rects(layoutTemplate(byId('grid-9'), 1000, 1000, { gutter: .01, margin: .03 })).slice(0, 3),
  [[30, 30, 307, 307], [347, 30, 307, 307], [664, 30, 306, 307]]);
golden('grid-3-left 1500×1000 g.02', rects(layoutTemplate(byId('grid-3-left'), 1500, 1000, { gutter: .02 })),
  [[0, 0, 987, 1000], [1007, 0, 493, 490], [1007, 510, 493, 490]]);
golden('grid-4 radius', layoutTemplate(byId('grid-4'), 1000, 1000, { gutter: .02, radius: .5 }).slots.map(s => s.radius), [245, 245, 245, 245]);

// ---------- Layout: exact at 3 sizes, every template and spacing ----------
const spacings = [{}, { gutter: .02, margin: .04, radius: .03 }, { gutter: .013, margin: .051, radius: .2 }];
for (const t of templates.filter(t => t.kind === 'grid')) {
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
// Contact and free layouts.
{
  const layout = layoutTemplate(byId('contact-35'), 2550, 3300, { gutter: .03, margin: .05 });
  check(layout.slots.length === 36, 'contact slot count');
  check(layout.slots.every(s => s.x >= layout.margin && s.y >= layout.margin && s.x + s.w <= 2550 - layout.margin && s.y + s.h <= 3300 - layout.margin), 'contact frames outside the margin');
  check(layout.slots.every(s => Math.abs(s.w / s.h - 1.5) < .01), 'contact frames keep 3:2');
  layout.slots.forEach((a, i) => layout.slots.slice(i + 1).forEach(b => check(!overlap(a, b), `contact frames ${a.index}/${b.index} overlap`)));
  check(layout.perforated && layout.strips.length === 6 && layout.strips.every(strip => strip.h > layout.slots[0].h), '35 mm strips include perforated film edges');
  for (const id of ['contact-66', 'contact-67']) {
    const medium = layoutTemplate(byId(id), 2550, 3300, { gutter: .03, margin: .05 });
    check(!medium.perforated && medium.filmAcross === 70, `${id} uses 120 film`);
    check(medium.slots.length === slotCount(byId(id)), `${id} slot count`);
  }
  const free = layoutTemplate({ kind: 'free', slots: [{ x: .1, y: .1, w: .5, h: .4, rotate: -4, z: 1 }, { x: .4, y: .45, w: .5, h: .45 }] }, 1001, 1251);
  golden('free layout', rects(free), [[100, 125, 501, 501], [400, 563, 501, 563]]);
  check(free.slots[0].rotate === -4 && free.slots[0].z === 1, 'free slot keeps rotate and z');
}

// ---------- Contact-film data ----------
{
  golden('contact frame numbers', Array.from({ length: 4 }, (_, i) => frameNumber(1, i)), ['1', '2', '3', '4']);
  golden('contact half numbers', Array.from({ length: 3 }, (_, i) => frameNumber(1.5, i)), ['1A', '2A', '3A']);
  check(JSON.stringify(stripTransform(4)) === JSON.stringify(stripTransform(4)), 'contact strip transform deterministic');
  check(stripTransform(4).angle >= -.7 && stripTransform(4).angle <= .7, 'contact strip rotation range');
  check(JSON.stringify(filmSettings(null)) === JSON.stringify(DEFAULT_FILM), 'contact film defaults');
}

// ---------- Stickers ----------
{
  const { stickers, STICKER_GROUPS, stickerById, cleanStickers, stickerBox } = await import(`${repo}/js/collage/stickers.js`);
  const groups = STICKER_GROUPS.map(([id]) => id), ids = new Set();
  for (const s of stickers) {
    check(!ids.has(s.id), `sticker ${s.id} duplicated`); ids.add(s.id);
    check(groups.includes(s.group) && s.name && s.w > 0 && s.w <= 100 && s.h > 0 && s.h <= 100 && typeof s.draw === 'function', `sticker ${s.id} bad definition`);
  }
  for (const group of groups) check(stickers.filter(s => s.group === group).length >= 8, `sticker group ${group} has few stickers`);
  const { existsSync } = await import('node:fs'), { fileURLToPath } = await import('node:url');
  for (const s of stickers.filter(s => s.emoji)) check(s.file && existsSync(fileURLToPath(s.file)), `sticker ${s.id} has no Twemoji SVG (${s.file})`);
  const clean = cleanStickers([{ id: 'a', kind: 'heart', x: .5, y: .5, size: .2, rotate: 10, extra: 1 }, { id: 'b', kind: 'nope', x: .5, y: .5, size: .2 }, { id: 'c', kind: 'star', x: NaN, y: 0, size: .2 }, null]);
  golden('clean stickers', clean, [{ id: 'a', kind: 'heart', x: .5, y: .5, size: .2, rotate: 10, flip: false }]);
  const box = stickerBox({ kind: 'tape-pink', x: .5, y: .25, size: .5, rotate: 30 }, { width: 1000, height: 800 });
  check(box.cx === 500 && box.cy === 200 && box.w === 400 && Math.abs(box.h - 112) < 1e-9 && box.rotate === 30 && stickerById('tape-pink') === box.sticker, `sticker box ${JSON.stringify({ ...box, sticker: undefined })}`);
}

// ---------- Dividers and caption space (Task 6) ----------
{
  const { splitAxis, defaultSplits, clampSplits, moveSplit, MIN_SPLIT } = await import(`${repo}/js/collage/layout.js`);
  const axes = Object.fromEntries(templates.filter(t => splitAxis(t)).map(t => [t.id, splitAxis(t)]));
  golden('split axes', axes, { 'grid-2-side': 'x', 'grid-2-stack': 'y', 'grid-3-cols': 'x', 'grid-3-rows': 'y', 'bands-3': 'y', 'bands-4': 'y', 'grid-4-cols': 'x' });
  golden('default splits', [defaultSplits(byId('grid-2-side')), defaultSplits(byId('grid-3-cols')).map(v => +v.toFixed(4))], [[.5], [.3333, .6667]]);
  golden('clampSplits', [clampSplits([.05], 2), clampSplits([.5, .55], 3), clampSplits([.9, .95], 3), clampSplits([.5], 3)], [[MIN_SPLIT], [.5, .65], [.7, .85], null]);
  golden('moveSplit', [moveSplit([.3, .6], 0, .5), moveSplit([.3, .6], 1, .2), moveSplit([.5], 0, 2)], [[.45, .6], [.3, .45], [.85]]);
  // Gutters and margins stay exact while dividers move; tracks follow the splits within 1 px.
  for (const id of Object.keys(axes)) for (const [width, height] of [[1500, 1000], [1001, 1499]]) {
    const t = byId(id), n = (axes[id] === 'x' ? t.cols : t.rows).length;
    for (let trial = 0; trial < 40; trial++) {
      const raw = Array.from({ length: n - 1 }, (_, i) => (i + 1) / n + (Math.sin(trial * 7 + i) * .3));
      const splits = clampSplits(raw.sort((a, b) => a - b), n), spacing = { gutter: .02, margin: .04, splits };
      const layout = layoutTemplate(t, width, height, spacing), tracks = axes[id] === 'x' ? layout.cols : layout.rows, size = axes[id] === 'x' ? width : height;
      const name = `${id} ${width}×${height} splits ${splits.map(v => v.toFixed(3))}`;
      check(2 * layout.margin + tracks.reduce((a, tr) => a + tr.size, 0) + layout.gutter * (n - 1) === size, `${name}: tracks don't add up`);
      check(tracks.every((tr, i) => !i || tr.start === tracks[i - 1].start + tracks[i - 1].size + layout.gutter), `${name}: gutter not exact`);
      const room = size - 2 * layout.margin - layout.gutter * (n - 1);
      check(splits.every((sp, i) => Math.abs(tracks[i].start + tracks[i].size - layout.margin - i * layout.gutter - sp * room) <= 1), `${name}: tracks don't follow the splits`);
      check(tracks.every(tr => tr.size >= Math.floor(MIN_SPLIT * room) - 1), `${name}: a track under 15 %`);
    }
  }
  // Caption space: photo + band = the cell, band under the photo, never overlapping it, every grid.
  for (const t of templates.filter(t => t.kind === 'grid')) {
    const plain = layoutTemplate(t, 1200, 900, { gutter: .02, margin: .04 }), cap = layoutTemplate(t, 1200, 900, { gutter: .02, margin: .04, captionSpace: true });
    cap.slots.forEach((s, i) => {
      const p = plain.slots[i], c = s.caption;
      check(c && s.x === p.x && s.y === p.y && s.w === p.w && c.x === p.x && c.w === p.w && c.y === s.y + s.h && s.h + c.h === p.h && c.h > 0 && s.h > c.h, `${t.id} slot ${i} caption band ${JSON.stringify(c)} vs photo ${[s.x, s.y, s.w, s.h]}`);
    });
  }
}

// ---------- Shaped templates (Task 5) ----------
{
  const { paddedAspect, stickerPad } = await import(`${repo}/js/collage/layout.js`);
  const { clipConvex, polygonBounds, polygonCentroid } = await import(`${repo}/js/collage/shapes.js`);
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  check(near(Math.abs(polygonArea(clipConvex([0, 0, 10, 0, 10, 10, 0, 10], [5, 5, 15, 5, 15, 15, 5, 15]))), 25, 1e-9), 'clipConvex square ∩ square');
  check(polygonCentroid([0, 0, 4, 0, 4, 2, 0, 2]).join() === '2,1', 'polygonCentroid');
  const sheets = [null, { outline: { width: .02 }, shadow: false }, { outline: { width: .015 }, shadow: true }];
  for (const t of templates.filter(t => t.kind === 'shaped')) {
    for (const sheet of sheets) {
      const aspect = t.lockAspect ? paddedAspect(t.aspect[0] / t.aspect[1], stickerPad(sheet)) : { w: t.aspect[0], h: t.aspect[1] };
      const sizes = [Object.values(sheetSize([aspect.w, aspect.h], 1080)), Object.values(sheetSize([aspect.w, aspect.h], 2999))];
      if (!t.lockAspect) sizes.push([1001, 1333]);
      for (const [width, height] of sizes) {
        for (const spacing of [{ gutter: 0, margin: 0 }, { gutter: .02, margin: .04 }, { gutter: .04, margin: .1 }]) {
          const name = `${t.id} ${width}×${height} ${JSON.stringify({ ...spacing, sheet })}`, layout = layoutTemplate(t, width, height, { ...spacing, sheet });
          check(layout.slots.length === slotCount(t), `${name} slot count`);
          // The shape fills the canvas less the sticker pad (no wasted transparent pixels), when it keeps its proportions.
          if (t.lockAspect && !spacing.margin) {
            const b = polygonBounds(layout.sheetPolygon), pad = layout.pad;
            check(near(b.x, pad, 1.01) && near(b.y, pad, 1.01) && near(b.x + b.w, width - pad, 1.01) && near(b.y + b.h, height - pad, 1.01), `${name} shape ${JSON.stringify(b)} doesn't fill the canvas less pad ${pad}`);
          }
          let total = 0;
          for (const s of layout.slots) {
            check([s.x, s.y, s.w, s.h].every(Number.isInteger) && s.x >= 0 && s.y >= 0 && s.x + s.w <= width && s.y + s.h <= height && s.w >= 1 && s.h >= 1, `${name} slot ${s.index} box ${[s.x, s.y, s.w, s.h]}`);
            const v = polygonBounds(s.visible);
            check(v.x >= s.x && v.y >= s.y && v.x + v.w <= s.x + s.w && v.y + v.h <= s.y + s.h, `${name} slot ${s.index} box doesn't hold its visible part`);
            // No slivers: every slot keeps ≥ 15 % of its own area inside the shape (at the default and wider spacing).
            if (spacing.gutter <= .02) check(s.area >= .15 * s.slotArea, `${name} slot ${s.index} keeps ${(100 * s.area / s.slotArea).toFixed(1)} % inside the shape`);
            total += s.area;
          }
          layout.slots.forEach((a, i) => layout.slots.slice(i + 1).forEach(b => {
            const shared = Math.abs(polygonArea(clipConvex(a.visible, b.outline)));
            check(shared < 1, `${name} slots ${a.index}/${b.index} overlap by ${shared.toFixed(1)} px²`);
          }));
          // Coverage: with no gutter, grid and radial fills cover the whole shape (less its hole).
          if (!spacing.gutter && t.fill.kind !== 'free') {
            const shape = Math.abs(polygonArea(layout.sheetPolygon)) - (layout.holePolygon ? Math.abs(polygonArea(layout.holePolygon)) : 0);
            check(near(total / shape, 1, .002), `${name} slots cover ${(100 * total / shape).toFixed(2)} % of the shape`);
          }
        }
      }
    }
  }
  golden('padded aspect', [paddedAspect(1, .05), paddedAspect(2, .1), paddedAspect(.5, .1)].map(Object.values), [[1, 1], [1.8, 1], [1, 1.8]]);
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

// ---------- Saved collage documents (Task 10) ----------
{
  const { createCollageStore, sanitizeCollageDoc } = await import(`${repo}/js/collage/store.js`);
  const { createDoc } = await import(`${repo}/js/collage/model.js`);
  const doc = createDoc([1, 2], byId('grid-2-side'), '#ffffff');
  let time = 100;
  const store = createCollageStore({ photoExists: id => id === 1, now: () => ++time });
  const saved = store.save(doc);
  check(saved.name === 'Collage 1' && saved.doc.slots[0].photoId === 1 && saved.doc.slots[1].photoId === null, 'saved collage empties missing photos');
  saved.doc.gutter = .09;
  check(store.get(saved.id).doc.gutter !== .09, 'saved collage reads are copies');
  doc.margin = .08; store.save(doc, { id: saved.id });
  check(store.list().length === 1 && store.get(saved.id).doc.margin === .08, 'saved collage updates in place');
  check(store.restore([{ ...saved, doc }, { id: 'bad', name: 'Bad', doc: {} }]).length === 1, 'restore skips invalid collage records');
  check(store.remove(saved.id) && !store.remove(saved.id) && store.list().length === 0, 'saved collage deletion');
  check(sanitizeCollageDoc({}) === null, 'invalid collage document rejected');
}

console.log(`${errors ? 'FAIL' : 'OK'}: ${checks} checks, ${errors} errors (${templates.length} templates, ${SHAPE_KINDS.length} shapes)`);
process.exit(errors ? 1 : 0);
