// === STYLE PACK: STEAM ===
// The third floor of the house: Baroque and Victorian steampunk. Gaslight and brass, polished
// mahogany, tufted leather and velvet, damask paper over dark wainscot, copper pipework, gauges
// and slowly turning gears, and a smoky skyline with airships outside the window.
// See docs/style-pack-brief.md for the contract and style-scifi.js for the reference pack.
//
// Everything here is plain data and canvas painting. Furniture is in its own space: centred on
// its footprint, back towards -z, one unit to a tile, y up.

(function () {
    const M = s3Mat, B = s3B, C = s3C, S = s3S, R = s3R;
    const H = S3_WALL_H, W = S3_WINDOW, PI = Math.PI;
    const BRASS = '#CFA349', GAS = '#FFC98A';
    const WAINSCOT = 0.78;          // low panelling: the vacuum looks up from the floor, and the paper should show above it
    const WALLS = ['north', 'south', 'west', 'east'];

    // ---- Small helpers ----------------------------------------------------------------------

    const rgb = (hex) => hexToRgb(hex) || [128, 128, 128];
    const rgba = (hex, a) => { const c = rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
    const mix = (a, b, k) => { const p = rgb(a), q = rgb(b); return rgbToHex(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k); };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    // A steady number from 0 to 1 for a tile, the same in both views
    const pick = (col, row, k) => { const r = seededRandom(col * 131 + row * 71 + k * 17 + 5); r(); r(); return r(); };

    // Materials
    const wood = (color) => M('walnut', color);                 // polished mahogany
    const brass = () => M('brass', BRASS);
    const gilt = () => Object.assign(M('gold'), { roughness: 0.3 });
    const paper = (color) => ({ color, roughness: 0.86, metalness: 0, sheen: 0.4, sheenRoughness: 0.5, sheenColor: '#FFE6C0' });
    // Light sources. Kept modest: bloom does the rest.
    const glow = (color, k) => Object.assign(M('glow', color), { emissiveIntensity: k });
    const globe = (th, lit) => (lit ? glow(th.gas, 2.2) : Object.assign(M('ceramic', '#FFF4E2'), { emissive: th.gas, emissiveIntensity: 0.25 }));

    // Walls: which way "to the right" runs along a wall when you face it from inside the room
    const SIDE = { north: 1, east: 1, south: -1, west: -1 };
    const yawOf = (wall) => s3WallPoint(wall, 0, 0, 0).yaw;
    // A point on a wall measured from a spot on it: `right` as you face the wall, `out` into the room
    const onWall = (wall, at, y, out, right) => s3WallPoint(wall, at + SIDE[wall] * (right || 0), y, out).pos;
    // Turns a disc, a gear or a wedge that lies flat so that it faces out of a wall with that yaw
    const facing = (yaw) => [PI / 2, 0, -yaw];

    // Euler angles that tip an upright blade outwards by `tilt` towards the compass angle `a`,
    // keeping its width level
    const lean = (a, tilt) => {
        const f = PI / 2 - a, sf = Math.sin(f), cf = Math.cos(f), st = Math.sin(tilt), ct = Math.cos(tilt);
        return [Math.atan2(st, cf * ct), Math.asin(sf * ct), Math.atan2(-sf * st, cf)];
    };

    // A turned leg: a profile of [radius, height] from the floor up, stretched to the height asked for
    const LEG = [[0.034, 0], [0.05, 0.06], [0.03, 0.13], [0.026, 0.2], [0.05, 0.3], [0.062, 0.42], [0.045, 0.56], [0.03, 0.62], [0.058, 0.7], [0.058, 0.78], [0.04, 0.82], [0.05, 0.86], [0.05, 1]];
    const leg = (x, y, z, h, mat) => ({ shape: 'lathe', pos: [x, y, z], points: LEG.map(([r, t]) => [r, t * h]), seg: 14, mat });

    // The pie-crust edge of the table top, as [x, z] points
    const scallop = (r, lobes) => {
        const pts = [];
        for (let i = 0; i < 96; i++) {
            const a = (i / 96) * PI * 2, k = 0.955 + 0.045 * Math.abs(Math.cos((a * lobes) / 2));
            pts.push([Math.cos(a) * r * k, Math.sin(a) * r * k]);
        }
        return pts;
    };

    // The side wall with neither the door nor the clock on it: where the pictures hang
    const sideWall = (th) => ['east', 'south', 'west'].find((w) => w !== th.accent.wall && w !== th.door.wall);

    // Where the wall lamps hang: two beside the clock on the accent wall, one on the side wall
    // (a theme can say where with `side.lamp`, to keep clear of what stands against that wall),
    // one beside the door and one on the window wall
    function sconceSpots(th) {
        const aw = th.accent.wall, dw = th.door.wall, side = sideWall(th);
        const mid = s3WallLength(aw) / 2;
        const sideAt = th.side && th.side.lamp !== undefined ? th.side.lamp : s3WallLength(side) / 2;
        return [[aw, mid - 2.5], [aw, mid + 2.5], [side, sideAt], [dw, th.door.at + (th.door.at > s3WallLength(dw) / 2 ? -3 : 3)], ['north', 2]];
    }

    // ---- Six rooms -------------------------------------------------------------------------
    // The same fields as the atomic themes, plus what the renderer reads for a pack (fill, env,
    // fog, grade, bloom, floorMat, wallHeight, lights) and a few of this pack's own: gas (the
    // colour of gaslight), spark (the room's second glow: fire or aether), drape (curtains),
    // urn (what the plant stands in), curio (what is on the table), glass (the window tint),
    // dado (a painted wainscot instead of a wooden one) and side (where things hang on the side wall).
    const base = {
        style: 'steam', outside: 'skyline', prints: [],
        env: 0.6, exposure: 1.16, vignette: 0.36, bloom: [0.3, 0.6, 0.94],
        leaf: '#3F7D4A', gas: GAS, glass: '#E8D8B0', wallHeight: 4.8,
    };
    const SCONCE_POWER = { morning: 2.6, noon: 2.6, afternoon: 4, 'golden hour': 5, dusk: 8, night: 9 };
    const themes = [
        {
            name: 'Brass Parlour', time: 'golden hour', floor: 'herringbone', floorSeed: 3101, wallStyle: 'panel', wallHeight: 4.8,
            sun: { azimuth: 40, elevation: 12, color: '#FFB56B', intensity: 3.0 },
            sky: { zenith: '#5B6E9C', horizon: '#F4A85F', ground: '#4A3B33' },
            ambient: 0.62, fill: '#FFDDB0', lamp: { on: true, color: GAS, intensity: 9 },
            walls: '#B58E4E', accent: { wall: 'west', color: '#8E2430' }, trim: '#6A2E1C', ceiling: '#EADBBB',
            couch: '#7E2026', pillow: '#D9A441', couchWood: '#5E2A1A', chair: '#23684E', table: '#6A3020',
            planter: BRASS, urn: 'brass', petbed: '#6A2E56', cat: '#D8C9B0', drape: '#8E2430', spark: '#FF9A4A', curio: 'orrery',
            door: { wall: 'south', at: 3.5, color: '#5E2A1A' },
            fog: { color: '#B98A5C', density: 0.012 }, grade: [1.06, 1.0, 0.92],
            floorMat: { bump: 0.5, normal: 0.4, clearcoat: 0.4, reflect: 1.2, dust: [0.6, 0.2, 0.18, 0.15] },
        },
        {
            name: 'Clockwork Nursery', time: 'morning', floor: 'encaustic', floorSeed: 3207, wallStyle: 'toybox', wallHeight: 2.2,
            sun: { azimuth: -30, elevation: 38, color: '#FFF0D6', intensity: 3.2 },
            sky: { zenith: '#7FACD4', horizon: '#F2E0C0', ground: '#6A6258' },
            ambient: 0.62, fill: '#FFF1DC', lamp: { on: false, color: GAS, intensity: 0 },
            walls: '#CDBF98', accent: { wall: 'east', color: '#217888' }, trim: '#6E3E26', dado: '#E6DABE', ceiling: '#F2E8D2',
            couch: '#2A5E90', pillow: '#E0A63A', couchWood: '#6E3E26', chair: '#B83A32', table: '#74422A',
            planter: '#217888', urn: 'ceramic', petbed: '#D9A233', cat: '#E9A25A', drape: '#217888', spark: '#FFC24A', curio: 'dome',
            door: { wall: 'west', at: 6, color: '#1F6878' },
            fog: { color: '#D8CDB4', density: 0.009 }, grade: [1.03, 1.0, 0.96],
            floorMat: { bump: 0.35, normal: 0.3, clearcoat: 0.5, reflect: 1.2, dust: [0.45, 0.1, 0.085, 0.07] },
        },
        {
            name: 'Steam Galley', time: 'noon', floor: 'checker', floorSeed: 3311, wallStyle: 'counter', wallHeight: 1.9,
            sun: { azimuth: -8, elevation: 56, color: '#FFF8EA', intensity: 3.4 },
            sky: { zenith: '#6E9FC8', horizon: '#E8E0CC', ground: '#6E6A60' },
            ambient: 0.64, fill: '#FFF4E0', lamp: { on: false, color: GAS, intensity: 0 },
            walls: '#D2C4A0', accent: { wall: 'south', color: '#237A54' }, trim: '#5A3020', dado: '#1F5C44', ceiling: '#F0E6D0',
            couch: '#23684E', pillow: '#C7502F', couchWood: '#5E3220', chair: '#9E3030', table: '#6A3824',
            planter: '#B8693A', urn: 'copper', petbed: '#22787A', cat: '#3A3532', drape: '#237A54', spark: '#FF8A3A', curio: 'dome',
            door: { wall: 'west', at: 6, color: '#1E6648' },
            fog: { color: '#D6D0C0', density: 0.009 }, grade: [1.02, 1.0, 0.97],
            floorMat: { bump: 0.3, normal: 0.25, clearcoat: 0.7, reflect: 1.5, dust: [0.5, 0.16, 0.145, 0.125] },
        },
        {
            name: "Cartographer's Study", time: 'afternoon', floor: 'boards', floorSeed: 3417, wallStyle: 'bookcase', wallHeight: 4.3,
            sun: { azimuth: -50, elevation: 26, color: '#FFDCA6', intensity: 2.7 },
            sky: { zenith: '#6C90B6', horizon: '#ECCB96', ground: '#5C5248' },
            ambient: 0.66, fill: '#FFE6C0', lamp: { on: true, color: GAS, intensity: 9 },
            walls: '#C3AC78', accent: { wall: 'west', color: '#6E3068' }, trim: '#5E2C1C', ceiling: '#E8DBBE',
            couch: '#9A5426', pillow: '#6E3068', couchWood: '#522618', chair: '#6E3068', table: '#5E2C1C',
            planter: BRASS, urn: 'brass', petbed: '#23684E', cat: '#8A8A8A', drape: '#6E3068', spark: '#FFB45A', curio: 'orrery',
            door: { wall: 'south', at: 10.5, color: '#522618' },
            fog: { color: '#B89A6C', density: 0.011 }, grade: [1.05, 1.0, 0.93],
            floorMat: { bump: 0.55, normal: 0.45, clearcoat: 0.35, reflect: 1.2, dust: [0.7, 0.2, 0.18, 0.15] },
        },
        {
            name: 'Boiler Works', time: 'dusk', floor: 'plate', floorSeed: 3503, wallStyle: 'boiler', wallHeight: 2.9,
            sun: { azimuth: 60, elevation: 8, color: '#FF8C50', intensity: 2.3 },
            sky: { zenith: '#3B3F70', horizon: '#F0834A', ground: '#3A302C' },
            ambient: 0.74, fill: '#E8B48C', env: 0.75, lamp: { on: true, color: '#FFC07A', intensity: 13 },
            walls: '#4E7078', accent: { wall: 'east', color: '#B5781F' }, trim: '#4A2A20', dado: '#2E4650', ceiling: '#BCA88A',
            couch: '#7E2026', pillow: '#D99A2B', couchWood: '#4A261A', chair: '#2E7480', table: '#54301F',
            planter: '#B8693A', urn: 'copper', petbed: '#9A3028', cat: '#2E2A28', drape: '#B5781F', spark: '#FF7A2E', curio: 'dome',
            door: { wall: 'west', at: 6, color: '#4A342A' },
            fog: { color: '#5A3A30', density: 0.016 }, grade: [1.08, 0.99, 0.9],
            floorMat: { bump: 0.8, normal: 0.6, metalness: 0.45, clearcoat: 0.25, reflect: 1.3, dust: [0.7, 0.2, 0.18, 0.15] },
            glows: [{ pos: [13.8, 0.6, 3], color: '#FF7A2E', intensity: 9, distance: 8 }],
            side: { lamp: 13.5, frames: [5.5, 9.5] },      // between the boilers that stand along the south wall
        },
        {
            name: 'Aether Laboratory', time: 'night', floor: 'star', floorSeed: 3609, wallStyle: 'apparatus', wallHeight: 4.3,
            sun: { azimuth: 18, elevation: 32, color: '#A9BEFF', intensity: 1.3 },
            sky: { zenith: '#0A1030', horizon: '#2E3568', ground: '#14162A' },
            ambient: 0.85, fill: '#B0A8D0', env: 0.9, exposure: 1.2, lamp: { on: true, color: '#FFD0A0', intensity: 13 },
            walls: '#2F5672', accent: { wall: 'south', color: '#56349A' }, trim: '#4E2A1E', dado: '#1F3A50', ceiling: '#8E8AA8',
            couch: '#44327E', pillow: '#3FBFA8', couchWood: '#44241A', chair: '#237A76', table: '#4E2A1C',
            planter: BRASS, urn: 'brass', petbed: '#56349A', cat: '#E8E2D4', drape: '#56349A', spark: '#7DF9D0', curio: 'orrery', glass: '#8FA0D0',
            door: { wall: 'west', at: 6, color: '#34284C' },
            fog: { color: '#1A1E40', density: 0.014 }, grade: [1.0, 0.99, 1.05], bloom: [0.34, 0.6, 0.92],
            floorMat: { bump: 0.3, normal: 0.25, clearcoat: 0.75, reflect: 1.6, dust: [0.45, 0.07, 0.065, 0.06] },
            glows: [{ pos: [7.5, 2.4, 11.2], color: '#7DF9D0', intensity: 12, distance: 10 }, { pos: [0.8, 0.6, 0.8], color: '#9A7BFF', intensity: 7, distance: 8 }],
        },
    ].map((t) => {
        const th = Object.assign({}, base, t);
        // One light for each wall lamp. The Low preset lights only the first two, so a room's
        // own glow (the furnace, the aether) comes straight after the first wall lamp.
        const lamps = sconceSpots(th).map(([wl, at]) => ({ pos: s3WallPoint(wl, at, 2.95, 0.7).pos, color: th.gas, intensity: SCONCE_POWER[th.time], distance: 7.5 }));
        th.lights = [lamps[0]].concat(th.glows || [], lamps.slice(1)).slice(0, 8);
        return th;
    });

    // ---- Furniture ---------------------------------------------------------------------------

    // A chesterfield: rolled arms as high as the back, a deep-buttoned back, bun legs on brass
    // castors, a velvet cushion and a bolster
    function couch(lw, ld, th) {
        const P = [];
        const frame = wood(th.couchWood), hide = M('leather', th.couch), brassM = brass();
        const hx = lw / 2, hz = ld / 2;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            const x = sx * (hx - 0.2), z = sz * (hz - 0.15);
            P.push(C([x, 0.035, z], 0.045, 0.045, 0.07, brassM));
            P.push(leg(x, 0.07, z, 0.3, frame));
        }
        P.push(B([0, 0.46, 0], [lw - 0.1, 0.18, ld - 0.08], frame, { bevel: 0.04 }));
        P.push(B([0, 0.41, hz - 0.035], [lw - 0.6, 0.022, 0.02], brassM));
        const n = Math.max(1, Math.round(lw)), inner = lw - 0.72, cw = inner / n;
        for (let i = 0; i < n; i++) P.push(B([-inner / 2 + cw * (i + 0.5), 0.66, 0.1], [cw - 0.02, 0.24, ld - 0.34], hide, { bevel: 0.09 }));
        // the back: quilted hide, a button where the pleats cross
        const bz = -hz + 0.2, bw = lw - 0.64, nb = Math.max(2, Math.round(bw / 0.4)), step = bw / nb;
        P.push(B([0, 0.98, bz], [bw, 0.56, 0.24], hide, { bevel: 0.08, rot: [-0.1, 0, 0], texture: 'steam:tuft', texRepeat: [nb, 1] }));
        const stud = M('leather', s3Shade(th.couch, 0.6));
        for (let i = 0; i < nb; i++) P.push(S([-bw / 2 + step * (i + 0.5), 0.98, bz + 0.12], 0.028, stud));
        for (let i = 1; i < nb; i++) P.push(S([-bw / 2 + step * i, 1.2, bz + 0.1], 0.028, stud));
        P.push(C([0, 1.24, bz - 0.03], 0.15, 0.15, lw - 0.42, hide, { rot: [0, 0, PI / 2] }));
        // the arms: a roll on a block, a wooden scroll and a brass stud at the front
        for (const sx of [-1, 1]) {
            const x = sx * (hx - 0.2);
            P.push(B([x, 0.78, 0], [0.3, 0.6, ld - 0.1], hide, { bevel: 0.06 }));
            P.push(C([x, 1.12, 0], 0.19, 0.19, ld - 0.08, hide, { rot: [PI / 2, 0, 0] }));
            P.push(C([x, 1.12, hz - 0.03], 0.15, 0.15, 0.03, frame, { rot: [PI / 2, 0, 0] }));
            P.push(S([x, 1.12, hz - 0.012], 0.04, brassM));
        }
        P.push(B([hx - 0.66, 0.98, -hz + 0.46], [0.4, 0.4, 0.14], M('velvet', th.pillow), { bevel: 0.07, rot: [-0.25, 0, 0.22] }));
        P.push(C([-hx + 0.62, 0.89, 0.08], 0.11, 0.11, 0.52, M('velvet', th.chair), { rot: [PI / 2, 0, 0] }));
        P.push(S([-hx + 0.62, 0.89, 0.35], 0.035, gilt()));
        return P;
    }

    // A pedestal table: three scrolled legs on brass balls, a turned column, a pie-crust top,
    // and on it either a little armillary orrery or a glass dome with gears turning inside
    function table(lw, ld, th) {
        const P = [];
        const mah = wood(th.table), brassM = brass();
        const r0 = Math.min(lw, ld) / 2 - 0.1, reach = Math.max(0.3, r0 - 0.2);
        P.push(C([0, 0.32, 0], 0.13, 0.17, 0.14, mah));
        for (let i = 0; i < 3; i++) {
            const a = PI / 2 + (i * PI * 2) / 3, c = Math.cos(a), s = Math.sin(a);
            P.push({ shape: 'tube', pos: [0, 0, 0], path: [[c * 0.1, 0.36, s * 0.1], [c * reach * 0.5, 0.34, s * reach * 0.5], [c * reach * 0.85, 0.17, s * reach * 0.85], [c * reach, 0.08, s * reach]], r: 0.05, mat: mah });
            P.push(S([c * reach, 0.07, s * reach], 0.07, brassM));
        }
        P.push({ shape: 'lathe', pos: [0, 0.38, 0], points: [[0.15, 0], [0.16, 0.03], [0.09, 0.08], [0.06, 0.14], [0.11, 0.24], [0.13, 0.3], [0.08, 0.38], [0.06, 0.43], [0.12, 0.47], [0.2, 0.49]], mat: mah });
        P.push(C([0, 0.875, 0], r0 * 0.6, r0 * 0.5, 0.03, mah));
        P.push({ shape: 'extrude', pos: [0, 0.9, 0], points: scallop(r0, 12), depth: 0.045, bevel: 0.012, mat: mah });
        const top = 0.957;
        P.push(R([0, top, 0], r0 * 0.72, 0.01, brassM));
        if (th.curio === 'dome') {
            // two cogs in mesh, tipped back so they show from the floor and from above
            P.push(C([0, top + 0.02, 0], 0.26, 0.28, 0.04, mah));
            P.push(B([0, top + 0.19, -0.05], [0.05, 0.3, 0.012], brassM));
            P.push({ shape: 'gear', pos: [0, top + 0.23, 0], r: 0.13, teeth: 10, depth: 0.03, hole: 0.025, rot: [PI / 3, 0, 0], mat: brassM, tag: 'spin', speed: 0.8 });
            P.push({ shape: 'gear', pos: [-0.15, top + 0.129, 0.058], r: 0.078, teeth: 6, depth: 0.03, hole: 0.02, rot: [PI / 3, 0, 0], mat: M('copper'), tag: 'spin', speed: -1.33 });
            P.push({ shape: 'lathe', pos: [0, top + 0.04, 0], points: [[0.24, 0], [0.24, 0.22], [0.21, 0.31], [0.14, 0.38], [0, 0.42]], mat: Object.assign(M('glass', '#DFF2F0'), { opacity: 0.2 }) });
            P.push(S([0, top + 0.475, 0], 0.025, brassM));
        } else {
            // a gilt sun inside three brass rings, two of them turning, on a cog that turns too
            const cy = top + 0.47;
            P.push({ shape: 'gear', pos: [0, top + 0.02, 0], r: 0.2, teeth: 12, depth: 0.04, hole: 0.03, mat: brassM, tag: 'spin', speed: 0.35 });
            P.push({ shape: 'lathe', pos: [0, top + 0.04, 0], points: [[0.07, 0], [0.03, 0.04], [0.02, 0.12], [0.04, 0.16], [0.012, 0.2], [0.012, 0.36]], seg: 12, mat: brassM });
            P.push(S([0, cy, 0], 0.075, gilt()));
            P.push(R([0, cy, 0], 0.3, 0.012, brassM));
            P.push({ shape: 'torus', pos: [0, cy, 0], r: 0.26, tube: 0.011, mat: brassM, tag: 'spin', speed: 0.5 });
            P.push({ shape: 'torus', pos: [0, cy, 0], r: 0.22, tube: 0.011, rot: [0, 0.8, 0.45], mat: M('copper'), tag: 'spin', speed: -0.8 });
            P.push(S([0.3, cy, 0], 0.035, M('copper')));
            P.push(S([-0.2, cy, 0.22], 0.028, M('pearl')));
        }
        return P;
    }

    // A balloon-back chair: a hoop with a buttoned velvet pad, a stuffed seat, turned front legs
    // on castors and raked back legs
    function chair(lw, ld, th) {
        const P = [];
        const frame = wood(th.couchWood), vel = M('velvet', th.chair), brassM = brass();
        for (const sx of [-1, 1]) {
            P.push(C([sx * 0.25, 0.03, 0.24], 0.035, 0.035, 0.06, brassM));
            P.push(leg(sx * 0.25, 0.06, 0.24, 0.64, frame));
            P.push({ shape: 'rod', from: [sx * 0.24, 0.72, -0.2], to: [sx * 0.27, 0, -0.3], r: 0.034, mat: frame });
            P.push({ shape: 'rod', from: [sx * 0.2, 0.78, -0.25], to: [sx * 0.17, 1.2, -0.28], r: 0.03, mat: frame });
        }
        P.push(B([0, 0.74, 0.02], [0.64, 0.1, 0.6], frame, { bevel: 0.03 }));
        P.push(B([0, 0.84, 0.03], [0.6, 0.14, 0.54], vel, { bevel: 0.065 }));
        P.push({ shape: 'torus', pos: [0, 1.38, -0.29], r: 0.27, tube: 0.04, rot: [-0.12, 0, 0], mat: frame });
        P.push(S([0, 1.38, -0.28], 0.22, vel, { scale: [1, 1, 0.3] }));
        for (const [bx, by] of [[0, 0.1], [0, -0.1], [-0.1, 0], [0.1, 0]]) P.push(S([bx, 1.38 + by, -0.215], 0.02, brassM));
        return P;
    }

    // A fern in an urn on a turned stand
    function plant(lw, ld, th, seed) {
        const P = [];
        const rnd = s3Rand(seed || 1);
        const urn = th.urn === 'ceramic' ? M('ceramic', th.planter) : M(th.urn === 'copper' ? 'copper' : 'brass', th.planter);
        P.push({ shape: 'lathe', pos: [0, 0, 0], points: [[0.27, 0], [0.27, 0.04], [0.2, 0.07], [0.07, 0.12], [0.05, 0.24], [0.09, 0.3], [0.09, 0.34], [0.05, 0.4], [0.045, 0.58], [0.1, 0.66], [0.24, 0.7], [0.24, 0.74], [0, 0.74]], mat: wood(th.couchWood) });
        P.push({ shape: 'lathe', pos: [0, 0.74, 0], points: [[0.1, 0], [0.13, 0.03], [0.06, 0.08], [0.08, 0.13], [0.2, 0.24], [0.27, 0.38], [0.27, 0.46], [0.2, 0.54], [0.19, 0.58], [0.25, 0.63], [0.26, 0.66]], mat: urn });
        for (const sx of [-1, 1]) P.push({ shape: 'torus', pos: [sx * 0.29, 1.2, 0], r: 0.07, tube: 0.016, mat: brass() });
        P.push(C([0, 1.37, 0], 0.22, 0.22, 0.02, M('soil')));
        const greens = [th.leaf, s3Shade(th.leaf, 0.8), s3Shade(th.leaf, 1.2), s3Shade(th.leaf, 0.66)];
        const fronds = 11;
        for (let i = 0; i < fronds; i++) {
            const a = (i / fronds) * PI * 2 + rnd() * 0.5, tilt = 0.15 + rnd() * 0.45, len = 0.7 + rnd() * 0.4;
            const out = 0.07 + (Math.sin(tilt) * len) / 2;
            P.push(B([Math.cos(a) * out, 1.38 + (Math.cos(tilt) * len) / 2, Math.sin(a) * out], [0.15 + rnd() * 0.08, len, 0.02], M('leaf', greens[i % greens.length]), { bevel: 0.008, taper: 0.8, rot: lean(a, tilt) }));
        }
        return P;
    }

    // A round velvet cushion in a brass-rimmed tray on ball feet, with tassels, and the cat asleep on it
    function petbed(lw, ld, th) {
        const sx = lw * 0.92, sz = ld * 0.88;
        const P = [];
        const brassM = brass(), vel = M('velvet', th.petbed), gold = gilt();
        for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(S([fx * 0.3 * sx, 0.05, fz * 0.3 * sz], 0.05, brassM));
        P.push(C([0, 0.13, 0], 0.5, 0.47, 0.1, wood(th.couchWood), { scale: [sx, 1, sz] }));
        P.push(R([0, 0.19, 0], 0.5, 0.03, brassM, { scale: [sx, sz, 1] }));
        P.push(C([0, 0.22, 0], 0.44, 0.46, 0.1, vel, { scale: [sx, 1, sz] }));
        P.push(R([0, 0.27, 0], 0.4, 0.07, vel, { scale: [sx, sz, 1] }));
        for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const x = fx * 0.354 * sx, z = fz * 0.354 * sz;
            P.push(C([x, 0.12, z], 0.012, 0.04, 0.1, gold));
            P.push(S([x, 0.185, z], 0.028, gold));
        }
        return P.concat(s3Cat(th, 0.06));
    }

    // Interior walls, one tile each: a panelled partition, toy chests, a marble counter,
    // bookcases, boilers and aether columns
    const TOY_INKS = ['#B5372E', '#1F6E8C', '#D9A22E', '#2E7D4F', '#6B3A7A'];
    function wall(obs, th) {
        const P = [];
        const lw = obs.w, ld = obs.h, col = obs.col || 0, row = obs.row || 0;
        const dark = wood(th.trim), brassM = brass();
        switch (th.wallStyle) {
            case 'toybox': {
                // two painted chests, the top one askew, and a toy left on the lid
                const a = TOY_INKS[Math.floor(pick(col, row, 1) * 5)], b = TOY_INKS[Math.floor(pick(col, row, 2) * 5)];
                const t1 = (pick(col, row, 3) - 0.5) * 0.1, t2 = (pick(col, row, 4) - 0.5) * 0.5;
                P.push(B([0, 0.56, 0], [lw - 0.08, 1.12, ld - 0.08], M('paint', a), { bevel: 0.03, rot: [0, t1, 0], texture: 'steam:panel' }));
                P.push(B([0, 1.0, 0], [lw - 0.04, 0.06, ld - 0.04], brassM, { rot: [0, t1, 0] }));
                P.push(B([0, 1.48, 0], [lw - 0.3, 0.72, ld - 0.3], M('paint', b), { bevel: 0.03, rot: [0, t2, 0], texture: 'steam:panel' }));
                P.push(B([0, 1.72, 0], [lw - 0.26, 0.05, ld - 0.26], brassM, { rot: [0, t2, 0] }));
                const toy = pick(col, row, 5);
                if (toy < 0.34) P.push(S([0, 2.06, 0], 0.22, M('vinyl', TOY_INKS[Math.floor(pick(col, row, 6) * 5)])));
                else if (toy < 0.67) P.push({ shape: 'gear', pos: [0, 2.08, 0], r: 0.24, teeth: 10, depth: 0.06, hole: 0.05, rot: [PI / 2, 0, 0], mat: brassM, tag: 'spin', speed: 0.9 });
                else P.push(B([0, 1.99, 0], [0.3, 0.3, 0.3], M('paint', '#EFE3C8'), { bevel: 0.03, rot: [0, 0.6, 0] }));
                break;
            }
            case 'counter': {
                // painted cupboards under a marble slab, a brass rail above and a foot rail below
                P.push(B([0, 0.07, 0], [lw - 0.14, 0.14, ld - 0.14], M('iron')));
                P.push(B([0, 0.95, 0], [lw - 0.04, 1.62, ld - 0.04], M('paint', th.accent.color), { texture: 'steam:panel' }));
                P.push(B([0, 0.3, 0], [lw + 0.06, 0.035, ld + 0.06], brassM));
                P.push(B([0, 1.52, 0], [lw + 0.05, 0.035, ld + 0.05], brassM));
                P.push(B([0, 1.82, 0], [lw + 0.08, 0.1, ld + 0.08], M('marble', '#EDE6D6'), { bevel: 0.03 }));
                if (pick(col, row, 1) > 0.6) P.push({ shape: 'lathe', pos: [0, 1.87, 0], points: [[0, 0], [0.2, 0], [0.25, 0.07], [0.25, 0.24], [0.2, 0.29], [0.05, 0.33], [0.03, 0.38], [0.07, 0.41], [0, 0.42]], mat: M('copper') });
                break;
            }
            case 'bookcase': {
                // a bay of shelves on a panelled plinth, under a cornice; now and then a globe on top
                P.push(B([0, 0.22, 0], [lw, 0.44, ld], dark, { texture: 'steam:panel' }));
                P.push(B([0, 2.22, 0], [lw - 0.06, 3.56, ld - 0.06], M('paint', '#FFFFFF'), { texture: 'steam:books' }));
                P.push(B([0, 4.03, 0], [lw + 0.02, 0.05, ld + 0.02], gilt()));
                P.push(B([0, 4.17, 0], [lw + 0.1, 0.24, ld + 0.1], dark, { bevel: 0.06 }));
                if (pick(col, row, 1) > 0.72) P.push(S([0, 4.49, 0], 0.2, M('ceramic', th.accent.color)));
                break;
            }
            case 'boiler': {
                // a riveted tank on a firebox, the fire showing through a slit on every side
                const skin = pick(col, row, 1) > 0.5 ? M('copper', '#B06A3C') : M('iron', '#4A4642');
                const q = Math.floor(pick(col, row, 2) * 4) * (PI / 2);
                P.push(B([0, 0.3, 0], [lw - 0.02, 0.6, ld - 0.02], M('iron', '#34302D'), { texture: 'steam:rivet' }));
                P.push(C([0, 0.36, 0], 0.535, 0.535, 0.09, glow(th.spark, 2), { tag: 'flicker', noShadow: true }));
                P.push(C([0, 1.6, 0], 0.44, 0.44, 2.0, skin, { texture: 'steam:rivet', texRepeat: [3, 2] }));
                P.push(S([0, 2.6, 0], 0.44, skin, { scale: [1, 0.55, 1] }));
                P.push(R([0, 1.75, 0], 0.445, 0.03, brassM));
                P.push(C([Math.sin(q) * 0.46, 2.1, Math.cos(q) * 0.46], 0.13, 0.13, 0.05, M('ceramic', '#FFFFFF'), { rot: facing(q), texture: 'steam:gauge' }));
                break;
            }
            case 'apparatus': {
                // a glass column between brass fittings, a lit filament and a crystal turning in it
                P.push({ shape: 'lathe', pos: [0, 0, 0], points: [[0.47, 0], [0.47, 0.1], [0.4, 0.16], [0.38, 0.42], [0.43, 0.48], [0.36, 0.58], [0, 0.58]], mat: brassM });
                P.push(C([0, 2.18, 0], 0.33, 0.33, 3.2, Object.assign(M('glass', '#CFF5EA'), { opacity: 0.16 }), { open: true }));
                P.push(C([0, 2.18, 0], 0.045, 0.045, 3.2, glow(th.spark, 2), { tag: 'pulse', noShadow: true }));
                P.push({ shape: 'gem', pos: [0, 2.2, 0], r: 0.2, faces: 8, mat: M('crystal', th.spark), tag: 'spin', speed: 0.8, noShadow: true });
                P.push(R([0, 1.3, 0], 0.34, 0.03, brassM));
                P.push({ shape: 'lathe', pos: [0, 3.76, 0], points: [[0, 0], [0.36, 0], [0.4, 0.06], [0.3, 0.16], [0.12, 0.3], [0.1, 0.42], [0.16, 0.5], [0.02, 0.56]], mat: brassM });
                break;
            }
            default: {
                // 'panel': wainscot below, the accent paper above, a cornice at the ceiling
                P.push(B([0, WAINSCOT / 2, 0], [lw, WAINSCOT, ld], dark, { texture: 'steam:panel' }));
                P.push(B([0, 0.13, 0], [lw + 0.05, 0.26, ld + 0.05], dark));
                P.push(B([0, WAINSCOT + 0.04, 0], [lw + 0.06, 0.1, ld + 0.06], dark, { bevel: 0.03 }));
                P.push(B([0, (WAINSCOT + H) / 2, 0], [lw - 0.04, H - WAINSCOT, ld - 0.04], paper(th.accent.color), { texture: 'steam:damask', texRepeat: [1, 4] }));
                P.push(B([0, H - 0.14, 0], [lw + 0.1, 0.28, ld + 0.1], M('plaster', th.ceiling), { bevel: 0.06 }));
            }
        }
        return P;
    }

    // The charging dock: a brass plate with a ring of blue spark, and a small boiler with a
    // gauge and a warning lamp on its wall side. The middle stays clear for the vacuum.
    function dock(th) {
        const brassM = brass(), cu = M('copper');
        return [
            C([0, 0.02, 0], 0.44, 0.46, 0.04, brassM),
            R([0, 0.045, 0], 0.36, 0.012, glow('#6FC8FF', 1), { tag: 'dockRing', noShadow: true }),
            B([0, 0.07, 0.1], [0.28, 0.03, 0.2], cu, { bevel: 0.01 }),
            C([0, 0.3, -0.43], 0.11, 0.13, 0.6, cu, { texture: 'steam:rivet', texRepeat: [2, 1] }),
            S([0, 0.62, -0.43], 0.11, brassM, { scale: [1, 0.6, 1] }),
            C([0, 0.4, -0.33], 0.07, 0.07, 0.03, M('ceramic', '#FFFFFF'), { rot: [PI / 2, 0, 0], texture: 'steam:gauge' }),
            C([0, 0.9, -0.43], 0.012, 0.016, 0.5, brassM),
            S([0, 1.17, -0.43], 0.04, glow('#FF6A3A', 1.5), { tag: 'blink', noShadow: true }),
        ];
    }

    // ---- The room ---------------------------------------------------------------------------

    function architecture(levelIndex, th) {
        const lit = th.lamp.on;
        const P = s3Shell(th, { mat: (wl) => paper(wl === th.accent.wall ? th.accent.color : th.walls), wallTex: 'steam:damask', rep: [1, 5], ceilMat: M('plaster', th.ceiling) });
        const dark = wood(th.trim), brassM = brass(), gold = gilt(), copper = M('copper'), plaster = M('plaster', th.ceiling);
        const dado = th.dado ? Object.assign(M('paint', th.dado), { roughness: 0.45 }) : dark;
        const mid = (W.x0 + W.x1) / 2, span = W.x1 - W.x0;

        // Every wall: panelled wainscot, a deep skirting, a dado rail, a cornice with a gilt bead
        for (const wl of WALLS) {
            const len = s3WallLength(wl), turn = [0, yawOf(wl), 0];
            const at = (y, out) => s3WallPoint(wl, len / 2, y, out).pos;
            P.push(B(at(WAINSCOT / 2, 0.02), [len, WAINSCOT, 0.04], dado, { rot: turn, texture: 'steam:panel', texRepeat: [len, 1] }));
            P.push(B(at(0.13, 0.045), [len, 0.26, 0.07], dark, { rot: turn, bevel: 0.02 }));
            P.push(B(at(WAINSCOT + 0.04, 0.045), [len, 0.1, 0.09], dark, { rot: turn, bevel: 0.03 }));
            P.push(B(at(H - 0.14, 0.09), [len, 0.28, 0.18], plaster, { rot: turn, bevel: 0.07 }));
            P.push(B(at(H - 0.33, 0.05), [len, 0.05, 0.1], gold, { rot: turn }));
        }

        // A coffered ceiling: three beams each way
        for (const z of [2, 6, 10]) P.push(B([COLS / 2, H - 0.13, z], [COLS, 0.26, 0.34], dark, { noShadow: true }));
        for (const x of [2.5, 7.5, 12.5]) P.push(B([x, H - 0.11, ROWS / 2], [0.34, 0.22, ROWS], dark, { noShadow: true }));

        // The window: a sill, panelled reveals, mullions and a transom, a wooden blind let half
        // down, and velvet curtains tied back under a swagged pelmet
        P.push(B([mid, W.sill - 0.05, 0], [span + 0.36, 0.1, 0.36], dark, { bevel: 0.03 }));
        for (const x of [W.x0 - 0.08, W.x1 + 0.08]) P.push(B([x, (W.sill + W.top) / 2, -0.04], [0.16, W.top - W.sill + 0.1, 0.2], dark));
        for (let i = 1; i < 3; i++) P.push(B([W.x0 + (span * i) / 3, (W.sill + W.top) / 2, -0.1], [0.07, W.top - W.sill, 0.07], dark));
        P.push(B([mid, W.sill + (W.top - W.sill) * 0.62, -0.1], [span, 0.07, 0.07], dark));
        const blade = wood(s3Shade(th.trim, 1.35));
        for (let i = 0; i < 8; i++) P.push(B([mid, W.top - 0.1 - i * 0.16, -0.05], [span - 0.06, 0.02, 0.13], blade, { rot: [0.6, 0, 0], tag: 'slat' }));
        P.push(s3WindowGlass(th.glass, 0.18));
        const velvet = M('velvet', th.drape);
        P.push(B([mid, 4.31, 0.2], [span + 1.3, 0.38, 0.3], velvet, { bevel: 0.05, texture: 'steam:pleat', texRepeat: [6, 1], noShadow: true }));
        P.push(B([mid, 4.52, 0.21], [span + 1.36, 0.05, 0.34], gold, { noShadow: true }));
        for (let i = 0; i < 3; i++) {
            const x = mid + (i - 1) * 1.6;
            P.push(C([x, 4.14, 0.34], 0.78, 0.78, 0.04, velvet, { rot: [PI / 2, 0, 0], thetaStart: -PI / 2, thetaLength: PI, scale: [1, 1, 0.55], noShadow: true }));
            P.push({ shape: 'torus', pos: [x, 4.14, 0.365], r: 0.78, tube: 0.022, arc: PI, rot: [0, 0, PI], scale: [1, 0.55, 1], mat: gold, noShadow: true });
        }
        for (const x of [W.x0 - 0.2, W.x1 + 0.2]) {
            P.push(B([x, 3.2, 0.2], [0.42, 2.0, 0.12], velvet, { taper: -0.9, bevel: 0.04, texture: 'steam:pleat', noShadow: true }));
            P.push(B([x, 1.22, 0.2], [0.8, 1.96, 0.12], velvet, { taper: 0.47, bevel: 0.04, texture: 'steam:pleat', noShadow: true }));
            P.push(R([x, 2.2, 0.2], 0.24, 0.035, gold, { scale: [1, 0.4, 1] }));
        }

        // The door: six panels and a brass kick plate between pilasters, a brass knob, and a
        // stained-glass fanlight under a round arch with a gilt keystone
        const door = th.door, dw = 1.8, dh = 3.2, dyaw = yawOf(door.wall), dturn = [0, dyaw, 0];
        const dp = (right, y, out) => onWall(door.wall, door.at, y, out, right);
        const fanR = dw / 2 + 0.06, springY = dh + 0.1;
        P.push(B(dp(0, dh / 2, 0.06), [dw, dh, 0.12], wood(door.color), { rot: dturn, texture: 'steam:panel', texRepeat: [2, 3], tag: 'door' }));
        P.push(B(dp(0, 0.22, 0.125), [dw - 0.16, 0.3, 0.02], brassM, { rot: dturn }));
        for (const s of [-1, 1]) P.push(B(dp(s * (dw / 2 + 0.1), (dh + 0.1) / 2, 0.09), [0.2, dh + 0.1, 0.2], dark, { rot: dturn, bevel: 0.03 }));
        P.push(B(dp(0, dh + 0.05, 0.09), [dw + 0.4, 0.1, 0.22], dark, { rot: dturn }));
        P.push({ shape: 'torus', pos: dp(0, springY, 0.09), r: dw / 2 + 0.1, tube: 0.08, arc: PI, rot: dturn, mat: dark });
        P.push(C(dp(0, springY, 0.04), fanR, fanR, 0.03, M('ceramic', '#FFFFFF'), { rot: facing(dyaw), thetaStart: PI / 2, thetaLength: PI, texture: 'steam:fan', noShadow: true }));
        for (const a of [PI / 4, PI / 2, PI * 0.75]) P.push({ shape: 'rod', from: dp(0, springY, 0.07), to: dp(Math.cos(a) * fanR, springY + Math.sin(a) * fanR, 0.07), r: 0.016, mat: brassM });
        P.push(B(dp(0, springY + dw / 2 + 0.12, 0.12), [0.2, 0.24, 0.16], gold, { rot: dturn, bevel: 0.03 }));
        P.push(C(dp(0.62, 1.75, 0.13), 0.09, 0.09, 0.02, brassM, { rot: facing(dyaw) }));
        P.push(S(dp(0.62, 1.75, 0.2), 0.065, brassM));

        // The gasolier: a ceiling rose under the beams, a turned brass body, six swan-neck arms
        // and a glass globe on each. It casts no shadow of its own light.
        const LX = S3_LAMP.x, LZ = S3_LAMP.z, ly = 3.5, off = { noShadow: true };
        P.push(C([LX, H - 0.29, LZ], 0.4, 0.34, 0.06, gold, off));
        P.push(C([LX, (H - 0.3 + ly + 0.5) / 2, LZ], 0.03, 0.03, H - 0.3 - ly - 0.5, brassM, off));
        P.push({ shape: 'lathe', pos: [LX, ly - 0.15, LZ], points: [[0.02, 0], [0.08, 0.05], [0.05, 0.12], [0.13, 0.24], [0.17, 0.36], [0.1, 0.46], [0.05, 0.54], [0.09, 0.6], [0.04, 0.66]], mat: brassM, noShadow: true });
        P.push(S([LX, ly - 0.2, LZ], 0.06, gold, off));
        P.push(R([LX, ly + 0.02, LZ], 0.42, 0.014, brassM, off));
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * PI * 2 + PI / 6, c = Math.cos(a), s = Math.sin(a);
            P.push({ shape: 'tube', pos: [LX, ly, LZ], path: [[c * 0.12, 0.1, s * 0.12], [c * 0.4, -0.08, s * 0.4], [c * 0.7, -0.04, s * 0.7], [c * 0.8, 0.16, s * 0.8]], r: 0.022, mat: brassM, noShadow: true });
            P.push(C([LX + c * 0.8, ly + 0.2, LZ + s * 0.8], 0.1, 0.04, 0.08, brassM, off));
            P.push(S([LX + c * 0.8, ly + 0.36, LZ + s * 0.8], 0.15, globe(th, lit), { tag: 'bulb', noShadow: true }));
        }

        // Wall lamps: a cog for a back plate, a brass arm, a cup and a flickering globe
        const spots = sconceSpots(th);
        for (const [wl, at] of spots) {
            const sp = (y, out) => s3WallPoint(wl, at, y, out).pos;
            P.push({ shape: 'gear', pos: sp(2.6, 0.03), r: 0.19, teeth: 10, depth: 0.04, rot: facing(yawOf(wl)), mat: brassM });
            P.push({ shape: 'rod', from: sp(2.6, 0.04), to: sp(2.72, 0.32), r: 0.022, mat: brassM });
            P.push(C(sp(2.76, 0.32), 0.1, 0.04, 0.08, brassM));
            P.push(S(sp(2.92, 0.32), 0.14, glow(th.gas, lit ? 2.2 : 1.3), { tag: 'flicker', noShadow: true }));
        }

        // The great clock on the accent wall: three cogs in mesh turning behind an enamel face,
        // hands at ten past ten and a red hand that sweeps the seconds
        const aw = th.accent.wall, cyaw = yawOf(aw);
        const cp = (right, up, out) => onWall(aw, s3WallLength(aw) / 2, 3.02 + up, out, right);
        const cog = (right, up, r, teeth, speed, mat) => ({ shape: 'gear', pos: cp(right, up, 0.05), r, teeth, depth: 0.05, hole: r * 0.3, rot: facing(cyaw), mat, tag: 'spin', speed });
        P.push(cog(0, 0, 0.86, 24, 0.1, brassM));
        P.push(cog(0.94, -0.66, 0.43, 12, -0.2, copper));
        P.push(cog(-0.88, 0.51, 0.287, 8, -0.3, gold));
        P.push(C(cp(0, 0, 0.1), 0.62, 0.62, 0.05, M('ceramic', '#FFFFFF'), { rot: facing(cyaw), texture: 'steam:dial' }));
        P.push({ shape: 'torus', pos: cp(0, 0, 0.12), r: 0.62, tube: 0.05, rot: [0, cyaw, 0], mat: brassM });
        const iron = M('iron', '#1E1A18');
        for (const [ang, len, wide] of [[-0.96, 0.32, 0.05], [1.05, 0.48, 0.035]]) {
            P.push(B(cp((Math.sin(ang) * len) / 2, (Math.cos(ang) * len) / 2, 0.135), [wide, len, 0.012], iron, { rot: [0, cyaw, -ang] }));
        }
        P.push(C(cp(0, 0, 0.15), 0.5, 0.5, 0.01, M('paint', '#9A2A22'), { rot: facing(cyaw), thetaStart: -0.03, thetaLength: 0.06, tag: 'spin', speed: -0.105, noShadow: true }));
        P.push(S(cp(0, 0, 0.16), 0.05, brassM));

        // A run of copper pipe under the cornice of the window wall, down beside the window to a
        // red valve wheel, with brass collars and a pressure gauge
        const py = H - 0.6, pz = 0.16, px = 9.8, red = M('paint', '#8E2A22');
        P.push({ shape: 'rod', from: [0.4, py, pz], to: [px - 0.33, py, pz], r: 0.06, mat: copper });
        P.push({ shape: 'tube', pos: [0, 0, 0], path: [[px - 0.35, py, pz], [px - 0.1, py - 0.05, pz], [px, py - 0.32, pz]], r: 0.06, mat: copper });
        P.push({ shape: 'rod', from: [px, py - 0.3, pz], to: [px, WAINSCOT + 0.08, pz], r: 0.06, mat: copper });
        for (const x of [0.4, 3.3, 6.6]) P.push(C([x, py, pz], 0.085, 0.085, 0.07, brassM, { rot: [0, 0, PI / 2] }));
        P.push({ shape: 'torus', pos: [px, 2.4, pz + 0.16], r: 0.17, tube: 0.022, mat: red });
        P.push({ shape: 'rod', from: [px - 0.17, 2.4, pz + 0.16], to: [px + 0.17, 2.4, pz + 0.16], r: 0.014, mat: red });
        P.push({ shape: 'rod', from: [px, 2.23, pz + 0.16], to: [px, 2.57, pz + 0.16], r: 0.014, mat: red });
        P.push(C([px, 2.4, pz + 0.1], 0.035, 0.035, 0.16, brassM, { rot: [PI / 2, 0, 0] }));
        P.push(C([5, py - 0.2, pz + 0.04], 0.15, 0.15, 0.06, M('ceramic', '#FFFFFF'), { rot: [PI / 2, 0, 0], texture: 'steam:gauge' }));
        P.push({ shape: 'torus', pos: [5, py - 0.2, pz + 0.075], r: 0.15, tube: 0.022, mat: brassM });

        // Gilt frames: two oils on the side wall, a sea chart on the window wall
        const hang = (wl, at, y, w, h, tex, tint) => {
            const turn = [0, yawOf(wl), 0];
            P.push(B(s3WallPoint(wl, at, y, 0.04).pos, [w + 0.22, h + 0.22, 0.08], gold, { rot: turn, bevel: 0.03 }));
            P.push({ shape: 'plane', pos: s3WallPoint(wl, at, y, 0.09).pos, size: [w, h], rot: turn, mat: Object.assign(M('paint', tint), { roughness: 0.4 }), texture: tex });
        };
        const side = sideWall(th), slen = s3WallLength(side);
        const frames = (th.side && th.side.frames) || [slen * 0.27, slen * 0.73];
        hang(side, frames[0], 2.85, 1.3, 1.0, 'steam:oil', '#C98A4B');
        hang(side, frames[1], 2.85, 1.3, 1.0, 'steam:oil', '#4B7A8C');
        hang('north', 5, 2.75, 1.9, 1.3, 'steam:chart', '#DCCB9C');
        return P;
    }

    // ---- Painting: the floors, the skyline, the wallpaper ------------------------------------------

    const FLOOR_BASE = { herringbone: '#A8733F', encaustic: '#E2D2AE', checker: '#8E877C', boards: '#74402A', plate: '#544C46', star: '#C6C9CE' };
    const FLOOR_SEAM = { herringbone: 'rgba(48,26,12,0.6)', encaustic: 'rgba(90,70,54,0.5)', checker: 'rgba(40,36,32,0.5)', boards: 'rgba(16,8,4,0.7)', plate: 'rgba(8,6,6,0.75)', star: 'rgba(70,74,90,0.55)' };
    const FLOOR_WOOD = { herringbone: ['#A8733F', '#B5804A', '#9C6836', '#BD8A52', '#94602F'], boards: ['#74402A', '#7E482E', '#6A3A24', '#864E32'] };

    // The whole floor, px pixels to a tile. One panel, slab or plate to a tile so the grid still reads.
    function paintFloor(t, th, px) {
        const w = COLS * px, h = ROWS * px, u = px / 48;
        const rnd = seededRandom(th.floorSeed);
        const kind = FLOOR_BASE[th.floor] ? th.floor : 'herringbone';
        const tones = FLOOR_WOOD[kind] || [];
        const poly = (pts) => { t.beginPath(); pts.forEach((p, i) => t[i ? 'lineTo' : 'moveTo'](p[0], p[1])); t.closePath(); };
        const disc = (x, y, r) => { t.beginPath(); t.arc(x, y, r, 0, PI * 2); t.fill(); };
        const star = (cx, cy, r1, r2, n, turn) => {
            const pts = [];
            for (let i = 0; i < n * 2; i++) {
                const a = (i / (n * 2)) * PI * 2 + turn, r = i % 2 ? r2 : r1;
                pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
            }
            poly(pts);
            t.fill();
        };
        // veins in marble: fine, pale and nearly straight, so none can be taken for a hair on the floor
        const veins = (x, y, ink, count) => {
            for (let i = 0; i < count; i++) {
                const x0 = x + rnd() * px, y0 = y + rnd() * px, a = rnd() * PI * 2, len = px * (0.7 + rnd() * 0.8), kink = (rnd() - 0.5) * 0.5;
                t.strokeStyle = `rgba(${ink},${(0.06 + rnd() * 0.09).toFixed(2)})`;
                t.lineWidth = (0.6 + rnd() * 1.6) * u;
                t.beginPath();
                t.moveTo(x0, y0);
                t.lineTo(x0 + Math.cos(a) * len * 0.45, y0 + Math.sin(a) * len * 0.45);
                t.lineTo(x0 + Math.cos(a) * len * 0.45 + Math.cos(a + kink) * len * 0.55, y0 + Math.sin(a) * len * 0.45 + Math.sin(a + kink) * len * 0.55);
                t.stroke();
            }
        };
        t.fillStyle = FLOOR_BASE[kind];
        t.fillRect(0, 0, w, h);
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const x = c * px, y = r * px, cx = x + px / 2, cy = y + px / 2;
                const corners = [[x, y], [x + px, y], [x, y + px], [x + px, y + px]];
                t.save();
                t.beginPath();
                t.rect(x, y, px, px);
                t.clip();
                switch (kind) {
                    case 'encaustic': {
                        // a fired tile: a red star, quarter rounds in the room's colour that meet their neighbours
                        t.fillStyle = shadeColor('#E2D2AE', Math.floor(rnd() * 10) - 5);
                        t.fillRect(x, y, px, px);
                        t.fillStyle = mix(th.accent.color, '#E2D2AE', 0.42);
                        for (const [qx, qy] of corners) disc(qx, qy, px * 0.25);
                        t.fillStyle = '#E2D2AE';
                        for (const [qx, qy] of corners) disc(qx, qy, px * 0.16);
                        t.fillStyle = '#C8805A';
                        star(cx, cy, px * 0.27, px * 0.13, 8, PI / 8);
                        t.fillStyle = '#E8DAB8';
                        disc(cx, cy, px * 0.11);
                        t.fillStyle = '#D9A441';
                        star(cx, cy, px * 0.09, px * 0.035, 4, 0);
                        t.fillStyle = '#8A8478';
                        for (const [qx, qy] of [[cx, y], [cx, y + px], [x, cy], [x + px, cy]]) star(qx, qy, px * 0.055, px * 0.055, 2, 0);
                        break;
                    }
                    case 'checker': {
                        // marble slabs, cream and charcoal turn about
                        const darkSlab = (c + r) % 2 === 1;
                        t.fillStyle = shadeColor(darkSlab ? '#4C4844' : '#DCCFB4', Math.floor(rnd() * 12) - 6);
                        t.fillRect(x, y, px, px);
                        veins(x, y, darkSlab ? '235,228,214' : '110,100,92', 2);
                        break;
                    }
                    case 'boards': {
                        // a wide dark board, pegged with brass at both ends
                        t.fillStyle = tones[Math.floor(rnd() * tones.length)];
                        t.fillRect(x, y, px, px);
                        for (let i = 0; i < 9; i++) {
                            t.fillStyle = `rgba(${rnd() > 0.5 ? '20,10,4' : '150,100,60'},${(0.05 + rnd() * 0.08).toFixed(2)})`;
                            t.fillRect(x + rnd() * px * 0.5, y + rnd() * px, px * (0.3 + rnd() * 0.6), (0.6 + rnd()) * u);
                        }
                        t.fillStyle = 'rgba(255,220,170,0.07)';
                        t.fillRect(x, y + u, px, 1.5 * u);
                        t.fillStyle = '#B8923A';
                        for (const [dx, dy] of [[0.1, 0.16], [0.1, 0.84], [0.9, 0.16], [0.9, 0.84]]) disc(x + px * dx, y + px * dy, 1.5 * u);
                        break;
                    }
                    case 'plate': {
                        // an oiled iron plate: raised tread bars, a copper strip let in round the edge,
                        // and a brass rivet at every corner and edge
                        const v = 70 + Math.floor(rnd() * 14);
                        t.fillStyle = `rgb(${v + 8},${v + 2},${v - 4})`;
                        t.fillRect(x, y, px, px);
                        t.strokeStyle = 'rgba(196,112,62,0.42)';
                        t.lineWidth = 1.1 * u;
                        t.strokeRect(x + px * 0.14, y + px * 0.14, px * 0.72, px * 0.72);
                        t.fillStyle = 'rgba(228,208,188,0.2)';
                        for (let j = 0; j < 4; j++) {
                            for (let i = 0; i < 4; i++) {
                                const bx = x + px * (0.2 + i * 0.2), by = y + px * (0.2 + j * 0.2);
                                if ((i + j) % 2) t.fillRect(bx - px * 0.06, by - px * 0.018, px * 0.12, px * 0.036);
                                else t.fillRect(bx - px * 0.018, by - px * 0.06, px * 0.036, px * 0.12);
                            }
                        }
                        for (const [dx, dy] of [[0.08, 0.08], [0.5, 0.08], [0.92, 0.08], [0.08, 0.5], [0.92, 0.5], [0.08, 0.92], [0.5, 0.92], [0.92, 0.92]]) {
                            t.fillStyle = 'rgba(0,0,0,0.45)';
                            disc(x + px * dx + 0.5 * u, y + px * dy + 0.6 * u, 2.2 * u);
                            t.fillStyle = 'rgba(214,170,84,0.9)';
                            disc(x + px * dx, y + px * dy, 1.6 * u);
                        }
                        break;
                    }
                    case 'star': {
                        // pale marble inlaid with a compass star in navy and brass
                        t.fillStyle = shadeColor((c + r) % 2 ? '#BFC3C9' : '#CDD0D4', Math.floor(rnd() * 10) - 5);
                        t.fillRect(x, y, px, px);
                        veins(x, y, '90,98,120', 1);
                        t.fillStyle = '#B8923A';
                        star(cx, cy, px * 0.24, px * 0.085, 4, PI / 4);
                        t.fillStyle = '#2F3F5C';
                        star(cx, cy, px * 0.34, px * 0.085, 4, 0);
                        t.fillStyle = '#D9C9A0';
                        disc(cx, cy, px * 0.06);
                        t.fillStyle = '#2F3F5C';
                        for (const [qx, qy] of corners) star(qx, qy, px * 0.11, px * 0.11, 2, 0);
                        break;
                    }
                    default: {
                        // a parquet panel: boards laid in a chevron that points the other way on the next tile
                        const s = px / 4, up = (c + r) % 2 ? -1 : 1;
                        t.lineWidth = 0.7 * u;
                        t.strokeStyle = 'rgba(48,26,12,0.5)';
                        for (let k = -3; k <= 6; k++) {
                            for (const x0 of [x, x + px]) {
                                const y0 = y + k * s;
                                t.fillStyle = tones[Math.floor(rnd() * tones.length)];
                                poly([[x0, y0], [cx, y0 + (up * px) / 2], [cx, y0 + (up * px) / 2 + s], [x0, y0 + s]]);
                                t.fill();
                                t.stroke();
                            }
                        }
                    }
                }
                t.restore();
            }
        }
        // the seams between tiles, and on the parquet a brass stud where four panels meet
        t.fillStyle = FLOOR_SEAM[kind];
        for (let c = 0; c <= COLS; c++) t.fillRect(c * px - 0.6 * u, 0, 1.2 * u, h);
        for (let r = 0; r <= ROWS; r++) t.fillRect(0, r * px - 0.6 * u, w, 1.2 * u);
        if (kind === 'herringbone') {
            t.fillStyle = '#C9A04A';
            for (let r = 0; r <= ROWS; r++) for (let c = 0; c <= COLS; c++) disc(c * px, r * px, 1.7 * u);
        }
        // wear: a few scuffs, then the hour of the day
        for (let i = 0; i < 150; i++) {
            const x = rnd() * w, y = rnd() * h, len = (5 + rnd() * 22) * u, a = rnd() * PI;
            t.strokeStyle = `rgba(255,240,220,${(0.03 + rnd() * 0.05).toFixed(3)})`;
            t.lineWidth = 0.6 * u;
            t.beginPath();
            t.moveTo(x, y);
            t.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
            t.stroke();
        }
        const tint = { 'golden hour': 'rgba(255,170,90,0.07)', dusk: 'rgba(90,50,40,0.1)', night: 'rgba(26,32,70,0.2)' }[th.time];
        if (tint) {
            t.fillStyle = tint;
            t.fillRect(0, 0, w, h);
        }
    }

    // Outside the window: a smoky skyline of chimneys, domes and spires, airships overhead,
    // and the low sun or the moon in the haze. The room looks up at it from the floor and past
    // a sill, so nothing below about two thirds of the way down the picture is ever seen: the
    // roofs stand in the middle of it and the sky takes the top half.
    function paintBackdrop(t, th, w, h) {
        const rnd = seededRandom(th.floorSeed + 5);
        const night = th.time === 'night', low = th.time === 'dusk' || th.time === 'golden hour';
        const foot = h * 0.52;          // where the farthest roofs stand
        const disc = (x, y, r) => { t.beginPath(); t.arc(x, y, r, 0, PI * 2); t.fill(); };
        const poly = (pts) => { t.beginPath(); pts.forEach((p, i) => t[i ? 'lineTo' : 'moveTo'](p[0], p[1])); t.closePath(); t.fill(); };

        const sky = t.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, th.sky.zenith);
        sky.addColorStop(0.3, mix(th.sky.zenith, th.sky.horizon, 0.55));
        sky.addColorStop(0.56, th.sky.horizon);
        sky.addColorStop(1, mix(th.sky.horizon, th.sky.ground, 0.7));
        t.fillStyle = sky;
        t.fillRect(0, 0, w, h);
        if (night) {
            for (let i = 0; i < 420; i++) {
                const s = rnd() > 0.92 ? 3 : 2;
                t.fillStyle = `rgba(255,248,230,${(0.25 + rnd() * 0.7).toFixed(2)})`;
                t.fillRect(rnd() * w, rnd() * h * 0.66, s, s);
            }
        }

        // The low sun stands where the room's light comes from, sinking behind the far roofs;
        // by night the moon does. By day the sun is too high to see and a pale moon hangs in
        // the blue instead.
        const az = (th.sun.azimuth * PI) / 180, el = (th.sun.elevation * PI) / 180;
        const sx = w * clamp((12.5 + Math.tan(az) * 34 + 34.5) / 96, 0.3, 0.9);
        const sy = h * clamp((25 - (34 * Math.tan(el)) / Math.cos(az)) / 36, 0.18, 0.36);
        if (low) {
            const g = t.createRadialGradient(sx, sy, 10, sx, sy, 520);
            g.addColorStop(0, 'rgba(255,226,170,0.95)');
            g.addColorStop(0.16, 'rgba(255,186,110,0.55)');
            g.addColorStop(1, 'rgba(255,150,90,0)');
            t.fillStyle = g;
            t.fillRect(0, 0, w, h);
            t.fillStyle = '#FFEFC8';
            disc(sx, sy, 62);
        } else {
            const mx = night ? sx : w * 0.66, my = night ? sy : h * 0.2, mr = night ? 88 : 60;
            if (night) {
                const g = t.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 4.2);
                g.addColorStop(0, 'rgba(190,205,255,0.4)');
                g.addColorStop(1, 'rgba(190,205,255,0)');
                t.fillStyle = g;
                t.fillRect(0, 0, w, h);
            }
            t.fillStyle = night ? '#F3F0DE' : 'rgba(255,255,255,0.5)';
            disc(mx, my, mr);
            t.fillStyle = night ? 'rgba(90,100,130,0.16)' : 'rgba(150,175,205,0.2)';
            for (const [dx, dy, r] of [[-0.3, 0.12, 0.2], [0.26, -0.2, 0.13], [0.1, 0.36, 0.15], [-0.14, -0.4, 0.1]]) disc(mx + dx * mr, my + dy * mr, r * mr);
        }

        // Long bars of cloud and smoke
        for (let i = 0; i < 12; i++) {
            const cx = rnd() * w, cy = h * (0.05 + rnd() * 0.42), cw = 180 + rnd() * 380, ch = 12 + rnd() * 30;
            const a = (night ? 0.05 + rnd() * 0.08 : low ? 0.08 + rnd() * 0.14 : 0.14 + rnd() * 0.2).toFixed(3);
            t.fillStyle = night ? `rgba(120,130,170,${a})` : low ? `rgba(255,200,150,${a})` : `rgba(255,250,240,${a})`;
            for (let k = 0; k < 4; k++) {
                t.beginPath();
                t.ellipse(cx + (k - 1.5) * cw * 0.22, cy + (k % 2) * ch * 0.4, cw * 0.3, ch, 0, 0, PI * 2);
                t.fill();
            }
        }

        // An airship: fins, a gondola slung on lines, and a striped envelope
        const dark = night ? '#06070F' : low ? '#2A1924' : '#343946';
        const hull = (c) => mix(c, dark, night ? 0.72 : low ? 0.42 : 0.08);
        const airship = (cx, cy, len, dir, body) => {
            const rx = len / 2, ry = len * 0.15, tx = cx - dir * rx * 0.86;
            t.fillStyle = mix(body, '#000000', 0.35);
            poly([[tx, cy], [tx - dir * len * 0.14, cy - ry * 1.25], [tx - dir * len * 0.03, cy - ry * 0.2]]);
            poly([[tx, cy], [tx - dir * len * 0.14, cy + ry * 1.25], [tx - dir * len * 0.03, cy + ry * 0.2]]);
            const gy = cy + ry + len * 0.07, gw = len * 0.26, gh = len * 0.05;
            t.strokeStyle = mix(body, '#000000', 0.5);
            t.lineWidth = Math.max(1, len * 0.004);
            t.beginPath();
            for (const k of [-0.5, -0.17, 0.17, 0.5]) {
                t.moveTo(cx + k * gw, gy);
                t.lineTo(cx + k * gw * 1.7, cy + ry * 0.8);
            }
            t.stroke();
            t.fillStyle = mix(body, '#000000', 0.55);
            roundRect(t, cx - gw / 2, gy, gw, gh, gh * 0.45);
            t.fill();
            t.fillStyle = 'rgba(255,214,140,0.95)';
            for (let i = 0; i < 4; i++) t.fillRect(cx - gw * 0.36 + i * gw * 0.2, gy + gh * 0.25, gw * 0.1, gh * 0.4);
            const g = t.createLinearGradient(0, cy - ry, 0, cy + ry);
            g.addColorStop(0, mix(body, '#FFFFFF', night ? 0.1 : 0.35));
            g.addColorStop(0.55, body);
            g.addColorStop(1, mix(body, '#000000', 0.5));
            t.fillStyle = g;
            t.beginPath();
            t.ellipse(cx, cy, rx, ry, 0, 0, PI * 2);
            t.fill();
            t.fillStyle = rgba(th.accent.color, 0.85);
            t.beginPath();
            t.ellipse(cx, cy, rx * 0.985, ry * 0.2, 0, 0, PI * 2);
            t.fill();
            t.strokeStyle = 'rgba(0,0,0,0.22)';
            for (const k of [-0.6, -0.3, 0, 0.3, 0.6]) {
                const dx = k * rx, hh = ry * Math.sqrt(1 - k * k);
                t.beginPath();
                t.moveTo(cx + dx, cy - hh);
                t.quadraticCurveTo(cx + dx + k * len * 0.05, cy, cx + dx, cy + hh);
                t.stroke();
            }
            t.fillStyle = '#C9A04A';
            disc(cx + dir * rx * 0.97, cy, len * 0.012 + 1);
        };
        airship(w * (0.8 + rnd() * 0.05), h * (0.1 + rnd() * 0.04), 210, -1, hull('#A95A4C'));
        airship(w * (0.36 + rnd() * 0.05), h * (0.29 + rnd() * 0.04), 140, 1, hull('#8FA3AE'));

        // Three ranks of roofs, the far ones pale in the smoke
        const litChance = night ? 0.5 : th.time === 'dusk' ? 0.45 : th.time === 'golden hour' ? 0.28 : 0.06;
        const stacks = [];
        for (let layer = 0; layer < 3; layer++) {
            const ink = mix(th.sky.horizon, dark, [0.34, 0.62, 0.9][layer]);
            const base = foot + layer * h * 0.06, tall = h * [0.14, 0.2, 0.16][layer];
            const windows = (x, top, bw) => {
                if (!layer) return;
                for (let wy = top + 12; wy < base + h * 0.07; wy += 17) {
                    for (let wx = x + 7; wx < x + bw - 9; wx += 13) {
                        t.fillStyle = rnd() < litChance ? `rgba(255,${196 + Math.floor(rnd() * 40)},120,0.9)` : 'rgba(10,12,20,0.22)';
                        t.fillRect(wx, wy, 5, 8);
                    }
                }
                t.fillStyle = ink;
            };
            t.fillStyle = ink;
            t.fillRect(0, base, w, h - base);
            let x = -20 - rnd() * 50;
            while (x < w) {
                const kind = rnd(), bw = 44 + rnd() * 90, bh = tall * (0.4 + rnd() * 0.6), top = base - bh;
                let step = bw;
                if (kind < 0.15) {
                    // a factory chimney with a shed at its foot
                    const sw = 12 + rnd() * 9, sh = tall * (1.0 + rnd() * 0.75), cx = x + bw / 2;
                    t.fillRect(x, base - bh * 0.4, bw, bh * 0.4);
                    poly([[cx - sw * 0.8, base], [cx - sw * 0.5, base - sh], [cx + sw * 0.5, base - sh], [cx + sw * 0.8, base]]);
                    t.fillRect(cx - sw * 0.62, base - sh - 6, sw * 1.24, 7);
                    stacks.push([cx, base - sh - 6, layer]);
                } else if (kind < 0.26) {
                    // a dome on a drum, with a lantern and a needle
                    const r = bw * 0.44, cx = x + bw / 2, dy = top + r * 0.2;
                    t.fillRect(x, dy, bw, base - dy);
                    t.beginPath();
                    t.arc(cx, dy, r, PI, 0);
                    t.fill();
                    t.fillRect(cx - r * 0.14, dy - r * 1.3, r * 0.28, r * 0.34);
                    t.fillRect(cx - 1.5, dy - r * 1.3 - 30, 3, 32);
                    windows(x, dy + 6, bw);
                } else if (kind < 0.36) {
                    // a church tower and its spire
                    const tw = 22 + rnd() * 14;
                    t.fillRect(x, top, tw, bh);
                    poly([[x - 3, top], [x + tw / 2, top - bh * 0.7 - 40], [x + tw + 3, top]]);
                    step = tw + 12;
                } else if (kind < 0.42 && layer === 1) {
                    // a clock tower with a lit face
                    const tw = 46, towerH = tall * 1.25, ty = base - towerH, cx = x + tw / 2;
                    t.fillRect(x, ty, tw, towerH);
                    poly([[x - 4, ty], [cx, ty - 58], [x + tw + 4, ty]]);
                    t.fillRect(cx - 1.5, ty - 80, 3, 26);
                    t.fillStyle = 'rgba(255,236,180,0.95)';
                    disc(cx, ty + 30, 15);
                    t.strokeStyle = '#2A1A14';
                    t.lineWidth = 2;
                    t.beginPath();
                    t.moveTo(cx, ty + 30);
                    t.lineTo(cx, ty + 19);
                    t.moveTo(cx, ty + 30);
                    t.lineTo(cx + 8, ty + 33);
                    t.stroke();
                    t.fillStyle = ink;
                    windows(x, ty + 56, tw);
                    step = tw + 20;
                } else {
                    // a terrace: a pitched or a flat roof, and chimney pots
                    t.fillRect(x, top, bw, bh);
                    if (rnd() > 0.4) poly([[x - 4, top], [x + bw / 2, top - 16 - rnd() * 20], [x + bw + 4, top]]);
                    else t.fillRect(x - 3, top - 5, bw + 6, 6);
                    const pots = 1 + Math.floor(rnd() * 3);
                    for (let k = 0; k < pots; k++) {
                        const px = x + bw * (0.15 + rnd() * 0.7);
                        t.fillRect(px, top - 30, 9, 32);
                        t.fillRect(px - 2, top - 33, 13, 4);
                    }
                    windows(x, top, bw);
                }
                x += step * (0.75 + rnd() * 0.4);
            }
            if (layer === 1) {
                // smoke lying over the town, so the nearest roofs stand out against it
                const top = h * 0.2, bottom = foot + h * 0.1, haze = t.createLinearGradient(0, top, 0, bottom);
                haze.addColorStop(0, rgba(th.sky.horizon, 0));
                haze.addColorStop(1, rgba(th.sky.horizon, night ? 0.5 : 0.62));
                t.fillStyle = haze;
                t.fillRect(0, top, w, bottom - top);
            }
        }
        // what the chimneys send up
        for (const [cx, cy, layer] of stacks) {
            const drift = 0.5 + rnd() * 0.8;
            for (let k = 0; k < 9; k++) {
                const r = 9 + k * (6 + layer * 1.5), a = ((0.26 - k * 0.025) * (night ? 0.7 : 1)).toFixed(3);
                t.fillStyle = night ? `rgba(70,76,110,${a})` : low ? `rgba(120,80,90,${a})` : `rgba(226,220,214,${a})`;
                disc(cx + k * k * 2.2 * drift + (rnd() - 0.5) * 8, cy - k * 17 - r * 0.3, r);
            }
        }
        // the lamps of the streets below, and the big airship nearest the house
        const street = t.createLinearGradient(0, foot - h * 0.04, 0, foot + h * 0.16);
        street.addColorStop(0, 'rgba(255,180,110,0)');
        street.addColorStop(1, `rgba(255,170,100,${night || low ? 0.3 : 0.12})`);
        t.fillStyle = street;
        t.fillRect(0, foot - h * 0.04, w, h - foot + h * 0.04);
        airship(w * (0.52 + rnd() * 0.06), h * (0.19 + rnd() * 0.04), 330, 1, hull('#CDB98C'));
    }

    const textures = {
        // Damask wallpaper in the wall's own colour: a flocked flower in an ogee frame on a half
        // drop, picked out with a little gold. The same picture makes the bumps.
        damask: {
            size: 256, byColor: true, normal: 1.4, normalScale: 0.45, repeat: [1, 1],
            paint(t, n, th, color) {
                const ground = color || th.walls;
                const pale = mix(ground, '#FFF2D8', 0.3), deep = mix(ground, '#1A0E08', 0.3), gold = 'rgba(226,186,96,0.6)';
                t.fillStyle = ground;
                t.fillRect(0, 0, n, n);
                t.fillStyle = rgba(deep, 0.14);
                for (let x = 0; x < n; x += n / 8) t.fillRect(x, 0, n / 16, n);
                const motif = (cx, cy, s) => {
                    const frame = () => {
                        t.beginPath();
                        t.moveTo(cx, cy - s);
                        t.bezierCurveTo(cx + s * 0.12, cy - s * 0.55, cx + s * 0.78, cy - s * 0.4, cx + s * 0.62, cy);
                        t.bezierCurveTo(cx + s * 0.78, cy + s * 0.4, cx + s * 0.12, cy + s * 0.55, cx, cy + s);
                        t.bezierCurveTo(cx - s * 0.12, cy + s * 0.55, cx - s * 0.78, cy + s * 0.4, cx - s * 0.62, cy);
                        t.bezierCurveTo(cx - s * 0.78, cy - s * 0.4, cx - s * 0.12, cy - s * 0.55, cx, cy - s);
                    };
                    const petal = (ox, oy, rx, ry, turn) => {
                        t.beginPath();
                        t.ellipse(cx + ox * s, cy + oy * s, rx * s, ry * s, turn, 0, PI * 2);
                        t.fill();
                    };
                    t.lineJoin = 'round';
                    t.strokeStyle = deep;
                    t.lineWidth = s * 0.1;
                    frame();
                    t.stroke();
                    t.strokeStyle = pale;
                    t.lineWidth = s * 0.055;
                    frame();
                    t.stroke();
                    t.fillStyle = pale;
                    petal(0, -0.22, 0.1, 0.34, 0);
                    petal(-0.2, -0.08, 0.075, 0.26, -0.6);
                    petal(0.2, -0.08, 0.075, 0.26, 0.6);
                    petal(-0.24, 0.26, 0.07, 0.2, 1.0);
                    petal(0.24, 0.26, 0.07, 0.2, -1.0);
                    petal(0, 0.42, 0.07, 0.16, 0);
                    t.fillStyle = deep;
                    petal(0, -0.22, 0.03, 0.22, 0);
                    t.fillStyle = gold;
                    for (const [ox, oy] of [[0, 0.14], [0, -0.66], [0, 0.72], [-0.44, 0], [0.44, 0]]) {
                        t.beginPath();
                        t.arc(cx + ox * s, cy + oy * s, s * 0.045, 0, PI * 2);
                        t.fill();
                    }
                };
                const s = n * 0.34;
                motif(n / 2, n / 2, s);
                for (const [x, y] of [[0, 0], [n, 0], [0, n], [n, n]]) motif(x, y, s);
                t.fillStyle = gold;
                for (const [x, y] of [[n / 2, 0], [n / 2, n], [0, n / 2], [n, n / 2]]) {
                    t.save();
                    t.translate(x, y);
                    t.rotate(PI / 4);
                    t.fillRect(-n * 0.02, -n * 0.02, n * 0.04, n * 0.04);
                    t.restore();
                }
            },
        },
        // A raised and fielded panel, in light greys so the wood or paint colour tints it
        panel: {
            size: 256, tint: true, normal: 2, normalScale: 0.8,
            paint(t, n) {
                const rnd = seededRandom(57);
                const m = n * 0.11, i = m + n * 0.075;
                t.fillStyle = '#D8D8D8';
                t.fillRect(0, 0, n, n);
                t.fillStyle = '#989898';
                t.fillRect(m, m, n - 2 * m, n - 2 * m);
                t.fillStyle = '#C2C2C2';
                t.fillRect(m + n * 0.03, m + n * 0.03, n - 2 * m - n * 0.06, n - 2 * m - n * 0.06);
                const g = t.createLinearGradient(m, m, n - m, n - m);
                g.addColorStop(0, '#F4F4F4');
                g.addColorStop(1, '#DCDCDC');
                t.fillStyle = g;
                t.fillRect(i, i, n - 2 * i, n - 2 * i);
                for (let k = 0; k < 90; k++) {
                    t.fillStyle = `rgba(40,30,24,${(0.03 + rnd() * 0.06).toFixed(3)})`;
                    t.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 1.5, 10 + rnd() * 70);
                }
            },
        },
        // The folds of a hanging curtain
        pleat: {
            size: 128, tint: true, normal: 3, normalScale: 1,
            paint(t, n) {
                const rnd = seededRandom(23);
                let x = 0;
                while (x < n) {
                    const fw = Math.min(n - x, n * (0.1 + rnd() * 0.1));
                    const g = t.createLinearGradient(x, 0, x + fw, 0);
                    g.addColorStop(0, '#7C7C7C');
                    g.addColorStop(0.45, '#F0F0F0');
                    g.addColorStop(1, '#7C7C7C');
                    t.fillStyle = g;
                    t.fillRect(x, 0, fw + 1, n);
                    x += fw;
                }
            },
        },
        // Deep-buttoned hide: pleats from corner to corner, a dimple where they cross
        tuft: {
            size: 128, tint: true, normal: 3.2, normalScale: 1,
            paint(t, n) {
                t.fillStyle = '#DADADA';
                t.fillRect(0, 0, n, n);
                for (const [cx, cy] of [[n / 2, 0], [n / 2, n], [0, n / 2], [n, n / 2]]) {
                    const g = t.createRadialGradient(cx, cy, 2, cx, cy, n * 0.42);
                    g.addColorStop(0, 'rgba(255,255,255,0.9)');
                    g.addColorStop(1, 'rgba(255,255,255,0)');
                    t.fillStyle = g;
                    t.fillRect(0, 0, n, n);
                }
                for (const [lw, ink] of [[n * 0.12, 'rgba(120,120,120,0.55)'], [n * 0.045, 'rgba(60,60,60,0.8)']]) {
                    t.strokeStyle = ink;
                    t.lineWidth = lw;
                    t.beginPath();
                    t.moveTo(0, 0);
                    t.lineTo(n, n);
                    t.moveTo(n, 0);
                    t.lineTo(0, n);
                    t.stroke();
                }
                for (const [cx, cy] of [[n / 2, n / 2], [0, 0], [n, 0], [0, n], [n, n]]) {
                    const g = t.createRadialGradient(cx, cy, 1, cx, cy, n * 0.13);
                    g.addColorStop(0, 'rgba(30,30,30,0.9)');
                    g.addColorStop(1, 'rgba(30,30,30,0)');
                    t.fillStyle = g;
                    t.beginPath();
                    t.arc(cx, cy, n * 0.13, 0, PI * 2);
                    t.fill();
                }
            },
        },
        // Five shelves of leather spines with gilt bands, between the uprights of a bookcase
        books: {
            size: 512, normal: 1.2, normalScale: 0.5,
            paint(t, n) {
                const rnd = seededRandom(404);
                const inks = ['#6E1D22', '#1F5B45', '#1D4E6A', '#5A2748', '#8A5A22', '#3A2A1E', '#7A3A1E', '#243A5A', '#B08A3A', '#4A1E1E', '#2E4A3A', '#C9B58A'];
                const rows = 5, rh = n / rows, board = rh * 0.09;
                t.fillStyle = '#1A0E08';
                t.fillRect(0, 0, n, n);
                for (let r = 0; r < rows; r++) {
                    const foot = (r + 1) * rh - board;
                    let x = n * 0.03;
                    while (x < n * 0.97) {
                        const bw = n * (0.035 + rnd() * 0.05), bh = rh * (0.6 + rnd() * 0.28);
                        if (x + bw > n * 0.97) break;
                        if (rnd() < 0.07) { x += bw * 1.4; continue; }
                        const ink = inks[Math.floor(rnd() * inks.length)];
                        const g = t.createLinearGradient(x, 0, x + bw, 0);
                        g.addColorStop(0, mix(ink, '#000000', 0.45));
                        g.addColorStop(0.35, mix(ink, '#FFFFFF', 0.12));
                        g.addColorStop(1, mix(ink, '#000000', 0.35));
                        t.fillStyle = g;
                        t.fillRect(x, foot - bh, bw - 1, bh);
                        t.fillStyle = 'rgba(226,186,96,0.85)';
                        t.fillRect(x + 1, foot - bh * 0.86, bw - 3, 2);
                        t.fillRect(x + 1, foot - bh * 0.2, bw - 3, 2);
                        if (rnd() > 0.5) t.fillRect(x + bw * 0.25, foot - bh * 0.66, bw * 0.45, bh * 0.16);
                        x += bw;
                    }
                    const g = t.createLinearGradient(0, foot, 0, foot + board);
                    g.addColorStop(0, '#7A4526');
                    g.addColorStop(1, '#3A1C10');
                    t.fillStyle = g;
                    t.fillRect(0, foot, n, board);
                }
                t.fillStyle = '#4A2616';
                t.fillRect(0, 0, n * 0.03, n);
                t.fillRect(n * 0.97, 0, n * 0.03, n);
            },
        },
        // Riveted plate with lapped seams, tinted by the metal's colour
        rivet: {
            size: 128, tint: true, normal: 2.6, normalScale: 0.9,
            paint(t, n) {
                const rnd = seededRandom(31);
                t.fillStyle = '#C2C2C2';
                t.fillRect(0, 0, n, n);
                for (let k = 0; k < 40; k++) {
                    t.fillStyle = `rgba(30,24,20,${(0.03 + rnd() * 0.07).toFixed(3)})`;
                    t.fillRect(rnd() * n, rnd() * n, 2 + rnd() * 5, 12 + rnd() * 60);
                }
                t.fillStyle = '#8A8A8A';
                t.fillRect(0, 0, n, 3);
                t.fillRect(0, 0, 3, n);
                t.fillStyle = '#DCDCDC';
                t.fillRect(0, 3, n, 2);
                t.fillRect(3, 0, 2, n);
                for (let i = 0; i < 8; i++) {
                    const p = (i + 0.5) * (n / 8);
                    for (const [x, y] of [[p, 11], [11, p]]) {
                        t.fillStyle = 'rgba(40,40,40,0.7)';
                        t.beginPath();
                        t.arc(x + 1, y + 1.5, 4.2, 0, PI * 2);
                        t.fill();
                        t.fillStyle = '#F2F2F2';
                        t.beginPath();
                        t.arc(x, y, 3.4, 0, PI * 2);
                        t.fill();
                    }
                }
            },
        },
        // The face of the great clock: enamel, hour bars and minute ticks. The same from every
        // quarter, so it does not matter which way up the disc carries it.
        dial: {
            size: 256, glow: 0.3,
            paint(t, n) {
                const c = n / 2;
                t.fillStyle = '#2A1A10';
                t.fillRect(0, 0, n, n);
                const g = t.createRadialGradient(c, c * 0.9, n * 0.05, c, c, c);
                g.addColorStop(0, '#FFF6DE');
                g.addColorStop(1, '#E2CFA0');
                t.fillStyle = g;
                t.beginPath();
                t.arc(c, c, c * 0.97, 0, PI * 2);
                t.fill();
                t.strokeStyle = '#2A1A10';
                t.lineWidth = n * 0.012;
                t.beginPath();
                t.arc(c, c, c * 0.9, 0, PI * 2);
                t.stroke();
                t.lineWidth = n * 0.006;
                t.beginPath();
                t.arc(c, c, c * 0.62, 0, PI * 2);
                t.stroke();
                for (let i = 0; i < 60; i++) {
                    const a = (i / 60) * PI * 2, hour = i % 5 === 0, quarter = i % 15 === 0;
                    const r0 = c * (quarter ? 0.64 : hour ? 0.7 : 0.84), r1 = c * 0.89;
                    t.lineWidth = n * (quarter ? 0.03 : hour ? 0.02 : 0.006);
                    t.beginPath();
                    t.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
                    t.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
                    t.stroke();
                }
                t.fillStyle = '#B8923A';
                t.beginPath();
                t.arc(c, c, c * 0.08, 0, PI * 2);
                t.fill();
            },
        },
        // A pressure gauge: a scale, a red end to it, and the needle up in the working range.
        // A disc shows its picture a quarter turn round, so it is painted a quarter turn back.
        gauge: {
            size: 128, glow: 0.3,
            paint(t, n) {
                const c = n / 2;
                t.fillStyle = '#3A2414';
                t.fillRect(0, 0, n, n);
                t.save();
                t.translate(c, c);
                t.rotate(-PI / 2);
                t.translate(-c, -c);
                t.fillStyle = '#F6EED8';
                t.beginPath();
                t.arc(c, c, c * 0.95, 0, PI * 2);
                t.fill();
                t.strokeStyle = '#B8322A';
                t.lineWidth = n * 0.07;
                t.beginPath();
                t.arc(c, c, c * 0.72, -PI * 0.3, PI * 0.15);
                t.stroke();
                t.strokeStyle = '#2A1A10';
                for (let i = 0; i <= 10; i++) {
                    const a = PI * 0.85 + (i / 10) * PI * 1.3;
                    t.lineWidth = n * (i % 5 === 0 ? 0.03 : 0.014);
                    t.beginPath();
                    t.moveTo(c + Math.cos(a) * c * 0.62, c + Math.sin(a) * c * 0.62);
                    t.lineTo(c + Math.cos(a) * c * 0.84, c + Math.sin(a) * c * 0.84);
                    t.stroke();
                }
                const a = PI * 1.72;
                t.lineWidth = n * 0.035;
                t.lineCap = 'round';
                t.beginPath();
                t.moveTo(c - Math.cos(a) * c * 0.15, c - Math.sin(a) * c * 0.15);
                t.lineTo(c + Math.cos(a) * c * 0.7, c + Math.sin(a) * c * 0.7);
                t.stroke();
                t.fillStyle = '#B8923A';
                t.beginPath();
                t.arc(c, c, c * 0.1, 0, PI * 2);
                t.fill();
                t.restore();
            },
        },
        // Stained glass for the fanlight over the door: a sunburst in the room's colour and its
        // neighbours, leaded, lit from the hall behind
        fan: {
            size: 256, perTheme: true, glow: 0.75,
            paint(t, n, th) {
                const c = n / 2, rays = 8;
                const outer = [th.accent.color, '#D9A441'], inner = ['#1D6A7C', '#B5372E'];
                const wedge = (r0, r1, a0, a1) => {
                    t.beginPath();
                    t.arc(c, c, r1, a0, a1);
                    t.arc(c, c, r0, a1, a0, true);
                    t.closePath();
                    t.fill();
                };
                t.fillStyle = '#1A120C';
                t.fillRect(0, 0, n, n);
                for (let i = 0; i < rays; i++) {
                    const a0 = (i / rays) * PI * 2, a1 = ((i + 1) / rays) * PI * 2;
                    t.fillStyle = mix(outer[i % 2], '#FFFFFF', 0.12);
                    wedge(c * 0.58, c * 0.99, a0, a1);
                    t.fillStyle = mix(inner[i % 2], '#FFFFFF', 0.15);
                    wedge(c * 0.26, c * 0.58, a0, a1);
                }
                const g = t.createRadialGradient(c, c, 2, c, c, c * 0.26);
                g.addColorStop(0, '#FFE9A8');
                g.addColorStop(1, '#E0A030');
                t.fillStyle = g;
                t.beginPath();
                t.arc(c, c, c * 0.26, 0, PI * 2);
                t.fill();
                t.strokeStyle = '#17100A';
                t.lineWidth = n * 0.014;
                for (const r of [0.26, 0.58, 0.98]) {
                    t.beginPath();
                    t.arc(c, c, c * r, 0, PI * 2);
                    t.stroke();
                }
                for (let i = 0; i < rays; i++) {
                    const a = (i / rays) * PI * 2;
                    t.beginPath();
                    t.moveTo(c + Math.cos(a) * c * 0.26, c + Math.sin(a) * c * 0.26);
                    t.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c);
                    t.stroke();
                }
            },
        },
        // A sea chart: foxed paper, a graticule, two coasts, a course plotted between them
        chart: {
            size: 256,
            paint(t, n) {
                const rnd = seededRandom(1851);
                t.fillStyle = '#DCCB9C';
                t.fillRect(0, 0, n, n);
                for (let i = 0; i < 14; i++) {
                    t.fillStyle = `rgba(150,110,60,${(0.04 + rnd() * 0.07).toFixed(3)})`;
                    t.beginPath();
                    t.ellipse(rnd() * n, rnd() * n, 10 + rnd() * 50, 8 + rnd() * 30, rnd() * 3, 0, PI * 2);
                    t.fill();
                }
                t.strokeStyle = 'rgba(90,60,30,0.3)';
                t.lineWidth = 1;
                t.beginPath();
                for (let i = 1; i < 8; i++) {
                    t.moveTo((i * n) / 8, 0);
                    t.lineTo((i * n) / 8, n);
                    t.moveTo(0, (i * n) / 8);
                    t.lineTo(n, (i * n) / 8);
                }
                t.stroke();
                for (const [cx, cy, r, ink] of [[n * 0.34, n * 0.42, n * 0.2, '#A9B48A'], [n * 0.7, n * 0.64, n * 0.15, '#C9A974']]) {
                    t.beginPath();
                    for (let i = 0; i < 40; i++) {
                        const a = (i / 40) * PI * 2, rr = r * (0.75 + 0.3 * Math.sin(a * 3 + cx) + 0.18 * Math.sin(a * 7 + cy));
                        t[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
                    }
                    t.closePath();
                    t.fillStyle = ink;
                    t.fill();
                    t.strokeStyle = '#5A3A1E';
                    t.lineWidth = 2;
                    t.stroke();
                }
                t.strokeStyle = '#8E2A22';
                t.lineWidth = 2;
                t.setLineDash([6, 5]);
                t.beginPath();
                t.moveTo(n * 0.38, n * 0.46);
                t.quadraticCurveTo(n * 0.5, n * 0.22, n * 0.72, n * 0.6);
                t.stroke();
                t.setLineDash([]);
                // the compass rose, drawn narrow because the frame is wider than it is tall
                t.save();
                t.translate(n * 0.82, n * 0.2);
                t.scale(0.72, 1);
                t.fillStyle = '#5A3A1E';
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * PI * 2, r = n * (i % 2 ? 0.05 : 0.1);
                    t.beginPath();
                    t.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                    t.lineTo(Math.cos(a + PI / 2) * n * 0.015, Math.sin(a + PI / 2) * n * 0.015);
                    t.lineTo(Math.cos(a - PI / 2) * n * 0.015, Math.sin(a - PI / 2) * n * 0.015);
                    t.closePath();
                    t.fill();
                }
                t.restore();
                t.strokeStyle = '#5A3A1E';
                t.lineWidth = 3;
                t.strokeRect(6, 6, n - 12, n - 12);
                t.lineWidth = 1;
                t.strokeRect(11, 11, n - 22, n - 22);
            },
        },
        // An oil painting under old varnish: hills falling away to a low sun, an airship far off.
        // The part's colour sets the mood, so two frames can hold two different pictures.
        oil: {
            size: 256, byColor: true,
            paint(t, n, th, color) {
                const hue = color || '#C98A4B';
                const rnd = seededRandom(rgb(hue)[0] * 7 + rgb(hue)[2]);
                const sky = t.createLinearGradient(0, 0, 0, n * 0.7);
                sky.addColorStop(0, mix(hue, '#1A1420', 0.55));
                sky.addColorStop(1, mix(hue, '#FFE9C0', 0.45));
                t.fillStyle = sky;
                t.fillRect(0, 0, n, n);
                t.fillStyle = 'rgba(255,236,190,0.9)';
                t.beginPath();
                t.arc(n * (0.3 + rnd() * 0.4), n * 0.42, n * 0.07, 0, PI * 2);
                t.fill();
                for (let layer = 0; layer < 3; layer++) {
                    const ph = rnd() * 6;
                    t.fillStyle = mix(mix(hue, '#16241C', 0.6), '#0E0A08', layer * 0.3);
                    t.beginPath();
                    t.moveTo(0, n);
                    for (let x = 0; x <= n; x += 8) t.lineTo(x, n * (0.6 + layer * 0.1) - Math.sin(x / (30 + layer * 14) + ph) * n * 0.05 - Math.sin(x / 17 + ph * 2) * n * 0.015);
                    t.lineTo(n, n);
                    t.closePath();
                    t.fill();
                }
                const ax = n * (0.55 + rnd() * 0.25), ay = n * 0.24;
                t.fillStyle = mix(hue, '#120C10', 0.75);
                t.beginPath();
                t.ellipse(ax, ay, n * 0.09, n * 0.03, 0, 0, PI * 2);
                t.fill();
                t.fillRect(ax - n * 0.02, ay + n * 0.035, n * 0.04, n * 0.012);
                const v = t.createRadialGradient(n / 2, n / 2, n * 0.2, n / 2, n / 2, n * 0.75);
                v.addColorStop(0, 'rgba(60,36,10,0)');
                v.addColorStop(1, 'rgba(40,22,6,0.55)');
                t.fillStyle = v;
                t.fillRect(0, 0, n, n);
            },
        },
    };

    // ---- The 2D board ---------------------------------------------------------------------------

    // Floor colours for the board. On the dark floors clean tiles take a bright polish and the
    // dust is pale; on the pale floors dirty tiles take a dark film and the dust is dark.
    function palette2d(th) {
        const paleDust = { fluff: [176, 166, 152], crumb: [200, 182, 150], hair: [190, 180, 168] };
        switch (th.floor) {
            case 'encaustic': return { floorBase: [200, 176, 140], glaze: [255, 246, 220], glazeAlpha: 0.36, film: [72, 58, 46], filmAlpha: 0.3, dust: { fluff: [92, 80, 70], crumb: [70, 52, 38], hair: [50, 40, 34] } };
            case 'checker': return { floorBase: [146, 138, 124], glaze: [196, 240, 224], glazeAlpha: 0.4, film: [92, 76, 60], filmAlpha: 0.3, dust: { fluff: [150, 140, 128], crumb: [120, 96, 70], hair: [60, 50, 44] } };
            case 'boards': return { floorBase: [116, 66, 44], glaze: [255, 214, 150], glazeAlpha: 0.4, film: [146, 134, 118], filmAlpha: 0.22, dust: paleDust };
            case 'plate': return { floorBase: [84, 76, 70], glaze: [255, 196, 128], glazeAlpha: 0.4, film: [156, 146, 134], filmAlpha: 0.2, dust: paleDust };
            case 'star': return { floorBase: [148, 152, 164], glaze: [176, 255, 232], glazeAlpha: 0.4, film: [70, 62, 66], filmAlpha: 0.3, dust: { fluff: [84, 78, 80], crumb: [64, 54, 48], hair: [44, 40, 44] } };
            default: return { floorBase: [166, 114, 64], glaze: [255, 228, 164], glazeAlpha: 0.42, film: [52, 40, 32], filmAlpha: 0.22, dust: { fluff: [96, 84, 72], crumb: [70, 50, 34], hair: [44, 34, 28] } };
        }
    }

    const GOLD2D = '#D9B45A';
    const gear2d = (c, x, y, r, teeth) => {
        c.beginPath();
        for (let i = 0; i < teeth * 4; i++) {
            const a = (i / (teeth * 4)) * PI * 2, rr = i % 4 < 2 ? r : r * 0.8;
            c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        c.closePath();
    };
    const dot = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, PI * 2); c.fill(); };

    // One interior wall tile from above, in board space
    function wallTile2d(c, col, row, th, wallSet) {
        const T = TILE, x = col * T, y = row * T, cx = x + T / 2, cy = y + T / 2;
        const open = (dc, dr) => !wallSet.has(`${col + dc},${row + dr}`);
        const l = open(-1, 0), r = open(1, 0), u = open(0, -1), d = open(0, 1);
        // the tile drawn back by `inset` from each side that faces the room, so a run of tiles joins up
        const within = (inset) => { const x0 = x + (l ? inset : 0), y0 = y + (u ? inset : 0); return [x0, y0, x + T - (r ? inset : 0) - x0, y + T - (d ? inset : 0) - y0]; };
        const block = (inset, color) => { const b = within(inset); c.fillStyle = color; c.fillRect(b[0], b[1], b[2], b[3]); };
        // a line along each side that faces the room, stopping at the corners
        const edges = (inset, color, width) => {
            const [x0, y0, bw, bh] = within(inset), x1 = x0 + bw, y1 = y0 + bh;
            c.strokeStyle = color;
            c.lineWidth = width;
            c.beginPath();
            if (u) { c.moveTo(x0, y0); c.lineTo(x1, y0); }
            if (d) { c.moveTo(x0, y1); c.lineTo(x1, y1); }
            if (l) { c.moveTo(x0, y0); c.lineTo(x0, y1); }
            if (r) { c.moveTo(x1, y0); c.lineTo(x1, y1); }
            c.stroke();
        };
        switch (th.wallStyle) {
            case 'toybox': {
                const a = TOY_INKS[Math.floor(pick(col, row, 1) * 5)], b = TOY_INKS[Math.floor(pick(col, row, 2) * 5)], toy = pick(col, row, 5);
                c.fillStyle = shadeColor(a, -24);
                roundRect(c, x + 2, y + 2, T - 4, T - 4, 4);
                c.fill();
                c.fillStyle = b;
                roundRect(c, x + 7, y + 7, T - 14, T - 14, 3);
                c.fill();
                c.fillStyle = 'rgba(255,255,255,0.14)';
                c.fillRect(x + 8, y + 8, T - 16, 5);
                c.fillStyle = GOLD2D;
                c.fillRect(x + 13, y + 7, 3, T - 14);
                c.fillRect(x + T - 16, y + 7, 3, T - 14);
                if (toy < 0.34) {
                    c.fillStyle = TOY_INKS[Math.floor(pick(col, row, 6) * 5)];
                    dot(c, cx, cy, 0.2 * T);
                    c.fillStyle = 'rgba(255,255,255,0.35)';
                    dot(c, cx - 3, cy - 3, 0.07 * T);
                } else if (toy < 0.67) {
                    c.fillStyle = GOLD2D;
                    c.fillRect(cx - 0.24 * T, cy - 1.5, 0.48 * T, 3);
                } else {
                    c.save();
                    c.translate(cx, cy);
                    c.rotate(-0.6);
                    c.fillStyle = '#EFE3C8';
                    c.fillRect(-0.15 * T, -0.15 * T, 0.3 * T, 0.3 * T);
                    c.restore();
                }
                c.strokeStyle = 'rgba(30,16,8,0.5)';
                c.lineWidth = 1;
                roundRect(c, x + 2.5, y + 2.5, T - 5, T - 5, 4);
                c.stroke();
                break;
            }
            case 'counter': {
                // the painted cupboard shows as a rim round the marble slab, with the brass rail on it
                const rnd = seededRandom(col * 31 + row * 7 + 3);
                block(0, shadeColor(th.accent.color, -14));
                block(2.5, '#EAE2D0');
                for (let i = 0; i < 2; i++) {
                    c.strokeStyle = `rgba(120,112,104,${(0.1 + rnd() * 0.12).toFixed(2)})`;
                    c.lineWidth = 0.6 + rnd() * 0.8;
                    c.beginPath();
                    c.moveTo(x + 5 + rnd() * (T - 10), y + 5 + rnd() * (T - 10));
                    c.lineTo(x + 5 + rnd() * (T - 10), y + 5 + rnd() * (T - 10));
                    c.stroke();
                }
                if (pick(col, row, 1) > 0.6) {
                    const g = c.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, 0.26 * T);
                    g.addColorStop(0, '#F0B088');
                    g.addColorStop(1, '#8A4A26');
                    c.fillStyle = g;
                    dot(c, cx, cy, 0.25 * T);
                    c.fillStyle = '#6A3618';
                    dot(c, cx, cy, 0.05 * T);
                }
                edges(5, GOLD2D, 1.3);
                break;
            }
            case 'bookcase': {
                // a double-sided case seen from above: two ranks of books back to back, their spines
                // outwards and their pages showing, in a mahogany carcass
                const rnd = seededRandom(col * 31 + row * 7 + 3);
                const inks = ['#6E1D22', '#1F5B45', '#1D4E6A', '#5A2748', '#B08A3A', '#7A3A1E'];
                const [bx, by, bw, bh] = within(4);
                const upright = !u || !d;           // the run goes up the board, so the spines face left and right
                block(0, shadeColor(th.trim, 6));
                c.fillStyle = '#1A0E08';
                c.fillRect(bx, by, bw, bh);
                const along = upright ? bh : bw, across = (upright ? bw : bh) / 2 - 1;
                for (const rank of [0, 1]) {
                    let at = 0;
                    while (at < along - 2) {
                        const thick = Math.min(along - at, 3 + rnd() * 3.4);
                        const a0 = (upright ? by : bx) + at, c0 = (upright ? bx : by) + rank * (across + 2);
                        c.fillStyle = inks[Math.floor(rnd() * inks.length)];
                        if (upright) c.fillRect(c0, a0, across, thick - 0.8); else c.fillRect(a0, c0, thick - 0.8, across);
                        c.fillStyle = '#E6DAC0';
                        const p0 = c0 + (rank ? 0 : 1.8);
                        if (thick > 2.4) { if (upright) c.fillRect(p0, a0 + 0.8, across - 1.8, thick - 2.4); else c.fillRect(a0 + 0.8, p0, thick - 2.4, across - 1.8); }
                        at += thick;
                    }
                }
                if (pick(col, row, 1) > 0.72) {
                    c.fillStyle = shadeColor(th.accent.color, 30);
                    dot(c, cx, cy, 0.2 * T);
                    c.strokeStyle = GOLD2D;
                    c.lineWidth = 1;
                    c.beginPath();
                    c.ellipse(cx, cy, 0.2 * T, 0.07 * T, 0.4, 0, PI * 2);
                    c.stroke();
                }
                edges(2.2, GOLD2D, 0.9);
                break;
            }
            case 'boiler': {
                const copper = pick(col, row, 1) > 0.5;
                c.fillStyle = '#231E1C';
                c.fillRect(x, y, T, T);
                c.save();
                c.shadowColor = th.spark;
                c.shadowBlur = 9;
                c.fillStyle = shadeColor(th.spark, -40);
                dot(c, cx, cy, T * 0.44);
                c.restore();
                const g = c.createRadialGradient(cx - T * 0.14, cy - T * 0.16, 2, cx, cy, T * 0.45);
                g.addColorStop(0, copper ? '#E0A070' : '#9A938C');
                g.addColorStop(0.6, copper ? '#A8623A' : '#5A544E');
                g.addColorStop(1, copper ? '#6A381E' : '#33302C');
                c.fillStyle = g;
                dot(c, cx, cy, T * 0.41);
                c.strokeStyle = GOLD2D;
                c.lineWidth = 1.6;
                c.beginPath();
                c.arc(cx, cy, T * 0.41, 0, PI * 2);
                c.stroke();
                c.fillStyle = 'rgba(20,12,8,0.6)';
                for (let i = 0; i < 10; i++) {
                    const a = (i / 10) * PI * 2;
                    dot(c, cx + Math.cos(a) * T * 0.3, cy + Math.sin(a) * T * 0.3, 1.1);
                }
                break;
            }
            case 'apparatus': {
                const g = c.createRadialGradient(cx - 5, cy - 6, 2, cx, cy, T * 0.47);
                g.addColorStop(0, '#F0D08A');
                g.addColorStop(0.7, '#B88A3A');
                g.addColorStop(1, '#6A4A1A');
                c.fillStyle = g;
                dot(c, cx, cy, T * 0.46);
                c.fillStyle = '#16141C';
                dot(c, cx, cy, T * 0.33);
                c.save();
                c.shadowColor = th.spark;
                c.shadowBlur = 10;
                const k = c.createRadialGradient(cx, cy, 1, cx, cy, T * 0.24);
                k.addColorStop(0, '#FFFFFF');
                k.addColorStop(0.35, th.spark);
                k.addColorStop(1, rgba(th.spark, 0));
                c.fillStyle = k;
                dot(c, cx, cy, T * 0.24);
                c.restore();
                c.strokeStyle = 'rgba(220,245,255,0.5)';
                c.lineWidth = 1.2;
                c.beginPath();
                c.arc(cx, cy, T * 0.33, 0, PI * 2);
                c.stroke();
                break;
            }
            default: {
                // the papered partition under its cornice
                block(0, th.trim);
                block(4.5, shadeColor(th.accent.color, -22));
                edges(4.5, GOLD2D, 1.1);
            }
        }
    }

    const paint2d = {
        wall(c, it, th, wallSet) {
            const o = it.o;
            for (let dr = 0; dr < o.h; dr++) for (let dc = 0; dc < o.w; dc++) wallTile2d(c, o.col + dc, o.row + dr, th, wallSet);
        },
        // The chesterfield: a buttoned back roll, two arm rolls with their scrolls, seat cushions,
        // a velvet cushion and a bolster
        couch(c, lw, ld, th) {
            const T = TILE, w = lw * T, d = ld * T;
            const hide = th.couch, armW = 0.3 * T, backD = 0.3 * T;
            const roll = (x, y, rw, rh, across) => {
                const g = across ? c.createLinearGradient(0, y, 0, y + rh) : c.createLinearGradient(x, 0, x + rw, 0);
                g.addColorStop(0, shadeColor(hide, -24));
                g.addColorStop(0.45, shadeColor(hide, 28));
                g.addColorStop(1, shadeColor(hide, -30));
                c.fillStyle = g;
                roundRect(c, x, y, rw, rh, Math.min(rw, rh) / 2);
                c.fill();
            };
            c.fillStyle = th.couchWood;
            roundRect(c, -w / 2 + 2, -d / 2 + 3, w - 4, d - 5, 8);
            c.fill();
            const n = Math.max(1, Math.round(lw)), inner = w - 2 * armW - 6, cw = inner / n;
            for (let i = 0; i < n; i++) {
                const sx = -inner / 2 + cw * i + 1, sy = -d / 2 + backD + 1, sw = cw - 2, sh = d - backD - 6;
                const g = c.createRadialGradient(sx + sw * 0.4, sy + sh * 0.4, 2, sx + sw / 2, sy + sh / 2, sw * 0.8);
                g.addColorStop(0, shadeColor(hide, 34));
                g.addColorStop(0.6, shadeColor(hide, 10));
                g.addColorStop(1, shadeColor(hide, -18));
                c.fillStyle = g;
                roundRect(c, sx, sy, sw, sh, 5);
                c.fill();
            }
            roll(-w / 2 + 4, -d / 2 + 4, w - 8, backD, true);
            const nb = Math.max(2, Math.round(lw * 2)), step = inner / nb, by = -d / 2 + 4 + backD * 0.55;
            c.strokeStyle = 'rgba(0,0,0,0.22)';
            c.lineWidth = 0.8;
            c.beginPath();
            for (let i = 0; i < nb; i++) {
                const bx = -inner / 2 + step * i;
                c.moveTo(bx, -d / 2 + 6);
                c.lineTo(bx + step / 2, by);
                c.lineTo(bx + step, -d / 2 + 6);
                c.moveTo(bx, -d / 2 + 2 + backD);
                c.lineTo(bx + step / 2, by);
                c.lineTo(bx + step, -d / 2 + 2 + backD);
            }
            c.stroke();
            c.fillStyle = shadeColor(hide, -50);
            for (let i = 0; i < nb; i++) dot(c, -inner / 2 + step * (i + 0.5), by, 1.5);
            for (const s of [-1, 1]) {
                const ax = s < 0 ? -w / 2 + 3 : w / 2 - 3 - armW;
                roll(ax, -d / 2 + 5, armW, d - 9, false);
                c.fillStyle = th.couchWood;
                dot(c, ax + armW / 2, d / 2 - 7, armW * 0.34);
                c.fillStyle = GOLD2D;
                dot(c, ax + armW / 2, d / 2 - 7, 1.6);
            }
            c.save();
            c.translate(w / 2 - armW - 15, -d / 2 + backD + 9);
            c.rotate(0.25);
            c.fillStyle = th.pillow;
            roundRect(c, -9, -8, 18, 16, 4);
            c.fill();
            c.strokeStyle = '#E6C672';
            c.lineWidth = 1;
            roundRect(c, -9, -8, 18, 16, 4);
            c.stroke();
            c.restore();
            c.fillStyle = shadeColor(th.chair, 10);
            roundRect(c, -w / 2 + armW + 7, -d / 2 + backD + 3, 9, 22, 4.5);
            c.fill();
        },
        // The pedestal table: a pie-crust top with a brass inlay ring and its curio in the middle
        table(c, lw, ld, th) {
            const T = TILE, r0 = (Math.min(lw, ld) / 2 - 0.1) * T;
            c.beginPath();
            scallop(r0, 12).forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x, y));
            c.closePath();
            const g = c.createRadialGradient(-r0 * 0.3, -r0 * 0.35, r0 * 0.1, 0, 0, r0);
            g.addColorStop(0, shadeColor(th.table, 48));
            g.addColorStop(0.6, shadeColor(th.table, 16));
            g.addColorStop(1, shadeColor(th.table, -10));
            c.fillStyle = g;
            c.fill();
            c.strokeStyle = 'rgba(20,8,4,0.55)';
            c.lineWidth = 1.5;
            c.stroke();
            c.strokeStyle = GOLD2D;
            c.lineWidth = 1.2;
            c.beginPath();
            c.arc(0, 0, r0 * 0.72, 0, PI * 2);
            c.stroke();
            c.fillStyle = 'rgba(255,255,255,0.08)';
            c.beginPath();
            c.ellipse(-r0 * 0.25, -r0 * 0.3, r0 * 0.5, r0 * 0.24, -0.6, 0, PI * 2);
            c.fill();
            if (th.curio === 'dome') {
                // two cogs under glass
                c.fillStyle = shadeColor(th.table, -18);
                dot(c, 0, 0, 0.27 * T);
                c.save();
                c.scale(1, 0.6);
                c.fillStyle = GOLD2D;
                gear2d(c, 0, -0.05 * T, 0.13 * T, 10);
                c.fill();
                c.fillStyle = '#B8693A';
                gear2d(c, -0.15 * T, 0.1 * T, 0.078 * T, 6);
                c.fill();
                c.restore();
                c.fillStyle = 'rgba(220,240,255,0.18)';
                dot(c, 0, 0, 0.24 * T);
                c.strokeStyle = 'rgba(235,248,255,0.7)';
                c.lineWidth = 1.2;
                c.beginPath();
                c.arc(0, 0, 0.24 * T, 0, PI * 2);
                c.stroke();
                c.beginPath();
                c.arc(0, 0, 0.18 * T, PI * 1.1, PI * 1.45);
                c.stroke();
            } else {
                // the orrery: a flat ring, two turning rings seen edge on, the sun and two planets
                c.fillStyle = GOLD2D;
                gear2d(c, 0, 0, 0.2 * T, 12);
                c.fill();
                c.strokeStyle = '#E6C672';
                c.lineWidth = 1.4;
                c.beginPath();
                c.arc(0, 0, 0.3 * T, 0, PI * 2);
                c.stroke();
                c.beginPath();
                c.ellipse(0, 0, 0.26 * T, 0.06 * T, 0.5, 0, PI * 2);
                c.stroke();
                c.strokeStyle = '#C97A4A';
                c.beginPath();
                c.ellipse(0, 0, 0.22 * T, 0.05 * T, -0.9, 0, PI * 2);
                c.stroke();
                const s = c.createRadialGradient(0, 0, 0, 0, 0, 0.12 * T);
                s.addColorStop(0, '#FFF1C0');
                s.addColorStop(0.5, '#E2B64E');
                s.addColorStop(1, 'rgba(226,182,78,0)');
                c.fillStyle = s;
                dot(c, 0, 0, 0.12 * T);
                c.fillStyle = '#B8693A';
                dot(c, 0.3 * T, 0, 2);
                c.fillStyle = '#E9E4F0';
                dot(c, -0.2 * T, 0.22 * T, 1.6);
            }
        },
        // The balloon-back chair: a velvet seat in its frame, the hoop and its buttoned pad as a
        // bar across the back, brass castors at the front
        chair(c, th) {
            const T = TILE;
            c.fillStyle = th.couchWood;
            roundRect(c, -0.33 * T, -0.3 * T, 0.66 * T, 0.62 * T, 7);
            c.fill();
            const g = c.createRadialGradient(-0.08 * T, -0.04 * T, 1, 0, 0.02 * T, 0.34 * T);
            g.addColorStop(0, shadeColor(th.chair, 40));
            g.addColorStop(0.6, shadeColor(th.chair, 8));
            g.addColorStop(1, shadeColor(th.chair, -22));
            c.fillStyle = g;
            roundRect(c, -0.29 * T, -0.24 * T, 0.58 * T, 0.52 * T, 6);
            c.fill();
            c.lineCap = 'round';
            c.strokeStyle = shadeColor(th.couchWood, 14);
            c.lineWidth = 0.1 * T;
            c.beginPath();
            c.moveTo(-0.26 * T, -0.28 * T);
            c.lineTo(0.26 * T, -0.28 * T);
            c.stroke();
            c.strokeStyle = shadeColor(th.chair, -6);
            c.lineWidth = 0.055 * T;
            c.beginPath();
            c.moveTo(-0.19 * T, -0.265 * T);
            c.lineTo(0.19 * T, -0.265 * T);
            c.stroke();
            c.lineCap = 'butt';
            c.fillStyle = GOLD2D;
            for (const bx of [-0.1, 0, 0.1]) dot(c, bx * T, -0.265 * T, 1.1);
            for (const sx of [-1, 1]) dot(c, sx * 0.26 * T, 0.26 * T, 1.8);
        },
        // The fern: the foot of its stand, the rim of the urn, and fronds arching out all round
        plant(c, th, seed) {
            const T = TILE, rnd = seededRandom(seed || 1);
            const urn = th.urn === 'ceramic' ? th.planter : th.urn === 'copper' ? '#B8693A' : BRASS;
            c.fillStyle = shadeColor(th.couchWood, 6);
            dot(c, 0, 0, 0.28 * T);
            const g = c.createRadialGradient(-3, -4, 1, 0, 0, 0.27 * T);
            g.addColorStop(0, shadeColor(urn, 50));
            g.addColorStop(1, shadeColor(urn, -30));
            c.fillStyle = g;
            dot(c, 0, 0, 0.25 * T);
            c.fillStyle = '#2A1A12';
            dot(c, 0, 0, 0.19 * T);
            for (let i = 0; i < 14; i++) {
                const a = (i / 14) * PI * 2 + rnd() * 0.4, len = (i % 2 ? 0.3 : 0.4) * T + rnd() * 0.07 * T, wide = (0.075 + rnd() * 0.035) * T;
                c.save();
                c.rotate(a);
                c.fillStyle = i % 3 === 0 ? shadeColor(th.leaf, 28) : i % 3 === 1 ? th.leaf : shadeColor(th.leaf, -22);
                c.beginPath();
                c.moveTo(0.03 * T, 0);
                c.quadraticCurveTo(len * 0.45, -wide, len, 0);
                c.quadraticCurveTo(len * 0.45, wide, 0.03 * T, 0);
                c.fill();
                c.strokeStyle = 'rgba(0,0,0,0.2)';
                c.lineWidth = 0.7;
                c.beginPath();
                c.moveTo(0.05 * T, 0);
                c.lineTo(len * 0.95, 0);
                c.stroke();
                c.restore();
            }
        },
        // The pet bed: tassels at the four quarters, a brass rim, a velvet cushion with a hollow
        petbed(c, lw, ld, th) {
            const T = TILE, rx = 0.5 * lw * 0.92 * T, ry = 0.5 * ld * 0.88 * T;
            const oval = (k) => { c.beginPath(); c.ellipse(0, 0, rx * k, ry * k, 0, 0, PI * 2); };
            c.fillStyle = '#E2B64E';
            for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) dot(c, sx * rx * 0.76, sy * ry * 0.76, 2.6);
            c.fillStyle = th.couchWood;
            oval(1.02);
            c.fill();
            c.strokeStyle = GOLD2D;
            c.lineWidth = 2;
            oval(0.98);
            c.stroke();
            const g = c.createRadialGradient(-rx * 0.25, -ry * 0.3, 2, 0, 0, rx);
            g.addColorStop(0, shadeColor(th.petbed, 44));
            g.addColorStop(0.55, shadeColor(th.petbed, 10));
            g.addColorStop(1, shadeColor(th.petbed, -26));
            c.fillStyle = g;
            oval(0.9);
            c.fill();
            c.strokeStyle = 'rgba(0,0,0,0.22)';
            c.lineWidth = 3;
            oval(0.66);
            c.stroke();
            c.strokeStyle = 'rgba(255,220,200,0.2)';
            c.lineWidth = 1;
            oval(0.8);
            c.stroke();
        },
        // The gasolier from below: a brass ring, six arms and a globe at the end of each, drawn
        // lightly so the tiles under it still read
        lamp(c, th) {
            const T = TILE, on = th.lamp.on;
            c.globalAlpha = 0.6;
            c.strokeStyle = BRASS;
            c.lineWidth = 1.4;
            c.beginPath();
            c.arc(0, 0, 0.42 * T, 0, PI * 2);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * PI * 2 + PI / 6;
                c.moveTo(Math.cos(a) * 0.1 * T, Math.sin(a) * 0.1 * T);
                c.lineTo(Math.cos(a) * 0.8 * T, Math.sin(a) * 0.8 * T);
            }
            c.stroke();
            c.fillStyle = BRASS;
            dot(c, 0, 0, 0.14 * T);
            if (on) {
                c.shadowColor = th.lamp.color;
                c.shadowBlur = 9 * (typeof canvasDpr === 'number' ? canvasDpr : 1);
            }
            c.fillStyle = on ? th.lamp.color : '#FFF4E2';
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * PI * 2 + PI / 6;
                dot(c, Math.cos(a) * 0.8 * T, Math.sin(a) * 0.8 * T, 3.4);
            }
        },
    };

    S3_STYLE_PACKS.steam = { name: 'steam', themes, couch, table, chair, plant, petbed, wall, architecture, dock, paintFloor, paintBackdrop, textures, palette2d, paint2d };
})();
