const coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
// Full-quality renders: spectral looks render at full size in tiles (worker.js), up to tiledMaxPixels, which the app
// sets to this device's canvas limit (setPixelLimit); creative looks render in one pass, so they keep fullMaxPixels.
export const engineInfo = { name: 'Kamo', previewEdge: 900, previewLabel: 'Preview', previewDetail: 'full spectral model · 900 px', fullMaxPixels: coarsePointer ? 2e6 : 4e6, tiledMaxPixels: coarsePointer ? 16.7e6 : 24e6 };
/** The largest full render (pixels) for an engine job (creative looks: one pass; spectral: tiled). */
const maxPixelsFor = job => (job?.creative ? engineInfo.fullMaxPixels : engineInfo.tiledMaxPixels);
/** The app's canvas limit for this device: full spectral renders stay within it. */
export function setPixelLimit(pixels) { if (pixels > 0) engineInfo.tiledMaxPixels = pixels; }
export function fullRenderSize(width, height, job = null) {
  const scale = Math.min(1, Math.sqrt(maxPixelsFor(job) / (width * height)));
  return { width: Math.max(2, Math.round(width * scale)), height: Math.max(2, Math.round(height * scale)), capped: scale < 1 };
}

// Two Workers: previews (and warm-up) in one that stays up with its parsed data and LUTs; full-quality renders in
// their own, started per render and stopped when it has nothing left to do (its full-size buffers are large on phones).
// Cancelling a full render stops only that Worker, so previews stay warm and no other user's preview dies.
// A Worker can die without an error event (out of memory on phones, DevTools terminate): if one says nothing for this
// long while its jobs wait, they fail and the next render starts a new Worker. Renders report progress; downloads often.
const WATCHDOG_MS = 60000;
const slots = { preview: null, full: null }; // { kind, worker, image, heardAt }
let nextId = 1, watchdog = 0;
const imageIds = new WeakMap(), jobs = new Map(), downloadListeners = new Set(); // jobs: jobId → { slot, resolve, reject, … }
export function onDownload(listener) { downloadListeners.add(listener); return () => downloadListeners.delete(listener); }
function abortError() { return new DOMException('Render cancelled', 'AbortError'); }
const jobsOf = slot => [...jobs].filter(([, job]) => job.slot === slot);
function stopSlot(slot, error) {
  if (!slot) return;
  for (const [id, job] of jobsOf(slot)) { jobs.delete(id); job.reject(error); }
  slot.worker.terminate(); if (slots[slot.kind] === slot) slots[slot.kind] = null;
}
function stopAll(error) { stopSlot(slots.preview, error); stopSlot(slots.full, error); clearInterval(watchdog); watchdog = 0; }
/** The silence check runs while any job waits. */
function watch() {
  watchdog ||= setInterval(() => {
    if (!jobs.size) { clearInterval(watchdog); watchdog = 0; return; }
    for (const slot of Object.values(slots)) if (slot && jobsOf(slot).length && Date.now() - slot.heardAt > WATCHDOG_MS) stopSlot(slot, new Error('Kamo stopped responding. Try again.'));
  }, 5000);
}
export const dispose = () => stopAll(abortError());
function slotFor(kind) {
  if (slots[kind]) return slots[kind];
  const slot = slots[kind] = { kind, worker: new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }), image: null, heardAt: Date.now() };
  slot.worker.addEventListener('message', event => {
    slot.heardAt = Date.now();
    const { type, jobId } = event.data;
    if (type === 'download') { for (const listener of downloadListeners) listener(event.data); return; }
    const job = jobs.get(jobId); if (!job) { event.data.bitmap?.close?.(); return; } // a cancelled job finished: drop its result
    if (type === 'progress') job.onProgress?.(event.data.value);
    else if (type === 'status') job.onStatus?.(event.data.text);
    else if (type === 'done' || type === 'error') {
      jobs.delete(jobId);
      if (type === 'done') { job.onProgress?.(1); job.resolve(event.data.bitmap); } else job.reject(new Error(event.data.message));
      if (kind === 'full' && !jobsOf(slot).length) stopSlot(slot); // free the full-size buffers now
    }
  });
  slot.worker.addEventListener('error', event => stopSlot(slot, new Error(event.message || 'Kamo failed to start')));
  slot.worker.addEventListener('messageerror', () => stopSlot(slot, new Error('Kamo sent a result that could not be read')));
  return slot;
}
function send(slot, message, job) {
  if (!jobsOf(slot).length) slot.heardAt = Date.now(); // the silence clock starts with the first waiting job
  jobs.set(message.jobId, { slot, ...job }); slot.worker.postMessage(message); watch();
}
export function warm(job) {
  const jobId = nextId++;
  return new Promise((resolve, reject) => send(slotFor('preview'), { type: 'warm', jobId, job }, { resolve, reject }));
}
export function render(bitmap, job, { quality = 'preview', signal, onProgress, onStatus } = {}) {
  if (signal?.aborted) return Promise.reject(abortError());
  const slot = slotFor(quality === 'full' ? 'full' : 'preview');
  if (!imageIds.has(bitmap)) imageIds.set(bitmap, nextId++);
  const imageId = imageIds.get(bitmap);
  if (slot.image !== bitmap) { slot.worker.postMessage({ type: 'image', imageId, bitmap }); slot.image = bitmap; }
  const jobId = nextId++;
  return new Promise((resolve, reject) => {
    send(slot, { type: 'render', jobId, imageId, job, quality, maxEdge: engineInfo.previewEdge, maxPixels: maxPixelsFor(job), tile: coarsePointer ? 512 : 1024 }, { resolve, reject, onProgress, onStatus });
    signal?.addEventListener('abort', () => {
      const pending = jobs.get(jobId); if (!pending) return;
      // Alone in its Worker: stop that Worker (no other render waits on it). Shared: drop just this result.
      if (jobsOf(slot).length === 1) stopSlot(slot, abortError()); else { jobs.delete(jobId); pending.reject(abortError()); }
    }, { once: true });
  });
}
