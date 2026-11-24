// Stocks and output paths that the spectral engine can run from the pinned
// Film Scan Calibration data (CC BY 4.0). File names are relative to
// data/film-scan-calibration/. IDs match filmCalibrationCatalog.

const DAYLIGHT = 5500;
const TUNGSTEN = 3200;

const cn = (id, maker, name, speed, prefix, extra = {}) => Object.freeze({
  id, maker, name, speed, process: 'C-41', kind: 'color-negative', designKelvin: DAYLIGHT,
  densitometry: 'Status M',
  files: Object.freeze({
    curves: `films/${prefix}_datasheet_curves.json`,
    dyes: `films/${prefix}_dye_density.json`,
    sensitivity: `films/${extra.sensitivityPrefix ?? prefix}_spectral_sensitivity.json`,
    mtf: extra.mtf === false ? null : `films/${prefix}_mtf.json`,
  }),
  notes: Object.freeze([
    'C-41 dye spectra are a surrogate-basis decomposition of the published aggregate spectrum (upstream fit).',
    ...(extra.notes ?? []),
  ]),
  surrogate: extra.surrogate ?? null,
});

const ecn2 = (id, name, speed, kelvin, curvesPrefix, prefix, mtfPrefix) => Object.freeze({
  id, maker: 'Kodak', name, speed, process: 'ECN-2', kind: 'color-negative', designKelvin: kelvin,
  densitometry: 'Status M',
  files: Object.freeze({
    curves: `films/${curvesPrefix}_datasheet_curves.json`,
    dyes: `films/${prefix}_dye_density.json`,
    sensitivity: `films/${prefix}_spectral_sensitivity.json`,
    mtf: `films/${mtfPrefix}_mtf.json`,
  }),
  notes: Object.freeze(['Normal exposure anchored at the sheet’s camera-stops zero.']),
  surrogate: null,
});

const e6 = (id, maker, name, speed, prefix, sensitivityPrefix, surrogateName) => Object.freeze({
  id, maker, name, speed, process: 'E-6', kind: 'color-reversal', designKelvin: DAYLIGHT,
  densitometry: 'Status A',
  files: Object.freeze({
    curves: `films/${prefix}_datasheet_curves.json`,
    dyes: `films/${prefix}_dye_density.json`,
    sensitivity: `films/${sensitivityPrefix}_spectral_sensitivity.json`,
    mtf: `films/${prefix}_mtf.json`,
  }),
  notes: Object.freeze([
    `No spectral sensitivity is published in the dataset; ${surrogateName} sensitivity is used as a surrogate.`,
    'Reversal exposure axis is relative; mid-grey is anchored at Status A green density D-min + 0.85.',
  ]),
  surrogate: Object.freeze({ sensitivity: surrogateName }),
});

export const spectralStocks = Object.freeze([
  cn('kodak-portra-160', 'Kodak', 'Portra 160', 160, 'Portra160'),
  cn('kodak-portra-400', 'Kodak', 'Portra 400', 400, 'Portra400'),
  cn('kodak-portra-800', 'Kodak', 'Portra 800', 800, 'Portra800'),
  cn('kodak-ektar-100', 'Kodak', 'Ektar 100', 100, 'Ektar100'),
  cn('kodak-gold-200', 'Kodak', 'Gold 200', 200, 'Gold200', { mtf: false }),
  cn('kodak-ultramax-400', 'Kodak', 'UltraMax 400', 400, 'Ultramax400', { mtf: false }),
  cn('kodak-pro-image-100', 'Kodak', 'Pro Image 100', 100, 'ProImage100', { mtf: false }),
  cn('fujifilm-200', 'Fujifilm', 'Fujifilm 200', 200, 'Fujifilm200', { mtf: false }),
  cn('fujifilm-400', 'Fujifilm', 'Fujifilm 400', 400, 'Fujifilm400', { mtf: false }),
  cn('fujifilm-fujicolor-100', 'Fujifilm', 'Fujicolor 100', 100, 'Fujicolor100'),
  cn('fujifilm-superia-premium-400', 'Fujifilm', 'Superia Premium 400', 400, 'SuperiaPremium400'),
  cn('fujifilm-pro-400h', 'Fujifilm', 'Pro 400H', 400, 'Pro400H', {
    sensitivityPrefix: 'Fujifilm400',
    surrogate: { sensitivity: 'Fujifilm 400' },
    notes: ['No spectral sensitivity is published in the dataset; Fujifilm 400 sensitivity is used as a surrogate (Pro 400H’s fourth cyan layer is not modelled).'],
  }),
  ecn2('kodak-vision3-50d', 'VISION3 50D 5203', 50, DAYLIGHT, 'Vision3_50D', 'Vision3_50D', 'V350D'),
  ecn2('kodak-vision3-200t', 'VISION3 200T 5213', 200, TUNGSTEN, 'Vision3_200T', 'Vision3_200T', 'V3200T'),
  ecn2('kodak-vision3-250d', 'VISION3 250D 5207', 250, DAYLIGHT, 'Vision3_250D', 'Vision3_250D', 'V3250D'),
  ecn2('kodak-vision3-500t', 'VISION3 500T 5219', 500, TUNGSTEN, 'V3500T', 'Vision3_500T', 'V3500T'),
  e6('kodak-ektachrome-e100', 'Kodak', 'Ektachrome E100', 100, 'EktachromeE100', 'Ektar100', 'Ektar 100'),
  e6('fujifilm-provia-100f', 'Fujifilm', 'Provia 100F', 100, 'Provia100F', 'Fujicolor100', 'Fujicolor 100'),
  e6('fujifilm-velvia-50', 'Fujifilm', 'Velvia 50', 50, 'Velvia50', 'Fujicolor100', 'Fujicolor 100'),
  e6('fujifilm-velvia-100', 'Fujifilm', 'Velvia 100', 100, 'Velvia100', 'Fujicolor100', 'Fujicolor 100'),
]);

export const spectralOutputs = Object.freeze([
  Object.freeze({
    id: 'scan-status-m', label: 'Neutral scan (Status M inversion)', type: 'scan', kinds: ['color-negative'],
    notes: ['Ideal densitometric scan: Status M densities inverted per channel with each layer’s mid-scale gamma, then a filmic display curve.'],
  }),
  Object.freeze({
    id: 'kodak-2393', label: 'Kodak Vision Premier 2393 print (projected)', type: 'print', kinds: ['color-negative'],
    file: 'films/Kodak2393_print_film.json', printing: 'tricolor', printerKelvin: 3200, viewing: 'projection', viewingKelvin: 5400,
    aimGreen: 1.06,
    notes: ['Timed so a normally exposed grey card prints neutral at the sheet’s LAD green aim (Status A 1.06). Additive printer modelled as a 3200 K lamp through Wratten 47B/99/25 bands; projector as 5400 K daylight.'],
  }),
  Object.freeze({
    id: 'kodak-portra-endura', label: 'Kodak Portra Endura paper', type: 'print', kinds: ['color-negative'],
    file: 'papers/PortraEndura_paper.json', printing: 'tricolor', printerKelvin: 3200, viewing: 'reflection', viewingKelvin: 5000,
    aimGreen: 0.74,
    notes: ['Tricolor printing as on the sheet (3200 K lamp through Wratten 47B/99/25; 47B taken as No. 98 less No. 2B). Grey aim of Status A 0.74 is a convention, not on the sheet. Viewed under D50.'],
  }),
  Object.freeze({
    id: 'kodak-endura-premier', label: 'Kodak Endura Premier paper', type: 'print', kinds: ['color-negative'],
    file: 'papers/EnduraPremier_paper.json', printing: 'tricolor', printerKelvin: 3200, viewing: 'reflection', viewingKelvin: 5000,
    aimGreen: 0.74,
    notes: ['Tricolor printing as on the sheet (3200 K lamp through Wratten 47B/99/25; 47B taken as No. 98 less No. 2B). Grey aim of Status A 0.74 is a convention, not on the sheet. Viewed under D50.'],
  }),
  Object.freeze({
    id: 'fujifilm-pro-laser-ii', label: 'Fujifilm Pro Laser Type II paper', type: 'print', kinds: ['color-negative'],
    file: 'papers/FujiProLaserTypeII_paper.json', printing: 'laser', printerLines: [473, 532, 685], viewing: 'reflection', viewingKelvin: 5000,
    aimGreen: 0.74,
    notes: ['Digital minilab: exposed by 473/532/685 nm laser lines with the grey axis locked neutral, as a scanner-driven printer does. Grey aim of Status A 0.74 is a convention.'],
  }),
  Object.freeze({
    id: 'slide-light-table', label: 'Slide on D50 light table', type: 'direct', kinds: ['color-reversal'],
    viewing: 'transmission', viewingKelvin: 5000,
    notes: ['The slide is viewed directly under D50; display white is the slide’s own D-min.'],
  }),
]);

export const equipmentFiles = Object.freeze({
  wratten25: 'equipment/Wratten2_No25_density.json',
  wratten99: 'equipment/Wratten2_No99_density.json',
  wratten98: 'equipment/Wratten2_No98_density.json',
  wratten2B: 'equipment/Wratten2_No2B_density.json',
});

export const standardFiles = Object.freeze({
  cmf: 'standards/CIE1931_2deg_CMFs.json',
  statusM: 'standards/StatusM_ISO5-3.json',
  statusA: 'standards/StatusA_ISO5-3.json',
  d50: 'standards/D50_illuminant.json',
});

export const getSpectralStock = id => spectralStocks.find(stock => stock.id === id) ?? null;
export const getSpectralOutput = id => spectralOutputs.find(output => output.id === id) ?? null;
export const outputsForStock = stock => spectralOutputs.filter(output => output.kinds.includes(stock.kind));
export const defaultOutputFor = stock => outputsForStock(stock)[0];
