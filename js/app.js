import { presets, frames, adjustmentSections, defaultAdjustments } from './presets.js';
import { renderImage } from './renderer.js';

const $ = selector => document.querySelector(selector);
const elements = {
  fileInput: $('#fileInput'), cameraInput: $('#cameraInput'), dropZone: $('#dropZone'), emptyState: $('#emptyState'),
  viewport: $('#viewport'), canvasWrap: $('#canvasWrap'), canvas: $('#previewCanvas'), processing: $('#processing'), originalBadge: $('#originalBadge'),
  viewPill: $('#viewPill'), holdButton: $('#holdButton'), fileChip: $('#fileChip'), fileMenu: $('#fileMenu'), fileName: $('#fileName'), fileSize: $('#fileSize'),
  lookGroup: $('#lookGroup'), lookName: $('#lookName'), lookDesc: $('#lookDesc'), favorite: $('#favoriteButton'),
  strength: $('#strengthSlider'), strengthOutput: $('#strengthOutput'), lookFilters: $('#lookFilters'), lookGrid: $('#lookGrid'),
  adjustmentControls: $('#adjustmentControls'), adjustBadge: $('#adjustBadge'), frameGrid: $('#frameGrid'),
  undo: $('#undoButton'), redo: $('#redoButton'), revert: $('#revertButton'), export: $('#exportButton'),
  exportDialog: $('#exportDialog'), exportForm: $('#exportForm'), format: $('#exportFormat'), quality: $('#exportQuality'), qualityOutput: $('#qualityOutput'), qualityLabel: $('#qualityLabel'),
  cameraDialog: $('#cameraDialog'), cameraPreview: $('#cameraPreview'), cameraStatus: $('#cameraStatus'),
  capturePhoto: $('#capturePhoto'), switchCamera: $('#switchCamera'), aboutDialog: $('#aboutDialog'), toast: $('#toast')
};

// Look state: the effective value of each adjustment is
//   original + (look - original) * strength + edit
// so a look can be dialled back with Strength, and Adjust edits sit on top of it.
const state = {
  image: null, filename: 'photo', presetId: 'original', strength: 100, edits: {}, frame: 'none',
  filter: 'All', zoom: 'fit', holding: false,
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
function snapshot() { return { presetId: state.presetId, strength: state.strength, edits: { ...state.edits }, frame: state.frame }; }
function restore(value) { state.presetId = value.presetId; state.strength = value.strength; state.edits = { ...value.edits }; state.frame = value.frame; syncControls(); scheduleRender(); }
function sameSnapshot(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function commit(previous = snapshot()) { if (!sameSnapshot(previous, snapshot())) { state.undo.push(previous); if (state.undo.length > 50) state.undo.shift(); state.redo = []; updateButtons(); } }
function undo() { if (!state.undo.length) return; state.redo.push(snapshot()); restore(state.undo.pop()); updateButtons(); }
function redo() { if (!state.redo.length) return; state.undo.push(snapshot()); restore(state.redo.pop()); updateButtons(); }
function updateButtons() { elements.undo.disabled = !state.undo.length; elements.redo.disabled = !state.redo.length; }
function toast(message) { clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.classList.add('show'); toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2600); }
function change(mutator) { const previous = snapshot(); mutator(); commit(previous); syncControls(); scheduleRender(); }
function pickLook(id) { change(() => { state.presetId = id; state.edits = {}; }); }

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

// ---------- Looks panel ----------
function buildLooks() {
  elements.lookGrid.innerHTML = presets.map(preset => `<button class="look-tile" type="button" data-preset="${preset.id}" aria-pressed="false"><span class="look-thumb" aria-hidden="true"><canvas width="200" height="200"></canvas></span><span class="look-tile-name">${preset.name}</span></button>`).join('');
  elements.lookGrid.addEventListener('click', event => { const tile = event.target.closest('[data-preset]'); if (tile) pickLook(tile.dataset.preset); });
  elements.lookFilters.addEventListener('click', event => {
    const chip = event.target.closest('[data-filter]'); if (!chip) return;
    state.filter = chip.dataset.filter; syncLooks();
  });
  renderPresetPreviews();
}
function filterMatches(preset) {
  if (state.filter === 'All') return true;
  if (state.filter === 'Favorites') return favorites.includes(preset.id);
  return CATEGORY[preset.group] === state.filter;
}
function syncLooks() {
  const preset = currentPreset();
  const filters = ['All', 'Camera', 'Film', 'Creative', ...(favorites.length ? ['Favorites'] : [])];
  if (!filters.includes(state.filter)) state.filter = 'All';
  elements.lookFilters.innerHTML = filters.map(filter => `<button class="chip" type="button" data-filter="${filter}" aria-pressed="${filter === state.filter}">${filter}</button>`).join('');
  elements.lookGrid.querySelectorAll('[data-preset]').forEach(tile => {
    const item = presets.find(p => p.id === tile.dataset.preset);
    tile.hidden = !filterMatches(item);
    tile.setAttribute('aria-pressed', item.id === state.presetId);
  });
  elements.lookGroup.textContent = groupLabel(preset);
  elements.lookName.textContent = editCount() ? `${preset.name} · edited` : preset.name;
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

function renderPresetPreviews() {
  const image = new Image();
  image.decoding = 'async';
  image.addEventListener('load', () => {
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
  }, { once: true });
  image.addEventListener('error', () => console.warn(`Preset preview image could not be loaded from ${presetPreviewSource}.`), { once: true });
  image.src = presetPreviewSource;
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
  panel.addEventListener('pointerdown', event => { if (event.target.matches('[data-adjustment]')) sliderStart = snapshot(); });
  panel.addEventListener('focusin', event => { if (event.target.matches('[data-adjustment]') && !sliderStart) sliderStart = snapshot(); });
  panel.addEventListener('input', event => {
    const input = event.target.closest('[data-adjustment]'); if (!input) return;
    const key = input.dataset.adjustment;
    const value = Number(input.value);
    const base = baseValue(key);
    if (Math.abs(value - roundToStep(key, base)) < controlSpec[key].step / 2) delete state.edits[key];
    else state.edits[key] = value - base;
    syncAdjustments(); syncLooks(); scheduleRender();
  });
  panel.addEventListener('change', event => { if (!event.target.matches('[data-adjustment]')) return; commit(sliderStart || snapshot()); sliderStart = snapshot(); });
  panel.addEventListener('focusout', event => { if (event.target.matches('[data-adjustment]')) sliderStart = null; });
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
}

// ---------- Frames ----------
function buildFrames() {
  elements.frameGrid.innerHTML = frames.map(frame => `<button class="frame-card" type="button" data-frame="${frame.id}" aria-pressed="${frame.id === state.frame}"><span class="frame-sample"><i></i></span><strong>${frame.name}</strong><small>${frame.description}</small></button>`).join('');
  elements.frameGrid.addEventListener('click', event => { const card = event.target.closest('[data-frame]'); if (card) change(() => { state.frame = card.dataset.frame; }); });
}

function syncControls() {
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
  ctx.drawImage(source, 0, 0);
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
    state.originalKey = ''; state.holding = false; elements.originalBadge.hidden = true;
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
  document.querySelectorAll('[role=tab]').forEach(tab => {
    const selected = tab === tabButton;
    tab.setAttribute('aria-selected', selected);
    tab.tabIndex = selected ? 0 : -1;
    $(`#${tab.getAttribute('aria-controls')}`).hidden = !selected;
  });
}

// ---------- Export ----------
async function exportPhoto() {
  elements.exportDialog.close(); elements.processing.hidden = false;
  await new Promise(resolve => setTimeout(resolve, 30));
  try {
    const fullEdge = Math.max(state.image.naturalWidth, state.image.naturalHeight);
    const canvas = renderImage(state.image, effectiveAdjustments(), state.frame, fullEdge);
    const type = elements.format.value; const quality = Number(elements.quality.value) / 100;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality));
    if (!blob) throw new Error('Encoding failed');
    const extension = type.split('/')[1].replace('jpeg', 'jpg'); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `${state.filename}-photokamo.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Your photo is ready.');
  } catch (error) { console.error(error); toast('Export failed. Try JPEG or a smaller photo.'); }
  elements.processing.hidden = true;
}

// ---------- Wiring ----------
buildLooks(); buildAdjustments(); buildFrames(); syncControls(); updateButtons();

elements.fileInput.addEventListener('change', event => loadFile(event.target.files[0]));
$('#chooseButton').addEventListener('click', () => elements.fileInput.click());
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

document.querySelectorAll('[role=tab]').forEach(tab => {
  tab.addEventListener('click', () => setTab(tab));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll('[role=tab]')];
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

elements.export.addEventListener('click', () => elements.exportDialog.showModal());
$('#exportClose').addEventListener('click', () => elements.exportDialog.close());
elements.exportForm.addEventListener('submit', event => { event.preventDefault(); exportPhoto(); });
elements.quality.addEventListener('input', () => elements.qualityOutput.value = `${elements.quality.value}%`);
elements.format.addEventListener('change', () => elements.qualityLabel.hidden = elements.format.value === 'image/png');
$('#aboutButton').addEventListener('click', () => elements.aboutDialog.showModal()); $('#aboutClose').addEventListener('click', () => elements.aboutDialog.close());

document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
  if (event.key === '\\' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); if (!event.repeat) setHolding(true); }
});
document.addEventListener('keyup', event => { if (event.key === '\\') setHolding(false); });
