// Collage document (CollagePlan.md, "Document model"). Plain data: undo snapshots are JSON copies.
// Slots reference strip photos by id; a missing photo leaves its slot empty.

/** @typedef {{ id: string, photoId: number|null, pan: {x:number,y:number}, zoom: number, rotate: number, angle: number, flip: boolean, layout?: {x:number,y:number,rotate:number,z:number} }} SlotFill
 *  The photo's framing in its slot (js/collage/fill.js): pan 0–1 (0.5 = centred) within the photo's own crop;
 *  zoom 1–5 (1 = cover); rotate in 90° steps; angle −45…45° on top; flip mirrors it. `id` stays with the slot. */
/** @typedef {{ v: 1, templateId: string, aspect: { w: number, h: number }, aspectAuto: boolean,
 *   sheet: { shape: object, background: 'paper'|'transparent', outline: object|null, shadow: boolean },
 *   gutter: number, margin: number, radius: number, paper: { color: string, texture: string },
 *   border: object|null, splits: number[]|null, captionSpace: boolean, slots: SlotFill[], text: object[], film: object|null, flatten: string }} CollageDoc
 *  gutter, margin and radius are fractions of the sheet's short edge. aspectAuto: the sheet follows the template's
 *  aspect until the user picks one. splits: divider positions of a one-row/one-column grid (js/collage/layout.js),
 *  null = the template's; captionSpace: a band of paper under each photo for its caption (grids). */

/** Sheet aspects offered in the panel: [label, w, h]. */
export const ASPECTS = [['1:1', 1, 1], ['4:5', 4, 5], ['3:2', 3, 2], ['2:3', 2, 3], ['9:16', 9, 16], ['16:9', 16, 9]];
/** Collage-only paper colours, sampled from the owner's reference layouts (styles default to them). */
export const COLLAGE_PAPERS = [{ id: 'taupe', name: 'Taupe', hex: '#a89a78' }, { id: 'clay', name: 'Clay', hex: '#a69480' }];
export const SPACING = { gutter: { min: 0, max: .1, step: .005 }, margin: { min: 0, max: .15, step: .005 }, radius: { min: 0, max: .1, step: .005 } };

let slotSeq = 0;
export const FRAMING = Object.freeze({ pan: Object.freeze({ x: .5, y: .5 }), zoom: 1, rotate: 0, angle: 0, flip: false });
export const emptySlot = (photoId = null) => ({ id: `s${++slotSeq}`, photoId, ...cloneFraming(FRAMING) });
const cloneFraming = ({ pan, zoom, rotate, angle, flip }) => ({ pan: { ...pan }, zoom, rotate, angle, flip });
/** Puts the default framing back on a slot (its photo stays). */
export const resetFraming = slot => Object.assign(slot, cloneFraming(FRAMING));
/** Restores a slot's photo framing and template-defined placement. The photo and slot id stay. */
export function resetTransform(slot) {
  resetFraming(slot);
  delete slot.layout;
  return slot;
}
/** Restores every photo/print transform in a collage without changing its photos or other settings. */
export function resetTransforms(doc) {
  doc.slots.forEach(resetTransform);
  return doc;
}
/** Swaps the photos of two slots, each keeping its framing (the slots' ids, and so their captions, stay). */
export function swapSlots(doc, a, b) {
  const first = doc.slots[a], second = doc.slots[b];
  const take = slot => ({ photoId: slot.photoId, ...cloneFraming(slot) });
  const firstFill = take(first);
  Object.assign(first, take(second)); Object.assign(second, firstFill);
}

/** A new collage of `photoIds` (in order) on `template`. */
export function createDoc(photoIds, template, paperColor) {
  return {
    v: 1, templateId: template.id, aspect: { w: template.aspect[0], h: template.aspect[1] }, aspectAuto: true,
    sheet: { shape: { kind: 'rect' }, background: 'paper', outline: null, shadow: false },
    gutter: .02, margin: .04, radius: 0, paper: { color: paperColor, texture: 'none' },
    border: null, splits: null, captionSpace: false, slots: photoIds.map(id => emptySlot(id)), text: [], film: null, flatten: '#ffffff'
  };
}
/** Pads the slot list so a template with `count` slots has one fill per slot; extra fills are kept (in order)
 *  so switching to a smaller template and back loses nothing. */
export function fitSlots(doc, count) {
  while (doc.slots.length < count) doc.slots.push(emptySlot());
  return doc;
}
export const cloneDoc = doc => JSON.parse(JSON.stringify(doc));
