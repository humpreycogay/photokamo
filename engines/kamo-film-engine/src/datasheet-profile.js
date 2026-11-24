import { syntheticMaterialProfile, validateMaterialProfile } from './material.js';

const LAYERS = Object.freeze([
  { sensitivity: 'cyan', dye: 'cyan', curve: 'R' },
  { sensitivity: 'magenta', dye: 'magenta', curve: 'G' },
  { sensitivity: 'yellow', dye: 'yellow', curve: 'B' },
]);

function interpolateNullable(xs, ys, x, transform = value => value) {
  let before = -1;
  for (let index = 0; index < xs.length; index++) {
    if (ys[index] == null) continue;
    if (xs[index] === x) return transform(ys[index]);
    if (xs[index] > x) {
      if (before < 0) return 0;
      const amount = (x - xs[before]) / (xs[index] - xs[before]);
      return transform(ys[before] + (ys[index] - ys[before]) * amount);
    }
    before = index;
  }
  return 0;
}

function sampleCurve(curves, channel, dmin) {
  const points = [];
  const xs = curves.log_exposure;
  const ys = curves.density[channel];
  for (let index = 0; index < xs.length; index++) {
    if (ys[index] == null) continue;
    if (!points.length || index === xs.length - 1 || index % 12 === 0) {
      points.push([xs[index], Math.max(0, ys[index] - dmin)]);
    }
  }
  if (points.length < 2) throw new TypeError(`Insufficient ${channel} characteristic-curve samples.`);
  return points;
}

export function createDatasheetDerivedProfile(record, data) {
  if (!record?.runtimeProfile || !data?.curves || !data?.sensitivity || !data?.dyes) {
    throw new TypeError('A runtime-enabled catalog record and curves, sensitivity, and dye data are required.');
  }
  const wavelengths = syntheticMaterialProfile.wavelengths;
  const curves = data.curves.char_curves;
  const sensitivity = data.sensitivity;
  const dyes = data.dyes.shared_full_curves;
  const layers = LAYERS.map(mapping => {
    const rawSensitivity = wavelengths.map(wavelength => interpolateNullable(
      sensitivity.wavelength_nm, sensitivity.log_sensitivity[mapping.sensitivity], wavelength,
      value => 10 ** value,
    ));
    const peak = Math.max(...rawSensitivity, 1);
    return {
      sensitivity: rawSensitivity.map(value => value / peak),
      dyeDensity: wavelengths.map(wavelength => interpolateNullable(
        dyes.wavelength_nm, dyes[mapping.dye], wavelength,
      )),
      curve: sampleCurve(curves, mapping.curve, curves.dmin[mapping.curve]),
    };
  });
  const profile = {
    ...syntheticMaterialProfile,
    id: `datasheet-candidate-${record.id}-v1`,
    label: `${record.manufacturer} ${record.name}`,
    status: 'synthetic',
    kind: record.kind,
    calibrationBasis: 'datasheet-derived-experimental',
    manufacturer: record.manufacturer,
    stockName: record.name,
    stockCode: record.stockCode,
    nominalSpeed: record.nominalSpeed,
    process: record.process,
    wavelengths,
    layers,
    baseDensity: 0,
    displayDensityScale: 0.32,
    provenance: {
      sources: data.sources.map(item => ({ ...item })),
      validation: { state: 'experimental-unvalidated', physicalReference: false },
      assumptions: [
        'Characteristic curves, spectral sensitivity, and dye densities are graph traces from the cited source.',
        'The runtime RGB spectral basis, observer, and output matrix remain synthetic conformance components.',
        'No held-out physical film validation has been performed.',
      ],
      attribution: record.source.attribution,
      license: record.source.license,
      modifications: 'Resampled to the engine wavelength grid; D-min subtracted; sensitivity converted from log10 and normalized per layer.',
    },
  };
  return validateMaterialProfile(profile);
}