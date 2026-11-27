// Auto White Balance and the neutral picker (plan_workflow.md Task 3, A§5.3 with C1–C3, C7). Pure: RGBA bytes in,
// slider values out, so tools/workflow-fixtures.mjs can check it and js/analysis/worker.js can run it off the main
// thread. Everything is judged on the image Adjust receives (C1: the optics output on Basic, the engine output on a film
// look), and the answer is found through the real adjustPixels, because Temperature and Tint are code-value offsets,
// not channel gains.
import { adjustPixels } from '../renderer.js';

const LINEAR = Float64Array.from({ length: 256 }, (_, v) => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
const encode = l => { const c = l <= .0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - .055; return Math.max(0, Math.min(255, Math.round(c * 255))); };
const lumaOf = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
const geomean = values => Math.exp(values.reduce((sum, v) => sum + Math.log(v), 0) / values.length);
/** Gains with geometric mean 1, each within [0.5, 2]. */
function normalizeGains(gains) { const m = geomean(gains); return gains.map(g => Math.min(2, Math.max(.5, g / m))); }

export const MIN_CONFIDENCE = .25, SAMPLE_PIXELS = 1024;

/** Pixels the estimators may use: not clipped, 0.02 ≤ Y ≤ 0.95 (linear), not strongly coloured (S ≤ 0.35). Saturation is
 *  judged after a rough grey-world correction (`pre`): under a strong cast every grey looks saturated, and filtering
 *  on the raw values would keep only the wrong pixels. Values come back pre-corrected. */
function eligible(data, pre = [1, 1, 1]) {
  const out = [];
  for (let i = 0; i < data.length; i += 4) {
    const r8 = data[i], g8 = data[i + 1], b8 = data[i + 2], a = data[i + 3];
    if (!a || Math.max(r8, g8, b8) >= 253 || Math.min(r8, g8, b8) <= 2) continue;
    const r = LINEAR[r8] * pre[0], g = LINEAR[g8] * pre[1], b = LINEAR[b8] * pre[2], y = lumaOf(r, g, b), max = Math.max(r, g, b);
    if (y < .02 || y > .95 || (max - Math.min(r, g, b)) / max > .35) continue;
    out.push(r, g, b, a / 255, y);
  }
  return out;
}
/** Grey world over the unclipped pixels: the rough first correction. */
function greyWorld(data) {
  const sums = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3] || Math.max(data[i], data[i + 1], data[i + 2]) >= 253 || Math.min(data[i], data[i + 1], data[i + 2]) <= 2) continue;
    for (let c = 0; c < 3; c++) sums[c] += LINEAR[data[i + c]];
  }
  return sums.some(v => v <= 0) ? [1, 1, 1] : normalizeGains(sums.map(v => geomean(sums) / v));
}
const weightedMedian = (values, weights) => {
  const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]), half = weights.reduce((s, w) => s + w, 0) / 2;
  let sum = 0; for (const i of order) { sum += weights[i]; if (sum >= half) return values[i]; }
  return values[order.at(-1)];
};

/** The cast estimate: { gains [r,g,b] (blended toward identity by confidence), confidence, agreement, coverage }. */
export function estimateCast(data) {
  const pre = greyWorld(data), e = eligible(data, pre), n = e.length / 5, pixels = data.length / 4;
  const coverage = Math.min(1, e.reduce((sum, _, i) => (i % 5 === 3 ? sum + e[i] : sum), 0) / (.05 * pixels));
  if (n < 16) return { gains: [1, 1, 1], confidence: 0, agreement: 0, coverage };
  // Shades of Gray, p = 6.
  const sums = [0, 0, 0]; let weight = 0;
  for (let i = 0; i < e.length; i += 5) { const w = e[i + 3]; weight += w; for (let c = 0; c < 3; c++) sums[c] += w * e[i + c] ** 6; }
  const sog = sums.map(s => (s / weight) ** (1 / 6)), sogGains = normalizeGains(sog.map(v => geomean(sog) / Math.max(v, 1e-6)));
  // Bright neutrals: pixels above the 90th percentile of Y, channel medians.
  const ys = []; for (let i = 4; i < e.length; i += 5) ys.push(e[i]);
  const p90 = [...ys].sort((a, b) => a - b)[Math.floor(.9 * (ys.length - 1))];
  const bright = [[], [], []], brightWeights = [];
  for (let i = 0; i < e.length; i += 5) if (e[i + 4] >= p90) { for (let c = 0; c < 3; c++) bright[c].push(e[i + c]); brightWeights.push(e[i + 3]); }
  const medians = bright.map(values => weightedMedian(values, brightWeights));
  const bnGains = normalizeGains(medians.map(v => geomean(medians) / Math.max(v, 1e-6)));
  const d = Math.sqrt(sogGains.reduce((sum, g, c) => sum + (Math.log2(g) - Math.log2(bnGains[c])) ** 2, 0) / 3);
  const agreement = Math.exp(-((d / .25) ** 2)), confidence = agreement * coverage;
  // The estimators ran on pre-corrected values: their gains come on top of the rough ones.
  const gains = sogGains.map((g, c) => 2 ** (confidence * (Math.log2(pre[c] * g) + Math.log2(pre[c] * bnGains[c])) / 2));
  return { gains, confidence, agreement, coverage };
}

/** Neutral picker: gains that make the `size` × `size` patch at (x, y) grey. { gains } or { error: 'clipped' | 'dark' }. */
export function neutralGains(data, width, height, x, y, size = 5) {
  const half = Math.floor(size / 2), sums = [0, 0, 0];
  let count = 0, clipped = 0;
  for (let yy = Math.max(0, y - half); yy <= Math.min(height - 1, y + half); yy++) for (let xx = Math.max(0, x - half); xx <= Math.min(width - 1, x + half); xx++) {
    const i = (yy * width + xx) * 4; count++;
    if (Math.max(data[i], data[i + 1], data[i + 2]) >= 253 || Math.min(data[i], data[i + 1], data[i + 2]) <= 2) clipped++;
    for (let c = 0; c < 3; c++) sums[c] += LINEAR[data[i + c]];
  }
  if (!count || clipped > .2 * count) return { error: 'clipped' };
  const mean = sums.map(s => s / count);
  if (lumaOf(...mean) < .02) return { error: 'dark' };
  return { gains: normalizeGains(mean.map(v => geomean(mean) / Math.max(v, 1e-6))) };
}

/** A deterministic, evenly spread sample of the image's pixels (positions don't matter to the fit). */
function samplePixels(data, max = SAMPLE_PIXELS) {
  const pixels = data.length / 4, step = Math.max(1, Math.floor(pixels / max)), out = [];
  for (let p = 0; p < pixels && out.length < max * 4; p += step) if (data[p * 4 + 3]) out.push(data[p * 4], data[p * 4 + 1], data[p * 4 + 2], 255);
  return new Uint8ClampedArray(out);
}
const render = (sample, a) => { const copy = sample.slice(); adjustPixels(copy, copy.length / 4, 1, a); return copy; };

/** Temperature and Tint (effective values) whose render of the Adjust input comes closest to the same input with its cast
 *  removed (`gains`, linear) rendered with Temperature and Tint at `base`. Other controls stay as they are (`a`), so a
 *  preset's or film's own colour is kept: only the photo's cast goes. */
export function fitWhiteBalance(data, a, gains, base) {
  const sample = samplePixels(data);
  // Position-dependent effects (grain, vignette) don't change neutrality; they are left out of the objective.
  const fixed = { ...a, grain: 0, vignette: 0 };
  const corrected = sample.slice();
  for (let i = 0; i < corrected.length; i += 4) for (let c = 0; c < 3; c++) corrected[i + c] = encode(LINEAR[sample[i + c]] * gains[c]);
  const target = render(corrected, { ...fixed, temperature: base.temperature, tint: base.tint });
  // Compared on code values: the sliders are code-value offsets, so this spreads the fit evenly over dark and light
  // tones (in linear light the brightest pixels would decide it and mid greys would keep a cast).
  const targetCode = Float64Array.from(target, (v, i) => (i % 4 === 3 ? 0 : v / 255));
  const cache = new Map();
  const loss = (t, n) => {
    const key = t * 1000 + n; if (cache.has(key)) return cache.get(key);
    const out = render(sample, { ...fixed, temperature: t, tint: n });
    let sum = 0; for (let i = 0; i < out.length; i++) if (i % 4 !== 3) sum += (out[i] / 255 - targetCode[i]) ** 2;
    const value = sum / (out.length * .75) + 1e-9 * ((t - base.temperature) ** 2 + (n - base.tint) ** 2); // ties go to the smaller change
    cache.set(key, value); return value;
  };
  let best = [Math.round(base.temperature), Math.round(base.tint)], bestLoss = loss(...best);
  const search = (centre, radius, step) => {
    const [t0, n0] = centre;
    for (let t = Math.max(-100, t0 - radius); t <= Math.min(100, t0 + radius); t += step) for (let n = Math.max(-100, n0 - radius); n <= Math.min(100, n0 + radius); n += step) {
      const l = loss(t, n); if (l < bestLoss - 1e-15) { bestLoss = l; best = [t, n]; }
    }
  };
  search([0, 0], 100, 8); search(best, 8, 2); search(best, 2, 1);
  return { temperature: best[0], tint: best[1] };
}

/** Words for what changed (gains: what was multiplied to remove the cast). */
export function castReason(gains) {
  const [r, g, b] = gains, warm = Math.log2(b / r), green = Math.log2(Math.sqrt(r * b) / g);
  const parts = [];
  if (Math.abs(warm) > .04) parts.push(warm > 0 ? 'a warm cast' : 'a cool cast');
  if (Math.abs(green) > .04) parts.push(green > 0 ? 'a green tint' : 'a magenta tint');
  return parts.length ? `Removed ${parts.join(' and ')}` : 'Colour was already neutral';
}

/** Auto WB for one photo. `data`: the Adjust input (RGBA, ≤ 256 px); `a`: the effective Adjust values; `base`: the
 *  Temperature and Tint the look itself sets. → { change: boolean, temperature, tint, confidence, reason }. */
export function autoWhiteBalance(data, a, base) {
  const cast = estimateCast(data);
  if (cast.confidence < MIN_CONFIDENCE) return { change: false, confidence: cast.confidence, reason: 'Colour looks intentional: no change' };
  const fit = fitWhiteBalance(data, a, cast.gains, base);
  return { change: true, ...fit, confidence: cast.confidence, reason: castReason(cast.gains) };
}
/** The picker's version: no confidence gate (the user chose the neutral). */
export function pickWhiteBalance(data, width, height, x, y, size, a, base) {
  const picked = neutralGains(data, width, height, x, y, size);
  if (picked.error) return { change: false, error: picked.error, reason: picked.error === 'clipped' ? 'That spot is clipped: pick a grey that isn’t pure white or black' : 'That spot is too dark: pick a lighter grey' };
  return { change: true, ...fitWhiteBalance(data, a, picked.gains, base), reason: castReason(picked.gains) };
}

// ---------- Auto Enhance (Task 4, A§5.2 and A§5.4) ----------
export const ENHANCE_KEYS = ['exposure', 'brightness', 'contrast', 'highlights', 'shadows', 'temperature', 'tint', 'vibrance'];
const RANGE = { exposure: [-2, 2, .05], brightness: [-100, 100, 1], contrast: [-100, 100, 1], highlights: [-100, 100, 1], shadows: [-100, 100, 1], temperature: [-100, 100, 1], tint: [-100, 100, 1], vibrance: [-100, 100, 1] };
const LAMBDA = { exposure: .02, brightness: .04, contrast: .06, highlights: .08, shadows: .08, temperature: .05, tint: .05, vibrance: .1 };
const quantize = (key, v) => { const [min, max, step] = RANGE[key]; return Math.min(max, Math.max(min, Number((Math.round(v / step) * step).toFixed(4)))); };
// Temperature and Tint are code-value offsets: left to the descent they act as extra brightness knobs. They come from
// the white-balance fit only; the descent moves the tone controls.
const DESCENT_KEYS = ['exposure', 'brightness', 'contrast', 'highlights', 'shadows']; // Vibrance stays the look's (it only moved as a side effect on luminance)

/** Statistics of a rendered sample: linear-luminance percentiles and clipped fractions (code values, as Task 2). */
function stats(rgba) {
  const ys = [], n = rgba.length / 4; let white = 0, black = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    ys.push(lumaOf(LINEAR[r], LINEAR[g], LINEAR[b]));
    if (r >= 253 || g >= 253 || b >= 253) white++; else if (r <= 2 && g <= 2 && b <= 2) black++;
  }
  ys.sort((x, y) => x - y);
  const at = p => ys[Math.min(ys.length - 1, Math.floor(p * (ys.length - 1)))];
  return { p5: at(.05), p50: at(.5), p95: at(.95), p99: at(.99), p995: at(.995), white: white / n, black: black / n };
}

/** Auto Enhance for one photo. `data`: the Adjust input (RGBA, ≤ 256 px); `a`: effective Adjust values; `base`: the
 *  look's own values (edits are measured from them, so a preset's character stays). → { values (effective, the 8 keys),
 *  reasons [], confidence, lowKey/highKey }. Deterministic. */
export function autoEnhance(data, a, base) {
  const sample = samplePixels(data, 4096), fixed = { ...a, grain: 0, vignette: 0 };
  const start = { ...fixed, ...Object.fromEntries(ENHANCE_KEYS.map(key => [key, base[key]])) };
  const source = stats(render(sample, start)); // the look as it is, without edits: its own clipping isn't penalised
  // A§5.2: exposure from the input's luminance (code-value exposure: 2^EV multiplies code values).
  const input = stats(sample);
  let ev = Math.min(1.5, Math.max(-1.5, Math.log2(.18 / Math.max(source.p50, 1e-6)) / 2.2));
  // (keyed scenes: computed below, before the first render, from the same median) // ≈ code-value stops for a linear median shift
  if (ev > 0) ev = Math.min(ev, Math.log2(.98 / Math.max(source.p995, 1e-6)) / 2.2);
  let dark = 0, bright = 0; for (let i = 0; i < sample.length; i += 4) { const y = lumaOf(LINEAR[sample[i]], LINEAR[sample[i + 1]], LINEAR[sample[i + 2]]); if (y < .03) dark++; else if (y > .8) bright++; } // low-key: 70 % below Y 0.03 (A§5.2 says 0.1, which also caught photos two stops under)
  const pixels = sample.length / 4, lowKey = dark > .7 * pixels, highKey = bright > .7 * pixels;
  const keyed = lowKey || highKey;
  if (keyed) ev /= 2; // intentional low-/high-key scenes keep most of their mood
  const wb = estimateCast(data);
  const x = { ...Object.fromEntries(ENHANCE_KEYS.map(key => [key, base[key]])), exposure: quantize('exposure', base.exposure + ev) };
  if (wb.confidence >= MIN_CONFIDENCE) Object.assign(x, fitWhiteBalance(data, { ...start, exposure: x.exposure }, wb.gains, base));
  const bounds = key => {
    const b = base[key], [min, max] = RANGE[key];
    const reach = key === 'exposure' ? 1.5 : key === 'temperature' || key === 'tint' ? 40 : key === 'vibrance' ? null : 30;
    return key === 'vibrance' ? [Math.max(min, b), Math.min(max, b + 25)] : [Math.max(min, b - reach), Math.min(max, b + reach)];
  };
  // Low-/high-key: aim three-quarters of the way toward the scene's own median, not at middle grey.
  const e = 1e-4, midTarget = keyed ? 2 ** (.25 * Math.log2(.18) + .75 * Math.log2(Math.max(source.p50, 1e-4))) : .18;
  const cache = new Map();
  const loss = values => {
    const key = ENHANCE_KEYS.map(k => values[k]).join();
    if (cache.has(key)) return cache.get(key);
    const s = stats(render(sample, { ...fixed, ...values }));
    let l = 4 * Math.log2((s.p50 + e) / (midTarget + e)) ** 2 + 2 * Math.max(0, .02 - s.p5) ** 2 + 2 * Math.max(0, s.p99 - .98) ** 2
      + 50 * Math.max(0, s.white - source.white - .005) ** 2 + 30 * Math.max(0, s.black - source.black - .005) ** 2 + .5 * Math.max(0, .55 - (s.p95 - s.p5)) ** 2;
    for (const k of ENHANCE_KEYS) l += LAMBDA[k] * ((values[k] - base[k]) / (RANGE[k][1] - RANGE[k][0])) ** 2;
    cache.set(key, { l, s }); return { l, s };
  };
  // Coordinate descent: fixed order, steps of 25, 10, 5, 2 and 1 % of each range (never under the slider step).
  let best = loss(x).l;
  for (const fraction of [.25, .1, .05, .02, .01]) {
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (const key of DESCENT_KEYS) {
        const [lo, hi] = bounds(key), step = Math.max(RANGE[key][2], quantize(key, (RANGE[key][1] - RANGE[key][0]) * fraction));
        for (const candidate of [x[key] - step, x[key] + step]) {
          const v = quantize(key, candidate); if (v < lo - 1e-9 || v > hi + 1e-9) continue;
          const l = loss({ ...x, [key]: v }).l;
          if (l < best - 1e-9 || (Math.abs(l - best) <= 1e-9 && Math.abs(v - base[key]) < Math.abs(x[key] - base[key]))) { best = l; x[key] = v; improved = true; }
        }
      }
      if (!improved) break;
    }
  }
  // Clip guard: back exposure off one step at a time until new clipping is ≤ 0.5 % at each end.
  for (let i = 0; i < 80; i++) {
    const { s } = loss(x);
    if (s.white - source.white <= .005 && s.black - source.black <= .005) break;
    const step = RANGE.exposure[2], toward = s.white - source.white > .005 ? -step : step;
    const next = quantize('exposure', x.exposure + toward); if (next === x.exposure) break; x.exposure = next;
  }
  const reasons = [], d = key => x[key] - base[key];
  if (d('exposure') >= .1 || d('brightness') >= 5) reasons.push('Brightened midtones'); else if (d('exposure') <= -.1 || d('brightness') <= -5) reasons.push('Toned down the brightness');
  if (d('highlights') <= -5) reasons.push('protected highlights'); if (d('shadows') >= 5) reasons.push('lifted shadows');
  if (d('contrast') >= 5) reasons.push('added contrast'); else if (d('contrast') <= -5) reasons.push('softened contrast');
  if (Math.abs(d('temperature')) >= 3 || Math.abs(d('tint')) >= 3) reasons.push('corrected colour'); if (d('vibrance') >= 5) reasons.push('added vibrance');
  if (wb.confidence < MIN_CONFIDENCE) reasons.push('left colour as it was (it looks intentional)');
  if (keyed) reasons.push(lowKey ? 'kept the dark mood' : 'kept the bright, airy look');
  const confidence = Math.min(1, (wb.confidence >= MIN_CONFIDENCE ? .5 + wb.confidence / 2 : .6) * (keyed ? .7 : 1));
  return { values: Object.fromEntries(ENHANCE_KEYS.map(key => [key, x[key]])), reasons, confidence, lowKey, highKey, input: { p50: input.p50 } };
}

/** CIE76 ΔE of an 8-bit sRGB colour from the neutral grey of the same lightness (fixtures). */
export function deltaEFromNeutral(r8, g8, b8) {
  const [r, g, b] = [LINEAR[r8], LINEAR[g8], LINEAR[b8]];
  const x = (.4124 * r + .3576 * g + .1805 * b) / .95047, y = .2126 * r + .7152 * g + .0722 * b, z = (.0193 * r + .1192 * g + .9505 * b) / 1.08883;
  const f = t => (t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const a = 500 * (f(x) - f(y)), bb = 200 * (f(y) - f(z));
  return Math.hypot(a, bb);
}
export { encode as encodeLinear, LINEAR as linearOf };
