// Module worker running the spektrafilm engine (spektrafilm-rs compiled to wasm32-wasip1).
// The engine is a command-line program; it runs here against an in-memory file system
// (browser_wasi_shim). Nothing leaves the device: data files come from this site and the
// photo only ever exists in this worker's memory.
//
//   preview: a colour-only 3D LUT from the full spectral model (cached per setting combination),
//            applied here to a 1280 px copy of the photo. Fast, but no grain/halation/blur.
//   full:    the complete model (`process`), including every spatial effect.
import { WASI, File, Directory, OpenFile, ConsoleStdout, PreopenDirectory } from './vendor/browser_wasi_shim.js';
import { engineJob, colourKey } from './params.js';
import { engineFiles } from '../engine-files.js';

const LUT_SIZE = 33;
const LUT_CACHE = 16;
const SPECTRAL_LUT = 'luts/spectral_upsampling/irradiance_xy_tc.npy';
const FILTERS = 'filters/neutral_print_filters.json';

let modulePromise = null;
const bytesCache = new Map();
let source = null;      // { imageId, bitmap }
let preview = null;     // { edge, width, height, rgba, meterPng }
const luts = new Map(); // colourKey → Float32Array (for the current image)

const post = (message, transfer = []) => self.postMessage(message, transfer);

// Engine files: saved on the device after the first download, exact progress from the manifest
// (posted as { type: 'download', loaded, total, done }).
const files = engineFiles({
  engineId: 'spektrafilm-rs',
  base: new URL('../../../engines/spektrafilm-rs/', import.meta.url),
  onProgress: progress => post({ type: 'download', ...progress })
});

function fetchBytes(path) {
  if (!bytesCache.has(path)) {
    const promise = files.bytes(`runtime/data/${path}`);
    promise.catch(() => bytesCache.delete(path));
    bytesCache.set(path, promise);
  }
  return bytesCache.get(path);
}
function loadModule() {
  modulePromise ||= files.wasm('runtime/spektrafilm.wasm').then(response => WebAssembly.compileStreaming(response))
    .catch(error => { modulePromise = null; throw error; });
  return modulePromise;
}
const isWarm = paths => modulePromise && paths.every(path => bytesCache.has(path));

function directoryTree(entries) {
  const root = new Map();
  for (const [path, bytes] of entries) {
    const parts = path.split('/'); let dir = root;
    for (const part of parts.slice(0, -1)) {
      if (!dir.has(part)) dir.set(part, new Directory(new Map()));
      dir = dir.get(part).contents;
    }
    dir.set(parts.at(-1), new File(bytes, { readonly: true }));
  }
  return root;
}
function dataPaths(job) {
  const stocks = new Set([job.film, job.scanFilm ? job.film : job.print]);
  return [SPECTRAL_LUT, FILTERS, ...[...stocks].map(stock => `profiles/${stock}.json`)];
}
const stockArgs = job => ['--film', job.film, ...(job.scanFilm ? ['--scan-film'] : ['--paper', job.print])];

// Runs one engine command. Returns the files left in /work.
async function runEngine(args, paths, workFiles, onLine) {
  const [module, ...data] = await Promise.all([loadModule(), ...paths.map(fetchBytes)]);
  const work = new PreopenDirectory('/work', new Map(Object.entries(workFiles).map(([name, bytes]) => [name, new File(bytes)])));
  const lines = [];
  const output = line => { const clean = line.replace(/\x1b\[[0-9;]*m/g, ''); lines.push(clean); onLine?.(clean); };
  const fds = [new OpenFile(new File([])), ConsoleStdout.lineBuffered(output), ConsoleStdout.lineBuffered(output),
    new PreopenDirectory('/data', directoryTree(paths.map((path, index) => [path, data[index]]))), work];
  const wasi = new WASI(['spektrafilm', ...args], ['RUST_LOG=info', 'NO_COLOR=1'], fds);
  const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport });
  let exit;
  try { exit = wasi.start(instance); } catch (error) { throw new Error(`The film engine stopped: ${error?.message || error}`); }
  if (exit !== 0) throw new Error(lines.filter(line => !line.includes(' INFO ')).slice(-2).join(' ') || `The film engine failed (exit ${exit}).`);
  return work.dir.contents;
}

async function encodePng(canvas) { return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()); }
function scaled(bitmap, scale) {
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function ensurePreview(edge) {
  if (preview?.edge === edge) return preview;
  const canvas = scaled(source.bitmap, Math.min(1, edge / Math.max(source.bitmap.width, source.bitmap.height)));
  const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  preview = { edge, width: canvas.width, height: canvas.height, rgba, meterPng: await encodePng(canvas) };
  return preview;
}

// Trilinear 3D LUT (n³ × RGB f32, red fastest, sRGB in and out) on 8-bit RGBA.
function applyLut(rgba, lut, n) {
  const max = n - 1, i0 = new Int32Array(256), fr = new Float32Array(256);
  for (let v = 0; v < 256; v++) { const x = v / 255 * max; const k = Math.min(Math.floor(x), max - 1); i0[v] = k; fr[v] = x - k; }
  const sr = 3, sg = n * 3, sb = n * n * 3;
  for (let p = 0; p < rgba.length; p += 4) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    const fx = fr[r], fy = fr[g], fz = fr[b];
    const base = i0[b] * sb + i0[g] * sg + i0[r] * sr;
    for (let c = 0; c < 3; c++) {
      const o = base + c;
      const c00 = lut[o] + (lut[o + sr] - lut[o]) * fx;
      const c10 = lut[o + sg] + (lut[o + sg + sr] - lut[o + sg]) * fx;
      const c01 = lut[o + sb] + (lut[o + sb + sr] - lut[o + sb]) * fx;
      const c11 = lut[o + sb + sg] + (lut[o + sb + sg + sr] - lut[o + sb + sg]) * fx;
      const c0 = c00 + (c10 - c00) * fy, c1 = c01 + (c11 - c01) * fy;
      const value = c0 + (c1 - c0) * fz;
      rgba[p + c] = value <= 0 ? 0 : value >= 1 ? 255 : Math.round(value * 255);
    }
  }
}

async function renderPreview(message) {
  const job = engineJob(message.params);
  const paths = dataPaths(job);
  const view = await ensurePreview(message.maxEdge);
  const key = colourKey(message.params);
  let lut = luts.get(key);
  if (!lut) {
    post({ type: 'status', jobId: message.jobId, text: isWarm(paths) ? 'Developing colour…' : 'Loading the film engine…' });
    const files = await runEngine(
      ['lut', ...stockArgs(job), '--params', '/work/params.json', '--meter', '/work/meter.png', '--size', String(LUT_SIZE), '-o', '/work/lut.bin', '--data-dir', '/data'],
      paths, { 'params.json': new TextEncoder().encode(JSON.stringify(job.overrides)), 'meter.png': view.meterPng });
    const bytes = files.get('lut.bin').data;
    lut = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    luts.set(key, lut);
    if (luts.size > LUT_CACHE) luts.delete(luts.keys().next().value);
  }
  post({ type: 'progress', jobId: message.jobId, value: 0.9 });
  const rgba = new Uint8ClampedArray(view.rgba);
  applyLut(rgba, lut, LUT_SIZE);
  const canvas = new OffscreenCanvas(view.width, view.height);
  canvas.getContext('2d').putImageData(new ImageData(rgba, view.width, view.height), 0, 0);
  return canvas.transferToImageBitmap();
}

const STAGES = [['pipeline calibrated', 0.12], ['pipeline: start', 0.18], ['filming complete', 0.45], ['printing complete', 0.7], ['scanning complete', 0.92]];
async function renderFull(message, maxPixels) {
  const job = engineJob(message.params);
  const paths = dataPaths(job);
  const { width, height } = source.bitmap;
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  post({ type: 'status', jobId: message.jobId, text: isWarm(paths) ? null : 'Loading the film engine…' });
  post({ type: 'progress', jobId: message.jobId, value: 0.03 });
  const input = await encodePng(scaled(source.bitmap, scale));
  post({ type: 'progress', jobId: message.jobId, value: 0.08 });
  const files = await runEngine(
    ['process', '/work/in.png', '-o', '/work/out.png', ...stockArgs(job), '--params', '/work/params.json', '--data-dir', '/data'],
    paths, { 'in.png': input, 'params.json': new TextEncoder().encode(JSON.stringify(job.overrides)) },
    line => { const stage = STAGES.find(([text]) => line.includes(text)); if (stage) post({ type: 'progress', jobId: message.jobId, value: stage[1] }); });
  const out = files.get('out.png').data;
  return createImageBitmap(new Blob([out], { type: 'image/png' }));
}

self.addEventListener('message', async event => {
  const message = event.data;
  if (message.type === 'image') {
    source = { imageId: message.imageId, bitmap: message.bitmap };
    preview = null; luts.clear();
    return;
  }
  if (message.type === 'warm') {
    // Download + compile the engine and the data these settings need, before the first render.
    try {
      await Promise.all([loadModule(), ...dataPaths(engineJob(message.params)).map(fetchBytes)]);
      post({ type: 'done', jobId: message.jobId, bitmap: null });
    } catch (error) {
      post({ type: 'error', jobId: message.jobId, message: String(error?.message || error) });
    }
    return;
  }
  if (message.type !== 'render') return;
  try {
    if (!source || source.imageId !== message.imageId) throw new Error('Image not loaded in the film engine');
    let bitmap;
    if (message.quality === 'full') {
      try { bitmap = await renderFull(message, message.maxPixels); }
      catch (error) {
        // Most likely out of memory on a large photo: try once at half the pixels.
        if (message.maxPixels <= 1e6) throw error;
        post({ type: 'status', jobId: message.jobId, text: 'Retrying at a smaller size…' });
        bitmap = await renderFull(message, message.maxPixels / 2);
      }
    } else {
      bitmap = await renderPreview(message);
    }
    post({ type: 'done', jobId: message.jobId, bitmap }, [bitmap]);
  } catch (error) {
    post({ type: 'error', jobId: message.jobId, message: String(error?.message || error) });
  }
});
