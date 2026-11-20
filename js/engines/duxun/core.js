// DuXun Film Simulation, ported to JavaScript for PhotoKamo.
//
// Port of engines/duxun/src/ofx/DuXunFilm/DuXunFilmSim.cpp (v5.0, SPDX-License-Identifier:
// GPL-2.0-or-later; grain, halation and bloom ideas there are adapted from NativeEnhancer-FE, MIT;
// presets from t3mujinpack, MIT). PhotoKamo is GPL-3.0, which "or later" allows.
//
// Same functions, constants and order as the plugin's CPU path (renderRows). Differences, all
// for still photos in a browser (see engines/duxun/UPSTREAM.md):
//  - Film breath, gate weave and overscan are frame-to-frame motion effects and are left out;
//    render time is 0 (dust & scratches keep their pattern).
//  - The plugin works in timeline pixels. PhotoKamo renders as if the photo were on a 1920 px
//    wide timeline (grain coordinates and glow buffers scale with the photo), so the 1280 px
//    preview and a full-size export look the same.
//  - Pixels are the browser's sRGB-encoded values; "Timeline / no conversion" uses them as-is,
//    as the plugin uses Resolve's timeline values.

// ---------- Presets (gPresets) ----------
// [name, contrast, shoulder, toe, density, halation, grain, saturation, vignette]
export const PRESETS = [
  ['Agfa APX 100', 0.99, 0.20, 0.24, 0.87, 0.10, 0.12, 0.00, 0.00],
  ['Agfa APX 25', 0.86, 0.20, 0.17, 0.91, 0.05, 0.04, 0.00, 0.00],
  ['Agfa Vista 100', 1.12, 0.22, 0.10, 0.98, 0.12, 0.06, 0.98, 0.00],
  ['Agfa Vista 200', 1.17, 0.22, 0.10, 0.95, 0.13, 0.10, 1.00, 0.00],
  ['Agfa Vista 400', 1.02, 0.22, 0.17, 0.98, 0.15, 0.15, 1.02, 0.00],
  ['CineStill 50D', 1.00, 0.30, 0.15, 0.98, 0.35, 0.05, 0.95, 0.00],
  ['CineStill 800T', 0.76, 0.35, 0.17, 0.96, 0.50, 0.22, 0.88, 0.00],
  ['Fuji Neopan 1600', 1.41, 0.25, 0.14, 0.98, 0.15, 0.40, 0.00, 0.00],
  ['Fuji Neopan Acros 100', 1.20, 0.15, 0.10, 1.02, 0.05, 0.06, 0.00, 0.00],
  ['Fuji Pro 160C', 1.01, 0.22, 0.10, 0.96, 0.12, 0.05, 0.92, 0.00],
  ['Fuji Pro 400H', 1.20, 0.25, 0.15, 0.97, 0.12, 0.08, 0.85, 0.00],
  ['Fuji Pro 800Z', 0.91, 0.28, 0.10, 0.98, 0.18, 0.18, 0.95, 0.00],
  ['Fuji Superia 100', 1.17, 0.20, 0.11, 0.98, 0.12, 0.06, 1.02, 0.00],
  ['Fuji Superia 1600', 1.18, 0.28, 0.10, 0.97, 0.20, 0.30, 1.08, 0.00],
  ['Fuji Superia 200', 1.08, 0.20, 0.16, 0.97, 0.13, 0.09, 1.05, 0.00],
  ['Fuji Superia 400', 1.13, 0.22, 0.10, 0.99, 0.14, 0.12, 1.05, 0.00],
  ['Fuji Superia 800', 1.12, 0.25, 0.10, 0.98, 0.16, 0.18, 1.00, 0.00],
  ['Fuji Superia HG 1600', 1.00, 0.28, 0.13, 0.98, 0.22, 0.32, 1.10, 0.00],
  ['Fuji Astia 100F', 1.13, 0.25, 0.11, 0.97, 0.10, 0.03, 1.00, 0.00],
  ['Fuji Fortia SP 50', 1.54, 0.18, 0.10, 0.94, 0.10, 0.03, 1.25, 0.00],
  ['Fuji Provia 100F', 1.17, 0.22, 0.10, 0.97, 0.10, 0.03, 1.05, 0.00],
  ['Fuji Provia 400F', 1.00, 0.22, 0.10, 1.00, 0.12, 0.06, 1.02, 0.00],
  ['Fuji Provia 400X', 0.88, 0.22, 0.10, 1.00, 0.12, 0.08, 1.08, 0.00],
  ['Fuji Sensia 100', 1.36, 0.20, 0.12, 0.95, 0.10, 0.05, 1.08, 0.00],
  ['Fuji Velvia 100', 1.08, 0.20, 0.10, 0.99, 0.08, 0.04, 1.25, 0.00],
  ['Fuji Velvia 50', 1.18, 0.18, 0.10, 1.01, 0.08, 0.03, 1.30, 0.00],
  ['Ilford Delta 100', 1.06, 0.18, 0.13, 0.98, 0.05, 0.05, 0.00, 0.00],
  ['Ilford Delta 3200', 1.00, 0.30, 0.10, 0.96, 0.20, 0.45, 0.00, 0.00],
  ['Ilford Delta 400', 1.14, 0.20, 0.10, 1.00, 0.10, 0.15, 0.00, 0.00],
  ['Ilford FP4 125', 1.07, 0.18, 0.15, 0.98, 0.08, 0.08, 0.00, 0.00],
  ['Ilford HP5 Plus 400', 1.00, 0.22, 0.10, 1.01, 0.12, 0.22, 0.00, 0.00],
  ['Ilford XP2', 1.15, 0.20, 0.15, 0.85, 0.08, 0.14, 0.00, 0.00],
  ['Kodak T-Max 3200', 1.52, 0.35, 0.10, 0.94, 0.18, 0.42, 0.00, 0.00],
  ['Kodak Tri-X 400', 1.23, 0.22, 0.10, 0.95, 0.15, 0.28, 0.00, 0.00],
  ['Kodak ColorPlus 200', 1.65, 0.20, 0.10, 0.93, 0.14, 0.13, 1.02, 0.00],
  ['Kodak Ektar 100', 1.20, 0.20, 0.10, 0.99, 0.10, 0.03, 1.18, 0.00],
  ['Kodak Gold 200', 1.43, 0.22, 0.10, 0.95, 0.15, 0.14, 1.08, 0.00],
  ['Kodak Portra 160 NC', 1.21, 0.28, 0.10, 0.96, 0.10, 0.04, 0.82, 0.00],
  ['Kodak Portra 160 VC', 1.25, 0.22, 0.10, 0.96, 0.12, 0.05, 0.98, 0.00],
  ['Kodak Portra 160', 1.17, 0.25, 0.11, 0.96, 0.12, 0.04, 0.88, 0.00],
  ['Kodak Portra 400 NC', 1.22, 0.28, 0.10, 0.97, 0.13, 0.07, 0.85, 0.00],
  ['Kodak Portra 400 UC', 1.16, 0.25, 0.13, 0.96, 0.14, 0.08, 0.95, 0.00],
  ['Kodak Portra 400 VC', 1.28, 0.22, 0.10, 1.00, 0.15, 0.09, 1.05, 0.00],
  ['Kodak Portra 400', 1.22, 0.28, 0.10, 0.96, 0.15, 0.08, 0.90, 0.00],
  ['Kodak Portra 800', 1.35, 0.30, 0.10, 0.96, 0.20, 0.18, 0.92, 0.00],
  ['Kodak Ultra Max 400', 1.32, 0.22, 0.10, 0.94, 0.16, 0.16, 1.06, 0.00],
  ['Kodak Ektachrome 100 G', 1.22, 0.22, 0.10, 1.00, 0.10, 0.03, 1.05, 0.00],
  ['Kodak Ektachrome 100 GX', 1.00, 0.22, 0.10, 0.99, 0.10, 0.03, 1.02, 0.00],
  ['Kodak Ektachrome 100 VS', 1.01, 0.20, 0.10, 0.99, 0.10, 0.04, 1.18, 0.00],
  ['Kodak Elite Chrome 400', 1.00, 0.22, 0.10, 1.02, 0.12, 0.08, 1.08, 0.00],
  ['Kodak Kodakchrome 200', 1.13, 0.20, 0.10, 0.98, 0.10, 0.05, 1.10, 0.00],
  ['Kodak Kodakchrome 25', 1.34, 0.15, 0.10, 0.99, 0.08, 0.02, 1.15, 0.00],
  ['Kodak Kodakchrome 64', 1.13, 0.18, 0.10, 0.98, 0.08, 0.03, 1.12, 0.00],
  ['Custom', 1.15, 0.20, 0.15, 0.85, 0.10, 0.10, 1.00, 0.00]
];
export const BRANDS = ['Agfa', 'CineStill', 'Fuji', 'Ilford', 'Kodak', 'Custom'];
const BRAND_START = [0, 5, 7, 26, 32, 53];
export const brandOf = idx => { for (let b = 0; b < BRANDS.length - 1; b++) if (idx < BRAND_START[b + 1]) return b; return 5; };
export const CUSTOM_PRESET = 53;

// Enumerations (same numbers as the plugin)
export const PROFILE_AUTO = 0;
const GRAIN_65MM_FINE = 1, GRAIN_35MM_STANDARD = 2, GRAIN_35MM_HIGH_ISO = 3, GRAIN_16MM = 4, GRAIN_8MM = 5, GRAIN_CUSTOM = 6;
const HALATION_65MM_STANDARD = 1, HALATION_16MM_STANDARD = 3, HALATION_8MM_STANDARD = 4, HALATION_65MM_NO_REMJET = 5,
  HALATION_35MM_NO_REMJET = 6, HALATION_16MM_NO_REMJET = 7, HALATION_8MM_NO_REMJET = 8, HALATION_CUSTOM = 9;
const BLOOM_65MM = 1, BLOOM_16MM = 3, BLOOM_8MM = 4, BLOOM_CUSTOM = 5;
const DAMAGE_65MM_CLEAN = 1, DAMAGE_16MM_ARCHIVE = 3, DAMAGE_8MM_HOME = 4, DAMAGE_CUSTOM = 5;
export const PRINT_LINEAR = 0, PRINT_CINEON_LOG = 1, PRINT_KODAK_2383 = 2, PRINT_FUJI_3513 = 3, PRINT_KODAK_ENDURA = 4, PRINT_BW_BROMOPORTRAIT = 5;
const GRAIN_MODE_ANALOG = 0, GRAIN_MODE_DETAIL = 1, GRAIN_MODE_DYE_CLOUD = 2;
const EFFECT_COLOR_ONLY = 1, EFFECT_TEXTURE_ONLY = 2, EFFECT_GRAIN_HALATION = 3;
const TRANSFORM_REC709_G24 = 1, TRANSFORM_DWG_INTERMEDIATE = 2;
const HALATION_STOCK_NONE = 0, HALATION_STOCK_SUBTLE = 1, HALATION_STOCK_NO_REMJET = 2;

// ---------- Film matrices ----------
const M = {
  identity: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  agfaVista100: [1.1286, -0.0486, -0.0800, 0.0217, 1.0799, -0.1016, -0.0311, -0.0177, 1.0488],
  cineStill50D: [1.1147, -0.0436, -0.0711, 0.0238, 1.0764, -0.1002, -0.0348, -0.0179, 1.0527],
  cineStill800T: [1.1316, -0.0475, -0.0841, 0.0224, 1.0875, -0.1099, -0.0296, -0.0164, 1.0461],
  fujiPro160C: [1.1855, -0.0707, -0.1148, 0.0158, 1.0850, -0.1007, -0.0226, -0.0178, 1.0404],
  fujiPro400H: [1.1663, -0.0664, -0.0999, 0.0164, 1.0762, -0.0926, -0.0257, -0.0193, 1.0449],
  fujiSuperia: [1.1127, -0.0440, -0.0688, 0.0235, 1.0724, -0.0959, -0.0359, -0.0187, 1.0546],
  fujiC200: [1.1172, -0.0458, -0.0713, 0.0226, 1.0728, -0.0954, -0.0347, -0.0188, 1.0535],
  fujiNatura1600: [1.1028, -0.0428, -0.0600, 0.0237, 1.0613, -0.0850, -0.0411, -0.0210, 1.0621],
  fujiProvia100F: [1.1323, -0.0466, -0.0858, 0.0230, 1.0919, -0.1149, -0.0290, -0.0158, 1.0448],
  fujiVelvia50: [1.4764, -0.1415, -0.3349, 0.0103, 1.1444, -0.1548, -0.0095, -0.0120, 1.0215],
  kodakEktar100: [1.1069, -0.0382, -0.0687, 0.0272, 1.0841, -0.1113, -0.0357, -0.0163, 1.0520],
  kodakGold200: [1.1207, -0.0465, -0.0742, 0.0224, 1.0756, -0.0980, -0.0334, -0.0183, 1.0518],
  kodakPortra160: [1.1132, -0.0411, -0.0721, 0.0254, 1.0833, -0.1087, -0.0341, -0.0166, 1.0507],
  kodakPortra400: [1.1120, -0.0422, -0.0698, 0.0246, 1.0773, -0.1019, -0.0353, -0.0177, 1.0530],
  kodakPortra800: [1.1052, -0.0419, -0.0633, 0.0244, 1.0678, -0.0921, -0.0389, -0.0195, 1.0583],
  kodakUltramax400: [1.1122, -0.0437, -0.0685, 0.0236, 1.0723, -0.0959, -0.0361, -0.0187, 1.0548],
  kodakEktachrome100D: [1.1113, -0.0386, -0.0728, 0.0272, 1.0904, -0.1176, -0.0337, -0.0154, 1.0492],
  kodachrome64: [1.0642, -0.0204, -0.0437, 0.0489, 1.0838, -0.1327, -0.0547, -0.0139, 1.0686]
};
function matrixForPreset(idx) {
  switch (idx) {
    case 2: case 3: case 4: return M.agfaVista100;
    case 5: return M.cineStill50D;
    case 6: return M.cineStill800T;
    case 9: return M.fujiPro160C;
    case 10: case 11: return M.fujiPro400H;
    case 12: case 15: case 16: return M.fujiSuperia;
    case 13: case 17: return M.fujiNatura1600;
    case 14: return M.fujiC200;
    case 18: return M.fujiProvia100F;
    case 19: return M.fujiVelvia50;
    case 20: case 21: case 22: case 23: return M.fujiProvia100F;
    case 24: case 25: return M.fujiVelvia50;
    case 34: return M.kodakGold200;
    case 35: return M.kodakEktar100;
    case 36: return M.kodakGold200;
    case 37: case 38: case 39: return M.kodakPortra160;
    case 40: case 41: case 42: case 43: return M.kodakPortra400;
    case 44: return M.kodakPortra800;
    case 45: return M.kodakUltramax400;
    case 46: case 47: case 48: case 49: return M.kodakEktachrome100D;
    case 50: case 51: case 52: return M.kodachrome64;
    default: return M.identity;
  }
}

// ---------- Helpers ----------
const clampf = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const lerpf = (a, b, t) => a + (b - a) * t;
const fractf = x => x - Math.floor(x);
const smoothstepf = (e0, e1, x) => { const t = clampf((x - e0) / Math.max(0.0001, e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const screenBlendf = (base, glow, mix) => lerpf(base, 1 - (1 - base) * (1 - clampf(glow, 0, 1)), clampf(mix, 0, 1));
const lumaOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const nameHas = (idx, needle) => idx >= 0 && idx < PRESETS.length && PRESETS[idx][0].includes(needle);
// The plugin computes this in 32-bit float (sinf, float multiply); emulate that so the noise
// pattern matches it rather than a smoother double-precision variant.
const f32 = Math.fround;
const nativeEnhancerNoise = (x, y, seed) => {
  const arg = f32(f32(f32(f32(x) * f32(12.9898)) + f32(f32(y) * f32(78.233))) + f32(f32(seed) * f32(37.719)));
  const v = f32(f32(Math.sin(arg)) * f32(43758.5453));
  return f32(v - Math.floor(v));
};
const timeSeed = (renderTime, fps, offset) => Math.floor(renderTime * fps + offset);
function grainNoise(x, y, seed) {
  // hashXY with 32-bit unsigned wrap-around, as in C.
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h & 0x7fffffff) / 0x7fffffff;
}

function stockIsoForPreset(idx) {
  for (const iso of [3200, 1600, 800, 400, 200, 160, 125, 100, 64, 50, 25]) if (nameHas(idx, String(iso))) return iso;
  return 400;
}
export const isBlackAndWhitePreset = idx => (idx >= 0 && idx <= 1) || (idx >= 7 && idx <= 8) || (idx >= 26 && idx <= 33);
function stockHalationClassForPreset(idx) {
  if (nameHas(idx, 'CineStill 800T') || nameHas(idx, 'CineStill 50D')) return HALATION_STOCK_NO_REMJET;
  if (nameHas(idx, 'Portra 800') || nameHas(idx, 'Superia 1600') || nameHas(idx, 'Pro 800Z') || nameHas(idx, 'Ultra Max 400')) return HALATION_STOCK_SUBTLE;
  return HALATION_STOCK_NONE;
}
function stockFormatForPreset(idx) { const iso = stockIsoForPreset(idx); return iso <= 100 ? 1 : iso >= 800 ? 3 : 2; }

function stockGrainDefaultsForPreset(idx) {
  const bw = isBlackAndWhitePreset(idx);
  const speed = clampf((stockIsoForPreset(idx) - 50) / 1550, 0, 1);
  const p = {
    gain: bw ? 0.72 + speed * 0.92 : 0.58 + speed * 0.80,
    size: 0.18 + speed * 0.46,
    color: bw ? 0 : 0.18 + speed * 0.22,
    highlightWeight: 0.82 + speed * 0.28,
    shadows: 0.48 + speed * 0.18,
    mids: 0.64 + speed * 0.16,
    highlights: 0.28 + speed * 0.18,
    resolution: 0.78 - speed * 0.26,
    chroma: bw ? 0.02 : 0.16 + speed * 0.18,
    grainTextureSeed: idx * 17 + 43,
    grainClump: 0.12 + speed * 0.34,
    grainSilverRetention: bw ? 0.70 + speed * 0.18 : 0.18 + speed * 0.10
  };
  if (nameHas(idx, 'CineStill 800T')) {
    Object.assign(p, { gain: 1.28, size: 0.58, color: 0.48, chroma: 0.38, grainClump: 0.42, grainSilverRetention: 0.18, highlights: 0.40 });
  } else if (nameHas(idx, 'CineStill 50D') || nameHas(idx, 'Ektar 100') || nameHas(idx, 'Velvia 50') || nameHas(idx, 'Kodakchrome 25')) {
    p.gain *= 0.72; p.size *= 0.72; p.color *= 0.80; p.resolution = 0.88; p.grainClump *= 0.70;
  } else if (nameHas(idx, 'Portra 160') || nameHas(idx, 'Pro 160')) {
    p.gain *= 0.82; p.size *= 0.82; p.color *= 0.78; p.chroma *= 0.75; p.highlights *= 0.82;
  } else if (nameHas(idx, 'Portra 800') || nameHas(idx, 'Superia 1600') || nameHas(idx, 'Delta 3200') || nameHas(idx, 'T-Max 3200')) {
    p.gain *= 1.18; p.size *= 1.12; p.grainClump *= 1.18; p.shadows *= 1.10;
  } else if (nameHas(idx, 'Tri-X') || nameHas(idx, 'HP5')) {
    p.gain *= 1.08; p.size *= 1.04; p.grainClump *= 1.12; p.grainSilverRetention = 0.86;
  }
  return p;
}
export function grainProfileForPreset(idx, choice) {
  let resolved = choice;
  if (resolved === PROFILE_AUTO) { const f = stockFormatForPreset(idx); resolved = f === 1 ? GRAIN_65MM_FINE : f === 3 ? GRAIN_35MM_HIGH_ISO : GRAIN_35MM_STANDARD; }
  let p = stockGrainDefaultsForPreset(idx);
  const bw = isBlackAndWhitePreset(idx);
  if (resolved === GRAIN_65MM_FINE) { p.gain *= 0.72; p.size *= 0.62; p.color *= 0.72; p.resolution = Math.max(p.resolution, 0.86); p.grainClump *= 0.72; p.highlightWeight *= 0.82; }
  else if (resolved === GRAIN_35MM_HIGH_ISO) { p.gain *= 1.18; p.size *= 1.20; p.color = bw ? 0 : Math.max(p.color, 0.38); p.resolution *= 0.82; p.grainClump *= 1.18; p.highlightWeight *= 1.10; }
  else if (resolved === GRAIN_16MM) { p.gain *= 1.35; p.size = Math.max(p.size, 0.70); p.grainClump *= 1.28; p.resolution *= 0.72; p.highlightWeight *= 1.14; }
  else if (resolved === GRAIN_8MM) { p.gain *= 1.62; p.size = Math.max(p.size, 0.88); p.grainClump *= 1.42; p.resolution *= 0.60; p.highlightWeight *= 1.22; }
  if (resolved === GRAIN_CUSTOM) p = stockGrainDefaultsForPreset(idx);
  p.color = bw ? 0 : clampf(p.color, 0, 1);
  p.chroma = bw ? 0.02 : clampf(p.chroma, 0, 1);
  p.size = clampf(p.size, 0.02, 1);
  p.gain = clampf(p.gain, 0.20, 2.4);
  p.grainClump = clampf(p.grainClump, 0, 1);
  p.grainSilverRetention = clampf(p.grainSilverRetention, 0, 1);
  return p;
}
const resolveFormatProfile = (idx, choice) => (choice !== PROFILE_AUTO ? choice : stockFormatForPreset(idx));
function halationGainForProfile(idx, choice) {
  let resolved = resolveFormatProfile(idx, choice);
  if (nameHas(idx, 'CineStill')) resolved = choice === PROFILE_AUTO ? HALATION_35MM_NO_REMJET : resolved;
  switch (resolved) {
    case HALATION_65MM_STANDARD: return { gain: 0.58, radius: 0.72, warmth: 0.88 };
    case HALATION_16MM_STANDARD: return { gain: 0.92, radius: 1.08, warmth: 0.98 };
    case HALATION_8MM_STANDARD: return { gain: 1.04, radius: 1.22, warmth: 1.02 };
    case HALATION_65MM_NO_REMJET: return { gain: 1.00, radius: 1.02, warmth: 1.12 };
    case HALATION_35MM_NO_REMJET: return { gain: 1.25, radius: 1.18, warmth: 1.18 };
    case HALATION_16MM_NO_REMJET: return { gain: 1.42, radius: 1.34, warmth: 1.22 };
    case HALATION_8MM_NO_REMJET: return { gain: 1.58, radius: 1.50, warmth: 1.25 };
    default: return { gain: 1, radius: 1, warmth: 1 };
  }
}
function stockHalationRenderAmount(idx, choice, customAmount) {
  if (customAmount > 0.0001) return customAmount;
  if (choice === PROFILE_AUTO) return 0;
  const cls = stockHalationClassForPreset(idx);
  if (choice >= HALATION_65MM_NO_REMJET && choice <= HALATION_8MM_NO_REMJET) return 0.090;
  if (cls === HALATION_STOCK_NO_REMJET) return 0.075;
  if (cls === HALATION_STOCK_SUBTLE) return 0.032;
  return 0.045;
}
function bloomGainForProfile(idx, choice) {
  switch (resolveFormatProfile(idx, choice)) {
    case BLOOM_65MM: return { gain: 0.78, radius: 0.82 };
    case BLOOM_16MM: return { gain: 1.18, radius: 1.24 };
    case BLOOM_8MM: return { gain: 1.36, radius: 1.48 };
    default: return { gain: 1, radius: 1 };
  }
}
function damageGainForProfile(idx, choice) {
  switch (resolveFormatProfile(idx, choice)) {
    case DAMAGE_65MM_CLEAN: return { gain: 0.40, dust: 0.45, scratch: 0.40 };
    case DAMAGE_16MM_ARCHIVE: return { gain: 1.25, dust: 1.35, scratch: 1.25 };
    case DAMAGE_8MM_HOME: return { gain: 1.65, dust: 1.70, scratch: 1.45 };
    default: return { gain: 1, dust: 1, scratch: 1 };
  }
}

// ---------- Slider defaults a film sets (applyPreset + presetCustomDefaultsForStock) ----------
function presetCustomDefaults(globalIdx) {
  const idx = globalIdx < 0 || globalIdx >= PRESETS.length ? 32 : globalIdx;
  const bw = isBlackAndWhitePreset(idx);
  const preset = PRESETS[idx];
  const sat = preset[7], grain = preset[6], vignette = preset[8];
  const speed = clampf((stockIsoForPreset(idx) - 50) / 1550, 0, 1);
  const gp = stockGrainDefaultsForPreset(idx);
  const d = {
    expandEnabled: true, printEnabled: true, colorHeadEnabled: false, filmGrainEnabled: true, halationEnabled: false,
    bloomEnabled: false, filmDamageEnabled: false, vignetteEnabled: false,
    expandAmount: 0.04 + speed * 0.05,
    printAmount: bw ? 0.22 : 0.18 + speed * 0.06,
    colorDensity: bw ? 0.20 : 0.36 + (sat - 1) * 0.18,
    vibrance: bw ? 0 : Math.max(0, sat - 1) * 0.45,
    filmGrainAmount: 0.10 + grain * 0.72 + speed * 0.08,
    filmGrainShadows: gp.shadows, filmGrainMids: gp.mids, filmGrainHighlights: gp.highlights,
    filmGrainResolution: gp.resolution, filmGrainChroma: gp.chroma,
    halationAmount: 0, halationThreshold: 0.74, halationRadius: 0.42, halationWarmth: 0.70, halationLocal: 0.42,
    halationGlobal: 0.14, halationHue: 0.32, halationBlueComp: 0.42, halationImpact: 0.30, halationDefringe: 0.18,
    bloomAmount: 0, bloomThreshold: 0.82, bloomRegion: 0.55, bloomSoftness: 0.34, bloomRadius: 0.34,
    bloomDetail: 0.48, bloomSaveLights: 0.24, bloomDefringe: 0.24,
    vignetteAmount: 0.06 + vignette * 0.40,
    printStock: bw ? PRINT_BW_BROMOPORTRAIT : PRINT_KODAK_2383
  };
  if (bw) {
    Object.assign(d, { printStock: PRINT_BW_BROMOPORTRAIT, colorDensity: 0.16, vibrance: 0, filmGrainChroma: 0, halationEnabled: false, halationAmount: 0, bloomEnabled: false, bloomAmount: 0 });
    if (nameHas(idx, 'T-Max 3200') || nameHas(idx, 'Delta 3200') || nameHas(idx, 'Neopan 1600')) {
      Object.assign(d, { printAmount: 0.34, colorDensity: 0.24, filmGrainAmount: 0.50 + speed * 0.10, filmGrainShadows: 0.72, filmGrainMids: 0.82, filmGrainHighlights: 0.44, filmGrainResolution: 0.36, vignetteAmount: Math.max(d.vignetteAmount, 0.08) });
    } else if (nameHas(idx, 'Tri-X') || nameHas(idx, 'HP5')) {
      Object.assign(d, { printAmount: 0.31, colorDensity: 0.22, filmGrainAmount: 0.36, filmGrainShadows: 0.66, filmGrainMids: 0.76, filmGrainHighlights: 0.36, filmGrainResolution: 0.48, vignetteAmount: Math.max(d.vignetteAmount, 0.065) });
    } else if (['Acros', 'APX 25', 'APX 100', 'Delta 100', 'FP4'].some(n => nameHas(idx, n))) {
      Object.assign(d, { printAmount: 0.20, colorDensity: 0.14, filmGrainAmount: 0.12 + speed * 0.04, filmGrainShadows: 0.44, filmGrainMids: 0.60, filmGrainHighlights: 0.24, filmGrainResolution: 0.90, vignetteAmount: 0.035 });
    } else if (nameHas(idx, 'XP2')) {
      Object.assign(d, { printAmount: 0.24, colorDensity: 0.18, filmGrainAmount: 0.18, filmGrainShadows: 0.52, filmGrainMids: 0.66, filmGrainHighlights: 0.30, filmGrainResolution: 0.78, vignetteAmount: 0.045 });
    } else {
      Object.assign(d, { printAmount: 0.25 + speed * 0.04, filmGrainAmount: 0.18 + speed * 0.22, filmGrainResolution: clampf(0.72 - speed * 0.20, 0.36, 0.90) });
    }
  }
  const cls = stockHalationClassForPreset(idx);
  if (cls === HALATION_STOCK_NONE) Object.assign(d, { halationAmount: 0, halationEnabled: false, bloomAmount: 0, bloomEnabled: false });
  else if (cls === HALATION_STOCK_SUBTLE) {
    Object.assign(d, { halationEnabled: true, halationAmount: 0.012 + speed * 0.010, halationThreshold: 0.86, halationRadius: 0.22, halationWarmth: 0.52, halationLocal: 0.22, halationGlobal: 0.03, halationHue: 0.28, halationBlueComp: 0.42, halationImpact: 0.12, halationDefringe: 0.18, bloomAmount: 0, bloomEnabled: false });
  }
  if (nameHas(idx, 'Velvia') || nameHas(idx, 'Ektachrome') || nameHas(idx, 'Provia')) { d.printAmount += 0.06; d.colorDensity += 0.05; d.bloomAmount = 0; d.bloomEnabled = false; }
  if (nameHas(idx, 'Portra')) {
    d.printAmount *= 0.92; d.vibrance *= 0.72;
    if (!nameHas(idx, 'Portra 800')) { d.halationAmount = 0; d.halationEnabled = false; }
    d.bloomAmount = 0; d.bloomEnabled = false;
  }
  if (!bw) {
    // applyFujiAgfaCineStillDefaults
    if (nameHas(idx, 'CineStill 800T')) Object.assign(d, { printAmount: 0.24, colorDensity: 0.30, vibrance: 0, filmGrainAmount: 0.30, filmGrainResolution: 0.55, filmGrainChroma: 0.32, halationEnabled: true, halationAmount: 0.34, halationThreshold: 0.74, halationRadius: 0.60, halationWarmth: 0.96, halationLocal: 0.72, halationGlobal: 0.025, halationHue: 0.72, halationBlueComp: 0.86, halationImpact: 0.58, halationDefringe: 0.42, bloomEnabled: false, bloomAmount: 0, bloomThreshold: 0.90, bloomRegion: 0.80, bloomRadius: 0.30 });
    else if (nameHas(idx, 'CineStill 50D')) Object.assign(d, { printAmount: 0.22, colorDensity: 0.32, vibrance: 0.02, filmGrainAmount: 0.08, filmGrainResolution: 0.88, filmGrainChroma: 0.16, halationEnabled: true, halationAmount: 0.08, halationThreshold: 0.86, halationRadius: 0.32, halationWarmth: 0.76, halationLocal: 0.30, halationGlobal: 0.04, halationHue: 0.34, halationBlueComp: 0.50, halationImpact: 0.20, halationDefringe: 0.28, bloomEnabled: false, bloomAmount: 0 });
    else if (nameHas(idx, 'Superia 1600') || nameHas(idx, 'Superia HG 1600')) Object.assign(d, { printAmount: 0.34, colorDensity: 0.44, vibrance: 0.18, filmGrainAmount: 0.34, filmGrainResolution: 0.54, filmGrainChroma: 0.30, halationEnabled: true, halationAmount: 0.018, halationThreshold: 0.86, halationRadius: 0.24, halationWarmth: 0.50, bloomEnabled: false, bloomAmount: 0 });
    else if (nameHas(idx, 'Superia')) Object.assign(d, { printAmount: 0.30, colorDensity: 0.40, vibrance: 0.14, filmGrainAmount: 0.13 + speed * 0.10, filmGrainResolution: clampf(0.82 - speed * 0.22, 0.58, 0.84), filmGrainChroma: 0.22, bloomEnabled: false, bloomAmount: 0 });
    else if (nameHas(idx, 'Agfa Vista')) Object.assign(d, { printAmount: 0.18, colorDensity: 0.37, vibrance: 0.08, filmGrainAmount: 0.11 + speed * 0.08, filmGrainResolution: clampf(0.84 - speed * 0.18, 0.64, 0.86), filmGrainChroma: 0.18, halationEnabled: false, halationAmount: 0, bloomEnabled: false, bloomAmount: 0 });
    // applyKodakColorNegativeDefaults
    if (nameHas(idx, 'Ektar 100')) Object.assign(d, { printAmount: 0.34, colorDensity: 0.46, vibrance: 0.22, filmGrainAmount: 0.07, filmGrainResolution: 0.92, filmGrainChroma: 0.14, halationEnabled: false, halationAmount: 0, bloomEnabled: false, bloomAmount: 0 });
    else if (nameHas(idx, 'Gold 200') || nameHas(idx, 'ColorPlus 200')) Object.assign(d, { printAmount: 0.31, colorDensity: 0.42, vibrance: 0.14, filmGrainAmount: 0.18 + speed * 0.03, filmGrainResolution: 0.70, filmGrainChroma: 0.20, bloomEnabled: false, bloomAmount: 0 });
    else if (nameHas(idx, 'Ultra Max 400')) Object.assign(d, { printAmount: 0.33, colorDensity: 0.44, vibrance: 0.16, filmGrainAmount: 0.26, filmGrainResolution: 0.62, filmGrainChroma: 0.24, halationEnabled: true, halationAmount: 0.018, halationThreshold: 0.86, halationRadius: 0.24, halationWarmth: 0.58, bloomEnabled: false, bloomAmount: 0 });
    else if (nameHas(idx, 'Portra 800')) Object.assign(d, { printAmount: 0.25, colorDensity: 0.32, vibrance: 0.02, filmGrainAmount: 0.28, filmGrainResolution: 0.58, filmGrainChroma: 0.22, halationEnabled: true, halationAmount: 0.018, halationThreshold: 0.88, halationRadius: 0.22, halationWarmth: 0.54, bloomEnabled: false, bloomAmount: 0 });
    else if (nameHas(idx, 'Portra 400')) Object.assign(d, { printAmount: 0.22, colorDensity: 0.30, vibrance: 0, filmGrainAmount: 0.16, filmGrainResolution: 0.74, filmGrainChroma: 0.16, halationEnabled: false, halationAmount: 0, bloomEnabled: false, bloomAmount: 0 });
    else if (nameHas(idx, 'Portra 160')) Object.assign(d, { printAmount: 0.20, colorDensity: 0.28, vibrance: 0, filmGrainAmount: 0.10, filmGrainResolution: 0.86, filmGrainChroma: 0.12, halationEnabled: false, halationAmount: 0, bloomEnabled: false, bloomAmount: 0 });
    // applyHighValueColorStockDefaults
    if (nameHas(idx, 'Pro 800Z')) Object.assign(d, { printAmount: 0.22, colorDensity: 0.32, vibrance: 0, filmGrainAmount: 0.34 + speed * 0.04, filmGrainResolution: 0.54, filmGrainChroma: 0.28, halationEnabled: true, halationAmount: 0.025, halationThreshold: 0.86, halationRadius: 0.26, halationWarmth: 0.50, halationLocal: 0.26, halationGlobal: 0.03 });
    else if (nameHas(idx, 'Astia')) Object.assign(d, { printAmount: 0.24, colorDensity: 0.30, vibrance: 0.05, filmGrainAmount: 0.08, filmGrainResolution: 0.90, filmGrainChroma: 0.14, bloomEnabled: false, bloomAmount: 0 });
    else if (nameHas(idx, 'Fortia')) Object.assign(d, { printAmount: 0.36, colorDensity: 0.50, vibrance: 0.22, filmGrainAmount: 0.06, filmGrainResolution: 0.94, filmGrainChroma: 0.12, bloomEnabled: false, bloomAmount: 0 });
    else if (nameHas(idx, 'Elite Chrome')) Object.assign(d, { printAmount: 0.30, colorDensity: 0.40, vibrance: 0.08, filmGrainAmount: 0.20, filmGrainResolution: 0.68, filmGrainChroma: 0.22, bloomEnabled: false, bloomAmount: 0 });
  }
  if (d.vignetteAmount > 0.005) d.vignetteEnabled = true;
  return d;
}

/** Every slider value choosing film `idx` sets in the plugin (applyPreset). Keys are PhotoKamo param paths. */
export function presetValues(idx) {
  const [, contrast, shoulder, toe, density, halation, grain, saturation, vignette] = PRESETS[idx];
  const d = presetCustomDefaults(idx);
  return {
    contrast, shoulder, toe, density, halation, grain, saturation, vignette, profileStrength: 1, printStrength: 0.65,
    expandEnabled: d.expandEnabled, printEnabled: d.printEnabled, colorHeadEnabled: d.colorHeadEnabled, filmGrainEnabled: d.filmGrainEnabled,
    halationEnabled: d.halationEnabled, bloomEnabled: d.bloomEnabled, filmDamageEnabled: d.filmDamageEnabled, vignetteEnabled: d.vignetteEnabled,
    filmGrainProfile: 0, halationProfile: 0, bloomProfile: 0, filmDamageProfile: 0,
    effectMode: 0, printStock: d.printStock, filmGrainMode: 0,
    expandAmount: d.expandAmount, pushPull: 0, acutance: 0, printAmount: d.printAmount, colorDensity: d.colorDensity, vibrance: d.vibrance,
    printerRed: 0, printerGreen: 0, printerBlue: 0, splitToneAmount: 0, splitToneWarmth: 0.55, colorHeadAmount: 0,
    filmGrainAmount: d.filmGrainAmount, filmGrainShadows: d.filmGrainShadows, filmGrainMids: d.filmGrainMids, filmGrainHighlights: d.filmGrainHighlights,
    filmGrainResolution: d.filmGrainResolution, filmGrainChroma: d.filmGrainChroma,
    halationAmount: d.halationAmount, halationThreshold: d.halationThreshold, halationRadius: d.halationRadius, halationWarmth: d.halationWarmth,
    halationLocal: d.halationLocal, halationGlobal: d.halationGlobal, halationHue: d.halationHue, halationBlueComp: d.halationBlueComp,
    halationImpact: d.halationImpact, halationDefringe: d.halationDefringe,
    bloomAmount: d.bloomAmount, bloomThreshold: d.bloomThreshold, bloomRegion: d.bloomRegion, bloomSoftness: d.bloomSoftness, bloomMaskPreview: 0,
    bloomRadius: d.bloomRadius, bloomDetail: d.bloomDetail, bloomSaveLights: d.bloomSaveLights, bloomDefringe: d.bloomDefringe,
    filmDamageAmount: 0, vignetteAmount: d.vignetteAmount
  };
}

/** Slider values a profile/choice change sets (syncCustomProfileSliders). Returns the params to change. */
export function profileChange(path, value, params) {
  const idx = params.filmPreset;
  const d = () => presetCustomDefaults(idx);
  if (path === 'filmGrainProfile') {
    if (value === GRAIN_CUSTOM) return {};
    const gp = grainProfileForPreset(idx, value);
    return { filmGrainEnabled: true, filmGrainAmount: clampf(d().filmGrainAmount * (0.70 + 0.36 * gp.gain), 0, 2), filmGrainSize: gp.size, filmGrainColor: gp.color,
      filmGrainShadows: gp.shadows, filmGrainMids: gp.mids, filmGrainHighlights: gp.highlights, filmGrainResolution: gp.resolution, filmGrainChroma: gp.chroma };
  }
  if (path === 'halationProfile') {
    if (value === HALATION_CUSTOM) return {};
    const g = halationGainForProfile(idx, value), dd = d();
    const noRemjet = (value >= HALATION_65MM_NO_REMJET && value <= HALATION_8MM_NO_REMJET) || nameHas(idx, 'CineStill');
    if (value === PROFILE_AUTO) {
      const keys = ['halationEnabled', 'halationAmount', 'halationThreshold', 'halationRadius', 'halationWarmth', 'halationLocal', 'halationGlobal', 'halationHue', 'halationBlueComp', 'halationImpact', 'halationDefringe'];
      return Object.fromEntries(keys.map(key => [key, dd[key]]));
    }
    const base = dd.halationAmount <= 0.0001 ? (noRemjet ? 0.090 : 0.045) : dd.halationAmount;
    return { halationEnabled: true, halationAmount: clampf(base * g.gain, 0, 2), halationThreshold: noRemjet ? 0.78 : 0.84, halationRadius: clampf(0.50 * g.radius, 0, 1),
      halationWarmth: clampf(0.66 * g.warmth, 0, 1), halationLocal: noRemjet ? 0.44 : 0.30, halationGlobal: noRemjet ? 0.10 : 0.05, halationHue: noRemjet ? 0.42 : 0.32,
      halationBlueComp: noRemjet ? 0.66 : 0.46, halationImpact: clampf(0.18 + 0.10 * g.gain, 0, 1), halationDefringe: noRemjet ? 0.34 : 0.22 };
  }
  if (path === 'bloomProfile') {
    if (value === BLOOM_CUSTOM) return {};
    const g = bloomGainForProfile(idx, value), dd = d();
    if (value === PROFILE_AUTO) {
      const keys = ['bloomEnabled', 'bloomAmount', 'bloomThreshold', 'bloomRegion', 'bloomSoftness', 'bloomRadius', 'bloomDetail', 'bloomSaveLights', 'bloomDefringe'];
      return { ...Object.fromEntries(keys.map(key => [key, dd[key]])), bloomMaskPreview: 0 };
    }
    const base = dd.bloomAmount <= 0.0001 ? 0.045 : dd.bloomAmount;
    return { bloomEnabled: true, bloomAmount: clampf(base * g.gain, 0, 2), bloomThreshold: dd.bloomThreshold, bloomRegion: dd.bloomRegion, bloomSoftness: dd.bloomSoftness,
      bloomRadius: clampf(0.42 * g.radius, 0, 1), bloomDetail: clampf(0.45 - 0.10 * (g.gain - 1), 0.18, 0.68), bloomSaveLights: clampf(0.54 - 0.08 * (g.gain - 1), 0.25, 0.75),
      bloomDefringe: 0.24, bloomMaskPreview: 0 };
  }
  if (path === 'filmDamageProfile') {
    if (value === DAMAGE_CUSTOM) return {};
    const g = damageGainForProfile(idx, value);
    return { filmDamageEnabled: true, filmDamageAmount: clampf(0.08 * g.gain, 0, 2), filmDust: clampf(0.42 * g.dust, 0, 1), filmScratch: clampf(0.30 * g.scratch, 0, 1) };
  }
  if (path === 'printStock') {
    const table = {
      [PRINT_LINEAR]: [0, 0, 0.35, 0], [PRINT_FUJI_3513]: [0.24, 0.42, 0.42, 0.10], [PRINT_KODAK_ENDURA]: [0.20, 0.34, 0.46, 0.06],
      [PRINT_BW_BROMOPORTRAIT]: [0.26, 0.48, 0.22, 0], [PRINT_CINEON_LOG]: [0.16, 0.26, 0.35, 0.04]
    };
    const [printAmount, printContrast, colorDensity, vibrance] = table[value] || [0.22, 0.38, 0.40, 0.06];
    return { printEnabled: value !== PRINT_LINEAR, printAmount, printContrast, colorDensity, vibrance };
  }
  if (path === 'filmGrainMode') {
    const gp = grainProfileForPreset(idx, params.filmGrainProfile);
    if (value === GRAIN_MODE_DETAIL) return { filmGrainEnabled: true, filmGrainAmount: 0.12 + gp.gain * 0.06, filmGrainSize: clampf(gp.size * 0.76, 0, 1), filmGrainResolution: clampf(gp.resolution + 0.16, 0, 1), filmGrainChroma: clampf(gp.chroma * 0.70, 0, 1) };
    if (value === GRAIN_MODE_DYE_CLOUD) return { filmGrainEnabled: true, filmGrainAmount: 0.14 + gp.gain * 0.08, filmGrainSize: clampf(gp.size * 1.12, 0, 1), filmGrainColor: clampf(gp.color + 0.22, 0, 1), filmGrainChroma: clampf(gp.chroma + 0.18, 0, 1) };
    return profileChange('filmGrainProfile', params.filmGrainProfile, params);
  }
  return {};
}

// ---------- Pixel pipeline (renderAction + renderRows) ----------
const LUT_SIZE = 1024;
function sCurveFunc(x, c, s, t) {
  const pivot = 0.18, x0 = pivot - pivot * c * 0.3, x1 = pivot + (1 - pivot) * c * 0.3;
  if (x < x0) return x0 * Math.pow(clampf(x / x0, 0, 1), 1 + t);
  if (x <= x1) return x;
  const ratio = (x - x1) / (1 - x1);
  return x1 + (1 - x1) * (1 - Math.pow(clampf(1 - ratio, 0, 1), 1 + s));
}
function lutLookup(lut, x) {
  if (x <= 0) return lut[0];
  if (x >= 1) return lut[LUT_SIZE];
  const fi = x * LUT_SIZE, i = fi | 0;
  return lut[i] + (lut[i + 1] - lut[i]) * (fi - i);
}
const toLinear = (transform, x) => (transform === TRANSFORM_REC709_G24 ? Math.pow(clampf(x, 0, 1), 2.4) : transform === TRANSFORM_DWG_INTERMEDIATE ? Math.pow(clampf(x, 0, 1), 2) : x);
const fromLinear = (transform, x) => (transform === TRANSFORM_REC709_G24 ? Math.pow(clampf(x, 0, 1), 1 / 2.4) : transform === TRANSFORM_DWG_INTERMEDIATE ? Math.pow(clampf(x, 0, 1), 0.5) : x);

function printStockChannelBias(printStock, amount) {
  const a = clampf(amount, 0, 2);
  let r = 1, g = 1, b = 1, c = 1;
  if (printStock === PRINT_LINEAR || a <= 0.001) return [1, 1, 1, 1];
  if (printStock === PRINT_CINEON_LOG) { c = 0.92; r = 1.00; g = 0.99; b = 1.02; }
  else if (printStock === PRINT_KODAK_2383) { c = 1.10; r = 1.035; g = 1.010; b = 0.965; }
  else if (printStock === PRINT_FUJI_3513) { c = 1.04; r = 0.995; g = 1.025; b = 1.015; }
  else if (printStock === PRINT_KODAK_ENDURA) { c = 1.08; r = 1.020; g = 1.005; b = 0.985; }
  else if (printStock === PRINT_BW_BROMOPORTRAIT) { c = 1.12; }
  return [lerpf(1, r, a), lerpf(1, g, a), lerpf(1, b, a), lerpf(1, c, a)];
}

/** Downsampled, blurred highlight buffer for halation (kind 0) or bloom (kind 1): buildGlowBuffer. */
function buildGlowBuffer(src, width, height, threshold, radius, kind, region, softness, inputTransform, scale) {
  const w = Math.ceil(width / scale), h = Math.ceil(height / scale);
  let data = new Float32Array(w * h * 3), temp = new Float32Array(w * h * 3);
  for (let gy = 0; gy < h; gy++) {
    const y = Math.min(height - 1, Math.round(gy * scale));
    for (let gx = 0; gx < w; gx++) {
      const x = Math.min(width - 1, Math.round(gx * scale));
      const p = (y * width + x) * 4;
      const pr = toLinear(inputTransform, src[p] / 255), pg = toLinear(inputTransform, src[p + 1] / 255), pb = toLinear(inputTransform, src[p + 2] / 255);
      const lum = lumaOf(pr, pg, pb);
      let key = Math.max(lum, pr * 0.92 + lum * 0.08), wt;
      if (kind === 1) {
        key = lum;
        const edge0 = Math.max(threshold, lerpf(0.56, 0.92, clampf(region, 0, 1)));
        wt = smoothstepf(edge0, edge0 + lerpf(0.22, 0.055, clampf(softness, 0, 1)), key);
      } else {
        wt = clampf((key - threshold) / Math.max(0.001, 1 - threshold), 0, 1);
        wt = wt * wt * (3 - 2 * wt);
      }
      const i = (gy * w + gx) * 3;
      if (kind === 0) { const leak = Math.max(pr, lum * 1.12) * wt; data[i] = leak; data[i + 1] = leak * 0.30; data[i + 2] = leak * 0.025; }
      else { data[i] = pr * wt; data[i + 1] = pg * wt; data[i + 2] = pb * wt; }
    }
  }
  const passes = 1 + Math.floor(clampf(radius * 0.25, 0, 4));
  for (let pass = 0; pass < passes; pass++) {
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        let ar = 0, ag = 0, ab = 0, total = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const yy = Math.min(h - 1, Math.max(0, gy + oy));
          for (let ox = -1; ox <= 1; ox++) {
            const xx = Math.min(w - 1, Math.max(0, gx + ox));
            const wt = ox === 0 && oy === 0 ? 2 : 1, si = (yy * w + xx) * 3;
            ar += data[si] * wt; ag += data[si + 1] * wt; ab += data[si + 2] * wt; total += wt;
          }
        }
        const di = (gy * w + gx) * 3;
        temp[di] = ar / total; temp[di + 1] = ag / total; temp[di + 2] = ab / total;
      }
    }
    [data, temp] = [temp, data];
  }
  return { w, h, scale, data };
}
function sampleGlow(gb, x, y, out) {
  const gx = clampf(x / gb.scale, 0, gb.w - 1), gy = clampf(y / gb.scale, 0, gb.h - 1);
  const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(gb.w - 1, x0 + 1), y1 = Math.min(gb.h - 1, y0 + 1);
  const tx = gx - x0, ty = gy - y0, d = gb.data;
  for (let c = 0; c < 3; c++) {
    const p00 = d[(y0 * gb.w + x0) * 3 + c], p10 = d[(y0 * gb.w + x1) * 3 + c], p01 = d[(y1 * gb.w + x0) * 3 + c], p11 = d[(y1 * gb.w + x1) * 3 + c];
    out[c] = lerpf(lerpf(p00, p10, tx), lerpf(p01, p11, tx), ty);
  }
}

/**
 * Renders `src` (RGBA8, sRGB-encoded) into a new RGBA8 array with params `p` (PhotoKamo param
 * paths = the plugin's parameter names). `timelineScale` = photo width / 1920.
 */
export function render(src, width, height, p) {
  const S = Math.max(1e-6, width / 1920); // timeline pixels → photo pixels
  const filmIdx = p.filmPreset;
  const effectMode = p.effectMode;
  const colorModeEnabled = effectMode !== EFFECT_TEXTURE_ONLY && effectMode !== EFFECT_GRAIN_HALATION;
  const textureModeEnabled = effectMode !== EFFECT_COLOR_ONLY;
  const grainHalationOnly = effectMode === EFFECT_GRAIN_HALATION;
  const useExpand = p.expandEnabled && colorModeEnabled;
  const usePrint = p.printEnabled && colorModeEnabled;
  const useColorHead = p.colorHeadEnabled && colorModeEnabled;
  const useFilmGrain = p.filmGrainEnabled && textureModeEnabled;
  const useHalation = p.halationEnabled && textureModeEnabled;
  const useBloom = p.bloomEnabled && textureModeEnabled && !grainHalationOnly;
  const useFilmDamage = p.filmDamageEnabled && textureModeEnabled && !grainHalationOnly;
  const useVignette = p.vignetteEnabled && !grainHalationOnly;

  const gp = grainProfileForPreset(filmIdx, p.filmGrainProfile);
  const hg = halationGainForProfile(filmIdx, p.halationProfile);
  const bg = bloomGainForProfile(filmIdx, p.bloomProfile);
  const dg = damageGainForProfile(filmIdx, p.filmDamageProfile);

  const fD = colorModeEnabled ? p.density : 0;
  let fH = useHalation ? clampf(stockHalationRenderAmount(filmIdx, p.halationProfile, p.halationAmount) * hg.gain, 0, 1) : 0;
  const fGr = useFilmGrain ? clampf((p.grain * gp.gain + p.filmGrainAmount * 0.62 * gp.gain) * (1 + p.pushPull * 0.10), 0, 2.2) : 0;
  const fSat = colorModeEnabled ? p.saturation : 1;
  const fV = useVignette ? clampf(p.vignette + p.vignetteAmount * 0.85, 0, 1.5) : 0;
  const fProfile = colorModeEnabled ? p.profileStrength : 0;
  const fPrintContrast = p.printContrast;
  const fPrintCustom = usePrint ? clampf(p.printAmount, 0, 2) : 0;
  const fPrint = colorModeEnabled ? p.printStrength + fPrintCustom * (0.90 + 0.75 * fPrintContrast) : 0;
  const fExpand = useExpand ? p.expandAmount : 0;
  const fPushPull = colorModeEnabled ? p.pushPull : 0;
  const fAcutance = textureModeEnabled && !grainHalationOnly ? p.acutance : 0;
  const fColorHead = useColorHead ? p.colorHeadAmount : 0;
  const fFilmGrainSize = clampf(gp.size + (p.filmGrainSize - 0.35) * 0.80, 0, 1);
  const fFilmGrainColor = clampf(lerpf(gp.color, p.filmGrainColor, 0.55), 0, 1);
  const mix = p.filmGrainProfile === GRAIN_CUSTOM ? 1 : 0.45;
  const fShadows = clampf(lerpf(gp.shadows, p.filmGrainShadows, mix), 0, 1);
  const fMids = clampf(lerpf(gp.mids, p.filmGrainMids, mix), 0, 1);
  const fHighs = clampf(lerpf(gp.highlights, p.filmGrainHighlights, mix), 0, 1);
  const fResolution = clampf(lerpf(gp.resolution, p.filmGrainResolution, mix), 0, 1);
  const fChroma = clampf(lerpf(gp.chroma, p.filmGrainChroma, mix), 0, 1);
  let halThreshold = p.halationThreshold, halRadius = clampf(p.halationRadius * hg.radius, 0, 1), halWarmth = clampf(p.halationWarmth * hg.warmth, 0, 1);
  let halLocal = p.halationLocal, halGlobal = p.halationGlobal, halHue = p.halationHue, halBlueComp = p.halationBlueComp, halImpact = p.halationImpact, halDefringe = p.halationDefringe;
  if (nameHas(filmIdx, 'CineStill 800T') && useHalation) {
    fH = Math.max(fH, clampf(0.34 * hg.gain, 0, 1)); halThreshold = Math.min(halThreshold, 0.74);
    halRadius = Math.max(halRadius, clampf(0.60 * hg.radius, 0, 1)); halWarmth = Math.max(halWarmth, clampf(0.96 * hg.warmth, 0, 1));
    halLocal = Math.max(halLocal, 0.72); halGlobal = Math.min(halGlobal, 0.025); halHue = Math.max(halHue, 0.72);
    halBlueComp = Math.max(halBlueComp, 0.86); halImpact = Math.max(halImpact, 0.58); halDefringe = Math.max(halDefringe, 0.42);
  }
  const fBloom = useBloom ? clampf(p.bloomAmount * 0.42 * bg.gain, 0, 1) : 0;
  const bloomRadius = clampf(p.bloomRadius * bg.radius, 0, 1);
  const showBloomMask = p.bloomMaskPreview === 1;
  const fDamage = useFilmDamage ? p.filmDamageAmount * dg.gain : 0;
  const fDust = clampf(p.filmDust * dg.dust, 0, 1), fScratch = clampf(p.filmScratch * dg.scratch, 0, 1);
  const fColorDensity = usePrint ? (p.colorDensity - 0.35) * (0.45 + 0.35 * fPrintCustom) : 0;
  const fVibrance = colorModeEnabled ? p.vibrance : 0;
  const fPrinterR = usePrint ? p.printerRed : 0, fPrinterG = usePrint ? p.printerGreen : 0, fPrinterB = usePrint ? p.printerBlue : 0;
  const fSplit = usePrint ? p.splitToneAmount : 0, fSplitWarmth = p.splitToneWarmth;
  const matrix = matrixForPreset(filmIdx);

  const curveStrength = clampf(fPrint, 0, 1.5);
  const lut = new Float32Array(LUT_SIZE + 1);
  const curveContrast = 1 + ((p.contrast - 1) + 0.32 * fPrintContrast * p.printAmount) * curveStrength;
  for (let i = 0; i <= LUT_SIZE; i++) lut[i] = sCurveFunc(i / LUT_SIZE, curveContrast, p.shoulder * curveStrength, p.toe * curveStrength);

  const doDensity = fD !== 0, doSat = fSat !== 1, doHalation = fH > 0.01, doGrain = fGr > 0.001, doVignette = fV > 0.001;
  const doExpand = fExpand > 0.001, doColorHead = fColorHead > 0.001, doBloom = fBloom > 0.001 || showBloomMask, doDamage = fDamage > 0.001;
  const densityFactor = fD * 0.15 * (0.35 + 0.65 * curveStrength);
  const grainScale = fGr * 0.4 * gp.highlightWeight;
  halThreshold = clampf(halThreshold, 0, 0.98);
  const halScale = fH * 0.20;
  const inT = p.inputTransform, outT = p.outputTransform;
  const glowScale = (p.previewQuality === 0 ? 8 : p.previewQuality === 2 ? 4 : 6) * S;
  const halGlow = doHalation ? buildGlowBuffer(src, width, height, halThreshold, 5 + 38 * halRadius, 0, 0, 0, inT, Math.max(2 * S, glowScale)) : null;
  const bloomGlow = doBloom ? buildGlowBuffer(src, width, height, p.bloomThreshold, 5 + 46 * bloomRadius, 1, p.bloomRegion, p.bloomSoftness, inT, Math.max(2 * S, glowScale)) : null;

  // Print response constants
  const [stockR, stockG, stockB, stockContrast] = printStockChannelBias(p.printStock, fPrintCustom);
  const printA = clampf(fPrintCustom, 0, 2);
  const printC = 1 + (0.22 + 0.46 * clampf(fPrintContrast * stockContrast, 0, 1)) * printA;
  const lightR = Math.pow(2, clampf(fPrinterR, -1, 1) * 0.13 * printA), lightG = Math.pow(2, clampf(fPrinterG, -1, 1) * 0.13 * printA), lightB = Math.pow(2, clampf(fPrinterB, -1, 1) * 0.13 * printA);
  const doLights = !(fPrintCustom <= 0.001 && Math.abs(fPrinterR) <= 0.001 && Math.abs(fPrinterG) <= 0.001 && Math.abs(fPrinterB) <= 0.001);
  const ppC = 1 + clampf(fPushPull, -2, 2) * 0.105, ppD = 1 - clampf(fPushPull, -2, 2) * 0.025;
  const exA = clampf(fExpand, 0, 2), exBlack = clampf(p.expandBlack, 0, 1) * 0.08 * exA, exScale = 1 / ((1 + clampf(p.expandWhite, 0, 1) * 0.22 * exA) - exBlack), exC = 1 + 0.26 * exA;
  const chA = clampf(fColorHead, 0, 2);
  const chR = Math.pow(2, (-p.colorHeadCyan * 0.35 + 0.10) * chA), chG = Math.pow(2, (-p.colorHeadMagenta * 0.35 - 0.02) * chA), chB = Math.pow(2, (-p.colorHeadYellow * 0.35 - 0.08) * chA);
  const glow = [0, 0, 0];
  const vRadius = lerpf(0.22, 1.12, clampf(p.vignetteRadius, 0, 1)), vFeather = lerpf(0.10, 0.95, clampf(p.vignetteFeather, 0, 1));
  const out = new Uint8ClampedArray(width * height * 4);
  const srcLuma = fAcutance ? (x, y) => { x = Math.min(width - 1, Math.max(0, x)); y = Math.min(height - 1, Math.max(0, y)); const q = (y * width + x) * 4; return lumaOf(src[q] / 255, src[q + 1] / 255, src[q + 2] / 255); } : null;
  const grainSeed = gp.grainTextureSeed, clumpK = clampf(gp.grainClump, 0, 1), silver = clampf(gp.grainSilverRetention, 0, 1);
  const modeGain = p.filmGrainMode === GRAIN_MODE_DETAIL ? 0.78 : p.filmGrainMode === GRAIN_MODE_DYE_CLOUD ? 1.12 : 1;
  let colorMixBase = clampf(fFilmGrainColor + fChroma * 0.32, 0, 1) * (1 - silver * 0.76);
  if (p.filmGrainMode === GRAIN_MODE_DYE_CLOUD) colorMixBase = clampf(colorMixBase + 0.22, 0, 1);
  const fineSize = clampf(fFilmGrainSize * (1.22 - 0.68 * fResolution) * (1 + clumpK * 0.28), 0.02, 1);
  const neScaleFor = a => 0.025 + 0.11 * clampf(a, 0, 2);
  const neGrainSize = 0.45 + 5.5 * clampf(fineSize, 0, 1);
  const halMixK = 0.030 + 0.120 * clampf(halImpact, 0, 1);

  for (let y = 0; y < height; y++) {
    const ny = (y + 0.5) / height;
    const ty = Math.floor(y / S); // timeline-pixel row (grain, damage)
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const tx = Math.floor(x / S);
      let r = toLinear(inT, src[si] / 255), g = toLinear(inT, src[si + 1] / 255), b = toLinear(inT, src[si + 2] / 255);
      if (fPushPull !== 0 && Math.abs(fPushPull) > 0.001) { const l = lumaOf(r, g, b); r = (l + (r - l) * ppC) * ppD; g = (l + (g - l) * ppC) * ppD; b = (l + (b - l) * ppC) * ppD; }
      if (doExpand) { r = 0.5 + ((r - exBlack) * exScale - 0.5) * exC; g = 0.5 + ((g - exBlack) * exScale - 0.5) * exC; b = 0.5 + ((b - exBlack) * exScale - 0.5) * exC; }
      r = lutLookup(lut, r); g = lutLookup(lut, g); b = lutLookup(lut, b);
      if (p.printStock === PRINT_BW_BROMOPORTRAIT && fPrintCustom > 0.001) { const l = lumaOf(r, g, b); r = lerpf(r, l, fPrintCustom); g = lerpf(g, l, fPrintCustom); b = lerpf(b, l, fPrintCustom); }
      r *= stockR; g *= stockG; b *= stockB;
      if (fPrintCustom > 0.001) { // applyPrintResponse
        r = 0.42 + (r - 0.42) * printC; g = 0.42 + (g - 0.42) * printC; b = 0.42 + (b - 0.42) * printC;
        const l = lumaOf(r, g, b), hi = smoothstepf(0.52, 1.08, Math.max(r, g, b)), sh = 1 - smoothstepf(0.08, 0.48, l);
        r *= 1 + 0.055 * printA * hi - 0.012 * printA * sh; g *= 1 + 0.010 * printA * hi - 0.010 * printA * sh; b *= 1 - 0.050 * printA * hi + 0.030 * printA * sh;
        const dens = 1 - 0.045 * printA * (1 - clampf(l, 0, 1)); r *= dens; g *= dens; b *= dens;
      }
      if (doLights) { r *= lightR; g *= lightG; b *= lightB; }
      if (doDensity) { const l = Math.min(1, lumaOf(r, g, b)), s = 1 - densityFactor * (1 - l); r = l + (r - l) * s; g = l + (g - l) * s; b = l + (b - l) * s; }
      if (fProfile > 0.001) { // applyFilmMatrix
        const s = clampf(fProfile, 0, 2);
        const mr = matrix[0] * r + matrix[1] * g + matrix[2] * b, mg = matrix[3] * r + matrix[4] * g + matrix[5] * b, mb = matrix[6] * r + matrix[7] * g + matrix[8] * b;
        r += (mr - r) * s; g += (mg - g) * s; b += (mb - b) * s;
      }
      if (doColorHead) {
        const l = lumaOf(r, g, b); r *= chR; g *= chG; b *= chB;
        const k = lumaOf(r, g, b), comp = k > 0.001 ? l / k : 1, f = lerpf(1, comp, 0.35); r *= f; g *= f; b *= f;
      }
      if (fColorDensity !== 0) { const l = lumaOf(r, g, b), s = 1 + fColorDensity; r = l + (r - l) * s; g = l + (g - l) * s; b = l + (b - l) * s; }
      if (doSat) { const l = lumaOf(r, g, b); r = l + (r - l) * fSat; g = l + (g - l) * fSat; b = l + (b - l) * fSat; }
      if (fVibrance > 0.001) {
        const l = lumaOf(r, g, b), chroma = clampf(Math.max(r, g, b) - Math.min(r, g, b), 0, 1), k = 1 + clampf(fVibrance, 0, 1) * (0.55 * (1 - chroma));
        r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k;
      }
      if (fSplit > 0.001) {
        const a = clampf(fSplit, 0, 1), w = clampf(fSplitWarmth, 0, 1), l = clampf(lumaOf(r, g, b), 0, 1);
        const shadow = 1 - smoothstepf(0.18, 0.55, l), high = smoothstepf(0.45, 0.92, l);
        r += a * (shadow * (0.030 - 0.020 * w) + high * (0.050 * w)); g += a * (shadow * 0.006 + high * 0.010); b += a * (shadow * (0.050 * (1 - w)) - high * 0.030 * w);
      }
      if (doHalation) {
        const l = lumaOf(r, g, b);
        if (l > halThreshold) { const ha = (l - halThreshold) * halScale; r += ha * (0.95 + 0.35 * halWarmth); g += ha * (0.18 + 0.26 * halWarmth); b += ha * (0.03 + 0.12 * (1 - halWarmth)); }
        if (halGlow) { // applyCineStillHalation
          sampleGlow(halGlow, x, y, glow);
          const a = clampf(fH, 0, 2), warm = clampf(halWarmth, 0, 1), gl = lumaOf(glow[0], glow[1], glow[2]);
          const veil = clampf(Math.max(glow[0] * 1.28, gl * 0.92) * clampf(a * 0.52, 0, 0.85), 0, 0.95);
          const baseLum = clampf(lumaOf(r, g, b), 0, 1.4), ring = clampf(1.15 - 0.75 * smoothstepf(0.72, 1.10, baseLum), 0.32, 1.15);
          r += veil * ring * (0.96 + 0.48 * warm); g += veil * ring * (0.035 + 0.135 * warm); b += veil * ring * (0.003 + 0.020 * (1 - warm));
          const tint = clampf(veil * ring * (0.48 + 0.38 * warm), 0, 0.72);
          g = lerpf(g, Math.min(g, r * (0.24 + 0.10 * (1 - warm))), tint); b = lerpf(b, Math.min(b, r * (0.018 + 0.045 * (1 - warm))), tint);
        }
        { // applyHalationControls
          const a = clampf(fH, 0, 2), l2 = clampf(lumaOf(r, g, b), 0, 1.4), hi = smoothstepf(0.68, 1.08, l2), h = clampf(halHue, 0, 1);
          const m = a * halMixK * hi;
          r += m * (0.74 + 0.34 * clampf(halLocal, 0, 1) + 0.08 * clampf(halGlobal, 0, 1)); g += m * (0.065 + 0.115 * h);
          b += m * (0.010 + 0.070 * (1 - h)) * (1 - 0.78 * clampf(halBlueComp, 0, 1));
          const cb = clampf(m * (2.20 + 1.80 * clampf(halImpact, 0, 1)), 0, 0.45);
          g = lerpf(g, Math.min(g, r * (0.26 + 0.16 * (1 - h))), cb); b = lerpf(b, Math.min(b, r * (0.020 + 0.065 * (1 - h))), cb);
          b = lerpf(b, Math.min(b, l2 * 0.92 + r * 0.08), clampf(halDefringe, 0, 1) * hi * a);
        }
      }
      if (bloomGlow) {
        sampleGlow(bloomGlow, x, y, glow);
        if (showBloomMask) { r = g = b = clampf(Math.max(glow[0], glow[1], glow[2]) * 2, 0, 1); }
        else if (fBloom > 0.001) {
          const a = clampf(fBloom, 0, 1.25), gain = 1.08 + 1.12 * clampf(bloomRadius, 0, 1), m = clampf(a * 0.28, 0, 0.55);
          const br = clampf(glow[0] * gain, 0, 1.8), bgc = clampf(glow[1] * gain, 0, 1.8), bb = clampf(glow[2] * gain, 0, 1.8);
          r = screenBlendf(r, br, m); g = screenBlendf(g, bgc, m); b = screenBlendf(b, bb, m);
          const spill = clampf((br + bgc + bb) * 0.0045 * m, 0, 0.055); r += spill; g += spill; b += spill;
          // applyBloomControls (with the raw glow values, as the plugin passes them)
          const lightMask = smoothstepf(0.42, 1.05, Math.max(glow[0], glow[1], glow[2])) * clampf(p.bloomSaveLights, 0, 1);
          r = lerpf(r, Math.max(r, glow[0]), lightMask * 0.18); g = lerpf(g, Math.max(g, glow[1]), lightMask * 0.18); b = lerpf(b, Math.max(b, glow[2]), lightMask * 0.18);
          const l = lumaOf(r, g, b), dfr = 1 - clampf(p.bloomDefringe, 0, 1) * 0.25, keep = 0.72 + 0.28 * clampf(p.bloomDetail, 0, 1);
          r = l + (r - l) * dfr; g = l + (g - l) * dfr; b = l + (b - l) * dfr;
          r = lerpf(l, r, keep); g = lerpf(l, g, keep); b = lerpf(l, b, keep);
        }
      }
      if (!showBloomMask && doGrain) {
        const lf = 0.05 + 0.9 * Math.min(1, lumaOf(r, g, b));
        r += (grainNoise(tx, ty, 42) - 0.5) * grainScale * lf; g += (grainNoise(tx, ty, 137) - 0.5) * grainScale * lf; b += (grainNoise(tx, ty, 293) - 0.5) * grainScale * lf;
        if (fGr > 0.001) { // applyProfiledFilmGrain → applyNativeEnhancerFilmGrain (render time 0)
          const l = clampf(lumaOf(r, g, b), 0, 1);
          const tonal = 0.18 + (1 - smoothstepf(0.12, 0.52, l)) * fShadows + clampf(1 - Math.abs(l - 0.48) * 2.2, 0, 1) * fMids + smoothstepf(0.52, 0.96, l) * fHighs;
          const frame = Math.floor(grainSeed); // timeSeed(0, 24, seed)
          const clumpNoise = nativeEnhancerNoise(tx * 0.015 + grainSeed, ty * 0.015 + frame * 0.11, 101 + grainSeed);
          const amount = fGr * tonal * modeGain * lerpf(0.88, 1.34, clumpNoise) * (1 + clumpK * 0.35);
          if (amount > 0.001) {
            const gx = tx + Math.trunc(grainSeed), gy = ty - Math.trunc(grainSeed * 0.5), fr = Math.floor(grainSeed * 0.013 * 18); // timeSeed(seed*0.013, 18, 0)
            const scale = neScaleFor(amount), nx = gx / neGrainSize, nyy = gy / neGrainSize;
            let nr = nativeEnhancerNoise(nx + fr * 1.425, nyy, 1) * 2 - 1, ng = nativeEnhancerNoise(nx, nyy + fr * 3.892, 2) * 2 - 1, nb = nativeEnhancerNoise(nx + fr * 5.835, nyy + fr, 3) * 2 - 1;
            const mono = lumaOf(nr, ng, nb); nr = lerpf(mono, nr, colorMixBase); ng = lerpf(mono, ng, colorMixBase); nb = lerpf(mono, nb, colorMixBase);
            const safe = clampf(1.20 - 0.70 * clampf(Math.max(r, g, b), 0, 1), 0.25, 1.20);
            const fine = nativeEnhancerNoise(gx + fr * 11, gy - fr * 7, 9) * 2 - 1;
            r += (nr * scale + fine * scale * 0.25) * safe; g += (ng * scale + fine * scale * 0.22) * safe; b += (nb * scale + fine * scale * 0.28) * safe;
          }
        }
      }
      if (!showBloomMask && fAcutance !== 0 && Math.abs(fAcutance) > 0.001) {
        const c = srcLuma(x, y), around = (srcLuma(x - 1, y) + srcLuma(x + 1, y) + srcLuma(x, y - 1) + srcLuma(x, y + 1)) * 0.25;
        const hp = (c - around) * clampf(fAcutance, -1, 1) * 0.55; r += hp; g += hp; b += hp;
      }
      if (!showBloomMask && doVignette) {
        const dx = ((x + 0.5) / width - 0.5) * 2, dy = (ny - 0.5) * 2;
        const vf = 1 - clampf(fV * 0.95, 0, 1.6) * smoothstepf(vRadius, vRadius + vFeather, Math.sqrt(dx * dx + dy * dy));
        r *= vf; g *= vf; b *= vf;
      }
      r = clampf(r, 0, 1); g = clampf(g, 0, 1); b = clampf(b, 0, 1);
      if (!showBloomMask && doDamage) { // applyDustAndScratches (render time 0)
        const a = clampf(fDamage, 0, 2);
        const dust = nativeEnhancerNoise(tx, ty, 31);
        if (dust > 1 - 0.0120 * a * fDust) {
          const pol = nativeEnhancerNoise(ty, 0, 34), spot = pol > 0.58 ? lerpf(0.76, 1.55, pol) : lerpf(0.42, 0.86, pol);
          r *= spot; g *= spot; b *= spot;
        }
        const col = nativeEnhancerNoise(Math.floor(tx * 0.04), 0, 57), sn = nativeEnhancerNoise(ty * 0.35, 0, 61);
        if (col > 1 - 0.080 * a * fScratch && sn > 0.18) { const line = sn > 0.72 ? 1 + 0.80 * a * fScratch : 1 - 0.35 * a * fScratch; r *= line; g *= line; b *= line; }
      }
      // Uint8ClampedArray rounds to nearest on assignment.
      out[si] = clampf(fromLinear(outT, r), 0, 1) * 255;
      out[si + 1] = clampf(fromLinear(outT, g), 0, 1) * 255;
      out[si + 2] = clampf(fromLinear(outT, b), 0, 1) * 255;
      out[si + 3] = src[si + 3];
    }
  }
  return out;
}
