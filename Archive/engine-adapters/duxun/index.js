// Engine contract for DuXun Film Simulation (see js/engines/spektrafilm-rs/index.js for the shape).
// The engine itself is js/engines/duxun/core.js, a JavaScript port of the plugin's CPU renderer,
// run in a worker. No other downloads.
import { sections } from './params.js';
import { PRESETS, CUSTOM_PRESET, brandOf, BRANDS, isBlackAndWhitePreset, presetValues, profileChange } from './core.js';
import { engineInfo, fullRenderSize, render as renderJob, warm as warmJob, dispose, onDownload } from './engine.js';

export { sections };
export const controls = sections.flatMap(section => section.controls.filter(control => control.path).map(control => ({ ...control, section: section.id })));
export const controlByPath = Object.fromEntries(controls.map(control => [control.path, control]));

const clone = value => (Array.isArray(value) ? [...value] : value);
const asParam = (path, value) => (controlByPath[path]?.kind === 'select' ? String(value) : value);
/** Params with film `idx`'s preset applied, as choosing it in the plugin does. */
function withPreset(params, idx) {
  for (const [path, value] of Object.entries(presetValues(idx))) if (path in controlByPath) params[path] = asParam(path, value);
  return params;
}
const staticDefaults = () => Object.fromEntries(controls.map(control => [control.path, clone(control.default)]));
/** Plugin defaults, then the default film's preset (Kodak Portra 400). */
export function defaultParams() { return withPreset(staticDefaults(), Number(controlByPath.filmPreset.default)); }

/** What Reset returns a setting to: the current film's preset value where the preset sets it. */
export function defaultFor(params, path) {
  const idx = Number(params.filmPreset);
  if (path !== 'filmPreset' && idx !== CUSTOM_PRESET) {
    const preset = presetValues(idx);
    if (path in preset) return asParam(path, preset[path]);
  }
  return clone(controlByPath[path].default);
}
const near = (a, b, control) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= (control?.step ?? 0) / 2 + 1e-9 : a === b);
export const sameValue = near;
export function isChanged(params, path) { return !near(params[path], defaultFor(params, path), controlByPath[path]); }

export function normalizeParams(params) {
  const base = defaultParams();
  if (params && controlByPath.filmPreset.options.includes(params.filmPreset)) {
    withPreset(base, Number(params.filmPreset));
    base.filmPreset = params.filmPreset;
  }
  for (const control of controls) {
    const value = params?.[control.path];
    if (value === undefined || typeof value !== typeof base[control.path]) continue;
    if (control.kind === 'select' && !control.options.includes(value)) continue;
    if (control.kind === 'float' && (value < control.min || value > control.max)) continue;
    base[control.path] = value;
  }
  return base;
}

export const sliderValue = (control, value) => value;
const decimals = step => (String(step).includes('.') ? String(step).split('.')[1].length : 0);
export function formatValue(control, value) {
  const text = Number(value).toFixed(decimals(control.step));
  return control.signed && value > 0 ? `+${text}` : text;
}
/** Option text for a select (film names, translated choice labels). */
export function optionLabel(value, path) { return controlByPath[path]?.labels?.[value] ?? PRESETS[Number(value)]?.[0] ?? String(value); }
export function optionGroup(value, path) {
  if (path !== 'filmPreset') return '';
  const idx = Number(value);
  return idx === CUSTOM_PRESET ? 'Custom' : `${BRANDS[brandOf(idx)]}${isBlackAndWhitePreset(idx) ? ' · black & white' : ''}`;
}

const filmName = params => PRESETS[Number(params.filmPreset)]?.[0] ?? 'Film';
const fmt = (path, value) => formatValue(controlByPath[path], value);
const onOff = (params, items) => items.filter(([path]) => params[path]).map(([, label]) => label).join(' · ') || 'Off';
export const stockSummary = params => `${filmName(params)} · ${controlByPath.effectMode.labels[params.effectMode]}`;
export const sectionSummary = {
  film: stockSummary,
  curve: params => `Contrast ${fmt('contrast', params.contrast)} · shoulder ${fmt('shoulder', params.shoulder)} · toe ${fmt('toe', params.toe)}`,
  colour: params => `Density ${fmt('density', params.density)} · saturation ${fmt('saturation', params.saturation)}`,
  print: params => (params.printEnabled ? `${controlByPath.printStock.labels[params.printStock]} · ${fmt('printAmount', params.printAmount)}` : 'Off'),
  texture: params => onOff(params, [['filmGrainEnabled', 'Grain'], ['halationEnabled', 'Halation'], ['bloomEnabled', 'Bloom']]),
  finish: params => onOff(params, [['filmDamageEnabled', 'Damage'], ['vignetteEnabled', 'Vignette']])
};

/** Plain values for core.js (numeric choices, booleans). */
export function coreParams(params) {
  const out = {};
  for (const control of controls) {
    const value = params[control.path];
    out[control.path] = control.kind === 'select' ? Number(value) : value;
  }
  return out;
}
export const render = (bitmap, params, options) => renderJob(bitmap, coreParams(params), options);
export const warm = () => warmJob();
export { engineInfo, fullRenderSize, dispose, onDownload };

/** Everything renders in the preview. */
export const hasSpatialEffects = () => false;
export const spatialNote = '';
export const showsPaper = () => true;
export const firstStep = 'film';
// Nothing carries over from other engines: in DuXun the film preset sets every module, as in the plugin.
export const shared = {};

const PROFILE_PATHS = ['filmGrainProfile', 'halationProfile', 'bloomProfile', 'filmDamageProfile', 'printStock', 'filmGrainMode'];
export const ui = {
  // The plugin's instanceChanged: a film applies its preset (not "Custom"); a profile or print
  // stock choice re-derives its sliders (syncCustomProfileSliders).
  beforeChange(params, path, value) {
    if (path === 'filmPreset') { const idx = Number(value); if (idx !== CUSTOM_PRESET) withPreset(params, idx); return; }
    if (PROFILE_PATHS.includes(path)) {
      const changes = profileChange(path, Number(value), { ...coreParams(params), [path]: Number(value) });
      for (const [key, v] of Object.entries(changes)) if (key in controlByPath) params[key] = asParam(key, v);
    }
  },
  sync() {}
};
