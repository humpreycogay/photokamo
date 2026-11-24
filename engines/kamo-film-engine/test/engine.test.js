import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDatasheetDerivedProfile, createMaterialCandidate, FilmEngine, filmCalibrationCatalog,
  getFilmCalibrationRecord, presets, processMaterialImage, simulateMaterialPixel,
  syntheticMaterialProfile, validateMaterialProfile,
} from '../src/index.js';
import vision3_250dCurves from '../data/film-scan-calibration/films/Vision3_250D_datasheet_curves.json' with { type: 'json' };
import vision3_250dDyes from '../data/film-scan-calibration/films/Vision3_250D_dye_density.json' with { type: 'json' };
import vision3_250dSensitivity from '../data/film-scan-calibration/films/Vision3_250D_spectral_sensitivity.json' with { type: 'json' };
import vision3_500tCurves from '../data/film-scan-calibration/films/V3500T_datasheet_curves.json' with { type: 'json' };
import vision3_500tDyes from '../data/film-scan-calibration/films/Vision3_500T_dye_density.json' with { type: 'json' };
import vision3_500tSensitivity from '../data/film-scan-calibration/films/Vision3_500T_spectral_sensitivity.json' with { type: 'json' };

const engine = new FilmEngine();
const fixture = () => ({
  width: 2, height: 2,
  data: new Uint8ClampedArray([
    10, 20, 30, 40, 80, 100, 120, 140,
    160, 180, 200, 220, 240, 230, 210, 190,
  ]),
});

test('publishes generic presets', () => {
  assert.equal(presets.length, 7);
  assert.ok(presets.some(p => p.id === 'silver-mono'));
  assert.equal(presets.find(p => p.id === 'neutral').category, 'basic');
  assert.equal(presets.find(p => p.id === 'warm-negative').category, 'film');
  assert.equal(presets.find(p => p.id === 'warm-negative').family, 'Color Negative');
  assert.equal(presets.find(p => p.id === 'warm-negative').speed, 'ISO 200');
  assert.match(presets.find(p => p.id === 'warm-negative').description, /skin tones/i);
});

test('exposes editable resolved preset settings without shared arrays', () => {
  const first = engine.getPresetSettings('warm-negative');
  const second = engine.getPresetSettings('warm-negative');
  assert.equal(first.contrast, 0.12);
  assert.equal(first.grain, 0.13);
  first.matrix[0] = 99;
  assert.notEqual(second.matrix[0], 99);
  assert.throws(() => engine.getPresetSettings('not-real'), RangeError);
});

test('does not mutate input and preserves alpha', () => {
  const image = fixture();
  const before = [...image.data];
  const result = engine.process(image, { preset: 'aged-print' });
  assert.deepEqual([...image.data], before);
  assert.notStrictEqual(result.data, image.data);
  assert.deepEqual([result.data[3], result.data[7], result.data[11], result.data[15]], [40, 140, 220, 190]);
});

test('grain is deterministic by seed', () => {
  const a = engine.process(fixture(), { preset: 'neutral', grain: 0.8, seed: 7 });
  const b = engine.process(fixture(), { preset: 'neutral', grain: 0.8, seed: 7 });
  assert.deepEqual([...a.data], [...b.data]);
});

test('presets create different renders', () => {
  const color = engine.process(fixture(), { preset: 'vivid-chrome' });
  const mono = engine.process(fixture(), { preset: 'silver-mono' });
  assert.notDeepEqual([...color.data], [...mono.data]);
  assert.ok(Math.abs(mono.data[4] - mono.data[5]) < 10);
});

test('amount zero and clamped controls are safe', () => {
  const image = fixture();
  const unchanged = engine.process(image, { preset: 'neutral', amount: -10 });
  assert.deepEqual([...unchanged.data], [...image.data]);
  const extreme = engine.process(image, { exposure: 999, grain: -4 });
  assert.equal(extreme.data.length, image.data.length);
});

test('rejects malformed input and unknown presets', () => {
  assert.throws(() => engine.process({ width: 1, height: 1, data: [] }), TypeError);
  assert.throws(() => engine.process(fixture(), { preset: 'not-real' }), RangeError);
});

test('validates synthetic material profile schema', () => {
  assert.equal(validateMaterialProfile(syntheticMaterialProfile), syntheticMaterialProfile);
  assert.throws(() => validateMaterialProfile({ ...syntheticMaterialProfile, wavelengths: [500, 400, 600] }), TypeError);
  assert.throws(() => validateMaterialProfile({ ...syntheticMaterialProfile, status: 'measured' }), TypeError);
});

test('material simulation computes deterministic finite layer response', () => {
  const first = simulateMaterialPixel([0.18, 0.3, 0.6], syntheticMaterialProfile, 0);
  const second = simulateMaterialPixel([0.18, 0.3, 0.6], syntheticMaterialProfile, 0);
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.ok(first.every(value => Number.isFinite(value) && value >= 0));
});

test('material exposure changes computed density response', () => {
  const under = simulateMaterialPixel([0.18, 0.18, 0.18], syntheticMaterialProfile, -2);
  const over = simulateMaterialPixel([0.18, 0.18, 0.18], syntheticMaterialProfile, 2);
  assert.notDeepEqual(under, over);
});

test('renders negative materials as display-positive rather than raw negative transmittance', () => {
  const profile = createMaterialCandidate({ id: 'polarity-check', label: 'Polarity check' });
  const dark = simulateMaterialPixel([0.03, 0.03, 0.03], profile);
  const bright = simulateMaterialPixel([0.8, 0.8, 0.8], profile);
  const luminance = rgb => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  const black = simulateMaterialPixel([0, 0, 0], profile);
  assert.ok(luminance(black) < 0.01, 'zero scene exposure must map near display black');
  assert.ok(luminance(bright) > luminance(dark), 'brighter scene input must remain brighter on display');
  const middle = simulateMaterialPixel([0.18, 0.18, 0.18], profile);
  assert.ok(luminance(middle) > 0.12 && luminance(middle) < 0.65,
    'midtone input must retain display headroom instead of clipping toward white');
  assert.ok(luminance(bright) < 0.9, 'bright input must retain highlight headroom');

  const rawPositiveDark = simulateMaterialPixel([0.03, 0.03, 0.03], syntheticMaterialProfile);
  const rawPositiveBright = simulateMaterialPixel([0.8, 0.8, 0.8], syntheticMaterialProfile);
  assert.ok(luminance(rawPositiveBright) < luminance(rawPositiveDark),
    'direct-positive conformance fixture retains its existing transmittance behavior');
});

test('material image processing preserves dimensions, alpha, and input', () => {
  const image = fixture();
  const before = [...image.data];
  const result = processMaterialImage(image, syntheticMaterialProfile, { exposure: 0.5 });
  assert.deepEqual([...image.data], before);
  assert.equal(result.width, image.width);
  assert.equal(result.height, image.height);
  assert.deepEqual([result.data[3], result.data[7], result.data[11], result.data[15]], [40, 140, 220, 190]);
});

test('material image amount zero returns source RGB', () => {
  const image = fixture();
  const result = processMaterialImage(image, syntheticMaterialProfile, { amount: 0 });
  assert.deepEqual([...result.data], [...image.data]);
});

test('synthetic negative image output retains visible tonal range', () => {
  const profile = createMaterialCandidate({
    id: 'range-check', label: 'Range check', warmth: 0.15, saturation: 1.08, grain: 0.14,
  });
  const result = processMaterialImage(fixture(), profile, { amount: 1, exposure: 0 });
  const rgb = [...result.data].filter((_, index) => index % 4 !== 3);
  assert.ok(Math.max(...rgb) - Math.min(...rgb) > 80,
    'a representative negative emulation must not collapse into a near-white image');
  assert.ok(rgb.some(value => value < 128), 'negative emulation must preserve dark tones');
  assert.ok(rgb.some(value => value > 160), 'negative emulation must preserve highlights');
});

test('material creative finish controls affect output deterministically', () => {
  const options = { grain: 0.8, softness: 0.5, halation: 0.4, vignette: 0.3, seed: 7 };
  const plain = processMaterialImage(fixture(), syntheticMaterialProfile);
  const first = processMaterialImage(fixture(), syntheticMaterialProfile, options);
  const second = processMaterialImage(fixture(), syntheticMaterialProfile, options);
  assert.notDeepEqual([...first.data], [...plain.data]);
  assert.deepEqual([...first.data], [...second.data]);
});

test('builds distinct validated synthetic material candidates', () => {
  const warm = createMaterialCandidate({
    id: 'warm-target', label: 'Warm target', warmth: 0.2, saturation: 1.2,
  });
  const mono = createMaterialCandidate({
    id: 'mono-target', label: 'Mono target', monochrome: true, contrast: 0.3,
  });
  assert.equal(validateMaterialProfile(warm), warm);
  assert.equal(warm.status, 'synthetic');
  assert.equal(warm.calibrationBasis, 'legacy-creative-target');
  assert.notDeepEqual(warm.layers, mono.layers);
  assert.notDeepEqual(warm.outputMatrix, mono.outputMatrix);
  assert.notDeepEqual(
    [...processMaterialImage(fixture(), warm).data],
    [...processMaterialImage(fixture(), mono).data],
  );
  assert.throws(() => createMaterialCandidate({}), TypeError);
});

test('publishes the pinned calibration evidence catalog without promoting validation', () => {
  assert.equal(filmCalibrationCatalog.length, 21);
  assert.equal(new Set(filmCalibrationCatalog.map(record => record.id)).size, 21);
  assert.ok(filmCalibrationCatalog.every(record => record.validation === 'experimental-unvalidated'));
  assert.ok(filmCalibrationCatalog.every(record => record.source.commit === '3716966fbc82760ed9be38362519689ff2aca811'));
  assert.equal(getFilmCalibrationRecord('kodak-vision3-250d').publicationCode, 'H-1-5207');
  assert.equal(getFilmCalibrationRecord('kodak-vision3-500t').stockCode, '5219');
  assert.equal(getFilmCalibrationRecord('not-real'), null);
  assert.deepEqual(filmCalibrationCatalog.map(record => record.name), [
    'Portra 400', 'Portra 160', 'Ektar 100', 'Gold 200', 'Ultra Max 400',
    'Pro Image 100', 'Portra 800', 'Ektachrome E100', 'VISION3 50D',
    'VISION3 200T', 'VISION3 250D', 'VISION3 500T', 'Fujifilm 200',
    'Fujifilm 400', 'Pro 400H', 'Fujicolor 100', 'Superia Premium 400',
    'Velvia 50', 'Velvia 100', 'Provia 100F', 'Superia X-TRA 400',
  ]);
});

test('builds distinct datasheet-derived experimental Vision3 profiles', () => {
  const sources = filename => [{ path: filename, evidence: 'graph-trace' }];
  const profile250d = createDatasheetDerivedProfile(getFilmCalibrationRecord('kodak-vision3-250d'), {
    curves: vision3_250dCurves, sensitivity: vision3_250dSensitivity, dyes: vision3_250dDyes,
    sources: sources('Vision3 250D source set'),
  });
  const profile500t = createDatasheetDerivedProfile(getFilmCalibrationRecord('kodak-vision3-500t'), {
    curves: vision3_500tCurves, sensitivity: vision3_500tSensitivity, dyes: vision3_500tDyes,
    sources: sources('Vision3 500T source set'),
  });
  assert.equal(validateMaterialProfile(profile250d), profile250d);
  assert.equal(profile250d.status, 'synthetic');
  assert.equal(profile250d.calibrationBasis, 'datasheet-derived-experimental');
  assert.equal(profile250d.provenance.validation.physicalReference, false);
  assert.equal(profile250d.process, 'ECN-2');
  const luminance = rgb => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  assert.ok(luminance(simulateMaterialPixel([0.18, 0.18, 0.18], profile250d)) < 0.65,
    'datasheet profile midtones must not wash out to white');
  assert.notDeepEqual(profile250d.layers, profile500t.layers);
  assert.notDeepEqual(
    simulateMaterialPixel([0.18, 0.3, 0.6], profile250d),
    simulateMaterialPixel([0.18, 0.3, 0.6], profile500t),
  );
  assert.throws(() => createDatasheetDerivedProfile({}, {}), TypeError);
});
