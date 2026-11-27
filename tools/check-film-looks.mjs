// Validate the Kamo-only built-in film catalog (node tools/check-film-looks.mjs): one recipe per
// calibrated stock, and one tile per other entry of Kamo's Preset menu (the engine demo's 71 + 10 extreme looks).
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { filmLooks } = await import(`${repo}/js/film-looks.js`);
const kamo = await import(`${repo}/js/engines/kamo-film-engine/params.js`);
const { spectralPresets } = await import(`${repo}/engines/kamo-film-engine/src/index.js`);
const ENGINE = 'kamo-film-engine', MENU = 81;
let errors = 0;
const ids = new Set(), stocks = new Set(), used = new Set();
const fail = message => { errors++; console.log('ERR', message); };

for (const look of filmLooks) {
  if (ids.has(look.id)) fail(`duplicate id ${look.id}`); ids.add(look.id);
  if (look.engine.length !== 1 || look.engine[0] !== ENGINE || Object.keys(look.values).join() !== ENGINE) fail(`${look.id} is not Kamo-only`);
  if (!['film', 'bw', 'creative'].includes(look.style)) fail(`${look.id} unknown style ${look.style}`);
  const values = look.values[ENGINE] || {};
  const first = Object.keys(values)[0];
  if (first === 'presetId') { // a Preset menu entry, as is
    if (Object.keys(values).length !== 1) fail(`${look.id} a preset look has only presetId`);
    if (!kamo.controlByPath.presetId.options.includes(values.presetId) || values.presetId.startsWith('stock:')) fail(`${look.id} invalid preset ${values.presetId}`);
    if (used.has(values.presetId)) fail(`duplicate preset ${values.presetId}`); used.add(values.presetId);
    if (look.name !== kamo.optionLabel(values.presetId, 'presetId')) fail(`${look.id} name differs from its preset: ${look.name}`);
    continue;
  }
  if (first !== 'stockId' || kamo.creativeBase(values.stockId)) { fail(`${look.id} must start with a calibrated stockId or be a presetId`); continue; }
  if (stocks.has(values.stockId)) fail(`duplicate stock ${values.stockId}`); stocks.add(values.stockId);
  if (look.name !== kamo.optionLabel(values.stockId, 'stockId')) fail(`${look.id} name does not match stock: ${look.name}`);
  if (!kamo.compatibleOutput(values.stockId, values.outputId)) fail(`${look.id} incompatible output ${values.outputId}`);
  for (const [path, value] of Object.entries(values)) {
    const control = kamo.controlByPath[path];
    if (!control) fail(`${look.id} unknown path ${path}`);
    else if (control.kind === 'select' && !control.options.includes(value)) fail(`${look.id} invalid ${path}=${value}`);
    else if (control.kind === 'float' && (typeof value !== 'number' || value < control.min || value > control.max)) fail(`${look.id} invalid ${path}=${value}`);
  }
}
// The Preset menu: every engine preset, valid settings, and a tile for each non-stock entry.
for (const preset of spectralPresets) if (!kamo.presets.some(item => item.id === preset.id)) fail(`menu lacks engine preset ${preset.id}`);
for (const preset of kamo.presets) {
  const params = kamo.presetDefaults(preset.id);
  if (!kamo.compatibleOutput(params.stockId, params.outputId) && !kamo.creativeBase(params.stockId)) fail(`${preset.id} incompatible output`);
  for (const [path, value] of Object.entries(preset.settings)) {
    const control = kamo.controlByPath[path];
    if (!control || (control.kind === 'float' && (value < control.min || value > control.max))) fail(`${preset.id} invalid ${path}=${value}`);
  }
  if (!preset.id.startsWith('stock:') && !used.has(preset.id)) fail(`no tile for preset ${preset.id}`);
}
for (const stockId of kamo.controlByPath.stockId.options) if (!kamo.creativeBase(stockId) && !stocks.has(stockId)) fail(`missing stock ${stockId}`);
if (kamo.presets.length !== MENU) fail(`expected ${MENU} presets, got ${kamo.presets.length}`);
if (filmLooks.length !== MENU) fail(`expected ${MENU} looks, got ${filmLooks.length}`);
// Tags (plan_workflow.md Task 1): the shared vocabulary only, 2–4 per look (Original may have fewer), Basic presets included.
const { lookTags, presets } = await import(`${repo}/js/presets.js`);
const vocabulary = new Set(lookTags.map(([id]) => id)), tagUse = {};
for (const item of [...presets, ...filmLooks]) {
  const tags = item.tags || [];
  for (const tag of tags) { if (!vocabulary.has(tag)) fail(`${item.id} unknown tag ${tag}`); tagUse[tag] = (tagUse[tag] || 0) + 1; }
  if (new Set(tags).size !== tags.length) fail(`${item.id} repeats a tag`);
  if (tags.length > 4 || (tags.length < 2 && item.id !== 'original') || !tags.length) fail(`${item.id} has ${tags.length} tags (2–4)`);
}
for (const tag of vocabulary) if (!tagUse[tag]) fail(`tag ${tag} is used by no look`);
console.log(`tags: ${Object.entries(tagUse).map(([tag, n]) => `${tag} ${n}`).join(', ')}`);
console.log(`looks ${filmLooks.length} (stock recipes ${stocks.size}, presets ${used.size}); menu ${kamo.presets.length}; errors ${errors}`);
if (errors) process.exit(1);
