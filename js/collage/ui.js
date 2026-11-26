// Small shared pieces of collage mode (js/collage/mode.js and its parts): text helpers, radio groups, live sliders and
// shaped-slot outlines. DOM-free at import time.
import { cloneDoc } from './model.js';

/** Template categories the Layout picker lists; a new collage only ever starts on one of these. */
export const PICKER = ['diptych', 'layout', 'collage', 'kit'];
export const percent = value => `${Math.round(value * 1000) / 10}%`;
export const escapeHtml = text => String(text).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
export const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** A range input that edits the collage live while it is dragged or a key is held, as one undo step per gesture: the
 *  document before it is kept in `c.slider` (from pointer-down or focus) and committed on change. */
export function liveRange(c, input, onInput, onChange = null) {
  const begin = () => { c.slider ||= cloneDoc(c.doc); };
  input.addEventListener('pointerdown', begin); input.addEventListener('focus', begin);
  input.addEventListener('input', () => { begin(); onInput(); });
  input.addEventListener('change', () => { if (c.slider) c.commit(c.slider); c.slider = cloneDoc(c.doc); onChange?.(); });
  input.addEventListener('blur', () => { c.slider = null; });
}

export function coverThumb(canvas, source) {
  if (!source) return;
  const ctx = canvas.getContext('2d'), scale = Math.max(canvas.width / source.width, canvas.height / source.height);
  ctx.drawImage(source, (canvas.width - source.width * scale) / 2, (canvas.height - source.height * scale) / 2, source.width * scale, source.height * scale);
}
/** Radio buttons: click picks; arrows move focus and pick (or only move focus with `followFocus: false`, where
 *  Enter/Space, the buttons' own click, picks). */
export function radioGroup(group, selector, pick, { followFocus = true } = {}) {
  group.addEventListener('click', event => { const button = event.target.closest(selector); if (button && button.getAttribute('aria-checked') !== 'true') pick(button); });
  group.addEventListener('keydown', event => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]; if (!delta) return;
    const buttons = [...group.querySelectorAll(selector)], next = buttons[(Math.max(0, buttons.indexOf(document.activeElement)) + delta + buttons.length) % buttons.length];
    event.preventDefault();
    if (!followFocus) buttons.forEach(button => { button.tabIndex = button === next ? 0 : -1; });
    next.focus(); if (followFocus) pick(next);
  });
}
export function syncRadios(group, attribute, value) {
  const buttons = [...group.querySelectorAll(`[${attribute}]`)];
  buttons.forEach(button => { const on = button.getAttribute(attribute) === value; button.setAttribute('aria-checked', on); button.tabIndex = on ? 0 : -1; });
  if (!buttons.some(button => button.tabIndex === 0)) buttons[0].tabIndex = 0;
}

/** A shaped slot's visible part (less the hole) as a Path2D, in the layout's px; fill with 'evenodd'. */
export function visiblePath(slot, offsetX = 0, offsetY = 0, k = 1) {
  const path = new Path2D();
  for (const poly of [slot.visible, slot.holeVisible]) {
    if (!poly?.length) continue;
    path.moveTo((poly[0] - offsetX) / k, (poly[1] - offsetY) / k);
    for (let i = 2; i < poly.length; i += 2) path.lineTo((poly[i] - offsetX) / k, (poly[i + 1] - offsetY) / k);
    path.closePath();
  }
  return path;
}
/** The same outline as CSS path() data, relative to the slot's box in CSS px. */
export function visibleCss(slot, k) {
  const ring = poly => `M ${poly.map((v, i) => ((v - (i % 2 ? slot.y : slot.x)) / k).toFixed(1)).join(' ').replace(/^(\S+ \S+)/, '$1 L')} Z`;
  return [slot.visible, slot.holeVisible].filter(poly => poly?.length >= 6).map(ring).join(' ');
}
