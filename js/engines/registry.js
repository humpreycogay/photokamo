// The Advanced-mode engines PhotoKamo offers. This file is all that loads at startup:
// an engine's code, worker and data are fetched only when it is selected (load()).
//
// Each engine lives in engines/<id>/ (source copy, licence, credits.json, runtime files) and
// js/engines/<id>/index.js (the engine contract: sections, defaultParams, normalizeParams,
// render, warm, dispose, …; see the Kamo one for the full list). Retired engines are in Archive/.
// approxDownload matches engines/<id>/manifest.json (the Looks grid badges read the manifest itself).

export const engines = [
  {
    id: 'kamo-film-engine',
    label: 'Kamo',
    description: 'PhotoKamo’s calibrated spectral model · 20 colour stocks, scan, paper and cinema print, plus B&W, instant and creative looks',
    licence: 'Proprietary',
    approxDownload: '≈ 1.5 MB',
    credit: [
      'Film modelling by PhotoKamo with ', { text: 'Film Scan Calibration', href: 'https://github.com/OwlMightyCh/film-scan-calibration' },
      ' data by OwlMightyCh (CC BY 4.0).'
    ],
    folder: new URL('../../engines/kamo-film-engine/', import.meta.url),
    load: () => import('./kamo-film-engine/index.js')
  },

];

// Kamo is PhotoKamo's sole film-simulation engine.
export const defaultEngineId = 'kamo-film-engine';
/** Older saved looks without a usable engine migrate to Kamo. */
export const legacyEngineId = 'kamo-film-engine';
export const engineById = id => engines.find(engine => engine.id === id) || null;

const modules = new Map(); // id → Promise<module>
/** Loads an engine's code (once). Rejects if it can't be fetched; the next call retries. */
export function loadEngine(id) {
  const entry = engineById(id);
  if (!entry) return Promise.reject(new Error(`Unknown engine: ${id}`));
  if (!modules.has(id)) {
    const promise = entry.load();
    promise.catch(() => modules.delete(id));
    modules.set(id, promise);
  }
  return modules.get(id);
}

const credits = new Map(); // id → Promise<credits.json>
/** The engine's credits.json (authors, licences, source). Small; readable before the engine downloads. */
export function loadCredits(id) {
  const entry = engineById(id);
  if (!credits.has(id)) {
    const promise = fetch(new URL('credits.json', entry.folder)).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });
    promise.catch(() => credits.delete(id));
    credits.set(id, promise);
  }
  return credits.get(id);
}
