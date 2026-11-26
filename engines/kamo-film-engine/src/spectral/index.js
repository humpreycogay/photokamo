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
export { gaussianBlur, processSpectralImage, recoverHighlights, sampleLut, tileMargin, tileRects } from './render.js';

/** The cached promise for `key`, made once; a rejected one is dropped so the next call tries again (a failed
 *  download must not stay failed until a reload). */
function once(map, key, make) {
  if (!map.has(key)) {
    const promise = Promise.resolve().then(make);
    map.set(key, promise);
    promise.catch(() => { if (map.get(key) === promise) map.delete(key); });
  }
  return map.get(key);
}

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
    return once(this.raw, path, () => this.readJson(path));
  }

  async standards() {
    return once(this.built, 'standards', async () => {
      const entries = await Promise.all(Object.entries(standardFiles)
        .map(async ([key, path]) => [key, await this.json(path)]));
      return buildStandards(Object.fromEntries(entries));
    });
  }

  async equipment() {
    return once(this.built, 'equipment', async () => {
      const entries = await Promise.all(Object.entries(equipmentFiles)
        .map(async ([key, path]) => [key, await this.json(path)]));
      return buildEquipment(Object.fromEntries(entries));
    });
  }

  async stock(id) {
    const entry = getSpectralStock(id);
    if (!entry) throw new RangeError(`Unknown spectral stock: ${id}`);
    return once(this.built, `stock:${id}`, async () => {
      const [curves, dyes, sensitivity, mtf] = await Promise.all([
        this.json(entry.files.curves), this.json(entry.files.dyes), this.json(entry.files.sensitivity),
        entry.files.mtf ? this.json(entry.files.mtf) : null,
      ]);
      return buildFilmStock(entry, { curves, dyes, sensitivity, mtf });
    });
  }

  async printMaterial(output) {
    if (output.type !== 'print') return null;
    return once(this.built, `print:${output.id}`, async () => buildPrintMaterial(output, await this.json(output.file)));
  }

  /** Returns a cached FilmPipeline for a stock/output pair. */
  async pipeline(stockId, outputId) {
    const entry = getSpectralStock(stockId);
    if (!entry) throw new RangeError(`Unknown spectral stock: ${stockId}`);
    const output = (outputId && getSpectralOutput(outputId)) || outputsForStock(entry)[0];
    if (!output.kinds.includes(entry.kind)) throw new RangeError(`${output.label} cannot render ${entry.name}.`);
    return once(this.built, `pipeline:${stockId}:${output.id}`, async () => {
      const [standards, stock, print, equipment] = await Promise.all([
        this.standards(), this.stock(stockId), this.printMaterial(output),
        output.printing === 'tricolor' ? this.equipment() : null,
      ]);
      return new FilmPipeline(standards, stock, output, print, equipment);
    });
  }
}

/** Convenience: render an RGBA image with a stock/output through a data store. */
export async function renderWithStore(store, image, { stockId, outputId, settings, ...options }) {
  const pipeline = await store.pipeline(stockId, outputId);
  return processSpectralImage(image, pipeline, normalizeSpectralSettings(settings, pipeline.stock), options);
}
export * from './colorimetry.js';
export * from './presets.js';
