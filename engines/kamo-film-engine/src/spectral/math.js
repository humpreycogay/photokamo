// Shared numerical helpers for the spectral film pipeline.

export const WL_START = 400;
export const WL_END = 740;
export const WL_STEP = 5;
export const WAVELENGTHS = Float64Array.from(
  { length: (WL_END - WL_START) / WL_STEP + 1 }, (_, index) => WL_START + index * WL_STEP,
);
export const N_WL = WAVELENGTHS.length;
export const LN10 = Math.LN10;

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/**
 * Resample (xs, ys) onto the engine grid. JSON nulls mark "outside the traced
 * support"; they are skipped. Outside the support the value is 0 (`edge:
 * 'zero'`) or the nearest traced value (`edge: 'hold'`).
 */
export function resampleToGrid(xs, ys, { edge = 'zero', grid = WAVELENGTHS } = {}) {
  const px = [], py = [];
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i];
    if (y == null || !Number.isFinite(y) || !Number.isFinite(xs[i])) continue;
    px.push(xs[i]); py.push(y);
  }
  if (px.length < 2) throw new TypeError('Spectral series needs at least two samples.');
  const out = new Float64Array(grid.length);
  let j = 0;
  for (let i = 0; i < grid.length; i++) {
    const x = grid[i];
    if (x < px[0] || x > px[px.length - 1]) {
      out[i] = edge === 'hold' ? (x < px[0] ? py[0] : py[py.length - 1]) : 0;
      continue;
    }
    while (j < px.length - 2 && px[j + 1] < x) j++;
    const t = (x - px[j]) / (px[j + 1] - px[j] || 1);
    out[i] = py[j] + (py[j + 1] - py[j]) * t;
  }
  return out;
}

/** Relative Planck spectral radiance, normalised to 1 at 560 nm. */
export function planck(temperature, grid = WAVELENGTHS) {
  const c2 = 1.4387769e7; // nm·K
  const value = nm => nm ** -5 / Math.expm1(c2 / (nm * temperature));
  const ref = value(560);
  return Float64Array.from(grid, nm => value(nm) / ref);
}

export const dot = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

export function normalizeSum(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return Float64Array.from(values, value => value / total);
}

// Row-major 3×3 helpers.
export function mat3Mul(a, b) {
  const out = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  }
  return out;
}

export function mat3Vec(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function mat3Inverse(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-14) throw new RangeError('Singular 3×3 matrix.');
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

export const diag3 = ([x, y, z]) => [x, 0, 0, 0, y, 0, 0, 0, z];

// Linear Rec.709/sRGB (D65) ↔ CIE XYZ.
export const RGB709_TO_XYZ = [
  0.4124564, 0.3575761, 0.1804375,
  0.2126729, 0.7151522, 0.0721750,
  0.0193339, 0.1191920, 0.9503041,
];
export const XYZ_TO_RGB709 = mat3Inverse(RGB709_TO_XYZ);
export const D65_XYZ = [0.95047, 1, 1.08883];
// Linear Display P3 (D65) ↔ CIE XYZ.
export const P3_TO_XYZ = [
  0.4865709, 0.2656677, 0.1982173,
  0.2289746, 0.6917385, 0.0792869,
  0.0000000, 0.0451134, 1.0439444,
];
export const XYZ_TO_P3 = mat3Inverse(P3_TO_XYZ);

const BRADFORD = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
const BRADFORD_INV = mat3Inverse(BRADFORD);

/** Bradford chromatic adaptation matrix from one XYZ white to another. */
export function bradford(sourceWhite, targetWhite) {
  const s = mat3Vec(BRADFORD, sourceWhite);
  const t = mat3Vec(BRADFORD, targetWhite);
  return mat3Mul(BRADFORD_INV, mat3Mul(diag3([t[0] / s[0], t[1] / s[1], t[2] / s[2]]), BRADFORD));
}

/** Monotone table lookup with linear interpolation and clamped ends. */
export function makeCurve(xs, ys) {
  const x = Float64Array.from(xs), y = Float64Array.from(ys);
  const lo = x[0], hi = x[x.length - 1];
  // Resample onto a uniform table so evaluation is O(1).
  const step = 0.005;
  const n = Math.max(2, Math.round((hi - lo) / step) + 1);
  const table = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const xi = lo + (hi - lo) * (i / (n - 1));
    while (j < x.length - 2 && x[j + 1] < xi) j++;
    const t = (xi - x[j]) / (x[j + 1] - x[j] || 1);
    table[i] = y[j] + (y[j + 1] - y[j]) * clamp(t);
  }
  const scale = (n - 1) / (hi - lo);
  const evaluate = value => {
    if (!(value > lo)) return table[0];
    if (value >= hi) return table[n - 1];
    const f = (value - lo) * scale;
    const i = Math.floor(f);
    return table[i] + (table[i + 1] - table[i]) * (f - i);
  };
  evaluate.domain = [lo, hi];
  evaluate.range = [table[0], table[n - 1]];
  /** Inverse for monotone curves: x giving `target`, or null when outside. */
  evaluate.inverse = target => {
    for (let i = 1; i < x.length; i++) {
      const y0 = y[i - 1], y1 = y[i];
      if ((y0 <= target && target <= y1) || (y1 <= target && target <= y0)) {
        if (y1 === y0) return x[i - 1];
        return x[i - 1] + (target - y0) * (x[i] - x[i - 1]) / (y1 - y0);
      }
    }
    return null;
  };
  return evaluate;
}

export function seededRandom(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function srgbEncode(value) {
  if (!(value > 0)) return 0;
  if (value >= 1) return 1;
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

export function srgbDecode(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
