// Light/dark theme. The choice is saved; with none saved the theme follows the system. index.html sets
// data-theme before first paint, so this module only handles switching: a six-blade iris closes over the
// screen, the theme swaps while it is shut, then it opens, to a synthesised camera shutter sound.
import { $ } from './state.js';

const THEME_KEY = 'photokamo:theme';
const BLADES = 6, CLOSE_MS = 240, HOLD_MS = 70, OPEN_MS = 300, TWIST = Math.PI / 3.6; // 50°
const root = document.documentElement;
const systemLight = matchMedia('(prefers-color-scheme: light)'), still = matchMedia('(prefers-reduced-motion: reduce)');
const current = () => root.dataset.theme === 'light' ? 'light' : 'dark';
let busy = false, audio = null;

function saved() { try { const value = localStorage.getItem(THEME_KEY); return value === 'light' || value === 'dark' ? value : null; } catch { return null; } }

function apply(theme) {
  root.dataset.theme = theme;
  const next = theme === 'light' ? 'dark' : 'light', label = `Switch to ${next} theme`;
  for (const button of document.querySelectorAll('.theme-toggle')) { button.setAttribute('aria-label', label); button.title = label; }
  $('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
}

// ---------- Sound: an SLR shutter, synthesised once (no audio files). Two clusters, "ka-chick": mirror up + first
// curtain, then second curtain + mirror down. Each is a few sub-millisecond clicks, a short metal ring and a body thump.
const CLUSTERS = [
  { at: 0,    hits: [[0, 1], [4, .55], [9, .35]],            ring: [2300, 3700, 5300], thump: 140 },
  { at: .095, hits: [[0, .9], [3, .7], [11, .35], [19, .2]], ring: [1900, 3100, 4700], thump: 105, rattle: true }
];
let shutterBuffer = null;
function buildShutter(ctx) {
  const rate = ctx.sampleRate, buffer = ctx.createBuffer(1, Math.round(rate * .3), rate), out = buffer.getChannelData(0);
  const add = (from, length, sample) => { const start = Math.round(from * rate); for (let i = 0; i < length && start + i < out.length; i++) out[start + i] += sample(i / rate); };
  for (const cluster of CLUSTERS) {
    for (const [ms, level] of cluster.hits) { // clicks: high-passed noise, ~1.5 ms decay
      let last = 0, high = 0;
      add(cluster.at + ms / 1000, Math.round(rate * .012), t => { const x = (Math.random() * 2 - 1) * Math.exp(-t / .0015); high = .86 * (high + x - last); last = x; return high * level; });
    }
    for (const [index, hz] of cluster.ring.entries()) { // metal ring: damped partials
      const phase = Math.random() * 6.28, decay = .012 + index * .004;
      add(cluster.at, Math.round(rate * .08), t => .22 * Math.sin(6.283 * hz * t + phase) * Math.exp(-t / decay));
    }
    add(cluster.at, Math.round(rate * .06), t => .7 * Math.sin(6.283 * cluster.thump * t * (1 - t * 4)) * Math.exp(-t / .012)); // body thump, falling pitch
    if (cluster.rattle) { let low = 0; add(cluster.at + .004, Math.round(rate * .1), t => (low += .25 * ((Math.random() * 2 - 1) - low)) * .35 * Math.exp(-t / .022)); } // spring settle
  }
  let peak = 0; for (const value of out) peak = Math.max(peak, Math.abs(value));
  for (let i = 0; i < out.length; i++) out[i] *= .8 / peak;
  return buffer;
}
function shutterSound() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    shutterBuffer ||= buildShutter(audio);
    const source = audio.createBufferSource(), gain = audio.createGain();
    source.buffer = shutterBuffer; gain.gain.value = .75;
    source.connect(gain).connect(audio.destination); source.start(audio.currentTime + .005);
  } catch { /* no audio: the switch still works */ }
}

// ---------- Iris: blades are the screen minus a rotating hexagon; each hexagon edge runs on as a blade seam ----------
function iris() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('theme-shutter'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path class="theme-shutter-blades"/><path class="theme-shutter-edges"/>';
  const [blades, edges] = svg.children;
  const w = innerWidth, h = innerHeight, cx = w / 2, cy = h / 2, far = Math.hypot(w, h), open = far / 2 / Math.cos(Math.PI / BLADES) * 1.04;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const draw = (radius, twist) => {
    const points = [], seams = [];
    for (let i = 0; i < BLADES; i++) {
      const a = twist + i * 2 * Math.PI / BLADES, run = twist + (i - .5) * 2 * Math.PI / BLADES + Math.PI / 2; // the edge arriving at this corner, carried on
      const x = cx + radius * Math.cos(a), y = cy + radius * Math.sin(a);
      points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
      seams.push(`M${x.toFixed(1)} ${y.toFixed(1)}l${(far * Math.cos(run)).toFixed(1)} ${(far * Math.sin(run)).toFixed(1)}`);
    }
    blades.setAttribute('d', `M-2 -2H${w + 2}V${h + 2}H-2Z M${points.join('L')}Z`);
    edges.setAttribute('d', seams.join(''));
  };
  const tween = (ms, from, to, ease) => new Promise(done => {
    const start = performance.now();
    const step = now => { const t = Math.min(1, (now - start) / ms), k = ease(t); draw(open * (from + (to - from) * k), TWIST * (1 - (from + (to - from) * k))); t < 1 ? requestAnimationFrame(step) : done(); };
    requestAnimationFrame(step);
  });
  draw(open, 0);
  document.body.append(svg);
  return { svg, close: () => tween(CLOSE_MS, 1, 0, t => t * t * t), open: () => tween(OPEN_MS, 0, 1, t => 1 - (1 - t) ** 3) };
}

async function toggle() {
  if (busy) return;
  const next = current() === 'light' ? 'dark' : 'light';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* this visit only */ }
  if (still.matches) { shutterSound(); apply(next); return; }
  busy = true;
  const shutter = iris();
  shutterSound();
  try {
    await shutter.close();
    apply(next);
    await new Promise(done => setTimeout(done, HOLD_MS));
    await shutter.open();
  } finally { shutter.svg.remove(); busy = false; }
}

export function initTheme() {
  apply(saved() || current());
  for (const button of document.querySelectorAll('.theme-toggle')) button.addEventListener('click', toggle);
  systemLight.addEventListener('change', () => { if (!saved() && !busy) apply(systemLight.matches ? 'light' : 'dark'); });
}
