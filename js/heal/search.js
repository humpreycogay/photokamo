// Automatic heal source (plan_workflow.md Task 10, A§7.3). Pure: a proxy of the area around a stroke in, the best
// source offset out (proxy px), or null when no clean source fits (then the user sets one). Only the destination's
// known boundary band is compared, so the cost grows with the stroke's outline, not its area.

const LINEAR = Float64Array.from({ length: 256 }, (_, v) => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });

/** `data`: RGBA proxy (alpha 0 = outside the photo); `mask`: brush coverage on the same grid; `radius`: brush radius
 *  (proxy px). Returns { x, y, score } or null. Deterministic: ties go to the shorter offset, then top-to-bottom,
 *  left-to-right. */
export function searchSource({ data, width, height, mask, radius }) {
  // Band: max(3, R/2), wider than A§7.3's max(2, 0.15 R): a 2 px band missed texture just outside the stroke (brick
  // mortar) and copied the wrong phase into it. Measured on the fixtures in tools/workflow-fixtures.mjs.
  const n = width * height, R = Math.max(1, radius), band = Math.max(3, .5 * R);
  const Y = new Float32Array(n), Cb = new Float32Array(n), Cr = new Float32Array(n), valid = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const o = p * 4; if (!data[o + 3]) continue;
    const r = LINEAR[data[o]], g = LINEAR[data[o + 1]], b = LINEAR[data[o + 2]], y = .2126 * r + .7152 * g + .0722 * b;
    Y[p] = y; Cb[p] = b - y; Cr[p] = r - y; valid[p] = 1;
  }
  const Gx = new Float32Array(n), Gy = new Float32Array(n);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const p = y * width + x, at = (dx, dy) => Y[p + dy * width + dx];
    Gx[p] = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1);
    Gy[p] = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1);
  }
  // Distance to the brush (chamfer 3-4), for the band around it.
  const dist = new Float32Array(n).fill(1e9);
  for (let p = 0; p < n; p++) if (mask[p] > 0) dist[p] = 0;
  const pass = (forward) => {
    for (let i = 0; i < n; i++) {
      const p = forward ? i : n - 1 - i, x = p % width, y = (p - x) / width, s = forward ? -1 : 1;
      let d = dist[p];
      if (x + s >= 0 && x + s < width) d = Math.min(d, dist[p + s] + 1);
      if (y + s >= 0 && y + s < height) {
        const q = p + s * width; d = Math.min(d, dist[q] + 1);
        if (x - 1 >= 0) d = Math.min(d, dist[q - 1] + Math.SQRT2);
        if (x + 1 < width) d = Math.min(d, dist[q + 1] + Math.SQRT2);
      }
      dist[p] = d;
    }
  };
  pass(true); pass(false);
  const masked = [], ring = [];
  for (let p = 0; p < n; p++) { if (mask[p] > 0) masked.push(p); else if (dist[p] <= band && valid[p]) ring.push(p); }
  if (!masked.length || ring.length < 4) return null;
  const xs = p => p % width, ys = p => (p - p % width) / width;
  let dMu = 0; for (const p of ring) dMu += Y[p]; dMu /= ring.length;
  let dSd = 0; for (const p of ring) dSd += (Y[p] - dMu) ** 2; dSd = Math.sqrt(dSd / ring.length);
  const near = new Uint8Array(n); for (let p = 0; p < n; p++) if (dist[p] <= band) near[p] = 1; // the stroke and its band

  const score = (dx, dy) => {
    // The source (stroke and band shifted) must be inside the photo and clear of the stroke itself.
    for (const list of [masked, ring]) for (const p of list) {
      const x = xs(p) + dx, y = ys(p) + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) return Infinity;
      const q = y * width + x; if (!valid[q] || near[q]) return Infinity;
    }
    let ssd = 0, sMu = 0;
    for (const p of ring) {
      const q = p + dy * width + dx;
      ssd += (Y[q] - Y[p]) ** 2 + .25 * (Cb[q] - Cb[p]) ** 2 + .25 * (Cr[q] - Cr[p]) ** 2 + .15 * ((Gx[q] - Gx[p]) ** 2 + (Gy[q] - Gy[p]) ** 2);
      sMu += Y[q];
    }
    sMu /= ring.length;
    let sSd = 0; for (const p of ring) sSd += (Y[p + dy * width + dx] - sMu) ** 2; sSd = Math.sqrt(sSd / ring.length);
    return ssd / ring.length + .1 * ((sMu - dMu) ** 2 + (sSd - dSd) ** 2) + .01 * (Math.hypot(dx, dy) / (6 * R)) ** 2;
  };
  const better = (a, b) => a.score < b.score - 1e-12 || (Math.abs(a.score - b.score) <= 1e-12 && (Math.hypot(a.x, a.y) < Math.hypot(b.x, b.y) - 1e-9 || (Math.abs(Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)) <= 1e-9 && (a.y < b.y || (a.y === b.y && a.x < b.x)))));
  // Coarse: the annulus 2R…6R at a stride of R/4; keep the five best.
  const stride = Math.max(1, Math.floor(R / 4)), top = [];
  for (let dy = -Math.ceil(6 * R); dy <= 6 * R; dy += stride) for (let dx = -Math.ceil(6 * R); dx <= 6 * R; dx += stride) {
    const d = Math.hypot(dx, dy); if (d < 2 * R || d > 6 * R) continue;
    const s = score(dx, dy); if (!Number.isFinite(s)) continue;
    top.push({ x: dx, y: dy, score: s }); top.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0)); if (top.length > 5) top.pop();
  }
  if (!top.length) return null;
  // Fine: every offset within one stride of each of them.
  let best = top[0];
  for (const c of top) for (let dy = c.y - stride + 1; dy < c.y + stride; dy++) for (let dx = c.x - stride + 1; dx < c.x + stride; dx++) {
    const s = score(dx, dy); if (!Number.isFinite(s)) continue;
    const candidate = { x: dx, y: dy, score: s }; if (better(candidate, best)) best = candidate;
  }
  return best;
}
