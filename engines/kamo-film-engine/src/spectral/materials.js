// Adapters from the upstream JSON (as published) to runtime spectral materials
// on the engine wavelength grid. Nothing here invents data: where a series is
// missing the material says so in `assumptions`.

import {
  WAVELENGTHS, N_WL, makeCurve, normalizeSum, planck, resampleToGrid,
} from './math.js';

const CHANNELS = ['R', 'G', 'B'];
const LAYERS = ['cyan', 'magenta', 'yellow']; // red-, green-, blue-sensitive

/** Grid resample in log space (for responsivities spanning decades). */
function resampleLogLinear(xs, linearValues) {
  const logs = linearValues.map(value => (value == null ? null : Math.log10(Math.max(value, 1e-7))));
  const out = resampleToGrid(xs, logs, { edge: 'hold' });
  return Float64Array.from(out, value => (value <= -6.9 ? 0 : 10 ** value));
}

function densitometer(raw) {
  const r = raw.responsivity_linear_peak1;
  return [r.red, r.green, r.blue].map(series => normalizeSum(resampleLogLinear(raw.wavelength_nm, series)));
}

export function buildStandards(raw) {
  const cmf = ['x_bar', 'y_bar', 'z_bar'].map(key => resampleToGrid(raw.cmf.wavelength_nm, raw.cmf[key]));
  return Object.freeze({
    cmf,
    statusM: densitometer(raw.statusM),
    statusA: densitometer(raw.statusA),
    d50: resampleToGrid(raw.d50.wavelength_nm, raw.d50.spd),
  });
}

/** Spectral power of an illuminant at a correlated colour temperature. */
export function illuminant(standards, kelvin) {
  // Daylight-range sources: CIE D50 re-tilted by a Planck ratio. This is an
  // approximation of the CIE daylight locus, adequate for 4000–10000 K.
  // Lower temperatures use a Planckian (tungsten) radiator.
  if (kelvin < 4000) return planck(kelvin);
  const ratio = planck(kelvin);
  const base = planck(5003);
  return Float64Array.from(standards.d50, (value, i) => value * ratio[i] / base[i]);
}

/** Sensitivity in log10 units → linear, zero outside each layer's traced support. */
function layerSensitivity(xs, logs) {
  const valid = xs.map((x, i) => (logs[i] == null ? null : x)).filter(x => x != null);
  const lo = Math.min(...valid), hi = Math.max(...valid);
  const resampled = resampleToGrid(xs, logs, { edge: 'hold' });
  return Float64Array.from(resampled, (value, i) => (WAVELENGTHS[i] < lo || WAVELENGTHS[i] > hi ? 0 : 10 ** value));
}

function pickDyeSeries(rawDyes) {
  const fine = rawDyes.fine_curves_1nm;
  if (fine && LAYERS.every(layer => Array.isArray(fine[layer]))) return fine;
  return rawDyes.shared_full_curves;
}

function curvePoints(xs, ys) {
  const px = [], py = [];
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] == null || !Number.isFinite(ys[i])) continue;
    px.push(xs[i]); py.push(ys[i]);
  }
  return [px, py];
}

/**
 * Build a runtime film material from the three upstream files.
 * @param {object} entry  catalog entry from spectral/catalog.js
 * @param {{curves: object, dyes: object, sensitivity: object}} raw
 */
export function buildFilmStock(entry, raw) {
  const assumptions = [...entry.notes];
  const cc = raw.curves.char_curves;
  const densities = cc.density ?? cc.statusM_density ?? cc.statusA_density;
  if (!densities) throw new TypeError(`${entry.id}: no characteristic-curve densities.`);
  const reversal = entry.kind === 'color-reversal';
  const curves = CHANNELS.map(channel => {
    const [xs, ys] = curvePoints(cc.log_exposure, densities[channel]);
    return makeCurve(xs, ys);
  });
  // Minimum density per channel (base + fog, including the mask for negatives).
  const dmin = CHANNELS.map((channel, index) => cc.dmin?.[channel]
    ?? Math.min(...curves[index].range));

  const dyeSeries = pickDyeSeries(raw.dyes);
  const dyes = LAYERS.map(layer => resampleToGrid(dyeSeries.wavelength_nm, dyeSeries[layer], { edge: 'hold' }));
  if (dyeSeries.wavelength_nm.at(-1) < 740) {
    assumptions.push(`Dye spectra end at ${dyeSeries.wavelength_nm.at(-1)} nm and are held flat to 740 nm.`);
  }

  // Unexposed-film (base + mask) spectral density, used for printing.
  let dminSpectrum = new Float64Array(N_WL);
  const maskSource = raw.dyes.minimum_density
    ? [raw.dyes.minimum_density.wavelength_nm, raw.dyes.minimum_density.density]
    : raw.curves.spectral_full_support?.dmin
      ? [raw.curves.spectral_full_support.wavelength_nm, raw.curves.spectral_full_support.dmin]
      : raw.curves.spectral?.dmin
        ? [raw.curves.spectral.wavelength_nm, raw.curves.spectral.dmin]
        : null;
  if (!reversal && maskSource) {
    dminSpectrum = resampleToGrid(maskSource[0], maskSource[1], { edge: 'hold' });
  } else if (!reversal) {
    assumptions.push('No D-min spectrum available; the orange mask is not modelled.');
  }

  const sens = raw.sensitivity.log_sensitivity;
  const sensitivity = LAYERS.map(layer => layerSensitivity(raw.sensitivity.wavelength_nm, sens[layer]));

  // Normal exposure (18% grey) on the shared log-H axis.
  let logHGrey, anchor;
  if (Number.isFinite(cc.camera_stops_zero_logH)) {
    logHGrey = cc.camera_stops_zero_logH;
    anchor = 'datasheet camera-stops zero';
  } else if (!reversal) {
    // ISO-style speed point (green D-min + 0.15) plus the speed-point-to-grey
    // offset observed on the four VISION3 sheets (mean 1.24 log H).
    const speedPoint = curves[1].inverse(dmin[1] + 0.15);
    logHGrey = speedPoint + 1.24;
    anchor = 'speed point (G D-min + 0.15) + 1.24 log H';
  } else {
    logHGrey = curves[1].inverse(dmin[1] + 0.85);
    anchor = 'Status A green density D-min + 0.85';
  }
  if (!Number.isFinite(logHGrey)) throw new RangeError(`${entry.id}: could not anchor normal exposure.`);

  const mtf = buildMtf(raw.mtf);
  if (!mtf) assumptions.push('No MTF curve is published in the dataset; film sharpness is not modelled for this stock.');

  return Object.freeze({
    ...entry,
    reversal,
    mtf,
    curves,
    dmin,
    dyes,
    dminSpectrum,
    sensitivity,
    logHGrey,
    anchor,
    assumptions: Object.freeze(assumptions),
  });
}

/**
 * Fit a datasheet MTF curve as a weighted bank of Gaussian blurs,
 * M(f) = Σ w_k·exp(−2π²σ_k²f²) with Σ w_k = 1 (unit response at DC). Fixed,
 * log-spaced widths keep the fit linear (constrained ridge least squares).
 * Positive narrow terms are the image blur; negative wide terms reproduce the
 * developer adjacency effect that lifts response above 100 % at low frequency.
 * σ in mm, f in cycles/mm.
 */
export const MTF_BANK_UM = Object.freeze([1.5, 3, 6, 12, 24, 48, 100, 200]);

export function fitMtf(measuredFrequencies, measuredResponses) {
  const sigmas = MTF_BANK_UM.map(um => um / 1000);
  // Response returns to 100 % at very low frequency (the adjacency effect only
  // spans ~50–200 µm). Anchor that below the traced support so the wide bank
  // terms are not left unconstrained.
  const anchors = [0.3, 0.6, 1.2].filter(f => f < measuredFrequencies[0] / 2);
  const frequencies = [...anchors, ...measuredFrequencies];
  const responses = [...anchors.map(() => 1), ...measuredResponses];
  const G = (sigma, f) => Math.exp(-2 * Math.PI * Math.PI * sigma * sigma * f * f);
  const K = sigmas.length;
  // Eliminate the constraint: w_last = 1 − Σ others. Residual per point:
  //   Σ_k<K-1 w_k (G_k − G_last) − (r − G_last)
  const n = K - 1;
  const AtA = Array.from({ length: n }, () => new Float64Array(n));
  const Atb = new Float64Array(n);
  for (let i = 0; i < frequencies.length; i++) {
    const f = frequencies[i];
    const gLast = G(sigmas[K - 1], f);
    const row = sigmas.slice(0, n).map(s => G(s, f) - gLast);
    const y = responses[i] - gLast;
    for (let a = 0; a < n; a++) {
      Atb[a] += row[a] * y;
      for (let b = 0; b < n; b++) AtA[a][b] += row[a] * row[b];
    }
  }
  const ridge = 1e-3 * frequencies.length;
  for (let a = 0; a < n; a++) AtA[a][a] += ridge;
  // Gaussian elimination.
  const m = AtA.map((row, i) => [...row, Atb[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) if (r !== c) {
      const k = m[r][c] / m[c][c];
      for (let j = c; j <= n; j++) m[r][j] -= k * m[c][j];
    }
  }
  const weights = m.map((row, i) => row[n] / row[i]);
  weights.push(1 - weights.reduce((s, v) => s + v, 0));
  let error = 0;
  for (let i = 0; i < measuredFrequencies.length; i++) {
    const model = weights.reduce((s, w, k) => s + w * G(sigmas[k], measuredFrequencies[i]), 0);
    error += (model - measuredResponses[i]) ** 2;
  }
  return Object.freeze({
    bank: Object.freeze(sigmas.map((sigma, k) => Object.freeze({ sigma, weight: weights[k] }))),
    rms: Math.sqrt(error / measuredFrequencies.length), // on the traced points only
  });
}

function buildMtf(raw) {
  if (!raw?.curves) return null;
  const fitCurve = curve => fitMtf(curve.cycles_per_mm, curve.response_pct.map(v => v / 100));
  const curves = raw.curves;
  if (curves.MTF) {
    const fit = fitCurve(curves.MTF);
    return Object.freeze({ layers: [fit, fit, fit], source: 'single published MTF curve applied to all layers' });
  }
  if (!['R', 'G', 'B'].every(key => curves[key]?.cycles_per_mm?.length)) return null;
  return Object.freeze({ layers: ['R', 'G', 'B'].map(key => fitCurve(curves[key])), source: 'per-layer published MTF curves' });
}

/** Wratten filter densities resampled to the engine grid (for tricolor printing). */
export function buildEquipment(raw) {
  const density = series => resampleToGrid(series.wavelength_nm, series.density, { edge: 'hold' });
  return Object.freeze({
    wratten25: density(raw.wratten25),
    wratten99: density(raw.wratten99),
    wratten98: density(raw.wratten98),
    wratten2B: density(raw.wratten2B),
  });
}

/** Build a print film or paper from an upstream `layers` file. */
export function buildPrintMaterial(entry, raw) {
  const layers = LAYERS.map(name => raw.layers[name]);
  if (layers.some(layer => !layer?.hd)) throw new TypeError(`${entry.id}: characteristic curves are missing.`);
  return Object.freeze({
    ...entry,
    sensitivity: layers.map(layer => layerSensitivity(layer.sensitivity.wavelength_nm, layer.sensitivity.log_sensitivity)),
    dyes: layers.map(layer => resampleToGrid(layer.dye.wavelength_nm, layer.dye.density, { edge: 'hold' })),
    curves: layers.map(layer => {
      const [xs, ys] = curvePoints(layer.hd.logE, layer.hd.statusA_density);
      return makeCurve(xs, ys);
    }),
  });
}
