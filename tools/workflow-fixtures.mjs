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

if (globalThis.process?.argv && import.meta.url === `file://${process.argv[1]}`) {
  const { createHash } = await import('node:crypto');
  const { adjustPixels } = await import(`${repo}/js/renderer.js`);
  const failures = await checkGolden(adjustPixels, data => createHash('sha256').update(data).digest('hex').slice(0, 16));
  for (const failure of failures) console.log('FAIL', failure);
  const checks = Object.keys(fixtures).length * Object.keys(adjustmentSets).length, failed = failures.length;
  console.log(`${failed ? 'FAIL' : 'OK'}: ${checks} fixture × adjustment checks, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
