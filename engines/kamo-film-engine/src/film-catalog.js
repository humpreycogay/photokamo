const UPSTREAM_COMMIT = '3716966fbc82760ed9be38362519689ff2aca811';
const UPSTREAM_URL = 'https://github.com/OwlMightyCh/film-scan-calibration';

const source = (publicationCode, revision = null) => Object.freeze({
  repository: 'OwlMightyCh/film-scan-calibration',
  commit: UPSTREAM_COMMIT,
  release: 'v1.0.0',
  url: UPSTREAM_URL,
  retrieved: '2026-11-24',
  publicationCode,
  revision,
  license: 'CC-BY-4.0',
  attribution: 'Film Scan Calibration by OwlMightyCh, CC BY 4.0',
});

const film = (id, manufacturer, name, publicationCode, options = {}) => Object.freeze({
  id, manufacturer, name, publicationCode,
  process: options.process ?? 'C-41',
  kind: options.kind ?? 'color-negative',
  stockCode: options.stockCode ?? null,
  nominalSpeed: options.nominalSpeed ?? null,
  evidence: options.evidence ?? 'graph-trace-with-surrogate-dye-model',
  runtimeProfile: options.runtimeProfile ?? false,
  validation: 'experimental-unvalidated',
  limitations: Object.freeze(options.limitations ?? [
    'Datasheet-derived; no held-out physical film validation.',
    'C-41 layer separation and dye spectra include surrogate-derived modelling.',
  ]),
  source: source(publicationCode, options.revision),
});

export const filmCalibrationCatalog = Object.freeze([
  film('kodak-portra-400', 'Kodak', 'Portra 400', 'E-4050', { nominalSpeed: 400, revision: 'Jan 2025' }),
  film('kodak-portra-160', 'Kodak', 'Portra 160', 'E-4051', { nominalSpeed: 160, revision: 'Jan 2025' }),
  film('kodak-ektar-100', 'Kodak', 'Ektar 100', 'E-4046', { nominalSpeed: 100, revision: 'Jan 2025' }),
  film('kodak-gold-200', 'Kodak', 'Gold 200', 'E-7022', { nominalSpeed: 200 }),
  film('kodak-ultramax-400', 'Kodak', 'Ultra Max 400', 'E-7023', { nominalSpeed: 400, revision: 'Feb 2016' }),
  film('kodak-pro-image-100', 'Kodak', 'Pro Image 100', 'E-4L', { nominalSpeed: 100, revision: 'July 1997' }),
  film('kodak-portra-800', 'Kodak', 'Portra 800', 'E-4040', { nominalSpeed: 800, revision: 'Jan 2025' }),
  film('kodak-ektachrome-e100', 'Kodak Alaris', 'Ektachrome E100', 'E-4000', {
    process: 'E-6', kind: 'color-reversal', nominalSpeed: 100, revision: '8-18',
    evidence: 'manufacturer-graph-trace',
    limitations: ['Datasheet-derived; no held-out physical film validation.'],
  }),
  film('kodak-vision3-50d', 'Kodak', 'VISION3 50D', 'H-1-5203', {
    process: 'ECN-2', stockCode: '5203', nominalSpeed: 50, evidence: 'manufacturer-graph-trace',
    limitations: ['Datasheet-derived; no held-out physical film validation.', 'Scanner/observer path is not a material property.'],
  }),
  film('kodak-vision3-200t', 'Kodak', 'VISION3 200T', 'H-1-5213', {
    process: 'ECN-2', stockCode: '5213', nominalSpeed: 200, evidence: 'manufacturer-graph-trace',
    limitations: ['Datasheet-derived; no held-out physical film validation.', 'Scanner/observer path is not a material property.'],
  }),
  film('kodak-vision3-250d', 'Kodak', 'VISION3 250D', 'H-1-5207', {
    process: 'ECN-2', stockCode: '5207', nominalSpeed: 250, evidence: 'manufacturer-graph-trace', runtimeProfile: true,
    limitations: ['Datasheet-derived; no held-out physical film validation.', 'Runtime input basis and observer remain synthetic.', 'Source datasheet revision requires independent verification.'],
  }),
  film('kodak-vision3-500t', 'Kodak', 'VISION3 500T', 'H-1-5219', {
    process: 'ECN-2', stockCode: '5219', nominalSpeed: 500, evidence: 'manufacturer-graph-trace', runtimeProfile: true,
    limitations: ['Datasheet-derived; no held-out physical film validation.', 'Runtime input basis and observer remain synthetic.', 'Source datasheet revision and ECN-2/Status M wording require independent verification.'],
  }),
  film('fujifilm-200', 'Fujifilm', 'Fujifilm 200', 'AF3-0261E', { nominalSpeed: 200, revision: '2023' }),
  film('fujifilm-400', 'Fujifilm', 'Fujifilm 400', 'AF3-0262E', { nominalSpeed: 400, revision: '2023' }),
  film('fujifilm-pro-400h', 'Fujifilm', 'Pro 400H', 'AF3-176E', { nominalSpeed: 400 }),
  film('fujifilm-fujicolor-100', 'Fujifilm', 'Fujicolor 100', '013AR0317A', { nominalSpeed: 100, revision: '2007' }),
  film('fujifilm-superia-premium-400', 'Fujifilm', 'Superia Premium 400', 'AF3-0224E', { nominalSpeed: 400 }),
  film('fujifilm-velvia-50', 'Fujifilm', 'Velvia 50', 'AF3-0223E', {
    process: 'E-6', kind: 'color-reversal', nominalSpeed: 50, evidence: 'manufacturer-graph-trace',
    limitations: ['Datasheet-derived; no held-out physical film validation.'],
  }),
  film('fujifilm-velvia-100', 'Fujifilm', 'Velvia 100', 'AF3-0222E', {
    process: 'E-6', kind: 'color-reversal', nominalSpeed: 100, evidence: 'manufacturer-graph-trace',
    limitations: ['Datasheet-derived; no held-out physical film validation.'],
  }),
  film('fujifilm-provia-100f', 'Fujifilm', 'Provia 100F', 'AF3-0221E', {
    process: 'E-6', kind: 'color-reversal', nominalSpeed: 100, evidence: 'manufacturer-graph-trace',
    limitations: ['Datasheet-derived; no held-out physical film validation.'],
  }),
  film('fujifilm-superia-xtra-400', 'Fujifilm', 'Superia X-TRA 400', 'AF3-0278E', {
    nominalSpeed: 400, evidence: 'mtf-only',
    limitations: ['Only MTF data are present; no executable material profile.', 'No held-out physical film validation.'],
  }),
]);

export function getFilmCalibrationRecord(id) {
  return filmCalibrationCatalog.find(record => record.id === id) ?? null;
}