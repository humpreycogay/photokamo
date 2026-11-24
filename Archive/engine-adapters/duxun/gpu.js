// DuXun renderer on the GPU (WebGL2, in the worker's OffscreenCanvas).
//
// Same pipeline as core.js render() (the port of the plugin's renderRows), statement by statement,
// with the same per-render constants (core.js prepare()). Three kinds of pass:
//   1. glow threshold  — buildGlowBuffer's downsampled highlight extraction (halation / bloom)
//   2. glow blur        — its 3×3 blur passes (centre weight 2), ping-pong
//   3. main             — the per-pixel pipeline, written straight to the canvas
// The one deliberate difference: the plugin's noise is fract(sin(large) * 43758.5), which GPUs
// compute poorly for large arguments (visible patterns on some phones). The shader uses an integer
// hash with the same uniform distribution instead; the plugin's integer grain hash (hashXY) is
// exact. Grain strength is what has to match (see engines/duxun/tools/verify).
//
// createGpuRenderer() returns null when WebGL2 or float render targets are missing: the worker then
// uses the JavaScript renderer.
import { prepare } from './core.js';

const VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
out vec4 o;
float lumaOf(vec3 c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
float toLinear(float t, float x) { return t == 1.0 ? pow(clamp(x, 0.0, 1.0), 2.4) : t == 2.0 ? pow(clamp(x, 0.0, 1.0), 2.0) : x; }
float fromLinear(float t, float x) { return t == 1.0 ? pow(clamp(x, 0.0, 1.0), 1.0 / 2.4) : t == 2.0 ? pow(clamp(x, 0.0, 1.0), 0.5) : x; }
float sstep(float e0, float e1, float x) { float t = clamp((x - e0) / max(0.0001, e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
`;

// Pass 1: glow threshold (buildGlowBuffer, first loop). Output cell (gx, gy) = row gy from the top.
const THRESHOLD = COMMON + `
uniform sampler2D src; uniform vec2 srcSize; uniform float cell, kind, threshold, region, softness, inT;
void main() {
  ivec2 g = ivec2(gl_FragCoord.xy);
  int x = min(int(srcSize.x) - 1, int(floor(float(g.x) * cell + 0.5)));
  int y = min(int(srcSize.y) - 1, int(floor(float(g.y) * cell + 0.5)));
  vec3 s = texelFetch(src, ivec2(x, y), 0).rgb;
  vec3 c = vec3(toLinear(inT, s.r), toLinear(inT, s.g), toLinear(inT, s.b));
  float lum = lumaOf(c), key = max(lum, c.r * 0.92 + lum * 0.08), w;
  if (kind == 1.0) {
    key = lum;
    float e0 = max(threshold, mix(0.56, 0.92, clamp(region, 0.0, 1.0)));
    w = sstep(e0, e0 + mix(0.22, 0.055, clamp(softness, 0.0, 1.0)), key);
  } else {
    w = clamp((key - threshold) / max(0.001, 1.0 - threshold), 0.0, 1.0);
    w = w * w * (3.0 - 2.0 * w);
  }
  if (kind == 0.0) { float leak = max(c.r, lum * 1.12) * w; o = vec4(leak, leak * 0.30, leak * 0.025, 1.0); }
  else o = vec4(c * w, 1.0);
}`;

// Pass 2: one 3×3 blur pass (centre weight 2, edges clamped).
const BLUR = COMMON + `
uniform sampler2D buf; uniform vec2 size;
void main() {
  ivec2 g = ivec2(gl_FragCoord.xy), mx = ivec2(size) - 1;
  vec3 acc = vec3(0.0); float total = 0.0;
  for (int oy = -1; oy <= 1; oy++) for (int ox = -1; ox <= 1; ox++) {
    float wt = (ox == 0 && oy == 0) ? 2.0 : 1.0;
    acc += texelFetch(buf, clamp(g + ivec2(ox, oy), ivec2(0), mx), 0).rgb * wt; total += wt;
  }
  o = vec4(acc / total, 1.0);
}`;

// Uniform constants for the main pass (core.js prepare() names; booleans as 0/1).
const K = ['S', 'fPushPull', 'ppC', 'ppD', 'doExpand', 'exBlack', 'exScale', 'exC', 'printStock', 'fPrintCustom', 'stockR', 'stockG', 'stockB',
  'printC', 'printA', 'doLights', 'lightR', 'lightG', 'lightB', 'doDensity', 'densityFactor', 'fProfile', 'm0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8',
  'doColorHead', 'chR', 'chG', 'chB', 'fColorDensity', 'doSat', 'fSat', 'fVibrance', 'fSplit', 'fSplitWarmth', 'doHalation', 'halThreshold', 'halScale',
  'halWarmth', 'hasHalGlow', 'fH', 'halHue', 'halMixK', 'halLocal', 'halGlobal', 'halBlueComp', 'halImpact', 'halDefringe', 'hasBloomGlow', 'showBloomMask',
  'fBloom', 'bloomRadius', 'bloomSaveLights', 'bloomDefringe', 'bloomDetail', 'doGrain', 'grainScale', 'fGr', 'fShadows', 'fMids', 'fHighs', 'grainSeed',
  'modeGain', 'clumpK', 'neGrainSize', 'colorMixBase', 'fAcutance', 'doVignette', 'fV', 'vRadius', 'vFeather', 'doDamage', 'fDamage', 'fDust', 'fScratch',
  'inT', 'outT', 'width', 'height', 'glowCell', 'halW', 'halH', 'bloomW', 'bloomH'];

const MAIN = COMMON + `
uniform sampler2D src, lut, halGlow, bloomGlow;
uniform float U[${K.length}];
${K.map((name, i) => `#define ${name} U[${i}]`).join('\n')}
float lutLookup(float x) {
  if (x <= 0.0) return texelFetch(lut, ivec2(0, 0), 0).r;
  if (x >= 1.0) return texelFetch(lut, ivec2(1024, 0), 0).r;
  float fi = x * 1024.0; int i = int(fi);
  float a = texelFetch(lut, ivec2(i, 0), 0).r, b = texelFetch(lut, ivec2(i + 1, 0), 0).r;
  return a + (b - a) * (fi - float(i));
}
// hashXY of the plugin (32-bit unsigned wrap-around), exact.
float grainNoise(int x, int y, uint seed) {
  uint h = uint(x) * 374761393u + uint(y) * 668265263u + seed;
  h = (h ^ (h >> 13u)) * 1274126177u; h = h ^ (h >> 16u);
  return float(h & 0x7fffffffu) / 2147483647.0;
}
// Uniform [0,1) noise of three floats (stands in for fract(sin(dot(...)) * 43758.5), see header).
float neNoise(float x, float y, float seed) {
  uvec3 v = floatBitsToUint(vec3(x, y, seed));
  uint h = v.x * 0x8da6b343u ^ v.y * 0xd8163841u ^ v.z * 0xcb1ab31fu;
  h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u;
  return float(h >> 8u) / 16777216.0;
}
vec3 sampleGlow(sampler2D t, float w, float h, float x, float y) {
  float gx = clamp(x / glowCell, 0.0, w - 1.0), gy = clamp(y / glowCell, 0.0, h - 1.0);
  int x0 = int(floor(gx)), y0 = int(floor(gy)), x1 = min(int(w) - 1, x0 + 1), y1 = min(int(h) - 1, y0 + 1);
  float tx = gx - float(x0), ty = gy - float(y0);
  vec3 a = mix(texelFetch(t, ivec2(x0, y0), 0).rgb, texelFetch(t, ivec2(x1, y0), 0).rgb, tx);
  vec3 b = mix(texelFetch(t, ivec2(x0, y1), 0).rgb, texelFetch(t, ivec2(x1, y1), 0).rgb, tx);
  return mix(a, b, ty);
}
float srcLuma(int x, int y) {
  ivec2 q = clamp(ivec2(x, y), ivec2(0), ivec2(int(width) - 1, int(height) - 1));
  return lumaOf(texelFetch(src, q, 0).rgb);
}
void main() {
  int x = int(gl_FragCoord.x), y = int(height) - 1 - int(gl_FragCoord.y); // y: row from the top
  float ny = (float(y) + 0.5) / height;
  int tx = int(floor(float(x) / S)), ty = int(floor(float(y) / S));
  vec4 s4 = texelFetch(src, ivec2(x, y), 0);
  float r = toLinear(inT, s4.r), g = toLinear(inT, s4.g), b = toLinear(inT, s4.b);
  if (fPushPull != 0.0 && abs(fPushPull) > 0.001) { float l = lumaOf(vec3(r, g, b)); r = (l + (r - l) * ppC) * ppD; g = (l + (g - l) * ppC) * ppD; b = (l + (b - l) * ppC) * ppD; }
  if (doExpand > 0.5) { r = 0.5 + ((r - exBlack) * exScale - 0.5) * exC; g = 0.5 + ((g - exBlack) * exScale - 0.5) * exC; b = 0.5 + ((b - exBlack) * exScale - 0.5) * exC; }
  r = lutLookup(r); g = lutLookup(g); b = lutLookup(b);
  if (printStock == 5.0 && fPrintCustom > 0.001) { float l = lumaOf(vec3(r, g, b)); r = mix(r, l, fPrintCustom); g = mix(g, l, fPrintCustom); b = mix(b, l, fPrintCustom); }
  r *= stockR; g *= stockG; b *= stockB;
  if (fPrintCustom > 0.001) {
    r = 0.42 + (r - 0.42) * printC; g = 0.42 + (g - 0.42) * printC; b = 0.42 + (b - 0.42) * printC;
    float l = lumaOf(vec3(r, g, b)), hi = sstep(0.52, 1.08, max(r, max(g, b))), sh = 1.0 - sstep(0.08, 0.48, l);
    r *= 1.0 + 0.055 * printA * hi - 0.012 * printA * sh; g *= 1.0 + 0.010 * printA * hi - 0.010 * printA * sh; b *= 1.0 - 0.050 * printA * hi + 0.030 * printA * sh;
    float dens = 1.0 - 0.045 * printA * (1.0 - clamp(l, 0.0, 1.0)); r *= dens; g *= dens; b *= dens;
  }
  if (doLights > 0.5) { r *= lightR; g *= lightG; b *= lightB; }
  if (doDensity > 0.5) { float l = min(1.0, lumaOf(vec3(r, g, b))), s = 1.0 - densityFactor * (1.0 - l); r = l + (r - l) * s; g = l + (g - l) * s; b = l + (b - l) * s; }
  if (fProfile > 0.001) {
    float s = clamp(fProfile, 0.0, 2.0);
    float mr = m0 * r + m1 * g + m2 * b, mg = m3 * r + m4 * g + m5 * b, mb = m6 * r + m7 * g + m8 * b;
    r += (mr - r) * s; g += (mg - g) * s; b += (mb - b) * s;
  }
  if (doColorHead > 0.5) {
    float l = lumaOf(vec3(r, g, b)); r *= chR; g *= chG; b *= chB;
    float k = lumaOf(vec3(r, g, b)), comp = k > 0.001 ? l / k : 1.0, f = mix(1.0, comp, 0.35); r *= f; g *= f; b *= f;
  }
  if (fColorDensity != 0.0) { float l = lumaOf(vec3(r, g, b)), s = 1.0 + fColorDensity; r = l + (r - l) * s; g = l + (g - l) * s; b = l + (b - l) * s; }
  if (doSat > 0.5) { float l = lumaOf(vec3(r, g, b)); r = l + (r - l) * fSat; g = l + (g - l) * fSat; b = l + (b - l) * fSat; }
  if (fVibrance > 0.001) {
    float l = lumaOf(vec3(r, g, b)), chroma = clamp(max(r, max(g, b)) - min(r, min(g, b)), 0.0, 1.0), k = 1.0 + clamp(fVibrance, 0.0, 1.0) * (0.55 * (1.0 - chroma));
    r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k;
  }
  if (fSplit > 0.001) {
    float a = clamp(fSplit, 0.0, 1.0), w = clamp(fSplitWarmth, 0.0, 1.0), l = clamp(lumaOf(vec3(r, g, b)), 0.0, 1.0);
    float shadow = 1.0 - sstep(0.18, 0.55, l), high = sstep(0.45, 0.92, l);
    r += a * (shadow * (0.030 - 0.020 * w) + high * (0.050 * w)); g += a * (shadow * 0.006 + high * 0.010); b += a * (shadow * (0.050 * (1.0 - w)) - high * 0.030 * w);
  }
  if (doHalation > 0.5) {
    float l = lumaOf(vec3(r, g, b));
    if (l > halThreshold) { float ha = (l - halThreshold) * halScale; r += ha * (0.95 + 0.35 * halWarmth); g += ha * (0.18 + 0.26 * halWarmth); b += ha * (0.03 + 0.12 * (1.0 - halWarmth)); }
    if (hasHalGlow > 0.5) {
      vec3 gl = sampleGlow(halGlow, halW, halH, float(x), float(y));
      float a = clamp(fH, 0.0, 2.0), warm = clamp(halWarmth, 0.0, 1.0), gll = lumaOf(gl);
      float veil = clamp(max(gl.r * 1.28, gll * 0.92) * clamp(a * 0.52, 0.0, 0.85), 0.0, 0.95);
      float baseLum = clamp(lumaOf(vec3(r, g, b)), 0.0, 1.4), ring = clamp(1.15 - 0.75 * sstep(0.72, 1.10, baseLum), 0.32, 1.15);
      r += veil * ring * (0.96 + 0.48 * warm); g += veil * ring * (0.035 + 0.135 * warm); b += veil * ring * (0.003 + 0.020 * (1.0 - warm));
      float tint = clamp(veil * ring * (0.48 + 0.38 * warm), 0.0, 0.72);
      g = mix(g, min(g, r * (0.24 + 0.10 * (1.0 - warm))), tint); b = mix(b, min(b, r * (0.018 + 0.045 * (1.0 - warm))), tint);
    }
    {
      float a = clamp(fH, 0.0, 2.0), l2 = clamp(lumaOf(vec3(r, g, b)), 0.0, 1.4), hi = sstep(0.68, 1.08, l2), h = clamp(halHue, 0.0, 1.0);
      float m = a * halMixK * hi;
      r += m * (0.74 + 0.34 * clamp(halLocal, 0.0, 1.0) + 0.08 * clamp(halGlobal, 0.0, 1.0)); g += m * (0.065 + 0.115 * h);
      b += m * (0.010 + 0.070 * (1.0 - h)) * (1.0 - 0.78 * clamp(halBlueComp, 0.0, 1.0));
      float cb = clamp(m * (2.20 + 1.80 * clamp(halImpact, 0.0, 1.0)), 0.0, 0.45);
      g = mix(g, min(g, r * (0.26 + 0.16 * (1.0 - h))), cb); b = mix(b, min(b, r * (0.020 + 0.065 * (1.0 - h))), cb);
      b = mix(b, min(b, l2 * 0.92 + r * 0.08), clamp(halDefringe, 0.0, 1.0) * hi * a);
    }
  }
  if (hasBloomGlow > 0.5) {
    vec3 gl = sampleGlow(bloomGlow, bloomW, bloomH, float(x), float(y));
    if (showBloomMask > 0.5) { r = g = b = clamp(max(gl.r, max(gl.g, gl.b)) * 2.0, 0.0, 1.0); }
    else if (fBloom > 0.001) {
      float a = clamp(fBloom, 0.0, 1.25), gain = 1.08 + 1.12 * clamp(bloomRadius, 0.0, 1.0), m = clamp(a * 0.28, 0.0, 0.55);
      vec3 bc = clamp(gl * gain, 0.0, 1.8);
      r = mix(r, 1.0 - (1.0 - r) * (1.0 - clamp(bc.r, 0.0, 1.0)), clamp(m, 0.0, 1.0));
      g = mix(g, 1.0 - (1.0 - g) * (1.0 - clamp(bc.g, 0.0, 1.0)), clamp(m, 0.0, 1.0));
      b = mix(b, 1.0 - (1.0 - b) * (1.0 - clamp(bc.b, 0.0, 1.0)), clamp(m, 0.0, 1.0));
      float spill = clamp((bc.r + bc.g + bc.b) * 0.0045 * m, 0.0, 0.055); r += spill; g += spill; b += spill;
      float lightMask = sstep(0.42, 1.05, max(gl.r, max(gl.g, gl.b))) * clamp(bloomSaveLights, 0.0, 1.0);
      r = mix(r, max(r, gl.r), lightMask * 0.18); g = mix(g, max(g, gl.g), lightMask * 0.18); b = mix(b, max(b, gl.b), lightMask * 0.18);
      float l = lumaOf(vec3(r, g, b)), dfr = 1.0 - clamp(bloomDefringe, 0.0, 1.0) * 0.25, keep = 0.72 + 0.28 * clamp(bloomDetail, 0.0, 1.0);
      r = l + (r - l) * dfr; g = l + (g - l) * dfr; b = l + (b - l) * dfr;
      r = mix(l, r, keep); g = mix(l, g, keep); b = mix(l, b, keep);
    }
  }
  if (showBloomMask < 0.5 && doGrain > 0.5) {
    float lf = 0.05 + 0.9 * min(1.0, lumaOf(vec3(r, g, b)));
    r += (grainNoise(tx, ty, 42u) - 0.5) * grainScale * lf; g += (grainNoise(tx, ty, 137u) - 0.5) * grainScale * lf; b += (grainNoise(tx, ty, 293u) - 0.5) * grainScale * lf;
    if (fGr > 0.001) {
      float l = clamp(lumaOf(vec3(r, g, b)), 0.0, 1.0);
      float tonal = 0.18 + (1.0 - sstep(0.12, 0.52, l)) * fShadows + clamp(1.0 - abs(l - 0.48) * 2.2, 0.0, 1.0) * fMids + sstep(0.52, 0.96, l) * fHighs;
      float frame = floor(grainSeed);
      float clumpNoise = neNoise(float(tx) * 0.015 + grainSeed, float(ty) * 0.015 + frame * 0.11, 101.0 + grainSeed);
      float amount = fGr * tonal * modeGain * mix(0.88, 1.34, clumpNoise) * (1.0 + clumpK * 0.35);
      if (amount > 0.001) {
        float gx = float(tx) + trunc(grainSeed), gy = float(ty) - trunc(grainSeed * 0.5), fr = floor(grainSeed * 0.013 * 18.0);
        float scale = 0.025 + 0.11 * clamp(amount, 0.0, 2.0), nx = gx / neGrainSize, nyy = gy / neGrainSize;
        float nr = neNoise(nx + fr * 1.425, nyy, 1.0) * 2.0 - 1.0, ng = neNoise(nx, nyy + fr * 3.892, 2.0) * 2.0 - 1.0, nb = neNoise(nx + fr * 5.835, nyy + fr, 3.0) * 2.0 - 1.0;
        float mono = lumaOf(vec3(nr, ng, nb)); nr = mix(mono, nr, colorMixBase); ng = mix(mono, ng, colorMixBase); nb = mix(mono, nb, colorMixBase);
        float safe = clamp(1.20 - 0.70 * clamp(max(r, max(g, b)), 0.0, 1.0), 0.25, 1.20);
        float fine = neNoise(gx + fr * 11.0, gy - fr * 7.0, 9.0) * 2.0 - 1.0;
        r += (nr * scale + fine * scale * 0.25) * safe; g += (ng * scale + fine * scale * 0.22) * safe; b += (nb * scale + fine * scale * 0.28) * safe;
      }
    }
  }
  if (showBloomMask < 0.5 && fAcutance != 0.0 && abs(fAcutance) > 0.001) {
    float c = srcLuma(x, y), around = (srcLuma(x - 1, y) + srcLuma(x + 1, y) + srcLuma(x, y - 1) + srcLuma(x, y + 1)) * 0.25;
    float hp = (c - around) * clamp(fAcutance, -1.0, 1.0) * 0.55; r += hp; g += hp; b += hp;
  }
  if (showBloomMask < 0.5 && doVignette > 0.5) {
    float dx = ((float(x) + 0.5) / width - 0.5) * 2.0, dy = (ny - 0.5) * 2.0;
    float vf = 1.0 - clamp(fV * 0.95, 0.0, 1.6) * sstep(vRadius, vRadius + vFeather, sqrt(dx * dx + dy * dy));
    r *= vf; g *= vf; b *= vf;
  }
  r = clamp(r, 0.0, 1.0); g = clamp(g, 0.0, 1.0); b = clamp(b, 0.0, 1.0);
  if (showBloomMask < 0.5 && doDamage > 0.5) {
    float a = clamp(fDamage, 0.0, 2.0);
    float dust = neNoise(float(tx), float(ty), 31.0);
    if (dust > 1.0 - 0.0120 * a * fDust) {
      float pol = neNoise(float(ty), 0.0, 34.0), spot = pol > 0.58 ? mix(0.76, 1.55, pol) : mix(0.42, 0.86, pol);
      r *= spot; g *= spot; b *= spot;
    }
    float col = neNoise(floor(float(tx) * 0.04), 0.0, 57.0), sn = neNoise(float(ty) * 0.35, 0.0, 61.0);
    if (col > 1.0 - 0.080 * a * fScratch && sn > 0.18) { float line = sn > 0.72 ? 1.0 + 0.80 * a * fScratch : 1.0 - 0.35 * a * fScratch; r *= line; g *= line; b *= line; }
  }
  o = vec4(clamp(fromLinear(outT, r), 0.0, 1.0), clamp(fromLinear(outT, g), 0.0, 1.0), clamp(fromLinear(outT, b), 0.0, 1.0), s4.a);
}`;

function compile(gl, vertex, fragment) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  }
  gl.bindAttribLocation(program, 0, 'p');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  const uniforms = new Proxy({}, { get: (cache, name) => (cache[name] ??= gl.getUniformLocation(program, name)) });
  return { program, uniforms };
}

/** A WebGL2 DuXun renderer, or null if this browser can't run it. */
export function createGpuRenderer() {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const canvas = new OffscreenCanvas(1, 1);
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
  let programs;
  try { programs = { threshold: compile(gl, VERT, THRESHOLD), blur: compile(gl, VERT, BLUR), main: compile(gl, VERT, MAIN) }; }
  catch (error) { console.warn('DuXun GPU renderer unavailable:', error); return null; }
  const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  const texture = (w, h, internal, format, type, data = null) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  };
  const target = (w, h) => {
    const t = texture(w, h, gl.RGBA32F, gl.RGBA, gl.FLOAT);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, fb, w, h };
  };
  const bindTexture = (unit, t, uniform, prog) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(prog.uniforms[uniform], unit); };
  const draw = () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // buildGlowBuffer on the GPU: threshold into a cell grid, then the blur passes. Returns a texture.
  function glow(srcTex, width, height, cell, kind, threshold, radius, region, softness, inT, scratch) {
    const w = Math.ceil(width / cell), h = Math.ceil(height / cell);
    let a = target(w, h), b = target(w, h);
    scratch.push(a, b);
    const th = programs.threshold;
    gl.useProgram(th.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb); gl.viewport(0, 0, w, h);
    bindTexture(0, srcTex, 'src', th);
    gl.uniform2f(th.uniforms.srcSize, width, height);
    gl.uniform1f(th.uniforms.cell, cell); gl.uniform1f(th.uniforms.kind, kind); gl.uniform1f(th.uniforms.threshold, threshold);
    gl.uniform1f(th.uniforms.region, region); gl.uniform1f(th.uniforms.softness, softness); gl.uniform1f(th.uniforms.inT, inT);
    draw();
    const passes = 1 + Math.floor(Math.min(4, Math.max(0, radius * 0.25)));
    const bl = programs.blur;
    gl.useProgram(bl.program);
    gl.uniform2f(bl.uniforms.size, w, h);
    for (let pass = 0; pass < passes; pass++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb); gl.viewport(0, 0, w, h);
      bindTexture(0, a.t, 'buf', bl);
      draw();
      [a, b] = [b, a];
    }
    return { t: a.t, w, h };
  }

  /** Renders RGBA8 `src` (width × height) with params `p`; returns an ImageBitmap, or null if too large. */
  function render(src, width, height, p) {
    if (width > maxSize || height > maxSize) return null;
    const k = prepare(p, width, height);
    canvas.width = width; canvas.height = height;
    const scratch = [];
    const srcTex = texture(width, height, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const lutTex = texture(1025, 1, gl.R32F, gl.RED, gl.FLOAT, k.lut);
    const hal = k.doHalation ? glow(srcTex, width, height, k.glowCell, 0, k.halThreshold, 5 + 38 * k.halRadius, 0, 0, k.inT, scratch) : null;
    const bloom = k.doBloom ? glow(srcTex, width, height, k.glowCell, 1, p.bloomThreshold, 5 + 46 * k.bloomRadius, p.bloomRegion, p.bloomSoftness, k.inT, scratch) : null;

    const values = {
      ...k, printStock: p.printStock, bloomSaveLights: p.bloomSaveLights, bloomDefringe: p.bloomDefringe, bloomDetail: p.bloomDetail,
      hasHalGlow: hal ? 1 : 0, hasBloomGlow: bloom ? 1 : 0, width, height,
      halW: hal?.w ?? 1, halH: hal?.h ?? 1, bloomW: bloom?.w ?? 1, bloomH: bloom?.h ?? 1
    };
    k.matrix.forEach((value, i) => { values[`m${i}`] = value; });
    const u = new Float32Array(K.map(name => Number(values[name]) || 0));
    const main = programs.main;
    gl.useProgram(main.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, width, height);
    bindTexture(0, srcTex, 'src', main);
    bindTexture(1, lutTex, 'lut', main);
    bindTexture(2, hal?.t ?? lutTex, 'halGlow', main);
    bindTexture(3, bloom?.t ?? lutTex, 'bloomGlow', main);
    gl.uniform1fv(main.uniforms['U[0]'] ?? main.uniforms.U, u);
    draw();
    const bitmap = canvas.transferToImageBitmap();
    gl.deleteTexture(srcTex); gl.deleteTexture(lutTex);
    for (const s of scratch) { gl.deleteTexture(s.t); gl.deleteFramebuffer(s.fb); }
    return bitmap;
  }

  /** The canvas's pixels after a render (tests): RGBA8, rows from the top. */
  function renderToPixels(src, width, height, p) {
    const bitmap = render(src, width, height, p);
    if (!bitmap) return null;
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, width, height).data;
  }

  return { render, renderToPixels, maxSize };
}
