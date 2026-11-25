// Collage templates: plain data for js/collage/layout.js. Grids use relative track sizes; cells are
// [col, row, colSpan = 1, rowSpan = 1] in reading order (slot order). `aspect` is the default sheet aspect.

/** @typedef {{ id: string, name: string, category: 'grid'|'scrapbook'|'shape'|'contact', aspect: [number, number],
 *   kind: 'grid'|'free'|'shaped'|'contact', cols?: number[], rows?: number[], cells?: number[][], slots?: object[],
 *   strips?: number, frames?: number, frame?: [number, number] }} Template */

const grid = (id, name, aspect, cols, rows, cells) => ({ id, name, category: 'grid', aspect, kind: 'grid', cols, rows, cells });
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
  grid('grid-9', '3 × 3', [1, 1], [1, 1, 1], [1, 1, 1], fill(3, 3))
];

export const templateById = id => templates.find(template => template.id === id) || null;
/** Number of photos a template holds. */
export const slotCount = template => template.kind === 'grid' ? template.cells.length
  : template.kind === 'contact' ? template.strips * template.frames : template.slots.length;
