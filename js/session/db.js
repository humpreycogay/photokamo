// Session recovery storage (plan_workflow.md Task 5, A§6.1–6.3): IndexedDB `photokamo` v1. No app imports.
//   session  { id: 'current', v, projectId, rev, order, activeId, selected, nextId, collages, updated }
//   sources  { id (fingerprint), blob, name, type, lastModified, size }
//   photos   { sessionId, photoId, sourceId, name, width, height, v, settings, undo, redo, rev }  key [sessionId, photoId]
// One read-write transaction per save; a save is durable only on `oncomplete`. The session record's `rev` is the
// commit marker: photo records newer than it are ignored on restore (C13: one session, `projectId` for later).
const DB_NAME = 'photokamo', DB_VERSION = 1, SESSION_ID = 'current';

const done = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const finished = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = () => reject(tx.error || new DOMException('Transaction aborted', 'AbortError'));
  tx.onerror = event => event.preventDefault?.(); // reported once, by onabort
});

/** Opens the database. Resolves { db, readOnly } (readOnly: written by a newer PhotoKamo), or rejects when storage is
 *  unavailable (private windows in some browsers, storage turned off). `onClose(reason)` fires when another tab
 *  upgrades the database or the browser closes it. */
export function openSessionDb({ onClose = () => {}, onBlocked = () => {} } = {}) {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    // No version: an existing database opens at its own version, so a newer one is detected instead of failing.
    let request;
    try { request = indexedDB.open(DB_NAME); } catch (error) { reject(error); return; }
    request.onupgradeneeded = event => {
      const db = request.result;
      if (event.oldVersion < 1) {
        db.createObjectStore('session', { keyPath: 'id' });
        db.createObjectStore('sources', { keyPath: 'id' });
        db.createObjectStore('photos', { keyPath: ['sessionId', 'photoId'] }).createIndex('sourceId', 'sourceId');
      }
    };
    request.onblocked = () => onBlocked();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const stores = ['session', 'sources', 'photos'].every(name => db.objectStoreNames.contains(name));
      if (!stores) { db.close(); reject(new Error('Unexpected database layout')); return; }
      db.onversionchange = () => { db.close(); onClose('versionchange'); };
      db.onclose = () => onClose('closed');
      resolve({ db, readOnly: db.version > DB_VERSION });
    };
  });
}

/** Everything stored, in one read-only transaction: { session, photos, sources: Map(id → record) }. */
export async function readSession(db) {
  const tx = db.transaction(['session', 'photos', 'sources'], 'readonly');
  const range = IDBKeyRange.bound([SESSION_ID, -Infinity], [SESSION_ID, Infinity]);
  const [session, photos, sources] = await Promise.all([done(tx.objectStore('session').get(SESSION_ID)), done(tx.objectStore('photos').getAll(range)), done(tx.objectStore('sources').getAll())]);
  return { session: session || null, photos, sources: new Map(sources.map(source => [source.id, source])) };
}

/** A cheap check for the start screen: the stored session record only (no Blobs read). */
export async function readSessionRecord(db) { return (await done(db.transaction('session', 'readonly').objectStore('session').get(SESSION_ID))) || null; }

/** One atomic save. `photos`: records to put; `sources`: source records to add when missing; `removed`: photo ids to
 *  delete (their sources go too when no other photo uses them); `session`: the session record without `rev`.
 *  Resolves the new revision on commit. */
export async function writeSession(db, { photos = [], sources = [], removed = [], session }) {
  const tx = db.transaction(['session', 'photos', 'sources'], 'readwrite');
  const sessionStore = tx.objectStore('session'), photoStore = tx.objectStore('photos'), sourceStore = tx.objectStore('sources');
  const result = finished(tx);
  let rev = 0, failure = null;
  try {
    const current = await done(sessionStore.get(SESSION_ID));
    rev = (current?.rev || 0) + 1;
    for (const source of sources) if (!(await done(sourceStore.getKey(source.id)))) sourceStore.put(source);
    for (const photo of photos) photoStore.put({ ...photo, sessionId: SESSION_ID, rev });
    const orphans = new Set();
    for (const photoId of removed) {
      const record = await done(photoStore.get([SESSION_ID, photoId]));
      if (!record) continue;
      photoStore.delete([SESSION_ID, photoId]); orphans.add(record.sourceId);
    }
    for (const sourceId of orphans) if (!(await done(photoStore.index('sourceId').count(sourceId)))) sourceStore.delete(sourceId);
    sessionStore.put({ ...session, id: SESSION_ID, projectId: SESSION_ID, rev, updated: Date.now() });
  } catch (error) { failure = error; try { tx.abort(); } catch { /* already finished */ } }
  try { await result; } catch (error) { throw failure || error; }
  return rev;
}

/** Deletes photo records and sources nothing points at (records outside the session order, leftovers of a crash). */
export async function removeOrphans(db, keepPhotoIds) {
  const tx = db.transaction(['photos', 'sources'], 'readwrite'), result = finished(tx);
  const photoStore = tx.objectStore('photos'), sourceStore = tx.objectStore('sources');
  const keep = new Set(keepPhotoIds), used = new Set();
  const range = IDBKeyRange.bound([SESSION_ID, -Infinity], [SESSION_ID, Infinity]);
  for (const record of await done(photoStore.getAll(range))) {
    if (keep.has(record.photoId)) used.add(record.sourceId); else photoStore.delete([SESSION_ID, record.photoId]);
  }
  for (const id of await done(sourceStore.getAllKeys())) if (!used.has(id)) sourceStore.delete(id);
  await result;
}

/** Removes everything stored. */
export async function clearSession(db) {
  const tx = db.transaction(['session', 'photos', 'sources'], 'readwrite'), result = finished(tx);
  for (const name of ['session', 'photos', 'sources']) tx.objectStore(name).clear();
  await result;
}
