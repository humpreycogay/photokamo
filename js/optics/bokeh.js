// Aperture-shaped bokeh for the depth-of-field pass (plan_optics.md Task 8). Pure: no DOM.
//
// A defocused point of light images as the shape of the lens aperture, scaled by that point's blur circle.
// So bright light (H) is scattered rather than gathered: every source cell stamps the aperture shape, with
// its own radius, into a layer; each stamp sums to the cell's energy, so light is preserved.
// To bound the cost, sources are grouped by radius onto coarser grids (factor g = 1, 2, 4, …) so a stamp is
// at most ~STAMP px across on its grid; each grid is then spread back to the working grid.
//
// Aperture: circle, or an N-blade polygon blended towards a circle by `roundness`, turned by `rotation`.
// Anamorphic squeeze s makes it s times taller than wide. Cat-eye: the aperture intersected with an equal
// disc shifted along the radial direction by cat · rpos² · ρ (rpos = source distance from the centre over the
// half-diagonal), the optical vignetting that turns edge bokeh into tangential "eyes".
// An artistic approximation: no ring/onion texture, no foreground occlusion, no spectral effects.

const STAMP = 10;

/** Coverage (0–1, antialiased) of the aperture at offset (dx, dy) from a stamp centre of radius rho. */
export function coverage(dx, dy, rho, shape, sx = 0, sy = 0) {
  const x = dx * shape.squeeze, d = Math.sqrt(x * x + dy * dy);
  let limit = rho;
  if (shape.blades) {
    const sector = 2 * Math.PI / shape.blades, angle = Math.atan2(dy, x) - shape.rotation;
    const local = ((angle % sector) + sector) % sector - sector / 2;
    limit = rho * (shape.roundness + (1 - shape.roundness) * Math.cos(Math.PI / shape.blades) / Math.cos(local));
  }
  let c = Math.min(1, Math.max(0, limit - d + .5));
  if (c && (sx || sy)) { const ex = x - sx, ey = dy - sy; c = Math.min(c, Math.max(0, rho - Math.sqrt(ex * ex + ey * ey) + .5)); }
  return c;
}

/** Bokeh layer (three linear planes on the w × h working grid) from highlight planes `hl` whose sources have
 *  blur radius `radius[j]` (working px). */
export function bokehLayer(hl, radius, w, h, o) {
  const shape = { blades: o.bokehBlades, roundness: o.bokehRoundness / 100, rotation: o.bokehRotation * Math.PI / 180, squeeze: o.bokehSqueeze };
  const cat = o.bokehCatEye / 100, cx = (w - 1) / 2, cy = (h - 1) / 2, D = Math.hypot(w / 2, h / 2);
  const out = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)];
  // Group sources by grid factor g (power of two) and sum them into that grid's cells.
  const grids = new Map();
  for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) {
    const e = hl[0][j] + hl[1][j] + hl[2][j]; if (e < 1e-5) continue;
    const g = 2 ** Math.max(0, Math.floor(Math.log2(Math.max(1, radius[j] * 2 / STAMP))));
    if (!grids.has(g)) { const gw = Math.ceil(w / g), gh = Math.ceil(h / g); grids.set(g, { gw, gh, r: new Float32Array(gw * gh), g: new Float32Array(gw * gh), b: new Float32Array(gw * gh), rad: new Float32Array(gw * gh), n: new Float32Array(gw * gh) }); }
    const grid = grids.get(g), k = ((y / g) | 0) * grid.gw + ((x / g) | 0);
    grid.r[k] += hl[0][j]; grid.g[k] += hl[1][j]; grid.b[k] += hl[2][j]; grid.rad[k] += radius[j]; grid.n[k]++;
  }
  for (const [g, grid] of grids) {
    const { gw, gh } = grid, layer = [new Float32Array(gw * gh), new Float32Array(gw * gh), new Float32Array(gw * gh)];
    // Stamps repeat: cache them by radius (¼ px) and cat-eye shift (½ px), normalized to sum 1.
    const stamps = new Map();
    const stampFor = (rho, sx, sy) => {
      const key = `${Math.round(rho * 4)}|${Math.round(sx * 2)}|${Math.round(sy * 2)}`;
      let stamp = stamps.get(key);
      if (!stamp) {
        const reach = Math.ceil(rho + 1), weights = new Float32Array((2 * reach + 1) ** 2); let sum = 0;
        for (let v = -reach, q = 0; v <= reach; v++) for (let u = -reach; u <= reach; u++, q++) sum += weights[q] = coverage(u, v, rho, shape, sx, sy);
        if (sum) for (let q = 0; q < weights.length; q++) weights[q] /= sum;
        stamp = { reach, weights, empty: !sum };
        if (stamps.size < 4096) stamps.set(key, stamp);
      }
      return stamp;
    };
    for (let k = 0; k < gw * gh; k++) {
      if (!grid.n[k]) continue;
      const px = (k % gw + .5) * g - .5, py = (((k / gw) | 0) + .5) * g - .5; // cell centre, working px
      const rho = Math.max(.5, grid.rad[k] / grid.n[k] / g);
      // Cat-eye shift along the radial direction (in the squeezed stamp space), growing towards the edge.
      const ux = (px - cx) / D, uy = (py - cy) / D, rpos = Math.sqrt(ux * ux + uy * uy), shift = cat * rpos * rpos * rho * 1.2;
      const sx = rpos ? ux / rpos * shift * shape.squeeze : 0, sy = rpos ? uy / rpos * shift : 0;
      const gx = k % gw, gy = (k / gw) | 0, { reach, weights, empty } = stampFor(rho, sx, sy);
      if (empty) continue;
      const er = grid.r[k], eg = grid.g[k], eb = grid.b[k];
      for (let v = -reach, q = 0; v <= reach; v++) {
        const ty = gy + v;
        for (let u = -reach; u <= reach; u++, q++) {
          const tx = gx + u, c = weights[q]; if (!c || tx < 0 || ty < 0 || tx >= gw || ty >= gh) continue;
          const t = ty * gw + tx; layer[0][t] += er * c; layer[1][t] += eg * c; layer[2][t] += eb * c;
        }
      }
    }
    // Back to the working grid: each coarse cell's energy spreads over its g × g working pixels (bilinear).
    const norm = 1 / (g * g);
    for (let y = 0, j = 0; y < h; y++) {
      const fy = Math.min(gh - 1, Math.max(0, (y + .5) / g - .5)), y0 = fy | 0, y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < w; x++, j++) {
        const fx = Math.min(gw - 1, Math.max(0, (x + .5) / g - .5)), x0 = fx | 0, x1 = Math.min(gw - 1, x0 + 1), tx = fx - x0;
        for (let c = 0; c < 3; c++) {
          const p = layer[c], top = p[y0 * gw + x0] + (p[y0 * gw + x1] - p[y0 * gw + x0]) * tx, bottom = p[y1 * gw + x0] + (p[y1 * gw + x1] - p[y1 * gw + x0]) * tx;
          out[c][j] += (top + (bottom - top) * ty) * norm;
        }
      }
    }
  }
  return out;
}
