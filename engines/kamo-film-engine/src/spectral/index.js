import {
  equipmentFiles, getSpectralOutput, getSpectralStock, outputsForStock, standardFiles,
} from './catalog.js';
import { buildEquipment, buildFilmStock, buildPrintMaterial, buildStandards } from './materials.js';
import { FilmPipeline } from './pipeline.js';
import { processSpectralImage } from './render.js';
import { normalizeSpectralSettings } from './controls.js';

export * from './catalog.js';
export * from './controls.js';
export { FilmPipeline, LUT_SIZE, OUTPUT_SPACES } from './pipeline.js';
export { buildEquipment, buildFilmStock, buildPrintMaterial, buildStandards, fitMtf } from './materials.js';
export { gaussianBlur, processSpectralImage, recoverHighlights, sampleLut } from './render.js';

/**
 * Loads and caches datasets through a caller-supplied JSON reader, so the same
 * engine runs in Node (fs) and browsers/workers (fetch).
 * `readJson(relativePath)` receives paths relative to data/film-scan-calibration/.
 */
export class SpectralDataStore {
  constructor(readJson) {
    this.readJson = readJson;
    this.raw = new Map();
    this.built = new Map();
  }

  async json(path) {
    if (!this.raw.has(path)) this.raw.set(path, Promise.resolve(this.readJson(path)));
    return this.raw.get(path);
  }

  async standards() {
    if (!this.built.has('standards')) {
      this.built.set('standards', (async () => {
        const entries = await Promise.all(Object.entries(standardFiles)
          .map(async ([key, path]) => [key, await this.json(path)]));
        return buildStandards(Object.fromEntries(entries));
      })());
    }
    return this.built.get('standards');
  }

  async equipment() {
    if (!this.built.has('equipment')) {
      this.built.set('equipment', (async () => {
        const entries = await Promise.all(Object.entries(equipmentFiles)
          .map(async ([key, path]) => [key, await this.json(path)]));
        return buildEquipment(Object.fromEntries(entries));
      })());
    }
    return this.built.get('equipment');
  }

  async stock(id) {
    const entry = getSpectralStock(id);
    if (!entry) throw new RangeError(`Unknown spectral stock: ${id}`);
    const key = `stock:${id}`;
    if (!this.built.has(key)) {
      this.built.set(key, (async () => {
        const [curves, dyes, sensitivity, mtf] = await Promise.all([
          this.json(entry.files.curves), this.json(entry.files.dyes), this.json(entry.files.sensitivity),
          entry.files.mtf ? this.json(entry.files.mtf) : null,
        ]);
        return buildFilmStock(entry, { curves, dyes, sensitivity, mtf });
      })());
    }
    return this.built.get(key);
  }

  async printMaterial(output) {
    if (output.type !== 'print') return null;
    const key = `print:${output.id}`;
    if (!this.built.has(key)) {
      this.built.set(key, this.json(output.file).then(raw => buildPrintMaterial(output, raw)));
    }
    return this.built.get(key);
  }

  /** Returns a cached FilmPipeline for a stock/output pair. */
  async pipeline(stockId, outputId) {
    const entry = getSpectralStock(stockId);
    if (!entry) throw new RangeError(`Unknown spectral stock: ${stockId}`);
    const output = (outputId && getSpectralOutput(outputId)) || outputsForStock(entry)[0];
    if (!output.kinds.includes(entry.kind)) throw new RangeError(`${output.label} cannot render ${entry.name}.`);
    const key = `pipeline:${stockId}:${output.id}`;
    if (!this.built.has(key)) {
      this.built.set(key, (async () => {
        const [standards, stock, print, equipment] = await Promise.all([
          this.standards(), this.stock(stockId), this.printMaterial(output),
          output.printing === 'tricolor' ? this.equipment() : null,
        ]);
        return new FilmPipeline(standards, stock, output, print, equipment);
      })());
    }
    return this.built.get(key);
  }
}

/** Convenience: render an RGBA image with a stock/output through a data store. */
export async function renderWithStore(store, image, { stockId, outputId, settings, ...options }) {
  const pipeline = await store.pipeline(stockId, outputId);
  return processSpectralImage(image, pipeline, normalizeSpectralSettings(settings, pipeline.stock), options);
}
export * from './colorimetry.js';
export * from './presets.js';
