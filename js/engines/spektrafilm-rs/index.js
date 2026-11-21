// Engine contract for spektrafilm-rs: everything the app needs from an Advanced engine.
// Loaded on demand by js/engines/registry.js; nothing here is fetched in Simple mode.
//
// Controls (params.js) follow spektrafilm's own RuntimeParams: same names, defaults and
// grouping as the upstream project (camera → film → enlarger/print → scanner).
import { sections, controls, controlByPath, defaultParams, isChanged, sameValue, sliderValue, formatValue, optionLabel,
  sectionSummary, stockSummary, hasSpatialEffects, isSlideFilm, targetPrint, scansFilm } from './params.js';
import { engineInfo, fullRenderSize, render, warm, dispose, onDownload } from './engine.js';

export { sections, controls, controlByPath, defaultParams, isChanged, sameValue, sliderValue, formatValue, optionLabel,
  sectionSummary, stockSummary, hasSpatialEffects, engineInfo, fullRenderSize, render, warm, dispose, onDownload };

/** Settings that carry over when switching to/from another engine (common key → this engine's path). */
export const shared = {
  film: 'film',
  paper: 'print',
  scanFilm: 'io.scan_film',
  exposureEv: 'camera.exposure_compensation_ev',
  grain: 'film_render.grain.active',
  halation: 'film_render.halation.active'
};

/** First section the pipeline shows as current. */
export const firstStep = sections[0].id;

/** Params from storage/undo/another version: unknown keys dropped, wrong types and retired stocks reset. */
export function normalizeParams(params) {
  const base = defaultParams();
  for (const key of Object.keys(base)) {
    if (!params || !(key in params) || typeof params[key] !== typeof base[key]) continue;
    const control = controlByPath[key];
    if (control.kind === 'select' && !control.options.includes(params[key])) continue; // stock no longer offered
    base[key] = Array.isArray(params[key]) ? [...params[key]] : params[key];
  }
  return base;
}

/** Whether the photo is shown on print paper (false: a scanned negative or slide). */
export const showsPaper = params => !scansFilm(params);
/** Border paper that matches the print paper (Frames › Paper print); every paper here is a colour paper. */
export const paperTint = params => (scansFilm(params) ? null : 'warm');

/** Text explaining what only the full render shows. */
export const spatialNote = 'The fast preview shows colour. Grain, halation and blur appear when you render full quality.';

export const ui = {
  /** Called before a control's new value is stored; may adjust related params. */
  beforeChange(params, path, value) {
    if (path !== 'film') return;
    // Picking a film moves the paper to that film's usual print, unless the user chose another paper.
    const previousTarget = targetPrint(params.film);
    const nextTarget = targetPrint(value);
    if (nextTarget && (!previousTarget || params.print === previousTarget)) params.print = nextTarget;
  },
  /** Engine-specific state of rendered controls. `find(path)` returns the control element for a param. */
  sync(params, find, root) {
    // Slide film has no negative to print: it is always scanned directly.
    const slide = isSlideFilm(params.film);
    const scanSwitch = find('io.scan_film');
    scanSwitch.setAttribute('aria-checked', scansFilm(params));
    scanSwitch.disabled = slide;
    find('print').disabled = scansFilm(params);
    const hint = root.querySelector(`#${find('film').id}-hint`);
    hint.textContent = slide ? 'Slide film is scanned directly, there is no print. Choose a negative film to print on paper.' : controlByPath.film.hint;
  }
};
