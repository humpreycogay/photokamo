// Advanced-mode controls for the negs engine (engines/negs/).
//
// Controls follow negs v0.17.0's own inspector (src web/controls.js, which takes them from its
// macOS app): same RuntimeParams paths, labels, ranges and steps, same grouping
// (Prep → Camera → Film → Print → Scan & Color). Defaults are NOT written here: they come from
// the engine's catalog (engines/negs/runtime/catalog.json, made by the engine at build time),
// as negs itself does. Left out for now: RAW white balance and Match camera brightness (PhotoKamo
// hands the engine decoded photos), and the per-film grain "stock" lanes (the film's own grain
// preset always applies).

const slider = (label, path, min, max, step, extra = {}) => ({ kind: 'float', label, path, min, max, step, ...extra });
const toggle = (label, path, extra = {}) => ({ kind: 'bool', label, path, ...extra });
const effect = (label, path, hint) => ({ kind: 'bool', role: 'effect-header', label, path, ...(hint ? { hint } : {}) });
const choice = (label, path, options, extra = {}) => ({ kind: 'select', label, path, options, ...extra });
const heading = label => ({ kind: 'heading', label });
const inGroup = (enable, controls) => controls.map(control => ({ ...control, dependsOn: enable }));

const METERING = ['average', 'median', 'center_weighted', 'partial', 'matrix', 'multi_zone', 'highlight_weighted'];
const DIFFUSION_FILTERS = ['black_pro_mist', 'glimmerglass', 'pro_mist', 'cinebloom'];
const curves = at => [
  slider('Gamma', `${at}.gamma_factor`, 0.5, 2, 0.01),
  slider('Fast gamma', `${at}.gamma_factor_fast`, 0.5, 2, 0.01),
  slider('Slow gamma', `${at}.gamma_factor_slow`, 0.5, 2, 0.01),
  slider('Red gamma', `${at}.gamma_factor_red`, 0.5, 2, 0.01),
  slider('Green gamma', `${at}.gamma_factor_green`, 0.5, 2, 0.01),
  slider('Blue gamma', `${at}.gamma_factor_blue`, 0.5, 2, 0.01),
  slider('Developer exhaustion', `${at}.developer_exhaustion`, 0, 1, 0.01)
];

// macOS optionTitle (negs web/controls.js TITLES) + the colour filters' names.
export const TITLES = {
  average: 'Average', median: 'Median', center_weighted: 'Center-Weighted', partial: 'Partial',
  matrix: 'Matrix', multi_zone: 'Multi-Zone', highlight_weighted: 'Highlight-Weighted',
  black_pro_mist: 'Black Pro-Mist', glimmerglass: 'Glimmerglass', pro_mist: 'Pro-Mist', cinebloom: 'CineBloom',
  off: 'Off', oklch: 'OKLCh', oklrab: 'OKLrab', cam16ucs: 'CAM16-UCS', aces_rgc: 'ACES RGC', xy: 'xy Chromaticity',
  hanatos2025: 'Hanatos 2025', arctic2026beta04: 'Arctic 2026 (Beta 04)', mallett2019: 'Mallett 2019',
  none: 'None', hoya_x1: 'Green (Hoya X1)', hoya_x0: 'Yellow-green (Hoya X0)', hoya_y2: 'Yellow (Hoya Y2)', hoya_ya3: 'Orange (Hoya YA3)', hoya_r1: 'Red (Hoya R1)'
};
// What each B&W glass does (negs COLOR_FILTERS effect texts).
export const COLOR_FILTER_EFFECTS = {
  none: 'No glass in front of the lens.',
  hoya_x1: 'Lightens foliage; darkens red lips and skin a little, for a tanned look.',
  hoya_x0: 'Lightens foliage and darkens the sky a little. Kind to skin outdoors.',
  hoya_y2: 'Darkens blue sky a touch so clouds stand out. The everyday filter.',
  hoya_ya3: 'Darker sky, stronger clouds, less haze. Hides freckles and blemishes.',
  hoya_r1: 'Near-black blue sky, bright red and brick, pale skin and lips. Cuts haze hard.'
};

/** Sections for a catalog: { films, papers, colorFilters } decide the stock options. */
export function buildSections(catalog) {
  const films = catalog.profiles.filter(p => !p.paper).map(p => p.id);
  const papers = catalog.profiles.filter(p => p.paper).map(p => p.id);
  const filters = ['none', ...(catalog.color_filters || []).map(f => f.key)];
  return [
    { id: 'stock', step: 'Stock', title: 'Film & paper', openByDefault: true, controls: [
      choice('Film', 'film', films, { hint: ' ' }), // hint text set per stock (profile source) in index.js
      choice('Paper', 'paper', papers),
      toggle('Scan film (skip printing)', 'io.scan_film', { hint: 'Slide films are scanned directly; you can also scan a negative instead of printing it.' }),
      choice('Color filter', 'camera.color_filter', filters, { hint: COLOR_FILTER_EFFECTS.none })
    ] },
    { id: 'prep', step: 'Prep', title: 'Prep', controls: [
      heading('Brightness'),
      slider('Exposure (EV)', 'prep.exposure_ev', -3, 3, 0.05, { signed: true }),
      toggle('Auto exposure', 'camera.auto_exposure', { hint: 'Meters the photograph and exposes the film so the metered area lands on mid-grey, as a camera’s meter does. Exposure adds to it.' }),
      choice('Metering', 'camera.auto_exposure_method', METERING, { dependsOn: 'camera.auto_exposure' }),
      heading('Tone'),
      slider('Highlights', 'prep.highlights', -180, 100, 1, { signed: true }),
      slider('Shadows', 'prep.shadows', -100, 100, 1, { signed: true }),
      slider('Contrast', 'prep.contrast', -100, 100, 1, { signed: true }),
      slider('Lift', 'prep.lift', -100, 100, 1, { signed: true }),
      slider('Gain', 'prep.gain', -100, 100, 1, { signed: true }),
      heading('Color'),
      slider('Color Boost', 'prep.color_boost', -100, 100, 1, { signed: true }),
      slider('Saturation', 'prep.saturation', -100, 100, 1, { signed: true }),
      heading('Detail'),
      slider('Midtone Detail', 'prep.midtone_detail', -100, 100, 1, { signed: true })
    ] },
    { id: 'camera', step: 'Camera', title: 'Camera', controls: [
      slider('Negative exposure (EV)', 'camera.exposure_compensation_ev', -5, 5, 0.1, { signed: true }),
      slider('Film format (mm)', 'camera.film_format_mm', 4, 120, 0.1),
      slider('Lens blur (µm)', 'camera.lens_blur_um', 0, 100, 0.1),
      effect('Lens Diffusion', 'camera.diffusion_filter.active'),
      ...inGroup('camera.diffusion_filter.active', [
        choice('Filter', 'camera.diffusion_filter.filter_family', DIFFUSION_FILTERS),
        slider('Strength', 'camera.diffusion_filter.strength', 0, 2, 0.01),
        slider('Spatial scale', 'camera.diffusion_filter.spatial_scale', 0.1, 3, 0.01),
        slider('Halo warmth', 'camera.diffusion_filter.halo_warmth', -1.5, 1.5, 0.01, { signed: true }),
        slider('Core intensity', 'camera.diffusion_filter.core_intensity', 0, 2, 0.01),
        slider('Halo intensity', 'camera.diffusion_filter.halo_intensity', 0, 2, 0.01),
        slider('Bloom intensity', 'camera.diffusion_filter.bloom_intensity', 0, 2, 0.01),
        slider('Halo size', 'camera.diffusion_filter.halo_size', 0.1, 3, 0.01),
        slider('Bloom size', 'camera.diffusion_filter.bloom_size', 0.1, 3, 0.01)
      ])
    ] },
    { id: 'film', step: 'Film', title: 'Film', openByDefault: true, controls: [
      effect('Film Curves', 'film_render.density_curves_morph.active'),
      ...inGroup('film_render.density_curves_morph.active', curves('film_render.density_curves_morph')),
      effect('Grain', 'film_render.grain.active', 'Granularity, uniformity and grain size come from the film’s own preset.'),
      ...inGroup('film_render.grain.active', [
        slider('Dye clouds (µm)', 'film_render.grain.blur_dye_clouds_um', 0, 5, 0.01),
        slider('Blur (px)', 'film_render.grain.blur', 0, 3, 0.01),
        slider('Sharpen amount', 'film_render.grain.mult_usm_amount', 0, 3, 0.01),
        slider('Sharpen radius (px)', 'film_render.grain.mult_usm_sigma', 0, 3, 0.01),
        slider('Clump blur (µm)', 'film_render.grain.micro_structure.0', 0, 1, 0.01),
        slider('Clump size (nm)', 'film_render.grain.micro_structure.1', 0, 100, 1)
      ]),
      effect('Halation', 'film_render.halation.active'),
      ...inGroup('film_render.halation.active', [
        slider('Amount', 'film_render.halation.halation_amount', 0, 3, 0.01),
        slider('Spatial scale', 'film_render.halation.halation_spatial_scale', 0.1, 5, 0.01),
        slider('Scatter amount', 'film_render.halation.scatter_amount', 0, 3, 0.01),
        slider('Scatter scale', 'film_render.halation.scatter_spatial_scale', 0.1, 5, 0.01),
        slider('Bounces', 'film_render.halation.halation_n_bounces', 1, 5, 1),
        slider('Bounce decay', 'film_render.halation.halation_bounce_decay', 0, 1, 0.01)
      ]),
      effect('DIR Couplers', 'film_render.dir_couplers.active'),
      ...inGroup('film_render.dir_couplers.active', [
        slider('Amount', 'film_render.dir_couplers.amount', 0, 2, 0.01),
        slider('Diffusion (µm)', 'film_render.dir_couplers.diffusion_size_um', 0, 100, 0.1),
        slider('Tail (µm)', 'film_render.dir_couplers.diffusion_tail_um', 0, 400, 1),
        slider('Tail weight', 'film_render.dir_couplers.diffusion_tail_weight', 0, 1, 0.01)
      ]),
      effect('Film Base', 'film_render.base.active'),
      ...inGroup('film_render.base.active', [
        slider('Density', 'film_render.base.scale', 0, 2, 0.01),
        slider('Tilt', 'film_render.base.tilt', -1, 1, 0.01, { signed: true }),
        slider('Cyan', 'film_render.base.cyan', 0, 2, 0.01),
        slider('Magenta', 'film_render.base.magenta', 0, 2, 0.01),
        slider('Yellow', 'film_render.base.yellow', 0, 2, 0.01)
      ])
    ] },
    { id: 'print', step: 'Print', title: 'Print', openByDefault: true, controls: [
      { kind: 'note', id: 'print-skipped', label: 'Printing is skipped while scanning film directly.' },
      heading('Enlarger'),
      slider('Print exposure', 'enlarger.print_exposure', 0.1, 5, 0.01),
      slider('Magenta shift', 'enlarger.m_filter_shift', -50, 50, 0.1, { signed: true, track: '--track-m', lo: 'Greener', hi: 'More magenta' }),
      slider('Yellow shift', 'enlarger.y_filter_shift', -50, 50, 0.1, { signed: true, track: '--track-y', lo: 'Bluer', hi: 'Yellower' }),
      toggle('Exposure compensation', 'enlarger.print_exposure_compensation'),
      slider('Preflash exposure', 'enlarger.preflash_exposure', 0, 0.5, 0.01),
      slider('Preflash magenta', 'enlarger.preflash_m_filter_shift', -50, 50, 0.1, { signed: true }),
      slider('Preflash yellow', 'enlarger.preflash_y_filter_shift', -50, 50, 0.1, { signed: true }),
      effect('Print Diffusion', 'enlarger.diffusion_filter.active'),
      ...inGroup('enlarger.diffusion_filter.active', [
        choice('Filter', 'enlarger.diffusion_filter.filter_family', DIFFUSION_FILTERS),
        slider('Strength', 'enlarger.diffusion_filter.strength', 0, 2, 0.01),
        slider('Spatial scale', 'enlarger.diffusion_filter.spatial_scale', 0.1, 3, 0.01),
        slider('Halo warmth', 'enlarger.diffusion_filter.halo_warmth', -1.5, 1.5, 0.01, { signed: true }),
        slider('Core intensity', 'enlarger.diffusion_filter.core_intensity', 0, 4, 0.05),
        slider('Core size', 'enlarger.diffusion_filter.core_size', 0.1, 4, 0.05),
        slider('Halo intensity', 'enlarger.diffusion_filter.halo_intensity', 0, 4, 0.05),
        slider('Halo size', 'enlarger.diffusion_filter.halo_size', 0.1, 4, 0.05),
        slider('Bloom intensity', 'enlarger.diffusion_filter.bloom_intensity', 0, 4, 0.05),
        slider('Bloom size', 'enlarger.diffusion_filter.bloom_size', 0.1, 4, 0.05)
      ]),
      effect('Print Curves', 'print_render.density_curves_morph.active'),
      ...inGroup('print_render.density_curves_morph.active', curves('print_render.density_curves_morph')),
      effect('Print Base', 'print_render.base.active'),
      ...inGroup('print_render.base.active', [
        slider('Density', 'print_render.base.scale', 0, 2, 0.01),
        slider('Cyan', 'print_render.base.cyan', 0, 2, 0.01),
        slider('Magenta', 'print_render.base.magenta', 0, 2, 0.01),
        slider('Yellow', 'print_render.base.yellow', 0, 2, 0.01)
      ]),
      effect('Glare', 'print_render.glare.active'),
      ...inGroup('print_render.glare.active', [
        slider('Amount', 'print_render.glare.percent', 0, 0.2, 0.001),
        slider('Roughness', 'print_render.glare.roughness', 0, 2, 0.01),
        slider('Blur (px)', 'print_render.glare.blur', 0, 5, 0.01)
      ])
    ] },
    { id: 'scan', step: 'Scan', title: 'Scan & Color', controls: [
      heading('Scanner'),
      slider('Lens blur (px)', 'scanner.lens_blur', 0, 5, 0.01),
      slider('Color noise reduction', 'scanner.chroma_noise_reduction', 0, 100, 1),
      slider('Unsharp radius (px)', 'scanner.unsharp_mask.0', 0, 3, 0.01),
      slider('Unsharp amount', 'scanner.unsharp_mask.1', 0, 2, 0.01),
      toggle('White correction', 'scanner.white_correction'),
      slider('White level', 'scanner.white_level', 0.5, 1, 0.01),
      toggle('Black correction', 'scanner.black_correction'),
      slider('Black level', 'scanner.black_level', 0, 0.5, 0.01),
      heading('Color Management'),
      choice('Output gamut', 'io.output_gamut_compress.algorithm', ['off', 'oklch', 'oklrab', 'cam16ucs', 'aces_rgc']),
      choice('Input gamut', 'io.input_gamut_compress.algorithm', ['off', 'xy']),
      choice('Spectral upsampling', 'settings.rgb_to_raw_method', ['hanatos2025', 'arctic2026beta04', 'mallett2019'])
    ] }
  ];
}

// ---------- Paths into RuntimeParams (numeric segments index arrays: scanner.unsharp_mask.1) ----------
export function getPath(object, path) {
  let node = object;
  for (const key of path.split('.')) { if (node == null) return undefined; node = node[key]; }
  return node;
}
export function setPath(object, path, value) {
  const keys = path.split('.');
  let node = object;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)] = value;
}

/** As negs shows a value: up to the step's decimals, no trailing zeros. */
export function formatNumber(value, step) {
  const decimals = Math.max(0, Math.floor(-Math.log10(step) + 1e-9));
  return String(Number(Number(value).toFixed(decimals)));
}
