// Preset catalogue for the spectral engine, in tiers that say how much of each
// preset is backed by data:
//
//   datasheet  – a stock run as published (curves, sensitivities, dyes, MTF).
//   pairing    – a datasheet stock with a specific print/scan path.
//   derived    – a datasheet stock with a documented physical modification
//                (e.g. remjet removed → halation; push processing).
//   lookalike  – a named film with NO data in the dataset, approximated on the
//                closest datasheet stock. The name is a visual target only.
//
// Settings are overrides on top of defaultSpectralSettings(stock).

import { spectralStocks } from './catalog.js';

export const presetTiers = Object.freeze({
  datasheet: { label: 'Datasheet model', short: 'Calibrated stocks' },
  pairing: { label: 'Datasheet model', short: 'Lab & cinema pairings' },
  derived: { label: 'Derived from datasheet', short: 'Derived stocks' },
  lookalike: { label: 'Look-alike · uncalibrated', short: 'Look-alikes on datasheet stocks' },
});

/** Display name without a repeated maker ("Fujifilm Fujifilm 200" → "Fujifilm 200"). */
export function stockDisplayName(stock) {
  return stock.name.toLowerCase().startsWith(stock.maker.toLowerCase()) ? stock.name : `${stock.maker} ${stock.name}`;
}

const preset = (tier, id, label, stockId, outputId, settings, note) =>
  Object.freeze({ id, tier, label, stockId, outputId, settings: Object.freeze(settings ?? {}), note });

const datasheetPresets = spectralStocks.map(stock => preset('datasheet', `stock:${stock.id}`,
  stockDisplayName(stock), stock.id, null, {}, null));

// Push processing: one stop underexposed, development extended. The γ gain per
// stop is an assumption (no push curves are published in the dataset).
const push = (stockId, label, stops) => preset('derived', `push:${stockId}:${stops}`, label, stockId, null,
  { filmExposure: -stops, development: 1 + 0.08 * stops },
  `Pushed ${stops} stop${stops > 1 ? 's' : ''}: exposed ${stops} EV under, development γ ×${(1 + 0.08 * stops).toFixed(2)} (assumed push model; no push curves are published).`);

export const spectralPresets = Object.freeze([
  ...datasheetPresets,

  preset('pairing', 'pair:portra400-frontier', 'Portra 400 · Frontier-type laser print', 'kodak-portra-400', 'fujifilm-pro-laser-ii', {}, 'Portra 400 printed on Fujifilm Pro Laser II, the digital-minilab paper.'),
  preset('pairing', 'pair:portra160-endura', 'Portra 160 · Optical print on Portra Endura', 'kodak-portra-160', 'kodak-portra-endura', {}, 'Portra 160 printed optically on its companion paper.'),
  preset('pairing', 'pair:portra800-endura', 'Portra 800 · Optical print on Endura Premier', 'kodak-portra-800', 'kodak-endura-premier', {}, 'Portra 800 printed optically on Endura Premier.'),
  preset('pairing', 'pair:ektar-endura', 'Ektar 100 · Endura Premier print', 'kodak-ektar-100', 'kodak-endura-premier', {}, 'Ektar 100 printed optically on Endura Premier, the higher-contrast paper.'),
  preset('pairing', 'pair:gold-frontier', 'Gold 200 · Frontier-type laser print', 'kodak-gold-200', 'fujifilm-pro-laser-ii', {}, 'Gold 200 printed on Fujifilm Pro Laser II, the digital-minilab paper.'),
  preset('pairing', 'pair:400h-frontier', 'Pro 400H · Frontier-type laser print', 'fujifilm-pro-400h', 'fujifilm-pro-laser-ii', {}, 'Pro 400H printed on Fujifilm Pro Laser II, the digital-minilab paper.'),
  preset('pairing', 'pair:superia-frontier', 'Superia Premium 400 · Frontier-type laser print', 'fujifilm-superia-premium-400', 'fujifilm-pro-laser-ii', {}, 'Superia Premium 400 printed on Fujifilm Pro Laser II, the digital-minilab paper.'),
  preset('pairing', 'pair:v3-50d-2393', 'VISION3 50D · Cinema print (2393)', 'kodak-vision3-50d', 'kodak-2393', {}, 'Camera negative printed on Kodak Vision Premier 2393 and projected.'),
  preset('pairing', 'pair:v3-250d-2393', 'VISION3 250D · Cinema print (2393)', 'kodak-vision3-250d', 'kodak-2393', {}, 'Camera negative printed on Kodak Vision Premier 2393 and projected.'),
  preset('pairing', 'pair:v3-200t-2393', 'VISION3 200T · Cinema print (2393)', 'kodak-vision3-200t', 'kodak-2393', {}, 'Camera negative printed on Kodak Vision Premier 2393 and projected.'),
  preset('pairing', 'pair:v3-500t-2393', 'VISION3 500T · Cinema print (2393)', 'kodak-vision3-500t', 'kodak-2393', {}, 'Camera negative printed on Kodak Vision Premier 2393 and projected.'),
  preset('pairing', 'pair:v3-500t-daylight', 'VISION3 500T · shot in daylight, uncorrected', 'kodak-vision3-500t', 'kodak-2393', { sceneKelvin: 5500 }, 'Tungsten-balanced film under 5500 K daylight without an 85 filter: the cool cast is the film’s real response.'),
  preset('pairing', 'pair:v3-250d-tungsten', 'VISION3 250D · shot under tungsten, uncorrected', 'kodak-vision3-250d', 'kodak-2393', { sceneKelvin: 3200 }, 'Daylight film under 3200 K tungsten without an 80A filter.'),

  preset('derived', 'derived:cinestill-800t', 'CineStill 800T (VISION3 500T, remjet removed)', 'kodak-vision3-500t', 'scan-status-m',
    { halation: 65, grain: 45 },
    'CineStill 800T is VISION3 500T with the remjet anti-halation backing removed, rated at 800. Modelled on the 500T datasheet data with strong red halation; C-41 processing of an ECN-2 stock is not modelled.'),
  preset('derived', 'derived:cinestill-50d', 'CineStill 50D (VISION3 50D, remjet removed)', 'kodak-vision3-50d', 'scan-status-m',
    { halation: 50 },
    'CineStill 50D is VISION3 50D with the remjet backing removed. Modelled on the 50D datasheet data with red halation; C-41 processing of an ECN-2 stock is not modelled.'),
  push('kodak-portra-400', 'Portra 400 pushed to 800', 1),
  push('kodak-portra-800', 'Portra 800 pushed to 1600', 1),
  push('kodak-ultramax-400', 'UltraMax 400 pushed to 800', 1),
  push('kodak-vision3-500t', 'VISION3 500T pushed to 1000', 1),
  push('fujifilm-provia-100f', 'Provia 100F pushed to 200', 1),
  preset('derived', 'pull:portra400', 'Portra 400 pulled to 200', 'kodak-portra-400', null,
    { filmExposure: 1, development: 0.92 }, 'Pulled 1 stop: exposed 1 EV over, development γ ×0.92 (assumed pull model).'),

  preset('lookalike', 'look:colorplus-200', 'Kodak ColorPlus 200 look (on Gold 200)', 'kodak-gold-200', null,
    { development: 1.05, interlayer: 15, grain: 34 }, 'No ColorPlus data in the dataset. Approximated on Gold 200 with slightly higher contrast and saturation.'),
  preset('lookalike', 'look:superia-xtra-400', 'Fujifilm Superia X-TRA 400 look (on Superia Premium 400)', 'fujifilm-superia-premium-400', null,
    {}, 'Only X-TRA 400’s MTF is in the dataset (identical to Superia Premium 400’s). Rendered with Superia Premium 400’s curves and dyes.'),
  preset('lookalike', 'look:kodachrome-64', 'Kodachrome 64 look (on Ektachrome E100)', 'kodak-ektachrome-e100', null,
    { development: 1.1, interlayer: 40, grain: 18 }, 'No Kodachrome (K-14) data. Approximated on Ektachrome E100 with higher contrast and interimage saturation; K-14 dyes differ from E-6.'),
  preset('lookalike', 'look:eterna-250d', 'Fujifilm ETERNA 250D look (on VISION3 250D)', 'kodak-vision3-250d', 'kodak-2393',
    { development: 0.9, interlayer: 0 }, 'No ETERNA data. Approximated on VISION3 250D with lower contrast, printed on 2393.'),
  preset('lookalike', 'look:eterna-500t', 'Fujifilm ETERNA 500T look (on VISION3 500T)', 'kodak-vision3-500t', 'kodak-2393',
    { development: 0.9 }, 'No ETERNA data. Approximated on VISION3 500T with lower contrast, printed on 2393.'),
  preset('lookalike', 'look:cinestill-400d', 'CineStill 400D look (on VISION3 250D)', 'kodak-vision3-250d', 'scan-status-m',
    { halation: 50, filmExposure: -0.7, grain: 40 }, 'CineStill 400D’s base stock is not published. Approximated on VISION3 250D, rated at 400, with remjet-free halation.'),
  preset('lookalike', 'look:lomo-cn-100', 'Lomography Color Negative 100 look (on Gold 200)', 'kodak-gold-200', 'fujifilm-pro-laser-ii',
    { interlayer: 30, vignette: -25, development: 1.05 }, 'No Lomography data. Approximated on Gold 200 with stronger saturation and lens vignetting.'),
  preset('lookalike', 'look:lomo-cn-400', 'Lomography Color Negative 400 look (on UltraMax 400)', 'kodak-ultramax-400', 'fujifilm-pro-laser-ii',
    { interlayer: 30, vignette: -30, development: 1.05 }, 'No Lomography data. Approximated on UltraMax 400 with stronger saturation and lens vignetting.'),
  preset('lookalike', 'look:lomo-cn-800', 'Lomography Color Negative 800 look (on Portra 800)', 'kodak-portra-800', 'fujifilm-pro-laser-ii',
    { interlayer: 25, vignette: -35, grain: 52 }, 'No Lomography data. Approximated on Portra 800 with stronger saturation, vignetting and grain.'),
]);

export const getSpectralPreset = id => spectralPresets.find(item => item.id === id) ?? null;
