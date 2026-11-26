// Collage templates: plain data for js/collage/layout.js. Grids use relative track sizes; cells are
// [col, row, colSpan = 1, rowSpan = 1] in reading order (slot order). `aspect` is the default sheet aspect.
// Shaped templates (Task 5) cut a fill layout by a sheet shape; `lockAspect` shapes keep their own proportions.
import { naturalAspect } from './shapes.js';

/** @typedef {{ id: string, name: string, category: 'diptych'|'layout'|'collage'|'shape'|'contact', aspect: [number, number],
 *   kind: 'grid'|'free'|'shaped'|'contact', cols?: number[], rows?: number[], cells?: number[][], slots?: object[],
 *   strips?: number, frames?: number, frame?: [number, number], sheet?: { shape: object, hole?: number },
 *   fill?: object, lockAspect?: boolean, paper?: string, border?: { width: number, color: string } }} Template
 *  Free slots: { x, y, w, h (sheet fractions), z, shape?, border? (false: no print border), mount? (js/collage/layout.js) }.
 *  The picker lists Diptychs, Layouts and Collage; shapes and contact sheets stay available to code (templateFor). */

const grid = (id, name, aspect, cols, rows, cells) => ({ id, name, category: 'layout', aspect, kind: 'grid', cols, rows, cells });
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
  ], [scrap('graph', .04, .2, .3, .35, -4), scrap('lined', .55, .02, .4, .3, 3), scrap('kraft', .45, .62, .5, .32, -2)])
];

export const templateById = id => templates.find(template => template.id === id) || null;
/** Number of photos a template holds. */
export const slotCount = template => template.kind === 'grid' ? template.cells.length
  : template.kind === 'contact' ? template.strips * template.frames
  : template.kind === 'shaped' ? (template.fill.kind === 'grid' ? template.fill.cells.length : template.fill.kind === 'radial' ? template.fill.slices : template.fill.slots.length)
  : template.slots.length;
