// Advanced-mode controls for the spektrafilm engine (engines/spektrafilm-rs/runtime/spektrafilm.wasm).
// `path` is the UI's key; `engine` (when different) is the spektrafilm RuntimeParams path.
// Defaults are spektrafilm-rs RuntimeParams::default() (pinned commit 9dd59b0), except
// `film`/`print`, which pick a starting stock.
// `spatial: true` marks settings the fast LUT preview cannot show (grain, halation, blur…);
// they only appear in the full-quality render.

// Stocks bundled in engines/spektrafilm-rs/runtime/data/profiles (keep in sync with engines/spektrafilm-rs/tools/build.sh).
// [id, label, type, target print]
export const films = [
  ['kodak_gold_200', 'Kodak Gold 200', 'negative', 'kodak_portra_endura'],
  ['kodak_ultramax_400', 'Kodak UltraMax 400', 'negative', 'kodak_portra_endura'],
  ['kodak_portra_160', 'Kodak Portra 160', 'negative', 'kodak_portra_endura'],
  ['kodak_portra_400', 'Kodak Portra 400', 'negative', 'kodak_portra_endura'],
  ['kodak_portra_800', 'Kodak Portra 800', 'negative', 'kodak_portra_endura'],
  ['kodak_portra_800_push1', 'Kodak Portra 800 · push 1', 'negative', 'kodak_portra_endura'],
  ['kodak_portra_800_push2', 'Kodak Portra 800 · push 2', 'negative', 'kodak_portra_endura'],
  ['kodak_ektar_100', 'Kodak Ektar 100', 'negative', 'kodak_portra_endura'],
  ['fujifilm_c200', 'Fujifilm C200', 'negative', 'fujifilm_crystal_archive_typeii'],
  ['fujifilm_pro_400h', 'Fujifilm Pro 400H', 'negative', 'fujifilm_crystal_archive_typeii'],
  ['fujifilm_xtra_400', 'Fujifilm X-Tra 400', 'negative', 'fujifilm_crystal_archive_typeii'],
  ['kodak_vision3_50d', 'Kodak Vision3 50D (cinema)', 'negative', 'kodak_2383'],
  ['kodak_vision3_200t', 'Kodak Vision3 200T (cinema)', 'negative', 'kodak_2383'],
  ['kodak_vision3_250d', 'Kodak Vision3 250D (cinema)', 'negative', 'kodak_2383'],
  ['kodak_vision3_500t', 'Kodak Vision3 500T (cinema)', 'negative', 'kodak_2383'],
  ['kodak_verita_200d', 'Kodak Verita 200D (cinema)', 'negative', 'kodak_2383'],
  ['kodak_ektachrome_100', 'Kodak Ektachrome 100 (slide)', 'positive', null],
  ['kodak_kodachrome_64', 'Kodak Kodachrome 64 (slide)', 'positive', null],
  ['fujifilm_provia_100f', 'Fujifilm Provia 100F (slide)', 'positive', null],
  ['fujifilm_velvia_100', 'Fujifilm Velvia 100 (slide)', 'positive', null]
];
export const papers = [
  ['kodak_portra_endura', 'Kodak Portra Endura'],
  ['kodak_supra_endura', 'Kodak Supra Endura'],
  ['kodak_ultra_endura', 'Kodak Ultra Endura'],
  ['kodak_endura_premier', 'Kodak Endura Premier'],
  ['kodak_ektacolor_edge', 'Kodak Ektacolor Edge'],
  ['fujifilm_crystal_archive_typeii', 'Fujifilm Crystal Archive Type II'],
  ['kodak_2383', 'Kodak Vision 2383 (cinema print)'],
  ['kodak_2393', 'Kodak Vision Premier 2393 (cinema print)']
];
const filmInfo = Object.fromEntries(films.map(([id, label, type, target]) => [id, { label, type, target }]));
export const optionLabels = Object.fromEntries([...films, ...papers].map(([id, label]) => [id, label]));
export const optionLabel = value => optionLabels[value] || value;
export const isSlideFilm = film => filmInfo[film]?.type === 'positive';
export const targetPrint = film => filmInfo[film]?.target || null;
/** Slide films are always scanned directly: there is no negative to print. */
export const scansFilm = params => Boolean(params['io.scan_film']) || isSlideFilm(params.film);

export const sections = [
  {
    id: 'profiles', step: 'Stock', title: 'Film & paper', openByDefault: true,
    controls: [
      { path: 'film', label: 'Film stock', kind: 'select', default: 'kodak_gold_200', options: films.map(([id]) => id),
        hint: 'Modelled from the manufacturer’s published datasheet curves.' },
      { path: 'print', label: 'Print paper', kind: 'select', default: 'kodak_portra_endura', options: papers.map(([id]) => id) },
      { path: 'io.scan_film', label: 'Scan the negative only (skip printing)', kind: 'bool', default: false }
    ]
  },
  {
    id: 'camera', step: 'Camera', title: 'Camera & exposure',
    controls: [
      { path: 'camera.auto_exposure', label: 'Auto exposure', kind: 'bool', default: true },
      { path: 'camera.exposure_compensation_ev', label: 'Exposure compensation', kind: 'float', min: -4, max: 4, step: 0.1, unit: 'EV', signed: true, default: 0 },
      { path: 'camera.film_format_mm', label: 'Film format', kind: 'float', min: 4, max: 240, step: 1, unit: 'mm', default: 35, spatial: true,
        hint: 'Bigger film = finer grain and tighter halation for the same photo.' },
      { path: 'camera.lens_blur_um', label: 'Lens softness', kind: 'float', min: 0, max: 80, step: 0.5, unit: 'µm', default: 0, spatial: true },
      { path: 'camera.diffusion_filter.active', label: 'Diffusion filter', kind: 'bool', role: 'effect-header', default: false, spatial: true, hint: 'Like a Pro-Mist on the lens: glow around highlights.' },
      { path: 'camera.diffusion_filter.strength', label: 'Strength', kind: 'float', min: 0, max: 2, step: 0.125, unit: 'stops', default: 0.5, spatial: true, dependsOn: 'camera.diffusion_filter.active' },
      { path: 'camera.diffusion_filter.halo_warmth', label: 'Glow warmth', kind: 'float', min: -1, max: 1, step: 0.05, signed: true, default: 0, spatial: true, dependsOn: 'camera.diffusion_filter.active', track: '--track-warmth', lo: 'Cool', hi: 'Warm' }
    ]
  },
  {
    id: 'enlarger', step: 'Enlarger', title: 'Enlarger & print', openByDefault: true,
    controls: [
      { path: 'enlarger.print_exposure', label: 'Print exposure', kind: 'float', min: 0.2, max: 3, step: 0.02, unit: '×', default: 1, track: '--track-exposure', lo: 'Lighter print', hi: 'Darker print' },
      { path: 'enlarger.y_filter_shift', label: 'Yellow filter', kind: 'float', min: -60, max: 60, step: 1, signed: true, default: 0, track: '--track-y', lo: 'Bluer', hi: 'Yellower' },
      { path: 'enlarger.m_filter_shift', label: 'Magenta filter', kind: 'float', min: -60, max: 60, step: 1, signed: true, default: 0, track: '--track-m', lo: 'Greener', hi: 'More magenta' },
      { path: 'enlarger.preflash_exposure', label: 'Preflash', kind: 'float', min: 0, max: 1, step: 0.01, default: 0, hint: 'A faint flash of light before printing: softer, lifted shadows.' },
      { path: 'enlarger.lens_blur', label: 'Enlarger lens softness', kind: 'float', min: 0, max: 20, step: 0.1, default: 0, spatial: true }
    ]
  },
  {
    id: 'render', step: 'Film', title: 'Film character',
    controls: [
      { path: 'film_render.grain.active', label: 'Grain', kind: 'bool', role: 'effect-header', default: true, spatial: true },
      { path: 'film_render.grain.particle_area_um2', engine: 'film_render.grain.agx_particle_area_um2', label: 'Grain size', kind: 'float', min: 0.05, max: 3.2, step: 0.05, unit: 'µm²', default: 0.2, spatial: true, dependsOn: 'film_render.grain.active' },
      { path: 'film_render.grain.blur', label: 'Grain softness', kind: 'float', min: 0, max: 2, step: 0.05, default: 0.65, spatial: true, dependsOn: 'film_render.grain.active' },
      { path: 'film_render.grain.sublayers_active', label: 'Per-layer grain (slower, more natural)', kind: 'bool', default: true, spatial: true, dependsOn: 'film_render.grain.active' },
      { path: 'film_render.halation.active', label: 'Halation', kind: 'bool', role: 'effect-header', default: true, spatial: true, hint: 'Red glow around bright lights, from light bouncing off the film base.' },
      { path: 'film_render.halation.halation_amount', label: 'Halation amount', kind: 'float', min: 0, max: 3, step: 0.05, default: 1, spatial: true, dependsOn: 'film_render.halation.active' },
      { path: 'film_render.halation.scatter_amount', label: 'Scatter', kind: 'float', min: 0, max: 3, step: 0.05, default: 1, spatial: true, dependsOn: 'film_render.halation.active' },
      { path: 'film_render.halation.boost_ev', label: 'Highlight recovery', kind: 'float', min: 0, max: 3, step: 0.1, unit: 'EV', default: 0, spatial: true, dependsOn: 'film_render.halation.active' },
      { path: 'film_render.dir_couplers.active', label: 'DIR couplers', kind: 'bool', role: 'effect-header', default: true, hint: 'Boosts color separation and edge contrast, like real color negative.' },
      { path: 'film_render.dir_couplers.amount', label: 'Coupler strength', kind: 'float', min: 0, max: 2, step: 0.05, default: 1, dependsOn: 'film_render.dir_couplers.active' },
      { path: 'film_render.glare.active', label: 'Film glare', kind: 'bool', role: 'effect-header', default: true, spatial: true },
      { path: 'film_render.glare.percent', label: 'Glare amount', kind: 'float', min: 0, max: 0.3, step: 0.005, display: 'percent', default: 0.03, spatial: true, dependsOn: 'film_render.glare.active' }
    ]
  },
  {
    id: 'scanner', step: 'Scan', title: 'Scanner',
    controls: [
      { path: 'scanner.black_level', label: 'Black point', kind: 'float', min: 0, max: 0.1, step: 0.002, default: 0.01 },
      { path: 'scanner.white_level', label: 'White point', kind: 'float', min: 0.8, max: 1, step: 0.005, default: 0.98 },
      // Upstream is [radius, amount]; the UI edits the amount (index 1).
      { path: 'scanner.unsharp_mask', label: 'Scan sharpening', kind: 'vec2', index: 1, min: 0, max: 3, step: 0.05, default: [0.7, 0.7], spatial: true }
    ]
  }
];

export const controls = sections.flatMap(section => section.controls.map(control => ({ ...control, section: section.id })));
export const controlByPath = Object.fromEntries(controls.map(control => [control.path, control]));

const clone = value => Array.isArray(value) ? [...value] : value;
export function defaultParams() { return Object.fromEntries(controls.map(control => [control.path, clone(control.default)])); }
export function sameValue(a, b) { return Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((item, index) => item === b[index]) : a === b; }
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

export const stockSummary = p => `${optionLabel(p.film)} → ${scansFilm(p) ? (isSlideFilm(p.film) ? 'slide scan' : 'negative scan') : optionLabel(p.print)}`;
export const sectionSummary = {
  profiles: stockSummary,
  camera: p => `${p['camera.auto_exposure'] ? 'Auto' : 'Manual'} · ${formatValue(controlByPath['camera.exposure_compensation_ev'], p['camera.exposure_compensation_ev'])} · ${p['camera.film_format_mm']} mm`,
  enlarger: p => `Exposure ${Number(p['enlarger.print_exposure']).toFixed(2)}× · Y ${p['enlarger.y_filter_shift']} · M ${p['enlarger.m_filter_shift']}`,
  render: p => [['film_render.grain.active', 'Grain'], ['film_render.halation.active', 'Halation'], ['film_render.dir_couplers.active', 'Couplers'], ['film_render.glare.active', 'Glare']]
    .filter(([path]) => p[path]).map(([, label]) => label).join(' · ') || 'All effects off',
  scanner: p => `Black ${p['scanner.black_level']} · white ${p['scanner.white_level']} · sharpening ${p['scanner.unsharp_mask'][1]}`
};

/** The engine job for these UI params: CLI stock flags + nested RuntimeParams overrides. */
export function engineJob(params) {
  const overrides = {};
  for (const control of controls) {
    if (['film', 'print', 'io.scan_film'].includes(control.path)) continue;
    const keys = (control.engine || control.path).split('.');
    let node = overrides;
    for (const key of keys.slice(0, -1)) node = node[key] ||= {};
    node[keys.at(-1)] = clone(params[control.path]);
  }
  return { film: params.film, print: params.print, scanFilm: scansFilm(params), overrides };
}

/** Key of everything the colour LUT depends on (spatial settings excluded). */
export function colourKey(params) {
  return JSON.stringify([params.film, params.print, scansFilm(params), ...controls.filter(control => !control.spatial && control.kind !== 'select' && control.path !== 'io.scan_film').map(control => params[control.path])]);
}
/** True when the full render would add something the colour preview does not show. */
export function hasSpatialEffects(params) {
  return ['film_render.grain.active', 'film_render.halation.active', 'film_render.glare.active', 'camera.diffusion_filter.active'].some(path => params[path])
    || params['camera.lens_blur_um'] > 0 || params['enlarger.lens_blur'] > 0 || params['scanner.unsharp_mask'][1] > 0;
}
