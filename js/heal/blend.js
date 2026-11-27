// Heal and clone compositing (plan_workflow.md Task 10, A§7.4). Pure: RGBA arrays of one rect in, the patch out.
// D: the destination (what is there now), S: the source pixels lined up with it (pixel i of S lands on pixel i of D;
// alpha 0 = outside the photo), A: the brush coverage (strokeMask). Clone copies S. Heal first matches S's per-channel
// mean and spread to D's on the ring of untouched pixels around the stroke, so the patch takes on its new
// surroundings' light and colour. Both composite in linear light. Pixels the brush doesn't touch come out transparent.

const LINEAR = Float64Array.from({ length: 256 }, (_, v) => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
const encode = l => { const c = l <= 0 ? 0 : l >= 1 ? 1 : l <= .0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - .055; return Math.round(c * 255); };

/** Per-channel linear mean and standard deviation over `pixels` (indices) of `data`. */
function moments(data, pixels) {
  const sum = [0, 0, 0], sq = [0, 0, 0];
  for (const p of pixels) for (let c = 0; c < 3; c++) { const v = LINEAR[data[p * 4 + c]]; sum[c] += v; sq[c] += v * v; }
  const n = Math.max(1, pixels.length), mean = sum.map(s => s / n);
  return { mean, sd: sq.map((s, c) => Math.sqrt(Math.max(0, s / n - mean[c] ** 2))) };
}

/** The patch for one stroke: RGBA (alpha 255 where the brush paints, else 0). `mode`: 'heal' | 'clone'. */
export function blendPatch(D, S, A, mode) {
  const n = A.length, out = new Uint8ClampedArray(n * 4);
  let match = null;
  if (mode === 'heal') {
    // The ring: pixels the brush doesn't touch whose source is inside the photo.
    const ring = []; for (let p = 0; p < n; p++) if (!A[p] && S[p * 4 + 3]) ring.push(p);
    if (ring.length >= 8) {
      const d = moments(D, ring), s = moments(S, ring);
      match = [0, 1, 2].map(c => ({ muD: d.mean[c], muS: s.mean[c], scale: Math.min(1.25, Math.max(.8, d.sd[c] / Math.max(s.sd[c], 1e-4))) }));
    }
  }
  for (let p = 0; p < n; p++) {
    const a = A[p], o = p * 4;
    if (!a || !S[o + 3]) continue;
    for (let c = 0; c < 3; c++) {
      let s = LINEAR[S[o + c]];
      if (match) s = Math.max(0, match[c].muD + match[c].scale * (s - match[c].muS));
      out[o + c] = encode(a * s + (1 - a) * LINEAR[D[o + c]]);
    }
    out[o + 3] = 255;
  }
  return out;
}
