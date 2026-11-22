const clamp = value => Math.max(0, Math.min(255, value));
const hasAdjustments = adjustments => Object.values(adjustments).some(value => value !== 0);

// `frame` is a frame id or { id, width, bottom, paper } (Paper print: % of the short edge + colour).
const frameId = frame => (typeof frame === 'string' ? frame : frame?.id || 'none');

// Fit frames: width / height of the result.
const FIT_FRAMES = { 'fit-square': { ratio: 1 }, 'fit-portrait': { ratio: .8 }, 'blur-square': { ratio: 1, blur: true }, 'blur-portrait': { ratio: .8, blur: true } };
/** Blur fill: the photo scaled to cover the whole frame, blurred and dimmed a little. A tiny copy scaled back up blurs
 *  the same way on every browser and in Workers (canvas `filter` isn't everywhere yet). */
function drawBlurFill(ctx, photo, W, H) {
  const scale = Math.max(W / photo.width, H / photo.height), w = photo.width * scale, h = photo.height * scale;
  const small = createCanvas(Math.max(1, Math.round(W / 24)), Math.max(1, Math.round(H / 24)));
  const sctx = small.getContext('2d'); sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(photo, (W - w) / 2 / 24, (H - h) / 2 / 24, w / 24, h / 24);
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Each frame's own border colour; a frame may carry { color } to override it (not Blur: it has none, not Paper: its own swatches). */
export const FRAME_COLORS = { gallery: '#f3f1ec', floating: '#e6e3dc', filed: '#0e0e0d', classic: '#171715', instant: '#f7f3e8', sprocket: '#171715', 'film-worn': '#171715', 'fit-square': '#ffffff', 'fit-portrait': '#ffffff' };

function frameLayout(width, height, frame) {
  if (frameId(frame) === 'paper') {
    const short = Math.min(width, height);
    const side = Math.round(short * (frame.width ?? 5) / 100);
    const bottom = side + Math.round(short * (frame.bottom ?? 0) / 100);
    return { width: width + side * 2, height: height + side + bottom, x: side, y: side, background: frame.paper || '#f4efe4' };
  }
  const color = (typeof frame === 'object' && frame?.color) || null;
  frame = frameId(frame);
  const short = Math.min(width, height), background = color || FRAME_COLORS[frame];
  if (frame === 'gallery') { const mat = Math.round(short * .1); return { width: width + mat * 2, height: height + mat * 2, x: mat, y: mat, background }; }
  if (frame === 'floating') { const margin = Math.round(short * .09); return { width: width + margin * 2, height: height + margin * 2, x: margin, y: margin, background }; }
  if (frame === 'filed') { const margin = Math.round(short * .045); return { width: width + margin * 2, height: height + margin * 2, x: margin, y: margin, background }; }
  if (frame === 'classic') {
    const margin = Math.round(Math.min(width, height) * .035);
    return { width: width + margin * 2, height: height + margin * 2, x: margin, y: margin, background };
  }
  if (frame === 'instant') {
    const side = Math.round(Math.min(width, height) * .065);
    const bottom = Math.round(Math.min(width, height) * .19);
    return { width: width + side * 2, height: height + side + bottom, x: side, y: side, background };
  }
  const fit = FIT_FRAMES[frame];
  if (fit) { // pad to the ratio, with a margin all round (white: slim; blur: wider, so the blur shows even when the photo is near the ratio)
    const margin = Math.round(short * (fit.blur ? .07 : .03));
    let W = width + margin * 2, H = height + margin * 2;
    if (W / H < fit.ratio) W = Math.round(H * fit.ratio); else H = Math.round(W / fit.ratio);
    return { width: W, height: H, x: Math.round((W - width) / 2), y: Math.round((H - height) / 2), background: fit.blur ? '#171715' : background };
  }
  const film = FILM_FRAMES[frame];
  if (film) { // 35 mm: the photo is the 24 mm side across the film; portrait photos get an upright strip
    const land = width >= height, mm = (land ? height : width) / 24;
    const edge = Math.round(mm * 5.5), side = Math.round(mm * film.side);
    return land ? { width: width + side * 2, height: height + edge * 2, x: side, y: edge, background: background || '#171715' }
      : { width: width + edge * 2, height: height + side * 2, x: edge, y: side, background: background || '#171715' };
  }
  if (frame === 'film-collage') { const m = Math.round(short * .2); return { width: width + m * 2, height: height + m * 2, x: m, y: m, background: '#f5f3ee' }; }
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

// "Filed carrier" darkroom border: irregular black jags biting into each edge of the photo.
function roughEdges(ctx, x, y, width, height, short, color) {
  const depth = short * .014, step = Math.max(2, short * .006);
  const jag = i => depth * (.2 + .8 * (seededNoise(i) + 1) / 2);
  ctx.fillStyle = color;
  const edge = (length, point, seed) => {
    ctx.beginPath(); ctx.moveTo(...point(0, 0));
    for (let t = 0, i = 0; t <= length + step; t += step, i++) ctx.lineTo(...point(Math.min(t, length), jag(seed + i)));
    ctx.lineTo(...point(length, 0)); ctx.closePath(); ctx.fill();
  };
  edge(width, (t, d) => [x + t, y + d], 0);
  edge(width, (t, d) => [x + t, y + height - d], 5000);
  edge(height, (t, d) => [x + d, y + t], 10000);
  edge(height, (t, d) => [x + width - d, y + t], 15000);
}

// ---------- Film frames ----------
// Real 35 mm geometry, in mm of film: a 24 mm tall image on 35 mm film, frames 38 mm apart (2 mm gap),
// 8 perforations of 2.8 × 1.98 mm per frame (4.75 mm pitch) set 2 mm in from each edge.
// `side`: film shown left and right of the photo (the gap plus a sliver of the next frame).
// Every mark is seeded and sized in mm, so the preview and the full-size export match.
const FILM_FRAMES = { sprocket: { side: 5.5, wear: .3 }, 'film-worn': { side: 6, wear: 1 }, 'film-leak': { side: 14, wear: .45 } };
const rnd = i => (seededNoise(i) + 1) / 2;
const HOLE_LIGHT = '#f4f2ec';

/** Perforation holes as subpaths of the current path, along a strip of length L and width A (film mm = mm). */
function perforations(ctx, L, A, mm, phase) {
  const pitch = 4.75 * mm, w = 2.8 * mm, h = 1.98 * mm, inset = 2.01 * mm, r = .5 * mm;
  for (let x = phase % pitch - pitch; x < L; x += pitch) {
    ctx.roundRect(x, inset, w, h, r);
    ctx.roundRect(x, A - inset - h, w, h, r);
  }
}

/** Dust and scratches inside the current clip: light marks show on the black film, dark ones on clear film. */
function filmWear(ctx, L, A, mm, amount, seed) {
  ctx.lineCap = 'round';
  const lines = Math.round(12 + 110 * amount), specks = Math.round(40 + 320 * amount);
  for (let i = 0; i < lines; i++) {
    const k = seed + i * 13, long = rnd(k + 2) < .35;
    const x = rnd(k) * L, y = rnd(k + 1) * A;
    const len = (long ? 6 + rnd(k + 3) * 26 : .8 + rnd(k + 3) * 5) * mm * (.55 + amount * .45);
    const angle = long ? (rnd(k + 4) < .6 ? 0 : Math.PI / 2) + (rnd(k + 5) - .5) * .3 : rnd(k + 4) * Math.PI * 2;
    const dx = Math.cos(angle) * len, dy = Math.sin(angle) * len, bend = (rnd(k + 6) - .5) * len * .25;
    const light = rnd(k + 7) < .8;
    ctx.strokeStyle = light ? `rgba(236,233,224,${(.12 + rnd(k + 8) * .5) * (.5 + amount * .5)})` : `rgba(24,24,22,${.15 + rnd(k + 8) * .45})`;
    ctx.lineWidth = (.04 + rnd(k + 9) ** 2 * (.12 + .2 * amount)) * mm;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + dx / 2 - dy / len * bend, y + dy / 2 + dx / len * bend, x + dx, y + dy);
    ctx.stroke();
  }
  for (let i = 0; i < specks; i++) {
    const k = seed + 50000 + i * 7;
    ctx.fillStyle = rnd(k + 3) < .75 ? `rgba(236,233,224,${.2 + rnd(k + 4) * .6})` : `rgba(24,24,22,${.3 + rnd(k + 4) * .5})`;
    ctx.beginPath();
    ctx.ellipse(rnd(k) * L, rnd(k + 1) * A, (.04 + rnd(k + 2) ** 4 * .4) * mm, (.03 + rnd(k + 5) ** 4 * .3) * mm, rnd(k + 6) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Single 35 mm frame on its strip (sprocket / film-worn / film-leak), drawn around the already placed photo. */
function drawFilmStrip(ctx, layout, photo, kind) {
  const spec = FILM_FRAMES[kind], film = layout.background;
  let L = layout.width, A = layout.height, px = layout.x, py = layout.y, pw = photo.width, ph = photo.height;
  ctx.save();
  if (pw < ph) { // portrait: draw the strip lying down in a turned space
    ctx.translate(layout.width, 0); ctx.rotate(Math.PI / 2);
    [L, A, px, py, pw, ph] = [layout.height, layout.width, layout.y, layout.width - layout.x - photo.width, photo.height, photo.width];
  }
  const mm = ph / 24, gap = 2 * mm, r = .7 * mm;
  const neighbours = [[px - gap - pw, py], [px + pw + gap, py]];
  // Next frames on the roll: a dim, out-of-focus shot / clear (unexposed) film / burnt by a light leak
  if (kind === 'sprocket') {
    const small = createCanvas(Math.max(1, Math.round(pw / 28)), Math.max(1, Math.round(ph / 28)));
    const sctx = small.getContext('2d'); sctx.translate(small.width, 0); sctx.scale(-1, 1);
    sctx.drawImage(photo, 0, 0, small.width, small.height);
    ctx.save(); ctx.beginPath();
    for (const [x, y] of neighbours) ctx.roundRect(x, y, pw, ph, r);
    ctx.clip(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    for (const [x, y] of neighbours) ctx.drawImage(small, x, y, pw, ph);
    ctx.fillStyle = 'rgba(10,10,9,.55)'; ctx.fillRect(0, 0, L, A);
    ctx.restore();
  } else if (kind === 'film-worn') {
    ctx.fillStyle = '#efede6'; ctx.beginPath();
    for (const [x, y] of neighbours) ctx.roundRect(x, y, pw, ph, r);
    ctx.fill();
  } else {
    const end = px - gap * .6;
    for (const flip of [false, true]) {
      ctx.save();
      if (flip) { ctx.translate(L, 0); ctx.scale(-1, 1); } // the right end mirrors the left
      const burn = ctx.createLinearGradient(0, 0, end, 0);
      burn.addColorStop(0, '#f2ebdc'); burn.addColorStop(.38, '#f0dcb4'); burn.addColorStop(.66, '#e98a2c');
      burn.addColorStop(.84, '#b8410f'); burn.addColorStop(.95, '#4a1606'); burn.addColorStop(1, film);
      ctx.fillStyle = burn; ctx.fillRect(0, 0, end, A);
      const glow = ctx.createRadialGradient(end, A / 2, 0, end, A / 2, A * .55); // hottest beside the frame
      glow.addColorStop(0, 'rgba(255,120,30,.55)'); glow.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, end, A);
      ctx.restore();
    }
  }
  // Rounded corners of the film gate
  ctx.fillStyle = film; ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.roundRect(px, py, pw, ph, r); ctx.fill('evenodd');
  if (kind === 'film-worn') roughEdges(ctx, px, py, pw, ph, ph * .7, film);
  // Dust and scratches everywhere but on the photo
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, L, A); ctx.rect(px, py, pw, ph); ctx.clip('evenodd');
  filmWear(ctx, L, A, mm, spec.wear, kind === 'film-leak' ? 9000 : 0);
  ctx.restore();
  // Perforations: light through the holes, lined up with the frame
  ctx.fillStyle = HOLE_LIGHT; ctx.beginPath(); perforations(ctx, L, A, mm, px + pw / 2 - 1.4 * mm); ctx.fill();
  // Edge print: frame numbers above, numbers and the half-frame arrow below
  const ink = kind === 'film-leak' ? '#ef9a3c' : kind === 'film-worn' ? 'rgba(242,240,232,.9)' : 'rgba(228,222,206,.72)';
  ctx.fillStyle = ink; ctx.font = `700 ${1.5 * mm}px Helvetica, Arial, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const top = 1.05 * mm, bottom = A - 1.05 * mm, mid = px + pw / 2;
  ctx.fillText('24', mid, top); ctx.fillText('24', mid, bottom);
  ctx.fillText('▸24A', px + pw + gap / 2, bottom); ctx.fillText('23A', px - gap / 2, bottom);
  ctx.textAlign = 'left'; ctx.fillText('▸', px + 2 * mm, top);
  ctx.restore();
}

/** One strip lying at (cx, cy), turned by `angle`: real holes (an even-odd path), grey frames, a soft shadow. */
function collageStrip(ctx, cx, cy, length, across, angle, seed) {
  const mm = across / 35, half = length / 2, pitch = 38 * mm;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle); ctx.translate(-half, -across / 2);
  ctx.beginPath(); ctx.rect(0, 0, length, across); perforations(ctx, length, across, mm, rnd(seed) * pitch);
  ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = mm * 1.5; ctx.shadowOffsetY = mm * .3;
  ctx.fillStyle = '#141413'; ctx.fill('evenodd');
  ctx.shadowColor = 'transparent';
  for (let x = rnd(seed + 1) * pitch - pitch, i = 0; x < length; x += pitch, i++) {
    const g = 70 + rnd(seed + 2 + i) * 95, lift = rnd(seed + 40 + i) * 50;
    const tone = ctx.createLinearGradient(x, 0, x + 36 * mm, across);
    tone.addColorStop(0, `rgb(${g},${g},${g - 2})`); tone.addColorStop(1, `rgb(${g + lift},${g + lift},${g + lift - 2})`);
    ctx.fillStyle = tone; ctx.beginPath(); ctx.roundRect(x, 5.5 * mm, 36 * mm, 24 * mm, .7 * mm); ctx.fill();
  }
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, length, across); ctx.clip();
  filmWear(ctx, length, across, mm, .45, seed * 31);
  ctx.restore();
  ctx.restore();
}

/** "Film strips": loose strips overlapping around the photo on paper, with ink splatter at the edges. */
function drawFilmCollage(ctx, layout, w, h) {
  const W = layout.width, H = layout.height, m = layout.x, s = m * .74, deg = Math.PI / 180;
  // [side, distance from the outer edge, width, length (× the side), shift along (× the side), angle°]
  const strips = [];
  for (let side = 0; side < 4; side++) {
    const k = side * 97;
    strips.push([side, m * (.44 + rnd(k) * .14), s * .8, .8, (rnd(k + 1) - .5) * .3, (rnd(k + 2) < .5 ? -1 : 1) * (1.5 + rnd(k + 3) * 2.5)]);
  }
  for (let side = 0; side < 4; side++) strips.push([side, m * .56, s, 1.15, 0, (rnd(side * 97 + 4) - .5) * .8]);
  for (let side = 0; side < 4; side++) {
    const k = side * 97 + 10;
    strips.push([side, m * (.48 + rnd(k) * .1), s * .78, .42, (rnd(k + 1) < .5 ? -1 : 1) * .3, (rnd(k + 2) < .5 ? -1 : 1) * (4 + rnd(k + 3) * 4)]);
  }
  strips.forEach(([side, d, across, length, shift, angle], i) => {
    const vertical = side % 2 === 1, along = vertical ? H : W;
    const t = along / 2 + shift * along;
    const [cx, cy] = side === 0 ? [t, d] : side === 1 ? [W - d, t] : side === 2 ? [t, H - d] : [d, t];
    collageStrip(ctx, cx, cy, along * length, across, (vertical ? 90 : 0) * deg + angle * deg, 300 + i * 53);
  });
  // Grunge: ink splatter and paper chips, thickest at the outer edge
  const short = Math.min(w, h);
  for (let i = 0; i < 1400; i++) {
    const k = 70000 + i * 9, side = Math.floor(rnd(k) * 4), along = rnd(k + 1), depth = rnd(k + 2) ** 3 * m * .8;
    const x = side === 0 || side === 2 ? along * W : side === 1 ? W - depth : depth;
    const y = side === 1 || side === 3 ? along * H : side === 0 ? depth : H - depth;
    const ink = rnd(k + 4) < .8, radius = (.0006 + rnd(k + 3) ** 6 * .008) * short * (ink ? 1 : .45);
    ctx.fillStyle = ink ? `rgba(20,20,18,${.45 + rnd(k + 5) * .5})` : layout.background;
    ctx.beginPath(); ctx.ellipse(x, y, radius * (1 + rnd(k + 6) * .8), radius, rnd(k + 7) * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
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

// ---------- Text on the photo ----------
// A text layer: { id, content, font, size, color, x, y, align, bold, italic, shadow, opacity }.
// size is a fraction of the photo's short edge and (x, y) the centre of the text block as a
// fraction of the photo, so text looks the same in the preview and at full resolution.
// Fonts: the two bundled ones (css/styles.css @font-face) and common system fonts; nothing is downloaded.
export const textFonts = [
  ['inter', 'Inter', 'Inter, system-ui, sans-serif'],
  ['playfair', 'Playfair Display (italic)', '"Playfair Display", Georgia, serif'],
  ['serif', 'Classic serif', 'Georgia, "Times New Roman", serif'],
  ['modern-serif', 'Modern serif', 'Didot, "Bodoni 72", "Bodoni MT", Georgia, serif'],
  ['typewriter', 'Typewriter', '"Courier New", Courier, ui-monospace, monospace'],
  ['poster', 'Poster', 'Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif'],
  ['script', 'Script', '"Segoe Script", "Snell Roundhand", "Brush Script MT", cursive'],
  ['handwritten', 'Handwritten', 'Noteworthy, "Bradley Hand", "Segoe Print", cursive'],
  ['rounded', 'Rounded', '"Arial Rounded MT Bold", "Varela Round", "Trebuchet MS", system-ui, sans-serif'],
  ['condensed', 'Condensed', '"Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", sans-serif'],
  ['clean', 'Clean sans', 'Avenir, "Avenir Next", Helvetica, Arial, sans-serif']
];
const fontStack = id => (textFonts.find(([fontId]) => fontId === id) || textFonts[0])[2];
/** The CSS font string for a text layer at `px` pixels (Playfair is bundled as 600 italic only). */
export function textFont(text, px) {
  if (text.font === 'playfair') return `italic 600 ${px}px ${fontStack('playfair')}`;
  return `${text.italic ? 'italic ' : ''}${text.bold ? 700 : 400} ${px}px ${fontStack(text.font)}`;
}
/** Draws text layers inside `rect` (the photo area) and returns each one's box { id, x, y, w, h }. */
export function drawTexts(ctx, rect, texts = []) {
  const boxes = [], short = Math.min(rect.width, rect.height);
  for (const text of texts) {
    const lines = String(text.content || '').split('\n');
    if (!lines.some(line => line.trim())) continue;
    const px = Math.max(4, text.size * short), lineHeight = px * 1.2;
    ctx.save();
    ctx.font = textFont(text, px);
    ctx.textBaseline = 'middle'; ctx.textAlign = text.align || 'center';
    const width = Math.max(...lines.map(line => ctx.measureText(line).width)), height = lineHeight * lines.length;
    const cx = rect.x + text.x * rect.width, cy = rect.y + text.y * rect.height;
    const x = text.align === 'left' ? cx - width / 2 : text.align === 'right' ? cx + width / 2 : cx;
    ctx.globalAlpha = text.opacity ?? 1;
    if (text.shadow) { ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = px * .2; ctx.shadowOffsetY = px * .05; }
    ctx.fillStyle = text.color || '#ffffff';
    lines.forEach((line, i) => ctx.fillText(line, x, cy - height / 2 + lineHeight * (i + .5)));
    ctx.restore();
    boxes.push({ id: text.id, x: cx - width / 2, y: cy - height / 2, w: width, h: height });
  }
  return boxes;
}

export function renderImage(image, adjustments, frame = 'none', maxEdge = 1400, texts = []) {
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
  return frameCanvas(photo, frame, texts);
}

// ---------- Crop ----------
// crop = { ratio, swapped, x, y, w, h, zoom, rotate, flip, straighten }. Coordinates are in the
// "oriented" photo (after rotate 90° steps and flip), normalised 0–1: the box is centred on
// (x, y), measures (w × W) / zoom by (h × H) / zoom px, and is turned by `straighten` degrees.
export const defaultCrop = Object.freeze({ ratio: 'orig', swapped: false, platform: null, x: .5, y: .5, w: 1, h: 1, zoom: 1, rotate: 0, flip: false, straighten: 0 });
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

// Puts a finished photo (canvas or ImageBitmap) into a presentation frame, with its text on top.
// The result carries photoRect: where the photo sits inside the frame.
export function frameCanvas(photo, frame = 'none', texts = []) {
  const { width, height } = photo;
  const layout = frameLayout(width, height, frame);
  const output = createCanvas(layout.width, layout.height);
  const ctx = output.getContext('2d');
  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, output.width, output.height);
  const id = frameId(frame), short = Math.min(width, height);
  if (FIT_FRAMES[id]?.blur) drawBlurFill(ctx, photo, output.width, output.height);
  if (id === 'floating') { // the shadow under the print
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.38)'; ctx.shadowBlur = short * .035; ctx.shadowOffsetY = short * .014;
    ctx.fillStyle = '#000'; ctx.fillRect(layout.x, layout.y, width, height);
    ctx.restore();
  }
  if (id === 'film-collage') drawFilmCollage(ctx, layout, width, height);
  ctx.drawImage(photo, layout.x, layout.y);

  frame = id;
  if (frame === 'gallery') {
    const line = Math.max(1, short * .0025), gap = line * 3;
    ctx.strokeStyle = 'rgba(30,30,28,.6)'; ctx.lineWidth = line;
    ctx.strokeRect(layout.x - gap, layout.y - gap, width + gap * 2, height + gap * 2);
  } else if (frame === 'filed') {
    roughEdges(ctx, layout.x, layout.y, width, height, short, layout.background);
  } else if (FILM_FRAMES[frame]) {
    drawFilmStrip(ctx, layout, photo, frame);
  } else if (frame === 'film-collage') {
    ctx.strokeStyle = '#141413'; ctx.lineWidth = Math.max(1, short * .006);
    ctx.strokeRect(layout.x, layout.y, width, height);
  }
  const photoRect = { x: layout.x, y: layout.y, width, height };
  if (texts.length) drawTexts(ctx, photoRect, texts);
  output.photoRect = photoRect;
  return output;
}