// Render queue for photos that are not in view (SPEC §5): one job at a time, deduplicated by
// photo id, paused while the photo in view renders (canRun), so the photo in view always comes first.
//
// createRenderQueue({ render, canRun, onChange, onIdle })
//   render(id, job) → Promise<result>; job.stale turns true when the job was replaced or removed,
//     so the caller can drop its result. (Film engines cancel by restarting their worker, which
//     would also stop the preview in view, so stale jobs finish and are ignored instead.)
//   onChange(id, status, result) with status 'queued' | 'rendering' | 'done' | 'error' | 'idle'
//   onIdle() once the queue has emptied
// Returns { add(id), remove(id), pump(), size }.

export function createRenderQueue({ render, canRun = () => true, onChange, onIdle }) {
  const waiting = new Set();
  let running = null;

  function add(id) {
    if (running?.id === id) running.stale = true; // settings changed while rendering: render again
    waiting.add(id);
    onChange(id, 'queued');
    pump();
  }
  function remove(id) {
    waiting.delete(id);
    if (running?.id === id) running.stale = true;
  }
  async function pump() {
    if (running || !waiting.size || !canRun()) return;
    const [id] = waiting;
    waiting.delete(id);
    const job = running = { id, stale: false };
    onChange(id, 'rendering');
    try {
      const result = await render(id, job);
      if (!job.stale) onChange(id, 'done', result);
    } catch (error) {
      if (!job.stale) onChange(id, 'error', error);
    } finally {
      running = null;
      if (job.stale && !waiting.has(id)) onChange(id, 'idle');
      if (!waiting.size) onIdle?.();
      pump();
    }
  }
  return { add, remove, pump, get size() { return waiting.size + (running ? 1 : 0); } };
}
