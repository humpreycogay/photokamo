// Saved collage documents for the current photo session. The workflow recovery database will persist this array when
// plan_workflow.md Task 5 lands; keeping storage separate here avoids pretending ephemeral photo ids survive reloads.
import { templateById, slotCount } from './templates.js';
import { cloneDoc, fitSlots } from './model.js';
import { cleanStickers } from './stickers.js';

const finite = value => Number.isFinite(value);

/** A defensive document boundary: invalid records are ignored; photos absent from the current session become empty. */
export function sanitizeCollageDoc(value, photoExists = () => true) {
  if (!value || value.v !== 1 || !templateById(value.templateId) || !value.aspect || !finite(value.aspect.w) || !finite(value.aspect.h)
    || value.aspect.w <= 0 || value.aspect.h <= 0 || !Array.isArray(value.slots) || !value.sheet || !value.paper) return null;
  const doc = cloneDoc(value);
  fitSlots(doc, slotCount(templateById(doc.templateId)));
  doc.stickers = cleanStickers(doc.stickers);
  for (const slot of doc.slots) {
    if (!slot || typeof slot.id !== 'string') return null;
    if (slot.photoId != null && !photoExists(slot.photoId)) slot.photoId = null;
  }
  return doc;
}

export function createCollageStore({ photoExists = () => true, now = () => Date.now() } = {}) {
  let entries = [], sequence = 0;
  const list = () => entries.map(entry => ({ ...entry, doc: cloneDoc(entry.doc) }));
  const get = id => { const entry = entries.find(item => item.id === id); return entry && { ...entry, doc: cloneDoc(entry.doc) }; };
  function save(doc, { id = null, name = null } = {}) {
    const clean = sanitizeCollageDoc(doc, photoExists); if (!clean) return null;
    const current = id && entries.find(item => item.id === id), stamp = now();
    const entry = { id: current?.id || `c${stamp.toString(36)}${(++sequence).toString(36)}`, name: name || current?.name || `Collage ${entries.length + 1}`,
      created: current?.created || stamp, updated: stamp, doc: clean };
    if (current) entries[entries.indexOf(current)] = entry; else entries.push(entry);
    return { ...entry, doc: cloneDoc(entry.doc) };
  }
  const remove = id => { const before = entries.length; entries = entries.filter(entry => entry.id !== id); return entries.length < before; };
  function restore(records) {
    entries = []; sequence = 0;
    for (const record of Array.isArray(records) ? records : []) {
      const doc = sanitizeCollageDoc(record?.doc, photoExists);
      if (doc && typeof record.id === 'string' && typeof record.name === 'string') entries.push({ id: record.id, name: record.name, created: Number(record.created) || now(), updated: Number(record.updated) || now(), doc });
    }
    return list();
  }
  return { list, get, save, remove, restore };
}