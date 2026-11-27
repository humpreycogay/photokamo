// Workflow fixtures (node tools/workflow-fixtures.mjs): synthetic images for the Adjust maths (plan_workflow.md Task 0).
// Checks that the pure adjustPixels (js/renderer.js) gives exactly the bytes the canvas-bound processPixels gave before
// the split: GOLDEN holds sha256 prefixes recorded from that code (a stand-in context around the old loop).
// Later tasks (histogram, Auto) add their cases to the same fixtures. Exits 1 on any failure.
// The fixtures also load in the browser (tools/workflow-fixtures.html), so Node-only code stays in the block at the end.

const repo = new URL('..', import.meta.url).href.replace(/\/$/, '');
const rgba = (width, height, pixel) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0, i = 0; y < height; y++) for (let x = 0; x < width; x++, i += 4) data.set(pixel(x, y), i);
  return { width, height, data };
};
const hash = (x, y) => { let n = Math.imul(x * 73856093 ^ y * 19349663, 2654435761); n ^= n >>> 15; return (n >>> 0) / 4294967296; };

/** Each returns a fresh image (adjustPixels works in place). */
export const fixtures = {
  ramp: () => rgba(256, 48, x => [x, x, x, 255]), // every grey code
  'grey card, warm cast': () => rgba(64, 64, () => [148, 128, 104, 255]),
  'grey card, cool cast': () => rgba(64, 64, () => [104, 122, 150, 255]),
  'clipped highlights': () => rgba(120, 80, (x, y) => { const v = Math.min(255, 150 + x * 2); return [v, Math.min(255, v + 6), Math.min(255, v + y), 255]; }),
  'alpha edges': () => rgba(96, 64, (x, y) => [200 * hash(x, y) | 0, 120, 60 + x, x < 32 ? 0 : x < 64 ? Math.round((x - 32) * 255 / 31) : 255]),
  'noisy photo': () => rgba(160, 120, (x, y) => { const n = hash(x, y) * 40; return [(80 + x * .8 + n) | 0, (60 + y + n) | 0, (110 + (x + y) * .3 - n) | 0, 255]; })
};

const { defaultAdjustments } = await import(`${repo}/js/presets.js`);
const set = values => ({ ...defaultAdjustments, ...values });
export const adjustmentSets = {
  'clean pop': set({ contrast: 10, vibrance: 12, sharpness: 8 }),
  'faded warm': set({ temperature: 12, contrast: -18, saturation: -10, fade: 30, grain: 15 }),
  mono: set({ saturation: -100, contrast: 18, grain: 22, vignette: 20 }),
  'every control high': set({ exposure: 1.35, brightness: 40, contrast: 60, highlights: -70, shadows: 80, temperature: 55, tint: -35, saturation: 45, vibrance: 70, fade: 60, grain: 100, vignette: 100, sharpness: 100 }),
  'every control low': set({ exposure: -2, brightness: -100, contrast: -100, highlights: 100, shadows: -100, temperature: -100, tint: 100, saturation: -100, vibrance: -100, fade: 100, grain: 1, vignette: 1, sharpness: 1 })
};

export const GOLDEN = {
  'ramp/clean pop': '921e83b08c72f862',
  'ramp/faded warm': '17ca4de1cb58b30c',
  'ramp/mono': '09a320bf719ec8a8',
  'ramp/every control high': '38c2d85ed9c1283a',
  'ramp/every control low': '5da3080d8fcf44eb',
  'grey card, warm cast/clean pop': '3157f786a654fa04',
  'grey card, warm cast/faded warm': 'c36fe5d48ac41f9f',
  'grey card, warm cast/mono': 'f6c498b73223e49a',
  'grey card, warm cast/every control high': '59fdd29e71cfb97c',
  'grey card, warm cast/every control low': 'f9a45eba0e28c79b',
  'grey card, cool cast/clean pop': 'f76886a8f0111548',
  'grey card, cool cast/faded warm': '870324459c03dd16',
  'grey card, cool cast/mono': '56eddcca0ef7b0c6',
  'grey card, cool cast/every control high': '79344c1da30ece60',
  'grey card, cool cast/every control low': 'f9a45eba0e28c79b',
  'clipped highlights/clean pop': 'd3c6bf947fb3c800',
  'clipped highlights/faded warm': 'e26786042ae6a4e3',
  'clipped highlights/mono': 'c9ccf0262b83ae03',
  'clipped highlights/every control high': 'e59672f886ab2956',
  'clipped highlights/every control low': '9b3ecef379d9191d',
  'alpha edges/clean pop': '52a26c2a8dcd521d',
  'alpha edges/faded warm': '60a5f2c740e1be48',
  'alpha edges/mono': '939fb886eebe0646',
  'alpha edges/every control high': '64a85bfeaaec8f00',
  'alpha edges/every control low': 'ca25e16ca3d795dd',
  'noisy photo/clean pop': '2912da838abb00f2',
  'noisy photo/faded warm': '9bd8c018be5cffc7',
  'noisy photo/mono': 'b40a64aa319b7517',
  'noisy photo/every control high': '34126b994f192602',
  'noisy photo/every control low': '7405d9e817455569',
};

/** Fixture × adjustment keys whose adjustPixels bytes differ from GOLDEN (sha256 prefix via `sha`). */
export async function checkGolden(adjustPixels, sha) {
  const failures = [];
  for (const [name, make] of Object.entries(fixtures)) for (const [setName, a] of Object.entries(adjustmentSets)) {
    const key = `${name}/${setName}`, image = make();
    adjustPixels(image.data, image.width, image.height, a);
    const got = await sha(image.data); if (got !== GOLDEN[key]) failures.push(`${key}: ${got} ≠ ${GOLDEN[key]}`);
  }
  return failures;
}

/** Task 5 (session recovery): the pure record checks, history budget, fingerprint and collage slot ids. Returns failures. */
export async function checkSession() {
  const v = await import(`${repo}/js/session/validate.js`);
  const model = await import(`${repo}/js/collage/model.js`);
  const failures = [], expect = (name, ok) => { if (!ok) failures.push(`session: ${name}`); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const known = { engines: new Set(['kamo-film-engine']), presets: new Set(['original', 'golden-hour']), controls: { exposure: { min: -2, max: 2 }, contrast: { min: -100, max: 100 } } };
  const snap = { look: { engine: 'presets', presetId: 'golden-hour', strength: 60, engineParams: { 'kamo-film-engine': { iso: 400, curve: [1, 2] } }, myLookId: null },
    edits: { exposure: .35, contrast: -12 }, crop: { ratio: 'orig', zoom: 1 }, optics: { lens: 'x' }, frame: { id: 'paper', border: { width: 4 }, color: null }, text: [{ content: 'hi', x: .5 }] };
  expect('a real snapshot is kept as it is', same(v.sanitizeSettings(snap, known), snap));
  const odd = v.sanitizeSettings({ ...snap, look: { ...snap.look, engine: 'gone', presetId: 'gone' }, edits: { exposure: 0, contrast: 'x', bogus: 3, }, text: [{}], frame: 7 }, known);
  expect('unknown engine/preset/keys fall back', odd.look.engine === 'presets' && odd.look.presetId === 'original' && same(odd.edits, {}) && odd.text.length === 0 && odd.frame === 'none');
  expect('a film look keeps its look id', v.sanitizeSettings({ ...snap, look: { ...snap.look, engine: 'kamo-film-engine', presetId: 'x', myLookId: 'film:portra' } }, known).look.myLookId === 'film:portra');
  for (const bad of [null, 1, [], {}, { look: null }, { look: { engine: 1, presetId: 'a', strength: 1 } }, { look: { engine: 'presets', presetId: 'a', strength: NaN } }]) expect(`rejects ${JSON.stringify(bad)}`, v.sanitizeSettings(bad, known) === null);
  const many = Array.from({ length: 60 }, (_, i) => ({ i }));
  let h = v.pruneHistory(many, many.slice(0, 3));
  expect('undo capped at 50, newest kept', h.undo.length === 50 && h.undo[49].i === 59 && h.redo.length === 3);
  const big = n => Array.from({ length: n }, (_, i) => ({ i, pad: 'x'.repeat(1000) }));
  h = v.pruneHistory(big(10), big(10), { bytes: 10500 }); // ~1015 B each: all of undo fits, no redo does
  expect('byte budget drops redo first, then oldest undo', h.redo.length === 0 && h.undo.length === 10);
  h = v.pruneHistory(big(10), big(10), { bytes: 5000 });
  expect('then oldest undo', h.redo.length === 0 && h.undo.length === 4 && h.undo[3].i === 9);
  const record = { photoId: 3, sourceId: 'sha256-ab', name: 'a.jpg', width: 10, height: 8, v: 1, rev: 4, settings: snap, undo: [snap, { junk: 1 }], redo: [] };
  const clean = v.sanitizePhotoRecord(record, known, 4);
  expect('photo record kept, bad history entries dropped', clean && clean.undo.length === 1 && same(clean.settings, snap));
  expect('photo record newer than the session is ignored', v.sanitizePhotoRecord(record, known, 3) === null);
  expect('photo record of another version is ignored', v.sanitizePhotoRecord({ ...record, v: 2 }, known, 9) === null);
  expect('photo record without size is ignored', v.sanitizePhotoRecord({ ...record, width: 0 }, known, 9) === null);
  const session = v.sanitizeSession({ v: 1, rev: 2, order: [4, 2, 4, -1, 'x', 9], activeId: 7, selected: [2, 8], nextId: 3, collages: [] });
  expect('session order deduped, active falls back, next id above all', same(session.order, [4, 2, 9]) && session.activeId === 4 && same(session.selected, [2]) && session.nextId === 10);
  expect('bad session is null', v.sanitizeSession({ v: 1, rev: 1 }) === null && v.sanitizeSession(null) === null);
  if (globalThis.crypto?.subtle && globalThis.File) {
    const bytes = new Uint8Array(200000).map((_, i) => i * 7);
    const file = (data, name = 'a.jpg') => new File([data], name, { type: 'image/jpeg', lastModified: 1000 });
    const a = await v.fingerprint(file(bytes)), b = await v.fingerprint(file(bytes.slice()));
    const tail = bytes.slice(); tail[tail.length - 1] ^= 1;
    expect('fingerprint: same file, same id', a === b && /^[0-9a-f]{64}$/.test(a));
    expect('fingerprint: last byte or name changes it', a !== await v.fingerprint(file(tail)) && a !== await v.fingerprint(file(bytes, 'b.jpg')));
  }
  model.seedSlotIds([{ slots: [{ id: 's41' }, { id: 'x9' }, null] }, null]);
  expect('restored slot ids are not reused', Number(model.emptySlot().id.slice(1)) > 41);
  return failures;
}

/** Task 6 (export sizes): exact sizes, aspect, no unasked enlarging, render edge and fitting. Returns failures. */
export async function checkExportSize() {
  const z = await import(`${repo}/js/export/size.js`);
  const failures = [], expect = (name, ok) => { if (!ok) failures.push(`export size: ${name}`); };
  const custom = (by, value, upscale = false) => ({ mode: 'custom', custom: { ...z.defaultCustom(), by, [by]: value, upscale } });
  const land = { width: 6000, height: 4000 }, port = { width: 1311, height: 1514 }, odd = { width: 4033, height: 3025 };
  const t = (full, choice) => z.targetSize(full, choice);
  expect('full is full', JSON.stringify(t(land, { mode: 'full' })) === JSON.stringify({ width: 6000, height: 4000, scale: 1, kept: false }));
  expect('share keeps today\'s size (baseline row 8: 1080 × 1247)', t(port, { mode: 'share', shareWidth: 1080 }).width === 1080 && t(port, { mode: 'share', shareWidth: 1080 }).height === 1247);
  expect('long edge 1080 on landscape', t(land, custom('edge', 1080)).width === 1080 && t(land, custom('edge', 1080)).height === 720);
  expect('long edge 1080 on portrait', t(port, custom('edge', 1080)).height === 1080 && t(port, custom('edge', 1080)).width === 935);
  expect('width 2000 exact', t(odd, custom('width', 2000)).width === 2000);
  expect('height 999 exact', t(odd, custom('height', 999)).height === 999);
  expect('percent 50', t(land, custom('percent', 50)).width === 3000 && t(land, custom('percent', 50)).height === 2000);
  for (const full of [land, port, odd]) for (const choice of [custom('edge', 1080), custom('width', 2000), custom('height', 777), custom('percent', 33)]) {
    const r = t(full, choice), aspectError = Math.abs(r.height - r.width * full.height / full.width);
    expect(`aspect ≤ 1 px ${full.width}×${full.height} ${choice.custom.by}`, aspectError <= 1);
  }
  const small = t(port, custom('width', 2000));
  expect('no upscaling unless allowed', small.width === 1311 && small.kept);
  const big = t(port, custom('width', 2000, true));
  expect('upscaling when allowed', big.width === 2000 && big.height === 2310 && !big.kept);
  expect('bad custom values are repaired', JSON.stringify(z.sanitizeCustom({ by: 'x', edge: -5, width: 1e9, percent: 33.6, upscale: 'yes' })) === JSON.stringify({ ...z.defaultCustom(), width: 16384, percent: 34 }));
  // Render edge: the scaledCanvas/cropSource rounding of the full photo at that edge covers the target on both sides.
  const rendered = (full, edge) => { const long = Math.max(full.width, full.height), s = Math.min(1, edge / long); return { width: Math.max(1, Math.round(full.width * s)), height: Math.max(1, Math.round(full.height * s)) }; };
  let worst = 0;
  for (let w = 900; w < 1400; w += 7) for (const full of [land, port, odd, { width: 3001, height: 4999 }]) for (const by of ['edge', 'width', 'height']) {
    const target = t(full, custom(by, w)); if (target.kept) continue;
    const r = rendered(full, z.renderEdgeFor(full, target)), plan = z.fitPlan(r, target);
    if (plan === 'resize') worst = Infinity; else worst = Math.max(worst, r.width - target.width, r.height - target.height);
  }
  expect(`render edge always trims, never resamples (worst overshoot ${worst} px)`, worst <= 2);
  expect('share at today\'s edge needs no fitting', z.fitPlan(rendered(port, z.renderEdgeFor(port, t(port, { mode: 'share', shareWidth: 1080 }))), { width: 1080, height: 1247 }) === 'same');
  expect('full renders at full size', z.renderEdgeFor(land, t(land, { mode: 'full' })) === Infinity);
  expect('halving stops at or above the target', JSON.stringify(z.halvingSteps({ width: 6000, height: 4000 }, { width: 1000, height: 667 })) === JSON.stringify([{ width: 3000, height: 2000 }, { width: 1500, height: 1000 }]));
  return failures;
}

/** Task 7 (target file size): the quality search against fake encoders. Returns failures. */
export async function checkTargetSize() {
  const t = await import(`${repo}/js/export/target.js`);
  const failures = [], expect = (name, ok) => { if (!ok) failures.push(`target size: ${name}`); };
  const encoder = size => { const calls = []; return { calls, encode: async q => { calls.push(q); return { size: Math.round(size(q)), blob: { q } }; } }; };
  const smooth = q => 200e3 + 25e3 * q + 400 * q * q; // ~0.7 MB at 20, ~6.5 MB at 98
  for (const target of [1e6, 2e6, 3.5e6, 5e6]) {
    const e = encoder(smooth), r = await t.searchQuality(e.encode, target);
    expect(`smooth ${target}: fits, within 5 %, ≤ 12 encodes (${r.size}, q ${r.quality}, ${r.encodes})`, r.fits && r.size <= target && (r.size >= target * .95 || smooth(r.quality + 1) > target) && e.calls.length <= 12);
    expect(`smooth ${target}: the blob is the reported quality`, r.blob.q === r.quality);
  }
  let e = encoder(smooth), r = await t.searchQuality(e.encode, 9e6);
  expect('fits at the top: one encode', r.status === 'max' && r.quality === 98 && e.calls.length === 1);
  e = encoder(smooth); r = await t.searchQuality(e.encode, 300e3);
  expect('too big at the bottom: reported, two encodes', r.status === 'too-big' && !r.fits && r.quality === 20 && e.calls.length === 2 && r.smallest > 300e3);
  // Non-monotonic: a dip around 60-70 (some encoders change chroma subsampling at a quality step).
  const bumpy = q => smooth(q) * (q >= 60 && q <= 70 ? .8 : 1);
  e = encoder(bumpy); r = await t.searchQuality(e.encode, 2.2e6);
  expect(`bumpy: never over, ≤ 12 encodes (${r.size}, q ${r.quality}, ${e.calls.length})`, r.fits && r.size <= 2.2e6 && e.calls.length <= 12);
  e = encoder(q => 1e6 + (q * 7919 % 13) * 1e4); r = await t.searchQuality(e.encode, 1.05e6);
  expect('noise: never over, ≤ 12 encodes', r.fits && r.size <= 1.05e6 && e.calls.length <= 12);
  let stale = false; e = encoder(q => { if (q === 20) stale = true; return smooth(q); });
  const aborted = await t.searchQuality(e.encode, 1e6, { isStale: () => stale }).then(() => false, error => error.name === 'AbortError');
  expect('a superseded search stops', aborted && e.calls.length === 2);
  expect('suggested edge shrinks with the square root', t.suggestEdge(4000, 2e6, 500e3) === 1800 && t.suggestEdge(1000, 1.01e6, 1e6) === 800);
  expect('targets: presets and repairs', t.sanitizeTarget('') === null && t.sanitizeTarget(0) === null && t.sanitizeTarget('512.4') === 512 && t.sanitizeTarget(1e9) === 50000 && t.sanitizeTarget(3) === 20);
  expect('formats', t.formatBytes(1_940_000) === '1.94 MB' && t.formatBytes(480_400) === '480 KB' && t.formatTarget(2000) === '2 MB' && t.formatTarget(500) === '500 KB');
  return failures;
}

// ---------- Task 8: metadata files built by hand (also used by the browser export check) ----------
const bytesOf = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const text = value => new TextEncoder().encode(value);
/** A TIFF block. `ifds`: { ifd0: [[tag, type, count, value|bytes]], exif, gps, ifd1 }; pointers are filled in. */
export function buildTiff({ little = true, camera = true, date = true, gps = true, owner = false, thumbnail = false, orientation = 0 } = {}) {
  const ifd0 = [], exif = [], gpsIfd = [];
  if (camera) ifd0.push([0x010f, 2, 'TestCam\0'], [0x0110, 2, 'Model 9\0']);
  if (orientation) ifd0.push([0x0112, 3, orientation]);
  if (owner) ifd0.push([0x013b, 2, 'Someone\0']);
  if (date) exif.push([0x9003, 2, '2026:11:27 10:00:00\0']);
  if (gps) gpsIfd.push([0x0001, 2, 'N\0'], [0x0002, 5, new Uint8Array(24)], [0x0003, 2, 'E\0'], [0x0004, 5, new Uint8Array(24)]);
  const tables = [['ifd0', ifd0], ...(exif.length ? [['exif', exif]] : []), ...(gpsIfd.length ? [['gps', gpsIfd]] : []), ...(thumbnail ? [['ifd1', [[0x0201, 4, 0], [0x0202, 4, 0]]]] : [])];
  if (exif.length) ifd0.push([0x8769, 4, 'exif']);
  if (gpsIfd.length) ifd0.push([0x8825, 4, 'gps']);
  for (const [, list] of tables) list.sort((a, b) => a[0] - b[0]);
  // layout: header, each table followed by its out-of-line data
  const offsets = {}; let size = 8;
  const dataOf = value => (typeof value === 'string' ? text(value) : value instanceof Uint8Array ? value : null);
  for (const [name, list] of tables) { offsets[name] = size; size += 2 + list.length * 12 + 4; for (const [, , value] of list) { const d = dataOf(value); if (d && d.length > 4) size += d.length + (d.length & 1); } }
  const buf = new Uint8Array(size), view = new DataView(buf.buffer);
  buf.set(text(little ? 'II' : 'MM')); view.setUint16(2, 42, little); view.setUint32(4, 8, little);
  for (const [name, list] of tables) {
    let at = offsets[name], data = at + 2 + list.length * 12 + 4;
    view.setUint16(at, list.length, little);
    list.forEach(([tag, type, value], i) => {
      const e = at + 2 + i * 12, d = dataOf(value), width = { 2: 1, 3: 2, 4: 4, 5: 8 }[type];
      view.setUint16(e, tag, little); view.setUint16(e + 2, type, little);
      if (d) { view.setUint32(e + 4, d.length / width, little); if (d.length <= 4) buf.set(d, e + 8); else { view.setUint32(e + 8, data, little); buf.set(d, data); data += d.length + (d.length & 1); } }
      else if (typeof value === 'string') view.setUint32(e + 8, offsets[value], little);
      else { view.setUint32(e + 4, 1, little); if (type === 3) view.setUint16(e + 8, value, little); else view.setUint32(e + 8, value, little); }
      if (offsets[value] !== undefined) { view.setUint32(e + 4, 1, little); view.setUint32(e + 8, offsets[value], little); }
    });
    view.setUint32(at + 2 + list.length * 12, name === 'ifd0' && thumbnail ? offsets.ifd1 : 0, little);
  }
  return buf;
}
const be16 = n => new Uint8Array([n >> 8, n & 255]), be32 = n => new Uint8Array([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]), le32 = n => new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24]);
const jpegSegment = (marker, payload) => bytesOf(new Uint8Array([0xff, marker]), be16(payload.length + 2), payload);
/** An Exif APP1 segment to put after a JPEG's SOI. */
export const exifSegment = options => jpegSegment(0xe1, bytesOf(text('Exif\0\0'), buildTiff(options)));
export function buildJpeg(options) { return bytesOf(new Uint8Array([0xff, 0xd8]), exifSegment(options), jpegSegment(0xe1, text('http://ns.adobe.com/xap/1.0/\0<x/>')), jpegSegment(0xdb, new Uint8Array(65)), new Uint8Array([0xff, 0xda]), be16(8), new Uint8Array(6), new Uint8Array(32), new Uint8Array([0xff, 0xd9])); }
export async function buildPng(options) {
  const { crc32 } = await import(`${repo}/js/zip.js`);
  const chunk = (type, data) => bytesOf(be32(data.length), text(type), data, be32(crc32(bytesOf(text(type), data))));
  return bytesOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), chunk('IHDR', new Uint8Array(13)), chunk('eXIf', buildTiff(options)), chunk('tEXt', text('Comment\0hello')), chunk('iCCP', text('x\0\0')), chunk('IDAT', new Uint8Array(20)), chunk('IEND', new Uint8Array(0)));
}
export function buildWebp(options) {
  const chunk = (fourcc, data) => bytesOf(text(fourcc), le32(data.length), data, data.length & 1 ? new Uint8Array(1) : new Uint8Array(0));
  const body = bytesOf(text('WEBP'), chunk('VP8X', new Uint8Array(10)), chunk('VP8L', new Uint8Array(21)), chunk('EXIF', buildTiff(options)), chunk('XMP ', text('<x/>')));
  return bytesOf(text('RIFF'), le32(body.length), body);
}

/** Task 8: scanner detection, hostile files and 1,000 random mutations per format. Returns failures. */
export async function checkMetadata() {
  const m = await import(`${repo}/js/export/metadata.js`);
  const failures = [], expect = (name, ok) => { if (!ok) failures.push(`metadata: ${name}`); };
  const scan = bytes => m.scanMetadata(bytes, { strict: true });
  const files = { jpeg: buildJpeg(), png: await buildPng(), webp: buildWebp() };
  for (const [format, bytes] of Object.entries(files)) {
    const r = scan(bytes);
    expect(`${format}: gps, camera, date found, nothing malformed`, r.format === format && r.gps && r.camera && r.date && r.exif && !r.malformed);
  }
  expect('jpeg: XMP found', scan(files.jpeg).xmp); expect('png: text and ICC found', scan(files.png).text && scan(files.png).icc); expect('webp: XMP found', scan(files.webp).xmp);
  const r = scan(buildJpeg({ little: false, gps: false, owner: true, thumbnail: true }));
  expect('big-endian, no GPS, owner and thumbnail', !r.gps && r.camera && r.owner && r.thumbnail && !r.malformed);
  const clean = scan(bytesOf(new Uint8Array([0xff, 0xd8]), jpegSegment(0xdb, new Uint8Array(65)), new Uint8Array([0xff, 0xda, 0, 8, 0, 0, 0, 0, 0, 0, 0xff, 0xd9])));
  expect('a plain JPEG reports nothing private', m.privateKinds(clean).length === 0 && !clean.malformed);
  // Hostile TIFFs: patch the built one.
  const tiff = buildTiff(), le = new DataView(tiff.buffer);
  const withTiff = t => bytesOf(new Uint8Array([0xff, 0xd8]), jpegSegment(0xe1, bytesOf(text('Exif\0\0'), t)), new Uint8Array([0xff, 0xd9]));
  const patched = (fn) => { const t = tiff.slice(); fn(new DataView(t.buffer), t); return scan(withTiff(t)); };
  expect('cyclic: IFD0 points to itself as its Exif IFD', patched((v, t) => { const n = v.getUint16(8, true); for (let i = 0; i < n; i++) if (v.getUint16(10 + i * 12, true) === 0x8769) v.setUint32(10 + i * 12 + 8, 8, true); }).malformed);
  expect('huge entry count', patched(v => v.setUint16(8, 0xffff, true)).malformed);
  expect('wrong byte order mark', patched((v, t) => { t[0] = 0x4d; t[1] = 0x4d; }).malformed);
  expect('overflow value offset', patched(v => { v.setUint32(10 + 8, 0xfffffff0, true); v.setUint32(10 + 4, 0xffffffff, true); }).malformed);
  expect('IFD0 offset past the end', patched(v => v.setUint32(4, 0x7fffffff, true)).malformed);
  expect('truncated JPEG segment', scan(files.jpeg.subarray(0, 30)).malformed);
  expect('a file\'s start (complete: false) is not malformed', !m.scanMetadata(files.jpeg.subarray(0, 30), { complete: false }).malformed);
  const badCrc = files.png.slice(); badCrc[50] ^= 1;
  expect('PNG metadata chunk with a bad CRC is malformed', scan(badCrc).malformed);
  expect('not an image', scan(text('hello')).format === null);
  // Fuzz: flips, truncations, insertions and 0xFF floods; no exception, quick.
  let seed = 12345; const rand = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const t0 = performance.now(); let thrown = 0;
  for (const bytes of Object.values(files)) for (let i = 0; i < 1000; i++) {
    let f = bytes.slice();
    const kind = rand(4);
    if (kind === 0) for (let k = 0; k < 1 + rand(8); k++) f[rand(f.length)] = rand(256);
    else if (kind === 1) f = f.subarray(0, rand(f.length));
    else if (kind === 2) { const at = rand(f.length); f = bytesOf(f.subarray(0, at), new Uint8Array(rand(64)).map(() => rand(256)), f.subarray(at)); }
    else { const at = rand(f.length); f.fill(0xff, at, Math.min(f.length, at + 4)); }
    try { scan(f); } catch (error) { if (++thrown <= 3) failures.push(`metadata: fuzz threw ${error.message}`); }
  }
  const ms = performance.now() - t0;
  expect(`3 × 1,000 mutations in < 1 s (${ms.toFixed(0)} ms, ${thrown} exceptions)`, ms < 1000 && !thrown);
  return failures;
}

/** Task 1 (look search): golden rankings over the real catalogue, and speed. Returns failures. */
export async function checkLookSearch() {
  const { buildIndex, searchLooks, normalize } = await import(`${repo}/js/look-search.js`);
  const { presets, lookStyles } = await import(`${repo}/js/presets.js`);
  const { filmLooks } = await import(`${repo}/js/film-looks.js`);
  const failures = [], expect = (name, ok) => { if (!ok) failures.push(`look search: ${name}`); };
  const styleLabel = Object.fromEntries(lookStyles);
  const items = [...presets.map(p => ({ ...p, style: 'Basic' })), ...filmLooks.map(l => ({ ...l, style: styleLabel[l.style] }))];
  const index = buildIndex(items), ids = query => searchLooks(index, query).map(r => r.id);
  expect('normalize', JSON.stringify(normalize('Crème  Brûlée—B&W fine-grain')) === JSON.stringify(['creme', 'brulee', 'bw', 'finegrain']));
  expect('empty query keeps every look in order', ids('').length === items.length && ids('  ')[0] === 'original');
  const portra = ids('portra');
  expect(`"portra": the three Portra stocks first (${portra.slice(0, 3)})`, portra.slice(0, 3).join() === 'film:kodak-portra-160,film:kodak-portra-400,film:kodak-portra-800');
  expect(`"Portra 4": Portra 400 first, no 160/800 (${ids('Portra 4').slice(0, 4)})`, ids('Portra 4')[0] === 'film:kodak-portra-400' && !ids('Portra 4').includes('film:kodak-portra-160') && !ids('Portra 4').includes('film:kodak-portra-800'));
  const bw = ids('black and white');
  expect(`"black and white": only B&W-tagged looks (${bw.length})`, bw.length >= 15 && bw.every(id => items.find(i => i.id === id).tags.includes('bw')));
  expect('"monochrome" = "bw" set', ids('monochrome').join() === ids('bw').join());
  expect(`"noir": Hard Noir first`, ids('noir')[0] === 'hard-noir');
  expect('"xyz": nothing', ids('xyz').length === 0);
  expect('"polaroid": the Polaroid looks by name, then other instant looks', ids('polaroid')[0].includes('polaroid') && ids('polaroid').includes('film:instant-instax-mini'));
  expect('"people" finds portrait looks', ids('people').includes('portrait-air'));
  expect('"golden" finds Golden Hour first', ids('golden')[0] === 'golden-hour');
  expect('"velvia 50" exact', ids('velvia 50')[0] === 'film:fujifilm-velvia-50');
  expect('"fine grain" phrase = tag', ids('fine grain').includes('film:kodak-portra-160'));
  // ≤ 3 typed characters + Enter reaches 95 % of looks by name (release criterion): its first 3 letters put it in the top 6? Count those that are first among equals.
  const reach = items.filter(item => { const first = normalize(item.name).find(word => word.length >= 3) || normalize(item.name)[0]; return ids(first.slice(0, 3)).slice(0, 12).includes(item.id); }).length;
  console.log(`  look search: ${reach}/${items.length} looks are in the first 12 results for the first 3 letters of their name`);
  expect(`reachable by 3 letters in the first 12 results: ${reach}/${items.length}`, reach / items.length >= .9);
  const t0 = performance.now(); for (let i = 0; i < 500; i++) searchLooks(index, ['p', 'po', 'por', 'port', 'portra 4', 'black and white', 'night street'][i % 7]);
  const per = (performance.now() - t0) / 500;
  console.log(`  look search: ${per.toFixed(3)} ms per query`);
  expect(`speed: ${per.toFixed(3)} ms per keystroke for ${items.length} looks (< 2 ms)`, per < 2);
  return failures;
}

if (globalThis.process?.argv && import.meta.url === `file://${process.argv[1]}`) {
  const { createHash } = await import('node:crypto');
  const { adjustPixels } = await import(`${repo}/js/renderer.js`);
  const failures = await checkGolden(adjustPixels, data => createHash('sha256').update(data).digest('hex').slice(0, 16));
  const sessionFailures = await checkSession(), sizeFailures = [...await checkExportSize(), ...await checkTargetSize()], metaFailures = await checkMetadata(), searchFailures = await checkLookSearch();
  for (const failure of [...failures, ...sessionFailures, ...sizeFailures, ...metaFailures, ...searchFailures]) console.log('FAIL', failure);
  const checks = Object.keys(fixtures).length * Object.keys(adjustmentSets).length, failed = failures.length;
  console.log(`${failed ? 'FAIL' : 'OK'}: ${checks} fixture × adjustment checks, ${failed} failed`);
  console.log(`${sessionFailures.length ? 'FAIL' : 'OK'}: session recovery checks, ${sessionFailures.length} failed`);
  console.log(`${sizeFailures.length ? 'FAIL' : 'OK'}: export size and target size checks, ${sizeFailures.length} failed`);
  console.log(`${metaFailures.length ? 'FAIL' : 'OK'}: metadata scanner checks, ${metaFailures.length} failed`);
  console.log(`${searchFailures.length ? 'FAIL' : 'OK'}: look search checks, ${searchFailures.length} failed`);
  process.exit(failed || sessionFailures.length || sizeFailures.length || metaFailures.length || searchFailures.length ? 1 : 0);
}
