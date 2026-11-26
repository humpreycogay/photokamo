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

let failed = 0;
for (const { name, fn } of cases) {
  try { await fn(repo); console.log('ok  ', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n    ', e.message); }
}
console.log(`${failed ? 'FAIL' : 'OK'}: ${cases.length} cases, ${failed} failed`);
process.exit(failed ? 1 : 0);
