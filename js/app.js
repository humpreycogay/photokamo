import { presets, frames, adjustmentSections, defaultAdjustments } from './presets.js';
import { renderImage, frameCanvas } from './renderer.js';
// Advanced engines are NOT imported here: registry.js is a tiny list, and an engine's code,
// worker and data load only when Advanced mode needs it (activateEngine).
import { engines, defaultEngineId, legacyEngineId, engineById, loadEngine, loadCredits } from './engines/registry.js';
import { buildAdvanced, syncAdvanced, engineAboutHtml, creditHtml } from './advanced-ui.js';

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
  engineSelect: $('#engineSelect'), engineDesc: $('#engineDesc'), engineStatus: $('#engineStatus'), engineStatusText: $('#engineStatusText'),
  engineProgress: $('#engineProgress'), engineProgressBar: $('#engineProgressBar'), engineRetry: $('#engineRetry'),
  engineAboutButton: $('#engineAboutButton'), engineAboutDialog: $('#engineAboutDialog'), engineAboutBody: $('#engineAboutBody'),
  advCredit: $('#advCredit'), advNote: $('#advNote')
};

// Look state: the effective value of each adjustment is
//   original + (look - original) * strength + edit
// so a look can be dialled back with Strength, and Adjust edits sit on top of it.
const state = {
  image: null, imageId: 0, filename: 'photo', presetId: 'original', strength: 100, edits: {}, frame: 'none',
  filter: 'All', zoom: 'fit', holding: false, mobileTool: 'exposure',
  exportFormat: 'image/jpeg', exportSize: 'full',
  // Advanced mode: the selected engine and each engine's own settings ({ [engineId]: params }).
  mode: 'simple', engine: defaultEngineId, engineParams: {}, myLookId: null, imageBitmap: null,
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

const currentPreset = () => presets.find(item => item.id === state.presetId) || presets[0];
function groupLabel(preset) {
  if (preset.group === 'Utility') return 'Utility';
  if (preset.group === 'Camera looks') return 'Camera look';
  if (preset.group === 'Creative styles') return 'Creative style';
  return preset.engine.includes('inspired') ? `Film stock · ${preset.engine}` : 'Film stock';
}

// ---------- Values ----------
function baseValue(key) {
  const original = defaultAdjustments[key];
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
function snapshot() { return { presetId: state.presetId, strength: state.strength, edits: { ...state.edits }, frame: state.frame, mode: state.mode, engine: state.engine, engineParams: cloneEngineParams(state.engineParams), myLookId: state.myLookId }; }
function restore(value) {
  state.presetId = value.presetId; state.strength = value.strength; state.edits = { ...value.edits }; state.frame = value.frame;
  state.mode = value.mode; state.engine = value.engine; state.engineParams = cloneEngineParams(value.engineParams); state.myLookId = value.myLookId;
  syncControls(); scheduleRender(); // syncControls loads the engine if Advanced needs a different one
}
function sameSnapshot(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function commit(previous = snapshot()) { if (!sameSnapshot(previous, snapshot())) { state.undo.push(previous); if (state.undo.length > 50) state.undo.shift(); state.redo = []; updateButtons(); } }
function undo() { if (!state.undo.length) return; state.redo.push(snapshot()); restore(state.undo.pop()); updateButtons(); }
function redo() { if (!state.redo.length) return; state.undo.push(snapshot()); restore(state.redo.pop()); updateButtons(); }
function updateButtons() { elements.undo.disabled = !state.undo.length; elements.redo.disabled = !state.redo.length; }
function toast(message) { clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.classList.add('show'); toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2600); }
function change(mutator) { const previous = snapshot(); mutator(); commit(previous); syncControls(); scheduleRender(); }
function pickLook(id) {
  const wasAdvanced = state.mode === 'advanced';
  change(() => { state.presetId = id; state.edits = {}; state.mode = 'simple'; state.myLookId = null; });
  if (wasAdvanced) toast('Switched to Simple mode.');
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
  change(() => { state.mode = 'advanced'; state.engine = look.engine; state.engineParams[look.engine] = module.normalizeParams(look.params); state.myLookId = id; });
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
  const advanced = state.mode === 'advanced';
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
    elements.lookGroup.textContent = `Advanced · ${engineById(state.engine).label}`;
    elements.lookName.textContent = mine ? (edited ? `${mine.name} · edited` : mine.name) : 'Advanced film edit';
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
  elements.frameGrid.innerHTML = frames.map(frame => `<button class="frame-card" type="button" data-frame="${frame.id}" aria-pressed="${frame.id === state.frame}"><span class="frame-sample"><i></i></span><strong>${frame.name}</strong><small>${frame.description}</small></button>`).join('');
  elements.frameGrid.addEventListener('click', event => { const card = event.target.closest('[data-frame]'); if (card) change(() => { state.frame = card.dataset.frame; }); });
}

// ---------- Advanced engines: load on selection ----------
// activeEngine is the loaded module of engine.id; it only counts while it is state.engine.
const engine = { id: null, module: null, builtFor: null, status: 'idle', error: null, load: null, unsubscribe: null };
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
    if (state.mode === 'advanced') scheduleRender();
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
    () => { if (activeModule() === module) { setEngineStatus('ready'); if (state.mode === 'advanced' && state.renderQuality === 'preview') syncRenderStatus(); } },
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
  if (status !== 'preparing') { elements.engineProgress.hidden = true; elements.engineProgressBar.style.width = '0%'; }
  syncEngineBar();
}
function showEngineDownload({ loaded, total, done }) {
  if (engine.status === 'ready' || engine.status === 'failed') return;
  if (engine.status !== 'preparing') { engine.status = 'preparing'; syncEngineBar(); }
  if (done) { elements.engineStatusText.textContent = 'Preparing the engine…'; elements.engineProgress.hidden = true; return; }
  elements.engineStatusText.textContent = total ? `Downloading the engine… ${MB(loaded)} of ${MB(total)} MB` : `Downloading the engine… ${MB(loaded)} MB`;
  elements.engineProgress.hidden = !total;
  if (total) elements.engineProgressBar.style.width = `${Math.min(100, Math.round(loaded / total * 100))}%`;
}
function syncEngineBar() {
  const entry = engineById(state.engine);
  elements.engineSelect.value = state.engine;
  elements.engineDesc.textContent = `${entry.description} · ${entry.licence}`;
  const text = {
    idle: '',
    loading: `Loading ${entry.label}…`,
    preparing: 'Preparing the engine…',
    ready: 'Ready · runs on this device',
    failed: `${entry.label} could not be loaded. Check your connection and try again.`
  }[engine.status];
  elements.engineStatus.dataset.state = engine.status;
  if (engine.status !== 'preparing' || !elements.engineStatusText.textContent.startsWith('Downloading')) elements.engineStatusText.textContent = text;
  elements.engineRetry.hidden = engine.status !== 'failed';
}
/** Engine dropdown: keeps each engine's own settings and carries over the shared ones (film, exposure, grain, halation). */
async function switchEngine(id) {
  if (id === state.engine || !engineById(id)) return;
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
  elements.advNote.hidden = !(state.mode === 'advanced' && module && state.renderQuality !== 'full' && module.hasSpatialEffects(advParams()));
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
  elements.engineSelect.innerHTML = engines.map(entry => `<option value="${entry.id}">${entry.label}</option>`).join('');
  elements.engineSelect.addEventListener('change', () => switchEngine(elements.engineSelect.value));
  // Desktop: reaching for the dropdown loads the other engines' code (tens of KB) so a switch
  // starts at once; their large files still wait until the engine is chosen.
  const prefetchEngines = () => {
    if (!matchMedia('(pointer: fine)').matches) return;
    for (const entry of engines) if (entry.id !== state.engine) loadEngine(entry.id).catch(() => {});
  };
  elements.engineSelect.addEventListener('pointerenter', prefetchEngines, { once: true });
  elements.engineSelect.addEventListener('focus', prefetchEngines, { once: true });
  elements.engineRetry.addEventListener('click', () => { if (activeModule()) warmEngine(); else activateEngine().catch(() => {}); });
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

// ---------- Mode: Simple / Advanced ----------
function setMode(mode) {
  if (mode === state.mode) return;
  change(() => { state.mode = mode; });
}
function syncMode() {
  const advanced = state.mode === 'advanced';
  // Advanced needs its engine: load it now (download + compile start right away, before any render).
  if (advanced) activateEngine().catch(error => console.error(error));
  const module = activeModule();
  document.body.classList.toggle('is-advanced', advanced);
  document.body.classList.toggle('no-paper', Boolean(advanced && module && module.showsPaper && !module.showsPaper(advParams())));
  document.querySelectorAll('.mode-switch [data-mode]').forEach(button => {
    const checked = button.dataset.mode === state.mode;
    button.setAttribute('aria-checked', checked); button.tabIndex = checked ? 0 : -1;
  });
  if (advanced && state.zoom !== 'fit') { state.zoom = 'fit'; applyZoom(); }
  syncRenderStatus();
}

function syncControls() {
  syncMode();
  syncAdvancedPanel();
  syncAdjustments();
  document.querySelectorAll('[data-frame]').forEach(card => card.setAttribute('aria-pressed', card.dataset.frame === state.frame));
  syncLooks();
}

// ---------- Rendering ----------
function renderEdge() {
  if (state.zoom === 'fit' || !state.image) return PREVIEW_EDGE;
  return Math.min(ZOOM_MAX_EDGE, Math.max(state.image.naturalWidth, state.image.naturalHeight));
}
function scheduleRender() {
  if (!state.image) return;
  if (state.mode === 'advanced') { scheduleAdvancedRender(); return; }
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
      state.editedCanvas = renderImage(state.image, effectiveAdjustments(), state.frame, edge);
      const originalKey = `${state.frame}|${edge}`;
      if (state.originalKey !== originalKey) { state.originalCanvas = renderImage(state.image, defaultAdjustments, state.frame, edge); state.originalKey = originalKey; }
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

// ---------- Advanced rendering (the active engine's render(), in its own Web Worker) ----------
let advancedTimer;
let advancedBusy = false;
let advancedDirty = false;
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
  const imageId = state.imageId; const frame = state.frame; const engineId = state.engine;
  try {
    const bitmap = await module.render(await ensureBitmap(), cloneParams(advParams()), { quality: 'preview', onStatus: showPreviewStatus });
    if (engine.status === 'idle' || engine.status === 'preparing') setEngineStatus('ready');
    if (imageId === state.imageId && engineId === state.engine && state.mode === 'advanced' && state.renderQuality === 'preview') { presentAdvanced(bitmap, frame); syncRenderStatus(); }
  } catch (error) {
    if (error?.name !== 'AbortError') { console.error(error); toast('The film preview could not be rendered. Check your connection and try again.'); }
  } finally {
    advancedBusy = false;
    if (state.renderQuality === 'preview') syncRenderStatus();
    if (advancedDirty && state.mode === 'advanced' && state.image) runAdvancedPreview();
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
  const originalKey = `${frame}|${edge}`;
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
const fullRenderKey = () => JSON.stringify([state.imageId, state.engine, advParams()]);
async function renderFullQuality() {
  const module = activeModule();
  if (state.mode !== 'advanced' || !state.image || !module) return;
  clearTimeout(advancedTimer);
  const controller = new AbortController();
  state.renderAbort = controller; state.renderQuality = 'rendering';
  syncRenderStatus(); setRenderProgress(0);
  const frame = state.frame; const key = fullRenderKey();
  try {
    const bitmap = await module.render(await ensureBitmap(), cloneParams(advParams()), { quality: 'full', signal: controller.signal, onProgress: setRenderProgress, onStatus: text => { if (text && state.renderQuality === 'rendering') elements.renderText.textContent = text; } });
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
    state.imageBitmap?.close?.(); state.imageBitmap = null; state.renderQuality = 'preview'; state.fullRender = null;
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
  return state.mode === 'advanced' && module ? module.fullRenderSize(width, height) : { width, height, capped: false };
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
  const frame = state.frame;
  const module = await activateEngine();
  const key = fullRenderKey();
  const full = state.fullRender?.key === key ? state.fullRender.bitmap
    : await module.render(await ensureBitmap(), cloneParams(advParams()), { quality: 'full', onProgress: value => { elements.exportStatus.textContent = `Developing full-quality scan… ${Math.round(value * 100)}%`; } });
  if (state.fullRender?.key !== key) state.fullRender = { key, bitmap: full };
  const scale = Math.min(1, edge / Math.max(full.width, full.height));
  if (scale === 1) return frameCanvas(full, frame);
  const scaled = document.createElement('canvas');
  scaled.width = Math.round(full.width * scale); scaled.height = Math.round(full.height * scale);
  const ctx = scaled.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, scaled.width, scaled.height);
  return frameCanvas(scaled, frame);
}
function exportSummary() {
  const frameName = state.frame === 'none' ? 'no frame' : `${frames.find(item => item.id === state.frame).name} frame`;
  if (state.mode === 'advanced') {
    const look = currentMyLook()?.name || 'Advanced';
    const module = activeModule();
    return [look, module ? module.stockSummary(advParams()) : engineById(state.engine).label, frameName].join(' · ');
  }
  const preset = currentPreset();
  const look = preset.id !== 'original' && state.strength < 100 ? `${preset.name} ${state.strength}%` : preset.name;
  const count = editCount();
  const frame = frames.find(item => item.id === state.frame);
  return [look, count ? `${count} adjustment${count === 1 ? '' : 's'}` : null, state.frame === 'none' ? 'no frame' : `${frame.name} frame`].filter(Boolean).join(' · ');
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
    if (exportCanvas.key !== canvasKey) exportCanvas = { key: canvasKey, canvas: state.mode === 'advanced' ? await renderAdvancedExport(edge) : renderImage(state.image, effectiveAdjustments(), state.frame, edge) };
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
  state.imageBitmap?.close?.(); state.imageBitmap = null; state.fullRender = null;
  state.image = null; state.editedCanvas = null; state.originalCanvas = null; state.originalKey = ''; state.undo = []; state.redo = [];
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
document.querySelectorAll('.mode-switch').forEach(group => {
  group.addEventListener('click', event => { const button = event.target.closest('[data-mode]'); if (button) setMode(button.dataset.mode); });
  group.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next = state.mode === 'simple' ? 'advanced' : 'simple';
    setMode(next);
    group.querySelector(`[data-mode="${next}"]`).focus();
  });
});
$('#advancedInfo').addEventListener('click', () => elements.aboutDialog.showModal());
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
elements.revert.addEventListener('click', () => change(() => { state.presetId = 'original'; state.strength = 100; state.edits = {}; state.frame = 'none'; }));
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
