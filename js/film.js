// Shared generated film marks. Keep these primitives stable: the single-photo film frames in renderer.js use them,
// and contact sheets add composition around them without changing their drawing order or arguments.

export function seededNoise(index) {
  let n = Math.imul(index + 1729, 374761393);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) & 1023) / 511.5 - 1;
}

export const filmRandom = i => (seededNoise(i) + 1) / 2;

/** Perforation holes as subpaths of the current path, along a strip of length L and width A (film mm = mm). */
export function perforations(ctx, L, A, mm, phase) {
  const pitch = 4.75 * mm, w = 2.8 * mm, h = 1.98 * mm, inset = 2.01 * mm, r = .5 * mm;
  for (let x = phase % pitch - pitch; x < L; x += pitch) {
    ctx.roundRect(x, inset, w, h, r);
    ctx.roundRect(x, A - inset - h, w, h, r);
  }
}

/** Dust and scratches inside the current clip: light marks show on dark film, dark ones on a clear base. */
export function filmWear(ctx, L, A, mm, amount, seed) {
  const rnd = filmRandom;
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