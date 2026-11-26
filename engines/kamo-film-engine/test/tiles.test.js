// v3 Task 9: a frame rendered in tiles (each with its margin, as a region of the frame) equals the single-pass render.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SpectralDataStore, normalizeSpectralSettings, processSpectralImage, tileMargin, tileRects } from '../src/index.js';

const DATA = new URL('../data/film-scan-calibration/', import.meta.url);
const store = new SpectralDataStore(async path => JSON.parse(await readFile(new URL(path, DATA), 'utf8')));

/** A test scene: gradients, a bright window (halation), fine stripes (MTF, sharpening) and a dark corner. */
function scene(W, H) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, window = x > W * .6 && x < W * .75 && y > H * .2 && y < H * .45, stripe = x > W * .1 && x < W * .3 && ((x >> 1) & 1);
    data[i] = window ? 255 : 40 + (x * 150 / W) + (stripe ? 50 : 0); data[i + 1] = window ? 250 : 60 + (y * 120 / H); data[i + 2] = window ? 240 : 110 - (x * 60 / W); data[i + 3] = 255;
  }
  return { width: W, height: H, data };
}
function renderTiled(image, pipeline, settings, tileSize) {
  const { width: W, height: H } = image, margin = tileMargin(pipeline, settings, { fullWidth: W, fullHeight: H });
  const out = new Uint8ClampedArray(W * H * 4);
  for (const t of tileRects(W, H, tileSize, margin)) {
    const part = { width: t.sw, height: t.sh, data: new Uint8ClampedArray(t.sw * t.sh * 4) };
    for (let y = 0; y < t.sh; y++) part.data.set(image.data.subarray(((t.sy + y) * W + t.sx) * 4, ((t.sy + y) * W + t.sx + t.sw) * 4), y * t.sw * 4);
    const done = processSpectralImage(part, pipeline, settings, { histogram: false, region: { x: t.sx, y: t.sy, fullWidth: W, fullHeight: H } }).data;
    for (let y = 0; y < t.h; y++) out.set(done.subarray(((t.y - t.sy + y) * t.sw + t.x - t.sx) * 4, ((t.y - t.sy + y) * t.sw + t.x - t.sx + t.w) * 4), ((t.y + y) * W + t.x) * 4);
  }
  return { out, margin };
}

for (const [stockId, outputId] of [['kodak-portra-400', 'kodak-portra-endura'], ['kodak-vision3-500t', null]]) {
  test(`tiles equal the single-pass render (${stockId}, grain, halation, MTF, CA, sharpening)`, async () => {
    const pipeline = await store.pipeline(stockId, outputId ?? undefined);
    const settings = normalizeSpectralSettings({ grain: 60, grainSize: 70, halation: 80, chromaticAberration: 60, sharpening: 70, vignette: -40, seed: 11 }, pipeline.stock);
    const image = scene(720, 480), whole = processSpectralImage(image, pipeline, settings, { histogram: false }).data;
    for (const tileSize of [256, 333]) {
      const { out, margin } = renderTiled(image, pipeline, settings, tileSize);
      let worst = 0; for (let i = 0; i < whole.length; i++) if ((i & 3) !== 3) worst = Math.max(worst, Math.abs(whole[i] - out[i]));
      assert.ok(margin > 2, `margin ${margin}`);
      assert.ok(worst <= 1, `tile ${tileSize}, margin ${margin}: largest difference ${worst}/255`);
    }
  });
}
