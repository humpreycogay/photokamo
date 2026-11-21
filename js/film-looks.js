// Built-in film looks for the Looks grid (Film filter). Plain data: no engine imports, so this
// file loads at startup. See docs/handover/SPEC.md §3–§5.
//
// Each look:
//   id          'film:<slug>', stored in state.myLookId like a My look id.
//   name        What it looks like (not the stock). The stock shows on the look card.
//   stock       Display name of the stock, for the look card ("Kodak Portra 400").
//   group       Sub-filter inside Film: 'colour' | 'slide' | 'cinema' | 'bw' | 'creative'.
//   engine      Engines in order of preference. The first one that suits the device is used
//               (Negs needs WebGPU). No suitable engine: the tile is hidden.
//   values      Per engine, ONLY the differences from that engine's defaultParams(). Keys are the
//               engine's own param paths and option values (checked against controlByPath[path].options).
//               The stock key comes first ('film' or DuXun's 'filmPreset') so each engine's
//               ui.beforeChange rules run before the rest (target paper, slide scan, preset expansion).
//               DuXun option values are strings of the preset index.
//   thumb       Static JPEG of images/model.jpg rendered at full quality by the look's first engine.
//
// Stock ids were checked against: js/engines/spektrafilm-rs/params.js (films, papers),
// engines/negs/runtime/catalog.json (profiles, color_filters) and js/engines/duxun/core.js (PRESETS).
// Tuning (enlarger filters, grain, etc.) is Task 4: until then a look is its stock on the
// engine's defaults, which is already the engine's real colour.

export const filmLooks = [
  // ── Colour negative ──────────────────────────────────────────────────────────────
  { id: 'film:soft-portrait', name: 'Soft Portrait', stock: 'Kodak Portra 400', group: 'colour', tags: ['portrait'],
    description: 'Soft skin tones and gentle contrast.',
    engine: ['negs', 'spektrafilm-rs', 'duxun'],
    values: { 'negs': { film: 'kodak_portra_400' }, 'spektrafilm-rs': { film: 'kodak_portra_400' }, 'duxun': { filmPreset: '43' } },
    thumb: 'images/looks/soft-portrait.jpg' },
  { id: 'film:fine-portrait', name: 'Fine Portrait', stock: 'Kodak Portra 160', group: 'colour', tags: ['portrait'],
    description: 'Fine grain and natural colour for good light.',
    engine: ['negs', 'spektrafilm-rs', 'duxun'],
    values: { 'negs': { film: 'kodak_portra_160' }, 'spektrafilm-rs': { film: 'kodak_portra_160' }, 'duxun': { filmPreset: '39' } },
    thumb: 'images/looks/fine-portrait.jpg' },
  { id: 'film:low-light-portrait', name: 'Low-light Portrait', stock: 'Kodak Portra 800 · push 1', group: 'colour', tags: ['portrait', 'night'],
    description: 'Pushed for dim rooms: more contrast and grain.',
    engine: ['negs', 'spektrafilm-rs'],
    values: { 'negs': { film: 'kodak_portra_800_push1' }, 'spektrafilm-rs': { film: 'kodak_portra_800_push1' } },
    thumb: 'images/looks/low-light-portrait.jpg' },
  { id: 'film:everyday-gold', name: 'Everyday Gold', stock: 'Kodak Gold 200', group: 'colour', tags: ['everyday'],
    description: 'Warm, sunny colour for everyday snaps.',
    engine: ['negs', 'spektrafilm-rs', 'duxun'],
    values: { 'negs': { film: 'kodak_gold_200' }, 'spektrafilm-rs': { film: 'kodak_gold_200' }, 'duxun': { filmPreset: '36' } },
    thumb: 'images/looks/everyday-gold.jpg' },
  { id: 'film:holiday-snap', name: 'Holiday Snap', stock: 'Kodak UltraMax 400', group: 'colour', tags: ['everyday'],
    description: 'Bright, saturated consumer colour.',
    engine: ['negs', 'spektrafilm-rs', 'duxun'],
    values: { 'negs': { film: 'kodak_ultramax_400' }, 'spektrafilm-rs': { film: 'kodak_ultramax_400' }, 'duxun': { filmPreset: '45' } },
    thumb: 'images/looks/holiday-snap.jpg' },
  { id: 'film:crisp-colour', name: 'Crisp Colour', stock: 'Kodak Ektar 100', group: 'colour', tags: ['landscape'],
    description: 'Fine grain and clean, saturated colour.',
    engine: ['negs', 'spektrafilm-rs', 'duxun'],
    values: { 'negs': { film: 'kodak_ektar_100' }, 'spektrafilm-rs': { film: 'kodak_ektar_100' }, 'duxun': { filmPreset: '35' } },
    thumb: 'images/looks/crisp-colour.jpg' },
  { id: 'film:pastel-air', name: 'Pastel Air', stock: 'Fujifilm Pro 400H', group: 'colour', tags: ['portrait', 'wedding'],
    description: 'Airy pastels and minty greens.',
    engine: ['negs', 'spektrafilm-rs', 'duxun'],
    values: { 'negs': { film: 'fujifilm_pro_400h' }, 'spektrafilm-rs': { film: 'fujifilm_pro_400h' }, 'duxun': { filmPreset: '10' } },
    thumb: 'images/looks/pastel-air.jpg' },
  { id: 'film:cool-everyday', name: 'Cool Everyday', stock: 'Fujifilm C200', group: 'colour', tags: ['everyday'],
    description: 'Cool, clean consumer colour with green shade.',
    engine: ['negs', 'spektrafilm-rs'],
    values: { 'negs': { film: 'fujifilm_c200' }, 'spektrafilm-rs': { film: 'fujifilm_c200' } },
    thumb: 'images/looks/cool-everyday.jpg' },
  { id: 'film:street-snap', name: 'Street Snap', stock: 'Fuji Superia 400', group: 'colour', tags: ['street'],
    description: 'Everyday film with a green lean.',
    engine: ['duxun'],
    values: { 'duxun': { filmPreset: '15' } },
    thumb: 'images/looks/street-snap.jpg' },
  { id: 'film:retro-print', name: 'Retro Print', stock: 'Kodak ColorPlus 200', group: 'colour', tags: ['vintage'],
    description: 'Cheap-and-cheerful warmth, like a 90s print.',
    engine: ['duxun'],
    values: { 'duxun': { filmPreset: '34' } },
    thumb: 'images/looks/retro-print.jpg' },
  { id: 'film:faded-summer', name: 'Faded Summer', stock: 'Agfa Vista 200', group: 'colour', tags: ['vintage'],
    description: 'Soft, faded colour with warm reds.',
    engine: ['duxun'],
    values: { 'duxun': { filmPreset: '3' } },
    thumb: 'images/looks/faded-summer.jpg' },
  { id: 'film:lo-fi-warm', name: 'Lo-fi Warm', stock: 'Harman Phoenix 200', group: 'colour', tags: ['vintage'],
    description: 'Punchy, grainy and unpredictable, on purpose.',
    engine: ['negs'],
    values: { 'negs': { film: 'harman_phoenix_200' } },
    thumb: 'images/looks/lo-fi-warm.jpg' },
  { id: 'film:flat-scan', name: 'Flat Scan', stock: 'Kodak Portra 400 · negative scan', group: 'colour', tags: ['editing'],
    description: 'The negative scanned, not printed: soft and easy to grade.',
    engine: ['negs', 'spektrafilm-rs'],
    values: { 'negs': { film: 'kodak_portra_400', 'io.scan_film': true }, 'spektrafilm-rs': { film: 'kodak_portra_400', 'io.scan_film': true } },
    thumb: 'images/looks/flat-scan.jpg' },

  // ── Slide (scanned directly) ─────────────────────────────────────────────────────
  { id: 'film:vivid-slide', name: 'Vivid Slide', stock: 'Fujifilm Velvia 100', group: 'slide', tags: ['landscape'],
    description: 'Deep greens and blues, rich blacks.',
    engine: ['negs', 'spektrafilm-rs', 'duxun'],
    values: { 'negs': { film: 'fujifilm_velvia_100' }, 'spektrafilm-rs': { film: 'fujifilm_velvia_100' }, 'duxun': { filmPreset: '24' } },
    thumb: 'images/looks/vivid-slide.jpg' },
  { id: 'film:true-slide', name: 'True Slide', stock: 'Fujifilm Provia 100F', group: 'slide', tags: ['landscape'],
    description: 'Accurate slide colour, firm contrast.',
    engine: ['negs', 'spektrafilm-rs', 'duxun'],
    values: { 'negs': { film: 'fujifilm_provia_100f' }, 'spektrafilm-rs': { film: 'fujifilm_provia_100f' }, 'duxun': { filmPreset: '20' } },
    thumb: 'images/looks/true-slide.jpg' },
  { id: 'film:clean-slide', name: 'Clean Slide', stock: 'Kodak Ektachrome 100', group: 'slide', tags: ['travel'],
    description: 'Bright, clean colour with cool whites.',
    engine: ['negs', 'spektrafilm-rs'],
    values: { 'negs': { film: 'kodak_ektachrome_100' }, 'spektrafilm-rs': { film: 'kodak_ektachrome_100' } },
    thumb: 'images/looks/clean-slide.jpg' },
  { id: 'film:classic-slide', name: 'Classic Slide', stock: 'Kodak Kodachrome 64', group: 'slide', tags: ['vintage', 'travel'],
    description: 'Warm reds and deep shadows of mid-century slides.',
    engine: ['negs', 'spektrafilm-rs', 'duxun'],
    values: { 'negs': { film: 'kodak_kodachrome_64' }, 'spektrafilm-rs': { film: 'kodak_kodachrome_64' }, 'duxun': { filmPreset: '52' } },
    thumb: 'images/looks/classic-slide.jpg' },
  { id: 'film:soft-slide', name: 'Soft Slide', stock: 'Fujifilm Astia 100F', group: 'slide', tags: ['portrait'],
    description: 'Slide film made gentle for skin.',
    engine: ['negs', 'duxun'],
    values: { 'negs': { film: 'fujifilm_astia_100f' }, 'duxun': { filmPreset: '18' } },
    thumb: 'images/looks/soft-slide.jpg' },

  // ── Cinema ───────────────────────────────────────────────────────────────────────
  { id: 'film:night-cinema', name: 'Night Cinema', stock: 'Kodak Vision3 500T', group: 'cinema', tags: ['night'],
    description: 'Tungsten movie film on cinema print stock.',
    engine: ['negs', 'spektrafilm-rs'],
    values: { 'negs': { film: 'kodak_vision3_500t' }, 'spektrafilm-rs': { film: 'kodak_vision3_500t' } },
    thumb: 'images/looks/night-cinema.jpg' },
  { id: 'film:day-cinema', name: 'Day Cinema', stock: 'Kodak Vision3 250D', group: 'cinema', tags: ['film-still'],
    description: 'Daylight movie film: wide range, filmic print.',
    engine: ['negs', 'spektrafilm-rs'],
    values: { 'negs': { film: 'kodak_vision3_250d' }, 'spektrafilm-rs': { film: 'kodak_vision3_250d' } },
    thumb: 'images/looks/day-cinema.jpg' },
  { id: 'film:neon-night', name: 'Neon Night', stock: 'CineStill 800T', group: 'cinema', tags: ['night'],
    description: 'A red glow around bright lights.',
    engine: ['negs', 'duxun'],
    values: { 'negs': { film: 'cinestill_800t' }, 'duxun': { filmPreset: '6' } },
    thumb: 'images/looks/neon-night.jpg' },
  { id: 'film:sunny-cinema', name: 'Sunny Cinema', stock: 'CineStill 50D', group: 'cinema', tags: ['film-still'],
    description: 'Clean daylight movie colour, very fine grain.',
    engine: ['duxun'],
    values: { 'duxun': { filmPreset: '5' } },
    thumb: 'images/looks/sunny-cinema.jpg' },
  { id: 'film:muted-cinema', name: 'Muted Cinema', stock: 'Fujifilm Eterna 500', group: 'cinema', tags: ['film-still'],
    description: 'Low-saturation, soft-contrast movie look.',
    engine: ['negs'],
    values: { 'negs': { film: 'fujifilm_eterna_500' } },
    thumb: 'images/looks/muted-cinema.jpg' },

  // ── Black & white ────────────────────────────────────────────────────────────────
  { id: 'film:classic-bw', name: 'Classic B&W', stock: 'Ilford HP5 Plus', group: 'bw', tags: ['street'],
    description: 'Everyday black and white with real grain.',
    engine: ['negs', 'duxun'],
    values: { 'negs': { film: 'ilford_hp5_plus' }, 'duxun': { filmPreset: '30' } },
    thumb: 'images/looks/classic-bw.jpg' },
  { id: 'film:gritty-bw', name: 'Gritty B&W', stock: 'Kodak Tri-X 400', group: 'bw', tags: ['street'],
    description: 'Punchy contrast and bold grain.',
    // negs' Tri-X profile is marked experimental, so DuXun's preset comes first.
    engine: ['duxun'],
    values: { 'duxun': { filmPreset: '33' } },
    thumb: 'images/looks/gritty-bw.jpg' },
  { id: 'film:fine-bw', name: 'Fine B&W', stock: 'Ilford FP4 Plus', group: 'bw', tags: ['landscape'],
    description: 'Smooth tones and fine grain.',
    engine: ['negs', 'duxun'],
    values: { 'negs': { film: 'ilford_fp4_plus' }, 'duxun': { filmPreset: '29' } },
    thumb: 'images/looks/fine-bw.jpg' },
  { id: 'film:silky-bw', name: 'Silky B&W', stock: 'Fujifilm Acros 100', group: 'bw', tags: ['portrait'],
    description: 'Silky midtones, almost no grain.',
    engine: ['negs', 'duxun'],
    values: { 'negs': { film: 'fujifilm_acros_100_ii' }, 'duxun': { filmPreset: '8' } },
    thumb: 'images/looks/silky-bw.jpg' },
  { id: 'film:night-bw', name: 'Night B&W', stock: 'Ilford Delta 3200', group: 'bw', tags: ['night'],
    description: 'Fast film: heavy grain, deep blacks.',
    engine: ['negs', 'duxun'],
    values: { 'negs': { film: 'ilford_delta_3200' }, 'duxun': { filmPreset: '27' } },
    thumb: 'images/looks/night-bw.jpg' },
  { id: 'film:dramatic-sky', name: 'Dramatic Sky', stock: 'Ilford HP5 Plus · red filter', group: 'bw', tags: ['landscape'],
    description: 'Near-black skies and bright clouds.',
    engine: ['negs'],
    values: { 'negs': { film: 'ilford_hp5_plus', 'camera.color_filter': 'hoya_r1' } },
    thumb: 'images/looks/dramatic-sky.jpg' },

  // ── Creative stocks ──────────────────────────────────────────────────────────────
  { id: 'film:infrared-pink', name: 'Infrared Pink', stock: 'Kodak Aerochrome III', group: 'creative', tags: ['creative'],
    description: 'Infrared film: foliage turns pink and red.',
    engine: ['negs'],
    values: { 'negs': { film: 'kodak_aerochrome_1443' } },
    thumb: 'images/looks/infrared-pink.jpg' },
  { id: 'film:urban-muted', name: 'Urban Muted', stock: 'LomoChrome Metropolis', group: 'creative', tags: ['street'],
    description: 'Desaturated colour with punchy contrast.',
    engine: ['negs'],
    values: { 'negs': { film: 'lomography_lomochrome_metropolis' } },
    thumb: 'images/looks/urban-muted.jpg' },
  { id: 'film:turquoise-sky', name: 'Turquoise Sky', stock: 'LomoChrome Turquoise', group: 'creative', tags: ['creative'],
    description: 'Blue skies turn amber, warm tones turn teal.',
    engine: ['negs'],
    values: { 'negs': { film: 'lomography_lomochrome_turquoise' } },
    thumb: 'images/looks/turquoise-sky.jpg' }
];

/** Sub-filters shown under the Film chip, in order. */
export const filmGroups = [
  ['colour', 'Colour'], ['slide', 'Slide'], ['cinema', 'Cinema'], ['bw', 'B&W'], ['creative', 'Creative film']
];
