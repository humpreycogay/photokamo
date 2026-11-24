const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function assertFiniteArray(value, length, name) {
  if (!Array.isArray(value) || value.length !== length
      || value.some(item => !Number.isFinite(item))) {
    throw new TypeError(`${name} must contain ${length} finite numbers.`);
  }
}

function interpolateCurve(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
    }
  }
  return points.at(-1)[1];
}

export function validateMaterialProfile(profile) {
  if (!profile || typeof profile !== 'object') throw new TypeError('Expected a material profile.');
  if (profile.schemaVersion !== 1) throw new RangeError('Unsupported material profile schema.');
  if (!profile.id || !['synthetic', 'measured'].includes(profile.status)) {
    throw new TypeError('Profile requires an id and synthetic/measured status.');
  }
  if (profile.kind && !['color-negative', 'monochrome-negative', 'color-reversal', 'direct-positive'].includes(profile.kind)) {
    throw new TypeError('Profile kind must identify a negative or direct-positive material.');
  }
  if (profile.status === 'measured' && (!profile.provenance?.sources?.length
      || profile.provenance.validation?.state !== 'approved')) {
    throw new TypeError('Measured profiles require sources and approved validation.');
  }
  const wavelengths = profile.wavelengths;
  if (!Array.isArray(wavelengths) || wavelengths.length < 3
      || wavelengths.some((value, index) => !Number.isFinite(value)
        || (index && value <= wavelengths[index - 1]))) {
    throw new TypeError('Wavelengths must be a strictly increasing finite array.');
  }
  if (!Array.isArray(profile.layers) || profile.layers.length < 1) {
    throw new TypeError('Profile requires layers.');
  }
  for (const [index, layer] of profile.layers.entries()) {
    assertFiniteArray(layer.sensitivity, wavelengths.length, `layers[${index}].sensitivity`);
    assertFiniteArray(layer.dyeDensity, wavelengths.length, `layers[${index}].dyeDensity`);
    if (!Array.isArray(layer.curve) || layer.curve.length < 2
        || layer.curve.some((point, pointIndex) => !Array.isArray(point) || point.length !== 2
          || point.some(value => !Number.isFinite(value))
          || (pointIndex && point[0] <= layer.curve[pointIndex - 1][0]))) {
      throw new TypeError(`layers[${index}].curve must be increasing [logExposure, density] points.`);
    }
  }
  for (const key of ['inputBasis', 'observer']) {
    if (!Array.isArray(profile[key]) || profile[key].length !== 3) {
      throw new TypeError(`${key} must contain three spectral arrays.`);
    }
    profile[key].forEach((row, index) =>
      assertFiniteArray(row, wavelengths.length, `${key}[${index}]`));
  }
  assertFiniteArray(profile.outputMatrix, 9, 'outputMatrix');
  return profile;
}

function reconstructSpectrum(rgb, basis) {
  return basis[0].map((_, wavelength) => Math.max(0,
    rgb[0] * basis[0][wavelength]
    + rgb[1] * basis[1][wavelength]
    + rgb[2] * basis[2][wavelength]));
}

function integrate(values, weights) {
  let sum = 0, normalization = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] * weights[i];
    normalization += weights[i];
  }
  return normalization > 0 ? sum / normalization : 0;
}

export function simulateMaterialPixel(linearRgb, profile, exposureEv = 0) {
  validateMaterialProfile(profile);
  assertFiniteArray(linearRgb, 3, 'linearRgb');
  return simulateValidatedMaterialPixel(linearRgb, profile, exposureEv);
}

function simulateValidatedMaterialPixel(linearRgb, profile, exposureEv = 0) {
  const spectrum = reconstructSpectrum(linearRgb.map(value => Math.max(0, value)), profile.inputBasis);
  const exposureScale = 2 ** clamp(Number(exposureEv) || 0, -8, 8);
  const densities = profile.layers.map(layer => {
    const layerExposure = integrate(spectrum, layer.sensitivity) * exposureScale;
    return interpolateCurve(layer.curve, Math.log10(Math.max(layerExposure, 1e-8)));
  });
  const negativeMaterial = profile.kind?.endsWith('-negative');
  const spectralOutput = profile.wavelengths.map((_, wavelength) => {
    const density = profile.layers.reduce((sum, layer, index) =>
      sum + densities[index] * layer.dyeDensity[wavelength], profile.baseDensity ?? 0);
    const transmittance = 10 ** -Math.max(0, density);
    // Camera-negative transmittance is an intermediate, not a display image.
    // A bounded density-domain virtual print restores scene polarity. Scaling
    // raw transmittance against clear film pushes midtones near display white;
    // mapping optical density instead keeps useful highlight headroom.
    if (!negativeMaterial) return transmittance;
    const minimumDensity = profile.layers.reduce((sum, layer) =>
      sum + interpolateCurve(layer.curve, -8) * layer.dyeDensity[wavelength], profile.baseDensity ?? 0);
    const imageDensity = Math.max(0, density - minimumDensity);
    const displayDensityScale = profile.displayDensityScale ?? 0.45;
    return 1 - 10 ** -(imageDensity * displayDensityScale);
  });
  const response = profile.observer.map(channel => integrate(spectralOutput, channel));
  const matrix = profile.outputMatrix;
  return [
    response[0] * matrix[0] + response[1] * matrix[1] + response[2] * matrix[2],
    response[0] * matrix[3] + response[1] * matrix[4] + response[2] * matrix[5],
    response[0] * matrix[6] + response[1] * matrix[7] + response[2] * matrix[8],
  ].map(value => Math.max(0, value));
}

function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value) {
  value = clamp(value);
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

export function processMaterialImage(image, profile, options = {}) {
  validateMaterialProfile(profile);
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height)
      || image.width <= 0 || image.height <= 0 || !image.data
      || image.data.length !== image.width * image.height * 4) {
    throw new TypeError('Expected a positive-width RGBA image buffer.');
  }
  const amount = clamp(Number.isFinite(Number(options.amount)) ? Number(options.amount) : 1);
  const exposure = clamp(Number(options.exposure) || 0, -8, 8);
  const output = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < image.data.length; i += 4) {
    const source = [
      srgbToLinear(image.data[i] / 255),
      srgbToLinear(image.data[i + 1] / 255),
      srgbToLinear(image.data[i + 2] / 255),
    ];
    const simulated = simulateValidatedMaterialPixel(source, profile, exposure);
    for (let channel = 0; channel < 3; channel++) {
      const styled = linearToSrgb(simulated[channel]) * 255;
      output[i + channel] = image.data[i + channel]
        + (styled - image.data[i + channel]) * amount;
    }
    output[i + 3] = image.data[i + 3];
  }
  applyMaterialFinish(output, image.width, image.height, options);
  return { width: image.width, height: image.height, data: output };
}

function seededRandom(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function blurRgb(data, width, height, radius) {
  if (radius < 1) return new Float32Array(data);
  const horizontal = new Float32Array(data.length);
  const output = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0, count = 0;
        for (let offset = -radius; offset <= radius; offset++) {
          const sampleX = Math.min(width - 1, Math.max(0, x + offset));
          sum += data[(y * width + sampleX) * 4 + channel]; count++;
        }
        horizontal[(y * width + x) * 4 + channel] = sum / count;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0, count = 0;
        for (let offset = -radius; offset <= radius; offset++) {
          const sampleY = Math.min(height - 1, Math.max(0, y + offset));
          sum += horizontal[(sampleY * width + x) * 4 + channel]; count++;
        }
        output[(y * width + x) * 4 + channel] = sum / count;
      }
    }
  }
  return output;
}

function applyMaterialFinish(data, width, height, options) {
  const grain = clamp(Number(options.grain) || 0);
  const softness = clamp(Number(options.softness) || 0);
  const bloom = clamp(Number(options.bloom) || 0);
  const halation = clamp(Number(options.halation) || 0);
  const vignetteAmount = clamp(Number(options.vignette) || 0);
  const spatialAmount = Math.max(softness, bloom, halation);
  const blurred = spatialAmount > 0
    ? blurRgb(data, width, height, Math.max(1, Math.round(Math.min(width, height) / 180)))
    : null;
  const random = seededRandom(options.seed ?? 1729);
  const centerX = (width - 1) / 2 || 1;
  const centerY = (height - 1) / 2 || 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const luminance = (data[index] * 0.2126 + data[index + 1] * 0.7152
        + data[index + 2] * 0.0722) / 255;
      const highlight = clamp((luminance - 0.58) / 0.42);
      const noise = ((random() + random() + random()) / 3 - 0.5)
        * 92 * grain * (0.45 + 0.55 * (1 - luminance));
      const distance = Math.sqrt(((x - centerX) / centerX) ** 2
        + ((y - centerY) / centerY) ** 2) / Math.SQRT2;
      const vignette = 1 - vignetteAmount * 0.62 * clamp((distance - 0.28) / 0.72) ** 2;
      for (let channel = 0; channel < 3; channel++) {
        let value = data[index + channel];
        if (blurred) {
          value += (blurred[index + channel] - value) * softness * 0.55;
          value += blurred[index + channel] * highlight * bloom * 0.22;
          if (channel !== 2) {
            value += blurred[index + channel] * highlight * halation
              * (channel === 0 ? 0.25 : 0.09);
          }
        }
        data[index + channel] = clamp((value + noise) * vignette, 0, 255);
      }
    }
  }
}

function clampArray(values, min = 0, max = 1) {
  return values.map(value => clamp(value, min, max));
}

// Builds an unmeasured Material v2 candidate from independently authored
// creative-target controls. This is useful for migration and UI evaluation,
// but it is not physical stock calibration and may never use measured status.
export function createMaterialCandidate(definition) {
  if (!definition || typeof definition !== 'object' || !definition.id) {
    throw new TypeError('Candidate definition requires an id.');
  }
  const monochrome = Boolean(definition.monochrome);
  const contrast = clamp(Number(definition.contrast) || 0, -0.8, 0.8);
  const saturation = clamp(Number(definition.saturation) || 1, 0, 2);
  const warmth = clamp(Number(definition.warmth) || 0, -1, 1);
  const toe = clamp(Number(definition.toe) || 0.08, 0, 0.6);
  const shoulder = clamp(Number(definition.shoulder) || 0.12, 0, 0.6);
  const slope = 0.52 + contrast * 0.22;
  const curve = [
    [-3, 0.03 + toe * 0.3],
    [-1, 0.2 + toe * 0.22],
    [0, 0.72 + slope * 0.18],
    [1, 1.42 - shoulder * 0.25],
  ];
  const redShift = warmth * 0.18;
  const chroma = monochrome ? 0 : (saturation - 1) * 0.24;
  const tint = Array.isArray(definition.tint) ? definition.tint : [1, 1, 1];
  const matrix = Array.isArray(definition.matrix) ? definition.matrix : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const profile = {
    ...syntheticMaterialProfile,
    id: `candidate-${definition.id}-v1`,
    status: 'synthetic',
    kind: monochrome ? 'monochrome-negative' : 'color-negative',
    label: definition.label ?? definition.id,
    calibrationBasis: 'legacy-creative-target',
    layers: syntheticMaterialProfile.layers.map((layer, index) => ({
      sensitivity: monochrome
        ? clampArray(layer.sensitivity.map((value, wavelength) =>
          value * 0.35 + syntheticMaterialProfile.observer[1][wavelength] * 0.65))
        : clampArray(layer.sensitivity.map(value => value
          * (1 + (index === 0 ? redShift : index === 2 ? -redShift : 0)))),
      curve: curve.map(([x, density]) => [x, density * (1 + (index - 1) * chroma)]),
      dyeDensity: monochrome
        ? [0.75, 0.78, 0.8, 0.8, 0.78, 0.75]
        : clampArray(layer.dyeDensity.map(value => value
          * (1 + (index === 0 ? chroma + redShift : index === 2 ? chroma - redShift : chroma * 0.5))), 0, 2),
    })),
    outputMatrix: monochrome
      ? [0.3 * tint[0], 0.59 * tint[0], 0.11 * tint[0],
        0.3 * tint[1], 0.59 * tint[1], 0.11 * tint[1],
        0.3 * tint[2], 0.59 * tint[2], 0.11 * tint[2]]
      : matrix.map((value, index) => value * tint[Math.floor(index / 3)]),
    baseDensity: clamp(0.03 + toe * 0.04, 0, 1),
    displayDensityScale: 0.45,
    provenance: {
      sources: [],
      validation: { state: 'synthetic-only' },
      note: 'Derived from an independently authored legacy creative target; not measured film data.',
    },
  };
  return validateMaterialProfile(profile);
}

// Synthetic numerical fixture for testing the pipeline only. It represents no
// manufacturer, stock, process, observer, or measured photographic material.
export const syntheticMaterialProfile = Object.freeze({
  schemaVersion: 1,
  id: 'synthetic-three-layer-conformance-v1',
  status: 'synthetic',
  kind: 'direct-positive',
  wavelengths: [420, 470, 520, 570, 620, 670],
  inputBasis: [
    [0.05, 0.1, 0.2, 0.45, 0.9, 1],
    [0.05, 0.25, 0.9, 1, 0.2, 0.02],
    [1, 0.9, 0.3, 0.05, 0.01, 0],
  ],
  layers: [
    { sensitivity: [0, 0.05, 0.25, 0.8, 1, 0.4], curve: [[-3, 0.05], [-1, 0.25], [0, 0.8], [1, 1.5]], dyeDensity: [0.02, 0.05, 0.15, 0.55, 1, 0.8] },
    { sensitivity: [0.05, 0.3, 1, 0.7, 0.1, 0], curve: [[-3, 0.04], [-1, 0.2], [0, 0.75], [1, 1.45]], dyeDensity: [0.04, 0.25, 0.9, 0.75, 0.1, 0.02] },
    { sensitivity: [1, 0.9, 0.3, 0.05, 0, 0], curve: [[-3, 0.06], [-1, 0.3], [0, 0.85], [1, 1.55]], dyeDensity: [0.85, 1, 0.4, 0.08, 0.02, 0] },
  ],
  observer: [
    [0.02, 0.04, 0.12, 0.4, 0.9, 1],
    [0.01, 0.15, 0.8, 1, 0.25, 0.02],
    [1, 0.8, 0.2, 0.03, 0, 0],
  ],
  outputMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  baseDensity: 0.03,
  provenance: { sources: [], validation: { state: 'synthetic-only' } },
});