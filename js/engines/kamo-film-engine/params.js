// PhotoKamo control metadata for Kamo's calibrated spectral engine. Labels, ranges and
// stock-dependent defaults come from the engine's own catalog/controls.
// Kamo's RGB look model (FilmEngine) also runs the B&W, instant and creative looks the calibration
// data doesn't cover: those bases are "stocks" `creative:<id>` with their own Creative section.
// Preset (`presetId`) is the engine demo's preset menu: a stock with its output and settings.
import {
  FilmEngine, defaultOutputFor, defaultSpectralSettings, getSpectralOutput, getSpectralStock,
  outputsForStock, presetTiers, spectralControlGroups, spectralControls, spectralOutputs, spectralPresets, spectralStocks,
  stockDisplayName,
} from '../../../engines/kamo-film-engine/src/index.js';

const DEFAULT_STOCK = 'kodak-gold-200';
const OMIT = new Set(['seed', 'outputSpace']); // deterministic internally; canvas output is sRGB
const sectionIds = { Input: 'input', Film: 'film', Light: 'light', Color: 'colour', Effects: 'effects', Detail: 'detail', Lens: 'lens', Grain: 'grain' };
const spatial = new Set(['chromaticAberration', 'vignette', 'vignetteMidpoint', 'vignetteFeather', 'halation', 'grain', 'grainSize', 'filmSharpness', 'sharpening']);
const stockById = Object.fromEntries(spectralStocks.map(stock => [stock.id, stock]));
const creativeEngine = new FilmEngine();
const creativeById = Object.fromEntries(creativeEngine.getPresets().map(base => [base.id, base]));
const CREATIVE = 'creative:';
/** The creative base id of a `creative:<id>` stock, or null for a spectral stock. */
export const creativeBase = stockId => (typeof stockId === 'string' && stockId.startsWith(CREATIVE) && creativeById[stockId.slice(CREATIVE.length)] ? stockId.slice(CREATIVE.length) : null);
// [path, FilmEngine key, label, min, max, step, unit]; ranges as in the engine's demo.
const creativeKeys = [
  ['creativeAmount', 'amount', 'Amount', 0, 1, 0.01], ['creativeExposure', 'exposure', 'Exposure', -2, 2, 0.05, 'EV'],
  ['creativeContrast', 'contrast', 'Contrast', -0.6, 0.6, 0.01], ['creativeToe', 'toe', 'Shadow toe', 0, 0.6, 0.01],
  ['creativeShoulder', 'shoulder', 'Highlight roll-off', 0, 0.6, 0.01], ['creativeSaturation', 'saturation', 'Saturation', 0, 2, 0.01],
  ['creativeWarmth', 'warmth', 'Warmth', -1, 1, 0.01], ['creativeGrain', 'grain', 'Grain', 0, 1, 0.01],
  ['creativeSoftness', 'softness', 'Softness', 0, 1, 0.01], ['creativeHalation', 'halation', 'Halation', 0, 1, 0.01],
  ['creativeBloom', 'bloom', 'Bloom', 0, 1, 0.01], ['creativeVignette', 'vignette', 'Vignette', 0, 1, 0.01],
];
const creativeKey = Object.fromEntries(creativeKeys.map(([path, key]) => [path, key]));
const neutral = creativeEngine.getPresetSettings('neutral');
const creativeControls = creativeKeys.map(([path, key, label, min, max, step, unit]) => ({
  path, label, kind: 'float', min, max, step, default: neutral[key], ...(unit ? { unit } : {}), ...(min < 0 ? { signed: true } : {}),
}));
const outputById = Object.fromEntries(spectralOutputs.map(output => [output.id, output]));

// Creative looks on the RGB model (from the engine demo's legacy-looks.js, plus PhotoKamo's extreme looks):
// [group, id, base, label, FilmEngine settings, note]. Slider keys become params; matrix, tint, monoMix and
// invert (worker: tones inverted before the look) stay fixed with the preset.
const creativeLooks = [
  ['bw', 'kodak-tri-x-400', 'silver-mono', 'Kodak Tri-X 400 look', { contrast: 0.34, grain: 0.3, toe: 0.1 }],
  ['bw', 'kodak-t-max-100', 'silver-mono', 'Kodak T-MAX 100 look', { contrast: 0.26, grain: 0.08, softness: 0.01 }],
  ['bw', 'fujifilm-acros-100ii', 'silver-mono', 'Fujifilm ACROS 100 II look', { contrast: 0.2, grain: 0.07, softness: 0.01, toe: 0.06 }],
  ['bw', 'agfaphoto-apx-100', 'silver-mono', 'AgfaPhoto APX 100 look', { contrast: 0.24, grain: 0.1, vignette: 0.06 }],
  ['bw', 'agfaphoto-apx-400', 'silver-mono', 'AgfaPhoto APX 400 look', { contrast: 0.3, grain: 0.25, vignette: 0.1 }],
  ['bw', 'ilford-pan-f-plus', 'silver-mono', 'ILFORD Pan F Plus look', { contrast: 0.3, grain: 0.04, softness: 0 }],
  ['bw', 'ilford-fp4-plus', 'silver-mono', 'ILFORD FP4 Plus look', { contrast: 0.22, grain: 0.1, toe: 0.07 }],
  ['bw', 'ilford-hp5-plus', 'silver-mono', 'ILFORD HP5 Plus look', { contrast: 0.24, grain: 0.25 }],
  ['bw', 'ilford-delta-100', 'silver-mono', 'ILFORD Delta 100 look', { contrast: 0.26, grain: 0.07, softness: 0.01 }],
  ['bw', 'ilford-delta-400', 'silver-mono', 'ILFORD Delta 400 look', { contrast: 0.28, grain: 0.16 }],
  ['bw', 'ilford-delta-3200', 'silver-mono', 'ILFORD Delta 3200 look', { contrast: 0.36, grain: 0.42, bloom: 0.04 }],
  ['instant', 'polaroid-color-itype', 'aged-print', 'Polaroid Color i-Type look', { warmth: 0.2, saturation: 0.76 }],
  ['instant', 'polaroid-bw-itype', 'silver-mono', 'Polaroid B&W i-Type look', { contrast: 0.12, grain: 0.2, softness: 0.13, vignette: 0.24 }],
  ['instant', 'instax-mini', 'aged-print', 'Fujifilm Instax Mini look', { saturation: 0.8, warmth: 0.08, contrast: -0.04, softness: 0.08 }],
  ...[['neutral', 'Clean Neutral'], ['warm-negative', 'Warm Negative'], ['vivid-chrome', 'Vivid Chrome'], ['soft-pastel', 'Soft Pastel'],
    ['lomo-night', 'Lomo Night'], ['silver-mono', 'Silver Mono'], ['aged-print', 'Aged Print']].map(([id, label]) => ['colour', id, id, label, {}]),
  ['creative', 'infrared', 'neutral', 'Infrared (Aerochrome-style)', { matrix: [0.9, 0.7, -0.15, 0.7, 0.05, 0, 0, 0.7, 0.15], saturation: 1.25, contrast: 0.18 }, // IR (≈ red + green) → red, red → green, green → blue
    'False-colour infrared: foliage turns red and magenta while skies stay blue. A channel-mix approximation; no infrared is recorded.'],
  ['creative', 'infrared-bw', 'silver-mono', 'Infrared B&W', { monoMix: [0.45, 1.1, -0.55], tint: [1, 1, 1], contrast: 0.32, bloom: 0.22, grain: 0.18, toe: 0.04 },
    'Foliage glows white and blue skies go almost black, like infrared black-and-white film behind a deep red filter.'],
  ['creative', 'film-negative', 'neutral', 'Film Negative', { invert: true, tint: [1, 0.66, 0.42], contrast: -0.2, saturation: 0.85, shoulder: 0.05 },
    'The photo as an undeveloped-looking colour negative: tones and colours inverted over an orange mask.'],
  ['creative', 'inverted', 'neutral', 'Inverted', { invert: true }, 'Every tone and colour inverted, like a negative without its orange mask.'],
  ['creative', 'bw-negative', 'silver-mono', 'B&W Negative', { invert: true, tint: [1, 1, 1], grain: 0.12, vignette: 0 }, 'A black-and-white negative: light and dark swapped.'],
  ['creative', 'cross-processed', 'neutral', 'Cross-Processed', { matrix: [1.05, 0.05, -0.1, -0.05, 1.12, -0.07, -0.08, -0.12, 0.9], tint: [0.98, 1.04, 0.84], contrast: 0.42, saturation: 1.35, toe: 0.02, shoulder: 0.3 },
    'Slide film developed as a negative: yellow-green highlights, strong saturation and hard contrast.'],
  ['creative', 'redscale', 'neutral', 'Redscale', { tint: [1.22, 0.68, 0.26], saturation: 0.55, warmth: 0.5, contrast: 0.15, grain: 0.2 },
    'Film exposed through its base: deep red and orange with amber highlights.'],
  ['creative', 'cyanotype', 'silver-mono', 'Cyanotype', { tint: [0.42, 0.68, 1.12], contrast: 0.18, grain: 0.06, vignette: 0.2 }, 'A Prussian-blue print, like the 19th-century iron process.'],
  ['creative', 'channel-swap', 'neutral', 'Channel Swap', { matrix: [0, 0, 1, 1, 0, 0, 0, 1, 0], saturation: 1.1 }, 'Red, green and blue rotated for surreal colour: blue skies turn red and foliage turns blue.'],
  ['creative', 'bleach-bypass', 'neutral', 'Bleach Bypass', { saturation: 0.45, contrast: 0.45, toe: 0.03, shoulder: 0.2, grain: 0.12 },
    'Silver left in the image: muted colour, hard contrast and deep blacks.'],
];
const pathOf = Object.fromEntries(creativeKeys.map(([path, key]) => [key, path]));
const processGroups = { 'C-41': 'Calibrated · Colour negative (C-41)', 'ECN-2': 'Calibrated · Motion picture negative (ECN-2)', 'E-6': 'Calibrated · Slide / reversal (E-6)' };
const creativeGroups = { bw: 'Black & white looks · uncalibrated', instant: 'Instant film looks · uncalibrated', colour: 'Colour looks · uncalibrated', creative: 'Creative looks · uncalibrated' };
const byProcess = list => Object.keys(processGroups).flatMap(process => list.filter(stock => stock.process === process));
const stockPresetId = stockId => (creativeBase(stockId) ? `legacy:${creativeBase(stockId)}` : `stock:${stockId}`);
/** Every preset, in menu order: { id, group, label, stockId, outputId, settings (param paths), note }. */
export const presets = [
  ...byProcess(spectralStocks).map(stock => ({ id: `stock:${stock.id}`, group: processGroups[stock.process], label: stockDisplayName(stock), stockId: stock.id, outputId: null, settings: {}, note: null })),
  ...['pairing', 'derived', 'lookalike'].flatMap(tier => spectralPresets.filter(preset => preset.tier === tier).map(preset => ({
    id: preset.id, group: presetTiers[tier].short, label: preset.label, stockId: preset.stockId, outputId: preset.outputId, settings: { ...preset.settings }, note: preset.note }))),
  ...creativeLooks.map(([group, id, base, label, settings, note = null]) => ({
    id: `legacy:${id}`, group: creativeGroups[group], label, stockId: CREATIVE + base, outputId: null,
    settings: Object.fromEntries(Object.entries(settings).filter(([key]) => pathOf[key]).map(([key, value]) => [pathOf[key], value])),
    fixed: Object.fromEntries(Object.entries(settings).filter(([key]) => !pathOf[key])), note })),
];
const presetById = Object.fromEntries(presets.map(preset => [preset.id, preset]));

const select = (path, label, options, defaultValue, extra = {}) => ({ path, label, kind: 'select', options, default: defaultValue, ...extra });
const presetControl = select('presetId', 'Preset', presets.map(preset => preset.id), `stock:${DEFAULT_STOCK}`,
  { hint: 'A film stock with a print, scan or processing recipe. Sets the stock, output and settings below.' });
const stockControl = select('stockId', 'Film stock', [...byProcess(spectralStocks).map(stock => stock.id), ...Object.keys(creativeById).map(id => CREATIVE + id)], DEFAULT_STOCK,
  { hint: 'Datasheet-derived characteristic curves, sensitivity, dye density and MTF.' });
const outputControl = select('outputId', 'Output', spectralOutputs.map(output => output.id), defaultOutputFor(stockById[DEFAULT_STOCK]).id,
  { hint: 'Negative films can be scanned or printed; reversal film is viewed on a light table.' });

function controlFor(key) {
  const source = spectralControls[key];
  const control = {
    path: key, label: source.label, kind: source.type === 'choice' ? 'select' : 'float', default: source.default,
    ...(source.type === 'choice' ? { options: source.options.map(option => option.value), labels: Object.fromEntries(source.options.map(option => [option.value, option.label])) }
      : { min: source.min, max: source.max, step: source.step }),
    ...(source.unit ? { unit: source.unit } : {}),
    ...(source.min < 0 ? { signed: true } : {}),
    ...(spatial.has(key) ? { spatial: true } : {}),
  };
  return control;
}

const spectralSections = spectralControlGroups.map(group => ({
  id: sectionIds[group.label], step: group.label === 'Input' ? 'Stock' : group.label, title: group.label === 'Input' ? 'Stock & input' : group.label,
  openByDefault: group.open || group.label === 'Input',
  controls: [...(group.label === 'Input' ? [presetControl, stockControl, outputControl] : []), ...group.controls.map(item => item.key).filter(key => !OMIT.has(key)).map(controlFor)],
}));
const creativeSection = { id: 'creative', step: 'Look', title: 'Creative look', openByDefault: true, controls: creativeControls };
export const sections = [spectralSections[0], creativeSection, ...spectralSections.slice(1)];
/** Stock & input always; the Creative section for creative stocks, the spectral sections otherwise. */
export const sectionVisible = (id, params) => id === 'input' || (id === 'creative') === Boolean(creativeBase(params?.stockId));
export const controls = sections.flatMap(section => section.controls.map(control => ({ ...control, section: section.id })));
export const controlByPath = Object.fromEntries(controls.map(control => [control.path, control]));

export const optionLabel = (value, path) => path === 'presetId' ? presetById[value]?.label || value : path === 'stockId' ? (creativeBase(value) ? creativeById[creativeBase(value)].label : stockDisplayName(stockById[value]))
  : path === 'outputId' ? outputById[value]?.label || value : controlByPath[path]?.labels?.[value] || value;
export function optionGroup(value, path) {
  if (path === 'presetId') return presetById[value]?.group || '';
  if (path === 'stockId' && creativeBase(value)) return 'Creative · uncalibrated';
  if (path === 'stockId') return { 'C-41': 'Colour negative (C-41)', 'ECN-2': 'Motion picture negative (ECN-2)', 'E-6': 'Slide / reversal (E-6)' }[stockById[value]?.process] || '';
  if (path === 'outputId') return outputById[value]?.type === 'scan' ? 'Scan' : outputById[value]?.type === 'direct' ? 'Reversal' : 'Print';
  return '';
}

const clone = value => Array.isArray(value) ? [...value] : value;
export function defaultsFor(stockId = DEFAULT_STOCK) {
  const base = creativeBase(stockId);
  const stock = (!base && stockById[stockId]) || stockById[DEFAULT_STOCK];
  const native = defaultSpectralSettings(stock), look = creativeEngine.getPresetSettings(base || 'neutral');
  return Object.fromEntries(controls.map(control => [control.path, clone(control.path === 'presetId' ? stockPresetId(base ? CREATIVE + base : stock.id)
    : control.path === 'stockId' ? (base ? CREATIVE + base : stock.id)
    : control.path === 'outputId' ? defaultOutputFor(stock).id : control.path in creativeKey ? look[creativeKey[control.path]] : native[control.path])]));
}
/** The creative base's description, or null for a spectral stock. */
export const creativeNote = stockId => (creativeBase(stockId) ? `${creativeById[creativeBase(stockId)].description} Kamo’s RGB look model; not calibrated.` : null);
/** A preset's params: its stock's defaults, then the preset's output and settings. */
export function presetDefaults(presetId) {
  const preset = presetById[presetId] || presetById[`stock:${DEFAULT_STOCK}`];
  const params = { ...defaultsFor(preset.stockId), ...(preset.outputId ? { outputId: preset.outputId } : {}), ...preset.settings };
  return { ...params, presetId: preset.id };
}
/** The params' preset if it belongs to their stock, else the stock's own preset. */
export const presetFor = params => (presetById[params?.presetId]?.stockId === params?.stockId ? params.presetId : stockPresetId(params?.stockId));
export const presetNote = presetId => presetById[presetId]?.note || null;
export const defaultParams = () => defaultsFor();
/** Reset values follow the preset, as in the engine demo. */
export function defaultFor(params, path) { return presetDefaults(presetFor(params))[path]; }
export function sameValue(a, b, control) { return typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= (control?.step || 0) / 2 + 1e-9 : a === b; }
export const isChanged = (params, path) => !sameValue(params[path], defaultFor(params, path), controlByPath[path]);
export const sliderValue = (_control, value) => value;
const decimals = step => String(step).includes('.') ? String(step).split('.')[1].length : 0;
export function formatValue(control, value) {
  const text = Number(value).toFixed(decimals(control.step));
  const sign = control.signed && value > 0 ? '+' : '';
  return `${sign}${text}${control.unit ? ` ${control.unit}` : ''}`;
}

export const compatibleOutput = (stockId, outputId) => outputsForStock(stockById[stockId] || stockById[DEFAULT_STOCK]).some(output => output.id === outputId);
export const stockSummary = params => (!presetFor(params).startsWith('stock:') ? optionLabel(presetFor(params), 'presetId')
  : creativeBase(params.stockId) ? `${optionLabel(params.stockId, 'stockId')} (creative)` : `${optionLabel(params.stockId, 'stockId')} → ${optionLabel(params.outputId, 'outputId')}`);
const values = (params, keys) => keys.map(key => `${controlByPath[key].label} ${formatValue(controlByPath[key], params[key])}`).join(' · ');
export const sectionSummary = Object.fromEntries(sections.map(section => [section.id, params => section.id === 'input' ? stockSummary(params)
  : values(params, section.controls.filter(control => control.path && !['presetId', 'stockId', 'outputId'].includes(control.path)).slice(0, 2).map(control => control.path))]));

export function engineJob(params) {
  const base = creativeBase(params.stockId);
  if (base) return { creative: { preset: base, seed: 1729, ...presetById[presetFor(params)]?.fixed, ...Object.fromEntries(creativeKeys.map(([path, key]) => [key, params[path]])) } };
  const settings = Object.fromEntries(Object.keys(spectralControls).map(key => [key, key === 'outputSpace' ? 'srgb' : key === 'seed' ? 1729 : params[key]]));
  return { stockId: params.stockId, outputId: params.outputId, settings };
}

export { getSpectralOutput, getSpectralStock };