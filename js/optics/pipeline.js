// The optics pipeline on an RGBA ImageData-like { data, width, height }. Pure: no DOM, used in the Worker.
//
// Memory: full-size buffers stay 8-bit. Each pixel is decoded to linear light through a table, processed
// and encoded once in a single composite pass. Effects that need a blurred copy (diffusion, bloom; plan
// Task 4) will build float layers at reduced size and add them in that pass.
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
// All are artistic approximations of lens behaviour, not measured lens profiles.
import { normalizeOptics } from './params.js';

const toLinear = new Float32Array(256);
for (let i = 0; i < 256; i++) { const v = i / 255; toLinear[i] = v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }
const ENCODE_SIZE = 16384; // linear → sRGB code; fine enough that the darkest steps stay under one code value
const toSrgb = new Uint8ClampedArray(ENCODE_SIZE + 1);
for (let i = 0; i <= ENCODE_SIZE; i++) { const v = i / ENCODE_SIZE; toSrgb[i] = Math.round(255 * (v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055)); }
/** Linear value → sRGB code (clipped at white; a highlight shoulder comes with bloom). */
const encode = v => toSrgb[v <= 0 ? 0 : v >= 1 ? ENCODE_SIZE : (v * ENCODE_SIZE + .5) | 0];

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
  if (!falloff && !geo) return image;
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
  return image;
}
