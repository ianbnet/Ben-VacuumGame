# 3D mode: the road to "visually stunning"

Date: 2026-11-08. An independent look at the first-person view after the glow-up, judged against the standard of a top-tier 3D title, with the brief that gameplay stays exactly as it is and the 3D view is about beauty rather than puzzle solving.

## Where it stands

The 3D view is a software raycaster: one ray per screen column into an ImageData buffer, vertical walls, a flat floor and ceiling, billboard sprites, a baked 2D lightmap, and a handful of post passes. The glow-up pushed that design about as far as it goes. Seen fresh, these are the tells that stop it reading as a real room:

- **Nothing has thickness.** The couch, table and walls are textured slabs; the chair and plant are flat pictures that swivel to face the camera. There are no bevels, cushions, legs under the couch, slats, mullions, skirting depth, cornice or door. The eye reads "Wolfenstein" within a second.
- **Light is flat.** The lightmap varies across the floor but not up the walls; nothing casts a shadow onto anything above floor level; there are no specular highlights, so no surface tells you what it is made of. The window is a bright slot with no frame and no beam shape on the floor.
- **The ceiling dominates.** Nearly half the frame is a grey, cloudy ceiling that carries dark blotches above furniture because it samples the floor's lightmap. It reads as weather, not plaster.
- **Fog stands in for depth.** A living room does not haze out across fifteen tiles. The grey fog flattens contrast and tints everything.
- **Textures shimmer.** Nearest-neighbour sampling at 1.5x with no filtering: planks crawl in motion, distant edges sparkle, dither is visible.
- **The camera is not a lens.** Fixed field of view, no depth of field, no exposure change between facing the window and facing away, no motion blur, snap turns eased by a constant.
- **Reflections are a trick.** Only clean tiles reflect, and only as a vertical mirror of the column; nothing reflects at an angle, and the "polish" reads as a green tint rather than gloss.
- **The HUD is heavy.** Boxes for compass, status and minimap sit over a view that is meant to be admired.

None of these is a bug. They are the renderer. Every further raycaster improvement is a hack on top of hacks, and the result will top out at "very handsome retro".

## The one decision that matters

**Replace the renderer, keep everything else.** Move the 3D view onto the GPU with Three.js over WebGL2, vendored into the repository (no build step, no CDN at run time), while keeping the game, the level data, the camera model (`fpPlayerView` / `fpGhostView` already produce a pose), the HUD, the dive, the audio and the lightmap baker. The game loop would hand the view to a `render3d-gl.js` instead of `render3d.js`.

What the GPU buys that the raycaster never can: real geometry with thickness, shadows that fall on walls and furniture, physically based materials with specular and roughness, filtered and mipmapped textures, anti-aliasing, screen-space ambient occlusion and reflections, a physical camera with depth of field and exposure, and a proper HDR post stack. Those are precisely the cues a viewer uses to judge "real".

Honest framing: a browser game will not ship a photogrammetry city. The right target for a Roomba's-eye living room is the cozy photoreal interior: golden-hour sun through blinds, dust turning in the beam, glossy hardwood reflecting the sofa legs, soft contact shadows, bokeh on the near dust, and a camera that behaves like a lens. That look is reachable in WebGL in a handful of sprints, and it is what makes people say the words out loud.

## The pillars

### 1. Geometry with thickness
- Furniture modelled from primitives with bevelled edges: a couch with seat and back cushions, rolled arms and turned legs; a table with apron and legs; chairs with a slatted back and a shaped seat; plants with a pot and instanced leaves; a pet bed with a padded rim; the dock as a real object with a lit button.
- Room architecture: skirting boards and cornice with depth, a door with frame and handle, the window with frame, mullions, sill and glass, blinds with slats that cast stripes, outlets and a picture or two at Roomba-relevant height.
- Floor-level clutter, since that is what the camera sees: a rug with a border, a charging cable along the skirting, a sock, crumbs, a ball under the couch. Dirty tiles carry visible dust and debris meshes that disappear when cleaned.
- Everything casts and receives shadows.

### 2. Light that behaves
- A sun: a shadow-mapped directional light through the real window and blinds, with soft (PCSS-style) penumbrae, so the stripes fall across the floor and climb the couch and the wall behind it.
- Sky and bounce: a hemisphere/environment term, plus the room's own indirect light from a baked lightmap. The existing CPU baker already produces one; it becomes the floor and wall lightmap texture. Progressive baking at level load is the upgrade path.
- A warm ceiling lamp with a shade as a real emitter; the dock as a small blue emitter; the vacuum's light ring and the flashlight as true lights, the flashlight with shadows and a soft cookie.
- Time of day: each level gets a sun angle and colour (morning, noon, golden hour, evening with the lamp doing the work), and cloud drift slowly modulates the sun. The same room looks different at every visit.

### 3. Materials
- Physically based throughout: hardwood with normal and roughness maps (generated procedurally, as the current canvases are), satin paint on plaster, fabric with sheen on the couch, lacquer with clearcoat on the table, black plastic and chrome on the vacuum, glass with transmission in the window, matte brick with real relief in the Gauntlet.
- Clean versus dirty becomes a material: a per-tile roughness and dust mask updated as tiles are cleaned. Clean wood turns glossy and reflects the room through screen-space reflections; dirty wood stays matte under a film of dust. Same gameplay signal, physically real.

### 4. The camera as a lens
- A physical camera at vacuum eye height with a wide lens, eased turns with a slight bank into the turn, lean under acceleration, a subtle bob tied to speed.
- Depth of field focused on the path ahead, so near dust and the bumper fall into bokeh.
- Auto exposure: turning toward the window blooms and settles; turning away, the room opens up.
- Motion blur on turns, lens bloom and a soft flare from the window, gentle idle drift when the vacuum is stopped.
- Optional, no gameplay change: mouse or touch look-around while stationary, snapping back when you drive.

### 5. The post stack
- ACES filmic tone mapping on an HDR pipeline, physically thresholded bloom, ground-truth ambient occlusion for contact darkening, screen-space reflections for the floor, anti-aliasing (SMAA, with temporal AA as a stretch), vignette, a touch of chromatic aberration and grain, and a colour grade tuned warm.
- A true volumetric shaft through the window (a raymarched fog slab) replacing the painted one; thin warm haze instead of grey fog.

### 6. Life
- GPU dust that is bright only inside the sunbeam and drifts on a slow current.
- Blinds and curtain sway; the lamp's filament breathing; a cat asleep in the pet bed, breathing.
- The vacuum's brushes spinning at the bottom edge of the frame; dust drawn into the intake as a tile is cleaned; a glint sweeping the tile as it turns glossy.
- The dive becomes a real camera move: the 2D board is the top-down orthographic shot of the same scene, and the camera swoops down into the vacuum's eye, and back out.

### 7. The vacuum in frame
- The real body rim with the room reflected in its gloss, lights as emissive geometry in the chosen colour, the flashlight lens, a contact shadow under the body.

### 8. The HUD gets out of the way
- Hairline typography, no boxes. The compass is a tick on the horizon; battery is the colour of the vacuum's own light ring; tiles-left and dock distance fade in on change and out after a few seconds. Beauty mode: everything but the frame fades after three seconds idle.

## Performance and compatibility

- Budget: 60 fps at 1080p on an M-series Mac, 60 fps at 720p on a recent iPad; adaptive pixel ratio as today.
- Quality presets (Low, Medium, High, Ultra) switching off SSR, DOF, volumetrics and AO in that order.
- WebGL2 is universal now. The current raycaster can stay as a "Classic" renderer behind a setting during the transition and be retired later.
- Three.js vendored under `vendor/three/` pinned to one release, about 1.2 MB, loaded as a module that exposes itself to the classic scripts before `game.js` initialises. Still no build step, still static hosting.

## Plan, in sprints

Each sprint ends with the game playable, tests green and screenshots in the changelog.

- **A. Renderer foundation.** Three.js in; scene built from `LEVELS`; PBR materials from procedural canvases; sun, sky and lamp with shadows; ACES, SMAA, bloom; camera from the existing view model; HUD canvas composited on top; dive working; visual parity or better with today. The raycaster stays behind a setting.
- **B. Set dressing.** Modelled furniture, window with blinds, skirting, cornice and door, dock model, rug and clutter, dust and debris meshes on dirty tiles, the vacuum body in frame.
- **C. Lighting fidelity.** Lightmap as the indirect term, ambient occlusion, screen-space reflections driven by the clean mask, flashlight with shadows, dock and vacuum lights, volumetric shaft, time of day and cloud drift.
- **D. Camera and post.** Depth of field, exposure, motion blur, grain, vignette, aberration, banked turns, idle drift, look-around.
- **E. Life.** GPU dust, intake particles, brush spin, clean glint, blinds sway, the cat, HUD fade and the diegetic HUD.
- **F. Hardening.** Quality presets, mobile and Safari passes, performance tuning, tests for the scene builder and material masks, docs.

Sprints A and B together are the leap; everything after is the polish that turns "that looks real" into "that is gorgeous". Expect a couple of taste-check rounds per sprint with screenshots, because the art is in the tuning of light and material, not in the technology.

## What stays untouched

Rules, levels, par, battery, upgrades, the ghost, the design panel, the 2D view, audio, saves and the keyboard map. The 3D view remains a window onto the same game.
