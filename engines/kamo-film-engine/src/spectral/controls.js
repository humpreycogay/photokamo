// Control definitions for the spectral film engine.
//
// `stage` says where each control acts, which also decides what must be
// recomputed when it changes:
//   scene  – scene-linear light before the film (lens/camera effects)
//   film   – the negative/slide itself (rebuilds the film LUT)
//   print  – printing or scanning of the negative (rebuilds the print LUT)
//   post   – display-referred editing after the film rendering
// `stockDefault` marks controls whose default depends on the selected stock.

export const spectralControlGroups = Object.freeze([
  {
    id: 'input', label: 'Input', open: false,
    note: 'Camera JPEGs are already tone-mapped. Linear or HDR files need no correction.',
    controls: [
      { key: 'highlightRecovery', label: 'Highlight recovery', min: 0, max: 4, step: 0.1, default: 0, unit: 'stops', stage: 'scene',
        help: 'Undoes a generic camera highlight roll-off so display white maps this many stops above 1.0 in scene light before the film. Ignored for linear input.' },
    ],
  },
  {
    id: 'film', label: 'Film', open: true,
    note: 'Calibrated stages: these act on the datasheet model itself.',
    controls: [
      { key: 'filmExposure', label: 'Film exposure', min: -4, max: 4, step: 0.1, default: 0, unit: 'EV', stage: 'scene',
        help: 'Camera exposure onto the film, read through the characteristic curves.' },
      { key: 'sceneKelvin', label: 'Scene light', min: 2500, max: 10000, step: 50, default: 5500, unit: 'K', stage: 'scene', stockDefault: true,
        help: 'Colour temperature of the light in the scene. Defaults to the stock’s design illuminant; tungsten film under daylight turns blue.' },
      { key: 'development', label: 'Development', min: 0.7, max: 1.4, step: 0.01, default: 1, unit: '×γ', stage: 'film',
        help: 'Push/pull contrast: scales negative density above D-min (reversal: about mid-grey).' },
      { key: 'interlayer', label: 'Interlayer effect', min: 0, max: 100, step: 1, default: 0, unit: '%', stage: 'film',
        help: 'DIR-coupler inhibition between layers (saturation). Neutrals are pre-compensated so greys never shift. Strength is not in the datasheets; set by eye.' },
      { key: 'neutralLock', label: 'Neutral lock', min: 0, max: 100, step: 1, default: 100, unit: '%', stage: 'print', stockDefault: true,
        help: 'Keeps the grey axis neutral at every density. Prints and scans default to 100 % (a lab timer, minilab or scanner operator neutralises greys; 0 shows the raw channel crossovers). Slides default to 0 %: their datasheet neutral is not exactly D50-neutral, and correcting it is a choice, not data.' },
      { key: 'printRed', label: 'Printer light R', min: -20, max: 20, step: 1, default: 0, unit: 'pts', stage: 'print',
        help: 'Timing offset in printer points (0.025 log E). Positive values make the image redder.' },
      { key: 'printGreen', label: 'Printer light G', min: -20, max: 20, step: 1, default: 0, unit: 'pts', stage: 'print',
        help: 'Positive values make the image greener (less magenta).' },
      { key: 'printBlue', label: 'Printer light B', min: -20, max: 20, step: 1, default: 0, unit: 'pts', stage: 'print',
        help: 'Positive values make the image bluer (less yellow).' },
      { key: 'printDensity', label: 'Print density', min: -20, max: 20, step: 1, default: 0, unit: 'pts', stage: 'print',
        help: 'Overall printing exposure. Positive values print darker.' },
      { key: 'amount', label: 'Film amount', min: 0, max: 100, step: 1, default: 100, unit: '%', stage: 'post',
        help: 'Blend between the original image and the film rendering.' },
    ],
  },
  {
    id: 'light', label: 'Light', open: true,
    controls: [
      { key: 'exposure', label: 'Exposure', min: -3, max: 3, step: 0.05, default: 0, unit: 'EV', stage: 'post' },
      { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, default: 0, stage: 'post' },
      { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, default: 0, stage: 'post' },
      { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, default: 0, stage: 'post' },
      { key: 'whites', label: 'Whites', min: -100, max: 100, step: 1, default: 0, stage: 'post' },
      { key: 'blacks', label: 'Blacks', min: -100, max: 100, step: 1, default: 0, stage: 'post' },
    ],
  },
  {
    id: 'color', label: 'Color', open: false,
    controls: [
      { key: 'temp', label: 'Temp', min: -100, max: 100, step: 1, default: 0, stage: 'post',
        help: 'Display white balance after the film. For film-accurate colour use Scene light or printer lights.' },
      { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1, default: 0, stage: 'post' },
      { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1, default: 0, stage: 'post' },
      { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, default: 0, stage: 'post' },
    ],
  },
  {
    id: 'effects', label: 'Effects', open: false,
    controls: [
      { key: 'vignette', label: 'Vignette', min: -100, max: 100, step: 1, default: 0, stage: 'scene',
        help: 'Lens light fall-off applied before the film, so corners roll through the film toe.' },
      { key: 'vignetteMidpoint', label: 'Midpoint', min: 0, max: 100, step: 1, default: 50, stage: 'scene' },
      { key: 'vignetteFeather', label: 'Feather', min: 0, max: 100, step: 1, default: 50, stage: 'scene' },
    ],
  },
  {
    id: 'detail', label: 'Detail', open: false,
    controls: [
      { key: 'filmSharpness', label: 'Film MTF', min: 0, max: 100, step: 1, default: 100, unit: '%', stage: 'scene',
        help: 'The stock’s published MTF (blur plus adjacency edge effect), applied per layer at physical scale. Has no effect on stocks without MTF data.' },
      { key: 'sharpening', label: 'Sharpening', min: 0, max: 150, step: 1, default: 0, stage: 'post' },
    ],
  },
  {
    id: 'lens', label: 'Lens', open: false,
    controls: [
      { key: 'halation', label: 'Halation', min: 0, max: 100, step: 1, default: 0, stage: 'scene',
        help: 'Light scattered back from the film base, mostly into the red-sensitive layer. No halation data is published, so this is not calibrated.' },
      { key: 'chromaticAberration', label: 'Chromatic aberration', min: 0, max: 100, step: 1, default: 0, stage: 'scene' },
    ],
  },
  {
    id: 'grain', label: 'Grain', open: false,
    controls: [
      { key: 'grain', label: 'Grain intensity', min: 0, max: 100, step: 1, default: 25, stage: 'scene', stockDefault: true,
        help: 'Per-layer density noise. Estimated from ISO speed: the dataset has no RMS granularity, so this is not calibrated.' },
      { key: 'grainSize', label: 'Grain size', min: 0, max: 100, step: 1, default: 35, stage: 'scene' },
    ],
  },
]);

/** Panel features from comparable editors that this engine deliberately does not model. */
export const unsupportedControls = Object.freeze([
  'HSL / colour mix and colour wheels',
  'Volumetric fog',
  'Dehaze',
  'Noise reduction (classic or AI)',
  'Anamorphic lens mode',
  'Digital noise amount',
  'Local adjustments',
  'AI extended dynamic range',
]);

export const spectralControls = Object.freeze(
  Object.fromEntries(spectralControlGroups.flatMap(group => group.controls).map(control => [control.key, control])),
);

export function defaultSpectralSettings(stock) {
  const settings = Object.fromEntries(Object.values(spectralControls).map(control => [control.key, control.default]));
  if (stock) {
    settings.sceneKelvin = stock.designKelvin;
    settings.grain = grainForSpeed(stock.speed);
    settings.neutralLock = stock.kind === 'color-reversal' ? 0 : 100;
  }
  return settings;
}

/** Rough default grain from nominal ISO speed (heuristic, not measured RMS granularity). */
export function grainForSpeed(speed) {
  if (!Number.isFinite(speed) || speed <= 0) return 25;
  return Math.round(Math.min(60, Math.max(8, 8 + 9 * Math.log2(speed / 50))));
}

export function normalizeSpectralSettings(settings = {}, stock) {
  const base = defaultSpectralSettings(stock);
  const out = { ...base };
  for (const [key, control] of Object.entries(spectralControls)) {
    const value = Number(settings[key]);
    out[key] = Number.isFinite(value) ? Math.min(control.max, Math.max(control.min, value)) : base[key];
  }
  out.seed = Number.isFinite(Number(settings.seed)) ? Number(settings.seed) >>> 0 : 1729;
  out.outputSpace = settings.outputSpace === 'display-p3' ? 'display-p3' : 'srgb';
  return out;
}
