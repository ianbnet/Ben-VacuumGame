// The sheet: rough, cold-pressed watercolor paper, made from a seed.
//
// The same function is drawn twice: once at simulation size (the surface the
// paint feels) and once at screen or export size (the surface you see).
//
//   r  height of the surface, 0 (pit) .. 1 (peak)
//   g  how easily water travels through the paper here
//   b  how reluctant dry paper is to take water here, 0..1
//   a  slow change in the paper's tone, about -1..1

import { NOISE } from './noise.js';

export const PAPER = `
in vec2 vUv;
uniform vec2 uSimSize;
uniform float uBumpPx;
uniform vec2 uSeed;
uniform float uFine;
out vec4 o;
${NOISE}

// Long, thin, slightly wavy threads lying in one direction.
float fibre(vec2 p, float ang, float seed) {
  float c = cos(ang), s = sin(ang);
  vec2 r = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  float wob = gnoise(vec2(r.x * 0.09, seed * 7.0)) * 1.6;
  float n = gnoise(vec2(r.x * 0.04, (r.y + wob) * 0.8) + seed);
  float line = 1.0 - smoothstep(0.0, 0.12, abs(n));
  float sparse = smoothstep(0.1, 0.5, gnoise(r * 0.05 + seed * 3.7));
  return line * sparse;
}

void main() {
  vec2 p = vUv * uSimSize / uBumpPx + uSeed;

  // The marks of the felt: soft, rounded, irregular bumps, a little flattened
  // on top where the press met them.
  vec2 warp = vec2(gnoise(p * 0.5 + 3.1), gnoise(p * 0.5 + 17.7));
  vec2 q = p + warp * 0.35;
  float n = gnoise(q) * 0.72 + gnoise(q * 2.3 + 5.2) * 0.28;
  float soft = clamp(0.5 + 0.55 * n, 0.0, 1.0);
  float bumps = 1.0 - pow(1.0 - soft, 1.3);

  float grain = gnoise(p * 3.3 + 2.0) * 0.6 + gnoise(p * 6.1 + 8.0) * 0.4;
  float threads = fibre(p, 0.35, 1.0) + fibre(p, 1.95, 5.0) + fibre(p, 2.80, 9.0);
  float h = 0.06 + bumps * 0.86 + grain * 0.03 * uFine + threads * 0.05 * uFine;

  float pn = gnoise(p * 0.33 + 31.0) * 0.9 + gnoise(p * 0.9 + 77.0) * 0.6;
  float perm = exp2(pn * 1.6);
  float reluctance = clamp(0.5 + gnoise(p * 0.21 + 50.0) * 0.5 + gnoise(p * 0.6 + 90.0) * 0.3, 0.0, 1.0);
  float tone = gnoise(p * 0.02 + 120.0) * 0.6 + gnoise(p * 0.07 + 150.0) * 0.4;

  o = vec4(clamp(h, 0.0, 1.0), perm, reluctance, tone);
}
`;
