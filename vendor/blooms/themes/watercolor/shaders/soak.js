// The paper's side of the watercolor: water creeping through it, pigment
// settling into it and lifting out of it, the tide coming in and going out.
// Run several times a frame.
//
// Water layer:  r water on the surface, g dampness of the paper (0..1),
//               b how firmly the dry pigment here has set (0..1)
// Wet pigment:  amount of each of the sheet's four pigments floating in the water
// Dry pigment:  amount of each bound into the paper: the painting
//
// Everything that creeps is moved as an exchange between neighbouring cells,
// so pigment is never created or lost: what leaves one cell arrives in the next.

export const SOAK = `
in vec2 vUv;
uniform sampler2D uWater;
uniform sampler2D uWet;
uniform sampler2D uDry;
uniform sampler2D uPaper;
uniform sampler2D uMask;
uniform sampler2D uVel;
uniform sampler2D uAround;
uniform ivec2 uSize;
uniform float uDt;
uniform float uTide;         // 1 while the tide is in, 0 while it goes out
uniform float uTideRise;
uniform float uKappa;
uniform float uFilmDry;
uniform float uFilmDamp;
uniform float uFilmPow;
uniform float uClog;
uniform float uKh;
uniform float uTheta;
uniform float uThetaDamp;
uniform float uDiff;
uniform float uEvap;
uniform float uRetain;
uniform float uRetainBias;
uniform float uRetainFloor;
uniform float uRetainBand;
uniform float uEdgeEvap;
uniform float uDampTime;
uniform float uFixTime;
uniform float uUnfixTime;
uniform float uCap;
uniform float uLooseLift;
uniform float uLiftFlow;
uniform float uCalm;
uniform float uFloodSettle;
uniform float uStirLo;
uniform float uStirHi;
uniform float uStainFade;
uniform vec4 uSettle;
uniform vec4 uGran;
uniform vec4 uLift;
uniform vec4 uSpread;
layout(location = 0) out vec4 oWater;
layout(location = 1) out vec4 oWet;
layout(location = 2) out vec4 oDry;

// All eight neighbours, so fronts grow round and not square. The diagonal
// ones are further away and count for half.
const ivec2 NEIGHBOUR[8] = ivec2[8](
  ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1),
  ivec2(1, 1), ivec2(-1, 1), ivec2(1, -1), ivec2(-1, -1));

float sum4(vec4 v) { return v.r + v.g + v.b + v.a; }

// Water that creeps from cell a into its neighbour b in one step.
//  - It runs from the higher surface to the lower (water sits deeper in the
//    paper's hollows).
//  - Dry paper resists: the water needs a head to break into it. Damp paper
//    resists far less, and unevenly, so a front through it ends up lobed.
//  - How fast it moves depends on the thinner of the two films, so deep
//    water levels quickly while a front crawls. Even a dry cell conducts a
//    little, or no front could ever start.
//  - Water thick with pigment moves less easily than clean water.
float flow(float wa, float ha, float wb, float hb, float sb, float tb, float perm, float load) {
  float gate = uTheta * clamp(0.6 + 0.8 * tb, 0.2, 1.8) * (1.0 - sb)
    + uThetaDamp * tb * sb * (1.0 - smoothstep(0.02, 0.15, wb));
  float head = (wa + uKh * ha) - (wb + uKh * hb) - gate;
  if (head <= 0.0) return 0.0;
  float film = clamp(max(min(wa, wb), mix(uFilmDry, uFilmDamp, sb)), 0.0, 1.0);
  float rate = min(uKappa * perm * pow(film, uFilmPow) / (1.0 + uClog * load), 0.15);
  return min(rate * head, 0.13 * wa);
}

void main() {
  ivec2 ic = ivec2(gl_FragCoord.xy);
  vec4 W = texelFetch(uWater, ic, 0);
  vec4 g = texelFetch(uWet, ic, 0);
  vec4 d = texelFetch(uDry, ic, 0);
  vec4 P = texelFetch(uPaper, ic, 0);
  float w = W.r;
  float s = W.g;
  float fix = W.b;
  float h = P.r;

  float dw = 0.0;
  vec4 dg = vec4(0.0);
  float through = 0.0;
  for (int k = 0; k < 8; k++) {
    ivec2 nc = ic + NEIGHBOUR[k];
    if (nc.x < 0 || nc.y < 0 || nc.x >= uSize.x || nc.y >= uSize.y) continue;
    vec4 Wn = texelFetch(uWater, nc, 0);
    float wn = Wn.r;
    if (w <= 0.0 && wn <= 0.0) continue;
    vec4 gn = texelFetch(uWet, nc, 0);
    vec4 Pn = texelFetch(uPaper, nc, 0);
    float share = k < 4 ? 1.0 : 0.5;
    float perm = 0.5 * (P.g + Pn.g);
    float load = 0.5 * (sum4(g) + sum4(gn));

    float fo = share * flow(w, h, wn, Pn.r, Wn.g, Pn.b, perm, load);
    float fi = share * flow(wn, Pn.r, w, h, s, P.b, perm, load);
    dw += fi - fo;
    dg += gn * (fi / max(wn, 1e-4)) - g * (fo / max(w, 1e-4));

    // Pigment also spreads through water that two cells have in common, from
    // the stronger mix to the weaker: the soft bleed of wet into wet.
    float both = min(w, wn);
    if (both > 1e-3) {
      vec4 ci = g / max(w, 1e-3);
      vec4 cn = gn / max(wn, 1e-3);
      dg += share * uDiff * min(perm, 2.0) * both * (cn - ci) * uSpread;
    }
    through += fi + fo;
  }
  w = max(w + dw, 0.0);
  g = max(g + dg, 0.0);

  // Settle and lift, the way a stream handles silt. Still water drops its
  // pigment into the paper, sooner in shallow water and (for granulating
  // pigments) sooner in the hollows. A current picks it back up: easily if it
  // has not yet set, grudgingly once it has, and staining pigments least of
  // all. Pigment down in the hollows is sheltered and mostly stays. In deep
  // water settling is slow, so most of the painting sets as the water thins.
  float speed = length(texture(uVel, vUv).xy);
  float calm = 1.0 / (1.0 + speed * speed / (uCalm * uCalm));
  float stir = smoothstep(uStirLo, uStirHi, speed);
  float valley = 1.0 - h;
  vec4 bias = max(1.0 + uGran * (valley - 0.5) * 1.7, vec4(0.06));
  float thin = 1.0 - smoothstep(0.0, 0.05, w);
  float room = clamp(1.0 - sum4(d) / uCap, 0.0, 1.0);
  float pace = calm * mix(1.0, uFloodSettle, max(uTide, smoothstep(0.3, 0.8, w)));
  vec4 down = g * clamp(uSettle * bias * (uDt / max(w, 0.3)) * room * pace + thin * 300.0 * uDt, 0.0, 1.0);
  float exposed = mix(0.15, 1.0, smoothstep(0.2, 0.8, h));
  vec4 loose = uLooseLift * clamp(uLift * 8.0, 0.25, 1.0);
  vec4 up = d * clamp(mix(loose, uLift, fix) * uDt * stir * exposed * (1.0 + through * uLiftFlow), 0.0, 0.5);
  if (w < 0.05) up = vec4(0.0);
  float before = sum4(d);
  fix *= before / max(before + sum4(down), 1e-5);
  d += down - up;
  g += up - down;

  if (uTide > 0.5) {
    // The tide is in: the whole sheet floods, and stays flooded. The
    // painting underneath slowly gives itself back to the water.
    w += (max(w, 1.0) - w) * (1.0 - exp(-uTideRise * uDt));
    s = 1.0;
    d *= 1.0 - uStainFade * uDt;
    fix = max(fix - uDt / uUnfixTime, 0.0);
  } else {
    // The tide goes out. Water lingers where there is more paint than there
    // is around it, so the wet area shrinks to the shapes the colour made,
    // and each soft cloud gets a hard edge as it dries. The
    // rim of each shape dries fastest; water runs out to replace what is lost
    // there and brings pigment with it, which is what darkens the edge.
    float paint = sum4(g) + sum4(d);
    float around = texture(uAround, vUv).r;
    float linger = uRetain * smoothstep(-uRetainBand, uRetainBand, paint - uRetainBias * around - uRetainFloor);
    float rim = smoothstep(0.25, 0.5, 1.0 - texture(uMask, vUv).r);
    if (w > 0.0) w = max(w - uDt * (uEvap * (0.75 + 0.5 * w) * (1.0 - linger) + uEdgeEvap * rim * min(w, 1.0) * linger), 0.0);
    if (w < 1e-3) {
      d += g;
      g = vec4(0.0);
      w = 0.0;
    }
    s = max(s, smoothstep(0.0, 0.12, w));
    if (w < 0.01) s = max(s - uDt / uDampTime, 0.0);
    if (w < 0.05 && s < 0.35) fix = min(fix + uDt / uFixTime, 1.0);
  }

  oWater = vec4(w, s, fix, 1.0);
  oWet = g;
  oDry = d;
}
`;
