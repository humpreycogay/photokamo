// Copies the Twemoji SVGs that js/collage/stickers.js offers from an extracted Twemoji release into vendor/twemoji/svg/.
// Usage: node tools/twemoji-subset.mjs <twemoji>/assets/svg
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const source = process.argv[2], repo = fileURLToPath(new URL('..', import.meta.url)), target = `${repo}vendor/twemoji/svg`;
if (!source || !existsSync(source)) { console.error('Usage: node tools/twemoji-subset.mjs <twemoji>/assets/svg'); process.exit(1); }
const { stickers } = await import(`${repo}js/collage/stickers.js`);
const names = [...new Set(stickers.filter(s => s.emoji).map(s => decodeURIComponent(s.file.split('/').pop())))];
const missing = names.filter(name => !existsSync(`${source}/${name}`));
if (missing.length) { console.error(`Missing in the release: ${missing.join(', ')}`); process.exit(1); }
rmSync(target, { recursive: true, force: true }); mkdirSync(target, { recursive: true });
for (const name of names) copyFileSync(`${source}/${name}`, `${target}/${name}`);
console.log(`Copied ${names.length} SVGs to vendor/twemoji/svg (${readdirSync(target).length} files).`);
