# Floor styles and the 3D uplift: working plan (2026-11-10)

Asked for: floor 1 as it is; floor 2 as 2020s sci-fi (modern, dark, gritty, gorgeous); floor 3 as
Baroque and Victorian steampunk sci-fi; and the 3D view lifted towards AAA on every floor.

Decisions taken without asking (change any of them):
- Floors 4 and 5 keep the atomic look until they get a style of their own.
- Everything stays drawn in code. No downloaded models or textures, so the game stays small.
- Gameplay, level layouts, par and saves are untouched.
- Built rooms and the room of the day keep the six atomic themes.

## How it is put together

- A **style pack** is one file (`style-scifi.js`, `style-steam.js`) that registers itself in
  `S3_STYLE_PACKS`: six themes, 3D builders for each piece of furniture, the room shell, floor
  painters, a backdrop painter, and 2D painters for the board.
- `S3_FLOOR_STYLE` names the pack for each floor. `s3Theme(level)` picks the pack by floor and the
  theme by place on the floor. A theme carries `style`.
- scene3d.js keeps the atomic builders exactly as they were and dispatches to a pack when the
  theme's style has one.
- Engine uplift lives in render3d-gl.js and applies to every floor: new part shapes (lathe, tube,
  gear, n-sided cylinders), a texture registry with normal maps, extra local lights per theme, a
  shadow-casting lamp, per-theme grade, haze and bloom, sharper floor reflections.

## Stages (commit after each)

1. Plumbing and engine: packs, floor styles, new shapes, textures, lights, grade. Floor 1 must
   look the same or better and every test must pass.
2. Sci-fi pack in 3D: six rooms.
3. Steampunk pack in 3D: six rooms.
4. Both packs on the 2D board (floors, furniture, light).
5. Tests for the packs, notes, README, a speed check at the Low preset.

## Status

All five stages are done and committed locally (not pushed, not published when written).

- [x] plumbing and engine lift (f967c78)
- [x] sci-fi floor, `style-scifi.js`
- [x] rename to Ben's Vacuum Game
- [x] dragon wonderworld floor, `style-wonder.js` (3abf6b4); glow halved after seeing it on screen
- [x] voxel dungeon floor, `style-voxel.js` (d66153d); two dark rooms brightened
- [x] steampunk floor, `style-steam.js`
- [x] tests hold every pack to `docs/style-pack-brief.md`; README and change log updated

Seen in the browser: every floor in 2D and at least one room of each in 3D. Not seen: every one
of the 24 new-style rooms in 3D, and nothing on a real phone.

Known and left for later:
- The new floors draw about one and a half times as many parts per room as the atomic floor
  (about 310 to 490 on average against 283), each its own draw call, plus up to 7 extra lights.
  Merging static geometry by material would cut that sharply if phones struggle.
- The 2D board still paints the atomic window (two mullions and a transom) on every floor.
- Parts that pulse or flicker share materials, so parts with the same material pulse together.
- The Classic software renderer ignores themes and looks the same on every floor.
