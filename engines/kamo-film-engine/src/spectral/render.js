// Whole-image rendering through a FilmPipeline.
//
// Order (physical stages first):
//   input decode (sRGB 8-bit, optional highlight recovery; or scene-linear float)
//   → lateral CA → vignette (scene light) → layer exposures H
//   → halation (base reflection into the red/green layers) → log H
//   → film MTF per layer (log domain) → grain → film/print LUT (tetrahedral) → display editing (Light/Color)
//   → film amount → sharpening → output encode (sRGB or Display P3 transfer).
// Spatial scales are defined on a 36 mm frame so preview and export match.

import {
  P3_TO_XYZ, RGB709_TO_XYZ, XYZ_TO_P3, clamp, mat3Mul, seededRandom, srgbDecode,
} from './math.js';

const DECODE = Float32Array.from({ length: 256 }, (_, i) => srgbDecode(i / 255));
const ENCODE_SIZE = 4096;
const ENCODE = Float32Array.from({ length: ENCODE_SIZE + 1 }, (_, i) => {
  const v = i / ENCODE_SIZE;
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
});
const encode = v => (v <= 0 ? 0 : v >= 1 ? 1 : ENCODE[(v * ENCODE_SIZE + 0.5) | 0]);
const REC709_TO_P3 = mat3Mul(XYZ_TO_P3, RGB709_TO_XYZ);
const LUMA = {
  srgb: [0.2126729, 0.7151522, 0.072175],
  'display-p3': [P3_TO_XYZ[3], P3_TO_XYZ[4], P3_TO_XYZ[5]],
};

function boxBlur(src, width, height, radius, passes = 3) {
  if (radius < 1) return Float32Array.from(src);
  const a = Float32Array.from(src);
  const b = new Float32Array(src.length);
  const r = Math.round(radius);
  const span = 2 * r + 1;
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[row + clamp(k, 0, width - 1)];
      for (let x = 0; x < width; x++) {
        b[row + x] = sum / span;
        sum += a[row + Math.min(width - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    // Vertical pass row by row with per-column running sums (cache-friendly).
    const sums = new Float32Array(width);
    for (let k = -r; k <= r; k++) {
      const row = clamp(k, 0, height - 1) * width;
      for (let x = 0; x < width; x++) sums[x] += b[row + x];
    }
    for (let y = 0; y < height; y++) {
      const row = y * width;
      const add = Math.min(height - 1, y + r + 1) * width, sub = Math.max(0, y - r) * width;
      for (let x = 0; x < width; x++) {
        a[row + x] = sums[x] / span;
        sums[x] += b[add + x] - b[sub + x];
      }
    }
  }
  return a;
}

/** Gaussian blur with standard deviation `sigma` pixels (exact kernel when small). */
export function gaussianBlur(src, width, height, sigma) {
  if (!(sigma > 0.25)) return Float32Array.from(src);
  if (sigma > 2) {
    // Three box passes of radius r have variance r(r+1).
    const r = Math.max(1, Math.round((Math.sqrt(1 + 4 * sigma * sigma) - 1) / 2));
    return boxBlur(src, width, height, r, 3);
  }
  const radius = Math.ceil(3 * sigma);
  const kernel = new Float32Array(2 * radius + 1);
  let total = 0;
  for (let k = -radius; k <= radius; k++) total += kernel[k + radius] = Math.exp(-(k * k) / (2 * sigma * sigma));
  for (let k = 0; k < kernel.length; k++) kernel[k] /= total;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += kernel[k + radius] * src[row + clamp(x + k, 0, width - 1)];
      tmp[row + x] = s;
    }
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let k = -radius; k <= radius; k++) {
      const weight = kernel[k + radius];
      const src2 = clamp(y + k, 0, height - 1) * width;
      for (let x = 0; x < width; x++) out[row + x] += weight * tmp[src2 + x];
    }
  }
  return out;
}

function gaussian(random) {
  return (random() + random() + random() + random() - 2) * 1.7320508; // Irwin–Hall, unit variance
}

/** Unit-variance noise field with feature size `cellPx` pixels (bilinear cells). */
function noiseField(width, height, cellPx, random) {
  const out = new Float32Array(width * height);
  if (cellPx <= 1) {
    for (let i = 0; i < out.length; i++) out[i] = gaussian(random);
    return out;
  }
  const gw = Math.ceil(width / cellPx) + 2, gh = Math.ceil(height / cellPx) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = gaussian(random);
  let sumSq = 0;
  for (let y = 0; y < height; y++) {
    const gy = y / cellPx, y0 = gy | 0, fy = gy - y0;
    for (let x = 0; x < width; x++) {
      const gx = x / cellPx, x0 = gx | 0, fx = gx - x0;
      const i = y0 * gw + x0;
      const v = (grid[i] * (1 - fx) + grid[i + 1] * fx) * (1 - fy)
        + (grid[i + gw] * (1 - fx) + grid[i + gw + 1] * fx) * fy;
      out[y * width + x] = v; sumSq += v * v;
    }
  }
  const scale = 1 / Math.sqrt(sumSq / out.length || 1);
  for (let i = 0; i < out.length; i++) out[i] *= scale;
  return out;
}

function resampleScaled(plane, width, height, scale, cx = (width - 1) / 2, cy = (height - 1) / 2) {
  const out = new Float32Array(plane.length);
  for (let y = 0; y < height; y++) {
    const sy = clamp(cy + (y - cy) * scale, 0, height - 1);
    const y0 = Math.min(height - 2, sy | 0), fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = clamp(cx + (x - cx) * scale, 0, width - 1);
      const x0 = Math.min(width - 2, sx | 0), fx = sx - x0;
      const i = y0 * width + x0;
      out[y * width + x] = (plane[i] * (1 - fx) + plane[i + 1] * fx) * (1 - fy)
        + (plane[i + width] * (1 - fx) + plane[i + width + 1] * fx) * fy;
    }
  }
  return out;
}

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/**
 * Inverse of a generic camera highlight roll-off f(s) = s(W + a) / (W(s + a)),
 * with a = W/(W − 1) so the slope at black is 1 and f(W) = 1 (display white).
 */
export function recoverHighlights(display, stops) {
  if (!(stops > 0)) return display;
  const W = 2 ** stops;
  const a = W / (W - 1);
  const d = Math.min(display, 1);
  return (a * W * d) / (W + a - W * d) + Math.max(0, display - 1);
}

/** Display tone curve (Light group) over perceptual u = Y^(1/2.2), as a 1D table. */
function buildToneTable(s) {
  const size = 1024;
  const table = new Float32Array(size + 1);
  const a = 0.45 * s.contrast / 100;
  let previous = 0;
  for (let i = 0; i <= size; i++) {
    let u = i / size;
    u += a * (u - 0.5) * 4 * u * (1 - u);
    u += (s.shadows / 100) * 0.16 * Math.sin(Math.PI * clamp(u / 0.6));
    u += (s.highlights / 100) * 0.16 * Math.sin(Math.PI * clamp((u - 0.4) / 0.6));
    u += (s.whites / 100) * 0.15 * smoothstep(0.5, 1, u);
    u += (s.blacks / 100) * 0.08 * (1 - smoothstep(0, 0.5, u));
    u = Math.max(previous, u);
    table[i] = previous = u;
  }
  return table;
}

const toneIsIdentity = s => !s.contrast && !s.highlights && !s.shadows && !s.whites && !s.blacks;

/** Tetrahedral interpolation of an N³ RGB LUT (R fastest) at fractional coords. */
function tetra(table, n, fr, fg, fb, out) {
  const ir = fr | 0, ig = fg | 0, ib = fb | 0;
  const dr = fr - ir, dg = fg - ig, db = fb - ib;
  const sR = 3, sG = n * 3, sB = n * n * 3;
  const c000 = ib * sB + ig * sG + ir * sR;
  const c111 = c000 + sR + sG + sB;
  let w0, w1, w2, w3, c1, c2;
  if (dr >= dg) {
    if (dg >= db) { c1 = c000 + sR; c2 = c1 + sG; w0 = 1 - dr; w1 = dr - dg; w2 = dg - db; w3 = db; }
    else if (dr >= db) { c1 = c000 + sR; c2 = c1 + sB; w0 = 1 - dr; w1 = dr - db; w2 = db - dg; w3 = dg; }
    else { c1 = c000 + sB; c2 = c1 + sR; w0 = 1 - db; w1 = db - dr; w2 = dr - dg; w3 = dg; }
  } else if (db >= dg) { c1 = c000 + sB; c2 = c1 + sG; w0 = 1 - db; w1 = db - dg; w2 = dg - dr; w3 = dr; }
  else if (db >= dr) { c1 = c000 + sG; c2 = c1 + sB; w0 = 1 - dg; w1 = dg - db; w2 = db - dr; w3 = dr; }
  else { c1 = c000 + sG; c2 = c1 + sR; w0 = 1 - dg; w1 = dg - dr; w2 = dr - db; w3 = db; }
  out[0] = w0 * table[c000] + w1 * table[c1] + w2 * table[c2] + w3 * table[c111];
  out[1] = w0 * table[c000 + 1] + w1 * table[c1 + 1] + w2 * table[c2 + 1] + w3 * table[c111 + 1];
  out[2] = w0 * table[c000 + 2] + w1 * table[c1 + 2] + w2 * table[c2 + 2] + w3 * table[c111 + 2];
  return out;
}

/** Samples a pipeline LUT at log exposures (relative to normal). */
export function sampleLut(lut, logRel, out = [0, 0, 0]) {
  const scale = (lut.size - 1) / (lut.max - lut.min);
  const limit = lut.size - 1.000001;
  return tetra(lut.data, lut.size,
    clamp((logRel[0] - lut.min) * scale, 0, limit),
    clamp((logRel[1] - lut.min) * scale, 0, limit),
    clamp((logRel[2] - lut.min) * scale, 0, limit), out);
}

/**
 * Accepts either an 8-bit RGBA display image `{ width, height, data }` (sRGB)
 * or scene-linear Rec.709 input `{ width, height, linear: Float32Array, channels: 3|4 }`.
 */
function decodeInput(image, s) {
  const { width, height } = image;
  const n = width * height;
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
  const alpha = new Uint8ClampedArray(n);
  if (image.linear) {
    const ch = image.channels ?? 3;
    if (image.linear.length !== n * ch) throw new TypeError('Linear input length does not match its size.');
    for (let i = 0, p = 0; i < n; i++, p += ch) {
      R[i] = Math.max(0, image.linear[p]); G[i] = Math.max(0, image.linear[p + 1]); B[i] = Math.max(0, image.linear[p + 2]);
      alpha[i] = ch === 4 ? Math.round(clamp(image.linear[p + 3]) * 255) : 255;
    }
    return { R, G, B, alpha, linear: true };
  }
  const { data } = image;
  const stops = s.highlightRecovery;
  const table = stops > 0 ? Float32Array.from(DECODE, v => recoverHighlights(v, stops)) : DECODE;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    R[i] = table[data[p]]; G[i] = table[data[p + 1]]; B[i] = table[data[p + 2]]; alpha[i] = data[p + 3];
  }
  return { R, G, B, alpha, linear: false };
}

export function processSpectralImage(image, pipeline, settings, options = {}) {
  const { width, height } = image ?? {};
  const validDisplay = image?.data && image.data.length === width * height * 4;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2
      || (!validDisplay && !image?.linear)) {
    throw new TypeError('Expected an RGBA image (or linear input) of at least 2 × 2 pixels.');
  }
  const s = settings;
  const n = width * height;
  const frameWidthMm = options.frameWidthMm ?? 36;
  // `region` renders a crop of a larger frame (e.g. a 1:1 loupe): physical
  // scale and the optical centre come from the full frame, so vignette, CA,
  // grain, MTF and halation match the full render.
  const region = options.region ?? { x: 0, y: 0, fullWidth: width, fullHeight: height };
  const pitchUm = (frameWidthMm * 1000) / Math.max(region.fullWidth, region.fullHeight);
  const cx = (region.fullWidth - 1) / 2 - region.x, cy = (region.fullHeight - 1) / 2 - region.y;
  const diag = Math.hypot((region.fullWidth - 1) / 2, (region.fullHeight - 1) / 2) || 1;
  const pxPerMm = 1000 / pitchUm;
  const outputSpace = s.outputSpace === 'display-p3' ? 'display-p3' : 'srgb';

  // 1. Decode.
  const input = decodeInput(image, s);
  let { R, G, B } = input;
  const origR = input.R, origG = input.G, origB = input.B;

  // 2. Lateral chromatic aberration (red magnified, blue reduced).
  if (s.chromaticAberration > 0) {
    const k = (s.chromaticAberration / 100) * 0.006;
    R = resampleScaled(R, width, height, 1 - k, cx, cy);
    B = resampleScaled(B, width, height, 1 + k, cx, cy);
  }

  // 3–4. Vignette (scene light) and layer exposures.
  const M = pipeline.exposureMatrix(s.sceneKelvin, s.filmExposure);
  const HR = new Float32Array(n), HG = new Float32Array(n), HB = new Float32Array(n);
  const vignette = s.vignette / 100;
  const mid = 0.15 + 0.85 * (s.vignetteMidpoint / 100);
  const feather = 0.05 + 0.95 * (s.vignetteFeather / 100);
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      let gain = 1;
      if (vignette) {
        const r = Math.hypot(x - cx, y - cy) / diag;
        gain = 2 ** (2 * vignette * smoothstep(mid - feather / 2, mid + feather / 2, r));
      }
      const r0 = R[i] * gain, g0 = G[i] * gain, b0 = B[i] * gain;
      HR[i] = M[0] * r0 + M[1] * g0 + M[2] * b0;
      HG[i] = M[3] * r0 + M[4] * g0 + M[5] * b0;
      HB[i] = M[6] * r0 + M[7] * g0 + M[8] * b0;
    }
  }

  // 5. Halation: light reflected from the base re-exposes mostly the red layer.
  if (s.halation > 0) {
    const threshold = 4 * 10 ** pipeline.stock.logHGrey;
    const source = new Float32Array(n);
    for (let i = 0; i < n; i++) source[i] = Math.max(0, HR[i] - threshold);
    const glow = boxBlur(source, width, height, Math.max(1, 0.3 * pxPerMm));
    const k = 1.5 * s.halation / 100;
    for (let i = 0; i < n; i++) {
      HR[i] += k * 0.35 * glow[i];
      HG[i] += k * 0.07 * glow[i];
      HB[i] += k * 0.01 * glow[i];
    }
  }

  // 6. Log exposure relative to normal.
  const logGrey = pipeline.stock.logHGrey;
  let LR = new Float32Array(n), LG = new Float32Array(n), LB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    LR[i] = Math.log10(Math.max(HR[i], 1e-12)) - logGrey;
    LG[i] = Math.log10(Math.max(HG[i], 1e-12)) - logGrey;
    LB[i] = Math.log10(Math.max(HB[i], 1e-12)) - logGrey;
  }
  // 7. Film MTF per layer: the datasheet curve as a weighted bank of Gaussian
  //    blurs in physical units, applied to log exposure. Datasheet MTFs are
  //    small-signal measurements (identical in either domain), while the
  //    adjacency part is a development effect acting on density: in the log
  //    domain a 6-stop highlight edge cannot drive the negative lobes into a
  //    clipped, coloured ring. Widths below a quarter pixel act as identity.
  const mtf = pipeline.stock.mtf;
  const mtfAmount = (s.filmSharpness ?? 100) / 100;
  if (mtf && mtfAmount > 0) {
    const planes = [LR, LG, LB];
    for (let j = 0; j < 3; j++) {
      let identity = 0;
      const terms = [];
      for (const { sigma, weight } of mtf.layers[j].bank) {
        const px = sigma * pxPerMm;
        if (px < 0.25) identity += weight; else terms.push([px, weight]);
      }
      if (!terms.length) continue;
      const source = planes[j];
      const filtered = new Float32Array(n);
      for (let i = 0; i < n; i++) filtered[i] = source[i] * identity;
      // Cascade: G(σb) = G(σa) * G(√(σb² − σa²)), so each wider blur only adds
      // the incremental width to the previous one.
      terms.sort((p, q) => p[0] - q[0]);
      let current = source, previous = 0;
      for (const [px, weight] of terms) {
        current = gaussianBlur(current, width, height, Math.sqrt(Math.max(0, px * px - previous * previous)));
        previous = px;
        for (let i = 0; i < n; i++) filtered[i] += weight * current[i];
      }
      for (let i = 0; i < n; i++) filtered[i] = source[i] + mtfAmount * (filtered[i] - source[i]);
      planes[j] = filtered;
    }
    [LR, LG, LB] = planes;
  }

  // 8. Grain: per-layer density noise.
  if (s.grain > 0) {
    const clumpUm = 6 + (s.grainSize / 100) * 34;
    const cellPx = clumpUm / pitchUm;
    const amplitude = (s.grain / 100) * 0.11 * Math.min(1, cellPx);
    const random = seededRandom(s.seed);
    const shared = noiseField(width, height, cellPx, random);
    for (const plane of [LR, LG, LB]) {
      const own = noiseField(width, height, cellPx, random);
      for (let i = 0; i < n; i++) plane[i] += amplitude * (0.55 * shared[i] + 0.835 * own[i]);
    }
  }

  // 9. Film / print LUT (tetrahedral).
  const lut = pipeline.buildLut({ ...s, outputSpace });
  const size = lut.size, table = lut.data;
  const scale = (size - 1) / (lut.max - lut.min);
  const limit = size - 1.000001;
  const OR = new Float32Array(n), OG = new Float32Array(n), OB = new Float32Array(n);
  const px = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    tetra(table, size,
      clamp((LR[i] - lut.min) * scale, 0, limit),
      clamp((LG[i] - lut.min) * scale, 0, limit),
      clamp((LB[i] - lut.min) * scale, 0, limit), px);
    OR[i] = px[0]; OG[i] = px[1]; OB[i] = px[2];
  }

  // 10. Display editing (Light / Color).
  const [lr, lg, lb] = LUMA[outputSpace];
  const temp = s.temp / 100, tint = s.tint / 100;
  let gr = 2 ** (0.3 * temp), gg = 2 ** (-0.25 * tint), gb = 2 ** (-0.3 * temp);
  const norm = lr * gr + lg * gg + lb * gb;
  const exposure = 2 ** s.exposure / norm;
  gr *= exposure; gg *= exposure; gb *= exposure;
  const tone = toneIsIdentity(s) ? null : buildToneTable(s);
  const saturation = 1 + s.saturation / 100;
  const vibrance = s.vibrance / 100;
  const amount = s.amount / 100;
  const toOut = outputSpace === 'display-p3' ? REC709_TO_P3 : null;
  const encR = new Float32Array(n), encG = new Float32Array(n), encB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let r = OR[i] * gr, g = OG[i] * gg, b = OB[i] * gb;
    if (tone) {
      const Y = lr * r + lg * g + lb * b;
      if (Y > 1e-6) {
        const u = Y ** (1 / 2.2);
        let u2;
        if (u >= 1) u2 = tone[1024] + (u - 1);
        else {
          const f = u * 1024, k = f | 0;
          u2 = tone[k] + (tone[k + 1] - tone[k]) * (f - k);
        }
        const ratio = Math.max(0, u2) ** 2.2 / Y;
        r *= ratio; g *= ratio; b *= ratio;
      }
    }
    if (saturation !== 1 || vibrance) {
      const Y = lr * r + lg * g + lb * b;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const chroma = max > 1e-6 ? (max - min) / max : 0;
      const factor = Math.max(0, saturation * (1 + vibrance * (1 - chroma)));
      r = Y + (r - Y) * factor; g = Y + (g - Y) * factor; b = Y + (b - Y) * factor;
    }
    let er = encode(r), eg = encode(g), eb = encode(b);
    if (amount < 1) {
      // The original, in the output space (linear input is clipped to display range).
      let o0 = origR[i], o1 = origG[i], o2 = origB[i];
      if (toOut) {
        const t0 = toOut[0] * o0 + toOut[1] * o1 + toOut[2] * o2;
        const t1 = toOut[3] * o0 + toOut[4] * o1 + toOut[5] * o2;
        const t2 = toOut[6] * o0 + toOut[7] * o1 + toOut[8] * o2;
        o0 = t0; o1 = t1; o2 = t2;
      }
      const q0 = encode(o0), q1 = encode(o1), q2 = encode(o2);
      er = q0 + (er - q0) * amount; eg = q1 + (eg - q1) * amount; eb = q2 + (eb - q2) * amount;
    }
    encR[i] = er; encG[i] = eg; encB[i] = eb;
  }

  // 11. Sharpening (unsharp mask on encoded values).
  if (s.sharpening > 0) {
    const k = s.sharpening / 100;
    for (const plane of [encR, encG, encB]) {
      const blurred = boxBlur(plane, width, height, 1, 1);
      for (let i = 0; i < n; i++) plane[i] += k * (plane[i] - blurred[i]);
    }
  }

  // 12. Quantise with light dither; histogram.
  const out = new Uint8ClampedArray(n * 4);
  const histogram = options.histogram === false ? null
    : { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256) };
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const dither = ((i * 0.7548776662 + (i / width | 0) * 0.5698402910) % 1) - 0.5;
    const r = clamp(Math.round(encR[i] * 255 + dither), 0, 255);
    const g = clamp(Math.round(encG[i] * 255 + dither), 0, 255);
    const b = clamp(Math.round(encB[i] * 255 + dither), 0, 255);
    out[p] = r; out[p + 1] = g; out[p + 2] = b; out[p + 3] = input.alpha[i];
    if (histogram) { histogram.r[r]++; histogram.g[g]++; histogram.b[b]++; }
  }
  return { width, height, data: out, histogram, info: lut.info, outputSpace };
}
