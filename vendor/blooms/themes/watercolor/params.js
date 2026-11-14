// Every constant that shapes the watercolor. Players never see these; this
// file is where the look is tuned.
//
// Lengths and speeds are written for a sheet 1440 cells along its long edge
// and are scaled to whatever size the device can manage (see `quality`).

export const params = {
  // The grid the paint lives on, and how hard we work each frame. The core
  // replaces these with one of the `quality` rows below.
  simLong: 1440,        // paint cells along the sheet's long edge
  velLong: 320,         // flow cells along the long edge (flow is broad; it needs far fewer)
  jacobi: 20,           // pressure iterations per frame
  floodRounds: 2,       // soak passes per frame while the tide is in
  ebbRounds: 8,         // soak passes per frame while it goes out (fronts and rims need more)

  // Paper
  bumpPx: 6.5,          // size of one bump of the tooth
  paperTint: [246, 241, 230],

  // The living wash: flow over the whole wet sheet
  velDrag: 0.26,        // how fast motion dies; its half-life is 0.69 / velDrag seconds
  curl: 12,             // how strongly small swirls are kept curling
  pressureKeep: 0.8,
  velGain: 0.75,        // share of the brush's speed given to the water under it
  velMax: 900,          // px/s
  pushRadius: 1.6,      // reach of the shove, in brush radii
  sourceMove: 2.5,      // new paint arriving under a moving brush pushes old paint aside (1/s)
  sourceHold: 3.0,      // clean water arriving under a resting tip (1/s)
  calmFrom: 1.0,        // seconds after the last touch before the water starts to calm
  calmBy: 5.0,          // seconds after the last touch by which it is calming fully
  calmDrag: 1.6,        // the extra drag of calming water, so the picture you made is the picture that sets
  flowTail: 14,         // seconds to keep solving the flow after the last touch

  // Pigment and the paper under moving water
  calmSpeed: 18,        // px/s below which pigment settles freely
  floodSettle: 0.12,    // while the tide is in, settling is this much slower: the painting sets on the ebb
  stirLo: 30,           // px/s at which a current begins to lift settled pigment
  stirHi: 260,          // px/s at which it lifts all it can
  stainFade: 260,       // seconds for the painting under a flooded sheet to fade by two thirds

  // The tide
  tideHold: 4.5,        // seconds after the last touch before the tide goes out
  tideRise: 3.0,        // how fast the sheet floods when you touch it, per second
  ebbEvap: 0.30,        // how fast clean water leaves on the ebb, per second
  retain: 0.82,         // how much longer water lingers where there is paint
  aroundReach: 0.06,    // how far "around here" reaches when judging that, of the short edge
  retainBias: 0.9,      // water lingers where the paint is at least this share of the paint around it,
  retainFloor: 0.02,    // plus this much: evenly pale areas dry, evenly rich ones stay wet
  retainBand: 0.03,     // how sharp that line is

  // Water moving through paper (what shapes the ebb: fronts, rims, grain)
  kappa: 0.14,          // how readily water levels out, per pass (0.15 is the most that stays stable)
  filmDry: 0.16,        // how well a dry cell conducts (it must, a little, or no front starts)
  filmDamp: 0.70,       // how well damp paper conducts
  clog: 1.2,            // how much pigment in the water slows it
  filmPow: 3,           // thin films move far less than deep water (3 is what physics says)
  kh: 0.10,             // how much deeper water sits in the hollows
  theta: 1.0,           // head needed to break into dry paper
  thetaDamp: 0.4,       // the much smaller, uneven head needed to run through damp paper
  diffuse: 0.4,         // bleed of pigment through shared water, px^2 per second
  edgeEvap: 0.8,        // extra drying at the rim of a wash
  dampTime: 2.0,        // seconds paper stays damp after the surface water goes
  fixTime: 5,           // seconds for dry pigment to set
  unfixTime: 40,        // seconds of soaking to loosen set pigment
  capacity: 2.2,        // pigment the paper can hold at one point
  looseLift: 0.8,       // how easily unset pigment lifts into a current
  liftFlow: 6,          // how much water passing through helps lift pigment

  // The brush. Speeds are short edges per second.
  speedSlow: 0.15,
  speedFast: 2.2,
  rSlow: 0.046,         // radius, of the short edge
  rFast: 0.018,
  pigSlow: 0.62,        // how strong the paint on the brush is
  pigFast: 0.46,
  replaceSlow: 3.2,     // how completely one pass of the brush replaces what was there
  replaceFast: 1.8,
  replaceHold: 5.0,     // how fast a resting tip clears the paint under it, per second
  edgeRough: 0.25,
  loadDistance: 2.4,    // short edges of travel before the brush is mostly empty
  loadFloor: 0.14,
  trace: 0.10,          // share of the last stroke's pigment still in the brush
  reloadRest: 0.5,      // seconds of rest that reload the brush
  holdDelay: 0.28,      // seconds of stillness before water starts to run in
  holdR: 0.026,         // radius of the tip the water runs in from, of the short edge

  // The look
  relief: 0.75,
  cavity: 0.10,
  sheen: 0.11,
  gloss: 24,
  granDetail: 1.0,
  opticalCap: 2.6,
  debug: 0,

  // Rest
  restAfter: 32,        // seconds after the last touch before the page may sleep
};

// What a device is asked to carry, best first. The core times a few frames
// at each row and settles on the first one the device can keep up with.
export const quality = [
  { simLong: 1440, velLong: 320, jacobi: 20, floodRounds: 2, ebbRounds: 8 },
  { simLong: 1152, velLong: 288, jacobi: 20, floodRounds: 2, ebbRounds: 7 },
  { simLong: 896, velLong: 256, jacobi: 16, floodRounds: 2, ebbRounds: 6 },
  { simLong: 704, velLong: 192, jacobi: 14, floodRounds: 1, ebbRounds: 4 },
  { simLong: 512, velLong: 160, jacobi: 12, floodRounds: 1, ebbRounds: 3 },
];
