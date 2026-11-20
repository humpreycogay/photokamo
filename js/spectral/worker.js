// Module worker that runs the spectral engine off the main thread.
// Currently the STUB engine (see stub.js); Phase 6 replaces the body of render().
import { renderImage } from '../renderer.js';
import { stubAdjustments } from './stub.js';

const images = new Map();

function render({ jobId, imageId, params, maxEdge }) {
  const image = images.get(imageId);
  if (!image) throw new Error('Image not loaded in worker');
  self.postMessage({ type: 'progress', jobId, value: 0.1 });
  const canvas = renderImage(image, stubAdjustments(params), 'none', maxEdge);
  self.postMessage({ type: 'progress', jobId, value: 0.95 });
  return canvas.transferToImageBitmap();
}

self.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'image') {
    images.clear();
    images.set(message.imageId, message.bitmap);
    return;
  }
  if (message.type === 'render') {
    try {
      const bitmap = render(message);
      self.postMessage({ type: 'done', jobId: message.jobId, bitmap }, [bitmap]);
    } catch (error) {
      self.postMessage({ type: 'error', jobId: message.jobId, message: String(error?.message || error) });
    }
  }
});
