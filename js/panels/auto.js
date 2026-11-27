// Auto in the Adjust panel (plan_workflow.md Tasks 3–4): Auto white balance and the neutral picker. The analysis runs
// in js/analysis/worker.js (started on first use) on the image Adjust receives (C1); the result is ordinary Adjust
// edits, one undo step per photo (C2), worked out for each selected photo on its own (C3), never copied.
import { ENHANCE_KEYS } from '../analysis/auto.js';
import { engineInputPreview, releaseEngines, useEngine } from '../engine-host.js';
import { change } from '../history.js';
import { activePhoto, adjustmentsFor, editPhotoSettings, renderPhotoEdit, settingsOf } from '../photos.js';
import { croppedSize, opticsSource } from '../preview.js';
import { canvasPoint } from './heal.js';
import { $, PREVIEW_EDGE, app, clampToRange, elements, isFilm, roundToStep, state, toast } from '../state.js';

const PROXY_EDGE = 256;
// ---------- Worker ----------
let worker = null, nextJob = 0;
const waiting = new Map();
function analyse(kind, { data, width, height }, extra) {
  if (!worker) {
    worker = new Worker(new URL('../analysis/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: reply }) => { const job = waiting.get(reply.id); waiting.delete(reply.id); if (reply.error) job?.reject(new Error(reply.error)); else job?.resolve(reply.result); };
    worker.onerror = event => { for (const job of waiting.values()) job.reject(new Error(event.message || 'Auto analysis failed')); waiting.clear(); worker.terminate(); worker = null; };
  }
  const id = ++nextJob;
  return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); worker.postMessage({ id, kind, pixels: data, width, height, ...extra }, [data.buffer]); });
}

// ---------- The image Adjust receives ----------
function pixelsOf(image, maxEdge) {
  const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height, scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
/** Any photo's Adjust input at 256 px, from its thumbnail through crop, optics and the look (the same for the photo in
 *  view and the others, so the same photo always gets the same answer). */
async function proxyInput(photo) {
  const engines = new Set();
  try {
    const { image } = await renderPhotoEdit({ ...photo, settings: settingsOf(photo) }, { edge: PROXY_EDGE, quality: 'preview', from: 'thumb', raw: true, onEngine: module => useEngine(engines, module) });
    const pixels = pixelsOf(image, PROXY_EDGE);
    if (image !== photo.thumb) image.close?.();
    return pixels;
  } finally { releaseEngines(engines); }
}
/** The photo in view's Adjust input at preview size (the picker needs to hit a small spot). */
async function previewInput() {
  if (isFilm()) { const bitmap = engineInputPreview(); return bitmap ? pixelsOf(bitmap, PREVIEW_EDGE) : proxyInput(activePhoto()); }
  return pixelsOf(await opticsSource(PREVIEW_EDGE), PREVIEW_EDGE);
}
const valuesFor = settings => ({ a: adjustmentsFor(settings), base: adjustmentsFor({ look: settings.look, edits: {} }) });
/** Writes effective `targets` as edits over the look's base values (C2): rounded to the slider step, zero edits removed. */
function writeEdits(edits, targets, base) {
  for (const [key, target] of Object.entries(targets)) {
    const value = roundToStep(key, clampToRange(key, target) - base[key]);
    if (Math.abs(value) < 1e-9) delete edits[key]; else edits[key] = value;
  }
}
/** Applies one photo's result: the photo in view through change() (one undo step), the others in their own history. */
function applyResult(photo, targets, base) {
  if (photo.id === app.activeId) { const before = JSON.stringify(state.edits); change(() => writeEdits(state.edits, targets, base)); return JSON.stringify(state.edits) !== before; }
  return editPhotoSettings(photo, settings => writeEdits(settings.edits, targets, base));
}
/** The selected photos when several are selected, else the photo in view. Live editing is paused while Auto runs, so
 *  the photo in view's result isn't copied over the others' own (C3). */
async function eachTarget(label, run) {
  const photos = app.selected.size > 1 ? app.photos.filter(photo => app.selected.has(photo.id)) : [activePhoto()].filter(Boolean);
  const live = app.liveEdit, status = $('#autoStatus'), results = [];
  app.liveEdit = false; setBusy(true);
  try {
    for (const [index, photo] of photos.entries()) {
      if (photos.length > 1) status.textContent = `${label}: ${index + 1} of ${photos.length}…`;
      try { results.push({ photo, ...(await run(photo)) }); } catch (error) { console.error(error); results.push({ photo, failed: true }); }
    }
  } finally { app.liveEdit = live; setBusy(false); status.textContent = ''; }
  return results;
}
function setBusy(busy) { for (const id of ['autoButton', 'autoWbButton', 'pickNeutralButton']) { const button = $(`#${id}`); button.disabled = busy; button.toggleAttribute('aria-busy', busy); } }

// ---------- Auto white balance ----------
async function autoWhiteBalance() {
  if (!state.image) return;
  const results = await eachTarget('Auto white balance', async photo => {
    const settings = settingsOf(photo), { a, base } = valuesFor(settings);
    const result = await analyse('wb', await proxyInput(photo), { a, base: { temperature: base.temperature, tint: base.tint } });
    const changed = result.change && applyResult(photo, { temperature: result.temperature, tint: result.tint }, base);
    return { changed, reason: result.reason };
  });
  if (results.length === 1) { const [r] = results; toast(r.failed ? 'Auto white balance didn’t work on this photo.' : r.changed ? `${r.reason}. Undo to go back.` : r.reason.startsWith('Removed') ? 'White balance is already as Auto would set it.' : `${r.reason}.`); return; }
  const changed = results.filter(r => r.changed).length, failed = results.filter(r => r.failed).length;
  toast(`Auto white balance: ${changed} of ${results.length} photos changed${failed ? `, ${failed} failed` : ''}. Undo on each photo.`);
}

// ---------- Auto (Task 4): light and colour in one step ----------
async function autoEnhance() {
  if (!state.image) return;
  const results = await eachTarget('Auto', async photo => {
    const settings = settingsOf(photo), { a, base } = valuesFor(settings);
    const result = await analyse('enhance', await proxyInput(photo), { a, base });
    const changed = applyResult(photo, result.values, base);
    // The chip stays while these edits are as Auto left them (compared by value, like "edited" on looks).
    const edits = settingsOf(photo).edits;
    photo.auto = { edits: Object.fromEntries(ENHANCE_KEYS.map(key => [key, edits[key] || 0])), reasons: result.reasons, confidence: result.confidence };
    return { changed, reasons: result.reasons, confidence: result.confidence };
  });
  syncAutoChip();
  if (results.length === 1) {
    const [r] = results;
    toast(r.failed ? 'Auto didn’t work on this photo.' : r.changed ? 'Auto set light and colour. Undo to go back.' : 'Auto found nothing to change.');
    return;
  }
  const changed = results.filter(r => r.changed).length, failed = results.filter(r => r.failed).length;
  toast(`Auto: ${changed} of ${results.length} photos changed${failed ? `, ${failed} failed` : ''}. Undo on each photo.`);
}
/** The Auto chip and its reasons line, for the photo in view: shown while its Auto'd controls are untouched. */
function syncAutoChip() {
  const auto = activePhoto()?.auto, untouched = Boolean(auto) && ENHANCE_KEYS.every(key => (state.edits[key] || 0) === auto.edits[key]);
  $('#autoChip').hidden = !untouched;
  const reasons = $('#autoReasons');
  reasons.hidden = !untouched;
  reasons.textContent = untouched ? `Auto: ${auto.reasons.join(' · ') || 'nothing needed changing'}.${auto.confidence < .5 ? ' (Low confidence: check the result.)' : ''}` : '';
}

// ---------- Neutral picker: click a grey, or move the reticle with the arrow keys ----------
const picker = { on: false, u: .5, v: .5 };
function setPicking(on) {
  picker.on = on;
  document.body.classList.toggle('picking-neutral', on);
  $('#pickNeutralButton').setAttribute('aria-pressed', on);
  const reticle = $('#neutralReticle');
  reticle.hidden = !on;
  if (on) { picker.u = picker.v = .5; placeReticle(); reticle.focus({ preventScroll: true }); $('#autoStatus').textContent = 'Click something that should be grey or white, or use the arrow keys and Enter. Escape cancels.'; }
  else $('#autoStatus').textContent = '';
}
/** Screen position of a point given as a fraction of the photo (inside any frame) on the preview canvas. */
function photoPoint(u, v) {
  const canvas = elements.canvas, rect = canvas.getBoundingClientRect(), photo = state.editedCanvas?.photoRect || { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height); // object-fit: contain on phones
  const left = rect.left + (rect.width - canvas.width * scale) / 2, top = rect.top + (rect.height - canvas.height * scale) / 2;
  return { x: left + (photo.x + u * photo.width) * scale, y: top + (photo.y + v * photo.height) * scale };
}
function placeReticle() {
  const reticle = $('#neutralReticle'), { x, y } = photoPoint(picker.u, picker.v);
  reticle.style.left = `${x}px`; reticle.style.top = `${y}px`;
  reticle.setAttribute('aria-valuetext', `${Math.round(picker.u * 100)}% across, ${Math.round(picker.v * 100)}% down`);
}
async function pickAt(u, v) {
  setPicking(false);
  const photo = activePhoto(); if (!photo) return;
  setBusy(true);
  try {
    const input = await previewInput(), { a, base } = valuesFor(settingsOf(photo));
    const full = croppedSize(), size = Math.max(3, 2 * Math.round(5 * input.width / Math.max(1, full.width) / 2) + 1); // ≈ 5 × 5 photo pixels, at least 3 × 3
    const x = Math.min(input.width - 1, Math.max(0, Math.round(u * (input.width - 1)))), y = Math.min(input.height - 1, Math.max(0, Math.round(v * (input.height - 1))));
    const result = await analyse('pick', input, { x, y, size, a, base: { temperature: base.temperature, tint: base.tint } });
    if (!result.change) { toast(`${result.reason}.`); return; }
    toast(applyResult(photo, { temperature: result.temperature, tint: result.tint }, base) ? `${result.reason} from the spot you picked. Undo to go back.` : 'That spot is already neutral.');
  } catch (error) { console.error(error); toast('The neutral picker didn’t work on this photo.'); }
  finally { setBusy(false); }
}
function buildAuto() {
  $('#autoButton').addEventListener('click', autoEnhance);
  $('#autoWbButton').addEventListener('click', autoWhiteBalance);
  $('#pickNeutralButton').addEventListener('click', () => setPicking(!picker.on));
  // Clicks on the photo pick while picking (before zoom, split and compare see them).
  elements.canvasWrap.addEventListener('pointerdown', event => {
    if (!picker.on || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const canvas = elements.canvas, photo = state.editedCanvas?.photoRect || { x: 0, y: 0, width: canvas.width, height: canvas.height };
    const { x: cx, y: cy } = canvasPoint(canvas, event.clientX, event.clientY);
    const u = (cx - photo.x) / photo.width, v = (cy - photo.y) / photo.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) { toast('Pick a spot on the photo.'); return; }
    pickAt(u, v);
  }, true);
  $('#neutralReticle').addEventListener('keydown', event => {
    const step = event.shiftKey ? .1 : .01, moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) { event.preventDefault(); picker.u = Math.min(1, Math.max(0, picker.u + moves[event.key][0])); picker.v = Math.min(1, Math.max(0, picker.v + moves[event.key][1])); placeReticle(); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pickAt(picker.u, picker.v); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setPicking(false); $('#pickNeutralButton').focus(); }
  });
  addEventListener('resize', () => { if (picker.on) placeReticle(); });
  elements.viewport.addEventListener('scroll', () => { if (picker.on) placeReticle(); }, true);
}

export { analyse, buildAuto, syncAutoChip };
