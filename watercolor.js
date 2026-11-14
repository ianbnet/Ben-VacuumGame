// The watercolor floor of a painted room (level six).
//
// This is Blooms' own watercolor engine, copied unchanged into vendor/blooms/,
// run on a hidden canvas the size of the room's floor. The game moves a brush
// under the vacuum (paint.js); the engine floods the sheet, carries the colour
// on moving water and lets it set into the paper when the vacuum rests. Both
// views then show this canvas as the floor.
//
// The engine needs WebGL2 with float layers. Where a device cannot give it
// those, `wcEngine.create` returns null and paint.js paints a plain wash.

import { createContext } from './vendor/blooms/gl.js';
import watercolor from './vendor/blooms/themes/watercolor/index.js';
import { palettes } from './vendor/blooms/themes/watercolor/pigments.js';
import { params } from './vendor/blooms/themes/watercolor/params.js';

// What a frame of paint may cost while the game also draws the room.
const FRAME_BUDGET_MS = 6;

// Blooms is tuned for a hand; these retune it for a vacuum. A tile is 1/12 of
// the sheet's short edge, and the vacuum crosses one in about a tenth of a
// second, which a hand would call a brisk stroke.
Object.assign(params, {
  rSlow: 0.047,        // the ribbon stays about a tile wide,
  rFast: 0.036,        // whatever the pace
  speedSlow: 0.3,
  speedFast: 2.4,
  pigSlow: 0.56,
  pigFast: 0.46,
  loadFloor: 0.2,      // a tired brush still leaves a mark
  // A room is narrow corridors, and the colour has to stay on the path that laid it.
  // Blooms lets a stroke drag the wash several brush-widths along with it; down a long
  // corridor that carried the whole ribbon to wherever the vacuum stopped. So the vacuum
  // shoves the water far less and the motion dies quickly (the drift is the first
  // divided by the second), while new paint still pushes old paint aside and small
  // swirls still curl, which is where the soft, uneven edges come from.
  velGain: 0.15,
  velDrag: 1.2,
  sourceMove: 1.4,
  pushRadius: 1.25,
  curl: 14,
  // The vacuum hardly ever stops, so the tide is nearly always in. Paint has to set
  // while flooded, and stay set under a passing current, or nothing lasts the room.
  floodSettle: 0.6,
  looseLift: 0.5,
  stirLo: 50,
  stirHi: 320,
  stainFade: 1500,
  tideHold: 3.2,       // the tide goes out sooner, so the shine fades between trips
  restAfter: 26,
});

let shared = null;   // { canvas, ctx, lost } once a context exists
let broken = false;  // the device could not run the engine; do not keep trying
let row = -1;        // the quality row this device carries

function context(width, height) {
  if (shared && !shared.lost) {
    if (shared.canvas.width !== width || shared.canvas.height !== height) {
      shared.canvas.width = width;
      shared.canvas.height = height;
    }
    return shared;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  // The picture must still be on the canvas after the frame that drew it, because
  // the game copies it later; asking first fixes the context's settings.
  canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance',
  });
  const ctx = createContext(canvas);
  if (!ctx) return null;
  const made = { canvas, ctx, lost: false };
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    made.lost = true; // a phone may take the context away; the next sheet starts a new one
  });
  shared = made;
  row = -1;
  return made;
}

// The richest simulation this device carries beside the game, timed on real frames.
function chooseRow(ctx, aspect, out, phone) {
  const rows = watercolor.quality;
  const { gl } = ctx;
  const px = new Uint8Array(4);
  const finish = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // waits for the graphics card
  };
  let index = phone ? 3 : 1;
  for (; index < rows.length; index++) {
    const trial = watercolor.create(ctx, { aspect, seed: 1, sheetNumber: 0, reducedMotion: true, quality: rows[index] });
    trial.bench(2, out); // the first frames pay for compiling and allocating
    finish();
    const t0 = performance.now();
    trial.bench(5, out);
    finish();
    const ms = (performance.now() - t0) / 5;
    trial.dispose();
    if (ms <= FRAME_BUDGET_MS || index === rows.length - 1) break;
  }
  return index;
}

// One sheet of paper for one attempt at the room.
//   aspect   width over height of the floor
//   palette  which of Blooms' palettes (any whole number; it wraps)
//   seed     the paper's grain
//   phone    start from a lighter simulation
function create({ aspect, palette = 0, seed = 1, phone = false }) {
  if (broken) return null;
  try {
    const height = phone ? 768 : 1152;
    const width = Math.round(height * aspect);
    const host = context(width, height);
    if (!host) {
      broken = true;
      return null;
    }
    const out = { width, height };
    if (row < 0) row = chooseRow(host.ctx, aspect, out, phone);
    const sheet = watercolor.create(host.ctx, {
      aspect, seed, sheetNumber: palette, reducedMotion: true, quality: watercolor.quality[row],
    });
    sheet.draw(null, out);
    let gone = false;
    return {
      canvas: host.canvas,
      palette: sheet.palette.name,
      info: { ...sheet.info, row },
      get lost() { return host.lost; },
      get tideIn() { return sheet.tideIn; },
      atRest: () => sheet.isAtRest(),
      // `pointers` are Blooms pointers: sheet units (short edge 1), y up.
      step(dt, pointers) {
        if (!host.lost && !gone) sheet.step(dt, pointers);
      },
      draw() {
        if (!host.lost && !gone) sheet.draw(null, out);
      },
      // How far the brush travels, in short edges, before it is mostly empty.
      setReach(shortEdges) {
        params.loadDistance = Math.max(0.5, shortEdges);
      },
      dispose() {
        if (gone) return;
        gone = true;
        if (!host.lost) sheet.dispose();
      },
    };
  } catch (e) {
    // A shader the device will not compile, or a layer it cannot draw into.
    console.error('watercolor', e);
    broken = true;
    return null;
  }
}

window.wcEngine = {
  create,
  palettes: palettes.map((p) => p.name),
  params, // live, for tuning from the console
  get available() { return !broken; },
};
