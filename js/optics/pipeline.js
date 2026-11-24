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
//   weighted, tinted and added: out = I + α·Σ wᵢ·Gᵢ ∗ T(I). It adds light, so encoding rolls highlights off
//   with a shoulder instead of clipping.
// Blur sizes are fractions of the half-diagonal, so they look the same at every image size.
// All are artistic approximations of lens behaviour, not measured lens profiles.
import { normalizeOptics } from './params.js';
import { toLinear, encode, encodeShoulder, linearOf } from './color.js';
import { downsample, blur, upsampler } from './layers.js';

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
  if (!falloff && !geo) return o.diffusion || o.bloom ? applyGlow(image, o) : image;
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
  return o.diffusion || o.bloom ? applyGlow(image, o) : image;
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
  const up = upsampler(w, h, width, height), { x0, x1, fx } = up, s = o.diffusion / 100 * .7;
  const layers = [...(scatter || []), ...(glow || [])];
  const lerp = (row, x) => row[x0[x]] + (row[x1[x]] - row[x0[x]]) * fx[x];
  for (let y = 0, i = 0; y < height; y++) {
    const rows = up.row(layers, y), sr = scatter ? rows : null, gr = glow ? rows.slice(scatter ? 3 : 0) : null;
    for (let x = 0; x < width; x++, i += 4) {
      let r = toLinear[data[i]], g = toLinear[data[i + 1]], b = toLinear[data[i + 2]];
      if (sr) {
        const k = s * diffusionWeight(o, luma(r, g, b));
        r += s * lerp(sr[0], x) - k * r; g += s * lerp(sr[1], x) - k * g; b += s * lerp(sr[2], x) - k * b;
      }
      if (gr) { r += lerp(gr[0], x); g += lerp(gr[1], x); b += lerp(gr[2], x); }
      data[i] = encodeShoulder(r); data[i + 1] = encodeShoulder(g); data[i + 2] = encodeShoulder(b);
    }
  }
  return image;
}
