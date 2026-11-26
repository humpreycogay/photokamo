import { FilmEngine, SpectralDataStore, renderWithStore, normalizeSpectralSettings, processSpectralImage, tileMargin, tileRects } from '../../../engines/kamo-film-engine/src/index.js';
import { engineFiles } from '../engine-files.js';

const ENGINE = new URL('../../../engines/kamo-film-engine/', import.meta.url);
const DATA = 'data/film-scan-calibration/';
const post = (message, transfer = []) => self.postMessage(message, transfer);
const files = engineFiles({ engineId: 'kamo-film-engine', base: ENGINE, onProgress: progress => post({ type: 'download', ...progress }) });
const store = new SpectralDataStore(async path => JSON.parse(new TextDecoder().decode(await files.bytes(`${DATA}${path}`))));
const creative = new FilmEngine(); // RGB look model for creative stocks (job.creative); needs no data files
let source = null, scaled = null; // scaled: the last preview-size input { key, image } (re-made only for a new photo or size)

function imageAt(bitmap, maxEdge, maxPixels) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height), Math.sqrt(maxPixels / (bitmap.width * bitmap.height)));
  const width = Math.max(2, Math.round(bitmap.width * scale)), height = Math.max(2, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}
// Full-quality spectral renders above SINGLE_PASS_PIXELS run in tiles (plus the engine's margin for blurs), each drawn
// from the source bitmap and rendered as a region of the frame, into one output canvas: the engine's working memory
// is one tile's instead of the whole frame's, and grain, halation and MTF match a single pass (≤ 1/255). The tile
// size comes with the job: 1024 px on desktop (faster), 512 px on phones (less memory; the margin is the same).
const SINGLE_PASS_PIXELS = 4e6;
async function renderTiled(bitmap, width, height, job, jobId, tileSize = 1024) {
  const pipeline = await store.pipeline(job.stockId, job.outputId), settings = normalizeSpectralSettings(job.settings, pipeline.stock);
  const tiles = tileRects(width, height, tileSize, tileMargin(pipeline, settings, { fullWidth: width, fullHeight: height }));
  const output = new OffscreenCanvas(width, height), out = output.getContext('2d');
  const kx = bitmap.width / width, ky = bitmap.height / height;
  for (const [index, t] of tiles.entries()) {
    const part = new OffscreenCanvas(t.sw, t.sh), context = part.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, t.sx * kx, t.sy * ky, t.sw * kx, t.sh * ky, 0, 0, t.sw, t.sh);
    const result = processSpectralImage(context.getImageData(0, 0, t.sw, t.sh), pipeline, settings, { histogram: false, region: { x: t.sx, y: t.sy, fullWidth: width, fullHeight: height } });
    out.putImageData(new ImageData(result.data, t.sw, t.sh), t.sx, t.sy, t.x - t.sx, t.y - t.sy, t.w, t.h); // the core only
    post({ type: 'progress', jobId, value: 0.15 + 0.77 * (index + 1) / tiles.length });
  }
  return output;
}
async function warm(job) { if (!job.creative) await store.pipeline(job.stockId, job.outputId); }
self.addEventListener('message', async event => {
  const message = event.data;
  if (message.type === 'image') { source?.bitmap.close(); source = { imageId: message.imageId, bitmap: message.bitmap }; scaled = null; return; } // our copy of the last photo
  try {
    if (message.type === 'warm') { await warm(message.job); post({ type: 'done', jobId: message.jobId, bitmap: null }); return; }
    if (message.type !== 'render') return;
    if (!source || source.imageId !== message.imageId) throw new Error('Image not loaded in Kamo');
    post({ type: 'status', jobId: message.jobId, text: 'Developing with Kamo…' }); post({ type: 'progress', jobId: message.jobId, value: 0.05 });
    const full = message.quality === 'full';
    // Previews reuse the downsized input (a copy: renders may change it in place); full renders make their own.
    let image;
    if (full && !message.job.creative) { // spectral at full size (within maxPixels): in tiles when large
      const scale = Math.min(1, Math.sqrt(message.maxPixels / (source.bitmap.width * source.bitmap.height)));
      const width = Math.max(2, Math.round(source.bitmap.width * scale)), height = Math.max(2, Math.round(source.bitmap.height * scale));
      if (width * height > SINGLE_PASS_PIXELS) {
        const bitmap = (await renderTiled(source.bitmap, width, height, message.job, message.jobId, message.tile)).transferToImageBitmap();
        post({ type: 'done', jobId: message.jobId, bitmap }, [bitmap]); return;
      }
    }
    if (full) image = imageAt(source.bitmap, Infinity, message.maxPixels);
    else {
      const key = `${source.imageId}:${message.maxEdge}:${message.maxPixels}`;
      if (scaled?.key !== key) scaled = { key, image: imageAt(source.bitmap, message.maxEdge, message.maxPixels) };
      image = new ImageData(new Uint8ClampedArray(scaled.image.data), scaled.image.width, scaled.image.height);
    }
    post({ type: 'progress', jobId: message.jobId, value: 0.15 });
    if (message.job.creative?.invert) for (let i = 0; i < image.data.length; i += 4) { image.data[i] = 255 - image.data[i]; image.data[i + 1] = 255 - image.data[i + 1]; image.data[i + 2] = 255 - image.data[i + 2]; }
    const result = message.job.creative ? creative.process(image, message.job.creative) : await renderWithStore(store, image, { ...message.job, histogram: false });
    post({ type: 'progress', jobId: message.jobId, value: 0.92 });
    const canvas = new OffscreenCanvas(result.width, result.height);
    canvas.getContext('2d').putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
    const bitmap = canvas.transferToImageBitmap(); post({ type: 'done', jobId: message.jobId, bitmap }, [bitmap]);
  } catch (error) { post({ type: 'error', jobId: message.jobId, message: String(error?.message || error) }); }
});