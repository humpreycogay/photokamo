// Collage text layers (part of collage mode, js/collage/mode.js): the Text panel and the handles over the canvas text,
// which drag, or move with arrow keys (one undo step per burst). `c` is the collage context (mode.js).
import { slotCount } from './templates.js';
import { collageTextRect } from './render.js';
import { measureTextLayer } from '../renderer.js';
import { cloneDoc } from './model.js';
import { clamp, escapeHtml, plural, radioGroup, syncRadios } from './ui.js';

/** Applies a stage drag in CSS pixels to a text layer's normalized target position. */
export function moveCollageText(text, rect, dx, dy, pixelsPerCssPixel = 1) {
  text.x = clamp(text.x + dx * pixelsPerCssPixel / rect.width, 0, 1);
  text.y = clamp(text.y + dy * pixelsPerCssPixel / rect.height, 0, 1);
  return text;
}

export function createTextUi(c) {
  const { deps, byId, change, commit, refresh, say, scheduleDraw, template, cancelGesture } = c;
  const textHandlesEl = byId('collageTextHandles');
  const textUi = { selected: null, start: null, timer: 0, layers: byId('collageTextLayers'), editor: byId('collageTextEditor'), empty: byId('collageTextEmpty'),
    content: byId('collageTextContent'), target: byId('collageTextTarget'), fonts: byId('collageTextFont'), size: byId('collageTextSize'), color: byId('collageTextColor'),
    align: byId('collageTextAlign'), outsideRow: byId('collageOutsideShapeRow'), outside: byId('collageOutsideShape'), contrast: byId('collageTextContrast') };
  let textGesture = null;

  // ---------- Text and captions ----------
  const selectedText = () => c.doc?.text.find(text => text.id === textUi.selected) || null;
  const newTextId = () => `ct${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const newText = (content, target = 'sheet', extra = {}) => ({ id: newTextId(), content, target,
    font: 'inter', size: .08, color: '#ffffff', x: .5, y: .85, align: 'center', bold: true, italic: false, shadow: true, opacity: 1, ...extra });
  function addTextLayer(text) { change(d => d.text.push(text)); textUi.selected = text.id; syncTextPanel(); textUi.content.focus(); textUi.content.select(); }
  function updateText(mutator) { const id = textUi.selected; if (!id) return; change(d => { const text = d.text.find(layer => layer.id === id); if (text) mutator(text); }); }
  function finishLiveText() { clearTimeout(textUi.timer); if (textUi.start) commit(textUi.start); textUi.start = null; }
  function liveText(mutator) {
    const text = selectedText(); if (!text) return;
    textUi.start ||= cloneDoc(c.doc); mutator(text); syncTextPanel(); scheduleDraw();
    clearTimeout(textUi.timer); textUi.timer = setTimeout(finishLiveText, 450);
  }
  function buildTextPanel() {
    textUi.fonts.innerHTML = deps.textFonts.map(([id, name, stack]) => `<button type="button" role="radio" class="text-font-option" data-font="${id}" aria-checked="false" style="--preview-font:${stack}">${name}</button>`).join('');
    byId('collageAddText').addEventListener('click', () => addTextLayer(newText('Your text')));
    byId('collageSharedCaption').addEventListener('click', () => addTextLayer(newText('Your caption', 'sheet', { y: .92, size: .055 })));
    byId('collageDateText').addEventListener('click', () => { const date = new Date(); addTextLayer(newText(date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), 'sheet', { x: .92, y: .94, size: .035, align: 'right', bold: false })); });
    byId('collageSlotCaptions').addEventListener('click', () => {
      const layers = c.doc.slots.slice(0, slotCount(template())).map((slot, index) => newText(`Photo ${index + 1}`, slot.id, { y: .5, size: .18, color: '#111110', bold: false, shadow: false, caption: true }));
      const previous = cloneDoc(c.doc); c.doc.text.push(...layers); if (layers.length) textUi.selected = layers[0].id; commit(previous); refresh(); say(`${plural(layers.length, 'slot caption')} added`);
    });
    textUi.layers.addEventListener('click', event => { const button = event.target.closest('[data-text-layer]'); if (button) { finishLiveText(); textUi.selected = button.dataset.textLayer; syncTextPanel(); } });
    textUi.content.addEventListener('change', finishLiveText); textUi.size.addEventListener('change', finishLiveText); textUi.color.addEventListener('change', finishLiveText);
    textUi.content.addEventListener('input', () => liveText(text => { text.content = textUi.content.value; }));
    textUi.target.addEventListener('change', () => updateText(text => { text.target = textUi.target.value; text.caption = text.target !== 'sheet' && Boolean(c.view.layout?.slots[c.doc.slots.findIndex(slot => slot.id === text.target)]?.caption); text.x = .5; text.y = text.caption ? .5 : .85; }));
    textUi.size.addEventListener('input', () => liveText(text => { text.size = Number(textUi.size.value) / 100; }));
    textUi.color.addEventListener('input', () => liveText(text => { text.color = textUi.color.value; }));
    radioGroup(textUi.fonts, '[data-font]', button => updateText(text => { text.font = button.dataset.font; }));
    radioGroup(textUi.align, '[data-align]', button => updateText(text => { text.align = button.dataset.align; }));
    textUi.editor.addEventListener('click', event => { const button = event.target.closest('[data-collage-text-toggle]'); if (button) updateText(text => { const key = button.dataset.collageTextToggle; text[key] = !text[key]; }); });
    textUi.outside.addEventListener('change', () => updateText(text => { text.outsideShape = textUi.outside.checked; }));
    byId('collageDeleteText').addEventListener('click', () => { const id = textUi.selected, index = c.doc.text.findIndex(text => text.id === id); if (index < 0) return; change(d => d.text.splice(index, 1)); textUi.selected = c.doc.text[Math.min(index, c.doc.text.length - 1)]?.id || null; syncTextPanel(); });
    document.fonts.ready.then(scheduleDraw);
  }
  function syncTextPanel() {
    if (!c.doc.text.some(text => text.id === textUi.selected)) textUi.selected = c.doc.text.at(-1)?.id || null;
    const text = selectedText(), count = slotCount(template());
    textUi.layers.innerHTML = c.doc.text.map((layer, index) => `<button type="button" role="radio" class="chip" data-text-layer="${layer.id}" aria-checked="${layer.id === textUi.selected}" tabindex="${layer.id === textUi.selected ? 0 : -1}">${escapeHtml((layer.content.split('\n')[0].trim() || `Text ${index + 1}`).slice(0, 24))}</button>`).join('');
    textUi.layers.hidden = c.doc.text.length < 2; textUi.empty.hidden = Boolean(c.doc.text.length); textUi.editor.hidden = !text;
    if (!text) return;
    if (document.activeElement !== textUi.content) textUi.content.value = text.content;
    textUi.target.innerHTML = `<option value="sheet">Whole sheet</option>${c.doc.slots.slice(0, count).map((slot, i) => `<option value="${slot.id}">Slot ${i + 1}</option>`).join('')}`; textUi.target.value = text.target;
    syncRadios(textUi.fonts, 'data-font', text.font); syncRadios(textUi.align, 'data-align', text.align);
    textUi.size.value = text.size * 100; byId('collageTextSizeOutput').value = `${Number((text.size * 100).toFixed(1))}%`; textUi.color.value = text.color;
    textUi.color.closest('.text-custom-color').style.setProperty('--custom-color', text.color);
    textUi.editor.querySelectorAll('[data-collage-text-toggle]').forEach(button => { button.setAttribute('aria-pressed', Boolean(text[button.dataset.collageTextToggle])); button.disabled = text.font === 'playfair' && button.dataset.collageTextToggle !== 'shadow'; });
    const shaped = template().kind === 'shaped'; textUi.outsideRow.hidden = !shaped; textUi.outside.checked = Boolean(text.outsideShape);
    textUi.contrast.hidden = c.doc.sheet.background !== 'transparent';
  }

  /** Transparent DOM handles mirror the canvas text boxes, making each rendered text layer directly draggable. */
  const fontsAsked = new Set(); // bundled fonts load on first use; redraw once they arrive
  function syncTextHandles(ctx) {
    const boxes = new Map();
    for (const text of c.doc.text || []) {
      const font = deps.textFont(text, 32);
      if (!fontsAsked.has(font) && !document.fonts.check(font)) { fontsAsked.add(font); document.fonts.load(font).then(scheduleDraw, () => {}); }
      const rect = collageTextRect(c.doc, c.view.layout, text);
      if (!rect) continue;
      const measured = measureTextLayer(ctx, rect, text);
      if (measured) boxes.set(text.id, measured.box);
    }
    while (textHandlesEl.children.length > boxes.size) textHandlesEl.lastElementChild.remove();
    while (textHandlesEl.children.length < boxes.size) {
      const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'collage-text-handle';
      textHandlesEl.append(handle);
    }
    [...boxes].forEach(([id, box], i) => {
      const handle = textHandlesEl.children[i], text = c.doc.text.find(layer => layer.id === id);
      const pad = 6 * c.view.k, w = Math.max(44 * c.view.k, box.w + 2 * pad), h = Math.max(44 * c.view.k, box.h + 2 * pad); // 44 px targets
      handle.dataset.text = id; handle.setAttribute('aria-label', `Move text: ${String(text.content).split('\n')[0] || 'Untitled'}`);
      handle.setAttribute('aria-pressed', id === textUi.selected);
      Object.assign(handle.style, { left: `${(box.x + box.w / 2 - w / 2) / c.view.k}px`, top: `${(box.y + box.h / 2 - h / 2) / c.view.k}px`, width: `${w / c.view.k}px`, height: `${h / c.view.k}px`, rotate: text.rotate ? `${text.rotate}deg` : '' });
    });
  }

  textHandlesEl.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-text]'); if (!handle || event.button > 0) return;
    const text = c.doc.text.find(layer => layer.id === handle.dataset.text); if (!text) return;
    event.preventDefault(); finishLiveText(); textUi.selected = text.id; syncTextPanel(); scheduleDraw();
    try { handle.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    textGesture = { id: event.pointerId, textId: text.id, x: event.clientX, y: event.clientY, start: cloneDoc(c.doc), position: { x: text.x, y: text.y } };
  });
  textHandlesEl.addEventListener('pointermove', event => {
    if (!textGesture || event.pointerId !== textGesture.id) return;
    const text = c.doc.text.find(layer => layer.id === textGesture.textId), rect = text && collageTextRect(c.doc, c.view.layout, text);
    if (!rect) return;
    text.x = textGesture.position.x; text.y = textGesture.position.y;
    moveCollageText(text, rect, event.clientX - textGesture.x, event.clientY - textGesture.y, c.view.k); scheduleDraw();
  });
  const endTextDrag = event => {
    if (!textGesture || event.pointerId !== textGesture.id) return;
    const { start } = textGesture; textGesture = null;
    if (event.type === 'pointercancel') { cancelGesture(start); return; }
    commit(start); refresh(); say('Text moved');
  };
  textHandlesEl.addEventListener('pointerup', endTextDrag); textHandlesEl.addEventListener('pointercancel', endTextDrag);
  // Keys on a focused text: arrows move it 1 % of its area (Shift: 5 %); a burst of presses is one undo step.
  textHandlesEl.addEventListener('keydown', event => {
    const handle = event.target.closest('[data-text]'), arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!handle || !arrow || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (textUi.selected !== handle.dataset.text) { finishLiveText(); textUi.selected = handle.dataset.text; }
    const step = event.shiftKey ? .05 : .01;
    liveText(text => { text.x = clamp(text.x + arrow[0] * step, 0, 1); text.y = clamp(text.y + arrow[1] * step, 0, 1); });
    say(`Text at ${Math.round(selectedText().x * 100)}%, ${Math.round(selectedText().y * 100)}%`);
  });

  return {
    buildTextPanel, syncTextPanel, syncTextHandles, finishLiveText, newText, newTextId,
    /** After undo/redo: the field shows the restored text, even while it has focus. */
    afterStep() { const text = selectedText(); if (text) textUi.content.value = text.content; },
    /** Leaving collage mode: a drag in progress is kept as one step. */
    stop() { if (textGesture) { commit(textGesture.start); textGesture = null; } }
  };
}
