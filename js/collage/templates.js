// Collage templates: plain data for js/collage/layout.js. Grids use relative track sizes; cells are
// [col, row, colSpan = 1, rowSpan = 1] in reading order (slot order). `aspect` is the default sheet aspect.
// Shaped templates (Task 5) cut a fill layout by a sheet shape; `lockAspect` shapes keep their own proportions.
import { naturalAspect } from './shapes.js';

/** @typedef {{ id: string, name: string, category: 'grid'|'style'|'scrapbook'|'shape'|'contact', aspect: [number, number],
 *   kind: 'grid'|'free'|'shaped'|'contact', cols?: number[], rows?: number[], cells?: number[][], slots?: object[],
 *   strips?: number, frames?: number, frame?: [number, number], sheet?: { shape: object, hole?: number },
 *   fill?: object, lockAspect?: boolean, paper?: string, border?: { width: number, color: string } }} Template
 *  Free slots: { x, y, w, h (sheet fractions), z, shape?, border? (false: no print border) }. */

const grid = (id, name, aspect, cols, rows, cells) => ({ id, name, category: 'grid', aspect, kind: 'grid', cols, rows, cells });
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
const ARC_LEFT = { kind: 'path', d: 'M .1 0 L 1 0 L 1 1 L .2 1 C .02 .78 -.03 .32 .1 0 Z' };
const ARC_RIGHT = { kind: 'path', d: 'M 0 0 L .9 0 C 1.03 .32 .98 .78 .8 1 L 0 1 Z' };
const style = (id, name, paper, slots) => ({ id, name, category: 'style', kind: 'free', aspect: STYLE_ASPECT, paper, border: { width: .005, color: '#ffffff' }, slots });
const fill = (cols, rows) => Array.from({ length: cols * rows }, (_, i) => [i % cols, Math.floor(i / cols)]);

/** @type {Template[]} */
export const templates = [
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
  // Shapes: transparent outside the shape by default.
  shaped('circle-pie-6', 'Circle · 6', { kind: 'circle' }, radial(6)),
  shaped('hex-honeycomb-7', 'Honeycomb · 7', { kind: 'hexagon' }, { kind: 'free', slots: honeycomb }),
  // Styles: overlapping prints on coloured paper, with a thin border (white by default) around each print.
  style('prints-3', 'Prints · 3', TAUPE, [print(.04, .06, .58, .62, 1), print(.54, .16, .95, .82, 2), print(.16, .58, .52, .94, 3)]),
  style('prints-4', 'Prints · 4', TAUPE, [print(.024, .035, .619, .637, 1), print(.619, .165, .978, .826, 2), print(.122, .637, .373, .903, 3), print(.373, .415, .667, .961, 4)]),
  style('prints-5', 'Prints · 5', TAUPE, [print(.03, .05, .40, .47, 1), print(.36, .09, .68, .52, 3), print(.64, .04, .97, .58, 2), print(.07, .45, .45, .95, 4), print(.47, .50, .93, .95, 5)]),
  style('feature-2', 'Feature + 2', TAUPE, [print(.314, .049, .966, .947, 0, false), print(.028, .086, .444, .50, 1), print(.028, .50, .444, .909, 1)]),
  style('feature-3', 'Feature + 3', TAUPE, [print(.314, .049, .966, .947, 0, false), print(.028, .086, .444, .527, 1), print(.028, .527, .237, .909, 1), print(.237, .527, .444, .909, 1)]),
  style('feature-4', 'Feature + 4', TAUPE, [print(.314, .049, .966, .947, 0, false), print(.028, .086, .236, .497, 1), print(.236, .086, .444, .497, 1), print(.028, .497, .236, .909, 1), print(.236, .497, .444, .909, 1)]),
  style('arc-circle', 'Arc + circle', CLAY, [{ x: .15, y: 0, w: .85, h: 1, z: 0, shape: ARC_LEFT }, circle(.075, .385, .56)]),
  style('arc-circle-right', 'Arc + circle, right', CLAY, [{ x: 0, y: 0, w: .85, h: 1, z: 0, shape: ARC_RIGHT }, circle(.925 - .4, .385, .56)]),
  style('arc-2-circles', 'Arc + 2 circles', CLAY, [{ x: .22, y: 0, w: .78, h: 1, z: 0, shape: ARC_LEFT }, circle(.05, .05, .44), circle(.17, .51, .44)])
];

export const templateById = id => templates.find(template => template.id === id) || null;
/** Number of photos a template holds. */
export const slotCount = template => template.kind === 'grid' ? template.cells.length
  : template.kind === 'contact' ? template.strips * template.frames
  : template.kind === 'shaped' ? (template.fill.kind === 'grid' ? template.fill.cells.length : template.fill.kind === 'radial' ? template.fill.slices : template.fill.slots.length)
  : template.slots.length;
