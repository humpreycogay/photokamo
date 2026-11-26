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

let failed = 0;
for (const { name, fn } of cases) {
  try { await fn(repo); console.log('ok  ', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n    ', e.message); }
}
console.log(`${failed ? 'FAIL' : 'OK'}: ${cases.length} cases, ${failed} failed`);
process.exit(failed ? 1 : 0);
