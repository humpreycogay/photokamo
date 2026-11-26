// Cache keys for renders, kept pure (no DOM) so tools/v3-check.mjs can test them.
import { renderKey as opticsRenderKey } from './optics/params.js';

/** What the film engine's full-quality render depends on: the photo, crop, Lens optics, engine and its settings, and
 *  the Adjust edits applied to it. Frame and text are drawn afterwards, so changing them keeps the render. */
export const fullRenderKeyOf = ({ imageId, crop, optics, engine, params, edits }) => JSON.stringify([imageId, crop, opticsRenderKey(optics), engine, params, edits]);
