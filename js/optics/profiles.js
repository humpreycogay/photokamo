// One-tap lens profiles for the Lens tab (plan_optics.md Task 5). Plain data: each profile lists only its
// differences from neutral, in the artistic units of params.js, and is expanded when applied.
// Every profile here is ORIGINAL and ILLUSTRATIVE: tuned by eye, not measured from any real lens.
// A measured profile would say source.type 'measured' and record where each value came from.
import { defaultOptics, normalizeOptics, controls } from './params.js';

export const PROFILE_SCHEMA = '1.0';
const original = notes => ({ type: 'original', notes });

export const profiles = [
  { id: 'none', name: 'None', description: 'No lens effects.', source: original('Neutral.'), values: {} },
  { id: 'vintage-50', name: 'Vintage 50 mm', description: 'Soft glow, gentle falloff, a hint of fringing.', source: original('Illustrative; suggests an older fast normal lens wide open.'),
    values: { distortion: -4, fringing: 20, falloff: -.8, falloffMidpoint: 45, falloffFeather: 70, diffusion: 25, diffusionSpread: 35, diffusionHighlights: 70 } },
  { id: 'wide-24', name: 'Wide 24 mm', description: 'Barrel lines, darker corners, fringing at the edges.', source: original('Illustrative; suggests a wide-angle lens.'),
    values: { distortion: -25, fringing: 30, falloff: -1, falloffMidpoint: 55, falloffFeather: 60 } },
  { id: 'tele-85', name: 'Portrait 85 mm', description: 'Slight pincushion and a light, wide falloff.', source: original('Illustrative; suggests a short telephoto.'),
    values: { distortion: 10, falloff: -.4, falloffMidpoint: 60, falloffFeather: 85 } },
  { id: 'soft-portrait', name: 'Soft portrait', description: 'Skin-friendly diffusion with a warm glow.', source: original('Illustrative; suggests a light diffusion filter.'),
    values: { diffusion: 45, diffusionSpread: 50, diffusionHighlights: 75, falloff: -.5, falloffFeather: 80, bloom: 15, bloomWarmth: 20 } },
  { id: 'dreamy-mist', name: 'Dreamy mist', description: 'Strong mist filter: lifted, glowing highlights.', source: original('Illustrative; suggests a strong mist filter.'),
    values: { diffusion: 70, diffusionSpread: 70, diffusionHighlights: 50, bloom: 35, bloomThreshold: 65, bloomSize: 60, bloomWarmth: 15 } },
  { id: 'night-lights', name: 'Night lights', description: 'Glare around street lights and lamps.', source: original('Illustrative.'),
    values: { bloom: 60, bloomThreshold: 80, bloomSize: 45, bloomWarmth: 10, fringing: 15 } },
  { id: 'toy-camera', name: 'Toy camera', description: 'Heavy vignette, bent lines, colour fringes.', source: original('Illustrative; suggests a cheap plastic lens.'),
    values: { distortion: -35, fringing: 70, falloff: -2, falloffMidpoint: 35, falloffFeather: 40, diffusion: 30, diffusionSpread: 40, diffusionHighlights: 30 } },
];
export const profileById = id => profiles.find(profile => profile.id === id) || null;

/** A profile's full optics values (with `profile` set, except for None). */
export const expandProfile = profile => normalizeOptics({ ...defaultOptics(), ...profile.values, profile: profile.id === 'none' ? null : profile.id });
/** True when `optics` has exactly the profile's values. */
export const matchesProfile = (optics, profile) => { const expanded = expandProfile(profile); return controls.every(control => expanded[control.path] === optics[control.path]); };
