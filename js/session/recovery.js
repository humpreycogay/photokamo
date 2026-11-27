// Session recovery (plan_workflow.md Task 5, A§6): the open photos, their edits and undo history, and the saved
// collages survive a reload or a crash. Kept in IndexedDB (js/session/db.js) in this browser only.
// Saving: photos are marked dirty by commit(), Apply, undo/redo, opening and closing; 1 s after the last change (not
// while a pointer is held: a slider drag saves once it ends) one transaction writes them with the session record.
// A new photo is written with its source file in its own transaction. Hiding or leaving the page saves at once.
// ↓ imports
import { collageStore, syncSavedCollages } from '../collage-host.js';
import { engines } from '../engines/registry.js';
import { snapshot } from '../history.js';
import { seedSlotIds } from '../collage/model.js';
import { photoById, restorePhotos } from '../photos.js';
import { presets } from '../presets.js';
import { $, app, controlSpec, state, toast } from '../state.js';
import { clearSession, openSessionDb, readSession, readSessionRecord, removeOrphans, writeSession } from './db.js';
import { SETTINGS_VERSION, fingerprint, pruneHistory, sanitizePhotoRecord, sanitizeSession } from './validate.js';
// ↑ imports
const PREF_KEY = 'photokamo:recovery', NOTICE_KEY = 'photokamo:recovery-notice', SAVE_DELAY = 1000;
const known = { engines: new Set(engines.map(engine => engine.id)), presets: new Set(presets.map(preset => preset.id)), controls: controlSpec };
const rec = {
  enabled: readPref(), db: null, readOnly: false, problem: '', // problem: why this tab can't save ('' = it can)
  pending: null, // a stored session waiting for Continue / Start fresh
  fresh: new Map(), dirty: new Set(), removed: new Set(), persisted: new Set(), unsaved: new Set(),
  sources: new Map(), // sourceId → bytes, for the size readout
  timer: 0, running: false, again: false, restoring: false, lastSession: '', held: new Set(), heldSince: 0, warned: false, ready: null
};
function readPref() { try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch { return true; } }
function writePref(on) { try { if (on) localStorage.removeItem(PREF_KEY); else localStorage.setItem(PREF_KEY, 'off'); } catch { /* this visit only */ } }
const canWrite = () => rec.enabled && rec.db && !rec.readOnly && !rec.problem && !rec.pending && !rec.restoring;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const formatBytes = bytes => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);

// One tab saves at a time: a second tab would overwrite the first one's session.
function acquireLock() {
  if (!navigator.locks?.request) return Promise.resolve(true);
  return new Promise(resolve => {
    navigator.locks.request('photokamo-session', { ifAvailable: true }, lock => { resolve(Boolean(lock)); return lock ? new Promise(() => {}) : null; })
      .catch(() => resolve(true));
  });
}

async function connect() {
  if (!await acquireLock()) { rec.problem = 'PhotoKamo is open in another tab, so this tab doesn’t save. Close the other tab and reload to keep your work.'; return; }
  try {
    const { db, readOnly } = await openSessionDb({
      onClose: () => { rec.db = null; rec.problem = 'Saving stopped: the browser closed the storage. Reload to save again.'; syncSessionMenu(); },
      onBlocked: () => { rec.problem = 'Saving is waiting for another PhotoKamo tab to close.'; syncSessionMenu(); }
    });
    rec.db = db; rec.readOnly = readOnly; rec.problem = '';
  } catch (error) {
    console.warn('Session recovery is unavailable.', error);
    rec.problem = 'This browser can’t keep photos here (a private window, or storage is turned off). Your photos stay open until you close the page.';
  }
}

/** At startup: opens the store and offers the saved session on the start screen. Reads nothing when turned off. */
function initRecovery() {
  // A pointer held down (a slider or crop drag): wait for it to lift. Lost pointers clear on blur.
  document.addEventListener('pointerdown', event => { if (!rec.held.size) rec.heldSince = Date.now(); rec.held.add(event.pointerId); }, true);
  ['pointerup', 'pointercancel'].forEach(type => document.addEventListener(type, event => rec.held.delete(event.pointerId), true));
  addEventListener('blur', () => rec.held.clear());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  addEventListener('pagehide', saveNow);
  $('#resumeButton').addEventListener('click', () => continueSession());
  $('#freshButton').addEventListener('click', startFresh);
  $('#sessionToggle').addEventListener('click', toggleRecovery);
  $('#sessionStorageToggle').addEventListener('click', toggleRecovery); // About: phones have no photo menu
  new MutationObserver(syncSessionMenu).observe($('#aboutDialog'), { attributes: true, attributeFilter: ['open'] });
  $('#fileMenu').addEventListener('toggle', event => { if (event.newState === 'open') syncSessionMenu(); });
  if (!rec.enabled) { syncSessionMenu(); return; }
  rec.ready = (async () => {
    await connect();
    if (!rec.db) return;
    try {
      const session = sanitizeSession(await readSessionRecord(rec.db));
      if (session?.order.length && !app.photos.length) { rec.pending = session; showResume(session.order.length); }
    } catch (error) { console.warn('Could not read the saved session.', error); }
    syncSessionMenu();
  })();
}

function showResume(count) {
  $('#startResume').hidden = count === 0;
  $('#startResumeText').textContent = `You have ${plural(count, 'photo')} from last time, with ${count === 1 ? 'its' : 'their'} edits.`;
  $('#resumeButton').textContent = `Continue where you left off (${plural(count, 'photo')})`;
}

/** Restores the saved session: every record is checked before the editor sees it; bad ones are skipped and counted. */
async function continueSession() {
  const session = rec.pending; if (!session || !rec.db) return;
  rec.pending = null; $('#startResume').hidden = true;
  let stored;
  try { stored = await readSession(rec.db); } catch (error) { console.error(error); toast('The saved photos could not be read.'); return; }
  const fresh = sanitizeSession(stored.session) || session;
  const list = []; let skipped = 0;
  for (const id of fresh.order) {
    const record = sanitizePhotoRecord(stored.photos.find(item => item.photoId === id), known, fresh.rev);
    const source = record && stored.sources.get(record.sourceId);
    if (!record || !(source?.blob instanceof Blob)) { skipped++; continue; }
    const file = new File([source.blob], record.name, { type: source.type || source.blob.type, lastModified: source.lastModified || 0 });
    list.push({ id, file, sourceId: record.sourceId, name: record.name, settings: record.settings, undo: record.undo, redo: record.redo });
    rec.sources.set(record.sourceId, source.blob.size);
  }
  rec.restoring = true; // no save until every restored photo is known (a partial order would drop the rest)
  let restored = [];
  try { restored = await restorePhotos(list, fresh); } finally { rec.restoring = false; }
  skipped += list.length - restored.length;
  for (const photo of restored) rec.persisted.add(photo.id);
  for (const [id] of rec.sources) if (!restored.some(photo => photo.sourceId === id)) rec.sources.delete(id);
  // Collages after the photos: slots whose photo didn't come back are empty.
  const collages = collageStore.restore(fresh.collages); seedSlotIds(collages.map(entry => entry.doc)); syncSavedCollages();
  toast(skipped ? `Restored ${plural(restored.length, 'photo')}. ${skipped} could not be restored.` : `Restored ${plural(restored.length, 'photo')} with their edits.`);
  if (!rec.readOnly && !rec.problem) {
    try { await removeOrphans(rec.db, restored.map(photo => photo.id)); } catch (error) { console.warn(error); }
    navigator.storage?.persist?.().catch(() => {}); // the user chose to keep this session; false is fine
  }
  rec.lastSession = ''; sessionChanged();
}

async function startFresh() {
  const count = rec.pending?.order.length || 0;
  if (count && !confirm(`Delete the ${plural(count, 'saved photo')} and their edits from this browser?`)) return;
  rec.pending = null; $('#startResume').hidden = true;
  try { if (rec.db && !rec.readOnly) await clearSession(rec.db); } catch (error) { console.error(error); toast('The saved photos could not be deleted.'); }
  rec.sources.clear(); syncSessionMenu();
}

/** Before photos open (picker, drop, camera, sample): a saved session the user didn't decide on is kept, not lost. */
async function beforeOpen() { await rec.ready; if (rec.pending) await continueSession(); }

// ---------- Changes ----------
function schedule(delay = SAVE_DELAY) {
  if (!canWrite()) return;
  clearTimeout(rec.timer);
  rec.timer = setTimeout(() => { if (rec.held.size && Date.now() - rec.heldSince < 30000) schedule(); else save(); }, delay);
}
function photoOpened(photo) { if (!rec.enabled) return; rec.fresh.set(photo.id, photo); schedule(); }
function photoChanged(id) { if (!rec.enabled || id == null) return; rec.dirty.add(id); schedule(); }
function photosRemoved(ids) {
  if (!rec.enabled) return;
  for (const id of ids) { rec.fresh.delete(id); rec.dirty.delete(id); rec.unsaved.delete(id); if (rec.persisted.has(id)) rec.removed.add(id); }
  schedule();
}
/** Order, selection, photo in view or collages changed. The record is compared before it is written. */
function sessionChanged() { if (rec.enabled) schedule(); }
function saveNow() { if (canWrite() && (rec.fresh.size || rec.dirty.size || rec.removed.size || rec.lastSession !== JSON.stringify(sessionRecord()))) save(); }

// ---------- Saving ----------
function photoRecord(photo) {
  const inView = photo.id === app.activeId && state.image;
  const history = pruneHistory(inView ? state.undo : photo.undo, inView ? state.redo : photo.redo);
  return { photoId: photo.id, sourceId: photo.sourceId, name: photo.name, width: photo.width, height: photo.height, v: SETTINGS_VERSION,
    settings: inView ? snapshot() : photo.settings, undo: history.undo, redo: history.redo };
}
function sessionRecord(extraId = null) {
  const order = app.photos.filter(photo => rec.persisted.has(photo.id) || photo.id === extraId).map(photo => photo.id);
  return { v: SETTINGS_VERSION, order, activeId: order.includes(app.activeId) ? app.activeId : order[0] ?? null,
    selected: [...app.selected].filter(id => order.includes(id)), nextId: app.nextId, collages: collageStore.list() };
}
async function fingerprintOf(file) {
  try { return `sha256-${await fingerprint(file)}`; }
  catch { return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; } // no crypto.subtle: no dedupe
}
const isQuota = error => error?.name === 'QuotaExceededError' || /quota/i.test(error?.message || '');

async function save() {
  clearTimeout(rec.timer);
  if (!canWrite()) return;
  if (rec.running) { rec.again = true; return; }
  rec.running = true;
  try {
    // New photos: the source file and the first photo record in one transaction (A§6.3), one photo at a time.
    for (const photo of [...rec.fresh.values()]) {
      if (!photoById(photo.id)) { rec.fresh.delete(photo.id); continue; }
      photo.sourceId ||= await fingerprintOf(photo.file);
      await warnIfLow(photo.file.size);
      const source = { id: photo.sourceId, blob: photo.file, name: photo.name, type: photo.file.type, lastModified: photo.file.lastModified, size: photo.file.size };
      try {
        await writeSession(rec.db, { sources: [source], photos: [photoRecord(photo)], session: sessionRecord(photo.id) });
        rec.persisted.add(photo.id); rec.sources.set(photo.sourceId, photo.file.size); rec.dirty.delete(photo.id);
        firstNotice();
      } catch (error) {
        if (!isQuota(error)) throw error;
        rec.unsaved.add(photo.id); toast(`Browser storage is full: ${photo.name} isn’t kept after a reload.`);
      }
      rec.fresh.delete(photo.id);
      if (!rec.db) return; // the store closed meanwhile
    }
    // Edits, closed photos and the session record: one transaction.
    const ids = [...rec.dirty].filter(id => rec.persisted.has(id) && photoById(id)), removed = [...rec.removed];
    rec.dirty.clear(); rec.removed.clear();
    const session = sessionRecord(), key = JSON.stringify(session);
    if (!ids.length && !removed.length && key === rec.lastSession) return;
    try {
      await writeSession(rec.db, { photos: ids.map(id => photoRecord(photoById(id))), removed, session });
      rec.lastSession = key;
      for (const id of removed) rec.persisted.delete(id);
      // Sources: the store dropped the unused ones; keep the size readout in step.
      const used = new Set(app.photos.filter(photo => rec.persisted.has(photo.id)).map(photo => photo.sourceId));
      for (const id of [...rec.sources.keys()]) if (!used.has(id)) rec.sources.delete(id);
    } catch (error) {
      ids.forEach(id => rec.dirty.add(id)); removed.forEach(id => rec.removed.add(id)); // try again with the next change
      throw error;
    }
  } catch (error) {
    console.error('Session save failed.', error);
    if (isQuota(error)) toast('Browser storage is full: recent edits aren’t saved. Close some photos or clear site data.');
  } finally {
    rec.running = false; syncSessionMenu();
    if (rec.again) { rec.again = false; schedule(0); }
  }
}

// A§6.5: a warning, not a guarantee (estimate() is approximate).
async function warnIfLow(bytes) {
  if (rec.warned || !navigator.storage?.estimate) return;
  try {
    const { quota = 0, usage = 0 } = await navigator.storage.estimate();
    const headroom = Math.max(0, quota - usage), required = bytes * 1.02 + 1024 * 1024;
    if (quota && required > .8 * headroom) { rec.warned = true; toast('This browser is almost out of storage: new photos may not be kept after a reload.'); }
  } catch { /* no estimate */ }
}
function firstNotice() {
  try { if (localStorage.getItem(NOTICE_KEY)) return; localStorage.setItem(NOTICE_KEY, '1'); } catch { return; }
  toast('Photos and edits are kept in this browser until you clear them (photo menu).');
}

// ---------- Photo menu: what is saved, and the switch ----------
// The photo menu and About (phones have no photo menu) show the same line and button.
function syncSessionMenu() {
  const bytes = [...rec.sources.values()].reduce((sum, size) => sum + size, 0);
  const unsaved = rec.unsaved.size ? ` ${plural(rec.unsaved.size, 'photo')} didn’t fit and won’t come back after a reload.` : '';
  const text = !rec.enabled ? 'Photos aren’t kept after you close this page.'
    : rec.problem || (rec.readOnly ? 'Saved by a newer PhotoKamo, so this tab doesn’t save. Reload to update.'
      : !rec.db ? 'Opening browser storage…' : (rec.persisted.size ? `Saved in this browser · ${formatBytes(bytes)}` : 'Kept in this browser as you edit.') + unsaved);
  document.querySelectorAll('#sessionStatus,#sessionStorageText').forEach(element => { element.textContent = text; });
  document.querySelectorAll('#sessionToggle,#sessionStorageToggle').forEach(element => { element.textContent = rec.enabled ? 'Stop keeping and clear…' : 'Keep photos in this browser'; });
}
async function toggleRecovery() {
  if ($('#fileMenu').matches(':popover-open')) $('#fileMenu').hidePopover();
  if (rec.enabled) {
    if (!confirm('Stop keeping photos in this browser? The saved copies are deleted now; the open photos stay until you close this page.')) return;
    rec.enabled = false; writePref(false); clearTimeout(rec.timer);
    try { if (rec.db && !rec.readOnly && !rec.problem) await clearSession(rec.db); } catch (error) { console.error(error); toast('The saved photos could not be deleted.'); }
    rec.fresh.clear(); rec.dirty.clear(); rec.removed.clear(); rec.persisted.clear(); rec.unsaved.clear(); rec.sources.clear(); rec.lastSession = '';
    toast('Photos are no longer kept in this browser.');
  } else {
    rec.enabled = true; writePref(true);
    if (!rec.db) await connect();
    try { if (rec.db && !rec.readOnly && !rec.problem) await clearSession(rec.db); } catch (error) { console.warn(error); } // nothing stale mixes in
    for (const photo of app.photos) rec.fresh.set(photo.id, photo);
    toast(rec.problem || 'Photos and edits are now kept in this browser.');
    rec.lastSession = ''; schedule(0);
  }
  syncSessionMenu();
}

export { beforeOpen, initRecovery, photoChanged, photoOpened, photosRemoved, sessionChanged };
