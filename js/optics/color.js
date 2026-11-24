// sRGB ↔ linear light for the optics pipeline (IEC 61966-2-1 transfer curve), through tables.

export const toLinear = new Float32Array(256);
for (let i = 0; i < 256; i++) { const v = i / 255; toLinear[i] = v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }

const ENCODE_SIZE = 16384; // linear → sRGB code; fine enough that the darkest steps stay under one code value
const toSrgb = new Uint8ClampedArray(ENCODE_SIZE + 1);
for (let i = 0; i <= ENCODE_SIZE; i++) { const v = i / ENCODE_SIZE; toSrgb[i] = Math.round(255 * (v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055)); }

/** Linear value → sRGB code, clipped at white. */
export const encode = v => toSrgb[v <= 0 ? 0 : v >= 1 ? ENCODE_SIZE : (v * ENCODE_SIZE + .5) | 0];

/** Linear value → sRGB code with a highlight shoulder: values above KNEE roll off smoothly towards white
 *  instead of clipping, so added glow keeps its gradation. Used only when bloom or diffusion is on. */
const KNEE = .9, ROOM = 1 - KNEE;
export const encodeShoulder = v => encode(v <= KNEE ? v : KNEE + ROOM * (1 - Math.exp(-(v - KNEE) / ROOM)));

/** sRGB fraction (0–1) → linear. */
export const linearOf = v => (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
