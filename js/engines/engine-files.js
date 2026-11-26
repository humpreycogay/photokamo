// Engine file loader shared by the engine workers (and the About dialog, for storage).
//
// - Exact download progress from engines/<id>/manifest.json (uncompressed sizes: GitHub Pages
//   gzips responses, so Content-Length isn't the real size).
// - Downloaded files are kept in Cache Storage under `photokamo-engine:<id>:<version>`, so a return
//   visit reads them from disk with no network request. A new engine version (new manifest) gets a
//   new cache and the old one is deleted.
// - Without Cache Storage (non-secure page, private mode quirks, quota errors) it simply fetches.
// - Each download is checked against the manifest's sha256 before it is used or saved; a mismatch is fetched once
//   more past the HTTP cache, then fails. Offline (no manifest), the copy saved last time is used.

const PREFIX = 'photokamo-engine:';

/** True when `bytes` hash to `sha256` (hex); null when this page can't hash (crypto.subtle needs a secure page). */
export async function verifyDigest(bytes, sha256) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('') === String(sha256).toLowerCase();
}

/** @param {{ engineId: string, base: URL, onProgress?: (p: { loaded: number, total: number, done: boolean }) => void }} options */
export function engineFiles({ engineId, base, onProgress }) {
  let manifestPromise = null;
  let cachePromise = null;
  const inflight = new Map(); // path → Promise<Uint8Array>
  const progress = new Map(); // path → { loaded, total, done }
  let postedAt = 0;

  const manifest = () => (manifestPromise ||= fetch(new URL('manifest.json', base), { cache: 'no-cache' })
    .then(response => (response.ok ? response.json() : null)).catch(() => null));

  const cache = () => (cachePromise ||= (async () => {
    try {
      const m = await manifest();
      if (typeof caches === 'undefined') return null;
      const mine = (await caches.keys()).filter(key => key.startsWith(`${PREFIX}${engineId}:`));
      if (!m?.version) return mine.length ? await caches.open(mine[mine.length - 1]) : null; // offline: the newest saved copy
      const name = `${PREFIX}${engineId}:${m.version}`;
      for (const key of mine) if (key !== name) await caches.delete(key);
      return await caches.open(name);
    } catch { return null; }
  })());

  function report(force = false) {
    const now = Date.now();
    if (!onProgress || (!force && now - postedAt < 100)) return;
    postedAt = now;
    let loaded = 0, total = 0, known = true;
    for (const item of progress.values()) { loaded += item.loaded; total += item.total; if (!item.total) known = false; }
    onProgress({ loaded, total: known ? total : 0, done: [...progress.values()].every(item => item.done) });
  }
  async function expectedSize(path) { return (await manifest())?.files?.[path]?.size || 0; }
  async function expectedHash(path) { return (await manifest())?.files?.[path]?.sha256 || null; }
  /** Downloads `path` and checks it against the manifest; a bad copy is fetched once more, bypassing the HTTP cache. */
  async function download(url, path) {
    const sha256 = await expectedHash(path);
    for (const cache of ['default', 'reload']) {
      const response = await fetch(url, { cache });
      if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status})`);
      const data = await readCounted(path, response);
      if (!sha256 || (await verifyDigest(data, sha256)) !== false) return { data, type: response.headers.get('content-type') || 'application/octet-stream' };
      console.warn(`${path} did not match the engine manifest${cache === 'default' ? '; downloading it again' : ''}.`);
    }
    throw new Error(`${path} failed its integrity check. Try again later.`);
  }

  async function readCounted(path, response) {
    const item = { loaded: 0, total: (await expectedSize(path)) || Number(response.headers.get('content-length')) || 0, done: false };
    progress.set(path, item);
    const reader = response.body.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); item.loaded += value.byteLength;
      if (item.loaded > item.total) item.total = 0; // size unknown after all
      report();
    }
    item.done = true; report(true);
    const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }
  async function store(url, bytes, type) {
    try { await (await cache())?.put(url, new Response(bytes, { headers: { 'Content-Type': type, 'Content-Length': String(bytes.byteLength) } })); }
    catch { /* quota or private mode: keep working without the saved copy */ }
  }

  /** The file at `path` (relative to engines/<id>/), from the saved copy or the network. */
  function bytes(path) {
    if (!inflight.has(path)) {
      const promise = (async () => {
        const url = new URL(path, base).href;
        const saved = await (await cache())?.match(url).catch(() => null);
        if (saved) return new Uint8Array(await saved.arrayBuffer());
        const { data, type } = await download(url, path);
        await store(url, data, type); // only a verified copy is saved
        return data;
      })();
      promise.catch(() => inflight.delete(path));
      inflight.set(path, promise);
    }
    return inflight.get(path);
  }

  /** A Response for WebAssembly.compileStreaming / instantiate: compiles while downloading. */
  async function wasm(path) {
    const url = new URL(path, base).href;
    const saved = await (await cache())?.match(url).catch(() => null);
    if (saved) return new Response(saved.body, { headers: { 'Content-Type': 'application/wasm' } });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load the film engine (HTTP ${response.status})`);
    const [compile, save] = response.body.tee();
    readCounted(path, new Response(save)).then(async data => {
      const sha256 = await expectedHash(path);
      if (!sha256 || (await verifyDigest(data, sha256)) !== false) await store(url, data, 'application/wasm'); // a bad copy fails to compile and is never saved
    }).catch(() => {});
    return new Response(compile, { headers: { 'Content-Type': 'application/wasm' } });
  }

  return { bytes, wasm, manifest };
}

/** Engines saved on this device: [{ engineId, bytes }] (main thread or worker). */
export async function savedEngines() {
  if (typeof caches === 'undefined') return [];
  const out = new Map();
  try {
    for (const key of await caches.keys()) {
      if (!key.startsWith(PREFIX)) continue;
      const engineId = key.slice(PREFIX.length).split(':')[0];
      const cache = await caches.open(key);
      let size = 0;
      for (const request of await cache.keys()) size += Number((await cache.match(request))?.headers.get('content-length')) || 0;
      out.set(engineId, (out.get(engineId) || 0) + size);
    }
  } catch { return []; }
  return [...out].map(([engineId, bytes]) => ({ engineId, bytes }));
}
/** Deletes every saved engine copy (they download again when used). */
export async function removeSavedEngines() {
  if (typeof caches === 'undefined') return;
  for (const key of await caches.keys()) if (key.startsWith(PREFIX)) await caches.delete(key);
}
