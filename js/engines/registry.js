// The Advanced-mode engines PhotoKamo offers. This file is all that loads at startup:
// an engine's code, worker and data are fetched only when it is selected (load()).
//
// Each engine lives in engines/<id>/ (source copy, licence, credits.json, runtime files) and
// js/engines/<id>/index.js (the engine contract: sections, defaultParams, normalizeParams,
// render, warm, dispose, …; see the spektrafilm-rs one for the full list).

export const engines = [
  {
    id: 'spektrafilm-rs',
    label: 'Spektrafilm',
    description: 'Spectral film → print → scan model',
    licence: 'GPL-3.0',
    approxDownload: '≈ 10 MB',
    // Shown under the controls; plain text + links, built in the UI.
    credit: [
      'Film modelling by ', { text: 'spektrafilm', href: 'https://github.com/andreavolpato/spektrafilm' },
      ' by Andrea Volpato, running on your device via ', { text: 'spektrafilm-rs', href: 'https://github.com/turbasvin/spektrafilm-rs' }, '. Profiles CC BY-SA 4.0.'
    ],
    folder: new URL('../../engines/spektrafilm-rs/', import.meta.url),
    load: () => import('./spektrafilm-rs/index.js')
  },
  {
    id: 'negs',
    label: 'Negs',
    description: 'Spectral film model on WebGPU · 52 films incl. B&W, 10 papers',
    licence: 'GPL-3.0',
    approxDownload: '≈ 15 MB',
    credit: [
      'Film modelling by ', { text: 'negs', href: 'https://github.com/noahhaasis/negs' },
      ', built on ', { text: 'spektrafilm', href: 'https://github.com/andreavolpato/spektrafilm' },
      ' by Andrea Volpato. Profiles CC BY-SA 4.0 (spektrafilm, Fotufilm).'
    ],
    folder: new URL('../../engines/negs/', import.meta.url),
    load: () => import('./negs/index.js')
  },
  {
    id: 'duxun',
    label: 'DuXun',
    description: 'Fast film look from a Resolve plugin · 54 film presets, grain, halation, bloom',
    licence: 'GPL-2.0-or-later',
    approxDownload: '≈ 60 KB',
    credit: [
      'Film look by ', { text: 'DuXun Film Simulation', href: 'https://github.com/DuXun03/duxun-film-simulation' },
      ' (presets from ', { text: 't3mujinpack', href: 'https://github.com/t3mujinpack/t3mujinpack' }, '), ported to run on your device.'
    ],
    folder: new URL('../../engines/duxun/', import.meta.url),
    load: () => import('./duxun/index.js')
  }
];

export const defaultEngineId = engines[0].id;
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
