import { FilmEngine, SpectralDataStore, renderWithStore } from '../../../engines/kamo-film-engine/src/index.js';
import { engineFiles } from '../engine-files.js';

const ENGINE = new URL('../../../engines/kamo-film-engine/', import.meta.url);
const DATA = 'data/film-scan-calibration/';
const post = (message, transfer = []) => self.postMessage(message, transfer);
const files = engineFiles({ engineId: 'kamo-film-engine', base: ENGINE, onProgress: progress => post({ type: 'download', ...progress }) });
const store = new SpectralDataStore(async path => JSON.parse(new TextDecoder().decode(await files.bytes(`${DATA}${path}`))));
const creative = new FilmEngine(); // RGB look model for creative stocks (job.creative); needs no data files
let source = null;

function imageAt(bitmap, maxEdge, maxPixels) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height), Math.sqrt(maxPixels / (bitmap.width * bitmap.height)));
  const width = Math.max(2, Math.round(bitmap.width * scale)), height = Math.max(2, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}
async function warm(job) { if (!job.creative) await store.pipeline(job.stockId, job.outputId); }
self.addEventListener('message', async event => {
  const message = event.data;
  if (message.type === 'image') { source = { imageId: message.imageId, bitmap: message.bitmap }; return; }
  try {
    if (message.type === 'warm') { await warm(message.job); post({ type: 'done', jobId: message.jobId, bitmap: null }); return; }
    if (message.type !== 'render') return;
    if (!source || source.imageId !== message.imageId) throw new Error('Image not loaded in Kamo');
    post({ type: 'status', jobId: message.jobId, text: 'Developing with Kamo…' }); post({ type: 'progress', jobId: message.jobId, value: 0.05 });
    const full = message.quality === 'full';
    const image = imageAt(source.bitmap, full ? Infinity : message.maxEdge, message.maxPixels);
    post({ type: 'progress', jobId: message.jobId, value: 0.15 });
    if (message.job.creative?.invert) for (let i = 0; i < image.data.length; i += 4) { image.data[i] = 255 - image.data[i]; image.data[i + 1] = 255 - image.data[i + 1]; image.data[i + 2] = 255 - image.data[i + 2]; }
    const result = message.job.creative ? creative.process(image, message.job.creative) : await renderWithStore(store, image, { ...message.job, histogram: false });
    post({ type: 'progress', jobId: message.jobId, value: 0.92 });
    const canvas = new OffscreenCanvas(result.width, result.height);
    canvas.getContext('2d').putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
    const bitmap = canvas.transferToImageBitmap(); post({ type: 'done', jobId: message.jobId, bitmap }, [bitmap]);
  } catch (error) { post({ type: 'error', jobId: message.jobId, message: String(error?.message || error) }); }
});