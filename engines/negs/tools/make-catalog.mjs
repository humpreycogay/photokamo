// Writes engines/negs/runtime/catalog.json: the film and paper catalog with the engine's
// defaults, made by the engine itself (spektrafilm_core::catalog). Adapted from negs
// web/make-catalog.mjs (GPL-3.0); run by tools/build.sh after the wasm build.
// The browser can't list src/data/profiles, and resolving every stock in the page would
// download all the profiles first.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const engine = join(here, '..');
const data = join(engine, 'src', 'data');
const { default: init, catalog, registerData } = await import(pathToFileURL(join(engine, 'runtime', 'pkg', 'spektrafilm_wasm.js')).href);

await init({ module_or_path: readFileSync(join(engine, 'runtime', 'pkg', 'spektrafilm_wasm_bg.wasm')) });
const profiles = join(data, 'profiles');
const stocks = readdirSync(profiles).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
for (const stock of stocks) registerData(`profiles/${stock}.json`, readFileSync(join(profiles, `${stock}.json`)));
// The camera colour filters' curves, for each B&W film's filter factors.
const colored = join(data, 'filters', 'colored');
for (const brand of readdirSync(colored, { withFileTypes: true }).filter(d => d.isDirectory())) {
  for (const file of readdirSync(join(colored, brand.name)).filter(f => f.endsWith('.csv'))) {
    registerData(`filters/colored/${brand.name}/${file}`, readFileSync(join(colored, brand.name, file)));
  }
}
const out = JSON.parse(catalog(stocks));
if (!out.profiles.length) throw new Error(`No profiles found in ${profiles}`);
out.attribution = 'Profile metadata derived from Spektrafilm profiles by Andrea Volpato and contributors, and from Fotufilm film profiles by MUAStudio Inc. (https://fotufilm.com), both CC BY-SA 4.0. See src/data/profiles, src/data/SPEKTRAFILM_LICENSE.txt and src/data/FOTUFILM_LICENSE.txt.';
writeFileSync(join(engine, 'runtime', 'catalog.json'), JSON.stringify(out) + '\n');
console.error(`runtime/catalog.json: ${out.profiles.length} stocks`);
