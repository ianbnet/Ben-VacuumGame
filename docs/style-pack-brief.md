# Writing a style pack

A style pack gives one floor of the house its own look in both views. It is ONE file,
`style-<name>.js`, a classic script (no modules, no build) loaded after `scene3d.js`. It registers
`S3_STYLE_PACKS.<name> = { ... }`. **Read `style-scifi.js` first and mirror its structure**; it is the
reference pack and is known to work. Then read in `scene3d.js`: `s3Mat`, the "Style packs" block
(`s3B s3C s3S s3R s3Cat s3Shell s3WindowGlass`), the atomic builders (`s3Couch` and friends, for
proportions) and `s3WallPoint`.

Rules for whoever writes one:
- Create only your `style-<name>.js`. Do not edit any other file. Do not commit, do not use a browser,
  do not touch the network.
- Wrap everything in an IIFE, as the reference does. No new globals except the registration.
- Original designs only. No franchise names, logos or characters anywhere in names, comments or art.
- Plain words in comments. No em-dashes.
- Done means: `node --check style-<name>.js` passes and `node tests/run.js` prints `0 failed`
  (the tests load your file automatically when it exists and build every room on your floor).
  Also write and run a small throwaway node script (outside the repo, or delete it after) that
  loads `core.js levels.js rooms.js upgrades.js design.js scene3d.js style-<name>.js` into one
  `vm` context (see the top of `tests/run.js` for how) and, for all six themes, calls every
  furniture builder at each footprint the game uses (couch 3x1, table 2x2, chair 1x1, plant 1x1,
  petbed 2x1), `wall({w:1,h:1,col:3,row:4}, th)` and `architecture(levelIndex, th)`, checking every
  part has a known `shape`, finite numbers, a `mat` with a `color`, and a `pos` (rods have
  `from`/`to` instead). Painters need a real canvas and cannot run in node: read them twice.

## Geometry

Units: one tile is 1 (about half a metre). x along columns (0..15), z along rows (0..12), y up.
The room is 15 x 12, walls 4.8 high (`S3_WALL_H`). The camera sits only 0.28 above the floor, so
undersides and the lowest half metre of everything are what the player sees most. Furniture is
built in its own space: centred on its footprint, back towards -z, footprint `lw` x `ld`.

Part shapes the renderer builds (all take `mat`, and optionally `rot:[rx,ry,rz]`, `scale:[x,y,z]`,
`texture`, `texRepeat:[u,v]`, `tag`, `noShadow:true`):
- `box` `{pos,size:[w,h,d],bevel?,taper?}`; `cyl` `{pos,rTop,rBot,h,seg?,open?,thetaStart?,thetaLength?}`
  (rTop 0 makes a cone, `seg:4` a square post, `seg:6` a hex)
- `sphere` `{pos,r}`; `torus` `{pos,r,tube,arc?}` (lies in the xy plane; `s3R` lays it flat)
- `plane` `{pos,size:[w,h]}`; `rod` `{from,to,r}` (no `pos`)
- `extrude` `{pos,points:[[x,z],...],depth,bevel?}` a flat outline given thickness, lying flat
- `lathe` `{pos,points:[[radius,y],...],seg?}` a profile spun round the y axis: turned legs, urns, shades
- `tube` `{pos,path:[[x,y,z],...],r,closed?}` a pipe along a smooth path, points relative to `pos`
- `gear` `{pos,r,teeth,depth,hole?}` a toothed wheel, axis up; rotate it to face a wall
- `gem` `{pos,r,faces:8|20}` a faceted crystal
Shorthand: `s3B(pos,size,mat,extra)`, `s3C(pos,rTop,rBot,h,mat,extra)`, `s3S(pos,r,mat,extra)`,
`s3R(pos,r,tube,mat,extra)`.

Materials: `s3Mat(kind, color)` with kinds walnut teak brass chrome steel fabric vinyl shell ceramic
plaster paint leaf soil fur glass emissive concrete formica rubber leather velvet copper gold iron
gunmetal carbon polymer stone marble moss glow crystal holo pearl blocky. You may copy one and change
fields (`emissiveIntensity`, `opacity`, `roughness`, `flat:true` for faceted shading).

Tags the renderer animates: `glass` (the window pane, required once: use `s3WindowGlass`), `slat`
(window blades; keep at least six, the 2D board paints striped light through them), `door`, `bulb`,
`cat` and `catHead` (use `s3Cat(th)` in the pet bed), `dockRing`, `blink`, `spin` (turns about its own
y axis at `speed`), `pulse` (light breathes), `float` (bobs), `flicker` (light flickers), `crate`.

Hard limits the tests enforce on every furniture builder: every part's `pos` (or rod end) stays
within the footprint plus 0.3; nothing below y 0; nothing above the ceiling; **a couch and a table
must each contain at least one `cyl` part whose `pos` y is under 0.5** (legs or a base).
Budget: about 40 parts for a piece of furniture, about 6 for a wall tile (a room can hold 70 wall
tiles), about 160 for the whole room shell.

## A theme

Six per pack, in this order of mood, because a floor is always played in this order: a lounge, a
child's room, a place to eat, a place to work, a store or workshop, and a dramatic last room. Each
has every field an atomic theme has (see `S3_THEMES` in `scene3d.js`): `name time sun sky ambient lamp
walls accent trim ceiling floor floorSeed wallStyle couch pillow couchWood chair table leaf planter
petbed cat door outside prints`, plus `style: '<name>'`. `time` must be one of morning, noon,
afternoon, golden hour, dusk, night. The sun must come in through the north window: `azimuth`
between -70 and 70, `elevation` between 6 and 60. `door.wall` is south, west or east and `door.at`
is where along that wall (keep the atomic values: south 3.5 or 10.5, west 6, east 6). `prints: []`.

Extra fields the renderer reads (all optional): `fill` (colour of the soft light from above; set it
when the sky is dark), `env` (strength of reflections, about 0.3 to 1), `exposure` (about 1.0 to
1.25), `vignette`, `bloom: [strength, radius, threshold]` (the atomic look uses [0.28, 0.6, 0.95]),
`grade: [r, g, b]` (a tint near 1), `fog: { color, density }` (density at most 0.02),
`lights: [{ pos, color, intensity, distance }]` (up to 8 coloured point lights; only the first two are
lit at the Low preset), `floorMat: { bump, normal, metalness, clearcoat, reflect, dust: [keep, r, g, b] }`,
`wallHeight` (how tall the interior walls stand, for 2D shadows), `lamp.down: true` (the ceiling lamp
only shines downward). Lessons from the reference pack: light sources bloom, so keep
`emissiveIntensity` at about 1 to 2.5; a dark room needs `fill` and `ambient` near 0.85 or its walls
go black; a lamp that is not `down` paints the whole ceiling its colour.

## What the pack registers

```
S3_STYLE_PACKS.<name> = {
  name, themes,
  couch(lw, ld, th), table(lw, ld, th), chair(lw, ld, th), plant(lw, ld, th, seed), petbed(lw, ld, th),
  wall(obs, th),            // one interior wall tile; switch on th.wallStyle (one style per theme is ideal)
  architecture(levelIndex, th),   // the whole room: start from s3Shell(th, {...}), add window, door, lamp, decor
  dock(th),                 // optional: parts for the charging dock; keep the middle clear, the vacuum parks there
  paintFloor(t, th, px),    // the whole floor on a 2D canvas, px pixels per tile; used by BOTH views
  paintBackdrop(t, th, w, h),     // what is outside the window (2048 x 768)
  textures: { key: { size, paint(t, n, th, color), tint, normal, normalScale, repeat, nearest, perTheme, byColor, glow } },
  palette2d(th),            // floor colours for the 2D board, see below
  paint2d: { wall(c, it, th, wallSet), couch(c, lw, ld, th), table(c, lw, ld, th), chair(c, th), plant(c, th, seed), petbed(c, lw, ld, th), lamp(c, th) },
}
```
A part uses a texture as `texture: '<name>:<key>'`. `tint: true` multiplies the picture by the
part's colour (paint it in light greys). `normal` makes bumps from the same picture. `nearest: true`
keeps pixels sharp. `glow` makes the picture emit light.

The floor: one visible plate, board or slab per tile, because the player counts tiles. Keep it
fairly even in brightness; the game draws dust on dirty tiles and a polish on clean ones.
`palette2d(th)` returns `{ floorBase: [r,g,b], glaze: [r,g,b], glazeAlpha, film: [r,g,b], filmAlpha,
dust: { fluff, crumb, hair } }` where `floorBase` is the floor's average colour, `glaze` tints clean
tiles and `film` dirty ones. A test requires clean and dirty to differ clearly (`s2CleanContrast` at
least 0.18): on a dark floor use a bright glaze and light dust, on a pale floor a darker film and
dark dust. `floorMat.dust` does the same job in 3D: dirty colour = clean colour x keep + [r, g, b].

2D painters draw one piece seen from straight above, in its own frame: centred at 0,0, back towards
-y, `TILE` (48) pixels to a tile, so a couch spans `lw * TILE` by `ld * TILE`. `wall` is the
exception: it draws in board space at `it.o.col * TILE, it.o.row * TILE`, and `wallSet` holds
"col,row" strings of every wall tile so you can outline only exposed edges. Helpers: `roundRect(c,
x, y, w, h, r)`, `shadeColor(hex, percent)`, `seededRandom(seed)`, `hexToRgb(hex)`. The cat is drawn by
the game on top of the pet bed. `lamp(c, th)` draws the ceiling lamp centred at 0,0.
