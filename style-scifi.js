// === STYLE PACK: SCI-FI ===
// The second floor of the house: a 2020s science-fiction interior. Dark panelled walls, wet
// reflective decks, light strips at the skirting, neon, haze, and a megacity in the rain
// outside the window. See scene3d.js for what a style pack is and what it may leave out.
//
// Everything here is plain data and canvas painting, like the atomic style. Furniture is in
// its own space: centred on its footprint, back towards -z, one unit to a tile, y up.

(function () {
    const M = s3Mat, B = s3B, C = s3C, S = s3S, R = s3R;
    const H = S3_WALL_H, W = S3_WINDOW;

    // ---- Six rooms -------------------------------------------------------------------------
    // The same fields as the atomic themes, plus: neon and neon2 (the two light colours),
    // fog, lights, grade, bloom, floorMat and wallHeight, which scene3d.js and the renderer read.
    const base = {
        style: 'scifi', time: 'night', outside: 'megacity', prints: [],
        sun: { azimuth: -24, elevation: 30, color: '#8FB4FF', intensity: 1.5 },
        ambient: 0.85, fill: '#9DB0D4', env: 1.0, exposure: 1.2, vignette: 0.4, bloom: [0.3, 0.55, 0.93],
        floorMat: { bump: 0.9, normal: 0.7, metalness: 0.35, clearcoat: 0.55, reflect: 1.7, dust: [0.7, 0.22, 0.2, 0.17] },
        leaf: '#3FBF7F', cat: '#C9CED6',
    };
    const themes = [
        {
            name: 'Neon Lounge', floor: 'deck', floorSeed: 2101, wallStyle: 'bulkhead', wallHeight: 4.8,
            sky: { zenith: '#070B1C', horizon: '#5A1E66', ground: '#0B0F1A' },
            lamp: { on: true, down: true, color: '#E6D8FF', intensity: 11 },
            walls: '#5C6778', accent: { wall: 'west', color: '#5B2A6E' }, trim: '#1B2028', ceiling: '#1A1F27',
            neon: '#FF3FBF', neon2: '#33E6FF',
            couch: '#2A2F3A', pillow: '#FF3FBF', couchWood: '#191D24', chair: '#30364A', table: '#11151B',
            planter: '#1B2028', petbed: '#3A2A55',
            door: { wall: 'south', at: 3.5, color: '#2A303B' },
            fog: { color: '#1B1030', density: 0.016 }, grade: [1.02, 0.96, 1.1],
            lights: [{ pos: [0.6, 2.2, 6], color: '#FF3FBF', intensity: 16, distance: 10 }, { pos: [14.2, 0.5, 9], color: '#33E6FF', intensity: 9, distance: 9 }, { pos: [7.5, 0.4, 11.5], color: '#33E6FF', intensity: 7, distance: 8 }, { pos: [4, 3.6, 0.6], color: '#8FB4FF', intensity: 6, distance: 8 }],
        },
        {
            name: 'Sleeper Pods', floor: 'hex', floorSeed: 2207, wallStyle: 'pod', wallHeight: 3.4,
            sun: { azimuth: 30, elevation: 26, color: '#BFE2FF', intensity: 1.7 },
            sky: { zenith: '#060D1A', horizon: '#1D4A66', ground: '#0A1016' },
            lamp: { on: true, down: true, color: '#CFEFFF', intensity: 11 },
            walls: '#66747F', accent: { wall: 'east', color: '#1F5E6E' }, trim: '#20272E', ceiling: '#1D242B',
            neon: '#5CF2FF', neon2: '#B6FF6A',
            couch: '#39424C', pillow: '#5CF2FF', couchWood: '#1C2228', chair: '#3F4C57', table: '#141A1F',
            planter: '#20272E', petbed: '#1F5E6E',
            door: { wall: 'west', at: 6, color: '#2B343C' },
            fog: { color: '#0E2430', density: 0.014 }, grade: [0.93, 1.02, 1.1],
            lights: [{ pos: [14.4, 2.2, 6], color: '#5CF2FF', intensity: 15, distance: 10 }, { pos: [0.6, 0.5, 3], color: '#B6FF6A', intensity: 7, distance: 8 }, { pos: [7.5, 0.4, 11.5], color: '#5CF2FF', intensity: 7, distance: 8 }, { pos: [3, 3.6, 0.6], color: '#BFE2FF', intensity: 6, distance: 8 }],
        },
        {
            name: 'Noodle Bar', floor: 'wet', floorSeed: 2311, wallStyle: 'bar', wallHeight: 1.9,
            sun: { azimuth: -10, elevation: 34, color: '#FFB07A', intensity: 1.4 },
            sky: { zenith: '#0A0812', horizon: '#7A2A1E', ground: '#120C0C' },
            lamp: { on: true, down: true, color: '#FFD9B0', intensity: 12 },
            walls: '#6E6055', accent: { wall: 'south', color: '#7A1E22' }, trim: '#231C18', ceiling: '#1E1917',
            neon: '#FF4A2E', neon2: '#FFD23F',
            couch: '#5A1E22', pillow: '#FFD23F', couchWood: '#1F1A17', chair: '#7A2A22', table: '#16110F',
            planter: '#231C18', petbed: '#7A1E22',
            door: { wall: 'west', at: 6, color: '#2E2622' },
            fog: { color: '#2A130E', density: 0.017 }, grade: [1.1, 0.99, 0.9],
            lights: [{ pos: [7.5, 2.4, 11.4], color: '#FF4A2E', intensity: 18, distance: 11 }, { pos: [0.6, 0.5, 8], color: '#FFD23F', intensity: 8, distance: 8 }, { pos: [14.2, 0.5, 4], color: '#FF4A2E', intensity: 7, distance: 8 }, { pos: [5, 3.6, 0.6], color: '#FFB07A', intensity: 6, distance: 8 }],
        },
        {
            name: 'Ops Deck', floor: 'deck', floorSeed: 2417, wallStyle: 'server', wallHeight: 4.2,
            sun: { azimuth: -46, elevation: 24, color: '#9FD0FF', intensity: 1.5 },
            sky: { zenith: '#050A14', horizon: '#123C5A', ground: '#080C12' },
            lamp: { on: true, down: true, color: '#CFEAFF', intensity: 12 },
            walls: '#5A6876', accent: { wall: 'west', color: '#16405A' }, trim: '#1A2027', ceiling: '#171C22',
            neon: '#2EC8FF', neon2: '#FF9B2E',
            couch: '#2C3742', pillow: '#FF9B2E', couchWood: '#161B21', chair: '#2F3D4A', table: '#0F1419',
            planter: '#1A2027', petbed: '#16405A',
            door: { wall: 'south', at: 10.5, color: '#273039' },
            fog: { color: '#0A1C2A', density: 0.014 }, grade: [0.92, 1.0, 1.12],
            lights: [{ pos: [0.6, 2.2, 6], color: '#2EC8FF', intensity: 16, distance: 10 }, { pos: [14.2, 0.5, 3], color: '#FF9B2E', intensity: 8, distance: 8 }, { pos: [9, 0.4, 11.5], color: '#2EC8FF', intensity: 7, distance: 8 }, { pos: [4, 3.6, 0.6], color: '#9FD0FF', intensity: 6, distance: 8 }],
        },
        {
            name: 'Cargo Lock', floor: 'grate', floorSeed: 2503, wallStyle: 'container', wallHeight: 2.9,
            sun: { azimuth: 58, elevation: 12, color: '#FFB35C', intensity: 1.9 },
            sky: { zenith: '#0B0C14', horizon: '#8A4A16', ground: '#12100C' },
            lamp: { on: true, down: true, color: '#FFE0B0', intensity: 13 },
            walls: '#6C6A60', accent: { wall: 'east', color: '#6A5A1E' }, trim: '#22211D', ceiling: '#1C1B18',
            neon: '#FFC21F', neon2: '#FF5A2E',
            couch: '#3A3A34', pillow: '#FFC21F', couchWood: '#1B1A17', chair: '#4A463A', table: '#14130F',
            planter: '#22211D', petbed: '#6A5A1E',
            door: { wall: 'west', at: 6, color: '#33312B' },
            fog: { color: '#22180A', density: 0.018 }, grade: [1.08, 1.0, 0.88],
            lights: [{ pos: [14.4, 2.2, 6], color: '#FFC21F', intensity: 16, distance: 10 }, { pos: [0.6, 0.5, 9], color: '#FF5A2E', intensity: 8, distance: 8 }, { pos: [6, 0.4, 11.5], color: '#FFC21F', intensity: 7, distance: 8 }, { pos: [5, 3.6, 0.6], color: '#FFB35C', intensity: 6, distance: 8 }],
        },
        {
            name: 'Reactor Core', floor: 'hex', floorSeed: 2609, wallStyle: 'coil', wallHeight: 4.8,
            sun: { azimuth: 16, elevation: 32, color: '#7FA8FF', intensity: 1.2 },
            sky: { zenith: '#03060F', horizon: '#102A5A', ground: '#06080E' },
            lamp: { on: true, down: true, color: '#BFE4FF', intensity: 12 },
            walls: '#4E5C72', accent: { wall: 'south', color: '#12305A' }, trim: '#151A22', ceiling: '#12161D',
            neon: '#38B6FF', neon2: '#FF7A1F',
            couch: '#232B38', pillow: '#FF7A1F', couchWood: '#12161D', chair: '#27324A', table: '#0C1016',
            planter: '#151A22', petbed: '#12305A',
            door: { wall: 'west', at: 6, color: '#222A34' },
            fog: { color: '#06122A', density: 0.015 }, grade: [0.9, 0.98, 1.16], bloom: [0.36, 0.6, 0.9],
            lights: [{ pos: [7.5, 2.4, 11.4], color: '#38B6FF', intensity: 18, distance: 11 }, { pos: [0.6, 0.5, 4], color: '#FF7A1F', intensity: 9, distance: 8 }, { pos: [14.2, 0.5, 8], color: '#38B6FF', intensity: 8, distance: 8 }, { pos: [4, 3.6, 0.6], color: '#7FA8FF', intensity: 6, distance: 8 }],
        },
    ].map((t) => Object.assign({}, base, t));

    // Light sources. Kept modest: bloom does the rest, and too much washes the room out.
    const glow = (color, k) => Object.assign(M('glow', color), { emissiveIntensity: (k || 3) * 0.5 });

    // ---- Furniture ---------------------------------------------------------------------------

    // A low modular sofa: a dark tub floating on a recessed plinth, with light spilling from under it
    function couch(lw, ld, th) {
        const P = [];
        const shell = M('polymer', th.couchWood), hide = M('leather', th.couch), metal = M('gunmetal');
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(C([sx * (lw / 2 - 0.26), 0.06, sz * (ld / 2 - 0.2)], 0.07, 0.08, 0.12, metal));
        P.push(B([0, 0.2, 0], [lw - 0.5, 0.16, ld - 0.4], metal));
        P.push(B([0, 0.29, 0], [lw - 0.14, 0.03, ld - 0.16], glow(th.neon, 3.2), { tag: 'pulse', noShadow: true }));
        P.push(B([0, 0.46, 0], [lw - 0.08, 0.3, ld - 0.1], shell, { bevel: 0.05 }));
        const n = Math.max(1, Math.round(lw)), inner = lw - 0.36, cw = inner / n;
        for (let i = 0; i < n; i++) {
            const x = -inner / 2 + cw * (i + 0.5);
            P.push(B([x, 0.7, 0.08], [cw - 0.03, 0.2, ld - 0.42], hide, { bevel: 0.07 }));
            P.push(B([x, 1.06, -ld / 2 + 0.2], [cw - 0.03, 0.6, 0.2], hide, { bevel: 0.06, rot: [-0.14, 0, 0] }));
        }
        P.push(B([0, 1.42, -ld / 2 + 0.13], [lw - 0.2, 0.06, 0.26], shell, { bevel: 0.02 }));
        P.push(B([0, 1.46, -ld / 2 + 0.2], [lw - 0.5, 0.02, 0.03], glow(th.neon2, 3), { noShadow: true }));
        for (const sx of [-1, 1]) P.push(B([sx * (lw / 2 - 0.1), 0.78, 0], [0.12, 0.5, ld - 0.12], shell, { bevel: 0.04 }));
        P.push(B([lw / 2 - 0.5, 0.92, -ld / 2 + 0.44], [0.4, 0.4, 0.12], M('fabric', th.pillow), { bevel: 0.07, rot: [-0.2, 0, 0.25] }));
        return P;
    }

    // A dark slab on one stem, with a hologram turning above it
    function table(lw, ld, th) {
        const P = [];
        const metal = M('gunmetal'), holo = M('holo', th.neon2);
        P.push(C([0, 0.04, 0], 0.42, 0.46, 0.08, metal));
        P.push(C([0, 0.45, 0], 0.09, 0.12, 0.8, metal));
        P.push(B([0, 0.86, 0], [lw - 0.44, 0.02, ld - 0.44], glow(th.neon, 3), { tag: 'pulse', noShadow: true }));
        P.push(B([0, 0.91, 0], [lw - 0.3, 0.07, ld - 0.3], M('carbon', th.table), { bevel: 0.03 }));
        P.push(C([0, 0.96, 0], 0.16, 0.18, 0.03, metal));
        P.push(C([0, 0.975, 0], 0.11, 0.11, 0.01, glow(th.neon2, 4), { noShadow: true }));
        P.push(C([0, 1.14, 0], 0.3, 0.05, 0.34, holo, { open: true, noShadow: true }));
        P.push(R([0, 1.3, 0], 0.3, 0.012, holo, { tag: 'float', noShadow: true }));
        P.push({ shape: 'gem', pos: [0, 1.36, 0], r: 0.15, faces: 20, mat: holo, tag: 'spin', speed: 0.7, noShadow: true });
        return P;
    }

    // A pedestal chair: a padded seat and a slab back with a line of light down its spine
    function chair(lw, ld, th) {
        const P = [];
        const metal = M('gunmetal'), shell = M('polymer', '#1E232B');
        P.push(C([0, 0.03, 0], 0.3, 0.32, 0.06, metal));
        P.push(C([0, 0.45, 0], 0.05, 0.06, 0.8, metal));
        P.push(B([0, 0.9, 0.02], [0.64, 0.1, 0.6], M('leather', th.chair), { bevel: 0.04 }));
        P.push(B([0, 1.3, -0.26], [0.6, 0.72, 0.1], shell, { bevel: 0.04, rot: [-0.12, 0, 0] }));
        P.push(B([0, 1.3, -0.2], [0.5, 0.56, 0.05], M('leather', th.chair), { bevel: 0.02, rot: [-0.12, 0, 0] }));
        P.push(B([0, 1.32, -0.325], [0.04, 0.52, 0.02], glow(th.neon, 3), { rot: [-0.12, 0, 0], noShadow: true }));
        for (const sx of [-1, 1]) P.push(B([sx * 0.31, 1.08, 0.02], [0.05, 0.05, 0.5], metal, { bevel: 0.02 }));
        return P;
    }

    // A hydroponic column: leaves in a glass tube over a tray of glowing feed
    function plant(lw, ld, th, seed) {
        const P = [];
        const rnd = s3Rand(seed || 1);
        const metal = M('gunmetal', th.planter);
        P.push(C([0, 0.13, 0], 0.3, 0.34, 0.26, metal));
        P.push(R([0, 0.27, 0], 0.3, 0.014, glow(th.neon2, 3), { tag: 'pulse', noShadow: true }));
        P.push(C([0, 0.3, 0], 0.24, 0.24, 0.06, glow(th.leaf, 1.4), { noShadow: true }));
        const greens = [th.leaf, s3Shade(th.leaf, 0.8), s3Shade(th.leaf, 1.2)];
        for (let i = 0; i < 9; i++) {
            const a = rnd() * Math.PI * 2, r = rnd() * 0.11, h = 0.9 + rnd() * 0.9, tilt = 0.04 + rnd() * 0.1;
            P.push(B([Math.cos(a) * r, 0.3 + h / 2, Math.sin(a) * r], [0.11 + rnd() * 0.04, h, 0.02], M('leaf', greens[i % 3]), { bevel: 0.008, taper: 0.3, rot: [Math.sin(a) * tilt, rnd() * Math.PI, -Math.cos(a) * tilt] }));
        }
        const glass = M('glass', '#BFEFFF');
        glass.opacity = 0.16;
        P.push(C([0, 1.3, 0], 0.27, 0.27, 2.0, glass, { open: true }));
        P.push(C([0, 2.34, 0], 0.3, 0.3, 0.1, metal));
        return P;
    }

    // A six-sided warming pad with a ring of light, and the cat asleep on it
    function petbed(lw, ld, th) {
        const sx = lw * 0.92, sz = ld * 0.88;
        return [
            C([0, 0.08, 0], 0.5, 0.54, 0.16, M('polymer', '#1B2028'), { seg: 6, scale: [sx, 1, sz] }),
            R([0, 0.17, 0], 0.44, 0.02, glow(th.neon, 2.6), { scale: [sx, sz, 1], tag: 'pulse', noShadow: true }),
            C([0, 0.19, 0], 0.4, 0.4, 0.05, M('fabric', th.petbed), { scale: [sx, 1, sz] }),
        ].concat(s3Cat(th));
    }

    // Interior walls, one tile each: bulkheads, sleeper pods, a bar, server racks, containers, coils
    function wall(obs, th) {
        const P = [];
        const lw = obs.w, ld = obs.h;
        const rnd = s3Rand(obs.col * 31 + obs.row * 7 + 3);
        const dark = M('polymer', '#1A1F27');
        switch (th.wallStyle) {
            case 'pod': {
                P.push(B([0, 1.7, 0], [lw - 0.04, 3.4, ld - 0.04], M('polymer', '#2A323A'), { bevel: 0.12 }));
                P.push(B([0, 2.1, 0], [lw - 0.36, 1.5, ld + 0.02], glow(th.neon, 1.1), { bevel: 0.1, tag: 'pulse', noShadow: true }));
                P.push(B([0, 0.5, 0], [lw + 0.03, 0.06, ld + 0.03], glow(th.neon2, 2.4), { noShadow: true }));
                break;
            }
            case 'bar': {
                P.push(B([0, 0.9, 0], [lw - 0.04, 1.8, ld - 0.04], M('polymer', '#201A17'), { bevel: 0.01 }));
                P.push(B([0, 1.86, 0], [lw + 0.08, 0.09, ld + 0.08], M('carbon', '#120E0C'), { bevel: 0.02 }));
                P.push(B([0, 1.76, 0], [lw + 0.03, 0.04, ld + 0.03], glow(th.neon, 3), { tag: 'pulse', noShadow: true }));
                P.push(B([0, 0.08, 0], [lw + 0.02, 0.04, ld + 0.02], glow(th.neon2, 2), { noShadow: true }));
                break;
            }
            case 'server': {
                P.push(B([0, 2.1, 0], [lw - 0.03, 4.2, ld - 0.03], dark));
                for (let i = 0; i < 6; i++) {
                    const y = 0.5 + i * 0.6;
                    P.push(B([0, y, 0], [lw + 0.01, 0.02, ld + 0.01], M('gunmetal')));
                    const c = rnd() > 0.72 ? th.neon2 : th.neon;
                    P.push(B([(rnd() - 0.5) * 0.4, y + 0.24, 0], [0.14 + rnd() * 0.3, 0.03, ld + 0.025], glow(c, 3.4), { tag: rnd() > 0.5 ? 'flicker' : undefined, noShadow: true }));
                }
                break;
            }
            case 'container': {
                const tints = [th.accent.color, '#3E4A52', '#5A2E22'];
                let y = 0;
                for (let k = 0; k < 2; k++) {
                    const h = k ? 1.3 : 1.6;
                    P.push(B([(rnd() - 0.5) * 0.04, y + h / 2, (rnd() - 0.5) * 0.04], [lw - 0.03 - k * 0.05, h, ld - 0.03 - k * 0.05], M('polymer', tints[Math.floor(rnd() * 3)]), { texture: 'scifi:ribs', texRepeat: [2, 1], tag: 'crate' }));
                    y += h;
                }
                P.push(B([0, 0.05, 0], [lw + 0.02, 0.03, ld + 0.02], glow(th.neon, 1.6), { noShadow: true }));
                break;
            }
            case 'coil': {
                P.push(C([0, H / 2, 0], 0.46, 0.46, H, M('gunmetal', '#1B222C'), { seg: 16 }));
                for (const y of [0.7, 1.9, 3.1, 4.3]) P.push(R([0, y, 0], 0.47, 0.035, glow(y > 2.5 ? th.neon2 : th.neon, 3.2), { tag: 'pulse', noShadow: true }));
                P.push(B([0, 0.1, 0], [lw, 0.2, ld], dark));
                break;
            }
            default: {
                P.push(B([0, H / 2, 0], [lw, H, ld], M('polymer', th.accent.color), { texture: 'scifi:panel', texRepeat: [1, 2] }));
                P.push(B([0, 0.07, 0], [lw + 0.02, 0.04, ld + 0.02], glow(th.neon, 2.6), { noShadow: true }));
                P.push(B([0, 3.3, 0], [lw + 0.02, 0.04, ld + 0.02], glow(th.neon2, 2.2), { tag: 'pulse', noShadow: true }));
            }
        }
        return P;
    }

    // ---- The room ---------------------------------------------------------------------------

    function architecture(levelIndex, th) {
        const wallMat = (wall) => M('polymer', wall === th.accent.wall ? th.accent.color : th.walls);
        const P = s3Shell(th, { mat: wallMat, wallTex: 'scifi:panel', rep: [0.5, 2], ceilMat: M('polymer', th.ceiling), ceilTex: 'scifi:panel' });
        const metal = M('gunmetal'), trim = M('polymer', th.trim);
        const mid = (W.x0 + W.x1) / 2, span = W.x1 - W.x0;

        // A light strip at the foot of every wall and a dimmer one at the top
        for (const wl of ['north', 'south', 'west', 'east']) {
            const len = s3WallLength(wl);
            const lo = s3WallPoint(wl, len / 2, 0.07, 0.035), hi = s3WallPoint(wl, len / 2, H - 0.12, 0.04);
            P.push(B(lo.pos, [len, 0.05, 0.03], glow(wl === th.accent.wall ? th.neon2 : th.neon, 3), { rot: [0, lo.yaw, 0], noShadow: true }));
            P.push(B(s3WallPoint(wl, len / 2, 0.2, 0.02).pos, [len, 0.2, 0.04], trim, { rot: [0, lo.yaw, 0] }));
            P.push(B(hi.pos, [len, 0.03, 0.03], glow(th.lamp.color, 1.2), { rot: [0, hi.yaw, 0], noShadow: true }));
        }

        // Window: a heavy frame, slanted louvres, and dark glass with the city behind it
        P.push(B([mid, W.sill - 0.04, 0.06], [span + 0.36, 0.1, 0.4], metal, { bevel: 0.02 }));
        P.push(B([mid, W.top + 0.06, -0.02], [span + 0.36, 0.14, 0.12], metal));
        for (const x of [W.x0 - 0.08, W.x1 + 0.08]) P.push(B([x, (W.sill + W.top) / 2, -0.02], [0.16, W.top - W.sill + 0.24, 0.12], metal));
        P.push(B([mid, (W.sill + W.top) / 2, -0.1], [0.07, W.top - W.sill, 0.07], metal));
        for (let i = 0; i < 7; i++) P.push(B([mid, W.top - 0.2 - i * 0.2, -0.06], [span - 0.06, 0.02, 0.13], trim, { rot: [0.6, 0, 0], tag: 'slat' }));
        P.push(s3WindowGlass('#5B7FA8', 0.26));
        P.push(B([mid, W.sill - 0.12, 0.02], [span, 0.03, 0.03], glow(th.neon2, 2.6), { noShadow: true }));

        // Ceiling: three light bars, and a ring lamp hung where the chandelier was
        for (const z of [2.6, 6, 9.4]) {
            P.push(B([COLS / 2, H - 0.06, z], [COLS - 3, 0.1, 0.3], metal));
            P.push(B([COLS / 2, H - 0.12, z], [COLS - 3.4, 0.02, 0.16], glow(th.lamp.color, 2.4), { tag: 'bulb', noShadow: true }));
        }
        const ly = H - 1.1;
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            P.push({ shape: 'rod', from: [S3_LAMP.x + Math.cos(a) * 0.7, ly, S3_LAMP.z + Math.sin(a) * 0.7], to: [S3_LAMP.x + Math.cos(a) * 0.2, H, S3_LAMP.z + Math.sin(a) * 0.2], r: 0.008, mat: metal });
        }
        P.push(R([S3_LAMP.x, ly, S3_LAMP.z], 0.72, 0.04, metal));
        P.push(R([S3_LAMP.x, ly - 0.04, S3_LAMP.z], 0.72, 0.022, glow(th.lamp.color, 5), { tag: 'bulb', noShadow: true }));

        // Door: two heavy leaves with a seam of light, a lit header and a keypad
        const door = th.door, dw = 2.0, dh = 4.0;
        const leaf = M('gunmetal', door.color);
        for (const s of [-1, 1]) {
            const d = s3WallPoint(door.wall, door.at + s * (dw / 4 + 0.015), dh / 2, 0.03);
            P.push(B(d.pos, [dw / 2 - 0.02, dh, 0.1], leaf, { rot: [0, d.yaw, 0], bevel: 0.02, texture: 'scifi:panel', texRepeat: [1, 2], tag: s > 0 ? 'door' : undefined }));
            const j = s3WallPoint(door.wall, door.at + s * (dw / 2 + 0.1), dh / 2 + 0.1, 0.08);
            P.push(B(j.pos, [0.2, dh + 0.2, 0.18], metal, { rot: [0, j.yaw, 0] }));
        }
        const seam = s3WallPoint(door.wall, door.at, dh / 2, 0.09);
        P.push(B(seam.pos, [0.02, dh - 0.1, 0.02], glow(th.neon, 3.4), { rot: [0, seam.yaw, 0], noShadow: true }));
        const head = s3WallPoint(door.wall, door.at, dh + 0.14, 0.08);
        P.push(B(head.pos, [dw + 0.4, 0.2, 0.18], metal, { rot: [0, head.yaw, 0] }));
        P.push(B(s3WallPoint(door.wall, door.at, dh + 0.14, 0.18).pos, [dw - 0.2, 0.05, 0.02], glow(th.neon2, 3.6), { rot: [0, head.yaw, 0], noShadow: true }));
        const pad = s3WallPoint(door.wall, door.at + dw / 2 + 0.5, 2.1, 0.03);
        P.push(B(pad.pos, [0.26, 0.4, 0.05], metal, { rot: [0, pad.yaw, 0], bevel: 0.02 }));
        P.push(B(s3WallPoint(door.wall, door.at + dw / 2 + 0.5, 2.16, 0.06).pos, [0.16, 0.16, 0.01], glow(th.neon, 3), { rot: [0, pad.yaw, 0], noShadow: true }));

        // A sign in light on the accent wall: a ring and three bars
        const aw = th.accent.wall;
        const at = aw === 'north' ? 5 : s3WallLength(aw) / 2 + (door.wall === aw ? 3.4 : 0);
        const sg = s3WallPoint(aw, at, 3.0, 0.07);
        P.push({ shape: 'torus', pos: sg.pos, r: 0.55, tube: 0.03, rot: [0, sg.yaw, 0], mat: glow(th.neon, 5), tag: 'flicker', noShadow: true });
        for (let i = 0; i < 3; i++) {
            const b = s3WallPoint(aw, at + 1.1 + i * 0.28, 3.0 + (i - 1) * 0.12, 0.07);
            P.push(B(b.pos, [0.05, 0.7 - i * 0.16, 0.03], glow(th.neon2, 4.4), { rot: [0, b.yaw, 0], noShadow: true }));
        }

        // Two screens on the walls that have room, and a run of pipe under the ceiling
        const free = ['north', 'south', 'west', 'east'].filter((w) => w !== door.wall && w !== aw);
        free.slice(0, 2).forEach((wl, i) => {
            const len = s3WallLength(wl);
            let along = wl === 'north' ? 3.2 + i * 3.4 : len * (0.3 + 0.4 * (i % 2));
            if (wl === 'north' && along > W.x0 - 1.4) along = W.x0 - 1.6;
            const fr = s3WallPoint(wl, along, 2.7, 0.04);
            P.push(B(fr.pos, [1.7, 1.0, 0.07], metal, { rot: [0, fr.yaw, 0], bevel: 0.02 }));
            const sc = s3WallPoint(wl, along, 2.7, 0.085);
            P.push({ shape: 'plane', pos: sc.pos, size: [1.56, 0.86], rot: [0, sc.yaw, 0], mat: Object.assign(M('glow', '#FFFFFF'), { emissiveIntensity: 1.5 }), texture: 'scifi:screen', tag: 'flicker', noShadow: true });
        });
        const pw = free[free.length - 1] || 'east';
        const plen = s3WallLength(pw);
        for (const [y, r, mat] of [[H - 0.5, 0.07, M('copper')], [H - 0.72, 0.045, metal]]) {
            const a = s3WallPoint(pw, 0.4, y, 0.14), b = s3WallPoint(pw, plen - 0.4, y, 0.14);
            P.push({ shape: 'rod', from: a.pos, to: b.pos, r, mat });
        }
        return P;
    }

    // ---- Painting: the deck, the city, the wall panels ------------------------------------------

    const rgba = (hex, a) => { const c = hexToRgb(hex) || [128, 128, 128]; return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

    // The whole floor, px pixels to a tile. One plate per tile so the grid still reads.
    function paintFloor(t, th, px) {
        const w = COLS * px, h = ROWS * px, u = px / 48;
        const rnd = seededRandom(th.floorSeed);
        const kind = th.floor;
        t.fillStyle = kind === 'wet' ? '#1B1A1C' : kind === 'grate' ? '#1E1F21' : '#1B2027';
        t.fillRect(0, 0, w, h);
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const x = c * px, y = r * px, v = 22 + Math.floor(rnd() * 16);
                if (kind === 'wet') {
                    t.fillStyle = `rgb(${v + 8},${v + 6},${v + 8})`;
                    t.fillRect(x, y, px, px);
                } else {
                    // a plate with a lit top edge and a dark seam
                    t.fillStyle = `rgb(${v},${v + 5},${v + 13})`;
                    t.fillRect(x + u, y + u, px - 2 * u, px - 2 * u);
                    t.fillStyle = 'rgba(160,190,220,0.10)';
                    t.fillRect(x + u, y + u, px - 2 * u, 1.2 * u);
                    t.fillStyle = 'rgba(0,0,0,0.5)';
                    t.fillRect(x, y + px - u, px, u);
                    t.fillRect(x + px - u, y, u, px);
                }
                if (kind === 'hex') {
                    t.strokeStyle = rgba(th.neon, 0.16);
                    t.lineWidth = 0.8 * u;
                    const s = px / 4;
                    for (let k = 0; k < 2; k++) {
                        const cx = x + px * (k ? 0.74 : 0.26), cy = y + px * (k ? 0.72 : 0.28);
                        t.beginPath();
                        for (let i = 0; i < 6; i++) {
                            const a = (i / 6) * Math.PI * 2;
                            t[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * s * 0.8, cy + Math.sin(a) * s * 0.8);
                        }
                        t.closePath();
                        t.stroke();
                    }
                } else if (kind === 'grate') {
                    t.fillStyle = 'rgba(0,0,0,0.42)';
                    for (let i = 0; i < 5; i++) t.fillRect(x + px * 0.14, y + px * (0.16 + i * 0.15), px * 0.72, px * 0.06);
                } else if (kind === 'deck') {
                    t.fillStyle = 'rgba(190,210,230,0.22)';
                    for (const [dx, dy] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) {
                        t.beginPath();
                        t.arc(x + px * dx, y + px * dy, 1.3 * u, 0, Math.PI * 2);
                        t.fill();
                    }
                }
            }
        }
        // wear: scratches, oil, and for the wet floor long puddles that catch the light
        for (let i = 0; i < 260; i++) {
            const x = rnd() * w, y = rnd() * h, len = (6 + rnd() * 26) * u, a = rnd() * Math.PI;
            t.strokeStyle = `rgba(200,215,235,${0.03 + rnd() * 0.06})`;
            t.lineWidth = 0.6 * u;
            t.beginPath();
            t.moveTo(x, y);
            t.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
            t.stroke();
        }
        for (let i = 0; i < (kind === 'wet' ? 46 : 20); i++) {
            t.fillStyle = kind === 'wet' ? rgba(th.neon, 0.05 + rnd() * 0.07) : `rgba(0,0,0,${0.08 + rnd() * 0.12})`;
            t.beginPath();
            t.ellipse(rnd() * w, rnd() * h, (14 + rnd() * 60) * u, (6 + rnd() * 26) * u, rnd() * 3, 0, Math.PI * 2);
            t.fill();
        }
        if (kind === 'grate' || kind === 'deck') {
            // a hazard line across the room, as on a loading floor
            const y = 9 * px - 3 * u;
            for (let x = 0; x < w; x += 12 * u) {
                t.fillStyle = (Math.floor(x / (12 * u)) % 2) ? rgba(th.neon, 0.5) : 'rgba(0,0,0,0.55)';
                t.fillRect(x, y, 12 * u, 6 * u);
            }
        }
    }

    // Outside the window: towers in the rain, lit windows, signs, and the glow of the street
    function paintBackdrop(t, th, w, h) {
        const rnd = seededRandom(th.floorSeed + 5);
        const sky = t.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, th.sky.zenith);
        sky.addColorStop(0.62, th.sky.horizon);
        sky.addColorStop(1, '#050608');
        t.fillStyle = sky;
        t.fillRect(0, 0, w, h);
        for (let layer = 0; layer < 3; layer++) {
            const far = 1 - layer / 3;
            let x = -40;
            while (x < w) {
                const bw = 50 + rnd() * 120, bh = h * (0.25 + rnd() * 0.5) * (0.55 + 0.45 * (1 - far));
                const top = h * 0.86 - bh;
                t.fillStyle = `rgba(${8 + layer * 5},${10 + layer * 6},${18 + layer * 9},${0.72 + layer * 0.14})`;
                t.fillRect(x, top, bw, bh + h);
                for (let wy = top + 8; wy < h * 0.86; wy += 9) {
                    for (let wx = x + 5; wx < x + bw - 5; wx += 8) {
                        if (rnd() > 0.72 - layer * 0.08) {
                            t.fillStyle = rnd() > 0.82 ? rgba(th.neon, 0.9) : rnd() > 0.5 ? 'rgba(255,214,150,0.75)' : 'rgba(170,215,255,0.7)';
                            t.fillRect(wx, wy, 3, 4);
                        }
                    }
                }
                if (rnd() > 0.6) {
                    // a sign down the side of the tower
                    const sx = x + rnd() * (bw - 26), sy = top + 20 + rnd() * bh * 0.4, sh = 60 + rnd() * 120;
                    const col = rnd() > 0.5 ? th.neon : th.neon2;
                    t.shadowColor = col;
                    t.shadowBlur = 26;
                    t.fillStyle = rgba(col, 0.9);
                    t.fillRect(sx, sy, 16, sh);
                    t.shadowBlur = 0;
                }
                x += bw + rnd() * 14;
            }
        }
        const street = t.createLinearGradient(0, h * 0.7, 0, h);
        street.addColorStop(0, 'rgba(0,0,0,0)');
        street.addColorStop(1, rgba(th.neon, 0.4));
        t.fillStyle = street;
        t.fillRect(0, h * 0.7, w, h * 0.3);
        t.strokeStyle = 'rgba(190,215,255,0.14)';
        t.lineWidth = 1;
        for (let i = 0; i < 900; i++) {
            const x = rnd() * w, y = rnd() * h, l = 10 + rnd() * 26;
            t.beginPath();
            t.moveTo(x, y);
            t.lineTo(x - l * 0.2, y + l);
            t.stroke();
        }
    }

    const textures = {
        // Wall panels: light grey so the wall colour tints them; the same picture makes the bumps
        panel: {
            size: 256, tint: true, normal: 2.2, normalScale: 0.9, repeat: [3, 2],
            paint(t, n) {
                const rnd = seededRandom(91);
                t.fillStyle = '#B9BCC2';
                t.fillRect(0, 0, n, n);
                t.fillStyle = '#C9CCD2';
                t.fillRect(6, 6, n - 12, n * 0.46 - 8);
                t.fillRect(6, n * 0.5 + 2, n * 0.62 - 8, n * 0.5 - 8);
                t.fillStyle = '#A9ACB3';
                t.fillRect(n * 0.62 + 4, n * 0.5 + 2, n * 0.38 - 10, n * 0.5 - 8);
                t.fillStyle = '#5A5E66';
                for (let i = 0; i < 5; i++) t.fillRect(n * 0.68, n * (0.58 + i * 0.07), n * 0.24, 4);
                t.fillStyle = '#6A6E76';
                for (const [x, y] of [[14, 14], [n - 14, 14], [14, n * 0.46 - 8], [n - 14, n * 0.46 - 8], [14, n * 0.5 + 10], [14, n - 14]]) {
                    t.beginPath();
                    t.arc(x, y, 3, 0, Math.PI * 2);
                    t.fill();
                }
                for (let i = 0; i < 70; i++) {
                    t.fillStyle = `rgba(40,44,52,${0.03 + rnd() * 0.07})`;
                    t.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 2, 6 + rnd() * 50);
                }
            },
        },
        // The corrugated side of a shipping container
        ribs: {
            size: 128, tint: true, normal: 3, normalScale: 1,
            paint(t, n) {
                for (let x = 0; x < n; x += 16) {
                    const g = t.createLinearGradient(x, 0, x + 16, 0);
                    g.addColorStop(0, '#8A8D92');
                    g.addColorStop(0.5, '#D6D8DC');
                    g.addColorStop(1, '#8A8D92');
                    t.fillStyle = g;
                    t.fillRect(x, 0, 16, n);
                }
                t.fillStyle = 'rgba(60,40,30,0.25)';
                t.fillRect(0, n - 14, n, 14);
            },
        },
        // A wall screen: a few readouts in the room's two colours
        screen: {
            size: 256, perTheme: true, glow: 1.4,
            paint(t, n, th) {
                const rnd = seededRandom(th.floorSeed + 77);
                t.fillStyle = '#04080C';
                t.fillRect(0, 0, n, n);
                t.strokeStyle = th.neon;
                t.lineWidth = 2;
                t.beginPath();
                for (let x = 0; x <= n; x += 8) t[x ? 'lineTo' : 'moveTo'](x, n * 0.4 + Math.sin(x * 0.07) * 22 + (rnd() - 0.5) * 18);
                t.stroke();
                t.fillStyle = th.neon2;
                for (let i = 0; i < 9; i++) t.fillRect(16 + i * 26, n - 24 - rnd() * 70, 14, 200);
                t.fillStyle = th.neon;
                for (let i = 0; i < 6; i++) t.fillRect(16, 18 + i * 12, 40 + rnd() * 120, 4);
                t.fillStyle = 'rgba(0,0,0,0.35)';
                for (let y = 0; y < n; y += 4) t.fillRect(0, y, n, 1);
            },
        },
    };

    // ---- The 2D board ---------------------------------------------------------------------------

    function palette2d(th) {
        const neon = hexToRgb(th.neon) || [80, 220, 255];
        return {
            glaze: neon.map((v) => Math.round(v * 0.55 + 110)), glazeAlpha: 0.4,
            film: [128, 116, 98], filmAlpha: 0.3,
            dust: { fluff: [168, 160, 150], crumb: [196, 180, 156], hair: [186, 176, 166] },
            floorBase: [32, 37, 46],
        };
    }

    const line2d = (c, color, blur) => { c.strokeStyle = color; c.shadowColor = color; c.shadowBlur = blur; };

    const paint2d = {
        wall(c, it, th, wallSet) {
            const T = TILE, o = it.o, x = o.col * T, y = o.row * T;
            const open = (dc, dr) => !wallSet.has(`${o.col + dc},${o.row + dr}`);
            const round = th.wallStyle === 'coil' || th.wallStyle === 'pod';
            c.fillStyle = th.wallStyle === 'container' ? shadeColor(th.accent.color, -18) : th.wallStyle === 'bar' ? '#191412' : '#161B22';
            if (round) { roundRect(c, x + 2, y + 2, T - 4, T - 4, th.wallStyle === 'coil' ? T / 2 : 10); c.fill(); } else c.fillRect(x, y, T, T);
            c.fillStyle = 'rgba(255,255,255,0.05)';
            c.fillRect(x + 4, y + 4, T - 8, (T - 8) * 0.4);
            c.save();
            c.lineWidth = 1.6;
            line2d(c, th.neon, 7);
            c.beginPath();
            if (round) { c.arc(x + T / 2, y + T / 2, T * (th.wallStyle === 'coil' ? 0.3 : 0.22), 0, Math.PI * 2); } else {
                if (open(0, -1)) { c.moveTo(x + 2, y + 1.5); c.lineTo(x + T - 2, y + 1.5); }
                if (open(0, 1)) { c.moveTo(x + 2, y + T - 1.5); c.lineTo(x + T - 2, y + T - 1.5); }
                if (open(-1, 0)) { c.moveTo(x + 1.5, y + 2); c.lineTo(x + 1.5, y + T - 2); }
                if (open(1, 0)) { c.moveTo(x + T - 1.5, y + 2); c.lineTo(x + T - 1.5, y + T - 2); }
            }
            c.stroke();
            c.restore();
            if (th.wallStyle === 'server') {
                c.fillStyle = th.neon2;
                for (let i = 0; i < 3; i++) c.fillRect(x + 10 + i * 10, y + T / 2 - 1, 5, 2);
            }
        },
        couch(c, lw, ld, th) {
            const T = TILE, w = lw * T, d = ld * T;
            c.save();
            line2d(c, th.neon, 12);
            c.lineWidth = 2;
            roundRect(c, -w / 2 + 3, -d / 2 + 4, w - 6, d - 7, 7);
            c.stroke();
            c.restore();
            c.fillStyle = th.couchWood;
            roundRect(c, -w / 2 + 3, -d / 2 + 4, w - 6, d - 7, 7);
            c.fill();
            const n = Math.max(1, Math.round(lw)), inner = w - 18, cw = inner / n;
            for (let i = 0; i < n; i++) {
                const x = -inner / 2 + cw * i;
                c.fillStyle = shadeColor(th.couch, 22);
                roundRect(c, x + 1.5, -d / 2 + 15, cw - 3, d - 23, 4);
                c.fill();
                c.fillStyle = shadeColor(th.couch, 4);
                roundRect(c, x + 1.5, -d / 2 + 6, cw - 3, 9, 3);
                c.fill();
            }
            c.fillStyle = th.neon2;
            c.fillRect(-w / 2 + 12, -d / 2 + 5, w - 24, 1.4);
            c.fillStyle = th.pillow;
            roundRect(c, w / 2 - 24, -d / 2 + 13, 13, 12, 3);
            c.fill();
        },
        table(c, lw, ld, th) {
            const T = TILE, w = lw * T - 14, d = ld * T - 14;
            c.save();
            line2d(c, th.neon, 14);
            c.lineWidth = 2;
            roundRect(c, -w / 2, -d / 2, w, d, 9);
            c.stroke();
            c.restore();
            c.fillStyle = shadeColor(th.table, 14);
            roundRect(c, -w / 2, -d / 2, w, d, 9);
            c.fill();
            c.fillStyle = 'rgba(255,255,255,0.07)';
            roundRect(c, -w / 2 + 3, -d / 2 + 3, w - 6, d * 0.34, 7);
            c.fill();
            const g = c.createRadialGradient(0, 0, 1, 0, 0, T * 0.5);
            g.addColorStop(0, th.neon2);
            g.addColorStop(0.35, th.neon2 + '66');
            g.addColorStop(1, th.neon2 + '00');
            c.fillStyle = g;
            c.beginPath();
            c.arc(0, 0, T * 0.5, 0, Math.PI * 2);
            c.fill();
            c.strokeStyle = th.neon2;
            c.lineWidth = 1.2;
            c.beginPath();
            c.arc(0, 0, T * 0.3, 0, Math.PI * 2);
            c.stroke();
        },
        chair(c, th) {
            const T = TILE;
            c.fillStyle = '#1B2028';
            roundRect(c, -0.33 * T, -0.33 * T, 0.66 * T, 0.66 * T, 6);
            c.fill();
            c.fillStyle = shadeColor(th.chair, 26);
            roundRect(c, -0.27 * T, -0.14 * T, 0.54 * T, 0.42 * T, 5);
            c.fill();
            c.fillStyle = shadeColor(th.chair, 8);
            roundRect(c, -0.29 * T, -0.31 * T, 0.58 * T, 0.15 * T, 4);
            c.fill();
            c.save();
            c.fillStyle = th.neon;
            c.shadowColor = th.neon;
            c.shadowBlur = 8;
            c.fillRect(-1, -0.31 * T, 2, 0.15 * T);
            c.restore();
        },
        plant(c, th, seed) {
            const T = TILE, rnd = seededRandom(seed || 1);
            c.save();
            c.shadowColor = th.neon2;
            c.shadowBlur = 10;
            c.fillStyle = '#12161B';
            c.beginPath();
            c.arc(0, 0, 0.36 * T, 0, Math.PI * 2);
            c.fill();
            c.restore();
            c.fillStyle = shadeColor(th.leaf, -45);
            c.beginPath();
            c.arc(0, 0, 0.29 * T, 0, Math.PI * 2);
            c.fill();
            for (let i = 0; i < 9; i++) {
                const a = rnd() * Math.PI * 2, l = (0.12 + rnd() * 0.15) * T;
                c.strokeStyle = i % 2 ? th.leaf : shadeColor(th.leaf, 30);
                c.lineWidth = 2.6;
                c.lineCap = 'round';
                c.beginPath();
                c.moveTo(0, 0);
                c.lineTo(Math.cos(a) * l, Math.sin(a) * l);
                c.stroke();
            }
            c.strokeStyle = 'rgba(200,240,255,0.5)';
            c.lineWidth = 1.2;
            c.beginPath();
            c.arc(0, 0, 0.31 * T, 0, Math.PI * 2);
            c.stroke();
        },
        petbed(c, lw, ld, th) {
            const T = TILE, rx = 0.5 * lw * 0.92 * T, ry = 0.5 * ld * 0.88 * T;
            const hex = (k) => {
                c.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2;
                    c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rx * k, Math.sin(a) * ry * k);
                }
                c.closePath();
            };
            c.fillStyle = '#161B22';
            hex(1.06);
            c.fill();
            c.save();
            line2d(c, th.neon, 9);
            c.lineWidth = 1.6;
            hex(0.92);
            c.stroke();
            c.restore();
            c.fillStyle = shadeColor(th.petbed, 14);
            c.beginPath();
            c.ellipse(0, 0, rx * 0.74, ry * 0.74, 0, 0, Math.PI * 2);
            c.fill();
        },
    };

    S3_STYLE_PACKS.scifi = { name: 'scifi', themes, couch, table, chair, plant, petbed, wall, architecture, paintFloor, paintBackdrop, textures, palette2d, paint2d };
})();
