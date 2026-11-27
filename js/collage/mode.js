// Collage mode (CollagePlan.md Tasks 1–2): the stage, the collage's own history and the public API. The work is split
// into parts that share one context object `c` (below): panel.js (layouts, paper, spacing, borders, tabs),
// slots-ui.js (slot tools, slot boxes on the stage, dividers), text-ui.js, sticker-ui.js, slot-cache.js (slot renders)
// and ui.js (shared helpers). app.js owns the photos and the per-photo renders; it passes them in as `deps`:
//   photos(), photoById(id), settingsOf(photo), paperColors,
//   renderSlot(photo, { pass: 'fast'|'sharp', edge, job }) → { image } | null (null: job went stale),
//   addFiles(files) → the photos added to the strip, editPhoto(id) to leave for the editor,
//   onHistory() after the undo/redo state changes.
import { templates, templateById, slotCount } from './templates.js';
import { layoutTemplate } from './layout.js';
import { drawCollage } from './render.js';
import { createDoc, cloneDoc } from './model.js';
import { PICKER, visiblePath } from './ui.js';
import { createPanel } from './panel.js';
import { createSlotsUi } from './slots-ui.js';
import { createTextUi } from './text-ui.js';
import { createStickerUi } from './sticker-ui.js';
import { createSlotCache } from './slot-cache.js';
export { moveCollageText } from './text-ui.js';

const HISTORY_LIMIT = 50;
/** Most photos a picker template holds: a collage opens with at most this many. */
export const COLLAGE_MAX = Math.max(...templates.filter(t => PICKER.includes(t.category)).map(slotCount));

/** The listed plain grid (not a look) that fits `count` photos best, else the largest one. */
export function templateFor(count) {
  const sorted = templates.filter(t => t.kind === 'grid' && t.category === 'layout').sort((a, b) => slotCount(a) - slotCount(b));
  return sorted.find(t => slotCount(t) === count) || sorted.find(t => slotCount(t) >= count) || sorted[sorted.length - 1];
}

export function createCollageMode(deps) {
  const stage = document.getElementById('collageStage'), canvas = document.getElementById('collageCanvas');
  const panel = document.getElementById('collagePanel'), status = document.getElementById('collageStatus');
  const slotsEl = document.getElementById('collageSlots'), byId = id => document.getElementById(id);
  let active = false, doc = null, docPhotos = '', undoStack = [], redoStack = [], frame = 0, slider = null;
  // The slot being edited (index into the layout) or null; the last drawn layout and device px per CSS px.
  let selected = null, view = { layout: null, k: 1 }, wheel = null;

  // ---------- History: one step per gesture ----------
  const historyChanged = () => deps.onHistory?.();
  function commit(previous) {
    if (JSON.stringify(previous) === JSON.stringify(doc)) return;
    undoStack.push(previous); if (undoStack.length > HISTORY_LIMIT) undoStack.shift(); redoStack = [];
    historyChanged(); deps.onDocument?.(cloneDoc(doc));
  }
  /** Commits a live edit still in progress (slider, wheel zoom, typing, sticker slider) as its own step, so a new
   *  change or an undo never folds it into another step; the next live edit starts from the current document. */
  function flushPending() {
    if (slider) { commit(slider); slider = null; }
    if (wheel) { clearTimeout(wheel.timer); commit(wheel.start); wheel = null; }
    ui.text.finishLiveText(); ui.sticker.finishLiveSticker();
  }
  function change(mutator) { flushPending(); const previous = cloneDoc(doc); mutator(doc); commit(previous); refresh(); }
  function step(from, to, word) {
    flushPending();
    if (!from.length) return;
    to.push(cloneDoc(doc)); doc = from.pop();
    refresh(); historyChanged(); deps.onDocument?.(cloneDoc(doc)); say(word);
    ui.text.afterStep();
  }

  const template = () => templateById(doc.templateId) || templates[0];

  // ---------- The context the parts share: state (live, through accessors), elements and the core functions ----------
  const c = {
    deps, stage, canvas, panelEl: panel, slotsEl, byId,
    change, commit, refresh, say, scheduleDraw, draw, template, cancelGesture, syncStatus,
    get doc() { return doc; }, set doc(value) { doc = value; },
    get selected() { return selected; }, set selected(value) { selected = value; },
    get view() { return view; },
    get slider() { return slider; }, set slider(value) { slider = value; },
    get wheel() { return wheel; }, set wheel(value) { wheel = value; },
    get active() { return active; },
    get fullscreen() { return full.dialog.open; }
  };
  const ui = c.ui = {};
  ui.cache = createSlotCache(c); ui.text = createTextUi(c); ui.sticker = createStickerUi(c); ui.slots = createSlotsUi(c); ui.panel = createPanel(c);

  // ---------- Stage ----------
  /** A cancelled pointer gesture (the browser or system took the pointer): back to where it started, no undo step. */
  function cancelGesture(start) { doc = start; refresh(); say('Cancelled'); }
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
    const ctx = canvas.getContext('2d');
    drawCollage(ctx, doc, layout, ui.cache.imageOf, { captionHint: 'rgba(128,128,128,.45)' });
    view = { layout, k: width / cssW };
    ui.slots.syncDividers();
    if (layout.slots.some(slot => slot.visible)) drawShapedHighlight(ctx, layout);
    ui.slots.syncSlots();
    ui.text.syncTextHandles(ctx);
    ui.sticker.syncStickerHandles();
    drawFullscreen();
  }

  // ---------- Full screen: the collage alone (no selection, dividers or handles), at the window's size. ----------
  // Like the photo's full screen (js/preview.js): Esc or ✕ closes; where the browser allows it, truly full screen.
  const full = { dialog: byId('collageFullscreen'), canvas: byId('collageFullscreenCanvas'), button: byId('collageFullscreenButton') };
  function drawFullscreen() {
    if (!active || !full.dialog.open) return;
    const style = getComputedStyle(full.dialog), availW = full.dialog.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availH = full.dialog.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (availW <= 0 || availH <= 0) return;
    const a = doc.aspect.w / doc.aspect.h, cssW = Math.min(availW, availH * a), scale = Math.min(devicePixelRatio || 1, 4096 / Math.max(cssW, cssW / a));
    const width = Math.max(1, Math.round(cssW * scale)), height = Math.max(1, Math.round(cssW / a * scale));
    if (full.canvas.width !== width || full.canvas.height !== height) { full.canvas.width = width; full.canvas.height = height; }
    drawCollage(full.canvas.getContext('2d'), doc, layoutTemplate(template(), width, height, doc), ui.cache.imageOf);
  }
  function openFullscreen() {
    if (!active || full.dialog.open) return;
    full.dialog.showModal(); drawFullscreen(); ui.cache.pump(); // sharper slot renders for the bigger view
    full.dialog.requestFullscreen?.().catch(() => { /* window-sized is fine (iPhone, or not allowed) */ });
  }
  const closeFullscreen = () => { if (full.dialog.open) full.dialog.close(); };
  full.button.addEventListener('click', openFullscreen);
  byId('collageFullscreenClose').addEventListener('click', closeFullscreen);
  // In browser full screen, Esc leaves full screen first (no keydown reaches the page): close the dialog with it.
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) closeFullscreen(); });
  addEventListener('resize', () => { if (full.dialog.open) { drawFullscreen(); ui.cache.pump(); } });
  full.dialog.addEventListener('close', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (active) full.button.focus();
  });

  /** Shaped slots can't use the CSS box ring (their boxes are clipped to the slot's shape): the selected slot and the
   *  drop target get a 3 px accent ring inside their visible outline on the preview canvas (never exported). */
  function drawShapedHighlight(ctx, layout) {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), k = view.k, gesture = ui.slots.gesture;
    for (const index of new Set([selected, gesture?.mode === 'swap' ? gesture.target : null])) {
      const slot = index == null ? null : layout.slots[index]; if (!slot) continue;
      const path = visiblePath(slot);
      ctx.save(); ctx.clip(path, 'evenodd'); ctx.strokeStyle = accent; ctx.lineWidth = 6 * k; ctx.lineJoin = 'round'; ctx.stroke(path); ctx.restore();
    }
  }
  let message = '', messageTimer;
  function say(text) { message = text; clearTimeout(messageTimer); messageTimer = setTimeout(() => { message = ''; syncStatus(); }, 2500); syncStatus(); }
  function syncStatus() {
    const progress = ui.cache.progress;
    status.textContent = progress.total ? `Developing photos… ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : message;
    stage.classList.toggle('is-developing', progress.total > 0);
  }

  function refresh() { ui.panel.syncPanel(); ui.cache.prune(); scheduleDraw(); ui.cache.pump(); }

  ui.panel.buildPanel();
  new ResizeObserver(() => { if (active) { scheduleDraw(); ui.cache.pump(); } }).observe(stage);

  return {
    get active() { return active; },
    get busy() { return ui.cache.busy; },
    get canUndo() { return active && undoStack.length > 0; },
    get canRedo() { return active && redoStack.length > 0; },
    get hasDocument() { return Boolean(doc); },
    /** Opens collage mode with `photoIds` (in order); null resumes the last collage. The same photos also resume it,
     *  with its history. True when it started a new document. */
    open(photoIds) {
      const key = photoIds && [...photoIds].sort((a, b) => a - b).join();
      const created = !doc || Boolean(photoIds && docPhotos !== key);
      if (created) {
        const t = templateFor(photoIds.length);
        doc = createDoc(photoIds, t, deps.paperColors[0].hex); ui.panel.applyTemplate(doc, t); docPhotos = key;
        undoStack = []; redoStack = []; selected = null;
      }
      active = true; ui.cache.start();
      historyChanged(); refresh();
      if (selected == null) ui.panel.showLayoutTab();
      // After the first draw, which creates the slot boxes. A new collage lands on its layout in the picker.
      requestAnimationFrame(() => {
        const target = selected != null ? slotsEl.children[selected] : panel.querySelector('[data-template][aria-selected="true"]');
        target?.focus({ preventScroll: true }); if (selected == null) target?.scrollIntoView({ block: 'nearest' });
      });
      return created;
    },
    /** Reopens a saved document. Missing photos are already emptied by the session repository. */
    load(value) {
      doc = cloneDoc(value); docPhotos = ''; undoStack = []; redoStack = []; selected = null;
      active = true; ui.cache.start(); historyChanged(); refresh();
      ui.panel.showLayoutTab();
      requestAnimationFrame(() => { const target = panel.querySelector('[data-template][aria-selected="true"]'); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'nearest' }); });
    },
    /** Leaves collage mode: drops pending renders (the document and history stay). The slot images are freed unless
     *  `keepCache` (leaving to edit one photo: the others need no new render on return). */
    close({ keepCache = false } = {}) {
      if (!active) return;
      closeFullscreen(); active = false;
      cancelAnimationFrame(frame); frame = 0; slider = null; ui.slots.stop();
      ui.text.stop(); ui.sticker.stop();
      if (wheel) { clearTimeout(wheel.timer); commit(wheel.start); wheel = null; }
      ui.cache.stop({ keepCache }); message = ''; syncStatus();
      historyChanged();
    },
    /** Esc: clears the sticker, then the slot selection; false when there was nothing to clear (then collage mode closes). */
    escape() {
      if (ui.sticker.clearSelection()) return true;
      if (selected == null) return false;
      const option = slotsEl.children[selected]; ui.slots.select(null); option?.focus(); say('No photo selected');
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
