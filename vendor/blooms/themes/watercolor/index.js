// The watercolor theme in its Tide mode: a living wash over rough paper.
//
// While you paint, the whole sheet is flooded and the colour moves like
// water: shoved by the brush, swirling on, pushed aside by new paint. When
// you stop, the tide goes out: clean water leaves, the wet area shrinks to
// the shapes the colour made, and they set into the paper with dark rims
// and grain. Touch it again and the tide comes back in over the painting.
//
// One instance is one sheet.

import { createProgram, createTarget, createDouble, disposeTarget, runPass } from '../../gl.js';
import { params, quality } from './params.js';
import { paletteFor } from './pigments.js';
import { createBrush } from './brush.js';
import { PAPER } from './shaders/paper.js';
import { STAMP, MAX_STAMPS } from './shaders/stamp.js';
import { PUSH, CURL, VORTICITY, DIVERGENCE, JACOBI, GRADIENT, ADVECT_VEL, CARRY, ADVECT_PAINT, PAINT_SUM, BLUR } from './shaders/flow.js';
import { SOAK } from './shaders/soak.js';
import { COMPOSITE } from './shaders/composite.js';

const FULL = 1440; // the sheet size the constants in params.js were written for
const compiled = new WeakMap();

function programsFor(gl) {
  let p = compiled.get(gl);
  if (!p) {
    p = {
      paper: createProgram(gl, PAPER, 'paper'),
      stamp: createProgram(gl, STAMP, 'stamp'),
      push: createProgram(gl, PUSH, 'push'),
      curl: createProgram(gl, CURL, 'curl'),
      vorticity: createProgram(gl, VORTICITY, 'vorticity'),
      divergence: createProgram(gl, DIVERGENCE, 'divergence'),
      jacobi: createProgram(gl, JACOBI, 'jacobi'),
      gradient: createProgram(gl, GRADIENT, 'gradient'),
      advectVel: createProgram(gl, ADVECT_VEL, 'advect-vel'),
      carry: createProgram(gl, CARRY, 'carry'),
      advectPaint: createProgram(gl, ADVECT_PAINT, 'advect-paint'),
      paintSum: createProgram(gl, PAINT_SUM, 'paint-sum'),
      blur: createProgram(gl, BLUR, 'blur'),
      soak: createProgram(gl, SOAK, 'soak'),
      composite: createProgram(gl, COMPOSITE, 'composite'),
    };
    compiled.set(gl, p);
  }
  return p;
}

const toLinear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

function create(ctx, opts) {
  const { gl, formats } = ctx;
  const P = programsFor(gl);
  const q = { ...quality[0], ...(opts.quality || {}) };

  const long = q.simLong;
  const scale = long / FULL;
  const simW = opts.aspect >= 1 ? long : Math.max(16, Math.round(long * opts.aspect));
  const simH = opts.aspect >= 1 ? Math.max(16, Math.round(long / opts.aspect)) : long;
  const short = Math.min(simW, simH);
  const size = [simW, simH];
  const texel = [1 / simW, 1 / simH];
  const velW = Math.max(8, Math.round(simW * q.velLong / long));
  const velH = Math.max(8, Math.round(simH * q.velLong / long));
  const velSize = [velW, velH];
  const cell = simW / velW; // paint cells across one flow cell
  const seed = [
    (opts.seed % 997) * 0.731 + 13.7,
    (Math.floor(opts.seed / 997) % 997) * 0.917 + 71.3,
  ];
  const palette = paletteFor(opts.sheetNumber || 0);
  const brush = createBrush(params);

  // Water, wet pigment and dry pigment are always updated together.
  const paint = createDouble(gl, formats.hi, simW, simH, 3);
  const maskA = createTarget(gl, formats.lo, simW, simH);
  const maskB = createTarget(gl, formats.lo, simW, simH);
  const paperSim = createTarget(gl, formats.lo, simW, simH);
  const carried = createTarget(gl, formats.hi, simW, simH);
  // The flow lives on its own coarse grid.
  const vel = createDouble(gl, formats.lo, velW, velH);
  const pressure = createDouble(gl, formats.lo, velW, velH);
  const div = createTarget(gl, formats.lo, velW, velH);
  const curl = createTarget(gl, formats.lo, velW, velH);
  const aroundA = createTarget(gl, formats.lo, velW, velH);
  const aroundB = createTarget(gl, formats.lo, velW, velH);
  let paperHi = null;

  let time = 0;
  let lastInput = -1e9;
  let sink = 0; // volume arriving under the brush this frame, spread over the sheet (per second)
  let touched = false;
  // The opening drop: 0 waiting, 1 paint is arriving, 2 water is arriving, 3 over.
  let invite = opts.reducedMotion ? 3 : 0;
  let inviteAt = 0;
  const inviteSpot = [simW * (0.5 + (Math.random() - 0.5) * 0.12), simH * (0.52 + (Math.random() - 0.5) * 0.1)];

  function renderPaper(target, fine) {
    runPass(gl, P.paper, target, { uSimSize: size, uBumpPx: params.bumpPx * scale, uSeed: seed, uFine: fine });
  }
  renderPaper(paperSim, 0.5);

  function applyStamps(stamps) {
    const n = Math.min(stamps.length, MAX_STAMPS);
    const seg = new Float32Array(MAX_STAMPS * 4);
    const shape = new Float32Array(MAX_STAMPS * 4);
    const amount = new Float32Array(MAX_STAMPS * 4);
    const pig = new Float32Array(MAX_STAMPS * 4);
    const push = new Float32Array(MAX_STAMPS * 4);
    const source = new Float32Array(MAX_STAMPS);
    for (let i = 0; i < n; i++) {
      const s = stamps[i];
      seg.set([s.ax, s.ay, s.bx, s.by], i * 4);
      shape.set([s.r, s.replace, s.seed, s.streak], i * 4);
      amount.set([s.rough, s.resting, 0, 0], i * 4);
      pig.set(s.pig, i * 4);
      push.set([s.vx, s.vy, s.pushR, s.push], i * 4);
      source[i] = s.source;
      // the push falls off as a bell around the stroke; this is its area
      const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
      sink += s.source * (0.7 * Math.PI * s.pushR * s.pushR + len * s.pushR * Math.sqrt(0.7 * Math.PI)) / (simW * simH);
    }
    const [water, wet, dry] = paint.read.textures;
    runPass(gl, P.stamp, paint.write, {
      uWater: water, uWet: wet, uDry: dry,
      uCount: n, uGrain: 1 / scale, uSeg: seg, uShape: shape, uAmount: amount, uPig: pig,
    });
    paint.swap();
    runPass(gl, P.push, vel.write, {
      uVel: vel.read.tex, uSimSize: size, uCount: n, uSeg: seg, uPush: push, uSource: source,
    });
    vel.swap();
    lastInput = time;
  }

  // The water moves: swirls are fed, new volume pushes outward, the flow
  // carries itself and the floating pigment along, and slowly dies down.
  function flow(dt) {
    // Once the brush lifts, the water calms: swirls stop being fed and drag
    // grows, so what sets is close to what you last saw.
    const t = Math.min(Math.max((time - lastInput - params.calmFrom) / (params.calmBy - params.calmFrom), 0), 1);
    const calming = t * t * (3 - 2 * t);
    runPass(gl, P.curl, curl, { uVel: vel.read.tex, uSize: velSize });
    runPass(gl, P.vorticity, vel.write, {
      uVel: vel.read.tex, uCurlTex: curl.tex, uSize: velSize,
      uCurl: params.curl * (1 - calming) * q.velLong / 320, uDt: dt,
    });
    vel.swap();
    runPass(gl, P.divergence, div, { uVel: vel.read.tex, uCell: cell, uSink: sink, uSize: velSize });
    sink = 0;
    for (let i = 0; i < q.jacobi; i++) {
      runPass(gl, P.jacobi, pressure.write, {
        uPressure: pressure.read.tex, uDiv: div.tex, uSize: velSize,
        uKeep: i === 0 ? params.pressureKeep : 1,
      });
      pressure.swap();
    }
    runPass(gl, P.gradient, vel.write, { uVel: vel.read.tex, uPressure: pressure.read.tex, uSize: velSize });
    vel.swap();
    runPass(gl, P.advectVel, vel.write, {
      uVel: vel.read.tex, uWater: paint.read.textures[0], uTexel: texel, uDt: dt,
      uDrag: params.velDrag + params.calmDrag * calming, uMax: params.velMax * scale,
    });
    vel.swap();
    const [water, wet, dry] = paint.read.textures;
    runPass(gl, P.carry, carried, { uVel: vel.read.tex, uWet: wet, uTexel: texel, uDt: dt });
    runPass(gl, P.advectPaint, paint.write, {
      uVel: vel.read.tex, uWater: water, uWet: wet, uDry: dry, uCarried: carried.tex,
      uSize: size, uTexel: texel, uDt: dt,
    });
    paint.swap();
  }

  // The paper's side: settling and lifting, and the tide coming in or going out.
  function soak(dt, tideIn) {
    if (!tideIn) {
      runPass(gl, P.blur, maskA, { uSrc: paint.read.textures[0], uStep: [texel[0], 0], uFromWater: 1 });
      runPass(gl, P.blur, maskB, { uSrc: maskA.tex, uStep: [0, texel[1]], uFromWater: 0 });
      // how much paint lies around each point: water lingers where there is more than that
      const reach = params.aroundReach * short / cell / 6;
      runPass(gl, P.paintSum, aroundA, { uWet: paint.read.textures[1], uDry: paint.read.textures[2] });
      runPass(gl, P.blur, aroundB, { uSrc: aroundA.tex, uStep: [reach / velW, 0], uFromWater: 0 });
      runPass(gl, P.blur, aroundA, { uSrc: aroundB.tex, uStep: [0, reach / velH], uFromWater: 0 });
    }
    const rounds = tideIn ? q.floodRounds : q.ebbRounds;
    const sub = dt / rounds;
    for (let i = 0; i < rounds; i++) {
      const [water, wet, dry] = paint.read.textures;
      runPass(gl, P.soak, paint.write, {
        uWater: water, uWet: wet, uDry: dry, uPaper: paperSim.tex, uMask: maskB.tex, uAround: aroundA.tex, uVel: vel.read.tex,
        uSize: size, uDt: sub,
        uTide: tideIn ? 1 : 0, uTideRise: params.tideRise,
        uKappa: params.kappa, uFilmDry: params.filmDry, uFilmDamp: params.filmDamp,
        uFilmPow: params.filmPow, uClog: params.clog,
        uKh: params.kh, uTheta: params.theta, uThetaDamp: params.thetaDamp,
        uDiff: params.diffuse * scale * scale * sub,
        uEvap: params.ebbEvap, uRetain: params.retain, uRetainBias: params.retainBias, uRetainFloor: params.retainFloor, uRetainBand: params.retainBand, uEdgeEvap: params.edgeEvap,
        uDampTime: params.dampTime, uFixTime: params.fixTime, uUnfixTime: params.unfixTime,
        uCap: params.capacity, uLooseLift: params.looseLift, uLiftFlow: params.liftFlow,
        uCalm: params.calmSpeed * scale, uFloodSettle: params.floodSettle,
        uStirLo: params.stirLo * scale, uStirHi: params.stirHi * scale,
        uStainFade: 1 / params.stainFade,
        uSettle: palette.settle, uGran: palette.gran, uLift: palette.lift, uSpread: palette.spread,
      });
      paint.swap();
    }
  }

  // A tip resting at a point: paint arriving (pig) or clean water (no pig).
  function tip(x, y, r, pig, strength, source, vx = 0, vy = 0) {
    return {
      ax: x, ay: y, bx: x, by: y, r, seed: 7.3, streak: 0, replace: strength, rough: 0.3, resting: 1,
      pig, vx, vy, push: vx || vy ? 0.3 : 0, pushR: r * 1.3, source,
    };
  }

  // On a blank sheet left alone, one drop of colour arrives, drifts, and is
  // opened by a drop of water: the whole tutorial. Any touch cancels it.
  function invitation(dt, stamps) {
    if (invite === 3) return;
    if (touched) {
      invite = 3;
      return;
    }
    const [x, y] = inviteSpot;
    if (invite === 0 && time >= 4) {
      invite = 1;
      inviteAt = time;
    }
    if (invite === 1) {
      if (time < inviteAt + 1.6) {
        stamps.push(tip(x, y, 0.03 * short, [0.66, 0, 0, 0], 6 * dt, 3.2, 34 * scale, 14 * scale));
      } else if (time >= inviteAt + 3.6) {
        invite = 2;
        inviteAt = time;
      }
    } else if (invite === 2) {
      if (time < inviteAt + 1.3) {
        stamps.push(tip(x + 0.03 * short, y - 0.012 * short, params.holdR * short, [0, 0, 0, 0],
          params.replaceHold * dt, params.sourceHold));
      } else {
        invite = 3;
      }
    }
  }

  function step(dt, pointers) {
    const stamps = brush.update(dt, pointers, short, scale);
    if (stamps.length) touched = true;
    invitation(dt, stamps);
    if (stamps.length) applyStamps(stamps);
    const since = time - lastInput;
    if (since < params.flowTail) flow(dt);
    if (since < params.restAfter + 2) soak(dt, since < params.tideHold);
    time += dt;
  }

  function hiPaper(width, height) {
    const t = createTarget(gl, formats.lo, width, height);
    renderPaper(t, 1);
    return t;
  }

  // Paint the picture at any size. `target` null is the screen.
  function draw(target, out) {
    let hi;
    if (target === null) {
      if (!paperHi || paperHi.width !== out.width || paperHi.height !== out.height) {
        if (paperHi) disposeTarget(gl, paperHi);
        paperHi = hiPaper(out.width, out.height);
      }
      hi = paperHi;
    } else {
      hi = hiPaper(out.width, out.height);
    }
    const [water, wet, dry] = paint.read.textures;
    runPass(gl, P.composite, target, {
      uPaperHi: hi.tex, uWater: water, uWet: wet, uDry: dry,
      uSimSize: size, uHiSize: [out.width, out.height], uScale: out.width / simW,
      uK: palette.k, uGran: palette.gran, uTint: params.paperTint.map(toLinear),
      uRelief: params.relief * scale, uCavity: params.cavity, uSheen: params.sheen, uGloss: params.gloss,
      uGranDetail: params.granDetail, uOpticalCap: params.opticalCap, uDebug: params.debug,
    });
    if (hi !== paperHi) disposeTarget(gl, hi);
  }

  return {
    step,
    draw,
    // True when the tide is out, the paint has set and nothing is about to happen.
    isAtRest() {
      return invite === 3 && time - lastInput > params.restAfter;
    },
    dispose() {
      paint.dispose();
      vel.dispose();
      pressure.dispose();
      for (const t of [div, curl, aroundA, aroundB, maskA, maskB, paperSim, carried]) disposeTarget(gl, t);
      if (paperHi) disposeTarget(gl, paperHi);
    },
    // True until a hand has touched it; the opening drop does not count.
    get untouched() { return !touched; },
    // Run whole frames of real work, for the core to time on this device.
    bench(frames, out) {
      const mid = [simW * 0.5, simH * 0.5];
      for (let i = 0; i < frames; i++) {
        applyStamps([{
          ax: mid[0] - 20 * scale, ay: mid[1], bx: mid[0] + 20 * scale, by: mid[1], r: 0.04 * short,
          seed: 1, streak: 0.3, replace: 2, rough: 0.25, resting: 0, pig: [0.5, 0, 0, 0],
          vx: 200 * scale, vy: 60 * scale, push: 1, pushR: 0.06 * short, source: 3,
        }]);
        flow(1 / 60);
        soak(1 / 60, i % 2 === 0);
        draw(null, out);
      }
    },
    // Read raw numbers out of a paint layer (0 water, 1 wet pigment, 2 dry
    // pigment), in paint cells from the bottom-left. For tuning.
    read(layer, x, y, w, h) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, paint.read.fbo);
      gl.readBuffer(gl.COLOR_ATTACHMENT0 + layer);
      const out = new Float32Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.FLOAT, out);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      return out;
    },
    // For tuning and tests.
    params,
    palette,
    info: { simW, simH, velW, velH, format: formats.hi.name },
    get time() { return time; },
    get tideIn() { return time - lastInput < params.tideHold; },
  };
}

export default {
  id: 'watercolor',
  name: 'Watercolor',
  mode: 'tide', // two more modes are planned: a flooded sheet and a marbling tray
  sound: null,  // reserved: each theme will carry its own sound
  quality,
  create,
};
