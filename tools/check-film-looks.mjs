// Checks js/film-looks.js against the engines' own option lists (stock ids, paths, key order).
// Run from the repo root: node tools/check-film-looks.mjs   (exit code 1 on errors)
import fs from 'node:fs';
const repo = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const looksPath = repo + "/js/film-looks.js";
const { filmLooks, filmGroups } = await import(looksPath);
const spek = await import(repo + '/js/engines/spektrafilm-rs/params.js');
const dux = await import(repo + '/js/engines/duxun/params.js');
const cat = JSON.parse(fs.readFileSync(repo + '/engines/negs/runtime/catalog.json'));
const negsFilms = new Set(cat.profiles.filter(p => !p.paper).map(p => p.id));
const negsFilters = new Set(['none', ...cat.color_filters.map(f => f.key)]);
const spekOpt = p => spek.controlByPath[p]; const duxCtl = Object.fromEntries(dux.sections.flatMap(s => s.controls).filter(c=>c.path).map(c => [c.path, c]));
let errors = 0; const ids = new Set(); const err = m => { errors++; console.log('ERR', m); };
const per = {}; const groups = new Set(filmGroups.map(g => g[0]));
for (const l of filmLooks) {
  if (ids.has(l.id)) err('dup ' + l.id); ids.add(l.id);
  if (!groups.has(l.group)) err('group ' + l.id);
  if (JSON.stringify(Object.keys(l.values).sort()) !== JSON.stringify([...l.engine].sort())) err('engine/values mismatch ' + l.id);
  for (const [e, v] of Object.entries(l.values)) {
    per[e] = (per[e] || 0) + 1;
    const keys = Object.keys(v);
    if (e === 'negs') { if (keys[0] !== 'film') err('order ' + l.id); if (!negsFilms.has(v.film)) err(l.id + ' negs film ' + v.film);
      if (v['camera.color_filter'] && !negsFilters.has(v['camera.color_filter'])) err(l.id + ' filter'); }
    if (e === 'spektrafilm-rs') { if (keys[0] !== 'film') err('order ' + l.id);
      for (const [k, x] of Object.entries(v)) { const c = spekOpt(k); if (!c) err(l.id + ' spek path ' + k); else if (c.kind === 'select' && !c.options.includes(x)) err(l.id + ' spek ' + k + '=' + x); } }
    if (e === 'duxun') { if (keys[0] !== 'filmPreset') err('order ' + l.id);
      for (const [k, x] of Object.entries(v)) { const c = duxCtl[k]; if (!c) err(l.id + ' dux path ' + k); else if (c.kind === 'select' && !c.options.includes(x)) err(l.id + ' dux ' + k + '=' + x); else console.log('  ', l.id, '→ DuXun', c.labels[x]); } }
  }
}
console.log('looks', filmLooks.length, 'per engine', per, 'errors', errors);
console.log('without WebGPU (no negs):', filmLooks.filter(l => l.engine.every(e => e === 'negs')).map(l => l.id).join(', '));
if (errors) process.exit(1);
