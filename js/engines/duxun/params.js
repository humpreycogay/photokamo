// Advanced-mode controls for the DuXun engine (engines/duxun/).
//
// Parameters follow the plugin's own (DuXunFilmSim.cpp describeInContextAction and
// defineCustomPlaceholderParams): same names (used as PhotoKamo param paths), ranges, steps,
// defaults and groups; the Chinese labels and hints are translated. Each group's on/off
// ("Skip / Enable") choice is its switch. Left out, as motion-only effects for video:
// Film Breath, Gate Weave and Overscan. The brand + film cascade is one film list grouped by brand.
import { PRESETS, BRANDS, brandOf } from './core.js';

const slider = (label, path, min, max, step, def, extra = {}) => ({ kind: 'float', label, path, min, max, step, default: def, ...extra });
const choice = (label, path, options, def, extra = {}) => ({ kind: 'select', label, path, options: options.map(([value]) => String(value)), labels: Object.fromEntries(options.map(([value, text]) => [String(value), text])), default: String(def), ...extra });
const effect = (label, path, hint) => ({ kind: 'bool', role: 'effect-header', label, path, default: false, ...(hint ? { hint } : {}) });
const heading = label => ({ kind: 'heading', label });
const group = (enable, controls) => controls.map(control => ({ ...control, dependsOn: enable }));
const hidden = (path, def) => ({ kind: 'float', path, hidden: true, min: 0, max: 2, step: 0.01, default: def, label: path });

const FILMS = PRESETS.map(([name], index) => [index, name]);
export const filmBrand = value => BRANDS[brandOf(Number(value))];
const TRANSFORMS = [[0, 'Timeline / no conversion'], [1, 'Rec.709 Gamma 2.4'], [2, 'DaVinci Wide Gamut / Intermediate']];

export const sections = [
  { id: 'film', step: 'Film', title: 'Film preset', openByDefault: true, controls: [
    choice('Film', 'filmPreset', FILMS, 43, { hint: 'Choosing a film sets every slider from its preset, as the plugin does.' }),
    choice('Scope', 'effectMode', [[0, 'Full simulation'], [1, 'Colour only'], [2, 'Texture only'], [3, 'Grain + halation']], 0, { hint: 'Limits which modules render.' }),
    // The plugin's legacy halation / grain / vignette sliders: hidden there too, still set by presets.
    hidden('halation', 0.30), hidden('grain', 0.15), hidden('vignette', 0)
  ] },
  { id: 'curve', step: 'Curve', title: 'Curve & contrast', openByDefault: true, controls: [
    slider('Contrast', 'contrast', 0.5, 2, 0.01, 1.15, { hint: 'S-curve strength.' }),
    slider('Highlight compression', 'shoulder', 0, 1, 0.01, 0.35, { hint: 'Softens the shoulder of the highlights.' }),
    slider('Shadow compression', 'toe', 0, 1, 0.01, 0.25, { hint: 'Softens the toe of the shadows.' }),
    effect('Dynamic range', 'expandEnabled'),
    ...group('expandEnabled', [
      slider('Strength', 'expandAmount', 0, 2, 0.01, 0, { hint: 'Lowers the black point and opens the highlights for a wider contrast range.' }),
      slider('Black point', 'expandBlack', 0, 1, 0.01, 0.35, { hint: 'Pushes the blacks down for more negative density.' }),
      slider('White point', 'expandWhite', 0, 1, 0.01, 0.45, { hint: 'Opens up highlight headroom.' }),
      slider('Push / pull', 'pushPull', -2, 2, 0.01, 0, { signed: true, hint: 'Negative pulls (less contrast); positive pushes (more density, contrast and grain).' }),
      slider('Edge acutance', 'acutance', -1, 1, 0.01, 0, { signed: true, hint: 'More or less film edge micro-contrast.' })
    ])
  ] },
  { id: 'colour', step: 'Colour', title: 'Colour & density', controls: [
    slider('Density', 'density', 0, 1.5, 0.01, 0.85, { hint: 'Film density.' }),
    slider('Saturation', 'saturation', 0, 2, 0.01, 1, { hint: 'Overall saturation; 1.0 is unchanged.' }),
    slider('Film character strength', 'profileStrength', 0, 2, 0.01, 1, { hint: 'Strength of the film stock colour matrix.' }),
    slider('Print strength', 'printStrength', 0, 1.5, 0.01, 0.65, { hint: 'Blend amount for the print curve and density response.' }),
    effect('Colour correction', 'colorHeadEnabled'),
    ...group('colorHeadEnabled', [
      slider('Strength', 'colorHeadAmount', 0, 2, 0.01, 0, { hint: 'Enables the cyan, magenta and yellow shifts.' }),
      slider('Cyan', 'colorHeadCyan', -1, 1, 0.01, 0, { signed: true, track: '--track-warmth', lo: 'Redder', hi: 'More cyan' }),
      slider('Magenta', 'colorHeadMagenta', -1, 1, 0.01, 0, { signed: true, track: '--track-m', lo: 'Greener', hi: 'More magenta' }),
      slider('Yellow', 'colorHeadYellow', -1, 1, 0.01, 0, { signed: true, track: '--track-y', lo: 'Bluer', hi: 'Yellower' })
    ])
  ] },
  { id: 'print', step: 'Print', title: 'Print contrast', controls: [
    effect('Print', 'printEnabled'),
    ...group('printEnabled', [
      choice('Print stock', 'printStock', [[0, 'Linear'], [1, 'Cineon Film Log'], [2, 'Kodak 2383'], [3, 'Fuji 3513'], [4, 'Kodak Endura'], [5, 'Bromportrait BW']], 2, { hint: 'Choosing a print stock sets its strength, contrast, colour density and vibrance.' }),
      slider('Strength', 'printAmount', 0, 2, 0.01, 0, { hint: 'Strengthens the final print curve, density and warm highlight response.' }),
      slider('Contrast', 'printContrast', 0, 1, 0.01, 0.35),
      slider('Colour density', 'colorDensity', 0, 1, 0.01, 0.35),
      slider('Vibrance', 'vibrance', 0, 1, 0.01, 0, { hint: 'Lifts less-saturated colours first.' }),
      slider('Printer light red', 'printerRed', -1, 1, 0.01, 0, { signed: true }),
      slider('Printer light green', 'printerGreen', -1, 1, 0.01, 0, { signed: true }),
      slider('Printer light blue', 'printerBlue', -1, 1, 0.01, 0, { signed: true }),
      slider('Split toning', 'splitToneAmount', 0, 1, 0.01, 0, { hint: 'Opposite warm/cool shifts in shadows and highlights.' }),
      slider('Split warmth', 'splitToneWarmth', 0, 1, 0.01, 0.55)
    ])
  ] },
  { id: 'texture', step: 'Texture', title: 'Grain, halation & bloom', openByDefault: true, controls: [
    effect('Film grain', 'filmGrainEnabled'),
    ...group('filmGrainEnabled', [
      choice('Grain format', 'filmGrainProfile', [[0, 'Follow film'], [1, '65mm fine'], [2, '35mm standard'], [3, '35mm high-ISO, coarse'], [4, '16mm'], [5, 'Super 8 / 8mm'], [6, 'Custom']], 0, { hint: 'Sets grain size, colour grain and highlight weight for the format.' }),
      choice('Grain mode', 'filmGrainMode', [[0, 'Real grain'], [1, 'Detail-preserving'], [2, 'Dye clouds']], 0),
      slider('Strength', 'filmGrainAmount', 0, 2, 0.01, 0),
      slider('Size', 'filmGrainSize', 0, 1, 0.01, 0.35),
      slider('Colour grain', 'filmGrainColor', 0, 1, 0.01, 0.35, { hint: '0 is monochrome grain, 1 colour grain.' }),
      slider('Shadow grain', 'filmGrainShadows', 0, 1, 0.01, 0.55),
      slider('Midtone grain', 'filmGrainMids', 0, 1, 0.01, 0.70),
      slider('Highlight grain', 'filmGrainHighlights', 0, 1, 0.01, 0.35),
      slider('Grain resolution', 'filmGrainResolution', 0, 1, 0.01, 0.50, { hint: 'Higher is finer grain.' }),
      slider('Chroma noise', 'filmGrainChroma', 0, 1, 0.01, 0.25)
    ]),
    effect('Halation', 'halationEnabled', 'Red-orange glow around highlights, after CineStill 800T.'),
    ...group('halationEnabled', [
      choice('Halation format', 'halationProfile', [[0, 'Follow film'], [1, '65mm standard'], [2, '35mm standard'], [3, '16mm standard'], [4, 'Super 8 / 8mm standard'], [5, '65mm no remjet'], [6, '35mm CineStill / no remjet'], [7, '16mm no remjet'], [8, 'Super 8 / 8mm no remjet'], [9, 'Custom']], 0),
      slider('Strength', 'halationAmount', 0, 2, 0.01, 0),
      slider('Threshold', 'halationThreshold', 0, 1, 0.01, 0.58),
      slider('Radius', 'halationRadius', 0, 1, 0.01, 0.55),
      slider('Warmth', 'halationWarmth', 0, 1, 0.01, 0.80),
      slider('Local edge', 'halationLocal', 0, 1, 0.01, 0.60),
      slider('Global haze', 'halationGlobal', 0, 1, 0.01, 0.30),
      slider('Hue shift', 'halationHue', 0, 1, 0.01, 0.35, { hint: 'From red-orange towards magenta.' }),
      slider('Blue suppression', 'halationBlueComp', 0, 1, 0.01, 0.50),
      slider('Impact', 'halationImpact', 0, 1, 0.01, 0.50),
      slider('Defringe', 'halationDefringe', 0, 1, 0.01, 0.20)
    ]),
    effect('Bloom', 'bloomEnabled', 'Softens and spreads the highlights.'),
    ...group('bloomEnabled', [
      choice('Bloom format', 'bloomProfile', [[0, 'Follow film'], [1, '65mm soft'], [2, '35mm standard'], [3, '16mm visible'], [4, 'Super 8 / 8mm strong'], [5, 'Custom']], 0),
      slider('Strength', 'bloomAmount', 0, 2, 0.01, 0),
      slider('Threshold', 'bloomThreshold', 0, 1, 0.01, 0.66),
      slider('Highlight region', 'bloomRegion', 0, 1, 0.01, 0.42, { hint: 'Higher only affects brighter highlights.' }),
      slider('Region softness', 'bloomSoftness', 0, 1, 0.01, 0.38),
      choice('Region preview', 'bloomMaskPreview', [[0, 'Off'], [1, 'Show bloom region']], 0),
      slider('Radius', 'bloomRadius', 0, 1, 0.01, 0.45),
      slider('Detail', 'bloomDetail', 0, 1, 0.01, 0.35),
      slider('Protect lights', 'bloomSaveLights', 0, 1, 0.01, 0.45),
      slider('Defringe', 'bloomDefringe', 0, 1, 0.01, 0.20)
    ])
  ] },
  { id: 'finish', step: 'Finish', title: 'Damage, vignette & output', controls: [
    effect('Film damage', 'filmDamageEnabled', 'Dust and scratches.'),
    ...group('filmDamageEnabled', [
      choice('Damage format', 'filmDamageProfile', [[0, 'Follow film'], [1, '65mm clean'], [2, '35mm release print'], [3, '16mm archive'], [4, 'Super 8 / 8mm home movie'], [5, 'Custom']], 0),
      slider('Strength', 'filmDamageAmount', 0, 2, 0.01, 0),
      slider('Dust', 'filmDust', 0, 1, 0.01, 0.45),
      slider('Scratches', 'filmScratch', 0, 1, 0.01, 0.35)
    ]),
    effect('Vignette', 'vignetteEnabled'),
    ...group('vignetteEnabled', [
      slider('Strength', 'vignetteAmount', 0, 2, 0.01, 0),
      slider('Radius', 'vignetteRadius', 0, 1, 0.01, 0.70),
      slider('Feather', 'vignetteFeather', 0, 1, 0.01, 0.55)
    ]),
    heading('Colour management'),
    choice('Input transform', 'inputTransform', TRANSFORMS, 0, { hint: 'Timeline: the photo’s own sRGB values, as the plugin uses the timeline’s.' }),
    choice('Output transform', 'outputTransform', TRANSFORMS, 0),
    choice('Glow quality', 'previewQuality', [[0, 'Fast'], [1, 'Balanced'], [2, 'High quality']], 0, { hint: 'Resolution of the halation and bloom buffers.' })
  ] }
];
