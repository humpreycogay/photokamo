// Film contact-sheet data and pure helpers. The drawing lives in render.js so preview and export share it.
import { filmRandom } from '../film.js';

export const DEFAULT_FILM = Object.freeze({ base: 'color', startNumber: 1, stockText: 'KAMO 400', date: '', mark: 'none', markFrame: 1 });

export const filmSettings = film => ({ ...DEFAULT_FILM, ...(film || {}) });

/** Contact-sheet frame label. A half-step start (for example 1.5) produces 1A, 2A… */
export function frameNumber(start, index) {
  const value = Number(start) + index;
  return Number.isInteger(value) ? String(value) : `${Math.floor(value)}A`;
}

/** Small physical misregistration, seeded by strip so preview and export agree. Fractions are of frame/strip size. */
export function stripTransform(index) {
  const seed = 7100 + index * 37;
  return { dx: (filmRandom(seed) - .5) * .035, dy: (filmRandom(seed + 1) - .5) * .22, angle: (filmRandom(seed + 2) - .5) * 1.4 };
}