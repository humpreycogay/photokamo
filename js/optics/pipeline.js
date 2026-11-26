// The optics pipeline on an RGBA ImageData-like { data, width, height }. Pure: no DOM, used in the Worker.
//
// Memory: full-size buffers stay 8-bit. Each pixel is decoded to linear light through a table, processed
// and encoded. Pass 1 does geometry and falloff; pass 2 (diffusion, bloom) adds blurred float layers that
// are built on a reduced working grid (layers.js) and read back bilinearly.
//
// Coordinates: p is the offset from the frame centre in pixels; r = |p| / half-diagonal (0 centre, 1 corner).
//
// Geometry (one inverse-mapped resample, bilinear in linear light):
//   source(p) = centre + p · (1 + k1·r²) · zoom · scale_channel
//   Distortion d ∈ [−1, 1] gives k1 = −0.15·d: negative d samples further out at the edges (barrel),
//   positive d nearer the centre (pincushion). `zoom` is the largest value for which every point on the
//   frame edge still samples inside the photo, so the frame is always filled.
//   Lateral CA: one colour channel is sampled with scale 1 / (1 + c) (its image is magnified by 1 + c), so
//   the fringe is zero at the centre and grows with r. Positive fringing magnifies red (red/cyan edges),
//   negative magnifies blue (blue/yellow edges).
// Light falloff: corner exposure change E (stops). With s(r) a smoothstep around the midpoint, the gain at
//   radius r is 2^(E · s(r) / s(1)), so the corners change by exactly E stops and the centre stays.
// Diffusion (a mist or softening filter): a share H of the light at each pixel is scattered by a point-spread
//   function and lands nearby: out = I − s·H + s·(PSF ∗ H). The PSF is a narrow core plus a wide, weak scatter
//   (two Gaussians, weights summing to 1), so total light is preserved. H = I·w(L): w is 1 everywhere when
//   Highlights is 0 (overall softness) and favours bright areas as Highlights rises (glow around lights).
// Bloom (glare): bright light above a soft-knee threshold on linear luminance is blurred at four scales,
//   weighted, tinted and added: out = I + α·Σ wᵢ·Gᵢ ∗ T(I). It adds light, so the added light rolls off
//   towards white with a shoulder instead of clipping (color.js encodeAdd); the image itself is never darkened.
// Depth of field (simulated): one photo has no depth, so a mask m(x, y) from the Focus area controls stands in
//   for it: 0 where the subject is sharp, 1 for a background at infinity. The thin-lens blur circle for a
//   point at infinity with the lens focused at distance s is c = f² / (N·(s − f)) on the format; the blur
//   radius at a pixel is m · c / 2. Blur levels (Gaussian, σ ≈ r/2, radii doubling) are built on the working
//   grid by normalized convolution, blur(I·w) / blur(w) with w ≈ m, so the sharp subject doesn't bleed into
//   the blurred background; each pixel mixes its two nearest levels.
//   Bokeh (bokeh.js): bright pixels H (smooth luminance switch) from sources at least ~1.5 working px out of focus are taken
//   out of the Gaussian ladder and scattered in the aperture's shape instead (energy kept, plus an artistic
//   boost for highlights clipped by 8-bit input).
// Diffraction: the Airy pattern of a circular aperture, first dark ring at r = 1.22·λ·N on the format, is
//   approximated by a Gaussian with σ ≈ 0.42·λ·N (λ = 550 nm), measured against the format's half-diagonal.
//   It is a pixel or two at full size, so it runs at full resolution (separable kernel, one channel at a time
//   in a 16-bit linear plane). An approximation: one wavelength, no optical transfer function of the lens.
// Lens flare (artistic): from the brightest area (or a hand-placed source), a veiling haze plus ghosts along
//   the line from the source through the frame centre, shaped by the aperture blades and tinted like coatings.
// Blur sizes are fractions of the half-diagonal, so they look the same at every image size.
// All are artistic approximations of lens behaviour, not measured lens profiles.
import { normalizeOptics } from './params.js';
import { toLinear, encode, encodeAdd, linearOf } from './color.js';
import { downsample, blur, upsampler } from './layers.js';
import { formatById } from './formats.js';
import { bokehLayer, coverage } from './bokeh.js';

const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export const DISTORTION_K1 = .15, FRINGING_MAX = .005;

/** Gain per radius bucket (r from 0 to 1 in `size` steps), or null when falloff is off. */
function falloffTable(o, size = 1024) {
  if (!o.falloff) return null;
  const mid = .2 + .7 * o.falloffMidpoint / 100, half = .05 + .6 * o.falloffFeather / 100;
  const edge = smoothstep(mid - half, mid + half, 1);
  const table = new Float32Array(size + 1);
  for (let i = 0; i <= size; i++) table[i] = 2 ** (o.falloff * smoothstep(mid - half, mid + half, Math.min(1, i / size)) / edge);
  return table;
}

/** Geometry for the resample, or null when distortion and fringing are both off. */
export function geometry(o, width, height) {
  if (!o.distortion && !o.fringing) return null;
  const k1 = -DISTORTION_K1 * o.distortion / 100, c = FRINGING_MAX * Math.abs(o.fringing) / 100;
  const magnified = 1 / (1 + c);
  const scales = o.fringing > 0 ? [magnified, 1, 1] : o.fringing < 0 ? [1, 1, magnified] : [1, 1, 1];
  const cx = (width - 1) / 2, cy = (height - 1) / 2, inv2 = 1 / ((width / 2) ** 2 + (height / 2) ** 2);
  // Auto-fill: the largest zoom at which every frame-edge pixel, in every channel, samples inside the photo.
  let zoom = Infinity;
  const fit = (x, y) => {
    const dx = x - cx, dy = y - cy, f = 1 + k1 * (dx * dx + dy * dy) * inv2;
    for (const s of scales) {
      const ax = Math.abs(dx * f * s), ay = Math.abs(dy * f * s);
      if (ax > 1e-9) zoom = Math.min(zoom, cx / ax);
      if (ay > 1e-9) zoom = Math.min(zoom, cy / ay);
    }
  };
  for (let x = 0; x < width; x++) { fit(x, 0); fit(x, height - 1); }
  for (let y = 0; y < height; y++) { fit(0, y); fit(width - 1, y); }
  if (!Number.isFinite(zoom)) zoom = 1;
  return { k1, scales, zoom, cx, cy, inv2 };
}

/** Bilinear sample of channel `ch` at (x, y), in linear light. Coordinates are clamped to the photo. */
function sample(src, width, height, x, y, ch) {
  x = x < 0 ? 0 : x > width - 1 ? width - 1 : x;
  y = y < 0 ? 0 : y > height - 1 ? height - 1 : y;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
  const x1 = x0 + 1 < width ? x0 + 1 : x0, y1 = y0 + 1 < height ? y0 + 1 : y0;
  const a = (y0 * width + x0) * 4 + ch, b = (y0 * width + x1) * 4 + ch, c = (y1 * width + x0) * 4 + ch, d = (y1 * width + x1) * 4 + ch;
  const top = toLinear[src[a]] + (toLinear[src[b]] - toLinear[src[a]]) * fx;
  const bottom = toLinear[src[c]] + (toLinear[src[d]] - toLinear[src[c]]) * fx;
  return top + (bottom - top) * fy;
}

/** Applies the optics to `image` in place and returns it. */
export function applyOptics(image, optics) {
  const o = normalizeOptics(optics);
  const { data, width, height } = image;
  const falloff = falloffTable(o), geo = geometry(o, width, height);
  if (!falloff && !geo) return afterGeometry(image, o);
  const steps = falloff ? falloff.length - 1 : 0;
  const cx = (width - 1) / 2, cy = (height - 1) / 2, inv = 1 / Math.hypot(width / 2, height / 2);
  const src = geo ? data.slice() : data;
  const [sr, sg, sb] = geo ? geo.scales : [1, 1, 1], same = sr === sg && sg === sb;
  for (let y = 0, i = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++, i += 4) {
      const dx = x - cx, r2 = (dx * dx + dy * dy) * inv * inv;
      const gain = falloff ? falloff[Math.min(steps, (Math.sqrt(r2) * steps + .5) | 0)] : 1;
      let r, g, b;
      if (!geo) { r = toLinear[src[i]]; g = toLinear[src[i + 1]]; b = toLinear[src[i + 2]]; }
      else {
        const f = (1 + geo.k1 * r2) * geo.zoom, px = dx * f, py = dy * f;
        const gx = cx + px * sg, gy = cy + py * sg;
        g = sample(src, width, height, gx, gy, 1);
        r = same ? sample(src, width, height, gx, gy, 0) : sample(src, width, height, cx + px * sr, cy + py * sr, 0);
        b = same ? sample(src, width, height, gx, gy, 2) : sample(src, width, height, cx + px * sb, cy + py * sb, 2);
      }
      data[i] = encode(r * gain); data[i + 1] = encode(g * gain); data[i + 2] = encode(b * gain);
      if (geo) data[i + 3] = 255;
    }
  }
  return afterGeometry(image, o);
}

/** Passes after geometry and falloff: depth of field, then diffusion and bloom. */
function afterGeometry(image, o) {
  if (o.focusMode !== 'none') applyFocus(image, o);
  if (o.diffraction === 'on') applyDiffraction(image, o);
  return o.diffusion || o.bloom || o.flare ? applyGlow(image, o) : image;
}

/** Background blur radius (blur circle / 2 for a point at infinity) as a fraction of the half-diagonal. */
export function focusBlurRadius(o) {
  const format = formatById(o.format) || formatById('35mm'), f = o.focal, s = Math.max(o.subjectDistance * 1000, f * 1.1);
  const circle = f * f / (o.aperture * (s - f));
  return Math.min(.25, circle / 2 / Math.hypot(format.long / 2, format.short / 2));
}
/** m(x, y) for a width × height image: 0 inside the sharp area, rising to 1 across the feather. */
export function focusMask(o, width, height) {
  const D = Math.hypot(width / 2, height / 2), fx = o.focusX / 100 * (width - 1), fy = o.focusY / 100 * (height - 1);
  const R = o.focusSize / 100, F = .02 + .98 * o.focusFeather / 100, angle = o.focusAngle * Math.PI / 180, nx = -Math.sin(angle), ny = Math.cos(angle);
  const mode = o.focusMode;
  return (x, y) => {
    const dx = (x - fx) / D, dy = (y - fy) / D;
    const d = mode === 'radial' ? Math.sqrt(dx * dx + dy * dy) : mode === 'band' ? Math.abs(dx * nx + dy * ny) : -(dx * nx + dy * ny);
    return smoothstep(R, R + F, d);
  };
}

export const WAVELENGTH_MM = 550e-6;
/** Gaussian σ approximating the Airy core at the camera's aperture, as a fraction of the half-diagonal. */
export function diffractionSigma(o) {
  const format = formatById(o.format) || formatById('35mm');
  return .42 * WAVELENGTH_MM * o.aperture / Math.hypot(format.long / 2, format.short / 2);
}
function applyDiffraction(image, o) {
  const { data, width, height } = image, sigma = diffractionSigma(o) * Math.hypot(width / 2, height / 2);
  if (sigma < .25) return image; // under a quarter pixel: nothing to see at this size
  const reach = Math.ceil(2.5 * sigma), size = 2 * reach + 1, kernel = new Float32Array(size);
  let sum = 0; for (let k = 0; k < size; k++) sum += kernel[k] = Math.exp(-((k - reach) ** 2) / (2 * sigma * sigma));
  for (let k = 0; k < size; k++) kernel[k] /= sum;
  // One channel at a time in a 16-bit linear plane. Rows: a padded line, so the inner loop has no clamping.
  // Columns: a row at a time (output row y sums kernel-weighted input rows), so memory is read in order.
  const plane = new Uint16Array(width * height), line = new Float32Array(width + 2 * reach), acc = new Float32Array(width), SCALE = 65535;
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) line[x + reach] = toLinear[data[(row + x) * 4 + c]];
      for (let k = 0; k < reach; k++) { line[k] = line[reach]; line[width + reach + k] = line[width + reach - 1]; }
      for (let x = 0; x < width; x++) { let v = 0; for (let k = 0; k < size; k++) v += kernel[k] * line[x + k]; plane[row + x] = v * SCALE + .5; }
    }
    for (let y = 0; y < height; y++) {
      acc.fill(0);
      for (let k = 0; k < size; k++) {
        const source = Math.min(height - 1, Math.max(0, y + k - reach)) * width, weight = kernel[k] / SCALE;
        for (let x = 0; x < width; x++) acc[x] += weight * plane[source + x];
      }
      const row = y * width;
      for (let x = 0; x < width; x++) data[(row + x) * 4 + c] = encode(acc[x]);
    }
  }
  return image;
}

// Ghosts along the source → centre axis: position t (0 = source, 1 = centre, beyond = the other side), radius (× D), tint.
const GHOSTS = [[.55, .018, [1, .75, .6]], [1.35, .05, [.6, 1, .75]], [1.7, .11, [.8, .62, 1]], [2.1, .07, [1, .82, .5]], [2.6, .16, [.65, .95, 1]], [-.25, .03, [.7, .8, 1]]];
/** Flare planes on the working grid, or null when there's no source bright enough (Brightest area). */
function flareLayer(low, o) {
  const { width: w, height: h, r, g, b } = low, n = w * h, D = Math.hypot(w / 2, h / 2), cx = (w - 1) / 2, cy = (h - 1) / 2;
  let sx, sy, strength, color;
  if (o.flareSource === 'manual') { sx = o.flareX / 100 * (w - 1); sy = o.flareY / 100 * (h - 1); strength = 1; color = [1, .95, .85]; }
  else {
    const lum = new Float32Array(n); for (let j = 0; j < n; j++) lum[j] = luma(r[j], g[j], b[j]);
    const soft = blur(lum, w, h, .012 * D); let best = 0;
    for (let j = 1; j < n; j++) if (soft[j] > soft[best]) best = j;
    strength = smoothstep(.35, .85, soft[best]); if (!strength) return null;
    sx = best % w; sy = (best / w) | 0;
    const reach = Math.max(1, Math.round(.02 * D)); let cr = 0, cg = 0, cb = 0;
    for (let y = Math.max(0, sy - reach); y <= Math.min(h - 1, sy + reach); y++) for (let x = Math.max(0, sx - reach); x <= Math.min(w - 1, sx + reach); x++) { const j = y * w + x; cr += r[j]; cg += g[j]; cb += b[j]; }
    const top = Math.max(cr, cg, cb, 1e-6); color = [cr / top, cg / top, cb / top];
  }
  const amount = o.flare / 100 * strength, ghostShare = o.flareGhosts / 100;
  const veil = amount * (1 - .6 * ghostShare), ghostGain = amount * ghostShare * .5;
  const shape = { blades: o.bokehBlades || 6, roundness: o.bokehBlades ? o.bokehRoundness / 100 : .35, rotation: o.bokehRotation * Math.PI / 180, squeeze: 1 };
  const planes = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], spread = .3 * D;
  for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) {
    const dx = x - sx, dy = y - sy, glow = veil * (.22 * Math.exp(-(dx * dx + dy * dy) / (2 * spread * spread)) + .025);
    for (let c = 0; c < 3; c++) planes[c][j] = glow * color[c];
  }
  for (const [t, size, tint] of GHOSTS) {
    const gx = sx + (cx - sx) * t, gy = sy + (cy - sy) * t, rho = size * D, reach = Math.ceil(rho + 2);
    for (let y = Math.max(0, Math.floor(gy - reach)); y <= Math.min(h - 1, Math.ceil(gy + reach)); y++) {
      for (let x = Math.max(0, Math.floor(gx - reach)); x <= Math.min(w - 1, Math.ceil(gx + reach)); x++) {
        const c = coverage(x - gx, y - gy, rho, shape); if (!c) continue;
        const j = y * w + x, rim = 1 + .6 * smoothstep(.75, 1, Math.hypot(x - gx, y - gy) / rho); // brighter rim
        for (let k = 0; k < 3; k++) planes[k][j] += ghostGain * c * rim * tint[k] * color[k] * (.15 + .85 * (1 - size * 3));
      }
    }
  }
  return planes.map(plane => blur(plane, w, h, .004 * D + .6)); // soft ghost edges
}

function applyFocus(image, o) {
  const { data, width, height } = image;
  const low = downsample(data, width, height), { width: w, height: h } = low, n = w * h;
  const rmax = focusBlurRadius(o) * Math.hypot(w / 2, h / 2); // working-grid px
  if (rmax < .5) return image;
  const mask = focusMask(o, width, height), weight = new Float32Array(n);
  for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) weight[j] = .02 + mask((x + .5) * width / w - .5, (y + .5) * height / h - .5);
  const K = Math.max(1, Math.ceil(Math.log2(rmax / .75)) + 1), radii = Array.from({ length: K }, (_, k) => rmax / 2 ** (K - 1 - k));
  // Highlights that become aperture shapes: soft-knee threshold, only from sources clearly out of focus.
  let base = [low.r, low.g, low.b], bokeh = null;
  if (o.bokehHighlights > 0) {
    // A highlight pixel moves into the aperture shape as a whole (all of a defocused point's light images as
    // the aperture); pixels around the threshold move partly, so there is no hard edge.
    const v = o.bokehHighlights / 100, t = linearOf(.92 - .35 * v), boost = 1 + 2 * v;
    // Only points of light become shapes: a pixel must also stand out from its surroundings. A uniformly
    // bright area (sky) blurred by the aperture stays uniform, so it can stay in the Gaussian ladder; this
    // also keeps the number of stamps small.
    const radius = weight.map(value => (value - .02) * rmax), hl = base.map(() => new Float32Array(n));
    const lum = new Float32Array(n); for (let j = 0; j < n; j++) lum[j] = luma(low.r[j], low.g[j], low.b[j]);
    const around = blur(lum, w, h, Math.max(1.5, rmax / 3));
    base = base.map(plane => Float32Array.from(plane));
    for (let j = 0; j < n; j++) {
      const l = lum[j];
      const k = smoothstep(t * .7, t * 1.15, l) * smoothstep(1, 2.5, radius[j]) * smoothstep(.15, .45, 1 - around[j] / Math.max(l, 1e-4));
      if (!k) continue;
      for (let c = 0; c < 3; c++) { const part = base[c][j] * k; base[c][j] -= part; hl[c][j] = part * boost; }
    }
    bokeh = bokehLayer(hl, radius, w, h, o);
  }
  let num = base.map(plane => { const out = new Float32Array(n); for (let j = 0; j < n; j++) out[j] = plane[j] * weight[j]; return out; }), den = weight, previous = 0;
  const levels = [];
  for (const r of radii) { // cascade: each level blurs the last by √(σₖ² − σₖ₋₁²)
    const sigma = r / 2, step = Math.sqrt(sigma * sigma - previous * previous); previous = sigma;
    num = num.map(plane => blur(plane, w, h, step)); den = blur(den, w, h, step);
    const inverse = new Float32Array(n); for (let j = 0; j < n; j++) inverse[j] = 1 / Math.max(den[j], 1e-6);
    for (const plane of num) { const level = new Float32Array(n); for (let j = 0; j < n; j++) level[j] = plane[j] * inverse[j]; levels.push(level); }
  }
  if (bokeh) levels.push(...bokeh);
  const up = upsampler(w, h, width, height), { x0, x1, fx } = up, first = radii[0], B = K * 3;
  const lerp = (row, x) => row[x0[x]] + (row[x1[x]] - row[x0[x]]) * fx[x];
  for (let y = 0, i = 0; y < height; y++) {
    const rows = up.row(levels, y);
    for (let x = 0; x < width; x++, i += 4) {
      const m = mask(x, y); if (m <= 0) continue;
      const r = m * rmax;
      let lo, hi, t;
      if (r <= first) { lo = -1; hi = 0; t = r / first; }
      else { const k = Math.floor(Math.log2(r / first)); if (k >= K - 1) { lo = hi = K - 1; t = 0; } else { lo = k; hi = k + 1; t = Math.log2(r / radii[k]); } }
      const shapes = bokeh ? Math.min(1, m / .1) : 0; // the sharp subject hides the background's bokeh
      for (let c = 0; c < 3; c++) {
        const a = lo < 0 ? toLinear[data[i + c]] : lerp(rows[lo * 3 + c], x), b = lerp(rows[hi * 3 + c], x);
        data[i + c] = encodeAdd(a + (b - a) * t, shapes ? shapes * lerp(rows[B + c], x) : 0); // bokeh adds light
      }
    }
  }
  return image;
}

const luma = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
/** Share of a pixel's light that diffusion scatters, by linear luminance. */
const diffusionWeight = (o, l) => { const h = o.diffusionHighlights / 100; return 1 - h + h * smoothstep(.05, .7, l); };

/** Pass 2: diffusion and bloom layers on the working grid, then added at full size. */
function applyGlow(image, o) {
  const { data, width, height } = image;
  const low = downsample(data, width, height), { width: w, height: h } = low, n = w * h;
  const diag = Math.hypot(w / 2, h / 2);
  let scatter = null, glow = null;
  if (o.diffusion) {
    const sp = o.diffusionSpread / 100, core = (.002 + .01 * sp) * diag, wide = (.015 + .06 * sp) * diag;
    scatter = ['r', 'g', 'b'].map(() => new Float32Array(n));
    const planes = ['r', 'g', 'b'].map(() => new Float32Array(n));
    for (let j = 0; j < n; j++) { const k = diffusionWeight(o, luma(low.r[j], low.g[j], low.b[j])); planes[0][j] = low.r[j] * k; planes[1][j] = low.g[j] * k; planes[2][j] = low.b[j] * k; }
    planes.forEach((plane, c) => { const a = blur(plane, w, h, core), b = blur(plane, w, h, wide); for (let j = 0; j < n; j++) scatter[c][j] = .65 * a[j] + .35 * b[j]; });
  }
  if (o.bloom) {
    const t = linearOf(o.bloomThreshold / 100), knee = Math.max(.02, t * .5);
    const bright = ['r', 'g', 'b'].map(() => new Float32Array(n));
    for (let j = 0; j < n; j++) {
      const l = luma(low.r[j], low.g[j], low.b[j]), soft = Math.min(2 * knee, Math.max(0, l - t + knee)) ** 2 / (4 * knee);
      const k = Math.max(soft, l - t) / Math.max(l, 1e-4);
      bright[0][j] = low.r[j] * k; bright[1][j] = low.g[j] * k; bright[2][j] = low.b[j] * k;
    }
    const base = (.004 + .03 * o.bloomSize / 100) * diag, weights = [.35, .3, .2, .15], warm = o.bloomWarmth / 100;
    const tint = [1 + .3 * warm, 1 + .04 * warm, 1 - .3 * warm], alpha = 1.5 * o.bloom / 100;
    glow = bright.map((plane, c) => {
      const sum = new Float32Array(n);
      // Cascade: each scale blurs the previous one by √(σᵢ² − σᵢ₋₁²), so the wide scales cost the same as the narrow.
      let current = plane, previous = 0;
      weights.forEach((weight, i) => {
        const sigma = base * 2 ** i; current = blur(current, w, h, Math.sqrt(sigma * sigma - previous * previous)); previous = sigma;
        for (let j = 0; j < n; j++) sum[j] += weight * current[j];
      });
      for (let j = 0; j < n; j++) sum[j] *= alpha * tint[c];
      return sum;
    });
  }
  const flare = o.flare ? flareLayer(low, o) : null;
  if (flare) glow = glow ? glow.map((plane, c) => plane.map((v, j) => v + flare[c][j])) : flare;
  const up = upsampler(w, h, width, height), { x0, x1, fx } = up, s = o.diffusion / 100 * .7;
  const layers = [...(scatter || []), ...(glow || [])];
  const lerp = (row, x) => row[x0[x]] + (row[x1[x]] - row[x0[x]]) * fx[x];
  for (let y = 0, i = 0; y < height; y++) {
    const rows = up.row(layers, y), sr = scatter ? rows : null, gr = glow ? rows.slice(scatter ? 3 : 0) : null;
    for (let x = 0; x < width; x++, i += 4) {
      const r0 = toLinear[data[i]], g0 = toLinear[data[i + 1]], b0 = toLinear[data[i + 2]];
      let r = r0, g = g0, b = b0;
      if (sr) {
        const k = s * diffusionWeight(o, luma(r, g, b));
        r += s * lerp(sr[0], x) - k * r; g += s * lerp(sr[1], x) - k * g; b += s * lerp(sr[2], x) - k * b;
      }
      if (gr) { r += lerp(gr[0], x); g += lerp(gr[1], x); b += lerp(gr[2], x); }
      data[i] = encodeAdd(r0, r - r0); data[i + 1] = encodeAdd(g0, g - g0); data[i + 2] = encodeAdd(b0, b - b0);
    }
  }
  return image;
}
