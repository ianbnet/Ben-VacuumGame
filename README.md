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
| F | Flashlight on / off. |
| R | Restart the level (also restarts its score). |
| Space | Next level once a level is complete; skips the ghost replay. |
| W | On the Level Complete screen, replay the par route. Press V during it to ride along in 3D. |
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
| `render3d.js` | The first-person view: a software raycaster into an `ImageData` buffer with textured walls, floor and ceiling, see-over furniture, sprites, and the in-view HUD. |
| `audio.js` | Synthesised sound effects and the motor hum (Web Audio, no files). |
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
