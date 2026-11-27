// Histogram and clipping (plan_workflow.md Task 2, A§4 with C6). Pure (typed arrays in, numbers out) so
// tools/workflow-fixtures.mjs can check it against hand counts. Display bins are 8-bit encoded values (what the
// sliders move), not linear light; clipping is judged on code values: a shadow pixel has every channel ≤ `shadow`,
// a highlight pixel has any channel ≥ `highlight`. Pixels count by their alpha (a half-transparent pixel is half).

export const CLIP = Object.freeze({ shadow: 2, highlight: 253 });
const luma = (r, g, b) => Math.round(.2126 * r + .7152 * g + .0722 * b); // Rec. 709 weights on code values

/** RGBA bytes → { luma, r, g, b: Float64Array(256), total, shadows, highlights } (clipped fractions of `total`). */
export function histogram(data, { shadow = CLIP.shadow, highlight = CLIP.highlight } = {}) {
  const bins = { luma: new Float64Array(256), r: new Float64Array(256), g: new Float64Array(256), b: new Float64Array(256) };
  let total = 0, shadows = 0, highlights = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]; if (!a) continue;
    const w = a / 255, r = data[i], g = data[i + 1], b = data[i + 2];
    bins.r[r] += w; bins.g[g] += w; bins.b[b] += w; bins.luma[luma(r, g, b)] += w;
    total += w;
    if (r <= shadow && g <= shadow && b <= shadow) shadows += w;
    else if (r >= highlight || g >= highlight || b >= highlight) highlights += w;
  }
  return { ...bins, total, shadows: total ? shadows / total : 0, highlights: total ? highlights / total : 0 };
}

/** The value below which `p` (0–1) of the weight lies, from 256 bins. */
export function percentile(bins, total, p) {
  const target = p * total;
  let sum = 0;
  for (let v = 0; v < 256; v++) { sum += bins[v]; if (sum >= target && sum > 0) return v; }
  return 255;
}

/** Per pixel: 0 fine, 1 shadow clipped, 2 highlight clipped (transparent pixels are 0). */
export function clipMask(data, { shadow = CLIP.shadow, highlight = CLIP.highlight } = {}) {
  const mask = new Uint8Array(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (!data[i + 3]) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r <= shadow && g <= shadow && b <= shadow) mask[p] = 1;
    else if (r >= highlight || g >= highlight || b >= highlight) mask[p] = 2;
  }
  return mask;
}

/** The hatch drawn over clipped pixels, as RGBA: highlights in stripes one way (warm), shadows the other way (cool),
 *  so the two read apart without colour. `period` px per stripe repeat. */
export function hatchPixels(mask, width, height, period = 6) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0, p = 0; y < height; y++) for (let x = 0; x < width; x++, p++) {
    const kind = mask[p]; if (!kind) continue;
    const stripe = kind === 2 ? (x + y) % period < period / 2 : (x - y + height * period) % period < period / 2;
    const o = p * 4;
    if (kind === 2) { out[o] = stripe ? 255 : 30; out[o + 1] = stripe ? 40 : 0; out[o + 2] = stripe ? 60 : 0; out[o + 3] = stripe ? 230 : 90; }
    else { out[o] = stripe ? 60 : 0; out[o + 1] = stripe ? 150 : 20; out[o + 2] = 255; out[o + 3] = stripe ? 230 : 90; }
  }
  return out;
}

/** "Shadows clipped 0.4 %, highlights 2.1 %" (for screen readers and the line under the graph). */
export function clipSummary({ shadows, highlights }) {
  const pct = value => (value === 0 ? '0' : value < .001 ? '< 0.1' : (value * 100).toFixed(1));
  return `Shadows clipped ${pct(shadows)} %, highlights ${pct(highlights)} %`;
}
