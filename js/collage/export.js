// Collage export (CollagePlan.md Task 3): the Save collage sheet, the device canvas limit and the full render.
// Photos render one at a time at the size their slot needs (film engines from full-size input, V1), are drawn and
// freed at once; compositing runs on the main thread (V6). The file is prepared as soon as the sheet opens, so
// Share can call navigator.share() while the tap still counts as a user gesture.
// deps: doc() (a copy), update(mutator) (one collage undo step), photoById(id), photoSize(photo) → cropped
//   { width, height }, renderEdit(photo, { edge, onProgress }) → { image }, download(file), canShareFiles, isPhone(),
//   toast(text), paperColors.
// Transparency (Task 4): PNG and WebP keep a transparent sheet's alpha; JPEG has none, so it is filled with the
// collage's `flatten` colour (never left to the encoder, which would turn it black).
import { templateById, slotCount } from './templates.js';
import { layoutTemplate } from './layout.js';
import { drawPaper, drawSlot, drawOrder, drawCollageTexts, flattenSheet } from './render.js';
import { shareSize, printSize, fullSize, capSize, slotEdge, PRINT_PAPERS, PRINT_DPI } from './sizes.js';

const LIMIT_KEY = 'photokamo:canvas-limit';
const FORMATS = { 'image/jpeg': ['JPEG', 'jpg'], 'image/png': ['PNG', 'png'], 'image/webp': ['WebP', 'webp'] };
const megapixels = (width, height) => `${Math.round(width * height / 1e5) / 10} MP`;

/** Largest canvas (pixels) this device can really draw into: measured once per browser (allocate, write and read a
 *  pixel at the far corner), remembered in localStorage. Phones start at iOS Safari's 16.7 MP. */
export function canvasLimit() {
  try { const saved = JSON.parse(localStorage.getItem(LIMIT_KEY)); if (saved?.ua === navigator.userAgent && saved.pixels > 0) return saved.pixels; } catch { /* measure */ }
  const coarse = matchMedia('(pointer: coarse)').matches;
  const candidates = coarse ? [16.7e6, 12e6, 8e6, 4e6] : [64e6, 48e6, 36e6, 24e6, 16.7e6, 12e6, 8e6, 4e6];
  const pixels = candidates.find(canDraw) || 4e6;
  try { localStorage.setItem(LIMIT_KEY, JSON.stringify({ ua: navigator.userAgent, pixels })); } catch { /* measured again next visit */ }
  return pixels;
}
function canDraw(pixels) {
  const side = Math.floor(Math.sqrt(pixels)), canvas = document.createElement('canvas');
  try {
    canvas.width = side; canvas.height = side;
    const ctx = canvas.getContext('2d'); if (!ctx) return false;
    ctx.fillStyle = '#ff0000'; ctx.fillRect(side - 1, side - 1, 1, 1);
    const pixel = ctx.getImageData(side - 1, side - 1, 1, 1).data;
    return pixel[0] === 255 && pixel[3] === 255;
  } catch { return false; } finally { canvas.width = 0; canvas.height = 0; }
}
const cancelled = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' });
const freeImage = image => { if (!image) return; if (image.close) image.close(); else { image.width = 0; image.height = 0; } };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function createCollageExport(deps) {
  const byId = id => document.getElementById(id);
  const ui = {
    dialog: byId('collageExportDialog'), form: byId('collageExportForm'), summary: byId('collageExportSummary'), formats: byId('collageFormats'), sizes: byId('collageSizes'),
    shareDetail: byId('collageShareDetail'), fullDetail: byId('collageFullDetail'), printDetail: byId('collagePrintDetail'), printRow: byId('collagePrintRow'), paper: byId('collagePrintPaper'),
    limit: byId('collageLimit'), qualityGroup: byId('collageQualityGroup'), quality: byId('collageQuality'), qualityOutput: byId('collageQualityOutput'),
    alpha: byId('collageAlpha'), alphaNote: byId('collageAlphaNote'), flattenRow: byId('collageFlattenRow'), flatten: byId('collageFlatten'),
    flattenCustom: byId('collageFlattenCustom'), flattenCustomLabel: byId('collageFlattenCustomLabel'),
    progress: byId('collageProgress'), progressText: byId('collageProgressText'), progressCount: byId('collageProgressCount'), bar: byId('collageBar'), cancel: byId('collageCancel'),
    share: byId('collageShare'), download: byId('collageDownload'), status: byId('collageExportStatus')
  };
  const options = { format: 'image/jpeg', formatChosen: false, size: null, paper: 'a4' };
  const flattenColors = [['#ffffff', 'White'], ...deps.paperColors.map(color => [color.hex, color.name])];
  const colorName = hex => flattenColors.find(([value]) => value === hex)?.[1] || hex;
  const transparent = doc => doc.sheet.background === 'transparent';
  const flattenFor = (doc, format) => (transparent(doc) && format === 'image/jpeg' ? doc.flatten : null);
  let job = null, timer = 0, limit = 0;

  ui.flatten.innerHTML = flattenColors.map(([hex, name]) => `<button type="button" role="radio" class="paper-swatch" data-flatten="${hex}" aria-checked="false" aria-label="${name}" title="${name}" style="--swatch:${hex}"></button>`).join('');
  ui.paper.innerHTML = PRINT_PAPERS.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
  const photoSizeOf = fill => { const photo = deps.photoById(fill?.photoId); return photo ? deps.photoSize(photo) : null; };
  function sizes(doc = deps.doc()) {
    const template = templateById(doc.templateId);
    return {
      share: capSize(shareSize(doc.aspect), limit),
      full: capSize(fullSize(doc, template, photoSizeOf), limit),
      print: capSize(printSize(doc.aspect, options.paper), limit)
    };
  }
  const chosen = (doc = deps.doc()) => sizes(doc)[options.size];
  // Lossy WebP blends the black stored under transparent pixels into the edges (dark fringes, measured up to
  // 63/255 in tools/collage-alpha.html); quality 1 makes the browser write lossless WebP, which keeps edges exact.
  const losslessAlpha = doc => transparent(doc) && options.format === 'image/webp';
  const qualityValue = (doc = deps.doc()) => (options.format === 'image/png' || losslessAlpha(doc) ? 1 : Number(ui.quality.value) / 100);
  const exportKey = doc => JSON.stringify([doc, chosen(doc), options.format, qualityValue(doc)]);
  function syncAlpha(doc) {
    ui.alpha.hidden = !transparent(doc); if (ui.alpha.hidden) return;
    const jpeg = options.format === 'image/jpeg';
    ui.alphaNote.textContent = jpeg ? `JPEG has no transparency — background filled with ${colorName(doc.flatten)}.${doc.sheet.shadow && templateById(doc.templateId)?.kind === 'shaped' ? ' The shadow is left out.' : ''}`
      : `Transparent background kept${options.format === 'image/webp' ? ' (WebP saved lossless, so edges stay clean)' : ''}. Some apps add a background to transparent images when you share them.`;
    ui.flattenRow.hidden = !jpeg;
    ui.flatten.querySelectorAll('[data-flatten]').forEach(button => { const on = button.dataset.flatten === doc.flatten; button.setAttribute('aria-checked', on); button.tabIndex = on ? 0 : -1; });
    const custom = !flattenColors.some(([hex]) => hex === doc.flatten);
    if (custom) ui.flatten.querySelector('[data-flatten]').tabIndex = 0;
    ui.flattenCustomLabel.classList.toggle('is-selected', custom);
    ui.flattenCustomLabel.style.setProperty('--custom-color', doc.flatten); ui.flattenCustom.value = doc.flatten;
  }
  const setFlatten = hex => { deps.update(d => { d.flatten = hex; }); sync(); schedule(); };

  function sync() {
    const doc = deps.doc(), all = sizes(doc), template = templateById(doc.templateId);
    const count = slotCount(template), filled = doc.slots.slice(0, count).filter(fill => deps.photoById(fill.photoId)).length;
    syncAlpha(doc);
    ui.summary.textContent = [`${template.name} · ${filled} photo${filled === 1 ? '' : 's'}`, template.lockAspect ? 'shape' : `${doc.aspect.w}:${doc.aspect.h}`, transparent(doc) ? 'transparent' : '', filled < count ? `${count - filled} empty slot${count - filled === 1 ? '' : 's'} stay ${transparent(doc) ? 'transparent' : 'paper'}` : ''].filter(Boolean).join(' · ');
    ui.formats.querySelectorAll('[data-format]').forEach(button => button.setAttribute('aria-pressed', button.dataset.format === options.format));
    ui.sizes.querySelectorAll('[data-size]').forEach(button => button.setAttribute('aria-pressed', button.dataset.size === options.size));
    ui.shareDetail.textContent = `${all.share.width} × ${all.share.height}`;
    ui.fullDetail.textContent = `${all.full.width} × ${all.full.height} · ${megapixels(all.full.width, all.full.height)}`;
    const paperName = PRINT_PAPERS.find(([id]) => id === options.paper)[1];
    ui.printDetail.textContent = `${paperName} · ${all.print.width} × ${all.print.height}`;
    ui.printRow.hidden = options.size !== 'print'; ui.paper.value = options.paper;
    const size = all[options.size];
    ui.limit.hidden = !size.capped;
    if (size.capped) {
      const dpi = options.size === 'print' ? ` (about ${Math.round(PRINT_DPI * Math.sqrt(size.width * size.height / (printSize(doc.aspect, options.paper).width * printSize(doc.aspect, options.paper).height)))} dpi)` : '';
      ui.limit.textContent = `Limited to ${megapixels(size.width, size.height)} on this device${dpi}.`;
    }
    ui.qualityGroup.hidden = options.format === 'image/png' || losslessAlpha(doc);
    const q = Number(ui.quality.value);
    ui.qualityOutput.value = `${q >= 90 ? 'High' : q >= 75 ? 'Medium' : 'Low'} · ${q}%`;
    ui.share.hidden = !deps.canShareFiles;
    ui.download.className = `button button-xl ${deps.canShareFiles ? 'button-ghost' : 'button-primary'}`;
  }

  // ---------- Rendering ----------
  function showProgress(on, text = '', done = 0, total = 0, part = 0) {
    ui.progress.hidden = !on; if (!on) return;
    ui.progressText.textContent = text;
    ui.progressCount.textContent = total ? `${Math.min(done + 1, total)} of ${total}` : '';
    ui.bar.style.width = `${Math.round((total ? (done + part) / total : 1) * 100)}%`;
  }
  /** The collage at `size` on a fresh canvas: paper, then each photo rendered, drawn and freed in turn. */
  async function renderSheet(current) {
    const { doc, size } = current, template = templateById(doc.templateId);
    const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('This device cannot make a canvas that large');
    const layout = layoutTemplate(template, size.width, size.height, doc);
    await deps.ensureTextFonts(doc.text || []);
    const flatten = flattenFor(doc, current.format);
    drawPaper(ctx, doc, layout, { shadow: !flatten }); // sticker shadows are for PNG/WebP
    const slots = drawOrder(layout).filter(slot => deps.photoById(doc.slots[slot.index].photoId));
    for (const [n, slot] of slots.entries()) {
      if (current.cancelled) throw cancelled();
      const fill = doc.slots[slot.index], photo = deps.photoById(fill.photoId), natural = deps.photoSize(photo);
      const report = (part = 0) => { if (job === current) showProgress(true, `Rendering ${photo.name}`, n, slots.length, part); };
      report();
      const { image } = await deps.renderEdit(photo, { edge: slotEdge(natural.width, natural.height, slot.w, slot.h, fill), onProgress: report });
      if (current.cancelled) { freeImage(image); throw cancelled(); }
      drawSlot(ctx, doc, slot, image);
      freeImage(image); // one full photo render at a time
    }
    drawCollageTexts(ctx, doc, layout, deps.textFont);
    if (flatten) flattenSheet(ctx, layout, flatten);
    if (job === current) showProgress(true, 'Encoding', slots.length, slots.length);
    return canvas;
  }
  /** The prepared file for the current options (rendered once; options or collage changes start again). */
  function prepare() {
    const doc = deps.doc(), key = exportKey(doc);
    if (job?.key === key && !job.cancelled && !job.error) return job.promise;
    if (job && !job.file) job.cancelled = true;
    const current = job = { key, doc, size: chosen(doc), format: options.format, quality: qualityValue(doc), cancelled: false, file: null, error: null };
    current.promise = (async () => {
      const started = performance.now();
      const canvas = await renderSheet(current);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, current.format, current.quality));
      canvas.width = 0; canvas.height = 0; // free the sheet now
      if (current.cancelled) throw cancelled();
      if (!blob) throw new Error('Encoding failed');
      const type = blob.type || current.format; // WebP may fall back to PNG (V8)
      current.file = new File([blob], `PhotoKamo-collage-${today()}.${FORMATS[type]?.[1] || type.split('/')[1]}`, { type });
      current.ms = Math.round(performance.now() - started);
      return current.file;
    })();
    current.promise.catch(error => { current.error = error; }).finally(() => { if (job === current) showProgress(false); });
    return current.promise;
  }
  function schedule(delay = 300) {
    clearTimeout(timer); ui.status.textContent = '';
    if (job && !job.file) job.cancelled = true;
    timer = setTimeout(() => prepare().catch(() => {}), delay);
  }
  const fallbackNote = file => (file.type !== job?.format ? ` Saved as ${FORMATS[file.type]?.[0] || file.type}: this browser can’t save ${FORMATS[job.format][0]}.` : '');

  async function download() {
    try {
      ui.status.textContent = 'Preparing your collage…';
      const file = await prepare();
      deps.download(file);
      ui.dialog.close(); deps.toast(`Your collage is ready.${fallbackNote(file)}`);
    } catch (error) {
      if (error?.name === 'AbortError') { ui.status.textContent = 'Cancelled.'; return; }
      console.error(error); ui.status.textContent = 'Export failed. Try a smaller size or JPEG.';
      return;
    }
    ui.status.textContent = '';
  }
  async function share() {
    try {
      const ready = job?.key === exportKey(deps.doc()) ? job.file : null;
      if (!ready) ui.status.textContent = 'Preparing your collage…';
      const file = ready || await prepare();
      ui.status.textContent = '';
      await navigator.share({ files: [file] });
      ui.dialog.close(); deps.toast('Shared.');
    } catch (error) {
      ui.status.textContent = '';
      if (error?.name === 'AbortError') return;
      if (error?.name === 'NotAllowedError') { deps.toast('Your collage is ready. Tap Share again.'); return; }
      console.error(error); deps.toast('Sharing failed. Try Download file instead.');
    }
  }

  ui.formats.addEventListener('click', event => { const button = event.target.closest('[data-format]'); if (!button) return; options.format = button.dataset.format; options.formatChosen = true; sync(); schedule(); });
  ui.flatten.addEventListener('click', event => { const button = event.target.closest('[data-flatten]'); if (button) setFlatten(button.dataset.flatten); });
  ui.flatten.addEventListener('keydown', event => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]; if (!delta) return;
    const buttons = [...ui.flatten.querySelectorAll('[data-flatten]')], next = buttons[(Math.max(0, buttons.indexOf(document.activeElement)) + delta + buttons.length) % buttons.length];
    event.preventDefault(); next.focus(); setFlatten(next.dataset.flatten);
  });
  ui.flattenCustom.addEventListener('change', () => setFlatten(ui.flattenCustom.value));
  ui.sizes.addEventListener('click', event => { const button = event.target.closest('[data-size]'); if (!button) return; options.size = button.dataset.size; sync(); schedule(); });
  ui.paper.addEventListener('change', () => { options.paper = ui.paper.value; sync(); schedule(); });
  ui.quality.addEventListener('input', () => { sync(); schedule(500); });
  ui.cancel.addEventListener('click', () => { clearTimeout(timer); if (job && !job.file) job.cancelled = true; showProgress(false); ui.status.textContent = 'Cancelled.'; });
  ui.form.addEventListener('submit', event => { event.preventDefault(); download(); });
  ui.share.addEventListener('click', share);
  byId('collageExportClose').addEventListener('click', () => ui.dialog.close());
  ui.dialog.addEventListener('click', event => { if (event.target === ui.dialog) ui.dialog.close(); });
  ui.dialog.addEventListener('close', () => { clearTimeout(timer); if (job && !job.file) job.cancelled = true; showProgress(false); });

  return {
    open() {
      limit ||= canvasLimit();
      options.size ||= deps.isPhone() ? 'share' : 'full'; // phones: the sharing size by default (memory)
      if (!options.formatChosen) options.format = transparent(deps.doc()) ? 'image/png' : 'image/jpeg'; // keep alpha by default
      ui.status.textContent = '';
      sync(); ui.dialog.showModal(); schedule(120);
    },
    /** For checks: the last prepared job ({ size, ms, file }). */
    get last() { return job && { size: job.size, ms: job.ms, file: job.file, key: job.key }; }
  };
}
