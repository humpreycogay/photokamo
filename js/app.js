import { presets, frames, borderSizes, paperColors, defaultBorder, adjustmentSections, defaultAdjustments } from './presets.js';
import { renderImage, frameCanvas, applyAdjustments } from './renderer.js';
// Film engines are NOT imported here: registry.js is a tiny list, and an engine's code,
// worker and data load only when it is chosen as the engine (activateEngine).
import { engines, legacyEngineId, engineById, loadEngine, loadCredits } from './engines/registry.js';
import { buildAdvanced, syncAdvanced, engineAboutHtml, creditHtml } from './advanced-ui.js';
import { createEnginePicker } from './engine-picker.js';

const $ = selector => document.querySelector(selector);
const elements = {
  fileInput: $('#fileInput'), cameraInput: $('#cameraInput'), dropZone: $('#dropZone'), emptyState: $('#emptyState'),
  viewport: $('#viewport'), canvasWrap: $('#canvasWrap'), canvas: $('#previewCanvas'), processing: $('#processing'), originalBadge: $('#originalBadge'),
  viewPill: $('#viewPill'), holdButton: $('#holdButton'), fileChip: $('#fileChip'), fileMenu: $('#fileMenu'), fileName: $('#fileName'), fileSize: $('#fileSize'),
  lookGroup: $('#lookGroup'), lookName: $('#lookName'), lookDesc: $('#lookDesc'), favorite: $('#favoriteButton'),
  strength: $('#strengthSlider'), strengthOutput: $('#strengthOutput'), lookFilters: $('#lookFilters'), lookGrid: $('#lookGrid'),
  adjustmentControls: $('#adjustmentControls'), adjustBadge: $('#adjustBadge'), frameGrid: $('#frameGrid'),
  undo: $('#undoButton'), redo: $('#redoButton'), revert: $('#revertButton'), export: $('#exportButton'),
  exportDialog: $('#exportDialog'), exportForm: $('#exportForm'), quality: $('#exportQuality'), qualityOutput: $('#qualityOutput'), qualityGroup: $('#qualityGroup'),
  exportSummary: $('#exportSummary'), shareButton: $('#shareButton'), downloadButton: $('#confirmExport'), exportStatus: $('#exportStatus'),
  fullSizeDetail: $('#fullSizeDetail'), shareSizeDetail: $('#shareSizeDetail'), photoLookBadge: $('#photoLookBadge'),
  maName: $('#maName'), maValue: $('#maValue'), maReset: $('#maReset'), maSlider: $('#maSlider'), maZero: $('#maZero'), maGroups: $('#maGroups'), maTools: $('#maTools'),
  cameraDialog: $('#cameraDialog'), cameraPreview: $('#cameraPreview'), cameraStatus: $('#cameraStatus'),
  capturePhoto: $('#capturePhoto'), switchCamera: $('#switchCamera'), aboutDialog: $('#aboutDialog'), toast: $('#toast'),
  advancedPanel: $('#advancedPanel'), advPipeline: $('#advPipeline'), advSections: $('#advSections'),
  renderText: $('#renderText'), renderDetail: $('#renderDetail'), renderFull: $('#renderFullButton'), renderCancel: $('#renderCancelButton'),
  renderProgress: $('#renderProgress'), renderProgressBar: $('#renderProgressBar'),
  engineButton: $('#engineButton'), engineList: $('#engineList'), engineStatus: $('#engineStatus'), engineStatusText: $('#engineStatusText'),
  engineRetry: $('#engineRetry'),
  engineAboutButton: $('#engineAboutButton'), engineAboutDialog: $('#engineAboutDialog'), engineAboutBody: $('#engineAboutBody'),
  advCredit: $('#advCredit'), advNote: $('#advNote'), presetsView: $('#presetsView'), borderPanel: $('#borderPanel'),
  engineWait: $('#engineWait'), engineWaitTitle: $('#engineWaitTitle'), engineWaitSub: $('#engineWaitSub'), engineWaitProgress: $('#engineWaitProgress'), engineWaitRetry: $('#engineWaitRetry')
};

// Look state: the effective value of each adjustment is
//   original + (look - original) * strength + edit
// so a look can be dialled back with Strength, and Adjust edits sit on top of it.
const state = {
  image: null, imageId: 0, filename: 'photo', presetId: 'original', strength: 100, edits: {}, frame: { id: 'none', border: { ...defaultBorder } },
  filter: 'All', zoom: 'fit', holding: false, mobileTool: 'exposure',
  exportFormat: 'image/jpeg', exportSize: 'full',
  // The engine: 'presets' (the looks above) or a film engine id, and each film engine's own settings ({ [engineId]: params }).
  engine: 'presets', engineParams: {}, myLookId: null, imageBitmap: null,
  advOpen: new Set(), advStep: null,
  renderQuality: 'preview', renderAbort: null,
  undo: [], redo: [], editedCanvas: null, originalCanvas: null, originalKey: '', renderToken: 0
};
let toastTimer;
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
const mobileQuery = matchMedia('(max-width: 900px)');

const CATEGORY = { 'Utility': 'Camera', 'Camera looks': 'Camera', 'Film stocks': 'Film', 'Creative styles': 'Creative' };
const controlSpec = Object.fromEntries(adjustmentSections.flatMap(section => section.controls).map(([id, label, min, max, step, suffix]) => [id, { id, label, min, max, step, suffix }]));

const PRESETS = 'presets';
const isFilm = () => state.engine !== PRESETS;
const currentPreset = () => presets.find(item => item.id === state.presetId) || presets[0];
function groupLabel(preset) {
  if (preset.group === 'Utility') return 'Utility';
  if (preset.group === 'Camera looks') return 'Camera look';
  if (preset.group === 'Creative styles') return 'Creative style';
  return preset.engine.includes('inspired') ? `Film stock · ${preset.engine}` : 'Film stock';
}

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
const cloneFrame = frame => (typeof frame === 'string' ? { id: frame, border: { ...defaultBorder } } : { id: frame.id, border: { ...defaultBorder, ...frame.border } });
// A snapshot has the shape of a photo's settings (SPEC §2): { look, edits, frame }.
function snapshot() { return { look: { engine: state.engine, presetId: state.presetId, strength: state.strength, engineParams: cloneEngineParams(state.engineParams), myLookId: state.myLookId }, edits: { ...state.edits }, frame: cloneFrame(state.frame) }; }
// Older snapshots were flat, with mode 'simple' | 'advanced' next to the engine.
function migrateSnapshot(value) {
  if (value.look) return value;
  const { presetId = 'original', strength = 100, engineParams = {}, myLookId = null, edits = {}, frame = 'none' } = value;
  const engineId = value.mode === 'advanced' && engineById(value.engine) ? value.engine : PRESETS;
  return { look: { engine: engineId, presetId, strength, engineParams, myLookId }, edits, frame };
}
function restore(value) {
  const { look, edits, frame } = migrateSnapshot(value);
  state.engine = look.engine; state.presetId = look.presetId; state.strength = look.strength;
  state.engineParams = cloneEngineParams(look.engineParams); state.myLookId = look.myLookId;
  state.edits = { ...edits }; state.frame = cloneFrame(frame);
  syncControls(); scheduleRender(); // syncControls loads the engine if the restored one isn't active
}
function sameSnapshot(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function commit(previous = snapshot()) { if (!sameSnapshot(previous, snapshot())) { state.undo.push(previous); if (state.undo.length > 50) state.undo.shift(); state.redo = []; updateButtons(); } }
function undo() { if (!state.undo.length) return; state.redo.push(snapshot()); restore(state.undo.pop()); updateButtons(); }
function redo() { if (!state.redo.length) return; state.undo.push(snapshot()); restore(state.redo.pop()); updateButtons(); }
function updateButtons() { elements.undo.disabled = !state.undo.length; elements.redo.disabled = !state.redo.length; }
function toast(message) { clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.classList.add('show'); toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2600); }
function change(mutator) { const previous = snapshot(); mutator(); commit(previous); syncControls(); scheduleRender(); }
function pickLook(id) {
  change(() => { state.presetId = id; state.edits = {}; state.engine = PRESETS; state.myLookId = null; });
}

// ---------- Favorites ----------
function loadFavorites() { try { const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); return Array.isArray(value) ? value.filter(id => presets.some(p => p.id === id)) : []; } catch { return []; } }
let favorites = loadFavorites();
function saveFavorites() { try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch { /* storage unavailable: favorites last for this visit only */ } }
function toggleFavorite() {
  const id = state.presetId;
  favorites = favorites.includes(id) ? favorites.filter(item => item !== id) : [...favorites, id];
  saveFavorites();
  if (state.filter === 'Favorites' && !favorites.length) state.filter = 'All';
  toast(favorites.includes(id) ? `${currentPreset().name} added to favorites.` : `${currentPreset().name} removed from favorites.`);
  syncLooks();
}

// ---------- My looks (saved Advanced settings, per engine) ----------
// A look is { id, name, engine, params, thumb }. Looks saved before engines existed have no
// `engine`: they belong to spektrafilm-rs. Params are normalized by the engine when picked.
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
const currentMyLook = () => myLooks.find(look => look.id === state.myLookId) || null;
function buildMyLookTiles() {
  elements.lookGrid.querySelectorAll('[data-mine]').forEach(tile => tile.remove());
  for (const look of myLooks) {
    const tile = document.createElement('button');
    tile.className = 'look-tile'; tile.type = 'button'; tile.dataset.mine = look.id; tile.setAttribute('aria-pressed', 'false');
    tile.innerHTML = '<span class="look-thumb" aria-hidden="true"><img alt=""></span><span class="look-tile-name"></span>';
    tile.querySelector('.look-tile-name').textContent = look.name;
    if (typeof look.thumb === 'string' && look.thumb.startsWith('data:image/jpeg')) {
      tile.querySelector('img').src = look.thumb;
      tile.querySelector('.look-thumb').classList.add('has-preview');
    }
    elements.lookGrid.prepend(tile);
  }
}
async function pickMyLook(id) {
  const look = myLooks.find(item => item.id === id); if (!look) return;
  let module;
  try { module = await loadEngine(look.engine); }
  catch (error) { console.error(error); toast(`The ${engineById(look.engine).label} engine could not be loaded. Check your connection and try again.`); return; }
  change(() => { state.engine = look.engine; state.engineParams[look.engine] = module.normalizeParams(look.params); state.myLookId = id; });
}
function saveAsMyLook() {
  const params = advParams(); if (!params) return;
  const suggested = `My look ${myLooks.length + 1}`;
  const name = prompt('Name this look', currentMyLook()?.name || suggested);
  if (name === null) return;
  const look = { id: `mine-${Date.now().toString(36)}`, name: name.trim().slice(0, 40) || suggested, engine: state.engine, params: cloneParams(params), thumb: previewThumbnail() };
  myLooks = [...myLooks, look];
  const stored = saveMyLooks();
  buildMyLookTiles();
  change(() => { state.myLookId = look.id; });
  toast(stored ? `Saved “${look.name}”. Find it under Mine in Looks.` : `Saved “${look.name}” for this visit only (browser storage is unavailable).`);
}

// ---------- Looks panel ----------
function buildLooks() {
  elements.lookGrid.innerHTML = presets.map(preset => `<button class="look-tile" type="button" data-preset="${preset.id}" aria-pressed="false"><span class="look-thumb" aria-hidden="true"><canvas width="200" height="200"></canvas></span><span class="look-tile-name">${preset.name}</span></button>`).join('');
  elements.lookGrid.addEventListener('click', event => {
    const tile = event.target.closest('[data-preset],[data-mine]'); if (!tile) return;
    if (tile.dataset.mine) pickMyLook(tile.dataset.mine); else pickLook(tile.dataset.preset);
  });
  buildMyLookTiles();
  elements.lookFilters.addEventListener('click', event => {
    const chip = event.target.closest('[data-filter]'); if (!chip) return;
    state.filter = chip.dataset.filter; syncLooks();
  });
  renderPresetPreviews();
}
function filterMatches(preset) {
  if (state.filter === 'All') return true;
  if (state.filter === 'Favorites') return favorites.includes(preset.id);
  if (state.filter === 'Mine') return false;
  return CATEGORY[preset.group] === state.filter;
}
function syncLooks() {
  const preset = currentPreset();
  const filters = ['All', 'Camera', 'Film', 'Creative', ...(myLooks.length ? ['Mine'] : []), ...(favorites.length ? ['Favorites'] : [])];
  const advanced = isFilm();
  if (!filters.includes(state.filter)) state.filter = 'All';
  elements.lookFilters.innerHTML = filters.map(filter => `<button class="chip" type="button" data-filter="${filter}" aria-pressed="${filter === state.filter}">${filter}</button>`).join('');
  elements.lookGrid.querySelectorAll('[data-preset]').forEach(tile => {
    const item = presets.find(p => p.id === tile.dataset.preset);
    tile.hidden = !filterMatches(item);
    tile.setAttribute('aria-pressed', !advanced && item.id === state.presetId);
  });
  elements.lookGrid.querySelectorAll('[data-mine]').forEach(tile => {
    tile.hidden = !['All', 'Mine'].includes(state.filter);
    tile.setAttribute('aria-pressed', advanced && tile.dataset.mine === state.myLookId);
  });
  elements.favorite.hidden = advanced;
  if (advanced) {
    const mine = currentMyLook();
    const module = activeModule(); const params = advParams();
    const edited = mine && module && JSON.stringify(module.normalizeParams(mine.params)) !== JSON.stringify(params);
    elements.lookGroup.textContent = engineById(state.engine).label;
    elements.lookName.textContent = mine ? (edited ? `${mine.name} · edited` : mine.name) : 'Film edit';
    elements.photoLookBadge.textContent = elements.lookName.textContent;
    elements.lookDesc.textContent = module ? module.stockSummary(params) : 'Loading the film engine…';
    elements.strength.disabled = true;
    elements.strengthOutput.value = '—';
    return;
  }
  elements.lookGroup.textContent = groupLabel(preset);
  elements.lookName.textContent = editCount() ? `${preset.name} · edited` : preset.name;
  elements.photoLookBadge.textContent = elements.lookName.textContent;
  elements.lookDesc.innerHTML = preset.description + (preset.engine === 'Spektrafilm-inspired' ? ' <a href="https://github.com/andreavolpato/spektrafilm" target="_blank" rel="noopener noreferrer">Credits<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 5h5v5"/><path d="M19 5l-9 9"/><path d="M18 14v5H5V6h5"/></svg><span class="visually-hidden"> (opens in a new tab)</span></a>' : '');
  const isFavorite = favorites.includes(preset.id);
  elements.favorite.setAttribute('aria-pressed', isFavorite);
  elements.favorite.setAttribute('aria-label', isFavorite ? `Remove ${preset.name} from favorites` : `Save ${preset.name} to favorites`);
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

function renderStartPreview(image) {
  document.querySelectorAll('[data-start-look]').forEach(canvas => {
    const preset = presets.find(item => item.id === canvas.dataset.startLook);
    try {
      const preview = renderImage(image, preset.values, 'none', 900);
      const ctx = canvas.getContext('2d');
      const focusX = Number(canvas.dataset.focus);
      const scale = Math.max(canvas.width / preview.width, canvas.height / preview.height);
      const sourceWidth = canvas.width / scale, sourceHeight = canvas.height / scale;
      ctx.drawImage(preview, (preview.width - sourceWidth) * focusX, (preview.height - sourceHeight) * .3, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
      canvas.classList.add('is-ready');
    } catch (error) {
      console.warn(`Could not render the ${preset.name} start preview.`, error);
    }
  });
}

async function loadSample() {
  try {
    const response = await fetch(presetPreviewSource);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    await loadFile(new File([blob], 'sample-portrait.jpg', { type: blob.type || 'image/jpeg' }));
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
  }, error => console.warn(error.message));
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

// ---------- Frames ----------
function buildFrames() {
  elements.frameGrid.innerHTML = frames.map(frame => `<button class="frame-card" type="button" data-frame="${frame.id}" aria-pressed="false"><span class="frame-sample"><i></i></span><strong>${frame.name}</strong><small>${frame.description}</small></button>`).join('');
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
function renderFrame() {
  const { id, border } = state.frame;
  if (id !== 'paper') return id;
  const color = (border.matchPaper && matchedPaper()) || border.color;
  return { id, width: border.width, bottom: border.bottom, paper: (paperColors.find(item => item.id === color) || paperColors[1]).hex };
}
function syncFrames() {
  const { id, border } = state.frame;
  document.querySelectorAll('[data-frame]').forEach(card => card.setAttribute('aria-pressed', card.dataset.frame === id));
  elements.borderPanel.hidden = id !== 'paper';
  const setRadios = (group, attribute, value) => {
    const buttons = [...group.querySelectorAll(`[${attribute}]`)];
    buttons.forEach(button => { const checked = button.getAttribute(attribute) === value; button.setAttribute('aria-checked', checked); button.tabIndex = checked ? 0 : -1; });
    if (!buttons.some(button => button.tabIndex === 0)) buttons[0].tabIndex = 0;
  };
  setRadios($('#borderSizes'), 'data-border-size', border.size);
  for (const [key, output, prefix] of [['width', '#borderWidthOutput', ''], ['bottom', '#borderBottomOutput', '+']]) {
    const input = elements.borderPanel.querySelector(`[data-border="${key}"]`);
    if (document.activeElement !== input) input.value = border[key];
    $(output).value = `${border[key] ? prefix : ''}${border[key]}%`;
  }
  const tint = matchedPaper();
  const match = $('#matchPaper');
  match.disabled = !tint; match.checked = Boolean(tint && border.matchPaper);
  $('#matchPaperHint').textContent = tint ? '' : 'Available with a film engine that prints on paper.';
  setRadios($('#paperSwatches'), 'data-paper', match.checked ? tint : border.color);
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
    () => { if (activeModule() === module) { setEngineStatus('ready'); if (state.renderQuality === 'preview') syncRenderStatus(); } },
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
const ICONS = {
  presets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M16 3v18M4 8h4M4 13h4M4 18h4M16 8h4M16 13h4M16 18h4"/></svg>'
};
// Engine picker (js/engine-picker.js): names only. Basic (the preset looks), then the film engines.
const enginePicker = createEnginePicker({
  button: elements.engineButton, list: elements.engineList, name: $('#engineButtonName'), status: $('#engineButtonStatus'),
  groups: [
    { id: 'basic', label: 'Basic', items: [{ id: PRESETS, name: 'Basic', icon: ICONS.presets }] },
    { id: 'film', label: 'Film engines', items: engines.map(entry => ({ id: entry.id, name: entry.label, icon: ICONS.film })) }
  ],
  onChoose: id => switchEngine(id),
  place: () => !mobileQuery.matches
});
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
  const title = failed ? `${entry.label} couldn't load` : `Loading ${entry.label}…`;
  const sub = failed ? 'Your changes are saved. Check your connection and retry.' : 'Your changes will show when it’s ready.';
  if (elements.engineWaitTitle.textContent !== title) elements.engineWaitTitle.textContent = title;
  if (elements.engineWaitSub.textContent !== sub) elements.engineWaitSub.textContent = sub;
  elements.engineWaitProgress.textContent = !download ? '' : download.percent == null ? ` ${download.mb} MB` : ` ${download.percent}%`;
  const note = failed ? `${entry.label} couldn't load. Your changes are saved; retry from the photo.` : `${entry.label} isn't ready yet. Changes are saved and will apply when it finishes loading.`;
  document.querySelectorAll('[data-engine-wait]').forEach(element => { element.hidden = false; element.textContent = note; });
}
// The picker button says only "Loading…" while an engine loads or downloads; a failure shows a line with Retry.
function syncEngineBar() {
  syncEngineWait();
  enginePicker.setValue(state.engine);
  elements.engineAboutButton.hidden = !isFilm();
  const status = isFilm() ? engine.status : 'idle';
  enginePicker.setStatus({ loading: 'Loading…', preparing: 'Loading…', failed: 'Couldn’t load' }[status] || '', status === 'failed' ? 'error' : '');
  elements.engineStatus.dataset.state = status;
  elements.engineStatusText.textContent = status === 'failed' ? `${engineById(state.engine).label} couldn’t load. Check your connection and try again.` : '';
  elements.engineRetry.hidden = status !== 'failed';
}
/** Engine dropdown: keeps each engine's own settings and carries over the shared ones (film, exposure, grain, halation).
 *  Adjust edits and the frame stay. One undo step. */
async function switchEngine(id) {
  if (id === state.engine || (id !== PRESETS && !engineById(id))) return;
  if (id === PRESETS) { change(() => { state.engine = PRESETS; state.myLookId = null; }); return; }
  const previous = snapshot();
  const fromModule = activeModule(); const fromParams = advParams();
  state.engine = id; state.myLookId = null;
  syncControls(); // shows the loading state and starts activateEngine
  let module;
  try { module = await activateEngine(id); }
  catch { commit(previous); return; }
  if (state.engine !== id) return;
  if (fromModule?.shared && module.shared && fromParams) {
    const params = advParams();
    for (const [key, fromPath] of Object.entries(fromModule.shared)) {
      const toPath = module.shared[key]; const control = toPath && module.controlByPath[toPath];
      const value = fromParams[fromPath];
      if (!control || typeof value !== typeof params[toPath]) continue;
      if (control.kind === 'select' && !control.options.includes(value)) continue;
      if (control.kind === 'float' && (value < control.min || value > control.max)) continue;
      params[toPath] = value;
    }
  }
  commit(previous); syncControls(); scheduleRender();
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
  syncEngineStorage();
}

// ---------- Advanced panel ----------
function syncAdvancedPanel() {
  syncEngineBar();
  const module = activeModule();
  if (module && engine.builtFor === state.engine) {
    syncAdvanced(advancedRoots, module, advParams(), { open: state.advOpen, current: state.advStep, mobile: mobileQuery.matches });
  }
  document.querySelector('.advanced-panel').classList.toggle('is-loading', !module);
  syncAdvancedNote();
}
function syncAdvancedNote() {
  const module = activeModule();
  elements.advNote.hidden = !(module && state.renderQuality !== 'full' && module.hasSpatialEffects(advParams()));
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
  // An engine may define per-setting defaults that depend on other settings (DuXun: the film's preset).
  const fallback = module.defaultFor ? module.defaultFor(advParams(), path) : module.controlByPath[path].default;
  change(() => { advParams()[path] = Array.isArray(fallback) ? [...fallback] : fallback; });
}
function buildAdvancedPanel() {
  // Desktop: reaching for the picker loads the other engines' code (tens of KB) so a switch
  // starts at once; their large files still wait until the engine is chosen.
  const prefetchEngines = () => {
    if (!matchMedia('(pointer: fine)').matches) return;
    for (const entry of engines) if (entry.id !== state.engine) loadEngine(entry.id).catch(() => {});
  };
  elements.engineButton.addEventListener('pointerenter', prefetchEngines, { once: true });
  elements.engineButton.addEventListener('focus', prefetchEngines, { once: true });
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
  $('#advResetAll').addEventListener('click', () => { const module = activeModule(); if (module) change(() => { state.engineParams[state.engine] = module.defaultParams(); }); });
  $('#saveMyLook').addEventListener('click', saveAsMyLook);
}

// ---------- Engine view: Presets or a film engine, inside the Looks tab ----------
function syncEngineView() {
  const film = isFilm();
  // A film engine is loaded as soon as it is chosen (download + compile start before any render).
  if (film) activateEngine().catch(error => console.error(error));
  const module = activeModule();
  document.body.classList.toggle('is-film', film);
  elements.presetsView.hidden = film; elements.advancedPanel.hidden = !film;
  if (film && state.zoom !== 'fit') { state.zoom = 'fit'; applyZoom(); }
  syncRenderStatus();
}

function syncControls() {
  syncEngineView();
  syncAdvancedPanel();
  syncAdjustments();
  syncFrames();
  syncLooks();
}

// ---------- Rendering ----------
function renderEdge() {
  if (state.zoom === 'fit' || !state.image) return PREVIEW_EDGE;
  return Math.min(ZOOM_MAX_EDGE, Math.max(state.image.naturalWidth, state.image.naturalHeight));
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
  elements.processing.hidden = false;
  setTimeout(() => {
    if (token !== state.renderToken) return;
    try {
      const edge = renderEdge();
      const frame = renderFrame();
      state.editedCanvas = renderImage(state.image, effectiveAdjustments(), frame, edge);
      const originalKey = JSON.stringify([frame, edge]);
      if (state.originalKey !== originalKey) { state.originalCanvas = renderImage(state.image, defaultAdjustments, frame, edge); state.originalKey = originalKey; }
      elements.canvas.width = state.editedCanvas.width; elements.canvas.height = state.editedCanvas.height;
      applyZoom();
      drawPreview();
    } catch (error) {
      console.error(error);
      toast('This photo could not be rendered.');
    } finally {
      elements.processing.hidden = true;
    }
  }, 0);
}
function drawPreview() {
  const source = state.holding ? state.originalCanvas : state.editedCanvas;
  if (!source) return;
  const ctx = elements.canvas.getContext('2d');
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  ctx.drawImage(source, 0, 0, elements.canvas.width, elements.canvas.height);
}

// ---------- Film engine rendering (the active engine's render(), in its own Web Worker) ----------
// Then Adjust edits on top: on the main thread for the preview (like Presets), in
// js/adjust-worker.js for full-size renders.
let advancedTimer;
let advancedBusy = false;
let advancedDirty = false;
// Last engine preview, so Adjust and Frames changes don't run the engine again.
let enginePreview = { key: '', bitmap: null };
const enginePreviewKey = () => JSON.stringify([state.imageId, state.engine, advParams()]);
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
async function ensureBitmap() {
  if (!state.imageBitmap) state.imageBitmap = await createImageBitmap(state.image);
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
      bitmap = await module.render(await ensureBitmap(), cloneParams(advParams()), { quality: 'preview', onStatus: showPreviewStatus });
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
    if (advancedDirty && isFilm() && state.image) runAdvancedPreview();
  }
}
function showPreviewStatus(text) {
  if (!text || state.renderQuality !== 'preview') return;
  elements.renderText.textContent = text; elements.renderDetail.textContent = '';
  $('#renderStatus').dataset.state = 'working';
}
function presentAdvanced(bitmap, frame) {
  state.editedCanvas = frameCanvas(bitmap, frame);
  const edge = activeModule()?.engineInfo.previewEdge ?? PREVIEW_EDGE;
  const originalKey = JSON.stringify([frame, edge]);
  if (state.originalKey !== originalKey) { state.originalCanvas = renderImage(state.image, defaultAdjustments, frame, edge); state.originalKey = originalKey; }
  elements.canvas.width = state.editedCanvas.width; elements.canvas.height = state.editedCanvas.height;
  applyZoom();
  drawPreview();
}
function setRenderProgress(value) {
  const percent = Math.round(value * 100);
  elements.renderProgressBar.style.width = `${percent}%`;
  if (state.renderQuality === 'rendering') elements.renderText.textContent = `Developing full-quality scan… ${percent}%`;
}
// The full render holds the engine output with Adjust edits applied.
const fullRenderKey = () => JSON.stringify([state.imageId, state.engine, advParams(), state.edits]);
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
  if (rendering) return;
  const info = activeModule()?.engineInfo;
  elements.renderFull.disabled = !info;
  if (!info) { elements.renderText.textContent = 'Loading the film engine…'; elements.renderDetail.textContent = ''; return; }
  elements.renderText.textContent = full ? 'Full quality' : info.previewLabel;
  elements.renderDetail.textContent = full ? ` · ${elements.canvas.width} px` : ` · ${info.previewDetail}`;
}
function applyZoom() {
  const actual = state.zoom === '100';
  elements.viewport.classList.toggle('is-actual', actual);
  elements.canvas.style.width = actual ? `${elements.canvas.width}px` : '';
  document.querySelectorAll('[data-zoom]').forEach(button => button.setAttribute('aria-pressed', button.dataset.zoom === state.zoom));
}
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
  drawPreview();
}

// ---------- Files ----------
async function loadFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Choose a JPEG, PNG, WebP, or GIF image.');
  if (file.size > 40 * 1024 * 1024) return toast('That photo is over the 40 MB limit.');
  try {
    const url = URL.createObjectURL(file); const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    if (!image.naturalWidth) throw new Error('Invalid image');
    state.image = image; state.filename = file.name.replace(/\.[^.]+$/, '') || 'photo'; state.undo = []; state.redo = [];
    state.originalKey = ''; state.holding = false; elements.originalBadge.hidden = true; state.imageId++;
    exportCanvas = { key: '', canvas: null }; preparedExport = null;
    if (state.renderAbort) cancelFullRender();
    state.imageBitmap?.close?.(); state.imageBitmap = null; state.renderQuality = 'preview'; state.fullRender = null; enginePreview = { key: '', bitmap: null };
    document.body.classList.add('has-image');
    elements.emptyState.hidden = true; elements.viewport.hidden = false; elements.viewPill.hidden = false;
    elements.fileName.textContent = file.name;
    elements.fileChip.title = file.name;
    elements.fileSize.textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
    elements.fileChip.setAttribute('aria-label', `${file.name}, ${image.naturalWidth} by ${image.naturalHeight} pixels. Photo options`);
    updateButtons(); scheduleRender(); toast('Photo opened locally.');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { toast('PhotoKamo could not decode that image.'); }
  elements.fileInput.value = ''; elements.cameraInput.value = '';
}

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
  await loadFile(new File([blob], filename, { type: 'image/jpeg' }));
}

// ---------- Tabs ----------
function setTab(tabButton) {
  document.querySelectorAll('.control-tabs [role=tab]').forEach(tab => {
    const selected = tab === tabButton;
    tab.setAttribute('aria-selected', selected);
    tab.tabIndex = selected ? 0 : -1;
    $(`#${tab.getAttribute('aria-controls')}`).hidden = !selected;
  });
  document.body.dataset.tab = tabButton.id.replace('Tab', '');
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
  const { naturalWidth: width, naturalHeight: height } = state.image;
  const module = activeModule();
  return module ? module.fullRenderSize(width, height) : { width, height, capped: false };
}
function exportEdge(size = state.exportSize) {
  const { width, height } = exportDimensions();
  const full = Math.max(width, height);
  if (size === 'share' && width > SHARE_WIDTH) return Math.round(SHARE_WIDTH * full / width);
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
  if (scale === 1) return frameCanvas(full, frame);
  const scaled = document.createElement('canvas');
  scaled.width = Math.round(full.width * scale); scaled.height = Math.round(full.height * scale);
  const ctx = scaled.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, scaled.width, scaled.height);
  return frameCanvas(scaled, frame);
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
  const { naturalWidth: width, naturalHeight: height } = state.image;
  const canShrink = width > SHARE_WIDTH;
  if (!canShrink && state.exportSize === 'share') state.exportSize = 'full';
  document.querySelectorAll('[data-size]').forEach(button => button.setAttribute('aria-pressed', button.dataset.size === state.exportSize));
  const shareButton = document.querySelector('[data-size="share"]');
  shareButton.disabled = !canShrink;
  const target = exportDimensions();
  elements.fullSizeDetail.textContent = target.capped ? `${target.width} × ${target.height} · film engine limit` : `${width} × ${height}`;
  elements.shareSizeDetail.textContent = canShrink ? `${SHARE_WIDTH} px wide` : 'Already small';
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
    const edge = exportEdge();
    const canvasKey = JSON.stringify([state.imageId, snapshot(), edge]);
    if (exportCanvas.key !== canvasKey) exportCanvas = { key: canvasKey, canvas: isFilm() ? await renderAdvancedExport(edge) : renderImage(state.image, effectiveAdjustments(), renderFrame(), edge) };
    const type = state.exportFormat;
    const blob = await new Promise(resolve => exportCanvas.canvas.toBlob(resolve, type, Number(elements.quality.value) / 100));
    if (!blob) throw new Error('Encoding failed');
    const extension = type.split('/')[1].replace('jpeg', 'jpg');
    job.file = new File([blob], `${state.filename}-photokamo.${extension}`, { type });
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
    elements.exportDialog.close(); toast('Your photo is ready.');
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

// ---------- Close (mobile) ----------
function closePhoto() {
  if (state.undo.length && !confirm('Close this photo? Your edits will be lost.')) return;
  setHolding(false);
  if (state.renderAbort) cancelFullRender();
  clearTimeout(advancedTimer);
  state.imageBitmap?.close?.(); state.imageBitmap = null; state.fullRender = null; enginePreview = { key: '', bitmap: null };
  state.image = null; state.imageId++; state.editedCanvas = null; state.originalCanvas = null; state.originalKey = ''; state.undo = []; state.redo = [];
  exportCanvas = { key: '', canvas: null }; preparedExport = null;
  document.body.classList.remove('has-image');
  elements.emptyState.hidden = false; elements.viewport.hidden = true; elements.viewPill.hidden = true;
  updateButtons();
}

// ---------- Wiring ----------
buildLooks(); buildAdjustments(); buildMobileAdjust(); buildFrames(); buildAdvancedPanel(); syncControls(); updateButtons();
document.body.dataset.tab = 'looks';
$('#closeButton').addEventListener('click', closePhoto);
$('#saveButton').addEventListener('click', openSave);
mobileQuery.addEventListener('change', () => { if (mobileQuery.matches) setZoom('fit'); syncAdvancedPanel(); });
elements.renderFull.addEventListener('click', renderFullQuality);
elements.renderCancel.addEventListener('click', () => { cancelFullRender(); scheduleAdvancedRender(0); });

elements.fileInput.addEventListener('change', event => loadFile(event.target.files[0]));
$('#chooseButton').addEventListener('click', () => elements.fileInput.click());
$('#sampleButton').addEventListener('click', loadSample);
$('#lookCount').textContent = presets.filter(preset => preset.id !== 'original').length;
$('#cameraButton').addEventListener('click', openCamera);
$('#cameraFallback').addEventListener('click', () => elements.cameraInput.click());
elements.fileMenu.addEventListener('click', event => {
  const item = event.target.closest('[data-action]'); if (!item) return;
  elements.fileMenu.hidePopover();
  if (item.dataset.action === 'open') elements.fileInput.click(); else openCamera();
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
  const items = [...elements.fileMenu.querySelectorAll('[data-action]')];
  const next = items[(items.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
  event.preventDefault(); next.focus();
});

elements.cameraInput.addEventListener('change', event => { stopCamera(); elements.cameraDialog.close(); loadFile(event.target.files[0]); });
$('#cameraClose').addEventListener('click', () => elements.cameraDialog.close());
elements.cameraDialog.addEventListener('close', stopCamera);
elements.capturePhoto.addEventListener('click', captureCameraPhoto);
elements.switchCamera.addEventListener('click', () => { cameraFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment'; startCamera(); });

['dragenter', 'dragover'].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.remove('dragover'); }));
elements.dropZone.addEventListener('drop', event => loadFile(event.dataTransfer.files[0]));

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

elements.undo.addEventListener('click', undo); elements.redo.addEventListener('click', redo);
elements.revert.addEventListener('click', () => change(() => { state.engine = PRESETS; state.myLookId = null; state.presetId = 'original'; state.strength = 100; state.edits = {}; state.frame = { id: 'none', border: { ...defaultBorder } }; }));
$('#resetAdjustments').addEventListener('click', () => change(() => { state.edits = {}; }));
$('#surpriseButton').addEventListener('click', () => {
  const options = presets.filter(p => p.id !== state.presetId && p.id !== 'original' && filterMatches(p));
  const pool = options.length ? options : presets.filter(p => p.id !== state.presetId && p.id !== 'original');
  pickLook(pool[Math.floor(Math.random() * pool.length)].id);
  elements.lookGrid.querySelector(`[data-preset="${state.presetId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

elements.export.addEventListener('click', openSave);
$('#exportClose').addEventListener('click', () => elements.exportDialog.close());
elements.exportDialog.addEventListener('close', () => clearTimeout(prepareTimer));
elements.exportDialog.addEventListener('click', event => { if (event.target === elements.exportDialog) elements.exportDialog.close(); });
elements.exportForm.addEventListener('submit', event => { event.preventDefault(); downloadPhoto(); });
elements.shareButton.addEventListener('click', sharePhoto);
$('#formatOptions').addEventListener('click', event => { const button = event.target.closest('[data-format]'); if (!button) return; state.exportFormat = button.dataset.format; syncExportOptions(); schedulePrepare(); });
$('#sizeOptions').addEventListener('click', event => { const button = event.target.closest('[data-size]'); if (!button || button.disabled) return; state.exportSize = button.dataset.size; syncExportOptions(); schedulePrepare(); });
elements.quality.addEventListener('input', () => { syncExportOptions(); schedulePrepare(400); });
$('#aboutButton').addEventListener('click', () => elements.aboutDialog.showModal()); $('#aboutClose').addEventListener('click', () => elements.aboutDialog.close());
// Both About buttons open the same dialog; refresh the saved-engines line whenever it opens.
new MutationObserver(() => { if (elements.aboutDialog.open) syncEngineStorage(); }).observe(elements.aboutDialog, { attributes: true, attributeFilter: ['open'] });
$('#engineStorageRemove').addEventListener('click', removeSavedEngines);

document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
  if (event.key === '\\' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); if (!event.repeat) setHolding(true); }
});
document.addEventListener('keyup', event => { if (event.key === '\\') setHolding(false); });
