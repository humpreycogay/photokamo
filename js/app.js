import { presets, lookStyles, frames, borderSizes, paperColors, defaultBorder, platformSizes, adjustmentSections, defaultAdjustments } from './presets.js';
import { defaultOptics, normalizeOptics, isNeutral as opticsNeutral, renderOptics, sections as opticsSections, controls as opticsControls, profiles as lensProfiles, profileById as lensProfileById, expandProfile, matchesProfile,
  cameraOf, sceneOf, opticsRenderKey, formats as cameraFormats, formatById, fieldOfView, cameraControls } from './optics/index.js';
import { focusBlurRadius, WAVELENGTH_MM } from './optics/pipeline.js';
import { APERTURES } from './optics/formats.js';
import { FOCAL_LENGTHS } from './optics/formats.js';
import { renderImage, renderEdit, frameCanvas, FRAME_COLORS, applyAdjustments, drawTexts, textFonts, textFont, defaultCrop, isIdentityCrop, cropGeometry, cropExtents, drawOriented, cropSource } from './renderer.js';
// Film engines are NOT imported here: registry.js is a tiny list, and an engine's code,
// worker and data load only when it is chosen as the engine (activateEngine).
import { engines, legacyEngineId, engineById, loadEngine, loadCredits } from './engines/registry.js';
import { filmLooks } from './film-looks.js';
import { buildAdvanced, syncAdvanced, engineAboutHtml, creditHtml, activeHqEffects } from './advanced-ui.js';
import { createOptionPicker } from './option-picker.js';
import { createRenderQueue } from './render-queue.js';
import { createZip } from './zip.js';
import { createCollageMode, COLLAGE_MAX } from './collage/mode.js';
import { COLLAGE_PAPERS } from './collage/model.js';
import { createCollageExport } from './collage/export.js';
import { createCollageStore } from './collage/store.js';

const $ = selector => document.querySelector(selector);
const elements = {
  fileInput: $('#fileInput'), cameraInput: $('#cameraInput'), dropZone: $('#dropZone'), emptyState: $('#emptyState'),
  viewport: $('#viewport'), canvasWrap: $('#canvasWrap'), canvas: $('#previewCanvas'), processing: $('#processing'), originalBadge: $('#originalBadge'),
  viewPill: $('#viewPill'), holdButton: $('#holdButton'), fileChip: $('#fileChip'), fileMenu: $('#fileMenu'), fileName: $('#fileName'), fileSize: $('#fileSize'),
  lookGroup: $('#lookGroup'), lookName: $('#lookName'), lookMeta: $('#lookMeta'), lookDesc: $('#lookDesc'), favorite: $('#favoriteButton'),
  lookEdited: $('#lookEdited'), lookEditedText: $('#lookEditedText'), strengthRow: $('#strengthRow'),
  strength: $('#strengthSlider'), strengthOutput: $('#strengthOutput'), lookFilters: $('#lookFilters'), lookGrid: $('#lookGrid'),
  filmSettings: [...document.querySelectorAll('[data-film-settings]')], expertDone: $('#expertDone'),
  adjustmentControls: $('#adjustmentControls'), adjustBadge: $('#adjustBadge'), frameGrid: $('#frameGrid'),
  undo: $('#undoButton'), redo: $('#redoButton'), revert: $('#revertButton'), export: $('#exportButton'),
  exportDialog: $('#exportDialog'), exportForm: $('#exportForm'), quality: $('#exportQuality'), qualityOutput: $('#qualityOutput'), qualityGroup: $('#qualityGroup'),
  exportSummary: $('#exportSummary'), shareButton: $('#shareButton'), downloadButton: $('#confirmExport'), exportStatus: $('#exportStatus'),
  fullSizeDetail: $('#fullSizeDetail'), shareSizeDetail: $('#shareSizeDetail'), photoLookBadge: $('#photoLookBadge'),
  maName: $('#maName'), maValue: $('#maValue'), maReset: $('#maReset'), maSlider: $('#maSlider'), maZero: $('#maZero'), maGroups: $('#maGroups'), maTools: $('#maTools'),
  cameraDialog: $('#cameraDialog'), cameraPreview: $('#cameraPreview'), cameraStatus: $('#cameraStatus'),
  capturePhoto: $('#capturePhoto'), switchCamera: $('#switchCamera'), aboutDialog: $('#aboutDialog'), toast: $('#toast'),
  advancedPanel: $('#advancedPanel'), advPipeline: $('#advPipeline'), advSections: $('#advSections'),
  renderText: $('#renderText'), renderDetail: $('#renderDetail'), renderFull: $('#renderFullButton'), renderCancel: $('#renderCancelButton'), sheetRender: $('#sheetRenderButton'), sheetRenderLabel: $('#sheetRenderButton .sheet-render-label'), sheetRenderLive: $('#sheetRenderLive'), sheetGrabber: $('#sheetGrabber'), engineCaption: $('#engineButtonCaption'), sheetView: $('#sheetViewToggle'),
  stageHint: $('#advStageHint'), stageHintText: $('#advStageHintText'), advDial: $('#advDial'), dialChips: $('#dialChips'), dialLabel: $('#dialLabel'), dialValue: $('#dialValue'),
  dialReset: $('#dialReset'), dialResetText: $('#dialResetText'), dialRuler: $('#dialRuler'), dialScale: $('#dialScale'), dialDefault: $('#dialDefault'), dialInput: $('#dialInput'), dialEmpty: $('#dialEmpty'), dialBody: $('#dialBody'),
  renderProgress: $('#renderProgress'), renderProgressBar: $('#renderProgressBar'),
  engineStatus: $('#engineStatus'), engineStatusText: $('#engineStatusText'),
  engineRetry: $('#engineRetry'),
  engineAboutButton: $('#engineAboutButton'), engineAboutDialog: $('#engineAboutDialog'), engineAboutBody: $('#engineAboutBody'),
  advCredit: $('#advCredit'), advNote: $('#advNote'), presetsView: $('#presetsView'), borderPanel: $('#borderPanel'),
  filmstrip: $('#filmstrip'), stripList: $('#stripList'), stripCount: $('#stripCount'), stripStatus: $('#stripStatus'), stripHint: $('#stripHint'),
  applyBar: $('#applyBar'), applyButton: $('#applyButton'), applyDialog: $('#applyDialog'), applyForm: $('#applyForm'),
  engineLookName: $('#engineLookName'), mobileApplyButton: $('#mobileApplyButton'), topbarTitle: $('#topbarTitle'),
  exportLabel: $('#exportLabel'), batchDialog: $('#batchDialog'), batchForm: $('#batchForm'), batchZipName: $('#batchZipName'), batchQuality: $('#batchQuality'), batchQualityGroup: $('#batchQualityGroup'),
  batchProgress: $('#batchProgress'), batchProgressText: $('#batchProgressText'), batchProgressCount: $('#batchProgressCount'), batchBar: $('#batchBar'), batchStatus: $('#batchStatus'),
  batchCancel: $('#batchCancel'), batchShare: $('#batchShare'), batchDownload: $('#batchDownload'),
  textCanvas: $('#textCanvas'), textPanel: $('#textPanel'), textLayers: $('#textLayers'),
  cropPanel: $('#cropPanel'), cropStage: $('#cropStage'), cropView: $('#cropView'), cropCanvas: $('#cropCanvas'), cropBox: $('#cropBox'), cropHint: $('#cropHint'), ratioGrid: $('#ratioGrid'), cropOutput: $('#cropOutput'),
  engineWait: $('#engineWait'), engineWaitTitle: $('#engineWaitTitle'), engineWaitSub: $('#engineWaitSub'), engineWaitProgress: $('#engineWaitProgress'), engineWaitRetry: $('#engineWaitRetry')
};

// Look state: the effective value of each adjustment is
//   original + (look - original) * strength + edit
// so a look can be dialled back with Strength, and Adjust edits sit on top of it.
const state = {
  image: null, imageId: 0, filename: 'photo', presetId: 'original', strength: 100, edits: {}, frame: { id: 'none', border: { ...defaultBorder } }, crop: { ...defaultCrop }, text: [], optics: defaultOptics(),
  filter: 'All', zoom: 'fit', holding: false, split: null, mobileTool: 'exposure',
  exportFormat: 'image/jpeg', exportSize: 'full',
  // The engine: 'presets' (the looks above) or a film engine id, and each film engine's own settings ({ [engineId]: params }).
  engine: 'presets', engineParams: {}, myLookId: null, imageBitmap: null,
  advOpen: new Set(), advStep: null,
  renderQuality: 'preview', renderAbort: null,
  undo: [], redo: [], editedCanvas: null, originalCanvas: null, originalKey: '', renderToken: 0
};
let toastTimer;
// Collage mode (js/collage/mode.js): slots show each photo's own edit without frame or text. A fast pass from the
// queue thumb, then a sharp one from the full-size photo (film engines need full-size input, CollagePlan V1).
const collageEngines = new Set();
let activeCollageId = null;
const collageStore = createCollageStore({ photoExists: id => Boolean(photoById(id)) });
const collage = createCollageMode({
  photos: () => app.photos, photoById: id => photoById(id), settingsOf: photo => settingsOf(photo), paperColors,
  addFiles: files => addFiles(files, { view: false }),
  editPhoto: id => editFromCollage(id),
  renderSlot: (photo, { pass, edge, job }) => renderPhotoEdit(photo, { edge: pass === 'fast' ? QUEUE_EDGE : edge, quality: 'preview', from: pass === 'fast' ? 'thumb' : 'full', job, onEngine: module => collageEngines.add(module) }),
  textFonts, textFont,
  onHistory: () => updateButtons(),
  onDocument: doc => { if (activeCollageId) { collageStore.save(doc, { id: activeCollageId }); syncSavedCollages(); } }
});
const collageExport = createCollageExport({
  doc: () => collage.snapshot(), update: mutator => collage.update(mutator), paperColors, photoById: id => photoById(id), get canShareFiles() { return canShareFiles; }, isPhone: () => mobileQuery.matches, toast: text => toast(text),
  photoSize: photo => { const { crop } = settingsOf(photo); if (isIdentityCrop(crop)) return { width: photo.width, height: photo.height }; const g = cropGeometry(photo.width, photo.height, crop); return { width: Math.round(g.width), height: Math.round(g.height) }; },
  renderEdit: (photo, { edge, onProgress }) => renderPhotoEdit(photo, { edge, quality: 'full', onEngine: module => collageEngines.add(module), onProgress }),
  ensureTextFonts: texts => ensureTextFonts(texts), textFont,
  settingsKey: id => { const photo = photoById(id); return photo ? JSON.stringify(settingsOf(photo)) : null; },
  download: file => downloadBlob(file, file.name)
});
const openExport = () => (collage.active ? collageExport.open() : openSave());
let sliderStart = null;
let cameraStream = null;
let cameraFacingMode = 'environment';
let cameraRequestId = 0;
const presetPreviewSource = 'images/model.jpg';
const PREVIEW_EDGE = 1000;
const ZOOM_MAX_EDGE = 4096;
const FAVORITES_KEY = 'photokamo:favorites';
const MY_LOOKS_KEY = 'photokamo:my-looks';
const ADVANCED_DEBOUNCE = 150;
const SHARE_WIDTH = 1080;
/** Width of the "For sharing" export: the chosen platform's size, else 1080 px. */
const shareWidth = () => (PLATFORMS[state.crop.platform]?.w || SHARE_WIDTH);
const mobileQuery = matchMedia('(max-width: 900px)');
/** Phones (upright ≤600px, or sideways): film engine controls in the compact sheet (docs/handover-mobile-film-panel). */
const sheetQuery = matchMedia('(max-width: 600px), (max-width: 900px) and (orientation: landscape) and (max-height: 500px)');
/** Film sheet view: 'list' (rows) or 'dial' (focus view); UI state, remembered on this device. */
const VIEW_KEY = 'photokamo:film-view';
const dial = { view: (() => { try { return localStorage.getItem(VIEW_KEY) === 'dial' ? 'dial' : 'list'; } catch { return 'list'; } })(), paths: {}, px: 1, chipsKey: '', drag: null, frame: 0 };

const controlSpec = Object.fromEntries(adjustmentSections.flatMap(section => section.controls).map(([id, label, min, max, step, suffix]) => [id, { id, label, min, max, step, suffix }]));

const PRESETS = 'presets';
const isFilm = () => state.engine !== PRESETS;
const currentPreset = () => presets.find(item => item.id === state.presetId) || presets[0];
// "Advanced only": the grid shows only looks the gear works with (film looks, My looks). A device preference.
const filmLookById = id => filmLooks.find(look => look.id === id) || null;

// ---------- Values ----------
// On a film engine the look is the engine's output, so Adjust edits sit on the defaults.
function baseValue(key) {
  const original = defaultAdjustments[key];
  if (isFilm()) return original;
  return original + (currentPreset().values[key] - original) * state.strength / 100;
}
function roundToStep(key, value) { const step = controlSpec[key].step; return Math.round(value / step) * step; }
function clampToRange(key, value) { const { min, max } = controlSpec[key]; return Math.min(max, Math.max(min, value)); }
function effectiveValue(key) { return clampToRange(key, baseValue(key) + (state.edits[key] || 0)); }
function effectiveAdjustments() { return Object.fromEntries(Object.keys(defaultAdjustments).map(key => [key, effectiveValue(key)])); }
const editCount = () => Object.keys(state.edits).length;

// ---------- History ----------
const cloneParams = params => Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
const cloneEngineParams = all => Object.fromEntries(Object.entries(all).map(([id, params]) => [id, cloneParams(params)]));
// Frames: { id, border } (border = Paper print settings). Older snapshots stored the frame id only.
const cloneFrame = frame => (typeof frame === 'string' ? { id: frame, border: { ...defaultBorder }, color: null } : { id: frame.id, border: { ...defaultBorder, ...frame.border }, color: frame.color ?? null });
// A snapshot has the shape of a photo's settings (SPEC §2): { look, edits, frame }.
function snapshot() { return { look: { engine: state.engine, presetId: state.presetId, strength: state.strength, engineParams: cloneEngineParams(state.engineParams), myLookId: state.myLookId }, edits: { ...state.edits }, crop: { ...state.crop }, optics: { ...state.optics }, frame: cloneFrame(state.frame), text: cloneTexts(state.text) }; }
// Older snapshots were flat, with mode 'simple' | 'advanced' next to the engine.
function migrateSnapshot(value) {
  if (value.look) return value;
  const { presetId = 'original', strength = 100, engineParams = {}, myLookId = null, edits = {}, frame = 'none' } = value;
  const engineId = value.mode === 'advanced' && engineById(value.engine) ? value.engine : PRESETS;
  return { look: { engine: engineId, presetId, strength, engineParams, myLookId }, edits, frame };
}
/** Puts settings ({ look, edits, crop, frame }) into the editor state without syncing the UI. */
function applySettings(value) {
  const { look, edits, frame, crop, text, optics } = migrateSnapshot(value);
  state.engine = look.engine; state.presetId = look.presetId; state.strength = look.strength;
  state.engineParams = cloneEngineParams(look.engineParams); state.myLookId = look.myLookId;
  state.edits = { ...edits }; state.frame = cloneFrame(frame); state.crop = { ...defaultCrop, ...crop };
  state.text = cloneTexts(text); state.optics = normalizeOptics(optics);
}
function restore(value) {
  applySettings(value);
  syncControls(); scheduleRender(); // syncControls loads the engine if the restored one isn't active
}
function sameSnapshot(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function commit(previous = snapshot()) {
  if (sameSnapshot(previous, snapshot())) return;
  state.undo.push(previous); if (state.undo.length > 50) state.undo.shift(); state.redo = []; updateButtons();
  if (app.liveEdit) applyToPhotos(otherSelected(), applyParts); // live: the same change goes to the other selected photos
}
function undo() { if (collage.active) { collage.undo(); return; } if (!state.undo.length) return; state.redo.push(snapshot()); restore(state.undo.pop()); updateButtons(); }
function redo() { if (collage.active) { collage.redo(); return; } if (!state.redo.length) return; state.undo.push(snapshot()); restore(state.redo.pop()); updateButtons(); }
function updateButtons() {
  elements.undo.disabled = collage.active ? !collage.canUndo : !state.undo.length;
  elements.redo.disabled = collage.active ? !collage.canRedo : !state.redo.length;
  syncStrip();
}
function toast(message) { clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.classList.add('show'); toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2600); }
function change(mutator) { const previous = snapshot(); mutator(); commit(previous); syncControls(); scheduleRender(); }
function pickLook(id) {
  filmLookTap++; // a film look still loading its engine must not apply after this
  change(() => { state.presetId = id; state.edits = {}; state.engine = PRESETS; state.myLookId = null; });
}

// ---------- Favorites ----------
function loadFavorites() { try { const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); return Array.isArray(value) ? value.filter(id => presets.some(p => p.id === id) || filmLookById(id)) : []; } catch { return []; } }
let favorites = loadFavorites();
function saveFavorites() { try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch { /* storage unavailable: favorites last for this visit only */ } }
/** The look the heart applies to: the Basic look, or the built-in film look in use (null for other film edits). */
function favoriteTarget() {
  if (!isFilm()) return currentPreset();
  return filmLookById(state.myLookId);
}
function toggleFavorite() {
  const look = favoriteTarget(); if (!look) return;
  const id = look.id;
  favorites = favorites.includes(id) ? favorites.filter(item => item !== id) : [...favorites, id];
  saveFavorites();
  if (state.filter === 'Favorites' && !favorites.length) state.filter = 'All';
  toast(favorites.includes(id) ? `${look.name} added to favorites.` : `${look.name} removed from favorites.`);
  syncLooks();
}

// ---------- My looks (saved Advanced settings, per engine) ----------
// A look is { id, name, engine, params, thumb }. Missing or retired engines migrate to Kamo;
// params are normalized by Kamo when the saved look is picked.
const lookEngine = look => (engineById(look.engine) ? look.engine : legacyEngineId);
// Small square JPEG of the current preview, stored with a saved look as its thumbnail.
function previewThumbnail() {
  if (!state.editedCanvas) return null;
  try {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 160;
    drawCover(canvas.getContext('2d'), state.editedCanvas, 160, 160, .3);
    return canvas.toDataURL('image/jpeg', .8);
  } catch { return null; }
}
function loadMyLooks() {
  try {
    const value = JSON.parse(localStorage.getItem(MY_LOOKS_KEY) || '[]');
    return Array.isArray(value) ? value.filter(look => look && typeof look.id === 'string' && typeof look.name === 'string' && look.params && typeof look.params === 'object').map(look => ({ ...look, engine: lookEngine(look) })) : [];
  } catch { return []; }
}
let myLooks = loadMyLooks();
function saveMyLooks() { try { localStorage.setItem(MY_LOOKS_KEY, JSON.stringify(myLooks)); return true; } catch { return false; } }

// ---------- Built-in film looks (js/film-looks.js; SPEC §2–§4) ----------
// A built-in look is stored like a My look: state.myLookId = 'film:<slug>', and the photo holds
// the expanded engine params. "Edited" is worked out by comparing with the expanded look.
/** The look's registered engine on this device. Null means the tile is hidden. */
const pickEngineFor = look => look.engine.find(id => engineById(id)) || null;
/** The film looks this device can show as tiles (decided by device only, never by what is downloaded). */
const filmTileLooks = filmLooks.filter(pickEngineFor);
/** Engine params for a look: the engine's defaults, then each value in order through the engine's own rules. */
function expandLook(module, values) {
  const params = module.defaultParams();
  for (const [path, value] of Object.entries(values || {})) {
    module.ui?.beforeChange?.(params, path, value);
    params[path] = Array.isArray(value) ? [...value] : value;
  }
  return module.normalizeParams(params);
}
const sameParam = (module, path, a, b) => (Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b)
  : module.sameValue ? module.sameValue(a, b, module.controlByPath[path]) : a === b);
/** Param paths where `params` differs from `base`. */
const changedPaths = (module, base, params) => Object.keys(base).filter(path => !sameParam(module, path, base[path], params[path]));
/** The look the photo uses (a My look or a built-in film look): { id, name, builtIn, look, params, changed, edited }, or null. */
function currentMyLook() {
  const id = state.myLookId; if (!id) return null;
  const builtIn = filmLookById(id);
  const look = builtIn || myLooks.find(item => item.id === id); if (!look) return null;
  const module = activeModule(); const params = advParams();
  let base = null;
  if (module && builtIn && builtIn.values[state.engine]) base = expandLook(module, builtIn.values[state.engine]);
  if (module && !builtIn && look.engine === state.engine) base = module.normalizeParams(look.params);
  const changed = base ? changedPaths(module, base, params).length : 0;
  return { id, name: look.name, builtIn: Boolean(builtIn), look, params: base, changed, edited: changed > 0 };
}
let filmLookTap = 0; // only the latest tap applies when engines load out of order
/** One tap: load the look's engine, expand the look, and make one change (engine, its params, the look id). */
async function pickFilmLook(id) {
  const look = filmLookById(id); const engineId = look && pickEngineFor(look);
  if (!engineId) return;
  const tap = ++filmLookTap;
  let module;
  try { module = await loadEngine(engineId); }
  catch (error) { console.error(error); toast(`The ${engineById(engineId).label} engine could not be loaded. Check your connection and try again.`); return; }
  if (tap !== filmLookTap) return;
  change(() => { state.engine = engineId; state.engineParams[engineId] = expandLook(module, look.values[engineId]); state.myLookId = id; });
}
/** Back to look: the expanded look again, as one undo step. */
function backToLook() {
  const look = filmLookById(state.myLookId); const module = activeModule();
  if (!look || !module || !look.values[state.engine]) return;
  change(() => { state.engineParams[state.engine] = expandLook(module, look.values[state.engine]); });
}
/** Dev check (console): every look on every engine survives normalizeParams unchanged, with no value dropped. */
async function checkFilmLooks() {
  const rows = [];
  for (const look of filmLooks) for (const engineId of look.engine) {
    let module;
    try { module = await loadEngine(engineId); }
    catch (error) { rows.push({ look: look.id, engine: engineId, ok: false, problem: `engine did not load: ${error.message}` }); continue; }
    const expanded = expandLook(module, look.values[engineId]);
    const again = module.normalizeParams(expanded);
    const drift = changedPaths(module, expanded, again).concat(Object.keys(again).filter(path => !(path in expanded)));
    const dropped = Object.entries(look.values[engineId]).filter(([path, value]) => !sameParam(module, path, value, expanded[path])).map(([path]) => path);
    const problem = [drift.length ? `normalize changes ${drift.join(', ')}` : '', dropped.length ? `dropped ${dropped.join(', ')}` : ''].filter(Boolean).join('; ');
    rows.push({ look: look.id, engine: engineId, ok: !problem, problem, stock: module.stockSummary(expanded) });
  }
  console.table(rows);
  const failed = rows.filter(row => !row.ok).length;
  console.log(`checkFilmLooks: ${rows.length} look × engine pairs, ${failed} failed.`);
  return failed;
}
// Console helpers for testing (docs/handover/TASKS.md, Task 1 and Task 4).
Object.assign(window, { pickFilmLook, checkFilmLooks });

function buildMyLookTiles() {
  elements.lookGrid.querySelectorAll('[data-mine-wrap]').forEach(wrap => wrap.remove());
  for (const look of myLooks) {
    const wrap = document.createElement('div');
    wrap.className = 'look-tile-wrap'; wrap.dataset.mineWrap = look.id;
    const remove = document.createElement('button');
    remove.className = 'look-delete'; remove.type = 'button'; remove.dataset.deleteLook = look.id;
    remove.setAttribute('aria-label', `Delete my look “${look.name}”`); remove.title = 'Delete this look';
    remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    const tile = document.createElement('button');
    tile.className = 'look-tile'; tile.type = 'button'; tile.dataset.mine = look.id; tile.setAttribute('aria-pressed', 'false');
    tile.innerHTML = '<span class="look-thumb" aria-hidden="true"><img alt=""></span><span class="look-tile-name"></span>';
    tile.querySelector('.look-tile-name').textContent = look.name;
    if (typeof look.thumb === 'string' && look.thumb.startsWith('data:image/jpeg')) {
      tile.querySelector('img').src = look.thumb;
      tile.querySelector('.look-thumb').classList.add('has-preview');
    }
    wrap.append(tile, remove);
    elements.lookGrid.prepend(wrap);
  }
}
/** Removes a saved look from this device. Photos already using it keep their settings. */
function deleteMyLook(id) {
  const look = myLooks.find(item => item.id === id); if (!look) return;
  if (!confirm(`Delete “${look.name}”? Photos that use it keep their settings.`)) return;
  myLooks = myLooks.filter(item => item.id !== id);
  saveMyLooks(); buildMyLookTiles();
  if (state.myLookId === id) change(() => { state.myLookId = null; });
  syncLooks(); syncDeleteMyLook();
  toast(`Deleted “${look.name}”.`);
}
function syncDeleteMyLook() { const look = currentMyLook(); $('#deleteMyLook').hidden = !(isFilm() && look && !look.builtIn); }
async function pickMyLook(id) {
  const look = myLooks.find(item => item.id === id); if (!look) return;
  const tap = ++filmLookTap;
  let module;
  try { module = await loadEngine(look.engine); }
  catch (error) { console.error(error); toast(`The ${engineById(look.engine).label} engine could not be loaded. Check your connection and try again.`); return; }
  if (tap !== filmLookTap) return;
  change(() => { state.engine = look.engine; state.engineParams[look.engine] = module.normalizeParams(look.params); state.myLookId = id; });
}
function saveAsMyLook() {
  const params = advParams(); if (!params) return;
  const suggested = `My look ${myLooks.length + 1}`;
  const current = currentMyLook();
  const name = prompt('Name this look', current ? (current.builtIn ? `${current.name} (mine)` : current.name) : suggested);
  if (name === null) return;
  const look = { id: `mine-${Date.now().toString(36)}`, name: name.trim().slice(0, 40) || suggested, engine: state.engine, params: cloneParams(params), thumb: previewThumbnail() };
  myLooks = [...myLooks, look];
  const stored = saveMyLooks();
  buildMyLookTiles();
  change(() => { state.myLookId = look.id; });
  // Back to the grid, on Mine, with the new tile in view.
  state.filter = 'Mine'; setFilmExpert(false); syncLooks();
  elements.lookGrid.querySelector(`[data-mine="${look.id}"]`)?.scrollIntoView({ block: 'nearest' });
  toast(stored ? `Saved “${look.name}” to Mine.` : `Saved “${look.name}” for this visit only (browser storage is unavailable).`);
}

// ---------- Looks panel ----------
const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function buildLooks() {
  const presetTile = preset => `<button class="look-tile" type="button" data-preset="${preset.id}" aria-pressed="false"><span class="look-thumb" aria-hidden="true"><canvas width="200" height="200"></canvas></span><span class="look-tile-name">${preset.name}</span></button>`;
  // Film and Basic tiles use the same bundled sample photo; Film canvases are rendered by Kamo below.
  const filmTile = look => `<button class="look-tile" type="button" data-film="${look.id}" aria-pressed="false"><span class="look-thumb" aria-hidden="true"><canvas width="200" height="200"></canvas><span class="look-badge" hidden></span></span><span class="look-tile-name">${escapeHtml(look.name)}</span></button>`;
  // Order in All: the Basic presets (their own group), then the film looks by style (lookStyles).
  elements.lookGrid.innerHTML = [...presets.map(presetTile), ...lookStyles.flatMap(([style]) => filmTileLooks.filter(look => look.style === style).map(filmTile))].join('');
  elements.lookGrid.addEventListener('click', event => {
    const remove = event.target.closest('[data-delete-look]');
    if (remove) { deleteMyLook(remove.dataset.deleteLook); return; }
    const tile = event.target.closest('[data-preset],[data-mine],[data-film]'); if (!tile) return;
    if (tile.dataset.mine) pickMyLook(tile.dataset.mine); else if (tile.dataset.film) pickFilmLook(tile.dataset.film); else pickLook(tile.dataset.preset);
  });
  buildMyLookTiles();
  // Heart: shows only the favorites (tap again for All); with none yet, it says how to add one.
  $('#favoritesFilter').addEventListener('click', () => {
    if (!favorites.length) { toast('No favorites yet. Use the heart next to Strength to save a look.'); return; }
    state.filter = state.filter === 'Favorites' ? 'All' : 'Favorites'; syncLooks();
  });
  elements.lookFilters.addEventListener('click', event => {
    const chip = event.target.closest('[data-filter]'); if (!chip) return;
    state.filter = chip.dataset.filter; syncLooks();
  });
  renderPresetPreviews();
}
const BASIC_FILTER = 'basic';
function filterMatches(preset) {
  if (state.filter === 'All') return true;
  if (state.filter === 'Favorites') return favorites.includes(preset.id);
  return state.filter === BASIC_FILTER; // Basic presets live only in the Basic group; Film, B&W and Creative are film looks
}
function filmFilterMatches(look) {
  if (state.filter === 'All') return true;
  if (state.filter === 'Favorites') return favorites.includes(look.id);
  return look.style === state.filter;
}
/** Chip buttons (`attr` = data attribute); rebuilt only when the set changes, so keyboard focus stays on the chip. */
function syncChips(container, attr, items, pressed) {
  const key = items.map(([id]) => id).join('|');
  if (container.dataset.key !== key) {
    container.dataset.key = key;
    container.innerHTML = items.map(([id, label]) => `<button class="chip" type="button" ${attr}="${id}" aria-pressed="false">${escapeHtml(label)}</button>`).join('');
  }
  container.querySelectorAll('.chip').forEach((chip, index) => chip.setAttribute('aria-pressed', items[index][0] === pressed));
}

// ---------- Download badges on film tiles (SPEC §8) ----------
// Size: the engine's manifest total (engines/<id>/manifest.json); no badge under 1 MB or once saved on this device.
const engineBytes = {};
let savedEngineIds = new Set();
let manifestsRead = null;
const downloadBadge = id => (engineBytes[id] >= 1e6 && !savedEngineIds.has(id) ? `${Math.ceil(engineBytes[id] / 1e6)} MB` : '');
/** Ready without a download: saved on this device, or an engine with no runtime files (manifest: false). */
const engineReady = id => savedEngineIds.has(id) || engineById(id)?.manifest === false;
async function syncDownloadBadges() {
  manifestsRead ||= Promise.all(engines.filter(entry => entry.manifest !== false).map(entry => fetch(new URL('manifest.json', entry.folder))
    .then(response => (response.ok ? response.json() : null))
    .then(manifest => { if (manifest?.files) engineBytes[entry.id] = Object.values(manifest.files).reduce((sum, file) => sum + (file.size || 0), 0); })
    .catch(() => {})));
  await manifestsRead;
  savedEngineIds = await savedEngineIdList();
  syncLooks();
}
/** Engines with files saved on this device. Like savedEngineList(), but reads only cache names, so
 *  startup imports no engine code (js/engines/engine-files.js names caches `photokamo-engine:<id>:<version>`). */
async function savedEngineIdList() {
  const ids = new Set();
  try {
    for (const key of await caches.keys()) {
      if (key.startsWith('photokamo-engine:') && (await (await caches.open(key)).keys()).length) ids.add(key.split(':')[1]);
    }
  } catch { /* no Cache Storage: nothing is saved */ }
  return ids;
}
/** "Name · edited", with "· edited" in the accent colour. */
function setLookName(name, edited) {
  const mark = document.createElement('span'); mark.className = 'look-edited-mark'; mark.textContent = ' · edited';
  elements.lookName.replaceChildren(name, ...(edited ? [mark] : []));
}
function syncLooks() {
  const preset = currentPreset();
  const filters = [['All', 'All'], [BASIC_FILTER, 'Basic'], ...lookStyles.filter(([style]) => filmTileLooks.some(look => look.style === style)),
    ...(myLooks.length ? [['Mine', 'Mine']] : [])];
  const advanced = isFilm();
  if (state.filter === 'Favorites' ? !favorites.length : !filters.some(([id]) => id === state.filter)) state.filter = 'All';
  syncChips(elements.lookFilters, 'data-filter', filters, state.filter);
  const heart = $('#favoritesFilter');
  heart.setAttribute('aria-pressed', state.filter === 'Favorites');
  heart.setAttribute('aria-disabled', !favorites.length);
  heart.title = favorites.length ? `Favorites (${favorites.length})` : 'Favorites (none yet)';
  elements.lookGrid.querySelectorAll('[data-film]').forEach(tile => {
    const look = filmLookById(tile.dataset.film);
    tile.hidden = !filmFilterMatches(look);
    tile.setAttribute('aria-pressed', advanced && look.id === state.myLookId);
    const badge = downloadBadge(pickEngineFor(look));
    const label = tile.querySelector('.look-badge');
    label.hidden = !badge; label.textContent = badge ? `↓ ${badge}` : '';
    tile.setAttribute('aria-label', `${look.name}, film look${badge ? `, downloads about ${badge}` : ''}`);
  });
  const favorite = favoriteTarget();
  elements.favorite.hidden = !favorite;
  if (favorite) {
    const isFavorite = favorites.includes(favorite.id);
    elements.favorite.setAttribute('aria-pressed', isFavorite);
    elements.favorite.setAttribute('aria-label', isFavorite ? `Remove ${favorite.name} from favorites` : `Save ${favorite.name} to favorites`);
  }
  elements.lookGrid.querySelectorAll('[data-preset]').forEach(tile => {
    const item = presets.find(p => p.id === tile.dataset.preset);
    tile.hidden = !filterMatches(item);
    tile.setAttribute('aria-pressed', !advanced && item.id === state.presetId);
  });
  elements.lookGrid.querySelectorAll('[data-mine]').forEach(tile => {
    tile.parentElement.hidden = !['All', 'Mine'].includes(state.filter);
    tile.setAttribute('aria-pressed', advanced && tile.dataset.mine === state.myLookId);
  });
  elements.lookMeta.hidden = !advanced;
  if (advanced) {
    const current = currentMyLook();
    const module = activeModule(); const params = advParams();
    const entry = engineById(state.engine);
    const name = current ? current.name : 'Film edit';
    const edited = Boolean(current?.edited);
    elements.lookGroup.textContent = current ? (current.builtIn ? 'Film look' : 'My look') : entry.label;
    setLookName(name, edited);
    elements.photoLookBadge.textContent = elements.engineLookName.textContent = edited ? `${name} · edited` : name;
    elements.engineCaption.textContent = current ? elements.engineLookName.textContent : 'Film engine'; // phone sheet: over the engine name
    // Stock and output names stay visible to experts.
    elements.lookMeta.textContent = module ? `${module.stockSummary(params)} · ${entry.label}` : `Loading ${entry.label}…`;
    elements.lookDesc.textContent = current?.builtIn ? current.look.description : '';
    elements.lookDesc.hidden = !current?.builtIn;
    const showBack = Boolean(current?.builtIn && edited);
    elements.lookEdited.hidden = !showBack;
    if (showBack) elements.lookEditedText.textContent = `You changed ${plural(current.changed, 'setting')}.`;
    // Film settings: the same, as one line at the bottom of the panel.
    $('#advLookName').replaceChildren(name, ...(edited ? [Object.assign(document.createElement('span'), { className: 'look-edited-mark', textContent: ' · edited' })] : []));
    $('#advLookMeta').textContent = `· ${elements.lookMeta.textContent}`;
    $('#advBackToLook').hidden = !showBack;
    // Film looks have no Strength (SPEC §4.2): the row stays in place, inactive, so picking a film tile moves nothing.
    elements.strength.value = 100; elements.strength.disabled = true; elements.strengthOutput.value = '100%';
    return;
  }
  elements.lookEdited.hidden = true; elements.lookDesc.hidden = false;
  elements.lookGroup.textContent = 'Basic';
  elements.lookName.textContent = editCount() ? `${preset.name} · edited` : preset.name;
  elements.photoLookBadge.textContent = elements.engineLookName.textContent = elements.lookName.textContent;
  elements.lookDesc.innerHTML = preset.description + (preset.engine === 'Spektrafilm-inspired' ? ' <a href="https://github.com/andreavolpato/spektrafilm" target="_blank" rel="noopener noreferrer">Credits<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 5h5v5"/><path d="M19 5l-9 9"/><path d="M18 14v5H5V6h5"/></svg><span class="visually-hidden"> (opens in a new tab)</span></a>' : '');
  elements.strength.value = state.strength;
  elements.strength.disabled = preset.id === 'original';
  elements.strengthOutput.value = `${state.strength}%`;
}

function drawCover(ctx, source, width, height, focusY = .5) {
  const scale = Math.max(width / source.width, height / source.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (source.width - sourceWidth) / 2;
  const sourceY = (source.height - sourceHeight) * focusY;
  ctx.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

// The bundled sample photo, loaded once and shared by the start screen and the look thumbnails.
let sampleImagePromise;
function loadSampleImage() {
  sampleImagePromise ||= new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error(`Sample image could not be loaded from ${presetPreviewSource}.`)), { once: true });
    image.src = presetPreviewSource;
  });
  return sampleImagePromise;
}

// Home screen before/after: the sample unedited on the left, rendered with a look on the right.
// Each look is rendered once, on first use, and cached; names come from `presets`.
const startUi = { looks: ['golden-hour', 'silver-mono', 'cinema-teal'].map(id => presets.find(preset => preset.id === id)).filter(Boolean),
  look: 'silver-mono', image: null, renders: new Map(), drag: null, photo: $('#startComparePhoto'), divider: $('#startDivider'), after: $('#startAfter') };
function setStartSplit(percent) {
  percent = Math.round(Math.min(100, Math.max(0, percent)));
  $('#startPrint').style.setProperty('--split', `${percent}%`);
  startUi.divider.setAttribute('aria-valuenow', percent); startUi.divider.setAttribute('aria-valuetext', `${percent}% original`);
}
function showStartLook(id) {
  const preset = presets.find(item => item.id === id); if (!preset) return;
  startUi.look = id;
  $('#startLooks').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', button.dataset.look === id));
  if (!startUi.image) return;
  try {
    if (!startUi.renders.has(id)) startUi.renders.set(id, renderImage(startUi.image, preset.values, 'none', 900));
    const render = startUi.renders.get(id), canvas = startUi.after;
    canvas.width = render.width; canvas.height = render.height; canvas.getContext('2d').drawImage(render, 0, 0);
    canvas.classList.add('is-ready');
  } catch (error) {
    console.warn(`Could not render the ${preset.name} start preview.`, error);
  }
}
function initStartCompare() {
  const print = $('#startPrint'), now = new Date(), two = n => String(n).padStart(2, '0');
  print.style.setProperty('--print-paper', paperColors.find(color => color.id === 'warm').hex);
  print.style.setProperty('--print-title-font', textFonts.find(([id]) => id === 'playfair')[2]);
  print.style.setProperty('--print-date-font', textFonts.find(([id]) => id === 'typewriter')[2]);
  $('#startDate').textContent = `'${two(now.getFullYear() % 100)} ${two(now.getMonth() + 1)} ${two(now.getDate())}`;
  $('#startLooks').append(...startUi.looks.map(preset => {
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'start-look', textContent: preset.name });
    button.dataset.look = preset.id; return button;
  }));
  $('#startLooks').querySelectorAll('button').forEach(button => button.addEventListener('click', () => showStartLook(button.dataset.look)));
  showStartLook(startUi.look);
  const splitAt = event => { const rect = startUi.photo.getBoundingClientRect(); return (event.clientX - rect.left) / Math.max(1, rect.width) * 100; };
  startUi.photo.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    startUi.drag = event.pointerId; startUi.photo.setPointerCapture(event.pointerId); setStartSplit(splitAt(event));
  });
  startUi.photo.addEventListener('pointermove', event => { if (startUi.drag === event.pointerId) setStartSplit(splitAt(event)); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => startUi.photo.addEventListener(type, event => { if (startUi.drag === event.pointerId) startUi.drag = null; }));
  startUi.divider.addEventListener('keydown', event => {
    const value = Number(startUi.divider.getAttribute('aria-valuenow'));
    const next = { ArrowLeft: value - 5, ArrowDown: value - 5, ArrowRight: value + 5, ArrowUp: value + 5, Home: 0, End: 100 }[event.key];
    if (next !== undefined) { event.preventDefault(); setStartSplit(next); }
  });
}
initStartCompare();
/** Called once the sample has loaded: the original shows at once, the After side fades in after a frame. */
function renderStartPreview(image) {
  startUi.image = image;
  requestAnimationFrame(() => setTimeout(() => { showStartLook(startUi.look); if (!$('#startCollage').hidden) renderStartCollage(); }));
}
// Collage Studio sample: each print shows the plain sample at once, then its look fades in. Rendered only once the
// sample is chosen, one look per task so the page stays responsive; renders share the before/after cache.
$('#startCollageSheet').style.setProperty('--collage-paper', COLLAGE_PAPERS[0].hex);
let startCollageQueued = false;
function renderStartCollage() {
  if (startCollageQueued || !startUi.image) return;
  startCollageQueued = true;
  const pending = [...document.querySelectorAll('#startCollageSheet [data-look]')];
  const next = () => {
    const scrap = pending.shift(); if (!scrap) return;
    const preset = presets.find(item => item.id === scrap.dataset.look), canvas = scrap.querySelector('canvas');
    if (preset) try {
      if (!startUi.renders.has(preset.id)) startUi.renders.set(preset.id, renderImage(startUi.image, preset.values, 'none', 900));
      const render = startUi.renders.get(preset.id);
      canvas.width = render.width; canvas.height = render.height; canvas.getContext('2d').drawImage(render, 0, 0);
      canvas.classList.add('is-ready');
    } catch (error) { console.warn(`Could not render the ${preset.name} collage sample.`, error); }
    setTimeout(next, 30);
  };
  next();
}

async function loadSample() {
  try {
    const response = await fetch(presetPreviewSource);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    await addFiles([new File([blob], 'sample-portrait.jpg', { type: blob.type || 'image/jpeg' })]);
  } catch (error) {
    console.error(error);
    toast('The sample photo could not be loaded.');
  }
}

function renderPresetPreviews() {
  loadSampleImage().then(image => {
    renderStartPreview(image);
    let index = 0;
    const renderNext = () => {
      const preset = presets[index++];
      if (!preset) return;
      const canvas = elements.lookGrid.querySelector(`[data-preset="${preset.id}"] canvas`);
      try {
        const preview = renderImage(image, preset.values, 'none', 260);
        drawCover(canvas.getContext('2d'), preview, canvas.width, canvas.height, .3);
        canvas.closest('.look-thumb').classList.add('has-preview');
      } catch (error) {
        console.warn(`Could not render the ${preset.name} preview.`, error);
      }
      setTimeout(renderNext, 0);
    };
    renderNext();
    renderFilmPreviews(image);
  }, error => console.warn(error.message));
}

/** Render Film thumbnails from the same sample used by Basic, one at a time to avoid competing workers. */
async function renderFilmPreviews(image) {
  let module;
  try { module = await loadEngine('kamo-film-engine'); }
  catch (error) { console.warn('Could not load Kamo film previews.', error); return; }
  // 71 tiles of 200 px: render from a ~400 px copy rather than at the 900 px preview size.
  const scale = Math.min(1, 400 / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const source = await createImageBitmap(image, { resizeWidth: Math.round((image.naturalWidth || image.width) * scale), resizeHeight: Math.round((image.naturalHeight || image.height) * scale), resizeQuality: 'high' });
  for (const look of filmTileLooks) {
    const canvas = elements.lookGrid.querySelector(`[data-film="${look.id}"] canvas`);
    if (!canvas) continue;
    try {
      const preview = await module.render(source, expandLook(module, look.values['kamo-film-engine']), { quality: 'preview' });
      drawCover(canvas.getContext('2d'), preview, canvas.width, canvas.height, .3);
      canvas.closest('.look-thumb').classList.add('has-preview');
      preview.close?.();
    } catch (error) { console.warn(`Could not render the ${look.name} film preview.`, error); }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  source.close?.();
}

// ---------- Adjust panel ----------
function formatValue(key, value) {
  const { step, suffix } = controlSpec[key];
  const text = step < 1 ? value.toFixed(2) : String(Math.round(value));
  if (Number(text) === 0) return `0${suffix}`;
  return `${value > 0 ? '+' : ''}${text}${suffix}`;
}
function buildAdjustments() {
  elements.adjustmentControls.innerHTML = adjustmentSections.map(section => `<section class="adjustment-section"><h3>${section.name}</h3>${section.controls.map(([id, label, min, max, step]) => `<div class="slider-row" data-row="${id}"><label class="slider-label" for="adjust-${id}"><span>${label}</span><output id="output-${id}" for="adjust-${id}">0</output></label><input id="adjust-${id}" data-adjustment="${id}" type="range" min="${min}" max="${max}" step="${step}" value="0"></div>`).join('')}</section>`).join('');
  const panel = elements.adjustmentControls;
  bindHistorySlider(panel, '[data-adjustment]', input => setAdjustment(input.dataset.adjustment, Number(input.value)));
  panel.addEventListener('dblclick', event => { const input = event.target.closest('[data-adjustment]'); if (input) resetAdjustment(input.dataset.adjustment); });
}

// One history entry per drag / keyboard session on any adjustment slider.
function bindHistorySlider(container, selector, apply) {
  container.addEventListener('pointerdown', event => { if (event.target.matches(selector)) sliderStart = snapshot(); });
  container.addEventListener('focusin', event => { if (event.target.matches(selector) && !sliderStart) sliderStart = snapshot(); });
  container.addEventListener('input', event => { const input = event.target.closest(selector); if (input) apply(input); });
  container.addEventListener('change', event => { if (!event.target.matches(selector)) return; commit(sliderStart || snapshot()); sliderStart = snapshot(); });
  container.addEventListener('focusout', event => { if (event.target.matches(selector)) sliderStart = null; });
}
function setAdjustment(key, value) {
  const base = baseValue(key);
  if (Math.abs(value - roundToStep(key, base)) < controlSpec[key].step / 2) delete state.edits[key];
  else state.edits[key] = value - base;
  syncAdjustments(); syncLooks(); scheduleRender();
}
function resetAdjustment(key) {
  if (!(key in state.edits)) return;
  change(() => { delete state.edits[key]; });
}

// ---------- Mobile Adjust: one slider at a time ----------
function buildMobileAdjust() {
  elements.maGroups.innerHTML = adjustmentSections.map((section, index) => `<button role="tab" type="button" data-group="${section.name}" aria-controls="maTools" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${section.name}</button>`).join('');
  elements.maGroups.addEventListener('click', event => {
    const tab = event.target.closest('[data-group]'); if (!tab) return;
    state.mobileTool = adjustmentSections.find(section => section.name === tab.dataset.group).controls[0][0];
    syncMobileAdjust();
  });
  elements.maGroups.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const tabs = [...elements.maGroups.querySelectorAll('[data-group]')];
    const next = tabs[(tabs.indexOf(document.activeElement) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    event.preventDefault(); next.click(); next.focus();
  });
  elements.maTools.addEventListener('click', event => { const tool = event.target.closest('[data-tool]'); if (tool) { state.mobileTool = tool.dataset.tool; syncMobileAdjust(); } });
  bindHistorySlider(elements.maSlider.parentElement, '#maSlider', input => setAdjustment(state.mobileTool, Number(input.value)));
  elements.maReset.addEventListener('click', () => resetAdjustment(state.mobileTool));
  // Double-tap (two quick taps without dragging) resets the active slider.
  let lastTap = 0, downAt = 0, downX = 0;
  elements.maSlider.addEventListener('pointerdown', event => { downAt = event.timeStamp; downX = event.clientX; });
  elements.maSlider.addEventListener('pointerup', event => {
    const isTap = event.timeStamp - downAt < 250 && Math.abs(event.clientX - downX) < 8;
    if (!isTap) { lastTap = 0; return; }
    if (event.timeStamp - lastTap < 350) { lastTap = 0; setTimeout(() => resetAdjustment(state.mobileTool), 0); }
    else lastTap = event.timeStamp;
  });
}
function syncMobileAdjust() {
  const key = state.mobileTool;
  const spec = controlSpec[key];
  const group = adjustmentSections.find(section => section.controls.some(control => control[0] === key));
  elements.maGroups.querySelectorAll('[data-group]').forEach(tab => { const selected = tab.dataset.group === group.name; tab.setAttribute('aria-selected', selected); tab.tabIndex = selected ? 0 : -1; });
  elements.maTools.setAttribute('aria-label', `${group.name} tools`);
  const focusedTool = elements.maTools.contains(document.activeElement) ? document.activeElement.dataset.tool : null;
  elements.maTools.innerHTML = group.controls.map(([id, label]) => {
    const edited = id in state.edits;
    return `<button class="ma-tool" type="button" data-tool="${id}" aria-pressed="${id === key}"><span class="ma-tool-name">${label}</span><span class="ma-tool-value${edited ? ' is-edited' : ''}">${formatValue(id, effectiveValue(id))}</span>${edited ? '<span class="ma-dot" aria-hidden="true"></span><span class="visually-hidden">, edited</span>' : ''}</button>`;
  }).join('');
  if (focusedTool) elements.maTools.querySelector(`[data-tool="${focusedTool}"]`)?.focus();
  const slider = elements.maSlider;
  slider.min = spec.min; slider.max = spec.max; slider.step = spec.step;
  const value = effectiveValue(key);
  if (document.activeElement !== slider || Number(slider.value) !== roundToStep(key, value)) slider.value = value;
  elements.maName.textContent = spec.label;
  elements.maValue.value = formatValue(key, value);
  elements.maValue.classList.toggle('is-edited', key in state.edits);
  elements.maReset.hidden = !(key in state.edits);
  elements.maZero.hidden = !(spec.min < 0 && spec.max > 0);
  elements.maZero.style.left = `calc(${(0 - spec.min) / (spec.max - spec.min) * 100}% - 1px)`;
}
function syncAdjustments() {
  document.querySelectorAll('[data-adjustment]').forEach(input => {
    const key = input.dataset.adjustment;
    const value = effectiveValue(key);
    if (document.activeElement !== input || Number(input.value) !== roundToStep(key, value)) input.value = value;
    const output = $(`#output-${key}`);
    output.value = formatValue(key, value);
    output.classList.toggle('is-edited', key in state.edits);
  });
  const count = editCount();
  elements.adjustBadge.hidden = !count;
  elements.adjustBadge.innerHTML = count ? `${count}<span class="visually-hidden"> edited</span>` : '';
  $('#resetAdjustments').disabled = !count;
  syncMobileAdjust();
}

// ---------- Lens panel (optics before the look: js/optics, plan_optics.md) ----------
function formatLens(control, value) {
  const text = control.step < 1 ? value.toFixed(2) : String(Math.round(value));
  return `${Number(text) === 0 ? '0' : `${control.signed && value > 0 ? '+' : ''}${text}`}${control.unit ? ` ${control.unit}` : ''}`;
}
const lensEdits = () => opticsControls.filter(control => state.optics[control.path] !== control.default);
function buildLens() {
  const panel = $('#lensControls');
  const hintOf = ({ path, hint }) => (hint ? `<p class="slider-hint" id="lensHint-${path}">${hint}</p>` : '');
  const described = ({ path, hint }) => (hint ? ` aria-describedby="lensHint-${path}"` : '');
  const row = control => control.kind === 'select'
    ? `<div class="crop-platform lens-select" data-lens-row="${control.path}"><label for="lens-${control.path}">${control.label}</label><select id="lens-${control.path}" data-lens-select="${control.path}"${described(control)}>${control.options.map(option => `<option value="${option}">${control.labels?.[option] ?? control.format?.(option) ?? option}</option>`).join('')}</select>${hintOf(control)}</div>`
    : `<div class="slider-row" data-lens-row="${control.path}"><label class="slider-label" for="lens-${control.path}"><span>${control.label}</span><output id="lensOut-${control.path}" for="lens-${control.path}">0</output></label><input id="lens-${control.path}" data-lens="${control.path}" type="range" min="${control.min}" max="${control.max}" step="${control.step}"${described(control)}>${hintOf(control)}</div>`;
  panel.innerHTML = opticsSections.map(section => `<section class="adjustment-section" data-lens-section="${section.id}"><h3>${section.title}</h3>${section.controls.map(row).join('')}${section.id === 'focus' ? '<p class="slider-hint lens-focus-info" id="lensFocusInfo" aria-live="polite"></p>' : section.id === 'diffraction' ? '<p class="slider-hint lens-focus-info" id="lensDiffractionInfo" aria-live="polite"></p>' : ''}</section>`).join('');
  bindHistorySlider(panel, '[data-lens]', input => { state.optics = normalizeOptics({ ...state.optics, [input.dataset.lens]: Number(input.value) }); syncLens(); scheduleRender(); });
  panel.addEventListener('change', event => {
    const path = event.target.dataset.lensSelect; if (!path) return;
    const value = opticsControls.find(control => control.path === path).options.find(option => String(option) === event.target.value);
    change(() => { state.optics = normalizeOptics({ ...state.optics, [path]: value }); });
  });
  // Double-click resets a slider to the active profile's value (or neutral without one).
  panel.addEventListener('dblclick', event => {
    const path = event.target.closest('[data-lens]')?.dataset.lens; if (!path) return;
    const profile = lensProfileById(state.optics.profile), value = (profile ? expandProfile(profile) : defaultOptics())[path];
    if (state.optics[path] !== value) change(() => { state.optics = normalizeOptics({ ...state.optics, [path]: value }); });
  });
  $('#resetLens').addEventListener('click', () => change(() => { state.optics = { ...defaultOptics(), ...cameraOf(state.optics) }; }));
  bindFocusDrag();
  $('#lensProfiles').innerHTML = lensProfiles.map(profile => `<button class="lens-profile" type="button" data-profile="${profile.id}" aria-pressed="false" aria-describedby="lensProfileNote-${profile.id}"><strong>${profile.name}</strong><small id="lensProfileNote-${profile.id}">${profile.description}</small></button>`).join('');
  $('#lensProfiles').addEventListener('click', event => {
    const profile = lensProfileById(event.target.closest('[data-profile]')?.dataset.profile);
    if (profile) change(() => { state.optics = { ...expandProfile(profile), ...cameraOf(state.optics), ...sceneOf(state.optics) }; });
  });
  // Camera: format and focal length (not an effect: kept by profiles and Reset lens).
  $('#lensFormat').innerHTML = cameraFormats.map(format => `<option value="${format.id}">${format.name}</option>`).join('');
  $('#lensFocal').innerHTML = FOCAL_LENGTHS.map(focal => `<option value="${focal}">${focal} mm</option>`).join('');
  $('#lensAperture').innerHTML = APERTURES.map(stop => `<option value="${stop}">f/${stop}</option>`).join('');
  document.querySelectorAll('[data-camera]').forEach(select => select.addEventListener('change', () => {
    const value = cameraControls.find(control => control.path === select.dataset.camera).options.find(option => String(option) === select.value);
    change(() => { state.optics = normalizeOptics({ ...state.optics, [select.dataset.camera]: value }); });
  }));
  $('#lensCropToFormat').addEventListener('click', cropToFormat);
}
// Focus area on the photo (Lens tab, Depth of field on): guides drawn on the overlay canvas, drag to move the focus point.
function drawFocusGuide(ctx, overlay, source) {
  const o = state.optics;
  if (document.body.dataset.tab !== 'lens' || o.focusMode === 'none' || !source?.photoRect || state.holding) return;
  const scale = overlay.width / source.width, rect = source.photoRect;
  const x = rect.x * scale, y = rect.y * scale, w = rect.width * scale, h = rect.height * scale, D = Math.hypot(w / 2, h / 2);
  const cx = x + o.focusX / 100 * w, cy = y + o.focusY / 100 * h, R = o.focusSize / 100 * D, F = (.02 + .98 * o.focusFeather / 100) * D;
  const px = overlay.width / Math.max(1, overlay.getBoundingClientRect().width), angle = o.focusAngle * Math.PI / 180;
  const ux = Math.cos(angle), uy = Math.sin(angle), nx = -uy, ny = ux;
  const line = offset => { const ox = cx + nx * offset, oy = cy + ny * offset; ctx.moveTo(ox - ux * 2 * D, oy - uy * 2 * D); ctx.lineTo(ox + ux * 2 * D, oy + uy * 2 * D); };
  const stroke = (draw, dashed) => {
    ctx.beginPath(); draw(); ctx.setLineDash(dashed ? [6 * px, 5 * px] : []);
    ctx.lineWidth = 3 * px; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke();
    ctx.lineWidth = 1.5 * px; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
  };
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (o.focusMode === 'radial') { stroke(() => ctx.arc(cx, cy, Math.max(1, R), 0, Math.PI * 2)); stroke(() => ctx.arc(cx, cy, R + F, 0, Math.PI * 2), true); }
  else if (o.focusMode === 'band') { stroke(() => { line(R); line(-R); }); stroke(() => { line(R + F); line(-R - F); }, true); }
  else { stroke(() => line(-R)); stroke(() => line(-R - F), true); } // linear: sharp below the line, blur grows upwards (at angle 0)
  ctx.setLineDash([]); ctx.beginPath(); ctx.arc(cx, cy, 7 * px, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill(); ctx.lineWidth = 2 * px; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke();
  ctx.restore();
}
function bindFocusDrag() {
  const overlay = elements.textCanvas;
  let drag = null;
  const point = event => { // photo fraction under the pointer (object-fit: contain on phones)
    const box = overlay.getBoundingClientRect(), scale = Math.min(box.width / overlay.width, box.height / overlay.height);
    const left = box.left + (box.width - overlay.width * scale) / 2, top = box.top + (box.height - overlay.height * scale) / 2;
    const source = state.editedCanvas, k = overlay.width / source.width, rect = source.photoRect;
    return { x: ((event.clientX - left) / scale / k - rect.x) / rect.width, y: ((event.clientY - top) / scale / k - rect.y) / rect.height };
  };
  const move = event => {
    const { x, y } = point(event);
    state.optics = normalizeOptics({ ...state.optics, focusX: Math.min(1, Math.max(0, x)) * 100, focusY: Math.min(1, Math.max(0, y)) * 100 });
    syncLens(); scheduleRender();
  };
  elements.dropZone.addEventListener('pointerdown', event => {
    if (document.body.dataset.tab !== 'lens' || state.optics.focusMode === 'none' || !state.editedCanvas?.photoRect || event.button > 0 || event.target.closest('#fullscreenButton,#engineWaitRetry')) return;
    const { x, y } = point(event); if (x < 0 || x > 1 || y < 0 || y > 1) return;
    event.preventDefault(); event.stopPropagation();
    drag = { id: event.pointerId, start: snapshot() };
    overlay.setPointerCapture(event.pointerId); move(event);
  }, { capture: true });
  overlay.addEventListener('pointermove', event => { if (drag?.id === event.pointerId) move(event); });
  const drop = event => { if (drag?.id !== event.pointerId) return; const start = drag.start; drag = null; commit(start); };
  overlay.addEventListener('pointerup', drop); overlay.addEventListener('pointercancel', drop); overlay.addEventListener('lostpointercapture', drop);
}
/** The format's long:short ratio, turned to the photo's orientation: an existing ratio tile when one matches. */
function formatCrop(format) {
  const [long, short] = format.ratio, { W, H } = cropGeo(), landscape = W >= H, want = landscape ? long / short : short / long;
  for (const [id] of RATIOS) {
    const [a, b] = id.split(':').map(Number); if (!b) continue;
    if (Math.abs(a / b - want) < 1e-3) return { ratio: id, swapped: false };
    if (Math.abs(b / a - want) < 1e-3) return { ratio: id, swapped: true };
  }
  return { ratio: landscape ? `${long}:${short}` : `${short}:${long}`, swapped: false };
}
function cropToFormat() {
  const format = formatById(state.optics.format); if (!format || !state.image) return;
  change(() => { state.crop = fitRatio({ ...state.crop, ...formatCrop(format), platform: null, x: .5, y: .5, zoom: 1 }); });
  toast(`Cropped to ${format.name}.`);
}
/** The Lens tab's current profile: { profile, edited }, or null when no profile is applied. */
function lensProfileState() {
  const profile = lensProfileById(state.optics.profile);
  return profile ? { profile, edited: !matchesProfile(state.optics, profile) } : null;
}
const lensSummary = () => { const current = lensProfileState(); return current ? `${current.profile.name}${current.edited ? ' · edited' : ''}` : lensEdits().length ? 'Custom' : 'None'; };
function syncLens() {
  for (const control of opticsControls) {
    const input = $(`#lens-${control.path}`), value = state.optics[control.path];
    $(`[data-lens-row="${control.path}"]`).hidden = control.showIf ? !control.showIf(state.optics) : false;
    if (control.kind === 'select') { input.value = String(value); continue; }
    if (document.activeElement !== input || Number(input.value) !== value) input.value = value;
    const output = $(`#lensOut-${control.path}`);
    output.value = formatLens(control, value);
    output.classList.toggle('is-edited', value !== control.default);
  }
  for (const section of opticsSections) if (section.showIf) $(`[data-lens-section="${section.id}"]`).hidden = !section.showIf(state.optics);
  const focusOn = state.optics.focusMode !== 'none';
  document.body.classList.toggle('lens-focus', focusOn);
  $('#lensFocusInfo').hidden = !focusOn;
  if (focusOn) {
    const { width, height } = state.image ? croppedSize() : { width: 6000, height: 4000 }, o = state.optics;
    const across = Math.round(2 * focusBlurRadius(o) * Math.hypot(width / 2, height / 2));
    $('#lensFocusInfo').textContent = `Background blur up to ${across} px across at full size (${o.focal} mm, f/${o.aperture}, focused at ${o.subjectDistance} m on ${formatById(o.format).name}; set lens and format under Camera). Simulated: the photo has no real depth.`;
  }
  const diffractionOn = state.optics.diffraction === 'on';
  $('#lensDiffractionInfo').hidden = !diffractionOn;
  if (diffractionOn) {
    const { width, height } = state.image ? croppedSize() : { width: 6000, height: 4000 }, o = state.optics, airy = 2.44 * WAVELENGTH_MM * o.aperture;
    const px = airy / (formatById(o.format).long / Math.max(width, height));
    $('#lensDiffractionInfo').textContent = `Airy disk ${(airy * 1000).toFixed(1)} µm across at f/${o.aperture} on ${formatById(o.format).name}: about ${px.toFixed(1)} px at full size.`;
  }
  drawTextOverlay();
  const current = lensProfileState(), neutral = lensEdits().length === 0;
  document.querySelectorAll('[data-profile]').forEach(button => button.setAttribute('aria-pressed', current ? button.dataset.profile === current.profile.id : button.dataset.profile === 'none' && neutral));
  $('#lensCurrent').textContent = lensSummary();
  const format = formatById(state.optics.format), focal = state.optics.focal, fov = fieldOfView(format, focal), deg = value => `${value.toFixed(value < 10 ? 1 : 0)}°`;
  $('#lensFormat').value = format.id; $('#lensFocal').value = String(focal); $('#lensAperture').value = String(state.optics.aperture);
  $('#lensFov').textContent = `Angle of view ${deg(fov.diagonal)} diagonal (${deg(fov.long)} × ${deg(fov.short)})${format.id === '35mm' ? '' : ` · like ${Math.round(fov.equivalent)} mm on full frame`}`;
  const [long, short] = format.ratio;
  $('#lensCropToFormat').textContent = `Crop to ${format.name} (${long}:${short})`;
  $('#lensCropToFormat').disabled = !state.image;
  const count = lensEdits().length;
  $('#lensBadge').hidden = !count;
  $('#lensBadge').innerHTML = count ? `${count}<span class="visually-hidden"> edited</span>` : '';
  $('#resetLens').disabled = !count;
}

// ---------- Frames ----------
function buildFrames() {
  elements.frameGrid.innerHTML = frames.map(frame => `<button class="frame-card" type="button" data-frame="${frame.id}" aria-pressed="false"><span class="frame-sample"><i></i><img alt=""></span><strong>${frame.name}</strong><small>${frame.description}</small></button>`).join('');
  elements.frameGrid.addEventListener('click', event => { const card = event.target.closest('[data-frame]'); if (card) change(() => { state.frame.id = card.dataset.frame; }); });
  // Paper print border: size presets set the width; sliders, paper colour, match-the-print-paper.
  $('#borderSizes').innerHTML = borderSizes.map(size => `<button type="button" role="radio" data-border-size="${size.id}" aria-checked="false">${size.name}</button>`).join('');
  $('#paperSwatches').innerHTML = paperColors.map(color => `<button type="button" role="radio" class="paper-swatch" data-paper="${color.id}" aria-checked="false" aria-label="${color.name}" title="${color.name}" style="--swatch:${color.hex}"></button>`).join('');
  bindRadioGroup($('#borderSizes'), '[data-border-size]', button => change(() => { const border = state.frame.border; border.size = button.dataset.borderSize; border.width = borderSizes.find(size => size.id === border.size).width; }));
  bindRadioGroup($('#paperSwatches'), '[data-paper]', button => change(() => { state.frame.border.color = button.dataset.paper; state.frame.border.matchPaper = false; }));
  bindHistorySlider(elements.borderPanel, '[data-border]', input => {
    const border = state.frame.border; border[input.dataset.border] = Number(input.value);
    if (input.dataset.border === 'width') border.size = borderSizes.find(size => size.width === border.width)?.id || 'custom';
    syncFrames(); scheduleRender();
  });
  $('#matchPaper').addEventListener('change', event => change(() => { state.frame.border.matchPaper = event.target.checked; }));
  // Border colour (frames with a solid border): the frame's own colour, a swatch, or Custom (one undo step per pick).
  $('#frameColors').innerHTML = [['default', 'Frame default'], ...FRAME_SWATCHES].map(([value, name]) => `<button type="button" role="radio" class="paper-swatch${value === 'default' ? ' frame-default-swatch' : ''}" data-frame-color="${value}" aria-checked="false" aria-label="${name}" title="${name}"${value === 'default' ? '' : ` style="--swatch:${value}"`}>${value === 'default' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.8L3 8"/><path d="M3 3v5h5"/></svg>' : ''}</button>`).join('');
  bindRadioGroup($('#frameColors'), '[data-frame-color]', button => change(() => { state.frame.color = button.dataset.frameColor === 'default' ? null : button.dataset.frameColor; }));
  bindHistorySlider($('#frameColorPanel'), '#frameColor', input => { state.frame.color = input.value; syncFrames(); scheduleRender(); });
  // Paper print: a custom paper colour (stored as a hex instead of a paper id).
  bindHistorySlider(elements.borderPanel, '#paperColor', input => { state.frame.border.color = input.value; state.frame.border.matchPaper = false; syncFrames(); scheduleRender(); });
}
/** Each tool's "Apply to selected / Apply to all" row (`#<id>ApplyAll`): what it copies (applyToPhotos parts). */
const APPLY_ROWS = {
  looks: { label: 'look', name: 'Look', parts: { look: true } },
  adjust: { label: 'adjustments', name: 'Adjustments', parts: { adjustments: true, exposure: true } }, // everything in the Adjust tab
  lens: { label: 'lens effects', name: 'Lens', parts: { lens: true } },
  crop: { label: 'crop ratio', name: 'Crop ratio', parts: { crop: true } }, // centred on each photo, like the Apply dialog
  frame: { label: 'frame', name: 'Frame', parts: { frame: true } }, // the frame, its colour and print border settings
  text: { label: 'text', name: 'Text', parts: { text: true }, shown: () => state.text.length > 0 } // never clears the others by accident
};
/** All / the selected other photos get this photo's settings for one tool; one undo step per photo. */
function buildApplyRows() {
  for (const [id, row] of Object.entries(APPLY_ROWS)) {
    const apply = targets => {
      const count = applyToPhotos(targets, row.parts);
      toast(count ? `${row.name} applied to ${plural(count, 'other photo')}.` : `Those photos already have the same ${row.label}.`);
    };
    $(`#${id}ApplyAllButton`).addEventListener('click', () => apply(app.photos.filter(photo => photo.id !== app.activeId)));
    $(`#${id}ApplySelectedButton`).addEventListener('click', () => apply(otherSelected()));
  }
}
/** "Apply to all (N)" / "Apply to selected (N)" in every tool; shown with two or more photos. */
function syncApplyButtons() {
  const count = app.photos.length, selected = otherSelected().length;
  for (const [id, row] of Object.entries(APPLY_ROWS)) {
    $(`#${id}ApplyAll`).hidden = count < 2 || row.shown?.() === false;
    const all = `#${id}ApplyAllButton`, some = `#${id}ApplySelectedButton`, label = row.label;
    $(all).textContent = `Apply to all (${count})`;
    $(all).setAttribute('aria-label', `Apply ${label} to all ${count} photos`);
    $(some).textContent = selected ? `Apply to selected (${selected})` : 'Apply to selected';
    $(some).setAttribute('aria-label', selected ? `Apply ${label} to the ${plural(selected, 'other selected photo')}` : `Apply ${label} to selected photos (select photos in the filmstrip first)`);
    $(some).disabled = !selected;
  }
}
const FRAME_SWATCHES = [['#ffffff', 'White'], ['#f4efe4', 'Warm white'], ['#8c8c86', 'Grey'], ['#3a3a37', 'Charcoal'], ['#111110', 'Black']];
/** Marks the radio whose `attribute` equals `value` as checked; it (or the first) is the one Tab reaches. */
function syncRadios(group, attribute, value) {
  const buttons = [...group.querySelectorAll(`[${attribute}]`)];
  buttons.forEach(button => { const checked = button.getAttribute(attribute) === value; button.setAttribute('aria-checked', checked); button.tabIndex = checked ? 0 : -1; });
  if (!buttons.some(button => button.tabIndex === 0)) buttons[0].tabIndex = 0;
}
/** Radiogroup of buttons: click picks, arrow keys move and pick (roving tabindex). */
function bindRadioGroup(group, selector, pick) {
  group.addEventListener('click', event => { const button = event.target.closest(selector); if (button && button.getAttribute('aria-checked') !== 'true') pick(button); });
  group.addEventListener('keydown', event => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]; if (!step) return;
    const buttons = [...group.querySelectorAll(selector)];
    const current = Math.max(0, buttons.indexOf(document.activeElement));
    const next = buttons[(current + step + buttons.length) % buttons.length];
    event.preventDefault(); next.focus(); pick(next);
  });
}
/** The print paper's tint when "Match paper tint" can apply (film engine printing on paper), else null. */
function matchedPaper() {
  const module = activeModule(); const params = advParams();
  return module?.paperTint && params && module.showsPaper(params) ? module.paperTint(params) : null;
}
/** The frame as the renderer takes it: an id, or Paper print with its sizes and resolved colour. */
function renderFrame() { return frameFor(state.frame, matchedPaper()); }
/** `tint`: the print paper's tint for "Match paper tint", or null. */
function frameFor({ id, border, color: borderColor }, tint) {
  if (id !== 'paper') return borderColor && FRAME_COLORS[id] ? { id, color: borderColor } : id;
  const color = (border.matchPaper && tint) || border.color;
  const paper = color?.startsWith('#') ? color : (paperColors.find(item => item.id === color) || paperColors[1]).hex;
  return { id, width: border.width, bottom: border.bottom, paper };
}
function syncFrames() {
  const { id, border } = state.frame;
  document.querySelectorAll('[data-frame]').forEach(card => card.setAttribute('aria-pressed', card.dataset.frame === id));
  elements.borderPanel.hidden = id !== 'paper';
  const colorable = Boolean(FRAME_COLORS[id]), color = state.frame.color;
  $('#frameColorPanel').hidden = !colorable;
  if (colorable) {
    $('#frameColors .frame-default-swatch').style.setProperty('--swatch', FRAME_COLORS[id]);
    syncRadios($('#frameColors'), 'data-frame-color', color && FRAME_SWATCHES.some(([hex]) => hex === color) ? color : color ? '' : 'default');
    const custom = $('#frameColor'), label = custom.closest('.text-custom-color');
    if (document.activeElement !== custom) custom.value = color || FRAME_COLORS[id];
    label.style.setProperty('--custom-color', custom.value);
    label.classList.toggle('is-selected', Boolean(color) && !FRAME_SWATCHES.some(([hex]) => hex === color));
  }
  syncFramePreview();
  syncApplyButtons();
  syncRadios($('#borderSizes'), 'data-border-size', border.size);
  for (const [key, output, prefix] of [['width', '#borderWidthOutput', ''], ['bottom', '#borderBottomOutput', '+']]) {
    const input = elements.borderPanel.querySelector(`[data-border="${key}"]`);
    if (document.activeElement !== input) input.value = border[key];
    $(output).value = `${border[key] ? prefix : ''}${border[key]}%`;
  }
  const tint = matchedPaper();
  const match = $('#matchPaper');
  match.disabled = !tint; match.checked = Boolean(tint && border.matchPaper);
  $('#matchPaperHint').textContent = tint ? '' : 'Available with a film engine that prints on paper.';
  syncRadios($('#paperSwatches'), 'data-paper', match.checked ? tint : border.color);
  const paperCustom = $('#paperColor'), paperLabel = paperCustom.closest('.text-custom-color'), isCustom = !match.checked && border.color?.startsWith('#');
  if (document.activeElement !== paperCustom) paperCustom.value = isCustom ? border.color : (paperColors.find(item => item.id === border.color) || paperColors[1]).hex;
  paperLabel.style.setProperty('--custom-color', paperCustom.value);
  paperLabel.classList.toggle('is-selected', Boolean(isCustom));
}
/** Frame cards show each frame really drawn around the photo in view (cropped, at its own shape). */
let framePreviewKey = '';
function syncFramePreview(photo = activePhoto()) {
  const thumb = photo?.thumb, key = thumb ? `${state.imageId}|${JSON.stringify(state.crop)}` : '';
  if (key === framePreviewKey) return;
  framePreviewKey = key;
  elements.frameGrid.classList.toggle('has-photo', Boolean(thumb));
  if (!thumb) return;
  const source = isIdentityCrop(state.crop) ? thumb : cropSource(thumb, state.crop, 200);
  elements.frameGrid.querySelectorAll('[data-frame]').forEach(card => {
    const out = frameCanvas(source, frameFor({ id: card.dataset.frame, border: defaultBorder }));
    card.querySelector('img').src = out.toDataURL('image/jpeg', .82);
  });
}

// ---------- Crop ----------
// state.crop (see defaultCrop in renderer.js) is applied first: every look, engine, compare and
// export starts from the cropped source. While the Crop tab is open the stage shows the whole
// photo (no look, no frame) with the crop box; edits commit once per gesture (pointer-up,
// wheel/keyboard pause, slider change).
const RATIOS = [['orig', 'Orig.', 'Original'], ['free', 'Free', 'Free'], ['1:1', '1:1'], ['4:5', '4:5'], ['2:3', '2:3'], ['5:7', '5:7'], ['9:16', '9:16'], ['3:4', '3:4'], ['16:9', '16:9'], ['3:2', '3:2']];
const MIN_CROP_PX = 64, CROP_ZOOM_MAX = 3, CROP_PREVIEW_EDGE = 1600;
const PLATFORMS = Object.fromEntries(platformSizes.flatMap(({ group, items }) => items.map(([id, name, w, h]) => [id, { id, group, name, w, h }])));
/** "Instagram post, portrait", a ratio name, or the raw ratio. */
function ratioLabel(crop) {
  const platform = PLATFORMS[crop.platform];
  if (platform) return `${platform.group} ${platform.name.toLowerCase()}`;
  const ratio = RATIOS.find(([id]) => id === crop.ratio);
  return ratio ? ratio[2] || ratio[1] : crop.ratio;
}
const cloneCrop = crop => ({ ...defaultCrop, ...crop });
const cropKey = () => JSON.stringify([state.imageId, state.crop]);
// `size` is the photo (an image, or { naturalWidth, naturalHeight } for a photo not in view).
const cropGeo = (crop = state.crop, size = state.image) => cropGeometry(size.naturalWidth, size.naturalHeight, crop);
const cropUi = { k: 1, vw: 0, vh: 0, key: '', thumb: null, thumbId: -1, start: null, timer: 0, drag: null, pointers: new Map(), previousTab: 'looksTab' };

/** Width / height of the chosen ratio in px of the oriented photo; null for Free. */
function ratioValue(crop, W, H) {
  if (crop.ratio === 'free') return null;
  if (crop.ratio === 'orig') return W / H;
  const [a, b] = crop.ratio.split(':').map(Number);
  return crop.swapped ? b / a : a / b;
}
/** Keeps the straightened box inside the photo (no empty corners): zooms in if it is too big, then moves it in. */
function clampCrop(crop, size = state.image) {
  const { naturalWidth: width, naturalHeight: height } = size;
  let g = cropGeometry(width, height, crop);
  let { ex, ey } = cropExtents(g.width, g.height, crop.straighten);
  const fit = Math.min(g.W / (2 * ex), g.H / (2 * ey));
  if (fit < 1) {
    crop.zoom /= fit * .9999;
    g = cropGeometry(width, height, crop); ({ ex, ey } = cropExtents(g.width, g.height, crop.straighten));
  }
  crop.x = Math.min(1 - ex / g.W, Math.max(ex / g.W, crop.x));
  crop.y = Math.min(1 - ey / g.H, Math.max(ey / g.H, crop.y));
  return crop;
}
const cropFits = crop => {
  const g = cropGeo(crop); const { ex, ey } = cropExtents(g.width, g.height, crop.straighten);
  return g.width >= MIN_CROP_PX - .5 && g.height >= MIN_CROP_PX - .5 && g.cx - ex >= -.5 && g.cy - ey >= -.5 && g.cx + ex <= g.W + .5 && g.cy + ey <= g.H + .5;
};
/** The largest box of the chosen ratio around the current centre (Free keeps its box). */
function fitRatio(crop, size = state.image) {
  const { W, H } = cropGeo(crop, size);
  const ratio = ratioValue(crop, W, H);
  if (ratio) { const width = Math.min(W, H * ratio); crop.w = width / W; crop.h = width / ratio / H; crop.zoom = 1; }
  return clampCrop(crop, size);
}
const setCropZoom = (crop, zoom) => { crop.zoom = Math.min(CROP_ZOOM_MAX, Math.max(1, zoom)); return clampCrop(crop); };

// Cropped source at a given long edge; preview sizes are cached until the crop or photo changes.
const croppedCache = { key: '', sizes: new Map() };
function croppedSource(maxEdge = Infinity) {
  if (isIdentityCrop(state.crop)) return state.image;
  const key = cropKey();
  if (croppedCache.key !== key) { croppedCache.key = key; croppedCache.sizes.clear(); }
  if (maxEdge > ZOOM_MAX_EDGE) return cropSource(state.image, state.crop, maxEdge);
  if (!croppedCache.sizes.has(maxEdge)) croppedCache.sizes.set(maxEdge, cropSource(state.image, state.crop, maxEdge));
  return croppedCache.sizes.get(maxEdge);
}
// The cropped source with the Lens optics applied (js/optics, in a Worker): the start of every look.
// Preview sizes are cached until the photo, crop or optics change, so Adjust and Frames don't re-run it.
const opticsCache = { key: '', sizes: new Map() };
async function opticsSource(maxEdge = Infinity) {
  if (opticsNeutral(state.optics)) return croppedSource(maxEdge);
  const key = JSON.stringify([cropKey(), opticsRenderKey(state.optics)]);
  if (opticsCache.key !== key) { opticsCache.key = key; opticsCache.sizes.clear(); }
  if (maxEdge > ZOOM_MAX_EDGE) return renderOptics(croppedSource(maxEdge), state.optics, maxEdge);
  if (!opticsCache.sizes.has(maxEdge)) {
    const promise = renderOptics(croppedSource(maxEdge), state.optics, maxEdge, { replaceable: true });
    promise.catch(() => { if (opticsCache.sizes.get(maxEdge) === promise) opticsCache.sizes.delete(maxEdge); });
    opticsCache.sizes.set(maxEdge, promise);
  }
  return opticsCache.sizes.get(maxEdge);
}
const croppedSize = () => { const g = cropGeo(); return { width: Math.max(1, Math.round(g.width)), height: Math.max(1, Math.round(g.height)) }; };

// One history entry per gesture: the first change takes the snapshot, the end commits it.
function beginCropGesture() { clearTimeout(cropUi.timer); if (!cropUi.start) cropUi.start = snapshot(); }
function endCropGesture(delay = 0) {
  clearTimeout(cropUi.timer);
  cropUi.timer = setTimeout(() => { const start = cropUi.start; cropUi.start = null; if (start) { commit(start); scheduleRender(); } }, delay);
}
function updateCrop(crop) { state.crop = crop; syncCrop(); }

function buildCrop() {
  elements.ratioGrid.innerHTML = RATIOS.map(([id, label, name]) => {
    const [a, b] = id.includes(':') ? id.split(':').map(Number) : id === 'free' ? [1, 1] : [4, 5];
    const scale = 22 / Math.max(a, b);
    return `<button class="ratio-tile" type="button" role="radio" data-ratio="${id}" aria-checked="false"${name ? ` aria-label="${name}"` : ''}><span class="ratio-shape" style="width:${Math.round(a * scale)}px;height:${Math.round(b * scale)}px" aria-hidden="true"></span><span aria-hidden="${Boolean(name)}">${label}</span></button>`;
  }).join('');
  bindRadioGroup(elements.ratioGrid, '[data-ratio]', button => change(() => { state.crop = fitRatio({ ...state.crop, ratio: button.dataset.ratio, swapped: false, platform: null }); }));
  $('#cropPlatform').innerHTML = '<option value="">None</option>' + platformSizes.map(({ group, items }) => `<optgroup label="${group}">${items.map(([id, name, w, h]) => `<option value="${id}">${group} · ${name} · ${w} × ${h}</option>`).join('')}</optgroup>`).join('');
  $('#cropPlatform').addEventListener('change', event => change(() => {
    const platform = PLATFORMS[event.target.value];
    state.crop = platform ? fitRatio({ ...state.crop, ratio: `${platform.w}:${platform.h}`, swapped: false, platform: platform.id }) : { ...state.crop, platform: null };
  }));
  $('#cropSwap').addEventListener('click', () => change(() => { state.crop = fitRatio({ ...state.crop, swapped: !state.crop.swapped }); }));
  $('#cropRotate').addEventListener('click', () => change(() => {
    const crop = cloneCrop(state.crop);
    crop.rotate = (crop.rotate + 90) % 360; [crop.x, crop.y] = crop.flip ? [crop.y, 1 - crop.x] : [1 - crop.y, crop.x]; [crop.w, crop.h] = [crop.h, crop.w];
    state.crop = crop.ratio === 'free' ? clampCrop(crop) : fitRatio(crop);
  }));
  $('#cropFlip').addEventListener('click', () => change(() => { const crop = cloneCrop(state.crop); crop.flip = !crop.flip; crop.x = 1 - crop.x; crop.straighten = -crop.straighten || 0; state.crop = clampCrop(crop); }));
  $('#cropCenter').addEventListener('click', () => change(() => { state.crop = clampCrop({ ...state.crop, x: .5, y: .5 }); }));
  $('#cropReset').addEventListener('click', () => change(() => { state.crop = { ...defaultCrop }; }));
  $('#cropDone').addEventListener('click', () => { const tab = $(`#${cropUi.previousTab}`); setTab(tab); tab.focus(); });
  bindHistorySlider(elements.cropPanel, '[data-crop]', input => {
    const crop = cloneCrop(state.crop);
    if (input.dataset.crop === 'zoom') setCropZoom(crop, Number(input.value));
    else { crop.straighten = Number(input.value); clampCrop(crop); }
    updateCrop(crop); scheduleRender();
  });

  // Stage: drag to move, handles to resize, wheel / pinch to zoom, keys on the focused box.
  const view = elements.cropView;
  const pinchDistance = () => { const [a, b] = [...cropUi.pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  view.addEventListener('pointerdown', event => {
    if (!state.image || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    cropUi.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    view.setPointerCapture(event.pointerId);
    beginCropGesture();
    if (cropUi.pointers.size === 2) { cropUi.drag = { kind: 'pinch', distance: pinchDistance(), crop: cloneCrop(state.crop) }; return; }
    if (cropUi.pointers.size > 2) return;
    elements.cropBox.focus({ preventScroll: true });
    cropUi.drag = { kind: event.target.dataset.handle ? 'resize' : 'move', handle: event.target.dataset.handle, x: event.clientX, y: event.clientY, crop: cloneCrop(state.crop) };
  });
  view.addEventListener('pointermove', event => {
    if (!cropUi.pointers.has(event.pointerId)) return;
    cropUi.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const drag = cropUi.drag; if (!drag) return;
    if (drag.kind === 'pinch') { updateCrop(setCropZoom(cloneCrop(drag.crop), drag.crop.zoom * pinchDistance() / drag.distance)); return; }
    const next = drag.kind === 'move' ? moveCrop(drag.crop, event.clientX - drag.x, event.clientY - drag.y) : resizeCrop(drag.crop, drag.handle, event.clientX - drag.x, event.clientY - drag.y);
    if (next) updateCrop(next);
  });
  const release = event => {
    if (!cropUi.pointers.delete(event.pointerId)) return;
    cropUi.drag = null; // a pinch that loses a finger stops; lift both to start a new gesture
    if (!cropUi.pointers.size) endCropGesture();
  };
  view.addEventListener('pointerup', release);
  view.addEventListener('pointercancel', release);
  view.addEventListener('wheel', event => {
    if (!state.image) return;
    event.preventDefault(); beginCropGesture();
    updateCrop(setCropZoom(cloneCrop(state.crop), state.crop.zoom * Math.exp(-event.deltaY * .0015)));
    endCropGesture(400);
  }, { passive: false });
  elements.cropBox.addEventListener('keydown', event => {
    const step = event.shiftKey ? .1 : .01;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    const zoom = { '+': 1.1, '=': 1.1, '-': 1 / 1.1, _: 1 / 1.1 }[event.key];
    if (!move && !zoom) return;
    event.preventDefault(); beginCropGesture();
    const crop = cloneCrop(state.crop);
    if (move) { crop.x += move[0]; crop.y += move[1]; clampCrop(crop); } else setCropZoom(crop, crop.zoom * zoom);
    updateCrop(crop); endCropGesture(500);
  });
  new ResizeObserver(() => { if (!elements.cropStage.hidden) drawCropView(); }).observe(elements.cropStage);
}
/** Screen delta (px) → oriented-photo delta: undo the straighten rotation and the display scale. */
function toPhotoDelta(dx, dy) {
  const angle = -state.crop.straighten * Math.PI / 180, k = cropUi.k;
  return [(dx * Math.cos(angle) - dy * Math.sin(angle)) / k, (dx * Math.sin(angle) + dy * Math.cos(angle)) / k];
}
function moveCrop(start, dx, dy) {
  const { W, H } = cropGeo(start); const [px, py] = toPhotoDelta(dx, dy);
  return clampCrop({ ...start, x: start.x + px / W, y: start.y + py / H });
}
function resizeCrop(start, handle, dx, dy) {
  const g = cropGeo(start); const ratio = ratioValue(start, g.W, g.H);
  const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0, sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  const k = cropUi.k;
  let width = Math.max(MIN_CROP_PX, g.width + sx * dx / k), height = Math.max(MIN_CROP_PX, g.height + sy * dy / k);
  if (ratio) {
    const scale = Math.max(MIN_CROP_PX / g.width, MIN_CROP_PX / g.height, sx && sy ? Math.max(width / g.width, height / g.height) : sx ? width / g.width : height / g.height);
    width = g.width * scale; height = g.height * scale;
  }
  // The opposite side stays put: the centre moves by half the change, along the box's own axes.
  const [px, py] = toPhotoDelta(sx * (width - g.width) / 2 * k, sy * (height - g.height) / 2 * k);
  const crop = { ...start, w: width * start.zoom / g.W, h: height * start.zoom / g.H, x: start.x + px / g.W, y: start.y + py / g.H };
  return cropFits(crop) ? crop : null;
}
/** Draws the oriented, straightened photo to fit the stage and places the crop box on it. */
function drawCropView() {
  if (!state.image || elements.cropStage.hidden) return;
  const crop = state.crop; const { W, H } = cropGeo();
  const { ex, ey } = cropExtents(W, H, crop.straighten);
  const availableWidth = Math.max(80, elements.cropStage.clientWidth - 32);
  const availableHeight = Math.max(80, elements.cropStage.clientHeight - elements.cropHint.offsetHeight - 46);
  const k = Math.min(availableWidth / (2 * ex), availableHeight / (2 * ey));
  const vw = Math.round(2 * ex * k), vh = Math.round(2 * ey * k);
  Object.assign(cropUi, { k, vw, vh });
  const key = JSON.stringify([state.imageId, crop.rotate, crop.flip, crop.straighten, vw, vh]);
  if (cropUi.key !== key) {
    cropUi.key = key;
    if (cropUi.thumbId !== state.imageId) { cropUi.thumb = renderImage(state.image, defaultAdjustments, 'none', CROP_PREVIEW_EDGE); cropUi.thumbId = state.imageId; }
    const thumb = cropUi.thumb, scale = thumb.width / state.image.naturalWidth;
    const canvas = elements.cropCanvas, dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    canvas.style.width = elements.cropView.style.width = `${vw}px`; canvas.style.height = elements.cropView.style.height = `${vh}px`;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(dpr * k, 0, 0, dpr * k, canvas.width / 2, canvas.height / 2);
    ctx.rotate(crop.straighten * Math.PI / 180);
    ctx.translate(-W / 2, -H / 2);
    ctx.scale(1 / scale, 1 / scale);
    drawOriented(ctx, thumb, crop, W * scale, H * scale);
  }
  const g = cropGeo(); const angle = crop.straighten * Math.PI / 180;
  const dx = g.cx - W / 2, dy = g.cy - H / 2;
  const cx = vw / 2 + k * (dx * Math.cos(angle) - dy * Math.sin(angle)), cy = vh / 2 + k * (dx * Math.sin(angle) + dy * Math.cos(angle));
  const box = elements.cropBox, bw = g.width * k, bh = g.height * k;
  Object.assign(box.style, { left: `${cx - bw / 2}px`, top: `${cy - bh / 2}px`, width: `${bw}px`, height: `${bh}px` });
}
function syncCrop() {
  const crop = state.crop;
  syncRadios(elements.ratioGrid, 'data-ratio', crop.ratio);
  $('#cropSwap').disabled = ['orig', 'free', '1:1'].includes(crop.ratio) || Boolean(crop.platform);
  const platform = PLATFORMS[crop.platform];
  if (document.activeElement !== $('#cropPlatform')) $('#cropPlatform').value = platform ? platform.id : '';
  const zoom = $('#cropZoom'), straighten = $('#cropStraighten');
  if (document.activeElement !== zoom) zoom.value = crop.zoom;
  if (document.activeElement !== straighten) straighten.value = crop.straighten;
  $('#cropZoomOutput').value = `${Number(crop.zoom.toFixed(2))}×`;
  $('#cropStraightenOutput').value = `${Number(crop.straighten.toFixed(1))}°`;
  $('#cropFlip').setAttribute('aria-pressed', crop.flip);
  $('#cropReset').disabled = isIdentityCrop(crop) && crop.ratio === 'orig';
  if (!state.image) { elements.cropOutput.textContent = ''; return; }
  const { width, height } = croppedSize();
  elements.cropOutput.textContent = `Output ${width} × ${height} px` + (platform ? ` · ${platform.group} recommends ${platform.w} × ${platform.h}${width < platform.w ? ' (this photo is smaller)' : ''}` : '');
  elements.cropBox.setAttribute('aria-label', `Crop area, ${width} by ${height} pixels`);
  drawCropView();
}

// ---------- Text on the photo ----------
// state.text holds the photo's text layers (renderer.js drawTexts). The preview shows them on a
// separate canvas over the photo (#textCanvas) so typing and dragging are instant; export,
// batch export and thumbnails draw them into the image (frameCanvas(…, texts)).
const TEXT_COLORS = [['#ffffff', 'White'], ['#111110', 'Black'], ['#f4efe4', 'Warm white'], ['#ffd25a', 'Gold'], ['#ff8a4c', 'Orange'], ['#e8473a', 'Red'], ['#e96ca5', 'Pink'], ['#a98be8', 'Purple'], ['#1f3a68', 'Navy'], ['#67b7e8', 'Sky blue'], ['#58b89c', 'Teal'], ['#8c8c86', 'Grey']];
const textUi = { selected: null, boxes: [], drag: null, start: null, timer: 0 };
const cloneTexts = texts => (texts || []).map(text => ({ ...text }));
// Text may sit anywhere on the framed image, borders included: positions stay relative to the
// photo, so below the photo is y > 1 and the limits come from the frame around it.
function textBounds() {
  const canvas = state.editedCanvas, rect = canvas?.photoRect;
  if (!rect) return { x0: 0, x1: 1, y0: 0, y1: 1 };
  return { x0: -rect.x / rect.width, x1: (canvas.width - rect.x) / rect.width, y0: -rect.y / rect.height, y1: (canvas.height - rect.y) / rect.height };
}
const clampText = text => { const b = textBounds(); text.x = Math.min(b.x1, Math.max(b.x0, text.x)); text.y = Math.min(b.y1, Math.max(b.y0, text.y)); };
const selectedText = () => state.text.find(text => text.id === textUi.selected) || null;
/** Waits for the fonts the layers use, so canvas text never falls back mid-render. */
const ensureTextFonts = texts => Promise.all((texts || []).map(text => document.fonts.load(textFont(text, 32)).catch(() => {})));

function addText() {
  const id = `t${Date.now().toString(36)}`;
  change(() => { state.text.push({ id, content: 'Your text', font: 'inter', size: .08, color: '#ffffff', x: .5, y: state.text.length ? .5 : .85, align: 'center', bold: true, italic: false, shadow: true, opacity: 1 }); });
  textUi.selected = id; syncText();
  const box = $('#textContent'); box.focus(); box.select();
}
function updateText(mutator, commitNow = true) {
  const text = selectedText(); if (!text) return;
  if (commitNow) change(() => mutator(selectedText()));
  else { mutator(text); syncText(); }
}
function buildText() {
  const fontPicker = $('#textFont');
  fontPicker.innerHTML = textFonts.map(([id, name]) => `<button type="button" role="radio" class="text-font-option" data-font="${id}" aria-checked="false">${name}</button>`).join('');
  fontPicker.querySelectorAll('[data-font]').forEach((button, index) => { button.style.setProperty('--preview-font', textFonts[index][2]); });
  $('#textColors').innerHTML = TEXT_COLORS.map(([hex, name]) => `<button type="button" role="radio" class="paper-swatch" data-color="${hex}" aria-checked="false" aria-label="${name}" title="${name}" style="--swatch:${hex}"></button>`).join('');
  $('#addText').addEventListener('click', addText);
  $('#deleteText').addEventListener('click', () => {
    const index = state.text.findIndex(text => text.id === textUi.selected); if (index < 0) return;
    change(() => { state.text.splice(index, 1); });
    textUi.selected = state.text[Math.min(index, state.text.length - 1)]?.id || null; syncText();
  });
  bindRadioGroup(elements.textLayers, '[data-layer]', chip => { textUi.selected = chip.dataset.layer; syncText(); });
  // Text, size, opacity and custom colour: one history entry per typing / drag session.
  bindHistorySlider(elements.textPanel, '[data-text]', input => updateText(text => {
    const key = input.dataset.text;
    text[key] = key === 'content' || key === 'color' ? input.value : key === 'size' ? Number(input.value) / 100 : Number(input.value) / 100;
  }, false));
  bindRadioGroup(fontPicker, '[data-font]', button => updateText(text => { text.font = button.dataset.font; }));
  bindRadioGroup($('#textColors'), '[data-color]', button => updateText(text => { text.color = button.dataset.color; }));
  bindRadioGroup($('#textAlign'), '[data-align]', button => updateText(text => { text.align = button.dataset.align; }));
  elements.textPanel.addEventListener('click', event => {
    const toggle = event.target.closest('[data-text-toggle]');
    if (toggle) updateText(text => { text[toggle.dataset.textToggle] = !text[toggle.dataset.textToggle]; });
  });

  // On the photo: click to select, drag to move, arrow keys to nudge (Text tab only).
  const overlay = elements.textCanvas;
  const toCanvas = event => {
    const rect = overlay.getBoundingClientRect(), scale = Math.min(rect.width / overlay.width, rect.height / overlay.height);
    const left = rect.left + (rect.width - overlay.width * scale) / 2, top = rect.top + (rect.height - overlay.height * scale) / 2; // object-fit: contain on phones
    return { x: (event.clientX - left) / scale, y: (event.clientY - top) / scale };
  };
  // Listens on the whole stage before anything else: on phones the hold button and status pills sit over the
  // photo, and text under them must still be draggable. Fingers get a larger hit area.
  elements.dropZone.addEventListener('pointerdown', event => {
    if (document.body.dataset.tab !== 'text' || !state.editedCanvas?.photoRect || event.button > 0 || event.target.closest('#fullscreenButton,#engineWaitRetry')) return;
    const bounds = overlay.getBoundingClientRect();
    if (!bounds.width || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    const point = toCanvas(event), px = Math.max(overlay.width / bounds.width, overlay.height / bounds.height); // canvas px per CSS px (contain)
    const pad = (event.pointerType === 'mouse' ? 8 : 22) * px;
    const distance = box => Math.hypot(Math.max(box.x - point.x, 0, point.x - box.x - box.w), Math.max(box.y - point.y, 0, point.y - box.y - box.h));
    const hit = [...textUi.boxes].reverse().find(box => distance(box) <= pad);
    if (!hit) return;
    event.preventDefault(); event.stopPropagation();
    textUi.selected = hit.id; overlay.focus({ preventScroll: true });
    const text = selectedText();
    textUi.drag = { id: event.pointerId, point, x: text.x, y: text.y, start: snapshot() };
    overlay.setPointerCapture(event.pointerId);
    syncText();
  }, { capture: true });
  overlay.addEventListener('pointermove', event => {
    const drag = textUi.drag; if (!drag || drag.id !== event.pointerId) return;
    const point = toCanvas(event), rect = state.editedCanvas.photoRect;
    const text = selectedText(); if (!text) return;
    text.x = drag.x + (point.x - drag.point.x) / rect.width;
    text.y = drag.y + (point.y - drag.point.y) / rect.height;
    clampText(text);
    drawTextOverlay();
  });
  const drop = event => { const drag = textUi.drag; if (!drag || drag.id !== event.pointerId) return; textUi.drag = null; commit(drag.start); syncText(); };
  overlay.addEventListener('pointerup', drop);
  overlay.addEventListener('pointercancel', drop);
  overlay.addEventListener('lostpointercapture', drop);
  overlay.addEventListener('keydown', event => {
    const step = event.shiftKey ? .05 : .01;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    const text = selectedText(); if (!move || !text || document.body.dataset.tab !== 'text') return;
    event.preventDefault();
    clearTimeout(textUi.timer); if (!textUi.start) textUi.start = snapshot();
    text.x += move[0]; text.y += move[1]; clampText(text);
    drawTextOverlay();
    textUi.timer = setTimeout(() => { const start = textUi.start; textUi.start = null; if (start) commit(start); }, 500);
  });
  document.fonts.ready.then(drawTextOverlay);
}
/** Draws the layers over the preview; in the Text tab the selected one gets a dashed box. */
function drawTextOverlay() {
  const overlay = elements.textCanvas, source = state.editedCanvas;
  if (overlay.width !== elements.canvas.width || overlay.height !== elements.canvas.height) { overlay.width = elements.canvas.width; overlay.height = elements.canvas.height; }
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  textUi.boxes = [];
  drawFocusGuide(ctx, overlay, source);
  if (!source?.photoRect || state.holding || !state.text.length) return;
  const scale = overlay.width / source.width, rect = source.photoRect;
  const scaled = { x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale };
  textUi.boxes = drawTexts(ctx, scaled, state.text);
  const box = textUi.boxes.find(item => item.id === textUi.selected);
  if (box && document.body.dataset.tab === 'text') {
    const px = overlay.width / Math.max(1, overlay.getBoundingClientRect().width);
    ctx.save(); ctx.lineWidth = 1.5 * px; ctx.setLineDash([5 * px, 4 * px]);
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 3 * px;
    const pad = 6 * px; ctx.strokeRect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2);
    ctx.restore();
  }
}
function syncText() {
  if (!state.text.some(text => text.id === textUi.selected)) textUi.selected = state.text[state.text.length - 1]?.id || null;
  syncApplyButtons();
  const text = selectedText();
  const refocus = elements.textLayers.contains(document.activeElement);
  elements.textLayers.innerHTML = state.text.map((layer, index) => `<button type="button" role="radio" class="chip" data-layer="${layer.id}" aria-checked="${layer.id === textUi.selected}" tabindex="${layer.id === textUi.selected ? 0 : -1}"></button>`).join('');
  elements.textLayers.querySelectorAll('[data-layer]').forEach((chip, index) => { chip.textContent = (state.text[index].content.split('\n')[0].trim() || `Text ${index + 1}`).slice(0, 24); });
  if (refocus) elements.textLayers.querySelector('[aria-checked="true"]')?.focus();
  elements.textLayers.hidden = state.text.length < 2;
  $('#textEmpty').hidden = Boolean(state.text.length);
  $('#textEditor').hidden = !text;
  if (text) {
    const content = $('#textContent');
    if (document.activeElement !== content) content.value = text.content;
    syncRadios($('#textFont'), 'data-font', text.font);
    const size = $('#textSize'); if (document.activeElement !== size) size.value = text.size * 100;
    $('#textSizeOutput').value = `${Number((text.size * 100).toFixed(1))}%`;
    const opacity = $('#textOpacity'); if (document.activeElement !== opacity) opacity.value = Math.round(text.opacity * 100);
    $('#textOpacityOutput').value = `${Math.round(text.opacity * 100)}%`;
    const color = $('#textColor'); if (document.activeElement !== color) color.value = text.color;
    const customColor = color.closest('.text-custom-color'), isPresetColor = TEXT_COLORS.some(([hex]) => hex === text.color.toLowerCase());
    customColor.style.setProperty('--custom-color', text.color);
    customColor.classList.toggle('is-selected', !isPresetColor);
    syncRadios($('#textColors'), 'data-color', text.color);
    syncRadios($('#textAlign'), 'data-align', text.align);
    elements.textPanel.querySelectorAll('[data-text-toggle]').forEach(button => {
      button.setAttribute('aria-pressed', Boolean(text[button.dataset.textToggle]));
      button.disabled = text.font === 'playfair' && button.dataset.textToggle !== 'shadow'; // bundled as 600 italic only
    });
  }
  elements.textCanvas.tabIndex = document.body.dataset.tab === 'text' && text ? 0 : -1;
  drawTextOverlay();
}

// ---------- Advanced engines: load on selection ----------
// activeEngine is the loaded module of engine.id; it only counts while it is state.engine.
const engine = { id: null, module: null, builtFor: null, status: 'idle', error: null, load: null, unsubscribe: null, download: null };
const activeModule = () => (engine.module && engine.id === state.engine ? engine.module : null);
/** The selected engine's settings (created from its defaults on first use); null until it is loaded. */
function advParams() {
  const module = activeModule(); if (!module) return null;
  return (state.engineParams[state.engine] ||= module.defaultParams());
}
const advancedRoots = { pipeline: elements.advPipeline, container: elements.advSections };

/** Loads state.engine (or `id`) if it isn't the active one; stops the previous engine's worker. */
function activateEngine(id = state.engine) {
  if (engine.module && engine.id === id) return Promise.resolve(engine.module);
  if (engine.load?.id === id) return engine.load.promise;
  if (engine.module) {
    // Another engine was chosen: stop the old one (its worker can hold hundreds of MB).
    if (state.renderAbort) cancelFullRender();
    engine.unsubscribe?.(); engine.module.dispose?.();
    engine.module = null; engine.id = null; engine.unsubscribe = null;
  }
  if (engine.builtFor !== id) { buildAdvanced(advancedRoots, null); engine.builtFor = null; }
  setEngineStatus('loading');
  const promise = loadEngine(id).then(module => {
    if (state.engine !== id) return module; // a different engine was chosen meanwhile
    engine.module = module; engine.id = id;
    engine.unsubscribe = module.onDownload?.(showEngineDownload) || null;
    state.engineParams[id] = module.normalizeParams(state.engineParams[id]);
    buildEnginePanel();
    warmEngine();
    syncControls();
    scheduleRender();
    return module;
  }, error => {
    if (state.engine === id) setEngineStatus('failed', error);
    throw error;
  }).finally(() => { if (engine.load?.promise === promise) engine.load = null; });
  engine.load = { id, promise };
  return promise;
}
/** Starts the download + compile of the active engine so the first render doesn't wait for it. */
function warmEngine() {
  const module = activeModule(); if (!module?.warm) { setEngineStatus('ready'); return; }
  setEngineStatus('preparing');
  module.warm(cloneParams(advParams())).then(
    () => { if (activeModule() === module) { setEngineStatus('ready'); if (state.renderQuality === 'preview') syncRenderStatus(); } syncDownloadBadges(); },
    error => {
      if (activeModule() !== module) return;
      if (error?.name === 'AbortError') setEngineStatus('idle'); // a cancelled render restarted the worker
      else { console.error(error); setEngineStatus('failed', error); }
    });
}
function buildEnginePanel() {
  const module = activeModule(); if (!module) return;
  buildAdvanced(advancedRoots, module);
  engine.builtFor = state.engine;
  state.advOpen = new Set(module.sections.filter(section => section.openByDefault).map(section => section.id));
  state.advStep = module.firstStep || module.sections[0].id;
  elements.advCredit.innerHTML = creditHtml(engineById(state.engine));
  elements.advNote.textContent = module.spatialNote || '';
}

const MB = bytes => (bytes / 1048576).toFixed(1);
function setEngineStatus(status, error = null) {
  engine.status = status; engine.error = error;
  if (status !== 'preparing') engine.download = null;
  syncEngineBar();
}
function showEngineDownload({ loaded, total, done }) {
  if (engine.status === 'ready' || engine.status === 'failed') return;
  if (engine.status !== 'preparing') { engine.status = 'preparing'; syncEngineBar(); }
  engine.download = done ? null : { percent: total ? Math.min(100, Math.round(loaded / total * 100)) : null, mb: MB(loaded) };
  syncEngineWait();
}
// While the chosen film engine loads, downloads or failed, its renders can't run yet: the photo
// is dimmed with a status pill, and Adjust / Frames say that changes apply once it is ready.
function syncEngineWait() {
  const entry = isFilm() ? engineById(state.engine) : null;
  const waiting = Boolean(entry) && (!activeModule() || ['loading', 'preparing', 'failed'].includes(engine.status));
  const failed = waiting && engine.status === 'failed';
  document.body.classList.toggle('engine-waiting', waiting);
  elements.engineWait.hidden = !waiting;
  elements.engineWait.dataset.state = failed ? 'failed' : 'working';
  elements.engineWaitRetry.hidden = !failed;
  if (!waiting) { document.querySelectorAll('[data-engine-wait]').forEach(note => { note.hidden = true; }); return; }
  const download = engine.status === 'preparing' ? engine.download : null;
  // One message while it loads ("Developing…", like a render); the Developing pill itself stays hidden meanwhile (CSS).
  const title = failed ? `${entry.label} couldn't load` : 'Developing…';
  const sub = failed ? 'Your changes are saved. Check your connection and retry.' : '';
  if (elements.engineWaitTitle.textContent !== title) elements.engineWaitTitle.textContent = title;
  if (elements.engineWaitSub.textContent !== sub) elements.engineWaitSub.textContent = sub;
  elements.engineWaitSub.hidden = !sub;
  elements.engineWaitProgress.textContent = !download ? '' : download.percent == null ? ` ${download.mb} MB` : ` ${download.percent}%`;
  const note = failed ? `${entry.label} couldn't load. Your changes are saved; retry from the photo.` : `${entry.label} isn't ready yet. Changes are saved and will apply when it finishes loading.`;
  document.querySelectorAll('[data-engine-wait]').forEach(element => { element.hidden = false; element.textContent = note; });
}
// The engine name says only "Loading…" while the engine loads or downloads; a failure shows a line with Retry.
function syncEngineBar() {
  syncEngineWait();
  $('#engineButtonName').textContent = engineById(state.engine)?.label || 'Basic';
  elements.engineAboutButton.hidden = !isFilm();
  if (isFilm()) elements.engineAboutButton.setAttribute('aria-label', `About ${engineById(state.engine).label} and its licence`);
  const status = isFilm() ? engine.status : 'idle';
  const statusText = { loading: 'Loading…', preparing: 'Loading…', failed: 'Couldn’t load' }[status] || '', statusLine = $('#engineButtonStatus');
  statusLine.textContent = statusText; statusLine.hidden = !statusText; statusLine.dataset.tone = status === 'failed' ? 'error' : '';
  elements.engineStatus.dataset.state = status;
  elements.engineStatusText.textContent = status === 'failed' ? `${engineById(state.engine).label} couldn’t load. Check your connection and try again.` : '';
  elements.engineRetry.hidden = status !== 'failed';
}
async function openEngineAbout() {
  const entry = engineById(state.engine);
  elements.engineAboutBody.innerHTML = `<p class="eyebrow">About this engine</p><h2 id="engineAboutTitle">${entry.label}</h2><p>Loading credits…</p>`;
  elements.engineAboutDialog.showModal();
  try {
    elements.engineAboutBody.innerHTML = engineAboutHtml(entry, await loadCredits(entry.id));
    const saved = (await savedEngineList()).find(item => item.engineId === entry.id);
    if (saved) {
      const line = document.createElement('p');
      line.className = 'engine-storage';
      line.textContent = `Saved on this device: ${MB(saved.bytes)} MB, so it opens without downloading again. Remove it from About PhotoKamo.`;
      elements.engineAboutBody.append(line);
    }
  } catch { elements.engineAboutBody.querySelector('p:last-child').textContent = 'The credits could not be loaded. Check your connection and try again.'; }
}

// ---------- Engines saved on this device (Cache Storage; js/engines/engine-files.js, loaded on demand) ----------
const savedEngineList = () => import('./engines/engine-files.js').then(module => module.savedEngines()).catch(() => []);
async function syncEngineStorage() {
  const saved = (await savedEngineList()).filter(item => item.bytes > 0);
  const box = $('#engineStorage');
  box.hidden = !saved.length;
  if (!saved.length) return;
  const total = saved.reduce((sum, item) => sum + item.bytes, 0);
  $('#engineStorageText').textContent = `Film engines saved on this device: ${MB(total)} MB (${saved.map(item => engineById(item.engineId)?.label || item.engineId).join(', ')}).`;
}
async function removeSavedEngines() {
  try { await (await import('./engines/engine-files.js')).removeSavedEngines(); toast('Saved film engines removed. They download again when you use them.'); }
  catch { toast('The saved film engines could not be removed.'); }
  syncEngineStorage(); syncDownloadBadges();
}

// ---------- Advanced panel ----------
function syncAdvancedPanel() {
  syncEngineBar();
  const module = activeModule();
  if (module && engine.builtFor === state.engine) {
    if (module.sectionVisible && !module.sectionVisible(state.advStep, advParams())) state.advStep = module.sections.find(section => module.sectionVisible(section.id, advParams()))?.id;
    syncAdvanced(advancedRoots, module, advParams(), { open: state.advOpen, current: state.advStep, mobile: mobileQuery.matches, sheet: sheetQuery.matches });
  }
  document.querySelector('.advanced-panel').classList.toggle('is-loading', !module);
  syncAdvancedNote();
  syncDial();
}
function syncAdvancedNote() {
  const module = activeModule();
  elements.advNote.hidden = !(module && state.renderQuality !== 'full' && module.hasSpatialEffects(advParams()));
  // Phone sheet: one line under the current stage, naming its switched-on effects that only the full render shows.
  const section = module?.sections.find(item => item.id === state.advStep);
  const effects = section && state.renderQuality === 'preview' ? activeHqEffects(section, advParams(), module) : [];
  elements.stageHint.hidden = !effects.length;
  if (effects.length) {
    const names = effects.map((label, index) => (index && !/^[A-Z]{2}/.test(label) ? label[0].toLowerCase() + label.slice(1) : label));
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
    elements.stageHintText.textContent = `${list} ${names.length > 1 ? 'appear' : 'appears'} after Render HQ.`;
  }
}
function setAdvancedValue(path, raw) {
  const module = activeModule(); const params = advParams(); if (!module) return;
  const control = module.controlByPath[path];
  let value = raw;
  if (control.kind === 'vec2') { value = [...params[path]]; value[control.index] = Number(raw); }
  else if (control.kind === 'float') value = Number(raw);
  module.ui?.beforeChange?.(params, path, value);
  params[path] = value;
}
function resetAdvanced(path) {
  const module = activeModule(); if (!module) return;
  // An engine may define per-setting defaults that depend on other settings (Kamo: the film stock).
  const fallback = module.defaultFor ? module.defaultFor(advParams(), path) : module.controlByPath[path].default;
  change(() => { advParams()[path] = Array.isArray(fallback) ? [...fallback] : fallback; });
}
function buildAdvancedPanel() {
  const retryEngine = () => { if (activeModule()) warmEngine(); else activateEngine().catch(() => {}); };
  elements.engineRetry.addEventListener('click', retryEngine);
  elements.engineWaitRetry.addEventListener('click', retryEngine);
  elements.engineAboutButton.addEventListener('click', openEngineAbout);
  $('#engineAboutClose').addEventListener('click', () => elements.engineAboutDialog.close());
  elements.engineAboutDialog.addEventListener('click', event => { if (event.target === elements.engineAboutDialog) elements.engineAboutDialog.close(); });
  const licences = $('#licenceList');
  for (const entry of engines) {
    const item = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.href = new URL('LICENSE', entry.folder).href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
    anchor.innerHTML = `${entry.licence}<span class="visually-hidden"> (opens in a new tab)</span>`;
    item.append(`${entry.label} film engine · `, anchor);
    licences.append(item);
  }
  const container = elements.advSections;
  container.addEventListener('click', event => {
    const head = event.target.closest('[data-toggle]');
    if (head) { const id = head.dataset.toggle; if (state.advOpen.has(id)) state.advOpen.delete(id); else state.advOpen.add(id); syncAdvancedPanel(); return; }
    const toggle = event.target.closest('[role=switch][data-path]');
    if (toggle && !toggle.disabled) { change(() => { setAdvancedValue(toggle.dataset.path, !advParams()[toggle.dataset.path]); }); return; }
    const reset = event.target.closest('[data-reset]');
    if (reset) resetAdvanced(reset.dataset.reset);
  });
  container.addEventListener('change', event => {
    const select = event.target.closest('select[data-path]'); if (!select) return;
    change(() => { setAdvancedValue(select.dataset.path, select.value); });
  });
  bindHistorySlider(container, 'input[type=range][data-path]', input => { setAdvancedValue(input.dataset.path, input.value); syncAdvancedPanel(); syncLooks(); scheduleRender(); });
  container.addEventListener('dblclick', event => { const input = event.target.closest('input[type=range][data-path]'); if (input) resetAdvanced(input.dataset.path); });
  elements.advPipeline.addEventListener('click', event => {
    const step = event.target.closest('[data-step]'); if (!step) return;
    state.advStep = step.dataset.step;
    if (!mobileQuery.matches) state.advOpen = new Set([step.dataset.step]);
    syncAdvancedPanel();
    if (!mobileQuery.matches) container.querySelector(`[data-section="${step.dataset.step}"]`).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  $('#advResetAll').addEventListener('click', () => { const module = activeModule(); if (module) change(() => { state.engineParams[state.engine] = module.defaultParams(); state.myLookId = null; }); });
  $('#saveMyLook').addEventListener('click', saveAsMyLook);
  $('#backToLook').addEventListener('click', backToLook);
  $('#advBackToLook').addEventListener('click', backToLook);
  $('#deleteMyLook').addEventListener('click', () => { if (state.myLookId) deleteMyLook(state.myLookId); });
}

// ---------- Film settings (gear): the engine controls for the current film look ----------
// The gear never moves: inactive for Basic looks, active for film looks. Opening it is a view, not part of the photo
// (no undo step, no re-render) and isn't remembered, so a reload or a Basic look always comes back to the Looks grid.
let filmExpert = false;
function syncFilmPanel() {
  const film = isFilm(); if (!film) filmExpert = false;
  const open = film && filmExpert;
  document.body.classList.toggle('film-expert', open);
  elements.presetsView.hidden = open; elements.advancedPanel.hidden = !open;
  elements.filmSettings.forEach(button => {
    button.setAttribute('aria-disabled', !film); button.setAttribute('aria-expanded', open);
    button.setAttribute('aria-label', film ? 'Film settings' : 'Film settings (choose a film look first)');
    button.title = !film ? 'Film settings: choose a film look first' : open ? 'Back to looks' : 'Film settings';
  });
}
const shown = element => element.offsetParent !== null;
let expertStart = null; // { photo, settings } when the settings opened, for Cancel
function setFilmExpert(open) {
  if (open && !filmExpert) expertStart = { photo: app.activeId, settings: snapshot() };
  filmExpert = open; syncFilmPanel();
  if (open) syncAdvancedPanel(); // the panel may have been built while hidden
  // Phone sheet: the gear steps aside while open, so focus goes to Done (and returns to the gear).
  const target = open ? elements.expertDone : elements.filmSettings.find(shown);
  if (document.activeElement && !shown(document.activeElement) && target && shown(target)) target.focus();
}
/** Cancel: the photo goes back to how it was when the settings opened (one undo step), then the Looks grid. */
function cancelFilmExpert() {
  const start = expertStart;
  if (start && start.photo === app.activeId && !sameSnapshot(start.settings, snapshot())) change(() => applySettings(start.settings));
  setFilmExpert(false);
}
elements.filmSettings.forEach(button => button.addEventListener('click', () => { if (isFilm()) setFilmExpert(!filmExpert); }));
elements.expertDone.addEventListener('click', () => setFilmExpert(false));
$('#expertCancel').addEventListener('click', cancelFilmExpert);

// ---------- Engine view: Presets or a film engine, inside the Looks tab ----------
function syncEngineView() {
  const film = isFilm();
  // A film engine is loaded as soon as it is chosen (download + compile start before any render).
  if (film) activateEngine().catch(error => console.error(error));
  const module = activeModule();
  document.body.classList.toggle('is-film', film);
  syncFilmPanel();
  applyZoom(); // the zoom stays when the look or engine changes
  syncRenderStatus();
}

function syncControls() {
  syncEngineView();
  syncAdvancedPanel();
  syncAdjustments();
  syncLens();
  syncFrames();
  syncCrop();
  syncText();
  syncLooks();
  syncDeleteMyLook();
}

// ---------- Rendering ----------
function renderEdge() {
  if (state.zoom === 'fit' || !state.image) return PREVIEW_EDGE;
  const { width, height } = croppedSize();
  return Math.min(ZOOM_MAX_EDGE, Math.max(width, height));
}
function scheduleRender() {
  if (!state.image) return;
  if (isFilm()) { scheduleAdvancedRender(); return; }
  if (state.renderAbort) cancelFullRender();
  clearTimeout(advancedTimer);
  const token = ++state.renderToken;
  requestAnimationFrame(() => { if (token !== state.renderToken) return; renderPreview(token); });
}
function renderPreview(token) {
  showDeveloping(false); elements.processing.hidden = false;
  setTimeout(async () => {
    if (token !== state.renderToken || !state.image) { elements.processing.hidden = true; return; }
    try {
      const edge = renderEdge();
      const frame = renderFrame();
      const lensed = await opticsSource(edge);
      if (token !== state.renderToken || !state.image) return; // a newer render replaced this one
      const source = croppedSource(edge);
      state.editedCanvas = renderImage(lensed, effectiveAdjustments(), frame, edge);
      const originalKey = JSON.stringify([frame, edge, cropKey()]);
      if (state.originalKey !== originalKey) { state.originalCanvas = renderImage(source, defaultAdjustments, frame, edge); state.originalKey = originalKey; }
      elements.canvas.width = state.editedCanvas.width; elements.canvas.height = state.editedCanvas.height;
      applyZoom();
      drawPreview(); scheduleActiveThumb();
    } catch (error) {
      console.error(error);
      toast('This photo could not be rendered.');
    } finally {
      elements.processing.hidden = true;
      renderQueue.pump();
    }
  }, 0);
}
function drawPreview() {
  const source = state.holding ? state.originalCanvas : state.editedCanvas;
  if (!source) return;
  const ctx = elements.canvas.getContext('2d');
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  ctx.drawImage(source, 0, 0, elements.canvas.width, elements.canvas.height);
  // Split view (desktop): the original left of the divider, the edit right of it.
  if (!state.holding && state.split !== null && state.originalCanvas) {
    const { width, height } = elements.canvas;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, Math.round(width * state.split), height); ctx.clip();
    ctx.drawImage(state.originalCanvas, 0, 0, width, height); ctx.restore();
  }
  drawTextOverlay();
}

// ---------- Film engine rendering (the active engine's render(), in its own Web Worker) ----------
// Then Adjust edits on top: on the main thread for the preview (like Presets), in
// js/adjust-worker.js for full-size renders.
let advancedTimer;
let advancedBusy = false;
let advancedDirty = false;
// Last engine preview, so Adjust and Frames changes don't run the engine again.
let enginePreview = { key: '', bitmap: null };
const enginePreviewKey = () => JSON.stringify([state.imageId, state.crop, opticsRenderKey(state.optics), state.engine, advParams()]);
const engineEdits = () => (editCount() ? effectiveAdjustments() : null);
let adjustWorker = null, adjustJobId = 0;
const adjustJobs = new Map();
/** Applies `adjustments` to a full-size bitmap off the main thread (the bitmap is transferred). */
function adjustFull(bitmap, adjustments) {
  if (!adjustments) return Promise.resolve(bitmap);
  if (!adjustWorker) {
    adjustWorker = new Worker(new URL('./adjust-worker.js', import.meta.url), { type: 'module' });
    adjustWorker.onmessage = ({ data }) => {
      const job = adjustJobs.get(data.id); adjustJobs.delete(data.id);
      if (data.error) job?.reject(new Error(data.error)); else job?.resolve(data.bitmap);
    };
    adjustWorker.onerror = event => {
      for (const job of adjustJobs.values()) job.reject(new Error(event.message || 'Adjust worker failed'));
      adjustJobs.clear(); adjustWorker.terminate(); adjustWorker = null;
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++adjustJobId; adjustJobs.set(id, { resolve, reject });
    adjustWorker.postMessage({ id, bitmap, adjustments }, [bitmap]);
  });
}
// The engine's input: the cropped photo at full size with the Lens optics, re-made when the crop or optics change.
const bitmapKey = () => JSON.stringify([cropKey(), opticsRenderKey(state.optics)]);
/** Input for an engine *preview*: with Lens optics on, they run at preview size (fast, like Basic) and the result
 *  is scaled back up to the full size, which the engine expects for its physical scale (grain, MTF). The
 *  engine's preview is small, so it looks the same; Render full quality and export use ensureBitmap(). */
async function ensurePreviewBitmap() {
  if (opticsNeutral(state.optics)) return ensureBitmap();
  const key = bitmapKey();
  if (state.previewBitmap && state.previewBitmapKey === key) return state.previewBitmap;
  const edge = Math.max(PREVIEW_EDGE, activeModule()?.engineInfo.previewEdge ?? 0), { width, height } = croppedSize();
  const lensed = await opticsSource(edge);
  const bitmap = await createImageBitmap(lensed, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
  if (bitmapKey() !== key) { bitmap.close(); return ensurePreviewBitmap(); }
  state.previewBitmap?.close?.(); state.previewBitmap = bitmap; state.previewBitmapKey = key;
  return bitmap;
}
async function ensureBitmap() {
  const key = bitmapKey();
  if (state.imageBitmap && state.bitmapKey === key) return state.imageBitmap;
  const lensed = await opticsSource();
  const bitmap = lensed instanceof ImageBitmap ? lensed : await createImageBitmap(lensed);
  if (bitmapKey() !== key) { bitmap.close(); return ensureBitmap(); } // the crop or optics changed meanwhile
  state.imageBitmap?.close?.(); state.imageBitmap = bitmap; state.bitmapKey = key;
  return state.imageBitmap;
}
function scheduleAdvancedRender(delay = ADVANCED_DEBOUNCE) {
  state.renderToken++; // drop any pending Simple render
  if (state.renderAbort) cancelFullRender();
  if (state.renderQuality === 'full') { state.renderQuality = 'preview'; syncRenderStatus(); }
  clearTimeout(advancedTimer);
  advancedTimer = setTimeout(runAdvancedPreview, delay);
}
async function runAdvancedPreview() {
  const module = activeModule();
  if (!module) return; // the engine is still loading; activateEngine renders once it's ready
  if (advancedBusy) { advancedDirty = true; return; }
  advancedBusy = true; advancedDirty = false;
  const imageId = state.imageId; const engineId = state.engine; const key = enginePreviewKey();
  try {
    let bitmap = enginePreview.key === key ? enginePreview.bitmap : null;
    if (!bitmap) {
      showDeveloping(true);
      bitmap = await module.render(await ensurePreviewBitmap(), cloneParams(advParams()), { quality: 'preview', onStatus: showPreviewStatus });
      enginePreview = { key, bitmap };
    }
    if (engine.status === 'idle' || engine.status === 'preparing') setEngineStatus('ready');
    if (imageId === state.imageId && engineId === state.engine && state.renderQuality === 'preview') {
      const edits = engineEdits();
      presentAdvanced(edits ? applyAdjustments(bitmap, edits) : bitmap, renderFrame());
      syncRenderStatus();
    }
  } catch (error) {
    if (error?.name !== 'AbortError') { console.error(error); toast('The film preview could not be rendered. Check your connection and try again.'); }
  } finally {
    advancedBusy = false;
    if (state.renderQuality === 'preview') syncRenderStatus();
    if (advancedDirty && isFilm() && state.image) runAdvancedPreview(); // the pill stays up for the next render
    else { showDeveloping(false); renderQueue.pump(); } // photos not in view render once the one in view is done
  }
}
// "Developing…" over the photo while a film preview renders, only if it takes a moment (no flicker on fast renders).
let developingTimer;
function showDeveloping(on) {
  clearTimeout(developingTimer);
  if (on) { developingTimer = setTimeout(() => { elements.processing.classList.add('is-soft'); elements.processing.hidden = false; }, 250); return; }
  elements.processing.hidden = true; elements.processing.classList.remove('is-soft');
}
function showPreviewStatus(text) {
  if (!text || state.renderQuality !== 'preview') return;
  elements.renderText.textContent = text; elements.renderDetail.textContent = '';
  $('#renderStatus').dataset.state = 'working';
}
function presentAdvanced(bitmap, frame) {
  state.editedCanvas = frameCanvas(bitmap, frame);
  const edge = activeModule()?.engineInfo.previewEdge ?? PREVIEW_EDGE;
  const originalKey = JSON.stringify([frame, edge, cropKey()]);
  if (state.originalKey !== originalKey) { state.originalCanvas = renderImage(croppedSource(edge), defaultAdjustments, frame, edge); state.originalKey = originalKey; }
  elements.canvas.width = state.editedCanvas.width; elements.canvas.height = state.editedCanvas.height;
  applyZoom();
  drawPreview(); scheduleActiveThumb();
}
function setRenderProgress(value) {
  const percent = Math.round(value * 100);
  elements.renderProgressBar.style.width = `${percent}%`;
  if (state.renderQuality === 'rendering') {
    elements.renderText.textContent = `Developing full-quality scan… ${percent}%`;
    elements.sheetRender.style.setProperty('--progress', percent);
    elements.sheetRender.setAttribute('aria-label', `Rendering full quality, ${percent}%. Cancel`);
  }
}
// The full render holds the engine output with Adjust edits applied.
const fullRenderKey = () => JSON.stringify([state.imageId, state.crop, opticsRenderKey(state.optics), state.engine, advParams(), state.edits]);
async function renderFullQuality() {
  const module = activeModule();
  if (!isFilm() || !state.image || !module) return;
  clearTimeout(advancedTimer);
  const controller = new AbortController();
  state.renderAbort = controller; state.renderQuality = 'rendering';
  syncRenderStatus(); setRenderProgress(0);
  const frame = renderFrame(); const key = fullRenderKey(); const edits = engineEdits();
  try {
    const raw = await module.render(await ensureBitmap(), cloneParams(advParams()), { quality: 'full', signal: controller.signal, onProgress: setRenderProgress, onStatus: text => { if (text && state.renderQuality === 'rendering') elements.renderText.textContent = text; } });
    if (state.renderAbort !== controller) return;
    const bitmap = await adjustFull(raw, edits);
    if (state.renderAbort !== controller) return;
    state.renderAbort = null; state.renderQuality = 'full';
    state.fullRender = { key, bitmap };
    presentAdvanced(bitmap, frame); syncRenderStatus();
  } catch (error) {
    if (state.renderAbort === controller) { state.renderAbort = null; state.renderQuality = 'preview'; syncRenderStatus(); }
    if (error?.name !== 'AbortError') { console.error(error); toast('The full-quality render failed.'); }
  }
}
function cancelFullRender() {
  const controller = state.renderAbort;
  state.renderAbort = null; state.renderQuality = 'preview';
  controller?.abort();
  syncRenderStatus();
}
function syncRenderStatus() {
  const rendering = state.renderQuality === 'rendering';
  const full = state.renderQuality === 'full';
  $('#renderStatus').dataset.state = state.renderQuality;
  elements.renderFull.hidden = rendering || full;
  elements.renderCancel.hidden = !rendering;
  elements.renderProgress.hidden = !rendering;
  syncAdvancedNote();
  const info = activeModule()?.engineInfo;
  syncSheetRender(info);
  if (rendering) return;
  elements.renderFull.disabled = !info;
  if (!info) { elements.renderText.textContent = 'Loading the film engine…'; elements.renderDetail.textContent = ''; return; }
  elements.renderText.textContent = full ? 'Full quality' : info.previewLabel;
  elements.renderDetail.textContent = full ? ` · ${elements.canvas.width} px` : ` · ${info.previewDetail}`;
  elements.renderText.parentElement.title = elements.renderText.textContent + elements.renderDetail.textContent; // the detail may be cut short
}
// Phone sheet RenderButton: idle (fast preview showing) → rendering (tap cancels) → done. Any edit returns to idle
// through scheduleAdvancedRender. "Full quality ready" is announced once, when a render finishes.
let sheetRenderState = 'idle';
function syncSheetRender(info) {
  const next = { preview: 'idle', rendering: 'rendering', full: 'done' }[state.renderQuality];
  const button = elements.sheetRender;
  button.dataset.state = next;
  elements.sheetRenderLabel.textContent = { idle: 'Render HQ', rendering: 'Rendering…', done: 'Full quality' }[next];
  if (next !== 'rendering') button.style.removeProperty('--progress');
  button.setAttribute('aria-label', { idle: 'Render full quality', rendering: 'Rendering full quality. Cancel', done: 'Full quality shown' }[next]);
  button.setAttribute('aria-disabled', next === 'done' || (next === 'idle' && !info));
  if (sheetQuery.matches && isFilm() && next !== sheetRenderState) elements.sheetRenderLive.textContent = next === 'done' ? 'Full quality ready' : '';
  sheetRenderState = next;
}
// Zoom: 'fit' or a percentage of the full-size photo ('100' = one full-size pixel per CSS pixel, long side capped
// at ZOOM_MAX_EDGE). Basic looks render at full size when zoomed (renderEdge); film previews are smaller and are
// scaled up until Render full quality replaces them. The view keeps the same spot centred.
const ZOOM_STEPS = [10, 25, 33, 50, 67, 100, 150, 200, 300, 400];
/** Full-size pixels per rendered pixel of the preview on screen (1 for a full-size render). */
function renderScale() {
  const rect = state.editedCanvas?.photoRect; if (!rect) return 1;
  const { width, height } = croppedSize();
  return Math.min(ZOOM_MAX_EDGE, Math.max(width, height)) / Math.max(1, rect.width, rect.height);
}
/** The size Fit shows, as a zoom percentage of the full-size photo. */
function fitPercent() {
  if (!state.image) return 100;
  const shown = elements.canvas.getBoundingClientRect().width / Math.max(1, elements.canvas.width); // CSS px per rendered px
  return shown / renderScale() * 100;
}
let lastFitPercent = 100;
function applyZoom() {
  const actual = state.zoom !== 'fit', view = elements.viewport;
  const center = view.classList.contains('is-actual') && view.scrollWidth
    ? [(view.scrollLeft + view.clientWidth / 2) / view.scrollWidth, (view.scrollTop + view.clientHeight / 2) / view.scrollHeight] : [.5, .5];
  view.classList.toggle('is-actual', actual);
  elements.canvas.style.width = actual ? `${Math.round(elements.canvas.width * renderScale() * Number(state.zoom) / 100)}px` : '';
  if (actual) { view.scrollLeft = center[0] * view.scrollWidth - view.clientWidth / 2; view.scrollTop = center[1] * view.scrollHeight - view.clientHeight / 2; }
  else if (state.image && elements.canvas.width) lastFitPercent = fitPercent();
  document.querySelectorAll('[data-zoom]').forEach(button => button.setAttribute('aria-pressed', button.dataset.zoom === state.zoom));
  const percent = actual ? Number(state.zoom) : Math.round(lastFitPercent);
  $('#zoomValue').textContent = `${percent}%`;
  $('#zoomOut').disabled = !actual;
  $('#zoomIn').disabled = actual && Number(state.zoom) >= ZOOM_STEPS.at(-1);
}
/** One step in or out; out of the smallest step that's still bigger than Fit returns to Fit. */
function stepZoom(direction) {
  const fit = lastFitPercent, current = state.zoom === 'fit' ? fit : Number(state.zoom);
  if (direction > 0) { const next = ZOOM_STEPS.find(step => step > current + .5); if (next) setZoom(String(next)); return; }
  const next = [...ZOOM_STEPS].reverse().find(step => step < current - .5);
  setZoom(next && next > fit + .5 ? String(next) : 'fit');
}
// Zoomed in: drag the photo to look around (mouse or pen; fingers already scroll it). Dragging text in the Text tab wins.
let pan = null;
elements.viewport.addEventListener('pointerdown', event => {
  if (state.zoom === 'fit' || event.pointerType === 'touch' || event.button !== 0 || event.defaultPrevented) return;
  event.preventDefault(); // no text selection while dragging
  const view = elements.viewport;
  pan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: view.scrollLeft, top: view.scrollTop };
  view.setPointerCapture(event.pointerId); view.classList.add('is-panning');
});
elements.viewport.addEventListener('pointermove', event => {
  if (!pan || pan.id !== event.pointerId) return;
  elements.viewport.scrollLeft = pan.left - (event.clientX - pan.x);
  elements.viewport.scrollTop = pan.top - (event.clientY - pan.y);
});
const endPan = event => { if (pan?.id === event.pointerId) { pan = null; elements.viewport.classList.remove('is-panning'); } };
elements.viewport.addEventListener('pointerup', endPan);
elements.viewport.addEventListener('pointercancel', endPan);
function setZoom(zoom) {
  if (zoom === state.zoom) return;
  state.zoom = zoom; applyZoom(); scheduleRender();
}

// ---------- Hold to compare ----------
function setHolding(holding) {
  if (!state.image || state.holding === holding) return;
  state.holding = holding;
  elements.originalBadge.hidden = !holding;
  elements.holdButton.classList.toggle('is-holding', holding);
  drawPreview(); drawFullscreen();
}
// Press and hold anywhere on the photo: a short delay so taps don't flash the original. Zoomed in, moving
// first pans instead; a second finger (pinch) cancels. Dragging text in the Text tab wins (it stops the event).
const HOLD_DELAY = 120;
let photoHold = null;
function endPhotoHold() { if (!photoHold) return; clearTimeout(photoHold.timer); photoHold = null; setHolding(false); }
elements.canvasWrap.addEventListener('pointerdown', event => {
  if (!state.image || event.button !== 0) return;
  if (photoHold) { endPhotoHold(); return; }
  if (state.split !== null) { startSplitDrag(event); return; }
  photoHold = { id: event.pointerId, x: event.clientX, y: event.clientY, timer: setTimeout(() => setHolding(true), HOLD_DELAY) };
});
window.addEventListener('pointermove', event => {
  if (photoHold?.id === event.pointerId && state.zoom !== 'fit' && !state.holding
    && Math.hypot(event.clientX - photoHold.x, event.clientY - photoHold.y) > 6) endPhotoHold();
});
['pointerup', 'pointercancel'].forEach(type => window.addEventListener(type, event => { if (photoHold?.id === event.pointerId) endPhotoHold(); }));
elements.canvasWrap.addEventListener('contextmenu', event => { if (photoHold || state.holding) event.preventDefault(); }); // long-press on phones

// ---------- Slide to compare (desktop): a divider over the photo, original on the left ----------
const splitUi = { box: $('#compareSplit'), handle: $('#compareHandle'), button: $('#splitButton'), drag: null };
function setSplit(split) {
  state.split = split === null ? null : Math.min(1, Math.max(0, split));
  const on = state.split !== null, percent = on ? Math.round(state.split * 100) : 50;
  splitUi.box.hidden = !on; splitUi.button.setAttribute('aria-pressed', on);
  splitUi.box.style.setProperty('--split', `${on ? state.split * 100 : 50}%`);
  splitUi.handle.setAttribute('aria-valuenow', percent); splitUi.handle.setAttribute('aria-valuetext', `${percent}% original`);
  drawPreview();
}
const splitAt = event => { const rect = elements.canvas.getBoundingClientRect(); return (event.clientX - rect.left) / Math.max(1, rect.width); };
/** Drag on the photo moves the divider; zoomed in, only the handle does (the photo pans). */
function startSplitDrag(event) {
  if (state.zoom !== 'fit' && event.target !== splitUi.handle) return;
  event.preventDefault();
  splitUi.drag = event.pointerId; elements.canvasWrap.setPointerCapture(event.pointerId); elements.canvasWrap.classList.add('is-splitting');
  setSplit(splitAt(event));
}
elements.canvasWrap.addEventListener('pointermove', event => { if (splitUi.drag === event.pointerId) setSplit(splitAt(event)); });
const endSplitDrag = event => { if (splitUi.drag === event.pointerId) { splitUi.drag = null; elements.canvasWrap.classList.remove('is-splitting'); } };
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => elements.canvasWrap.addEventListener(type, endSplitDrag));
splitUi.button.addEventListener('click', () => { setSplit(state.split === null ? .5 : null); if (state.split !== null) splitUi.handle.focus({ preventScroll: true }); });
splitUi.handle.addEventListener('keydown', event => {
  const step = event.shiftKey ? .1 : .02;
  const next = { ArrowLeft: state.split - step, ArrowDown: state.split - step, ArrowRight: state.split + step, ArrowUp: state.split + step, Home: 0, End: 1 }[event.key];
  if (next !== undefined) { event.preventDefault(); setSplit(next); }
  else if (event.key === 'Escape') { event.preventDefault(); setSplit(null); splitUi.button.focus(); }
});

// ---------- Photos: several open at once (SPEC §2) ----------
// The editor `state` always holds the photo in view. Switching saves its settings and undo/redo
// into its photo, frees its decoded image and bitmaps, then decodes the next one from its File.
// Every photo keeps only its File, a 256 px thumbnail and (after a look) a small rendered preview.
const MAX_PHOTOS = 50, THUMB_EDGE = 256, MAX_FILE_BYTES = 40 * 1024 * 1024;
const app = { photos: [], activeId: null, selected: new Set(), anchorId: null, focusId: null, nextId: 1, viewToken: 0, liveEdit: false };
const photoById = id => app.photos.find(photo => photo.id === id) || null;
const activePhoto = () => photoById(app.activeId);
const photoSize = photo => ({ naturalWidth: photo.width, naturalHeight: photo.height });
const defaultSettings = () => ({ look: { engine: PRESETS, presetId: 'original', strength: 100, engineParams: {}, myLookId: null }, edits: {}, crop: { ...defaultCrop }, optics: defaultOptics(), frame: { id: 'none', border: { ...defaultBorder } }, text: [] });
const settingsOf = photo => (photo.id === app.activeId && state.image ? snapshot() : photo.settings);
const isEdited = settings => settings.look.engine !== PRESETS || settings.look.presetId !== 'original' || Object.keys(settings.edits).length > 0
  || settings.crop.ratio !== 'orig' || !isIdentityCrop(settings.crop) || settings.frame.id !== 'none' || Boolean(settings.text?.length) || !opticsNeutral(settings.optics);
const otherSelected = () => app.photos.filter(photo => app.selected.has(photo.id) && photo.id !== app.activeId);

async function decodeImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    if (!image.naturalWidth) throw new Error('Invalid image');
    return image;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
function makeThumb(image) {
  const scale = Math.min(1, THUMB_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Opens files as new photos (appended); the first new one comes into view unless `view` is false.
 *  Returns the photos it added. */
async function addFiles(fileList, { view = true } = {}) {
  const files = [...(fileList || [])];
  elements.fileInput.value = ''; elements.cameraInput.value = '';
  if (!files.length) return [];
  const opened = [];
  const problems = { type: 0, size: 0, decode: 0, cap: 0 };
  let added = 0;
  const loading = $('#photoLoading'), loadingText = $('#photoLoadingText');
  loading.hidden = files.length < 2;
  try {
  for (const [index, file] of files.entries()) {
    loadingText.textContent = `Opening photos… ${index + 1} of ${files.length}`;
    if (!file.type.startsWith('image/')) { problems.type++; continue; }
    if (file.size > MAX_FILE_BYTES) { problems.size++; continue; }
    if (app.photos.length >= MAX_PHOTOS) { problems.cap++; continue; }
    let image;
    try { image = await decodeImage(file); } catch { problems.decode++; continue; }
    const photo = { id: app.nextId++, file, name: file.name, filename: file.name.replace(/\.[^.]+$/, '') || 'photo', width: image.naturalWidth, height: image.naturalHeight,
      thumb: makeThumb(image), preview: null, settings: defaultSettings(), undo: [], redo: [], render: { status: 'idle' }, el: null };
    app.photos.push(photo); addStripItem(photo); opened.push(photo);
    if (!added++ && view) { app.selected = new Set([photo.id]); app.anchorId = app.focusId = photo.id; viewPhoto(photo.id, image); }
    syncStrip();
  }
  } finally { loading.hidden = true; }
  const skipped = problems.type + problems.size + problems.decode + problems.cap;
  if (!skipped) toast(added === 1 ? 'Photo opened locally.' : `${added} photos opened locally.`);
  else if (files.length === 1) toast(problems.type ? 'Choose a JPEG, PNG, WebP, or GIF image.' : problems.size ? 'That photo is over the 40 MB limit.' : problems.cap ? `PhotoKamo keeps up to ${MAX_PHOTOS} photos open. Close some to add more.` : 'PhotoKamo could not decode that image.');
  else toast([added ? `${added} opened` : 'No photos opened', problems.cap ? `${problems.cap} over the ${MAX_PHOTOS}-photo limit` : '', problems.size ? `${problems.size} over 40 MB` : '', problems.type + problems.decode ? `${problems.type + problems.decode} not readable` : ''].filter(Boolean).join(' · ') + '.');
  return opened;
}

/** Brings a photo into view (decoding it from its File unless `decoded` is given). */
async function viewPhoto(id, decoded = null) {
  const target = photoById(id);
  if (!target || (id === app.activeId && state.image)) return;
  // Decode before leaving the current photo: if it fails, that photo stays in view and editable.
  const token = ++app.viewToken;
  let image = decoded;
  if (!image) {
    try { image = await decodeImage(target.file); }
    catch { if (token === app.viewToken) toast('PhotoKamo could not decode that image.'); return; }
  }
  if (token !== app.viewToken || !photoById(id)) return;
  stashActive();
  app.activeId = id; app.focusId = id;
  renderQueue.remove(id); // the photo in view renders through the main preview
  syncStrip();
  showPhoto(target, image);
}
/** Saves the editor's settings and history into the photo in view and frees its decoded data. */
function stashActive() {
  const current = activePhoto();
  if (!current || !state.image) return;
  if (cropUi.start) { clearTimeout(cropUi.timer); commit(cropUi.start); cropUi.start = null; }
  if (textUi.start) { clearTimeout(textUi.timer); commit(textUi.start); textUi.start = null; }
  current.settings = snapshot(); current.undo = state.undo; current.redo = state.redo;
  // Left before its thumb caught up with the last change: render the thumb in the background.
  if (current.previewKey !== JSON.stringify(current.settings) && (current.preview || isEdited(current.settings))) renderQueue.add(current.id);
  releaseImage();
}
function releaseImage() {
  setHolding(false);
  if (state.renderAbort) cancelFullRender();
  clearTimeout(advancedTimer); clearTimeout(activeThumbTimer); state.renderToken++; // drop renders scheduled for this photo
  state.imageBitmap?.close?.(); state.imageBitmap = null; state.bitmapKey = '';
  state.previewBitmap?.close?.(); state.previewBitmap = null; state.previewBitmapKey = '';
  state.fullRender?.bitmap?.close?.(); state.fullRender = null;
  enginePreview.bitmap?.close?.(); enginePreview = { key: '', bitmap: null };
  state.image = null; state.imageId++; state.originalKey = ''; state.originalCanvas = null; state.editedCanvas = null;
  croppedCache.key = ''; croppedCache.sizes.clear(); cropUi.thumb = null; cropUi.thumbId = -1;
  exportCanvas = { key: '', canvas: null }; preparedExport = null;
}
function showPhoto(target, image) {
  state.image = image; state.imageId++; state.filename = target.filename;
  applySettings(target.settings); state.undo = target.undo; state.redo = target.redo;
  state.holding = false; elements.originalBadge.hidden = true; state.renderQuality = 'preview';
  document.body.classList.add('has-image');
  elements.emptyState.hidden = true; elements.viewport.hidden = false; elements.viewPill.hidden = false;
  elements.fileName.textContent = target.name;
  elements.fileChip.title = target.name;
  elements.fileSize.textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
  elements.fileChip.setAttribute('aria-label', `${target.name}, ${image.naturalWidth} by ${image.naturalHeight} pixels. Photo options`);
  elements.cropStage.hidden = document.body.dataset.tab !== 'crop';
  syncFramePreview(target);
  updateButtons(); syncControls(); scheduleRender();
}
/** Closes the photo in view; the next one (or the start screen) comes into view. */
function closePhoto() { const current = activePhoto(); if (current) removePhotos([current.id]); }
/** Removes photos from the strip (asks first when any has edits). If the photo in view goes, the next one
 *  (or the start screen) comes into view; collage slots that used them become empty. */
function removePhotos(ids) {
  const targets = app.photos.filter(photo => ids.includes(photo.id)); if (!targets.length) return;
  const edited = targets.filter(photo => (photo.id === app.activeId ? state.undo.length : photo.undo.length) || isEdited(settingsOf(photo))).length;
  const one = targets.length === 1;
  if (edited && !confirm(one ? `Remove ${targets[0].name}? Its edits will be lost.` : `Remove ${targets.length} photos? Edits on ${edited === targets.length ? 'them' : plural(edited, 'of them')} will be lost.`)) return;
  const active = activePhoto(), activeIndex = app.photos.indexOf(active), removingActive = targets.includes(active);
  if (removingActive) releaseImage();
  for (const photo of targets) {
    renderQueue.remove(photo.id);
    app.photos.splice(app.photos.indexOf(photo), 1); app.selected.delete(photo.id); photo.el.remove();
  }
  collageStore.restore(collageStore.list()); syncSavedCollages();
  toast(one ? `Removed ${targets[0].name}.` : `Removed ${targets.length} photos.`);
  if (!removingActive) {
    if (!app.selected.size && active) app.selected.add(active.id);
    if (!photoById(app.anchorId)) app.anchorId = app.activeId;
    syncStrip(); focusStripItem(app.activeId); return;
  }
  app.activeId = null;
  const next = app.photos[activeIndex] || app.photos[app.photos.length - 1];
  if (next) {
    if (!app.selected.size) app.selected.add(next.id);
    app.anchorId = next.id; viewPhoto(next.id); syncStrip(); focusStripItem(next.id); return;
  }
  applySettings(defaultSettings()); state.undo = []; state.redo = [];
  document.body.classList.remove('has-image');
  elements.emptyState.hidden = false; elements.viewport.hidden = true; elements.viewPill.hidden = true; elements.cropStage.hidden = true;
  updateButtons(); syncControls();
  $('#chooseButton').focus();
}

// ---------- Filmstrip ----------
function addStripItem(photo) {
  const item = document.createElement('div');
  item.className = 'strip-item'; item.id = `photo-${photo.id}`; item.dataset.photo = photo.id;
  item.setAttribute('role', 'option'); item.tabIndex = -1;
  item.innerHTML = '<canvas width="168" height="168"></canvas><span class="strip-check" aria-hidden="true"></span><span class="strip-dot" aria-hidden="true"></span><span class="strip-progress" aria-hidden="true"><span></span></span><span class="strip-error" aria-hidden="true">!</span><span class="strip-label" aria-hidden="true">In view</span>';
  photo.el = item;
  elements.stripList.append(item);
  drawStripThumb(photo);
}
function drawStripThumb(photo) {
  const canvas = photo.el?.querySelector('canvas'); if (!canvas) return;
  drawCover(canvas.getContext('2d'), photo.preview || photo.thumb, canvas.width, canvas.height);
}
// The thumb of the photo in view follows its preview (look, crop, frame), a moment after it renders.
let activeThumbTimer;
function scheduleActiveThumb() {
  clearTimeout(activeThumbTimer);
  activeThumbTimer = setTimeout(() => {
    const photo = activePhoto(); if (!photo || !state.editedCanvas) return;
    const source = state.editedCanvas, scale = Math.min(1, THUMB_EDGE / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale)); canvas.height = Math.max(1, Math.round(source.height * scale));
    const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const rect = source.photoRect;
    if (rect && state.text.length) drawTexts(ctx, { x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale }, state.text);
    photo.preview = canvas; photo.previewKey = JSON.stringify(snapshot()); drawStripThumb(photo);
  }, 250);
}
function syncStrip() {
  const count = app.photos.length;
  elements.filmstrip.hidden = !count;
  elements.filmstrip.classList.toggle('is-single', count < 2);
  document.body.classList.toggle('has-strip', count > 0);
  if (!app.photos.some(photo => photo.id === app.focusId)) app.focusId = app.activeId;
  for (const photo of app.photos) {
    const item = photo.el, active = photo.id === app.activeId, selected = app.selected.has(photo.id);
    const edited = isEdited(settingsOf(photo)), status = photo.render.status;
    item.classList.toggle('is-active', active); item.classList.toggle('is-edited', edited);
    item.setAttribute('aria-selected', selected); item.dataset.status = status;
    item.tabIndex = photo.id === app.focusId ? 0 : -1;
    item.setAttribute('aria-label', [photo.name, active && 'in view', edited && 'edited', (status === 'queued' || status === 'rendering') && 'updating', status === 'error' && 'could not update'].filter(Boolean).join(', '));
  }
  const selected = app.photos.filter(photo => app.selected.has(photo.id)).length;
  elements.stripCount.textContent = `${selected} selected`;
  elements.stripHint.textContent = otherSelected().length ? 'Changes go to the photo in view. Use Apply to copy them to the rest.' : '';
  syncApplyButtons();
  const busy = renderQueue.size;
  elements.stripStatus.textContent = busy ? `Updating ${busy} photo${busy === 1 ? '' : 's'}…` : '';
  $('#selectAllButton').disabled = selected === count; $('#clearSelectionButton').disabled = selected <= 1;
  const remove = $('#removeSelectedButton');
  remove.disabled = !selected; remove.textContent = selected > 1 ? `Remove ${selected}` : 'Remove';
  remove.setAttribute('aria-label', selected > 1 ? `Remove ${selected} selected photos from the strip` : 'Remove the selected photo from the strip');
  const toggle = $('#stripSelectToggle'), all = selected === count;
  toggle.hidden = count < 2; toggle.setAttribute('aria-pressed', all);
  toggle.setAttribute('aria-label', all ? 'Select only the photo in view' : `Select all ${count} photos`);
  // Apply to the other selected photos; live editing turns off once only one photo is selected.
  const others = otherSelected().length;
  if (!others && app.liveEdit) { app.liveEdit = false; toast('Live editing turned off: only one photo is selected.'); }
  elements.applyBar.hidden = !others;
  $('#applyButtonText').textContent = `Apply to ${others} other selected…`;
  // Phones: "Apply to N" sits in the engine row; the header names the selection or the photo.
  elements.mobileApplyButton.hidden = !others;
  elements.mobileApplyButton.textContent = `Apply to ${others}`;
  elements.mobileApplyButton.setAttribute('aria-label', `Apply to ${plural(others, 'other selected photo')}`);
  elements.topbarTitle.textContent = collage.active ? 'Collage' : selected > 1 ? `${selected} selected` : activePhoto()?.name || '';
  // Keep collage creation discoverable; with one photo, the button explains that another is needed.
  // Ordinary layouts hold 2–9; larger selections open on a contact sheet (up to 36).
  const collageButton = $('#collageButton');
  const collageCount = selected >= 2 ? Math.min(selected, COLLAGE_MAX) : Math.min(count, COLLAGE_MAX);
  collageButton.hidden = !count;
  collageButton.setAttribute('aria-label', count < 2 ? 'Create collage; add at least one more photo' : `Create collage with ${collageCount} ${selected >= 2 ? 'selected ' : ''}photos`);
  $('#collageMenuItem').hidden = false;
  $('#liveEdit').checked = app.liveEdit;
  // Export N / Save N when several photos are selected (batch export)
  const batchCount = isBatchExport() && !collage.active ? selected : 0;
  elements.exportLabel.textContent = batchCount ? `Export ${batchCount}` : 'Export';
  $('#saveButton').textContent = batchCount ? `Save ${batchCount}` : 'Save';
}
function selectRange(id) {
  const ids = app.photos.map(photo => photo.id);
  const from = ids.indexOf(app.anchorId ?? app.activeId), to = ids.indexOf(id);
  app.selected = new Set(ids.slice(Math.min(from, to), Math.max(from, to) + 1));
}
function toggleSelected(id) {
  if (app.selected.has(id) && app.selected.size > 1) app.selected.delete(id); else app.selected.add(id);
  app.anchorId = id;
}
/** Click or Enter: view the photo, selecting only it unless it is already selected. */
function pickPhoto(id) {
  if (!app.selected.has(id)) app.selected = new Set([id]);
  app.anchorId = id; viewPhoto(id);
}
function focusStripItem(id) { app.focusId = id; syncStrip(); photoById(id)?.el.focus(); photoById(id)?.el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
function buildStrip() {
  const list = elements.stripList;
  // Touch: a tap always opens the photo; long-press adds it to or removes it from the selection.
  let press = null, pressed = false;
  list.addEventListener('pointerdown', event => {
    const item = event.target.closest('[data-photo]'); if (!item || event.pointerType === 'mouse') return;
    pressed = false;
    press = { x: event.clientX, y: event.clientY, timer: setTimeout(() => { pressed = true; toggleSelected(Number(item.dataset.photo)); syncStrip(); }, 450) };
  });
  const endPress = () => { if (press) clearTimeout(press.timer); press = null; };
  list.addEventListener('pointermove', event => { if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) endPress(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => list.addEventListener(type, endPress));
  list.addEventListener('contextmenu', event => { if (event.target.closest('[data-photo]')) event.preventDefault(); });
  list.addEventListener('click', event => {
    const item = event.target.closest('[data-photo]'); if (!item) return;
    if (pressed) { pressed = false; return; } // the long-press already toggled it
    const id = Number(item.dataset.photo); app.focusId = id;
    if (event.shiftKey) selectRange(id);
    else if (event.ctrlKey || event.metaKey || (!mobileQuery.matches && event.target.closest('.strip-check'))) toggleSelected(id);
    else pickPhoto(id);
    syncStrip(); item.focus();
  });
  // Keys act on the focused thumb, however it got focus (Tab, click, script).
  list.addEventListener('focusin', event => { const item = event.target.closest('[data-photo]'); if (item && Number(item.dataset.photo) !== app.focusId) { app.focusId = Number(item.dataset.photo); syncStrip(); } });
  list.addEventListener('keydown', event => {
    const ids = app.photos.map(photo => photo.id); if (!ids.length) return;
    const index = Math.max(0, ids.indexOf(app.focusId));
    const target = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: ids.length - 1 }[event.key];
    if (target !== undefined) {
      event.preventDefault();
      const id = ids[Math.max(0, Math.min(ids.length - 1, target))];
      if (event.shiftKey) selectRange(id);
      focusStripItem(id); return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') { // the selection when the focused thumb is in it, else that thumb
      event.preventDefault(); removePhotos(app.selected.has(app.focusId) ? [...app.selected] : [app.focusId]); return;
    }
    if (event.key === ' ') { event.preventDefault(); toggleSelected(app.focusId); syncStrip(); return; }
    if (event.key === 'Enter') { event.preventDefault(); pickPhoto(app.focusId); syncStrip(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); app.selected = new Set(ids); syncStrip(); }
  });
  $('#stripAdd').addEventListener('click', () => elements.fileInput.click());
  // Phones: one toggle under the vertical strip selects all, or goes back to the photo in view.
  $('#stripSelectToggle').addEventListener('click', () => {
    const all = app.photos.every(photo => app.selected.has(photo.id));
    app.selected = new Set(all ? [app.activeId] : app.photos.map(photo => photo.id)); app.anchorId = app.activeId; syncStrip();
  });
  const orient = () => list.setAttribute('aria-orientation', mobileQuery.matches ? 'vertical' : 'horizontal');
  orient(); mobileQuery.addEventListener('change', orient);
  $('#selectAllButton').addEventListener('click', () => { app.selected = new Set(app.photos.map(photo => photo.id)); syncStrip(); });
  $('#removeSelectedButton').addEventListener('click', () => removePhotos([...app.selected]));
  $('#clearSelectionButton').addEventListener('click', () => { app.selected = new Set(app.activeId ? [app.activeId] : []); app.anchorId = app.activeId; syncStrip(); });
}

// ---------- Collage mode (CollagePlan.md Task 1) ----------
// The editor stays as it is underneath (photo, history, selection, tab); collage mode only covers it.
let collageReturnFocus = null;
const popoverOpen = () => { try { return Boolean(document.querySelector(':popover-open')); } catch { return false; } };
/** Photos for a new collage: the selected ones (2+), else every open photo; strip order, at most 36. */
function collageCandidates() {
  const selected = selectedPhotos();
  return (selected.length >= 2 ? selected : app.photos).slice(0, COLLAGE_MAX).map(photo => photo.id);
}
/** Opens collage mode with the candidates, or (`resume`) the last collage as it was. */
function enterCollage({ resume = false } = {}) {
  if (collage.active || !state.image) return;
  const ids = resume && collage.hasDocument ? null : collageCandidates(), selected = selectedPhotos().length;
  if (ids && ids.length < 2) { toast('Add at least one more photo to create a collage.'); elements.fileInput.click(); return; }
  if (ids && (selected >= 2 ? selected : app.photos.length) > COLLAGE_MAX) toast(`The first ${COLLAGE_MAX} photos are in the layout. Swap in the others from any slot.`);
  setCollageReturn(false);
  const current = activePhoto(); if (current) current.settings = snapshot(); // slots read each photo's settings
  if (cropUi.start) { clearTimeout(cropUi.timer); commit(cropUi.start); cropUi.start = null; }
  setHolding(false); closeFullscreen();
  collageReturnFocus = document.activeElement;
  document.body.classList.add('collage-mode');
  const created = collage.open(ids); // the same photos resume the collage in progress: no second saved copy
  if (created || !activeCollageId) activeCollageId = collageStore.save(collage.snapshot())?.id || null;
  syncSavedCollages();
  updateButtons();
}
function openSavedCollage(id) {
  const saved = collageStore.get(id); if (!saved || !state.image) return;
  setCollageReturn(false); const current = activePhoto(); if (current) current.settings = snapshot();
  setHolding(false); closeFullscreen(); collageReturnFocus = document.activeElement;
  document.body.classList.add('collage-mode'); activeCollageId = id; collage.load(saved.doc); updateButtons();
}
function syncSavedCollages() {
  const saved = collageStore.list(), box = $('#collageMenuSaved'), list = $('#collageMenuList');
  box.hidden = !saved.length; $('#collageMenuHeading').textContent = `Collages (${saved.length})`;
  // Built with DOM calls: names will come back from storage (CollagePlan.md Task 10), so never as HTML.
  list.replaceChildren(...saved.map(entry => {
    const row = document.createElement('div'), open = document.createElement('button'), name = document.createElement('span'), remove = document.createElement('button');
    row.className = 'file-menu-collage';
    Object.assign(open, { className: 'file-menu-item', type: 'button' }); open.setAttribute('role', 'menuitem'); open.dataset.collageOpen = entry.id;
    name.className = 'file-menu-collage-name'; name.textContent = entry.name; open.append(name);
    Object.assign(remove, { className: 'file-menu-delete', type: 'button', title: 'Delete collage', textContent: '×' }); remove.setAttribute('role', 'menuitem');
    remove.dataset.collageDelete = entry.id; remove.setAttribute('aria-label', `Delete ${entry.name}`);
    row.append(open, remove); return row;
  }));
}
function exitCollage({ keepCache = false } = {}) {
  if (!collage.active) return;
  collage.close({ keepCache });
  document.body.classList.remove('collage-mode');
  for (const module of collageEngines) if (module !== engine.module) module.dispose?.();
  collageEngines.clear();
  updateButtons(); renderQueue.pump();
  const target = collageReturnFocus?.isConnected && collageReturnFocus.offsetParent ? collageReturnFocus : elements.canvas;
  target.focus?.({ preventScroll: true }); collageReturnFocus = null;
}
/** "Edit this photo" in a collage: the photo comes into view, with Back to collage in the top bar. */
function editFromCollage(id) {
  exitCollage({ keepCache: true });
  pickPhoto(id); syncStrip();
  setCollageReturn(true);
  toast('Edit the photo, then use Back to collage.');
}
function setCollageReturn(on) {
  const button = $('#collageReturn');
  button.hidden = !on;
  if (on) requestAnimationFrame(() => button.focus());
}
$('#collageButton').addEventListener('click', () => enterCollage());
$('#collageBack').addEventListener('click', () => exitCollage());
$('#collageReturn').addEventListener('click', () => enterCollage({ resume: true }));

// ---------- Apply to selected + live editing (SPEC §4 D) ----------
const APPLY_PARTS_KEY = 'photokamo:apply-parts';
const APPLY_DEFAULTS = { look: true, adjustments: true, lens: true, frame: true, text: false, crop: false, exposure: false };
const EXPOSURE_KEYS = ['exposure', 'temperature', 'tint'];
function loadApplyParts() {
  try { const value = JSON.parse(localStorage.getItem(APPLY_PARTS_KEY) || '{}'); return Object.fromEntries(Object.keys(APPLY_DEFAULTS).map(key => [key, typeof value[key] === 'boolean' ? value[key] : APPLY_DEFAULTS[key]])); }
  catch { return { ...APPLY_DEFAULTS }; }
}
let applyParts = loadApplyParts();
const pickEdits = (edits, exposure) => Object.fromEntries(Object.entries(edits).filter(([key]) => EXPOSURE_KEYS.includes(key) === exposure));
/** The target's settings with the chosen parts of `source` copied in. */
function mergeSettings(target, source, parts) {
  const settings = structuredClone(target.settings);
  if (parts.look) settings.look = structuredClone(source.look);
  settings.edits = { ...pickEdits(parts.adjustments ? source.edits : settings.edits, false), ...pickEdits(parts.exposure ? source.edits : settings.edits, true) };
  if (parts.lens) settings.optics = normalizeOptics(source.optics);
  if (parts.frame) settings.frame = structuredClone(source.frame);
  if (parts.text) settings.text = cloneTexts(source.text);
  // Crop: the ratio only, centred at zoom 1 on each photo (their rotation, flip and straighten stay).
  if (parts.crop) settings.crop = fitRatio({ ...settings.crop, ratio: source.crop.ratio, swapped: source.crop.swapped, platform: source.crop.platform ?? null, x: .5, y: .5, zoom: 1 }, photoSize(target));
  return settings;
}
/** One undo step per target photo; their thumbnails re-render through the queue. */
function applyToPhotos(targets, parts) {
  const source = snapshot(); let changed = 0;
  for (const target of targets) {
    const next = mergeSettings(target, source, parts);
    if (sameSnapshot(next, target.settings)) continue;
    target.undo.push(target.settings); if (target.undo.length > 50) target.undo.shift(); target.redo = [];
    target.settings = next; changed++;
    renderQueue.add(target.id);
  }
  syncStrip();
  return changed;
}
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
function applySummaries() {
  const source = snapshot();
  const module = activeModule();
  const look = isFilm() ? [engineById(state.engine).label, currentMyLook()?.name, module ? module.stockSummary(advParams()) : null].filter(Boolean).join(' · ')
    : `Basic · ${currentPreset().name}${state.strength < 100 && state.presetId !== 'original' ? ` ${state.strength}%` : ''}`;
  const named = edits => Object.keys(edits).map(key => `${controlSpec[key].label} ${formatValue(key, effectiveValue(key))}`);
  const adjustments = named(pickEdits(source.edits, false)), exposure = named(pickEdits(source.edits, true));
  const frame = frames.find(item => item.id === state.frame.id)?.name || 'None';
  return {
    look,
    adjustments: adjustments.length ? adjustments.slice(0, 3).join(' · ') + (adjustments.length > 3 ? ` · +${adjustments.length - 3} more` : '') : 'None (clears theirs)',
    lens: lensEdits().length ? [lensProfileState() ? lensSummary() : null, ...lensEdits().slice(0, 3).map(control => `${control.label} ${formatLens(control, state.optics[control.path])}`)].filter(Boolean).join(' · ') : 'None (clears theirs)',
    text: state.text.length ? state.text.map(text => `“${text.content.split('\n')[0].slice(0, 20)}”`).join(' · ') : 'None (clears theirs)',
    frame: state.frame.id === 'paper' ? `${frame} · ${state.frame.border.width}% border` : frame,
    crop: `${ratioLabel(state.crop)}${state.crop.swapped ? ' (swapped)' : ''}, centered on each photo (position is not copied)`,
    exposure: exposure.length ? `${exposure.join(' · ')} · usually per-shot` : 'Off by default: these are usually per-shot'
  };
}
function openApply() {
  const targets = otherSelected(); if (!targets.length || !state.image) return;
  const form = elements.applyForm, summaries = applySummaries();
  for (const key of Object.keys(APPLY_DEFAULTS)) {
    form.elements[key].checked = applyParts[key];
    $(`#applySum${key[0].toUpperCase()}${key.slice(1)}`).textContent = summaries[key];
  }
  $('#applyTitle').textContent = `Apply to ${plural(targets.length, 'other photo')}`;
  $('#applyThumbs').replaceChildren(...targets.slice(0, 6).map(photo => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 112;
    drawCover(canvas.getContext('2d'), photo.preview || photo.thumb, 112, 112);
    return canvas;
  }));
  $('#applyLive').checked = app.liveEdit;
  syncApplyForm();
  elements.applyDialog.showModal();
}
function syncApplyForm() {
  const form = elements.applyForm;
  const parts = Object.fromEntries(Object.keys(APPLY_DEFAULTS).map(key => [key, form.elements[key].checked]));
  const any = Object.values(parts).some(Boolean);
  const count = otherSelected().length;
  $('#applyConfirm').disabled = !any;
  $('#applyConfirm').textContent = `Apply to ${plural(count, 'photo')}`;
  $('#applyNote').hidden = !(parts.look && isFilm());
  return parts;
}
function buildApply() {
  elements.applyButton.addEventListener('click', openApply);
  elements.mobileApplyButton.addEventListener('click', openApply);
  elements.applyForm.addEventListener('change', syncApplyForm);
  elements.applyForm.addEventListener('submit', event => {
    event.preventDefault();
    applyParts = syncApplyForm();
    try { localStorage.setItem(APPLY_PARTS_KEY, JSON.stringify(applyParts)); } catch { /* remembered for this visit only */ }
    const changed = applyToPhotos(otherSelected(), applyParts);
    if (mobileQuery.matches) app.liveEdit = $('#applyLive').checked; // phones: the live switch is in this dialog
    elements.applyDialog.close(); syncStrip();
    toast(changed ? `Applied to ${plural(changed, 'photo')}. Undo on each photo.` : 'Those photos already match.');
  });
  $('#applyCancel').addEventListener('click', () => elements.applyDialog.close());
  $('#applyClose').addEventListener('click', () => elements.applyDialog.close());
  elements.applyDialog.addEventListener('click', event => { if (event.target === elements.applyDialog) elements.applyDialog.close(); });
  $('#liveEdit').addEventListener('change', event => {
    app.liveEdit = event.target.checked;
    if (app.liveEdit) { const changed = applyToPhotos(otherSelected(), applyParts); toast(`Live: changes now go to all ${app.selected.size} selected photos.`); }
  });
}

// ---------- Render queue for photos not in view (js/render-queue.js) ----------
const QUEUE_EDGE = THUMB_EDGE;
const queueEngines = new Set(); // engine modules the queue started, stopped again once it is idle
/** Adjust values for any photo's settings (same formula as effectiveValue). */
function adjustmentsFor({ look, edits }) {
  const preset = look.engine === PRESETS ? presets.find(item => item.id === look.presetId) || presets[0] : null;
  return Object.fromEntries(Object.keys(defaultAdjustments).map(key => {
    const original = defaultAdjustments[key];
    const base = preset ? original + (preset.values[key] - original) * look.strength / 100 : original;
    return [key, clampToRange(key, base + (edits[key] || 0))];
  }));
}
/** A photo's finished edit (crop, optics, look, Adjust) without frame or text: { image, tint, settings }, or null
 *  when `job` went stale. `quality` is the engine's ('preview' | 'full'); `from` is the input: 'thumb' (the 256 px
 *  thumb, the default for 'preview') or 'full' (the full-size photo). From full size, Basic works at `edge`
 *  (resolution-independent) and film engines get full-size input (their grain and MTF have a physical scale),
 *  scaled down to `edge` afterwards. `onEngine(module)` sees each engine it loads. */
async function renderPhotoEdit(photo, { edge = Infinity, quality = 'full', from = quality === 'preview' ? 'thumb' : 'full', job = null, onEngine = null, onProgress } = {}) {
  const preview = quality === 'preview', thumb = from === 'thumb', inView = !thumb && photo.id === app.activeId && state.image;
  const settings = inView ? snapshot() : photo.settings;
  const { crop, look, edits } = settings;
  const image = thumb ? photo.thumb : inView ? state.image : await decodeImage(photo.file);
  if (job?.stale) return null;
  const workEdge = thumb || look.engine === PRESETS ? edge : Infinity;
  const cropped = isIdentityCrop(crop) ? image : cropSource(image, crop, workEdge);
  const source = await renderOptics(cropped, settings.optics, workEdge);
  if (job?.stale) return null;
  if (look.engine === PRESETS) return { image: renderEdit(source, adjustmentsFor(settings), workEdge), tint: null, settings };
  const module = await loadEngine(look.engine);
  onEngine?.(module);
  const params = module.normalizeParams(look.engineParams[look.engine]);
  const input = source !== cropped ? source : await createImageBitmap(source); // a fresh optics bitmap is ours to close
  const raw = await module.render(input, cloneParams(params), { quality, onProgress });
  input.close();
  if (job?.stale) return null;
  const hasEdits = Object.keys(edits).length > 0;
  let output = preview ? (hasEdits ? applyAdjustments(raw, adjustmentsFor(settings)) : raw) : await adjustFull(raw, hasEdits ? adjustmentsFor(settings) : null);
  const scale = thumb ? 1 : Math.min(1, edge / Math.max(output.width, output.height));
  if (scale < 1) {
    const scaled = document.createElement('canvas');
    scaled.width = Math.max(1, Math.round(output.width * scale)); scaled.height = Math.max(1, Math.round(output.height * scale));
    const ctx = scaled.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(output, 0, 0, scaled.width, scaled.height);
    output.close?.(); output = scaled;
  }
  const tint = module.paperTint && module.showsPaper(params) ? module.paperTint(params) : null;
  return { image: output, tint, settings };
}
async function renderPhotoThumb(id, job) {
  const photo = photoById(id); if (!photo) return null;
  const texts = photo.settings.text || [];
  await ensureTextFonts(texts);
  const edit = await renderPhotoEdit(photo, { edge: QUEUE_EDGE, quality: 'preview', job, onEngine: module => { if (module !== engine.module) queueEngines.add(module); } });
  return edit && frameCanvas(edit.image, frameFor(edit.settings.frame, edit.tint), texts);
}
const renderQueue = createRenderQueue({
  render: renderPhotoThumb,
  canRun: () => !advancedBusy && !state.renderAbort && !batch.running && !collage.active,
  onChange: (id, status, result) => {
    const photo = photoById(id); if (!photo) return;
    photo.render.status = status === 'done' ? 'idle' : status;
    if (status === 'done' && result) { photo.preview = result; photo.previewKey = JSON.stringify(photo.settings); drawStripThumb(photo); }
    if (status === 'error') console.error(result);
    syncStrip();
  },
  onIdle: () => {
    for (const module of queueEngines) if (module !== engine.module) module.dispose?.();
    queueEngines.clear();
  }
});

// ---------- Camera ----------
function stopCamera() {
  cameraRequestId++;
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  cameraStream = null;
  elements.cameraPreview.srcObject = null;
  elements.capturePhoto.disabled = true;
  elements.switchCamera.disabled = true;
}

function cameraErrorMessage(error) {
  if (!window.isSecureContext) return 'Live camera requires HTTPS or localhost. Serve PhotoKamo locally instead of opening the HTML file directly.';
  if (error?.name === 'NotAllowedError') return 'Camera permission was denied. Allow camera access in your browser settings and try again.';
  if (error?.name === 'NotFoundError') return 'No camera was found on this device.';
  if (error?.name === 'NotReadableError') return 'The camera is busy or unavailable to the browser.';
  return 'The live camera could not be started. You can try the device fallback below.';
}

async function startCamera() {
  stopCamera();
  const requestId = cameraRequestId;
  elements.cameraStatus.hidden = false;
  elements.cameraStatus.textContent = 'Starting camera…';
  elements.cameraPreview.classList.toggle('mirrored', cameraFacingMode === 'user');

  if (!navigator.mediaDevices?.getUserMedia) {
    elements.cameraStatus.textContent = cameraErrorMessage();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: cameraFacingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    if (requestId !== cameraRequestId || !elements.cameraDialog.open) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    cameraStream = stream;
    elements.cameraPreview.srcObject = stream;
    await elements.cameraPreview.play();
    elements.cameraStatus.hidden = true;
    elements.capturePhoto.disabled = false;
    const devices = await navigator.mediaDevices.enumerateDevices();
    elements.switchCamera.disabled = devices.filter(device => device.kind === 'videoinput').length < 2;
  } catch (error) {
    console.error(error);
    elements.cameraStatus.hidden = false;
    elements.cameraStatus.textContent = cameraErrorMessage(error);
  }
}

async function openCamera() {
  if (!elements.cameraDialog.open) elements.cameraDialog.showModal();
  await startCamera();
}

async function captureCameraPhoto() {
  const video = elements.cameraPreview;
  if (!cameraStream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  elements.capturePhoto.disabled = true;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .95));
  if (!blob) {
    elements.capturePhoto.disabled = false;
    return toast('The camera photo could not be captured.');
  }
  const filename = `camera-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
  stopCamera();
  elements.cameraDialog.close();
  await addFiles([new File([blob], filename, { type: 'image/jpeg' })]);
}

// ---------- Tabs ----------
function setTab(tabButton) {
  document.querySelectorAll('.control-tabs [role=tab]').forEach(tab => {
    const selected = tab === tabButton;
    tab.setAttribute('aria-selected', selected);
    tab.tabIndex = selected ? 0 : -1;
    $(`#${tab.getAttribute('aria-controls')}`).hidden = !selected;
  });
  if (tabButton.id === 'cropTab' && document.body.dataset.tab !== 'crop') cropUi.previousTab = `${document.body.dataset.tab || 'looks'}Tab`;
  document.body.dataset.tab = tabButton.id.replace('Tab', '');
  // Crop: the whole photo with the crop box replaces the preview while the tab is open.
  elements.cropStage.hidden = tabButton.id !== 'cropTab' || !state.image;
  if (!elements.cropStage.hidden) { cropUi.key = ''; syncCrop(); }
  syncText(); // the selection box shows only in the Text tab
}

// ---------- Save / export ----------
// The file is prepared as soon as the sheet opens (and again when an option changes), so that
// "Share" can call navigator.share() while the tap still counts as a user gesture.
let exportCanvas = { key: '', canvas: null };
let preparedExport = null; // { key, promise, file }
let prepareTimer;

const canShareFiles = (() => {
  try { return Boolean(navigator.canShare?.({ files: [new File([new Blob(['x'], { type: 'image/jpeg' })], 'test.jpg', { type: 'image/jpeg' })] })); } catch { return false; }
})();

function exportDimensions() {
  const { width, height } = croppedSize();
  const module = activeModule();
  return module ? module.fullRenderSize(width, height) : { width, height, capped: false };
}
function exportEdge(size = state.exportSize) {
  const { width, height } = exportDimensions();
  const full = Math.max(width, height);
  if (size === 'share' && width > shareWidth()) return Math.round(shareWidth() * full / width);
  return full;
}
function exportKey() { return JSON.stringify([state.imageId, snapshot(), exportEdge(), state.exportFormat, state.exportFormat === 'image/png' ? 0 : elements.quality.value]); }
function qualityWord(value) { return value >= 90 ? 'High' : value >= 75 ? 'Medium' : 'Low'; }
async function renderAdvancedExport(edge) {
  const frame = renderFrame();
  const module = await activateEngine();
  const key = fullRenderKey(); const edits = engineEdits();
  let full = state.fullRender?.key === key ? state.fullRender.bitmap : null;
  if (!full) {
    const raw = await module.render(await ensureBitmap(), cloneParams(advParams()), { quality: 'full', onProgress: value => { elements.exportStatus.textContent = `Developing full-quality scan… ${Math.round(value * 100)}%`; } });
    full = await adjustFull(raw, edits);
    state.fullRender = { key, bitmap: full };
  }
  const scale = Math.min(1, edge / Math.max(full.width, full.height));
  await ensureTextFonts(state.text);
  if (scale === 1) return frameCanvas(full, frame, state.text);
  const scaled = document.createElement('canvas');
  scaled.width = Math.round(full.width * scale); scaled.height = Math.round(full.height * scale);
  const ctx = scaled.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, scaled.width, scaled.height);
  return frameCanvas(scaled, frame, state.text);
}
function exportSummary() {
  const frameName = state.frame.id === 'none' ? 'no frame' : `${frames.find(item => item.id === state.frame.id).name} frame`;
  const count = editCount();
  if (isFilm()) {
    const look = currentMyLook()?.name || engineById(state.engine).label;
    const module = activeModule();
    return [look, module ? module.stockSummary(advParams()) : null, count ? `${count} adjustment${count === 1 ? '' : 's'}` : null, frameName].filter(Boolean).join(' · ');
  }
  const preset = currentPreset();
  const look = preset.id !== 'original' && state.strength < 100 ? `${preset.name} ${state.strength}%` : preset.name;
  return [look, count ? `${count} adjustment${count === 1 ? '' : 's'}` : null, frameName].filter(Boolean).join(' · ');
}
function syncExportOptions() {
  document.querySelectorAll('[data-format]').forEach(button => button.setAttribute('aria-pressed', button.dataset.format === state.exportFormat));
  const { width, height } = croppedSize();
  const canShrink = width > shareWidth();
  if (!canShrink && state.exportSize === 'share') state.exportSize = 'full';
  document.querySelectorAll('[data-size]').forEach(button => button.setAttribute('aria-pressed', button.dataset.size === state.exportSize));
  const shareButton = document.querySelector('[data-size="share"]');
  shareButton.disabled = !canShrink;
  const target = exportDimensions();
  elements.fullSizeDetail.textContent = target.capped ? `${target.width} × ${target.height} · film engine limit` : `${width} × ${height}`;
  const platform = PLATFORMS[state.crop.platform];
  elements.shareSizeDetail.textContent = !canShrink ? 'Already small' : platform ? `${platform.group} · ${platform.w} × ${platform.h}` : `${SHARE_WIDTH} px wide`;
  elements.qualityGroup.hidden = state.exportFormat === 'image/png';
  elements.qualityOutput.value = `${qualityWord(Number(elements.quality.value))} · ${elements.quality.value}%`;
  elements.exportSummary.textContent = exportSummary();
  elements.shareButton.hidden = !canShareFiles;
  elements.downloadButton.className = `button button-xl ${canShareFiles ? 'button-ghost' : 'button-primary'}`;
}
function prepareExport() {
  const key = exportKey();
  if (preparedExport?.key === key) return preparedExport.promise;
  const job = { key, file: null };
  job.promise = (async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
    await ensureTextFonts(state.text);
    const edge = exportEdge();
    const canvasKey = JSON.stringify([state.imageId, snapshot(), edge]);
    if (exportCanvas.key !== canvasKey) exportCanvas = { key: canvasKey, canvas: isFilm() ? await renderAdvancedExport(edge) : renderImage(await opticsSource(edge), effectiveAdjustments(), renderFrame(), edge, state.text) };
    const type = state.exportFormat;
    const blob = await new Promise(resolve => exportCanvas.canvas.toBlob(resolve, type, Number(elements.quality.value) / 100));
    if (!blob) throw new Error('Encoding failed');
    // The browser may not encode the requested type (WebP in older Safari gives PNG): name the file after what it made.
    const actual = blob.type || type;
    job.file = new File([blob], `${state.filename}-photokamo.${extensionFor(actual)}`, { type: actual });
    return job.file;
  })();
  job.promise.catch(() => {});
  preparedExport = job;
  return job.promise;
}
function schedulePrepare(delay = 250) {
  clearTimeout(prepareTimer);
  elements.exportStatus.textContent = '';
  prepareTimer = setTimeout(() => {
    const promise = prepareExport();
    const job = preparedExport;
    if (!job.file) elements.exportStatus.textContent = 'Preparing your photo…';
    promise.finally(() => { if (preparedExport === job) elements.exportStatus.textContent = ''; }).catch(() => {});
  }, delay);
}
function openSave() {
  if (isBatchExport()) { openBatch(); return; }
  if (!state.image) return;
  syncExportOptions();
  elements.exportStatus.textContent = '';
  elements.exportDialog.showModal();
  schedulePrepare(120);
}
async function downloadPhoto() {
  try {
    elements.exportStatus.textContent = 'Preparing your photo…';
    const file = await prepareExport();
    const url = URL.createObjectURL(file); const link = document.createElement('a');
    link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    elements.exportDialog.close();
    toast(file.type !== state.exportFormat ? `Saved as ${formatName(file.type)}: this browser can’t save ${formatName(state.exportFormat)}.` : 'Your photo is ready.');
  } catch (error) { console.error(error); toast('Export failed. Try JPEG or a smaller photo.'); }
  elements.exportStatus.textContent = '';
}
async function sharePhoto() {
  try {
    const ready = preparedExport?.key === exportKey() ? preparedExport.file : null;
    if (!ready) elements.exportStatus.textContent = 'Preparing your photo…';
    const file = ready || await prepareExport();
    elements.exportStatus.textContent = '';
    await navigator.share({ files: [file] });
    elements.exportDialog.close(); toast('Shared.');
  } catch (error) {
    elements.exportStatus.textContent = '';
    if (error?.name === 'AbortError') return;
    if (error?.name === 'NotAllowedError') { toast('Your photo is ready. Tap Share again.'); return; }
    console.error(error); toast('Sharing failed. Try Download file instead.');
  }
}

// ---------- Batch export: several selected photos (SPEC §4 I) ----------
// Each photo renders at full quality with its own settings, one at a time: decoded from its
// File, rendered (film engines in their Worker; Adjust edits in js/adjust-worker.js), encoded,
// then freed. One ZIP (js/zip.js, store-only) or separate downloads; Share where supported.
const BATCH_MODE_KEY = 'photokamo:batch-mode';
const batch = { running: false, cancel: false, prepared: null, format: 'image/jpeg', mode: 'zip' };
try { if (localStorage.getItem(BATCH_MODE_KEY) === 'separate') batch.mode = 'separate'; } catch { /* default ZIP */ }
const selectedPhotos = () => app.photos.filter(photo => app.selected.has(photo.id));
/** Batch export when several photos are selected (or one that is not in view). */
const isBatchExport = () => { const photos = selectedPhotos(); return photos.length > 1 || (photos.length === 1 && photos[0].id !== app.activeId); };
const zipName = count => `photokamo-${count}-photo${count === 1 ? '' : 's'}.zip`;
const extensionFor = type => type.split('/')[1].replace('jpeg', 'jpg');
const formatName = type => ({ 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' })[type] || type;
function uniqueName(base, extension, used) {
  let name = `${base}-photokamo.${extension}`;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}-photokamo-${n}.${extension}`;
  used.add(name.toLowerCase());
  return name;
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
/** A photo's final image (full size, its look, crop, edits and frame) as a canvas. */
async function renderPhotoFull(photo, engineModules, onProgress) {
  const texts = settingsOf(photo).text || [];
  await ensureTextFonts(texts);
  const { image, tint, settings } = await renderPhotoEdit(photo, { onEngine: module => engineModules.add(module), onProgress });
  const output = frameCanvas(image, frameFor(settings.frame, tint), texts);
  image.close?.();
  return output;
}
const batchKey = photos => JSON.stringify([photos.map(photo => [photo.id, settingsOf(photo)]), batch.format, batch.format === 'image/png' ? 0 : elements.batchQuality.value]);
/** Renders and encodes the photos; `each(file)` gets every file as soon as it is ready. Null when cancelled. */
async function renderBatch(photos, each = null) {
  const key = batchKey(photos);
  if (!each && batch.prepared?.key === key) return batch.prepared.files;
  batch.running = true; batch.cancel = false; syncBatch();
  const type = batch.format, quality = Number(elements.batchQuality.value) / 100;
  const used = new Set(), files = [], engineModules = new Set();
  const progress = (index, value = 0) => {
    elements.batchProgressCount.textContent = `${Math.min(index + 1, photos.length)} of ${photos.length}`;
    elements.batchBar.style.width = `${Math.round((index + value) / photos.length * 100)}%`;
  };
  try {
    for (const [index, photo] of photos.entries()) {
      if (batch.cancel) break;
      progress(index);
      const canvas = await renderPhotoFull(photo, engineModules, value => progress(index, value));
      const blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality));
      canvas.width = canvas.height = 0; // free the full-size pixels now
      if (!blob) throw new Error(`Encoding ${photo.name} failed`);
      const actual = blob.type || type; // what the browser encoded (WebP may fall back to PNG)
      const file = new File([blob], uniqueName(photo.filename, extensionFor(actual), used), { type: actual });
      files.push(file);
      if (each) await each(file);
      progress(index + 1);
    }
  } finally {
    batch.running = false;
    for (const module of engineModules) if (module !== engine.module) module.dispose?.();
    syncBatch(); renderQueue.pump();
  }
  if (batch.cancel) { toast(`Export stopped after ${plural(files.length, 'photo')}.`); return null; }
  if (!each) batch.prepared = { key, files };
  return files;
}
function openBatch() {
  const photos = selectedPhotos(); if (!photos.length) return;
  batch.prepared = null;
  $('#batchTitle').textContent = `Export ${plural(photos.length, 'photo')}`;
  elements.batchZipName.textContent = `${zipName(photos.length)} · one download`;
  $('#batchThumbs').replaceChildren(...photos.slice(0, 6).map(photo => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 112;
    drawCover(canvas.getContext('2d'), photo.preview || photo.thumb, 112, 112);
    return canvas;
  }));
  elements.batchForm.elements.mode.value = batch.mode;
  elements.batchStatus.textContent = '';
  elements.batchProgress.hidden = true;
  syncBatch();
  elements.batchDialog.showModal();
}
function syncBatch() {
  const count = selectedPhotos().length, running = batch.running;
  document.querySelectorAll('[data-batch-format]').forEach(button => { button.setAttribute('aria-pressed', button.dataset.batchFormat === batch.format); button.disabled = running; });
  elements.batchQualityGroup.hidden = batch.format === 'image/png';
  elements.batchQuality.disabled = running;
  $('#batchQualityOutput').value = `${elements.batchQuality.value}%`;
  elements.batchForm.querySelectorAll('[name=mode]').forEach(input => { input.disabled = running; });
  if (running) elements.batchProgress.hidden = false;
  elements.batchDownload.disabled = running;
  elements.batchDownload.textContent = `Download ${count}`;
  elements.batchShare.hidden = !canShareFiles; elements.batchShare.disabled = running;
  elements.batchCancel.textContent = running ? 'Stop' : 'Cancel';
  elements.batchCancel.disabled = running && batch.cancel;
}
async function downloadBatch() {
  const photos = selectedPhotos(); if (!photos.length || batch.running) return;
  batch.mode = elements.batchForm.elements.mode.value || 'zip';
  try { localStorage.setItem(BATCH_MODE_KEY, batch.mode); } catch { /* remembered for this visit only */ }
  elements.batchStatus.textContent = '';
  try {
    if (batch.mode === 'separate') {
      // Each file downloads as soon as it is ready; a short gap keeps browsers from dropping some.
      const files = await renderBatch(photos, async file => { downloadBlob(file, file.name); await new Promise(resolve => setTimeout(resolve, 300)); });
      if (!files) return;
      elements.batchDialog.close(); toast(`${plural(files.length, 'photo')} saved as separate files.`);
    } else {
      const files = await renderBatch(photos);
      if (!files) return;
      elements.batchProgressText.textContent = 'Packing the ZIP…';
      const zip = await createZip(files);
      downloadBlob(zip, zipName(files.length));
      elements.batchDialog.close(); toast(`${plural(files.length, 'photo')} saved in one ZIP.`);
    }
  } catch (error) {
    console.error(error);
    elements.batchStatus.textContent = error?.message?.includes('4 GB') ? error.message : 'Export failed. Check your connection for film engines, or try JPEG.';
  } finally { elements.batchProgressText.textContent = 'Rendering full quality'; }
}
// Share needs a fresh tap: the first tap renders the files, then sharing is one more tap.
async function shareBatch() {
  const photos = selectedPhotos(); if (!photos.length || batch.running) return;
  const ready = batch.prepared?.key === batchKey(photos) ? batch.prepared.files : null;
  try {
    const files = ready || await renderBatch(photos);
    if (!files) return;
    if (!ready && !navigator.userActivation?.isActive) { elements.batchStatus.textContent = 'Your photos are ready. Tap Share again.'; elements.batchShare.focus(); return; }
    await navigator.share({ files });
    elements.batchDialog.close(); toast('Shared.');
  } catch (error) {
    if (error?.name === 'AbortError') return;
    if (error?.name === 'NotAllowedError') { elements.batchStatus.textContent = 'Your photos are ready. Tap Share again.'; return; }
    console.error(error); elements.batchStatus.textContent = 'Sharing failed. Try Download instead.';
  }
}
function buildBatch() {
  elements.batchForm.addEventListener('submit', event => { event.preventDefault(); downloadBatch(); });
  elements.batchShare.addEventListener('click', shareBatch);
  $('#batchFormats').addEventListener('click', event => { const button = event.target.closest('[data-batch-format]'); if (!button || batch.running) return; batch.format = button.dataset.batchFormat; syncBatch(); });
  elements.batchQuality.addEventListener('input', syncBatch);
  // Cancel closes; while rendering it stops after the photo in progress.
  const stop = () => { if (batch.running) { batch.cancel = true; elements.batchStatus.textContent = 'Stopping after this photo…'; syncBatch(); return true; } return false; };
  elements.batchCancel.addEventListener('click', () => { if (!stop()) elements.batchDialog.close(); });
  $('#batchClose').addEventListener('click', () => { if (!stop()) elements.batchDialog.close(); });
  elements.batchDialog.addEventListener('cancel', event => { if (stop()) event.preventDefault(); });
  elements.batchDialog.addEventListener('click', event => { if (event.target === elements.batchDialog && !stop()) elements.batchDialog.close(); });
}

// ---------- Wiring ----------
buildLooks(); buildAdjustments(); buildMobileAdjust(); buildLens(); buildFrames(); buildCrop(); buildText(); buildAdvancedPanel(); buildStrip(); buildApply(); buildApplyRows(); buildBatch(); syncControls(); updateButtons();
// Download badges once the page is idle: two small manifest files, no engine code.
(window.requestIdleCallback || (callback => setTimeout(callback, 1500)))(() => syncDownloadBadges(), { timeout: 3000 });
document.body.dataset.tab = 'looks';
$('#closeButton').addEventListener('click', closePhoto);
$('#saveButton').addEventListener('click', openExport);
mobileQuery.addEventListener('change', () => { if (mobileQuery.matches) { setZoom('fit'); if (state.split !== null) setSplit(null); } syncAdvancedPanel(); placeLookTools(); });
// Surprise me · Favorites: under the Looks grid on desktop; phones have no room there, so they sit in the look-name row by the gear.
function placeLookTools() {
  const tools = $('.look-tools');
  if (mobileQuery.matches) $('.engine-row').insertBefore(tools, $('.engine-row .film-settings-button'));
  else $('#looksApplyAll').before(tools);
}
placeLookTools();
elements.renderFull.addEventListener('click', renderFullQuality);
elements.renderCancel.addEventListener('click', () => { cancelFullRender(); scheduleAdvancedRender(0); });
elements.sheetRender.addEventListener('click', () => {
  if (elements.sheetRender.getAttribute('aria-disabled') === 'true') return;
  if (state.renderQuality === 'rendering') elements.renderCancel.click(); else renderFullQuality();
});
sheetQuery.addEventListener('change', () => { syncAdvancedPanel(); syncRenderStatus(); });
// Phone sheet stage tabs: ←/→ Home/End move and select (automatic activation).
elements.advPipeline.addEventListener('keydown', event => {
  if (!sheetQuery.matches || !event.target.matches('[role=tab]')) return;
  const tabs = [...elements.advPipeline.querySelectorAll('[role=tab]')];
  const index = tabs.indexOf(event.target);
  const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  const tab = tabs[(next + tabs.length) % tabs.length];
  tab.click(); tab.focus();
});

// Film sheet (phones ≤600px): preview collapsed (larger photo) or expanded (more controls). UI state, not undo.
// Remembered on this device; the first time, short screens (<700px) start expanded.
const SHEET_KEY = 'photokamo:film-sheet';
let sheetExpanded = (() => { try { const value = localStorage.getItem(SHEET_KEY); if (value) return value === 'expanded'; } catch { /* storage unavailable */ } return innerHeight < 700; })();
function syncSheet() {
  document.body.classList.toggle('sheet-expanded', sheetExpanded);
  elements.sheetGrabber.setAttribute('aria-label', sheetExpanded ? 'Collapse controls' : 'Expand controls');
}
elements.sheetGrabber.addEventListener('click', () => {
  sheetExpanded = !sheetExpanded; syncSheet();
  try { localStorage.setItem(SHEET_KEY, sheetExpanded ? 'expanded' : 'collapsed'); } catch { /* remembered for this visit only */ }
});
syncSheet();

// ---------- Film sheet rows: option picker, typed values, double-tap reset ----------
const optionPicker = createOptionPicker({ sheet: $('#optionPicker'), title: $('#optionPickerTitle'), list: $('#optionPickerList') });
function pickOption(anchor, path) {
  const module = activeModule(); if (!module) return;
  const control = module.controlByPath[path];
  optionPicker.open({ anchor, label: control.label, value: advParams()[path],
    options: control.options.map(value => ({ value, label: module.optionLabel(value, path), group: module.optionGroup?.(value, path) || '' })),
    onChoose: value => change(() => { setAdvancedValue(path, value); }) });
}
const stepDecimals = step => { const text = String(step); return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0; };
/** Clamps to the control's range and snaps to its step. */
function snapToStep(control, raw) {
  const value = Math.min(control.max, Math.max(control.min, raw));
  return Number((Math.round((value - control.min) / control.step) * control.step + control.min).toFixed(stepDecimals(control.step)));
}
/** Value chip → inline numeric input. Enter / leaving the field commits (one undo step), Esc cancels. */
function editChipValue(chip) {
  const module = activeModule(); if (!module) return;
  const path = chip.dataset.chip; const control = module.controlByPath[path];
  const input = document.createElement('input');
  input.className = 'adv-chip-input'; input.type = 'text'; input.inputMode = 'decimal'; input.enterKeyHint = 'done'; input.autocomplete = 'off';
  input.setAttribute('aria-label', `${control.label}, from ${control.min} to ${control.max}`);
  input.value = String(module.sliderValue(control, advParams()[path]));
  chip.hidden = true; chip.after(input); input.focus(); input.select();
  let done = false;
  const finish = (save, refocus) => {
    if (done) return; done = true;
    const number = parseFloat(input.value.replace(',', '.').replace(/[^\d.+-]/g, ''));
    input.remove(); chip.hidden = false;
    if (save && Number.isFinite(number)) change(() => { setAdvancedValue(path, snapToStep(control, number)); });
    if (refocus) chip.focus();
  };
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); finish(true, true); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false, true); }
  });
  input.addEventListener('blur', () => finish(true, false));
}
// The on-screen keyboard shrinks the visual viewport: keep the field being typed in visible.
visualViewport?.addEventListener('resize', () => { const input = document.querySelector('.adv-chip-input'); if (input) input.scrollIntoView({ block: 'center' }); });
// Phones: iOS pans the page to the focused field and often leaves it panned (the editor drifts up,
// the top bar disappears). While the keyboard is up, pin the app to the visible area; reset after.
function syncKeyboard() {
  const view = visualViewport, root = document.documentElement;
  const open = mobileQuery.matches && view.scale < 1.01 && innerHeight - view.height > 120
    && document.activeElement?.matches('textarea,input:not([type=range],[type=color],[type=checkbox],[type=radio])');
  const opening = open && !document.body.classList.contains('keyboard-open');
  document.body.classList.toggle('keyboard-open', open);
  if (open) {
    root.style.setProperty('--vv-h', `${Math.round(view.height)}px`); root.style.setProperty('--vv-top', `${Math.round(view.offsetTop)}px`);
    if (opening) requestAnimationFrame(() => document.activeElement?.scrollIntoView({ block: 'nearest' })); // within the text panel
  } else {
    root.style.removeProperty('--vv-h'); root.style.removeProperty('--vv-top');
    if (scrollX || scrollY) scrollTo(0, 0);
  }
}
visualViewport?.addEventListener('resize', syncKeyboard);
visualViewport?.addEventListener('scroll', syncKeyboard);
document.addEventListener('focusout', () => setTimeout(syncKeyboard, 50));
elements.advSections.addEventListener('click', event => {
  const chip = event.target.closest('[data-chip]'); if (chip) { editChipValue(chip); return; }
  const row = event.target.closest('[data-pick]'); if (row && !row.disabled) pickOption(row, row.dataset.pick);
});
// Touch double-tap on a slider or its label resets it (mobile browsers don't fire dblclick on range inputs).
let lastTap = null; let tapStart = null;
elements.advSections.addEventListener('pointerdown', event => { tapStart = { x: event.clientX, y: event.clientY, time: event.timeStamp }; });
elements.advSections.addEventListener('pointerup', event => {
  if (!sheetQuery.matches || event.pointerType === 'mouse' || !tapStart) return;
  const target = event.target.closest('.adv-slider input[type=range], .adv-slider label');
  const isTap = Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) < 10 && event.timeStamp - tapStart.time < 300;
  if (!target || !isTap) { lastTap = null; return; }
  const path = target.dataset.path || document.getElementById(target.htmlFor)?.dataset.path;
  if (lastTap?.path === path && event.timeStamp - lastTap.time < 350) { lastTap = null; resetAdvanced(path); return; }
  lastTap = { path, time: event.timeStamp };
});

// ---------- Film sheet: dial view (focus view, SPEC §5) ----------
// Same params and stage as the list; the dial edits one slider of the stage at a time.
const isSliderControl = control => control.kind === 'float' || control.kind === 'vec2';
/** Controls of the current stage that the list shows now (switch groups and engine rules hide some). */
function dialControls(module) {
  const section = module.sections.find(item => item.id === state.advStep); if (!section) return [];
  return section.controls.filter(control => {
    if (!control.path || control.hidden || !['float', 'vec2', 'bool', 'select'].includes(control.kind)) return false;
    const element = elements.advSections.querySelector(`[data-path="${control.path}"]`);
    return element && !element.closest('.adv-control')?.hidden;
  });
}
function syncDial() {
  const module = activeModule();
  const on = Boolean(module) && engine.builtFor === state.engine && sheetQuery.matches && isFilm() && dial.view === 'dial';
  document.body.classList.toggle('film-dial', on);
  elements.advDial.hidden = !on;
  elements.sheetView.setAttribute('aria-pressed', dial.view === 'dial');
  if (!on) return;
  const params = advParams(); const controls = dialControls(module);
  const sliders = controls.filter(isSliderControl);
  if (!sliders.some(control => control.path === dial.paths[state.advStep])) dial.paths[state.advStep] = sliders[0]?.path;
  const path = dial.paths[state.advStep];
  const key = `${state.engine}|${state.advStep}|${controls.map(control => control.path).join(',')}`;
  if (key !== dial.chipsKey) {
    dial.chipsKey = key;
    const esc = value => String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
    elements.dialChips.innerHTML = controls.map(control => {
      const role = control.kind === 'bool' ? ' role="switch"' : control.kind === 'select' ? ' aria-haspopup="listbox" aria-expanded="false"' : '';
      return `<button class="dial-chip" type="button" data-dial="${control.path}"${role}><span class="dial-chip-name">${esc(control.label)}</span><span class="dial-chip-value"></span><span class="dial-chip-dot" aria-hidden="true"></span><span class="visually-hidden dial-chip-edited">, edited</span></button>`;
    }).join('');
  }
  elements.dialChips.querySelectorAll('[data-dial]').forEach(chip => {
    const control = module.controlByPath[chip.dataset.dial]; const value = params[control.path];
    chip.querySelector('.dial-chip-value').textContent = control.kind === 'bool' ? (value ? 'On' : 'Off') : control.kind === 'select' ? module.optionLabel(value, control.path) : module.formatValue(control, value);
    const edited = module.isChanged(params, control.path);
    chip.classList.toggle('is-edited', edited); chip.querySelector('.dial-chip-edited').hidden = !edited;
    chip.disabled = Boolean(elements.advSections.querySelector(`[data-path="${control.path}"]`)?.disabled);
    if (control.kind === 'bool') chip.setAttribute('aria-checked', Boolean(value));
    else if (isSliderControl(control)) chip.setAttribute('aria-pressed', control.path === path);
  });
  elements.dialBody.hidden = !path;
  elements.dialEmpty.hidden = Boolean(path) || !controls.length;
  if (!path) return;
  const control = module.controlByPath[path];
  const value = module.sliderValue(control, params[path]);
  const fallback = module.sliderValue(control, module.defaultFor ? module.defaultFor(params, path) : control.default);
  const text = module.formatValue(control, params[path]);
  elements.dialLabel.textContent = control.label; elements.dialValue.textContent = text;
  elements.dialValue.classList.toggle('is-edited', module.isChanged(params, path));
  elements.dialReset.hidden = !module.isChanged(params, path); elements.dialResetText.textContent = `Reset ${control.label}`;
  const input = elements.dialInput;
  if (input.min !== String(control.min) || input.max !== String(control.max)) { input.min = control.min; input.max = control.max; }
  input.step = control.step;
  if (document.activeElement !== input || Number(input.value) !== value) input.value = value;
  input.setAttribute('aria-valuetext', text);
  // Ruler: ≥1px per step, the whole range at least ~320px; minor ticks ≥8px apart, a major tick every 5.
  const steps = Math.max(1, Math.round((control.max - control.min) / control.step));
  const px = dial.px = Math.min(12, Math.max(1, 320 / steps));
  const minor = Math.ceil(8 / px) * px;
  const scale = elements.dialScale;
  scale.style.width = `${steps * px + 2}px`;
  scale.style.setProperty('--minor', `${minor}px`); scale.style.setProperty('--major', `${minor * 5}px`);
  elements.dialDefault.style.left = `${(fallback - control.min) / control.step * px}px`;
  scale.style.transform = `translateX(${elements.dialRuler.clientWidth / 2 - (value - control.min) / control.step * px - 1}px)`;
}
/** One panel sync per frame while dragging the ruler. */
function requestDialSync() {
  if (dial.frame) return;
  dial.frame = requestAnimationFrame(() => { dial.frame = 0; syncAdvancedPanel(); syncLooks(); });
}
elements.sheetView.addEventListener('click', () => {
  dial.view = dial.view === 'dial' ? 'list' : 'dial';
  try { localStorage.setItem(VIEW_KEY, dial.view); } catch { /* remembered for this visit only */ }
  syncAdvancedPanel();
});
elements.dialChips.addEventListener('click', event => {
  const chip = event.target.closest('[data-dial]'); const module = activeModule();
  if (!chip || chip.disabled || !module) return;
  const path = chip.dataset.dial; const control = module.controlByPath[path];
  if (control.kind === 'bool') change(() => { setAdvancedValue(path, !advParams()[path]); });
  else if (control.kind === 'select') pickOption(chip, path);
  else { dial.paths[state.advStep] = path; syncDial(); }
});
elements.dialReset.addEventListener('click', () => { const path = dial.paths[state.advStep]; if (path) resetAdvanced(path); });
bindHistorySlider(elements.advDial, '#dialInput', input => {
  const path = dial.paths[state.advStep]; if (!path) return;
  setAdvancedValue(path, input.value); syncAdvancedPanel(); syncLooks(); scheduleRender();
});
// Drag the ruler under the fixed needle: dragging left raises the value, one step per `dial.px` pixels.
elements.dialRuler.addEventListener('pointerdown', event => {
  const module = activeModule(); const path = dial.paths[state.advStep]; if (!module || !path) return;
  const control = module.controlByPath[path];
  dial.drag = { path, control, x: event.clientX, start: module.sliderValue(control, advParams()[path]), previous: snapshot() };
  elements.dialRuler.setPointerCapture(event.pointerId);
});
elements.dialRuler.addEventListener('pointermove', event => {
  const drag = dial.drag; const module = activeModule(); if (!drag || !module) return;
  const value = snapToStep(drag.control, drag.start + Math.round((drag.x - event.clientX) / dial.px) * drag.control.step);
  if (value === module.sliderValue(drag.control, advParams()[drag.path])) return;
  setAdvancedValue(drag.path, value); requestDialSync(); scheduleRender();
});
const endDialDrag = () => { if (!dial.drag) return; commit(dial.drag.previous); dial.drag = null; syncAdvancedPanel(); syncLooks(); };
elements.dialRuler.addEventListener('pointerup', endDialDrag);
elements.dialRuler.addEventListener('pointercancel', endDialDrag);
addEventListener('resize', () => { if (dial.view === 'dial') syncDial(); });

// Home screen modes: Photo Editor (before/after sample) or Collage Studio (sample collage). "Select photos" opens
// the picked photos straight into a collage.
let startCollagePending = false;
function setStartMode(mode) {
  document.querySelectorAll('.start-mode').forEach(card => {
    const on = card.dataset.mode === mode;
    card.classList.toggle('is-selected', on); card.querySelector('.start-mode-pick').setAttribute('aria-pressed', on);
  });
  $('#startCompare').hidden = mode !== 'edit'; $('#startCollage').hidden = mode !== 'collage';
  if (mode === 'collage') renderStartCollage();
}
$('#startModes').addEventListener('click', event => { const card = event.target.closest('.start-mode'); if (card) setStartMode(card.dataset.mode); });
$('#startCollageButton').addEventListener('click', () => { startCollagePending = true; elements.fileInput.click(); });
elements.fileInput.addEventListener('cancel', () => { startCollagePending = false; });
elements.fileInput.addEventListener('change', async event => {
  const forCollage = startCollagePending; startCollagePending = false;
  const opened = await addFiles(event.target.files);
  if (!forCollage || !opened.length || collage.active) return;
  if (opened.length >= 2) { app.selected = new Set(opened.map(photo => photo.id)); syncStrip(); }
  if (app.photos.length < 2) startCollagePending = true; // enterCollage asks for one more photo
  enterCollage();
});
$('#chooseButton').addEventListener('click', () => elements.fileInput.click());
$('#sampleButton').addEventListener('click', loadSample);
$('#cameraButton').addEventListener('click', openCamera);
$('#cameraFallback').addEventListener('click', () => elements.cameraInput.click());
elements.fileMenu.addEventListener('click', event => {
  const open = event.target.closest('[data-collage-open]'), remove = event.target.closest('[data-collage-delete]');
  if (open) { elements.fileMenu.hidePopover(); openSavedCollage(open.dataset.collageOpen); return; }
  if (remove) { const saved = collageStore.get(remove.dataset.collageDelete); if (saved && confirm(`Delete ${saved.name}?`)) { collageStore.remove(saved.id); if (activeCollageId === saved.id) activeCollageId = null; syncSavedCollages(); } return; }
  const item = event.target.closest('[data-action]'); if (!item) return;
  elements.fileMenu.hidePopover();
  if (item.dataset.action === 'open') elements.fileInput.click(); else if (item.dataset.action === 'collage') enterCollage(); else openCamera();
});
elements.fileMenu.addEventListener('toggle', event => {
  if (event.newState !== 'open') return;
  const rect = elements.fileChip.getBoundingClientRect();
  elements.fileMenu.style.left = `${Math.max(8, rect.left)}px`;
  elements.fileMenu.style.top = `${rect.bottom + 6}px`;
  elements.fileMenu.querySelector('[data-action]').focus();
});
elements.fileMenu.addEventListener('keydown', event => {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  const items = [...elements.fileMenu.querySelectorAll('[data-action]:not([hidden]),[data-collage-open],[data-collage-delete]')];
  const next = items[(items.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
  event.preventDefault(); next.focus();
});

elements.cameraInput.addEventListener('change', event => { stopCamera(); elements.cameraDialog.close(); addFiles(event.target.files); });
$('#cameraClose').addEventListener('click', () => elements.cameraDialog.close());
elements.cameraDialog.addEventListener('close', stopCamera);
elements.capturePhoto.addEventListener('click', captureCameraPhoto);
elements.switchCamera.addEventListener('click', () => { cameraFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment'; startCamera(); });

['dragenter', 'dragover'].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.remove('dragover'); }));
elements.dropZone.addEventListener('drop', event => { if (collage.active) { toast('Go back to the photo to add more photos.'); return; } addFiles(event.dataTransfer.files); });

document.querySelectorAll('.control-tabs [role=tab]').forEach(tab => {
  tab.addEventListener('click', () => setTab(tab));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll('.control-tabs [role=tab]')];
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(tabs.indexOf(tab) + direction + tabs.length) % tabs.length];
    event.preventDefault(); setTab(next); next.focus();
  });
});

// Strength slider: one history entry per drag / keyboard session, like the Adjust sliders.
elements.strength.addEventListener('pointerdown', () => { sliderStart = snapshot(); });
elements.strength.addEventListener('focus', () => { if (!sliderStart) sliderStart = snapshot(); });
elements.strength.addEventListener('input', () => { state.strength = Number(elements.strength.value); syncLooks(); syncAdjustments(); scheduleRender(); });
elements.strength.addEventListener('change', () => { commit(sliderStart || snapshot()); sliderStart = snapshot(); });
elements.strength.addEventListener('blur', () => { sliderStart = null; });
elements.favorite.addEventListener('click', toggleFavorite);

// Hold to compare: pointer, Space/Enter on the button, or the \ key anywhere.
const hold = elements.holdButton;
hold.addEventListener('pointerdown', event => { if (event.button === 0) setHolding(true); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(type => hold.addEventListener(type, () => setHolding(false)));
hold.addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setHolding(true); } });
hold.addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setHolding(false); } });
hold.addEventListener('blur', () => setHolding(false));
hold.addEventListener('contextmenu', event => event.preventDefault());
hold.addEventListener('click', event => event.preventDefault());
window.addEventListener('blur', () => setHolding(false));
document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => setZoom(button.dataset.zoom)));
$('#zoomIn').addEventListener('click', () => stepZoom(1)); $('#zoomOut').addEventListener('click', () => stepZoom(-1));

elements.undo.addEventListener('click', undo); elements.redo.addEventListener('click', redo);
elements.revert.addEventListener('click', () => change(() => { state.engine = PRESETS; state.myLookId = null; state.presetId = 'original'; state.strength = 100; state.edits = {}; state.crop = { ...defaultCrop }; state.frame = { id: 'none', border: { ...defaultBorder } }; state.text = []; state.optics = defaultOptics(); }));
$('#resetAdjustments').addEventListener('click', () => change(() => { state.edits = {}; }));
$('#surpriseButton').addEventListener('click', async () => {
  // Film looks only when their engine needs no download: Surprise me never starts one.
  const isCurrent = id => id === (isFilm() ? state.myLookId : state.presetId);
  const basic = presets.filter(p => !isCurrent(p.id) && p.id !== 'original');
  const film = filmTileLooks.filter(look => !isCurrent(look.id) && engineReady(pickEngineFor(look)));
  const matching = [...basic.filter(filterMatches), ...film.filter(filmFilterMatches)];
  const pool = matching.length ? matching : basic;
  if (!pool.length) { toast('Surprise me uses film looks that are already downloaded. Pick a film look first.'); return; }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (filmLookById(pick.id)) await pickFilmLook(pick.id); else pickLook(pick.id);
  elements.lookGrid.querySelector(`[data-preset="${pick.id}"],[data-film="${pick.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

elements.export.addEventListener('click', openExport);
$('#exportClose').addEventListener('click', () => elements.exportDialog.close());
elements.exportDialog.addEventListener('close', () => clearTimeout(prepareTimer));
elements.exportDialog.addEventListener('click', event => { if (event.target === elements.exportDialog) elements.exportDialog.close(); });
elements.exportForm.addEventListener('submit', event => { event.preventDefault(); downloadPhoto(); });
elements.shareButton.addEventListener('click', sharePhoto);
$('#formatOptions').addEventListener('click', event => { const button = event.target.closest('[data-format]'); if (!button) return; state.exportFormat = button.dataset.format; syncExportOptions(); schedulePrepare(); });
$('#sizeOptions').addEventListener('click', event => { const button = event.target.closest('[data-size]'); if (!button || button.disabled) return; state.exportSize = button.dataset.size; syncExportOptions(); schedulePrepare(); });
elements.quality.addEventListener('input', () => { syncExportOptions(); schedulePrepare(400); });
// ---------- Full screen: the edited photo with its text (no selection box). Esc or ✕ closes. ----------
// The dialog fills the window; where the browser allows it (desktop), it also goes truly full screen.
const fullscreen = { dialog: $('#fullscreenDialog'), canvas: $('#fullscreenCanvas'), button: $('#fullscreenButton'), hold: $('#fullscreenHold') };
/** The edited photo with its text, or the original while Hold to compare is held. */
function drawFullscreen() {
  if (!$('#fullscreenDialog').open) return; // (setHolding may run before `fullscreen` below is initialised)
  const edited = state.editedCanvas, original = state.holding && state.originalCanvas;
  $('#fullscreenBadge').hidden = !original; fullscreen.hold.classList.toggle('is-holding', Boolean(original));
  if (!edited) return;
  const canvas = fullscreen.canvas; canvas.width = edited.width; canvas.height = edited.height;
  const ctx = canvas.getContext('2d');
  if (original) { ctx.drawImage(original, 0, 0, canvas.width, canvas.height); return; }
  ctx.drawImage(edited, 0, 0);
  if (edited.photoRect && state.text.length) drawTexts(ctx, edited.photoRect, state.text);
}
function openFullscreen() {
  if (!state.editedCanvas) return;
  setHolding(false);
  fullscreen.dialog.showModal(); drawFullscreen();
  fullscreen.dialog.requestFullscreen?.().catch(() => { /* window-sized is fine (iPhone, or not allowed) */ });
}
function closeFullscreen() { if (fullscreen.dialog.open) fullscreen.dialog.close(); }
fullscreen.button.addEventListener('click', openFullscreen);
$('#fullscreenClose').addEventListener('click', closeFullscreen);
// In browser full screen, Esc leaves full screen first (no keydown reaches the page): close the dialog with it.
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) closeFullscreen(); });
// Hold to compare in full screen: pointer, Space/Enter on the button, or the \ key (document handler).
fullscreen.hold.addEventListener('pointerdown', event => { if (event.button === 0) setHolding(true); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(type => fullscreen.hold.addEventListener(type, () => setHolding(false)));
fullscreen.hold.addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setHolding(true); } });
fullscreen.hold.addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setHolding(false); } });
fullscreen.hold.addEventListener('blur', () => setHolding(false));
fullscreen.hold.addEventListener('contextmenu', event => event.preventDefault());
let fullscreenHold = null; // press and hold on the photo, like the editor
fullscreen.canvas.addEventListener('pointerdown', event => { if (event.button === 0) { clearTimeout(fullscreenHold); fullscreenHold = setTimeout(() => setHolding(true), HOLD_DELAY); } });
['pointerup', 'pointercancel', 'pointerleave'].forEach(type => fullscreen.canvas.addEventListener(type, () => { clearTimeout(fullscreenHold); setHolding(false); }));
fullscreen.canvas.addEventListener('contextmenu', event => event.preventDefault());
fullscreen.dialog.addEventListener('close', () => {
  setHolding(false);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  fullscreen.button.focus();
});

$('#aboutButton').addEventListener('click', () => elements.aboutDialog.showModal()); $('#startAbout').addEventListener('click', () => elements.aboutDialog.showModal()); $('#aboutClose').addEventListener('click', () => elements.aboutDialog.close());
// Both About buttons open the same dialog; refresh the saved-engines line whenever it opens.
new MutationObserver(() => { if (elements.aboutDialog.open) syncEngineStorage(); }).observe(elements.aboutDialog, { attributes: true, attributeFilter: ['open'] });
$('#engineStorageRemove').addEventListener('click', removeSavedEngines);

document.addEventListener('keydown', event => {
  // Undo/redo keys: not in a text field (it has its own undo) or a dialog; sliders and buttons keep them.
  const history = (event.ctrlKey || event.metaKey) && !document.querySelector('dialog[open]')
    && !event.target.closest?.('textarea,[contenteditable],input:not([type=range],[type=checkbox],[type=radio],[type=button],[type=color],[type=file])');
  if (collage.active) { // the collage's own history; Esc goes back to the photo
    if (history && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    else if (history && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
    else if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog[open]') && !popoverOpen()) { event.preventDefault(); if (!collage.escape()) exitCollage(); }
    return;
  }
  if (history && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  if (history && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
  if (event.key === '\\' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); if (!event.repeat) setHolding(true); }
  // Zoom keys (desktop): + / = in, − out, 0 Fit. Not while typing, in a dialog or on the Crop tab.
  const typing = event.target.closest?.('input,textarea,select,[contenteditable]') || document.querySelector('dialog[open]');
  if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && state.image && document.body.dataset.tab !== 'crop' && !mobileQuery.matches) {
    if (event.key === '+' || event.key === '=') { event.preventDefault(); stepZoom(1); }
    else if (event.key === '-') { event.preventDefault(); stepZoom(-1); }
    else if (event.key === '0') { event.preventDefault(); setZoom('fit'); }
  }
});
document.addEventListener('keyup', event => { if (event.key === '\\') setHolding(false); });

// Boot splash (#splash): every load plays the camera → print → develop sequence to the end (its own CSS animations,
// however late a slow first load starts them), then waits up to 3 s more for the home screen (fonts + sample photo).
{
  const splash = $('#splash'), still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = ms => new Promise(done => setTimeout(done, Math.max(0, ms)));
  const developed = Promise.all(splash.getAnimations({ subtree: true })
    .filter(animation => animation.animationName !== 'splash-failsafe' && animation.effect.getComputedTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => {})));
  const homeReady = Promise.all([document.fonts.ready, $('#startComparePhoto img').decode().catch(() => {})]);
  const lift = () => { splash.classList.add('is-done'); setTimeout(() => splash.remove(), still ? 0 : 600); };
  developed.then(() => Promise.race([homeReady, wait(3000)])).then(() => {
    splash.style.animation = 'none'; // the CSS failsafe must not cut the hand-off short
    // Fully ejected print + home print on screen: fly the print onto the home sample so it becomes it.
    const card = splash.querySelector('.splash-print'), target = $('#startPrint');
    const from = card.getBoundingClientRect(), to = target.getBoundingClientRect();
    const ejected = card.getAnimations().every(animation => animation.playState === 'finished');
    if (still || !ejected || !to.width || to.top >= innerHeight || to.bottom <= 0 || document.body.classList.contains('has-image')) return lift();
    const dx = to.left - from.left, dy = to.top - from.top, scale = to.width / from.width;
    card.style.transformOrigin = '0 0';
    splash.classList.add('is-flying'); document.body.classList.add('splash-flying');
    card.animate([
      { transform: 'none' },
      { transform: `translate(${dx / 2}px, ${dy / 2 - 28}px) scale(${(1 + scale) / 2}) rotate(-2deg)`, offset: .5 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, backgroundColor: getComputedStyle(target).backgroundColor }
    ], { duration: 950, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }).finished.then(() => {
      document.body.classList.remove('splash-flying'); splash.classList.add('is-landed');
      setTimeout(() => splash.remove(), 450);
    }, lift);
  });
}
