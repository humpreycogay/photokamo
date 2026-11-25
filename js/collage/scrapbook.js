// Deterministic, resolution-independent scrapbook decoration geometry. Coordinates are normalised to the sheet's
// short edge, so preview and export sample the same fibres and tape shapes rather than scaling a bitmap asset.
const fract = value => value - Math.floor(value);
export const noise = (seed, x, y) => fract(Math.sin(seed * 12.9898 + x * 78.233 + y * 37.719) * 43758.5453);

/** Normalised paper fibres. Each segment is { x, y, length, angle, alpha }; count depends on physical sheet area. */
export function fibres(width, height, seed = 9407) {
  const short = Math.min(width, height), nw = width / short, nh = height / short;
  const count = Math.round(nw * nh * 190), out = [];
  for (let i = 0; i < count; i++) {
    const x = noise(seed, i, 1) * nw, y = noise(seed, i, 2) * nh;
    out.push({ x, y, length: .006 + noise(seed, i, 3) * .025, angle: (noise(seed, i, 4) - .5) * .65, alpha: .025 + noise(seed, i, 5) * .055 });
  }
  return out;
}

/** Tape rectangle at a print corner, in sheet px. */
export function tapeRect(slot, corner, seed = 41) {
  const short = Math.min(slot.w, slot.h), w = short * .31, h = short * .09;
  const left = corner === 'tl', cx = left ? slot.x + slot.w * .08 : slot.x + slot.w * .92, cy = slot.y + slot.h * .04;
  return { x: cx - w / 2, y: cy - h / 2, w, h, rotate: (left ? -12 : 12) + (noise(seed, slot.index, left ? 1 : 2) - .5) * 5 };
}

/** A point transformed into a laid-out print's rotated coordinate space. */
export function unrotatePoint(slot, x, y) {
  const a = -(slot.rotate || 0) * Math.PI / 180, cx = slot.x + slot.w / 2, cy = slot.y + slot.h / 2, dx = x - cx, dy = y - cy;
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
}