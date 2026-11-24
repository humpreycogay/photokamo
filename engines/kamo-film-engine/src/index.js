export {
  createMaterialCandidate, processMaterialImage, simulateMaterialPixel, syntheticMaterialProfile,
  validateMaterialProfile,
} from './material.js';
export { createDatasheetDerivedProfile } from './datasheet-profile.js';
export { filmCalibrationCatalog, getFilmCalibrationRecord } from './film-catalog.js';
export * from './spectral/index.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);

const BASE = Object.freeze({
  preset: 'neutral', amount: 1, exposure: 0, contrast: 0, saturation: 1,
  warmth: 0, grain: 0, bloom: 0, halation: 0, vignette: 0, softness: 0,
  toe: 0.08, shoulder: 0.12, seed: 1729, monochrome: false,
  monoMix: [0.27, 0.67, 0.06], tint: [1, 1, 1], matrix: IDENTITY,
});

const PRESETS = Object.freeze({
  neutral: {
    label: 'Clean Neutral', category: 'basic',
    description: 'A restrained starting point with gentle highlight roll-off.',
  },
  'warm-negative': {
    label: 'Kamo CN 200', category: 'film', family: 'Color Negative', speed: 'ISO 200',
    description: 'Warm skin tones, soft highlights, and fine organic texture.',
    contrast: 0.12, saturation: 1.06, warmth: 0.12,
    grain: 0.13, halation: 0.1, shoulder: 0.2, softness: 0.05,
    matrix: [1.04, -0.02, -0.02, -0.02, 1.01, 0.01, 0.01, -0.03, 1.02],
  },
  'vivid-chrome': {
    label: 'Kamo Slide 100', category: 'film', family: 'Color Slide', speed: 'ISO 100',
    description: 'Dense contrast and crisp, saturated color for daylight scenes.',
    contrast: 0.28, saturation: 1.22, warmth: -0.03,
    grain: 0.07, vignette: 0.08, toe: 0.04, shoulder: 0.27,
    matrix: [1.06, -0.03, -0.03, -0.02, 1.08, -0.06, -0.01, -0.04, 1.05],
  },
  'soft-pastel': {
    label: 'Kamo Portrait 400', category: 'film', family: 'Color Negative', speed: 'ISO 400',
    description: 'Open shadows, quiet color, bloom, and a softened image structure.',
    contrast: -0.16, saturation: 0.82, warmth: 0.08,
    grain: 0.09, bloom: 0.13, softness: 0.14, toe: 0.17, shoulder: 0.24,
    tint: [1.02, 1, 0.98],
  },
  'lomo-night': {
    label: 'Kamo Night 800', category: 'film', family: 'Color Negative', speed: 'ISO 800',
    description: 'Punchy color, pronounced grain, halation, and darkened corners.',
    contrast: 0.35, saturation: 1.35, warmth: -0.08,
    grain: 0.27, halation: 0.2, vignette: 0.42, toe: 0.13,
    matrix: [1.12, -0.05, -0.07, -0.06, 1.13, -0.07, 0.03, -0.12, 1.09],
  },
  'silver-mono': {
    label: 'Kamo Silver 400', category: 'film', family: 'Black & White', speed: 'ISO 400',
    description: 'A silver-rich monochrome response with visible grain and depth.',
    monochrome: true, contrast: 0.22, saturation: 0,
    grain: 0.24, vignette: 0.12, softness: 0.04, monoMix: [0.38, 0.54, 0.08],
    tint: [1.01, 1, 0.96],
  },
  'aged-print': {
    label: 'Kamo Instant 80', category: 'film', family: 'Instant Print', speed: 'ISO 80',
    description: 'Faded color, warm paper character, bloom, and softened detail.',
    contrast: -0.08, saturation: 0.7, warmth: 0.24,
    grain: 0.2, bloom: 0.08, vignette: 0.3, softness: 0.11, toe: 0.24,
    shoulder: 0.19, tint: [1.06, 1, 0.86],
  },
});

const RANGES = Object.freeze({
  amount: [0, 1], exposure: [-3, 3], contrast: [-0.8, 0.8],
  saturation: [0, 2], warmth: [-1, 1], grain: [0, 1], bloom: [0, 1],
  halation: [0, 1], vignette: [0, 1], softness: [0, 1], toe: [0, 0.6],
  shoulder: [0, 0.6], seed: [0, 0xffffffff],
});

function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value) {
  value = clamp(value);
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

function tone(value, contrast, toe, shoulder) {
  const lifted = value + toe * (1 - Math.exp(-value * 5)) * (1 - value);
  const rolled = lifted / (1 + shoulder * Math.max(0, lifted) ** 2 * 2.5);
  return 0.5 + (rolled - 0.5) * 2 ** contrast;
}

function random(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function blurRgb(data, width, height, radius) {
  if (radius < 1) return new Float32Array(data);
  const horizontal = new Float32Array(data.length);
  const output = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0, count = 0;
        for (let k = -radius; k <= radius; k++) {
          const sx = Math.min(width - 1, Math.max(0, x + k));
          sum += data[(y * width + sx) * 4 + c]; count++;
        }
        horizontal[(y * width + x) * 4 + c] = sum / count;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0, count = 0;
        for (let k = -radius; k <= radius; k++) {
          const sy = Math.min(height - 1, Math.max(0, y + k));
          sum += horizontal[(sy * width + x) * 4 + c]; count++;
        }
        output[(y * width + x) * 4 + c] = sum / count;
      }
    }
  }
  return output;
}

function validateImage(image) {
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height)
      || image.width <= 0 || image.height <= 0 || !image.data
      || image.data.length !== image.width * image.height * 4) {
    throw new TypeError('Expected a positive-width RGBA image buffer.');
  }
}

function resolveSettings(options = {}) {
  const presetName = options.preset ?? BASE.preset;
  const preset = PRESETS[presetName];
  if (!preset) throw new RangeError(`Unknown preset: ${presetName}`);
  const settings = { ...BASE, ...preset, ...options, preset: presetName };
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    const numeric = Number(settings[key]);
    settings[key] = clamp(Number.isFinite(numeric) ? numeric : BASE[key], min, max);
  }
  settings.matrix = [...settings.matrix]; settings.tint = [...settings.tint];
  settings.monoMix = [...settings.monoMix];
  return settings;
}

export class FilmEngine {
  getPresets() {
    return Object.entries(PRESETS).map(([id, preset]) => ({
      id,
      label: preset.label,
      category: preset.category,
      family: preset.family,
      speed: preset.speed,
      description: preset.description,
    }));
  }

  getDefaults() { return { ...BASE, matrix: [...BASE.matrix], tint: [...BASE.tint] }; }

  getPresetSettings(id) {
    const settings = resolveSettings({ preset: id });
    return { ...settings, matrix: [...settings.matrix], tint: [...settings.tint], monoMix: [...settings.monoMix] };
  }

  process(image, options = {}) {
    validateImage(image);
    const settings = resolveSettings(options);
    const { width, height } = image;
    const original = new Uint8ClampedArray(image.data);
    const output = new Uint8ClampedArray(original.length);
    const exposure = 2 ** settings.exposure;
    const warm = [1 + settings.warmth * 0.12, 1, 1 - settings.warmth * 0.12];

    for (let i = 0; i < original.length; i += 4) {
      const source = [0, 1, 2].map(c => srgbToLinear(original[i + c] / 255));
      const m = settings.matrix;
      let rgb = [
        (source[0] * m[0] + source[1] * m[1] + source[2] * m[2]) * exposure * warm[0],
        (source[0] * m[3] + source[1] * m[4] + source[2] * m[5]) * exposure * warm[1],
        (source[0] * m[6] + source[1] * m[7] + source[2] * m[8]) * exposure * warm[2],
      ];
      const luma = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      rgb = rgb.map((v, c) => tone(luma + (v - luma) * settings.saturation,
        settings.contrast, settings.toe, settings.shoulder) * settings.tint[c]);
      if (settings.monochrome) {
        const mono = source.reduce((sum, v, c) => sum + v * settings.monoMix[c], 0) * exposure;
        rgb = settings.tint.map(v => tone(mono, settings.contrast,
          settings.toe, settings.shoulder) * v);
      }
      for (let c = 0; c < 3; c++) {
        const styled = linearToSrgb(rgb[c]) * 255;
        output[i + c] = original[i + c] + (styled - original[i + c]) * settings.amount;
      }
      output[i + 3] = original[i + 3];
    }

    const spatialAmount = Math.max(settings.softness, settings.bloom, settings.halation);
    const blurred = spatialAmount > 0
      ? blurRgb(output, width, height, Math.max(1, Math.round(Math.min(width, height) / 180)))
      : null;
    const rng = random(settings.seed);
    const cx = (width - 1) / 2 || 1, cy = (height - 1) / 2 || 1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const luminance = (output[i] * 0.2126 + output[i + 1] * 0.7152 + output[i + 2] * 0.0722) / 255;
        const highlight = clamp((luminance - 0.58) / 0.42);
        const grain = ((rng() + rng() + rng()) / 3 - 0.5) * 92 * settings.grain * (0.45 + 0.55 * (1 - luminance));
        const distance = Math.sqrt(((x - cx) / cx) ** 2 + ((y - cy) / cy) ** 2) / Math.SQRT2;
        const vignette = 1 - settings.vignette * 0.62 * clamp((distance - 0.28) / 0.72) ** 2;
        for (let c = 0; c < 3; c++) {
          let value = output[i + c];
          if (blurred) {
            value += (blurred[i + c] - value) * settings.softness * 0.55;
            value += blurred[i + c] * highlight * settings.bloom * 0.22;
            if (c !== 2) value += blurred[i + c] * highlight * settings.halation * (c === 0 ? 0.25 : 0.09);
          }
          output[i + c] = clamp((value + grain) * vignette, 0, 255);
        }
      }
    }
    return { width, height, data: output };
  }
}

export const presets = Object.freeze(new FilmEngine().getPresets());
