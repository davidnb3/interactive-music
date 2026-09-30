varying vec3  vColor;
varying float vAlpha;

void main() {
  // Soft circular sprite with a bright core and a glowing falloff.
  vec2  uv   = gl_PointCoord - 0.5;
  float d    = length(uv);
  if (d > 0.5) discard;

  float core = smoothstep(0.5, 0.05, d);
  float glow = exp(-d * d * 14.0);
  float a    = (core * 0.55 + glow * 0.65) * vAlpha;

  // Pre‑multiplied colour for additive blending
  gl_FragColor = vec4(vColor * a, a);
}
