// Collage mode (CollagePlan.md Tasks 1–2): the stage, the panel, slot renders, slot editing and the collage's own
// history. app.js owns the photos and the per-photo renders; it passes them in as `deps`:
//   photos(), photoById(id), settingsOf(photo), paperColors,
//   renderSlot(photo, { pass: 'fast'|'sharp', edge, job }) → { image } | null (null: job went stale),
//   addFiles(files) → the photos added to the strip, editPhoto(id) to leave for the editor,
//   onHistory() after the undo/redo state changes.
import { templates, templateById, slotCount } from './templates.js';
import { layoutTemplate, paddedAspect, stickerPad, splitAxis, defaultSplits, clampSplits, moveSplit } from './layout.js';
import { drawCollage, sheetPath, slotPath, drawOrder } from './render.js';
import { pointInPolygon, polygonCentroid } from './shapes.js';
import { unrotatePoint } from './scrapbook.js';
import { fillGeometry, normalizeFill, panBy, ZOOM_MIN, ZOOM_MAX } from './fill.js';
import { ASPECTS, SPACING, COLLAGE_PAPERS, createDoc, fitSlots, cloneDoc, resetFraming, resetTransforms, swapSlots } from './model.js';
import { DEFAULT_FILM, filmSettings } from './contact.js';

const MAX_SLOT_EDGE = 1600; // preview renders: long edge cap per photo
const HISTORY_LIMIT = 50;
const BACKDROP_KEY = 'photokamo:collage-backdrop';
const $ = (root, selector) => root.querySelector(selector);
const percent = value => `${Math.round(value * 1000) / 10}%`;
const escapeHtml = text => String(text).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** The template that fits `count` photos best: grids through 9, then the 36-frame 35 mm contact sheet. */
export function templateFor(count) {
  if (count > 9) return templateById('contact-35');
  const sorted = templates.filter(t => t.kind === 'grid').sort((a, b) => slotCount(a) - slotCount(b));
  return sorted.find(t => slotCount(t) === count) || sorted.find(t => slotCount(t) >= count) || sorted[sorted.length - 1];
}

export function createCollageMode(deps) {
  const stage = document.getElementById('collageStage'), canvas = document.getElementById('collageCanvas');
  const panel = document.getElementById('collagePanel'), status = document.getElementById('collageStatus');
  const lists = [document.getElementById('collageTemplates'), document.getElementById('collageShapes'), document.getElementById('collageStyles'), document.getElementById('collageContacts')], aspects = document.getElementById('collageAspects'), paper = document.getElementById('collagePaper');
  const sliders = Object.fromEntries(Object.keys(SPACING).map(key => [key, panel.querySelector(`[data-collage="${key}"]`)]));
  const slotsEl = document.getElementById('collageSlots'), byId = id => document.getElementById(id);
  const sticker = { box: byId('collageSticker'), outline: byId('collageOutline'), output: byId('collageOutlineOutput'), colors: byId('collageOutlineColor'), shadow: byId('collageShadow') };
  const prints = { box: byId('collagePrints'), title: byId('collagePrintsTitle'), border: byId('collageBorder'), output: byId('collageBorderOutput'), colors: byId('collageBorderColor'),
    captionRow: byId('collageCaptionRow'), captionHint: byId('collageCaptionHint'), caption: byId('collageCaptionSpace') };
  const dividersEl = byId('collageDividers');
  const radiusRow = byId('collageRadiusRow'), marginRow = byId('collageMarginRow'), gutterRow = byId('collageGutterRow'), aspectHint = byId('collageAspectHint');
  const backdrops = byId('collageBackdrops'), backdropRow = byId('collageBackdropRow'), sheetEl = byId('collageSheet');
  const filmUi = { box: byId('collageFilm'), base: byId('collageFilmBase'), stock: byId('collageFilmStock'), date: byId('collageFilmDate'), start: byId('collageFilmStart'), mark: byId('collageFilmMark'), frame: byId('collageFilmMarkFrame') };
  const textUi = { selected: null, start: null, timer: 0, layers: byId('collageTextLayers'), editor: byId('collageTextEditor'), empty: byId('collageTextEmpty'),
    content: byId('collageTextContent'), target: byId('collageTextTarget'), fonts: byId('collageTextFont'), size: byId('collageTextSize'), color: byId('collageTextColor'),
    align: byId('collageTextAlign'), outsideRow: byId('collageOutsideShapeRow'), outside: byId('collageOutsideShape'), contrast: byId('collageTextContrast') };
  let backdrop = (() => { try { return ['checker', 'light', 'dark'].includes(localStorage.getItem(BACKDROP_KEY)) ? localStorage.getItem(BACKDROP_KEY) : 'checker'; } catch { return 'checker'; } })();
  const slotUi = { hint: byId('collageSlotHint'), tools: byId('collageSlotTools'), title: byId('collageSlotTitle'), photoTools: byId('collagePhotoTools'),
    zoom: byId('collageZoom'), angle: byId('collageAngle'), rotate: byId('collageRotate'), flip: byId('collageFlip'), reset: byId('collageReset'),
    free: byId('collageFreeTools'), stageTools: byId('collageStageTools'), dragMode: byId('collageDragMode'), layoutRotate: byId('collageLayoutRotate'), layoutRotateOutput: byId('collageLayoutRotateOutput'), back: byId('collageSendBack'), forward: byId('collageBringForward'),
    move: byId('collageMove'), photos: byId('collagePhotos'), add: byId('collageAddPhoto'), empty: byId('collageEmpty'), edit: byId('collageEdit'), file: byId('collageFileInput') };
  let active = false, doc = null, docPhotos = '', undoStack = [], redoStack = [], frame = 0, slider = null, freeDragMode = 'pan';
  // The slot being edited (index into the layout) or null; the last drawn layout and device px per CSS px.
  let selected = null, view = { layout: null, k: 1 }, gesture = null, wheel = null, photosKey = '';
  const pointers = new Map();
  // Slot renders: photoId → { key (settings JSON), image, edge, sharp }. Only photos in visible slots keep one.
  const cache = new Map(), failed = new Set();
  let generation = 0, pumping = false, running = null, progress = { done: 0, total: 0 };

  // ---------- History: one step per gesture ----------
  const historyChanged = () => deps.onHistory?.();
  function commit(previous) {
    if (JSON.stringify(previous) === JSON.stringify(doc)) return;
    undoStack.push(previous); if (undoStack.length > HISTORY_LIMIT) undoStack.shift(); redoStack = [];
    historyChanged(); deps.onDocument?.(cloneDoc(doc));
  }
  function change(mutator) { const previous = cloneDoc(doc); mutator(doc); commit(previous); refresh(); }
  function step(from, to, word) {
    if (!from.length) return;
    to.push(cloneDoc(doc)); doc = from.pop();
    refresh(); historyChanged(); deps.onDocument?.(cloneDoc(doc)); say(word);
  }

  // ---------- Panel ----------
  const template = () => templateById(doc.templateId) || templates[0];
  function buildPanel() {
    const optionHtml = t => `<div class="collage-template" role="option" id="collage-${t.id}" data-template="${t.id}" tabindex="-1" aria-selected="false" aria-label="${t.name}, ${plural(slotCount(t), 'photo')}"><canvas aria-hidden="true"></canvas><span class="collage-template-name" aria-hidden="true">${t.name}</span></div>`;
    lists[0].innerHTML = templates.filter(t => t.category === 'grid').map(optionHtml).join('');
    lists[1].innerHTML = templates.filter(t => t.category === 'shape').map(optionHtml).join('');
    lists[2].innerHTML = templates.filter(t => t.category === 'style').map(optionHtml).join('');
    lists[3].innerHTML = templates.filter(t => t.category === 'contact').map(optionHtml).join('');
    aspects.innerHTML = ASPECTS.map(([label]) => `<button type="button" role="radio" data-aspect="${label}" aria-checked="false">${label}</button>`).join('');
    paper.innerHTML = papers.map(color => `<button type="button" role="radio" class="paper-swatch" data-paper="${color.hex}" aria-checked="false" aria-label="${color.name}" title="${color.name}" style="--swatch:${color.hex}"></button>`).join('')
      + '<button type="button" role="radio" class="paper-swatch paper-none" data-paper="none" aria-checked="false" aria-label="None (transparent)" title="None (transparent)"></button>';
    // Layout listbox: selection follows focus (arrows, Home, End); click or Enter picks.
    const pickTemplate = option => {
      if (!option || option.getAttribute('aria-selected') === 'true') return;
      const next = templateById(option.dataset.template), was = doc.sheet.background;
      change(d => applyTemplate(d, next));
      say(`Layout: ${next.name}${doc.sheet.background !== was ? (doc.sheet.background === 'transparent' ? '. Paper: none (transparent outside the shape)' : '. Paper back on') : ''}`);
    };
    for (const list of lists) list.addEventListener('click', event => { const option = event.target.closest('[data-template]'); if (option) { pickTemplate(option); option.focus(); } });
    for (const list of lists) list.addEventListener('keydown', event => {
      const options = [...list.querySelectorAll('[data-template]')], index = options.indexOf(document.activeElement);
      const target = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: options.length - 1 }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      const option = options[Math.max(0, Math.min(options.length - 1, target))];
      option.focus(); option.scrollIntoView({ block: 'nearest', inline: 'nearest' }); pickTemplate(option);
    });
    radioGroup(aspects, '[data-aspect]', button => {
      const [, w, h] = ASPECTS.find(([label]) => label === button.dataset.aspect);
      change(d => { d.aspect = { w, h }; d.aspectChoice = { w, h }; d.aspectAuto = false; });
    });
    radioGroup(paper, '[data-paper]', button => {
      const none = button.dataset.paper === 'none';
      change(d => { d.sheet.background = none ? 'transparent' : 'paper'; delete d.sheet.autoTransparent; delete d.paper.auto; if (!none) d.paper.color = button.dataset.paper; });
      say(none ? 'Paper: none. The background is transparent in PNG and WebP.' : `Paper: ${button.title}`);
    });
    // Preview backdrop behind a transparent sheet (never exported); remembered on this device.
    radioGroup(backdrops, '[data-backdrop]', button => { backdrop = button.dataset.backdrop; try { localStorage.setItem(BACKDROP_KEY, backdrop); } catch { /* this visit only */ } syncBackdrop(); });
    // Sliders: live while dragging or holding a key, one undo step per gesture (committed on change).
    for (const [key, input] of Object.entries(sliders)) {
      const spec = SPACING[key];
      Object.assign(input, { min: spec.min * 100, max: spec.max * 100, step: spec.step * 100 });
      const begin = () => { slider ||= cloneDoc(doc); };
      input.addEventListener('pointerdown', begin); input.addEventListener('focus', begin);
      input.addEventListener('input', () => { begin(); doc[key] = Number(input.value) / 100; syncSliders(); draw(); });
      input.addEventListener('change', () => { if (slider) commit(slider); slider = cloneDoc(doc); });
      input.addEventListener('blur', () => { slider = null; });
    }
    buildSticker();
    buildPrints();
    buildSlotPanel();
    byId('collageResetTransforms').addEventListener('click', () => {
      change(resetTransforms);
      say('Photo and print transformations reset');
    });
    buildTextPanel();
    buildFilmPanel();
  }

  function buildFilmPanel() {
    radioGroup(filmUi.base, '[data-film-base]', button => change(d => { d.film = { ...filmSettings(d.film), base: button.dataset.filmBase }; }));
    const field = (input, key, read = value => value) => input.addEventListener('change', () => change(d => { d.film = { ...filmSettings(d.film), [key]: read(input.value) }; }));
    field(filmUi.stock, 'stockText', value => value.trim() || DEFAULT_FILM.stockText); field(filmUi.date, 'date');
    field(filmUi.start, 'startNumber', value => clamp(Number(value) || 0, 0, 99.5)); field(filmUi.mark, 'mark');
    field(filmUi.frame, 'markFrame', value => clamp(Math.round(Number(value) || 1), 1, slotCount(template())));
  }
  function syncFilmPanel() {
    const film = filmSettings(doc.film), count = slotCount(template());
    syncRadios(filmUi.base, 'data-film-base', film.base); filmUi.stock.value = film.stockText; filmUi.date.value = film.date;
    filmUi.start.value = film.startNumber; filmUi.mark.value = film.mark; filmUi.frame.max = count; filmUi.frame.value = clamp(film.markFrame, 1, count); filmUi.frame.disabled = film.mark === 'none';
  }

  // ---------- Text and captions ----------
  const selectedText = () => doc?.text.find(text => text.id === textUi.selected) || null;
  const newText = (content, target = 'sheet', extra = {}) => ({ id: `ct${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, content, target,
    font: 'inter', size: .08, color: '#ffffff', x: .5, y: .85, align: 'center', bold: true, italic: false, shadow: true, opacity: 1, ...extra });
  function addTextLayer(text) { change(d => d.text.push(text)); textUi.selected = text.id; syncTextPanel(); textUi.content.focus(); textUi.content.select(); }
  function updateText(mutator) { const id = textUi.selected; if (!id) return; change(d => { const text = d.text.find(layer => layer.id === id); if (text) mutator(text); }); }
  function finishLiveText() { clearTimeout(textUi.timer); if (textUi.start) commit(textUi.start); textUi.start = null; }
  function liveText(mutator) {
    const text = selectedText(); if (!text) return;
    textUi.start ||= cloneDoc(doc); mutator(text); syncTextPanel(); scheduleDraw();
    clearTimeout(textUi.timer); textUi.timer = setTimeout(finishLiveText, 450);
  }
  function buildTextPanel() {
    textUi.fonts.innerHTML = deps.textFonts.map(([id, name, stack]) => `<button type="button" role="radio" class="text-font-option" data-font="${id}" aria-checked="false" style="--preview-font:${stack}">${name}</button>`).join('');
    byId('collageAddText').addEventListener('click', () => addTextLayer(newText('Your text')));
    byId('collageSharedCaption').addEventListener('click', () => addTextLayer(newText('Your caption', 'sheet', { y: .92, size: .055 })));
    byId('collageDateText').addEventListener('click', () => { const date = new Date(); addTextLayer(newText(date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), 'sheet', { x: .92, y: .94, size: .035, align: 'right', bold: false })); });
    byId('collageSlotCaptions').addEventListener('click', () => {
      const layers = doc.slots.slice(0, slotCount(template())).map((slot, index) => newText(`Photo ${index + 1}`, slot.id, { y: .5, size: .18, color: '#111110', bold: false, shadow: false, caption: true }));
      const previous = cloneDoc(doc); doc.text.push(...layers); if (layers.length) textUi.selected = layers[0].id; commit(previous); refresh(); say(`${plural(layers.length, 'slot caption')} added`);
    });
    textUi.layers.addEventListener('click', event => { const button = event.target.closest('[data-text-layer]'); if (button) { finishLiveText(); textUi.selected = button.dataset.textLayer; syncTextPanel(); } });
    textUi.content.addEventListener('change', finishLiveText); textUi.size.addEventListener('change', finishLiveText); textUi.color.addEventListener('change', finishLiveText);
    textUi.content.addEventListener('input', () => liveText(text => { text.content = textUi.content.value; }));
    textUi.target.addEventListener('change', () => updateText(text => { text.target = textUi.target.value; text.caption = text.target !== 'sheet' && Boolean(view.layout?.slots[doc.slots.findIndex(slot => slot.id === text.target)]?.caption); text.x = .5; text.y = text.caption ? .5 : .85; }));
    textUi.size.addEventListener('input', () => liveText(text => { text.size = Number(textUi.size.value) / 100; }));
    textUi.color.addEventListener('input', () => liveText(text => { text.color = textUi.color.value; }));
    radioGroup(textUi.fonts, '[data-font]', button => updateText(text => { text.font = button.dataset.font; }));
    radioGroup(textUi.align, '[data-align]', button => updateText(text => { text.align = button.dataset.align; }));
    textUi.editor.addEventListener('click', event => { const button = event.target.closest('[data-collage-text-toggle]'); if (button) updateText(text => { const key = button.dataset.collageTextToggle; text[key] = !text[key]; }); });
    textUi.outside.addEventListener('change', () => updateText(text => { text.outsideShape = textUi.outside.checked; }));
    byId('collageDeleteText').addEventListener('click', () => { const id = textUi.selected, index = doc.text.findIndex(text => text.id === id); if (index < 0) return; change(d => d.text.splice(index, 1)); textUi.selected = doc.text[Math.min(index, doc.text.length - 1)]?.id || null; syncTextPanel(); });
    document.fonts.ready.then(scheduleDraw);
  }
  function syncTextPanel() {
    if (!doc.text.some(text => text.id === textUi.selected)) textUi.selected = doc.text.at(-1)?.id || null;
    const text = selectedText(), count = slotCount(template());
    textUi.layers.innerHTML = doc.text.map((layer, index) => `<button type="button" role="radio" class="chip" data-text-layer="${layer.id}" aria-checked="${layer.id === textUi.selected}" tabindex="${layer.id === textUi.selected ? 0 : -1}">${escapeHtml((layer.content.split('\n')[0].trim() || `Text ${index + 1}`).slice(0, 24))}</button>`).join('');
    textUi.layers.hidden = doc.text.length < 2; textUi.empty.hidden = Boolean(doc.text.length); textUi.editor.hidden = !text;
    if (!text) return;
    if (document.activeElement !== textUi.content) textUi.content.value = text.content;
    textUi.target.innerHTML = `<option value="sheet">Whole sheet</option>${doc.slots.slice(0, count).map((slot, i) => `<option value="${slot.id}">Slot ${i + 1}</option>`).join('')}`; textUi.target.value = text.target;
    syncRadios(textUi.fonts, 'data-font', text.font); syncRadios(textUi.align, 'data-align', text.align);
    textUi.size.value = text.size * 100; byId('collageTextSizeOutput').value = `${Number((text.size * 100).toFixed(1))}%`; textUi.color.value = text.color;
    textUi.color.closest('.text-custom-color').style.setProperty('--custom-color', text.color);
    textUi.editor.querySelectorAll('[data-collage-text-toggle]').forEach(button => { button.setAttribute('aria-pressed', Boolean(text[button.dataset.collageTextToggle])); button.disabled = text.font === 'playfair' && button.dataset.collageTextToggle !== 'shadow'; });
    const shaped = template().kind === 'shaped'; textUi.outsideRow.hidden = !shaped; textUi.outside.checked = Boolean(text.outsideShape);
    textUi.contrast.hidden = doc.sheet.background !== 'transparent';
  }
  /** Switches the document to template `next`: shapes start transparent (paper comes back when leaving them, unless
   *  the user chose it); styles bring their own paper colour (the default comes back when leaving them, unless the
   *  user chose one); proportional shapes size the sheet to themselves, other layouts get the user's aspect back. */
  function applyTemplate(d, next) {
    const shaped = next.kind === 'shaped', was = templateById(d.templateId);
    if (was?.id !== next.id) {
      d.splits = null; // dividers start where the new layout puts them
      resetTransforms(d); // framing and scrapbook placement belong to the previous layout
    }
    if (was && was.kind !== next.kind) d.border = null; // grid borders and print borders don't carry over
    d.templateId = next.id;
    if (next.kind === 'contact') d.film = filmSettings(d.film);
    if (shaped && d.sheet.background === 'paper' && !d.sheet.autoTransparent) { d.sheet.background = 'transparent'; d.sheet.autoTransparent = true; }
    if (!shaped && d.sheet.autoTransparent) { d.sheet.background = 'paper'; delete d.sheet.autoTransparent; }
    if (next.paper && (d.paper.auto || d.paper.color === deps.paperColors[0].hex)) { d.paper.color = next.paper; d.paper.auto = true; }
    else if (!next.paper && d.paper.auto) { d.paper.color = deps.paperColors[0].hex; delete d.paper.auto; }
    fitAspect(d, next);
    fitSlots(d, slotCount(next));
    d.paper.texture = next.texture || 'none';
  }
  function fitAspect(d, t) {
    if (t.lockAspect) d.aspect = paddedAspect(t.aspect[0] / t.aspect[1], stickerPad(d.sheet));
    else if (d.aspectAuto || !d.aspectChoice) d.aspect = { w: t.aspect[0], h: t.aspect[1] };
    else d.aspect = { ...d.aspectChoice };
  }
  // Collage-only papers (from the owner's reference layouts), after the frame papers.
  const papers = [...deps.paperColors, ...COLLAGE_PAPERS];
  const borderOf = d => d.border || templateById(d.templateId)?.border || { width: 0, color: '#ffffff' }; // grids: off
  /** Borders: around prints (styles) or photos (grids): width (live, one undo step per gesture) and colour; and, for
   *  grids, caption space under each photo. */
  function buildPrints() {
    prints.colors.innerHTML = outlineColors.map(([hex, name]) => `<button type="button" role="radio" class="paper-swatch" data-border="${hex}" aria-checked="false" aria-label="${name}" title="${name}" style="--swatch:${hex}"></button>`).join('');
    const input = prints.border, begin = () => { slider ||= cloneDoc(doc); };
    input.addEventListener('pointerdown', begin); input.addEventListener('focus', begin);
    input.addEventListener('input', () => { begin(); doc.border = { ...borderOf(doc), width: Number(input.value) / 100 }; syncPrints(); draw(); });
    input.addEventListener('change', () => { if (slider) commit(slider); slider = cloneDoc(doc); say(doc.border.width ? `Border ${input.value}%` : 'Border off'); });
    input.addEventListener('blur', () => { slider = null; });
    radioGroup(prints.colors, '[data-border]', button => {
      change(d => { d.border = { ...borderOf(d), color: button.dataset.border }; if (!d.border.width) d.border.width = .005; });
      say(`Border: ${button.title}`);
    });
    prints.caption.addEventListener('change', () => {
      const on = prints.caption.checked;
      change(d => { d.captionSpace = on; });
      say(on ? 'Space for captions added under each photo' : 'Caption space removed');
    });
  }
  function syncPrints() {
    const border = borderOf(doc), value = Math.round(border.width * 1000) / 10;
    prints.border.value = value; prints.output.value = border.width ? `${value}%` : 'Off';
    syncRadios(prints.colors, 'data-border', border.color);
    prints.caption.checked = Boolean(doc.captionSpace);
  }
  const outlineOf = d => d.sheet.outline || { width: 0, color: outlineColors[0][0] };
  const outlineColors = [['#ffffff', 'White'], ...deps.paperColors.filter(color => color.id !== 'bright').map(color => [color.hex, color.name])]; // pure white replaces the near-white paper
  /** Sticker options for shaped sheets: outline width (live, one undo step per gesture) and colour, soft shadow. */
  function buildSticker() {
    sticker.colors.innerHTML = outlineColors.map(([hex, name]) => `<button type="button" role="radio" class="paper-swatch" data-outline="${hex}" aria-checked="false" aria-label="${name}" title="${name}" style="--swatch:${hex}"></button>`).join('');
    const input = sticker.outline, begin = () => { slider ||= cloneDoc(doc); };
    input.addEventListener('pointerdown', begin); input.addEventListener('focus', begin);
    input.addEventListener('input', () => {
      begin(); doc.sheet.outline = { ...outlineOf(doc), width: Number(input.value) / 100 };
      fitAspect(doc, template()); syncSticker(); draw();
    });
    input.addEventListener('change', () => { if (slider) commit(slider); slider = cloneDoc(doc); say(doc.sheet.outline.width ? `Outline ${input.value}%` : 'Outline off'); });
    input.addEventListener('blur', () => { slider = null; });
    radioGroup(sticker.colors, '[data-outline]', button => {
      change(d => { d.sheet.outline = { ...outlineOf(d), color: button.dataset.outline }; if (!d.sheet.outline.width) d.sheet.outline.width = .015; fitAspect(d, template()); });
      say(`Outline: ${button.title}`);
    });
    sticker.shadow.addEventListener('change', () => {
      const on = sticker.shadow.checked;
      change(d => { d.sheet.shadow = on; fitAspect(d, template()); });
      say(on ? 'Soft shadow on (PNG and WebP)' : 'Soft shadow off');
    });
  }
  function syncSticker() {
    const outline = outlineOf(doc), percentValue = Math.round(outline.width * 10000) / 100;
    sticker.outline.value = percentValue; sticker.output.value = outline.width ? `${percentValue}%` : 'Off';
    syncRadios(sticker.colors, 'data-outline', outline.color);
    sticker.shadow.checked = Boolean(doc.sheet.shadow);
  }

  // ---------- Slot editing: the selected slot's photo (panel) ----------
  const slotFill = () => (selected == null ? null : doc.slots[selected]);
  const slotPhoto = () => deps.photoById(slotFill()?.photoId);
  /** Changes the selected slot's framing as one undo step; `message` goes to the status line. */
  function editFill(mutate, message) {
    if (selected == null || !slotPhoto()) return;
    const index = selected;
    change(d => { const slot = d.slots[index]; mutate(slot); Object.assign(slot, normalizeFill(slot)); });
    if (message) say(typeof message === 'function' ? message(doc.slots[index]) : message);
  }
  /** Puts photo `id` in the selected slot; if it is already in another slot, the two swap. */
  function placePhoto(id) {
    if (selected == null) return;
    const index = selected, other = doc.slots.findIndex((slot, i) => slot.photoId === id && i !== index), photo = deps.photoById(id);
    change(d => { if (other >= 0) swapSlots(d, index, other); else { d.slots[index].photoId = id; resetFraming(d.slots[index]); } });
    say(other >= 0 && other < slotCount(template()) ? `${photo.name} swapped with slot ${other + 1}` : `${photo.name} in slot ${index + 1}`);
  }
  function buildSlotPanel() {
    // Zoom and angle: live while dragging, one undo step per gesture.
    for (const input of [slotUi.zoom, slotUi.angle]) {
      const key = input.dataset.fill, begin = () => { slider ||= cloneDoc(doc); };
      input.addEventListener('pointerdown', begin); input.addEventListener('focus', begin);
      input.addEventListener('input', () => {
        const slot = slotFill(); if (!slot) return;
        begin(); slot[key] = key === 'zoom' ? Number(input.value) / 100 : Number(input.value);
        Object.assign(slot, normalizeFill(slot)); syncFillValues(); scheduleDraw();
      });
      input.addEventListener('change', () => { if (slider) commit(slider); slider = cloneDoc(doc); });
      input.addEventListener('blur', () => { slider = null; });
    }
    slotUi.rotate.addEventListener('click', () => editFill(slot => { slot.rotate += 90; }, slot => `Rotated to ${slot.rotate}°`));
    slotUi.flip.addEventListener('click', () => editFill(slot => { slot.flip = !slot.flip; }, slot => (slot.flip ? 'Flipped' : 'Not flipped')));
    slotUi.reset.addEventListener('click', () => editFill(resetFraming, 'Framing reset'));
    slotUi.move.addEventListener('change', () => moveTo(Number(slotUi.move.value)));
    radioGroup(slotUi.photos, '[data-photo]', button => placePhoto(Number(button.dataset.photo)));
    slotUi.empty.addEventListener('click', emptySelected);
    slotUi.edit.addEventListener('click', () => { const photo = slotPhoto(); if (photo) deps.editPhoto(photo.id); });
    slotUi.add.addEventListener('click', () => slotUi.file.click());
    radioGroup(slotUi.dragMode, '[data-drag-mode]', button => {
      freeDragMode = button.dataset.dragMode;
      syncRadios(slotUi.dragMode, 'data-drag-mode', freeDragMode);
      say(freeDragMode === 'pan' ? 'Drag moves the photo' : 'Drag moves the print');
    });
    slotUi.file.addEventListener('change', async () => {
      const files = [...slotUi.file.files]; slotUi.file.value = '';
      if (selected == null || !files.length) return;
      const index = selected, added = await deps.addFiles(files);
      if (!active || !added.length) return;
      // The first new photo goes in this slot, the rest into empty slots after it.
      const count = slotCount(template()), empties = doc.slots.map((slot, i) => i).filter(i => i > index && i < count && !deps.photoById(doc.slots[i].photoId));
      const placed = [index, ...empties].slice(0, added.length);
      change(d => placed.forEach((i, n) => { d.slots[i].photoId = added[n].id; resetFraming(d.slots[i]); }));
      const extra = added.length - placed.length;
      say(`${plural(placed.length, 'photo')} added${extra ? `; ${extra} more in the strip` : ''}`);
    });
    const beginLayout = () => { slider ||= cloneDoc(doc); };
    slotUi.layoutRotate.addEventListener('pointerdown', beginLayout); slotUi.layoutRotate.addEventListener('focus', beginLayout);
    slotUi.layoutRotate.addEventListener('input', () => {
      if (selected == null) return; beginLayout(); const item = template().slots[selected], fill = doc.slots[selected]; fill.layout ||= {};
      let angle = Number(slotUi.layoutRotate.value); if (Math.abs(angle) <= 2) angle = 0; fill.layout.rotate = angle; syncFreeValues(); scheduleDraw();
    });
    slotUi.layoutRotate.addEventListener('change', () => { if (slider) commit(slider); slider = cloneDoc(doc); });
    slotUi.layoutRotate.addEventListener('blur', () => { slider = null; });
    const reorder = delta => {
      if (selected == null || template().kind !== 'free') return;
      change(d => { const zs = view.layout.slots.map(s => s.z), current = view.layout.slots[selected].z, target = delta > 0 ? Math.max(...zs) + 1 : Math.min(...zs) - 1; (d.slots[selected].layout ||= {}).z = target; });
      say(delta > 0 ? 'Brought forward' : 'Sent back');
    };
    slotUi.forward.addEventListener('click', () => reorder(1)); slotUi.back.addEventListener('click', () => reorder(-1));
  }
  function moveTo(target) {
    if (selected == null || target === selected || !(target >= 0)) return;
    const from = selected;
    change(d => swapSlots(d, from, target));
    selected = target; refresh(); say(`Moved to slot ${target + 1}`);
  }
  function emptySelected() {
    if (selected == null || !slotPhoto()) return;
    const index = selected;
    change(d => { d.slots[index].photoId = null; resetFraming(d.slots[index]); });
    say(`Slot ${index + 1} emptied`);
  }
  function syncFillValues() {
    const slot = slotFill(); if (!slot) return;
    slotUi.zoom.value = Math.round(slot.zoom * 100); byId('collageZoomOutput').value = `${Math.round(slot.zoom * 100)}%`;
    slotUi.angle.value = slot.angle; byId('collageAngleOutput').value = `${slot.angle}°`;
    slotUi.flip.setAttribute('aria-pressed', slot.flip);
  }
  function syncFreeValues() {
    if (selected == null || template().kind !== 'free') return;
    const angle = doc.slots[selected].layout?.rotate ?? template().slots[selected].rotate ?? 0;
    slotUi.layoutRotate.value = angle; slotUi.layoutRotateOutput.value = `${angle}°`;
  }
  function syncSlotPanel() {
    const count = slotCount(template());
    slotUi.stageTools.hidden = template().kind !== 'free';
    if (selected != null && selected >= count) selected = null;
    const slot = slotFill(), photo = slotPhoto();
    slotUi.tools.hidden = selected == null; slotUi.hint.hidden = selected != null;
    slotUi.title.textContent = selected == null ? 'Photo' : `Slot ${selected + 1} · ${photo ? photo.name : 'empty'}`;
    if (selected == null) return;
    slotUi.free.hidden = template().kind !== 'free'; syncFreeValues();
    slotUi.photoTools.hidden = !photo; slotUi.edit.hidden = !photo; slotUi.empty.hidden = !photo;
    syncFillValues();
    slotUi.move.innerHTML = doc.slots.slice(0, count).map((s, i) => `<option value="${i}"${i === selected ? ' selected' : ''}>Slot ${i + 1} · ${escapeHtml(deps.photoById(s.photoId)?.name || 'empty')}</option>`).join('');
    const photos = deps.photos(), key = photos.map(p => p.id).join();
    if (key !== photosKey) {
      photosKey = key;
      slotUi.photos.replaceChildren(...photos.map(p => {
        const button = document.createElement('button');
        Object.assign(button, { type: 'button', className: 'collage-photo', title: p.name });
        button.setAttribute('role', 'radio'); button.dataset.photo = p.id; button.setAttribute('aria-label', p.name);
        const thumb = document.createElement('canvas'); thumb.width = thumb.height = 112; thumb.setAttribute('aria-hidden', 'true');
        coverThumb(thumb, p.preview || p.thumb); button.append(thumb);
        return button;
      }));
    }
    syncRadios(slotUi.photos, 'data-photo', String(slot.photoId));
  }
  function coverThumb(canvas, source) {
    if (!source) return;
    const ctx = canvas.getContext('2d'), scale = Math.max(canvas.width / source.width, canvas.height / source.height);
    ctx.drawImage(source, (canvas.width - source.width * scale) / 2, (canvas.height - source.height * scale) / 2, source.width * scale, source.height * scale);
  }
  function radioGroup(group, selector, pick) {
    group.addEventListener('click', event => { const button = event.target.closest(selector); if (button && button.getAttribute('aria-checked') !== 'true') pick(button); });
    group.addEventListener('keydown', event => {
      const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]; if (!delta) return;
      const buttons = [...group.querySelectorAll(selector)], next = buttons[(Math.max(0, buttons.indexOf(document.activeElement)) + delta + buttons.length) % buttons.length];
      event.preventDefault(); next.focus(); pick(next);
    });
  }
  function syncRadios(group, attribute, value) {
    const buttons = [...group.querySelectorAll(`[${attribute}]`)];
    buttons.forEach(button => { const on = button.getAttribute(attribute) === value; button.setAttribute('aria-checked', on); button.tabIndex = on ? 0 : -1; });
    if (!buttons.some(button => button.tabIndex === 0)) buttons[0].tabIndex = 0;
  }
  function syncBackdrop() {
    const transparent = doc?.sheet.background === 'transparent';
    backdropRow.hidden = !transparent;
    syncRadios(backdrops, 'data-backdrop', backdrop);
    sheetEl.dataset.backdrop = transparent ? backdrop : '';
  }
  function syncSliders() {
    for (const [key, input] of Object.entries(sliders)) {
      input.value = Math.round(doc[key] * 1000) / 10;
      panel.querySelector(`output[for="${input.id}"]`).value = percent(doc[key]);
    }
  }
  function syncPanel() {
    const t = template(), aspect = ASPECTS.find(([, w, h]) => w === doc.aspect.w && h === doc.aspect.h);
    for (const list of lists) {
      const options = [...list.querySelectorAll('[data-template]')];
      for (const option of options) {
        const selected = option.dataset.template === t.id;
        option.setAttribute('aria-selected', selected); option.tabIndex = selected ? 0 : -1;
      }
      if (!options.some(option => option.tabIndex === 0)) options[0].tabIndex = 0; // each listbox stays reachable
    }
    syncRadios(aspects, 'data-aspect', aspect && !t.lockAspect ? aspect[0] : '');
    aspects.querySelectorAll('[data-aspect]').forEach(button => { button.disabled = Boolean(t.lockAspect); });
    aspectHint.hidden = !t.lockAspect;
    const shaped = t.kind === 'shaped', free = t.kind === 'free', contact = t.kind === 'contact';
    sticker.box.hidden = !shaped; filmUi.box.hidden = !contact; radiusRow.hidden = shaped || free || contact; prints.box.hidden = shaped || contact; gutterRow.hidden = free;
    prints.title.textContent = free ? 'Prints' : 'Borders'; prints.captionRow.hidden = prints.captionHint.hidden = free;
    marginRow.hidden = free || (shaped && doc.sheet.background === 'transparent'); // a shape's margin is a paper rim
    if (shaped) syncSticker();
    if (!shaped) syncPrints();
    if (contact) syncFilmPanel();
    syncRadios(paper, 'data-paper', doc.sheet.background === 'transparent' ? 'none' : doc.paper.color);
    syncBackdrop();
    syncSliders();
    syncSlotPanel();
    syncTextPanel();
    drawThumbs();
    const filled = doc.slots.slice(0, slotCount(t)).filter(slot => deps.photoById(slot.photoId)).length;
    document.getElementById('collageCount').textContent = `${filled} of ${plural(slotCount(t), 'photo')}`;
    canvas.setAttribute('aria-label', `Collage preview: ${t.name} layout, ${filled} of ${plural(slotCount(t), 'slot')} filled, ${t.lockAspect ? 'shaped' : aspect ? aspect[0] : `${doc.aspect.w}:${doc.aspect.h}`} sheet`);
  }
  /** Layout thumbnails at the current sheet aspect (shapes at their own), in the panel's token colours. A checkerboard
   *  shows where the sheet is transparent: around every shape, and between the slots with Paper: none. */
  function drawThumbs() {
    const style = getComputedStyle(document.documentElement), sheetColor = style.getPropertyValue('--line-strong').trim(), slotColor = style.getPropertyValue('--text-muted').trim();
    const checkerLight = style.getPropertyValue('--raised').trim(), transparent = doc.sheet.background === 'transparent';
    const dpr = Math.min(2, devicePixelRatio || 1), box = 52;
    for (const list of lists) for (const option of list.querySelectorAll('[data-template]')) {
      const t = templateById(option.dataset.template), shaped = t.kind === 'shaped', a = shaped ? t.aspect[0] / t.aspect[1] : doc.aspect.w / doc.aspect.h;
      const w = Math.round((a >= 1 ? box : box * a) * dpr), h = Math.round((a >= 1 ? box / a : box) * dpr);
      const thumb = option.querySelector('canvas'), layout = layoutTemplate(t, w, h, { gutter: .06, margin: shaped ? 0 : .06, border: t.kind === 'free' ? { width: 1.5 * dpr / Math.min(w, h), color: checkerLight } : null });
      thumb.width = w; thumb.height = h; thumb.style.width = `${w / dpr}px`; thumb.style.height = `${h / dpr}px`;
      const ctx = thumb.getContext('2d');
      if (transparent || shaped) {
        const cell = Math.max(2, Math.round(4 * dpr));
        ctx.fillStyle = checkerLight; ctx.fillRect(0, 0, w, h); ctx.fillStyle = sheetColor;
        for (let y = 0; y < h; y += cell) for (let x = (y / cell) % 2 ? cell : 0; x < w; x += cell * 2) ctx.fillRect(x, y, cell, cell);
      }
      if (!transparent) { ctx.fillStyle = sheetColor; if (shaped) ctx.fill(sheetPath(layout.paper), 'evenodd'); else ctx.fillRect(0, 0, w, h); }
      ctx.fillStyle = slotColor;
      for (const s of drawOrder(layout)) {
        if (shaped) { ctx.fill(visiblePath(s), 'evenodd'); continue; }
        const path = slotPath(s); ctx.fill(path);
        if (s.border) { ctx.strokeStyle = s.border.color; ctx.lineWidth = s.border.width; ctx.stroke(path); } // overlapping prints stay apart
      }
    }
  }
  /** A shaped slot's visible part (less the hole) as a Path2D, in the layout's px; fill with 'evenodd'. */
  function visiblePath(slot, offsetX = 0, offsetY = 0, k = 1) {
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
  function visibleCss(slot, k) {
    const ring = poly => `M ${poly.map((v, i) => ((v - (i % 2 ? slot.y : slot.x)) / k).toFixed(1)).join(' ').replace(/^(\S+ \S+)/, '$1 L')} Z`;
    return [slot.visible, slot.holeVisible].filter(poly => poly?.length >= 6).map(ring).join(' ');
  }

  // ---------- Stage ----------
  function scheduleDraw() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); }
  /** Sizes the canvas to the stage (device pixels) and composites the collage. */
  function draw() {
    if (!active) return;
    const style = getComputedStyle(stage), availW = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availH = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (availW <= 0 || availH <= 0) return;
    const a = doc.aspect.w / doc.aspect.h, cssW = Math.min(availW, availH * a), cssH = cssW / a;
    const dpr = devicePixelRatio || 1, scale = Math.min(dpr, 2400 / Math.max(cssW, cssH));
    const width = Math.max(1, Math.round(cssW * scale)), height = Math.max(1, Math.round(cssH * scale));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    const layout = layoutTemplate(template(), width, height, doc);
    const ctx = canvas.getContext('2d');
    drawCollage(ctx, doc, layout, imageOf, { captionHint: 'rgba(128,128,128,.45)', fontFor: deps.textFont });
    view = { layout, k: width / cssW };
    syncDividers();
    if (layout.slots.some(slot => slot.visible)) drawShapedHighlight(ctx, layout);
    syncSlots();
  }
  /** Shaped slots can't use the CSS box ring (their boxes are clipped to the slot's shape): the selected slot and the
   *  drop target get a 3 px accent ring inside their visible outline on the preview canvas (never exported). */
  function drawShapedHighlight(ctx, layout) {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), k = view.k;
    for (const index of new Set([selected, gesture?.mode === 'swap' ? gesture.target : null])) {
      const slot = index == null ? null : layout.slots[index]; if (!slot) continue;
      const path = visiblePath(slot);
      ctx.save(); ctx.clip(path, 'evenodd'); ctx.strokeStyle = accent; ctx.lineWidth = 6 * k; ctx.lineJoin = 'round'; ctx.stroke(path); ctx.restore();
    }
  }
  // ---------- Dividers: diptych / triptych track sizes (Task 6) ----------
  const currentSplits = () => { const t = template(), n = splitAxis(t) === 'x' ? t.cols.length : t.rows.length; return clampSplits(doc.splits, n) || defaultSplits(t); };
  /** Share (%) of each photo either side of divider i, for the status line and screen readers. */
  function shares(splits, i) { const at = k => (k < 0 ? 0 : k >= splits.length ? 1 : splits[k]); return [at(i) - at(i - 1), at(i + 1) - at(i)].map(v => Math.round(v * 100)); }
  function syncDividers() {
    const { layout, k } = view, axis = layout.axis, splits = axis ? currentSplits() : [];
    while (dividersEl.children.length > splits.length) dividersEl.lastElementChild.remove();
    while (dividersEl.children.length < splits.length) {
      const handle = document.createElement('div');
      handle.className = 'collage-divider'; handle.setAttribute('role', 'separator'); handle.tabIndex = 0;
      handle.dataset.divider = dividersEl.children.length; dividersEl.append(handle);
    }
    splits.forEach((split, i) => {
      const handle = dividersEl.children[i], tracks = axis === 'x' ? layout.cols : layout.rows, across = axis === 'x' ? layout.rows : layout.cols;
      const at = (tracks[i].start + tracks[i].size + layout.gutter / 2) / k, from = across[0].start / k, to = (across.at(-1).start + across.at(-1).size) / k;
      Object.assign(handle.style, axis === 'x' ? { left: `${at}px`, top: `${from}px`, height: `${to - from}px`, width: '', marginTop: '' } : { top: `${at}px`, left: `${from}px`, width: `${to - from}px`, height: '', marginLeft: '' });
      const [a, b] = shares(splits, i), lo = Math.round(((i ? splits[i - 1] : 0) + .15) * 100), hi = Math.round(((i < splits.length - 1 ? splits[i + 1] : 1) - .15) * 100);
      handle.setAttribute('aria-orientation', axis === 'x' ? 'vertical' : 'horizontal');
      handle.setAttribute('aria-label', `Divider between photos ${i + 1} and ${i + 2}`);
      handle.setAttribute('aria-valuemin', lo); handle.setAttribute('aria-valuemax', hi); handle.setAttribute('aria-valuenow', Math.round(split * 100));
      handle.setAttribute('aria-valuetext', `Photo ${i + 1} ${a}%, photo ${i + 2} ${b}%`);
    });
  }
  /** Divider position (0–1 of the room) under a client point. */
  function splitAt(i, clientX, clientY) {
    const { layout, k } = view, box = canvas.getBoundingClientRect(), x = layout.axis === 'x';
    const p = ((x ? clientX - box.left : clientY - box.top)) * k, length = x ? layout.width : layout.height, n = (x ? layout.cols : layout.rows).length;
    const room = length - 2 * layout.margin - (n - 1) * layout.gutter;
    return (p - layout.gutter / 2 - layout.margin - i * layout.gutter) / room;
  }
  let drag = null;
  dividersEl.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-divider]'); if (!handle || event.button > 0) return;
    event.preventDefault(); handle.focus({ preventScroll: true });
    try { handle.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    drag = { i: Number(handle.dataset.divider), start: cloneDoc(doc), handle, id: event.pointerId }; handle.classList.add('is-dragging');
  });
  dividersEl.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    doc.splits = moveSplit(currentSplits(), drag.i, splitAt(drag.i, event.clientX, event.clientY)); scheduleDraw();
  });
  const endDrag = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const { i, start, handle } = drag; drag = null; handle.classList.remove('is-dragging');
    commit(start); refresh(); const [a, b] = shares(currentSplits(), i); say(`Photo ${i + 1} ${a}%, photo ${i + 2} ${b}%`);
  };
  dividersEl.addEventListener('pointerup', endDrag); dividersEl.addEventListener('pointercancel', endDrag);
  // Keys: arrows move the focused divider 1 % (Shift: 5 %), Home/End to its limits; one undo step per key press.
  dividersEl.addEventListener('keydown', event => {
    const handle = event.target.closest('[data-divider]'); if (!handle) return;
    const i = Number(handle.dataset.divider), step = event.shiftKey ? .05 : .01, splits = currentSplits();
    const delta = { ArrowLeft: -step, ArrowUp: -step, ArrowRight: step, ArrowDown: step, Home: -1, End: 1 }[event.key]; if (delta === undefined) return;
    event.preventDefault();
    change(d => { d.splits = moveSplit(splits, i, splits[i] + delta); });
    const [a, b] = shares(currentSplits(), i); say(`Photo ${i + 1} ${a}%, photo ${i + 2} ${b}%`);
  });

  const imageOf = index => cache.get(doc.slots[index]?.photoId)?.image || null;

  // ---------- Slots on the stage: a listbox of focusable boxes over the canvas ----------
  function syncSlots() {
    const { layout, k } = view, count = layout.slots.length;
    while (slotsEl.children.length > count) slotsEl.lastElementChild.remove();
    while (slotsEl.children.length < count) {
      const option = document.createElement('div');
      option.className = 'collage-slot'; option.setAttribute('role', 'option'); option.dataset.slot = slotsEl.children.length;
      option.innerHTML = '<span class="collage-slot-empty" aria-hidden="true">+<span class="collage-slot-empty-word">&nbsp;Add photo</span></span>';
      slotsEl.append(option);
    }
    layout.slots.forEach((slot, i) => {
      const option = slotsEl.children[i], photo = deps.photoById(doc.slots[i]?.photoId);
      Object.assign(option.style, { left: `${slot.x / k}px`, top: `${slot.y / k}px`, width: `${slot.w / k}px`, height: `${slot.h / k}px`, borderRadius: `${slot.radius / k}px`, zIndex: slot.z + 1, transform: slot.rotate ? `rotate(${slot.rotate}deg)` : '' });
      // Shaped slots: the box is clipped to the slot's visible part, so taps outside the shape (and in the hole) miss it.
      const shaped = Boolean(slot.visible);
      option.classList.toggle('is-shaped', shaped);
      option.style.clipPath = shaped && !slot.rotate ? `path(evenodd, "${visibleCss(slot, k)}")` : '';
      if (shaped) { const [cx, cy] = polygonCentroid(slot.visible); option.style.setProperty('--cx', `${(cx - slot.x) / k}px`); option.style.setProperty('--cy', `${(cy - slot.y) / k}px`); }
      option.setAttribute('aria-selected', i === selected); option.tabIndex = i === (selected ?? 0) ? 0 : -1;
      option.classList.toggle('is-empty', !photo);
      option.classList.toggle('is-drop-target', gesture?.mode === 'swap' && gesture.target === i);
      option.classList.toggle('is-dragged', gesture?.mode === 'swap' && gesture.index === i);
      option.classList.toggle('is-free', template().kind === 'free');
      if (template().kind === 'free' && i === selected && !option.querySelector('.collage-rotate-handle')) option.insertAdjacentHTML('beforeend', '<button class="collage-rotate-handle" type="button" aria-label="Rotate print" title="Drag to rotate"></button>');
      else if (!(template().kind === 'free' && i === selected)) option.querySelector('.collage-rotate-handle')?.remove();
      option.setAttribute('aria-label', `Slot ${i + 1} of ${count}: ${photo ? photo.name : 'empty'}`);
    });
  }
  function select(index, { focus = false } = {}) {
    if (index !== selected) { selected = index; syncSlotPanel(); scheduleDraw(); }
    if (focus && index != null) slotsEl.children[index]?.focus();
  }
  /** Slot index under a client point (top-most first), or null. */
  function slotAt(clientX, clientY) {
    const box = canvas.getBoundingClientRect(), x = (clientX - box.left) * view.k, y = (clientY - box.top) * view.k;
    const inside = s => { const p = unrotatePoint(s, x, y); return s.visible ? pointInPolygon(s.visible, p.x, p.y) && !(s.holeVisible?.length && pointInPolygon(s.holeVisible, p.x, p.y)) : p.x >= s.x && p.x < s.x + s.w && p.y >= s.y && p.y < s.y + s.h; };
    const hit = [...view.layout.slots].sort((a, b) => b.z - a.z || b.index - a.index).find(inside);
    return hit ? hit.index : null;
  }
  /** Fill geometry of slot `index` on the stage (device px), or null when it has no photo yet. */
  function geometry(index) {
    const slot = view.layout?.slots[index], image = imageOf(index);
    return slot && image && deps.photoById(doc.slots[index].photoId) ? fillGeometry(image.width, image.height, slot.w, slot.h, doc.slots[index]) : null;
  }
  // Pointer: drag pans the photo inside its slot; dragging it onto another slot swaps them (drop); two fingers zoom.
  slotsEl.addEventListener('pointerdown', event => {
    const option = event.target.closest('[data-slot]');
    if (event.button > 0) return;
    if (!option) { select(null); return; } // gutters, margins and transparent areas hold nothing
    const index = Number(option.dataset.slot);
    select(index);
    if (event.target.closest('.collage-rotate-handle')) {
      event.preventDefault(); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); try { slotsEl.setPointerCapture(event.pointerId); } catch { /* gone */ }
      const box = canvas.getBoundingClientRect(), slot = view.layout.slots[index], cx = box.left + (slot.x + slot.w / 2) / view.k, cy = box.top + (slot.y + slot.h / 2) / view.k;
      gesture = { index, start: cloneDoc(doc), mode: 'rotate-layout', cx, cy, startPointer: Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI, angle: slot.rotate };
      return;
    }
    if (event.target.closest('.collage-slot-empty')) return; // its click opens the file picker (no capture, or click goes elsewhere)
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { slotsEl.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    if (pointers.size === 1) gesture = { index, start: cloneDoc(doc), x: event.clientX, y: event.clientY, g: geometry(index), pan: { ...doc.slots[index].pan }, mode: template().kind === 'free' ? freeDragMode : 'pan', target: null, moved: false,
      layout: template().kind === 'free' ? { x: doc.slots[index].layout?.x ?? template().slots[index].x, y: doc.slots[index].layout?.y ?? template().slots[index].y } : null };
    else if (pointers.size === 2 && gesture && gesture.mode !== 'swap') {
      const [a, b] = [...pointers.values()];
      Object.assign(gesture, { mode: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: doc.slots[gesture.index].zoom });
    }
  });
  slotsEl.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!gesture || gesture.mode === 'ended') return;
    const slot = doc.slots[gesture.index];
    if (gesture.mode === 'rotate-layout') {
      let angle = gesture.angle + Math.atan2(event.clientY - gesture.cy, event.clientX - gesture.cx) * 180 / Math.PI - gesture.startPointer;
      angle = clamp(Math.round(angle), -45, 45); if (Math.abs(angle) <= 2) angle = 0; (slot.layout ||= {}).rotate = angle; syncFreeValues(); scheduleDraw(); return;
    }
    if (gesture.mode === 'pinch') {
      const [a, b] = [...pointers.values()]; if (!b) return;
      slot.zoom = clamp(gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance, ZOOM_MIN, ZOOM_MAX);
      syncFillValues(); scheduleDraw(); return;
    }
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 3) return;
    gesture.moved = true;
    if (gesture.mode === 'move') {
      const item = template().slots[gesture.index], fill = doc.slots[gesture.index], nx = gesture.layout.x + dx * view.k / view.layout.width, ny = gesture.layout.y + dy * view.k / view.layout.height;
      fill.layout ||= {}; fill.layout.x = clamp(nx, 0, 1 - item.w); fill.layout.y = clamp(ny, 0, 1 - item.h); scheduleDraw(); return;
    }
    const over = template().kind === 'free' ? gesture.index : slotAt(event.clientX, event.clientY);
    if (over != null && over !== gesture.index && deps.photoById(slot.photoId)) {
      if (gesture.mode !== 'swap') { slot.pan = { ...gesture.pan }; gesture.mode = 'swap'; }
      if (gesture.target !== over) { gesture.target = over; say(`Drop to swap with slot ${over + 1}`); }
      scheduleDraw(); return;
    }
    if (gesture.mode === 'swap') { Object.assign(gesture, { mode: 'pan', target: null, x: event.clientX, y: event.clientY }); scheduleDraw(); return; }
    if (gesture.g) { slot.pan = panBy(gesture.g, gesture.pan, dx * view.k, dy * view.k); scheduleDraw(); }
  });
  const endPointer = event => {
    if (!pointers.delete(event.pointerId) || !gesture) return;
    if (gesture.mode === 'pinch' && pointers.size) { gesture.mode = 'ended'; return; } // wait for the last finger
    if (pointers.size) return;
    const { start, mode, target, index } = gesture;
    gesture = null;
    if (mode === 'swap' && target != null && event.type === 'pointerup') {
      swapSlots(doc, index, target); selected = target; say(`Swapped slots ${index + 1} and ${target + 1}`);
    }
    commit(start); refresh();
  };
  slotsEl.addEventListener('pointerup', endPointer);
  slotsEl.addEventListener('pointercancel', endPointer);
  // "+ Add photo" on an empty slot: choose files for it (click is a user gesture, so the picker may open).
  slotsEl.addEventListener('click', event => {
    const option = event.target.closest('[data-slot]');
    if (!option || !event.target.closest('.collage-slot-empty')) return;
    select(Number(option.dataset.slot)); slotUi.file.click();
  });
  slotsEl.addEventListener('dblclick', event => { if (event.target.closest('[data-slot]')) editFill(resetFraming, 'Framing reset'); });
  slotsEl.addEventListener('wheel', event => {
    const option = event.target.closest('[data-slot]'); if (!option) return;
    const index = Number(option.dataset.slot), slot = doc.slots[index];
    if (!deps.photoById(slot.photoId)) return;
    event.preventDefault(); select(index);
    wheel ||= { start: cloneDoc(doc) };
    slot.zoom = clamp(slot.zoom * Math.exp(-event.deltaY * .0015), ZOOM_MIN, ZOOM_MAX);
    syncFillValues(); scheduleDraw();
    clearTimeout(wheel.timer);
    wheel.timer = setTimeout(() => { commit(wheel.start); wheel = null; say(`Zoom ${Math.round(slot.zoom * 100)}%`); }, 400);
  }, { passive: false });
  slotsEl.addEventListener('focusin', event => { const option = event.target.closest('[data-slot]'); if (option && !gesture) select(Number(option.dataset.slot)); });
  // Keys: arrows choose a slot; Alt+arrows pan; + − zoom; R rotates (Shift: back); F flips; 0 resets; Delete empties.
  slotsEl.addEventListener('keydown', event => {
    const option = event.target.closest('[data-slot]'); if (!option) return;
    const index = Number(option.dataset.slot), count = view.layout.slots.length, key = event.key;
    const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
    if (arrow && template().kind === 'free' && event.shiftKey && !event.altKey) {
      event.preventDefault(); const item = template().slots[index], step = event.ctrlKey || event.metaKey ? .05 : .01;
      change(d => { const fill = d.slots[index], current = fill.layout || {}; fill.layout = { ...current,
        x: clamp((current.x ?? item.x) + arrow[0] * step, 0, 1 - item.w), y: clamp((current.y ?? item.y) + arrow[1] * step, 0, 1 - item.h) }; });
      say('Print moved'); return;
    }
    if (arrow && event.altKey) {
      event.preventDefault(); const g = geometry(index); if (!g) return;
      const s = view.layout.slots[index], step = Math.min(s.w, s.h) * (event.shiftKey ? .2 : .05);
      editFill(slot => { slot.pan = panBy(g, slot.pan, arrow[0] * step, arrow[1] * step); }, 'Photo moved');
      return;
    }
    const next = arrow ? index + (arrow[0] || arrow[1]) : key === 'Home' ? 0 : key === 'End' ? count - 1 : null;
    if (next != null) { event.preventDefault(); select(clamp(next, 0, count - 1), { focus: true }); return; }
    if (event.ctrlKey || event.metaKey) return;
    const zoomBy = factor => editFill(slot => { slot.zoom *= factor; }, slot => `Zoom ${Math.round(slot.zoom * 100)}%`);
    const actions = {
      '+': () => zoomBy(1.1), '=': () => zoomBy(1.1), '-': () => zoomBy(1 / 1.1), '0': () => editFill(resetFraming, 'Framing reset'),
      r: () => editFill(slot => { slot.rotate += 90; }, slot => `Rotated to ${slot.rotate}°`),
      R: () => editFill(slot => { slot.rotate -= 90; }, slot => `Rotated to ${slot.rotate}°`),
      f: () => editFill(slot => { slot.flip = !slot.flip; }, slot => (slot.flip ? 'Flipped' : 'Not flipped')),
      '[': () => { if (template().kind === 'free') slotUi.back.click(); }, ']': () => { if (template().kind === 'free') slotUi.forward.click(); },
      Delete: emptySelected, Backspace: emptySelected,
      Enter: () => { if (!slotPhoto()) slotUi.file.click(); } // an empty slot: choose a photo file for it
    };
    const action = actions[key] || (key === 'F' ? actions.f : null);
    if (action) { event.preventDefault(); select(index); action(); }
  });
  /** Long edge (device px) a slot photo may need on this stage: independent of the layout and aspect, so switching
   *  them never renders a photo again. */
  function needEdge() {
    const long = Math.max(stage.clientWidth, stage.clientHeight) * Math.min(2, devicePixelRatio || 1);
    return Math.min(MAX_SLOT_EDGE, Math.max(400, Math.ceil(long / 200) * 200));
  }

  // ---------- Slot renders: a fast pass from the queue thumb, then a sharp pass for every photo ----------
  const freeImage = image => { if (!image) return; if (image.close) image.close(); else { image.width = 0; image.height = 0; } };
  function visiblePhotos() {
    const ids = doc.slots.slice(0, slotCount(template())).map(slot => slot.photoId);
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
    if (pumping || !active) return;
    pumping = true;
    const gen = generation;
    progress = { done: 0, total: countWork() };
    syncStatus();
    try {
      for (let next = nextJob(); next && active && gen === generation; next = nextJob()) {
        const job = running = { stale: false };
        let result = null;
        try { result = await deps.renderSlot(next.photo, { pass: next.pass, edge: next.edge, job }); }
        catch (error) { console.error(error); failed.add(`${next.photo.id}:${next.key}:${next.pass}`); }
        running = null;
        if (!active || gen !== generation || job.stale || !result) { freeImage(result?.image); continue; }
        const old = cache.get(next.photo.id);
        if (old?.image !== result.image) freeImage(old?.image);
        cache.set(next.photo.id, { key: next.key, image: result.image, edge: next.edge, sharp: next.pass === 'sharp' });
        if (next.pass === 'sharp') progress.done++;
        progress.total = Math.max(progress.total, progress.done + countWork());
        syncStatus(); scheduleDraw();
      }
    } finally {
      pumping = false;
      if (active) { progress = { done: 0, total: 0 }; syncStatus(); if (nextJob()) pump(); }
    }
  }
  /** Drops renders of photos no longer in a visible slot. */
  function prune() {
    const keep = new Set(visiblePhotos().map(photo => photo.id));
    for (const [id, entry] of cache) if (!keep.has(id)) { freeImage(entry.image); cache.delete(id); }
  }
  let message = '', messageTimer;
  function say(text) { message = text; clearTimeout(messageTimer); messageTimer = setTimeout(() => { message = ''; syncStatus(); }, 2500); syncStatus(); }
  function syncStatus() {
    status.textContent = progress.total ? `Developing photos… ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : message;
    stage.classList.toggle('is-developing', progress.total > 0);
  }

  function refresh() { syncPanel(); prune(); scheduleDraw(); pump(); }

  buildPanel();
  new ResizeObserver(() => { if (active) { scheduleDraw(); pump(); } }).observe(stage);

  return {
    get active() { return active; },
    get busy() { return pumping; },
    get canUndo() { return active && undoStack.length > 0; },
    get canRedo() { return active && redoStack.length > 0; },
    get hasDocument() { return Boolean(doc); },
    /** Opens collage mode with `photoIds` (in order); null resumes the last collage. The same photos also resume it,
     *  with its history. */
    open(photoIds) {
      const key = photoIds && [...photoIds].sort((a, b) => a - b).join();
      if (!doc || (photoIds && docPhotos !== key)) {
        const t = templateFor(photoIds.length);
        doc = createDoc(photoIds, t, deps.paperColors[0].hex); applyTemplate(doc, t); docPhotos = key;
        undoStack = []; redoStack = []; selected = null;
      }
      active = true; failed.clear(); generation++;
      historyChanged(); refresh();
      // After the first draw, which creates the slot boxes.
      requestAnimationFrame(() => (selected != null ? slotsEl.children[selected] : panel.querySelector('[data-template][aria-selected="true"]'))?.focus({ preventScroll: true }));
    },
    /** Reopens a saved document. Missing photos are already emptied by the session repository. */
    load(value) {
      doc = cloneDoc(value); docPhotos = ''; undoStack = []; redoStack = []; selected = null;
      active = true; failed.clear(); generation++; historyChanged(); refresh();
      requestAnimationFrame(() => panel.querySelector('[data-template][aria-selected="true"]')?.focus({ preventScroll: true }));
    },
    /** Leaves collage mode: drops pending renders (the document and history stay). The slot images are freed unless
     *  `keepCache` (leaving to edit one photo: the others need no new render on return). */
    close({ keepCache = false } = {}) {
      if (!active) return;
      active = false; generation++; if (running) running.stale = true;
      cancelAnimationFrame(frame); frame = 0; slider = null; gesture = null; pointers.clear();
      if (drag) { drag.handle.classList.remove('is-dragging'); commit(drag.start); drag = null; }
      if (wheel) { clearTimeout(wheel.timer); commit(wheel.start); wheel = null; }
      if (!keepCache) { for (const entry of cache.values()) freeImage(entry.image); cache.clear(); }
      progress = { done: 0, total: 0 }; message = ''; syncStatus();
      historyChanged();
    },
    /** Esc: clears the slot selection first; false when there was nothing to clear (then collage mode closes). */
    escape() {
      if (selected == null) return false;
      const option = slotsEl.children[selected]; select(null); option?.focus(); say('No photo selected');
      return true;
    },
    /** One undo step of changes to the document from outside (the export sheet's flatten colour). */
    update(mutator) { if (doc) change(mutator); },
    undo() { step(undoStack, redoStack, 'Undone'); },
    redo() { step(redoStack, undoStack, 'Redone'); },
    /** A photo's edit changed outside collage mode: its slot re-renders on the next pump. */
    refresh() { if (active) refresh(); },
    /** For checks: the current document (a copy). */
    snapshot() { return doc && cloneDoc(doc); }
  };
}
