import { presets, frames, adjustmentSections, defaultAdjustments } from './presets.js';
import { renderImage } from './renderer.js';

const $ = selector => document.querySelector(selector);
const elements = {
  fileInput: $('#fileInput'), cameraInput: $('#cameraInput'), cameraButton: $('#cameraButton'), dropZone: $('#dropZone'), emptyState: $('#emptyState'),
  canvasWrap: $('#canvasWrap'), canvas: $('#previewCanvas'), compareLine: $('#compareLine'), processing: $('#processing'),
  compareBar: $('#compareBar'), compareToggle: $('#compareToggle'), compareSlider: $('#compareSlider'), imageInfo: $('#imageInfo'),
  presetGroups: $('#presetGroups'), lookDetails: $('#lookDetails'), adjustmentControls: $('#adjustmentControls'), frameGrid: $('#frameGrid'),
  undo: $('#undoButton'), redo: $('#redoButton'), reset: $('#resetButton'), export: $('#exportButton'),
  exportDialog: $('#exportDialog'), exportForm: $('#exportForm'), format: $('#exportFormat'), quality: $('#exportQuality'), qualityOutput: $('#qualityOutput'), qualityLabel: $('#qualityLabel'),
  cameraDialog: $('#cameraDialog'), cameraPreview: $('#cameraPreview'), cameraStatus: $('#cameraStatus'),
  capturePhoto: $('#capturePhoto'), switchCamera: $('#switchCamera'), aboutDialog: $('#aboutDialog'), toast: $('#toast')
};

const state = {
  image: null, filename: 'photo', presetId: 'original', adjustments: { ...defaultAdjustments }, frame: 'none',
  compare: false, undo: [], redo: [], editedCanvas: null, originalCanvas: null, renderToken: 0
};
let toastTimer;
let sliderStart = null;
let cameraStream = null;
let cameraFacingMode = 'environment';
let cameraRequestId = 0;
const presetPreviewSource = 'images/model.jpg';

function snapshot() { return { presetId: state.presetId, adjustments: { ...state.adjustments }, frame: state.frame }; }
function restore(value) { state.presetId = value.presetId; state.adjustments = { ...value.adjustments }; state.frame = value.frame; syncControls(); scheduleRender(); }
function sameSnapshot(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function commit(previous = snapshot()) { if (!sameSnapshot(previous, snapshot())) { state.undo.push(previous); if (state.undo.length > 50) state.undo.shift(); state.redo = []; updateButtons(); } }
function undo() { if (!state.undo.length) return; state.redo.push(snapshot()); restore(state.undo.pop()); updateButtons(); }
function redo() { if (!state.redo.length) return; state.undo.push(snapshot()); restore(state.redo.pop()); updateButtons(); }
function updateButtons() { const enabled = Boolean(state.image); elements.undo.disabled = !state.undo.length; elements.redo.disabled = !state.redo.length; elements.reset.disabled = !enabled; elements.export.disabled = !enabled; }
function toast(message) { clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.classList.add('show'); toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2600); }

function buildPresets() {
  const groups = [...new Set(presets.map(preset => preset.group))];
  elements.presetGroups.innerHTML = groups.map(group => `<section class="preset-section"><div class="section-title"><h3>${group}</h3><span>${presets.filter(p => p.group === group).length} looks</span></div><div class="preset-strip">${presets.filter(p => p.group === group).map(preset => `<button class="preset-card" type="button" data-preset="${preset.id}" aria-pressed="${preset.id === state.presetId}"><span class="preset-thumb" aria-hidden="true"><canvas width="200" height="136"></canvas></span><strong>${preset.name}</strong><small>${preset.engine.replace('-inspired','')}</small></button>`).join('')}</div></section>`).join('');
  elements.presetGroups.addEventListener('click', event => {
    const card = event.target.closest('[data-preset]'); if (!card) return;
    const previous = snapshot(); const preset = presets.find(item => item.id === card.dataset.preset);
    state.presetId = preset.id; state.adjustments = { ...preset.values }; commit(previous); syncControls(); scheduleRender();
  });
  renderPresetPreviews();
}

function drawCover(ctx, source, width, height) {
  const scale = Math.max(width / source.width, height / source.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (source.width - sourceWidth) / 2;
  const sourceY = (source.height - sourceHeight) / 2;
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
      const canvas = elements.presetGroups.querySelector(`[data-preset="${preset.id}"] canvas`);
      try {
        const preview = renderImage(image, preset.values, 'none', 220);
        const ctx = canvas.getContext('2d');
        drawCover(ctx, preview, canvas.width, canvas.height);
        canvas.closest('.preset-thumb').classList.add('has-preview');
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

function buildAdjustments() {
  elements.adjustmentControls.innerHTML = adjustmentSections.map(section => `<section class="adjustment-section"><h3>${section.name}</h3>${section.controls.map(([id,label,min,max,step,suffix]) => `<div class="slider-row"><label class="slider-label" for="adjust-${id}"><span>${label}</span><output id="output-${id}">0${suffix}</output></label><input id="adjust-${id}" data-adjustment="${id}" data-suffix="${suffix}" type="range" min="${min}" max="${max}" step="${step}" value="0"></div>`).join('')}</section>`).join('');
  elements.adjustmentControls.addEventListener('pointerdown', event => { if (event.target.matches('[data-adjustment]')) sliderStart = snapshot(); });
  elements.adjustmentControls.addEventListener('focusin', event => { if (event.target.matches('[data-adjustment]') && !sliderStart) sliderStart = snapshot(); });
  elements.adjustmentControls.addEventListener('input', event => {
    const input = event.target.closest('[data-adjustment]'); if (!input) return;
    state.adjustments[input.dataset.adjustment] = Number(input.value); state.presetId = 'custom';
    updateSliderOutput(input); updatePresetSelection(); scheduleRender();
  });
  elements.adjustmentControls.addEventListener('change', event => { if (!event.target.matches('[data-adjustment]')) return; commit(sliderStart || snapshot()); sliderStart = snapshot(); });
  elements.adjustmentControls.addEventListener('focusout', event => { if (event.target.matches('[data-adjustment]')) sliderStart = null; });
}

function buildFrames() {
  elements.frameGrid.innerHTML = frames.map(frame => `<button class="frame-card" type="button" data-frame="${frame.id}" aria-pressed="${frame.id === state.frame}"><span class="frame-sample"><i></i></span><strong>${frame.name}</strong><small>${frame.description}</small></button>`).join('');
  elements.frameGrid.addEventListener('click', event => { const card = event.target.closest('[data-frame]'); if (!card) return; const previous = snapshot(); state.frame = card.dataset.frame; commit(previous); syncControls(); scheduleRender(); });
}

function updateSliderOutput(input) { const value = Number(input.value); const prefix = value > 0 ? '+' : ''; $(`#output-${input.dataset.adjustment}`).value = `${prefix}${value}${input.dataset.suffix}`; }
function updatePresetSelection() {
  document.querySelectorAll('[data-preset]').forEach(card => card.setAttribute('aria-pressed', card.dataset.preset === state.presetId));
  const preset = presets.find(item => item.id === state.presetId);
  elements.lookDetails.innerHTML = preset ? `<h3>${preset.name}</h3><p>${preset.description}</p><span class="engine-badge">${preset.engine}${preset.engine.includes('inspired') ? ' approximation' : ''}</span>${preset.engine === 'Spektrafilm-inspired' ? '<a href="https://github.com/andreavolpato/spektrafilm" target="_blank" rel="noopener noreferrer">Source / credits <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 5h5v5"/><path d="M19 5l-9 9"/><path d="M18 14v5H5V6h5"/></svg></a>' : ''}` : '<h3>Custom edit</h3><p>Your own variation of a PhotoKamo recipe.</p><span class="engine-badge">Custom</span>';
}
function syncControls() {
  document.querySelectorAll('[data-adjustment]').forEach(input => { input.value = state.adjustments[input.dataset.adjustment]; updateSliderOutput(input); });
  document.querySelectorAll('[data-frame]').forEach(card => card.setAttribute('aria-pressed', card.dataset.frame === state.frame));
  updatePresetSelection();
}

function scheduleRender() {
  if (!state.image) return;
  const token = ++state.renderToken;
  requestAnimationFrame(() => { if (token !== state.renderToken) return; renderPreview(); });
}
function renderPreview() {
  elements.processing.hidden = false;
  setTimeout(() => {
    try {
      state.editedCanvas = renderImage(state.image, state.adjustments, state.frame, 1000);
      state.originalCanvas = renderImage(state.image, defaultAdjustments, state.frame, 1000);
      elements.canvas.width = state.editedCanvas.width; elements.canvas.height = state.editedCanvas.height;
      drawComparison();
    } catch (error) {
      console.error(error);
      toast('This photo could not be rendered.');
    } finally {
      elements.processing.hidden = true;
    }
  }, 0);
}
function drawComparison() {
  if (!state.editedCanvas) return;
  const ctx = elements.canvas.getContext('2d');
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  ctx.drawImage(state.editedCanvas, 0, 0);
  if (state.compare) {
    const split = elements.canvas.width * Number(elements.compareSlider.value) / 100;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, split, elements.canvas.height); ctx.clip(); ctx.drawImage(state.originalCanvas, 0, 0); ctx.restore();
    elements.compareLine.hidden = false; elements.compareLine.style.left = `${elements.compareSlider.value}%`;
  } else elements.compareLine.hidden = true;
}

async function loadFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Choose a JPEG, PNG, WebP, or GIF image.');
  if (file.size > 40 * 1024 * 1024) return toast('That photo is over the 40 MB limit.');
  try {
    const url = URL.createObjectURL(file); const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    if (!image.naturalWidth) throw new Error('Invalid image');
    state.image = image; state.filename = file.name.replace(/\.[^.]+$/, '') || 'photo'; state.undo = []; state.redo = [];
    elements.emptyState.hidden = true; elements.canvasWrap.hidden = false; elements.compareBar.hidden = false;
    elements.imageInfo.textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
    updateButtons(); scheduleRender(); toast('Photo opened locally.');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { toast('PhotoKamo could not decode that image.'); }
  elements.fileInput.value = ''; elements.cameraInput.value = '';
}

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

function setTab(tabButton) {
  document.querySelectorAll('[role=tab]').forEach(tab => { const selected = tab === tabButton; tab.setAttribute('aria-selected', selected); $(`#${tab.getAttribute('aria-controls')}`).hidden = !selected; });
}

async function exportPhoto() {
  elements.exportDialog.close(); elements.processing.hidden = false;
  await new Promise(resolve => setTimeout(resolve, 30));
  try {
    const fullEdge = Math.max(state.image.naturalWidth, state.image.naturalHeight);
    const canvas = renderImage(state.image, state.adjustments, state.frame, fullEdge);
    const type = elements.format.value; const quality = Number(elements.quality.value) / 100;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality));
    if (!blob) throw new Error('Encoding failed');
    const extension = type.split('/')[1].replace('jpeg', 'jpg'); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `${state.filename}-photokamo.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Your photo is ready.');
  } catch (error) { console.error(error); toast('Export failed. Try JPEG or a smaller photo.'); }
  elements.processing.hidden = true;
}

buildPresets(); buildAdjustments(); buildFrames(); syncControls(); updateButtons();
elements.fileInput.addEventListener('change', event => loadFile(event.target.files[0]));
elements.cameraButton.addEventListener('click', openCamera);
elements.cameraInput.addEventListener('change', event => { stopCamera(); elements.cameraDialog.close(); loadFile(event.target.files[0]); });
$('#cameraClose').addEventListener('click', () => elements.cameraDialog.close());
elements.cameraDialog.addEventListener('close', stopCamera);
elements.capturePhoto.addEventListener('click', captureCameraPhoto);
elements.switchCamera.addEventListener('click', () => { cameraFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment'; startCamera(); });
['dragenter','dragover'].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.add('dragover'); }));
['dragleave','drop'].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.remove('dragover'); }));
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
elements.compareToggle.addEventListener('click', () => { state.compare = !state.compare; elements.compareToggle.setAttribute('aria-pressed', state.compare); drawComparison(); });
elements.compareSlider.addEventListener('input', drawComparison);
elements.undo.addEventListener('click', undo); elements.redo.addEventListener('click', redo);
elements.reset.addEventListener('click', () => { const previous = snapshot(); state.presetId = 'original'; state.adjustments = { ...defaultAdjustments }; state.frame = 'none'; commit(previous); syncControls(); scheduleRender(); });
$('#resetAdjustments').addEventListener('click', () => { const previous = snapshot(); state.adjustments = { ...defaultAdjustments }; state.presetId = 'original'; commit(previous); syncControls(); scheduleRender(); });
$('#surpriseButton').addEventListener('click', () => { const options = presets.filter(p => p.id !== state.presetId && p.id !== 'original'); const preset = options[Math.floor(Math.random() * options.length)]; const previous = snapshot(); state.presetId = preset.id; state.adjustments = { ...preset.values }; commit(previous); syncControls(); scheduleRender(); });
elements.export.addEventListener('click', () => elements.exportDialog.showModal());
$('#exportClose').addEventListener('click', () => elements.exportDialog.close());
elements.exportForm.addEventListener('submit', event => { event.preventDefault(); exportPhoto(); });
elements.quality.addEventListener('input', () => elements.qualityOutput.value = `${elements.quality.value}%`);
elements.format.addEventListener('change', () => elements.qualityLabel.hidden = elements.format.value === 'image/png');
$('#aboutButton').addEventListener('click', () => elements.aboutDialog.showModal()); $('#aboutClose').addEventListener('click', () => elements.aboutDialog.close());
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
  if (event.key === '\\' && state.image) { state.compare = !state.compare; elements.compareToggle.setAttribute('aria-pressed', state.compare); drawComparison(); }
});