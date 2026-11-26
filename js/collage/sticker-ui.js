// Stickers on the collage sheet (part of collage mode, js/collage/mode.js): the panel, the picker dialog, and rotated
// handles that drag, resize, rotate, pinch and take keys. `c` is the collage context (mode.js).
import { stickers, STICKER_GROUPS, stickerById, stickerBox, stickerCanvas, stickerMatches, onStickerArt, ensureStickerArt } from './stickers.js';
import { cloneDoc } from './model.js';
import { clamp, plural, radioGroup, syncRadios } from './ui.js';

export function createStickerUi(c) {
  const { byId, change, commit, refresh, say, scheduleDraw, cancelGesture } = c;
  const stickerHandlesEl = byId('collageStickerHandles');
  const finishLiveText = (...args) => c.ui.text.finishLiveText(...args);

  // ---------- Stickers (js/collage/stickers.js): on the sheet above the photos; drag, resize, rotate, pinch ----------
  const STICKER_MIN = .04, STICKER_MAX = .9;
  const stickerUi = { selected: null, start: null, editor: byId('collageStickerEditor'),
    name: byId('collageStickerName'), size: byId('collageStickerSize'), rotate: byId('collageStickerRotate'), flip: byId('collageStickerFlip') };
  const stickerPointers = new Map();
  let stickerGesture = null;
  const placed = () => c.doc?.stickers || [];
  const selectedSticker = () => placed().find(item => item.id === stickerUi.selected) || null;
  const stickerName = item => stickerById(item.kind)?.name || 'Sticker';
  const stickerHandle = id => stickerHandlesEl.querySelector(`[data-sticker="${id}"]`);
  const newStickerId = () => `st${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const normAngle = angle => ((angle % 360) + 540) % 360 - 180;
  function updateSticker(mutator) { const id = stickerUi.selected; if (!id) return; change(d => { const item = (d.stickers ||= []).find(s => s.id === id); if (item) mutator(item, d); }); }
  function liveSticker(mutator) { const item = selectedSticker(); if (!item) return; stickerUi.start ||= cloneDoc(c.doc); mutator(item); syncStickerPanel(); scheduleDraw(); }
  function finishLiveSticker() { if (stickerUi.start) commit(stickerUi.start); stickerUi.start = null; }
  function addSticker(kind) {
    const n = placed().length, sticker = stickerById(kind);
    const item = { id: newStickerId(), kind, x: clamp(.5 + ((n % 5) - 2) * .07, .1, .9), y: clamp(.42 + ((Math.floor(n / 5) % 3) - 1) * .1 + (n % 2) * .05, .1, .9),
      size: sticker.group === 'words' ? .32 : sticker.group === 'scrapbook' && sticker.h < 40 ? .36 : .2, rotate: Math.round((Math.random() - .5) * 16), flip: false };
    finishLiveSticker(); change(d => (d.stickers ||= []).push(item)); stickerUi.selected = item.id; syncStickerPanel(); say(`${sticker.name} sticker added`);
  }
  function duplicateSticker() {
    const item = selectedSticker(); if (!item) return;
    const copy = { ...item, id: newStickerId(), x: clamp(item.x + .04, 0, 1), y: clamp(item.y + .04, 0, 1) };
    change(d => d.stickers.push(copy)); stickerUi.selected = copy.id; syncStickerPanel(); say('Sticker duplicated');
  }
  function removeSticker() {
    const index = placed().findIndex(item => item.id === stickerUi.selected); if (index < 0) return;
    const name = stickerName(placed()[index]); change(d => d.stickers.splice(index, 1));
    stickerUi.selected = placed()[Math.min(index, placed().length - 1)]?.id || null; syncStickerPanel(); say(`${name} sticker removed`);
  }
  /** Moves the selected sticker `delta` places in the stack (later stickers draw on top). */
  function restack(delta) {
    updateSticker((item, d) => { const i = d.stickers.indexOf(item), j = clamp(i + delta, 0, d.stickers.length - 1); d.stickers.splice(i, 1); d.stickers.splice(j, 0, item); });
    say(delta > 0 ? 'Sticker brought forward' : 'Sticker sent back');
  }
  function buildStickerPanel() {
    byId('collageAddSticker').addEventListener('click', openStickerPicker);
    const dpr = Math.min(2, devicePixelRatio || 1), sample = ['heart', 'emoji-1f60d', 'star', 'emoji-1f436']; // a few stickers on the button show what it adds
    ensureStickerArt(sample.map(kind => ({ kind }))).then(() => byId('collageStickerPreview').replaceChildren(...sample.map(id => {
      const { canvas: art } = stickerCanvas(stickerById(id), 30 * dpr), thumb = document.createElement('canvas');
      thumb.width = art.width; thumb.height = art.height; thumb.getContext('2d').drawImage(art, 0, 0); thumb.style.width = `${art.width / dpr}px`;
      return thumb;
    })));
    const slide = (input, apply) => { input.addEventListener('input', () => liveSticker(item => apply(item, Number(input.value)))); input.addEventListener('change', finishLiveSticker); };
    slide(stickerUi.size, (item, value) => { item.size = value / 100; });
    slide(stickerUi.rotate, (item, value) => { item.rotate = value; });
    stickerUi.flip.addEventListener('click', () => updateSticker(item => { item.flip = !item.flip; }));
    byId('collageStickerForward').addEventListener('click', () => restack(1));
    byId('collageStickerBack').addEventListener('click', () => restack(-1));
    byId('collageStickerDuplicate').addEventListener('click', duplicateSticker);
    byId('collageStickerDelete').addEventListener('click', removeSticker);
  }

  // The sticker picker: a dialog with search, group chips and every sticker in sections (built once, then filtered).
  const RECENT_KEY = 'photokamo:collage-recent-stickers', RECENT_MAX = 16;
  const picker = { dialog: byId('stickerDialog'), search: byId('stickerSearch'), filters: byId('stickerFilters'), results: byId('stickerResults'), count: byId('stickerResultCount'), filter: 'all', built: false };
  const recentStickers = () => { try { const ids = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(ids) ? ids.filter(id => stickerById(id)).slice(0, RECENT_MAX) : []; } catch { return []; } };
  const rememberSticker = id => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentStickers().filter(other => other !== id)].slice(0, RECENT_MAX))); } catch { /* this visit only */ } };
  /** An emoji's Twemoji SVG as a lazy <img>; the system glyph shows instead if the file can't load. */
  function twemojiThumb(sticker, size) {
    const image = document.createElement('img'); Object.assign(image, { src: sticker.file, alt: '', width: size, height: size, loading: 'lazy', decoding: 'async', draggable: false });
    image.className = 'sticker-twemoji'; image.setAttribute('aria-hidden', 'true');
    image.addEventListener('error', () => { const glyph = document.createElement('span'); glyph.className = 'sticker-emoji'; glyph.setAttribute('aria-hidden', 'true'); glyph.textContent = sticker.emoji; image.replaceWith(glyph); }, { once: true });
    return image;
  }
  onStickerArt(() => { if (c.active) scheduleDraw(); }); // an emoji's SVG arrived: draw it instead of the font glyph
  const pickerOptions = () => [...picker.results.querySelectorAll('.sticker-option:not([hidden])')].filter(option => !option.closest('[hidden]'));
  function stickerOption(sticker) {
    const option = document.createElement('button'); option.type = 'button'; option.className = 'sticker-option'; option.tabIndex = -1;
    option.dataset.stickerKind = sticker.id; option.setAttribute('aria-label', sticker.name); option.title = sticker.name;
    if (sticker.emoji) { option.append(twemojiThumb(sticker, 40)); return option; }
    const dpr = Math.min(2, devicePixelRatio || 1), { canvas: art } = stickerCanvas(sticker, sticker.w * 46 / Math.max(sticker.w, sticker.h) * dpr), thumb = document.createElement('canvas');
    thumb.width = art.width; thumb.height = art.height; thumb.getContext('2d').drawImage(art, 0, 0);
    thumb.style.width = `${art.width / dpr}px`; thumb.setAttribute('aria-hidden', 'true'); option.append(thumb);
    return option;
  }
  function stickerSection(group, name, list) {
    const section = document.createElement('section'), heading = document.createElement('h3'), grid = document.createElement('div');
    section.className = 'sticker-section'; section.dataset.group = group; heading.id = `stickerSection-${group}`; heading.textContent = name;
    section.setAttribute('aria-labelledby', heading.id); grid.className = 'sticker-grid'; grid.append(...list.map(stickerOption)); section.append(heading, grid);
    return section;
  }
  function buildPicker() {
    picker.built = true;
    picker.filters.innerHTML = [['all', 'All'], ['recent', 'Recent'], ...STICKER_GROUPS].map(([id, name]) => `<button type="button" role="radio" data-filter="${id}" aria-checked="false">${name}</button>`).join('');
    picker.results.append(stickerSection('recent', 'Recent', []), ...STICKER_GROUPS.map(([id, name]) => stickerSection(id, name, stickers.filter(sticker => sticker.group === id))));
    radioGroup(picker.filters, '[data-filter]:not([hidden])', button => setPickerFilter(button.dataset.filter));
    picker.search.addEventListener('input', () => { if (picker.filter !== 'all' && picker.search.value.trim()) setPickerFilter('all', false); else filterPicker(); });
    picker.search.addEventListener('keydown', event => {
      const first = pickerOptions()[0];
      if (event.key === 'ArrowDown' && first) { event.preventDefault(); focusOption(first); }
      else if (event.key === 'Enter' && first) { event.preventDefault(); pickSticker(first.dataset.stickerKind); }
    });
    picker.results.addEventListener('click', event => { const option = event.target.closest('[data-sticker-kind]'); if (option) pickSticker(option.dataset.stickerKind); });
    picker.results.addEventListener('keydown', event => {
      const option = event.target.closest('.sticker-option'); if (!option) return;
      const options = pickerOptions(), i = options.indexOf(option), r = option.getBoundingClientRect();
      // Up/Down: the nearest option in the next row in that direction (across sections), closest in column.
      const along = dir => { let best = null, score = Infinity; for (const other of options) { const q = other.getBoundingClientRect(), dy = (q.top - r.top) * dir; if (dy < 4) continue; const value = dy * 1000 + Math.abs(q.left - r.left); if (value < score) { score = value; best = other; } } return best; };
      const next = { ArrowRight: options[i + 1], ArrowLeft: options[i - 1], ArrowDown: along(1), ArrowUp: along(-1), Home: options[0], End: options.at(-1) }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      if (next) focusOption(next); else if (event.key === 'ArrowUp') picker.search.focus();
    });
    byId('stickerDialogClose').addEventListener('click', () => picker.dialog.close());
    picker.dialog.addEventListener('click', event => { if (event.target === picker.dialog) picker.dialog.close(); });
  }
  function focusOption(option) {
    for (const other of picker.results.querySelectorAll('.sticker-option[tabindex="0"]')) other.tabIndex = -1;
    option.tabIndex = 0; option.focus(); option.scrollIntoView({ block: 'nearest' });
  }
  function setPickerFilter(filter, scroll = true) {
    picker.filter = filter; syncRadios(picker.filters, 'data-filter', filter); filterPicker();
    if (scroll) picker.results.scrollTop = 0;
  }
  function filterPicker() {
    const query = picker.search.value.trim(), filter = picker.filter;
    let shown = 0;
    for (const section of picker.results.querySelectorAll('.sticker-section')) {
      const group = section.dataset.group, open = group === 'recent' ? (filter === 'recent' || (filter === 'all' && !query)) : (filter === 'all' || filter === group);
      let count = 0;
      for (const option of section.querySelectorAll('.sticker-option')) {
        const show = open && stickerMatches(stickerById(option.dataset.stickerKind), query); option.hidden = !show; if (show) count++;
      }
      section.hidden = !count; if (group !== 'recent' || filter === 'recent') shown += count;
    }
    let empty = picker.results.querySelector('.sticker-empty');
    if (!shown && !empty) { empty = document.createElement('p'); empty.className = 'sticker-empty'; picker.results.append(empty); }
    if (empty) { empty.hidden = Boolean(shown); empty.textContent = query ? `No stickers match “${query}”. Try “heart”, “cat” or “party”.` : 'Stickers you add will show up here.'; }
    picker.count.textContent = query ? `${plural(shown, 'sticker')} for “${query}”` : plural(shown, 'sticker');
    const options = pickerOptions();
    for (const option of picker.results.querySelectorAll('.sticker-option[tabindex="0"]')) option.tabIndex = -1;
    if (options[0]) options[0].tabIndex = 0;
  }
  function openStickerPicker() {
    if (!picker.built) buildPicker();
    const recent = picker.results.querySelector('[data-group="recent"] .sticker-grid'), ids = recentStickers();
    recent.replaceChildren(...ids.map(id => stickerOption(stickerById(id))));
    picker.filters.querySelector('[data-filter="recent"]').hidden = !ids.length;
    picker.search.value = ''; setPickerFilter('all');
    picker.dialog.showModal();
    if (matchMedia('(pointer: fine)').matches) picker.search.focus(); // no on-screen keyboard popping up on touch
  }
  function pickSticker(kind) { rememberSticker(kind); picker.dialog.close(); addSticker(kind); }

  function syncStickerPanel() {
    if (stickerUi.selected && !selectedSticker()) stickerUi.selected = null;
    const item = selectedSticker(); stickerUi.editor.hidden = !item;
    if (!item) return;
    stickerUi.name.textContent = `Selected: ${stickerName(item)}`;
    stickerUi.size.value = Math.round(item.size * 100); byId('collageStickerSizeOutput').value = `${Math.round(item.size * 100)}%`;
    stickerUi.rotate.value = Math.round(item.rotate); byId('collageStickerRotateOutput').value = `${Math.round(item.rotate)}°`;
    stickerUi.flip.setAttribute('aria-pressed', Boolean(item.flip));
  }
  /** One transparent, rotated button per sticker over the canvas (at least 44 px), with resize and rotate knobs. */
  function syncStickerHandles() {
    const items = placed().map(item => [item, stickerBox(item, c.view.layout)]).filter(([, box]) => box);
    while (stickerHandlesEl.children.length > items.length) stickerHandlesEl.lastElementChild.remove();
    while (stickerHandlesEl.children.length < items.length) {
      const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'collage-sticker-handle';
      handle.innerHTML = '<span class="sticker-knob sticker-knob-rotate" data-knob="rotate" aria-hidden="true"></span><span class="sticker-knob sticker-knob-resize" data-knob="resize" aria-hidden="true"></span>';
      stickerHandlesEl.append(handle);
    }
    items.forEach(([item, box], i) => {
      const handle = stickerHandlesEl.children[i], k = c.view.k, w = Math.max(44, box.w / k), h = Math.max(44, box.h / k);
      handle.dataset.sticker = item.id; handle.setAttribute('aria-pressed', item.id === stickerUi.selected);
      handle.setAttribute('aria-label', `${stickerName(item)} sticker, ${Math.round(item.size * 100)}% wide, rotated ${Math.round(item.rotate)}°`);
      Object.assign(handle.style, { left: `${box.cx / k - w / 2}px`, top: `${box.cy / k - h / 2}px`, width: `${w}px`, height: `${h}px`, transform: `rotate(${box.rotate}deg)` });
    });
  }
  function beginStickerGesture(item, handle, mode, start) {
    const rect = handle.getBoundingClientRect(), centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const [a, b = a] = [...stickerPointers.values()], pinch = mode === 'pinch';
    stickerGesture = { itemId: item.id, mode, start, centre, moved: stickerGesture?.moved || false, from: { x: item.x, y: item.y, size: item.size, rotate: item.rotate }, p0: { ...a },
      mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      dist0: pinch ? Math.hypot(b.x - a.x, b.y - a.y) : Math.hypot(a.x - centre.x, a.y - centre.y),
      angle0: pinch ? Math.atan2(b.y - a.y, b.x - a.x) : Math.atan2(a.y - centre.y, a.x - centre.x) };
  }
  stickerHandlesEl.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-sticker]'); if (!handle || event.button > 0) return;
    const item = placed().find(s => s.id === handle.dataset.sticker); if (!item) return;
    event.preventDefault(); finishLiveSticker(); finishLiveText(); handle.focus({ preventScroll: true });
    try { handle.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    stickerPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (stickerGesture?.itemId === item.id && stickerPointers.size === 2) { beginStickerGesture(item, handle, 'pinch', stickerGesture.start); return; } // second finger
    if (stickerPointers.size > 1) { stickerPointers.delete(event.pointerId); return; }
    if (stickerUi.selected !== item.id) { stickerUi.selected = item.id; syncStickerPanel(); }
    beginStickerGesture(item, handle, event.target.closest('[data-knob]')?.dataset.knob || 'move', cloneDoc(c.doc));
    syncStickerHandles();
  });
  stickerHandlesEl.addEventListener('pointermove', event => {
    if (!stickerGesture || !stickerPointers.has(event.pointerId)) return;
    stickerPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = stickerGesture, item = placed().find(s => s.id === g.itemId), layout = c.view.layout; if (!item || !layout) return;
    const [a, b = a] = [...stickerPointers.values()], k = c.view.k, pinch = g.mode === 'pinch';
    const moveBy = (dx, dy) => { item.x = clamp(g.from.x + dx * k / layout.width, 0, 1); item.y = clamp(g.from.y + dy * k / layout.height, 0, 1); };
    if (g.mode === 'move') moveBy(a.x - g.p0.x, a.y - g.p0.y);
    else {
      const dist = pinch ? Math.hypot(b.x - a.x, b.y - a.y) : Math.hypot(a.x - g.centre.x, a.y - g.centre.y);
      const angle = pinch ? Math.atan2(b.y - a.y, b.x - a.x) : Math.atan2(a.y - g.centre.y, a.x - g.centre.x);
      if (pinch || g.mode === 'resize') item.size = clamp(g.from.size * dist / Math.max(1, g.dist0), STICKER_MIN, STICKER_MAX);
      if (pinch || g.mode === 'rotate') {
        const turned = normAngle(g.from.rotate + (angle - g.angle0) * 180 / Math.PI);
        item.rotate = event.shiftKey ? normAngle(Math.round(turned / 15) * 15) : Math.round(turned);
      }
      if (pinch) moveBy((a.x + b.x) / 2 - g.mid0.x, (a.y + b.y) / 2 - g.mid0.y);
    }
    g.moved = true; syncStickerPanel(); scheduleDraw();
  });
  const endStickerGesture = event => {
    if (!stickerPointers.delete(event.pointerId) || !stickerGesture) return;
    if (event.type === 'pointercancel') { const { start } = stickerGesture; stickerGesture = null; stickerPointers.clear(); cancelGesture(start); return; }
    const item = placed().find(s => s.id === stickerGesture.itemId);
    if (stickerPointers.size && item) { beginStickerGesture(item, stickerHandle(item.id), 'move', stickerGesture.start); return; } // one finger left: keep dragging
    const { start, moved, mode } = stickerGesture; stickerGesture = null; stickerPointers.clear();
    commit(start); refresh();
    if (moved) say({ move: 'Sticker moved', resize: 'Sticker resized', rotate: 'Sticker rotated' }[mode] || 'Sticker adjusted');
  };
  stickerHandlesEl.addEventListener('pointerup', endStickerGesture); stickerHandlesEl.addEventListener('pointercancel', endStickerGesture);
  stickerHandlesEl.addEventListener('click', event => {
    const handle = event.target.closest('[data-sticker]'); if (!handle || stickerUi.selected === handle.dataset.sticker) return;
    stickerUi.selected = handle.dataset.sticker; syncStickerPanel(); syncStickerHandles();
  });
  stickerHandlesEl.addEventListener('keydown', event => {
    const handle = event.target.closest('[data-sticker]'); if (!handle || event.altKey || event.ctrlKey || event.metaKey) return;
    const id = handle.dataset.sticker, step = event.shiftKey ? .05 : .01;
    const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    let act = null;
    if (arrow) act = item => { item.x = clamp(item.x + arrow[0] * step, 0, 1); item.y = clamp(item.y + arrow[1] * step, 0, 1); };
    else if (event.key === '+' || event.key === '=') act = item => { item.size = clamp(item.size * 1.1, STICKER_MIN, STICKER_MAX); };
    else if (event.key === '-' || event.key === '_') act = item => { item.size = clamp(item.size / 1.1, STICKER_MIN, STICKER_MAX); };
    else if (event.key === '[' || event.key === ']' || event.key === '{' || event.key === '}') act = item => { item.rotate = normAngle(item.rotate + ('[{'.includes(event.key) ? -1 : 1) * (event.shiftKey ? 15 : 5)); };
    else if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    event.preventDefault(); event.stopPropagation();
    stickerUi.selected = id;
    if (!act) { removeSticker(); (stickerUi.selected ? stickerHandle(stickerUi.selected) : byId('collageAddSticker'))?.focus({ preventScroll: true }); return; }
    updateSticker(act); stickerHandle(id)?.focus({ preventScroll: true });
  });

  return {
    buildStickerPanel, syncStickerPanel, syncStickerHandles, finishLiveSticker, newStickerId,
    /** Esc: clears the selected sticker; false when none was selected. */
    clearSelection() { if (!stickerUi.selected) return false; stickerUi.selected = null; syncStickerPanel(); syncStickerHandles(); say('No sticker selected'); return true; },
    /** Leaving collage mode: a gesture in progress is kept as one step. */
    stop() { if (stickerGesture) { commit(stickerGesture.start); stickerGesture = null; } stickerPointers.clear(); finishLiveSticker(); }
  };
}
