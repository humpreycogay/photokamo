// Healing data (plan_workflow.md Task 9, A§7.1–7.2 with C3–C5). Pure: no DOM, so tools/workflow-fixtures.mjs checks it.
// Strokes live in source space: points are positions on the decoded photo before crop, rotation or straighten
// (u, v as whole numbers 0…65535 of its width and height), so every crop, look, optics and export keeps the fix where
// it was. Sizes are fractions of the photo's long edge, so any render size (thumb, preview, full) draws the same.
//   healing: { rev, strokes: [{ m: 'heal'|'clone', p: [u0, v0, u1, v1, …], r, h, o, d: [du, dv] }] }
//   r: radius (fraction of the long edge), h: hardness 0–1, o: opacity 0–1, d: source offset (1/65535 units of width,
//   height); chosen when the stroke is made (manual or searched), so renders never search.

export const Q = 65535, MAX_POINTS = 512, MAX_STROKES = 200, HEAL_VERSION = 1;
export const emptyHealing = () => ({ rev: '', strokes: [] });
export const hasHealing = healing => Boolean(healing?.strokes?.length);
let revCounter = 0;
/** A revision no other content has had: cache keys include it instead of every point. */
export const nextRev = () => `${Date.now().toString(36)}-${(++revCounter).toString(36)}`;
export const cloneHealing = healing => ({ rev: healing?.rev || '', strokes: (healing?.strokes || []).map(s => ({ ...s, p: [...s.p], d: [...s.d] })) });

const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
/** Stored healing made valid: bad strokes are dropped, counts capped. Null when there is nothing usable. */
export function sanitizeHealing(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.strokes)) return emptyHealing();
  const strokes = [];
  for (const s of value.strokes.slice(0, MAX_STROKES)) {
    if (!s || !['heal', 'clone'].includes(s.m) || !Array.isArray(s.p) || s.p.length < 2 || s.p.length % 2 || !Array.isArray(s.d) || s.d.length !== 2) continue;
    const p = s.p.slice(0, MAX_POINTS * 2);
    if (!p.every(n => Number.isInteger(n) && n >= 0 && n <= Q) || !s.d.every(n => Number.isInteger(n) && Math.abs(n) <= Q)) continue;
    if (!finite(s.r) || s.r <= 0 || s.r > .25 || !finite(s.h) || !finite(s.o)) continue;
    strokes.push({ m: s.m, p, r: s.r, h: clamp(s.h, 0, 1), o: clamp(s.o, .05, 1), d: [...s.d] });
  }
  return { rev: typeof value.rev === 'string' ? value.rev : nextRev(), strokes };
}

/** Ramer–Douglas–Peucker on [{ x, y }] (source px): keeps points further than `epsilon` from the simplified line. */
export function simplify(points, epsilon) {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(), A = points[a], B = points[b], dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
    let worst = -1, index = -1;
    for (let i = a + 1; i < b; i++) {
      const P = points[i], d = len ? Math.abs(dy * P.x - dx * P.y + B.x * A.y - B.y * A.x) / len : Math.hypot(P.x - A.x, P.y - A.y);
      if (d > worst) { worst = d; index = i; }
    }
    if (worst > epsilon) { keep[index] = 1; stack.push([a, index], [index, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** Stamp centres every `spacing` along the polyline (arc length), so rendering doesn't depend on pointer event rate. */
export function stamps(points, spacing) {
  if (points.length === 1) return [{ ...points[0] }];
  const out = [{ ...points[0] }];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const A = points[i - 1], B = points[i], len = Math.hypot(B.x - A.x, B.y - A.y);
    let t = spacing - carry;
    while (t <= len) { out.push({ x: A.x + (B.x - A.x) * t / len, y: A.y + (B.y - A.y) * t / len }); t += spacing; }
    carry = len - (t - spacing);
  }
  const last = points.at(-1);
  if (Math.hypot(out.at(-1).x - last.x, out.at(-1).y - last.y) > spacing * .25) out.push({ ...last });
  return out;
}

/** A stroke's geometry at a render of `width` × `height` px: stamp centres, radius, offset, bounds (px of that render). */
export function strokeGeometry(stroke, width, height) {
  const long = Math.max(width, height), radius = Math.max(.5, stroke.r * long);
  const points = []; for (let i = 0; i < stroke.p.length; i += 2) points.push({ x: stroke.p[i] / Q * width, y: stroke.p[i + 1] / Q * height });
  const centres = stamps(points, Math.max(.5, radius * .25));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of centres) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); }
  const pad = radius + Math.max(2, .15 * radius) + 1; // + the boundary band Heal matches against (A§7.3)
  return { centres, radius, dx: stroke.d[0] / Q * width, dy: stroke.d[1] / Q * height,
    bounds: { x: Math.floor(x0 - pad), y: Math.floor(y0 - pad), width: Math.ceil(x1 - x0 + 2 * pad) + 1, height: Math.ceil(y1 - y0 + 2 * pad) + 1 } };
}

/** A§7.2 brush mask over a rect (px of the render): coverage of every stamp, 1 - Π(1 - a). */
export function strokeMask(geometry, rect, hardness, opacity) {
  const { centres, radius } = geometry, mask = new Float32Array(rect.width * rect.height);
  const smooth = t => t * t * (3 - 2 * t);
  for (const c of centres) {
    const cx = c.x - rect.x, cy = c.y - rect.y;
    const xa = Math.max(0, Math.floor(cx - radius)), xb = Math.min(rect.width - 1, Math.ceil(cx + radius));
    const ya = Math.max(0, Math.floor(cy - radius)), yb = Math.min(rect.height - 1, Math.ceil(cy + radius));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const r = Math.hypot(x + .5 - cx, y + .5 - cy) / radius;
      if (r >= 1) continue;
      const a = r <= hardness ? opacity : opacity * (1 - smooth(Math.min(1, Math.max(0, (r - hardness) / Math.max(1e-6, 1 - hardness)))));
      const i = y * rect.width + x; mask[i] = 1 - (1 - mask[i]) * (1 - a);
    }
  }
  return mask;
}

/** Builds a stroke from a drawn path (source px of a `width` × `height` photo): simplified, capped, quantised. */
export function makeStroke({ mode, path, radius, hardness, opacity, offset, width, height }) {
  const long = Math.max(width, height);
  let points = simplify(path, Math.max(.25, .02 * radius));
  if (points.length > MAX_POINTS) { const step = points.length / MAX_POINTS; points = Array.from({ length: MAX_POINTS }, (_, i) => points[Math.min(points.length - 1, Math.round(i * step))]); }
  const q = (value, size) => clamp(Math.round(value / size * Q), 0, Q);
  return { m: mode, p: points.flatMap(pt => [q(pt.x, width), q(pt.y, height)]), r: Number((radius / long).toFixed(6)), h: Number(hardness.toFixed(2)), o: Number(opacity.toFixed(2)),
    d: [Math.round(offset.x / width * Q), Math.round(offset.y / height * Q)] };
}
