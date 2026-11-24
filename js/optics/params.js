// Camera & lens optics: the controls, their defaults and validation (plan_optics.md).
// Optics runs on the cropped photo before the look (Basic preset or film engine).
// Spatial values are resolution independent: radius r is 0 at the frame centre and 1 at the corners.
// Plain data, no DOM: loaded by app.js, js/optics/worker.js and the Lens panel.

/** `amount: true` marks a control that turns its effect on; the others only shape it. */
export const sections = [
  { id: 'geometry', title: 'Geometry', controls: [
    { path: 'distortion', label: 'Distortion', min: -100, max: 100, step: 1, default: 0, signed: true, amount: true,
      hint: 'Negative bows straight lines outwards (barrel), positive pinches them in (pincushion). The frame stays filled, so strong values crop the edges slightly.' },
    { path: 'fringing', label: 'Colour fringing', min: -100, max: 100, step: 1, default: 0, signed: true, amount: true,
      hint: 'Colour edges that grow towards the corners (lateral chromatic aberration). Positive gives red/cyan fringes, negative blue/yellow.' },
  ] },
  { id: 'falloff', title: 'Light falloff', controls: [
    { path: 'falloff', label: 'Falloff', min: -3, max: 1, step: .05, default: 0, unit: 'EV', signed: true, amount: true,
      hint: 'Exposure change at the corners, in stops, as a lens dims towards the edge of the frame. Positive values brighten the corners.' },
    { path: 'falloffMidpoint', label: 'Midpoint', min: 0, max: 100, step: 1, default: 50,
      hint: 'How far from the centre the falloff is halfway.' },
    { path: 'falloffFeather', label: 'Feather', min: 0, max: 100, step: 1, default: 50,
      hint: 'How gradual the falloff is.' },
  ] },
  { id: 'diffusion', title: 'Diffusion', controls: [
    { path: 'diffusion', label: 'Diffusion', min: 0, max: 100, step: 1, default: 0, amount: true,
      hint: 'Light scattered by a softening or mist filter. Spreads light without adding any: contrast drops, detail stays.' },
    { path: 'diffusionSpread', label: 'Spread', min: 0, max: 100, step: 1, default: 40,
      hint: 'How far the scattered light travels.' },
    { path: 'diffusionHighlights', label: 'Highlights only', min: 0, max: 100, step: 1, default: 60,
      hint: 'At 0 the whole picture softens; higher values scatter mostly the bright areas, for a glow around lights and skin.' },
  ] },
  { id: 'bloom', title: 'Bloom', controls: [
    { path: 'bloom', label: 'Bloom', min: 0, max: 100, step: 1, default: 0, amount: true,
      hint: 'Glare around the brightest parts of the picture, as light spills inside the lens.' },
    { path: 'bloomThreshold', label: 'Threshold', min: 0, max: 100, step: 1, default: 75,
      hint: 'How bright an area must be before it blooms.' },
    { path: 'bloomSize', label: 'Size', min: 0, max: 100, step: 1, default: 40,
      hint: 'How wide the glow spreads.' },
    { path: 'bloomWarmth', label: 'Warmth', min: -100, max: 100, step: 1, default: 0, signed: true,
      hint: 'Tints the glow warmer or cooler.' },
  ] },
];

export const controls = sections.flatMap(section => section.controls.map(control => ({ ...control, section: section.id })));
export const controlByPath = Object.fromEntries(controls.map(control => [control.path, control]));

// `profile`: the id of the last one-tap lens profile applied (profiles.js), or null. It names the look; the values decide the render.
export const defaultOptics = () => ({ ...Object.fromEntries(controls.map(control => [control.path, control.default])), profile: null });

/** A clean copy: every known path present, numbers clamped and snapped to their step, unknown paths dropped. */
export function normalizeOptics(value) {
  const source = value && typeof value === 'object' ? value : {};
  const numbers = Object.fromEntries(controls.map(({ path, min, max, step, default: fallback }) => {
    const number = Number(source[path]);
    if (!Number.isFinite(number)) return [path, fallback];
    const snapped = Math.round(Math.min(max, Math.max(min, number)) / step) * step;
    return [path, Number(snapped.toFixed(6))];
  }));
  return { ...numbers, profile: typeof source.profile === 'string' && /^[a-z0-9-]{1,40}$/.test(source.profile) ? source.profile : null };
}

/** True when no effect is on, so the stage can hand the photo through untouched. */
export const isNeutral = optics => !optics || controls.every(control => !control.amount || !optics[control.path]);
