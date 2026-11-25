// Where a photo sits in its slot (pure: no DOM, checked by tools/collage-check.mjs).
// A fill { pan, zoom, rotate, angle, flip } places the photo's finished edit (its own crop already applied, V11):
// rotate (90° steps) and flip orient it, `angle` turns it finely, and it is scaled to cover the slot at zoom 1, so
// no paper shows at any pan, zoom or angle. pan 0–1 moves it within the room it has (.5 = centred).

export const ZOOM_MIN = 1, ZOOM_MAX = 5, ANGLE_MAX = 45;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** A clean fill: zoom 1–5, angle −45…45, rotate a multiple of 90 in 0–270, pan 0–1. */
export function normalizeFill(fill = {}) {
  const rotate = ((Math.round((fill.rotate || 0) / 90) * 90) % 360 + 360) % 360;
  return {
    pan: { x: clamp(fill.pan?.x ?? .5, 0, 1), y: clamp(fill.pan?.y ?? .5, 0, 1) },
    zoom: clamp(Number(fill.zoom) || 1, ZOOM_MIN, ZOOM_MAX), rotate,
    angle: clamp(Number(fill.angle) || 0, -ANGLE_MAX, ANGLE_MAX), flip: Boolean(fill.flip)
  };
}

/** Geometry of a photo (iw × ih px) filling a w × h slot:
 *  W, H: the oriented photo's size; scale: photo px → slot px; cx, cy: the oriented photo point at the slot's centre;
 *  hx, hy: half the slot's turned extent in photo px (the room the pan moves within is W − 2hx by H − 2hy). */
export function fillGeometry(iw, ih, w, h, fill) {
  const f = normalizeFill(fill), turned = f.rotate % 180 !== 0;
  const W = turned ? ih : iw, H = turned ? iw : ih;
  const a = f.angle * Math.PI / 180, cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
  const ex = (w * cos + h * sin) / 2, ey = (w * sin + h * cos) / 2; // half extents of the turned slot
  const scale = Math.max(2 * ex / W, 2 * ey / H) * f.zoom;
  const hx = ex / scale, hy = ey / scale;
  return { W, H, scale, angle: f.angle, hx, hy, cx: hx + (W - 2 * hx) * f.pan.x, cy: hy + (H - 2 * hy) * f.pan.y };
}

/** The oriented photo point under slot point (x, y), measured from the slot's centre in slot px. */
export function photoPoint(g, x, y) {
  const a = -g.angle * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  return { x: g.cx + (x * cos - y * sin) / g.scale, y: g.cy + (x * sin + y * cos) / g.scale };
}

/** The pan after the photo is dragged by (dx, dy) slot px from a fill whose geometry is `g` (pan at drag start). */
export function panBy(g, pan, dx, dy) {
  const a = -g.angle * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const ix = (dx * cos - dy * sin) / g.scale, iy = (dx * sin + dy * cos) / g.scale; // the drag in photo px
  const roomX = g.W - 2 * g.hx, roomY = g.H - 2 * g.hy;
  return {
    x: roomX > 1e-9 ? clamp(pan.x - ix / roomX, 0, 1) : pan.x,
    y: roomY > 1e-9 ? clamp(pan.y - iy / roomY, 0, 1) : pan.y
  };
}
