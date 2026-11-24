// Spectral film pipeline.
//
//   scene RGB ─► reflectance spectrum ─► layer exposures H (exact 3×3 per illuminant)
//   film: per-layer dye-amount tables built from the sheet's NEUTRAL series
//         (Status M/A integral densities inverted once along the neutral), each
//         layer looked up on its own log H; optional DIR inhibition matrix with
//         neutral pre-compensation; spectral density incl. D-min/orange mask
//   print: tricolor (Wratten 47B/99/25 × 3200 K) or laser-line exposure through
//         the negative → per-layer print amount tables (Status A neutral series)
//         → viewing illuminant → CIE XYZ; auto-timed and optionally grey-locked
//   scan:  Status M reading of the negative, inverted per channel
//   slide: spectral transmittance under D50
//   XYZ ─► Bradford(media white → D65) ─► linear Rec.709 or Display P3
//
// Everything after layer exposure depends only on the three log exposures and is
// baked into a 3D LUT indexed by log H relative to normal exposure.

import {
  D65_XYZ, LN10, N_WL, RGB709_TO_XYZ, WAVELENGTHS, XYZ_TO_P3, XYZ_TO_RGB709,
  bradford, clamp, mat3Inverse, mat3Mul, mat3Vec, planck,
} from './math.js';
import { illuminant } from './materials.js';

export const LUT_SIZE = 49;        // negatives (print/scan)
export const LUT_SIZE_DIRECT = 65; // slides: steeper curves, cheap nodes
export const LUT_LOG_MIN = -3.0; // log10 H relative to normal exposure
export const LUT_LOG_MAX = 2.0;
const TABLE_MIN = -3.8, TABLE_MAX = 2.8, TABLE_STEP = 0.01; // film neutral-series grid (log H rel.)
const POINT = 0.025; // one printer point in log E
const DIR_MAX = 0.3;  // inhibition coefficient at interlayer 100 %

// Partition-of-unity reflectance basis (blue / green / red bands). A flat
// reflectance of k reconstructs from RGB (k, k, k) exactly, so neutrals stay
// neutral through every film by construction.
const BASIS_PARAMS = Object.freeze({ blueEdge: 495, redEdge: 585, width: 11 });

export function reflectanceBasis(standards, params = BASIS_PARAMS) {
  const sigmoid = centre => Float64Array.from(WAVELENGTHS, nm => 1 / (1 + Math.exp(-(nm - centre) / params.width)));
  const sBlue = sigmoid(params.blueEdge), sRed = sigmoid(params.redEdge);
  const bands = [sRed, sBlue.map((v, i) => v - sRed[i]), sBlue.map(v => 1 - v)];
  const d65 = illuminant(standards, 6504);
  const yNorm = standards.cmf[1].reduce((sum, v, i) => sum + v * d65[i], 0);
  const A = [];
  for (let c = 0; c < 3; c++) for (let m = 0; m < 3; m++) {
    let sum = 0;
    for (let i = 0; i < N_WL; i++) sum += standards.cmf[c][i] * bands[m][i] * d65[i];
    A.push(sum / yNorm);
  }
  const white = [A[0] + A[1] + A[2], A[3] + A[4] + A[5], A[6] + A[7] + A[8]];
  const target = mat3Mul(bradford(D65_XYZ, white), RGB709_TO_XYZ);
  const C = mat3Mul(mat3Inverse(A), target);
  return [0, 1, 2].map(k => Float64Array.from(WAVELENGTHS, (_, i) =>
    C[k] * bands[0][i] + C[3 + k] * bands[1][i] + C[6 + k] * bands[2][i]));
}

/**
 * Solves dye amounts a so the densitometer reads `target` above the base's
 * own reading (Jacobian seed + Gauss-Newton). Used only to build tables.
 */
export function makeDyeSolver(dyes, weights, base) {
  const baseT = Float64Array.from(base, d => Math.exp(-LN10 * d));
  const F0 = [0, 0, 0];
  const Q = [];
  for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let i = 0; i < N_WL; i++) s += weights[c][i] * baseT[i];
    F0[c] = -Math.log10(s);
    for (let j = 0; j < 3; j++) {
      let g = 0;
      for (let i = 0; i < N_WL; i++) g += weights[c][i] * baseT[i] * dyes[j][i];
      Q.push(g / s);
    }
  }
  const Qinv = mat3Inverse(Q);
  const T = new Float64Array(N_WL);
  const e0 = dyes[0], e1 = dyes[1], e2 = dyes[2];
  /** Densitometer reading (above base) of dye amounts a. */
  const read = a => {
    const out = [0, 0, 0];
    for (let i = 0; i < N_WL; i++) T[i] = baseT[i] * Math.exp(-LN10 * (a[0] * e0[i] + a[1] * e1[i] + a[2] * e2[i]));
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let i = 0; i < N_WL; i++) s += weights[c][i] * T[i];
      out[c] = -Math.log10(s) - F0[c];
    }
    return out;
  };
  const solve = (target, seed = null, iterations = 12) => {
    const a = seed ? [...seed] : mat3Vec(Qinv, target);
    const J = new Array(9);
    for (let it = 0; it < iterations; it++) {
      for (let i = 0; i < N_WL; i++) T[i] = baseT[i] * Math.exp(-LN10 * (a[0] * e0[i] + a[1] * e1[i] + a[2] * e2[i]));
      let worst = 0;
      const r = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        const w = weights[c];
        let s = 0, g0 = 0, g1 = 0, g2 = 0;
        for (let i = 0; i < N_WL; i++) {
          const wt = w[i] * T[i];
          s += wt; g0 += wt * e0[i]; g1 += wt * e1[i]; g2 += wt * e2[i];
        }
        r[c] = -Math.log10(s) - F0[c] - target[c];
        J[c * 3] = g0 / s; J[c * 3 + 1] = g1 / s; J[c * 3 + 2] = g2 / s;
        worst = Math.max(worst, Math.abs(r[c]));
      }
      if (worst < 1e-6) break;
      let step;
      try { step = mat3Vec(mat3Inverse(J), r); } catch { break; }
      for (let j = 0; j < 3; j++) a[j] = clamp(a[j] - step[j], -0.5, 10);
    }
    return a;
  };
  return { F0, read, solve };
}

/** Per-layer amount tables on a uniform x grid; at(j, x) interpolates (clamped). */
class LayerTable {
  constructor(x0, step, rows) {
    this.x0 = x0; this.step = step; this.n = rows.length;
    this.data = new Float64Array(rows.length * 3);
    rows.forEach((row, i) => { this.data[i * 3] = row[0]; this.data[i * 3 + 1] = row[1]; this.data[i * 3 + 2] = row[2]; });
    this.x1 = x0 + step * (rows.length - 1);
  }
  at(j, x) {
    let f = (x - this.x0) / this.step;
    if (!(f > 0)) return this.data[j];
    if (f >= this.n - 1) return this.data[(this.n - 1) * 3 + j];
    const i = f | 0; f -= i;
    const a = this.data[i * 3 + j];
    return a + (this.data[(i + 1) * 3 + j] - a) * f;
  }
}

function filterTransmissions(equipment) {
  const T = series => Float64Array.from(series, d => Math.max(10 ** -d, 0));
  const red = T(equipment.wratten25), green = T(equipment.wratten99);
  // No. 47B has no published sheet; No. 98 = 47B + 2B (Kodak catalogue), so
  // 47B ≈ 98 less 2B in density (upstream's default proxy).
  const blue = Float64Array.from(equipment.wratten98, (d, i) => Math.min(1, 10 ** -(d - equipment.wratten2B[i])));
  return [red, green, blue]; // band order matches layers: R→cyan, G→magenta, B→yellow
}

// Narkowicz ACES filmic fit; display rendering for the scan route only.
const filmic = x => {
  const value = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  return value > 1 ? 1 : value < 0 ? 0 : value;
};
function solveFilmicGain() {
  let lo = 0.1, hi = 4;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (filmic(0.18 * mid) < 0.18) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
const FILMIC_GAIN = solveFilmicGain();

/** Piecewise-linear lookup in a sorted { xs, ys } map, clamped at the ends. */
function lookupMap(map, x) {
  const { xs, ys } = map;
  if (x <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (x >= xs[last]) return ys[last];
  let lo = 0, hi = last;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + (ys[hi] - ys[lo]) * t;
}

function softClip(value, knee = 0.8) {
  if (value <= knee) return value < 0 ? 0 : value;
  return knee + (1 - knee) * (1 - Math.exp(-(value - knee) / (1 - knee)));
}

export const OUTPUT_SPACES = Object.freeze({
  srgb: { label: 'sRGB', fromXYZ: XYZ_TO_RGB709 },
  'display-p3': { label: 'Display P3', fromXYZ: XYZ_TO_P3 },
});

export class FilmPipeline {
  constructor(standards, stock, output, print = null, equipment = null) {
    if (!output.kinds.includes(stock.kind)) throw new RangeError(`${output.label} cannot render ${stock.kind}.`);
    if (output.type === 'print' && !print) throw new TypeError('Print output requires its print material.');
    if (output.printing === 'tricolor' && !equipment) throw new TypeError('Tricolor printing requires the Wratten filter data.');
    this.standards = standards;
    this.stock = stock;
    this.output = output;
    this.print = print;
    this.basis = reflectanceBasis(standards);
    this.filmWeights = stock.reversal ? standards.statusA : standards.statusM;
    this.filmBase = stock.reversal ? new Float64Array(N_WL) : stock.dminSpectrum;
    this.filmSolver = makeDyeSolver(stock.dyes, this.filmWeights, this.filmBase);
    this.designIlluminant = illuminant(standards, stock.designKelvin);
    this.designPlanck = planck(stock.designKelvin);
    this.designNorm = stock.sensitivity.map(S => {
      let sum = 0;
      for (let i = 0; i < N_WL; i++) sum += 0.18 * this.designIlluminant[i] * S[i];
      return sum;
    });
    this.gamma = stock.curves.map(curve => Math.abs(curve(stock.logHGrey + 0.3) - curve(stock.logHGrey - 0.3)) / 0.6);
    if (output.type !== 'scan') this.viewing = illuminant(standards, output.viewingKelvin ?? 5000);
    if (print) this.setupPrint(equipment);
    this.cache = new Map();
    this.lutCache = new Map();
  }

  // ---------------------------------------------------------------- exposure

  /** 3×3 matrix from linear Rec.709 scene RGB to layer exposures (datasheet lux·s axis). */
  exposureMatrix(sceneKelvin = this.stock.designKelvin, ev = 0) {
    const ratio = planck(sceneKelvin);
    const scene = Float64Array.from(this.designIlluminant, (value, i) => value * ratio[i] / this.designPlanck[i]);
    const scale = 2 ** ev * 10 ** this.stock.logHGrey;
    const matrix = [];
    for (let j = 0; j < 3; j++) {
      const S = this.stock.sensitivity[j];
      for (let k = 0; k < 3; k++) {
        let sum = 0;
        for (let i = 0; i < N_WL; i++) sum += this.basis[k][i] * scene[i] * S[i];
        matrix.push(scale * sum / this.designNorm[j]);
      }
    }
    return matrix;
  }

  /**
   * Log layer exposures (relative to normal) of a measured reflectance on the
   * engine grid, lit by `sceneKelvin` — bypasses RGB reconstruction, so it is
   * the reference path for validation against spectrally measured targets.
   */
  spectralLogExposure(reflectance, sceneKelvin = this.stock.designKelvin, ev = 0) {
    const ratio = planck(sceneKelvin);
    return [0, 1, 2].map(j => {
      const S = this.stock.sensitivity[j];
      let sum = 0;
      for (let i = 0; i < N_WL; i++) sum += reflectance[i] * this.designIlluminant[i] * ratio[i] / this.designPlanck[i] * S[i];
      return Math.log10(Math.max(1e-12, 2 ** ev * sum / this.designNorm[j]));
    });
  }

  /** Display-linear output (no Light/Color edits) for log exposures and film/print settings. */
  renderLogExposure(logRel, settings = {}) {
    const key = JSON.stringify(['node', settings.development ?? 1, settings.interlayer ?? 0, settings.neutralLock,
      settings.printRed ?? 0, settings.printGreen ?? 0, settings.printBlue ?? 0, settings.printDensity ?? 0, settings.outputSpace]);
    let node = this.cache.get(key);
    if (!node) {
      node = this.makeNodeRenderer({
        ...settings,
        neutralLock: settings.neutralLock ?? (this.output.type === 'direct' ? 0 : 100),
      }, [settings.printRed ?? 0, settings.printGreen ?? 0, settings.printBlue ?? 0]);
      this.cache.set(key, node);
    }
    return node(logRel, [0, 0, 0]);
  }

  // ------------------------------------------------------------- film stage

  /** Densitometric target of the neutral series at log H (relative) for a development γ. */
  neutralTarget(logRel, development) {
    const { stock } = this;
    return [0, 1, 2].map(c => {
      const d = stock.curves[c](stock.logHGrey + logRel);
      if (stock.reversal) {
        const grey = stock.curves[c](stock.logHGrey);
        return Math.max(stock.dmin[c], grey + development * (d - grey));
      }
      return Math.max(0, (d - stock.dmin[c]) * development);
    });
  }

  /** Per-layer film dye-amount tables along the neutral series (cached per γ). */
  filmTables(development) {
    const key = `film:${development}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const rows = [];
    let seed = null;
    for (let l = TABLE_MIN; l <= TABLE_MAX + 1e-9; l += TABLE_STEP) {
      seed = this.filmSolver.solve(this.neutralTarget(l, development), seed);
      rows.push([...seed]);
    }
    const table = new LayerTable(TABLE_MIN, TABLE_STEP, rows);
    this.cache.set(key, table);
    return table;
  }

  /**
   * Film stage closure: logRel (3) → dye amounts (3). DIR inhibition acts in
   * amount space; the pre-coupler tables are back-solved through its inverse
   * along the neutral so the sheet's neutral series is reproduced exactly.
   */
  filmAmounts(development, interlayer, shift = [0, 0, 0]) {
    const table = this.filmTables(development);
    const c = DIR_MAX * clamp(interlayer / 100);
    if (c <= 0) {
      return (logRel, out) => {
        out[0] = table.at(0, logRel[0] + shift[0]);
        out[1] = table.at(1, logRel[1] + shift[1]);
        out[2] = table.at(2, logRel[2] + shift[2]);
        return out;
      };
    }
    const key = `pre:${development}:${c}`;
    let pre = this.cache.get(key);
    if (!pre) {
      const DIR = [1, -c, -c, -c, 1, -c, -c, -c, 1];
      const inv = mat3Inverse(DIR);
      const rows = [];
      for (let i = 0; i < table.n; i++) {
        rows.push(mat3Vec(inv, [table.data[i * 3], table.data[i * 3 + 1], table.data[i * 3 + 2]]));
      }
      pre = new LayerTable(table.x0, table.step, rows);
      this.cache.set(key, pre);
    }
    return (logRel, out) => {
      const p0 = pre.at(0, logRel[0] + shift[0]);
      const p1 = pre.at(1, logRel[1] + shift[1]);
      const p2 = pre.at(2, logRel[2] + shift[2]);
      out[0] = p0 - c * (p1 + p2);
      out[1] = p1 - c * (p0 + p2);
      out[2] = p2 - c * (p0 + p1);
      return out;
    };
  }

  /** Writes the film's spectral density for dye amounts a. */
  filmSpectrum(a, out) {
    const [e0, e1, e2] = this.stock.dyes;
    const base = this.filmBase;
    for (let i = 0; i < N_WL; i++) out[i] = base[i] + a[0] * e0[i] + a[1] * e1[i] + a[2] * e2[i];
    return out;
  }

  // ------------------------------------------------------------ print stage

  setupPrint(equipment) {
    const { print, output, standards } = this;
    let bands;
    if (output.printing === 'laser') {
      // Laser lines (R, G, B order) deposited on the nearest grid samples.
      const lines = [...output.printerLines].sort((a, b) => b - a);
      bands = lines.map(line => {
        const band = new Float64Array(N_WL);
        const index = Math.round((line - WAVELENGTHS[0]) / (WAVELENGTHS[1] - WAVELENGTHS[0]));
        if (index >= 0 && index < N_WL) band[index] = 1;
        return band;
      });
    } else {
      const lamp = planck(output.printerKelvin ?? 3200);
      bands = filterTransmissions(equipment).map(T => Float64Array.from(T, (t, i) => t * lamp[i]));
    }
    // KS[f][j] = band_f × print-layer sensitivity_j
    this.printKernels = bands.map(band => print.sensitivity.map(S => Float64Array.from(S, (s, i) => s * band[i])));
    // Per-layer print amount tables along the Status A neutral series.
    const solver = makeDyeSolver(print.dyes, standards.statusA, new Float64Array(N_WL));
    const lo = Math.max(...print.curves.map(curve => curve.domain[0]));
    const hi = Math.min(...print.curves.map(curve => curve.domain[1]));
    const step = 0.01;
    const rows = [];
    let seed = null;
    for (let x = lo; x <= hi + 1e-9; x += step) {
      seed = solver.solve(print.curves.map(curve => curve(x)), seed);
      rows.push([...seed]);
    }
    this.printTable = new LayerTable(lo, step, rows);
    this.printAimLogE = print.curves[1].inverse(output.aimGreen);
    if (this.printAimLogE == null) throw new RangeError(`${output.label}: green aim outside the print curve.`);
  }

  /** Band × layer exposures of a negative spectral density: m[f*3+j]. */
  bandExposures(negDensity, out) {
    const T = this._T ??= new Float64Array(N_WL);
    for (let i = 0; i < N_WL; i++) T[i] = Math.exp(-LN10 * negDensity[i]);
    for (let f = 0; f < 3; f++) for (let j = 0; j < 3; j++) {
      const K = this.printKernels[f][j];
      let s = 0;
      for (let i = 0; i < N_WL; i++) s += K[i] * T[i];
      out[f * 3 + j] = s;
    }
    return out;
  }

  layerLogE(m, w, out) {
    for (let j = 0; j < 3; j++) out[j] = Math.log10(Math.max(1e-30, w[0] * m[j] + w[1] * m[3 + j] + w[2] * m[6 + j]));
    return out;
  }

  /** Print amounts → output-space RGB (white-normalised, not yet display-gained). */
  printToRgb(logE, adapt) {
    const a = [this.printTable.at(0, logE[0]), this.printTable.at(1, logE[1]), this.printTable.at(2, logE[2])];
    const [e0, e1, e2] = this.print.dyes;
    const spectrum = this._printSpectrum ??= new Float64Array(N_WL);
    for (let i = 0; i < N_WL; i++) spectrum[i] = a[0] * e0[i] + a[1] * e1[i] + a[2] * e2[i];
    return this.viewTransmittance(spectrum, adapt);
  }

  /**
   * Auto timing (band weights) and the grey-axis lock map for a development γ.
   * Band weights are solved so a normally exposed grey card exposes all three
   * layers at the neutral-series point of the green aim, then red/blue are
   * trimmed until the print is visually neutral. The lock records, along the
   * whole neutral ramp, the red/blue log E corrections that keep it neutral.
   */
  printCalibration(development, adapt) {
    const key = `printcal:${development}:${adapt.join(',')}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const amounts = this.filmAmounts(development, 0);
    const a = [0, 0, 0], spectrum = new Float64Array(N_WL), m = new Array(9);
    const negativeAt = l => this.bandExposures(this.filmSpectrum(amounts([l, l, l], a), spectrum), [...m]);
    const greyM = negativeAt(0);
    const target = [this.printAimLogE, this.printAimLogE, this.printAimLogE];
    // Band weights w (printer lights) so the grey negative exposes the layers at
    // t: E_j = Σ_f w_f m[f][j]. Solved for u = ln w by damped Gauss-Newton in
    // log E, so weights stay positive. Colour papers have native blue
    // sensitivity in every layer, so some negatives cannot hit t exactly with
    // physical (positive) light; the remainder is returned as a residual and
    // applied as a per-layer log E offset.
    const solveWeights = t => {
      const mt = [greyM[0], greyM[3], greyM[6], greyM[1], greyM[4], greyM[7], greyM[2], greyM[5], greyM[8]];
      let w;
      try { w = mat3Vec(mat3Inverse(mt), t.map(v => 10 ** v)); } catch { w = [-1, -1, -1]; }
      if (!w.every(v => v > 0)) w = [0, 1, 2].map(f => 10 ** t[f] / Math.max(greyM[f * 4], 1e-30));
      const u = w.map(Math.log);
      let lambda = 1e-3;
      const residual = uu => [0, 1, 2].map(j => Math.log10(
        Math.exp(uu[0]) * greyM[j] + Math.exp(uu[1]) * greyM[3 + j] + Math.exp(uu[2]) * greyM[6 + j]) - t[j]);
      let r = residual(u);
      for (let it = 0; it < 100; it++) {
        const E = [0, 1, 2].map(j => Math.exp(u[0]) * greyM[j] + Math.exp(u[1]) * greyM[3 + j] + Math.exp(u[2]) * greyM[6 + j]);
        const J = [];
        for (let j = 0; j < 3; j++) for (let f = 0; f < 3; f++) J.push(Math.exp(u[f]) * greyM[f * 3 + j] / (E[j] * Math.LN10));
        // (JᵀJ + λI) δ = Jᵀ r
        const JtJ = [], Jtr = [0, 0, 0];
        for (let a = 0; a < 3; a++) {
          for (let b = 0; b < 3; b++) JtJ.push(J[a] * J[b] + J[3 + a] * J[3 + b] + J[6 + a] * J[6 + b] + (a === b ? lambda : 0));
          Jtr[a] = J[a] * r[0] + J[3 + a] * r[1] + J[6 + a] * r[2];
        }
        const step = mat3Vec(mat3Inverse(JtJ), Jtr);
        const trial = u.map((v, f) => v - clamp(step[f], -2, 2));
        const rt = residual(trial);
        if (rt.reduce((s, v) => s + v * v, 0) < r.reduce((s, v) => s + v * v, 0)) {
          u.splice(0, 3, ...trial); r = rt; lambda = Math.max(1e-9, lambda / 3);
          if (Math.max(...r.map(Math.abs)) < 1e-7) break;
        } else {
          lambda *= 4;
          if (lambda > 1e6) break;
        }
      }
      return { w: u.map(Math.exp), residual: r.map(v => -v) };
    };
    let { w, residual } = solveWeights(target);
    const logE = [0, 0, 0];
    const rgbAt = (mm, ww, delta = [0, 0, 0]) => {
      this.layerLogE(mm, ww, logE);
      return this.printToRgb([logE[0] + delta[0], logE[1] + delta[1], logE[2] + delta[2]], adapt);
    };
    const castOf = (mm, ww, delta) => {
      const rgb = rgbAt(mm, ww, delta);
      const err = [Math.log10(rgb[0] / rgb[1]), Math.log10(rgb[2] / rgb[1])];
      return err.every(Number.isFinite) ? err : [Infinity, Infinity];
    };
    const balance = (mm, ww, start = [0, 0, 0]) => {
      // Damped Newton on log(R/G), log(B/G) over red/blue log E corrections;
      // a step is kept only if it reduces the cast (neutral may be unreachable
      // near the print's D-max/D-min, where the best attainable value is kept).
      const delta = [...start];
      let err = castOf(mm, ww, delta);
      for (let it = 0; it < 10; it++) {
        const size = Math.hypot(err[0], err[1]);
        if (size < 1e-5) break;
        const trial = [...delta];
        for (const [k, c] of [[0, 0], [1, 2]]) {
          const probeDelta = [...delta]; probeDelta[c] += 0.01;
          const slope = (castOf(mm, ww, probeDelta)[k] - err[k]) / 0.01;
          if (Math.abs(slope) > 1e-6 && Number.isFinite(slope)) {
            trial[c] = clamp(delta[c] - clamp(err[k] / slope, -0.2, 0.2), -0.6, 0.6);
          }
        }
        const trialErr = castOf(mm, ww, trial);
        if (Math.hypot(trialErr[0], trialErr[1]) < size) { delta.splice(0, 3, ...trial); err = trialErr; } else break;
      }
      return delta;
    };
    // Fold the mid-grey visual balance into the band weights (and any
    // unreachable remainder into the per-layer timing residual).
    const mid = balance(greyM, w, residual);
    ({ w, residual } = solveWeights([target[0] + mid[0] - residual[0], target[1], target[2] + mid[2] - residual[2]]));
    const baseDelta = balance(greyM, w, residual);
    const greyRgb = rgbAt(greyM, w, baseDelta);
    // Grey-axis lock along the neutral ramp: extra red/blue log E beyond baseDelta.
    // Sweep outward from mid-grey so each solve starts next to a good solution.
    const lockRows = [];
    for (const direction of [1, -1]) {
      let previous = [...baseDelta];
      const end = direction > 0 ? LUT_LOG_MAX + 0.5 : LUT_LOG_MIN - 0.5;
      for (let l = direction > 0 ? 0 : -0.05; direction > 0 ? l <= end + 1e-9 : l >= end - 1e-9; l += 0.05 * direction) {
        const mm = negativeAt(l);
        this.layerLogE(mm, w, logE);
        const raw = [logE[0] + baseDelta[0], logE[1] + baseDelta[1], logE[2] + baseDelta[2]];
        previous = balance(mm, w, previous);
        lockRows.push({ raw, delta: previous.map((v, c) => v - baseDelta[c]) });
      }
    }
    const lockMap = [0, 2].map(c => {
      const pairs = lockRows.map(row => [row.raw[c], row.delta[c]]).sort((p, q) => p[0] - q[0]);
      return { xs: Float64Array.from(pairs, p => p[0]), ys: Float64Array.from(pairs, p => p[1]) };
    });
    const result = { w, baseDelta, greyRgb, lockMap };
    this.cache.set(key, result);
    return result;
  }

  /**
   * Scan neutral ramp: for red and blue, a map from that channel's Status M
   * density (above D-min) to the green density at the same neutral exposure.
   */
  scanRamp(development) {
    const key = `scanramp:${development}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const amounts = this.filmAmounts(development, 0);
    const a = [0, 0, 0];
    const rows = [];
    for (let l = TABLE_MIN; l <= TABLE_MAX + 1e-9; l += 0.02) rows.push(this.filmSolver.read(amounts([l, l, l], a)));
    const mapFor = c => {
      const pairs = rows.map(d => [d[c], d[1]]).sort((p, q) => p[0] - q[0]);
      // Keep strictly increasing x for interpolation.
      const xs = [], ys = [];
      for (const [x, y] of pairs) if (!xs.length || x > xs[xs.length - 1] + 1e-9) { xs.push(x); ys.push(y); }
      return { xs: Float64Array.from(xs), ys: Float64Array.from(ys) };
    };
    const maps = [mapFor(0), null, mapFor(2)];
    this.cache.set(key, maps);
    return maps;
  }

  /** Red/blue log H trims that make a slide's neutral ramp D50-neutral (cached). */
  slideLock(development, interlayer, adapt) {
    const key = `slidelock:${development}:${interlayer}:${adapt.join(',')}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const amounts = this.filmAmounts(development, interlayer);
    const a = [0, 0, 0], spectrum = new Float64Array(N_WL);
    const cast = (l, d) => {
      const rgb = this.viewTransmittance(this.filmSpectrum(amounts([l + d[0], l, l + d[2]], a), spectrum), adapt);
      const err = [Math.log10(rgb[0] / rgb[1]), Math.log10(rgb[2] / rgb[1])];
      return err.every(Number.isFinite) ? err : [Infinity, Infinity];
    };
    const rows = [];
    for (const direction of [1, -1]) {
      const delta = [0, 0, 0];
      const end = direction > 0 ? LUT_LOG_MAX + 0.5 : LUT_LOG_MIN - 0.5;
      for (let l = direction > 0 ? 0 : -0.05; direction > 0 ? l <= end + 1e-9 : l >= end - 1e-9; l += 0.05 * direction) {
        let err = cast(l, delta);
        for (let it = 0; it < 25; it++) {
          const size = Math.hypot(err[0], err[1]);
          if (size < 1e-5) break;
          const step = [0, 0, 0];
          for (const [k, c] of [[0, 0], [1, 2]]) {
            const probe = [...delta]; probe[c] += 0.01;
            const slope = (cast(l, probe)[k] - err[k]) / 0.01;
            if (Math.abs(slope) > 1e-6 && Number.isFinite(slope)) step[c] = clamp(err[k] / slope, -0.2, 0.2);
          }
          // Backtracking: halve the step until the cast shrinks.
          let accepted = false;
          for (let scale = 1; scale > 0.02 && !accepted; scale /= 2) {
            const trial = delta.map((v, c) => clamp(v - scale * step[c], -0.8, 0.8));
            const trialErr = cast(l, trial);
            if (Math.hypot(trialErr[0], trialErr[1]) < size) { delta.splice(0, 3, ...trial); err = trialErr; accepted = true; }
          }
          if (!accepted) break;
        }
        rows.push([l, delta[0], delta[2]]);
      }
    }
    rows.sort((p, q) => p[0] - q[0]);
    const maps = [1, 2].map(k => ({ xs: Float64Array.from(rows, r => r[0]), ys: Float64Array.from(rows, r => r[k]) }));
    this.cache.set(key, maps);
    return maps;
  }

  // ----------------------------------------------------------------- viewing

  viewTransmittance(density, adapt) {
    const { cmf } = this.standards;
    let X = 0, Y = 0, Z = 0;
    for (let i = 0; i < N_WL; i++) {
      const p = this.viewing[i] * Math.exp(-LN10 * density[i]);
      X += p * cmf[0][i]; Y += p * cmf[1][i]; Z += p * cmf[2][i];
    }
    return adapt ? mat3Vec(adapt, [X, Y, Z]) : [X, Y, Z];
  }

  /** XYZ → output RGB with the media white (density spectrum) adapted to D65 at Y = 1. */
  adaptation(whiteDensity, outputSpace) {
    const whiteXYZ = this.viewTransmittance(whiteDensity);
    const s = 1 / whiteXYZ[1];
    const fromXYZ = (OUTPUT_SPACES[outputSpace] ?? OUTPUT_SPACES.srgb).fromXYZ;
    return mat3Mul(fromXYZ, mat3Mul(bradford(whiteXYZ.map(v => v * s), D65_XYZ), [s, 0, 0, 0, s, 0, 0, 0, s]));
  }

  // --------------------------------------------------------------- LUT build

  /** Builds (or returns cached) display LUT for the film/print parameters. */
  buildLut(params = {}) {
    const p = {
      development: params.development ?? 1,
      interlayer: params.interlayer ?? 0,
      neutralLock: params.neutralLock ?? (this.output.type === 'direct' ? 0 : 100),
      printRed: params.printRed ?? 0,
      printGreen: params.printGreen ?? 0,
      printBlue: params.printBlue ?? 0,
      printDensity: params.printDensity ?? 0,
      outputSpace: OUTPUT_SPACES[params.outputSpace] ? params.outputSpace : 'srgb',
    };
    const key = JSON.stringify(p);
    if (this.lutCache.has(key)) return this.lutCache.get(key);
    const node = this.makeNodeRenderer(p, [p.printRed, p.printGreen, p.printBlue]);
    const n = this.output.type === 'direct' ? LUT_SIZE_DIRECT : LUT_SIZE;
    const data = new Float32Array(n * n * n * 3);
    const logRel = [0, 0, 0];
    const rgb = [0, 0, 0];
    let offset = 0;
    for (let b = 0; b < n; b++) {
      logRel[2] = LUT_LOG_MIN + (LUT_LOG_MAX - LUT_LOG_MIN) * b / (n - 1);
      for (let g = 0; g < n; g++) {
        logRel[1] = LUT_LOG_MIN + (LUT_LOG_MAX - LUT_LOG_MIN) * g / (n - 1);
        for (let r = 0; r < n; r++) {
          logRel[0] = LUT_LOG_MIN + (LUT_LOG_MAX - LUT_LOG_MIN) * r / (n - 1);
          node(logRel, rgb);
          data[offset++] = rgb[0]; data[offset++] = rgb[1]; data[offset++] = rgb[2];
        }
      }
    }
    const lut = Object.freeze({
      size: n, min: LUT_LOG_MIN, max: LUT_LOG_MAX, data, outputSpace: p.outputSpace, info: node.info,
    });
    if (this.lutCache.size > 6) this.lutCache.delete(this.lutCache.keys().next().value);
    this.lutCache.set(key, lut);
    return lut;
  }

  /** node(logRel, outRgb) for a parameter set; outRgb is display-linear in the output space. */
  makeNodeRenderer(p, user = [0, 0, 0]) {
    const { stock, output } = this;
    const development = p.development ?? 1;
    const interlayer = p.interlayer ?? 0;
    const printDensity = p.printDensity ?? 0;
    const outputSpace = OUTPUT_SPACES[p.outputSpace] ? p.outputSpace : 'srgb';
    const a = [0, 0, 0];
    const spectrum = new Float64Array(N_WL);

    if (output.type === 'scan') {
      const amounts = this.filmAmounts(development, interlayer);
      const toOutput = outputSpace === 'srgb' ? null : mat3Mul(XYZ_TO_P3, RGB709_TO_XYZ);
      const greyDensity = this.filmSolver.read(this.filmAmounts(development, 0)([0, 0, 0], [0, 0, 0]));
      const gamma = this.gamma.map(value => Math.max(0.2, value * development));
      const shift = [0, 1, 2].map(c => (user[c] - printDensity) * POINT / gamma[c]);
      // Neutral lock for the scan: map red/blue density to the green density
      // the stock's own neutral ramp has at the same exposure, then invert all
      // channels with green's gamma — film tonality kept, greys neutral at every
      // exposure (what a scanner operator's per-channel neutral balance does).
      const strength = clamp((p.neutralLock ?? 100) / 100);
      const ramp = strength > 0 ? this.scanRamp(development) : null;
      const toGreen = (c, density) => lookupMap(ramp[c], density);
      const e = [0, 0, 0];
      const node = (logRel, out) => {
        const d = this.filmSolver.read(amounts(logRel, a));
        for (let c = 0; c < 3; c++) {
          let value = (d[c] - greyDensity[c]) / gamma[c];
          if (ramp && c !== 1) value += strength * ((toGreen(c, d[c]) - greyDensity[1]) / gamma[1] - value);
          e[c] = value + shift[c];
        }
        let r = filmic(0.18 * FILMIC_GAIN * 10 ** e[0]);
        let g = filmic(0.18 * FILMIC_GAIN * 10 ** e[1]);
        let b = filmic(0.18 * FILMIC_GAIN * 10 ** e[2]);
        if (toOutput) [r, g, b] = mat3Vec(toOutput, [r, g, b]);
        out[0] = r; out[1] = g; out[2] = b;
        return out;
      };
      node.info = { route: 'Status M scan', gamma, greyDensity };
      return node;
    }

    if (output.type === 'direct') {
      // Printer lights act like CC filtration on the exposure of a slide.
      const shift = [0, 1, 2].map(c => (user[c] - printDensity) * POINT);
      const amounts = this.filmAmounts(development, interlayer, shift);
      const whiteAmounts = this.filmAmounts(development, 0)([TABLE_MAX, TABLE_MAX, TABLE_MAX], [0, 0, 0]);
      const adapt = this.adaptation(this.filmSpectrum(whiteAmounts, new Float64Array(N_WL)), outputSpace);
      const greyAmounts = this.filmAmounts(development, 0)([0, 0, 0], [0, 0, 0]);
      const greyRgb = this.viewTransmittance(this.filmSpectrum(greyAmounts, spectrum), adapt);
      const lum = outputSpace === 'srgb' ? [0.2126729, 0.7151522, 0.072175] : [0.2289746, 0.6917385, 0.0792869];
      const gain = 0.18 / Math.max(1e-4, lum[0] * greyRgb[0] + lum[1] * greyRgb[1] + lum[2] * greyRgb[2]);
      // Optional neutral lock (default 0 for slides): the sheet's Status A
      // neutral series is not exactly D50-neutral once traced dyes and the CIE
      // observer meet (upstream flags this as unresolved, not to be fitted), so
      // correcting it is the user's choice, applied as red/blue exposure trims.
      const strength = clamp((p.neutralLock ?? 0) / 100);
      const lock = strength > 0 ? this.slideLock(development, interlayer, adapt) : null;
      const shifted = [0, 0, 0];
      const node = (logRel, out) => {
        let input = logRel;
        if (lock) {
          shifted[0] = logRel[0] + strength * lookupMap(lock[0], logRel[0]);
          shifted[1] = logRel[1];
          shifted[2] = logRel[2] + strength * lookupMap(lock[1], logRel[2]);
          input = shifted;
        }
        const rgb = this.viewTransmittance(this.filmSpectrum(amounts(input, a), spectrum), adapt);
        out[0] = softClip(rgb[0] * gain); out[1] = softClip(rgb[1] * gain); out[2] = softClip(rgb[2] * gain);
        return out;
      };
      node.info = { route: 'Direct view', displayGain: gain, greyRgb };
      return node;
    }

    // Negative → print.
    const amounts = this.filmAmounts(development, interlayer);
    const whiteLogE = [this.printTable.x0, this.printTable.x0, this.printTable.x0];
    const adapt = this.adaptation(Float64Array.from({ length: N_WL }, (_, i) =>
      this.printTable.at(0, whiteLogE[0]) * this.print.dyes[0][i]
      + this.printTable.at(1, whiteLogE[1]) * this.print.dyes[1][i]
      + this.printTable.at(2, whiteLogE[2]) * this.print.dyes[2][i]), outputSpace);
    const { w, baseDelta, greyRgb, lockMap } = this.printCalibration(development, adapt);
    const strength = clamp((p.neutralLock ?? 100) / 100);
    // Positive "R" slider = redder image = less red printing light (less cyan dye).
    const userShift = [0, 1, 2].map(c => (-user[c] + printDensity) * POINT);
    const m = new Array(9), logE = [0, 0, 0];
    const lookup = lookupMap;
    const lum = outputSpace === 'srgb' ? [0.2126729, 0.7151522, 0.072175] : [0.2289746, 0.6917385, 0.0792869];
    const greyY = lum[0] * greyRgb[0] + lum[1] * greyRgb[1] + lum[2] * greyRgb[2];
    // Reflection prints: paper white is display white. Projected prints are
    // seen in a dark surround, so mid-grey is anchored to 18% instead.
    const gain = output.viewing === 'reflection' ? 1 : 0.18 / Math.max(1e-4, greyY);
    const node = (logRel, out) => {
      this.bandExposures(this.filmSpectrum(amounts(logRel, a), spectrum), m);
      this.layerLogE(m, w, logE);
      logE[0] += baseDelta[0]; logE[1] += baseDelta[1]; logE[2] += baseDelta[2];
      if (strength > 0) {
        logE[0] += strength * lookup(lockMap[0], logE[0]);
        logE[2] += strength * lookup(lockMap[1], logE[2]);
      }
      logE[0] += userShift[0]; logE[1] += userShift[1]; logE[2] += userShift[2];
      const rgb = this.printToRgb(logE, adapt);
      out[0] = softClip(rgb[0] * gain); out[1] = softClip(rgb[1] * gain); out[2] = softClip(rgb[2] * gain);
      return out;
    };
    node.info = {
      route: output.printing === 'laser' ? 'Laser print' : 'Tricolor optical print',
      bandWeights: w, timingResidual: baseDelta, displayGain: gain, greyRgb,
    };
    return node;
  }
}
