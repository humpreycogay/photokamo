// The collage panel (part of collage mode, js/collage/mode.js): layout pickers, aspect, paper and backdrop, spacing
// sliders, borders, sticker-sheet options, contact-film fields, tabs and layout thumbnails. `c` is the collage
// context (mode.js).
import { templates, templateById, slotCount } from './templates.js';
import { layoutTemplate, paddedAspect, stickerPad } from './layout.js';
import { drawPaper, drawCollageTexts, sheetPath, slotPath, drawOrder, mountRects } from './render.js';
import { drawStickers } from './stickers.js';
import { ASPECTS, SPACING, COLLAGE_PAPERS, DEFAULT_SPACING, fitSlots, resetTransforms } from './model.js';
import { DEFAULT_FILM, filmSettings } from './contact.js';
import { PICKER, clamp, liveRange, percent, plural, radioGroup, syncRadios, visiblePath } from './ui.js';

export function createPanel(c) {
  const { deps, byId, canvas, change, say, template, draw } = c, panel = c.panelEl;
  const BACKDROP_KEY = 'photokamo:collage-backdrop';
  const lists = [byId('collageDiptychs'), byId('collageTemplates'), byId('collageStyles'), byId('collageKits'), byId('collageLooks')], aspects = byId('collageAspects'), paper = byId('collagePaper');
  const sliders = Object.fromEntries(Object.keys(SPACING).map(key => [key, panel.querySelector(`[data-collage="${key}"]`)]));
  const sticker = { box: byId('collageSticker'), outline: byId('collageOutline'), output: byId('collageOutlineOutput'), colors: byId('collageOutlineColor'), shadow: byId('collageShadow') };
  const prints = { box: byId('collagePrints'), title: byId('collagePrintsTitle'), border: byId('collageBorder'), output: byId('collageBorderOutput'), colors: byId('collageBorderColor'),
    captionRow: byId('collageCaptionRow'), captionHint: byId('collageCaptionHint'), caption: byId('collageCaptionSpace') };
  const evenRow = byId('collageEvenRow'), even = byId('collageEvenLines');
  const radiusRow = byId('collageRadiusRow'), marginRow = byId('collageMarginRow'), gutterRow = byId('collageGutterRow'), aspectHint = byId('collageAspectHint');
  const backdrops = byId('collageBackdrops'), backdropRow = byId('collageBackdropRow'), sheetEl = byId('collageSheet');
  const filmUi = { box: byId('collageFilm'), base: byId('collageFilmBase'), stock: byId('collageFilmStock'), date: byId('collageFilmDate'), start: byId('collageFilmStart'), mark: byId('collageFilmMark'), frame: byId('collageFilmMarkFrame') };
  let backdrop = (() => { try { return ['checker', 'light', 'dark'].includes(localStorage.getItem(BACKDROP_KEY)) ? localStorage.getItem(BACKDROP_KEY) : 'checker'; } catch { return 'checker'; } })();
  const buildTextPanel = (...args) => c.ui.text.buildTextPanel(...args);
  const syncTextPanel = (...args) => c.ui.text.syncTextPanel(...args);
  const newText = (...args) => c.ui.text.newText(...args);
  const newTextId = (...args) => c.ui.text.newTextId(...args);
  const buildStickerPanel = (...args) => c.ui.sticker.buildStickerPanel(...args);
  const syncStickerPanel = (...args) => c.ui.sticker.syncStickerPanel(...args);
  const newStickerId = (...args) => c.ui.sticker.newStickerId(...args);
  const buildSlotPanel = (...args) => c.ui.slots.buildSlotPanel(...args);
  const syncSlotPanel = (...args) => c.ui.slots.syncSlotPanel(...args);

  let showLayoutTab = () => {};
  function buildPanel() {
    const optionHtml = t => `<div class="collage-template" role="option" id="collage-${t.id}" data-template="${t.id}" tabindex="-1" aria-selected="false" aria-label="${t.name}, ${plural(slotCount(t), 'photo')}"><canvas aria-hidden="true"></canvas><span class="collage-template-name" aria-hidden="true">${t.name}</span></div>`;
    // Looks stay in their families, in the order written (js/collage/templates.js); the rest by photo count.
    const byCount = category => templates.filter(t => t.category === category).sort((a, b) => category === 'look' ? 0 : slotCount(a) - slotCount(b));
    PICKER.forEach((category, i) => { lists[i].innerHTML = byCount(category).map(optionHtml).join(''); });
    const kitFonts = new Set(templates.flatMap(t => (t.text || []).map(text => deps.textFont({ bold: false, ...text }, 32))));
    Promise.all([...kitFonts].map(font => document.fonts.load(font).catch(() => {}))).then(() => { if (c.doc) drawThumbs(); }); // kit titles in the thumbnails
    aspects.innerHTML = ASPECTS.map(([label]) => `<button type="button" role="radio" data-aspect="${label}" aria-checked="false">${label}</button>`).join('');
    paper.innerHTML = papers.map(color => `<button type="button" role="radio" class="paper-swatch" data-paper="${color.hex}" aria-checked="false" aria-label="${color.name}" title="${color.name}" style="--swatch:${color.hex}"></button>`).join('')
      + '<button type="button" role="radio" class="paper-swatch paper-none" data-paper="none" aria-checked="false" aria-label="None (transparent)" title="None (transparent)"></button>';
    // Layout listbox: selection follows focus (arrows, Home, End); click or Enter picks.
    const pickTemplate = option => {
      if (!option || option.getAttribute('aria-selected') === 'true') return;
      const next = templateById(option.dataset.template), was = c.doc.sheet.background;
      change(d => applyTemplate(d, next));
      say(`Layout: ${next.name}${c.doc.sheet.background !== was ? (c.doc.sheet.background === 'transparent' ? '. Paper: none (transparent outside the shape)' : '. Paper back on') : ''}`);
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
      liveRange(c, input, () => { c.doc[key] = Number(input.value) / 100; syncSliders(); draw(); });
    }
    even.addEventListener('change', () => {
      const on = even.checked;
      change(d => { if (!on) d.margin = evenMarginOf(d); d.evenLines = on; }); // off: the margin starts where the lines left it
      say(on ? 'Even lines: the edge matches the lines between photos' : 'Even lines off: set the margin yourself');
    });
    buildSticker();
    buildPrints();
    buildSlotPanel();
    byId('collageResetTransforms').addEventListener('click', () => {
      change(resetTransforms);
      say('Photo and print transformations reset');
    });
    buildTextPanel();
    buildStickerPanel();
    buildFilmPanel();
    showLayoutTab = buildTabs();
  }

  function buildTabs() {
    const tablist = panel.querySelector('.collage-tabs'), tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const selectTab = (tab, focus = false) => {
      for (const item of tabs) {
        const selected = item === tab;
        item.setAttribute('aria-selected', selected); item.tabIndex = selected ? 0 : -1;
        byId(item.getAttribute('aria-controls')).hidden = !selected;
      }
      if (focus) tab.focus();
    };
    tablist.addEventListener('click', event => { const tab = event.target.closest('[role="tab"]'); if (tab) selectTab(tab); });
    tablist.addEventListener('keydown', event => {
      const current = tabs.indexOf(document.activeElement);
      const index = { ArrowRight: (current + 1) % tabs.length, ArrowLeft: (current - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (index === undefined) return;
      event.preventDefault(); selectTab(tabs[index], true);
    });
    return () => selectTab(tabs[0]);
  }

  function buildFilmPanel() {
    radioGroup(filmUi.base, '[data-film-base]', button => change(d => { d.film = { ...filmSettings(d.film), base: button.dataset.filmBase }; }));
    const field = (input, key, read = value => value) => input.addEventListener('change', () => change(d => { d.film = { ...filmSettings(d.film), [key]: read(input.value) }; }));
    field(filmUi.stock, 'stockText', value => value.trim() || DEFAULT_FILM.stockText); field(filmUi.date, 'date');
    field(filmUi.start, 'startNumber', value => clamp(Number(value) || 0, 0, 99.5)); field(filmUi.mark, 'mark');
    field(filmUi.frame, 'markFrame', value => clamp(Math.round(Number(value) || 1), 1, slotCount(template())));
  }
  function syncFilmPanel() {
    const film = filmSettings(c.doc.film), count = slotCount(template());
    syncRadios(filmUi.base, 'data-film-base', film.base); filmUi.stock.value = film.stockText; filmUi.date.value = film.date;
    filmUi.start.value = film.startNumber; filmUi.mark.value = film.mark; filmUi.frame.max = count; filmUi.frame.value = clamp(film.markFrame, 1, count); filmUi.frame.disabled = film.mark === 'none';
  }

  /** Switches the document to template `next`: shapes start transparent (paper comes back when leaving them, unless
   *  the user chose it); styles bring their own paper colour (the default comes back when leaving them, unless the
   *  user chose one); proportional shapes size the sheet to themselves, other layouts get the user's aspect back. */
  function applyTemplate(d, next) {
    const shaped = next.kind === 'shaped', was = templateById(d.templateId);
    if (was?.id !== next.id) {
      d.splits = null; // dividers start where the new layout puts them
      resetTransforms(d); // framing and scrapbook placement belong to the previous layout
      swapKitLayers(d, was, next);
    }
    if (was && was.kind !== next.kind) d.border = null; // grid borders and print borders don't carry over
    if (was?.id !== next.id) applyLook(d, was?.look, next.look);
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
  /** Picking a look sets its spacing, corners and photo border, with even lines; leaving one for a plain layout puts
   *  back the defaults the user hasn't changed since. */
  function applyLook(d, old, look) {
    if (look) { d.gutter = look.gutter; d.radius = look.radius || 0; d.border = look.border ? { ...look.border } : null; d.evenLines = true; return; }
    if (!old) return;
    if (d.gutter === old.gutter) d.gutter = DEFAULT_SPACING.gutter;
    if (d.radius === (old.radius || 0)) d.radius = DEFAULT_SPACING.radius;
    if (JSON.stringify(d.border) === JSON.stringify(old.border || null)) d.border = null;
  }
  /** A kit's stickers and captions as layers, each tagged `kit: "<template>:<index>"` (without ids). */
  const kitLayers = t => ({
    text: (t?.text || []).map((layer, i) => { const { id, ...rest } = newText(layer.content, 'sheet', layer); return { ...rest, kit: `${t.id}:${i}` }; }),
    stickers: (t?.stickers || []).map((layer, i) => ({ flip: false, ...layer, kit: `${t.id}:${i}` }))
  });
  /** Leaving a kit removes its layers the user hasn't changed (edited or moved ones stay); entering one adds its
   *  layers, unless a layer from that kit is still there. */
  function swapKitLayers(d, was, next) {
    const old = kitLayers(was), fresh = kitLayers(next), untouched = (layer, list) => {
      const original = layer.kit && list.find(item => item.kit === layer.kit);
      return Boolean(original) && Object.keys(original).every(key => JSON.stringify(layer[key]) === JSON.stringify(original[key]));
    };
    d.text = d.text.filter(layer => !untouched(layer, old.text)); d.stickers = (d.stickers || []).filter(layer => !untouched(layer, old.stickers));
    const has = (list, layer) => list.some(item => item.kit === layer.kit);
    d.text.push(...fresh.text.filter(layer => !has(d.text, layer)).map(layer => ({ ...layer, id: newTextId() })));
    d.stickers.push(...fresh.stickers.filter(layer => !has(d.stickers, layer)).map(layer => ({ ...layer, id: newStickerId() })));
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
    const input = prints.border;
    liveRange(c, input, () => { c.doc.border = { ...borderOf(c.doc), width: Number(input.value) / 100 }; syncPrints(); syncSliders(); draw(); },
      () => say(c.doc.border.width ? `Border ${input.value}%` : 'Border off'));
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
    const border = borderOf(c.doc), value = Math.round(border.width * 1000) / 10;
    prints.border.value = value; prints.output.value = border.width ? `${value}%` : 'Off';
    syncRadios(prints.colors, 'data-border', border.color);
    prints.caption.checked = Boolean(c.doc.captionSpace);
  }
  const outlineOf = d => d.sheet.outline || { width: 0, color: outlineColors[0][0] };
  const outlineColors = [['#ffffff', 'White'], ...deps.paperColors.filter(color => color.id !== 'bright').map(color => [color.hex, color.name])]; // pure white replaces the near-white paper
  /** Sticker options for shaped sheets: outline width (live, one undo step per gesture) and colour, soft shadow. */
  function buildSticker() {
    sticker.colors.innerHTML = outlineColors.map(([hex, name]) => `<button type="button" role="radio" class="paper-swatch" data-outline="${hex}" aria-checked="false" aria-label="${name}" title="${name}" style="--swatch:${hex}"></button>`).join('');
    const input = sticker.outline;
    liveRange(c, input, () => {
      c.doc.sheet.outline = { ...outlineOf(c.doc), width: Number(input.value) / 100 };
      fitAspect(c.doc, template()); syncSticker(); draw();
    }, () => say(c.doc.sheet.outline.width ? `Outline ${input.value}%` : 'Outline off'));
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
    const outline = outlineOf(c.doc), percentValue = Math.round(outline.width * 10000) / 100;
    sticker.outline.value = percentValue; sticker.output.value = outline.width ? `${percentValue}%` : 'Off';
    syncRadios(sticker.colors, 'data-outline', outline.color);
    sticker.shadow.checked = Boolean(c.doc.sheet.shadow);
  }

  function syncBackdrop() {
    const transparent = c.doc?.sheet.background === 'transparent';
    backdropRow.hidden = !transparent;
    syncRadios(backdrops, 'data-backdrop', backdrop);
    sheetEl.dataset.backdrop = transparent ? backdrop : '';
  }
  /** The margin even lines give (fraction of the short edge): the spacing, plus half a grid's photo border. */
  const evenMarginOf = d => Math.min(SPACING.margin.max, d.gutter + (templateById(d.templateId)?.kind === 'grid' ? borderOf(d).width / 2 : 0));
  const evenOn = () => Boolean(c.doc.evenLines) && ['grid', 'shaped'].includes(template().kind);
  function syncSliders() {
    for (const [key, input] of Object.entries(sliders)) {
      const value = key === 'margin' && evenOn() ? evenMarginOf(c.doc) : c.doc[key];
      input.value = Math.round(value * 1000) / 10;
      panel.querySelector(`output[for="${input.id}"]`).value = percent(value);
    }
    sliders.margin.disabled = evenOn(); even.checked = Boolean(c.doc.evenLines);
  }
  function syncPanel() {
    const t = template(), aspect = ASPECTS.find(([, w, h]) => w === c.doc.aspect.w && h === c.doc.aspect.h);
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
    marginRow.hidden = free || (shaped && c.doc.sheet.background === 'transparent'); // a shape's margin is a paper rim
    evenRow.hidden = marginRow.hidden || contact;
    if (shaped) syncSticker();
    if (!shaped) syncPrints();
    if (contact) syncFilmPanel();
    syncRadios(paper, 'data-paper', c.doc.sheet.background === 'transparent' ? 'none' : c.doc.paper.color);
    syncBackdrop();
    syncSliders();
    syncSlotPanel();
    syncTextPanel();
    syncStickerPanel();
    drawThumbs();
    const filled = c.doc.slots.slice(0, slotCount(t)).filter(slot => deps.photoById(slot.photoId)).length;
    document.getElementById('collageCount').textContent = `${filled} of ${plural(slotCount(t), 'photo')}`;
    canvas.setAttribute('aria-label', `Collage preview: ${t.name} layout, ${filled} of ${plural(slotCount(t), 'slot')} filled, ${t.lockAspect ? 'shaped' : aspect ? aspect[0] : `${c.doc.aspect.w}:${c.doc.aspect.h}`} sheet`);
  }
  /** Layout thumbnails at the current sheet aspect (shapes at their own), in the panel's token colours. A checkerboard
   *  shows where the sheet is transparent: around every shape, and between the slots with Paper: none. */
  function drawThumbs() {
    const style = getComputedStyle(document.documentElement), sheetColor = style.getPropertyValue('--line-strong').trim(), slotColor = style.getPropertyValue('--text-muted').trim();
    const checkerLight = style.getPropertyValue('--raised').trim(), transparent = c.doc.sheet.background === 'transparent';
    const dpr = Math.min(2, devicePixelRatio || 1), box = 52;
    for (const list of lists) for (const option of list.querySelectorAll('[data-template]')) {
      const t = templateById(option.dataset.template), shaped = t.kind === 'shaped', kit = t.category === 'kit', a = shaped || kit || t.look ? t.aspect[0] / t.aspect[1] : c.doc.aspect.w / c.doc.aspect.h;
      const w = Math.round((a >= 1 ? box : box * a) * dpr), h = Math.round((a >= 1 ? box / a : box) * dpr);
      const thumb = option.querySelector('canvas'), layout = layoutTemplate(t, w, h, { gutter: .06, margin: shaped ? 0 : .06, border: t.kind === 'free' ? { width: 1.5 * dpr / Math.min(w, h), color: checkerLight } : null });
      thumb.width = w; thumb.height = h; thumb.style.width = `${w / dpr}px`; thumb.style.height = `${h / dpr}px`;
      const ctx = thumb.getContext('2d');
      if (t.look) { drawLookThumb(ctx, t, w, h, dpr, slotColor); continue; }
      if (kit) { drawKitThumb(ctx, t, layout, slotColor); continue; }
      if (transparent || shaped) {
        const cell = Math.max(2, Math.round(4 * dpr));
        ctx.fillStyle = checkerLight; ctx.fillRect(0, 0, w, h); ctx.fillStyle = sheetColor;
        for (let y = 0; y < h; y += cell) for (let x = (y / cell) % 2 ? cell : 0; x < w; x += cell * 2) ctx.fillRect(x, y, cell, cell);
      }
      if (!transparent) { ctx.fillStyle = sheetColor; if (shaped) ctx.fill(sheetPath(layout.paper), 'evenodd'); else ctx.fillRect(0, 0, w, h); }
      ctx.fillStyle = slotColor;
      for (const s of drawOrder(layout)) {
        if (shaped) { ctx.fill(visiblePath(s), 'evenodd'); continue; }
        const mount = mountRects(s)?.outer; if (mount) { ctx.fillStyle = checkerLight; ctx.fillRect(mount.x, mount.y, mount.w, mount.h); ctx.fillStyle = slotColor; }
        const path = slotPath(s); ctx.fill(path);
        if (s.border) { ctx.strokeStyle = s.border.color; ctx.lineWidth = s.border.width; ctx.stroke(path); } // overlapping prints stay apart
      }
    }
  }
  /** A look's thumbnail in its own paper, spacing and corners (lines at least a hairline, so seamless cells show), grey photos. */
  function drawLookThumb(ctx, t, w, h, dpr, slotColor) {
    const short = Math.min(w, h), hair = dpr / short, { gutter, radius = 0, border = null } = t.look;
    const layout = layoutTemplate(t, w, h, { gutter: Math.max(gutter, hair), radius, evenLines: true, border: border && { ...border, width: Math.max(border.width, hair) } });
    ctx.fillStyle = t.paper; ctx.fillRect(0, 0, w, h); ctx.fillStyle = slotColor;
    for (const s of layout.slots) { const path = slotPath(s); ctx.fill(path); if (s.border) { ctx.strokeStyle = s.border.color; ctx.lineWidth = s.border.width; ctx.stroke(path); } }
  }
  /** A kit's thumbnail in its own colours: paper and scraps, mounts, grey photos, stickers and titles. */
  function drawKitThumb(ctx, t, layout, slotColor) {
    drawPaper(ctx, { sheet: { background: 'paper' }, paper: { color: t.paper, texture: 'none' } }, layout);
    for (const s of drawOrder(layout)) {
      ctx.save(); const cx = s.x + s.w / 2, cy = s.y + s.h / 2; ctx.translate(cx, cy); ctx.rotate((s.rotate || 0) * Math.PI / 180); ctx.translate(-cx, -cy);
      const mount = mountRects(s)?.outer; if (mount) { ctx.fillStyle = s.mount.color; ctx.fillRect(mount.x, mount.y, mount.w, mount.h); }
      ctx.fillStyle = slotColor; ctx.fillRect(s.x, s.y, s.w, s.h); ctx.restore();
    }
    drawStickers(ctx, { stickers: t.stickers }, layout);
    drawCollageTexts(ctx, { text: kitLayers(t).text }, layout);
  }

  return { buildPanel, syncPanel, applyTemplate, drawThumbs, showLayoutTab: () => showLayoutTab() };
}
