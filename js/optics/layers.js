// Reduced-size float layers for the optics pipeline: area downsampling in linear light, Gaussian blur
// (three box passes) and bilinear lookup tables to bring a layer back to full size.
// The working grid is at most WORK_EDGE px on its long side, so preview and full-size renders blur on
// (nearly) the same grid and look the same, and a 24 MP photo needs only a few MB of floats.
import { toLinear } from './color.js';

export const WORK_EDGE = 1024;

/** The photo (RGBA bytes) averaged down to the working grid, as linear { r, g, b } planes. */
export function downsample(data, width, height) {
  const scale = Math.min(1, WORK_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const r = new Float32Array(w * h), g = new Float32Array(w * h), b = new Float32Array(w * h), n = new Float32Array(w * h);
  const column = new Int32Array(width);
  for (let x = 0; x < width; x++) column[x] = Math.min(w - 1, (x * w / width) | 0);
  for (let y = 0, i = 0; y < height; y++) {
    const row = Math.min(h - 1, (y * h / height) | 0) * w;
    for (let x = 0; x < width; x++, i += 4) {
      const j = row + column[x];
      r[j] += toLinear[data[i]]; g[j] += toLinear[data[i + 1]]; b[j] += toLinear[data[i + 2]]; n[j]++;
    }
  }
  for (let j = 0; j < w * h; j++) { const k = n[j] ? 1 / n[j] : 0; r[j] *= k; g[j] *= k; b[j] *= k; }
  return { width: w, height: h, r, g, b };
}

/** One box pass of half-width `radius` along rows (step 1) or columns (step w), edges clamped. src → dst.
 *  Running sum; the clamped ends are handled inline (this is the hot loop of every blur). */
function boxPass(src, dst, count, length, stride, step, radius) {
  const scale = 1 / (2 * radius + 1), last = length - 1;
  for (let line = 0; line < count; line++) {
    const base = line * stride;
    let sum = src[base] * (radius + 1);
    for (let k = 1; k <= radius; k++) sum += src[base + (k > last ? last : k) * step];
    for (let k = 0, at = base; k < length; k++, at += step) {
      dst[at] = sum * scale;
      const add = k + radius + 1, sub = k - radius;
      sum += src[base + (add > last ? last : add) * step] - src[base + (sub < 0 ? 0 : sub) * step];
    }
  }
}

/** The same box pass down the columns, done a row at a time with one running sum per column, so memory is
 *  read in order (a column-by-column pass strides through the whole plane and is several times slower). */
function boxColumns(src, dst, width, height, radius) {
  const scale = 1 / (2 * radius + 1), last = height - 1, sum = new Float64Array(width);
  for (let x = 0; x < width; x++) sum[x] = src[x] * (radius + 1);
  for (let k = 1; k <= radius; k++) { const row = (k > last ? last : k) * width; for (let x = 0; x < width; x++) sum[x] += src[row + x]; }
  for (let y = 0; y < height; y++) {
    const out = y * width, add = (y + radius + 1 > last ? last : y + radius + 1) * width, sub = (y - radius < 0 ? 0 : y - radius) * width;
    for (let x = 0; x < width; x++) { dst[out + x] = sum[x] * scale; sum[x] += src[add + x] - src[sub + x]; }
  }
}

/** Gaussian blur of a plane with standard deviation `sigma` px: three box passes each way. Returns a new plane. */
export function blur(plane, width, height, sigma) {
  const out = Float32Array.from(plane);
  if (sigma < .3) return out;
  const tmp = new Float32Array(plane.length);
  // Box half-width so three passes have variance sigma² (each box of width 2r+1 adds ((2r+1)² − 1) / 12).
  const radius = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  for (let pass = 0; pass < 3; pass++) {
    boxPass(out, tmp, height, width, width, 1, radius);
    boxColumns(tmp, out, width, height, radius);
  }
  return out;
}

/** Bilinear reading of w × h layers at every pixel of a width × height image, a row at a time:
 *  `row(planes, y)` interpolates each plane between its two nearest rows (cheap: w values), then
 *  `x0`, `x1`, `fx` give the two columns and weight for full-size column x. */
export function upsampler(w, h, width, height) {
  const axis = (from, to) => {
    const i0 = new Int32Array(to), i1 = new Int32Array(to), f = new Float32Array(to);
    for (let x = 0; x < to; x++) {
      const p = Math.min(from - 1, Math.max(0, (x + .5) * from / to - .5)), a = p | 0;
      i0[x] = a; i1[x] = Math.min(from - 1, a + 1); f[x] = p - a;
    }
    return { i0, i1, f };
  };
  const xs = axis(w, width), ys = axis(h, height);
  const rows = new Map();
  const row = (planes, y) => planes.map(plane => {
    if (!rows.has(plane)) rows.set(plane, new Float32Array(w));
    const out = rows.get(plane), r0 = ys.i0[y] * w, r1 = ys.i1[y] * w, fy = ys.f[y];
    for (let k = 0; k < w; k++) out[k] = plane[r0 + k] + (plane[r1 + k] - plane[r0 + k]) * fy;
    return out;
  });
  return { row, x0: xs.i0, x1: xs.i1, fx: xs.f };
}
