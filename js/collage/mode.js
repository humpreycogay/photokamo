// Collage mode (CollagePlan.md Tasks 1–2): the stage, the panel, slot renders, slot editing and the collage's own
// history. app.js owns the photos and the per-photo renders; it passes them in as `deps`:
//   photos(), photoById(id), settingsOf(photo), paperColors,
//   renderSlot(photo, { pass: 'fast'|'sharp', edge, job }) → { image } | null (null: job went stale),
//   addFiles(files) → the photos added to the strip, editPhoto(id) to leave for the editor,
//   onHistory() after the undo/redo state changes.
import { templates, templateById, slotCount } from './templates.js';
import { layoutTemplate } from './layout.js';
import { drawCollage } from './render.js';
import { fillGeometry, normalizeFill, panBy, ZOOM_MIN, ZOOM_MAX } from './fill.js';
import { ASPECTS, SPACING, createDoc, fitSlots, cloneDoc, resetFraming, swapSlots } from './model.js';

const MAX_SLOT_EDGE = 1600; // preview renders: long edge cap per photo
const HISTORY_LIMIT = 50;
const BACKDROP_KEY = 'photokamo:collage-backdrop';
const $ = (root, selector) => root.querySelector(selector);
const percent = value => `${Math.round(value * 1000) / 10}%`;
const escapeHtml = text => String(text).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** The template that fits `count` photos best: the same count, else the smallest that holds them all. */
export function templateFor(count) {
  const sorted = [...templates].sort((a, b) => slotCount(a) - slotCount(b));
  return sorted.find(t => slotCount(t) === count) || sorted.find(t => slotCount(t) >= count) || sorted[sorted.length - 1];
}

export function createCollageMode(deps) {
  const stage = document.getElementById('collageStage'), canvas = document.getElementById('collageCanvas');
  const panel = document.getElementById('collagePanel'), status = document.getElementById('collageStatus');
  const list = document.getElementById('collageTemplates'), aspects = document.getElementById('collageAspects'), paper = document.getElementById('collagePaper');
  const sliders = Object.fromEntries(Object.keys(SPACING).map(key => [key, panel.querySelector(`[data-collage="${key}"]`)]));
  const slotsEl = document.getElementById('collageSlots'), byId = id => document.getElementById(id);
  const backdrops = byId('collageBackdrops'), backdropRow = byId('collageBackdropRow'), sheetEl = byId('collageSheet');
  let backdrop = (() => { try { return ['checker', 'light', 'dark'].includes(localStorage.getItem(BACKDROP_KEY)) ? localStorage.getItem(BACKDROP_KEY) : 'checker'; } catch { return 'checker'; } })();
  const slotUi = { hint: byId('collageSlotHint'), tools: byId('collageSlotTools'), title: byId('collageSlotTitle'), photoTools: byId('collagePhotoTools'),
    zoom: byId('collageZoom'), angle: byId('collageAngle'), rotate: byId('collageRotate'), flip: byId('collageFlip'), reset: byId('collageReset'),
    move: byId('collageMove'), photos: byId('collagePhotos'), add: byId('collageAddPhoto'), empty: byId('collageEmpty'), edit: byId('collageEdit'), file: byId('collageFileInput') };
  let active = false, doc = null, docPhotos = '', undoStack = [], redoStack = [], frame = 0, slider = null;
  // The slot being edited (index into the layout) or null; the last drawn layout and device px per CSS px.
  let selected = null, view = { layout: null, k: 1 }, gesture = null, wheel = null, photosKey = '';
  const pointers = new Map();
  // Slot renders: photoId → { key (settings JSON), image, edge, sharp }. Only photos in visible slots keep one.
  const cache = new Map(), failed = new Set();
  let generation = 0, pumping = false, running = null, progress = { done: 0, total: 0 };

  // ---------- History: one step per gesture ----------
  const historyChanged = () => deps.onHistory?.();
  function commit(previous) {
    if (JSON.stringify(previous) === JSON.stringify(doc)) return;
    undoStack.push(previous); if (undoStack.length > HISTORY_LIMIT) undoStack.shift(); redoStack = [];
    historyChanged();
  }
  function change(mutator) { const previous = cloneDoc(doc); mutator(doc); commit(previous); refresh(); }
  function step(from, to, word) {
    if (!from.length) return;
    to.push(cloneDoc(doc)); doc = from.pop();
    refresh(); historyChanged(); say(word);
  }

  // ---------- Panel ----------
  const template = () => templateById(doc.templateId) || templates[0];
  function buildPanel() {
    list.innerHTML = templates.map(t => `<div class="collage-template" role="option" id="collage-${t.id}" data-template="${t.id}" tabindex="-1" aria-selected="false" aria-label="${t.name}, ${plural(slotCount(t), 'photo')}"><canvas aria-hidden="true"></canvas><span class="collage-template-name" aria-hidden="true">${t.name}</span></div>`).join('');
    aspects.innerHTML = ASPECTS.map(([label]) => `<button type="button" role="radio" data-aspect="${label}" aria-checked="false">${label}</button>`).join('');
    paper.innerHTML = deps.paperColors.map(color => `<button type="button" role="radio" class="paper-swatch" data-paper="${color.hex}" aria-checked="false" aria-label="${color.name}" title="${color.name}" style="--swatch:${color.hex}"></button>`).join('')
      + '<button type="button" role="radio" class="paper-swatch paper-none" data-paper="none" aria-checked="false" aria-label="None (transparent)" title="None (transparent)"></button>';
    // Layout listbox: selection follows focus (arrows, Home, End); click or Enter picks.
    const pickTemplate = option => {
      if (!option || option.getAttribute('aria-selected') === 'true') return;
      const next = templateById(option.dataset.template);
      change(d => { d.templateId = next.id; if (d.aspectAuto) d.aspect = { w: next.aspect[0], h: next.aspect[1] }; fitSlots(d, slotCount(next)); });
      say(`Layout: ${next.name}`);
    };
    list.addEventListener('click', event => { const option = event.target.closest('[data-template]'); if (option) { pickTemplate(option); option.focus(); } });
    list.addEventListener('keydown', event => {
      const options = [...list.querySelectorAll('[data-template]')], index = options.indexOf(document.activeElement);
      const target = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: options.length - 1 }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      const option = options[Math.max(0, Math.min(options.length - 1, target))];
      option.focus(); option.scrollIntoView({ block: 'nearest', inline: 'nearest' }); pickTemplate(option);
    });
    radioGroup(aspects, '[data-aspect]', button => {
      const [, w, h] = ASPECTS.find(([label]) => label === button.dataset.aspect);
      change(d => { d.aspect = { w, h }; d.aspectAuto = false; });
    });
    radioGroup(paper, '[data-paper]', button => {
      const none = button.dataset.paper === 'none';
      change(d => { d.sheet.background = none ? 'transparent' : 'paper'; if (!none) d.paper.color = button.dataset.paper; });
      say(none ? 'Paper: none. The background is transparent in PNG and WebP.' : `Paper: ${button.title}`);
    });
    // Preview backdrop behind a transparent sheet (never exported); remembered on this device.
    radioGroup(backdrops, '[data-backdrop]', button => { backdrop = button.dataset.backdrop; try { localStorage.setItem(BACKDROP_KEY, backdrop); } catch { /* this visit only */ } syncBackdrop(); });
    // Sliders: live while dragging or holding a key, one undo step per gesture (committed on change).
    for (const [key, input] of Object.entries(sliders)) {
      const spec = SPACING[key];
      Object.assign(input, { min: spec.min * 100, max: spec.max * 100, step: spec.step * 100 });
      const begin = () => { slider ||= cloneDoc(doc); };
      input.addEventListener('pointerdown', begin); input.addEventListener('focus', begin);
      input.addEventListener('input', () => { begin(); doc[key] = Number(input.value) / 100; syncSliders(); draw(); });
      input.addEventListener('change', () => { if (slider) commit(slider); slider = cloneDoc(doc); });
      input.addEventListener('blur', () => { slider = null; });
    }
    buildSlotPanel();
  }

  // ---------- Slot editing: the selected slot's photo (panel) ----------
  const slotFill = () => (selected == null ? null : doc.slots[selected]);
  const slotPhoto = () => deps.photoById(slotFill()?.photoId);
  /** Changes the selected slot's framing as one undo step; `message` goes to the status line. */
  function editFill(mutate, message) {
    if (selected == null || !slotPhoto()) return;
    const index = selected;
    change(d => { const slot = d.slots[index]; mutate(slot); Object.assign(slot, normalizeFill(slot)); });
    if (message) say(typeof message === 'function' ? message(doc.slots[index]) : message);
  }
  /** Puts photo `id` in the selected slot; if it is already in another slot, the two swap. */
  function placePhoto(id) {
    if (selected == null) return;
    const index = selected, other = doc.slots.findIndex((slot, i) => slot.photoId === id && i !== index), photo = deps.photoById(id);
    change(d => { if (other >= 0) swapSlots(d, index, other); else { d.slots[index].photoId = id; resetFraming(d.slots[index]); } });
    say(other >= 0 && other < slotCount(template()) ? `${photo.name} swapped with slot ${other + 1}` : `${photo.name} in slot ${index + 1}`);
  }
  function buildSlotPanel() {
    // Zoom and angle: live while dragging, one undo step per gesture.
    for (const input of [slotUi.zoom, slotUi.angle]) {
      const key = input.dataset.fill, begin = () => { slider ||= cloneDoc(doc); };
      input.addEventListener('pointerdown', begin); input.addEventListener('focus', begin);
      input.addEventListener('input', () => {
        const slot = slotFill(); if (!slot) return;
        begin(); slot[key] = key === 'zoom' ? Number(input.value) / 100 : Number(input.value);
        Object.assign(slot, normalizeFill(slot)); syncFillValues(); scheduleDraw();
      });
      input.addEventListener('change', () => { if (slider) commit(slider); slider = cloneDoc(doc); });
      input.addEventListener('blur', () => { slider = null; });
    }
    slotUi.rotate.addEventListener('click', () => editFill(slot => { slot.rotate += 90; }, slot => `Rotated to ${slot.rotate}°`));
    slotUi.flip.addEventListener('click', () => editFill(slot => { slot.flip = !slot.flip; }, slot => (slot.flip ? 'Flipped' : 'Not flipped')));
    slotUi.reset.addEventListener('click', () => editFill(resetFraming, 'Framing reset'));
    slotUi.move.addEventListener('change', () => moveTo(Number(slotUi.move.value)));
    radioGroup(slotUi.photos, '[data-photo]', button => placePhoto(Number(button.dataset.photo)));
    slotUi.empty.addEventListener('click', emptySelected);
    slotUi.edit.addEventListener('click', () => { const photo = slotPhoto(); if (photo) deps.editPhoto(photo.id); });
    slotUi.add.addEventListener('click', () => slotUi.file.click());
    slotUi.file.addEventListener('change', async () => {
      const files = [...slotUi.file.files]; slotUi.file.value = '';
      if (selected == null || !files.length) return;
      const index = selected, added = await deps.addFiles(files);
      if (!active || !added.length) return;
      // The first new photo goes in this slot, the rest into empty slots after it.
      const count = slotCount(template()), empties = doc.slots.map((slot, i) => i).filter(i => i > index && i < count && !deps.photoById(doc.slots[i].photoId));
      const placed = [index, ...empties].slice(0, added.length);
      change(d => placed.forEach((i, n) => { d.slots[i].photoId = added[n].id; resetFraming(d.slots[i]); }));
      const extra = added.length - placed.length;
      say(`${plural(placed.length, 'photo')} added${extra ? `; ${extra} more in the strip` : ''}`);
    });
  }
  function moveTo(target) {
    if (selected == null || target === selected || !(target >= 0)) return;
    const from = selected;
    change(d => swapSlots(d, from, target));
    selected = target; refresh(); say(`Moved to slot ${target + 1}`);
  }
  function emptySelected() {
    if (selected == null || !slotPhoto()) return;
    const index = selected;
    change(d => { d.slots[index].photoId = null; resetFraming(d.slots[index]); });
    say(`Slot ${index + 1} emptied`);
  }
  function syncFillValues() {
    const slot = slotFill(); if (!slot) return;
    slotUi.zoom.value = Math.round(slot.zoom * 100); byId('collageZoomOutput').value = `${Math.round(slot.zoom * 100)}%`;
    slotUi.angle.value = slot.angle; byId('collageAngleOutput').value = `${slot.angle}°`;
    slotUi.flip.setAttribute('aria-pressed', slot.flip);
  }
  function syncSlotPanel() {
    const count = slotCount(template());
    if (selected != null && selected >= count) selected = null;
    const slot = slotFill(), photo = slotPhoto();
    slotUi.tools.hidden = selected == null; slotUi.hint.hidden = selected != null;
    slotUi.title.textContent = selected == null ? 'Photo' : `Slot ${selected + 1} · ${photo ? photo.name : 'empty'}`;
    if (selected == null) return;
    slotUi.photoTools.hidden = !photo; slotUi.edit.hidden = !photo; slotUi.empty.hidden = !photo;
    syncFillValues();
    slotUi.move.innerHTML = doc.slots.slice(0, count).map((s, i) => `<option value="${i}"${i === selected ? ' selected' : ''}>Slot ${i + 1} · ${escapeHtml(deps.photoById(s.photoId)?.name || 'empty')}</option>`).join('');
    const photos = deps.photos(), key = photos.map(p => p.id).join();
    if (key !== photosKey) {
      photosKey = key;
      slotUi.photos.replaceChildren(...photos.map(p => {
        const button = document.createElement('button');
        Object.assign(button, { type: 'button', className: 'collage-photo', title: p.name });
        button.setAttribute('role', 'radio'); button.dataset.photo = p.id; button.setAttribute('aria-label', p.name);
        const thumb = document.createElement('canvas'); thumb.width = thumb.height = 112; thumb.setAttribute('aria-hidden', 'true');
        coverThumb(thumb, p.preview || p.thumb); button.append(thumb);
        return button;
      }));
    }
    syncRadios(slotUi.photos, 'data-photo', String(slot.photoId));
  }
  function coverThumb(canvas, source) {
    if (!source) return;
    const ctx = canvas.getContext('2d'), scale = Math.max(canvas.width / source.width, canvas.height / source.height);
    ctx.drawImage(source, (canvas.width - source.width * scale) / 2, (canvas.height - source.height * scale) / 2, source.width * scale, source.height * scale);
  }
  function radioGroup(group, selector, pick) {
    group.addEventListener('click', event => { const button = event.target.closest(selector); if (button && button.getAttribute('aria-checked') !== 'true') pick(button); });
    group.addEventListener('keydown', event => {
      const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]; if (!delta) return;
      const buttons = [...group.querySelectorAll(selector)], next = buttons[(Math.max(0, buttons.indexOf(document.activeElement)) + delta + buttons.length) % buttons.length];
      event.preventDefault(); next.focus(); pick(next);
    });
  }
  function syncRadios(group, attribute, value) {
    const buttons = [...group.querySelectorAll(`[${attribute}]`)];
    buttons.forEach(button => { const on = button.getAttribute(attribute) === value; button.setAttribute('aria-checked', on); button.tabIndex = on ? 0 : -1; });
    if (!buttons.some(button => button.tabIndex === 0)) buttons[0].tabIndex = 0;
  }
  function syncBackdrop() {
    const transparent = doc?.sheet.background === 'transparent';
    backdropRow.hidden = !transparent;
    syncRadios(backdrops, 'data-backdrop', backdrop);
    sheetEl.dataset.backdrop = transparent ? backdrop : '';
  }
  function syncSliders() {
    for (const [key, input] of Object.entries(sliders)) {
      input.value = Math.round(doc[key] * 1000) / 10;
      panel.querySelector(`output[for="${input.id}"]`).value = percent(doc[key]);
    }
  }
  function syncPanel() {
    const t = template(), aspect = ASPECTS.find(([, w, h]) => w === doc.aspect.w && h === doc.aspect.h);
    for (const option of list.querySelectorAll('[data-template]')) {
      const selected = option.dataset.template === t.id;
      option.setAttribute('aria-selected', selected); option.tabIndex = selected ? 0 : -1;
    }
    syncRadios(aspects, 'data-aspect', aspect ? aspect[0] : '');
    syncRadios(paper, 'data-paper', doc.sheet.background === 'transparent' ? 'none' : doc.paper.color);
    syncBackdrop();
    syncSliders();
    syncSlotPanel();
    drawThumbs();
    const filled = doc.slots.slice(0, slotCount(t)).filter(slot => deps.photoById(slot.photoId)).length;
    document.getElementById('collageCount').textContent = `${filled} of ${plural(slotCount(t), 'photo')}`;
    canvas.setAttribute('aria-label', `Collage preview: ${t.name} layout, ${filled} of ${plural(slotCount(t), 'slot')} filled, ${aspect ? aspect[0] : `${doc.aspect.w}:${doc.aspect.h}`} sheet`);
  }
  /** Layout thumbnails at the current sheet aspect, in the panel's token colours. */
  function drawThumbs() {
    const style = getComputedStyle(document.documentElement), sheetColor = style.getPropertyValue('--line-strong').trim(), slotColor = style.getPropertyValue('--text-muted').trim();
    const checkerLight = style.getPropertyValue('--raised').trim();
    const dpr = Math.min(2, devicePixelRatio || 1), box = 52, a = doc.aspect.w / doc.aspect.h;
    const w = Math.round((a >= 1 ? box : box * a) * dpr), h = Math.round((a >= 1 ? box / a : box) * dpr);
    for (const option of list.querySelectorAll('[data-template]')) {
      const thumb = option.querySelector('canvas'), layout = layoutTemplate(templateById(option.dataset.template), w, h, { gutter: .06, margin: .06 });
      thumb.width = w; thumb.height = h; thumb.style.width = `${w / dpr}px`; thumb.style.height = `${h / dpr}px`;
      const ctx = thumb.getContext('2d');
      if (doc.sheet.background === 'transparent') { // checkerboard: see-through sheet
        const cell = Math.max(2, Math.round(4 * dpr));
        ctx.fillStyle = checkerLight; ctx.fillRect(0, 0, w, h); ctx.fillStyle = sheetColor;
        for (let y = 0; y < h; y += cell) for (let x = (y / cell) % 2 ? cell : 0; x < w; x += cell * 2) ctx.fillRect(x, y, cell, cell);
      } else { ctx.fillStyle = sheetColor; ctx.fillRect(0, 0, w, h); }
      ctx.fillStyle = slotColor; for (const s of layout.slots) ctx.fillRect(s.x, s.y, s.w, s.h);
    }
  }

  // ---------- Stage ----------
  function scheduleDraw() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); }
  /** Sizes the canvas to the stage (device pixels) and composites the collage. */
  function draw() {
    if (!active) return;
    const style = getComputedStyle(stage), availW = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availH = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (availW <= 0 || availH <= 0) return;
    const a = doc.aspect.w / doc.aspect.h, cssW = Math.min(availW, availH * a), cssH = cssW / a;
    const dpr = devicePixelRatio || 1, scale = Math.min(dpr, 2400 / Math.max(cssW, cssH));
    const width = Math.max(1, Math.round(cssW * scale)), height = Math.max(1, Math.round(cssH * scale));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    const layout = layoutTemplate(template(), width, height, doc);
    drawCollage(canvas.getContext('2d'), doc, layout, imageOf);
    view = { layout, k: width / cssW };
    syncSlots();
  }
  const imageOf = index => cache.get(doc.slots[index]?.photoId)?.image || null;

  // ---------- Slots on the stage: a listbox of focusable boxes over the canvas ----------
  function syncSlots() {
    const { layout, k } = view, count = layout.slots.length;
    while (slotsEl.children.length > count) slotsEl.lastElementChild.remove();
    while (slotsEl.children.length < count) {
      const option = document.createElement('div');
      option.className = 'collage-slot'; option.setAttribute('role', 'option'); option.dataset.slot = slotsEl.children.length;
      option.innerHTML = '<span class="collage-slot-empty" aria-hidden="true">+ Add photo</span>';
      slotsEl.append(option);
    }
    layout.slots.forEach((slot, i) => {
      const option = slotsEl.children[i], photo = deps.photoById(doc.slots[i]?.photoId);
      Object.assign(option.style, { left: `${slot.x / k}px`, top: `${slot.y / k}px`, width: `${slot.w / k}px`, height: `${slot.h / k}px`, borderRadius: `${slot.radius / k}px` });
      option.setAttribute('aria-selected', i === selected); option.tabIndex = i === (selected ?? 0) ? 0 : -1;
      option.classList.toggle('is-empty', !photo);
      option.classList.toggle('is-drop-target', gesture?.mode === 'swap' && gesture.target === i);
      option.classList.toggle('is-dragged', gesture?.mode === 'swap' && gesture.index === i);
      option.setAttribute('aria-label', `Slot ${i + 1} of ${count}: ${photo ? photo.name : 'empty'}`);
    });
  }
  function select(index, { focus = false } = {}) {
    if (index !== selected) { selected = index; syncSlotPanel(); scheduleDraw(); }
    if (focus && index != null) slotsEl.children[index]?.focus();
  }
  /** Slot index under a client point (top-most first), or null. */
  function slotAt(clientX, clientY) {
    const box = canvas.getBoundingClientRect(), x = (clientX - box.left) * view.k, y = (clientY - box.top) * view.k;
    const hit = [...view.layout.slots].sort((a, b) => b.z - a.z || b.index - a.index).find(s => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
    return hit ? hit.index : null;
  }
  /** Fill geometry of slot `index` on the stage (device px), or null when it has no photo yet. */
  function geometry(index) {
    const slot = view.layout?.slots[index], image = imageOf(index);
    return slot && image && deps.photoById(doc.slots[index].photoId) ? fillGeometry(image.width, image.height, slot.w, slot.h, doc.slots[index]) : null;
  }
  // Pointer: drag pans the photo inside its slot; dragging it onto another slot swaps them (drop); two fingers zoom.
  slotsEl.addEventListener('pointerdown', event => {
    const option = event.target.closest('[data-slot]');
    if (event.button > 0) return;
    if (!option) { select(null); return; } // gutters, margins and transparent areas hold nothing
    const index = Number(option.dataset.slot);
    select(index);
    if (event.target.closest('.collage-slot-empty')) return; // its click opens the file picker (no capture, or click goes elsewhere)
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { slotsEl.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    if (pointers.size === 1) gesture = { index, start: cloneDoc(doc), x: event.clientX, y: event.clientY, g: geometry(index), pan: { ...doc.slots[index].pan }, mode: 'pan', target: null, moved: false };
    else if (pointers.size === 2 && gesture && gesture.mode !== 'swap') {
      const [a, b] = [...pointers.values()];
      Object.assign(gesture, { mode: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: doc.slots[gesture.index].zoom });
    }
  });
  slotsEl.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!gesture || gesture.mode === 'ended') return;
    const slot = doc.slots[gesture.index];
    if (gesture.mode === 'pinch') {
      const [a, b] = [...pointers.values()]; if (!b) return;
      slot.zoom = clamp(gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance, ZOOM_MIN, ZOOM_MAX);
      syncFillValues(); scheduleDraw(); return;
    }
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 3) return;
    gesture.moved = true;
    const over = slotAt(event.clientX, event.clientY);
    if (over != null && over !== gesture.index && deps.photoById(slot.photoId)) {
      if (gesture.mode !== 'swap') { slot.pan = { ...gesture.pan }; gesture.mode = 'swap'; }
      if (gesture.target !== over) { gesture.target = over; say(`Drop to swap with slot ${over + 1}`); }
      scheduleDraw(); return;
    }
    if (gesture.mode === 'swap') { Object.assign(gesture, { mode: 'pan', target: null, x: event.clientX, y: event.clientY }); scheduleDraw(); return; }
    if (gesture.g) { slot.pan = panBy(gesture.g, gesture.pan, dx * view.k, dy * view.k); scheduleDraw(); }
  });
  const endPointer = event => {
    if (!pointers.delete(event.pointerId) || !gesture) return;
    if (gesture.mode === 'pinch' && pointers.size) { gesture.mode = 'ended'; return; } // wait for the last finger
    if (pointers.size) return;
    const { start, mode, target, index } = gesture;
    gesture = null;
    if (mode === 'swap' && target != null && event.type === 'pointerup') {
      swapSlots(doc, index, target); selected = target; say(`Swapped slots ${index + 1} and ${target + 1}`);
    }
    commit(start); refresh();
  };
  slotsEl.addEventListener('pointerup', endPointer);
  slotsEl.addEventListener('pointercancel', endPointer);
  // "+ Add photo" on an empty slot: choose files for it (click is a user gesture, so the picker may open).
  slotsEl.addEventListener('click', event => {
    const option = event.target.closest('[data-slot]');
    if (!option || !event.target.closest('.collage-slot-empty')) return;
    select(Number(option.dataset.slot)); slotUi.file.click();
  });
  slotsEl.addEventListener('dblclick', event => { if (event.target.closest('[data-slot]')) editFill(resetFraming, 'Framing reset'); });
  slotsEl.addEventListener('wheel', event => {
    const option = event.target.closest('[data-slot]'); if (!option) return;
    const index = Number(option.dataset.slot), slot = doc.slots[index];
    if (!deps.photoById(slot.photoId)) return;
    event.preventDefault(); select(index);
    wheel ||= { start: cloneDoc(doc) };
    slot.zoom = clamp(slot.zoom * Math.exp(-event.deltaY * .0015), ZOOM_MIN, ZOOM_MAX);
    syncFillValues(); scheduleDraw();
    clearTimeout(wheel.timer);
    wheel.timer = setTimeout(() => { commit(wheel.start); wheel = null; say(`Zoom ${Math.round(slot.zoom * 100)}%`); }, 400);
  }, { passive: false });
  slotsEl.addEventListener('focusin', event => { const option = event.target.closest('[data-slot]'); if (option && !gesture) select(Number(option.dataset.slot)); });
  // Keys: arrows choose a slot; Alt+arrows pan; + − zoom; R rotates (Shift: back); F flips; 0 resets; Delete empties.
  slotsEl.addEventListener('keydown', event => {
    const option = event.target.closest('[data-slot]'); if (!option) return;
    const index = Number(option.dataset.slot), count = view.layout.slots.length, key = event.key;
    const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
    if (arrow && event.altKey) {
      event.preventDefault(); const g = geometry(index); if (!g) return;
      const s = view.layout.slots[index], step = Math.min(s.w, s.h) * (event.shiftKey ? .2 : .05);
      editFill(slot => { slot.pan = panBy(g, slot.pan, arrow[0] * step, arrow[1] * step); }, 'Photo moved');
      return;
    }
    const next = arrow ? index + (arrow[0] || arrow[1]) : key === 'Home' ? 0 : key === 'End' ? count - 1 : null;
    if (next != null) { event.preventDefault(); select(clamp(next, 0, count - 1), { focus: true }); return; }
    if (event.ctrlKey || event.metaKey) return;
    const zoomBy = factor => editFill(slot => { slot.zoom *= factor; }, slot => `Zoom ${Math.round(slot.zoom * 100)}%`);
    const actions = {
      '+': () => zoomBy(1.1), '=': () => zoomBy(1.1), '-': () => zoomBy(1 / 1.1), '0': () => editFill(resetFraming, 'Framing reset'),
      r: () => editFill(slot => { slot.rotate += 90; }, slot => `Rotated to ${slot.rotate}°`),
      R: () => editFill(slot => { slot.rotate -= 90; }, slot => `Rotated to ${slot.rotate}°`),
      f: () => editFill(slot => { slot.flip = !slot.flip; }, slot => (slot.flip ? 'Flipped' : 'Not flipped')),
      Delete: emptySelected, Backspace: emptySelected,
      Enter: () => { if (!slotPhoto()) slotUi.file.click(); } // an empty slot: choose a photo file for it
    };
    const action = actions[key] || (key === 'F' ? actions.f : null);
    if (action) { event.preventDefault(); select(index); action(); }
  });
  /** Long edge (device px) a slot photo may need on this stage: independent of the layout and aspect, so switching
   *  them never renders a photo again. */
  function needEdge() {
    const long = Math.max(stage.clientWidth, stage.clientHeight) * Math.min(2, devicePixelRatio || 1);
    return Math.min(MAX_SLOT_EDGE, Math.max(400, Math.ceil(long / 200) * 200));
  }

  // ---------- Slot renders: a fast pass from the queue thumb, then a sharp pass for every photo ----------
  const freeImage = image => { if (!image) return; if (image.close) image.close(); else { image.width = 0; image.height = 0; } };
  function visiblePhotos() {
    const ids = doc.slots.slice(0, slotCount(template())).map(slot => slot.photoId);
    return [...new Set(ids)].map(deps.photoById).filter(Boolean);
  }
  function nextJob() {
    const photos = visiblePhotos(), edge = needEdge();
    const keyed = photos.map(photo => ({ photo, key: JSON.stringify(deps.settingsOf(photo)), entry: cache.get(photo.id) }));
    for (const { photo, key, entry } of keyed) if ((!entry || entry.key !== key) && !failed.has(`${photo.id}:${key}:fast`)) return { photo, key, pass: 'fast', edge: 0 };
    for (const { photo, key, entry } of keyed) {
      if (entry?.key === key && (!entry.sharp || entry.edge < edge / 1.25) && !failed.has(`${photo.id}:${key}:sharp`)) return { photo, key, pass: 'sharp', edge };
    }
    return null;
  }
  function countWork() {
    const edge = needEdge();
    return visiblePhotos().filter(photo => { const entry = cache.get(photo.id); return !entry || entry.key !== JSON.stringify(deps.settingsOf(photo)) || !entry.sharp || entry.edge < edge / 1.25; }).length;
  }
  async function pump() {
    if (pumping || !active) return;
    pumping = true;
    const gen = generation;
    progress = { done: 0, total: countWork() };
    syncStatus();
    try {
      for (let next = nextJob(); next && active && gen === generation; next = nextJob()) {
        const job = running = { stale: false };
        let result = null;
        try { result = await deps.renderSlot(next.photo, { pass: next.pass, edge: next.edge, job }); }
        catch (error) { console.error(error); failed.add(`${next.photo.id}:${next.key}:${next.pass}`); }
        running = null;
        if (!active || gen !== generation || job.stale || !result) { freeImage(result?.image); continue; }
        const old = cache.get(next.photo.id);
        if (old?.image !== result.image) freeImage(old?.image);
        cache.set(next.photo.id, { key: next.key, image: result.image, edge: next.edge, sharp: next.pass === 'sharp' });
        if (next.pass === 'sharp') progress.done++;
        progress.total = Math.max(progress.total, progress.done + countWork());
        syncStatus(); scheduleDraw();
      }
    } finally {
      pumping = false;
      if (active) { progress = { done: 0, total: 0 }; syncStatus(); if (nextJob()) pump(); }
    }
  }
  /** Drops renders of photos no longer in a visible slot. */
  function prune() {
    const keep = new Set(visiblePhotos().map(photo => photo.id));
    for (const [id, entry] of cache) if (!keep.has(id)) { freeImage(entry.image); cache.delete(id); }
  }
  let message = '', messageTimer;
  function say(text) { message = text; clearTimeout(messageTimer); messageTimer = setTimeout(() => { message = ''; syncStatus(); }, 2500); syncStatus(); }
  function syncStatus() {
    status.textContent = progress.total ? `Developing photos… ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : message;
    stage.classList.toggle('is-developing', progress.total > 0);
  }

  function refresh() { syncPanel(); prune(); scheduleDraw(); pump(); }

  buildPanel();
  new ResizeObserver(() => { if (active) { scheduleDraw(); pump(); } }).observe(stage);

  return {
    get active() { return active; },
    get busy() { return pumping; },
    get canUndo() { return active && undoStack.length > 0; },
    get canRedo() { return active && redoStack.length > 0; },
    get hasDocument() { return Boolean(doc); },
    /** Opens collage mode with `photoIds` (in order); null resumes the last collage. The same photos also resume it,
     *  with its history. */
    open(photoIds) {
      const key = photoIds && [...photoIds].sort((a, b) => a - b).join();
      if (!doc || (photoIds && docPhotos !== key)) {
        const t = templateFor(photoIds.length);
        doc = fitSlots(createDoc(photoIds, t, deps.paperColors[0].hex), slotCount(t)); docPhotos = key;
        undoStack = []; redoStack = []; selected = null;
      }
      active = true; failed.clear(); generation++;
      historyChanged(); refresh();
      // After the first draw, which creates the slot boxes.
      requestAnimationFrame(() => (selected != null ? slotsEl.children[selected] : list.querySelector('[aria-selected="true"]'))?.focus({ preventScroll: true }));
    },
    /** Leaves collage mode: drops pending renders (the document and history stay). The slot images are freed unless
     *  `keepCache` (leaving to edit one photo: the others need no new render on return). */
    close({ keepCache = false } = {}) {
      if (!active) return;
      active = false; generation++; if (running) running.stale = true;
      cancelAnimationFrame(frame); frame = 0; slider = null; gesture = null; pointers.clear();
      if (wheel) { clearTimeout(wheel.timer); commit(wheel.start); wheel = null; }
      if (!keepCache) { for (const entry of cache.values()) freeImage(entry.image); cache.clear(); }
      progress = { done: 0, total: 0 }; message = ''; syncStatus();
      historyChanged();
    },
    /** Esc: clears the slot selection first; false when there was nothing to clear (then collage mode closes). */
    escape() {
      if (selected == null) return false;
      const option = slotsEl.children[selected]; select(null); option?.focus(); say('No photo selected');
      return true;
    },
    /** One undo step of changes to the document from outside (the export sheet's flatten colour). */
    update(mutator) { if (doc) change(mutator); },
    undo() { step(undoStack, redoStack, 'Undone'); },
    redo() { step(redoStack, undoStack, 'Redone'); },
    /** A photo's edit changed outside collage mode: its slot re-renders on the next pump. */
    refresh() { if (active) refresh(); },
    /** For checks: the current document (a copy). */
    snapshot() { return doc && cloneDoc(doc); }
  };
}
