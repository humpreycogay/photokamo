// Slots (part of collage mode, js/collage/mode.js): the selected slot's tools in the panel, the focusable slot boxes on
// the stage (pan, swap, pinch, wheel zoom, keys) and the divider handles of diptychs and triptychs. `c` is the
// collage context (mode.js).
import { slotCount } from './templates.js';
import { splitAxis, defaultSplits, clampSplits, moveSplit } from './layout.js';
import { pointInPolygon, polygonCentroid } from './shapes.js';
import { unrotatePoint } from './scrapbook.js';
import { fillGeometry, normalizeFill, panBy, ZOOM_MIN, ZOOM_MAX } from './fill.js';
import { cloneDoc, resetFraming, swapSlots } from './model.js';
import { clamp, coverThumb, escapeHtml, liveRange, plural, radioGroup, syncRadios, visibleCss } from './ui.js';

export function createSlotsUi(c) {
  const { deps, byId, canvas, slotsEl, change, commit, refresh, say, scheduleDraw, template, cancelGesture } = c;
  const imageOf = (...args) => c.ui.cache.imageOf(...args);
  const dividersEl = byId('collageDividers');
  const slotUi = { hint: byId('collageSlotHint'), tools: byId('collageSlotTools'), title: byId('collageSlotTitle'), photoTools: byId('collagePhotoTools'),
    zoom: byId('collageZoom'), angle: byId('collageAngle'), rotate: byId('collageRotate'), flip: byId('collageFlip'), reset: byId('collageReset'),
    free: byId('collageFreeTools'), stageTools: byId('collageStageTools'), dragMode: byId('collageDragMode'), layoutRotate: byId('collageLayoutRotate'), layoutRotateOutput: byId('collageLayoutRotateOutput'), back: byId('collageSendBack'), forward: byId('collageBringForward'),
    move: byId('collageMove'), photos: byId('collagePhotos'), add: byId('collageAddPhoto'), empty: byId('collageEmpty'), edit: byId('collageEdit'), file: byId('collageFileInput') };
  let freeDragMode = 'pan', photosKey = '', gesture = null;
  const pointers = new Map();

  // ---------- Slot editing: the selected slot's photo (panel) ----------
  const slotFill = () => (c.selected == null ? null : c.doc.slots[c.selected]);
  const slotPhoto = () => deps.photoById(slotFill()?.photoId);
  /** Changes the selected slot's framing as one undo step; `message` goes to the status line. */
  function editFill(mutate, message) {
    if (c.selected == null || !slotPhoto()) return;
    const index = c.selected;
    change(d => { const slot = d.slots[index]; mutate(slot); Object.assign(slot, normalizeFill(slot)); });
    if (message) say(typeof message === 'function' ? message(c.doc.slots[index]) : message);
  }
  /** Puts photo `id` in the selected slot; if it is already in another slot, the two swap. */
  function placePhoto(id) {
    if (c.selected == null) return;
    const index = c.selected, other = c.doc.slots.findIndex((slot, i) => slot.photoId === id && i !== index), photo = deps.photoById(id);
    change(d => { if (other >= 0) swapSlots(d, index, other); else { d.slots[index].photoId = id; resetFraming(d.slots[index]); } });
    say(other >= 0 && other < slotCount(template()) ? `${photo.name} swapped with slot ${other + 1}` : `${photo.name} in slot ${index + 1}`);
  }
  function buildSlotPanel() {
    // Zoom and angle: live while dragging, one undo step per gesture.
    for (const input of [slotUi.zoom, slotUi.angle]) {
      const key = input.dataset.fill;
      liveRange(c, input, () => {
        const slot = slotFill(); if (!slot) return;
        slot[key] = key === 'zoom' ? Number(input.value) / 100 : Number(input.value);
        Object.assign(slot, normalizeFill(slot)); syncFillValues(); scheduleDraw();
      });
    }
    slotUi.rotate.addEventListener('click', () => editFill(slot => { slot.rotate += 90; }, slot => `Rotated to ${slot.rotate}°`));
    slotUi.flip.addEventListener('click', () => editFill(slot => { slot.flip = !slot.flip; }, slot => (slot.flip ? 'Flipped' : 'Not flipped')));
    slotUi.reset.addEventListener('click', () => editFill(resetFraming, 'Framing reset'));
    slotUi.move.addEventListener('change', () => moveTo(Number(slotUi.move.value)));
    radioGroup(slotUi.photos, '[data-photo]', button => placePhoto(Number(button.dataset.photo)), { followFocus: false }); // a pick swaps photos
    slotUi.empty.addEventListener('click', emptySelected);
    slotUi.edit.addEventListener('click', () => { const photo = slotPhoto(); if (photo) deps.editPhoto(photo.id); });
    slotUi.add.addEventListener('click', () => slotUi.file.click());
    radioGroup(slotUi.dragMode, '[data-drag-mode]', button => {
      freeDragMode = button.dataset.dragMode;
      syncRadios(slotUi.dragMode, 'data-drag-mode', freeDragMode);
      say(freeDragMode === 'pan' ? 'Drag moves the photo' : 'Drag moves the print');
    });
    slotUi.file.addEventListener('change', async () => {
      const files = [...slotUi.file.files]; slotUi.file.value = '';
      if (c.selected == null || !files.length) return;
      const index = c.selected, added = await deps.addFiles(files);
      if (!c.active || !added.length) return;
      // The first new photo goes in this slot, the rest into empty slots after it.
      const count = slotCount(template()), empties = c.doc.slots.map((slot, i) => i).filter(i => i > index && i < count && !deps.photoById(c.doc.slots[i].photoId));
      const placed = [index, ...empties].slice(0, added.length);
      change(d => placed.forEach((i, n) => { d.slots[i].photoId = added[n].id; resetFraming(d.slots[i]); }));
      const extra = added.length - placed.length;
      say(`${plural(placed.length, 'photo')} added${extra ? `; ${extra} more in the strip` : ''}`);
    });
    liveRange(c, slotUi.layoutRotate, () => {
      if (c.selected == null) return; const fill = c.doc.slots[c.selected]; fill.layout ||= {};
      let angle = Number(slotUi.layoutRotate.value); if (Math.abs(angle) <= 2) angle = 0; fill.layout.rotate = angle; syncFreeValues(); scheduleDraw();
    });
    const reorder = delta => {
      if (c.selected == null || template().kind !== 'free') return;
      change(d => { const zs = c.view.layout.slots.map(s => s.z), target = delta > 0 ? Math.max(...zs) + 1 : Math.min(...zs) - 1; (d.slots[c.selected].layout ||= {}).z = target; });
      say(delta > 0 ? 'Brought forward' : 'Sent back');
    };
    slotUi.forward.addEventListener('click', () => reorder(1)); slotUi.back.addEventListener('click', () => reorder(-1));
  }
  function moveTo(target) {
    if (c.selected == null || target === c.selected || !(target >= 0)) return;
    const from = c.selected;
    change(d => swapSlots(d, from, target));
    c.selected = target; refresh(); say(`Moved to slot ${target + 1}`);
  }
  function emptySelected() {
    if (c.selected == null || !slotPhoto()) return;
    const index = c.selected;
    change(d => { d.slots[index].photoId = null; resetFraming(d.slots[index]); });
    say(`Slot ${index + 1} emptied`);
  }
  function syncFillValues() {
    const slot = slotFill(); if (!slot) return;
    slotUi.zoom.value = Math.round(slot.zoom * 100); byId('collageZoomOutput').value = `${Math.round(slot.zoom * 100)}%`;
    slotUi.angle.value = slot.angle; byId('collageAngleOutput').value = `${slot.angle}°`;
    slotUi.flip.setAttribute('aria-pressed', slot.flip);
  }
  function syncFreeValues() {
    if (c.selected == null || template().kind !== 'free') return;
    const angle = c.doc.slots[c.selected].layout?.rotate ?? template().slots[c.selected].rotate ?? 0;
    slotUi.layoutRotate.value = angle; slotUi.layoutRotateOutput.value = `${angle}°`;
  }
  function syncSlotPanel() {
    const count = slotCount(template());
    slotUi.stageTools.hidden = template().kind !== 'free';
    if (c.selected != null && c.selected >= count) c.selected = null;
    const slot = slotFill(), photo = slotPhoto();
    slotUi.tools.hidden = c.selected == null; slotUi.hint.hidden = c.selected != null;
    slotUi.title.textContent = c.selected == null ? 'Photo' : `Slot ${c.selected + 1} · ${photo ? photo.name : 'empty'}`;
    if (c.selected == null) return;
    slotUi.free.hidden = template().kind !== 'free'; syncFreeValues();
    slotUi.photoTools.hidden = !photo; slotUi.edit.hidden = !photo; slotUi.empty.hidden = !photo;
    syncFillValues();
    slotUi.move.innerHTML = c.doc.slots.slice(0, count).map((s, i) => `<option value="${i}"${i === c.selected ? ' selected' : ''}>Slot ${i + 1} · ${escapeHtml(deps.photoById(s.photoId)?.name || 'empty')}</option>`).join('');
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

  // ---------- Dividers: diptych / triptych track sizes (Task 6) ----------
  const currentSplits = () => { const t = template(), n = splitAxis(t) === 'x' ? t.cols.length : t.rows.length; return clampSplits(c.doc.splits, n) || defaultSplits(t); };
  /** Share (%) of each photo either side of divider i, for the status line and screen readers. */
  function shares(splits, i) { const at = k => (k < 0 ? 0 : k >= splits.length ? 1 : splits[k]); return [at(i) - at(i - 1), at(i + 1) - at(i)].map(v => Math.round(v * 100)); }
  function syncDividers() {
    const { layout, k } = c.view, axis = layout.axis, splits = axis ? currentSplits() : [];
    while (dividersEl.children.length > splits.length) dividersEl.lastElementChild.remove();
    while (dividersEl.children.length < splits.length) {
      const handle = document.createElement('div');
      handle.className = 'collage-divider'; handle.setAttribute('role', 'separator'); handle.tabIndex = 0;
      handle.dataset.divider = dividersEl.children.length; dividersEl.append(handle);
    }
    splits.forEach((split, i) => {
      const handle = dividersEl.children[i], tracks = axis === 'x' ? layout.cols : layout.rows, across = axis === 'x' ? layout.rows : layout.cols;
      const at = (tracks[i].start + tracks[i].size + layout.gutter / 2) / k, from = across[0].start / k, to = (across.at(-1).start + across.at(-1).size) / k;
      Object.assign(handle.style, axis === 'x' ? { left: `${at}px`, top: `${from}px`, height: `${to - from}px`, width: '', marginTop: '' } : { top: `${at}px`, left: `${from}px`, width: `${to - from}px`, height: '', marginLeft: '' });
      const [a, b] = shares(splits, i), lo = Math.round(((i ? splits[i - 1] : 0) + .15) * 100), hi = Math.round(((i < splits.length - 1 ? splits[i + 1] : 1) - .15) * 100);
      handle.setAttribute('aria-orientation', axis === 'x' ? 'vertical' : 'horizontal');
      handle.setAttribute('aria-label', `Divider between photos ${i + 1} and ${i + 2}`);
      handle.setAttribute('aria-valuemin', lo); handle.setAttribute('aria-valuemax', hi); handle.setAttribute('aria-valuenow', Math.round(split * 100));
      handle.setAttribute('aria-valuetext', `Photo ${i + 1} ${a}%, photo ${i + 2} ${b}%`);
    });
  }
  /** Divider position (0–1 of the room) under a client point. */
  function splitAt(i, clientX, clientY) {
    const { layout, k } = c.view, box = canvas.getBoundingClientRect(), x = layout.axis === 'x';
    const p = ((x ? clientX - box.left : clientY - box.top)) * k, length = x ? layout.width : layout.height, n = (x ? layout.cols : layout.rows).length;
    const room = length - 2 * layout.margin - (n - 1) * layout.gutter;
    return (p - layout.gutter / 2 - layout.margin - i * layout.gutter) / room;
  }
  let drag = null;
  dividersEl.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-divider]'); if (!handle || event.button > 0) return;
    event.preventDefault(); handle.focus({ preventScroll: true });
    try { handle.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    drag = { i: Number(handle.dataset.divider), start: cloneDoc(c.doc), handle, id: event.pointerId }; handle.classList.add('is-dragging');
  });
  dividersEl.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    c.doc.splits = moveSplit(currentSplits(), drag.i, splitAt(drag.i, event.clientX, event.clientY)); scheduleDraw();
  });
  const endDrag = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const { i, start, handle } = drag; drag = null; handle.classList.remove('is-dragging');
    if (event.type === 'pointercancel') { cancelGesture(start); return; }
    commit(start); refresh(); const [a, b] = shares(currentSplits(), i); say(`Photo ${i + 1} ${a}%, photo ${i + 2} ${b}%`);
  };
  dividersEl.addEventListener('pointerup', endDrag); dividersEl.addEventListener('pointercancel', endDrag);
  // Keys: arrows move the focused divider 1 % (Shift: 5 %), Home/End to its limits; one undo step per key press.
  dividersEl.addEventListener('keydown', event => {
    const handle = event.target.closest('[data-divider]'); if (!handle) return;
    const i = Number(handle.dataset.divider), step = event.shiftKey ? .05 : .01, splits = currentSplits();
    const delta = { ArrowLeft: -step, ArrowUp: -step, ArrowRight: step, ArrowDown: step, Home: -1, End: 1 }[event.key]; if (delta === undefined) return;
    event.preventDefault();
    change(d => { d.splits = moveSplit(splits, i, splits[i] + delta); });
    const [a, b] = shares(currentSplits(), i); say(`Photo ${i + 1} ${a}%, photo ${i + 2} ${b}%`);
  });

  // ---------- Slots on the stage: a listbox of focusable boxes over the canvas ----------
  function syncSlots() {
    const { layout, k } = c.view, count = layout.slots.length;
    while (slotsEl.children.length > count) slotsEl.lastElementChild.remove();
    while (slotsEl.children.length < count) {
      const option = document.createElement('div');
      option.className = 'collage-slot'; option.setAttribute('role', 'option'); option.dataset.slot = slotsEl.children.length;
      option.innerHTML = '<span class="collage-slot-empty" aria-hidden="true">+<span class="collage-slot-empty-word">&nbsp;Add photo</span></span>';
      slotsEl.append(option);
    }
    layout.slots.forEach((slot, i) => {
      const option = slotsEl.children[i], photo = deps.photoById(c.doc.slots[i]?.photoId);
      Object.assign(option.style, { left: `${slot.x / k}px`, top: `${slot.y / k}px`, width: `${slot.w / k}px`, height: `${slot.h / k}px`, borderRadius: `${slot.radius / k}px`, zIndex: slot.z + 1, transform: slot.rotate ? `rotate(${slot.rotate}deg)` : '' });
      // Shaped slots: the box is clipped to the slot's visible part, so taps outside the shape (and in the hole) miss it.
      const shaped = Boolean(slot.visible);
      option.classList.toggle('is-shaped', shaped);
      option.style.clipPath = shaped && !slot.rotate ? `path(evenodd, "${visibleCss(slot, k)}")` : '';
      if (shaped) { const [cx, cy] = polygonCentroid(slot.visible); option.style.setProperty('--cx', `${(cx - slot.x) / k}px`); option.style.setProperty('--cy', `${(cy - slot.y) / k}px`); }
      option.setAttribute('aria-selected', i === c.selected); option.tabIndex = i === (c.selected ?? 0) ? 0 : -1;
      option.classList.toggle('is-empty', !photo);
      option.classList.toggle('is-drop-target', gesture?.mode === 'swap' && gesture.target === i);
      option.classList.toggle('is-dragged', gesture?.mode === 'swap' && gesture.index === i);
      option.classList.toggle('is-free', template().kind === 'free');
      if (template().kind === 'free' && i === c.selected && !option.querySelector('.collage-rotate-handle')) option.insertAdjacentHTML('beforeend', '<button class="collage-rotate-handle" type="button" tabindex="-1" aria-label="Rotate print" title="Drag to rotate"></button>');
      else if (!(template().kind === 'free' && i === c.selected)) option.querySelector('.collage-rotate-handle')?.remove();
      option.setAttribute('aria-label', `Slot ${i + 1} of ${count}: ${photo ? photo.name : 'empty'}`);
    });
  }
  function select(index, { focus = false } = {}) {
    if (index !== c.selected) { c.selected = index; syncSlotPanel(); scheduleDraw(); }
    if (focus && index != null) slotsEl.children[index]?.focus();
  }
  /** Slot index under a client point (top-most first), or null. */
  function slotAt(clientX, clientY) {
    const box = canvas.getBoundingClientRect(), x = (clientX - box.left) * c.view.k, y = (clientY - box.top) * c.view.k;
    const inside = s => { const p = unrotatePoint(s, x, y); return s.visible ? pointInPolygon(s.visible, p.x, p.y) && !(s.holeVisible?.length && pointInPolygon(s.holeVisible, p.x, p.y)) : p.x >= s.x && p.x < s.x + s.w && p.y >= s.y && p.y < s.y + s.h; };
    const hit = [...c.view.layout.slots].sort((a, b) => b.z - a.z || b.index - a.index).find(inside);
    return hit ? hit.index : null;
  }
  /** Fill geometry of slot `index` on the stage (device px), or null when it has no photo yet. */
  function geometry(index) {
    const slot = c.view.layout?.slots[index], image = imageOf(index);
    return slot && image && deps.photoById(c.doc.slots[index].photoId) ? fillGeometry(image.width, image.height, slot.w, slot.h, c.doc.slots[index]) : null;
  }
  // Pointer: drag pans the photo inside its slot; dragging it onto another slot swaps them (drop); two fingers zoom.
  slotsEl.addEventListener('pointerdown', event => {
    const option = event.target.closest('[data-slot]');
    if (event.button > 0) return;
    if (!option) { select(null); return; } // gutters, margins and transparent areas hold nothing
    const index = Number(option.dataset.slot);
    if (!gesture) select(index); // a second finger on another slot joins the gesture, it doesn't select
    if (event.target.closest('.collage-rotate-handle')) {
      event.preventDefault(); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); try { slotsEl.setPointerCapture(event.pointerId); } catch { /* gone */ }
      const box = canvas.getBoundingClientRect(), slot = c.view.layout.slots[index], cx = box.left + (slot.x + slot.w / 2) / c.view.k, cy = box.top + (slot.y + slot.h / 2) / c.view.k;
      gesture = { index, start: cloneDoc(c.doc), mode: 'rotate-layout', cx, cy, startPointer: Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI, angle: slot.rotate };
      return;
    }
    if (event.target.closest('.collage-slot-empty')) return; // its click opens the file picker (no capture, or click goes elsewhere)
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { slotsEl.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    if (pointers.size === 1) gesture = { index, start: cloneDoc(c.doc), x: event.clientX, y: event.clientY, g: geometry(index), pan: { ...c.doc.slots[index].pan }, mode: template().kind === 'free' ? freeDragMode : 'pan', target: null, moved: false,
      layout: template().kind === 'free' ? { x: c.doc.slots[index].layout?.x ?? template().slots[index].x, y: c.doc.slots[index].layout?.y ?? template().slots[index].y } : null };
    else if (pointers.size === 2 && gesture && gesture.mode !== 'swap') {
      const [a, b] = [...pointers.values()];
      Object.assign(gesture, { mode: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: c.doc.slots[gesture.index].zoom });
    }
  });
  slotsEl.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!gesture || gesture.mode === 'ended') return;
    const slot = c.doc.slots[gesture.index];
    if (gesture.mode === 'rotate-layout') {
      let angle = gesture.angle + Math.atan2(event.clientY - gesture.cy, event.clientX - gesture.cx) * 180 / Math.PI - gesture.startPointer;
      angle = clamp(Math.round(angle), -45, 45); if (Math.abs(angle) <= 2) angle = 0; (slot.layout ||= {}).rotate = angle; syncFreeValues(); scheduleDraw(); return;
    }
    if (gesture.mode === 'pinch') {
      const [a, b] = [...pointers.values()]; if (!b) return;
      slot.zoom = clamp(gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance, ZOOM_MIN, ZOOM_MAX);
      syncFillValues(); scheduleDraw(); return;
    }
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 3) return;
    gesture.moved = true;
    if (gesture.mode === 'move') {
      const item = template().slots[gesture.index], fill = c.doc.slots[gesture.index], nx = gesture.layout.x + dx * c.view.k / c.view.layout.width, ny = gesture.layout.y + dy * c.view.k / c.view.layout.height;
      fill.layout ||= {}; fill.layout.x = clamp(nx, 0, 1 - item.w); fill.layout.y = clamp(ny, 0, 1 - item.h); scheduleDraw(); return;
    }
    const over = template().kind === 'free' ? gesture.index : slotAt(event.clientX, event.clientY);
    if (over != null && over !== gesture.index && deps.photoById(slot.photoId)) {
      if (gesture.mode !== 'swap') { slot.pan = { ...gesture.pan }; gesture.mode = 'swap'; }
      if (gesture.target !== over) { gesture.target = over; say(`Drop to swap with slot ${over + 1}`); }
      scheduleDraw(); return;
    }
    if (gesture.mode === 'swap') { Object.assign(gesture, { mode: 'pan', target: null, x: event.clientX, y: event.clientY }); scheduleDraw(); return; }
    if (gesture.g) { slot.pan = panBy(gesture.g, gesture.pan, dx * c.view.k, dy * c.view.k); scheduleDraw(); }
  });
  const endPointer = event => {
    if (!pointers.delete(event.pointerId) || !gesture) return;
    if (event.type === 'pointercancel') { const { start } = gesture; gesture = null; pointers.clear(); cancelGesture(start); return; }
    if (gesture.mode === 'pinch' && pointers.size) { gesture.mode = 'ended'; return; } // wait for the last finger
    if (pointers.size) return;
    const { start, mode, target, index } = gesture;
    gesture = null;
    if (mode === 'swap' && target != null && event.type === 'pointerup') {
      swapSlots(c.doc, index, target); c.selected = target; say(`Swapped slots ${index + 1} and ${target + 1}`);
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
    const index = Number(option.dataset.slot), slot = c.doc.slots[index];
    if (!deps.photoById(slot.photoId)) return;
    event.preventDefault(); select(index);
    c.wheel ||= { start: cloneDoc(c.doc) };
    slot.zoom = clamp(slot.zoom * Math.exp(-event.deltaY * .0015), ZOOM_MIN, ZOOM_MAX);
    syncFillValues(); scheduleDraw();
    clearTimeout(c.wheel.timer);
    c.wheel.timer = setTimeout(() => { commit(c.wheel.start); c.wheel = null; say(`Zoom ${Math.round(slot.zoom * 100)}%`); }, 400);
  }, { passive: false });
  slotsEl.addEventListener('focusin', event => { const option = event.target.closest('[data-slot]'); if (option && !gesture) select(Number(option.dataset.slot)); });
  // Keys: arrows choose a slot; Alt+arrows pan; + − zoom; R rotates (Shift: back); F flips; 0 resets; Delete empties.
  slotsEl.addEventListener('keydown', event => {
    const option = event.target.closest('[data-slot]'); if (!option) return;
    const index = Number(option.dataset.slot), count = c.view.layout.slots.length, key = event.key;
    const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
    if (arrow && template().kind === 'free' && event.shiftKey && !event.altKey) {
      event.preventDefault(); const item = template().slots[index], step = event.ctrlKey || event.metaKey ? .05 : .01;
      change(d => { const fill = d.slots[index], current = fill.layout || {}; fill.layout = { ...current,
        x: clamp((current.x ?? item.x) + arrow[0] * step, 0, 1 - item.w), y: clamp((current.y ?? item.y) + arrow[1] * step, 0, 1 - item.h) }; });
      say('Print moved'); return;
    }
    if (arrow && event.altKey) {
      event.preventDefault(); const g = geometry(index); if (!g) return;
      const s = c.view.layout.slots[index], step = Math.min(s.w, s.h) * (event.shiftKey ? .2 : .05);
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
      '[': () => { if (template().kind === 'free') slotUi.back.click(); }, ']': () => { if (template().kind === 'free') slotUi.forward.click(); },
      Delete: emptySelected, Backspace: emptySelected,
      Enter: () => { if (!slotPhoto()) slotUi.file.click(); } // an empty slot: choose a photo file for it
    };
    const action = actions[key] || (key === 'F' ? actions.f : null);
    if (action) { event.preventDefault(); select(index); action(); }
  });

  return {
    buildSlotPanel, syncSlotPanel, syncSlots, syncDividers, select,
    /** The slot gesture in progress (the stage highlights a swap target), or null. */
    get gesture() { return gesture; },
    /** Leaving collage mode: drops a slot gesture; a divider drag in progress is kept as one step. */
    stop() { gesture = null; pointers.clear(); if (drag) { drag.handle.classList.remove('is-dragging'); commit(drag.start); drag = null; } }
  };
}
