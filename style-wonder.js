// === STYLE PACK: WONDER ===
// The fifth and top floor of the house: a hidden sanctuary where dragons live. A cavern garden of
// glowing crystal, luminous mushrooms and flowers, shells, nests and eggs, a waterfall down one
// wall, stones that float under a ceiling of stars, and outside the window a world of floating
// islands. See docs/style-pack-brief.md for what a style pack is; style-scifi.js is the reference.
//
// Everything here is plain data and canvas painting. Furniture is in its own space: centred on
// its footprint, back towards -z, one unit to a tile, y up.

(function () {
    const M = s3Mat, B = s3B, C = s3C, S = s3S, R = s3R;
    const H = S3_WALL_H, W = S3_WINDOW;
    const PI = Math.PI;

    // ---- Colour and material helpers -----------------------------------------------------------

    const rgbOf = (hex) => hexToRgb(hex) || [128, 128, 128];
    const rgba = (hex, a) => { const c = rgbOf(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
    const mix = (a, b, k) => { const p = rgbOf(a), q = rgbOf(b); return rgbToHex(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k); };

    // Light sources are kept modest: the bloom does the rest, and too much burns to white
    // Seen on screen, light sources bloom hard, so both helpers give about half of what was written
    const glow = (color, k) => Object.assign(M('glow', color), { emissiveIntensity: (k === undefined ? 1.6 : k) * 0.55 });
    const crystal = (color, k) => Object.assign(M('crystal', color), { emissiveIntensity: (k === undefined ? 1.4 : k) * 0.5 });
    const pearl = (color) => M('pearl', color);
    const rock = (color) => Object.assign(M('stone', color), { flat: true });

    // ---- Shape helpers -------------------------------------------------------------------------

    const gem = (pos, r, mat, extra) => Object.assign({ shape: 'gem', pos, r, faces: 8, mat }, extra);
    const boulder = (pos, r, mat, extra) => Object.assign({ shape: 'gem', pos, r, faces: 20, mat }, extra);
    const lathe = (pos, points, mat, extra) => Object.assign({ shape: 'lathe', pos, points, mat }, extra);
    const tube = (pos, path, r, mat, extra) => Object.assign({ shape: 'tube', pos, path, r, mat }, extra);

    // The renderer turns a part about x, then y, then z. These are the three angles for "tip over
    // by `tilt` towards +z, then turn by `yaw` about the upright", which is how things lean here.
    function tipTurn(tilt, yaw) {
        const s = Math.sin(yaw), c = Math.cos(yaw), st = Math.sin(tilt), ct = Math.cos(tilt);
        return [Math.atan2(st, c * ct), Math.asin(Math.max(-1, Math.min(1, s * ct))), Math.atan2(-s * st, c)];
    }

    // Which way a thing points after leaning by `tilt` in the compass direction `dir`
    // (0 is +x, a quarter turn is +z)
    const leanDir = (tilt, dir) => [Math.cos(dir) * Math.sin(tilt), Math.cos(tilt), Math.sin(dir) * Math.sin(tilt)];

    // A crystal shard growing from `base`: h long, w across, pointed at both ends, with a little
    // of the lower point left buried
    function shard(base, h, w, mat, tilt, dir, extra) {
        tilt = tilt || 0;
        dir = dir || 0;
        const up = leanDir(tilt, dir), k = h * 0.42;
        return Object.assign({ shape: 'gem', faces: 8, r: w, pos: [base[0] + up[0] * k, base[1] + up[1] * k, base[2] + up[2] * k], scale: [1, h / (2 * w), 1], rot: tipTurn(tilt, PI / 2 - dir), mat }, extra);
    }

    // A quartz point: a six-sided column with a pointed cap, h long and r across
    function quartz(P, base, h, r, mat, tilt, dir, extra) {
        const up = leanDir(tilt || 0, dir || 0), rot = tipTurn(tilt || 0, PI / 2 - (dir || 0));
        const at = (k) => [base[0] + up[0] * h * k, base[1] + up[1] * h * k, base[2] + up[2] * h * k];
        P.push(Object.assign({ shape: 'cyl', pos: at(0.39), rTop: r * 0.82, rBot: r, h: h * 0.78, seg: 6, rot, mat }, extra));
        P.push(Object.assign({ shape: 'cyl', pos: at(0.89), rTop: 0, rBot: r * 0.82, h: h * 0.22, seg: 6, rot, mat }, extra));
    }

    // An egg as a profile to spin: h tall, r at its widest, blunt below and narrower above
    function eggProfile(r, h) {
        const pts = [], n = 10;
        for (let i = 0; i <= n; i++) {
            const x = -Math.cos((PI * i) / n);
            pts.push([(r * Math.sqrt(Math.max(0, 1 - x * x)) * (1 - 0.22 * x)) / 1.02, (h * (x + 1)) / 2]);
        }
        return pts;
    }

    // A whole little mushroom in one profile: a stem h tall under a domed cap r wide
    function shroomProfile(h, r) {
        const s = r * 0.24;
        return [[s * 1.3, 0], [s, h * 0.3], [s * 0.9, h * 0.62], [r, h * 0.6], [r * 0.96, h * 0.72], [r * 0.7, h * 0.9], [r * 0.3, h * 0.99], [0, h]];
    }

    // A hoop of woven branch: a closed pipe round an oval (or a squarer loop) that rises and dips
    function hoop(y, rx, rz, r, mat, waves, phase, square) {
        const path = [], n = 16;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * PI * 2;
            let cx = Math.cos(a), cz = Math.sin(a);
            if (square) {
                cx = Math.sign(cx) * Math.pow(Math.abs(cx), 0.45);
                cz = Math.sign(cz) * Math.pow(Math.abs(cz), 0.45);
            }
            path.push([cx * rx, 0.035 * Math.sin(a * waves + phase), cz * rz]);
        }
        return { shape: 'tube', pos: [0, y, 0], path, r, closed: true, steps: 64, seg: 7, mat };
    }

    // A scallop shell standing on its hinge: a half round of pearl with n ribs fanned out over it,
    // each a long lens. Returns where the rib tips are, so the caller can set a light on each.
    function shellFan(P, hinge, halfW, rise, n, mats, back, tilt, thick) {
        const tips = [], spread = 1.36;
        const wid = Math.max(0.2, ((halfW + rise) / 2) * ((2 * spread) / (n - 1)) * 0.78);
        const ct = Math.cos(tilt), st = Math.sin(tilt);
        // the half round: a disc cut in two, stood on its cut edge and leant back with the ribs
        P.push(C([hinge[0], hinge[1], hinge[2] - 0.04], 1, 1, 0.05, back, { thetaStart: PI / 2, thetaLength: PI, seg: 24, scale: [halfW * 0.96, 1, rise * 0.96], rot: [PI / 2 + tilt, 0, 0] }));
        for (let i = 0; i < n; i++) {
            const a = (i / (n - 1) - 0.5) * 2 * spread;
            const tx = Math.sin(a) * halfW, ty = Math.cos(a) * rise;
            P.push(S([hinge[0] + tx / 2, hinge[1] + (ty / 2) * ct, hinge[2] + (ty / 2) * st], 0.5, mats[i % mats.length], { scale: [wid, Math.hypot(tx, ty) * 1.04, thick], rot: [tilt, 0, -Math.atan2(tx, ty)] }));
            tips.push([hinge[0] + tx, hinge[1] + ty * ct, hinge[2] + ty * st]);
        }
        return tips;
    }

    // Where the waterfall comes down: the accent wall when it is free, else a wall without the door
    function fallSpot(th) {
        const free = (w) => w !== 'north' && w !== th.door.wall;
        const wall = free(th.accent.wall) ? th.accent.wall : ['west', 'east', 'south'].find(free);
        return { wall, along: s3WallLength(wall) / 2 };
    }

    // ---- Six rooms -----------------------------------------------------------------------------
    // The same fields as the atomic themes, plus: glowA and glowB (the room's two light colours),
    // rock and moss (its stone and its greenery), wallKind, tableKind and chairKind (which of the
    // two builds each piece takes), and the fields the renderer reads: fill, fog, lights, grade,
    // bloom, floorMat and wallHeight.
    const base = {
        style: 'wonder', outside: 'sanctuary', prints: [],
        ambient: 0.56, env: 0.8, exposure: 1.02, vignette: 0.34, bloom: [0.3, 0.6, 0.92],
        cat: '#F4EEE2',
    };

    // Coloured lights by the crystal clusters. The first two are the only ones lit at the Low
    // preset, so they are the two opposite corners; then the waterfall, the other corners, the door.
    function lightsFor(th) {
        const k = th.time === 'night' ? 1.2 : th.time === 'dusk' ? 1.15 : th.time === 'golden hour' ? 1 : 0.8;
        const fall = fallSpot(th);
        return [
            { pos: [0.7, 1.4, 0.7], color: th.glowA, intensity: 15 * k, distance: 10 },
            { pos: [COLS - 0.7, 1.4, ROWS - 0.7], color: th.glowB, intensity: 15 * k, distance: 10 },
            { pos: s3WallPoint(fall.wall, fall.along, 0.9, 0.8).pos, color: mix(th.glowB, '#FFFFFF', 0.4), intensity: 9 * k, distance: 8 },
            { pos: [COLS - 0.7, 1.4, 0.7], color: th.glowB, intensity: 8 * k, distance: 8 },
            { pos: [0.7, 1.4, ROWS - 0.7], color: th.glowA, intensity: 8 * k, distance: 8 },
            { pos: s3WallPoint(th.door.wall, th.door.at, 2.4, 0.9).pos, color: th.glowA, intensity: 6 * k, distance: 7 },
        ];
    }

    const themes = [
        {
            // teal and gold in a mossy hollow, with the low sun coming in amber
            name: 'Glow Hollow', time: 'golden hour', floor: 'moss', floorSeed: 5101, wallStyle: 'cluster', wallHeight: 2.2,
            wallKind: 'rock', tableKind: 'cap', chairKind: 'toadstool',
            sun: { azimuth: 34, elevation: 14, color: '#FFC78A', intensity: 2.6 },
            sky: { zenith: '#4E3A98', horizon: '#FFA06C', ground: '#2C5A4C' },
            lamp: { on: true, down: true, color: '#FFE4AE', intensity: 10 },
            walls: '#7868B8', accent: { wall: 'west', color: '#3F9C98' }, trim: '#3A2F68', ceiling: '#2A2256',
            glowA: '#3CF0D0', glowB: '#FFC94A', rock: '#5A5488', moss: '#4E9A68',
            couch: '#E8607A', pillow: '#FFC94A', couchWood: '#7A5238', chair: '#FF6F8E', table: '#F2DDB8',
            leaf: '#4FD08A', planter: '#7A7498', petbed: '#6FBF62',
            door: { wall: 'south', at: 3.5, color: '#A8703E' },
            fill: '#CDBEFF', ambient: 0.74, env: 0.9, fog: { color: '#5A4690', density: 0.013 }, grade: [1.05, 0.99, 1.0],
            floorMat: { bump: 0.7, normal: 0.6, metalness: 0, clearcoat: 0.25, reflect: 0.9, dust: [0.6, 0.27, 0.24, 0.2] },
        },
        {
            // pink and sky blue: pearl walls, warm sand, great eggs asleep in their nests
            name: 'Hatchling Nest', time: 'morning', floor: 'sand', floorSeed: 5207, wallStyle: 'egg', wallHeight: 1.7,
            wallKind: 'pearl', tableKind: 'cap', chairKind: 'toadstool',
            sun: { azimuth: -30, elevation: 36, color: '#FFF0DC', intensity: 3.0 },
            sky: { zenith: '#6CB6F0', horizon: '#FFD8E8', ground: '#86CCA4' },
            lamp: { on: true, down: true, color: '#FFF2D0', intensity: 6 },
            walls: '#E2C4E6', accent: { wall: 'east', color: '#9EDCF2' }, trim: '#8E6CB4', ceiling: '#3A2F74',
            glowA: '#FF7AC8', glowB: '#7FD8FF', rock: '#9A88B8', moss: '#7CCB7A',
            couch: '#7FC8F2', pillow: '#FF8FC8', couchWood: '#9A6E48', chair: '#FF8FB4', table: '#FBE6C4',
            leaf: '#6ED88A', planter: '#B8A8D0', petbed: '#8ED88A', cat: '#FFFFFF',
            door: { wall: 'west', at: 6, color: '#B8824A' },
            fill: '#F4CCE8', fog: { color: '#E8C8E8', density: 0.011 }, grade: [1.03, 1.0, 1.02], bloom: [0.27, 0.6, 0.93],
            floorMat: { bump: 0.5, normal: 0.45, metalness: 0, clearcoat: 0.15, reflect: 0.6, dust: [0.45, 0.1, 0.085, 0.07] },
        },
        {
            // honey gold and lime at midday: a grove to eat in, under giant mushrooms
            name: 'Honeydew Grove', time: 'noon', floor: 'honey', floorSeed: 5303, wallStyle: 'mushroom', wallHeight: 2.9,
            wallKind: 'rock', tableKind: 'cap', chairKind: 'toadstool',
            sun: { azimuth: -8, elevation: 56, color: '#FFFBE8', intensity: 3.2 },
            sky: { zenith: '#3FA6E8', horizon: '#D6FFE0', ground: '#6EC872' },
            lamp: { on: true, down: true, color: '#FFF6C8', intensity: 6 },
            walls: '#8ED0A0', accent: { wall: 'west', color: '#E8BC54' }, trim: '#3E7A58', ceiling: '#1F4A48',
            glowA: '#FFD23F', glowB: '#8CF05A', polish: '#8CF05A', rock: '#5E8A78', moss: '#5CB85C',
            couch: '#FF8A5C', pillow: '#B4F03C', couchWood: '#7A5A3A', chair: '#FF6A4E', table: '#FFF0C8',
            leaf: '#58C86A', planter: '#8AA89A', petbed: '#9ADB6A', cat: '#F6D8A8',
            door: { wall: 'east', at: 6, color: '#A87840' },
            fill: '#CCF2C4', fog: { color: '#C8F0D0', density: 0.01 }, grade: [1.02, 1.02, 0.97], bloom: [0.27, 0.6, 0.93],
            floorMat: { bump: 0.6, normal: 0.5, metalness: 0.05, clearcoat: 0.4, reflect: 1.0, dust: [0.45, 0.1, 0.09, 0.08] },
        },
        {
            // sky blue and rose, high among the clouds: pale marble, stones that hang in the air
            name: 'Skywatch Roost', time: 'afternoon', floor: 'cloud', floorSeed: 5411, wallStyle: 'stones', wallHeight: 3.6,
            wallKind: 'pearl', tableKind: 'slab', chairKind: 'shell', rainbow: true,
            sun: { azimuth: -48, elevation: 28, color: '#FFE6C4', intensity: 2.8 },
            sky: { zenith: '#4688E0', horizon: '#FFE2C8', ground: '#BCD8F2' },
            lamp: { on: true, down: true, color: '#F2F6FF', intensity: 7 },
            walls: '#B4C6F2', accent: { wall: 'west', color: '#F4B6CE' }, trim: '#5E6CAE', ceiling: '#28326E',
            glowA: '#5CC8FF', glowB: '#FF8FA0', rock: '#8A94C0', moss: '#74C8A0',
            couch: '#5CC8FF', pillow: '#FF8FA0', couchWood: '#8A7A6A', chair: '#7FA8FF', table: '#EEF0FA',
            leaf: '#5CD8A0', planter: '#A8B0CC', petbed: '#C4B4F0', cat: '#FFFFFF',
            door: { wall: 'south', at: 10.5, color: '#9C7A56' },
            fill: '#CCDEFF', fog: { color: '#D0DCF8', density: 0.012 }, grade: [0.99, 1.0, 1.05], bloom: [0.26, 0.58, 0.94],
            floorMat: { bump: 0.35, normal: 0.35, metalness: 0.05, clearcoat: 0.7, reflect: 1.3, dust: [0.45, 0.1, 0.09, 0.08] },
        },
        {
            // violet and cyan at dusk: a deep cave where the crystals grow as tall as trees
            name: 'Crystal Cavern', time: 'dusk', floor: 'slate', floorSeed: 5501, wallStyle: 'spire', wallHeight: 3.8,
            wallKind: 'rock', tableKind: 'slab', chairKind: 'shell',
            sun: { azimuth: 60, elevation: 9, color: '#FF9EC6', intensity: 1.8 },
            sky: { zenith: '#2A1E5E', horizon: '#C85A9E', ground: '#1E1A3E' },
            lamp: { on: true, down: true, color: '#E8D8FF', intensity: 12 },
            walls: '#5E52A6', accent: { wall: 'east', color: '#2F7FAE' }, trim: '#2A2458', ceiling: '#17133A',
            glowA: '#B26BFF', glowB: '#3CE6FF', rock: '#3C3668', moss: '#3E8A7A',
            couch: '#8A5CE0', pillow: '#3CE6FF', couchWood: '#3A3458', chair: '#7A5CE0', table: '#3A3566',
            leaf: '#3CE6C8', planter: '#4A4474', petbed: '#5A4E9E', cat: '#D8D0F0',
            door: { wall: 'west', at: 6, color: '#6A4A7A' },
            fill: '#B0A0F4', ambient: 0.85, env: 1.0, exposure: 1.1, fog: { color: '#2A1E5A', density: 0.016 }, grade: [1.0, 0.96, 1.1],
            floorMat: { bump: 0.8, normal: 0.6, metalness: 0.3, clearcoat: 0.6, reflect: 1.6, dust: [0.7, 0.22, 0.2, 0.19] },
        },
        {
            // aurora green and magenta at night: pearl columns on a floor like still water
            name: 'Aurora Sanctum', time: 'night', floor: 'glass', floorSeed: 5609, wallStyle: 'column', wallHeight: 4.8,
            wallKind: 'pearl', tableKind: 'slab', chairKind: 'shell', ribbons: true,
            sun: { azimuth: 14, elevation: 34, color: '#9FC8FF', intensity: 1.3 },
            sky: { zenith: '#050A2A', horizon: '#1E3A7A', ground: '#0A1430' },
            lamp: { on: true, down: true, color: '#D8F4FF', intensity: 13 },
            walls: '#4450A0', accent: { wall: 'south', color: '#2A7888' }, trim: '#20245A', ceiling: '#0C1034',
            glowA: '#5CFFB0', glowB: '#FF5CD6', rock: '#2E3470', moss: '#2E8A78',
            couch: '#4450A0', pillow: '#5CFFB0', couchWood: '#2A2E5E', chair: '#5C6AD0', table: '#2A3070',
            leaf: '#5CFFB0', planter: '#3A4080', petbed: '#2A7888', cat: '#E8ECFF',
            door: { wall: 'east', at: 6, color: '#3E4488' },
            fill: '#90A8F4', ambient: 0.85, env: 1.0, exposure: 1.12, fog: { color: '#0A1440', density: 0.015 }, grade: [0.94, 1.0, 1.12], bloom: [0.34, 0.62, 0.9],
            floorMat: { bump: 0.3, normal: 0.3, metalness: 0.35, clearcoat: 0.8, reflect: 2.0, dust: [0.72, 0.2, 0.2, 0.2] },
        },
    ].map((t) => {
        const th = Object.assign({}, base, t);
        th.lights = lightsFor(th);
        return th;
    });

    // ---- Furniture -----------------------------------------------------------------------------

    // A nest sofa: hoops of woven branch round a mossy body on root feet, plump cushions, and a
    // great scallop shell standing behind as its back, with a pearl of light on every rib
    function couch(lw, ld, th) {
        const P = [];
        const hw = lw / 2, hd = ld / 2;
        const wood = M('walnut', th.couchWood), twig = M('teak', mix(th.couchWood, '#D9A86A', 0.4));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(C([sx * (hw - 0.34), 0.1, sz * (hd - 0.24)], 0.1, 0.13, 0.2, wood, { seg: 7 }));
        P.push(B([0, 0.4, 0.02], [lw - 0.34, 0.44, ld - 0.3], M('moss', th.moss), { bevel: 0.14 }));
        P.push(hoop(0.3, hw - 0.14, hd - 0.12, 0.075, wood, 5, 0, true));
        P.push(hoop(0.44, hw - 0.11, hd - 0.1, 0.07, twig, 6, 1.6, true));
        P.push(hoop(0.58, hw - 0.14, hd - 0.12, 0.06, wood, 7, 3.1, true));
        const n = Math.max(1, Math.round(lw)), inner = lw - 0.44, cw = inner / n;
        const plush = M('velvet', th.couch);
        for (let i = 0; i < n; i++) P.push(S([-inner / 2 + cw * (i + 0.5), 0.72, 0.1], 0.5, plush, { scale: [cw * 1.02, 0.36, ld - 0.42] }));
        const ribs = [pearl(mix('#FFFFFF', th.pillow, 0.25)), pearl(mix('#FFFFFF', th.couch, 0.3))];
        const tips = shellFan(P, [0, 0.56, -hd + 0.2], hw - 0.12, 1.22, Math.max(5, n * 2 + 1), ribs, pearl(mix('#FFFFFF', th.couch, 0.5)), -0.1, 0.13);
        for (const tip of tips) P.push(S(tip, 0.055, glow(th.glowA, 1.6), { tag: 'pulse', noShadow: true }));
        P.push(S([0, 0.6, -hd + 0.25], 0.15, M('gold'), { scale: [1.3, 1, 0.6] }));
        P.push(S([hw - 0.62, 0.95, -0.04], 0.5, M('velvet', th.pillow), { scale: [0.42, 0.3, 0.2], rot: [-0.3, 0, 0.3] }));
        // buds of light caught in the lowest hoop, down where the vacuum looks
        for (const x of [-hw * 0.52, 0.08, hw * 0.56]) P.push(S([x, 0.3, hd - 0.07], 0.05, glow(th.glowB, 1.5), { tag: 'pulse', noShadow: true }));
        return P;
    }

    // Two tables. The cap: a giant flat mushroom on a stout stem, gills glowing underneath, with a
    // nest of three glowing eggs on top. The slab: polished stone on a rock, crowned with crystals.
    function table(lw, ld, th) {
        const P = [];
        const rx = lw / 2 - 0.08, rz = ld / 2 - 0.08;
        if (th.tableKind === 'slab') {
            const stone = rock(th.rock);
            P.push(C([0, 0.1, 0], 0.42, 0.56, 0.2, stone, { seg: 7 }));
            P.push(C([0, 0.5, 0], 0.3, 0.4, 0.62, stone, { seg: 6, rot: [0, 0.4, 0] }));
            P.push(B([0, 0.83, 0], [lw - 0.7, 0.03, ld - 0.7], glow(th.glowA, 1.6), { tag: 'pulse', noShadow: true }));
            const pts = [];
            for (let i = 0; i < 14; i++) {
                const a = (i / 14) * PI * 2, k = 1 + 0.05 * Math.sin(a * 3 + 0.7);
                pts.push([Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.55) * rx * k, Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.55) * rz * k]);
            }
            P.push({ shape: 'extrude', pos: [0, 0.85, 0], points: pts, depth: 0.09, bevel: 0.02, mat: M('marble', th.table) });
            P.push(shard([0, 0.94, 0], 0.62, 0.1, crystal(th.glowA, 1.5), 0, 0, { tag: 'pulse', noShadow: true }));
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * PI * 2 + 0.6;
                P.push(shard([Math.cos(a) * 0.13, 0.94, Math.sin(a) * 0.13], 0.3 + (i % 2) * 0.12, 0.065, crystal(i % 2 ? th.glowA : th.glowB, 1.3), 0.45, a, { noShadow: true }));
            }
            P.push(gem([0, 1.78, 0], 0.09, crystal(th.glowB, 1.8), { scale: [1, 1.5, 1], tag: 'spin', speed: 0.8, noShadow: true }));
            return P;
        }
        P.push(C([0, 0.07, 0], 0.34, 0.46, 0.14, M('moss', th.moss), { seg: 9 }));
        P.push(lathe([0, 0.1, 0], [[0.36, 0], [0.25, 0.14], [0.19, 0.4], [0.2, 0.62], [0.3, 0.76]], pearl('#F3EAD8')));
        P.push(C([0, 0.875, 0], 0.95, 0.3, 0.07, glow(th.glowA, 1.1), { open: true, scale: [rx, 1, rz], tag: 'pulse', noShadow: true }));
        P.push(lathe([0, 0, 0], [[0.93, 0.905], [1.0, 0.94], [0.985, 0.99], [0.82, 1.03], [0.45, 1.05], [0, 1.055]], pearl(th.table), { scale: [rx, 1, rz] }));
        P.push(R([0, 0.925, 0], 1.0, 0.016, glow(th.glowB, 1.6), { scale: [rx, rz, 1], noShadow: true }));
        P.push(R([0, 1.09, 0], 0.27, 0.055, M('teak', mix(th.couchWood, '#D9A86A', 0.4))));
        P.push(C([0, 1.07, 0], 0.25, 0.25, 0.04, M('moss', th.moss)));
        const eggs = [th.glowA, th.glowB, th.pillow];
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * PI * 2 + 0.5;
            P.push(S([Math.cos(a) * 0.11, 1.2, Math.sin(a) * 0.11], 0.1, glow(mix(eggs[i], '#FFFFFF', 0.25), 1.2), { scale: [1, 1.35, 1], rot: tipTurn(0.25, PI / 2 - a), tag: 'pulse', noShadow: true }));
        }
        return P;
    }

    // Two seats. The toadstool: a spotted cap on a pale stem, its gills alight. The shell seat:
    // a cushion in a pearl cup with a small scallop fan for a back.
    function chair(lw, ld, th) {
        const P = [];
        if (th.chairKind === 'shell') {
            P.push(C([0, 0.06, 0], 0.26, 0.32, 0.12, rock(th.rock), { seg: 7 }));
            P.push(lathe([0, 0.1, 0], [[0.24, 0], [0.1, 0.2], [0.09, 0.45], [0.3, 0.68]], pearl(mix('#FFFFFF', th.chair, 0.2))));
            P.push(R([0, 0.72, 0], 0.3, 0.018, glow(th.glowA, 1.5), { tag: 'pulse', noShadow: true }));
            P.push(S([0, 0.86, 0.04], 0.5, M('velvet', th.chair), { scale: [0.66, 0.3, 0.6] }));
            const ribs = [pearl(mix('#FFFFFF', th.chair, 0.3)), pearl(mix('#FFFFFF', th.pillow, 0.25))];
            const tips = shellFan(P, [0, 0.78, -0.28], 0.4, 0.84, 5, ribs, pearl(mix('#FFFFFF', th.chair, 0.5)), -0.16, 0.1);
            P.push(S(tips[2], 0.05, glow(th.glowB, 1.7), { tag: 'pulse', noShadow: true }));
            return P;
        }
        P.push(C([0, 0.05, 0], 0.2, 0.27, 0.1, M('moss', th.moss), { seg: 8 }));
        P.push(lathe([0, 0.06, 0], [[0.2, 0], [0.13, 0.16], [0.11, 0.5], [0.16, 0.74]], pearl('#F3EAD8')));
        P.push(C([0, 0.84, 0], 0.38, 0.14, 0.08, glow(th.glowA, 1.1), { open: true, tag: 'pulse', noShadow: true }));
        P.push(lathe([0, 0, 0], [[0.36, 0.87], [0.42, 0.91], [0.4, 1.0], [0.3, 1.1], [0.14, 1.17], [0, 1.18]], M('vinyl', th.chair)));
        const spot = pearl('#FFF6E8');
        for (const [x, y, z, r] of [[0.22, 1.12, 0.1, 0.06], [-0.2, 1.125, 0.12, 0.055], [-0.08, 1.13, -0.22, 0.06], [0.05, 1.175, -0.02, 0.045]]) {
            P.push(S([x, y, z], r, spot, { scale: [1, 0.45, 1], noShadow: true }));
        }
        return P;
    }

    // A lantern flower in a stone urn: fern fronds, a tall stem, six pearl petals round a heart of
    // light, little mushrooms glowing at the foot and two wisps keeping it company
    function plant(lw, ld, th, seed) {
        const P = [];
        const rnd = s3Rand(seed || 1);
        const heart = (seed || 1) % 2 ? th.glowA : th.glowB, other = heart === th.glowA ? th.glowB : th.glowA;
        P.push(lathe([0, 0, 0], [[0.2, 0], [0.31, 0.06], [0.34, 0.3], [0.26, 0.47], [0.3, 0.54], [0.27, 0.56]], M('stone', th.planter)));
        P.push(C([0, 0.5, 0], 0.26, 0.26, 0.06, M('moss', th.moss)));
        P.push(R([0, 0.3, 0], 0.345, 0.014, glow(th.glowA, 1.5), { tag: 'pulse', noShadow: true }));
        const greens = [th.leaf, s3Shade(th.leaf, 0.78), mix(th.leaf, th.glowA, 0.35)];
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * PI * 2 + rnd() * 0.5, h = 0.5 + rnd() * 0.4, tilt = 0.35 + rnd() * 0.3;
            const up = leanDir(tilt, a);
            P.push(B([Math.cos(a) * 0.1 + (up[0] * h) / 2, 0.52 + (up[1] * h) / 2, Math.sin(a) * 0.1 + (up[2] * h) / 2], [0.17, h, 0.02], M('leaf', greens[i % 3]), { bevel: 0.008, taper: 0.85, rot: tipTurn(tilt, PI / 2 - a) }));
        }
        const top = 1.5 + rnd() * 0.35, hx = (rnd() - 0.5) * 0.24, hz = (rnd() - 0.5) * 0.2;
        P.push(tube([0, 0.5, 0], [[0, 0, 0], [hx * 0.1 - 0.05, (top - 0.5) * 0.4, hz * 0.3], [hx * 0.75, (top - 0.5) * 0.8, hz * 0.8], [hx, top - 0.5, hz]], 0.028, M('leaf', s3Shade(th.leaf, 0.7)), { steps: 16, seg: 6 }));
        P.push(S([hx, top, hz], 0.1, glow(heart, 1.8), { tag: 'pulse', noShadow: true }));
        const petal = pearl(mix(th.pillow, '#FFFFFF', 0.25));
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * PI * 2 + 0.3, up = leanDir(0.95, a);
            P.push(S([hx + up[0] * 0.19, top + up[1] * 0.19, hz + up[2] * 0.19], 0.5, petal, { scale: [0.15, 0.42, 0.05], rot: tipTurn(0.95, PI / 2 - a), noShadow: true }));
        }
        for (let i = 0; i < 3; i++) {
            const a = rnd() * PI * 2, onSoil = i === 2;
            P.push(lathe([Math.cos(a) * (onSoil ? 0.15 : 0.4), onSoil ? 0.53 : 0, Math.sin(a) * (onSoil ? 0.15 : 0.4)], shroomProfile(0.16 + rnd() * 0.1, 0.06 + rnd() * 0.03), glow(other, 1.3), { tag: 'pulse', noShadow: true }));
        }
        for (let i = 0; i < 2; i++) P.push(S([(rnd() - 0.5) * 0.6, top - 0.4 + rnd() * 0.6, (rnd() - 0.5) * 0.6], 0.035, glow(other, 2), { tag: 'float', noShadow: true }));
        return P;
    }

    // A round nest of twigs lined with moss, an egg tucked in beside the sleeping cat
    function petbed(lw, ld, th) {
        const rx = lw * 0.46, rz = ld * 0.44;
        const wood = M('walnut', '#6B4A32'), twig = M('teak', '#A9793F');
        return [
            hoop(0.09, rx, rz, 0.085, wood, 5, 0),
            hoop(0.2, rx * 0.98, rz * 0.98, 0.075, twig, 6, 1.4),
            hoop(0.3, rx, rz, 0.06, wood, 7, 2.9),
            C([0, 0.12, 0], 0.5, 0.5, 0.2, M('moss', th.petbed), { scale: [rx * 1.8, 1, rz * 1.8] }),
            S([-rx * 0.62, 0.3, -rz * 0.5], 0.09, pearl(mix(th.glowB, '#FFFFFF', 0.5)), { scale: [1, 1.3, 1], rot: [0.3, 0, 0.5] }),
            S([rx * 0.75, 0.37, rz * 0.62], 0.045, glow(th.glowA, 1.6), { tag: 'pulse', noShadow: true }),
            S([-rx * 0.8, 0.36, rz * 0.55], 0.04, glow(th.glowB, 1.6), { tag: 'pulse', noShadow: true }),
        ].concat(s3Cat(th));
    }

    // Interior walls, one tile each: a crystal cluster on a boulder, a great egg in its nest, a
    // giant mushroom, a stack of floating stones, a crystal spire, a pearl column wound with a vine
    function wall(obs, th) {
        const P = [];
        const lw = obs.w, ld = obs.h;
        const rnd = s3Rand(obs.col * 31 + obs.row * 7 + 5);
        const two = [th.glowA, th.glowB];
        const stone = rock(th.rock), moss = M('moss', th.moss);
        switch (th.wallStyle) {
            case 'cluster': {
                P.push(boulder([0, 0.26, 0], 0.56, stone, { scale: [lw, 0.8, ld], rot: [0, rnd() * 6, 0] }));
                P.push(S([0, 0.58, 0], 0.5, moss, { scale: [lw * 0.72, 0.3, ld * 0.72] }));
                for (let i = 0; i < 3; i++) {
                    const a = rnd() * PI * 2, d = i ? 0.2 : 0.03;
                    const col = two[(i + (rnd() > 0.5 ? 1 : 0)) % 2];
                    P.push(shard([Math.cos(a) * d * lw, 0.5, Math.sin(a) * d * ld], i ? 0.7 + rnd() * 0.5 : 1.5 + rnd() * 0.5, i ? 0.13 : 0.2, crystal(col, i ? 1.2 : 1.5), i ? 0.25 + rnd() * 0.2 : rnd() * 0.1, a, { tag: i ? undefined : 'pulse', noShadow: true }));
                }
                const a = rnd() * PI * 2;
                P.push(shard([Math.cos(a) * 0.26 * lw, 0.5, Math.sin(a) * 0.26 * ld], 0.44, 0.085, crystal(two[rnd() > 0.5 ? 0 : 1], 1.5), 0.8, a, { noShadow: true }));
                break;
            }
            case 'egg': {
                const tint = mix([th.glowA, th.glowB, th.pillow][Math.floor(rnd() * 3)], '#FFFFFF', 0.45);
                P.push(C([0, 0.14, 0], 0.4, 0.47, 0.28, moss, { scale: [lw, 1, ld] }));
                P.push(R([0, 0.22, 0], 0.37, 0.15, M('walnut', th.couchWood), { scale: [lw, ld, 1] }));
                P.push(hoop(0.4, 0.4 * lw, 0.4 * ld, 0.05, M('teak', mix(th.couchWood, '#D9A86A', 0.4)), 6, rnd() * 6));
                P.push(R([0, 0.45, 0], 0.33, 0.028, glow(th.glowA, 1.5), { scale: [lw, ld, 1], tag: 'pulse', noShadow: true }));
                P.push(lathe([(rnd() - 0.5) * 0.06, 0.24, (rnd() - 0.5) * 0.06], eggProfile(0.4, 1.36), pearl(tint), { texture: 'wonder:scales', texRepeat: [5, 3], rot: [(rnd() - 0.5) * 0.14, rnd() * 6, (rnd() - 0.5) * 0.14] }));
                const a = rnd() * PI * 2;
                P.push(S([Math.cos(a) * 0.42 * lw, 0.36, Math.sin(a) * 0.42 * ld], 0.055, glow(th.glowB, 1.7), { tag: 'pulse', noShadow: true }));
                break;
            }
            case 'mushroom': {
                const cap = two[Math.floor(rnd() * 2)];
                P.push(S([0, 0.04, 0], 0.5, moss, { scale: [lw * 0.96, 0.36, ld * 0.96] }));
                P.push(lathe([0, 0, 0], [[0.32, 0], [0.22, 0.4], [0.17, 1.3], [0.2, 2.0], [0.3, 2.14]], pearl('#F3EAD8')));
                P.push(R([0, 1.5, 0], 0.2, 0.05, pearl('#FFF4DC')));
                P.push(C([0, 2.2, 0], 0.64, 0.2, 0.14, glow(mix(cap, '#FFFFFF', 0.3), 1.2), { open: true, tag: 'pulse', noShadow: true }));
                P.push(lathe([0, 0, 0], [[0.62, 2.26], [0.7, 2.33], [0.66, 2.52], [0.48, 2.72], [0.22, 2.84], [0, 2.87]], Object.assign(M('glow', cap), { emissiveIntensity: 0.7, roughness: 0.35 }), { tag: 'pulse' }));
                const a = rnd() * PI * 2;
                P.push(lathe([Math.cos(a) * 0.38 * lw, 0.1, Math.sin(a) * 0.38 * ld], shroomProfile(0.3 + rnd() * 0.14, 0.12), glow(cap === two[0] ? two[1] : two[0], 1.3), { tag: 'pulse', noShadow: true }));
                break;
            }
            case 'stones': {
                const pale = rock(mix(th.rock, '#FFFFFF', 0.3)), paler = rock(mix(th.rock, '#FFFFFF', 0.5));
                P.push(boulder([0, 0.24, 0], 0.56, stone, { scale: [lw, 0.78, ld], rot: [0, rnd() * 6, 0] }));
                P.push(gem([0, 0.86, 0], 0.13, crystal(th.glowA, 1.6), { tag: 'pulse', noShadow: true }));
                let y = 1.3;
                for (let i = 0; i < 3; i++) {
                    const r = 0.36 - i * 0.07;
                    P.push(boulder([(rnd() - 0.5) * 0.16, y, (rnd() - 0.5) * 0.16], r, i === 1 ? paler : pale, { scale: [1.15, 0.62, 1.1], rot: [rnd() * 0.3, rnd() * 6, rnd() * 0.3], tag: 'float' }));
                    y += r * 1.24 + 0.34;
                }
                P.push(gem([0, y + 0.05, 0], 0.12, crystal(th.glowB, 1.7), { scale: [1, 1.7, 1], tag: 'spin', speed: 0.6 + rnd() * 0.6, noShadow: true }));
                break;
            }
            case 'spire': {
                const c0 = two[rnd() > 0.5 ? 0 : 1], c1 = c0 === two[0] ? two[1] : two[0];
                P.push(boulder([0, 0.2, 0], 0.56, stone, { scale: [lw, 0.62, ld], rot: [0, rnd() * 6, 0] }));
                quartz(P, [(rnd() - 0.5) * 0.1, 0.2, (rnd() - 0.5) * 0.1], 3.0 + rnd() * 0.6, 0.27, crystal(c0, 1.25), rnd() * 0.06, rnd() * PI * 2, { tag: 'pulse' });
                for (let i = 0; i < 2; i++) {
                    const a = rnd() * PI * 2;
                    P.push(shard([Math.cos(a) * 0.22, 0.3, Math.sin(a) * 0.22], 1.0 + rnd() * 0.7, 0.17, crystal(i ? c1 : c0, 1.1), 0.18 + rnd() * 0.16, a, { noShadow: true }));
                }
                const a = rnd() * PI * 2;
                P.push(shard([Math.cos(a) * 0.26, 0.34, Math.sin(a) * 0.26], 0.5, 0.09, crystal(c1, 1.5), 0.8, a, { noShadow: true }));
                break;
            }
            default: {
                // column
                const shaft = pearl(mix(th.walls, '#FFFFFF', 0.62));
                P.push(C([0, 0.13, 0], 0.42, 0.49, 0.26, shaft, { seg: 8, scale: [lw, 1, ld] }));
                P.push(lathe([0, 0.26, 0], [[0.36, 0], [0.29, 0.22], [0.26, 2.0], [0.28, 3.9], [0.36, 4.16]], shaft, { texture: 'wonder:pearl', texRepeat: [2, 3] }));
                P.push(C([0, H - 0.19, 0], 0.48, 0.34, 0.38, shaft, { seg: 8 }));
                const turns = 2.25, n = 18, way = rnd() > 0.5 ? 1 : -1, ph = rnd() * PI * 2;
                const path = [];
                for (let i = 0; i <= n; i++) {
                    const k = i / n, a = ph + way * k * turns * PI * 2;
                    path.push([Math.cos(a) * 0.31, 0.3 + k * 3.9, Math.sin(a) * 0.31]);
                }
                P.push(tube([0, 0, 0], path, 0.036, glow(th.glowA, 1.5), { steps: 72, seg: 6, tag: 'pulse', noShadow: true }));
                for (const k of [0.07, 0.3]) {
                    const a = ph + way * k * turns * PI * 2;
                    P.push(S([Math.cos(a) * 0.36, 0.3 + k * 3.9, Math.sin(a) * 0.36], 0.075, glow(th.glowB, 1.7), { tag: 'pulse', noShadow: true }));
                }
            }
        }
        return P;
    }

    // The dock: a smooth stone pad ringed with light and small crystals, tall crystals at its back.
    // The middle stays flat and clear, because the vacuum parks there. The ring and the beacon
    // have materials of their own, since the renderer drives their light directly.
    function dock(th) {
        const P = [];
        const small = crystal(th.glowA, 1.61), smallB = crystal(th.glowB, 1.61);
        P.push(C([0, 0.02, 0], 0.44, 0.47, 0.04, M('marble', mix(th.walls, '#FFFFFF', 0.6))));
        P.push(R([0, 0.046, 0], 0.36, 0.014, Object.assign(M('glow', th.glowA), { emissiveIntensity: 0.61 }), { tag: 'dockRing', noShadow: true }));
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * PI * 2 + PI / 10, z = Math.sin(a) * 0.43;
            if (z < -0.3) continue;
            P.push(gem([Math.cos(a) * 0.43, 0.05, z], 0.04, i % 2 ? small : smallB, { scale: [1, 1.5, 1], rot: [0, a, 0], noShadow: true }));
        }
        P.push(boulder([0, 0.06, -0.42], 0.16, rock(th.rock), { scale: [2.2, 0.8, 0.45] }));
        P.push(shard([0, 0, -0.42], 1.25, 0.1, Object.assign(M('crystal', th.glowB), { emissiveIntensity: 1.71 }), 0, 0, { tag: 'blink', noShadow: true }));
        P.push(shard([-0.2, 0, -0.4], 0.6, 0.07, small, 0.3, PI, { noShadow: true }));
        P.push(shard([0.2, 0, -0.4], 0.7, 0.07, smallB, 0.3, 0, { noShadow: true }));
        return P;
    }

    // ---- The room ------------------------------------------------------------------------------

    function architecture(levelIndex, th) {
        const rnd = s3Rand(th.floorSeed + 31);
        const two = [th.glowA, th.glowB];
        const pearly = th.wallKind === 'pearl';
        const wallMat = (wl) => {
            const color = wl === th.accent.wall ? th.accent.color : th.walls;
            return pearly ? Object.assign(M('pearl', color), { roughness: 0.45, clearcoat: 0.5 }) : M('stone', color);
        };
        const P = s3Shell(th, { mat: wallMat, wallTex: pearly ? 'wonder:pearl' : 'wonder:rock', rep: [0.34, 1.6], ceilMat: M('stone', th.ceiling), ceilTex: 'wonder:sky' });
        const stone = rock(th.rock), moss = M('moss', th.moss), vine = M('leaf', s3Shade(th.leaf, 0.7));
        const mid = (W.x0 + W.x1) / 2, span = W.x1 - W.x0, wh = W.top - W.sill;
        const fall = fallSpot(th), door = th.door;

        // Moss at the foot of every wall, glowing mushrooms growing out of it, and stalactites above
        for (const wl of ['north', 'south', 'west', 'east']) {
            const len = s3WallLength(wl);
            const lo = s3WallPoint(wl, len / 2, 0.07, 0.05);
            P.push(B(lo.pos, [len, 0.14, 0.1], moss, { rot: [0, lo.yaw, 0], bevel: 0.04 }));
            for (let along = 1.3 + rnd() * 0.8; along < len - 1; along += 2.3 + rnd() * 1.2) {
                const h = 0.22 + rnd() * 0.2, r = 0.07 + rnd() * 0.05, inset = 0.13 + rnd() * 0.06, col = two[Math.floor(rnd() * 2)];
                if (wl === door.wall && Math.abs(along - door.at) < 1.5) continue;
                if (wl === fall.wall && Math.abs(along - fall.along) < 1.3) continue;
                P.push(lathe(s3WallPoint(wl, along, 0, inset).pos, shroomProfile(h, r), glow(col, 1.3), { tag: 'pulse', noShadow: true }));
            }
        }
        for (let i = 0; i < 6; i++) {
            const wl = ['south', 'west', 'east', 'north', 'south', 'west'][i], len = s3WallLength(wl);
            const h = 0.5 + rnd() * 0.7;
            let along = 1.5 + rnd() * (len - 3);
            if (wl === 'north' && along > W.x0 - 0.6) along = W.x0 - 0.8 - rnd() * 4;
            if (wl === fall.wall && Math.abs(along - fall.along) < 1.6) along += 3.2;
            P.push(C(s3WallPoint(wl, along, H - h / 2, 0.2 + rnd() * 0.12).pos, 0.13 + rnd() * 0.06, 0, h, stone, { seg: 6, noShadow: true }));
        }

        // Window: an arch of rock over a mossy sill, crystals in its shoulders and at its crown,
        // vines hanging down, and a great fern frond in front of the glass whose leaves are the blinds
        P.push(B([mid, W.sill - 0.07, 0.08], [span + 0.6, 0.16, 0.44], stone, { bevel: 0.06 }));
        P.push(B([mid, W.sill + 0.02, 0.1], [span + 0.36, 0.05, 0.32], moss, { bevel: 0.02 }));
        for (const s of [-1, 1]) {
            const x = s < 0 ? W.x0 - 0.13 : W.x1 + 0.13;
            P.push(B([x, W.sill + wh / 2 - 0.1, 0], [0.3, wh + 0.1, 0.24], stone, { bevel: 0.09 }));
            P.push(boulder([mid + s * (span / 2 - 0.12), W.top - 0.08, 0.02], 0.3, stone, { scale: [1.2, 0.9, 0.5], rot: [0, s * 0.5, 0] }));
            P.push(shard([mid + s * (span / 2 - 0.2), W.top - 0.1, 0.1], 0.8, 0.09, crystal(s < 0 ? th.glowA : th.glowB, 1.5), 0.5, s < 0 ? PI * 0.9 : PI * 0.1, { tag: 'pulse', noShadow: true }));
            P.push(shard([mid + s * (span / 2 - 0.05), W.top - 0.2, 0.1], 0.5, 0.07, crystal(s < 0 ? th.glowB : th.glowA, 1.3), 1.1, s < 0 ? PI : 0, { noShadow: true }));
        }
        P.push({ shape: 'torus', pos: [mid, W.top - 0.62, 0], r: span / 2 + 0.12, tube: 0.17, arc: PI, scale: [1, 0.46, 1], mat: stone });
        P.push(gem([mid, W.top + 0.3, 0.12], 0.16, crystal(th.glowA, 1.7), { scale: [1, 1.5, 1], tag: 'pulse', noShadow: true }));
        P.push(B([mid, W.sill + wh / 2, -0.08], [0.07, wh, 0.07], vine, { bevel: 0.03 }));
        for (let i = 0; i < 7; i++) {
            const y = W.top - 0.2 - i * 0.2, leafMat = M('leaf', i % 2 ? th.leaf : mix(th.leaf, th.glowA, 0.3));
            for (const s of [-1, 1]) P.push(S([mid + s * (span / 4 - 0.005), y, -0.06], 0.5, leafMat, { scale: [span / 2 - 0.04, 0.03, 0.2], rot: [0.6, 0, -s * 0.07], tag: 'slat' }));
        }
        P.push(s3WindowGlass(mix(th.glowB, '#E8F6FF', 0.75), 0.14));
        [[W.x0 + 0.1, 1.5, 0.12], [W.x1 - 0.14, 1.9, -0.1], [W.x0 - 0.3, 2.3, -0.06]].forEach(([x, drop, sway], i) => {
            P.push(tube([x, W.top + 0.2, 0.14], [[0, 0, 0], [sway, -drop * 0.35, 0.03], [-sway * 0.6, -drop * 0.7, 0.05], [sway * 0.4, -drop, 0.04]], 0.022, vine, { steps: 18, seg: 6 }));
            P.push(S([x + sway * 0.4, W.top + 0.15 - drop, 0.18], 0.06, glow(two[i % 2], 1.7), { tag: 'pulse', noShadow: true }));
        });
        [[mid - 0.9, 0.5], [mid + 0.45, 0.8], [mid + 1.2, 0.36]].forEach(([x, drop], i) => {
            P.push({ shape: 'rod', from: [x, W.top + 0.12, 0.16], to: [x, W.top - drop, 0.16], r: 0.006, mat: M('gold') });
            P.push(gem([x, W.top - drop - 0.1, 0.16], 0.07, crystal(two[(i + 1) % 2], 1.6), { scale: [1, 1.8, 1], tag: 'spin', speed: 0.5 + i * 0.25, noShadow: true }));
        });

        // A hatchling asleep on the sill: a curled body of pearl scales that breathes, its chin on
        // the moss, two small horns, a folded wing, and its tail brought round to its nose
        const hide = pearl(mix(th.glowA, '#FFFFFF', 0.3)), hx = mid - 0.95, hy = W.sill + 0.045, hz = 0.06;
        P.push(S([hx, hy + 0.13, hz], 0.5, hide, { scale: [0.5, 0.26, 0.3], texture: 'wonder:scales', texRepeat: [4, 3], tag: 'cat' }));
        P.push(S([hx + 0.3, hy + 0.11, hz + 0.04], 0.11, hide, { scale: [1.25, 0.9, 1], tag: 'catHead' }));
        P.push(S([hx + 0.41, hy + 0.08, hz + 0.04], 0.06, hide, { scale: [1.2, 0.8, 0.9] }));
        for (const s of [-1, 1]) P.push(C([hx + 0.24, hy + 0.23, hz + 0.04 + s * 0.05], 0, 0.025, 0.1, M('gold'), { rot: [0, 0, 0.7], noShadow: true }));
        P.push({ shape: 'torus', pos: [hx, hy + 0.045, hz], r: 0.3, tube: 0.04, arc: PI, scale: [1, 0.55, 1], rot: [PI / 2, 0, 0], mat: hide });
        P.push(S([hx - 0.05, hy + 0.25, hz - 0.02], 0.5, pearl(mix(th.glowB, '#FFFFFF', 0.35)), { scale: [0.34, 0.05, 0.22], rot: [0.35, 0, -0.15], noShadow: true }));

        // The lamp: a lantern flower hanging on a vine, pearl petals round a cluster of crystals
        const lx = S3_LAMP.x, lz = S3_LAMP.z, ly = H - 1.05;
        P.push(tube([lx, H, lz], [[0, 0, 0], [0.05, -0.35, 0.03], [-0.04, -0.7, -0.02], [0, -1.0, 0]], 0.03, vine, { steps: 16, seg: 6 }));
        P.push(lathe([lx, ly - 0.08, lz], [[0.2, 0], [0.25, 0.06], [0.17, 0.17], [0.05, 0.24]], vine));
        const petal = Object.assign(M('pearl', mix(th.glowB, '#FFFFFF', 0.45)), { emissive: th.glowB, emissiveIntensity: 0.35 });
        const bulbA = crystal(mix(th.lamp.color, th.glowA, 0.45), 2.0), bulbB = crystal(mix(th.lamp.color, th.glowB, 0.45), 2.0);
        for (let i = 0; i < 6; i++) {
            const d = (i / 6) * PI * 2, up = leanDir(2.05, d);
            P.push(S([lx + up[0] * 0.38, ly + up[1] * 0.38, lz + up[2] * 0.38], 0.5, petal, { scale: [0.34, 0.8, 0.07], rot: tipTurn(2.05, PI / 2 - d), noShadow: true }));
            P.push(shard([lx, ly, lz], 0.6, 0.075, i % 2 ? bulbA : bulbB, 2.5, d + PI / 6, { tag: 'bulb', noShadow: true }));
        }
        P.push(gem([lx, ly - 0.42, lz], 0.11, crystal(th.lamp.color, 2.2), { scale: [1, 4.2, 1], tag: 'bulb', noShadow: true }));
        for (let i = 0; i < 3; i++) {
            const d = (i / 3) * PI * 2 + 0.4;
            P.push(S([lx + Math.cos(d) * 0.5, ly - 0.75 - i * 0.12, lz + Math.sin(d) * 0.5], 0.05, glow(th.lamp.color, 2.2), { tag: 'bulb', noShadow: true }));
        }

        // The door: dragon-hide wood below, a half moon of pearl above, in a pearl arch. On it a
        // ring of runes round an eye, all in light.
        const dw = 1.9, dr = dw / 2, dh = 2.6;
        const at = (along, y, inset) => s3WallPoint(door.wall, along, y, inset);
        const yaw = at(door.at, 0, 0).yaw;
        const frame = pearl(mix(th.walls, '#FFFFFF', 0.7));
        P.push(B(at(door.at, dh / 2, 0.03).pos, [dw, dh, 0.1], M('walnut', door.color), { rot: [0, yaw, 0], texture: 'wonder:scales', texRepeat: [4, 5], tag: 'door' }));
        P.push(C(at(door.at, dh, 0.03).pos, dr, dr, 0.1, pearl(mix(th.glowB, '#FFFFFF', 0.6)), { rot: [PI / 2, 0, 0], yawFix: yaw, seg: 32 }));
        P.push({ shape: 'torus', pos: at(door.at, dh, 0.06).pos, r: dr + 0.08, tube: 0.1, arc: PI, rot: [0, yaw, 0], mat: frame });
        for (const s of [-1, 1]) {
            P.push(B(at(door.at + s * (dr + 0.08), dh / 2, 0.06).pos, [0.2, dh, 0.2], frame, { rot: [0, yaw, 0], bevel: 0.06 }));
            P.push(gem(at(door.at + s * (dr + 0.5), 2.9, 0.16).pos, 0.1, crystal(s < 0 ? th.glowA : th.glowB, 1.6), { scale: [1, 1.8, 1], tag: 'pulse', noShadow: true }));
        }
        P.push({ shape: 'torus', pos: at(door.at, dh - 0.3, 0.09).pos, r: 0.74, tube: 0.035, rot: [0, yaw, 0], mat: M('gold') });
        P.push({ shape: 'plane', pos: at(door.at, dh - 0.3, 0.1).pos, size: [1.5, 1.5], rot: [0, yaw, 0], mat: Object.assign(M('holo', '#FFFFFF'), { opacity: 1 }), texture: 'wonder:runes', tag: 'pulse', noShadow: true });
        P.push(gem(at(door.at, dh - 0.3, 0.12).pos, 0.09, crystal(th.glowA, 1.8), { scale: [0.45, 1.5, 0.45], tag: 'pulse', noShadow: true }));
        P.push(B(at(door.at, 0.08, 0.14).pos, [dw + 0.5, 0.16, 0.26], stone, { rot: [0, yaw, 0], bevel: 0.04 }));

        // A crystal cluster in each corner, tight against both walls so nothing stands in the way
        [[0, 0, 1, 1], [COLS, ROWS, -1, -1], [COLS, 0, -1, 1], [0, ROWS, 1, -1]].forEach(([cx, cz, sx, sz], i) => {
            const a = Math.atan2(sz, sx);
            const main = i === 0 || i === 3 ? th.glowA : th.glowB, side = main === th.glowA ? th.glowB : th.glowA;
            P.push(boulder([cx + sx * 0.13, 0.16, cz + sz * 0.13], 0.26, stone, { scale: [1, 0.9, 1], rot: [0, rnd() * 6, 0] }));
            quartz(P, [cx + sx * 0.13, 0.1, cz + sz * 0.13], 2.3 + rnd() * 0.7, 0.13, crystal(main, 1.5), 0.05 + rnd() * 0.04, a, { tag: 'pulse', noShadow: true });
            P.push(shard([cx + sx * 0.24, 0.1, cz + sz * 0.1], 1.3 + rnd() * 0.5, 0.1, crystal(side, 1.3), 0.2, Math.atan2(sz * 0.12, sx), { noShadow: true }));
            P.push(shard([cx + sx * 0.1, 0.1, cz + sz * 0.24], 1.0 + rnd() * 0.5, 0.1, crystal(side, 1.3), 0.22, Math.atan2(sz, sx * 0.12), { noShadow: true }));
        });

        // The waterfall: two sheets of falling light from a lip of rock into a pool, with mist
        const fy = s3WallPoint(fall.wall, fall.along, 0, 0).yaw;
        const fp = (da, y, inset) => s3WallPoint(fall.wall, fall.along + da, y, inset).pos;
        const water = (opacity) => Object.assign(M('holo', '#FFFFFF'), { opacity });
        P.push({ shape: 'plane', pos: fp(0, 2.3, 0.05), size: [1.5, 4.4], rot: [0, fy, 0], mat: water(0.9), texture: 'wonder:falls', tag: 'flicker', noShadow: true });
        P.push({ shape: 'plane', pos: fp(0.12, 2.2, 0.1), size: [0.8, 4.2], rot: [0, fy, 0], mat: water(0.7), texture: 'wonder:falls', tag: 'flicker', noShadow: true });
        P.push(boulder(fp(0, H - 0.32, 0.14), 0.3, stone, { scale: [2.8, 0.8, 0.6], rot: [0, fy, 0] }));
        P.push(B(fp(0, 0.09, 0.18), [1.9, 0.18, 0.34], stone, { rot: [0, fy, 0], bevel: 0.08 }));
        P.push(B(fp(0, 0.175, 0.17), [1.6, 0.04, 0.24], glow(mix(th.glowB, '#FFFFFF', 0.4), 1.2), { rot: [0, fy, 0], tag: 'pulse', noShadow: true }));
        const haze = Object.assign(M('holo', mix(th.glowB, '#FFFFFF', 0.6)), { opacity: 0.16, emissiveIntensity: 0.9 });
        for (const [da, y, r] of [[-0.55, 0.34, 0.15], [-0.1, 0.42, 0.17], [0.35, 0.36, 0.16], [0.7, 0.3, 0.12]]) P.push(S(fp(da, y, 0.19), r, haze, { tag: 'float', noShadow: true }));

        // High under the stars: stones that hang in the air, a crystal growing under some of them,
        // and wisps of light drifting between
        const pale = rock(mix(th.rock, '#FFFFFF', 0.35));
        for (let i = 0; i < 6; i++) {
            let x = 1.5 + rnd() * (COLS - 3);
            const z = 1.5 + rnd() * (ROWS - 3), y = 3.75 + rnd() * 0.5, r = 0.22 + rnd() * 0.2;
            if (Math.hypot(x - lx, z - lz) < 1.6) x += 3;
            P.push(boulder([x, y, z], r, i % 2 ? stone : pale, { scale: [1.3, 0.6, 1.1], rot: [rnd() * 0.3, rnd() * 6, rnd() * 0.3], tag: 'float', noShadow: true }));
            if (i < 3) P.push(gem([x, y - r * 0.6 - 0.1, z], 0.07, crystal(two[i % 2], 1.7), { scale: [1, 2, 1], tag: 'float', noShadow: true }));
        }
        for (let i = 0; i < 8; i++) {
            P.push(S([1 + rnd() * (COLS - 2), 2.8 + rnd() * 1.4, 1 + rnd() * (ROWS - 2)], 0.04 + rnd() * 0.025, glow(i % 3 === 2 ? '#FFFFFF' : two[i % 2], 2.2), { tag: 'float', noShadow: true }));
        }
        // The last room has the aurora indoors: three veils of light under the ceiling
        if (th.ribbons) {
            const veil = Object.assign(M('holo', '#FFFFFF'), { opacity: 0.55 });
            for (const [x, z, turn, len] of [[5, 3.4, 0.25, 9], [9.5, 7, -0.2, 10], [6, 9.6, 0.12, 8]]) {
                P.push({ shape: 'plane', pos: [x, H - 0.75, z], size: [len, 1.4], rot: [0, turn, 0], mat: veil, texture: 'wonder:aurora', tag: 'pulse', noShadow: true });
            }
        }
        return P;
    }

    // ---- Painting: the floors, the world outside, the walls --------------------------------------

    // The average colour of each floor: the 2D palette is worked out from it
    const FLOOR_RGB = { moss: [98, 132, 122], sand: [216, 190, 146], honey: [228, 180, 84], cloud: [216, 222, 238], slate: [48, 44, 84], glass: [30, 36, 80] };

    // The whole floor, px pixels to a tile. One stone, slab or pane per tile so the grid still reads.
    function paintFloor(t, th, px) {
        const w = COLS * px, h = ROWS * px, u = px / 48;
        const rnd = seededRandom(th.floorSeed);
        const kind = th.floor, A = th.glowA, Bc = th.glowB;
        const tone = (c, k) => { const d = (rnd() - 0.5) * 2 * k; return `rgb(${Math.round(c[0] + d)},${Math.round(c[1] + d)},${Math.round(c[2] + d)})`; };
        const dot = (x, y, r, fill) => { t.fillStyle = fill; t.beginPath(); t.arc(x, y, r, 0, PI * 2); t.fill(); };
        const each = (fn) => { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) fn(c * px, r * px); };
        const seams = (color) => {
            t.fillStyle = color;
            for (let r = 0; r <= ROWS; r++) t.fillRect(0, r * px - 0.5 * u, w, u);
            for (let c = 0; c <= COLS; c++) t.fillRect(c * px - 0.5 * u, 0, u, h);
        };
        t.save();
        t.shadowBlur = 0;
        t.lineCap = 'round';
        if (kind === 'sand') {
            // warm sand pavers with ripples in them; here and there a tile is a pearly scallop shell
            t.fillStyle = '#C9A877';
            t.fillRect(0, 0, w, h);
            each((x, y) => {
                const shell = rnd() < 0.16;
                t.fillStyle = shell ? mix(rnd() > 0.5 ? A : Bc, '#FFF4E8', 0.62) : tone([224, 198, 152], 7);
                roundRect(t, x + 1.5 * u, y + 1.5 * u, px - 3 * u, px - 3 * u, 5 * u);
                t.fill();
                if (shell) {
                    t.strokeStyle = 'rgba(255,255,255,0.6)';
                    t.lineWidth = 1.2 * u;
                    for (let k = -3; k <= 3; k++) {
                        t.beginPath();
                        t.moveTo(x + px / 2, y + px * 0.86);
                        t.lineTo(x + px / 2 + Math.sin(k * 0.36) * px * 0.4, y + px * 0.86 - Math.cos(k * 0.36) * px * 0.68);
                        t.stroke();
                    }
                    dot(x + px / 2, y + px * 0.86, 2.2 * u, 'rgba(255,255,255,0.7)');
                } else {
                    t.strokeStyle = 'rgba(150,110,60,0.15)';
                    t.lineWidth = 0.8 * u;
                    for (let k = 0; k < 3; k++) {
                        const yy = y + px * (0.25 + 0.25 * k) + (rnd() - 0.5) * 4 * u;
                        t.beginPath();
                        t.moveTo(x + 5 * u, yy);
                        t.quadraticCurveTo(x + px * 0.3, yy - 3 * u, x + px * 0.5, yy);
                        t.quadraticCurveTo(x + px * 0.7, yy + 3 * u, x + px - 5 * u, yy);
                        t.stroke();
                    }
                }
            });
            for (let i = 0; i < 150; i++) dot(rnd() * w, rnd() * h, (0.5 + rnd() * 0.9) * u, rnd() > 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(150,110,70,0.3)');
        } else if (kind === 'honey') {
            // honey-gold hexagons, one to a tile, with amber diamonds between and a bead of light in each
            t.fillStyle = '#C48E36';
            t.fillRect(0, 0, w, h);
            each((x, y) => {
                const cx = x + px / 2, cy = y + px / 2, k = 0.5 * px - 0.9 * u;
                const g = t.createRadialGradient(cx - 5 * u, cy - 6 * u, 2 * u, cx, cy, px * 0.56);
                const d = (rnd() - 0.5) * 12;
                g.addColorStop(0, `rgb(${Math.round(248 + d * 0.4)},${Math.round(210 + d)},${Math.round(116 + d)})`);
                g.addColorStop(1, `rgb(${Math.round(228 + d)},${Math.round(178 + d)},${Math.round(78 + d)})`);
                t.fillStyle = g;
                t.beginPath();
                t.moveTo(cx - k, cy);
                t.lineTo(cx - k * 0.54, cy - k);
                t.lineTo(cx + k * 0.54, cy - k);
                t.lineTo(cx + k, cy);
                t.lineTo(cx + k * 0.54, cy + k);
                t.lineTo(cx - k * 0.54, cy + k);
                t.closePath();
                t.fill();
                t.strokeStyle = 'rgba(140,90,20,0.5)';
                t.lineWidth = u;
                t.stroke();
                t.fillStyle = 'rgba(255,250,220,0.16)';
                t.beginPath();
                t.ellipse(cx - 5 * u, cy - 8 * u, 9 * u, 4 * u, -0.4, 0, PI * 2);
                t.fill();
            });
            for (let r = 0; r <= ROWS; r++) {
                for (let c = 0; c <= COLS; c++) {
                    t.shadowColor = Bc;
                    t.shadowBlur = 4 * u;
                    dot(c * px, r * px, 1.5 * u, rgba(mix(Bc, '#FFFFFF', 0.3), 0.9));
                    t.shadowBlur = 0;
                }
            }
        } else if (kind === 'cloud') {
            // cloud-pale marble slabs, veined in every colour of the rainbow
            t.fillStyle = '#C6CEE6';
            t.fillRect(0, 0, w, h);
            each((x, y) => {
                t.fillStyle = tone([222, 228, 242], 5);
                t.fillRect(x + 0.6 * u, y + 0.6 * u, px - 1.2 * u, px - 1.2 * u);
            });
            for (let i = 0; i < 40; i++) {
                t.fillStyle = `rgba(255,255,255,${0.08 + rnd() * 0.08})`;
                t.beginPath();
                t.ellipse(rnd() * w, rnd() * h, (20 + rnd() * 60) * u, (10 + rnd() * 26) * u, rnd() * 3, 0, PI * 2);
                t.fill();
            }
            const hues = ['#FF9EC4', '#FFC49A', '#FFE98A', '#A8F0B4', '#9ADCFF', '#C8A8FF'];
            for (let i = 0; i < 28; i++) {
                let x = rnd() * w, y = rnd() * h, a = rnd() * PI * 2;
                t.strokeStyle = rgba(hues[i % 6], 0.36 + rnd() * 0.2);
                t.lineWidth = (0.8 + rnd() * 1.4) * u;
                t.beginPath();
                t.moveTo(x, y);
                for (let s = 0; s < 7; s++) {
                    a += (rnd() - 0.5) * 0.9;
                    const len = (18 + rnd() * 30) * u, nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
                    t.quadraticCurveTo(x + Math.cos(a + 0.5) * len * 0.5, y + Math.sin(a + 0.5) * len * 0.5, nx, ny);
                    x = nx;
                    y = ny;
                }
                t.stroke();
            }
            seams('rgba(128,140,184,0.5)');
        } else if (kind === 'slate') {
            // dark crystal slate, each plate cut with a facet, and light running in the seams
            t.fillStyle = '#17142F';
            t.fillRect(0, 0, w, h);
            each((x, y) => {
                t.fillStyle = tone([52, 48, 92], 6);
                roundRect(t, x + 1.5 * u, y + 1.5 * u, px - 3 * u, px - 3 * u, 2 * u);
                t.fill();
                const flip = rnd() > 0.5;
                t.fillStyle = 'rgba(160,150,240,0.08)';
                t.beginPath();
                t.moveTo(x + 1.5 * u, y + 1.5 * u);
                t.lineTo(x + px - 1.5 * u, y + 1.5 * u);
                t.lineTo(flip ? x + px - 1.5 * u : x + 1.5 * u, y + px - 1.5 * u);
                t.closePath();
                t.fill();
                for (let k = 0; k < 3; k++) dot(x + (0.15 + rnd() * 0.7) * px, y + (0.15 + rnd() * 0.7) * px, 0.6 * u, 'rgba(214,204,255,0.4)');
            });
            t.lineWidth = 1.1 * u;
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    for (let side = 0; side < 2; side++) {
                        const col = rnd() > 0.5 ? A : Bc, a = 0.16 + rnd() * 0.5;
                        if (side ? r === ROWS - 1 : c === COLS - 1) continue;
                        t.strokeStyle = rgba(col, a);
                        t.shadowColor = col;
                        t.shadowBlur = 5 * u;
                        t.beginPath();
                        if (side) { t.moveTo(c * px + 3 * u, (r + 1) * px); t.lineTo((c + 1) * px - 3 * u, (r + 1) * px); } else { t.moveTo((c + 1) * px, r * px + 3 * u); t.lineTo((c + 1) * px, (r + 1) * px - 3 * u); }
                        t.stroke();
                    }
                }
            }
            t.shadowBlur = 0;
        } else if (kind === 'glass') {
            // night glass: dark panes like still water, stars caught in them, the aurora streaked across
            t.fillStyle = '#0E1338';
            t.fillRect(0, 0, w, h);
            each((x, y) => {
                t.fillStyle = tone([30, 36, 82], 3);
                t.fillRect(x + 0.7 * u, y + 0.7 * u, px - 1.4 * u, px - 1.4 * u);
                t.fillStyle = 'rgba(150,180,255,0.13)';
                t.fillRect(x + 0.7 * u, y + 0.7 * u, px - 1.4 * u, u);
                t.fillRect(x + 0.7 * u, y + 0.7 * u, u, px - 1.4 * u);
            });
            for (let i = 0; i < 5; i++) {
                const col = i % 2 ? A : Bc, y0 = h * (0.1 + 0.2 * i);
                const y1 = y0 + (rnd() - 0.5) * h * 0.3, y2 = y0 + (rnd() - 0.5) * h * 0.3, y3 = y0 + (rnd() - 0.5) * h * 0.2;
                for (const [wide, a] of [[30, 0.1], [12, 0.12]]) {
                    t.strokeStyle = rgba(col, a);
                    t.shadowColor = col;
                    t.shadowBlur = 14 * u;
                    t.lineWidth = wide * u;
                    t.beginPath();
                    t.moveTo(-20 * u, y0);
                    t.bezierCurveTo(w * 0.3, y1, w * 0.65, y2, w + 20 * u, y3);
                    t.stroke();
                }
            }
            t.shadowBlur = 0;
            for (let i = 0; i < 320; i++) dot(rnd() * w, rnd() * h, (0.4 + rnd() * 0.7) * u, `rgba(${Math.round(200 + rnd() * 55)},${Math.round(215 + rnd() * 40)},255,${0.3 + rnd() * 0.6})`);
            for (let i = 0; i < 22; i++) {
                const col = i % 3 ? '#FFFFFF' : A;
                t.shadowColor = col;
                t.shadowBlur = 5 * u;
                dot(rnd() * w, rnd() * h, (1 + rnd() * 0.8) * u, col);
            }
            t.shadowBlur = 0;
            seams('rgba(4,6,24,0.55)');
        } else {
            // moss: flagstones of blue-green stone, moss in the gaps, and tiny flowers that glow
            t.fillStyle = '#3B6A52';
            t.fillRect(0, 0, w, h);
            each((x, y) => {
                t.fillStyle = tone([106, 138, 130], 9);
                roundRect(t, x + 2 * u, y + 2 * u, px - 4 * u, px - 4 * u, (7 + rnd() * 5) * u);
                t.fill();
                t.fillStyle = 'rgba(214,244,230,0.10)';
                roundRect(t, x + 4 * u, y + 4 * u, px - 8 * u, (px - 8 * u) * 0.34, 5 * u);
                t.fill();
                for (let k = 0; k < 2; k++) dot(x + (rnd() > 0.5 ? 0.15 : 0.85) * px, y + (rnd() > 0.5 ? 0.15 : 0.85) * px, (3 + rnd() * 4) * u, `rgba(${Math.round(70 + rnd() * 30)},${Math.round(136 + rnd() * 30)},96,0.5)`);
            });
            for (let r = 1; r < ROWS; r++) {
                for (let c = 1; c < COLS; c++) {
                    const x = c * px + (rnd() - 0.5) * 3 * u, y = r * px + (rnd() - 0.5) * 3 * u, col = rnd() > 0.5 ? A : Bc;
                    if (rnd() > 0.42) continue;
                    t.shadowColor = col;
                    t.shadowBlur = 5 * u;
                    for (let k = 0; k < 4; k++) dot(x + Math.cos((k * PI) / 2 + 0.6) * 1.9 * u, y + Math.sin((k * PI) / 2 + 0.6) * 1.9 * u, 1.3 * u, rgba(col, 0.9));
                    dot(x, y, 0.9 * u, '#FFFFFF');
                    t.shadowBlur = 0;
                }
            }
        }
        // Light pooling on the floor by the corner crystals and at the foot of the waterfall
        const pool = (x, y, r, col, a) => {
            const g = t.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, rgba(col, a));
            g.addColorStop(1, rgba(col, 0));
            t.fillStyle = g;
            t.fillRect(x - r, y - r, 2 * r, 2 * r);
        };
        pool(0, 0, 2.6 * px, A, 0.2);
        pool(w, h, 2.6 * px, Bc, 0.2);
        pool(w, 0, 2.2 * px, Bc, 0.15);
        pool(0, h, 2.2 * px, A, 0.15);
        const fall = fallSpot(th), foot = s3WallPoint(fall.wall, fall.along, 0, 0).pos;
        pool(foot[0] * px, foot[2] * px, 1.9 * px, mix(Bc, '#FFFFFF', 0.5), 0.2);
        t.restore();
    }

    // Outside the window: a sky for the hour (sunburst, or stars and aurora), spires of rock with
    // crystals at their tips, floating islands spilling waterfalls, giant mushrooms that glow,
    // a few dragons far off, and lights adrift on the air
    function paintBackdrop(t, th, w, h) {
        const rnd = seededRandom(th.floorSeed + 9);
        const A = th.glowA, Bc = th.glowB;
        const night = th.time === 'night', dark = night || th.time === 'dusk';
        const sky = t.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, th.sky.zenith);
        sky.addColorStop(0.66, th.sky.horizon);
        sky.addColorStop(1, mix(th.sky.horizon, th.sky.ground, 0.7));
        t.fillStyle = sky;
        t.fillRect(0, 0, w, h);

        // where the sun (or the moon) stands on this picture, from the theme's own sun
        const az = (th.sun.azimuth * PI) / 180, el = (th.sun.elevation * PI) / 180;
        const sx = ((12.5 + 34 * Math.tan(az) + 34.5) / 96) * w;
        const sy = Math.max(night ? 120 : -200, h - ((3 + (34 * Math.tan(el)) / Math.cos(az) + 8.2) / 36) * h);
        const halo = t.createRadialGradient(sx, sy, 0, sx, sy, night ? 300 : 620);
        halo.addColorStop(0, rgba(th.sun.color, night ? 0.5 : 0.9));
        halo.addColorStop(0.25, rgba(th.sun.color, night ? 0.16 : 0.4));
        halo.addColorStop(1, rgba(th.sun.color, 0));
        t.fillStyle = halo;
        t.fillRect(0, 0, w, h);
        if (night) {
            t.fillStyle = '#F4F2FF';
            t.beginPath();
            t.arc(sx, sy, 44, 0, PI * 2);
            t.fill();
            t.fillStyle = 'rgba(150,160,220,0.25)';
            for (const [dx, dy, r] of [[-14, 8, 10], [16, -10, 7], [4, 20, 8]]) { t.beginPath(); t.arc(sx + dx, sy + dy, r, 0, PI * 2); t.fill(); }
        } else {
            t.fillStyle = mix(th.sun.color, '#FFFFFF', 0.6);
            t.beginPath();
            t.arc(sx, sy, 40, 0, PI * 2);
            t.fill();
            // a sunburst: long soft rays fanned from the sun
            t.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * PI * 2 + rnd() * 0.2, wd = 0.03 + rnd() * 0.06;
                t.fillStyle = rgba(th.sun.color, 0.05 + rnd() * 0.05);
                t.beginPath();
                t.moveTo(sx, sy);
                t.lineTo(sx + Math.cos(a - wd) * 2400, sy + Math.sin(a - wd) * 2400);
                t.lineTo(sx + Math.cos(a + wd) * 2400, sy + Math.sin(a + wd) * 2400);
                t.closePath();
                t.fill();
            }
            t.globalCompositeOperation = 'source-over';
        }
        if (dark) {
            for (let i = 0; i < 520; i++) {
                t.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
                const s = 1 + rnd() * 2;
                t.fillRect(rnd() * w, rnd() * h * 0.7, s, s);
            }
            // the aurora: curtains of rays that wave across the sky, one colour running into the other
            t.globalCompositeOperation = 'lighter';
            for (let k = 0; k < 3; k++) {
                const y0 = h * (0.2 + k * 0.13), f1 = 0.003 + rnd() * 0.003, f2 = 0.011 + rnd() * 0.006, p1 = rnd() * 6, p2 = rnd() * 6;
                for (let x = 0; x < w; x += 6) {
                    const y = y0 + Math.sin(x * f1 + p1) * 60 + Math.sin(x * f2 + p2) * 18;
                    const tall = 130 + 70 * Math.sin(x * 0.007 + p2) + 40 * Math.sin(x * 0.05 + p1);
                    const col = mix(A, Bc, 0.5 + 0.5 * Math.sin(x * 0.0034 + p1 + k));
                    const g = t.createLinearGradient(0, y - tall, 0, y + 16);
                    g.addColorStop(0, rgba(col, 0));
                    g.addColorStop(0.78, rgba(col, night ? 0.4 : 0.28));
                    g.addColorStop(1, rgba(col, 0));
                    t.fillStyle = g;
                    t.fillRect(x, y - tall, 7, tall + 16);
                }
            }
            t.globalCompositeOperation = 'source-over';
        } else {
            for (let i = 0; i < 12; i++) {
                const cx = rnd() * w, cy = h * (0.08 + rnd() * 0.4), cw = 110 + rnd() * 200;
                t.fillStyle = rgba(mix('#FFFFFF', th.sky.horizon, 0.3), 0.3);
                for (let k = 0; k < 5; k++) { t.beginPath(); t.ellipse(cx + (k - 2) * cw * 0.2, cy + (k % 2) * 9, cw * 0.24, 20 + rnd() * 16, 0, 0, PI * 2); t.fill(); }
            }
        }
        if (th.rainbow) {
            t.lineWidth = 11;
            ['#FF7A8A', '#FFB36A', '#FFE66A', '#8AE88A', '#6AC8FF', '#B08AFF'].forEach((col, i) => {
                t.strokeStyle = rgba(col, 0.3);
                t.beginPath();
                t.arc(w * 0.66, h * 1.02, 640 - i * 11, PI * 1.08, PI * 1.92);
                t.stroke();
            });
        }

        const haze = mix(th.sky.horizon, th.sky.zenith, 0.45);
        const deep = mix(th.sky.ground, '#1A1440', dark ? 0.6 : 0.3);
        // a spire of rock: ledges up each side to a point
        const crag = (x, wid, top, foot, color) => {
            t.fillStyle = color;
            t.beginPath();
            t.moveTo(x - wid / 2, foot);
            for (let i = 1; i <= 5; i++) t.lineTo(x - (wid / 2) * (1 - i / 5) * (0.9 + rnd() * 0.25) - 4, foot - (foot - top) * (i / 5 - 0.08 * rnd()));
            t.lineTo(x + (rnd() - 0.5) * 8, top);
            for (let i = 5; i >= 1; i--) t.lineTo(x + (wid / 2) * (1 - i / 5) * (0.9 + rnd() * 0.25) + 4, foot - (foot - top) * (i / 5 - 0.08 * rnd()));
            t.lineTo(x + wid / 2, foot);
            t.closePath();
            t.fill();
        };
        // a crystal: a tall diamond with light round it
        const spark = (x, y, r, col) => {
            t.shadowColor = col;
            t.shadowBlur = r * 2.2;
            t.fillStyle = mix(col, '#FFFFFF', 0.35);
            t.beginPath();
            t.moveTo(x, y - r * 1.7);
            t.lineTo(x + r * 0.6, y);
            t.lineTo(x, y + r * 0.7);
            t.lineTo(x - r * 0.6, y);
            t.closePath();
            t.fill();
            t.shadowBlur = 0;
        };
        // falling water: a bright thread that fades as it drops
        const falls = (x, y, wide, drop) => {
            const g = t.createLinearGradient(0, y, 0, y + drop);
            g.addColorStop(0, 'rgba(255,255,255,0.85)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            t.fillStyle = g;
            t.fillRect(x - wide / 2, y, wide, drop);
        };
        // a giant mushroom: a pale stem and a domed cap that glows
        const shroom = (x, foot, tall, capR, col) => {
            t.fillStyle = mix('#F6EEDC', deep, dark ? 0.45 : 0.15);
            t.beginPath();
            t.moveTo(x - capR * 0.16, foot);
            t.quadraticCurveTo(x - capR * 0.06, foot - tall * 0.5, x - capR * 0.1, foot - tall);
            t.lineTo(x + capR * 0.1, foot - tall);
            t.quadraticCurveTo(x + capR * 0.06, foot - tall * 0.5, x + capR * 0.16, foot);
            t.closePath();
            t.fill();
            t.shadowColor = col;
            t.shadowBlur = capR * 0.5;
            const g = t.createLinearGradient(0, foot - tall - capR * 0.7, 0, foot - tall);
            g.addColorStop(0, mix(col, '#FFFFFF', 0.45));
            g.addColorStop(1, col);
            t.fillStyle = g;
            t.beginPath();
            t.moveTo(x - capR, foot - tall);
            t.bezierCurveTo(x - capR, foot - tall - capR * 0.95, x + capR, foot - tall - capR * 0.95, x + capR, foot - tall);
            t.quadraticCurveTo(x, foot - tall + capR * 0.16, x - capR, foot - tall);
            t.closePath();
            t.fill();
            t.shadowBlur = 0;
            t.fillStyle = 'rgba(255,255,255,0.55)';
            for (const [dx, dy, r] of [[-0.45, -0.3, 0.1], [0.1, -0.5, 0.12], [0.5, -0.25, 0.08]]) { t.beginPath(); t.arc(x + dx * capR, foot - tall + dy * capR, r * capR, 0, PI * 2); t.fill(); }
        };
        // an island in the air: turf on top, rock hanging beneath, a waterfall off one edge
        const island = (cx, cy, rw) => {
            const depth = rw * (0.9 + rnd() * 0.5);
            const g = t.createLinearGradient(0, cy, 0, cy + depth);
            g.addColorStop(0, mix(th.rock, haze, 0.35));
            g.addColorStop(1, mix(deep, haze, 0.25));
            t.fillStyle = g;
            t.beginPath();
            t.moveTo(cx - rw, cy);
            for (let i = 1; i < 6; i++) t.lineTo(cx - rw + (2 * rw * i) / 6 + (rnd() - 0.5) * rw * 0.12, cy + depth * Math.sin((i / 6) * PI) * (0.55 + rnd() * 0.45));
            t.lineTo(cx + rw, cy);
            t.closePath();
            t.fill();
            const side = rnd() > 0.5 ? 1 : -1;
            falls(cx + side * rw * (0.5 + rnd() * 0.3), cy, Math.max(3, rw * 0.07), depth * 1.5 + 60 + rnd() * 80);
            t.fillStyle = mix(th.moss, '#FFFFFF', dark ? 0.05 : 0.25);
            t.beginPath();
            t.ellipse(cx, cy, rw * 1.04, rw * 0.13, 0, 0, PI * 2);
            t.fill();
            for (let i = 0; i < 3; i++) shroom(cx + (i - 1) * rw * 0.5 + (rnd() - 0.5) * rw * 0.2, cy - rw * 0.04, rw * (0.3 + rnd() * 0.3), rw * (0.16 + rnd() * 0.1), i % 2 ? A : Bc);
            spark(cx + (rnd() - 0.5) * rw * 0.4, cy + depth * 0.8, rw * 0.09, rnd() > 0.5 ? A : Bc);
        };
        // a dragon far off: a curved body and tail, a small horned head, two swept wings
        const dragon = (x, y, s, dir, col) => {
            t.save();
            t.translate(x, y);
            t.scale(dir * s, s);
            t.strokeStyle = col;
            t.fillStyle = col;
            t.lineCap = 'round';
            t.lineJoin = 'round';
            t.lineWidth = 5;
            t.beginPath(); t.moveTo(14, -2); t.quadraticCurveTo(4, 3, -8, 1); t.stroke();
            t.lineWidth = 2.6;
            t.beginPath(); t.moveTo(-8, 1); t.quadraticCurveTo(-20, -1, -30, 6); t.stroke();
            t.lineWidth = 3.4;
            t.beginPath(); t.moveTo(12, -2); t.quadraticCurveTo(20, -6, 23, -10); t.stroke();
            t.beginPath(); t.ellipse(25, -11, 4, 2.4, -0.4, 0, PI * 2); t.fill();
            t.lineWidth = 1.2;
            t.beginPath(); t.moveTo(23, -12); t.lineTo(19, -16); t.stroke();
            t.beginPath();
            t.moveTo(6, -1);
            t.quadraticCurveTo(2, -22, -14, -30);
            t.quadraticCurveTo(-8, -18, -12, -12);
            t.quadraticCurveTo(-5, -12, -6, -4);
            t.quadraticCurveTo(0, -5, 2, 0);
            t.closePath();
            t.fill();
            t.globalAlpha = 0.7;
            t.beginPath();
            t.moveTo(9, -2);
            t.quadraticCurveTo(12, -18, 24, -26);
            t.quadraticCurveTo(18, -14, 14, -3);
            t.closePath();
            t.fill();
            t.restore();
        };

        // far spires, hazy with distance, each with a crystal at its tip and some with a waterfall
        for (let i = 0; i < 11; i++) {
            const x = (i + 0.2 + rnd() * 0.6) * (w / 11), top = h * (0.2 + rnd() * 0.3), wid = 110 + rnd() * 130;
            crag(x, wid, top, h * 0.84, rgba(haze, 0.8));
            spark(x, top + 4, 7 + rnd() * 5, i % 2 ? A : Bc);
            if (rnd() > 0.45) falls(x + (rnd() - 0.5) * wid * 0.3, top + (h * 0.84 - top) * (0.25 + rnd() * 0.2), 4, 120 + rnd() * 120);
        }
        // small islands high up
        for (const [fx, fy, rw] of [[0.24, 0.2, 52], [0.52, 0.17, 60], [0.8, 0.22, 66]]) island(w * (fx + (rnd() - 0.5) * 0.04), h * fy, rw);
        // nearer cliffs with lit dens in them
        for (let i = 0; i < 8; i++) {
            const x = (i + rnd()) * (w / 8), top = h * (0.44 + rnd() * 0.18), wid = 190 + rnd() * 170;
            crag(x, wid, top, h, mix(deep, haze, 0.3));
            for (let k = 0; k < 3; k++) {
                const dx = x + (rnd() - 0.5) * wid * 0.4, dy = top + (h * 0.8 - top) * (0.3 + rnd() * 0.5), col = k % 2 ? A : Bc;
                t.shadowColor = col;
                t.shadowBlur = 14;
                t.fillStyle = mix(col, '#FFFFFF', 0.3);
                t.beginPath();
                t.arc(dx, dy, 5 + rnd() * 3, PI, 0);
                t.closePath();
                t.fill();
                t.shadowBlur = 0;
            }
        }
        // the big islands, nearer and lower
        for (const [fx, fy, rw] of [[0.1, 0.38, 100], [0.4, 0.4, 135], [0.66, 0.36, 155], [0.93, 0.44, 120]]) island(w * (fx + (rnd() - 0.5) * 0.03), h * fy, rw);
        // dragons on the wing
        const dragonCol = dark ? mix(Bc, '#FFFFFF', 0.3) : mix(th.sky.zenith, '#1E1648', 0.7);
        if (dark) { t.shadowColor = Bc; t.shadowBlur = 12; }
        for (const [fx, fy, s, dir] of [[0.36, 0.14, 1.5, 1], [0.6, 0.3, 2.4, -1], [0.73, 0.12, 1.1, 1], [0.9, 0.34, 1.8, -1], [0.47, 0.44, 1.3, 1]]) {
            t.globalAlpha = dark ? 0.9 : 0.75;
            dragon(w * (fx + (rnd() - 0.5) * 0.03), h * (fy + (rnd() - 0.5) * 0.03), s, dir, dragonCol);
        }
        t.globalAlpha = 1;
        t.shadowBlur = 0;
        // giant flora rising from below
        for (let i = 0; i < 9; i++) {
            const x = (i + 0.15 + rnd() * 0.7) * (w / 9);
            shroom(x, h * 0.9, 170 + rnd() * 170, 46 + rnd() * 50, i % 2 ? Bc : A);
        }
        // lights adrift
        for (let i = 0; i < 150; i++) {
            const col = i % 3 === 0 ? '#FFFFFF' : i % 3 === 1 ? A : Bc;
            t.shadowColor = col;
            t.shadowBlur = 12;
            t.fillStyle = rgba(mix(col, '#FFFFFF', 0.4), 0.5 + rnd() * 0.5);
            t.beginPath();
            t.arc(rnd() * w, h * (0.08 + rnd() * 0.78), 1.4 + rnd() * 2.6, 0, PI * 2);
            t.fill();
        }
        t.shadowBlur = 0;
        const mistG = t.createLinearGradient(0, h * 0.68, 0, h);
        mistG.addColorStop(0, rgba(mix(Bc, '#FFFFFF', 0.6), 0));
        mistG.addColorStop(1, rgba(mix(Bc, '#FFFFFF', 0.6), 0.4));
        t.fillStyle = mistG;
        t.fillRect(0, h * 0.68, w, h * 0.32);
    }

    const textures = {
        // Cavern rock: light greys so the wall colour tints it; the same picture makes the bumps.
        // Bands of strata, a few cracks, pits, and flecks of crystal.
        rock: {
            size: 256, tint: true, normal: 2.6, normalScale: 0.9, repeat: [3, 2],
            paint(t, n) {
                const rnd = seededRandom(511);
                t.fillStyle = '#C2C2CC';
                t.fillRect(0, 0, n, n);
                for (let i = 0; i < 9; i++) {
                    const y0 = (i / 9) * n + rnd() * 10, thick = 10 + rnd() * 22, ph = rnd() * 6, amp = 3 + rnd() * 6;
                    t.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${0.08 + rnd() * 0.1})` : `rgba(60,60,90,${0.07 + rnd() * 0.1})`;
                    t.beginPath();
                    t.moveTo(0, y0 + Math.sin(ph) * amp);
                    for (let x = 16; x <= n; x += 16) t.lineTo(x, y0 + Math.sin(ph + (x / n) * PI * 4) * amp);
                    for (let x = n; x >= 0; x -= 16) t.lineTo(x, y0 + thick + Math.sin(ph + 1 + (x / n) * PI * 2) * amp);
                    t.closePath();
                    t.fill();
                }
                t.strokeStyle = 'rgba(40,40,70,0.4)';
                t.lineWidth = 1.2;
                for (let i = 0; i < 9; i++) {
                    let x = rnd() * n, y = rnd() * n;
                    t.beginPath();
                    t.moveTo(x, y);
                    for (let s = 0; s < 5; s++) { x += (rnd() - 0.5) * 30; y += 8 + rnd() * 18; t.lineTo(x, y); }
                    t.stroke();
                }
                for (let i = 0; i < 220; i++) {
                    const s = 1 + rnd() * 2.4;
                    t.fillStyle = rnd() > 0.35 ? `rgba(50,50,80,${0.05 + rnd() * 0.12})` : `rgba(255,255,255,${0.2 + rnd() * 0.5})`;
                    t.fillRect(rnd() * n, rnd() * n, s, s);
                }
            },
        },
        // Pearl: soft swirls of colour under a pale surface, and the fine lines of its layers
        pearl: {
            size: 256, tint: true, normal: 1.0, normalScale: 0.4, repeat: [2, 2],
            paint(t, n) {
                const rnd = seededRandom(523);
                t.fillStyle = '#E9E9F0';
                t.fillRect(0, 0, n, n);
                const tints = ['255,214,232', '206,232,255', '214,255,232', '255,246,210', '232,216,255'];
                for (let i = 0; i < 16; i++) {
                    t.fillStyle = `rgba(${tints[i % 5]},0.32)`;
                    t.beginPath();
                    t.ellipse(rnd() * n, rnd() * n, 30 + rnd() * 60, 14 + rnd() * 30, rnd() * 3, 0, PI * 2);
                    t.fill();
                }
                t.lineWidth = 1;
                for (let i = 0; i < 14; i++) {
                    const y0 = rnd() * n, ph = rnd() * 6;
                    t.strokeStyle = i % 2 ? 'rgba(255,255,255,0.4)' : 'rgba(120,120,170,0.14)';
                    t.beginPath();
                    t.moveTo(0, y0 + Math.sin(ph) * 6);
                    for (let x = 16; x <= n; x += 16) t.lineTo(x, y0 + Math.sin(ph + (x / n) * PI * 2) * 6);
                    t.stroke();
                }
            },
        },
        // Dragon scales: rows of rounded scales, each row lapping over the one below
        scales: {
            size: 128, tint: true, normal: 2.4, normalScale: 0.8,
            paint(t, n) {
                const s = n / 4;
                t.fillStyle = '#9C9CAC';
                t.fillRect(0, 0, n, n);
                for (let row = 5; row >= -1; row--) {
                    for (let col = -1; col <= 4; col++) {
                        const cx = (col + (row % 2 ? 0.5 : 0)) * s + s / 2, cy = row * s;
                        const g = t.createRadialGradient(cx, cy - s * 0.1, s * 0.05, cx, cy, s * 0.62);
                        g.addColorStop(0, '#ECECF4');
                        g.addColorStop(0.7, '#C8C8D4');
                        g.addColorStop(1, '#8E8EA0');
                        t.fillStyle = g;
                        t.beginPath();
                        t.arc(cx, cy, s * 0.58, 0, PI * 2);
                        t.fill();
                        t.strokeStyle = 'rgba(50,50,80,0.5)';
                        t.lineWidth = 1.5;
                        t.stroke();
                    }
                }
            },
        },
        // The ceiling: the roof of the cavern, dark, with glow-worm stars and ribbons of aurora.
        // It gives off a little light of its own, so it never goes black.
        sky: {
            size: 512, perTheme: true, glow: 0.85,
            paint(t, n, th) {
                const rnd = seededRandom(th.floorSeed + 3);
                const g = t.createRadialGradient(n / 2, n / 2, n * 0.05, n / 2, n / 2, n * 0.75);
                g.addColorStop(0, s3Shade(th.ceiling, 1.25));
                g.addColorStop(1, s3Shade(th.ceiling, 0.55));
                t.fillStyle = g;
                t.fillRect(0, 0, n, n);
                t.lineCap = 'round';
                for (let i = 0; i < 4; i++) {
                    const col = i % 2 ? th.glowA : th.glowB, y0 = n * (0.14 + 0.24 * i);
                    t.strokeStyle = rgba(col, 0.2);
                    t.shadowColor = col;
                    t.shadowBlur = 22;
                    t.lineWidth = 16 + rnd() * 22;
                    t.beginPath();
                    t.moveTo(-30, y0 + (rnd() - 0.5) * 60);
                    t.bezierCurveTo(n * 0.3, y0 - 70 + rnd() * 140, n * 0.65, y0 - 70 + rnd() * 140, n + 30, y0 + (rnd() - 0.5) * 60);
                    t.stroke();
                }
                t.shadowBlur = 0;
                for (let i = 0; i < 520; i++) {
                    const c = rnd(), s = 0.8 + rnd() * 1.8;
                    t.fillStyle = c > 0.8 ? rgba(th.glowA, 0.9) : c > 0.6 ? rgba(th.glowB, 0.9) : `rgba(255,255,255,${0.35 + rnd() * 0.6})`;
                    t.fillRect(rnd() * n, rnd() * n, s, s);
                }
                for (let i = 0; i < 26; i++) {
                    const col = i % 3 ? th.glowA : '#FFFFFF';
                    t.shadowColor = col;
                    t.shadowBlur = 10;
                    t.fillStyle = col;
                    t.beginPath();
                    t.arc(rnd() * n, rnd() * n, 1.6 + rnd() * 1.6, 0, PI * 2);
                    t.fill();
                }
                t.shadowBlur = 0;
            },
        },
        // Falling water as light: a soft body with bright threads in it, clear at the edges
        falls: {
            size: 256, perTheme: true, glow: 0.9,
            paint(t, n, th) {
                const rnd = seededRandom(th.floorSeed + 13);
                const c = mix(th.glowB, '#FFFFFF', 0.55);
                t.clearRect(0, 0, n, n);
                const body = t.createLinearGradient(0, 0, n, 0);
                body.addColorStop(0, rgba(c, 0));
                body.addColorStop(0.2, rgba(c, 0.35));
                body.addColorStop(0.5, rgba(c, 0.5));
                body.addColorStop(0.8, rgba(c, 0.35));
                body.addColorStop(1, rgba(c, 0));
                t.fillStyle = body;
                t.fillRect(0, 0, n, n);
                for (let i = 0; i < 46; i++) {
                    const x = n * (0.08 + rnd() * 0.84), wide = 1 + rnd() * 3.5;
                    t.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.5})`;
                    t.fillRect(x, 0, wide, n);
                    t.fillStyle = 'rgba(255,255,255,0.8)';
                    t.fillRect(x, rnd() * n, wide, 10 + rnd() * 40);
                }
            },
        },
        // A veil of aurora: upright rays, bright low down and fading above, clear at both ends
        aurora: {
            size: 256, perTheme: true, glow: 1.3,
            paint(t, n, th) {
                const rnd = seededRandom(th.floorSeed + 17);
                const p1 = rnd() * 6, p2 = rnd() * 6;
                t.clearRect(0, 0, n, n);
                for (let x = 0; x < n; x += 3) {
                    const edge = Math.sin((x / n) * PI);
                    const foot = n * (0.78 + 0.12 * Math.sin((x / n) * PI * 4 + p1));
                    const tall = n * (0.45 + 0.2 * Math.sin((x / n) * PI * 6 + p2) + 0.1 * Math.sin(x * 0.4 + p1));
                    const col = mix(th.glowA, th.glowB, 0.5 + 0.5 * Math.sin((x / n) * PI * 2 + p2));
                    const g = t.createLinearGradient(0, foot - tall, 0, foot + 10);
                    g.addColorStop(0, rgba(col, 0));
                    g.addColorStop(0.8, rgba(col, 0.6 * edge));
                    g.addColorStop(1, rgba(col, 0));
                    t.fillStyle = g;
                    t.fillRect(x, foot - tall, 3.5, tall + 10);
                }
            },
        },
        // The sign on the door: two rings, eight made-up signs between them, and an eye in the middle
        runes: {
            size: 256, perTheme: true, glow: 1.8,
            paint(t, n, th) {
                const rnd = seededRandom(th.floorSeed + 21);
                const cx = n / 2, cy = n / 2, s = n * 0.03;
                t.clearRect(0, 0, n, n);
                t.lineCap = 'round';
                t.lineJoin = 'round';
                t.shadowColor = th.glowA;
                t.shadowBlur = 10;
                t.strokeStyle = th.glowA;
                t.lineWidth = 5;
                t.beginPath();
                t.arc(cx, cy, n * 0.44, 0, PI * 2);
                t.stroke();
                t.lineWidth = 2.5;
                t.beginPath();
                t.arc(cx, cy, n * 0.3, 0, PI * 2);
                t.stroke();
                t.strokeStyle = mix(th.glowB, '#FFFFFF', 0.3);
                t.shadowColor = th.glowB;
                t.lineWidth = 3.5;
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * PI * 2;
                    t.save();
                    t.translate(cx + Math.cos(a) * n * 0.37, cy + Math.sin(a) * n * 0.37);
                    t.rotate(a + PI / 2);
                    t.beginPath();
                    t.moveTo((Math.floor(rnd() * 3) - 1) * s, -s);
                    for (let k = 0; k < 3; k++) t.lineTo((Math.floor(rnd() * 3) - 1) * s, (k === 2 ? 1 : Math.floor(rnd() * 3) - 1) * s);
                    t.stroke();
                    t.restore();
                }
                t.strokeStyle = th.glowA;
                t.shadowColor = th.glowA;
                t.lineWidth = 3;
                t.beginPath();
                t.moveTo(cx - n * 0.17, cy);
                t.quadraticCurveTo(cx, cy - n * 0.15, cx + n * 0.17, cy);
                t.quadraticCurveTo(cx, cy + n * 0.15, cx - n * 0.17, cy);
                t.stroke();
                t.shadowBlur = 0;
            },
        },
    };

    // ---- The 2D board ----------------------------------------------------------------------------

    // Clean and dirty tiles have to stay apart: a dark floor takes a bright polish and light dust,
    // a pale floor a darker film and dark dust. The polish is tinted with one of the room's colours.
    function palette2d(th) {
        const floorBase = FLOOR_RGB[th.floor] || FLOOR_RGB.moss;
        const lum = floorBase[0] * 0.3 + floorBase[1] * 0.59 + floorBase[2] * 0.11;
        const tint = rgbOf(th.polish || th.glowA);
        if (lum < 100) {
            return {
                floorBase, glaze: tint.map((v) => Math.round(v * 0.55 + 110)), glazeAlpha: 0.42,
                film: [150, 136, 122], filmAlpha: 0.28,
                dust: { fluff: [190, 182, 176], crumb: [214, 198, 172], hair: [200, 192, 186] },
            };
        }
        return {
            floorBase, glaze: tint.map((v) => Math.round(v * 0.5 + 127)), glazeAlpha: lum > 170 ? 0.4 : 0.42,
            film: lum > 170 ? [92, 70, 52] : [70, 56, 44], filmAlpha: 0.3,
            dust: lum > 170 ? { fluff: [112, 98, 88], crumb: [84, 64, 46], hair: [70, 56, 48] } : { fluff: [60, 58, 52], crumb: [44, 36, 30], hair: [34, 30, 28] },
        };
    }

    // A rectangle with a radius of its own at each corner: top left, top right, bottom right, bottom left
    function cornered(c, x, y, w, h, r) {
        c.beginPath();
        c.moveTo(x + r[0], y);
        c.lineTo(x + w - r[1], y);
        c.quadraticCurveTo(x + w, y, x + w, y + r[1]);
        c.lineTo(x + w, y + h - r[2]);
        c.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
        c.lineTo(x + r[3], y + h);
        c.quadraticCurveTo(x, y + h, x, y + h - r[3]);
        c.lineTo(x, y + r[0]);
        c.quadraticCurveTo(x, y, x + r[0], y);
        c.closePath();
    }

    // A crystal seen from above: six sides, one facet catching the light, a glow round it
    function gem2d(c, x, y, r, color, turn) {
        c.save();
        c.translate(x, y);
        c.rotate(turn || 0);
        c.shadowColor = color;
        c.shadowBlur = 9;
        c.fillStyle = color;
        c.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * PI * 2;
            c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r * 0.8);
        }
        c.closePath();
        c.fill();
        c.shadowBlur = 0;
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(r, 0);
        c.lineTo(r * 0.5, -r * 0.69);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(0,0,40,0.2)';
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(-r, 0);
        c.lineTo(-r * 0.5, r * 0.69);
        c.closePath();
        c.fill();
        c.restore();
    }

    // An egg seen from above: a soft oval with a highlight and a glow
    function egg2d(c, x, y, rx, ry, color, turn) {
        c.save();
        c.translate(x, y);
        c.rotate(turn || 0);
        c.shadowColor = color;
        c.shadowBlur = 8;
        c.fillStyle = color;
        c.beginPath();
        c.ellipse(0, 0, rx, ry, 0, 0, PI * 2);
        c.fill();
        c.shadowBlur = 0;
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.beginPath();
        c.ellipse(-rx * 0.25, -ry * 0.3, rx * 0.4, ry * 0.3, 0, 0, PI * 2);
        c.fill();
        c.restore();
    }

    // A mushroom cap seen from above: a glowing dome with pale spots
    function cap2d(c, x, y, r, color, glowColor) {
        c.save();
        c.shadowColor = glowColor;
        c.shadowBlur = 9;
        const g = c.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
        g.addColorStop(0, mix(color, '#FFFFFF', 0.45));
        g.addColorStop(0.7, color);
        g.addColorStop(1, mix(color, '#402040', 0.3));
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, r, 0, PI * 2);
        c.fill();
        c.restore();
        c.fillStyle = 'rgba(255,246,232,0.9)';
        for (const [dx, dy, k] of [[-0.36, -0.3, 0.17], [0.34, -0.12, 0.15], [-0.05, 0.4, 0.16], [0.12, -0.55, 0.1], [-0.5, 0.25, 0.1]]) {
            c.beginPath();
            c.arc(x + dx * r, y + dy * r, k * r, 0, PI * 2);
            c.fill();
        }
    }

    // A row of pearl lobes: the top edge of a scallop shell, seen from above
    function lobes2d(c, x0, x1, y, n, ry, colors, glowColor) {
        const step = (x1 - x0) / n;
        c.save();
        c.shadowColor = glowColor;
        c.shadowBlur = 7;
        for (let i = 0; i < n; i++) {
            c.fillStyle = colors[i % colors.length];
            c.beginPath();
            c.ellipse(x0 + step * (i + 0.5), y, step * 0.58, ry, 0, 0, PI * 2);
            c.fill();
        }
        c.restore();
    }

    const paint2d = {
        wall(c, it, th, wallSet) {
            const T = TILE, o = it.o, x = o.col * T, y = o.row * T, cx = x + T / 2, cy = y + T / 2;
            const open = (dc, dr) => !wallSet.has(`${o.col + dc},${o.row + dr}`);
            const rnd = seededRandom(o.col * 31 + o.row * 7 + 5);
            const two = [th.glowA, th.glowB], style = th.wallStyle;
            // the ground it stands on, joined to its neighbours and rounded where it is open
            const n = open(0, -1), s = open(0, 1), w = open(-1, 0), e = open(1, 0), rad = 13;
            c.fillStyle = style === 'egg' || style === 'mushroom' ? mix(th.moss, '#1E3A2E', 0.25) : style === 'column' ? mix(th.walls, '#FFFFFF', 0.3) : th.rock;
            cornered(c, x, y, T, T, [n && w ? rad : 0, n && e ? rad : 0, s && e ? rad : 0, s && w ? rad : 0]);
            c.fill();
            c.strokeStyle = 'rgba(10,6,40,0.3)';
            c.lineWidth = 1.2;
            c.stroke();
            c.fillStyle = 'rgba(255,255,255,0.10)';
            c.beginPath();
            c.ellipse(cx - 4, cy - 5, T * 0.32, T * 0.24, 0, 0, PI * 2);
            c.fill();
            if (style === 'egg') {
                const tint = mix([th.glowA, th.glowB, th.pillow][Math.floor(rnd() * 3)], '#FFFFFF', 0.45);
                c.strokeStyle = th.couchWood;
                c.lineWidth = 6;
                c.beginPath();
                c.arc(cx, cy, T * 0.36, 0, PI * 2);
                c.stroke();
                c.strokeStyle = mix(th.couchWood, '#D9A86A', 0.5);
                c.lineWidth = 1.2;
                for (let i = 0; i < 14; i++) {
                    const a = (i / 14) * PI * 2;
                    c.beginPath();
                    c.moveTo(cx + Math.cos(a) * T * 0.31, cy + Math.sin(a) * T * 0.31);
                    c.lineTo(cx + Math.cos(a + 0.3) * T * 0.42, cy + Math.sin(a + 0.3) * T * 0.42);
                    c.stroke();
                }
                c.save();
                c.strokeStyle = th.glowA;
                c.shadowColor = th.glowA;
                c.shadowBlur = 7;
                c.lineWidth = 1.4;
                c.beginPath();
                c.arc(cx, cy, T * 0.29, 0, PI * 2);
                c.stroke();
                c.restore();
                egg2d(c, cx, cy, T * 0.25, T * 0.27, tint, rnd() * 6);
            } else if (style === 'mushroom') {
                cap2d(c, cx, cy, T * 0.47, two[Math.floor(rnd() * 2)], th.glowA);
            } else if (style === 'stones') {
                const slab = (dx, dy, r, turn, fill) => {
                    c.fillStyle = fill;
                    c.beginPath();
                    for (let i = 0; i < 7; i++) {
                        const a = turn + (i / 7) * PI * 2, k = r * (0.86 + 0.14 * Math.sin(i * 2.3 + turn));
                        c[i ? 'lineTo' : 'moveTo'](cx + dx + Math.cos(a) * k, cy + dy + Math.sin(a) * k);
                    }
                    c.closePath();
                    c.fill();
                };
                slab(1.5, 1.5, T * 0.36, rnd() * 6, mix(th.rock, '#FFFFFF', 0.16));
                slab(0, 0, T * 0.27, rnd() * 6, mix(th.rock, '#FFFFFF', 0.36));
                slab(-1.5, -1.5, T * 0.18, rnd() * 6, mix(th.rock, '#FFFFFF', 0.56));
                gem2d(c, cx - 2, cy - 2, 4.5, th.glowB, rnd() * 3);
            } else if (style === 'spire') {
                const c0 = two[rnd() > 0.5 ? 0 : 1], c1 = c0 === two[0] ? two[1] : two[0];
                gem2d(c, cx + 8, cy + 7, T * 0.13, c1, rnd() * 3);
                gem2d(c, cx - 9, cy + 5, T * 0.11, c0, rnd() * 3);
                gem2d(c, cx, cy - 1, T * 0.3, c0, rnd() * 3);
            } else if (style === 'column') {
                const ph = rnd() * PI * 2;
                c.fillStyle = mix(th.walls, '#FFFFFF', 0.5);
                c.beginPath();
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * PI * 2 + PI / 8;
                    c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * T * 0.46, cy + Math.sin(a) * T * 0.46);
                }
                c.closePath();
                c.fill();
                const g = c.createRadialGradient(cx - 4, cy - 5, 2, cx, cy, T * 0.34);
                g.addColorStop(0, '#FFFFFF');
                g.addColorStop(1, mix(th.walls, '#FFFFFF', 0.62));
                c.fillStyle = g;
                c.beginPath();
                c.arc(cx, cy, T * 0.31, 0, PI * 2);
                c.fill();
                c.save();
                c.strokeStyle = th.glowA;
                c.shadowColor = th.glowA;
                c.shadowBlur = 7;
                c.lineWidth = 2.2;
                c.lineCap = 'round';
                c.beginPath();
                c.arc(cx, cy, T * 0.31, ph, ph + PI * 1.3);
                c.stroke();
                c.fillStyle = th.glowB;
                c.shadowColor = th.glowB;
                c.beginPath();
                c.arc(cx + Math.cos(ph) * T * 0.34, cy + Math.sin(ph) * T * 0.34, 2.6, 0, PI * 2);
                c.fill();
                c.restore();
            } else {
                // cluster
                c.fillStyle = mix(th.moss, th.rock, 0.3);
                c.beginPath();
                c.ellipse(cx, cy, T * 0.33, T * 0.3, 0, 0, PI * 2);
                c.fill();
                gem2d(c, cx + 9, cy + 6, T * 0.12, two[1], rnd() * 3);
                gem2d(c, cx - 8, cy + 8, T * 0.11, two[0], rnd() * 3);
                gem2d(c, cx - 1, cy - 3, T * 0.2, two[rnd() > 0.5 ? 0 : 1], rnd() * 3);
            }
        },
        couch(c, lw, ld, th) {
            const T = TILE, w = lw * T, d = ld * T;
            const n = Math.max(1, Math.round(lw)), inner = w - 22, cw = inner / n;
            // the nest of woven branch
            c.fillStyle = th.couchWood;
            roundRect(c, -w / 2 + 3, -d / 2 + 5, w - 6, d - 8, 12);
            c.fill();
            c.strokeStyle = mix(th.couchWood, '#D9A86A', 0.5);
            c.lineWidth = 1.4;
            roundRect(c, -w / 2 + 5.5, -d / 2 + 7.5, w - 11, d - 13, 10);
            c.stroke();
            for (let x = -w / 2 + 12; x < w / 2 - 10; x += 9) {
                c.beginPath();
                c.moveTo(x, d / 2 - 4);
                c.lineTo(x + 4, d / 2 - 9);
                c.stroke();
            }
            // the shell behind: its ribs seen from above, a pearl of light on each
            const ribs = Math.max(5, n * 2 + 1);
            lobes2d(c, -w / 2 + 5, w / 2 - 5, -d / 2 + 9, ribs, 6.5, [mix('#FFFFFF', th.pillow, 0.25), mix('#FFFFFF', th.couch, 0.3)], th.glowA);
            // cushions
            for (let i = 0; i < n; i++) {
                const x = -inner / 2 + cw * i;
                c.fillStyle = th.couch;
                roundRect(c, x + 1.5, -d / 2 + 15, cw - 3, d - 24, 9);
                c.fill();
                c.fillStyle = 'rgba(255,255,255,0.22)';
                c.beginPath();
                c.ellipse(x + cw / 2 - 3, -d / 2 + 15 + (d - 24) * 0.36, cw * 0.28, (d - 24) * 0.2, 0, 0, PI * 2);
                c.fill();
            }
            c.fillStyle = th.pillow;
            roundRect(c, w / 2 - 27, -d / 2 + 16, 14, 12, 5);
            c.fill();
            c.save();
            c.fillStyle = th.glowA;
            c.shadowColor = th.glowA;
            c.shadowBlur = 6;
            for (let i = 0; i < ribs; i++) {
                c.beginPath();
                c.arc(-w / 2 + 5 + ((w - 10) / ribs) * (i + 0.5), -d / 2 + 4, 1.5, 0, PI * 2);
                c.fill();
            }
            c.restore();
        },
        table(c, lw, ld, th) {
            const T = TILE, rx = (lw * T) / 2 - 5, ry = (ld * T) / 2 - 5;
            if (th.tableKind === 'slab') {
                const outline = () => {
                    c.beginPath();
                    for (let i = 0; i < 14; i++) {
                        const a = (i / 14) * PI * 2, k = 1 + 0.05 * Math.sin(a * 3 + 0.7);
                        const px = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.55) * rx * k, py = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.55) * ry * k;
                        c[i ? 'lineTo' : 'moveTo'](px, py);
                    }
                    c.closePath();
                };
                c.save();
                c.shadowColor = th.glowA;
                c.shadowBlur = 12;
                c.fillStyle = mix(th.table, '#FFFFFF', 0.12);
                outline();
                c.fill();
                c.restore();
                c.strokeStyle = rgba(th.glowA, 0.7);
                c.lineWidth = 1.2;
                outline();
                c.stroke();
                c.fillStyle = 'rgba(255,255,255,0.12)';
                c.beginPath();
                c.ellipse(-rx * 0.2, -ry * 0.35, rx * 0.6, ry * 0.3, -0.2, 0, PI * 2);
                c.fill();
                gem2d(c, -9, 6, 5, th.glowB, 1);
                gem2d(c, 8, 7, 5, th.glowB, 2);
                gem2d(c, 5, -9, 4.5, th.glowA, 0.8);
                gem2d(c, 0, 0, 8.5, th.glowA, 0.3);
                return;
            }
            // a mushroom cap from above, a rim of light, and the nest of three eggs
            c.save();
            c.shadowColor = th.glowB;
            c.shadowBlur = 12;
            const g = c.createRadialGradient(-rx * 0.2, -ry * 0.25, 2, 0, 0, Math.max(rx, ry));
            g.addColorStop(0, mix(th.table, '#FFFFFF', 0.5));
            g.addColorStop(0.75, th.table);
            g.addColorStop(1, mix(th.table, '#6A4A2A', 0.3));
            c.fillStyle = g;
            c.beginPath();
            c.ellipse(0, 0, rx, ry, 0, 0, PI * 2);
            c.fill();
            c.restore();
            c.strokeStyle = rgba(th.glowB, 0.8);
            c.lineWidth = 1.4;
            c.beginPath();
            c.ellipse(0, 0, rx - 1, ry - 1, 0, 0, PI * 2);
            c.stroke();
            c.fillStyle = rgba(mix(th.table, '#6A4A2A', 0.35), 0.5);
            for (const [dx, dy, k] of [[-0.55, -0.45, 0.09], [0.6, -0.3, 0.08], [-0.5, 0.52, 0.07], [0.45, 0.58, 0.09], [0.05, -0.72, 0.06]]) {
                c.beginPath();
                c.arc(dx * rx, dy * ry, k * Math.min(rx, ry), 0, PI * 2);
                c.fill();
            }
            c.fillStyle = th.moss;
            c.beginPath();
            c.arc(0, 0, 0.25 * T, 0, PI * 2);
            c.fill();
            c.strokeStyle = mix(th.couchWood, '#D9A86A', 0.4);
            c.lineWidth = 4;
            c.beginPath();
            c.arc(0, 0, 0.27 * T, 0, PI * 2);
            c.stroke();
            [th.glowA, th.glowB, th.pillow].forEach((col, i) => {
                const a = (i / 3) * PI * 2 + 0.5;
                egg2d(c, Math.cos(a) * 0.11 * T, Math.sin(a) * 0.11 * T, 4.6, 5.8, mix(col, '#FFFFFF', 0.25), a + PI / 2);
            });
        },
        chair(c, th) {
            const T = TILE;
            if (th.chairKind === 'shell') {
                c.fillStyle = th.rock;
                c.beginPath();
                c.arc(0, 0.02 * T, 0.33 * T, 0, PI * 2);
                c.fill();
                c.save();
                c.strokeStyle = th.glowA;
                c.shadowColor = th.glowA;
                c.shadowBlur = 7;
                c.lineWidth = 1.4;
                c.beginPath();
                c.arc(0, 0.02 * T, 0.31 * T, 0, PI * 2);
                c.stroke();
                c.restore();
                lobes2d(c, -0.4 * T, 0.4 * T, -0.29 * T, 5, 0.075 * T, [mix('#FFFFFF', th.chair, 0.3), mix('#FFFFFF', th.pillow, 0.25)], th.glowB);
                c.fillStyle = th.chair;
                c.beginPath();
                c.ellipse(0, 0.04 * T, 0.3 * T, 0.27 * T, 0, 0, PI * 2);
                c.fill();
                c.fillStyle = 'rgba(255,255,255,0.22)';
                c.beginPath();
                c.ellipse(-0.06 * T, -0.04 * T, 0.16 * T, 0.11 * T, 0, 0, PI * 2);
                c.fill();
                return;
            }
            cap2d(c, 0, 0, 0.41 * T, th.chair, th.glowA);
        },
        plant(c, th, seed) {
            const T = TILE, rnd = seededRandom(seed || 1);
            const heart = (seed || 1) % 2 ? th.glowA : th.glowB;
            c.save();
            c.shadowColor = th.glowA;
            c.shadowBlur = 9;
            c.fillStyle = th.planter;
            c.beginPath();
            c.arc(0, 0, 0.34 * T, 0, PI * 2);
            c.fill();
            c.restore();
            c.fillStyle = th.moss;
            c.beginPath();
            c.arc(0, 0, 0.26 * T, 0, PI * 2);
            c.fill();
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * PI * 2 + rnd() * 0.5, l = (0.28 + rnd() * 0.16) * T;
                c.fillStyle = i % 3 === 2 ? mix(th.leaf, th.glowA, 0.35) : i % 3 ? mix(th.leaf, '#103020', 0.25) : th.leaf;
                c.save();
                c.rotate(a);
                c.beginPath();
                c.moveTo(3, 0);
                c.quadraticCurveTo(l * 0.5, -4.5, l, 0);
                c.quadraticCurveTo(l * 0.5, 4.5, 3, 0);
                c.fill();
                c.restore();
            }
            c.save();
            c.translate((rnd() - 0.5) * 5, (rnd() - 0.5) * 5);
            c.fillStyle = mix(th.pillow, '#FFFFFF', 0.25);
            for (let i = 0; i < 6; i++) {
                c.rotate(PI / 3);
                c.beginPath();
                c.ellipse(0.13 * T, 0, 0.1 * T, 0.05 * T, 0, 0, PI * 2);
                c.fill();
            }
            c.shadowColor = heart;
            c.shadowBlur = 10;
            c.fillStyle = mix(heart, '#FFFFFF', 0.4);
            c.beginPath();
            c.arc(0, 0, 0.075 * T, 0, PI * 2);
            c.fill();
            c.restore();
        },
        petbed(c, lw, ld, th) {
            const T = TILE, rx = lw * 0.46 * T, ry = ld * 0.44 * T;
            c.fillStyle = '#6B4A32';
            c.beginPath();
            c.ellipse(0, 0, rx + 2.5, ry + 2.5, 0, 0, PI * 2);
            c.fill();
            c.strokeStyle = '#A9793F';
            c.lineWidth = 1.5;
            for (let i = 0; i < 28; i++) {
                const a = (i / 28) * PI * 2;
                c.beginPath();
                c.moveTo(Math.cos(a) * (rx - 3), Math.sin(a) * (ry - 3));
                c.lineTo(Math.cos(a + 0.2) * (rx + 2), Math.sin(a + 0.2) * (ry + 2));
                c.stroke();
            }
            c.fillStyle = th.petbed;
            c.beginPath();
            c.ellipse(0, 0, rx * 0.84, ry * 0.78, 0, 0, PI * 2);
            c.fill();
            c.fillStyle = 'rgba(255,255,255,0.14)';
            c.beginPath();
            c.ellipse(-rx * 0.2, -ry * 0.2, rx * 0.5, ry * 0.4, 0, 0, PI * 2);
            c.fill();
            egg2d(c, -rx * 0.62, -ry * 0.5, 3.6, 4.6, mix(th.glowB, '#FFFFFF', 0.5), 0.5);
            c.save();
            c.shadowBlur = 6;
            for (const [dx, dy, col] of [[0.75, 0.62, th.glowA], [-0.8, 0.55, th.glowB]]) {
                c.fillStyle = col;
                c.shadowColor = col;
                c.beginPath();
                c.arc(dx * rx, dy * ry, 1.8, 0, PI * 2);
                c.fill();
            }
            c.restore();
        },
        // The lantern flower over the middle of the room, drawn lightly so the tiles under it still read
        lamp(c, th) {
            const T = TILE, petal = mix(th.glowB, '#FFFFFF', 0.45);
            c.fillStyle = petal;
            c.strokeStyle = petal;
            c.lineWidth = 1;
            for (let i = 0; i < 6; i++) {
                c.save();
                c.rotate((i / 6) * PI * 2);
                c.beginPath();
                c.ellipse(0.42 * T, 0, 0.3 * T, 0.13 * T, 0, 0, PI * 2);
                c.globalAlpha = 0.16;
                c.fill();
                c.globalAlpha = 0.5;
                c.stroke();
                c.restore();
            }
            c.globalAlpha = 0.6;
            c.shadowColor = th.lamp.color;
            c.shadowBlur = 9;
            c.fillStyle = th.lamp.color;
            for (let i = 0; i < 6; i++) {
                const a = ((i + 0.5) / 6) * PI * 2;
                c.beginPath();
                c.arc(Math.cos(a) * 0.3 * T, Math.sin(a) * 0.3 * T, 2.4, 0, PI * 2);
                c.fill();
            }
            c.beginPath();
            c.arc(0, 0, 3.6, 0, PI * 2);
            c.fill();
        },
    };

    S3_STYLE_PACKS.wonder = { name: 'wonder', themes, couch, table, chair, plant, petbed, wall, architecture, dock, paintFloor, paintBackdrop, textures, palette2d, paint2d };
})();
