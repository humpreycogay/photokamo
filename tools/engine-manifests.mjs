// Writes engines/<id>/manifest.json for every engine with downloadable files: each file's
// uncompressed size and SHA-256, and a version id over all of them. Workers use it for exact
// download progress (GitHub Pages gzips responses, so Content-Length is not the real size) and
// to key the Cache Storage copy (js/engines/engine-files.js). Run after any engine build:
//   node tools/engine-manifests.mjs
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

// Per engine: folders (relative to engines/<id>/) whose files the engine's worker may download.
const ENGINES = {
  'kamo-film-engine': ['data/film-scan-calibration']
};

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

for (const [id, folders] of Object.entries(ENGINES)) {
  const base = join(root, 'engines', id);
  const files = {};
  for (const folder of folders) {
    for (const path of walk(join(base, folder)).sort()) {
      const bytes = readFileSync(path);
      files[relative(base, path).split('\\').join('/')] = { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
  }
  const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16);
  const total = Object.values(files).reduce((sum, file) => sum + file.size, 0);
  writeFileSync(join(base, 'manifest.json'), JSON.stringify({ engine: id, version, files }, null, 1) + '\n');
  console.log(`engines/${id}/manifest.json: ${Object.keys(files).length} files, ${(total / 1048576).toFixed(1)} MB, version ${version}`);
}
