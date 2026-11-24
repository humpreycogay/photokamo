#!/usr/bin/env node
// Physical validation: compare engine predictions with a chart shot on real film.
//
//   node tools/validate-chart.mjs chart.json [--fit] [--json]
//
// chart.json:
// {
//   "stockId": "kodak-portra-400",
//   "outputId": "kodak-portra-endura",        // the print/scan path you actually used
//   "outputSpace": "srgb",                     // space the measured Lab was derived in (Lab is D65)
//   "settings": { "filmExposure": 0, "sceneKelvin": 5500 },
//   "patches": [
//     { "name": "A1", "neutral": false,
//       "reflectance": { "wl_start": 380, "wl_step": 10, "values": [...] },   // preferred (spectro)
//       // or "sceneRgb": [r, g, b]   linear Rec.709 relative to an 18 % grey = 0.18
//       "measuredLab": [L, a, b] }                                           // from the film scan/print, D65
//   ]
// }
//
// --fit  fits film exposure (EV) and printer lights on the patches marked
//        "neutral" only (exposure and lab timing of a real shoot are unknown),
//        then reports colour error on every patch.
import { readFile } from 'node:fs/promises';
import {
  SpectralDataStore, deltaE2000, linearRgbToLab, normalizeSpectralSettings, summarize,
} from '../src/index.js';
import { WAVELENGTHS, resampleToGrid } from '../src/spectral/math.js';

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('usage: node tools/validate-chart.mjs chart.json [--fit] [--json]');
  process.exit(2);
}
const chart = JSON.parse(await readFile(file, 'utf8'));
const DATA = new URL('../data/film-scan-calibration/', import.meta.url);
const store = new SpectralDataStore(async path => JSON.parse(await readFile(new URL(path, DATA), 'utf8')));
const pipeline = await store.pipeline(chart.stockId, chart.outputId);
const outputSpace = chart.outputSpace === 'display-p3' ? 'display-p3' : 'srgb';
const base = normalizeSpectralSettings({ ...chart.settings, outputSpace }, pipeline.stock);

const exposureOf = (patch, ev) => {
  if (patch.reflectance) {
    const r = patch.reflectance;
    const xs = r.values.map((_, i) => r.wl_start + i * r.wl_step);
    const grid = resampleToGrid(xs, r.values, { edge: 'hold', grid: WAVELENGTHS });
    return pipeline.spectralLogExposure(grid, base.sceneKelvin, ev);
  }
  if (patch.sceneRgb) {
    const M = pipeline.exposureMatrix(base.sceneKelvin, ev);
    return [0, 1, 2].map(j => Math.log10(Math.max(1e-12,
      M[j * 3] * patch.sceneRgb[0] + M[j * 3 + 1] * patch.sceneRgb[1] + M[j * 3 + 2] * patch.sceneRgb[2])) - pipeline.stock.logHGrey);
  }
  throw new TypeError(`Patch ${patch.name} needs reflectance or sceneRgb.`);
};
const predict = (patch, s) => linearRgbToLab(pipeline.renderLogExposure(exposureOf(patch, s.filmExposure), s), outputSpace);
const errorsFor = (s, patches) => patches.map(patch => deltaE2000(predict(patch, s), patch.measuredLab));

let settings = { ...base };
if (flags.includes('--fit')) {
  const neutrals = chart.patches.filter(patch => patch.neutral);
  if (neutrals.length < 2) throw new Error('--fit needs at least two patches marked "neutral".');
  const keys = ['filmExposure', 'printRed', 'printGreen', 'printBlue'];
  const cost = s => errorsFor(s, neutrals).reduce((sum, e) => sum + e * e, 0);
  let best = cost(settings);
  for (const step of [1, 0.5, 0.25, 0.1, 0.05]) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const key of keys) for (const sign of [-1, 1]) {
        const scale = key === 'filmExposure' ? step : step * 8; // EV vs printer points
        const trial = { ...settings, [key]: settings[key] + sign * scale };
        const c = cost(trial);
        if (c < best) { best = c; settings = trial; improved = true; }
      }
    }
  }
}

const rows = chart.patches.map(patch => {
  const lab = predict(patch, settings);
  return { name: patch.name, neutral: !!patch.neutral, predictedLab: lab, measuredLab: patch.measuredLab, dE2000: deltaE2000(lab, patch.measuredLab) };
});
const all = summarize(rows.map(r => r.dE2000));
const colour = summarize(rows.filter(r => !r.neutral).map(r => r.dE2000));
const report = {
  stock: chart.stockId, output: chart.outputId,
  fitted: flags.includes('--fit') ? Object.fromEntries(['filmExposure', 'printRed', 'printGreen', 'printBlue'].map(k => [k, settings[k]])) : null,
  all, colourPatches: colour.n ? colour : null, patches: rows,
};
if (flags.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`${chart.stockId} → ${chart.outputId}`);
  if (report.fitted) console.log('fitted on neutrals:', report.fitted);
  for (const r of rows) console.log(`${r.name.padEnd(12)} ΔE2000 ${r.dE2000.toFixed(2)}${r.neutral ? '  (neutral)' : ''}`);
  const f = s => `mean ${s.mean.toFixed(2)}  median ${s.median.toFixed(2)}  p95 ${s.p95.toFixed(2)}  max ${s.max.toFixed(2)}  (n=${s.n})`;
  console.log(`all patches: ${f(all)}`);
  if (colour.n) console.log(`colour only: ${f(colour)}`);
}
