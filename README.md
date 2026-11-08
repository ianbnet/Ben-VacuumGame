# Roomba Vacuum

A browser game: steer a robot vacuum around a 15×12 room, clean every tile, and get back to the dock before the battery dies. Six rooms, a par score to beat on each, a ghost that replays the par route, and a first-person 3D view you can switch to at any time.

No build step, no dependencies. Plain HTML, CSS and canvas.

## Run it

```bash
python3 serve.py 3000
```

Then open http://localhost:3000. Any static file server works (`npm start` runs the same command).

## Controls

| Key | Does |
|---|---|
| Arrows / WASD | Move. Hold to keep going. |
| V | Switch between 2D and 3D. In 3D, left and right turn in place; up and down drive forward and back. |
| Enter | Full screen on / off (Escape also leaves it). The controls move to a side column and the board fills the rest. |
| Drag | In 3D, drag on the board to look around while stopped. The view eases back when you drive. |
| F | Flashlight on / off. |
| R | Restart the level (also restarts its score). |
| Space | Next level once a level is complete; ends the ghost replay. |
| G | Watch the ghost run the par route, at any time. Press V during it to ride along in 3D; Space or G ends it. |
| U | Upgrades panel. Every new star on a level is a point to spend on the vacuum or the charger. |
| M | Mute / unmute. |
| Design button | Colour wheels for the vacuum's lights and its flashlight. |
| H or ? | Help. |

The on-screen d-pad, level buttons and panel buttons do the same things and work on phones.

## How it is put together

| File | Holds |
|---|---|
| `core.js` | Constants, the obstacle catalogue, the six levels, and the par solver (BFS plus greedy nearest-tile). No DOM. |
| `game.js` | Game state, level setup, movement rules, input, saved progress, level select, the frame loop. |
| `render2d.js` | The top-down view: floor, dock, furniture, Roomba, ghost, overlays, banner, help, ambient effects. |
| `render3d.js` | The first-person view: a software raycaster into an `ImageData` buffer at up to 1.5x the canvas size, with a baked lightmap (window, lamp, dock, ambient occlusion), plaster and brick materials, a real window, see-over furniture, sprites, polished-floor reflections, dust motes, bloom and grade, and the dive transition. |
| `audio.js` | Synthesised sound effects and the motor hum (Web Audio, no files). |
| `upgrades.js` | The upgrade catalogue (efficient motor, bigger battery, solar cells, charging pad, overcharge), points and the Upgrades panel. |
| `design.js` | The Design panel: colour wheels for the vacuum's lights and flashlight, saved settings. |
| `scene2d.js` | Cached 2D layers: plank floor, furniture with cast shadows, window light; tile dust and polish, dust puffs, bokeh. |
| `serve.py` | A no-cache static server for local play. |
| `tests/run.js` | Headless checks for the level data, the solver and the movement rules. |

The scripts are classic (non-module) scripts that share one global scope; `index.html` loads them in the order above.

Progress (highest level reached, best moves and stars per level), the mute setting and the vacuum design are saved in `localStorage`.

## Tests

```bash
node tests/run.js
```

## History

Built on Replit in March 2026. Reworked in November 2026 from the assessment in `docs/assessment-2026-11-07.md`; `docs/changes-2026-11-07.md` lists what changed.

## 3D renderer

![Atomic Lounge: shell chair and sofa reflected in the polished floor](docs/img/3d-atomic-lounge-chair.jpg)
![Chrome Diner: red stools and a chrome dinette on checkerboard lino](docs/img/3d-chrome-diner.jpg)

The first-person view is drawn by a Three.js renderer over WebGL2 (`render3d-gl.js`), styled as a
1950s atomic-age home: six themed rooms, real sunlight through the blinds, glossy floors that
reflect the room as you clean them, depth of field and film grain. Three.js r170 is vendored under
`vendor/three/` and loaded through an import map, so there is still no build step.

The Design panel has a **3D renderer** setting (Modern GPU, or Classic for the original software
raycaster, which also takes over automatically where WebGL2 is missing) and a **Quality** preset
(Low to Ultra) that trades resolution, shadows, ambient occlusion, depth of field and reflections
for speed. The internal resolution also adapts to frame time on its own.

`scene3d.js` describes the rooms as plain data (themes, furniture built from parts, architecture
and decor); `docs/assessment-3d-aaa-2026-11-08.md` is the plan this followed.
