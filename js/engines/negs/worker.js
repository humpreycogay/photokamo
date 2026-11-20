// Module worker running the negs engine (engines/negs/runtime/pkg, built unchanged from
// engines/negs/src/crates/spektrafilm-wasm). Nothing leaves the device: the engine, its data
// files and the photo stay in this worker.
//
// The engine renders the complete film model (grain, halation, … included) on WebGPU when the
// browser has it, otherwise on the CPU. A render that needs a data file it doesn't have yet
// reports it in `missing`; we fetch it from engines/negs/src/data/ (upstream's own files) and
// render again, as negs's own web app does.

const ENGINE = new URL('../../../engines/negs/', import.meta.url);
const PKG = new URL('runtime/pkg/', ENGINE);
const DATA = new URL('src/data/', ENGINE);
// Fetched with the engine so the first render doesn't wait for them.
const WARM_DATA = ['filters/neutral_print_filters.json', 'luts/spectral_upsampling/hanatos2025_irradiance_xy_tc.npy', 'luts/spectral_upsampling/hanatos2025_irradiance_xy_tc.toml'];

let startPromise = null;
let wasm = null, engine = null, backend = 'cpu';
const registered = new Set();
let source = null;       // { imageId, bitmap }
let loaded = null;       // { imageId, maxPixels, width, height } loaded into the engine

const post = (message, transfer = []) => self.postMessage(message, transfer);

// ---------- Download progress (same protocol as the spektrafilm-rs worker) ----------
const downloads = new Map();
let downloadPostAt = 0;
function postDownload(force = false) {
  const now = Date.now();
  if (!force && now - downloadPostAt < 100) return;
  downloadPostAt = now;
  let loadedBytes = 0, total = 0, known = true;
  for (const item of downloads.values()) { loadedBytes += item.loaded; total += item.total; if (!item.total || item.loaded > item.total) known = false; }
  post({ type: 'download', loaded: loadedBytes, total: known ? total : 0, done: [...downloads.values()].every(item => item.done) });
}
async function readCounted(response) {
  const item = { loaded: 0, total: Number(response.headers.get('content-length')) || 0, done: false };
  downloads.set(response.url, item);
  const reader = response.body.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); item.loaded += value.byteLength; postDownload();
  }
  item.done = true; postDownload(true);
  const bytes = new Uint8Array(item.loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function fetchChecked(url, label) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${label} (HTTP ${response.status})`);
  return response;
}

// ---------- Engine ----------
function start(prefer) {
  startPromise ||= (async () => {
    wasm = await import(new URL('spektrafilm_wasm.js', PKG).href);
    const response = await fetchChecked(new URL('spektrafilm_wasm_bg.wasm', PKG), 'the film engine');
    const [compileStream, countStream] = response.body.tee();
    readCounted(new Response(countStream, { headers: response.headers }));
    await wasm.default({ module_or_path: new Response(compileStream, { headers: { 'Content-Type': 'application/wasm' } }) });
    if (prefer !== 'cpu' && self.navigator?.gpu) {
      try { engine = await wasm.Engine.newGpu(); backend = 'webgpu'; } catch { engine = null; }
    }
    if (!engine) { engine = wasm.Engine.newCpu(); backend = 'cpu'; }
    return { backend, limits: [...engine.limits()] };
  })().catch(error => { startPromise = null; throw error; });
  return startPromise;
}

async function registerFiles(paths) {
  await Promise.all(paths.filter(path => !registered.has(path)).map(async path => {
    const bytes = await readCounted(await fetchChecked(new URL(path, DATA), path));
    wasm.registerData(path, bytes);
    registered.add(path);
  }));
}

// Calls `call` until the engine has every data file it needs (negs web/engine.js dataResult).
async function withData(call, read) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await call();
    let missing, value;
    try {
      missing = [...result.missing];
      if (!missing.length) value = read(result);
    } finally { result.free(); }
    if (!missing.length) return value;
    await registerFiles(missing);
  }
  throw new Error('The film engine kept asking for data files.');
}

async function encodePng(bitmap, scale) {
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
}
/** Loads the current photo into the engine, at most `maxPixels` (memory). */
async function ensureLoaded(maxPixels) {
  if (loaded?.imageId === source.imageId && loaded.maxPixels >= maxPixels) return loaded;
  const { width, height } = source.bitmap;
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  const bytes = await encodePng(source.bitmap, scale);
  const [keptWidth, keptHeight] = engine.load(bytes, 0, 0, undefined);
  loaded = { imageId: source.imageId, maxPixels, width: keptWidth, height: keptHeight };
  return loaded;
}

async function render(message) {
  const { job, quality, maxEdge, maxPixels } = message;
  await start(message.prefer);
  // WebGPU frames take tens of milliseconds; a CPU frame takes seconds, so say so.
  post({ type: 'status', jobId: message.jobId, text: backend === 'webgpu' ? null : 'Developing on the CPU…' });
  post({ type: 'progress', jobId: message.jobId, value: 0.1 });
  const image = await ensureLoaded(maxPixels);
  // The CPU engine takes ~11 µs per pixel (1280 px ≈ 18 s), so its previews are smaller.
  const previewEdge = backend === 'webgpu' ? maxEdge : message.cpuMaxEdge;
  const maxDim = quality === 'full' ? Math.max(image.width, image.height) : previewEdge;
  post({ type: 'progress', jobId: message.jobId, value: 0.2 });
  const output = await withData(
    () => engine.render(job.film, job.paper, job.paramsJson, maxDim, false, false),
    result => ({ width: result.width, height: result.height, rgba: result.rgba }));
  const canvas = new OffscreenCanvas(output.width, output.height);
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(output.rgba.buffer, output.rgba.byteOffset, output.rgba.byteLength), output.width, output.height), 0, 0);
  return canvas.transferToImageBitmap();
}

self.addEventListener('message', async event => {
  const message = event.data;
  if (message.type === 'image') {
    source = { imageId: message.imageId, bitmap: message.bitmap };
    return;
  }
  if (message.type === 'warm') {
    try {
      const info = await start(message.prefer);
      const stocks = [...new Set([message.job.film, message.job.paper])].map(stock => `profiles/${stock}.json`);
      await registerFiles([...WARM_DATA, ...stocks]);
      post({ type: 'done', jobId: message.jobId, bitmap: null, info });
    } catch (error) {
      post({ type: 'error', jobId: message.jobId, message: String(error?.message || error) });
    }
    return;
  }
  if (message.type !== 'render') return;
  try {
    if (!source || source.imageId !== message.imageId) throw new Error('Image not loaded in the film engine');
    const bitmap = await render(message);
    post({ type: 'done', jobId: message.jobId, bitmap, info: { backend } }, [bitmap]);
  } catch (error) {
    post({ type: 'error', jobId: message.jobId, message: String(error?.message || error) });
  }
});
