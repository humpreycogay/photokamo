// Advanced-mode controls. `path` is the spektrafilm RuntimePhotoParams path (from the
// spektrafilm-webui MANIFEST). min/max/step come from that manifest. The `default` values are
// the design mockup's example values, NOT verified spektrafilm defaults: when a real engine is
// adopted (Phase 6), read defaults from it instead.

export const optionLabels = {
  kodak_gold_200: 'Kodak Gold 200', kodak_portra_160: 'Kodak Portra 160', kodak_portra_400: 'Kodak Portra 400',
  kodak_portra_800: 'Kodak Portra 800', kodak_portra_800_push1: 'Kodak Portra 800 · push 1', kodak_ektar_100: 'Kodak Ektar 100',
  kodak_ultramax_400: 'Kodak UltraMax 400', kodak_vision3_50d: 'Kodak Vision3 50D', kodak_vision3_250d: 'Kodak Vision3 250D',
  kodak_vision3_500t: 'Kodak Vision3 500T', kodak_ektachrome_100: 'Kodak Ektachrome 100 (slide)', kodak_kodachrome_64: 'Kodak Kodachrome 64 (slide)',
  kodak_portra_endura: 'Kodak Portra Endura', kodak_supra_endura: 'Kodak Supra Endura', kodak_ultra_endura: 'Kodak Ultra Endura',
  kodak_endura_premier: 'Kodak Endura Premier', kodak_ektacolor_edge: 'Kodak Ektacolor Edge', fuji_crystal_archive: 'Fuji Crystal Archive',
  kodak_2383: 'Kodak 2383 (cinema print)'
};
export const optionLabel = value => optionLabels[value] || value;

export const sections = [
  {
    id: 'profiles', step: 'Stock', title: 'Film & paper', openByDefault: true,
    controls: [
      { path: 'film', label: 'Film stock', kind: 'select', default: 'kodak_gold_200',
        options: ['kodak_gold_200', 'kodak_portra_160', 'kodak_portra_400', 'kodak_portra_800', 'kodak_portra_800_push1', 'kodak_ektar_100', 'kodak_ultramax_400', 'kodak_vision3_50d', 'kodak_vision3_250d', 'kodak_vision3_500t', 'kodak_ektachrome_100', 'kodak_kodachrome_64'],
        hint: 'Built from the manufacturer’s published datasheet curves.' },
      { path: 'print', label: 'Print paper', kind: 'select', default: 'kodak_supra_endura',
        options: ['kodak_portra_endura', 'kodak_supra_endura', 'kodak_ultra_endura', 'kodak_endura_premier', 'kodak_ektacolor_edge', 'fuji_crystal_archive', 'kodak_2383'] },
      { path: 'io.scan_film', label: 'Scan the negative only (skip printing)', kind: 'bool', default: false }
    ]
  },
  {
    id: 'camera', step: 'Camera', title: 'Camera & exposure',
    controls: [
      { path: 'camera.auto_exposure', label: 'Auto exposure', kind: 'bool', default: true },
      { path: 'camera.exposure_compensation_ev', label: 'Exposure compensation', kind: 'float', min: -4, max: 4, step: 0.1, unit: 'EV', signed: true, default: 0 },
      { path: 'camera.film_format_mm', label: 'Film format', kind: 'float', min: 4, max: 240, step: 1, unit: 'mm', default: 35 },
      { path: 'camera.lens_blur_um', label: 'Lens softness', kind: 'float', min: 0, max: 80, step: 0.5, unit: 'µm', default: 0 },
      { path: 'camera.diffusion_filter.active', label: 'Diffusion filter', kind: 'bool', role: 'effect-header', default: false, hint: 'Like a Pro-Mist on the lens: glow around highlights.' },
      { path: 'camera.diffusion_filter.strength', label: 'Strength', kind: 'float', min: 0, max: 2, step: 0.125, unit: 'stops', default: 0.5, dependsOn: 'camera.diffusion_filter.active' },
      { path: 'camera.diffusion_filter.halo_warmth', label: 'Glow warmth', kind: 'float', min: -1, max: 1, step: 0.05, signed: true, default: 0, dependsOn: 'camera.diffusion_filter.active', track: '--track-warmth', lo: 'Cool', hi: 'Warm' }
    ]
  },
  {
    id: 'enlarger', step: 'Enlarger', title: 'Enlarger & print', openByDefault: true,
    controls: [
      { path: 'enlarger.print_exposure', label: 'Print exposure', kind: 'float', min: 0.2, max: 3, step: 0.02, unit: '×', default: 1, track: '--track-exposure', lo: 'Lighter print', hi: 'Darker print' },
      { path: 'enlarger.y_filter_shift', label: 'Yellow filter', kind: 'float', min: -60, max: 60, step: 1, signed: true, default: 5, track: '--track-y', lo: 'Bluer', hi: 'Yellower' },
      { path: 'enlarger.m_filter_shift', label: 'Magenta filter', kind: 'float', min: -60, max: 60, step: 1, signed: true, default: 8, track: '--track-m', lo: 'Greener', hi: 'More magenta' },
      { path: 'enlarger.preflash_exposure', label: 'Preflash', kind: 'float', min: 0, max: 1, step: 0.01, default: 0 },
      { path: 'enlarger.lens_blur', label: 'Enlarger lens softness', kind: 'float', min: 0, max: 20, step: 0.1, default: 0 }
    ]
  },
  {
    id: 'render', step: 'Film', title: 'Film character',
    controls: [
      { path: 'film_render.grain.active', label: 'Grain', kind: 'bool', role: 'effect-header', default: true },
      { path: 'film_render.grain.particle_area_um2', label: 'Grain size', kind: 'float', min: 0.05, max: 3.2, step: 0.05, unit: 'µm²', default: 0.2, dependsOn: 'film_render.grain.active' },
      { path: 'film_render.grain.blur', label: 'Grain softness', kind: 'float', min: 0, max: 2, step: 0.05, default: 0.6, dependsOn: 'film_render.grain.active' },
      { path: 'film_render.grain.sublayers_active', label: 'Per-layer grain (slower, more natural)', kind: 'bool', default: true, dependsOn: 'film_render.grain.active' },
      { path: 'film_render.halation.active', label: 'Halation', kind: 'bool', role: 'effect-header', default: true, hint: 'Red glow around bright lights, from light bouncing off the film base.' },
      { path: 'film_render.halation.halation_amount', label: 'Halation amount', kind: 'float', min: 0, max: 3, step: 0.05, default: 1, dependsOn: 'film_render.halation.active' },
      { path: 'film_render.halation.scatter_amount', label: 'Scatter', kind: 'float', min: 0, max: 3, step: 0.05, default: 1, dependsOn: 'film_render.halation.active' },
      { path: 'film_render.halation.boost_ev', label: 'Highlight recovery', kind: 'float', min: 0, max: 3, step: 0.1, unit: 'EV', default: 0, dependsOn: 'film_render.halation.active' },
      { path: 'film_render.dir_couplers.active', label: 'DIR couplers', kind: 'bool', role: 'effect-header', default: true, hint: 'Boosts color separation and edge contrast, like real color negative.' },
      { path: 'film_render.dir_couplers.amount', label: 'Coupler strength', kind: 'float', min: 0, max: 2, step: 0.05, default: 1, dependsOn: 'film_render.dir_couplers.active' },
      { path: 'film_render.glare.active', label: 'Film glare', kind: 'bool', role: 'effect-header', default: true },
      { path: 'film_render.glare.percent', label: 'Glare amount', kind: 'float', min: 0, max: 0.3, step: 0.005, display: 'percent', default: 0.1, dependsOn: 'film_render.glare.active' }
    ]
  },
  {
    id: 'scanner', step: 'Scan', title: 'Scanner & output',
    controls: [
      { path: 'scanner.black_level', label: 'Black point', kind: 'float', min: 0, max: 0.1, step: 0.002, default: 0 },
      { path: 'scanner.white_level', label: 'White point', kind: 'float', min: 0.8, max: 1, step: 0.005, default: 1 },
      // Upstream is [radius, amount]; the UI edits the amount (index 1).
      { path: 'scanner.unsharp_mask', label: 'Scan sharpening', kind: 'vec2', index: 1, min: 0, max: 3, step: 0.05, default: [0.5, 0.5] },
      { path: 'io.output_color_space', label: 'Output color space', kind: 'select', default: 'sRGB', options: ['sRGB', 'Display P3', 'Adobe RGB (1998)', 'ProPhoto RGB', 'ITU-R BT.2020'] }
    ]
  }
];

export const controls = sections.flatMap(section => section.controls.map(control => ({ ...control, section: section.id })));
export const controlByPath = Object.fromEntries(controls.map(control => [control.path, control]));

const clone = value => Array.isArray(value) ? [...value] : value;
export function defaultParams() { return Object.fromEntries(controls.map(control => [control.path, clone(control.default)])); }
export function sameValue(a, b) { return Array.isArray(a) ? a.length === b.length && a.every((item, index) => item === b[index]) : a === b; }
export function isChanged(params, path) { return !sameValue(params[path], controlByPath[path].default); }

// Numeric value a slider shows (vec2 controls edit one component).
export function sliderValue(control, value) { return control.kind === 'vec2' ? value[control.index] : value; }

function decimals(step) { const text = String(step); return text.includes('.') ? Math.min(2, text.length - text.indexOf('.') - 1) : 0; }
export function formatValue(control, value) {
  const number = sliderValue(control, value);
  if (control.display === 'percent') return `${Math.round(number * 1000) / 10}%`;
  const text = Number(number).toFixed(decimals(control.step));
  const sign = control.signed && number > 0 ? '+' : '';
  const unit = !control.unit ? '' : control.unit === '×' ? '×' : ` ${control.unit}`;
  return `${sign}${text}${unit}`;
}

export const sectionSummary = {
  profiles: p => `${optionLabel(p.film)} → ${p['io.scan_film'] ? 'negative scan' : optionLabel(p.print)}`,
  camera: p => `${p['camera.auto_exposure'] ? 'Auto' : 'Manual'} · ${formatValue(controlByPath['camera.exposure_compensation_ev'], p['camera.exposure_compensation_ev'])} · ${p['camera.film_format_mm']} mm`,
  enlarger: p => `Exposure ${Number(p['enlarger.print_exposure']).toFixed(2)}× · Y ${p['enlarger.y_filter_shift']} · M ${p['enlarger.m_filter_shift']}`,
  render: p => [['film_render.grain.active', 'Grain'], ['film_render.halation.active', 'Halation'], ['film_render.dir_couplers.active', 'Couplers'], ['film_render.glare.active', 'Glare']]
    .filter(([path]) => p[path]).map(([, label]) => label).join(' · ') || 'All effects off',
  scanner: p => `${p['io.output_color_space']} · sharpening ${p['scanner.unsharp_mask'][1]}`
};
