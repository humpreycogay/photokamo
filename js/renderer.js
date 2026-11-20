const clamp = value => Math.max(0, Math.min(255, value));
const hasAdjustments = adjustments => Object.values(adjustments).some(value => value !== 0);

// `frame` is a frame id or { id, width, bottom, paper } (Paper print: % of the short edge + colour).
const frameId = frame => (typeof frame === 'string' ? frame : frame?.id || 'none');

function frameLayout(width, height, frame) {
  if (frameId(frame) === 'paper') {
    const short = Math.min(width, height);
    const side = Math.round(short * (frame.width ?? 5) / 100);
    const bottom = side + Math.round(short * (frame.bottom ?? 0) / 100);
    return { width: width + side * 2, height: height + side + bottom, x: side, y: side, background: frame.paper || '#f4efe4' };
  }
  frame = frameId(frame);
  if (frame === 'classic') {
    const margin = Math.round(Math.min(width, height) * .035);
    return { width: width + margin * 2, height: height + margin * 2, x: margin, y: margin, background: '#171715' };
  }
  if (frame === 'instant') {
    const side = Math.round(Math.min(width, height) * .065);
    const bottom = Math.round(Math.min(width, height) * .19);
    return { width: width + side * 2, height: height + side + bottom, x: side, y: side, background: '#f7f3e8' };
  }
  if (frame === 'sprocket') {
    const side = Math.round(Math.min(width, height) * .075);
    const vertical = Math.round(Math.min(width, height) * .12);
    return { width: width + side * 2, height: height + vertical * 2, x: side, y: vertical, background: '#171715' };
  }
  return { width, height, x: 0, y: 0, background: '#000' };
}

function seededNoise(index) {
  let n = Math.imul(index + 1729, 374761393);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) & 1023) / 511.5 - 1;
}

function processPixels(ctx, width, height, a) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const exposure = 2 ** a.exposure;
  const contrast = Math.max(0, (100 + a.contrast) / 100) ** 1.35;
  const saturation = Math.max(0, 1 + a.saturation / 100);
  const temp = a.temperature * .42;
  const tint = a.tint * .24;
  const brightness = a.brightness * 1.15;
  const fade = a.fade / 100;
  const grain = a.grain * .34;
  const vignette = a.vignette / 100;
  const clarity = a.sharpness / 100;
  const cx = width / 2, cy = height / 2;
  const maxDistance = Math.sqrt(cx * cx + cy * cy);

  for (let i = 0, pixel = 0; i < data.length; i += 4, pixel++) {
    let r = data[i] * exposure;
    let g = data[i + 1] * exposure;
    let b = data[i + 2] * exposure;
    let lum = .2126 * r + .7152 * g + .0722 * b;

    const shadowWeight = 1 - Math.min(1, lum / 150);
    const highlightWeight = Math.max(0, (lum - 105) / 150);
    const tone = a.shadows * shadowWeight * .65 + a.highlights * highlightWeight * .65;
    r += brightness + tone + temp; g += brightness + tone + tint; b += brightness + tone - temp;

    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;
    lum = .2126 * r + .7152 * g + .0722 * b;

    const colorfulness = Math.max(r, g, b) - Math.min(r, g, b);
    const vibrance = 1 + (a.vibrance / 100) * (1 - Math.min(1, colorfulness / 180));
    const sat = saturation * vibrance;
    r = lum + (r - lum) * sat; g = lum + (g - lum) * sat; b = lum + (b - lum) * sat;

    if (fade) {
      const fadedLum = 22 + lum * .91;
      r = r * (1 - fade * .58) + fadedLum * fade * .58;
      g = g * (1 - fade * .58) + fadedLum * fade * .58;
      b = b * (1 - fade * .58) + fadedLum * fade * .58;
    }

    if (clarity) {
      const localContrast = (lum - 128) * clarity * .13;
      r += localContrast; g += localContrast; b += localContrast;
    }
    if (grain) {
      const noise = seededNoise(pixel) * grain * (.55 + Math.min(1, lum / 255) * .45);
      r += noise; g += noise; b += noise;
    }
    if (vignette) {
      const x = pixel % width, y = Math.floor(pixel / width);
      const distance = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDistance;
      const factor = 1 - Math.max(0, distance - .3) ** 1.7 * vignette * 1.15;
      r *= factor; g *= factor; b *= factor;
    }
    data[i] = clamp(r); data[i + 1] = clamp(g); data[i + 2] = clamp(b);
  }
  ctx.putImageData(imageData, 0, 0);
}

function addSprockets(ctx, layout, imageWidth, imageHeight) {
  const holeWidth = Math.max(5, Math.round(layout.x * .42));
  const holeHeight = Math.max(9, Math.round(layout.y * .28));
  const gap = holeWidth * .8;
  ctx.fillStyle = '#e9e5d9';
  ctx.beginPath();
  for (let x = layout.x / 2 - holeWidth / 2; x < layout.width; x += holeWidth + gap) {
    ctx.roundRect(x, layout.y * .23, holeWidth, holeHeight, 2);
    ctx.roundRect(x, layout.y + imageHeight + layout.y * .49, holeWidth, holeHeight, 2);
  }
  ctx.fill();
  ctx.fillStyle = '#d58c3c';
  ctx.font = `${Math.max(7, layout.y * .12)}px ui-monospace, monospace`;
  ctx.fillText('PHOTO KAMO  24A', layout.x, layout.y * .82);
}

// Works on the main thread (HTMLCanvasElement) and in a Worker (OffscreenCanvas).
export function createCanvas(width, height) {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    return canvas;
  }
  return new OffscreenCanvas(width, height);
}

export function renderImage(image, adjustments, frame = 'none', maxEdge = 1400) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const photo = createCanvas(width, height);
  const photoCtx = photo.getContext('2d', { willReadFrequently: true });
  photoCtx.imageSmoothingEnabled = true;
  photoCtx.imageSmoothingQuality = 'high';
  photoCtx.drawImage(image, 0, 0, width, height);
  if (hasAdjustments(adjustments)) processPixels(photoCtx, width, height, adjustments);
  return frameCanvas(photo, frame);
}

// ---------- Crop ----------
// crop = { ratio, swapped, x, y, w, h, zoom, rotate, flip, straighten }. Coordinates are in the
// "oriented" photo (after rotate 90° steps and flip), normalised 0–1: the box is centred on
// (x, y), measures (w × W) / zoom by (h × H) / zoom px, and is turned by `straighten` degrees.
export const defaultCrop = Object.freeze({ ratio: 'orig', swapped: false, x: .5, y: .5, w: 1, h: 1, zoom: 1, rotate: 0, flip: false, straighten: 0 });
export const isIdentityCrop = c => !c || (c.rotate % 360 === 0 && !c.flip && !c.straighten && c.x === .5 && c.y === .5 && c.w / c.zoom === 1 && c.h / c.zoom === 1);

/** Oriented size (W, H), box size in px and box centre for a source of sourceWidth × sourceHeight. */
export function cropGeometry(sourceWidth, sourceHeight, crop) {
  const turned = crop.rotate % 180 !== 0;
  const W = turned ? sourceHeight : sourceWidth, H = turned ? sourceWidth : sourceHeight;
  return { W, H, width: crop.w * W / crop.zoom, height: crop.h * H / crop.zoom, cx: crop.x * W, cy: crop.y * H };
}
/** Half-extents of the straightened box along the photo's axes. All four corners are inside the
 *  photo exactly when this bounding box is. */
export function cropExtents(width, height, degrees) {
  const angle = degrees * Math.PI / 180, cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
  return { ex: (width * cos + height * sin) / 2, ey: (width * sin + height * cos) / 2 };
}
/** Draws the source in its orientation (rotate clockwise in 90° steps, then flip horizontally). */
export function drawOriented(ctx, image, crop, W, H) {
  if (crop.flip) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  const turns = ((crop.rotate / 90) % 4 + 4) % 4;
  if (turns === 1) { ctx.translate(W, 0); ctx.rotate(Math.PI / 2); }
  else if (turns === 2) { ctx.translate(W, H); ctx.rotate(Math.PI); }
  else if (turns === 3) { ctx.translate(0, H); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(image, 0, 0);
}
/** The cropped photo as a canvas, at most maxEdge px on its long side. */
export function cropSource(image, crop, maxEdge = Infinity) {
  const sourceWidth = image.naturalWidth || image.width, sourceHeight = image.naturalHeight || image.height;
  const g = cropGeometry(sourceWidth, sourceHeight, crop);
  const scale = Math.min(1, maxEdge / Math.max(g.width, g.height));
  const output = createCanvas(Math.max(1, Math.round(g.width * scale)), Math.max(1, Math.round(g.height * scale)));
  const ctx = output.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.scale(output.width / g.width, output.height / g.height);
  ctx.translate(g.width / 2, g.height / 2);
  ctx.rotate(crop.straighten * Math.PI / 180);
  ctx.translate(-g.cx, -g.cy);
  drawOriented(ctx, image, crop, g.W, g.H);
  return output;
}

// Adjust on top of an engine's output. Returns `source` itself when every value is 0,
// so engine output without edits stays byte-identical.
export function applyAdjustments(source, adjustments) {
  if (!hasAdjustments(adjustments)) return source;
  const { width, height } = source;
  const output = createCanvas(width, height);
  const ctx = output.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  processPixels(ctx, width, height, adjustments);
  return output;
}

// Puts a finished photo (canvas or ImageBitmap) into a presentation frame.
export function frameCanvas(photo, frame = 'none') {
  const { width, height } = photo;
  const layout = frameLayout(width, height, frame);
  const output = createCanvas(layout.width, layout.height);
  const ctx = output.getContext('2d');
  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, output.width, output.height);
  ctx.drawImage(photo, layout.x, layout.y);

  frame = frameId(frame);
  if (frame === 'instant') {
    ctx.fillStyle = '#898277';
    ctx.font = `${Math.max(10, Math.round(layout.y * .22))}px ui-monospace, monospace`;
    ctx.fillText('PHOTOKAMO', layout.x, layout.y + height + (output.height - layout.y - height) * .58);
  } else if (frame === 'sprocket') {
    addSprockets(ctx, layout, width, height);
  }
  return output;
}