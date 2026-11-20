export const defaultAdjustments = Object.freeze({
  exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0,
  temperature: 0, tint: 0, saturation: 0, vibrance: 0, fade: 0,
  grain: 0, vignette: 0, sharpness: 0
});

const p = (id, name, group, description, values = {}, engine = 'Browser Native') => ({
  id, name, group, description, engine, values: { ...defaultAdjustments, ...values }
});

export const presets = [
  p('original', 'Original', 'Utility', 'A clean, unaltered starting point.'),
  p('clean-pop', 'Clean Pop', 'Utility', 'Crisp color and gentle contrast.', { contrast: 10, vibrance: 12, sharpness: 8 }),
  p('soft-proof', 'Soft Proof', 'Utility', 'Quiet contrast with protected highlights.', { contrast: -8, highlights: -18, shadows: 8 }),

  p('warm-natural', 'Warm Natural', 'Camera looks', 'Warm, balanced everyday color.', { temperature: 10, vibrance: 8, contrast: 5 }),
  p('portrait-air', 'Portrait Air', 'Camera looks', 'Soft skin tones and open shadows.', { temperature: 6, tint: 3, contrast: -8, highlights: -12, shadows: 14, saturation: -4 }),
  p('vivid-day', 'Vivid Day', 'Camera looks', 'Clear blues and energetic color.', { contrast: 15, vibrance: 24, saturation: 6, sharpness: 10 }),
  p('quiet-chrome', 'Quiet Chrome', 'Camera looks', 'Muted color with a firm tonal curve.', { saturation: -16, contrast: 14, shadows: -8, highlights: -10 }),
  p('golden-hour', 'Golden Hour', 'Camera looks', 'A warm highlight-forward rendering.', { temperature: 22, tint: 4, highlights: 8, shadows: 6, vibrance: 10 }),
  p('cool-document', 'Cool Document', 'Camera looks', 'Neutral detail with cool shadows.', { temperature: -13, contrast: 10, saturation: -8, sharpness: 14 }),

  p('amber-200', 'Amber 200', 'Film stocks', 'Fine grain, honeyed highlights, soft greens.', { temperature: 15, contrast: -3, highlights: -18, saturation: -5, fade: 4, grain: 13 }, 'Spektrafilm-inspired'),
  p('summer-negative', 'Summer Negative', 'Film stocks', 'Pastel color and generous exposure latitude.', { exposure: .08, temperature: 8, contrast: -12, shadows: 15, saturation: -4, fade: 8, grain: 10 }, 'Spektrafilm-inspired'),
  p('night-tungsten', 'Night Tungsten', 'Film stocks', 'Cool nocturnal color with lively grain.', { exposure: -.1, temperature: -25, tint: 8, contrast: 18, saturation: -10, grain: 25, vignette: 12 }, 'Spektrafilm-inspired'),
  p('slide-daylight', 'Slide Daylight', 'Film stocks', 'Dense blacks and saturated slide color.', { contrast: 24, highlights: -7, shadows: -18, saturation: 17, vibrance: 9, grain: 5 }, 'RawTherapee-inspired'),
  p('faded-print', 'Faded Print', 'Film stocks', 'A sun-softened family print.', { temperature: 12, contrast: -18, saturation: -18, fade: 20, grain: 15 }, 'RawTherapee-inspired'),
  p('silver-mono', 'Silver Mono', 'Film stocks', 'Classic monochrome with silvery midtones.', { saturation: -100, contrast: 18, highlights: -15, shadows: 8, grain: 22 }, 'Browser Native'),

  p('cinema-teal', 'Cinema Teal', 'Creative styles', 'Cool atmosphere and warm highlights.', { temperature: -10, tint: -8, contrast: 20, shadows: -12, saturation: -6, vignette: 12 }),
  p('desert-dream', 'Desert Dream', 'Creative styles', 'Dusty warmth with faded color.', { temperature: 30, tint: 9, contrast: -8, saturation: -12, fade: 17, grain: 9 }),
  p('forest-matte', 'Forest Matte', 'Creative styles', 'Deep greens and lifted black levels.', { temperature: -4, tint: -10, contrast: 12, shadows: -5, saturation: -8, fade: 13, vignette: 8 }),
  p('neon-rain', 'Neon Rain', 'Creative styles', 'Electric color for city nights.', { exposure: -.12, tint: 20, contrast: 27, saturation: 22, vibrance: 28, vignette: 20 }),
  p('rose-memory', 'Rose Memory', 'Creative styles', 'Rosy nostalgia and gentle grain.', { temperature: 13, tint: 20, contrast: -14, highlights: -15, saturation: -7, fade: 14, grain: 16 }),
  p('hard-noir', 'Hard Noir', 'Creative styles', 'Graphic black and white drama.', { saturation: -100, contrast: 42, shadows: -25, highlights: 8, grain: 28, vignette: 24, sharpness: 12 })
];

export const adjustmentSections = [
  { name: 'Light', controls: [
    ['exposure', 'Exposure', -2, 2, .05, ' EV'], ['brightness', 'Brightness', -100, 100, 1, ''],
    ['contrast', 'Contrast', -100, 100, 1, ''], ['highlights', 'Highlights', -100, 100, 1, ''], ['shadows', 'Shadows', -100, 100, 1, '']
  ]},
  { name: 'Color', controls: [
    ['temperature', 'Temperature', -100, 100, 1, ''], ['tint', 'Tint', -100, 100, 1, ''],
    ['saturation', 'Saturation', -100, 100, 1, ''], ['vibrance', 'Vibrance', -100, 100, 1, '']
  ]},
  { name: 'Character', controls: [
    ['fade', 'Fade', 0, 100, 1, ''], ['grain', 'Grain', 0, 100, 1, ''],
    ['vignette', 'Vignette', 0, 100, 1, ''], ['sharpness', 'Clarity', 0, 100, 1, '']
  ]}
];

export const frames = [
  { id: 'none', name: 'None', description: 'Clean edge' },
  { id: 'classic', name: 'Classic', description: '35mm black' },
  { id: 'instant', name: 'Instant', description: 'Wide paper' },
  { id: 'sprocket', name: 'Film strip', description: 'Sprocket edge' }
];