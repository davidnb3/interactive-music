// ───────────────────────────────────────────────────────────────────────────
//  Audio‑reactive morphing particle vertex shader
//
//  position         → current shape (attribute set by Three.js)
//  aTargetPosition  → next shape in the scroll order
//  uMorph  (0..1)   → how far we've morphed from `position` to `aTargetPosition`
//  uBass / uMid / uTreble / uEnergy / uBeat → real‑time Web Audio levels (0..~1)
// ───────────────────────────────────────────────────────────────────────────

uniform float uTime;
uniform float uMorph;
uniform float uPixelRatio;

uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnergy;
uniform float uBeat;

// Per‑shape tuning, interpolated on the CPU while morphing
uniform float uSpin;
uniform vec3  uSpinAxis;
uniform float uNoiseAmp;
uniform float uRadialAmp;
uniform vec3  uDispDir;
uniform float uDirBias;
uniform float uPointScale;

uniform vec3 uColorA; // teal
uniform vec3 uColorB; // indigo / blue
uniform vec3 uColorC; // violet
uniform vec3 uColorD; // orange accent

attribute vec3 aTargetPosition;
attribute vec3 aRandom;

varying vec3  vColor;
varying float vAlpha;

#define PI 3.14159265359

// ── Simplex 3D noise (Ashima Arts / Stefan Gustavson, MIT) ─────────────────
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j  = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Rodrigues rotation about an arbitrary (normalised) axis
mat3 rotateAxis(vec3 axis, float a) {
  axis = normalize(axis);
  float s = sin(a), c = cos(a), oc = 1.0 - c;
  return mat3(
    oc * axis.x * axis.x + c,          oc * axis.x * axis.y + axis.z * s, oc * axis.z * axis.x - axis.y * s,
    oc * axis.x * axis.y - axis.z * s, oc * axis.y * axis.y + c,          oc * axis.y * axis.z + axis.x * s,
    oc * axis.z * axis.x + axis.y * s, oc * axis.y * axis.z - axis.x * s, oc * axis.z * axis.z + c
  );
}

// Colour bands: ~45 % teal, ~30 % blue→violet, ~25 % warm orange.
vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(uColorA, uColorB, smoothstep(0.30, 0.50, t));
  c = mix(c, uColorC, smoothstep(0.55, 0.72, t));
  c = mix(c, uColorD, smoothstep(0.74, 0.86, t));
  return c;
}

void main() {
  // ── 1. Morph between shapes ─────────────────────────────────────────────
  // Each particle starts its journey at a slightly different time so the
  // transition feels organic instead of a rigid linear blend.
  float stagger  = aRandom.x * 0.35;
  float localT   = clamp((uMorph - stagger) / (1.0 - 0.35), 0.0, 1.0);
  float eased    = localT * localT * (3.0 - 2.0 * localT); // smoothstep

  vec3 basePos = mix(position, aTargetPosition, eased);

  // Arc outward mid‑transition so particles don't pass straight through the core.
  vec3 safeDir = normalize(basePos + vec3(0.0001, 0.0002, 0.0003));
  basePos += safeDir * sin(eased * PI) * (0.35 + aRandom.y * 0.9);

  // ── 2. Continuous rotation (per‑shape spin speed & axis) ────────────────
  basePos = rotateAxis(uSpinAxis, uTime * uSpin) * basePos;

  // ── 3. Audio‑reactive deformation ───────────────────────────────────────
  float t = uTime;

  // Low‑frequency noise → large, slow bulges driven by bass
  float nLow  = snoise(basePos * 0.45 + vec3(0.0, t * 0.18, 0.0));
  // Mid‑frequency noise → ripples driven by mids
  float nMid  = snoise(basePos * 1.6  + vec3(t * 0.35, 0.0, -t * 0.2));

  // Displacement direction: radial for orbs/rings, surface normal for terrain.
  vec3 radialDir = normalize(basePos + vec3(0.0001));
  vec3 dir       = normalize(mix(radialDir, normalize(uDispDir), uDirBias));

  float bassPush = uBass   * uRadialAmp * (0.55 + 0.45 * nLow);
  float midWave  = uMid    * uNoiseAmp  * nMid;
  float beatPush = uBeat   * 0.35 * (0.5 + 0.5 * aRandom.y);

  vec3 displaced = basePos + dir * (bassPush + midWave + beatPush);

  // Gentle ambient curl so the field is never static, even in silence.
  vec3 drift = vec3(
    snoise(basePos * 0.30 + vec3(t * 0.10,  0.0,  0.0)),
    snoise(basePos * 0.30 + vec3(0.0, t * 0.10 + 7.3, 0.0)),
    snoise(basePos * 0.30 + vec3(0.0,  0.0, t * 0.10 + 13.1))
  );
  displaced += drift * (0.10 + uEnergy * 0.25);

  // Treble → high‑frequency shimmer/jitter on individual particles
  float shimmer = sin(t * 24.0 + aRandom.z * 120.0) * uTreble * 0.12;
  displaced += (aRandom - 0.5) * shimmer;

  // ── 4. Project ──────────────────────────────────────────────────────────
  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position     = projectionMatrix * mvPosition;

  float sizeVar   = 0.55 + aRandom.z * 0.9;
  float audioSize = 1.0 + uTreble * 0.45 + uBass * 0.2 + uBeat * 0.3;
  float size      = uPointScale * sizeVar * audioSize;
  gl_PointSize    = size * uPixelRatio * (26.0 / max(-mvPosition.z, 0.1));

  // ── 5. Colour ───────────────────────────────────────────────────────────
  // Colour is chosen from noise + per‑particle randomness, then pushed toward
  // the warm orange accent on treble hits.
  // Spatially coherent: nearby particles share a hue region via the noise term.
  float colourT = clamp(aRandom.x + nLow * 0.22 + sin(t * 0.07 + aRandom.y * 6.28) * 0.06, 0.0, 1.0);
  colourT = mix(colourT, 0.85, uTreble * 0.4 * step(0.5, aRandom.y));
  vColor = palette(colourT);

  // Brighten the whole system with energy; fade far‑away particles.
  float depthFade = smoothstep(18.0, 5.0, -mvPosition.z);
  vAlpha = (0.4 + 0.6 * aRandom.z) * depthFade * (0.65 + uEnergy * 0.3 + uBeat * 0.25);
}
