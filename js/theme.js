// Light/dark theme. The choice is saved; with none saved the theme follows the system. index.html sets
// data-theme before first paint, so this module only handles switching: a six-blade iris closes over the
// screen, the theme swaps while it is shut, then it opens; a Web Audio shutter clicks on close and open.
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

// ---------- Sound: a short filtered noise burst (the blades) over a low thump (the body), no audio files ----------
function click(at, { pitch = 1, level = 1 } = {}) {
  const ctx = audio, rate = ctx.sampleRate, noise = ctx.createBuffer(1, Math.round(rate * .06), rate), data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const source = ctx.createBufferSource(), band = ctx.createBiquadFilter(), gain = ctx.createGain();
  source.buffer = noise; band.type = 'bandpass'; band.frequency.value = 3200 * pitch; band.Q.value = .9;
  gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(.55 * level, at + .002); gain.gain.exponentialRampToValueAtTime(.0001, at + .055);
  source.connect(band).connect(gain).connect(ctx.destination); source.start(at); source.stop(at + .07);
  const body = ctx.createOscillator(), thump = ctx.createGain();
  body.type = 'sine'; body.frequency.setValueAtTime(150 * pitch, at); body.frequency.exponentialRampToValueAtTime(55, at + .04);
  thump.gain.setValueAtTime(.0001, at); thump.gain.exponentialRampToValueAtTime(.35 * level, at + .003); thump.gain.exponentialRampToValueAtTime(.0001, at + .05);
  body.connect(thump).connect(ctx.destination); body.start(at); body.stop(at + .06);
}
function shutterSound(gapMs) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const now = audio.currentTime + .01;
    click(now); click(now + gapMs / 1000, { pitch: .8, level: .8 }); // "ka-chick": closing, then opening
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
  if (still.matches) { shutterSound(90); apply(next); return; }
  busy = true;
  const shutter = iris();
  shutterSound(CLOSE_MS + HOLD_MS);
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
