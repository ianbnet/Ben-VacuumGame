// The brush touching the wet sheet. Each stamp is a short stretch of a
// stroke (from a to b) or a resting tip.
//
// The brush does not lay paint on top of what is there: it replaces it. New
// paint arrives under the brush and the old is pushed aside by the flow, so
// colours meet edge to edge and do not pile up into mud. A resting tip brings
// clean water in the same way, which is what opens a bloom.

import { NOISE } from './noise.js';

export const MAX_STAMPS = 6;

export const STAMP = `
#define MAXS ${MAX_STAMPS}
in vec2 vUv;
uniform sampler2D uWater;
uniform sampler2D uWet;
uniform sampler2D uDry;
uniform int uCount;
uniform float uGrain;        // 1 on the full-size sheet; keeps edge wobble the same size on smaller ones
uniform vec4 uSeg[MAXS];     // a.xy, b.xy in paint cells
uniform vec4 uShape[MAXS];   // radius, strength of replacement, seed, streakiness
uniform vec4 uAmount[MAXS];  // edge roughness, resting tip (1) or moving stroke (0)
uniform vec4 uPig[MAXS];     // the paint on the brush, per pigment
layout(location = 0) out vec4 oWater;
layout(location = 1) out vec4 oWet;
layout(location = 2) out vec4 oDry;
${NOISE}

void main() {
  ivec2 ic = ivec2(gl_FragCoord.xy);
  vec2 p = gl_FragCoord.xy;
  vec2 q = p * uGrain;
  vec4 W = texelFetch(uWater, ic, 0);
  vec4 g = texelFetch(uWet, ic, 0);

  for (int i = 0; i < MAXS; i++) {
    if (i >= uCount) break;
    vec2 a = uSeg[i].xy;
    vec2 b = uSeg[i].zw;
    float r = uShape[i].x;
    float seed = uShape[i].z;
    float streakAmt = uShape[i].w;
    bool resting = uAmount[i].y > 0.5;

    vec2 ab = b - a;
    float len2 = dot(ab, ab);
    bool moving = len2 > 1e-8;
    float len = sqrt(len2);
    vec2 dir = moving ? ab / len : vec2(1.0, 0.0);
    vec2 rel = p - a;
    float along = dot(rel, dir);
    float side = dot(rel, vec2(-dir.y, dir.x));
    float dist = length(rel - dir * clamp(along, 0.0, len));
    if (dist > r * 1.7) continue;

    // How far the brush reaches at this spot. The edge is not a clean
    // line: it wanders, in curves broader than a cell so it never looks stepped.
    float shape = 1.0 - dist / r;
    float wander = gnoise(q * 0.055 + seed) * 0.65 + gnoise(q * 0.14 + seed * 1.7) * 0.35;
    float reach = r * max(1.0 + wander * uAmount[i].x, 0.2);
    float mask = smoothstep(0.0, 2.0, reach - dist);

    // The share of one full pass of the brush that this stretch of the
    // stroke makes here. Summed along a stroke it comes to exactly one pass,
    // even across the whole width of the brush, whatever the speed.
    float weight = 1.0;
    if (moving) {
      float halfChord = sqrt(max(reach * reach - side * side, 1e-4));
      weight = (asin(clamp((len - along) / halfChord, -1.0, 1.0))
        - asin(clamp(-along / halfChord, -1.0, 1.0))) / 3.14159265;
    } else if (resting) {
      weight = smoothstep(0.0, 0.6, shape + wander * 0.2);
    }

    // Bristles leave streaks along the direction of travel.
    float streak = 1.0;
    if (moving) {
      float sr = side / r;
      streak = 1.0 + gnoise(vec2(sr * 4.5, seed * 3.0)) * 0.8 + gnoise(vec2(sr * 11.0, seed * 5.0)) * 0.5;
      streak = clamp(streak, 0.0, 2.0);
    }
    float uneven = 0.85 + 0.3 * gnoise(q * 0.035 + seed * 9.0);

    float swap = 1.0 - exp(-uShape[i].y * mask * weight);
    g = mix(g, uPig[i] * uneven * mix(1.0, streak, streakAmt * 0.6), swap);

    float touched = mask * step(1e-4, weight);
    W.r = max(W.r, touched);
    W.g = max(W.g, touched);
  }

  oWater = W;
  oWet = g;
  oDry = texelFetch(uDry, ic, 0);
}
`;
