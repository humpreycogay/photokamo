// Collage shapes (pure: no DOM except Path2D in the browser, checked by tools/collage-check.mjs).
// One definition per shape, as path commands in px for a target rect, feeds both shapePath() (a Path2D for
// clipping and drawing) and shapePolygon() (a flattened outline for Node checks and hit tests).
// Commands: ['M', x, y] ['L', x, y] ['C', x1, y1, x2, y2, x, y] ['E', cx, cy, rx, ry, start, end, ccw] ['Z']
// ('E' is an ellipse arc like CanvasRenderingContext2D.ellipse: a line joins it to the current point).

/** @typedef {{ kind: 'rect'|'rounded'|'circle'|'ellipse'|'polygon'|'star'|'heart'|'hexagon'|'arch'|'stamp'|'path',
 *   points?: number[], n?: number, inner?: number, radius?: number, top?: 'pointy'|'flat', d?: string }} ShapeRef
 *  All shapes are defined in a 0–1 box and scaled to the target rect. Regular polygons, stars and hexagons keep
 *  their proportions (centred, contained); hearts, explicit points and paths stretch to the rect. */
/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

export const SHAPE_KINDS = ['rect', 'rounded', 'circle', 'ellipse', 'polygon', 'star', 'heart', 'hexagon', 'arch', 'stamp', 'path'];
const TAU = Math.PI * 2;
// Right half of the heart, from the dip to the tip; the left half mirrors it about x = .5.
const HEART = [[.5, .3], [.55, -.15], [1.4, .12], [.5, 1]];
/** Exact bounding box of a cubic Bézier [[x, y] × 4], from the roots of its derivative. */
function cubicBox(p) {
  const out = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }, ts = [0, 1];
  for (const k of [0, 1]) {
    const [a0, a1, a2, a3] = p.map(point => point[k]);
    const a = -a0 + 3 * a1 - 3 * a2 + a3, b = 2 * (a0 - 2 * a1 + a2), c = a1 - a0; // derivative / 3
    if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) ts.push(-c / b); continue; }
    const disc = b * b - 4 * a * c;
    if (disc >= 0) ts.push((-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a));
  }
  for (const t of ts.filter(t => t >= 0 && t <= 1)) {
    const [x, y] = cubicPoint(p.flat(), t);
    out.minX = Math.min(out.minX, x); out.maxX = Math.max(out.maxX, x); out.minY = Math.min(out.minY, y); out.maxY = Math.max(out.maxY, y);
  }
  return out;
}
const HEART_BOX = (() => { // both halves: the left one mirrors x about .5
  const right = cubicBox(HEART), minX = Math.min(right.minX, 1 - right.maxX), maxX = Math.max(right.maxX, 1 - right.minX);
  return { minX, minY: right.minY, w: maxX - minX, h: right.maxY - right.minY };
})();

const box = (points, rect) => points.map(([x, y]) => [rect.x + x * rect.w, rect.y + y * rect.h]);
const polyCommands = points => [['M', ...points[0]], ...points.slice(1).map(point => ['L', ...point]), ['Z']];

/** Unit-space points → fitted into rect, keeping proportions (contain, centred). */
function contain(points, rect) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
  const scale = Math.min(rect.w / w, rect.h / h), ox = rect.x + (rect.w - w * scale) / 2, oy = rect.y + (rect.h - h * scale) / 2;
  return points.map(([x, y]) => [ox + (x - minX) * scale, oy + (y - minY) * scale]);
}
/** Regular n-gon (first vertex up) or star (n points, inner radius ratio), as unit-circle points. */
function radialPoints(n, inner = null, offset = -Math.PI / 2) {
  const count = inner == null ? n : n * 2, points = [];
  for (let i = 0; i < count; i++) {
    const angle = offset + i * TAU / count, r = inner != null && i % 2 ? inner : 1;
    points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  return points;
}
function roundedCommands({ x, y, w, h }, r) {
  r = Math.min(r, w / 2, h / 2);
  if (r <= 0) return polyCommands([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  return [['M', x + r, y], ['L', x + w - r, y], ['E', x + w - r, y + r, r, r, -Math.PI / 2, 0, false],
    ['L', x + w, y + h - r], ['E', x + w - r, y + h - r, r, r, 0, Math.PI / 2, false],
    ['L', x + r, y + h], ['E', x + r, y + h - r, r, r, Math.PI / 2, Math.PI, false],
    ['L', x, y + r], ['E', x + r, y + r, r, r, Math.PI, Math.PI * 1.5, false], ['Z']];
}
/** Rect with semicircular bites along every edge (a perforated postage stamp), traced clockwise. */
function stampCommands({ x, y, w, h }) {
  const bite = Math.max(.5, Math.min(w, h) * .025), pitch = bite * 4;
  const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const commands = [['M', x, y]];
  corners.forEach(([x0, y0], i) => {
    const [x1, y1] = corners[(i + 1) % 4], length = Math.hypot(x1 - x0, y1 - y0), tx = (x1 - x0) / length, ty = (y1 - y0) / length;
    const count = Math.max(3, Math.round(length / pitch)), back = Math.atan2(-ty, -tx), ahead = Math.atan2(ty, tx);
    for (let k = 0; k < count; k++) { // anticlockwise from "back" to "ahead" passes the inward normal
      const t = (k + .5) * length / count, cx = x0 + tx * t, cy = y0 + ty * t;
      commands.push(['L', cx - tx * bite, cy - ty * bite], ['E', cx, cy, bite, bite, back, ahead, true]);
    }
    commands.push(['L', x1, y1]);
  });
  commands.push(['Z']);
  return commands;
}
/** Absolute SVG path data (M L H V C Q Z) in a 0–1 box → commands in rect. Built-in shapes only. */
function pathCommands(d, rect) {
  const tokens = d.match(/[MLHVCQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [], commands = [];
  const X = v => rect.x + v * rect.w, Y = v => rect.y + v * rect.h;
  let i = 0, op = null, cx = 0, cy = 0, sx = 0, sy = 0;
  const num = () => { const value = Number(tokens[i++]); if (!Number.isFinite(value)) throw new Error(`Bad path data: ${d}`); return value; };
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) { op = tokens[i++]; if (op !== op.toUpperCase()) throw new Error('Path data must use absolute commands'); }
    if (op === 'Z') { commands.push(['Z']); cx = sx; cy = sy; op = null; continue; }
    if (op === 'M') { cx = sx = num(); cy = sy = num(); commands.push(['M', X(cx), Y(cy)]); op = 'L'; }
    else if (op === 'L') { cx = num(); cy = num(); commands.push(['L', X(cx), Y(cy)]); }
    else if (op === 'H') { cx = num(); commands.push(['L', X(cx), Y(cy)]); }
    else if (op === 'V') { cy = num(); commands.push(['L', X(cx), Y(cy)]); }
    else if (op === 'C') { const v = [num(), num(), num(), num(), num(), num()]; commands.push(['C', X(v[0]), Y(v[1]), X(v[2]), Y(v[3]), X(v[4]), Y(v[5])]); [cx, cy] = [v[4], v[5]]; }
    else if (op === 'Q') { // quadratic → cubic
      const [qx, qy, x, y] = [num(), num(), num(), num()];
      commands.push(['C', X(cx + 2 / 3 * (qx - cx)), Y(cy + 2 / 3 * (qy - cy)), X(x + 2 / 3 * (qx - x)), Y(y + 2 / 3 * (qy - y)), X(x), Y(y)]); [cx, cy] = [x, y];
    } else throw new Error(`Bad path data: ${d}`);
  }
  return commands;
}

/** Path commands for a shape inside rect (px). */
export function shapeCommands(ref = { kind: 'rect' }, rect) {
  const { x, y, w, h } = rect, short = Math.min(w, h);
  switch (ref.kind || 'rect') {
    case 'rect': return polyCommands([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
    case 'rounded': return roundedCommands(rect, (ref.radius ?? .12) * short);
    case 'circle': return [['E', x + w / 2, y + h / 2, short / 2, short / 2, 0, TAU, false], ['Z']];
    case 'ellipse': return [['E', x + w / 2, y + h / 2, w / 2, h / 2, 0, TAU, false], ['Z']];
    case 'polygon':
      if (ref.points) { const pts = []; for (let i = 0; i < ref.points.length; i += 2) pts.push([ref.points[i], ref.points[i + 1]]); return polyCommands(box(pts, rect)); }
      return polyCommands(contain(radialPoints(ref.n ?? 6), rect));
    case 'hexagon': return polyCommands(contain(radialPoints(6, null, ref.top === 'flat' ? 0 : -Math.PI / 2), rect));
    case 'star': return polyCommands(contain(radialPoints(ref.n ?? 5, ref.inner ?? .45), rect));
    case 'heart': {
      const { minX, minY, w: sw, h: sh } = HEART_BOX;
      const right = box(HEART.map(([px, py]) => [(px - minX) / sw, (py - minY) / sh]), rect);
      const mirror = ([px, py]) => [2 * (x + w / 2) - px, py];
      return [['M', ...right[0]], ['C', ...right[1], ...right[2], ...right[3]], ['C', ...mirror(right[2]), ...mirror(right[1]), ...right[0]], ['Z']];
    }
    case 'arch': {
      const r = Math.min(w / 2, h);
      return [['M', x, y + h], ['L', x, y + r], ['E', x + w / 2, y + r, w / 2, r, Math.PI, TAU, false], ['L', x + w, y + h], ['Z']];
    }
    case 'stamp': return stampCommands(rect);
    case 'path': return pathCommands(ref.d || '', rect);
    default: throw new Error(`Unknown shape ${ref.kind}`);
  }
}

/** Path2D for a shape inside rect (browser only). */
export function shapePath(ref, rect) {
  const path = new Path2D();
  for (const [op, ...v] of shapeCommands(ref, rect)) {
    if (op === 'M') path.moveTo(v[0], v[1]);
    else if (op === 'L') path.lineTo(v[0], v[1]);
    else if (op === 'C') path.bezierCurveTo(...v);
    else if (op === 'E') path.ellipse(v[0], v[1], v[2], v[3], 0, v[4], v[5], v[6]);
    else path.closePath();
  }
  return path;
}

function cubicPoint([x0, y0, x1, y1, x2, y2, x3, y3], t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3];
}
/** Sweep of an arc from start to end, in the drawing direction (same rules as canvas ellipse()). */
function arcSweep(start, end, ccw) {
  if (!ccw && end - start >= TAU) return TAU;
  if (ccw && start - end >= TAU) return -TAU;
  let sweep = end - start;
  if (!ccw) { sweep %= TAU; if (sweep < 0) sweep += TAU; } else { sweep %= TAU; if (sweep > 0) sweep -= TAU; }
  return sweep;
}

/** The shape's outline as a flat [x0, y0, x1, y1, …] polygon, no point further than `tolerance` px from the curve.
 *  The first subpath only (all built-in shapes are one closed outline). */
export function shapePolygon(ref, rect, tolerance = .25) {
  const out = [];
  let cx = 0, cy = 0, started = false;
  const add = (x, y) => {
    const n = out.length;
    if (n && Math.abs(out[n - 2] - x) < 1e-9 && Math.abs(out[n - 1] - y) < 1e-9) return;
    out.push(x, y); cx = x; cy = y;
  };
  for (const [op, ...v] of shapeCommands(ref, rect)) {
    if (op === 'M') { if (started) break; started = true; add(v[0], v[1]); }
    else if (op === 'L') add(v[0], v[1]);
    else if (op === 'C') {
      const p = [cx, cy, ...v];
      const dd = Math.max(Math.hypot(p[0] - 2 * p[2] + p[4], p[1] - 2 * p[3] + p[5]), Math.hypot(p[2] - 2 * p[4] + p[6], p[3] - 2 * p[5] + p[7]));
      const steps = Math.max(1, Math.ceil(Math.sqrt(.75 * dd / tolerance))); // Wang's formula
      for (let i = 1; i <= steps; i++) add(...cubicPoint(p, i / steps));
    } else if (op === 'E') {
      const [ex, ey, rx, ry, start, end, ccw] = v, sweep = arcSweep(start, end, ccw), r = Math.max(rx, ry);
      const step = r > tolerance ? 2 * Math.acos(1 - tolerance / r) : Math.PI / 2;
      const steps = Math.max(2, Math.ceil(Math.abs(sweep) / step));
      if (!started) started = true;
      for (let i = 0; i <= steps; i++) { const a = start + sweep * i / steps; add(ex + Math.cos(a) * rx, ey + Math.sin(a) * ry); }
    } else if (op === 'Z') break;
  }
  const n = out.length; // drop a closing point that repeats the first
  if (n > 4 && Math.abs(out[0] - out[n - 2]) < 1e-9 && Math.abs(out[1] - out[n - 1]) < 1e-9) out.length = n - 2;
  return out;
}

/** Signed area of a flat polygon (positive = clockwise on screen, y down). */
export function polygonArea(points) {
  let sum = 0;
  for (let i = 0, n = points.length; i < n; i += 2) {
    const j = (i + 2) % n;
    sum += points[i] * points[j + 1] - points[j] * points[i + 1];
  }
  return sum / 2;
}
/** Even-odd point-in-polygon test for a flat polygon. */
export function pointInPolygon(points, x, y) {
  let inside = false;
  for (let i = 0, n = points.length, j = n - 2; i < n; j = i, i += 2) {
    const xi = points[i], yi = points[i + 1], xj = points[j], yj = points[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
