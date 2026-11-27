// Collage templates: plain data for js/collage/layout.js. Grids use relative track sizes; cells are
// [col, row, colSpan = 1, rowSpan = 1] in reading order (slot order). `aspect` is the default sheet aspect.
// Shaped templates (Task 5) cut a fill layout by a sheet shape; `lockAspect` shapes keep their own proportions.
import { naturalAspect } from './shapes.js';

/** @typedef {{ id: string, name: string, category: 'diptych'|'layout'|'collage'|'kit'|'shape'|'contact', aspect: [number, number],
 *   kind: 'grid'|'free'|'shaped'|'contact', cols?: number[], rows?: number[], cells?: number[][], slots?: object[],
 *   strips?: number, frames?: number, frame?: [number, number], sheet?: { shape: object, hole?: number },
 *   fill?: object, lockAspect?: boolean, paper?: string, border?: { width: number, color: string },
 *   look?: { gutter: number, radius?: number, border?: { width: number, color: string } } }} Template
 *  Free slots: { x, y, w, h (sheet fractions), z, shape?, border? (false: no print border), mount? (js/collage/layout.js) }.
 *  Looks are grids that bring their own paper, spacing, corners and photo border (even lines on) when picked.
 *  The picker lists Diptychs, Layouts, Collage, Scrapbook kits and Looks; shapes and contact sheets stay available to code (templateFor). */

const grid = (id, name, aspect, cols, rows, cells) => ({ id, name, category: 'layout', aspect, kind: 'grid', cols, rows, cells });
// Looks use the frame papers (js/presets.js paperColors): black, bright white, warm.
const BLACK = '#161614', BRIGHT = '#fbfbf9', WARM = '#f4efe4';
const look = (id, name, aspect, cols, rows, cells, paper, spacing) => ({ ...grid(id, name, aspect, cols, rows, cells), category: 'look', paper, look: spacing });
const gridFill = (cols, rows, cells) => ({ kind: 'grid', cols, rows, cells });
const radial = (slices, rotate = -90) => ({ kind: 'radial', slices, rotate });
/** A shaped template: proportional shapes lock the sheet aspect to their own; others start at `aspect`. */
function shaped(id, name, shape, fillLayout, { aspect = null, hole = 0 } = {}) {
  const natural = naturalAspect(shape), lockAspect = natural != null;
  return { id, name, category: 'shape', kind: 'shaped', aspect: lockAspect ? [Math.round(natural * 1e4) / 1e4, 1] : aspect, lockAspect,
    sheet: { shape, ...(hole ? { hole } : {}) }, fill: fillLayout };
}
// Honeycomb: a pointy-top hexagon and its 6 neighbours, each a third of the sheet hexagon's size, touching its sides.
const honeycomb = [[.5, .5], ...[0, 60, 120, 180, 240, 300].map(d => [.5 + Math.cos(d * Math.PI / 180) / 3, .5 + Math.sin(d * Math.PI / 180) * Math.sqrt(3) / 6])]
  .map(([x, y]) => ({ x: x - 1 / 6, y: y - 1 / 6, w: 1 / 3, h: 1 / 3, shape: { kind: 'hexagon' } }));
// Styles (from the owner's reference layouts): sheet 7:5; slots in sheet fractions. print(x0, y0, x1, y1, z, border)
const STYLE_ASPECT = [7, 5], TAUPE = '#a89a78', CLAY = '#a69480';
const print = (x0, y0, x1, y1, z, border = true) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, z, border });
/** A round photo `d` of the sheet's height across, top-left at (x, y), above the rest. */
const circle = (x, y, d) => ({ x, y, w: d * STYLE_ASPECT[1] / STYLE_ASPECT[0], h: d, z: 5, shape: { kind: 'circle' } });
// A photo whose left (or right) edge is a wide curve, in the slot's own 0–1 box.
const ARC_LEFT = { kind: 'path', d: 'M .22 0 L 1 0 L 1 1 L .32 1 C -.08 .76 -.12 .24 .22 0 Z' };
const ARC_RIGHT = { kind: 'path', d: 'M 0 0 L .78 0 C 1.12 .24 1.08 .76 .68 1 L 0 1 Z' };
const background = () => ({ x: 0, y: 0, w: 1, h: 1, z: -1, border: false, background: true });
const style = (id, name, paper, slots, category = 'layout') => ({ id, name, category, kind: 'free', aspect: STYLE_ASPECT, paper, border: { width: .005, color: '#ffffff' }, slots });
const scrapbook = (id, name, slots, decor) => ({ id, name, category: 'collage', kind: 'free', aspect: [4, 5], paper: '#d8cbb2', texture: 'fibre', border: { width: .018, color: '#fffdfa' }, slots, ...(decor ? { decor } : {}) });
// Diptychs: framed prints (thin frame, white mat, shadow) hung on a pale wall. framed() takes the photo's own box.
const WALL = '#ebe9e2', MAT = { pad: .045, color: '#fbfbf9', frame: { width: .014, color: '#f4f3ef' } };
const framed = (x0, y0, x1, y1) => ({ ...print(x0, y0, x1, y1, 1, false), shadow: true, mount: MAT });
const diptych = (id, name, aspect, slots) => ({ id, name, category: 'diptych', kind: 'free', aspect, paper: WALL, slots });
// Instant-film prints for scrapbooks: a card with a deeper bottom edge, taped across the top.
const POLAROID = { pad: .016, bottom: .06, color: '#fbfaf6' };
const polaroid = (x, y, w, h, rotate, z, tape = ['tc']) => ({ x, y, w, h, rotate, z, shadow: true, border: false, mount: POLAROID, tape });
const scrap = (kind, x, y, w, h, rotate) => ({ kind, x, y, w, h, rotate });
const fill = (cols, rows) => Array.from({ length: cols * rows }, (_, i) => [i % cols, Math.floor(i / cols)]);
const contact = (id, name, strips, frames, frame) => ({ id, name, category: 'contact', kind: 'contact', aspect: [17, 22], strips, frames, frame });

// Scrapbook kits: a finished page on a 3:4 sheet. Prints and polaroids, paper scraps and colour blocks (`decor`), plus
// stickers and captions (`stickers`, `text`) that arrive as ordinary layers when the kit is picked (js/collage/mode.js).
// Kit geometry is written in sheet widths, y included (the sheet is KIT_H widths tall), and converted here.
const KIT_H = 4 / 3, INK = '#1d1c1a', PAPER_WHITE = POLAROID.color;
const kitPolaroid = (bottom = .075, color = PAPER_WHITE) => ({ pad: .022, bottom, color });
const kitPrint = (color = PAPER_WHITE) => ({ pad: .014, color });
const kitMat = (color, frame) => ({ pad: .026, color, frame: { width: .004, color: frame } });
/** A print: photo top-left (x, y), width w, photo shape w:h `ratio`, on `mount`. */
const kp = (x, y, w, ratio, rotate, mount, { z = 1, tape = ['tc'], tapeColor = null } = {}) =>
  ({ x, y: y / KIT_H, w, h: w / ratio / KIT_H, rotate, z, shadow: true, border: false, mount, tape, ...(tapeColor ? { tapeColor } : {}) });
/** A paper scrap or colour block (js/collage/render.js drawDecor). */
const kd = (x, y, w, h, rotate, style = {}) => ({ kind: 'paper', x, y: y / KIT_H, w, h: h / KIT_H, rotate, ...style });
const kitSticker = (kind, x, y, size, rotate = 0, flip = false) => ({ kind, x, y: y / KIT_H, size, rotate, flip });
const kitText = (content, x, y, style = {}) => ({ content, x, y: y / KIT_H, size: .06, rotate: 0, color: INK, font: 'handwritten', bold: false, shadow: false, ...style });
const TITLE = { font: 'playfair', size: .1 }, LABEL = { font: 'typewriter', size: .026, bold: true };
/** Text centred on a print's caption strip (the polaroid's deep bottom edge), turned with the print. */
function onPrint(slot, content, style = {}) {
  const bottom = slot.mount.bottom ?? slot.mount.pad, cx = slot.x + slot.w / 2, cy = (slot.y + slot.h / 2) * KIT_H;
  const dy = (slot.y + slot.h) * KIT_H + bottom / 2 - cy, a = slot.rotate * Math.PI / 180;
  return kitText(content, cx - dy * Math.sin(a), cy + dy * Math.cos(a), { rotate: slot.rotate, size: Math.min(.07, bottom * .72), ...style });
}
const kit = (id, name, { paper, texture = 'fibre', decor = [], prints, stickers = [], text = [] }, category = 'kit-classic') =>
  ({ id, name, category, kind: 'free', aspect: [3, 4], paper, texture, border: { width: .018, color: '#fffdfa' }, slots: prints, decor, stickers, text });
const flat = { edge: 'straight', shadow: false };

// The first kits (bright themed pages): no longer in the picker, kept so collages saved with them still open.
const classicKits = [
  (() => { // Summer days: the home screen's sample page
    const tape = 'rgba(240,214,150,.72)', p = [kp(.094, .124, .492, 4 / 5, -3, kitPolaroid(.1), { z: 3, tapeColor: tape }), kp(.554, .064, .392, 3 / 2, 4, kitPrint(), { z: 2, tapeColor: tape }),
      kp(.624, .395, .292, 1, 5, kitPolaroid(.065), { z: 2, tape: [] }), kp(.054, .896, .372, 4 / 3, 6, kitPrint(), { tapeColor: tape }), kp(.544, .827, .352, 1, -5, kitPolaroid(.07), { z: 4, tapeColor: tape })];
    return kit('kit-summer-5', 'Summer days · 5', { paper: TAUPE, prints: p,
      stickers: [kitSticker('emoji-2600', .08, .093, .14, -12), kitSticker('emoji-2728', .925, .707, .09, 10), kitSticker('emoji-1f33c', .9, 1.187, .12, 14)],
      text: [onPrint(p[0], 'summer days'), onPrint(p[4], '♡'), kitText('little moments', .24, 1.24, { size: .075, rotate: -5, color: '#faf8f2' })] });
  })(),
  (() => { // Besties: blush paper, a polka-dot block, pink tape
    const ink = '#8c3a4a', tape = 'rgba(240,160,180,.7)', p = [kp(.08, .3, .44, 1, -4, kitPolaroid(.09), { tapeColor: tape }), kp(.52, .44, .4, 4 / 5, 5, kitPolaroid(.08), { z: 2, tape: [] }),
      kp(.14, .87, .34, 1, 3, kitPolaroid(.08), { z: 3, tapeColor: tape })];
    return kit('kit-besties-3', 'Besties · 3', { paper: '#f1dcd6', prints: p,
      decor: [kd(.52, 0, .48, .62, 0, { color: '#f7e8e3', pattern: 'dots', ink: 'rgba(196,96,118,.22)', ...flat }), kd(.03, .8, .46, .3, -5, { kind: 'graph' })],
      stickers: [kitSticker('hearts', .86, .17, .14, 12), kitSticker('bow', .72, .44, .12, -6), kitSticker('sparkles', .6, .1, .08), kitSticker('bestie', .74, 1.18, .3, -6)],
      text: [kitText('best friends', .3, .13, { ...TITLE, size: .095, color: ink }), kitText('FOREVER · ALWAYS', .3, .21, { ...LABEL, color: ink }), onPrint(p[0], 'us ♡'), onPrint(p[2], 'since day one', { size: .052 })] });
  })(),
  (() => { // Birthday: striped banner, teal and marigold tape, confetti strip
    const ink = '#a8392f', p = [kp(.07, .33, .4, 1, -3, kitPolaroid(.08), { tapeColor: 'rgba(126,196,207,.78)' }), kp(.53, .31, .4, 1, 3.5, kitPolaroid(.08), { tapeColor: 'rgba(247,191,90,.8)' }),
      kp(.08, .87, .4, 5 / 4, 2, kitPrint(), { z: 2, tapeColor: 'rgba(240,150,160,.75)' }), kp(.54, .84, .38, 5 / 4, -3, kitPolaroid(.075), { z: 2, tapeColor: 'rgba(126,196,207,.78)' })];
    return kit('kit-birthday-4', 'Birthday · 4', { paper: '#fbf3e6', prints: p,
      decor: [kd(0, 0, 1, .29, 0, { color: '#f6cfc6', pattern: 'stripes', ink: 'rgba(255,255,255,.38)', ...flat }), kd(-.02, 1.14, 1.04, .22, 0, { color: '#fbe7c9', pattern: 'dots', ink: 'rgba(232,120,90,.32)' })],
      stickers: [kitSticker('sparkles', .06, .06, .07), kitSticker('balloon', .93, .37, .13, 10), kitSticker('cupcake', .1, 1.24, .13, -8), kitSticker('gift', .9, 1.25, .12, 8)],
      text: [kitText('Happy Birthday', .5, .13, { ...TITLE, size: .105, color: ink }), kitText('MAKE A WISH', .5, .22, { ...LABEL, size: .03, color: ink }), onPrint(p[0], 'party time'), onPrint(p[3], 'best day ever', { size: .05 })] });
  })(),
  (() => { // Travel diary: kraft, graph and lined scraps, a journal note
    const ink = '#2f3b46', tape = 'rgba(240,234,220,.75)', p = [kp(.5, .05, .44, 3 / 2, 3, kitPrint(), { tape: ['tl', 'tr'], tapeColor: tape }), kp(.07, .3, .4, 1, -4, kitPolaroid(.08), { z: 2, tapeColor: tape }),
      kp(.54, .44, .38, 4 / 5, 4, kitPrint(), { z: 2, tapeColor: tape }), kp(.08, .9, .46, 3 / 2, -2, kitPrint(), { z: 3, tapeColor: tape })];
    return kit('kit-travel-4', 'Travel diary · 4', { paper: '#d8c6a3', prints: p,
      decor: [kd(.03, .52, .34, .45, -6, { kind: 'graph' }), kd(.56, 1.02, .4, .26, 3, { kind: 'lined' })],
      stickers: [kitSticker('map-pin', .9, .42, .1, 8), kitSticker('emoji-2708', .47, .84, .12, -20), kitSticker('stamp', .88, .98, .13, 10), kitSticker('ticket', .25, 1.26, .22, -6)],
      text: [kitText('Wanderlust', .25, .12, { ...TITLE, size: .085, color: ink }), kitText('NOTES FROM THE ROAD', .25, .19, { ...LABEL, color: ink }), onPrint(p[1], 'somewhere new'),
        kitText('best trip ever', .78, 1.16, { size: .06, rotate: 3, color: '#2d3a66' })] });
  })(),
  (() => { // Wedding: ivory, a hairline gold border, matted prints with gold frames, no tape
    const gold = '#c9a86a', ink = '#8a6a3b', mat = kitMat('#fffdf8', gold), p = [kp(.12, .3, .76, 3 / 2, 0, mat, { tape: [] }), kp(.12, .9, .35, 1, -1.5, mat, { tape: [] }), kp(.53, .9, .35, 1, 1.5, mat, { tape: [] })];
    return kit('kit-wedding-3', 'Just married · 3', { paper: '#f5f0e8', texture: 'none', prints: p,
      decor: [kd(.04, .04, .92, KIT_H - .08, 0, { color: '#d9c39a', ...flat }), kd(.046, .046, .908, KIT_H - .092, 0, { color: '#f5f0e8', ...flat })],
      stickers: [kitSticker('leaf', .1, .2, .07, -35), kitSticker('leaf', .9, .2, .07, 35, true)],
      text: [kitText('Just Married', .5, .14, { ...TITLE, size: .1, color: ink }), kitText('TWO HEARTS · ONE LOVE', .5, .23, { ...LABEL, color: ink })] });
  })(),
  (() => { // New baby: mint, a gingham band, baby-blue and pink tape
    const ink = '#4f7266', p = [kp(.08, .29, .5, 4 / 5, -2, kitPolaroid(.09), { tapeColor: 'rgba(170,205,230,.78)' }), kp(.62, .28, .3, 1, 4, kitPolaroid(.065), { tapeColor: 'rgba(244,190,200,.78)' }),
      kp(.6, .7, .32, 1, -3, kitPolaroid(.065), { z: 2, tapeColor: 'rgba(170,205,230,.78)' }), kp(.14, 1.03, .4, 2, 2, kitPrint(), { z: 3, tapeColor: 'rgba(244,190,200,.78)' })];
    return kit('kit-baby-4', 'New baby · 4', { paper: '#e9f0ec', prints: p,
      decor: [kd(-.02, .96, 1.04, .4, 0, { color: '#d7e6de', pattern: 'gingham', ink: 'rgba(255,255,255,.45)' })],
      stickers: [kitSticker('cloud', .88, .13, .14), kitSticker('star', .1, .2, .07, -10), kitSticker('emoji-1f9f8', .84, 1.22, .14, 8), kitSticker('star', .62, 1.25, .06, 10)],
      text: [kitText('hello, little one', .5, .12, { ...TITLE, size: .09, color: ink }), kitText('WELCOME TO THE WORLD', .5, .2, { ...LABEL, color: ink }), onPrint(p[0], 'so loved'), onPrint(p[2], '♡')] });
  })(),
  (() => { // Graduation: navy and gold
    const gold = '#e6c77c', p = [kp(.07, .3, .48, 4 / 5, -3, kitPolaroid(.09), { tape: [] }), kp(.58, .32, .35, 1, 4, kitPolaroid(.07), { tapeColor: 'rgba(216,184,106,.85)' }),
      kp(.56, .78, .36, 1, -4, kitPolaroid(.07), { z: 2, tapeColor: 'rgba(216,184,106,.85)' })];
    return kit('kit-graduation-3', 'Graduation · 3', { paper: '#1f2b45', texture: 'none', prints: p,
      decor: [kd(0, 0, 1, KIT_H, 0, { color: '#1f2b45', pattern: 'stripes', ink: 'rgba(255,255,255,.025)', ...flat }), kd(-.05, 1.1, 1.1, .12, -3, { color: '#d8b86a' })],
      stickers: [kitSticker('emoji-1f393', .12, .28, .15, -15), kitSticker('star', .93, .25, .07, 12), kitSticker('sparkles', .07, 1.03, .08), kitSticker('graduate', .3, 1.21, .36, -4)],
      text: [kitText('Congrats, Grad!', .5, .12, { ...TITLE, color: gold }), kitText('THE TASSEL WAS WORTH THE HASSLE', .5, .2, { ...LABEL, size: .024, color: gold }),
        onPrint(p[0], 'we did it!'), onPrint(p[2], 'so proud', { size: .05 })] });
  })(),
  (() => { // Holidays: pine green, red gingham, red tape
    const tape = 'rgba(200,64,58,.82)', p = [kp(.07, .31, .4, 1, -3, kitPolaroid(.08), { tapeColor: tape }), kp(.53, .3, .4, 1, 3, kitPolaroid(.08), { tapeColor: tape }),
      kp(.08, .83, .4, 5 / 4, 2, kitPolaroid(.07), { z: 2, tape: [] }), kp(.53, .8, .4, 5 / 4, -2.5, kitPolaroid(.07), { z: 2, tape: [] })];
    return kit('kit-holidays-4', 'Holidays · 4', { paper: '#2e4a3b', texture: 'none', prints: p,
      decor: [kd(0, 1.1, 1, KIT_H - 1.1, 0, { color: '#b8433d', pattern: 'gingham', ink: 'rgba(255,255,255,.18)', ...flat })],
      stickers: [kitSticker('emoji-2744', .06, .06, .07, -10), kitSticker('emoji-2744', .94, .2, .05, 15), kitSticker('emoji-1f384', .91, .3, .12, 8), kitSticker('emoji-1f381', .5, 1.27, .12)],
      text: [kitText('Merry & Bright', .5, .13, { ...TITLE, size: .105, color: '#f4ead8' }), kitText("SEASON'S GREETINGS", .5, .215, { ...LABEL, color: '#e5c88a' }),
        onPrint(p[0], 'cozy days'), onPrint(p[3], 'joy')] });
  })(),
  (() => { // Pets: warm cream, a dotted side panel, amber tape
    const ink = '#6b4528', tape = 'rgba(232,170,96,.78)', p = [kp(.06, .28, .44, 1, -4, kitPolaroid(.08), { z: 2, tapeColor: tape }), kp(.56, .06, .36, 4 / 5, 4, kitPrint(), { tapeColor: tape }),
      kp(.55, .58, .38, 1, 3, kitPolaroid(.075), { z: 2, tapeColor: tape }), kp(.1, .9, .42, 4 / 3, -2, kitPrint(), { z: 3, tapeColor: tape })];
    return kit('kit-pets-4', 'Pets · 4', { paper: '#f2e4cc', prints: p,
      decor: [kd(.55, 0, .45, KIT_H, 0, { color: '#e8d2ad', pattern: 'dots', ink: 'rgba(120,84,48,.15)', ...flat }), kd(.02, .95, .5, .3, -4, { kind: 'kraft' })],
      stickers: [kitSticker('paw', .9, .57, .1, 15), kitSticker('heart', .48, .86, .08, 10), kitSticker('emoji-1f43e', .86, 1.2, .13, 10), kitSticker('paw', .6, 1.2, .08, -10)],
      text: [kitText('my best friend', .27, .12, { ...TITLE, size: .072, color: ink }), kitText('GOOD BOY · GOOD GIRL', .27, .19, { ...LABEL, size: .024, color: ink }), onPrint(p[0], 'best buddy'), onPrint(p[2], '♡')] });
  })(),
  (() => { // Love: a blush card on a dark sheet, black polaroids with white handwriting
    const ink = '#7d3341', card = '#1c1a1b', white = { color: '#f5ece9' }, p = [kp(.12, .33, .42, 1, -3, kitPolaroid(.085, card), { tape: [] }),
      kp(.48, .44, .38, 4 / 5, 4, kitPolaroid(.08, card), { z: 2, tape: [] }), kp(.16, .86, .34, 4 / 3, -2, kitPolaroid(.075, card), { z: 3, tape: [] })];
    return kit('kit-love-3', 'Love · 3', { paper: '#2a2326', texture: 'none', prints: p,
      decor: [kd(.06, .06, .88, KIT_H - .12, 0, { color: '#efd7d2', edge: 'straight' })],
      stickers: [kitSticker('hearts', .82, .13, .1, 10), kitSticker('emoji-1f48c', .14, .31, .1, -12), kitSticker('emoji-1f339', .82, 1.13, .14, -15)],
      text: [kitText('you & me', .5, .17, { ...TITLE, size: .12, color: ink }), kitText('A LOVE STORY', .5, .26, { ...LABEL, color: ink }),
        onPrint(p[0], 'forever', white), onPrint(p[2], 'xo', white)] });
  })()
];


// Scrapbook kits (the picker's row): layered, muted pages of torn paper, polaroids, film strips and pressed flowers.
// Scraps are decor kinds from js/collage/render.js (cream, aged, tan, sage, blush, rose, peach, map, letter, news, note,
// grid, check, card, tape, film); stickers from the 'vintage' group of js/collage/stickers.js.
const SHEET = '#ede5d5', CARD = '#fbf8f1', PEN = '#3f342a';
const TAPES = { cream: 'rgba(236,224,196,.86)', kraft: 'rgba(214,192,150,.86)', sage: 'rgba(188,198,172,.86)', blush: 'rgba(228,192,180,.86)' };
const pol = (bottom = .075) => kitPolaroid(bottom, CARD), prt = (pad = .014) => ({ pad, color: CARD });
const scrapOf = (kind, x, y, w, h, rotate = 0, style = {}) => kd(x, y, w, h, rotate, { kind, ...style });
/** A photo without a card (inside a grid card or a film strip). Top-left (x, y), width w, w:h `ratio`, in sheet widths. */
const bare = (x, y, w, ratio, rotate = 0, z = 1) => ({ x, y: y / KIT_H, w, h: w / ratio / KIT_H, rotate, z, shadow: false, border: false });
/** A film strip: decor plus `n` photo frames as slots (rotated with it). Top-left (x, y), `len` along it, `thick`
 *  across, in sheet widths; `across`: horizontal. */
function film(x, y, len, thick, n, across, rotate = 0, z = 1) {
  const w = across ? len : thick, h = across ? thick : len, edge = thick * .17, gap = thick * .06, frame = (len - gap * (n + 1)) / n;
  const cx = x + w / 2, cy = y + h / 2, a = rotate * Math.PI / 180, slots = [];
  for (let i = 0; i < n; i++) {
    const along = -len / 2 + gap + frame / 2 + i * (frame + gap), dx = across ? along : 0, dy = across ? 0 : along;
    const fx = cx + dx * Math.cos(a) - dy * Math.sin(a), fy = cy + dx * Math.sin(a) + dy * Math.cos(a), fw = across ? frame : thick - 2 * edge, fh = across ? thick - 2 * edge : frame;
    slots.push(bare(fx - fw / 2, fy - fh / 2, fw, fw / fh, rotate, z));
  }
  return { decor: kd(x, y, w, h, rotate, { kind: 'film' }), slots };
}
const pkit = (id, name, page) => kit(id, name, { paper: SHEET, ...page }, 'kit');
const note = (content, x, y, style = {}) => kitText(content, x, y, { color: PEN, ...style });
const list = (content, x, y, rotate) => note(content, x, y, { size: .034, align: 'left', rotate });

const kits = [
  (() => { // Layered memories: newsprint, letters and a film strip under a pile of prints
    const strip = film(.67, .3, .5, .2, 2, false, 5, 6);
    return pkit('kit-layered-6', 'Layered memories · 6', {
      decor: [scrapOf('news', .03, .1, .3, .52, -3), scrapOf('aged', .22, .03, .58, .46, 2), scrapOf('grid', .6, .01, .34, .22, -5), scrapOf('tan', .64, .44, .33, .36, 5),
        scrapOf('letter', .05, .86, .52, .4, -2), scrapOf('cream', .5, .96, .47, .32, 3), strip.decor],
      prints: [kp(.09, .05, .22, 1, -4, pol(), { z: 2, tapeColor: TAPES.cream }), kp(.31, .26, .34, 4 / 5, -2, prt(), { z: 4, tape: [] }), kp(.07, .4, .2, 3 / 4, 3, prt(), { z: 3, tape: [] }),
        kp(.1, .86, .3, 1, -5, pol(), { z: 5, tapeColor: TAPES.kraft }), ...strip.slots],
      stickers: [kitSticker('babys-breath', .56, .15, .2, 8), kitSticker('binder-clip', .19, .85, .07, -8), kitSticker('golden-flowers', .86, 1.13, .2, -10)],
      text: [note('little moments', .73, 1.22, { size: .05, rotate: 3, font: 'handwritten' })] });
  })(),
  pkit('kit-travel-journal-3', 'Travel journal · 3', {
    decor: [scrapOf('map', .03, .03, .94, .66, -1), scrapOf('aged', .04, .82, .44, .44, -3), scrapOf('tan', .47, .76, .5, .52, 2), scrapOf('note', .08, .98, .38, .27, -4),
      scrapOf('cream', .1, .64, .3, .13, 4)],
    prints: [kp(.07, .11, .42, 1, -3, pol(), { z: 2, tapeColor: TAPES.cream }), kp(.53, .3, .4, 4 / 3, 4, prt(), { z: 2, tape: ['tr'], tapeColor: TAPES.kraft }),
      kp(.52, .78, .36, 1, -2, pol(), { z: 3, tapeColor: TAPES.sage })],
    stickers: [kitSticker('vintage-stamp', .66, .11, .11, 6), kitSticker('postmark', .84, .17, .2, -6), kitSticker('eucalyptus', .07, 1.08, .14, -14), kitSticker('wax-seal', .44, 1.24, .08)],
    text: [note('Amalfi Coast', .25, .705, { size: .052, rotate: 4, font: 'handwritten' }), list('☐ Explore the town\n☐ Local food\n☐ Beach walk\n☑ Take photos', .27, 1.115, -4)] }),
  pkit('kit-polaroid-wall-4', 'Polaroid wall · 4', {
    decor: [scrapOf('aged', .04, .04, .92, 1.25, 0), scrapOf('tan', 0, .3, .48, .52, -3), scrapOf('letter', .58, 0, .38, .3, 3), scrapOf('cream', .55, .76, .45, .52, 4)],
    prints: [kp(.08, .1, .38, 1, -3, pol(), { tapeColor: TAPES.cream }), kp(.54, .14, .36, 1, 3, pol(), { z: 2, tapeColor: TAPES.kraft }),
      kp(.1, .68, .36, 1, 2, pol(), { z: 2, tapeColor: TAPES.kraft }), kp(.53, .7, .38, 1, -2, pol(), { z: 3, tapeColor: TAPES.cream })],
    stickers: [kitSticker('babys-breath', .87, .1, .2, 10), kitSticker('golden-flowers', .09, 1.21, .18, -8)] }),
  (() => { // Film & notes: a film strip down the page over letters, a grid scrap and a ticket
    const strip = film(.3, .08, 1.14, .32, 3, false, -2, 2);
    return pkit('kit-film-notes-3', 'Film & notes · 3', {
      decor: [scrapOf('letter', .04, .05, .5, .62, -2), scrapOf('aged', .55, .1, .4, .46, 3), scrapOf('rose', .02, .62, .38, .4, -4), scrapOf('grid', .07, .88, .3, .38, 3),
        scrapOf('news', .6, .8, .36, .32, -3), strip.decor],
      prints: strip.slots,
      stickers: [kitSticker('golden-flowers', .82, .46, .26, 8), kitSticker('admit-one', .79, 1.2, .26, -4), kitSticker('postmark', .79, .1, .22, 6), kitSticker('babys-breath', .14, .5, .16, -10)] });
  })(),
  pkit('kit-botanical-2', 'Botanical journal · 2', {
    decor: [scrapOf('aged', .1, .06, .8, 1.2, 1), scrapOf('tan', .56, .08, .38, .42, 4), scrapOf('cream', .52, .74, .42, .5, -3), scrapOf('letter', .1, .95, .42, .32, -2),
      scrapOf('cream', .62, .6, .33, .13, -3)],
    prints: [kp(.19, .1, .44, 4 / 5, -3, pol(), { tape: ['tl', 'tr'], tapeColor: TAPES.sage }), kp(.56, .76, .32, 1, 3, prt(), { z: 2, tapeColor: TAPES.cream })],
    stickers: [kitSticker('eucalyptus', .12, .62, .24, -12), kitSticker('babys-breath', .3, 1.14, .2, 8), kitSticker('fern', .82, .3, .18, 10), kitSticker('line-branch', .44, 1.06, .11, 12)],
    text: [note('Field Notes', .785, .665, { size: .056, rotate: -3, font: 'handwritten' })] }),
  (() => { // Grid scrapbook: six photos on a white card, taped down over torn paper
    const cols = [.115, .3767, .6384], rows = [.195, .63], w = .2466;
    return pkit('kit-grid-6', 'Grid scrapbook · 6', {
      decor: [scrapOf('tan', .04, .08, .5, .52, -4), scrapOf('aged', .46, .84, .5, .44, 3), scrapOf('sage', 0, .98, .32, .28, 2), scrapOf('card', .08, .16, .84, 1.0, 0, { shadow: true }),
        scrapOf('tape', .4, .13, .2, .06, -2)],
      prints: rows.flatMap(y => cols.map(x => bare(x, y, w, w / .41))),
      stickers: [kitSticker('eucalyptus', .9, 1.14, .16, 18)] });
  })(),
  pkit('kit-cluster-3', 'Polaroid cluster · 3', {
    decor: [scrapOf('aged', .08, .08, .84, 1.16, -1), scrapOf('check', .03, .72, .34, .38, -6), scrapOf('letter', .6, .05, .32, .28, 4), scrapOf('tan', .6, .9, .36, .36, 3)],
    prints: [kp(.1, .12, .4, 1, -4, pol(), { tapeColor: TAPES.cream }), kp(.47, .3, .42, 4 / 5, 4, pol(), { z: 2, tape: ['tr'], tapeColor: TAPES.kraft }),
      kp(.3, .86, .3, 1, 2, pol(), { z: 3, tapeColor: TAPES.blush })],
    stickers: [kitSticker('twine', .2, 1.24, .2, -6), kitSticker('babys-breath', .86, 1.1, .2, 10), kitSticker('heart', .86, .13, .07, 12)] }),
  pkit('kit-good-times-2', 'Good times · 2', {
    decor: [scrapOf('aged', .06, .06, .88, 1.22, 1), scrapOf('blush', .58, .04, .38, .32, 4), scrapOf('cream', .06, .9, .42, .36, -3), scrapOf('cream', .08, .55, .28, .2, -5)],
    prints: [kp(.12, .1, .44, 1, -3, pol(), { tapeColor: TAPES.cream }), kp(.46, .52, .42, 4 / 5, 4, pol(), { z: 2, tapeColor: TAPES.blush })],
    stickers: [kitSticker('heart', .84, .12, .09, 12), kitSticker('ice-cream', .13, .44, .1, -12), kitSticker('star', .18, .86, .07, -10), kitSticker('camera', .3, 1.12, .16, -6), kitSticker('smiley', .88, .44, .08, 8), kitSticker('heart', .86, 1.22, .08, -8)],
    text: [note('Good\nTimes', .22, .65, { size: .065, rotate: -5, font: 'handwritten', bold: true })] }),
  pkit('kit-daily-2', 'Daily life · 2', {
    decor: [scrapOf('aged', .06, .05, .86, 1.2, 1), scrapOf('news', 0, .02, .3, .3, -4), scrapOf('tan', .62, .2, .34, .42, 4), scrapOf('note', .05, .82, .4, .46, -4)],
    prints: [kp(.1, .08, .48, 1, -3, pol(), { tapeColor: TAPES.cream }), kp(.47, .6, .44, 1, 4, pol(), { z: 2, tape: ['tr'], tapeColor: TAPES.kraft })],
    stickers: [kitSticker('eucalyptus', .82, .2, .22, 16), kitSticker('twine', .25, 1.25, .2, -4)],
    text: [note('Coffee Time', .25, .91, { size: .055, rotate: -4, font: 'handwritten' }), list('☐ Espresso\n☐ Latte\n☐ Croissant\n☑ Good mood', .24, 1.06, -4)] }),
  pkit('kit-travel-map-3', 'Travel map · 3', {
    decor: [scrapOf('map', .03, .03, .94, 1.27, 1), scrapOf('cream', .06, .37, .36, .14, -6)],
    prints: [kp(.46, .06, .44, 4 / 5, 4, pol(), { tapeColor: TAPES.cream }), kp(.06, .72, .4, 1, -4, pol(), { z: 2, tapeColor: TAPES.kraft }),
      kp(.52, .82, .36, 4 / 3, 3, prt(), { z: 2, tape: ['tr'], tapeColor: TAPES.cream })],
    stickers: [kitSticker('map-pin', .9, .74, .08), kitSticker('compass', .88, 1.24, .13, 10), kitSticker('vintage-stamp', .14, .13, .1, -6)],
    text: [note('Road Trip', .24, .44, { size: .06, rotate: -6, font: 'handwritten' })] }),
  pkit('kit-minimal-2', 'Minimal · 2', {
    decor: [scrapOf('peach', .62, .06, .3, .3, 0, { shape: 'circle' }), scrapOf('sage', .04, .58, .34, .58, 0, { shape: 'arch', shadow: false }), scrapOf('tan', .08, 1.17, .42, .08, -2)],
    prints: [kp(.12, .12, .48, 3 / 4, -2, prt(), { tapeColor: TAPES.cream }), kp(.44, .6, .45, 4 / 5, 3, prt(), { z: 2, tape: ['tr'], tapeColor: TAPES.cream })],
    stickers: [kitSticker('babys-breath', .88, .5, .18, 10)] }),
  (() => { // Film contact: three strips of three frames, a date in the corner
    const strips = [film(.07, .2, .86, .28, 3, true, -2, 2), film(.08, .49, .86, .28, 3, true, -.8, 3), film(.07, .78, .86, .28, 3, true, -1.8, 4)];
    return pkit('kit-film-contact-9', 'Film contact · 9', {
      decor: [scrapOf('tan', .02, .08, .6, .5, -4), scrapOf('letter', .42, .02, .54, .34, 5), scrapOf('aged', 0, .82, .6, .48, 3), scrapOf('grid', .5, .88, .48, .42, -3), ...strips.map(s => s.decor)],
      prints: strips.flatMap(s => s.slots),
      stickers: [kitSticker('babys-breath', .12, 1.2, .2, -10)],
      text: [note("'25 04 18", .8, 1.11, { size: .032, font: 'typewriter', bold: true, color: '#e0782e' })] });
  })(),
  (() => { // Moodboard: white polaroids on sand, line-art florals and a colour palette
    const card = kitPolaroid(.07, '#f8f7f4');
    return pkit('kit-moodboard-7', 'Moodboard · 7', { paper: '#e2d5c4', texture: 'none',
      // Laid nearly square, each a hair off (under 1°), overlapping like prints on a board.
      prints: [kp(.08, .1, .26, 1, -.8, card), kp(.4, .06, .26, 4 / 3, .6, card), kp(.71, .1, .23, 4 / 5, -.5, card), kp(.14, .44, .38, 4 / 3, .4, kitPolaroid(.1, '#f8f7f4'), { z: 3 }),
        kp(.6, .5, .32, 1, -.6, card, { z: 2 }), kp(.07, .9, .3, 1, .7, card, { z: 2 }), kp(.46, .92, .42, 4 / 3, -.4, card, { z: 4 })].map(slot => ({ ...slot, tape: [] })),
      stickers: [kitSticker('line-flower', .08, .1, .13, -10), kitSticker('line-branch', .67, .33, .1, 18), kitSticker('line-flower', .9, .87, .13, 12), kitSticker('line-branch', .07, .82, .1, -14),
        kitSticker('swatches', .33, .776, .05, 90)] });
  })(),
  pkit('kit-sun-sage-4', 'Sun & sage · 4', {
    decor: [scrapOf('peach', .58, .06, .3, .3, 0, { shape: 'circle' }), scrapOf('sage', .76, .24, .2, .4, 0, { edge: 'straight', shadow: false }), scrapOf('aged', .36, 1.14, .5, .1, -2)],
    prints: [kp(.14, .18, .7, 3 / 2, 0, prt(), { tape: [] }), kp(.12, .76, .23, 3 / 4, 0, prt(), { tape: [] }), kp(.385, .76, .23, 3 / 4, 0, prt(), { tape: [] }), kp(.65, .76, .23, 3 / 4, 0, prt(), { tape: [] })],
    stickers: [kitSticker('eucalyptus', .1, .4, .22, -12)] }),
  pkit('kit-panorama-3', 'Panorama · 3', {
    decor: [scrapOf('peach', .62, .1, .26, .26, 0, { shape: 'circle' }), scrapOf('tan', .28, 1.06, .52, .1, -2)],
    prints: [.12, .39, .66].map(x => kp(x, .28, .23, .34, 0, prt(.01), { tape: [] })) })
];

/** @type {Template[]} */
export const templates = [
  // Diptychs
  diptych('diptych-stack', 'Pair, stacked', [4, 5], [framed(.25, .12, .75, .42), framed(.25, .58, .75, .88)]),
  diptych('diptych-side', 'Pair, side by side', [3, 2], [framed(.12, .17, .45, .83), framed(.55, .17, .88, .83)]),
  diptych('diptych-wide', 'Pair, wide', [16, 9], [framed(.06, .24, .45, .76), framed(.55, .24, .94, .76)]),
  diptych('diptych-large-small', 'Large + small', [4, 3], [framed(.08, .12, .58, .88), framed(.68, .3, .9, .7)]),
  diptych('triptych-row', 'Triptych', [16, 9], [framed(.1, .16, .3, .84), framed(.4, .16, .6, .84), framed(.7, .16, .9, .84)]),
  diptych('triptych-stack', 'Triptych, stacked', [2, 3], [framed(.23, .08, .77, .29), framed(.23, .395, .77, .605), framed(.23, .71, .77, .92)]),
  diptych('frames-4', 'Four frames', [1, 1], [framed(.12, .12, .43, .43), framed(.57, .12, .88, .43), framed(.12, .57, .43, .88), framed(.57, .57, .88, .88)]),
  diptych('gallery-5', 'Gallery wall · 5', [3, 2], [framed(.07, .1, .26, .43), framed(.07, .57, .26, .9), framed(.35, .1, .65, .9), framed(.74, .1, .93, .43), framed(.74, .57, .93, .9)]),
  // Layouts
  grid('grid-2-side', '2 side by side', [3, 2], [1, 1], [1], fill(2, 1)),
  grid('grid-2-stack', '2 stacked', [2, 3], [1], [1, 1], fill(1, 2)),
  grid('grid-3-cols', '3 columns', [3, 2], [1, 1, 1], [1], fill(3, 1)),
  grid('grid-3-rows', '3 rows', [2, 3], [1], [1, 1, 1], fill(1, 3)),
  grid('grid-3-left', '1 large + 2', [3, 2], [2, 1], [1, 1], [[0, 0, 1, 2], [1, 0], [1, 1]]),
  grid('grid-3-top', '1 wide + 2', [4, 5], [1, 1], [3, 2], [[0, 0, 2, 1], [0, 1], [1, 1]]),
  grid('grid-4', '2 × 2', [1, 1], [1, 1], [1, 1], fill(2, 2)),
  grid('grid-4-top', '1 wide + 3', [4, 5], [1, 1, 1], [2, 1], [[0, 0, 3, 1], [0, 1], [1, 1], [2, 1]]),
  grid('grid-4-left', '1 tall + 3', [3, 2], [2, 1], [1, 1, 1], [[0, 0, 1, 3], [1, 0], [1, 1], [1, 2]]),
  grid('grid-6', '3 × 2', [3, 2], [1, 1, 1], [1, 1], fill(3, 2)),
  grid('grid-6-tall', '2 × 3', [2, 3], [1, 1], [1, 1, 1], fill(2, 3)),
  grid('grid-9', '3 × 3', [1, 1], [1, 1, 1], [1, 1, 1], fill(3, 3)),
  grid('bands-3', '3 bands', [3, 4], [1], [1, 1.15, 1], fill(1, 3)),
  grid('bands-4', '4 bands', [4, 5], [1], [1, 1, 1, 1], fill(1, 4)),
  grid('grid-4-cols', '4 columns', [16, 9], [1, 1, 1, 1], [1], fill(4, 1)),
  grid('grid-3-right', '2 + 1 large', [3, 2], [1, 2], [1, 1], [[0, 0], [1, 0, 1, 2], [0, 1]]),
  grid('grid-3-bottom', '2 + 1 wide', [4, 5], [1, 1], [2, 3], [[0, 0], [1, 0], [0, 1, 2, 1]]),
  grid('grid-5-top', '1 wide + 4', [4, 5], [1, 1, 1, 1], [3, 2], [[0, 0, 4, 1], [0, 1], [1, 1], [2, 1], [3, 1]]),
  grid('grid-5-centre', '1 centre + 4', [3, 2], [1, 2, 1], [1, 1], [[0, 0], [1, 0, 1, 2], [2, 0], [0, 1], [2, 1]]),
  grid('grid-6-hero', '1 large + 5', [1, 1], [1, 1, 1], [1, 1, 1], [[0, 0, 2, 2], [2, 0], [2, 1], [0, 2], [1, 2], [2, 2]]),
  // Looks: the same grids, styled. Night story: a phone story, hairline black lines all round.
  look('look-night-2', 'Night story · 2', [9, 16], [1], [1, 1], fill(1, 2), BLACK, { gutter: .008 }),
  look('look-night-3', 'Night story · 3', [9, 16], [1], [1, 1, 1], fill(1, 3), BLACK, { gutter: .008 }),
  look('look-night-4', 'Night story · 4', [9, 16], [1, 1], [1, 1], fill(2, 2), BLACK, { gutter: .008 }),
  // Seamless: no lines at all, photos edge to edge (names: columns × rows, kept on one line).
  look('look-seamless-2-side', 'Seamless · 2\u00a0×\u00a01', [3, 2], [1, 1], [1], fill(2, 1), BRIGHT, { gutter: 0 }),
  look('look-seamless-2-stack', 'Seamless · 1\u00a0×\u00a02', [2, 3], [1], [1, 1], fill(1, 2), BRIGHT, { gutter: 0 }),
  look('look-seamless-3-cols', 'Seamless · 3\u00a0×\u00a01', [3, 2], [1, 1, 1], [1], fill(3, 1), BRIGHT, { gutter: 0 }),
  look('look-seamless-3-rows', 'Seamless · 1\u00a0×\u00a03', [9, 16], [1], [1, 1, 1], fill(1, 3), BRIGHT, { gutter: 0 }),
  look('look-seamless-3-left', 'Seamless · 1\u00a0+\u00a02', [3, 2], [2, 1], [1, 1], [[0, 0, 1, 2], [1, 0], [1, 1]], BRIGHT, { gutter: 0 }),
  look('look-seamless-4', 'Seamless · 2\u00a0×\u00a02', [1, 1], [1, 1], [1, 1], fill(2, 2), BRIGHT, { gutter: 0 }),
  look('look-seamless-4-top', 'Seamless · 1\u00a0+\u00a03', [4, 5], [1, 1, 1], [2, 1], [[0, 0, 3, 1], [0, 1], [1, 1], [2, 1]], BRIGHT, { gutter: 0 }),
  look('look-seamless-6', 'Seamless · 3\u00a0×\u00a02', [3, 2], [1, 1, 1], [1, 1], fill(3, 2), BRIGHT, { gutter: 0 }),
  look('look-seamless-6-tall', 'Seamless · 2\u00a0×\u00a03', [2, 3], [1, 1], [1, 1, 1], fill(2, 3), BRIGHT, { gutter: 0 }),
  look('look-seamless-9', 'Seamless · 3\u00a0×\u00a03', [1, 1], [1, 1, 1], [1, 1, 1], fill(3, 3), BRIGHT, { gutter: 0 }),
  look('look-rounded-4', 'Rounded · 4', [4, 5], [1, 1], [1, 1], fill(2, 2), BRIGHT, { gutter: .03, radius: .04 }),
  look('look-gallery-3', 'Gallery · 3', [4, 5], [1, 1], [3, 2], [[0, 0, 2, 1], [0, 1], [1, 1]], WARM, { gutter: .05 }),
  look('look-framed-6', 'Framed · 6', [2, 3], [1, 1], [1, 1, 1], fill(2, 3), BLACK, { gutter: .02, border: { width: .006, color: '#ffffff' } }),
  contact('contact-35', '35 mm · 36', 6, 6, [36, 24]),
  contact('contact-66', '120 6×6 · 12', 4, 3, [56, 56]),
  contact('contact-67', '120 6×7 · 9', 3, 3, [70, 56]),
  // Shapes: transparent outside the shape by default.
  shaped('circle-pie-6', 'Circle · 6', { kind: 'circle' }, radial(6)),
  shaped('hex-honeycomb-7', 'Honeycomb · 7', { kind: 'hexagon' }, { kind: 'free', slots: honeycomb }),
  // Feature and arc styles: a large print or a masked background photo, with a thin border around each print.
  style('feature-2', 'Feature + 2', TAUPE, [{ ...print(.314, .049, .966, .947, 0, false), rotate: 1 }, { ...print(.028, .086, .444, .50, 1), rotate: -2 }, { ...print(.028, .50, .444, .909, 1), rotate: 1.5 }]),
  style('feature-3', 'Feature + 3', TAUPE, [{ ...print(.314, .049, .966, .947, 0, false), rotate: 1 }, { ...print(.028, .086, .444, .527, 1), rotate: -2 }, { ...print(.028, .527, .237, .909, 1), rotate: 1.5 }, { ...print(.237, .527, .444, .909, 1), rotate: -1 }]),
  style('feature-4', 'Feature + 4', TAUPE, [{ ...print(.314, .049, .966, .947, 0, false), rotate: 1 }, { ...print(.028, .086, .236, .497, 1), rotate: -2 }, { ...print(.236, .086, .444, .497, 1), rotate: 1.5 }, { ...print(.028, .497, .236, .909, 1), rotate: 2 }, { ...print(.236, .497, .444, .909, 1), rotate: -1.5 }]),
  style('arc-circle', 'Arc + circle', CLAY, [background(), { x: .12, y: 0, w: .88, h: 1, z: 0, shape: ARC_LEFT }, circle(.045, .29, .64)]),
  style('arc-circle-right', 'Arc + circle, right', CLAY, [background(), { x: 0, y: 0, w: .88, h: 1, z: 0, shape: ARC_RIGHT }, circle(.498, .29, .64)]),
  style('arc-2-circles', 'Arc + 2 circles', CLAY, [background(), { x: .16, y: 0, w: .84, h: 1, z: 0, shape: ARC_LEFT }, circle(.035, .025, .5), circle(.14, .445, .5)]),
  style('arc-2-circles-right', 'Arc + 2 circles, right', CLAY, [background(), { x: 0, y: 0, w: .84, h: 1, z: 0, shape: ARC_RIGHT }, circle(.608, .025, .5), circle(.503, .445, .5)]),
  // Collage
  style('prints-3', 'Prints · 3', TAUPE, [{ ...print(.04, .06, .58, .62, 1), rotate: -3 }, { ...print(.54, .16, .95, .82, 2), rotate: 2 }, { ...print(.16, .58, .52, .94, 3), rotate: -2 }], 'collage'),
  style('prints-4', 'Prints · 4', TAUPE, [{ ...print(.024, .035, .619, .637, 1), rotate: -2 }, { ...print(.619, .165, .978, .826, 2), rotate: 2.5 }, { ...print(.122, .637, .373, .903, 3), rotate: 1.5 }, { ...print(.373, .415, .667, .961, 4), rotate: -2.5 }], 'collage'),
  style('prints-5', 'Prints · 5', TAUPE, [{ ...print(.03, .05, .40, .47, 1), rotate: -2 }, { ...print(.36, .09, .68, .52, 3), rotate: 1.5 }, { ...print(.64, .04, .97, .58, 2), rotate: 2.5 }, { ...print(.07, .45, .45, .95, 4), rotate: 2 }, { ...print(.47, .50, .93, .95, 5), rotate: -2 }], 'collage'),
  scrapbook('scrapbook-3', 'Scrapbook · 3', [
    { x: .08, y: .07, w: .62, h: .39, rotate: -6, z: 1, shadow: true, tape: ['tl', 'tr'] },
    { x: .38, y: .34, w: .54, h: .36, rotate: 5, z: 2, shadow: true, tape: ['tr'] },
    { x: .1, y: .64, w: .57, h: .3, rotate: -3, z: 3, shadow: true, tape: ['tl'] }
  ]),
  scrapbook('scrapbook-4', 'Scrapbook · 4', [
    { x: .06, y: .06, w: .55, h: .34, rotate: -5, z: 1, shadow: true, tape: ['tl'] },
    { x: .46, y: .18, w: .48, h: .34, rotate: 6, z: 3, shadow: true, tape: ['tr'] },
    { x: .09, y: .47, w: .49, h: .4, rotate: 4, z: 2, shadow: true, tape: ['tl'] },
    { x: .46, y: .62, w: .45, h: .3, rotate: -4, z: 4, shadow: true, tape: ['tr'] }
  ]),
  scrapbook('scrapbook-5', 'Scrapbook · 5', [
    { x: .05, y: .04, w: .48, h: .29, rotate: -6, z: 1, shadow: true, tape: ['tl'] },
    { x: .49, y: .08, w: .45, h: .33, rotate: 5, z: 2, shadow: true, tape: ['tr'] },
    { x: .13, y: .33, w: .58, h: .34, rotate: 2, z: 4, shadow: true, tape: ['tl', 'tr'] },
    { x: .04, y: .65, w: .43, h: .29, rotate: 5, z: 3, shadow: true, tape: ['tl'] },
    { x: .5, y: .64, w: .44, h: .31, rotate: -5, z: 5, shadow: true, tape: ['tr'] }
  ]),
  scrapbook('polaroids-2', 'Polaroids · 2', [polaroid(.08, .08, .52, .416, -6, 1), polaroid(.38, .44, .52, .416, 5, 2)],
    [scrap('kraft', .5, .06, .42, .3, 4), scrap('graph', .06, .6, .38, .3, -5)]),
  scrapbook('polaroids-3', 'Polaroids · 3', [polaroid(.08, .07, .4, .32, -7, 1), polaroid(.52, .25, .4, .32, 5, 2), polaroid(.18, .56, .42, .336, -3, 3, ['tl', 'tr'])],
    [scrap('graph', .05, .4, .4, .3, 4), scrap('kraft', .55, .62, .38, .3, -6)]),
  scrapbook('polaroids-4', 'Polaroids · 4', [polaroid(.06, .05, .38, .304, -5, 1), polaroid(.54, .08, .38, .304, 6, 2), polaroid(.08, .5, .38, .304, 4, 3), polaroid(.52, .55, .4, .32, -4, 4)],
    [scrap('lined', .3, .3, .45, .3, -3), scrap('graph', .05, .72, .35, .22, 5)]),
  scrapbook('journal-7', 'Travel journal · 7', [
    polaroid(.07, .04, .3, .24, -3, 2),
    { x: .6, y: .08, w: .33, h: .22, rotate: 4, z: 1, shadow: true, tape: ['tr'] },
    { x: .05, y: .36, w: .26, h: .3, rotate: -2, z: 1, shadow: true, tape: ['tl'] },
    polaroid(.3, .3, .42, .36, -4, 5, ['tl', 'tr']),
    { x: .72, y: .36, w: .22, h: .36, rotate: 6, z: 3, shadow: true, tape: ['tc'] },
    polaroid(.1, .7, .32, .22, 5, 4),
    { x: .55, y: .72, w: .36, h: .22, rotate: -3, z: 3, shadow: true, tape: ['tr'] }
  ], [scrap('graph', .04, .2, .3, .35, -4), scrap('lined', .55, .02, .4, .3, 3), scrap('kraft', .45, .62, .5, .32, -2)]),
  ...kits,
  ...classicKits
];

export const templateById = id => templates.find(template => template.id === id) || null;
/** Number of photos a template holds. */
export const slotCount = template => template.kind === 'grid' ? template.cells.length
  : template.kind === 'contact' ? template.strips * template.frames
  : template.kind === 'shaped' ? (template.fill.kind === 'grid' ? template.fill.cells.length : template.fill.kind === 'radial' ? template.fill.slices : template.fill.slots.length)
  : template.slots.length;
