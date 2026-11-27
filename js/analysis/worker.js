// Auto analysis off the main thread (plan_workflow.md Tasks 3–4): one job at a time, started only when Auto is used.
// Messages: { id, kind: 'wb' | 'pick' | 'enhance' | 'heal', pixels (RGBA), width, height, a, base, x, y, size } → { id, result } | { id, error }.
import { autoEnhance, autoWhiteBalance, pickWhiteBalance } from './auto.js';
import { searchSource } from '../heal/search.js';

const jobs = {
  wb: ({ pixels, a, base }) => autoWhiteBalance(pixels, a, base),
  pick: ({ pixels, width, height, x, y, size, a, base }) => pickWhiteBalance(pixels, width, height, x, y, size, a, base),
  enhance: ({ pixels, a, base }) => autoEnhance(pixels, a, base),
  heal: ({ pixels, width, height, mask, radius }) => searchSource({ data: pixels, width, height, mask, radius })
};
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, result: jobs[data.kind](data) }); }
  catch (error) { self.postMessage({ id: data.id, error: error?.message || String(error) }); }
};
