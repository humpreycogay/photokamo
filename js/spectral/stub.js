// STUB spectral engine: maps a few spektrafilm params onto PhotoKamo's existing renderer so the
// Advanced UI can be built and tested before the real engine (Phase 6) is chosen.
// This is a visual approximation only. It does not model film or paper.

const FILM_BIAS = {
  kodak_gold_200: { temperature: 8, saturation: 4 },
  kodak_portra_160: { saturation: -8, contrast: -6, temperature: 3 },
  kodak_portra_400: { saturation: -6, contrast: -4, temperature: 4 },
  kodak_portra_800: { saturation: -4, contrast: -2, temperature: 5, grain: 6 },
  kodak_portra_800_push1: { saturation: 2, contrast: 8, temperature: 5, grain: 10 },
  kodak_ektar_100: { saturation: 16, contrast: 8, vibrance: 6 },
  kodak_ultramax_400: { saturation: 8, temperature: 7, contrast: 4, grain: 4 },
  kodak_vision3_50d: { saturation: -4, contrast: -8, shadows: 6 },
  kodak_vision3_250d: { saturation: -6, contrast: -8, shadows: 8, grain: 3 },
  kodak_vision3_500t: { temperature: -20, tint: 3, contrast: -6, grain: 8 },
  kodak_ektachrome_100: { saturation: 12, contrast: 16, temperature: -4, shadows: -8 },
  kodak_kodachrome_64: { saturation: 14, contrast: 18, temperature: 5, shadows: -10 }
};
const PAPER_BIAS = {
  kodak_portra_endura: { contrast: -4, saturation: -4 },
  kodak_supra_endura: {},
  kodak_ultra_endura: { contrast: 6, saturation: 10 },
  kodak_endura_premier: { contrast: 4, saturation: 4 },
  kodak_ektacolor_edge: { contrast: 2, temperature: 3 },
  fuji_crystal_archive: { tint: -4, saturation: 4 },
  kodak_2383: { contrast: 18, saturation: -4, temperature: -4, shadows: -8 }
};
const RANGES = {
  exposure: [-2, 2], brightness: [-100, 100], contrast: [-100, 100], highlights: [-100, 100], shadows: [-100, 100],
  temperature: [-100, 100], tint: [-100, 100], saturation: [-100, 100], vibrance: [-100, 100],
  fade: [0, 100], grain: [0, 100], vignette: [0, 100], sharpness: [0, 100]
};

export function stubAdjustments(p) {
  const a = { exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0, vibrance: 0, fade: 0, grain: 0, vignette: 0, sharpness: 0 };
  const add = bias => Object.entries(bias || {}).forEach(([key, value]) => { a[key] += value; });

  add(FILM_BIAS[p.film]);
  if (p['io.scan_film']) { a.fade += 10; a.contrast -= 10; } else add(PAPER_BIAS[p.print]);

  // Camera
  a.exposure += p['camera.exposure_compensation_ev'] * (p['camera.auto_exposure'] ? 0.4 : 1);
  if (p['camera.diffusion_filter.active']) {
    a.highlights += p['camera.diffusion_filter.strength'] * 10;
    a.contrast -= p['camera.diffusion_filter.strength'] * 6;
    a.temperature += p['camera.diffusion_filter.halo_warmth'] * 12;
  }
  // Enlarger: more print exposure = darker print; Y/M filters shift color
  a.exposure -= Math.log2(p['enlarger.print_exposure']);
  a.temperature += p['enlarger.y_filter_shift'] * 0.8;
  a.tint += p['enlarger.m_filter_shift'] * 0.8;
  a.fade += p['enlarger.preflash_exposure'] * 30;
  a.contrast -= p['enlarger.preflash_exposure'] * 20;
  // Film character
  if (p['film_render.grain.active']) a.grain += p['film_render.grain.particle_area_um2'] * 60 * (1 - p['film_render.grain.blur'] * 0.25);
  if (p['film_render.halation.active']) {
    a.temperature += p['film_render.halation.halation_amount'] * 3;
    a.highlights += p['film_render.halation.halation_amount'] * 4 - p['film_render.halation.boost_ev'] * 8;
    a.vignette += p['film_render.halation.scatter_amount'] * 4;
  }
  if (p['film_render.dir_couplers.active']) { a.contrast += p['film_render.dir_couplers.amount'] * 8; a.saturation += p['film_render.dir_couplers.amount'] * 6; }
  if (p['film_render.glare.active']) a.fade += p['film_render.glare.percent'] * 60;
  // Scanner
  a.fade += p['scanner.black_level'] * 150;
  a.highlights -= (1 - p['scanner.white_level']) * 200;
  a.sharpness += p['scanner.unsharp_mask'][1] * 15;

  for (const [key, [min, max]] of Object.entries(RANGES)) a[key] = Math.min(max, Math.max(min, a[key]));
  return a;
}
