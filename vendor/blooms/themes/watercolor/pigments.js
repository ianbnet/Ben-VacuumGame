// Pigments and the palettes built from them.
//
// A pigment is a colour plus a character. The colour is given as it looks
// laid on thickly; thinner layers come out paler and are worked out from it.
//
//   gran    how strongly it settles into the paper's hollows (0..1)
//   settle  how quickly it drops out of the water (per second)
//   lift    how easily a flood picks it back up (per second); low = staining
//   spread  how far it travels through wet paper (about 1)

function toLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function pigment(name, rgb, gran, settle, lift, spread) {
  return {
    name,
    rgb,
    // What the pigment absorbs, per unit laid down: red, green, blue.
    k: rgb.map((v) => -Math.log(Math.max(toLinear(v), 0.004))),
    gran,
    settle,
    lift,
    spread,
  };
}

export const pigments = {
  ultramarine: pigment('Ultramarine', [30, 50, 185], 0.90, 0.55, 0.10, 0.80),
  cerulean: pigment('Cerulean', [40, 135, 205], 0.75, 0.50, 0.12, 0.85),
  phthalo: pigment('Phthalo blue', [0, 100, 185], 0.05, 0.16, 0.03, 1.30),
  indigo: pigment('Indigo', [30, 48, 92], 0.25, 0.30, 0.05, 1.00),
  teal: pigment('Cobalt teal', [20, 165, 165], 0.70, 0.50, 0.12, 0.85),
  viridian: pigment('Viridian', [10, 125, 100], 0.60, 0.42, 0.10, 0.90),
  sap: pigment('Sap green', [90, 135, 30], 0.10, 0.22, 0.05, 1.10),
  gold: pigment('Quinacridone gold', [240, 160, 10], 0.00, 0.18, 0.04, 1.25),
  ochre: pigment('Raw sienna', [215, 150, 55], 0.45, 0.40, 0.10, 0.90),
  sienna: pigment('Burnt sienna', [170, 72, 30], 0.55, 0.42, 0.10, 0.90),
  rose: pigment('Quinacridone rose', [225, 30, 100], 0.00, 0.16, 0.03, 1.30),
  maroon: pigment('Perylene maroon', [140, 20, 40], 0.10, 0.24, 0.04, 1.10),
  violet: pigment('Dioxazine violet', [85, 30, 150], 0.05, 0.20, 0.03, 1.20),
  pink: pigment("Potter's pink", [210, 120, 130], 1.00, 0.60, 0.14, 0.75),
  neutral: pigment('Neutral tint', [58, 60, 78], 0.90, 0.55, 0.10, 0.80),
};

// Four pigments each, in the order strokes pick them up. A fresh sheet takes
// the next palette.
export const palettes = [
  { name: 'Tidewater', pigments: ['phthalo', 'teal', 'ochre', 'indigo'] },
  { name: 'Dusk', pigments: ['ultramarine', 'rose', 'gold', 'violet'] },
  { name: 'Orchard', pigments: ['sap', 'gold', 'sienna', 'maroon'] },
  { name: 'Heather', pigments: ['violet', 'pink', 'viridian', 'indigo'] },
  { name: 'Ember', pigments: ['gold', 'sienna', 'maroon', 'indigo'] },
  { name: 'Glacier', pigments: ['cerulean', 'teal', 'ultramarine', 'neutral'] },
  { name: 'Meadow', pigments: ['viridian', 'sap', 'gold', 'cerulean'] },
  { name: 'Rosewater', pigments: ['rose', 'pink', 'ochre', 'ultramarine'] },
];

// A palette in the shape the shaders want.
export function paletteFor(sheetNumber) {
  const palette = palettes[((sheetNumber % palettes.length) + palettes.length) % palettes.length];
  const list = palette.pigments.map((key) => pigments[key]);
  return {
    name: palette.name,
    list,
    k: new Float32Array(list.flatMap((p) => p.k)),
    gran: list.map((p) => p.gran),
    settle: list.map((p) => p.settle),
    lift: list.map((p) => p.lift),
    spread: list.map((p) => p.spread),
  };
}
