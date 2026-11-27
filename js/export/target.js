// Target file size (plan_workflow.md Task 7, A§9.3 with C9): the highest encoder quality whose file fits under a byte
// target. Pure: `encode(quality)` is the browser encoder (canvas.toBlob), treated as a black box whose size usually,
// but not always, grows with quality. Never returns a file over the target without saying so (`fits: false`).

export const Q_MIN = 20, Q_MAX = 98, MAX_ENCODES = 12;
export const TARGET_PRESETS = [500, 1000, 2000]; // KB (1 KB = 1000 bytes, as file managers show sizes)
export const TARGET_LIMITS = { min: 20, max: 50000 };

/** A stored or typed target in KB: a whole number in range, or null (no limit). */
export function sanitizeTarget(value) {
  const number = Number(value);
  return value == null || value === '' || !Number.isFinite(number) || number <= 0 ? null : Math.min(TARGET_LIMITS.max, Math.max(TARGET_LIMITS.min, Math.round(number)));
}

/** Searches qualities Q_MIN…Q_MAX (whole percent) for the largest file ≤ `targetBytes`.
 *  `encode(q)` resolves { size, blob }; `isStale()` stops the search (throws an AbortError) when a newer one replaced it.
 *  Resolves { blob, size, quality, fits, status, encodes, smallest }:
 *  status 'max' (fits at the highest quality), 'ok', or 'too-big' (even Q_MIN is over: `blob` is that smallest file). */
export async function searchQuality(encode, targetBytes, { isStale = () => false, maxEncodes = MAX_ENCODES } = {}) {
  const tried = new Map();
  let best = null, monotonic = true; // best: largest file that fits; ties go to the higher quality
  const sample = async q => {
    if (tried.has(q)) return tried.get(q);
    if (tried.size >= maxEncodes) return null;
    const result = await encode(q);
    if (isStale()) throw new DOMException('Superseded', 'AbortError');
    const entry = { quality: q, size: result.size, blob: result.blob };
    for (const other of tried.values()) if ((other.quality < q) !== (other.size < entry.size) && other.size !== entry.size) monotonic = false;
    tried.set(q, entry);
    if (entry.size <= targetBytes && (!best || entry.size > best.size || (entry.size === best.size && q > best.quality))) best = entry;
    // Only the best fit (and the smallest file, for the report) are kept: the other blobs are dropped as we go.
    for (const other of tried.values()) if (other !== best && other.quality !== Q_MIN) other.blob = null;
    return entry;
  };
  const done = status => ({ blob: best.blob, size: best.size, quality: best.quality, fits: true, status, encodes: tried.size, smallest: tried.get(Q_MIN)?.size ?? null });

  const top = await sample(Q_MAX);
  if (top.size <= targetBytes) return done('max');
  const bottom = await sample(Q_MIN);
  if (bottom.size > targetBytes) return { blob: bottom.blob, size: bottom.size, quality: Q_MIN, fits: false, status: 'too-big', encodes: tried.size, smallest: bottom.size };
  // Bisection between a quality that fits (lo) and one that doesn't (hi). A sample that breaks the expected order
  // (bigger at a lower quality) doesn't move the bracket wrongly: each step keeps lo fitting and hi over.
  let lo = Q_MIN, hi = Q_MAX;
  while (hi - lo > 1 && tried.size < maxEncodes) {
    if (best && best.size >= targetBytes * .95 && hi - lo <= 4) break; // within 5 % under: close enough
    const mid = Math.round((lo + hi) / 2), entry = await sample(mid);
    if (!entry) break;
    if (entry.size <= targetBytes) lo = mid; else hi = mid;
  }
  // Not monotonic: qualities above the best fit may still fit. Spend what is left just above it.
  for (let q = best.quality + 1; !monotonic && q < Q_MAX && tried.size < maxEncodes; q++) {
    if (tried.has(q)) continue;
    const entry = await sample(q);
    if (entry.size > targetBytes) break;
  }
  return done('ok');
}

/** Long edge to suggest when even the lowest quality is too big: file size scales roughly with pixel count, so shrink
 *  by √(target / smallest) with a margin, rounded down to 100 px. */
export function suggestEdge(longEdge, smallestBytes, targetBytes) {
  const edge = Math.floor(longEdge * Math.sqrt(targetBytes / smallestBytes) * .9 / 100) * 100;
  return Math.max(100, Math.min(longEdge - 100, edge));
}

export const formatBytes = bytes => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(2).replace(/\.?0+$/, '')} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
export const formatTarget = kb => (kb >= 1000 ? `${(kb / 1000).toFixed(2).replace(/\.?0+$/, '')} MB` : `${kb} KB`);
