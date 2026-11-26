import {
  sections, controls, controlByPath, defaultParams, defaultFor, defaultsFor, sameValue, isChanged,
  sliderValue, formatValue, optionLabel, optionGroup, sectionSummary, stockSummary, compatibleOutput,
  engineJob, getSpectralOutput, getSpectralStock, sectionVisible, creativeBase, creativeNote,
  presetDefaults, presetFor, presetNote,
} from './params.js';
import { engineInfo, fullRenderSize as sizeForJob, setPixelLimit, render as renderJob, warm as warmJob, dispose, onDownload } from './engine.js';

export { sections, controls, controlByPath, defaultParams, defaultFor, sameValue, isChanged, sliderValue, formatValue,
  optionLabel, optionGroup, sectionSummary, stockSummary, sectionVisible, engineInfo, setPixelLimit, dispose, onDownload };
/** Size of a full-quality render of a width × height photo with these settings (creative looks are capped lower). */
export const fullRenderSize = (width, height, params = null) => sizeForJob(width, height, params ? engineJob(normalizeParams(params)) : null);
/** What caps a full render: 'engine' (creative looks: one pass) or 'device' (spectral: tiled up to the canvas limit). */
export const fullRenderLimit = params => (engineJob(normalizeParams(params)).creative ? 'engine' : 'device');

export function normalizeParams(params) {
  const stockId = controlByPath.stockId.options.includes(params?.stockId) ? params.stockId : defaultParams().stockId;
  const base = defaultsFor(stockId);
  for (const control of controls) {
    const value = params?.[control.path];
    if (value === undefined || typeof value !== typeof base[control.path]) continue;
    if (control.kind === 'select' && !control.options.includes(value)) continue;
    if (control.kind === 'float' && (value < control.min || value > control.max)) continue;
    base[control.path] = value;
  }
  if (!compatibleOutput(base.stockId, base.outputId)) base.outputId = defaultsFor(base.stockId).outputId;
  base.presetId = presetFor(base); // a preset always belongs to the current stock
  return base;
}

export const render = (bitmap, params, options) => renderJob(bitmap, engineJob(normalizeParams(params)), options);
export const warm = params => warmJob(engineJob(normalizeParams(params)));
export const hasSpatialEffects = () => false; // the complete model runs in previews
export const spatialNote = '';
export const showsPaper = params => !creativeBase(params.stockId) && getSpectralOutput(params.outputId)?.type === 'print';
export const paperTint = params => showsPaper(params) ? 'warm' : null;
export const firstStep = 'input';
export const shared = { film: 'stockId', paper: 'outputId', exposureEv: 'filmExposure', grain: 'grain', halation: 'halation' };

export const ui = {
  beforeChange(params, path, value) {
    // A preset sets its stock, output and settings; a stock change resets stock-dependent native defaults.
    if (path === 'presetId') Object.assign(params, presetDefaults(value));
    else if (path === 'stockId') Object.assign(params, defaultsFor(value));
  },
  sync(params, find, root) {
    const output = find('outputId');
    output.closest('.adv-control').hidden = Boolean(creativeBase(params.stockId)); // creative looks have no print or scan
    for (const option of output.options) option.disabled = !compatibleOutput(params.stockId, option.value);
    const stock = getSpectralStock(params.stockId);
    root.querySelector(`#${find('stockId').id}-hint`).textContent = creativeNote(params.stockId) || stock?.notes?.[0] || controlByPath.stockId.hint;
    root.querySelector(`#${find('presetId').id}-hint`).textContent = presetNote(params.presetId) || controlByPath.presetId.hint;
    root.querySelector(`#${output.id}-hint`).textContent = getSpectralOutput(params.outputId)?.notes?.[0] || controlByPath.outputId.hint;
  },
};