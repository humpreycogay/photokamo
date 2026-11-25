// Collage document (CollagePlan.md, "Document model"). Plain data: undo snapshots are JSON copies.
// Slots reference strip photos by id; a missing photo leaves its slot empty.

/** @typedef {{ id: string, photoId: number|null, pan: {x:number,y:number}, zoom: number, rotate: number, flip: boolean }} SlotFill
 *  pan 0–1 (0.5 = centred) within the photo's own crop; zoom ≥ 1 (1 = cover); rotate in degrees */
/** @typedef {{ v: 1, templateId: string, aspect: { w: number, h: number }, aspectAuto: boolean,
 *   sheet: { shape: object, background: 'paper'|'transparent', outline: object|null, shadow: boolean },
 *   gutter: number, margin: number, radius: number, paper: { color: string, texture: string },
 *   border: object|null, splits: number[]|null, slots: SlotFill[], text: object[], film: object|null, flatten: string }} CollageDoc
 *  gutter, margin and radius are fractions of the sheet's short edge. aspectAuto: the sheet follows the template's
 *  aspect until the user picks one. */

/** Sheet aspects offered in the panel: [label, w, h]. */
export const ASPECTS = [['1:1', 1, 1], ['4:5', 4, 5], ['3:2', 3, 2], ['2:3', 2, 3], ['9:16', 9, 16], ['16:9', 16, 9]];
export const SPACING = { gutter: { min: 0, max: .1, step: .005 }, margin: { min: 0, max: .15, step: .005 }, radius: { min: 0, max: .1, step: .005 } };

let slotSeq = 0;
export const emptySlot = (photoId = null) => ({ id: `s${++slotSeq}`, photoId, pan: { x: .5, y: .5 }, zoom: 1, rotate: 0, flip: false });

/** A new collage of `photoIds` (in order) on `template`. */
export function createDoc(photoIds, template, paperColor) {
  return {
    v: 1, templateId: template.id, aspect: { w: template.aspect[0], h: template.aspect[1] }, aspectAuto: true,
    sheet: { shape: { kind: 'rect' }, background: 'paper', outline: null, shadow: false },
    gutter: .02, margin: .04, radius: 0, paper: { color: paperColor, texture: 'none' },
    border: null, splits: null, slots: photoIds.map(id => emptySlot(id)), text: [], film: null, flatten: '#ffffff'
  };
}
/** Pads the slot list so a template with `count` slots has one fill per slot; extra fills are kept (in order)
 *  so switching to a smaller template and back loses nothing. */
export function fitSlots(doc, count) {
  while (doc.slots.length < count) doc.slots.push(emptySlot());
  return doc;
}
export const cloneDoc = doc => JSON.parse(JSON.stringify(doc));
