// Engine contract for negs (see js/engines/spektrafilm-rs/index.js for the shape).
// Loaded on demand by js/engines/registry.js. Fetches the engine's catalog (≈45 KB) first:
// it lists the stocks and holds every default, as in negs's own app.
import { buildSections, getPath, setPath, formatNumber, TITLES, COLOR_FILTER_EFFECTS } from './params.js';
import { engineInfo, fullRenderSize, render as renderJob, warm as warmJob, dispose, onDownload } from './engine.js';

const CATALOG = new URL('../../../engines/negs/runtime/catalog.json', import.meta.url);
const response = await fetch(CATALOG);
if (!response.ok) throw new Error(`Could not load the negs catalog (HTTP ${response.status})`);
const catalog = await response.json();

const stockById = Object.fromEntries(catalog.profiles.map(profile => [profile.id, profile]));
const cinemaPrints = new Set(['kodak_2383', 'kodak_2393']);
const DEFAULT_FILM = stockById.kodak_gold_200 ? 'kodak_gold_200' : catalog.profiles.find(p => !p.paper).id;

export const sections = buildSections(catalog);
export const controls = sections.flatMap(section => section.controls.filter(control => control.path).map(control => ({ ...control, section: section.id })));
export const controlByPath = Object.fromEntries(controls.map(control => [control.path, control]));

// Defaults from the catalog (stock choices: Kodak Gold 200 on its target print, as a start).
function catalogDefault(path) {
  if (path === 'film') return DEFAULT_FILM;
  if (path === 'paper') return stockById[DEFAULT_FILM].target_print || catalog.profiles.find(p => p.paper).id;
  const value = getPath(catalog.defaults, path);
  return typeof value === 'number' && !Number.isInteger(value) ? Number(value.toPrecision(7)) : value; // f32 → decimal
}
for (const control of controls) {
  control.default = catalogDefault(control.path);
  controlByPath[control.path].default = control.default;
}

const clone = value => (Array.isArray(value) ? [...value] : value);
export function defaultParams() { return Object.fromEntries(controls.map(control => [control.path, clone(control.default)])); }
export function sameValue(a, b, control) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= (control?.step ?? 0) / 2 + 1e-9;
  return a === b;
}
export function isChanged(params, path) { const control = controlByPath[path]; return !sameValue(params[path], control.default, control); }
export function normalizeParams(params) {
  const base = defaultParams();
  for (const control of controls) {
    const value = params?.[control.path];
    if (value === undefined || typeof value !== typeof base[control.path]) continue;
    if (control.kind === 'select' && !control.options.includes(value)) continue; // stock/option no longer offered
    if (control.kind === 'float' && (value < control.min || value > control.max)) continue;
    base[control.path] = value;
  }
  return base;
}

export const sliderValue = (control, value) => value;
export function formatValue(control, value) {
  const text = formatNumber(value, control.step);
  return control.signed && value > 0 ? `+${text}` : text;
}
export function optionLabel(value) { return stockById[value]?.name || TITLES[value] || String(value).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()); }
/** Stock groups as negs names them. */
export function optionGroup(value, path) {
  const stock = stockById[value];
  if (path === 'film' && stock) return stock.bw ? 'Black & White' : stock.positive ? 'Color Slide' : cinemaPrints.has(stock.target_print) ? 'Motion Picture' : 'Color Negative';
  if (path === 'paper' && stock) return stock.bw ? 'Black & White' : cinemaPrints.has(value) ? 'Motion Picture Print' : 'Color Paper';
  return '';
}

const scans = params => Boolean(params['io.scan_film']);
const onOff = (params, items) => items.filter(([path]) => params[path]).map(([, label]) => label).join(' · ') || 'All effects off';
export const stockSummary = params => `${optionLabel(params.film)} → ${scans(params) ? 'film scan' : optionLabel(params.paper)}`;
export const sectionSummary = {
  stock: stockSummary,
  prep: params => `Exposure ${formatValue(controlByPath['prep.exposure_ev'], params['prep.exposure_ev'])} EV · ${params['camera.auto_exposure'] ? 'Auto' : 'Manual'}`,
  camera: params => `${formatValue(controlByPath['camera.exposure_compensation_ev'], params['camera.exposure_compensation_ev'])} EV · ${formatNumber(params['camera.film_format_mm'], 0.1)} mm${params['camera.diffusion_filter.active'] ? ' · Diffusion' : ''}`,
  film: params => onOff(params, [['film_render.grain.active', 'Grain'], ['film_render.halation.active', 'Halation'], ['film_render.dir_couplers.active', 'Couplers'], ['film_render.density_curves_morph.active', 'Curves'], ['film_render.base.active', 'Base']]),
  print: params => scans(params) ? 'Skipped (scanning film)' : `Exposure ${formatNumber(params['enlarger.print_exposure'], 0.01)} · M ${formatNumber(params['enlarger.m_filter_shift'], 0.1)} · Y ${formatNumber(params['enlarger.y_filter_shift'], 0.1)}`,
  scan: params => `Gamut ${optionLabel(params['io.output_gamut_compress.algorithm'])} · ${optionLabel(params['settings.rgb_to_raw_method'])}`
};

/** The full engine job: catalog defaults with this edit's changes, film and paper. */
export function engineJob(params) {
  const runtime = structuredClone(catalog.defaults);
  for (const control of controls) {
    if (control.path === 'film' || control.path === 'paper') continue;
    if (isChanged(params, control.path)) setPath(runtime, control.path, params[control.path]);
  }
  return { film: params.film, paper: params.paper, paramsJson: JSON.stringify(runtime) };
}

export const render = (bitmap, params, options) => renderJob(bitmap, engineJob(params), options);
export const warm = params => warmJob(engineJob(params));
export { engineInfo, fullRenderSize, dispose, onDownload };

/** The full model runs in every preview: nothing is preview-only. */
export const hasSpatialEffects = () => false;
export const spatialNote = '';
export const showsPaper = params => !scans(params);
/** Border paper that matches the print paper (Frames › Paper print): 'bright' for B&W papers, else 'warm'. */
export const paperTint = params => (scans(params) ? null : stockById[params.paper]?.bw ? 'bright' : 'warm');
export const firstStep = 'stock';
export const shared = {
  film: 'film', paper: 'paper', scanFilm: 'io.scan_film',
  exposureEv: 'camera.exposure_compensation_ev',
  grain: 'film_render.grain.active', halation: 'film_render.halation.active'
};

export const ui = {
  // negs app.js: choosing a film scans slide film directly and moves the paper to its target print.
  beforeChange(params, path, value) {
    if (path !== 'film') return;
    const stock = stockById[value]; if (!stock) return;
    params['io.scan_film'] = Boolean(stock.positive);
    if (stock.target_print && stockById[stock.target_print]?.paper) params.paper = stock.target_print;
  },
  sync(params, find, root) {
    // Where this stock's profile comes from (CC BY-SA 4.0 attribution).
    const stock = stockById[params.film];
    root.querySelector(`#${find('film').id}-hint`).textContent = stock?.fotufilm
      ? 'Profile adapted by negs from the Fotufilm film profiles by MUAStudio Inc. (fotufilm.com), CC BY-SA 4.0.'
      : 'Profile from spektrafilm by Andrea Volpato, CC BY-SA 4.0.';
    const scanning = scans(params);
    find('paper').disabled = scanning;
    // Print controls do nothing while scanning: hide them behind the note, as negs does.
    const print = root.querySelector('[data-section="print"] .adv-body');
    print.querySelectorAll('.adv-control, .adv-group-heading').forEach(element => { if (!element.hasAttribute('data-depends')) element.hidden = scanning; else if (scanning) element.hidden = true; });
    print.querySelector('[data-note="print-skipped"]').hidden = !scanning;
    // Colour filters are for black-and-white film (shown on colour film only while one is on).
    const bw = Boolean(stockById[params.film]?.bw);
    const filter = find('camera.color_filter');
    filter.closest('.adv-control').hidden = !(bw || params['camera.color_filter'] !== 'none');
    const hint = root.querySelector(`#${filter.id}-hint`);
    const stops = stockById[params.film]?.color_filter_stops?.[params['camera.color_filter']];
    // negs's warning for a taking filter left on colour film.
    const tints = !bw && params['camera.color_filter'] !== 'none';
    hint.textContent = tints ? 'Taking filters are made for black-and-white film. On colour film this one tints the whole photograph.'
      : `${COLOR_FILTER_EFFECTS[params['camera.color_filter']] || ''}${stops ? ` Filter factor on this film: ${stops} stops.` : ''}`;
    hint.classList.toggle('adv-warning', tints);
  }
};
