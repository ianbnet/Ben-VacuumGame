// Turning the layers into a picture: paper, then pigment as transparent
// glazes over it, then light across the paper's relief, then the shine of
// whatever is still wet. Works at any output size.

import { NOISE } from './noise.js';

export const COMPOSITE = `
in vec2 vUv;
uniform sampler2D uPaperHi;
uniform sampler2D uWater;
uniform sampler2D uWet;
uniform sampler2D uDry;
uniform vec2 uSimSize;
uniform vec2 uHiSize;
uniform float uScale;        // output px per simulation px
uniform vec3 uK[4];          // what each pigment absorbs (red, green, blue)
uniform vec4 uGran;
uniform vec3 uTint;
uniform float uRelief;
uniform float uCavity;
uniform float uSheen;
uniform float uGloss;
uniform float uGranDetail;
uniform float uOpticalCap;
uniform int uDebug;
out vec4 o;
${NOISE}

// Smooth (bicubic) reading of a simulation layer, so paint never shows cells.
vec4 cubic(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  float w = 6.0 - x - y - z;
  return vec4(x, y, z, w) * (1.0 / 6.0);
}

vec4 smooth4(sampler2D tex, vec2 uv) {
  vec2 inv = 1.0 / uSimSize;
  vec2 tc = uv * uSimSize - 0.5;
  vec2 f = fract(tc);
  tc -= f;
  vec4 xc = cubic(f.x);
  vec4 yc = cubic(f.y);
  vec4 c = tc.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 off = (c + vec4(xc.yw, yc.yw) / s) * inv.xxyy;
  vec4 s0 = texture(tex, off.xz);
  vec4 s1 = texture(tex, off.yz);
  vec4 s2 = texture(tex, off.xw);
  vec4 s3 = texture(tex, off.yw);
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}

vec3 toScreen(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 px = 1.0 / uHiSize;
  vec4 P = texture(uPaperHi, vUv);
  float h = P.r;
  float hx = texture(uPaperHi, vUv + vec2(px.x, 0.0)).r - texture(uPaperHi, vUv - vec2(px.x, 0.0)).r;
  float hy = texture(uPaperHi, vUv + vec2(0.0, px.y)).r - texture(uPaperHi, vUv - vec2(0.0, px.y)).r;
  vec2 slope = vec2(hx, hy) * 0.5 * uScale;

  vec4 W = smooth4(uWater, vUv);
  vec4 wet = max(smooth4(uWet, vUv), 0.0);
  vec4 dry = max(smooth4(uDry, vUv), 0.0);
  float water = max(W.r, 0.0);
  float wetness = smoothstep(0.0, 0.22, water);
  float damp = clamp(W.g, 0.0, 1.0);

  // Granulating pigment lies in the hollows of the paper.
  vec4 hollow = clamp(1.0 + uGran * (0.55 - h) * uGranDetail, 0.25, 2.2);
  vec4 dens = dry * hollow + wet;

  // However much is painted, the paper still glows through.
  float total = dens.r + dens.g + dens.b + dens.a;
  dens *= uOpticalCap * (1.0 - exp(-total / uOpticalCap)) / max(total, 1e-5);

  // Glazing: each pigment removes light. Layers multiply, like stained glass.
  vec3 absorb = dens.r * uK[0] + dens.g * uK[1] + dens.b * uK[2] + dens.a * uK[3];
  absorb *= 1.0 + 0.20 * wetness + 0.06 * damp;   // wet paint is deeper; it lightens as it dries

  vec3 paper = uTint * (1.0 + P.a * 0.02);
  paper *= 1.0 - 0.035 * damp - 0.02 * wetness;
  vec3 col = paper * exp(-absorb);

  // Light from the upper left, low, so the tooth reads as relief.
  vec3 n = normalize(vec3(-slope * uRelief, 1.0));
  vec3 L = normalize(vec3(-0.52, 0.62, 0.58));
  col *= dot(n, L) / L.z;
  col *= 1.0 - uCavity * (1.0 - h);
  col *= 1.0 + 0.03 * dot(vUv - 0.5, vec2(-1.0, 1.0));

  // Shine. Deep water fills the hollows and lies flat; a thin film follows
  // the paper and glints on the slopes that face the light.
  float fill = smoothstep(0.1, 1.2, water);
  vec3 nw = normalize(vec3(-slope * uRelief * 2.0 * (1.0 - 0.7 * fill), 1.0));
  vec3 half_ = normalize(vec3(-0.28, 0.34, 1.0));
  float spec = pow(max(dot(nw, half_), 0.0), uGloss);
  col += vec3(1.0, 0.98, 0.94) * spec * uSheen * wetness;

  if (uDebug == 1) col = vec3(water * 0.5, damp, W.b);
  if (uDebug == 2) col = vec3(h);
  if (uDebug == 3) col = vec3(wet.r + wet.g + wet.b + wet.a, dry.r + dry.g + dry.b + dry.a, 0.0) * 0.5;

  vec3 outc = toScreen(col);
  // A whisper of noise so soft washes never show bands.
  float dither = hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 71.7) - 1.0;
  o = vec4(outc + dither / 255.0, 1.0);
}
`;
