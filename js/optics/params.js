// Camera & lens optics: the controls, their defaults and validation (plan_optics.md).
// Optics runs on the cropped photo before the look (Basic preset or film engine).
// Spatial values are resolution independent: radius r is 0 at the frame centre and 1 at the corners.
// Plain data, no DOM: loaded by app.js, js/optics/worker.js and the Lens panel.
import { formats, FOCAL_LENGTHS } from './formats.js';

/** The camera body: what the physical models (depth of field, diffraction) measure against. Not an effect:
 *  it never counts as an edit, and lens profiles and Reset lens keep it. */
export const cameraControls = [
  { path: 'format', label: 'Format', kind: 'select', options: formats.map(format => format.id), default: '35mm' },
  { path: 'focal', label: 'Focal length', kind: 'select', options: FOCAL_LENGTHS, default: 50, unit: 'mm' },
];
export const cameraOf = optics => Object.fromEntries(cameraControls.map(control => [control.path, optics[control.path]]));
/** The per-photo focus settings (scene controls): kept when a lens profile is applied. */
export const sceneOf = optics => Object.fromEntries(controls.filter(control => control.scene).map(control => [control.path, optics[control.path]]));

/** `amount: true` marks a control that turns its effect on (any value but its default); the others only shape it.
 *  `scene: true`: belongs to this photo's composition (where the focus is), so lens profiles keep it.
 *  `showIf(optics)`: the Lens panel shows the control only when this is true. */
const focusOn = o => o.focusMode !== 'none', focusLine = o => o.focusMode === 'linear' || o.focusMode === 'band';
export const APERTURES = [1.2, 1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16, 22];
export const DISTANCES = [.5, .7, 1, 1.5, 2, 3, 5, 10];
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
  { id: 'focus', title: 'Depth of field (simulated)', controls: [
    { path: 'focusMode', label: 'Focus area', kind: 'select', options: ['none', 'radial', 'linear', 'band'], labels: { none: 'Off', radial: 'Radial', linear: 'Linear', band: 'Tilt-shift band' }, default: 'none', amount: true, scene: true,
      hint: 'A photo has no depth, so you choose what stays sharp: blur grows outside this area as if the background were far away. Drag on the photo to place it.' },
    { path: 'aperture', label: 'Aperture', kind: 'select', options: APERTURES, format: value => `f/${value}`, default: 2, scene: true, showIf: focusOn },
    { path: 'subjectDistance', label: 'Subject distance', kind: 'select', options: DISTANCES, format: value => `${value} m`, default: 2, scene: true, showIf: focusOn },
    { path: 'focusSize', label: 'Size', min: 0, max: 100, step: 1, default: 25, scene: true, showIf: focusOn, hint: 'How large the sharp area is.' },
    { path: 'focusFeather', label: 'Feather', min: 0, max: 100, step: 1, default: 40, scene: true, showIf: focusOn, hint: 'How gradually the blur grows.' },
    { path: 'focusAngle', label: 'Angle', min: -90, max: 90, step: 1, default: 0, unit: '°', signed: true, scene: true, showIf: focusLine },
    { path: 'focusX', label: 'Focus X', min: 0, max: 100, step: 1, default: 50, unit: '%', scene: true, showIf: focusOn },
    { path: 'focusY', label: 'Focus Y', min: 0, max: 100, step: 1, default: 50, unit: '%', scene: true, showIf: focusOn },
  ] },
  { id: 'bokeh', title: 'Bokeh', showIf: focusOn, controls: [
    { path: 'bokehHighlights', label: 'Highlights', min: 0, max: 100, step: 1, default: 60, showIf: focusOn,
      hint: 'How strongly bright points in the blurred area turn into the aperture’s shape. 0 keeps a plain blur.' },
    { path: 'bokehBlades', label: 'Aperture', kind: 'select', options: [0, 5, 6, 7, 8, 9], format: value => (value ? `${value} blades` : 'Round'), default: 0, showIf: focusOn },
    { path: 'bokehRoundness', label: 'Roundness', min: 0, max: 100, step: 1, default: 30, showIf: o => focusOn(o) && o.bokehBlades > 0, hint: 'Curved blades round off the corners.' },
    { path: 'bokehRotation', label: 'Rotation', min: 0, max: 90, step: 1, default: 0, unit: '°', showIf: o => focusOn(o) && o.bokehBlades > 0 },
    { path: 'bokehCatEye', label: 'Cat-eye', min: 0, max: 100, step: 1, default: 30, showIf: focusOn,
      hint: 'Towards the edges the lens barrel clips the aperture into “cat’s eye” shapes.' },
    { path: 'bokehSqueeze', label: 'Anamorphic squeeze', kind: 'select', options: [1, 1.33, 1.5, 1.8, 2], format: value => (value === 1 ? 'None (spherical)' : `${value}×`), default: 1, showIf: focusOn,
      hint: 'Anamorphic cine lenses draw tall oval bokeh.' },
  ] },
];

export const controls = sections.flatMap(section => section.controls.map(control => ({ ...control, section: section.id })));
export const controlByPath = Object.fromEntries(controls.map(control => [control.path, control]));

// `profile`: the id of the last one-tap lens profile applied (profiles.js), or null. It names the look; the values decide the render.
export const defaultOptics = () => ({ ...Object.fromEntries([...controls, ...cameraControls].map(control => [control.path, control.default])), profile: null });

/** A clean copy: every known path present, numbers clamped and snapped to their step, unknown paths dropped. */
export function normalizeOptics(value) {
  const source = value && typeof value === 'object' ? value : {};
  const numbers = Object.fromEntries(controls.map(({ path, kind, options, min, max, step, default: fallback }) => {
    if (kind === 'select') return [path, options.includes(source[path]) ? source[path] : fallback];
    const number = Number(source[path]);
    if (!Number.isFinite(number)) return [path, fallback];
    const snapped = Math.round(Math.min(max, Math.max(min, number)) / step) * step;
    return [path, Number(snapped.toFixed(6))];
  }));
  const camera = Object.fromEntries(cameraControls.map(({ path, options, default: fallback }) => [path, options.includes(source[path]) ? source[path] : fallback]));
  return { ...numbers, ...camera, profile: typeof source.profile === 'string' && /^[a-z0-9-]{1,40}$/.test(source.profile) ? source.profile : null };
}

/** What the render depends on, for cache keys: the effect values only. The camera and the profile name
 *  don't change pixels yet; add a path here when a model starts to use it (depth of field, diffraction). */
export const renderKey = optics => JSON.stringify([controls.map(control => optics?.[control.path]), isOn(optics, 'focusMode') ? [optics.format, optics.focal] : null]);
const isOn = (optics, path) => optics?.[path] !== undefined && optics[path] !== controlByPath[path].default;

/** True when no effect is on, so the stage can hand the photo through untouched. */
export const isNeutral = optics => !optics || controls.every(control => !control.amount || !isOn(optics, control.path));
