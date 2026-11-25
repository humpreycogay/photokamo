// Collage mode (CollagePlan.md Task 1): the stage, the layout panel, slot renders and the collage's own history.
// app.js owns the photos and the per-photo renders; it passes them in as `deps`:
//   photoById(id), settingsOf(photo), paperColors,
//   renderSlot(photo, { pass: 'fast'|'sharp', edge, job }) → { image } | null (null: job went stale),
//   onHistory() after the undo/redo state changes.
import { templates, templateById, slotCount } from './templates.js';
import { layoutTemplate } from './layout.js';
import { drawCollage } from './render.js';
import { ASPECTS, SPACING, createDoc, fitSlots, cloneDoc } from './model.js';

const MAX_SLOT_EDGE = 1600; // preview renders: long edge cap per photo
const HISTORY_LIMIT = 50;
const $ = (root, selector) => root.querySelector(selector);
const percent = value => `${Math.round(value * 1000) / 10}%`;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

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
  let active = false, doc = null, docPhotos = '', undoStack = [], redoStack = [], frame = 0, slider = null;
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
    paper.innerHTML = deps.paperColors.map(color => `<button type="button" role="radio" class="paper-swatch" data-paper="${color.hex}" aria-checked="false" aria-label="${color.name}" title="${color.name}" style="--swatch:${color.hex}"></button>`).join('');
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
    radioGroup(paper, '[data-paper]', button => change(d => { d.paper.color = button.dataset.paper; }));
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
    syncRadios(paper, 'data-paper', doc.paper.color);
    syncSliders();
    drawThumbs();
    const filled = doc.slots.slice(0, slotCount(t)).filter(slot => deps.photoById(slot.photoId)).length;
    document.getElementById('collageCount').textContent = `${filled} of ${plural(slotCount(t), 'photo')}`;
    canvas.setAttribute('aria-label', `Collage preview: ${t.name} layout, ${filled} of ${plural(slotCount(t), 'slot')} filled, ${aspect ? aspect[0] : `${doc.aspect.w}:${doc.aspect.h}`} sheet`);
  }
  /** Layout thumbnails at the current sheet aspect, in the panel's token colours. */
  function drawThumbs() {
    const style = getComputedStyle(document.documentElement), sheetColor = style.getPropertyValue('--line-strong').trim(), slotColor = style.getPropertyValue('--text-muted').trim();
    const dpr = Math.min(2, devicePixelRatio || 1), box = 52, a = doc.aspect.w / doc.aspect.h;
    const w = Math.round((a >= 1 ? box : box * a) * dpr), h = Math.round((a >= 1 ? box / a : box) * dpr);
    for (const option of list.querySelectorAll('[data-template]')) {
      const thumb = option.querySelector('canvas'), layout = layoutTemplate(templateById(option.dataset.template), w, h, { gutter: .06, margin: .06 });
      thumb.width = w; thumb.height = h; thumb.style.width = `${w / dpr}px`; thumb.style.height = `${h / dpr}px`;
      const ctx = thumb.getContext('2d');
      ctx.fillStyle = sheetColor; ctx.fillRect(0, 0, w, h);
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
    drawCollage(canvas.getContext('2d'), doc, layout, index => cache.get(doc.slots[index]?.photoId)?.image || null, { emptyFill: 'rgba(128,128,128,.28)' });
  }
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
    /** Opens collage mode with `photoIds` (in order). The same photos resume the last collage and its history. */
    open(photoIds) {
      const key = [...photoIds].sort((a, b) => a - b).join();
      if (!doc || docPhotos !== key) {
        const t = templateFor(photoIds.length);
        doc = fitSlots(createDoc(photoIds, t, deps.paperColors[0].hex), slotCount(t)); docPhotos = key;
        undoStack = []; redoStack = [];
      }
      active = true; failed.clear(); generation++;
      historyChanged(); refresh();
      list.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
    },
    /** Leaves collage mode: drops pending renders and frees the slot images (the document and history stay). */
    close() {
      if (!active) return;
      active = false; generation++; if (running) running.stale = true;
      cancelAnimationFrame(frame); frame = 0; slider = null;
      for (const entry of cache.values()) freeImage(entry.image);
      cache.clear(); progress = { done: 0, total: 0 }; message = ''; syncStatus();
      historyChanged();
    },
    undo() { step(undoStack, redoStack, 'Undone'); },
    redo() { step(redoStack, undoStack, 'Redone'); },
    /** A photo's edit changed outside collage mode: its slot re-renders on the next pump. */
    refresh() { if (active) refresh(); },
    /** For checks: the current document (a copy). */
    snapshot() { return doc && cloneDoc(doc); }
  };
}
