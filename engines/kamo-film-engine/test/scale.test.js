// v3 Task 8: grain and sharpening look the same in a preview and in a larger render viewed at preview size.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FilmEngine, SpectralDataStore, normalizeSpectralSettings, processSpectralImage, spectralStocks, outputsForStock } from '../src/index.js';

const flat = (width, height, value = 128) => { const data = new Uint8ClampedArray(width * height * 4).fill(value); return { width, height, data }; };
/** Standard deviation of the red channel after averaging block × block pixels (a downscale by `block`). */
function blockStd({ data, width, height }, block) {
  let sum = 0, sumSq = 0, n = 0;
  for (let by = 0; by + block <= height; by += block) for (let bx = 0; bx + block <= width; bx += block) {
    let total = 0;
    for (let y = by; y < by + block; y++) for (let x = bx; x < bx + block; x++) total += data[(y * width + x) * 4];
    const v = total / block / block; sum += v; sumSq += v * v; n++;
  }
  const mean = sum / n; return Math.sqrt(sumSq / n - mean * mean);
}

test('creative grain: a 3× render downscaled to the 900 px preview size has the preview\'s grain (within 15 %)', () => {
  const engine = new FilmEngine(), options = { grain: .6, amount: 1, seed: 7 };
  const preview = blockStd(engine.process(flat(900, 300), options), 1);
  const big = blockStd(engine.process(flat(2700, 900), options), 3);
  assert.ok(Math.abs(big / preview - 1) < .15, `grain RMS ${big.toFixed(2)} after ÷3 vs ${preview.toFixed(2)} in the preview`);
  assert.deepEqual(engine.process(flat(2700, 900), options).data.subarray(0, 4000), engine.process(flat(2700, 900), options).data.subarray(0, 4000), 'deterministic');
});

test('spectral sharpening: a 3× render downscaled has the preview\'s edge overshoot (within 25 %)', async () => {
  const DATA = new URL('../data/film-scan-calibration/', import.meta.url);
  const store = new SpectralDataStore(async path => JSON.parse(await readFile(new URL(path, DATA), 'utf8')));
  const stock = spectralStocks[0], pipeline = await store.pipeline(stock.id, outputsForStock(stock)[0].id);
  const edge = (width, height) => { const image = flat(width, height, 70); for (let y = 0; y < height; y++) for (let x = width >> 1; x < width; x++) image.data.fill(190, (y * width + x) * 4, (y * width + x) * 4 + 3); return image; };
  const overshoot = (image, block) => { // max − plateau on the bright side, along the middle row, after the downscale
    const { data, width, height } = image, w = width / block, row = [];
    for (let bx = 0; bx < w; bx++) { let t = 0; for (let y = 0; y < block; y++) for (let x = 0; x < block; x++) t += data[((((height >> 1) - (height >> 1) % block) + y) * width + bx * block + x) * 4 + 1]; row.push(t / block / block); }
    return Math.max(...row) - row[Math.floor(w * .85)];
  };
  const settings = normalizeSpectralSettings({ grain: 0, sharpening: 100, halation: 0 }, pipeline.stock);
  const small = overshoot(processSpectralImage(edge(900, 60), pipeline, settings, { histogram: false }), 1);
  const big = overshoot(processSpectralImage(edge(2700, 180), pipeline, settings, { histogram: false }), 3);
  assert.ok(small > 1, `the preview shows sharpening (${small.toFixed(2)})`);
  assert.ok(Math.abs(big / small - 1) < .25, `overshoot ${big.toFixed(2)} after ÷3 vs ${small.toFixed(2)} in the preview`);
});
