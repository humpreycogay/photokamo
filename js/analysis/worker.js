// Auto analysis off the main thread (plan_workflow.md Tasks 3–4): one job at a time, started only when Auto is used.
// Messages: { id, kind: 'wb' | 'pick' | 'enhance', pixels (RGBA), width, height, a, base, x, y, size } → { id, result } | { id, error }.
import { autoWhiteBalance, pickWhiteBalance } from './auto.js';

const jobs = {
  wb: ({ pixels, a, base }) => autoWhiteBalance(pixels, a, base),
  pick: ({ pixels, width, height, x, y, size, a, base }) => pickWhiteBalance(pixels, width, height, x, y, size, a, base)
};
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, result: jobs[data.kind](data) }); }
  catch (error) { self.postMessage({ id: data.id, error: error?.message || String(error) }); }
};
