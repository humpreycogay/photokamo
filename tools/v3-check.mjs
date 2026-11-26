// v3 stabilisation checks (node tools/v3-check.mjs): pure-logic cases added by each v3plan.md task.
// node:assert only, no dependencies. Exits 1 on any failure.
import assert from 'node:assert/strict';
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// ---------- Task 0 ----------
test('runner works', () => assert.equal(1 + 1, 2));

// ---------- Task 2: collage export key ----------
test('collage export key follows the visible photos\' edits', async repo => {
  const { collageExportKey } = await import(`${repo}/js/collage/export.js`);
  const { createDoc } = await import(`${repo}/js/collage/model.js`);
  const { templateById } = await import(`${repo}/js/collage/templates.js`);
  const t = templateById('grid-2-side'), doc = createDoc([1, 2, 3], t, '#ffffff'); // photo 3 is outside the 2 slots
  const settings = { 1: '{"look":"a"}', 2: '{"look":"b"}', 3: '{"look":"c"}' };
  const key = () => collageExportKey(doc, { width: 100, height: 50 }, 'image/jpeg', .92, id => settings[id] ?? null);
  const before = key();
  assert.equal(key(), before, 'same inputs, same key');
  settings[3] = '{"look":"changed"}'; assert.equal(key(), before, 'a photo outside the layout does not matter');
  settings[2] = '{"look":"changed"}'; assert.notEqual(key(), before, 'an edited photo in a slot changes the key');
});

// ---------- Task 3: engine file integrity ----------
test('verifyDigest accepts the right bytes and rejects wrong or truncated ones', async repo => {
  const { verifyDigest } = await import(`${repo}/js/engines/engine-files.js`);
  const { createHash } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');
  const manifest = JSON.parse(readFileSync(`${repo}/engines/kamo-film-engine/manifest.json`, 'utf8'));
  const [path, { sha256 }] = Object.entries(manifest.files).find(([file]) => file.endsWith('.json'));
  const bytes = new Uint8Array(readFileSync(`${repo}/engines/kamo-film-engine/${path}`));
  assert.equal(await verifyDigest(bytes, sha256), true, 'file matches its manifest entry');
  assert.equal(await verifyDigest(bytes, sha256.toUpperCase()), true, 'hex case does not matter');
  assert.equal(await verifyDigest(bytes.slice(0, -1), sha256), false, 'truncated');
  const wrong = bytes.slice(); wrong[0] ^= 1;
  assert.equal(await verifyDigest(wrong, sha256), false, 'one bit changed');
  assert.equal(await verifyDigest(new Uint8Array(0), createHash('sha256').update('').digest('hex')), true, 'empty input');
});

// ---------- Task 4: optics highlights ----------
const opticsImage = (width, height, value) => ({ width, height, data: new Uint8ClampedArray(width * height * 4).fill(value) });
test('optics: glow keeps clipped whites at 255, focus blur leaves no seam', async repo => {
  const { applyOptics } = await import(`${repo}/js/optics/pipeline.js`);
  const { defaultOptics } = await import(`${repo}/js/optics/params.js`);
  const cases = { 'diffusion 1': { diffusion: 1 }, 'bloom 50': { bloom: 50 }, 'radial focus + bokeh + bloom': { focusMode: 'radial', bloom: 40 } };
  for (const [name, values] of Object.entries(cases)) {
    const image = applyOptics(opticsImage(160, 120, 255), { ...defaultOptics(), ...values });
    let low = 255; for (let i = 0; i < image.data.length; i += 4) low = Math.min(low, image.data[i], image.data[i + 1], image.data[i + 2]);
    assert.equal(low, 255, `${name}: a white image stays 255 (darkest ${low})`);
  }
});
test('optics: encodeAdd is encode without added light, monotonic, exact below the knee', async repo => {
  const { encode, encodeAdd } = await import(`${repo}/js/optics/color.js`);
  for (let i = 0; i <= 1000; i++) assert.equal(encodeAdd(i / 1000, 0), encode(i / 1000), `base ${i / 1000}`);
  assert.equal(encodeAdd(1, .5), 255); assert.equal(encodeAdd(.3, .2), encode(.5)); assert.equal(encodeAdd(.8, -.1), encode(.7));
  for (const base of [0, .2, .5, .85, .95, .999]) {
    let last = -1;
    for (let k = 0; k <= 400; k++) { const code = encodeAdd(base, k / 100); assert.ok(code >= last, `monotonic at base ${base}, added ${k / 100}`); last = code; }
    assert.ok(encodeAdd(base, 4) >= 254, `a lot of added light reaches white from base ${base}`);
  }
  assert.ok(encodeAdd(.85, .1) < 255 && encodeAdd(.85, .1) > encode(.9), 'light past the knee keeps gradation');
});

// ---------- Task 5 (with plan_workflow.md Task 0): pure adjustPixels ----------
test('adjustPixels equals the old canvas-bound processPixels byte for byte', async repo => {
  const { checkGolden } = await import(`${repo}/tools/workflow-fixtures.mjs`);
  const { adjustPixels } = await import(`${repo}/js/renderer.js`);
  const { createHash } = await import('node:crypto');
  const failures = await checkGolden(adjustPixels, data => createHash('sha256').update(data).digest('hex').slice(0, 16));
  assert.deepEqual(failures, [], failures.join('; '));
});

// ---------- Task 6: device canvas cap ----------
test('capFramed keeps the framed export under the device limit and the photo aspect within 1 px', async repo => {
  const { capFramed, framedSize } = await import(`${repo}/js/renderer.js`);
  const frames = ['none', 'paper', { id: 'paper', width: 8, bottom: 12, paper: '#ffffff' }, 'gallery', 'instant', 'sprocket', 'film-leak', 'film-collage', 'fit-square', 'blur-portrait'];
  const sizes = [[7728, 5152], [5152, 7728], [8064, 6048], [12000, 3000], [4000, 4000], [1311, 1514], [6000, 4000]];
  for (const limit of [16.7e6, 12e6, 4e6]) for (const frame of frames) for (const [w, h] of sizes) {
    const cap = capFramed(w, h, frame, limit), f = framedSize(cap.width, cap.height, frame), label = `${w}×${h} ${JSON.stringify(frame)} ≤ ${limit / 1e6} MP`;
    assert.ok(f.width * f.height <= limit, `${label}: framed ${f.width}×${f.height} is over the limit`);
    assert.ok(cap.width <= w && cap.height <= h, `${label}: grew`);
    assert.ok(Math.abs(cap.width * h - cap.height * w) <= Math.max(w, h), `${label}: aspect ${cap.width}×${cap.height}`);
    const full = framedSize(w, h, frame);
    if (full.width * full.height <= limit) assert.deepEqual(cap, { width: w, height: h, capped: false }, `${label}: fits, so unchanged`);
    else assert.ok(cap.capped && f.width * f.height >= limit * .97, `${label}: shrank too far (${(f.width * f.height / 1e6).toFixed(2)} MP)`);
  }
});

// ---------- Task 7: full-quality render reuse ----------
test('full-render key ignores frame and text, follows look, edits, crop and optics', async repo => {
  const { fullRenderKeyOf } = await import(`${repo}/js/render-keys.js`);
  const { defaultOptics } = await import(`${repo}/js/optics/params.js`);
  const base = { imageId: 3, crop: { x: .5, y: .5, w: 1, h: 1 }, optics: defaultOptics(), engine: 'kamo-film-engine', params: { stock: 'portra-400', grain: 20 }, edits: { exposure: .3 },
    frame: { id: 'none' }, text: [] };
  const key = settings => fullRenderKeyOf({ ...base, ...settings });
  assert.equal(key({ frame: { id: 'instant' } }), key({}), 'frame change keeps the render');
  assert.equal(key({ text: [{ id: 't', content: 'Hi' }] }), key({}), 'text change keeps the render');
  for (const [name, change] of Object.entries({ look: { params: { stock: 'gold-200', grain: 20 } }, edits: { edits: { exposure: .35 } }, crop: { crop: { x: .4, y: .5, w: .8, h: .8 } },
    optics: { optics: { ...defaultOptics(), bloom: 20 } }, photo: { imageId: 4 }, engine: { engine: 'other' } }))
    assert.notEqual(key(change), key({}), `${name} change needs a new render`);
});

// ---------- Task 13: zip.js limits ----------
test('zip: over 65 535 files fails clearly', async repo => {
  const { createZip } = await import(`${repo}/js/zip.js`);
  const files = Array.from({ length: 65536 }, (_, i) => ({ name: `${i}.jpg`, blob: new Blob([]) }));
  await assert.rejects(createZip(files), /65[ ,.]?535/);
});
test('zip: over 4 GB fails clearly, headers included', async repo => {
  const { createZip } = await import(`${repo}/js/zip.js`);
  const big = size => ({ size, arrayBuffer: async () => new ArrayBuffer(0) }); // a size without the bytes
  await assert.rejects(createZip([{ name: 'a.jpg', blob: big(3e9) }, { name: 'b.jpg', blob: big(1.5e9) }]), /4 GB/);
  // the data alone fits (0xffffffff − 20 bytes), its 30-byte header and name do not
  await assert.rejects(createZip([{ name: 'a.jpg', blob: big(0xffffffff - 20) }]), /4 GB/);
});
test('zip: a UTF-8 file name round-trips', async repo => {
  const { createZip } = await import(`${repo}/js/zip.js`);
  const name = 'café-ü-写真.jpg', zip = new Uint8Array(await (await createZip([{ name, blob: new Blob([new Uint8Array([1, 2, 3])]) }])).arrayBuffer());
  const view = new DataView(zip.buffer), length = view.getUint16(26, true);
  assert.equal(view.getUint32(0, true), 0x04034b50); assert.equal(view.getUint16(6, true) & 0x0800, 0x0800, 'UTF-8 flag');
  assert.equal(new TextDecoder().decode(zip.subarray(30, 30 + length)), name);
});

// ---------- Task 8: grain parity between preview and export ----------
/** Standard deviation of one channel, after averaging `block` × `block` pixel blocks (a downscale by `block`). */
function blockStd(data, width, height, block) {
  let sum = 0, sumSq = 0, n = 0;
  for (let by = 0; by + block <= height; by += block) for (let bx = 0; bx + block <= width; bx += block) {
    let total = 0;
    for (let y = by; y < by + block; y++) for (let x = bx; x < bx + block; x++) total += data[(y * width + x) * 4];
    const v = total / (block * block); sum += v; sumSq += v * v; n++;
  }
  const mean = sum / n; return Math.sqrt(sumSq / n - mean * mean);
}
test('Basic grain: a 6000 px export downscaled to 1000 px looks like the 1000 px preview (RMS within 15 %)', async repo => {
  const { adjustPixels } = await import(`${repo}/js/renderer.js`);
  const { defaultAdjustments } = await import(`${repo}/js/presets.js`);
  const a = { ...defaultAdjustments, grain: 40 }, grey = size => { const d = new Uint8ClampedArray(size * size * 4).fill(128); return d; };
  const small = grey(1000); adjustPixels(small, 1000, 1000, a);
  const preview = blockStd(small, 1000, 1000, 1);
  for (const [size, block] of [[3000, 3], [6000, 6]]) {
    const big = grey(size); adjustPixels(big, size, size, a);
    const scaled = blockStd(big, size, size, block);
    assert.ok(Math.abs(scaled / preview - 1) < .15, `${size} px: grain RMS ${scaled.toFixed(2)} after ÷${block} vs ${preview.toFixed(2)} in the preview`);
  }
  const again = grey(3000); adjustPixels(again, 3000, 3000, a); const once = grey(3000); adjustPixels(once, 3000, 3000, a);
  assert.deepEqual(again.subarray(0, 4000), once.subarray(0, 4000), 'grain is deterministic');
});

let failed = 0;
for (const { name, fn } of cases) {
  try { await fn(repo); console.log('ok  ', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n    ', e.message); }
}
console.log(`${failed ? 'FAIL' : 'OK'}: ${cases.length} cases, ${failed} failed`);
process.exit(failed ? 1 : 0);
