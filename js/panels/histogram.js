// Histogram and clipping warnings at the top of the Adjust panel (plan_workflow.md Task 2). Display only: it reads the
// settled preview (the photo, not the frame or text) 150 ms after it is drawn, never renders and never makes history.
// The clipping hatch is drawn on the preview canvas only, so it can't reach an export.
import { clipMask, clipSummary, hatchPixels, histogram } from '../analysis/histogram.js';
import { $, mobileQuery, state } from '../state.js';

const OPEN_KEY = 'photokamo:histogram', SAMPLE_EDGE = 512;
const sample = document.createElement('canvas');
const view = { source: null, timer: 0, result: null, overlay: null, clipping: false, redraw: () => {} };

// Open on desktop, closed on phones (the slider needs the room) until the user chooses.
function readOpen() { try { const value = localStorage.getItem(OPEN_KEY); if (value) return value === 'open'; } catch { /* default */ } return !mobileQuery.matches; }
/** Sets up the panel; `redraw` repaints the preview (the clipping hatch is part of it). */
function buildHistogram({ redraw }) {
  view.redraw = redraw;
  const details = $('#histogram');
  details.open = readOpen();
  details.addEventListener('toggle', () => {
    try { localStorage.setItem(OPEN_KEY, details.open ? 'open' : 'closed'); } catch { /* this visit only */ }
    if (details.open) analyzeNow();
  });
  $('#clipToggle').addEventListener('click', () => {
    view.clipping = !view.clipping;
    $('#clipToggle').setAttribute('aria-pressed', view.clipping);
    if (view.clipping && view.overlay?.source !== state.editedCanvas) analyzeNow(); else view.redraw();
  });
}
const wanted = () => $('#histogram').open || view.clipping;

/** The preview was drawn: analyse it once it settles (a newer one in the meantime replaces it). */
function scheduleHistogram() {
  if (!state.editedCanvas || view.source === state.editedCanvas) return;
  clearTimeout(view.timer);
  view.timer = setTimeout(analyzeNow, 150);
}
function analyzeNow() {
  clearTimeout(view.timer);
  const canvas = state.editedCanvas;
  if (!canvas || !wanted()) return;
  const rect = canvas.photoRect || { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const x = Math.round(rect.x), y = Math.round(rect.y), width = Math.round(rect.width), height = Math.round(rect.height);
  if (width < 1 || height < 1) return;
  const t0 = performance.now();
  // The graph and the percentages come from a copy at most SAMPLE_EDGE px long (nearest pixels: no new values from
  // smoothing, so clipped pixels stay clipped); a zoomed 4K preview costs the same as a fitted one.
  const scale = Math.min(1, SAMPLE_EDGE / Math.max(width, height)), sw = Math.max(1, Math.round(width * scale)), sh = Math.max(1, Math.round(height * scale));
  sample.width = sw; sample.height = sh;
  const sctx = sample.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingEnabled = false; sctx.clearRect(0, 0, sw, sh); sctx.drawImage(canvas, x, y, width, height, 0, 0, sw, sh);
  view.result = histogram(sctx.getImageData(0, 0, sw, sh).data); view.source = canvas;
  // The hatch needs every preview pixel, so it reads the full photo, only while clipping is shown.
  if (view.clipping) {
    const { data } = canvas.getContext('2d').getImageData(x, y, width, height);
    const overlay = document.createElement('canvas'); overlay.width = width; overlay.height = height;
    overlay.getContext('2d').putImageData(new ImageData(hatchPixels(clipMask(data), width, height), width, height), 0, 0);
    view.overlay = { canvas: overlay, source: canvas, x, y };
  } else view.overlay = null;
  view.ms = performance.now() - t0;
  drawHistogram();
  if (view.clipping) view.redraw();
}

function drawHistogram() {
  const r = view.result; if (!r) return;
  const canvas = $('#histogramCanvas'), ctx = canvas.getContext('2d'), { width, height } = canvas;
  const style = getComputedStyle(document.documentElement);
  ctx.clearRect(0, 0, width, height);
  // Scale to the tallest bin away from the ends, so a clipped spike doesn't flatten the rest.
  let peak = 1;
  for (const bins of [r.luma, r.r, r.g, r.b]) for (let v = 2; v < 254; v++) peak = Math.max(peak, bins[v]);
  const yOf = n => height - Math.min(1, n / peak) * (height - 2);
  const path = bins => { ctx.beginPath(); ctx.moveTo(0, height); for (let v = 0; v < 256; v++) ctx.lineTo(v * width / 255, yOf(bins[v])); ctx.lineTo(width, height); ctx.closePath(); };
  ctx.fillStyle = style.getPropertyValue('--text-muted').trim() || 'gray'; ctx.globalAlpha = .45; path(r.luma); ctx.fill();
  ctx.globalAlpha = .9; ctx.lineWidth = 1;
  for (const [bins, colour] of [[r.r, 'rgb(230,80,80)'], [r.g, 'rgb(80,190,110)'], [r.b, 'rgb(90,140,240)']]) { ctx.strokeStyle = colour; path(bins); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // Clipped ends: a bar at the edge whose height shows how much is clipped (with the text, never colour alone).
  ctx.fillStyle = style.getPropertyValue('--text').trim() || 'white';
  if (r.shadows) ctx.fillRect(0, height - Math.max(4, Math.min(1, r.shadows * 20) * height), 3, height);
  if (r.highlights) ctx.fillRect(width - 3, height - Math.max(4, Math.min(1, r.highlights * 20) * height), 3, height);
  $('#histogramText').textContent = clipSummary(r);
}

/** Draws the clipping hatch over the photo on the preview canvas (`split`: only right of the divider, the edit's side). */
function drawClipOverlay(ctx, split) {
  const overlay = view.overlay;
  if (!view.clipping || state.holding || !overlay || overlay.source !== state.editedCanvas) return;
  ctx.save();
  if (split !== null) { const cut = Math.round(ctx.canvas.width * split); ctx.beginPath(); ctx.rect(cut, 0, ctx.canvas.width - cut, ctx.canvas.height); ctx.clip(); }
  ctx.drawImage(overlay.canvas, overlay.x, overlay.y);
  ctx.restore();
}
if (new URLSearchParams(location.search).has('dev')) window.histogramTiming = () => view.ms; // checks (tools)

export { buildHistogram, drawClipOverlay, scheduleHistogram };
