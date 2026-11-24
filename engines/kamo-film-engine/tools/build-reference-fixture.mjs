#!/usr/bin/env node
// Builds test/fixtures/upstream-print-reference.json from Film Scan Calibration
// release print cubes (CC BY 4.0), subsampled 65³ → 17³ to keep the repo small.
//   node tools/build-reference-fixture.mjs <dir containing *_DisplayP3.cube> Portra400_PortraEndura ...
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [dir, ...names] = process.argv.slice(2);
const pairs = {};
for (const name of names) {
  const text = await readFile(`${dir}/${name}_DisplayP3.cube`, 'utf8');
  const size = +text.match(/LUT_3D_SIZE\s+(\d+)/)[1];
  const rows = text.split('\n').filter(l => /^[-\d.]+\s+[-\d.]+\s+[-\d.]+\s*$/.test(l.trim())).map(l => l.trim().split(/\s+/).map(Number));
  const stride = (size - 1) / 16;
  const out = [];
  for (let b = 0; b <= 16; b++) for (let g = 0; g <= 16; g++) for (let r = 0; r <= 16; r++) {
    const row = rows[(b * stride) * size * size + (g * stride) * size + r * stride];
    out.push(...row.map(v => Math.round(v * 1e4) / 1e4));
  }
  pairs[name] = { size: 17, sha256Full: createHash('sha256').update(text).digest('hex'), data: out };
}
await writeFile(new URL('../test/fixtures/upstream-print-reference.json', import.meta.url), JSON.stringify({
  source: 'Film Scan Calibration by OwlMightyCh, release v1.0.0 print.7z (builds/print/DisplayP3), CC BY 4.0 — https://github.com/OwlMightyCh/film-scan-calibration',
  modification: 'Subsampled from 65³ to 17³ (every 4th node), values rounded to 4 decimals.',
  input: 'normalized bare image-dye Status M density /3.30 minus the stock neutral offset at K_MID = 0.22 (R fastest)',
  output: 'Display P3 (D65), sRGB-encoded',
  pairs,
}));
console.log('wrote', Object.keys(pairs));
