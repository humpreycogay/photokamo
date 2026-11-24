import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  SpectralDataStore, defaultSpectralSettings, filmCalibrationCatalog, normalizeSpectralSettings,
  outputsForStock, processSpectralImage, spectralControls, spectralStocks,
} from '../src/index.js';

const DATA = new URL('../data/film-scan-calibration/', import.meta.url);
const store = new SpectralDataStore(async path => JSON.parse(await readFile(new URL(path, DATA), 'utf8')));

function uniform(width, height, rgba) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { width, height, data };
}

function render(pipeline, image, overrides = {}) {
  const settings = normalizeSpectralSettings({ grain: 0, ...overrides }, pipeline.stock);
  return processSpectralImage(image, pipeline, settings, { histogram: false });
}

test('attribution table hashes match the bundled upstream files', async () => {
  const attribution = await readFile(new URL('ATTRIBUTION.md', DATA), 'utf8');
  const rows = [...attribution.matchAll(/^\| `([^`]+)` \| `[0-9a-f]{40}` \| `([0-9a-f]{64})` \|$/gm)];
  assert.ok(rows.length >= 60, `expected a hash row per bundled file, found ${rows.length}`);
  for (const [, path, sha256] of rows) {
    const bytes = await readFile(new URL(path, DATA));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, path);
  }
});

test('every spectral stock maps to a catalog record and builds with every output', async () => {
  const catalogIds = new Set(filmCalibrationCatalog.map(record => record.id));
  assert.equal(spectralStocks.length, 20);
  for (const stock of spectralStocks) {
    assert.ok(catalogIds.has(stock.id), `${stock.id} missing from filmCalibrationCatalog`);
    for (const output of outputsForStock(stock)) {
      const pipeline = await store.pipeline(stock.id, output.id);
      assert.ok(Number.isFinite(pipeline.stock.logHGrey), `${stock.id} anchor`);
      const lut = pipeline.buildLut({});
      assert.ok(lut.data.every(Number.isFinite), `${stock.id}/${output.id} LUT finite`);
    }
  }
});

test('an 18% grey card renders neutral at normal exposure', async () => {
  const grey = uniform(4, 4, [118, 118, 118, 255]); // sRGB 118 ≈ 18% linear
  for (const stock of spectralStocks) {
    for (const output of outputsForStock(stock)) {
      const pipeline = await store.pipeline(stock.id, output.id);
      const [r, g, b] = render(pipeline, grey).data;
      // Negatives are timed/inverted to neutral; slides keep their own (small) bias.
      const tolerance = stock.kind === 'color-reversal' ? 26 : 4;
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= tolerance,
        `${stock.id}/${output.id} grey rendered as ${[r, g, b]}`);
    }
  }
});

test('grey scale stays monotonic and film exposure brightens', async () => {
  const pipeline = await store.pipeline('kodak-portra-400', 'kodak-2393');
  let previous = -1;
  for (let value = 0; value <= 255; value += 15) {
    const [, g] = render(pipeline, uniform(2, 2, [value, value, value, 255])).data;
    assert.ok(g >= previous, `non-monotonic at ${value}`);
    previous = g;
  }
  const grey = uniform(2, 2, [118, 118, 118, 255]);
  assert.ok(render(pipeline, grey, { filmExposure: 1 }).data[1] > render(pipeline, grey).data[1] + 10);
});

test('tungsten stock under daylight renders blue; daylight stock under tungsten renders warm', async () => {
  const grey = uniform(2, 2, [118, 118, 118, 255]);
  const tungsten = await store.pipeline('kodak-vision3-500t', 'kodak-2393');
  const [tr, , tb] = render(tungsten, grey, { sceneKelvin: 5500 }).data;
  assert.ok(tb > tr + 30, `500T in daylight: ${tr} vs ${tb}`);
  const daylight = await store.pipeline('kodak-vision3-250d', 'kodak-2393');
  const [dr, , db] = render(daylight, grey, { sceneKelvin: 3200 }).data;
  assert.ok(dr > db + 30, `250D in tungsten: ${dr} vs ${db}`);
});

test('printer lights move colour in the labelled direction', async () => {
  const pipeline = await store.pipeline('kodak-gold-200', 'kodak-portra-endura');
  const grey = uniform(2, 2, [118, 118, 118, 255]);
  const [r0, g0, b0] = render(pipeline, grey).data;
  const [r1] = render(pipeline, grey, { printRed: 8 }).data;
  const [, , b1] = render(pipeline, grey, { printBlue: 8 }).data;
  const [, g2] = render(pipeline, grey, { printDensity: 8 }).data;
  assert.ok(r1 > r0 + 5 && b1 > b0 + 5 && g2 < g0 - 5);
});

test('rendering preserves size and alpha, leaves input untouched, and is deterministic', async () => {
  const pipeline = await store.pipeline('kodak-portra-800', 'scan-status-m');
  const image = uniform(24, 16, [90, 140, 200, 77]);
  const before = new Uint8ClampedArray(image.data);
  const settings = { ...defaultSpectralSettings(pipeline.stock), grain: 60, halation: 50, vignette: -40, sharpening: 40 };
  const a = processSpectralImage(image, pipeline, normalizeSpectralSettings(settings, pipeline.stock));
  const b = processSpectralImage(image, pipeline, normalizeSpectralSettings(settings, pipeline.stock));
  assert.deepEqual(image.data, before);
  assert.equal(a.width, 24); assert.equal(a.height, 16);
  assert.ok(a.data.every((value, index) => index % 4 !== 3 || value === 77));
  assert.deepEqual(a.data, b.data);
  assert.equal(a.histogram.r.reduce((sum, value) => sum + value, 0), 24 * 16);
});

test('film amount 0 returns the source image', async () => {
  const pipeline = await store.pipeline('fujifilm-velvia-50', 'slide-light-table');
  const image = uniform(4, 4, [30, 120, 220, 255]);
  const out = render(pipeline, image, { amount: 0 });
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(out.data[i] - image.data[i]) <= 1);
});

test('settings are clamped to control ranges with stock-specific defaults', async () => {
  const pipeline = await store.pipeline('kodak-vision3-500t', 'scan-status-m');
  const settings = normalizeSpectralSettings({ filmExposure: 99, contrast: -999, grain: 'x' }, pipeline.stock);
  assert.equal(settings.filmExposure, spectralControls.filmExposure.max);
  assert.equal(settings.contrast, spectralControls.contrast.min);
  assert.equal(settings.sceneKelvin, 3200);
  assert.equal(settings.grain, defaultSpectralSettings(pipeline.stock).grain);
});

// ---------------------------------------------------------------- calibration fixes

import { deltaE2000, linearRgbToLab, recoverHighlights, fitMtf } from '../src/index.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const greyChroma = (pipeline, settings, stops) => {
  const l = stops * Math.log10(2);
  const [, a, b] = linearRgbToLab(pipeline.renderLogExposure([l, l, l], settings));
  return Math.hypot(a, b);
};

test('interlayer (DIR) effect never shifts the neutral axis', async () => {
  for (const [stock, output] of [['kodak-portra-400', 'scan-status-m'], ['kodak-portra-400', 'kodak-2393'], ['fujifilm-velvia-50', 'slide-light-table']]) {
    const pipeline = await store.pipeline(stock, output);
    for (const stops of [-2, -1, 0, 1, 2]) {
      const off = greyChroma(pipeline, { interlayer: 0 }, stops);
      const on = greyChroma(pipeline, { interlayer: 100 }, stops);
      assert.ok(Math.abs(on - off) < 0.05, `${stock}/${output} at ${stops} stops: ${off.toFixed(2)} → ${on.toFixed(2)}`);
    }
  }
});

test('interlayer effect increases saturation of coloured patches', async () => {
  const pipeline = await store.pipeline('kodak-portra-400', 'kodak-portra-endura');
  const M = pipeline.exposureMatrix();
  const l = [0, 1, 2].map(k => Math.log10(M[k * 3] * 0.4 + M[k * 3 + 1] * 0.08 + M[k * 3 + 2] * 0.05) - pipeline.stock.logHGrey);
  const chroma = s => { const [, a, b] = linearRgbToLab(pipeline.renderLogExposure(l, s)); return Math.hypot(a, b); };
  assert.ok(chroma({ interlayer: 100 }) > chroma({ interlayer: 0 }) + 2);
});

test('print and scan neutral lock keeps the grey ramp neutral; 0 % shows crossovers', async () => {
  for (const [stock, output] of [['kodak-vision3-250d', 'kodak-2393'], ['fujifilm-400', 'fujifilm-pro-laser-ii'], ['fujifilm-pro-400h', 'kodak-endura-premier'], ['kodak-vision3-250d', 'scan-status-m'], ['fujifilm-superia-premium-400', 'scan-status-m']]) {
    const pipeline = await store.pipeline(stock, output);
    for (const stops of [-3, -2, -1, 0, 1, 2, 3]) {
      const l = stops * Math.log10(2);
      const [L] = linearRgbToLab(pipeline.renderLogExposure([l, l, l], { neutralLock: 100 }));
      if (L < 10) continue; // at a paper's D-max the black itself is not neutral; no timing can change that
      assert.ok(greyChroma(pipeline, { neutralLock: 100 }, stops) < 0.3, `${stock}/${output} locked at ${stops}`);
    }
  }
  const pipeline = await store.pipeline('kodak-vision3-250d', 'kodak-2393');
  assert.ok(greyChroma(pipeline, { neutralLock: 0 }, 2) > 1, 'unlocked print should show its crossover');
});

test('linear (HDR) input matches the equivalent 8-bit image and keeps alpha', async () => {
  const pipeline = await store.pipeline('kodak-gold-200', 'scan-status-m');
  const settings = normalizeSpectralSettings({ grain: 0 }, pipeline.stock);
  const display = uniform(4, 4, [180, 120, 60, 200]);
  const toLinear = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const linear = new Float32Array(16 * 4);
  for (let i = 0; i < 16; i++) linear.set([toLinear(180), toLinear(120), toLinear(60), 200 / 255], i * 4);
  const a = processSpectralImage(display, pipeline, settings).data;
  const b = processSpectralImage({ width: 4, height: 4, linear, channels: 4 }, pipeline, settings).data;
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(a[i] - b[i]) <= 1, `channel ${i}: ${a[i]} vs ${b[i]}`);
  // Scene highlights above display white reach the film shoulder instead of clipping.
  const bright = new Float32Array([8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]);
  const hdr = processSpectralImage({ width: 2, height: 2, linear: bright, channels: 3 }, pipeline, settings).data;
  const sdr = processSpectralImage(uniform(2, 2, [255, 255, 255, 255]), pipeline, settings).data;
  assert.ok(hdr[1] > sdr[1]);
});

test('highlight recovery inverts a camera roll-off and is identity at 0', () => {
  assert.equal(recoverHighlights(0.5, 0), 0.5);
  assert.ok(Math.abs(recoverHighlights(1, 2) - 4) < 1e-9);
  assert.ok(Math.abs(recoverHighlights(0.01, 2) - 0.01) < 0.002);
  let previous = 0;
  for (let v = 0; v <= 1; v += 0.05) { const r = recoverHighlights(v, 3); assert.ok(r >= previous); previous = r; }
});

test('Display P3 output keeps neutrals and widens saturated colours', async () => {
  const pipeline = await store.pipeline('fujifilm-velvia-50', 'slide-light-table');
  const grey = uniform(2, 2, [118, 118, 118, 255]);
  const red = uniform(2, 2, [230, 20, 20, 255]);
  const out = (image, outputSpace) => render(pipeline, image, { outputSpace });
  const labOf = (data, space) => linearRgbToLab([0, 1, 2].map(i => { const v = data[i] / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }), space);
  const greySrgb = labOf(out(grey, 'srgb').data, 'srgb'), greyP3 = labOf(out(grey, 'display-p3').data, 'display-p3');
  assert.ok(deltaE2000(greySrgb, greyP3) < 1);
  const redSrgb = labOf(out(red, 'srgb').data, 'srgb'), redP3 = labOf(out(red, 'display-p3').data, 'display-p3');
  assert.ok(Math.hypot(redP3[1], redP3[2]) >= Math.hypot(redSrgb[1], redSrgb[2]) - 0.5);
});

test('datasheet MTF fits reproduce the published curves', async () => {
  const raw = JSON.parse(await readFile(new URL('films/Portra400_mtf.json', DATA), 'utf8'));
  for (const key of ['R', 'G', 'B']) {
    const curve = raw.curves[key];
    const fit = fitMtf(curve.cycles_per_mm, curve.response_pct.map(v => v / 100));
    assert.ok(fit.rms < 0.02, `${key} rms ${fit.rms}`);
    assert.ok(Math.abs(fit.bank.reduce((s, b) => s + b.weight, 0) - 1) < 1e-9, 'unit DC response');
    assert.ok(fit.bank.some(b => b.weight < 0), `${key}: adjacency (negative wide term) expected — curve peaks above 100 %`);
  }
  const pipeline = await store.pipeline('kodak-portra-400', 'scan-status-m');
  assert.ok(pipeline.stock.mtf.layers.length === 3);
  // At full-resolution scale the MTF changes an edge; 0 % leaves it untouched.
  const edge = { width: 64, height: 8, data: new Uint8ClampedArray(64 * 8 * 4) };
  for (let y = 0; y < 8; y++) for (let x = 0; x < 64; x++) edge.data.set(x < 32 ? [40, 40, 40, 255] : [200, 200, 200, 255], (y * 64 + x) * 4);
  const settings = normalizeSpectralSettings({ grain: 0 }, pipeline.stock);
  const on = processSpectralImage(edge, pipeline, settings, { frameWidthMm: 0.5 }).data;
  const off = processSpectralImage(edge, pipeline, { ...settings, filmSharpness: 0 }, { frameWidthMm: 0.5 }).data;
  assert.ok(on.some((v, i) => Math.abs(v - off[i]) > 2));
});

test('chart validation tool recovers a known exposure and timing', async () => {
  const pipeline = await store.pipeline('kodak-portra-400', 'kodak-portra-endura');
  const truth = { filmExposure: 0.6, printRed: 3, printGreen: 0, printBlue: -2 };
  const patches = [];
  for (const [name, rgb, neutral] of [
    ['white', [0.9, 0.9, 0.9], true], ['grey', [0.18, 0.18, 0.18], true], ['dark', [0.03, 0.03, 0.03], true],
    ['red', [0.4, 0.06, 0.05], false], ['green', [0.08, 0.3, 0.07], false], ['blue', [0.05, 0.08, 0.35], false], ['skin', [0.45, 0.3, 0.22], false],
  ]) {
    const M = pipeline.exposureMatrix(5500, truth.filmExposure);
    const l = [0, 1, 2].map(k => Math.log10(M[k * 3] * rgb[0] + M[k * 3 + 1] * rgb[1] + M[k * 3 + 2] * rgb[2]) - pipeline.stock.logHGrey);
    patches.push({ name, neutral, sceneRgb: rgb, measuredLab: linearRgbToLab(pipeline.renderLogExposure(l, truth)) });
  }
  const dir = await mkdtemp(join(tmpdir(), 'kamo-chart-'));
  const file = join(dir, 'chart.json');
  await writeFile(file, JSON.stringify({ stockId: 'kodak-portra-400', outputId: 'kodak-portra-endura', settings: {}, patches }));
  const tool = new URL('../tools/validate-chart.mjs', import.meta.url).pathname;
  const { stdout } = await promisify(execFile)(process.execPath, [tool, file, '--fit', '--json']);
  const report = JSON.parse(stdout);
  assert.ok(report.all.mean < 0.6, `mean ΔE after fit ${report.all.mean}`);
  assert.ok(Math.abs(report.fitted.filmExposure - 0.6) < 0.2);
});

test('a region render matches the same crop of the full-frame render', async () => {
  const pipeline = await store.pipeline('kodak-portra-400', 'kodak-portra-endura');
  const W = 48, H = 32;
  const image = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) image.data.set([40 + x * 4, 60 + y * 5, 120, 255], (y * W + x) * 4);
  const settings = normalizeSpectralSettings({ grain: 0, vignette: -60, chromaticAberration: 0 }, pipeline.stock);
  const full = processSpectralImage(image, pipeline, settings).data;
  const x0 = 30, y0 = 4, w = 12, h = 10;
  const crop = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  for (let y = 0; y < h; y++) crop.data.set(image.data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
  const part = processSpectralImage(crop, pipeline, settings, { region: { x: x0, y: y0, fullWidth: W, fullHeight: H } }).data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    const a = full[((y0 + y) * W + x0 + x) * 4 + c], b = part[(y * w + x) * 4 + c];
    assert.ok(Math.abs(a - b) <= 2, `(${x},${y},${c}) ${a} vs ${b}`);
  }
});

import { spectralPresets, presetTiers, stockDisplayName, getSpectralOutput as outputById } from '../src/index.js';

test('every preset references a real stock/output and valid, in-range controls', async () => {
  const ids = new Set();
  for (const preset of spectralPresets) {
    assert.ok(!ids.has(preset.id), `duplicate preset ${preset.id}`);
    ids.add(preset.id);
    assert.ok(presetTiers[preset.tier], `${preset.id} tier`);
    const stock = spectralStocks.find(item => item.id === preset.stockId);
    assert.ok(stock, `${preset.id} stock`);
    if (preset.outputId) assert.ok(outputById(preset.outputId)?.kinds.includes(stock.kind), `${preset.id} output`);
    for (const [key, value] of Object.entries(preset.settings)) {
      const control = spectralControls[key];
      assert.ok(control && value >= control.min && value <= control.max, `${preset.id}.${key}`);
    }
    if (preset.tier !== 'datasheet') assert.ok(preset.note, `${preset.id} must explain its basis`);
    const pipeline = await store.pipeline(preset.stockId, preset.outputId ?? undefined);
    const out = render(pipeline, uniform(2, 2, [118, 118, 118, 255]), preset.settings).data;
    assert.ok(out.every(Number.isFinite));
  }
  assert.equal(spectralPresets.filter(p => p.tier === 'datasheet').length, spectralStocks.length);
  assert.equal(stockDisplayName({ maker: 'Fujifilm', name: 'Fujifilm 200' }), 'Fujifilm 200');
  assert.equal(stockDisplayName({ maker: 'Kodak', name: 'Portra 400' }), 'Kodak Portra 400');
});
