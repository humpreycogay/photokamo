// Look search (plan_workflow.md Task 1, A§8 simplified): ranks looks by a typed query. Pure (no DOM), so
// tools/workflow-fixtures.mjs can test the ranking. Every query word must match something; a word scores by the best
// field it hits (name 4, tags 3, style 2, description 1) times how well (exact word 3, word start 2, inside a word 1,
// only for 3+ letters). Ties keep catalogue order.

const WEIGHTS = { name: 4, tags: 3, style: 2, description: 1 };
const EXACT = 3, PREFIX = 2, INSIDE = 1;
// Phrases first (they contain spaces), then single words. Values are words the catalogue uses.
const PHRASES = [[/\bblack\s*(?:and|&)\s*white\b/g, ' bw '], [/\bb\s*&\s*w\b/g, ' bw '], [/\bb\s*\/\s*w\b/g, ' bw '], [/\bfine\s+grain\b/g, ' finegrain '], [/\bfilm\s+still\b/g, ' cinema ']];
const SYNONYMS = { monochrome: 'bw', mono: 'bw', greyscale: 'bw', grayscale: 'bw', people: 'portrait', person: 'portrait', portraits: 'portrait', faces: 'portrait',
  movie: 'cinema', movies: 'cinema', cinematic: 'cinema', city: 'street', urban: 'street', polaroid: 'instant', instax: 'instant', sunset: 'warm',
  color: 'colour', colors: 'colour', grainy: 'grain', vintage: 'faded', retro: 'faded', nature: 'landscape', scenery: 'landscape' };

/** Lower-case words without accents or punctuation; hyphenated tags join up (fine-grain → finegrain, and "fine grain"). */
export function normalize(text) {
  let value = String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const [pattern, replacement] of PHRASES) value = value.replace(pattern, replacement);
  return value.replace(/-/g, '').split(/[^a-z0-9]+/).filter(Boolean);
}
/** Each query word with its synonym (a word matches if either does, at the better score). */
const queryWords = query => normalize(query).map(word => (SYNONYMS[word] ? [word, SYNONYMS[word]] : [word]));

/** Prepares looks for searching: items { id, name, tags?, style?, description? } → an index (do this once). */
export function buildIndex(items) {
  return items.map((item, order) => ({ id: item.id, order, fields: {
    name: normalize(item.name), tags: (item.tags || []).flatMap(normalize), style: normalize(item.style), description: normalize(item.description)
  } }));
}

function wordScore(word, fields) {
  let best = 0;
  for (const [field, words] of Object.entries(fields)) {
    for (const candidate of words) {
      const kind = candidate === word ? EXACT : candidate.startsWith(word) ? PREFIX : word.length >= 3 && candidate.includes(word) ? INSIDE : 0;
      if (kind) best = Math.max(best, kind * WEIGHTS[field]);
    }
  }
  return best;
}

/** The ids matching `query`, best first (ties in catalogue order), with scores: [{ id, score }]. An empty query
 *  matches everything in order. */
export function searchLooks(index, query) {
  const words = queryWords(query);
  if (!words.length) return index.map(entry => ({ id: entry.id, score: 0 }));
  const results = [];
  for (const entry of index) {
    let score = 0;
    for (const alternatives of words) { const s = Math.max(...alternatives.map(word => wordScore(word, entry.fields))); if (!s) { score = 0; break; } score += s; }
    if (score) results.push({ id: entry.id, score, order: entry.order });
  }
  return results.sort((a, b) => b.score - a.score || a.order - b.order).map(({ id, score }) => ({ id, score }));
}
