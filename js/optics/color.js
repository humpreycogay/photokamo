// sRGB ↔ linear light for the optics pipeline (IEC 61966-2-1 transfer curve), through tables.

export const toLinear = new Float32Array(256);
for (let i = 0; i < 256; i++) { const v = i / 255; toLinear[i] = v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }

const ENCODE_SIZE = 16384; // linear → sRGB code; fine enough that the darkest steps stay under one code value
const toSrgb = new Uint8ClampedArray(ENCODE_SIZE + 1);
for (let i = 0; i <= ENCODE_SIZE; i++) { const v = i / ENCODE_SIZE; toSrgb[i] = Math.round(255 * (v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055)); }

/** Linear value → sRGB code, clipped at white. */
export const encode = v => toSrgb[v <= 0 ? 0 : v >= 1 ? ENCODE_SIZE : (v * ENCODE_SIZE + .5) | 0];

/** `base` plus `added` light (glow, bokeh) → sRGB code. Added light that would pass KNEE rolls off towards white
 *  (rational shoulder: slope 1 at the knee, never reaching 1) instead of clipping, so glow keeps its gradation;
 *  the base itself is never changed: with nothing added this is exactly encode(base), so whites stay 255 and
 *  pixels with and without added light match. Light taken away (diffusion) just encodes. */
const KNEE = .9;
function shoulder(base, v) {
  const start = base > KNEE ? base : KNEE; if (start >= 1) return 255;
  const room = 1 - start, y = (v - start) / room;
  return encode(start + room * y / (1 + y));
}
export const encodeAdd = (base, added) => { const v = base + added; return added <= 0 || v <= KNEE ? encode(v) : shoulder(base, v); }; // small: inlined in the pixel loops

/** sRGB fraction (0–1) → linear. */
export const linearOf = v => (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
