// Export size modes (plan_workflow.md Task 6, A§9.1–9.2 with C10): the exact pixel size of an exported photo. Pure (no
// DOM) so tools/workflow-fixtures.mjs can test it. Sizes are of the photo; frames add their border afterwards.

/** Custom size: resize `by` the long edge, width, height (px) or percent; each keeps its own value. */
export const CUSTOM_BY = { edge: { label: 'Long edge', unit: 'px', min: 16, max: 16384 }, width: { label: 'Width', unit: 'px', min: 16, max: 16384 },
  height: { label: 'Height', unit: 'px', min: 16, max: 16384 }, percent: { label: 'Percent', unit: '%', min: 1, max: 400 } };
export const defaultCustom = () => ({ by: 'edge', edge: 2048, width: 2000, height: 2000, percent: 50, upscale: false });

/** Stored or typed custom settings, made valid (unknown `by` → edge; values clamped to whole numbers in range). */
export function sanitizeCustom(value) {
  const base = defaultCustom(), out = { ...base };
  if (!value || typeof value !== 'object') return out;
  if (Object.hasOwn(CUSTOM_BY, value.by)) out.by = value.by;
  for (const [key, { min, max }] of Object.entries(CUSTOM_BY)) {
    const number = Number(value[key]);
    out[key] = Number.isFinite(number) && number > 0 ? Math.min(max, Math.max(min, Math.round(number))) : base[key];
  }
  out.upscale = value.upscale === true;
  return out;
}

/** The photo's export size. `full` = the largest it can be ({ width, height }: after crop, engine and device limits).
 *  `choice`: { mode: 'full' } | { mode: 'share', shareWidth } | { mode: 'custom', custom }.
 *  Returns { width, height, scale, kept } — `kept`: an enlargement that was refused (upscaling off) or a Share size
 *  the photo is already under. The side the user typed is exact; the other is rounded (aspect error ≤ 0.5 px). */
export function targetSize(full, choice) {
  const { width, height } = full, long = Math.max(width, height);
  let scale = 1, fixed = null, value = 0;
  if (choice.mode === 'share') {
    if (width <= choice.shareWidth) return { width, height, scale: 1, kept: true };
    scale = choice.shareWidth / width; fixed = 'width'; value = choice.shareWidth;
  } else if (choice.mode === 'custom') {
    const custom = sanitizeCustom(choice.custom), by = custom.by;
    value = custom[by];
    if (by === 'percent') scale = value / 100;
    else {
      fixed = by === 'edge' ? (width >= height ? 'width' : 'height') : by;
      scale = value / (by === 'edge' ? long : full[by]);
    }
    if (scale > 1 && !custom.upscale) return { width, height, scale: 1, kept: true };
  } else return { width, height, scale: 1, kept: false };
  const out = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale, kept: false };
  if (fixed) out[fixed] = value;
  return out;
}

/** The long edge to render at so the render is at least `target` on both sides (renders round each side, js/renderer.js
 *  scaledCanvas/cropSource), then trimmed to it. Infinity = full size (no downscale; enlarging happens afterwards). */
export function renderEdgeFor(full, target) {
  const long = Math.max(full.width, full.height);
  if (target.width >= full.width || target.height >= full.height) return Infinity;
  let edge = Math.max(target.width, target.height);
  const predicted = e => ({ width: Math.max(1, Math.round(full.width * e / long)), height: Math.max(1, Math.round(full.height * e / long)) });
  while (edge < long) { const p = predicted(edge); if (p.width >= target.width && p.height >= target.height) break; edge++; }
  return edge >= long ? Infinity : edge;
}

/** How to bring a `from` render to `to` exactly: 'same', 'trim' (≤ 2 px over on each side: centre-crop, no resampling)
 *  or 'resize'. */
export function fitPlan(from, to) {
  if (from.width === to.width && from.height === to.height) return 'same';
  const dw = from.width - to.width, dh = from.height - to.height;
  return dw >= 0 && dh >= 0 && dw <= 2 && dh <= 2 ? 'trim' : 'resize';
}

/** Halving steps for a downscale (each ≥ the target): sizes to draw through before the final draw. */
export function halvingSteps(from, to) {
  const steps = [];
  let { width, height } = from;
  while (width / 2 >= to.width && height / 2 >= to.height) { width = Math.ceil(width / 2); height = Math.ceil(height / 2); steps.push({ width, height }); }
  return steps;
}
