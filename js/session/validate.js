// Session recovery (plan_workflow.md Task 5): pure checks on records read back from IndexedDB, the history budget
// (A§6.4) and the source fingerprint (A§6.2). No DOM and no app imports, so tools/workflow-fixtures.mjs can test it.
import { sanitizeHealing } from '../heal/model.js';

/** Version of the stored settings ({ v, settings }, C17); in-memory snapshots carry no version. */
export const SETTINGS_VERSION = 1;
export const HISTORY_ENTRIES = 50, HISTORY_BYTES = 2 * 1024 * 1024;

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** A photo's settings as stored, or null when unusable. `known` = { engines: Set, presets: Set, controls: { key: { min, max } } }.
 *  Unknown engines, presets and Adjust keys fall back to defaults instead of failing the whole photo. Shapes this
 *  can't repair (no look, wrong types) return null. The result keeps snapshot() key order. */
export function sanitizeSettings(value, known) {
  if (!isObject(value) || !isObject(value.look)) return null;
  const { look } = value;
  if (typeof look.engine !== 'string' || typeof look.presetId !== 'string' || !finite(look.strength)) return null;
  const engine = known.engines.has(look.engine) ? look.engine : 'presets';
  const film = engine !== 'presets';
  const edits = {};
  for (const [key, delta] of Object.entries(isObject(value.edits) ? value.edits : {})) {
    const spec = known.controls[key];
    if (spec && finite(delta) && delta !== 0) edits[key] = Math.max(spec.min - spec.max, Math.min(spec.max - spec.min, delta));
  }
  const engineParams = isObject(look.engineParams) ? Object.fromEntries(Object.entries(look.engineParams).filter(([, params]) => isObject(params))) : {};
  return {
    look: { engine, presetId: film || known.presets.has(look.presetId) ? look.presetId : 'original', strength: Math.max(0, Math.min(100, look.strength)), engineParams,
      myLookId: typeof look.myLookId === 'string' ? look.myLookId : null },
    edits,
    crop: isObject(value.crop) ? value.crop : {},
    optics: isObject(value.optics) ? value.optics : {},
    frame: typeof value.frame === 'string' || (isObject(value.frame) && typeof value.frame.id === 'string') ? value.frame : 'none',
    text: Array.isArray(value.text) ? value.text.filter(text => isObject(text) && typeof text.content === 'string') : [],
    healing: sanitizeHealing(value.healing)
  };
}

/** The stored history: only entries that sanitize, then pruned to the budget. */
export function sanitizeHistory(list, known) { return Array.isArray(list) ? list.map(entry => sanitizeSettings(entry, known)).filter(Boolean) : []; }

/** A§6.4: at most `entries` undo steps, and undo + redo within `bytes` of JSON (UTF-8). Redo goes first, then the
 *  oldest undo. Returns new arrays; the inputs are not changed. */
export function pruneHistory(undo, redo, { entries = HISTORY_ENTRIES, bytes = HISTORY_BYTES } = {}) {
  const encoder = new TextEncoder(), size = entry => encoder.encode(JSON.stringify(entry)).length;
  const u = undo.slice(-entries), r = redo.slice(-entries);
  const uSizes = u.map(size), rSizes = r.map(size);
  let total = uSizes.reduce((a, b) => a + b, 0) + rSizes.reduce((a, b) => a + b, 0);
  // Redo is a stack: the next step is the last entry, so the far end (index 0) goes first.
  while (total > bytes && r.length) { r.shift(); total -= rSizes.shift(); }
  while (total > bytes && u.length) { u.shift(); total -= uSizes.shift(); }
  return { undo: u, redo: r };
}

/** One photo record as read back: { photoId, sourceId, name, width, height, settings, undo, redo }, or null. */
export function sanitizePhotoRecord(record, known, maxRev) {
  if (!isObject(record) || !Number.isInteger(record.photoId) || record.photoId < 1 || typeof record.sourceId !== 'string') return null;
  if (!finite(record.rev) || record.rev > maxRev || record.v !== SETTINGS_VERSION) return null;
  if (!Number.isInteger(record.width) || !Number.isInteger(record.height) || record.width < 1 || record.height < 1) return null;
  const settings = sanitizeSettings(record.settings, known); if (!settings) return null;
  return { photoId: record.photoId, sourceId: record.sourceId, name: typeof record.name === 'string' && record.name ? record.name.slice(0, 255) : 'photo',
    width: record.width, height: record.height, settings, undo: sanitizeHistory(record.undo, known), redo: sanitizeHistory(record.redo, known) };
}

/** The session record as read back, or null. Order keeps unique positive integer ids only. */
export function sanitizeSession(record) {
  if (!isObject(record) || record.v !== SETTINGS_VERSION || !finite(record.rev) || !Array.isArray(record.order)) return null;
  const order = [...new Set(record.order.filter(id => Number.isInteger(id) && id > 0))];
  const selected = Array.isArray(record.selected) ? record.selected.filter(id => order.includes(id)) : [];
  return { rev: record.rev, order, activeId: order.includes(record.activeId) ? record.activeId : order[0] ?? null, selected,
    nextId: Math.max(Number.isInteger(record.nextId) ? record.nextId : 1, ...order.map(id => id + 1)), collages: Array.isArray(record.collages) ? record.collages : [] };
}

/** A§6.2 fingerprint input: name, size, lastModified, the first and last 64 KiB. Deduplication, not security. */
export async function fingerprintBytes(file) {
  const edge = 64 * 1024, head = file.slice(0, Math.min(edge, file.size)), tail = file.slice(Math.max(0, file.size - edge));
  const name = new TextEncoder().encode(file.name || ''), meta = new DataView(new ArrayBuffer(16));
  meta.setBigUint64(0, BigInt(file.size)); meta.setBigUint64(8, BigInt(Math.max(0, Math.floor(file.lastModified || 0))));
  const parts = [name, new Uint8Array(meta.buffer), new Uint8Array(await head.arrayBuffer()), new Uint8Array(await tail.arrayBuffer())];
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}
export async function fingerprint(file) {
  const digest = await crypto.subtle.digest('SHA-256', await fingerprintBytes(file));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
