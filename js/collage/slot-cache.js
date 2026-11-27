// Slot renders (part of collage mode, js/collage/mode.js): a fast pass from the queue thumb, then a sharp pass for
// every photo in a visible slot, one job at a time; only photos in visible slots keep a render. `c` is the collage
// context (mode.js).
import { slotCount } from './templates.js';

export function createSlotCache(c) {
  const { deps, stage, scheduleDraw, syncStatus, template } = c;
  const MAX_SLOT_EDGE = 1600; // preview renders: long edge cap per photo
  // photoId → { key (settings JSON), image, edge, sharp }.
  const cache = new Map(), failed = new Set();
  let generation = 0, pumping = false, running = null, progress = { done: 0, total: 0 };

  const imageOf = index => cache.get(c.doc.slots[index]?.photoId)?.image || null;

  /** Long edge (device px) a slot photo may need on this stage (the window, in full screen): independent of the layout
   *  and aspect, so switching them never renders a photo again. */
  function needEdge() {
    const box = c.fullscreen ? { w: innerWidth, h: innerHeight } : { w: stage.clientWidth, h: stage.clientHeight };
    const long = Math.max(box.w, box.h) * Math.min(2, devicePixelRatio || 1);
    return Math.min(MAX_SLOT_EDGE, Math.max(400, Math.ceil(long / 200) * 200));
  }

  // ---------- Slot renders: a fast pass from the queue thumb, then a sharp pass for every photo ----------
  const freeImage = image => { if (!image) return; if (image.close) image.close(); else { image.width = 0; image.height = 0; } };
  function visiblePhotos() {
    const ids = c.doc.slots.slice(0, slotCount(template())).map(slot => slot.photoId);
    return [...new Set(ids)].map(deps.photoById).filter(Boolean);
  }
  function nextJob() {
    const photos = visiblePhotos(), edge = needEdge();
    const keyed = photos.map(photo => ({ photo, key: JSON.stringify(deps.settingsOf(photo)), entry: cache.get(photo.id) }));
    for (const { photo, key, entry } of keyed) if ((!entry || entry.key !== key) && !failed.has(`${photo.id}:${key}:fast`)) return { photo, key, pass: 'fast', edge: 0 };
    if (template().kind === 'contact') return null; // dense sheets stay instant from queue thumbs; export uses full inputs
    for (const { photo, key, entry } of keyed) {
      if (entry?.key === key && (!entry.sharp || entry.edge < edge / 1.25) && !failed.has(`${photo.id}:${key}:sharp`)) return { photo, key, pass: 'sharp', edge };
    }
    return null;
  }
  function countWork() {
    const edge = needEdge();
    return visiblePhotos().filter(photo => { const entry = cache.get(photo.id); return !entry || entry.key !== JSON.stringify(deps.settingsOf(photo)) || (template().kind !== 'contact' && (!entry.sharp || entry.edge < edge / 1.25)); }).length;
  }
  async function pump() {
    if (pumping || !c.active) return;
    pumping = true;
    const gen = generation;
    progress = { done: 0, total: countWork() };
    syncStatus();
    try {
      for (let next = nextJob(); next && c.active && gen === generation; next = nextJob()) {
        const job = running = { stale: false };
        let result = null;
        try { result = await deps.renderSlot(next.photo, { pass: next.pass, edge: next.edge, job }); }
        catch (error) { console.error(error); failed.add(`${next.photo.id}:${next.key}:${next.pass}`); }
        running = null;
        if (!c.active || gen !== generation || job.stale || !result) { freeImage(result?.image); continue; }
        const old = cache.get(next.photo.id);
        if (old?.image !== result.image) freeImage(old?.image);
        cache.set(next.photo.id, { key: next.key, image: result.image, edge: next.edge, sharp: next.pass === 'sharp' });
        if (next.pass === 'sharp') progress.done++;
        progress.total = Math.max(progress.total, progress.done + countWork());
        syncStatus(); scheduleDraw();
      }
    } finally {
      pumping = false;
      if (c.active) { progress = { done: 0, total: 0 }; syncStatus(); if (nextJob()) pump(); }
    }
  }
  /** Drops renders of photos no longer in a visible slot. */
  function prune() {
    const keep = new Set(visiblePhotos().map(photo => photo.id));
    for (const [id, entry] of cache) if (!keep.has(id)) { freeImage(entry.image); cache.delete(id); }
  }

  return {
    imageOf, pump, prune,
    get busy() { return pumping; },
    get progress() { return progress; },
    /** Entering collage mode: earlier failures may succeed now; renders started before are stale. */
    start() { failed.clear(); generation++; },
    /** Leaving: pending renders are dropped; the images too, unless `keepCache`. */
    stop({ keepCache = false } = {}) {
      generation++; if (running) running.stale = true;
      if (!keepCache) { for (const entry of cache.values()) freeImage(entry.image); cache.clear(); }
      progress = { done: 0, total: 0 };
    }
  };
}
