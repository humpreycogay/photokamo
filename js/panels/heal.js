// The Heal tab (plan_workflow.md Tasks 9–10): paint over a spot to heal it (source found automatically, or set by the
// user) or clone from a source. One stroke = one undo step. Strokes are photo-specific: Apply, live editing and My
// looks never copy them (mergeSettings copies listed parts only); session recovery keeps them.
import { change } from '../history.js';
import { MAX_STROKES, makeStroke, nextRev, strokeGeometry, strokeMask } from '../heal/model.js';
import { cropMatrix, regionPixels } from '../heal/render.js';
import { $, elements, state, toast } from '../state.js';
import { analyse } from './auto.js';

const PREFS_KEY = 'photokamo:heal';
const ui = { sourceImage: 0, mode: 'heal', size: 40, hardness: .5, opacity: 1, marks: true, source: null, setting: false, selected: null, cursor: { u: .5, v: .5 }, drag: null, busy: false, hover: null, listKey: '' };
try { Object.assign(ui, Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')).filter(([key]) => ['mode', 'size', 'hardness', 'opacity', 'marks'].includes(key)))); } catch { /* defaults */ }
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: ui.mode, size: ui.size, hardness: ui.hardness, opacity: ui.opacity, marks: ui.marks })); } catch { /* this visit only */ } };
const onTab = () => document.body.dataset.tab === 'heal' && Boolean(state.image);

// ---------- Geometry: preview canvas px ↔ photo (source) px ----------
/** Mapping for the current preview, or null. The preview is crop → optics → look; optics distortion isn't undone, so
 *  with strong distortion the brush lands a little off (the fix itself always stays with the photo). */
function view() {
  const rect = state.editedCanvas?.photoRect; if (!rect || !state.image) return null;
  if (ui.source && ui.sourceImage !== state.imageId) { ui.source = null; ui.setting = false; } // a set source belongs to its photo
  const width = state.image.naturalWidth || state.image.width, height = state.image.naturalHeight || state.image.height;
  const { matrix, inverse, g } = cropMatrix(state.crop, width, height), sx = rect.width / g.width, sy = rect.height / g.height;
  return {
    width, height, scale: sx, rect,
    toSource: (px, py) => { const p = inverse.transformPoint(new DOMPoint((px - rect.x) / sx, (py - rect.y) / sy)); return { x: p.x, y: p.y }; },
    toPreview: (x, y) => { const p = matrix.transformPoint(new DOMPoint(x, y)); return { x: rect.x + p.x * sx, y: rect.y + p.y * sy }; }
  };
}
/** Client (CSS) point → overlay canvas px, for a canvas drawn with object-fit: contain (phones) or at its own size. */
function canvasPoint(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect(), scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
  const left = rect.left + (rect.width - canvas.width * scale) / 2, top = rect.top + (rect.height - canvas.height * scale) / 2;
  return { x: (clientX - left) / scale, y: (clientY - top) / scale };
}
const insidePhoto = (v, p) => p.x >= v.rect.x && p.y >= v.rect.y && p.x <= v.rect.x + v.rect.width && p.y <= v.rect.y + v.rect.height;
const cursorPreview = v => ({ x: v.rect.x + ui.cursor.u * v.rect.width, y: v.rect.y + ui.cursor.v * v.rect.height });

// ---------- Making a stroke ----------
async function finishStroke(path) {
  const v = view(); if (!v || !path.length || ui.busy) return;
  if (state.healing.strokes.length >= MAX_STROKES) { toast(`A photo can have up to ${MAX_STROKES} fixes. Delete some to add more.`); return; }
  const long = Math.max(v.width, v.height), radius = Math.min(ui.size, long / 4);
  const base = { mode: ui.mode, path, radius, hardness: ui.hardness, opacity: ui.opacity, width: v.width, height: v.height };
  let offset;
  if (ui.source) offset = { x: ui.source.x - path[0].x, y: ui.source.y - path[0].y };
  else if (ui.mode === 'clone') { toast('Clone needs a source: tap Set source, then tap the spot to copy from.'); return; }
  else {
    setBusy(true, 'Finding a clean area nearby…');
    try { offset = await searchOffset(makeStroke({ ...base, offset: { x: 0, y: 0 } }), radius, v); }
    catch (error) { console.error(error); offset = null; }
    finally { setBusy(false); }
    if (!offset) { toast('No clean area fits nearby. Tap Set source and pick one.'); return; }
  }
  const stroke = makeStroke({ ...base, offset });
  change(() => { state.healing = { rev: nextRev(), strokes: [...state.healing.strokes, stroke] }; });
  ui.selected = state.healing.strokes.length - 1; syncHeal();
}
/** Task 10: the best source in a proxy around the stroke (brush 8–32 px there), searched in the analysis Worker. */
async function searchOffset(stroke, radius, v) {
  const scale = Math.min(1, 24 / radius), pw = Math.max(1, Math.round(v.width * scale)), ph = Math.max(1, Math.round(v.height * scale));
  const geo = strokeGeometry(stroke, pw, ph), reach = Math.ceil(6.5 * geo.radius + 4), b = geo.bounds;
  const rect = { x: Math.max(0, b.x - reach), y: Math.max(0, b.y - reach) };
  rect.width = Math.min(pw, b.x + b.width + reach) - rect.x; rect.height = Math.min(ph, b.y + b.height + reach) - rect.y;
  const pixels = regionPixels(state.image, state.healing, rect, scale), mask = strokeMask(geo, rect, stroke.h, stroke.o);
  const found = await analyse('heal', { data: pixels.data, width: rect.width, height: rect.height }, { mask, radius: geo.radius });
  return found && { x: found.x / scale, y: found.y / scale };
}
function setBusy(busy, text = '') { ui.busy = busy; $('#healStatus').textContent = text; }
function setSource(point) {
  ui.source = point; ui.sourceImage = state.imageId; ui.setting = false;
  $('#healStatus').textContent = point ? 'Source set. Paint where it should go.' : '';
  syncHeal();
}
function deleteStroke(index) {
  if (index == null || !state.healing.strokes[index]) return;
  change(() => { state.healing = { rev: nextRev(), strokes: state.healing.strokes.filter((_, i) => i !== index) }; });
  ui.selected = state.healing.strokes.length ? Math.min(index, state.healing.strokes.length - 1) : null; syncHeal();
  toast('Fix deleted. Undo brings it back.');
}

// ---------- Overlay: marks, source, brush ----------
function drawHealOverlay() {
  const overlay = $('#healCanvas'), canvas = elements.canvas;
  if (overlay.width !== canvas.width || overlay.height !== canvas.height) { overlay.width = canvas.width; overlay.height = canvas.height; }
  const ctx = overlay.getContext('2d'); ctx.clearRect(0, 0, overlay.width, overlay.height);
  syncList();
  const v = view(); if (!onTab() || !v || state.holding) return;
  const px = overlay.width / Math.max(1, overlay.getBoundingClientRect().width); // canvas px per CSS px
  ctx.lineWidth = 1.5 * px;
  const circle = (x, y, r, stroke, fill, dash = []) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.setLineDash(dash); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } };
  if (ui.marks) state.healing.strokes.forEach((stroke, index) => {
    const geo = strokeGeometry(stroke, v.width, v.height), selected = index === ui.selected;
    // Outlines only (light over dark), so the healed result itself stays visible under the marks.
    ctx.lineWidth = (selected ? 1.5 : 1) * px;
    for (const c of geo.centres) { const p = v.toPreview(c.x, c.y); circle(p.x, p.y, geo.radius * v.scale, 'rgba(0,0,0,.45)', null, selected ? [] : [3 * px, 3 * px]); }
    ctx.lineWidth = (selected ? 1 : .75) * px;
    for (const c of geo.centres) { const p = v.toPreview(c.x, c.y); circle(p.x, p.y, geo.radius * v.scale, selected ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.7)', null, selected ? [] : [3 * px, 3 * px]); }
    ctx.lineWidth = 1.5 * px;
    if (selected) {
      const first = v.toPreview(geo.centres[0].x, geo.centres[0].y), src = v.toPreview(geo.centres[0].x + geo.dx, geo.centres[0].y + geo.dy);
      circle(first.x, first.y, geo.radius * v.scale, 'rgba(255,255,255,.95)'); circle(src.x, src.y, geo.radius * v.scale, 'rgba(255,255,255,.95)', null, [4 * px, 3 * px]);
      ctx.beginPath(); ctx.setLineDash([2 * px, 3 * px]); ctx.moveTo(first.x, first.y); ctx.lineTo(src.x, src.y); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.stroke();
    }
  });
  // The live stroke, the source (moving with the brush while painting) and the brush itself.
  const radius = Math.min(ui.size, Math.max(v.width, v.height) / 4) * v.scale;
  if (ui.drag) for (const point of ui.drag.path) { const p = v.toPreview(point.x, point.y); circle(p.x, p.y, radius, null, 'rgba(255,255,255,.22)'); } // only while painting
  const brush = ui.hover || cursorPreview(v);
  if (ui.source) {
    const start = ui.drag?.path[0], at = ui.drag?.path.at(-1), s = start ? v.toPreview(ui.source.x + at.x - start.x, ui.source.y + at.y - start.y) : v.toPreview(ui.source.x, ui.source.y);
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.moveTo(s.x - 8 * px, s.y); ctx.lineTo(s.x + 8 * px, s.y); ctx.moveTo(s.x, s.y - 8 * px); ctx.lineTo(s.x, s.y + 8 * px); ctx.stroke();
    circle(s.x, s.y, radius, 'rgba(0,0,0,.6)', null, [3 * px, 3 * px]);
  }
  circle(brush.x, brush.y, radius, 'rgba(0,0,0,.7)'); ctx.lineWidth = .75 * px; circle(brush.x, brush.y, radius, 'rgba(255,255,255,.95)');
  if (ui.setting) { ctx.setLineDash([]); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.moveTo(brush.x - 10 * px, brush.y); ctx.lineTo(brush.x + 10 * px, brush.y); ctx.moveTo(brush.x, brush.y - 10 * px); ctx.lineTo(brush.x, brush.y + 10 * px); ctx.stroke(); }
}

// ---------- Panel ----------
function syncList() {
  const strokes = state.healing.strokes, key = `${state.healing.rev}|${ui.selected}|${strokes.length}`;
  if (key === ui.listKey) return; ui.listKey = key;
  if (ui.selected != null && !strokes[ui.selected]) ui.selected = strokes.length ? strokes.length - 1 : null;
  const v = view(), long = v ? Math.max(v.width, v.height) : 1;
  $('#healListTitle').textContent = `Fixes (${strokes.length})`;
  $('#healList').replaceChildren(...strokes.map((stroke, index) => {
    const item = document.createElement('div');
    item.setAttribute('role', 'option'); item.id = `heal-fix-${index}`; item.dataset.index = index; item.setAttribute('aria-selected', index === ui.selected);
    item.textContent = `${index + 1}. ${stroke.m === 'clone' ? 'Clone' : 'Heal'} · ${Math.round(stroke.r * long)} px${stroke.p.length > 2 ? ' · stroke' : ''}`;
    return item;
  }));
  if (ui.selected != null) $('#healList').setAttribute('aria-activedescendant', `heal-fix-${ui.selected}`); else $('#healList').removeAttribute('aria-activedescendant');
  $('#healDelete').disabled = ui.selected == null; $('#healClearAll').disabled = !strokes.length;
}
function syncHeal() {
  document.querySelectorAll('[data-heal-mode]').forEach(button => button.setAttribute('aria-checked', button.dataset.healMode === ui.mode));
  $('#healModeHint').textContent = ui.mode === 'clone' ? 'Clone copies exactly: tap Set source, tap the spot to copy from, then paint.' : 'Paint over a spot: Heal finds a clean area nearby and blends it in.';
  for (const [id, value, text] of [['healSize', ui.size, `${ui.size} px`], ['healHardness', Math.round(ui.hardness * 100), `${Math.round(ui.hardness * 100)}%`], ['healOpacity', Math.round(ui.opacity * 100), `${Math.round(ui.opacity * 100)}%`]]) { $(`#${id}`).value = value; $(`#${id}Output`).value = text; }
  $('#healSetSource').setAttribute('aria-pressed', ui.setting);
  $('#healSetSource').textContent = ui.setting ? 'Tap the source…' : ui.source ? 'Move source' : 'Set source';
  $('#healAutoSource').hidden = !ui.source || ui.mode === 'clone';
  $('#healSourceText').textContent = ui.source ? 'Source: set by you' : ui.mode === 'clone' ? 'Source: not set' : 'Source: found automatically';
  $('#healShowMarks').checked = ui.marks;
  $('#healCanvas').tabIndex = onTab() ? 0 : -1;
  ui.listKey = ''; drawHealOverlay();
}

function buildHeal() {
  const overlay = $('#healCanvas');
  $('#healModes').addEventListener('click', event => { const button = event.target.closest('[data-heal-mode]'); if (!button) return; ui.mode = button.dataset.healMode; savePrefs(); syncHeal(); });
  $('#healModes').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); ui.mode = ui.mode === 'heal' ? 'clone' : 'heal'; savePrefs(); syncHeal(); $(`[data-heal-mode="${ui.mode}"]`).focus();
  });
  for (const [id, key, scale] of [['healSize', 'size', 1], ['healHardness', 'hardness', 100], ['healOpacity', 'opacity', 100]]) $(`#${id}`).addEventListener('input', event => { ui[key] = Number(event.target.value) / scale; savePrefs(); syncHeal(); });
  $('#healShowMarks').addEventListener('change', event => { ui.marks = event.target.checked; savePrefs(); syncHeal(); });
  $('#healSetSource').addEventListener('click', () => { ui.setting = !ui.setting; $('#healStatus').textContent = ui.setting ? 'Tap the spot to copy from (or move the brush with the arrow keys and press S).' : ''; syncHeal(); if (ui.setting) overlay.focus({ preventScroll: true }); });
  $('#healAutoSource').addEventListener('click', () => setSource(null));
  $('#healDelete').addEventListener('click', () => deleteStroke(ui.selected));
  $('#healClearAll').addEventListener('click', () => { if (state.healing.strokes.length && confirm(`Remove all ${state.healing.strokes.length} fixes from this photo?`)) { change(() => { state.healing = { rev: nextRev(), strokes: [] }; }); ui.selected = null; syncHeal(); } });
  const list = $('#healList');
  list.addEventListener('click', event => { const item = event.target.closest('[role=option]'); if (!item) return; ui.selected = Number(item.dataset.index); syncHeal(); });
  list.addEventListener('keydown', event => {
    const count = state.healing.strokes.length; if (!count) return;
    const moves = { ArrowDown: 1, ArrowUp: -1 };
    if (moves[event.key]) { event.preventDefault(); ui.selected = Math.max(0, Math.min(count - 1, (ui.selected ?? -1) + moves[event.key])); syncHeal(); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); ui.selected = event.key === 'Home' ? 0 : count - 1; syncHeal(); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteStroke(ui.selected); }
  });

  // Painting: on the whole stage before anything else (like the Text tab), pointer samples taken once per frame.
  elements.dropZone.addEventListener('pointerdown', event => {
    if (!onTab() || event.button > 0 || ui.busy || event.target.closest('#fullscreenButton,#engineWaitRetry,.view-pill,button')) return;
    const v = view(), point = canvasPoint(overlay, event.clientX, event.clientY); if (!v || !insidePhoto(v, point)) return;
    event.preventDefault(); event.stopPropagation();
    const source = v.toSource(point.x, point.y);
    if (ui.setting) { setSource(source); return; }
    ui.drag = { id: event.pointerId, path: [source], pending: null, frame: 0 };
    overlay.setPointerCapture(event.pointerId); drawHealOverlay();
  }, { capture: true });
  overlay.addEventListener('pointermove', event => {
    const v = view(); if (!v || !onTab()) return;
    const point = canvasPoint(overlay, event.clientX, event.clientY);
    ui.hover = point;
    const drag = ui.drag;
    if (drag?.id === event.pointerId) {
      drag.pending = v.toSource(point.x, point.y);
      if (!drag.frame) drag.frame = requestAnimationFrame(() => { drag.frame = 0; if (drag.pending) { drag.path.push(drag.pending); drag.pending = null; } drawHealOverlay(); });
    } else drawHealOverlay();
  });
  overlay.addEventListener('pointerleave', () => { if (!ui.drag) { ui.hover = null; drawHealOverlay(); } });
  const end = event => {
    const drag = ui.drag; if (!drag || drag.id !== event.pointerId) return;
    cancelAnimationFrame(drag.frame); if (drag.pending) drag.path.push(drag.pending);
    ui.drag = null;
    if (event.type === 'pointerup') finishStroke(drag.path); else drawHealOverlay();
  };
  overlay.addEventListener('pointerup', end); overlay.addEventListener('pointercancel', end);
  // Keyboard: arrows move the brush, Space paints a spot, S sets the source, Delete removes the selected fix.
  overlay.addEventListener('keydown', event => {
    const v = view(); if (!v || !onTab()) return;
    const step = event.shiftKey ? .05 : .01, moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) { event.preventDefault(); ui.hover = null; ui.cursor = { u: Math.min(1, Math.max(0, ui.cursor.u + moves[event.key][0])), v: Math.min(1, Math.max(0, ui.cursor.v + moves[event.key][1])) }; drawHealOverlay(); return; }
    const at = () => { const p = cursorPreview(v); return v.toSource(p.x, p.y); };
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (ui.setting) setSource(at()); else finishStroke([at()]); }
    else if (event.key.toLowerCase() === 's' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); setSource(at()); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteStroke(ui.selected); }
    else if (event.key === 'Escape' && ui.setting) { event.preventDefault(); event.stopPropagation(); ui.setting = false; syncHeal(); }
  });
  overlay.addEventListener('focus', () => { ui.hover = null; drawHealOverlay(); });
  syncHeal();
}

export { buildHeal, canvasPoint, drawHealOverlay, syncHeal };
