// The optics pipeline on an RGBA ImageData-like { data, width, height }. Pure: no DOM, used in the Worker.
//
// Memory: full-size buffers stay 8-bit. Each pixel is decoded to linear light through a table, processed
// and encoded once in a single composite pass. Effects that need a blurred copy (diffusion, bloom; plan
// Task 4) will build float layers at reduced size and add them in that pass.
//
// Light falloff: corner exposure change E (stops). With s(r) a smoothstep around the midpoint, the gain at
// radius r is 2^(E · s(r) / s(1)), so the corners change by exactly E stops and the centre stays. This is
// an artistic approximation of lens vignetting, not a measured lens profile.
import { normalizeOptics } from './params.js';

const toLinear = new Float32Array(256);
for (let i = 0; i < 256; i++) { const v = i / 255; toLinear[i] = v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }
const ENCODE_SIZE = 16384; // linear → sRGB code; fine enough that the darkest steps stay under one code value
const toSrgb = new Uint8ClampedArray(ENCODE_SIZE + 1);
for (let i = 0; i <= ENCODE_SIZE; i++) { const v = i / ENCODE_SIZE; toSrgb[i] = Math.round(255 * (v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055)); }
/** Linear value → sRGB code (clipped at white; a highlight shoulder comes with bloom). */
const encode = v => toSrgb[v <= 0 ? 0 : v >= 1 ? ENCODE_SIZE : (v * ENCODE_SIZE + .5) | 0];

const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Gain per radius bucket (r from 0 to 1 in `size` steps), or null when falloff is off. */
function falloffTable(o, size = 1024) {
  if (!o.falloff) return null;
  const mid = .2 + .7 * o.falloffMidpoint / 100, half = .05 + .6 * o.falloffFeather / 100;
  const edge = smoothstep(mid - half, mid + half, 1);
  const table = new Float32Array(size + 1);
  for (let i = 0; i <= size; i++) table[i] = 2 ** (o.falloff * smoothstep(mid - half, mid + half, i / size) / edge);
  return table;
}

/** Applies the optics to `image` in place and returns it. */
export function applyOptics(image, optics) {
  const o = normalizeOptics(optics);
  const { data, width, height } = image;
  const falloff = falloffTable(o);
  if (!falloff) return image;
  const steps = falloff.length - 1;
  const cx = (width - 1) / 2, cy = (height - 1) / 2, inv = 1 / Math.hypot(width / 2, height / 2);
  for (let y = 0, i = 0; y < height; y++) {
    const dy = (y - cy) * inv, dy2 = dy * dy;
    for (let x = 0; x < width; x++, i += 4) {
      const dx = (x - cx) * inv;
      const gain = falloff[Math.min(steps, (Math.sqrt(dx * dx + dy2) * steps + .5) | 0)];
      data[i] = encode(toLinear[data[i]] * gain);
      data[i + 1] = encode(toLinear[data[i + 1]] * gain);
      data[i + 2] = encode(toLinear[data[i + 2]] * gain);
    }
  }
  return image;
}
