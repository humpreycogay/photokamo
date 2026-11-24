// Compares PhotoKamo's DuXun port (js/engines/duxun/core.js) with the plugin's original C++ pixel
// code (ref.exe, built from DuXunFilmSim.cpp by make_harness.py) on a synthetic 1920×1080 image.
// Usage: node compare.mjs <repoRoot>
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.argv[2];
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const engine = await import(pathToFileURL(path.join(root, 'js/engines/duxun/index.js')).href);
const core = await import(pathToFileURL(path.join(root, 'js/engines/duxun/core.js')).href);

// Synthetic test image: hue/brightness ramps, skin-ish and saturated patches, bright light sources.
const W = 1920, H = 1080, rgba = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4, u = x / W, v = y / H;
  let r = 255 * (0.5 + 0.5 * Math.sin(u * 6.283 + 0)) * v, g = 255 * (0.5 + 0.5 * Math.sin(u * 6.283 + 2.09)) * v, b = 255 * (0.5 + 0.5 * Math.sin(u * 6.283 + 4.19)) * v;
  if (y > 700 && x < 600) { r = 224; g = 172; b = 140; }            // skin
  if (y > 700 && x >= 600 && x < 900) { r = 30; g = 160; b = 40; }  // foliage
  if (y > 700 && x >= 900 && x < 1200) { r = 70; g = 120; b = 210; } // sky
  if (y < 120) { const k = x / W * 255; r = g = b = k; }            // grey ramp
  const d = Math.hypot(x - 1500, y - 350), d2 = Math.hypot(x - 1200, y - 250);
  if (d < 60 || d2 < 25) { r = 255; g = 250; b = 235; }             // light sources
  rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
}
const inRaw = Buffer.alloc(8 + W * H * 16);
inRaw.writeInt32LE(W, 0); inRaw.writeInt32LE(H, 4);
for (let i = 0; i < W * H * 4; i++) inRaw.writeFloatLE(rgba[i] / 255, 8 + i * 4);
writeFileSync(path.join(here, 'in.raw'), inRaw);

const RENAME = { filmPreset: 'filmIdx' };
function runRef(p) {
  const lines = Object.entries(p).map(([k, v]) => `${RENAME[k] || k} ${typeof v === 'boolean' ? (v ? 1 : 0) : v}`);
  writeFileSync(path.join(here, 'params.txt'), lines.join('\n') + '\n');
  execFileSync(path.join(here, 'ref.exe'), ['in.raw', 'params.txt', 'out.raw'], { cwd: here });
  const buf = readFileSync(path.join(here, 'out.raw'));
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H * 4; i++) out[i] = Math.min(1, Math.max(0, buf.readFloatLE(8 + i * 4))) * 255;
  return out;
}
function diff(a, b) {
  let sum = 0, max = 0, over1 = 0, n = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) {
    const d = Math.abs(a[i + c] - b[i + c]); sum += d; if (d > max) max = d; if (d > 1) over1++; n++; sa += a[i + c]; sb += b[i + c];
  }
  return { meanAbs: +(sum / n).toFixed(3), max, pctOver1: +(over1 / n * 100).toFixed(3), meanPort: +(sa / n).toFixed(2), meanRef: +(sb / n).toFixed(2) };
}
const film = name => String(core.PRESETS.findIndex(([n]) => n === name));
function params(filmName, edits = {}) {
  const p = engine.defaultParams();
  engine.ui.beforeChange(p, 'filmPreset', film(filmName)); p.filmPreset = film(filmName);
  for (const [k, v] of Object.entries(edits)) { if (engine.controlByPath[k]?.kind === 'select') { engine.ui.beforeChange(p, k, String(v)); p[k] = String(v); } else p[k] = v; }
  return engine.coreParams(p);
}
if (process.argv[3] === 'grain') {
  // Grain strength: std-dev of (grain on − grain off), port vs original.
  const sd = (a, b) => { let sum = 0, sq = 0, n = 0; for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) { const d = a[i + c] - b[i + c]; sum += d; sq += d * d; n++; } const m = sum / n; return +Math.sqrt(sq / n - m * m).toFixed(3); };
  for (const [name, edits] of [['Kodak Portra 400', {}], ['Kodak Tri-X 400', {}], ['CineStill 800T', {}], ['Ilford Delta 3200', { filmGrainMode: 2 }]]) {
    const on = params(name, edits), off = params(name, { ...edits, filmGrainEnabled: false });
    console.log(name, JSON.stringify(edits), { port: sd(core.render(rgba, W, H, on), core.render(rgba, W, H, off)), original: sd(runRef(on), runRef(off)) });
  }
  process.exit(0);
}
const cases = [
  ['Portra 400 (preset, grain off)', params('Kodak Portra 400', { filmGrainEnabled: false })],
  ['CineStill 800T (halation, grain off)', params('CineStill 800T', { filmGrainEnabled: false })],
  ['Ilford HP5 (B&W print, vignette, grain off)', params('Ilford HP5 Plus 400', { filmGrainEnabled: false })],
  ['Velvia 50 + Fuji 3513, colour head, expand, split, push, acutance, bloom 16mm (grain off)', params('Fuji Velvia 50', { filmGrainEnabled: false, printStock: 3, colorHeadEnabled: true, colorHeadAmount: 0.8, colorHeadCyan: 0.3, colorHeadYellow: -0.4, splitToneAmount: 0.6, pushPull: 1, acutance: 0.5, bloomProfile: 3 })],
  ['Gold 200, Rec.709 in/out transforms, scope colour-only', params('Kodak Gold 200', { filmGrainEnabled: false, inputTransform: 1, outputTransform: 1, effectMode: 1 })],
  ['Portra 400 WITH grain', params('Kodak Portra 400')],
  ['Tri-X WITH grain (dye clouds mode) + damage 8mm', params('Kodak Tri-X 400', { filmGrainMode: 2, filmDamageProfile: 4 })]
];
const results = {};
for (const [name, p] of cases) {
  const t0 = performance.now();
  const port = core.render(rgba, W, H, p);
  const ms = Math.round(performance.now() - t0);
  results[name] = { ...diff(port, runRef(p)), portMs: ms };
}
console.log(JSON.stringify(results, null, 1));
