// The living wash: how the water moves. The whole wet sheet is one body of
// fluid. The brush shoves it, it swirls on for many seconds, small curls are
// kept curling, and new paint arriving under the brush pushes old paint
// aside. This is the standard grid fluid solver; it runs on a coarse grid of
// its own, because flow is broad and the paint samples it smoothly.
//
// Flow layer: r,g velocity in paint cells per second; b new volume arriving
// this frame (per second), which the pressure step turns into an outward push.

import { MAX_STAMPS } from './stamp.js';

// The brush drags the water under it, and brings volume with it.
export const PUSH = `
#define MAXS ${MAX_STAMPS}
in vec2 vUv;
uniform sampler2D uVel;
uniform vec2 uSimSize;
uniform int uCount;
uniform vec4 uSeg[MAXS];
uniform vec4 uPush[MAXS];     // velocity.xy, radius, strength
uniform float uSource[MAXS];  // volume arriving, per second
out vec4 o;
void main() {
  vec3 V = texelFetch(uVel, ivec2(gl_FragCoord.xy), 0).rgb;
  vec2 p = vUv * uSimSize;
  for (int i = 0; i < MAXS; i++) {
    if (i >= uCount) break;
    vec2 a = uSeg[i].xy;
    vec2 ab = uSeg[i].zw - a;
    float len2 = dot(ab, ab);
    float t = len2 > 1e-8 ? clamp(dot(p - a, ab) / len2, 0.0, 1.0) : 0.0;
    float dist = length(p - (a + ab * t));
    float r = uPush[i].z;
    float f = exp(-dist * dist / (r * r * 0.7));
    V.xy = mix(V.xy, uPush[i].xy, clamp(f * uPush[i].w, 0.0, 1.0));
    V.z += uSource[i] * f;
  }
  o = vec4(V, 1.0);
}
`;

const FETCH = `
uniform ivec2 uSize;
ivec2 cl(ivec2 c) { return clamp(c, ivec2(0), uSize - 1); }
`;

// How much the water is turning at each point.
export const CURL = `
in vec2 vUv;
uniform sampler2D uVel;
${FETCH}
out vec4 o;
void main() {
  ivec2 ic = ivec2(gl_FragCoord.xy);
  float l = texelFetch(uVel, cl(ic + ivec2(-1, 0)), 0).y;
  float r = texelFetch(uVel, cl(ic + ivec2(1, 0)), 0).y;
  float b = texelFetch(uVel, cl(ic + ivec2(0, -1)), 0).x;
  float t = texelFetch(uVel, cl(ic + ivec2(0, 1)), 0).x;
  o = vec4(0.5 * (r - l - t + b), 0.0, 0.0, 1.0);
}
`;

// Feed each swirl a little, so curls keep curling and do not smear away.
export const VORTICITY = `
in vec2 vUv;
uniform sampler2D uVel;
uniform sampler2D uCurlTex;
uniform float uCurl;
uniform float uDt;
${FETCH}
out vec4 o;
void main() {
  ivec2 ic = ivec2(gl_FragCoord.xy);
  float l = texelFetch(uCurlTex, cl(ic + ivec2(-1, 0)), 0).x;
  float r = texelFetch(uCurlTex, cl(ic + ivec2(1, 0)), 0).x;
  float b = texelFetch(uCurlTex, cl(ic + ivec2(0, -1)), 0).x;
  float t = texelFetch(uCurlTex, cl(ic + ivec2(0, 1)), 0).x;
  float c = texelFetch(uCurlTex, ic, 0).x;
  vec2 force = 0.5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
  force /= length(force) + 1e-4;
  force *= uCurl * c;
  force.y *= -1.0;
  vec3 V = texelFetch(uVel, ic, 0).rgb;
  o = vec4(V.xy + force * uDt, V.z, 1.0);
}
`;

// Where water is piling up or thinning out. The edges of the sheet are
// walls: nothing leaves. New volume under the brush has to go somewhere, so
// the rest of the sheet gives way evenly (uSink): paint is pushed aside, not
// washed off the paper.
export const DIVERGENCE = `
in vec2 vUv;
uniform sampler2D uVel;
uniform float uCell;
uniform float uSink;
${FETCH}
out vec4 o;
void main() {
  ivec2 ic = ivec2(gl_FragCoord.xy);
  vec3 c = texelFetch(uVel, ic, 0).rgb;
  float l = ic.x > 0 ? texelFetch(uVel, ic + ivec2(-1, 0), 0).x : -c.x;
  float r = ic.x < uSize.x - 1 ? texelFetch(uVel, ic + ivec2(1, 0), 0).x : -c.x;
  float b = ic.y > 0 ? texelFetch(uVel, ic + ivec2(0, -1), 0).y : -c.y;
  float t = ic.y < uSize.y - 1 ? texelFetch(uVel, ic + ivec2(0, 1), 0).y : -c.y;
  o = vec4(0.5 * (r - l + t - b) - (c.z - uSink) * uCell, 0.0, 0.0, 1.0);
}
`;

export const JACOBI = `
in vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uDiv;
uniform float uKeep;
${FETCH}
out vec4 o;
float at(ivec2 c) { return texelFetch(uPressure, cl(c), 0).x * uKeep; }
void main() {
  ivec2 ic = ivec2(gl_FragCoord.xy);
  float d = texelFetch(uDiv, ic, 0).x;
  o = vec4((at(ic + ivec2(-1, 0)) + at(ic + ivec2(1, 0)) + at(ic + ivec2(0, -1)) + at(ic + ivec2(0, 1)) - d) * 0.25, 0.0, 0.0, 1.0);
}
`;

export const GRADIENT = `
in vec2 vUv;
uniform sampler2D uVel;
uniform sampler2D uPressure;
${FETCH}
out vec4 o;
float at(ivec2 c) { return texelFetch(uPressure, cl(c), 0).x; }
void main() {
  ivec2 ic = ivec2(gl_FragCoord.xy);
  vec2 grad = 0.5 * vec2(at(ic + ivec2(1, 0)) - at(ic + ivec2(-1, 0)), at(ic + ivec2(0, 1)) - at(ic + ivec2(0, -1)));
  o = vec4(texelFetch(uVel, ic, 0).xy - grad, 0.0, 1.0);
}
`;

// The flow carries itself along, slows, and exists only where there is water.
export const ADVECT_VEL = `
in vec2 vUv;
uniform sampler2D uVel;
uniform sampler2D uWater;
uniform vec2 uTexel;     // one paint cell, in sheet units
uniform float uDt;
uniform float uDrag;
uniform float uMax;
out vec4 o;
void main() {
  vec2 v = texture(uVel, vUv).xy;
  vec2 nv = texture(uVel, vUv - v * uDt * uTexel).xy / (1.0 + uDrag * uDt);
  nv *= smoothstep(0.03, 0.3, texture(uWater, vUv).r);
  float m = length(nv);
  if (m > uMax) nv *= uMax / m;
  o = vec4(nv, 0.0, 1.0);
}
`;

// Floating pigment rides the flow, in two steps so that it stays sharp.
// Carrying paint along a grid blurs it a little every frame, and a wash that
// never stops moving would turn to fog. So the paint is carried forward
// (CARRY), then that result is carried back to see how much the trip
// blurred it, and half of the difference is given back (ADVECT_PAINT).
export const CARRY = `
in vec2 vUv;
uniform sampler2D uVel;
uniform sampler2D uWet;
uniform vec2 uTexel;
uniform float uDt;
out vec4 o;
void main() {
  vec2 v = texture(uVel, vUv).xy;
  o = texture(uWet, vUv - v * uDt * uTexel);
}
`;

// Where nothing moves, nothing is touched, so still paint is never blurred.
export const ADVECT_PAINT = `
in vec2 vUv;
uniform sampler2D uVel;
uniform sampler2D uWater;
uniform sampler2D uWet;
uniform sampler2D uDry;
uniform sampler2D uCarried;
uniform ivec2 uSize;
uniform vec2 uTexel;
uniform float uDt;
layout(location = 0) out vec4 oWater;
layout(location = 1) out vec4 oWet;
layout(location = 2) out vec4 oDry;
vec4 at(ivec2 c) { return texelFetch(uWet, clamp(c, ivec2(0), uSize - 1), 0); }
void main() {
  ivec2 ic = ivec2(gl_FragCoord.xy);
  vec2 v = texture(uVel, vUv).xy;
  vec4 g = texelFetch(uWet, ic, 0);
  if (dot(v, v) > 0.25) {
    vec2 step_ = v * uDt * uTexel;
    vec4 there = texture(uCarried, vUv);
    vec4 back = texture(uCarried, vUv + step_);
    vec4 sharper = there + 0.5 * (g - back);
    // The correction must never invent paint: stay within what was really
    // at the place this paint came from.
    ivec2 i0 = ivec2(floor((vUv - step_) / uTexel - 0.5));
    vec4 a = at(i0), b = at(i0 + ivec2(1, 0)), c = at(i0 + ivec2(0, 1)), e = at(i0 + ivec2(1, 1));
    g = clamp(sharper, min(min(a, b), min(c, e)), max(max(a, b), max(c, e)));
  }
  oWater = texelFetch(uWater, ic, 0);
  oWet = g;
  oDry = texelFetch(uDry, ic, 0);
}
`;

// How much paint there is at each point, wet and dry together, read onto the
// coarse grid. Blurred, it says how much paint there is "around here".
export const PAINT_SUM = `
in vec2 vUv;
uniform sampler2D uWet;
uniform sampler2D uDry;
out vec4 o;
void main() {
  vec4 g = texture(uWet, vUv);
  vec4 d = texture(uDry, vUv);
  o = vec4(g.r + g.g + g.b + g.a + d.r + d.g + d.b + d.a, 0.0, 0.0, 1.0);
}
`;

// A soft blur, one direction per pass. Used for the outline of the wet area
// (the rim of a wash dries faster than its middle, and this is how the rim is
// found) and for the paint around each point.
export const BLUR = `
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uStep;
uniform float uFromWater;
out vec4 o;
void main() {
  float acc = 0.0;
  float tot = 0.0;
  for (int i = -6; i <= 6; i++) {
    float x = float(i);
    float wt = exp(-x * x / 18.0);
    float s = texture(uSrc, vUv + uStep * x).r;
    if (uFromWater > 0.5) s = smoothstep(0.0, 0.06, s);
    acc += s * wt;
    tot += wt;
  }
  o = vec4(acc / tot, 0.0, 0.0, 1.0);
}
`;
