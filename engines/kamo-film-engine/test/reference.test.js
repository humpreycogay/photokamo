// Agreement with an independent implementation of the same datasheet data:
// Film Scan Calibration's own print-emulation LUTs (CC BY 4.0, subsampled).
// This checks our print stage, not accuracy against physical film.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SpectralDataStore, deltaE2000, linearRgbToLab, summarize, xyzToLab } from '../src/index.js';
import { N_WL, P3_TO_XYZ, mat3Vec } from '../src/spectral/math.js';
import { makeDyeSolver } from '../src/spectral/pipeline.js';

const DATA = new URL('../data/film-scan-calibration/', import.meta.url);
const store = new SpectralDataStore(async path => JSON.parse(await readFile(new URL(path, DATA), 'utf8')));
const fixture = JSON.parse(await readFile(new URL('./fixtures/upstream-print-reference.json', import.meta.url), 'utf8'));
const decode = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function sampler({ size, data }) {
  return x => {
    const f = x.map(v => Math.min(size - 1.0001, Math.max(0, v * (size - 1))));
    const i = f.map(v => v | 0), d = f.map((v, k) => v - i[k]);
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      let v = 0;
      for (const [dr, wr] of [[0, 1 - d[0]], [1, d[0]]]) for (const [dg, wg] of [[0, 1 - d[1]], [1, d[1]]]) for (const [db, wb] of [[0, 1 - d[2]], [1, d[2]]]) {
        v += wr * wg * wb * data[((i[2] + db) * size * size + (i[1] + dg) * size + (i[0] + dr)) * 3 + c];
      }
      out[c] = v;
    }
    return out;
  };
}

async function agreement(stockId, outputId, pairName) {
  const pipeline = await store.pipeline(stockId, outputId);
  const sample = sampler(fixture.pairs[pairName]);
  // Upstream input domain: bare image-dye Status M / 3.30 minus the neutral offset at K_MID.
  const bare = makeDyeSolver(pipeline.stock.dyes, pipeline.filmWeights, new Float64Array(N_WL));
  const amounts = pipeline.filmAmounts(1, 0);
  const bareM = l => bare.read(amounts(l, [0, 0, 0]));
  const locus = [];
  for (let l = -3; l <= 2; l += 0.02) {
    const k = bareM([l, l, l]).map(v => v / 3.3);
    const m = (k[0] + k[1] + k[2]) / 3;
    locus.push([m, k.map(v => v - m)]);
  }
  locus.sort((a, b) => a[0] - b[0]);
  const j = locus.findIndex(([m]) => m >= 0.22);
  const t = (0.22 - locus[j - 1][0]) / (locus[j][0] - locus[j - 1][0]);
  const offset = [0, 1, 2].map(c => locus[j - 1][1][c] + (locus[j][1][c] - locus[j - 1][1][c]) * t);
  const reference = l => xyzToLab(mat3Vec(P3_TO_XYZ, sample(bareM(l).map((v, c) => v / 3.3 - offset[c])).map(decode)));
  const ours = (l, s) => linearRgbToLab(pipeline.renderLogExposure(l, s));

  // Align timing (printer lights + density) on the neutral ramp only.
  const ramp = [];
  for (let st = -3; st <= 3; st += 0.5) ramp.push([st * 0.301, st * 0.301, st * 0.301]);
  const refRamp = ramp.map(reference);
  const cost = s => ramp.reduce((sum, l, i) => sum + deltaE2000(ours(l, s), refRamp[i]) ** 2, 0);
  let s = { printRed: 0, printGreen: 0, printBlue: 0, printDensity: 0 }, best = cost(s);
  for (const step of [4, 2, 1, 0.5]) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const key of Object.keys(s)) for (const sign of [-1, 1]) {
        const trial = { ...s, [key]: s[key] + sign * step };
        const c = cost(trial);
        if (c < best) { best = c; s = trial; improved = true; }
      }
    }
  }
  // Colour patches: an RGB grid at three exposures through our film model.
  const M = pipeline.exposureMatrix();
  const errors = [];
  for (const ev of [-1, 0, 1]) for (const r of [0.03, 0.1, 0.25, 0.5]) for (const g of [0.03, 0.1, 0.25, 0.5]) for (const b of [0.03, 0.1, 0.25, 0.5]) {
    const l = [0, 1, 2].map(k => Math.log10(2 ** ev * (M[k * 3] * r + M[k * 3 + 1] * g + M[k * 3 + 2] * b)) - pipeline.stock.logHGrey);
    errors.push(deltaE2000(ours(l, s), reference(l)));
  }
  return summarize(errors);
}

for (const [stockId, outputId, pairName] of [
  ['kodak-portra-400', 'kodak-portra-endura', 'Portra400_PortraEndura'],
  ['kodak-gold-200', 'kodak-endura-premier', 'Gold200_EnduraPremier'],
  ['fujifilm-400', 'fujifilm-pro-laser-ii', 'Fujifilm400_ProLaser'],
]) {
  test(`print stage agrees with the upstream reference: ${pairName}`, async () => {
    const stats = await agreement(stockId, outputId, pairName);
    assert.ok(stats.mean < 2.6 && stats.p95 < 5,
      `${pairName}: ΔE2000 mean ${stats.mean.toFixed(2)} p95 ${stats.p95.toFixed(2)} max ${stats.max.toFixed(2)}`);
  });
}
