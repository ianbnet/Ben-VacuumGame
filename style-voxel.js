// === STYLE PACK: VOXEL ===
// The fourth floor of the house: a blocky dungeon built from cubes. Cobblestone and stone
// brick, oak planks, torches, chests, barrels and banners, glowing crystals and lava, all in
// chunky pixel art. Bright and toy-like, warm torchlight against cool stone.
// See scene3d.js for what a style pack is and docs/style-pack-brief.md for the contract.
//
// Everything is a box with no bevel, sized in "pixels" of an eighth of a tile, in flat matte
// materials. The textures are 16 x 16 pictures kept sharp and laid so that one picture covers
// one tile. Furniture is in its own space: centred on its footprint, back towards -z, y up.

(function () {
    const M = s3Mat, B = s3B, C = s3C, sh = s3Shade;
    const H = S3_WALL_H, W = S3_WINDOW;
    const WALLS = ['north', 'south', 'west', 'east'];
    const U = 0.125;                    // one pixel of the 3D world: an eighth of a tile
    const IRON = '#4A4D55', GOLD = '#F2C230', CREAM = '#F3EAD2', EMBER = '#FFE9A0';
    const BOOKS = ['#B03A2E', '#2E6FB5', '#3E8E5A', '#D9A441', '#6A3FA0', '#8C5A2E', '#2F8F8F', '#C96A8A'];
    const MOSS = ['#5E9A3C', '#4C8430', '#7BB04A'];
    const TOPPERS = ['#F2C84B', '#C8372D', '#E8862E', '#6FB04A'];     // cheese, apples, a pumpkin, a melon

    // Matte blocks and glowing blocks. Light sources bloom, so their glow is kept modest.
    const blk = (color) => M('blocky', color);
    const lit = (color, k) => Object.assign(M('glow', color), { emissiveIntensity: k || 1.8, roughness: 0.9, flat: true });
    // A square post. The tests want couch and table legs to be `cyl` parts, so a leg is a
    // four-sided cylinder turned an eighth of a turn, which lines its faces up with the axes.
    const post = (x, y, z, side, h, mat) => C([x, y, z], side / Math.SQRT2, side / Math.SQRT2, h, mat, { seg: 4, rot: [0, Math.PI / 4, 0] });
    const snap = (v) => Math.round(v / (U / 2)) * (U / 2);
    // A random stream from a small seed. The seed is scrambled first: the plain generator gives
    // neighbouring small seeds nearly the same first number, which would make every tile alike.
    const scrambled = (seed) => { const rnd = seededRandom(Math.imul((seed + 0x9E37) ^ 0x5BD1E995, 2654435761) >>> 0); rnd(); return rnd; };
    const tileRand = (col, row) => scrambled((col * 73856093) ^ (row * 19349663));

    // ---- Six rooms -------------------------------------------------------------------------
    // The same fields as the atomic themes, plus what this pack reads: the block textures of the
    // walls (wallTex, accentTex, ceilTex), block colours (pillar, log, beam), light colours
    // (torch, gem, gem2), banner colours, and which stool, plant and wall rack the room gets.
    const torches = (color, k) => [
        { pos: [0.9, 3.1, 6], color, intensity: 10 * k, distance: 9 },
        { pos: [14.1, 3.1, 6], color, intensity: 10 * k, distance: 9 },
        { pos: [7.5, 3.1, 11.1], color, intensity: 8 * k, distance: 9 },
        { pos: [4.5, 3.1, 0.9], color, intensity: 7 * k, distance: 8 },
    ];
    const floorMat = (dust) => ({ bump: 0.4, normal: 0.45, metalness: 0, clearcoat: 0.03, reflect: 0.5, dust });
    const base = {
        style: 'voxel', prints: [], outside: 'castle',
        ambient: 0.7, env: 0.3, exposure: 1.14, vignette: 0.24, bloom: [0.26, 0.5, 0.92],
        leaf: '#57A639', cat: '#9A9A9A', cap: '#C8372D', pillar: '#B9BEC6', log: '#A27A48',
        wallTex: 'brick', accentTex: 'cobble', ceilTex: 'planks', seat: 'chair', flora: 'bush', rack: 'ladder',
    };
    const themes = [
        {
            name: 'Stone Keep', time: 'morning', floor: 'cobble', floorSeed: 4101, wallStyle: 'pillar', wallHeight: 4.8,
            sun: { azimuth: -28, elevation: 42, color: '#FFF1DA', intensity: 3.0 },
            sky: { zenith: '#4F9BE8', horizon: '#CFEBFF', ground: '#6FAE4C' },
            lamp: { on: true, color: '#FFC978', intensity: 7 },
            walls: '#C9CDD3', accent: { wall: 'west', color: '#A9B2BF' }, trim: '#7B8089', ceiling: '#B98A52', beam: '#6E4E2C',
            couch: '#C0392B', pillow: '#F2C14E', couchWood: '#A9793F', chair: '#2E6FB5', table: '#A9793F',
            planter: '#B5673F', petbed: '#C0392B',
            door: { wall: 'south', at: 3.5, color: '#A9793F' },
            torch: '#FFB03A', gem: '#4FD8FF', gem2: '#FF5A4A', banner: '#C0392B', banner2: '#F2C14E',
            rack: 'weapons', fill: '#DCE8F6', grade: [1.03, 1.0, 0.97],
            floorMat: floorMat([0.6, 0.27, 0.21, 0.14]), lights: torches('#FFB868', 0.6),
        },
        {
            name: 'Mossy Camp', time: 'golden hour', floor: 'mossbrick', floorSeed: 4207, wallStyle: 'palisade', wallHeight: 2.5,
            sun: { azimuth: 38, elevation: 13, color: '#FFBE78', intensity: 2.8 },
            sky: { zenith: '#6F86C8', horizon: '#F8C08A', ground: '#5E8F3E' },
            lamp: { on: true, color: '#FFC268', intensity: 10 },
            walls: '#B4C2A2', accent: { wall: 'east', color: '#A27A48' }, trim: '#6E7B5E', ceiling: '#A27A48', beam: '#5E4428',
            wallTex: 'mossy', accentTex: 'bark',
            couch: '#3E8E5A', pillow: '#F2A03D', couchWood: '#8C6A3F', chair: '#D9A441', table: '#8C6A3F',
            leaf: '#5DB345', planter: '#A85F3A', petbed: '#D9A441', cat: '#D98E4A',
            door: { wall: 'west', at: 6, color: '#8C6A3F' },
            torch: '#FFA53A', gem: '#9BE564', gem2: '#FFD23F', banner: '#3E8E5A', banner2: '#F4E9C8',
            seat: 'stool', flora: 'sapling', outside: 'falls', fill: '#F2DCC0', grade: [1.06, 1.0, 0.93],
            floorMat: floorMat([0.6, 0.28, 0.23, 0.16]), lights: torches('#FFB060', 0.9),
        },
        {
            name: 'Tavern Cellar', time: 'noon', floor: 'planks', floorSeed: 4311, wallStyle: 'barrels', wallHeight: 2.5,
            sun: { azimuth: -8, elevation: 58, color: '#FFFBF2', intensity: 3.2 },
            sky: { zenith: '#4C9BE0', horizon: '#D8EEFF', ground: '#7DB356' },
            lamp: { on: true, color: '#FFD08A', intensity: 6 },
            walls: '#D6CBB8', accent: { wall: 'south', color: '#B58A52' }, trim: '#7A6248', ceiling: '#B58A52', beam: '#6B4A2B',
            accentTex: 'planks',
            couch: '#B5532E', pillow: '#F2D16B', couchWood: '#8A6238', chair: '#B5532E', table: '#9C7446',
            planter: '#9A5636', petbed: '#4E7FB5', cat: '#3A3A3A',
            door: { wall: 'west', at: 6, color: '#8A6238' },
            torch: '#FFB648', gem: '#FFD23F', gem2: '#FF7A3A', banner: '#B5532E', banner2: '#F2D16B',
            seat: 'stool', fill: '#EAF0F6', grade: [1.03, 1.0, 0.96],
            floorMat: floorMat([0.55, 0.2, 0.19, 0.18]), lights: torches('#FFC070', 0.6),
        },
        {
            name: 'Rune Library', time: 'afternoon', floor: 'carpet', floorSeed: 4417, wallStyle: 'bookshelf', wallHeight: 4.8,
            sun: { azimuth: -52, elevation: 27, color: '#FFE3B8', intensity: 2.5 },
            sky: { zenith: '#6FA3D8', horizon: '#F4DDB8', ground: '#6E9A4E' },
            lamp: { on: true, color: '#FFD49A', intensity: 11 },
            walls: '#BDB6CE', accent: { wall: 'west', color: '#7A552E' }, trim: '#5A4630', ceiling: '#7A5A3A', beam: '#4A3420',
            accentTex: 'shelf',
            couch: '#6A3FA0', pillow: '#F2C14E', couchWood: '#6B4A2B', chair: '#8E2F3A', table: '#6B4A2B',
            planter: '#3F5E8E', petbed: '#8E2F3A', cat: '#E8E2D4',
            door: { wall: 'south', at: 10.5, color: '#6B4A2B' },
            torch: '#FFC460', gem: '#B48CFF', gem2: '#5CE1FF', banner: '#6A3FA0', banner2: '#F2C14E',
            flora: 'sapling', lantern: true, fill: '#EADFD0', grade: [1.04, 1.0, 0.95],
            floorMat: floorMat([0.7, 0.22, 0.2, 0.17]), lights: torches('#FFC880', 0.9),
        },
        {
            name: 'Lava Forge', time: 'dusk', floor: 'lava', floorSeed: 4503, wallStyle: 'forge', wallHeight: 3.25,
            sun: { azimuth: 62, elevation: 7, color: '#FF9A5C', intensity: 2.0 },
            sky: { zenith: '#3B3A6A', horizon: '#FF8A4C', ground: '#4A3A36' },
            lamp: { on: true, color: '#FFB868', intensity: 14 },
            walls: '#A69AA0', accent: { wall: 'east', color: '#7A6A70' }, trim: '#4A4046', ceiling: '#6A5E62', beam: '#3A3034',
            pillar: '#857880', ceilTex: 'brick',
            couch: '#4A5262', pillow: '#FF7A2E', couchWood: '#5A4636', chair: '#8E2F22', table: '#5A4636',
            planter: '#4A4046', petbed: '#8E2F22', cat: '#5A5A5A',
            door: { wall: 'west', at: 6, color: '#5A4636' },
            torch: '#FF8A2E', gem: '#FF6A1F', gem2: '#FFD23F', banner: '#8E1F1F', banner2: '#FFB03A',
            seat: 'stool', flora: 'mushroom', rack: 'weapons', outside: 'volcano', seam: 'lava',
            ambient: 0.95, exposure: 1.24, fill: '#E4D2C8', grade: [1.08, 0.98, 0.9], fog: { color: '#3A2420', density: 0.008 },
            floorMat: floorMat([0.7, 0.22, 0.2, 0.18]),
            lights: [{ pos: [14.1, 1.2, 6], color: '#FF6A1F', intensity: 12, distance: 10 }, { pos: [0.9, 3.1, 6], color: '#FFA050', intensity: 10, distance: 9 }, { pos: [7.5, 3.1, 11.1], color: '#FFA050', intensity: 8, distance: 9 }, { pos: [4.5, 3.1, 0.9], color: '#FFA050', intensity: 7, distance: 8 }],
        },
        {
            name: 'Crystal Crypt', time: 'night', floor: 'slate', floorSeed: 4609, wallStyle: 'crystal', wallHeight: 4.8,
            sun: { azimuth: 18, elevation: 34, color: '#9FB7FF', intensity: 1.4 },
            sky: { zenith: '#0B1030', horizon: '#2A2F6A', ground: '#151A30' },
            lamp: { on: true, color: '#FFD09A', intensity: 13 },
            walls: '#9AA2C8', accent: { wall: 'south', color: '#7880AA' }, trim: '#444A70', ceiling: '#666C96', beam: '#2E3250',
            pillar: '#6E76A2', ceilTex: 'brick',
            couch: '#3A7FA8', pillow: '#C77DFF', couchWood: '#4A5078', chair: '#7B4FBF', table: '#4A5078',
            planter: '#3A4064', petbed: '#7B4FBF', cat: '#D8D8E8', cap: '#5B3FA8',
            door: { wall: 'west', at: 6, color: '#4A5078' },
            torch: '#FFB65A', gem: '#5CF2FF', gem2: '#C77DFF', banner: '#3A4FA8', banner2: '#5CF2FF',
            seat: 'throne', flora: 'mushroom', glowcap: true, rack: 'weapons', lantern: true, outside: 'falls', seam: 'crystal',
            ambient: 1.05, exposure: 1.26, fill: '#C2CCF2', grade: [0.95, 0.98, 1.1], bloom: [0.32, 0.55, 0.9], fog: { color: '#1A2040', density: 0.007 },
            floorMat: floorMat([0.7, 0.2, 0.2, 0.2]),
            lights: [{ pos: [7.5, 1.4, 11.1], color: '#5CF2FF', intensity: 12, distance: 10 }, { pos: [0.9, 3.1, 6], color: '#FFB878', intensity: 10, distance: 9 }, { pos: [14.1, 3.1, 6], color: '#C77DFF', intensity: 9, distance: 9 }, { pos: [4.5, 3.1, 0.9], color: '#FFB878', intensity: 7, distance: 8 }],
        },
    ].map((t) => Object.assign({}, base, t));

    // ---- Furniture ---------------------------------------------------------------------------

    // A bench sofa: plank seat and back on four square legs, block arms, wool cushion blocks
    function couch(lw, ld, th) {
        const P = [];
        const wood = blk(th.couchWood), dark = blk(sh(th.couchWood, 0.8));
        const zb = -ld / 2, sd = (ld - U) / 2;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(post(sx * (lw / 2 - 0.1875), 0.125, sz * (ld / 2 - 0.1875), 0.25, 0.25, dark));
        P.push(B([0, 0.375, -sd / 2], [lw - U, 0.25, sd], blk(sh(th.couchWood, 0.9))));
        P.push(B([0, 0.375, sd / 2], [lw - U, 0.25, sd], wood));
        P.push(B([0, 1, zb + 0.1875], [lw - 0.625, 1, 0.25], wood));
        P.push(B([0, 1.5625, zb + 0.1875], [lw - 0.25, 0.125, 0.375], dark));
        for (const sx of [-1, 1]) {
            P.push(B([sx * (lw / 2 - 0.1875), 0.875, 0], [0.25, 0.75, ld - U], wood));
            P.push(B([sx * (lw / 2 - 0.1875), 1.3125, 0], [0.375, 0.125, ld], dark));
        }
        const n = Math.max(1, Math.round(lw)), inner = lw - 0.625, cw = inner / n;
        for (let i = 0; i < n; i++) {
            const x = -inner / 2 + cw * (i + 0.5), wool = i % 2 ? sh(th.couch, 0.9) : th.couch;
            P.push(B([x, 0.625, 0.125], [cw, 0.25, ld - 0.375], blk(wool)));
            P.push(B([x, 1.125, zb + 0.375], [cw, 0.625, 0.125], blk(sh(wool, 0.92))));
        }
        P.push(B([lw / 2 - 0.5625, 0.9375, zb + 0.625], [0.375, 0.375, 0.25], blk(th.pillow)));
        return P;
    }

    // A thick slab of four boards on four square posts, set with a candle, a mug, a treasure
    // block and a book
    function table(lw, ld, th) {
        const P = [];
        const wood = th.table, leg = blk(sh(wood, 0.78));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(post(sx * (lw / 2 - 0.3125), 0.375, sz * (ld / 2 - 0.3125), 0.25, 0.75, leg));
        P.push(B([0, 0.6875, 0], [lw - 0.625, 0.125, ld - 0.625], leg));
        const bd = (ld - 0.25) / 4;
        for (let i = 0; i < 4; i++) P.push(B([0, 0.875, -(ld - 0.25) / 2 + bd * (i + 0.5)], [lw - 0.25, 0.25, bd], blk(i % 2 ? sh(wood, 0.9) : wood)));
        const y0 = 1;
        P.push(B([0, y0 + 0.03125, 0], [0.25, 0.0625, 0.25], blk('#8A8F98')));
        P.push(B([0, y0 + 0.1875, 0], [0.125, 0.25, 0.125], blk(CREAM)));
        P.push(B([0, y0 + 0.375, 0], [0.0625, 0.125, 0.0625], lit(th.torch, 2.2), { tag: 'flicker', noShadow: true }));
        const mx = -lw / 4, mz = ld / 8;
        P.push(B([mx, y0 + 0.125, mz], [0.1875, 0.25, 0.1875], blk('#7A552E')));
        P.push(B([mx, y0 + 0.265625, mz], [0.125, 0.03125, 0.125], blk('#F6F1E4')));
        P.push(B([mx - 0.125, y0 + 0.125, mz], [0.0625, 0.125, 0.0625], blk('#7A552E')));
        const tx = lw / 4 - 0.0625, tz = -ld / 4 + 0.0625;
        P.push(B([tx, y0 + 0.125, tz], [0.25, 0.25, 0.25], blk(GOLD)));
        P.push(B([tx, y0 + 0.28125, tz], [0.125, 0.0625, 0.125], lit(th.gem, 1.6), { tag: 'pulse', noShadow: true }));
        P.push(B([lw / 4 - 0.125, y0 + 0.0625, ld / 4], [0.375, 0.125, 0.25], blk(th.banner)));
        P.push(B([lw / 4 - 0.109375, y0 + 0.0625, ld / 4], [0.375, 0.0625, 0.21875], blk(CREAM)));
        return P;
    }

    // A block chair: four legs, a seat board and a wool pad. A stool has rungs and no back, a
    // throne has a tall slab back, arm rests and a gold crest with a gem.
    function chair(lw, ld, th) {
        const P = [];
        const wood = blk(th.couchWood), dark = blk(sh(th.couchWood, 0.8)), pad = blk(th.chair);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(B([sx * 0.25, 0.375, sz * 0.25], [0.125, 0.75, 0.125], dark));
        P.push(B([0, 0.8125, 0], [0.75, 0.125, 0.75], wood));
        P.push(B([0, 0.9375, 0], [0.625, 0.125, 0.625], pad));
        if (th.seat === 'stool') {
            for (const sz of [-1, 1]) P.push(B([0, 0.3125, sz * 0.25], [0.375, 0.125, 0.0625], wood));
            for (const sx of [-1, 1]) P.push(B([sx * 0.25, 0.4375, 0], [0.0625, 0.125, 0.375], wood));
            return P;
        }
        const throne = th.seat === 'throne', top = throne ? 2.125 : 1.75, zb = -0.3125;
        if (throne) {
            P.push(B([0, (0.875 + top) / 2, zb], [0.75, top - 0.875, 0.125], wood));
            P.push(B([0, 1.5, zb + 0.09375], [0.5, 0.875, 0.0625], pad));
            P.push(B([0, top + 0.125, zb], [0.25, 0.25, 0.125], blk(GOLD)));
            for (const sx of [-1, 1]) {
                P.push(B([sx * 0.3125, top + 0.0625, zb], [0.125, 0.125, 0.125], blk(GOLD)));
                P.push(B([sx * 0.3125, 1.1875, 0.0625], [0.125, 0.125, 0.625], wood));
                P.push(B([sx * 0.3125, 1, 0.3125], [0.125, 0.25, 0.125], dark));
            }
            P.push(B([0, top + 0.125, zb + 0.07], [0.125, 0.125, 0.03], lit(th.gem, 1.6), { tag: 'pulse', noShadow: true }));
        } else {
            for (const sx of [-1, 1]) P.push(B([sx * 0.3125, (0.875 + top) / 2, zb], [0.125, top - 0.875, 0.125], dark));
            P.push(B([0, 1.375, zb], [0.5, 0.5, 0.0625], pad));
            P.push(B([0, top + 0.0625, zb], [0.75, 0.125, 0.125], wood));
        }
        return P;
    }

    // A clay pot block holding a bush of leaf cubes, a sapling, or (in the dark rooms) a mushroom
    function plant(lw, ld, th, seed) {
        const P = [];
        const rnd = scrambled(seed || 1);
        P.push(B([0, 0.25, 0], [0.625, 0.5, 0.625], blk(th.planter)));
        P.push(B([0, 0.5625, 0], [0.75, 0.125, 0.75], blk(sh(th.planter, 1.15))));
        P.push(B([0, 0.65625, 0], [0.5, 0.0625, 0.5], blk('#8A6648'), { texture: 'voxel:dirt', texRepeat: [0.5, 0.5] }));
        const g = [th.leaf, sh(th.leaf, 0.82), sh(th.leaf, 1.16)];
        if (th.flora === 'mushroom') {
            const cap = th.cap, shine = !!th.glowcap;
            const spot = shine ? lit(th.gem, 1.5) : blk('#FFFFFF');
            const dot = (pos, size) => P.push(B(pos, size, spot, shine ? { tag: 'pulse', noShadow: true } : undefined));
            P.push(B([0, 1, 0], [0.25, 0.625, 0.25], blk('#EDE3CC')));
            P.push(B([0, 1.28125, 0], [0.75, 0.0625, 0.75], blk('#D9CDB0')));
            P.push(B([0, 1.4375, 0], [0.875, 0.25, 0.875], blk(cap)));
            P.push(B([0, 1.625, 0], [0.625, 0.125, 0.625], blk(sh(cap, 1.15))));
            for (const s of [-1, 1]) {
                const a = snap((rnd() - 0.5) * 0.5), b = snap((rnd() - 0.5) * 0.5);
                dot([s * 0.44, 1.4375, a], [0.03, 0.125, 0.125]);
                dot([b, 1.4375, s * 0.44], [0.125, 0.125, 0.03]);
                dot([s * 0.125, 1.7, snap((rnd() - 0.5) * 0.3)], [0.125, 0.03, 0.125]);
            }
            P.push(B([0.25, 0.78125, 0.1875], [0.125, 0.1875, 0.125], blk('#EDE3CC')));
            P.push(B([0.25, 0.9375, 0.1875], [0.3125, 0.125, 0.3125], blk(cap)));
        } else if (th.flora === 'sapling') {
            P.push(B([0, 1.0625, 0], [0.125, 0.75, 0.125], blk('#6B4A2B')));
            P.push(B([0, 1.625, 0], [0.875, 0.375, 0.875], blk(g[0])));
            P.push(B([0, 1.9375, 0], [0.625, 0.25, 0.625], blk(g[2])));
            P.push(B([0, 2.1875, 0], [0.375, 0.25, 0.375], blk(g[1])));
            // leaf cubes hang under three corners of the crown, and fruit between them
            const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]], sides = [[0, -1], [1, 0], [0, 1], [-1, 0]];
            const start = Math.floor(rnd() * 4);
            for (let i = 0; i < 3; i++) {
                const [sx, sz] = corners[(start + i) % 4];
                P.push(B([sx * 0.3125, 1.3125, sz * 0.3125], [0.25, 0.25, 0.25], blk(g[1 + (i % 2)])));
            }
            for (let i = 0; i < 2; i++) {
                const [sx, sz] = sides[(start + i * 2 + 1) % 4];
                P.push(B([sx * 0.3125, 1.375, sz * 0.3125], [0.125, 0.125, 0.125], blk(th.pillow)));
            }
        } else {
            P.push(B([0, 1, 0], [0.75, 0.625, 0.75], blk(g[0])));
            P.push(B([0, 1.5, 0], [0.5, 0.375, 0.5], blk(g[2])));
            // smaller cubes round the sides, each nudged a hair off the grid so that no two
            // faces ever lie in the same plane, and a few berries
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2 + rnd() * 0.4, s = rnd() < 0.5 ? 0.25 : 0.375, e = 0.03125 + i * 0.006;
                P.push(B([snap(Math.cos(a) * 0.3125) + e, snap(0.9 + rnd() * 0.5) + e, snap(Math.sin(a) * 0.3125) + e], [s, s, s], blk(g[(i + 1) % 3])));
            }
            for (const s of [-1, 1]) P.push(B([s * 0.39, snap(0.875 + rnd() * 0.375) + 0.017, snap((rnd() - 0.5) * 0.5) + 0.017], [0.125, 0.125, 0.125], blk(th.pillow)));
            P.push(B([snap((rnd() - 0.5) * 0.5) + 0.021, snap(0.875 + rnd() * 0.375) + 0.021, 0.39], [0.125, 0.125, 0.125], blk(th.pillow)));
        }
        return P;
    }

    // A wool bed: a plank base, a pale mattress and a raised rim of wool blocks, with the cat in it
    function petbed(lw, ld, th) {
        const rim = blk(th.petbed), low = blk(sh(th.petbed, 0.85));
        const hx = lw / 2 - U, hz = ld / 2 - U;
        return [
            B([0, 0.0625, 0], [lw - U, 0.125, ld - U], blk(th.couchWood)),
            B([0, 0.1875, 0], [lw - 0.375, 0.125, ld - 0.375], blk('#EFE6D2')),
            B([0, 0.3125, -hz], [lw - U, 0.375, 0.125], rim),
            B([0, 0.25, hz], [lw - U, 0.25, 0.125], low),
            B([-hx, 0.28125, 0], [0.125, 0.3125, ld - 0.375], low),
            B([hx, 0.28125, 0], [0.125, 0.3125, ld - 0.375], low),
            B([-hx, 0.5625, -hz], [0.1875, 0.125, 0.1875], blk(th.pillow)),
            B([hx, 0.5625, -hz], [0.1875, 0.125, 0.1875], blk(th.pillow)),
            B([0, 0.25, hz + 0.07], [0.375, 0.125, 0.03], blk(GOLD)),
        ].concat(s3Cat(th, 0.03));
    }

    // Interior walls, one tile each: brick pillars, a log palisade, barrels and crates,
    // bookshelves, forge blocks with a lava window, and dark columns studded with crystal
    function wall(obs, th) {
        const P = [];
        const lw = obs.w, ld = obs.h;
        const rnd = tileRand(obs.col, obs.row);
        const trim = blk(th.trim);
        const course = (y, h, mat) => P.push(B([0, y, 0], [lw + 0.0625, h, ld + 0.0625], mat));
        // a full-height stack of textured blocks, stopping under the capping course so their tops never meet
        const stack = (mat, key) => P.push(B([0, (H - 0.25) / 2, 0], [lw, H - 0.25, ld], mat, { texture: 'voxel:' + key, texRepeat: [lw, H - 0.25] }));
        // a glowing block set through the wall so a small square of it shows on every side
        const inset = (y, s, mat, tag) => {
            P.push(B([0, y, 0], [lw + 0.0625, s, s], mat, { tag, noShadow: true }));
            P.push(B([0, y, 0], [s, s, ld + 0.0625], mat, { tag, noShadow: true }));
        };
        switch (th.wallStyle) {
            case 'palisade': {
                const hs = [2.5, 2.25, 2.375, 2.125], o = Math.floor(rnd() * 4);
                let k = 0;
                for (const sx of [-1, 1]) {
                    for (const sz of [-1, 1]) {
                        const h = hs[(k + o) % 4];
                        P.push(B([sx * lw / 4, h / 2, sz * ld / 4], [lw / 2, h, ld / 2], blk(k % 2 ? sh(th.log, 0.9) : th.log), { texture: 'voxel:bark', texRepeat: [0.5, h] }));
                        k++;
                    }
                }
                course(1.625, 0.125, blk('#D9C290'));
                if (rnd() > 0.5) P.push(B([-lw / 4, hs[o] + 0.0625, -ld / 4], [0.375, 0.125, 0.375], blk(th.leaf)));
                break;
            }
            case 'barrels': {
                if (rnd() < 0.5) {
                    P.push(B([0, 0.5, 0], [lw - U, 1, ld - U], blk('#FFFFFF'), { texture: 'voxel:barrel', tag: 'crate' }));
                    P.push(B([0, 1.5, 0], [lw - 0.25, 1, ld - 0.25], blk('#FFFFFF'), { texture: 'voxel:barrel', tag: 'crate' }));
                } else {
                    P.push(B([0, 0.5, 0], [lw - U, 1, ld - U], blk('#C69A5E'), { texture: 'voxel:crate', tag: 'crate' }));
                    P.push(B([0, 1.4375, 0], [lw - 0.25, 0.875, ld - 0.25], blk('#B58A52'), { texture: 'voxel:crate', tag: 'crate' }));
                }
                if (rnd() < 0.55) P.push(B([0, 2.25, 0], [0.5, 0.5, 0.5], blk(TOPPERS[Math.floor(rnd() * TOPPERS.length)])));
                break;
            }
            case 'bookshelf': {
                const rune = rnd() < 0.4;
                stack(blk('#FFFFFF'), 'shelf');
                course(0.125, 0.25, trim);
                course(H - 0.125, 0.25, trim);
                if (rune) inset(1.5 + Math.floor(rnd() * 3), 0.25, lit(th.gem, 1.5), 'pulse');
                break;
            }
            case 'forge': {
                P.push(B([0, 1.375, 0], [lw, 2.75, ld], blk(th.pillar), { texture: 'voxel:brick', texRepeat: [lw, 2.75] }));
                course(0.125, 0.25, trim);
                P.push(B([0, 1, 0], [lw + 0.03, 0.5, 0.5], blk('#FFFFFF'), { texture: 'voxel:lava', texRepeat: [0.5, 0.5], tag: 'flicker', noShadow: true }));
                P.push(B([0, 1, 0], [0.5, 0.5, ld + 0.03], blk('#FFFFFF'), { texture: 'voxel:lava', texRepeat: [0.5, 0.5], tag: 'flicker', noShadow: true }));
                course(2.875, 0.25, trim);
                P.push(B([0, 3.125, 0], [0.5, 0.25, 0.5], blk(sh(th.trim, 0.8))));
                break;
            }
            case 'crystal': {
                stack(blk(th.pillar), 'cobble');
                course(0.125, 0.25, trim);
                course(H - 0.125, 0.25, trim);
                for (let i = 0; i < 3; i++) {
                    const y = 0.75 + i * 1.25 + Math.floor(rnd() * 3) * U, off = (Math.floor(rnd() * 3) - 1) * 0.25, s = rnd() < 0.5 ? 0.25 : 0.375;
                    const mat = lit(rnd() < 0.5 ? th.gem : th.gem2, 1.5);
                    P.push(i % 2 ? B([off, y, 0], [s, s, ld + 0.1875], mat, { tag: 'pulse', noShadow: true }) : B([0, y, off], [lw + 0.1875, s, s], mat, { tag: 'pulse', noShadow: true }));
                }
                break;
            }
            default: {
                const lantern = rnd() < 0.3;
                stack(blk(th.pillar), 'brick');
                course(0.125, 0.25, trim);
                course(H - 0.125, 0.25, trim);
                if (lantern) inset(2.25, 0.25, lit(th.torch, 1.8), 'flicker');
            }
        }
        return P;
    }

    // The charging dock: a square stone pad with a ring of glowing rune cubes round the edge and
    // a short obelisk at the back with a gem on top. The middle is left flat for the vacuum.
    function dock(th) {
        const P = [];
        const rune = lit(th.gem, 1.4), stone = blk(th.trim);
        P.push(B([0, 0.025, 0], [0.9375, 0.05, 0.9375], blk(th.walls), { texture: 'voxel:cobble' }));
        for (const s of [-1, 1]) {
            for (const k of [-0.1875, 0, 0.1875]) {
                P.push(B([k, 0.06, s * 0.3125], [0.125, 0.02, 0.0625], rune, { tag: 'dockRing', noShadow: true }));
                P.push(B([s * 0.3125, 0.06, k], [0.0625, 0.02, 0.125], rune, { tag: 'dockRing', noShadow: true }));
            }
            for (const t of [-1, 1]) P.push(B([s * 0.3125, 0.06, t * 0.3125], [0.0625, 0.02, 0.0625], rune, { tag: 'dockRing', noShadow: true }));
        }
        const zb = -0.40625;
        P.push(B([0, 0.175, zb], [0.375, 0.25, 0.1875], stone));
        P.push(B([0, 0.675, zb], [0.25, 0.75, 0.125], blk(sh(th.walls, 0.8))));
        P.push(B([0, 1.1125, zb], [0.125, 0.125, 0.125], stone));
        P.push(B([0, 1.26875, zb], [0.1875, 0.1875, 0.1875], lit(th.gem2, 2), { tag: 'blink', rot: [0, Math.PI / 4, 0], noShadow: true }));
        P.push(B([0, 0.675, zb + 0.065], [0.125, 0.375, 0.02], rune, { tag: 'dockRing', noShadow: true }));
        return P;
    }

    // ---- The room ---------------------------------------------------------------------------

    // Which tiles of a level hold something, so the things on the walls can keep clear of them
    function occupancy(levelIndex) {
        const lv = typeof LEVELS !== 'undefined' ? LEVELS[levelIndex] : null;
        const occ = new Map();
        if (!lv) return occ;
        for (const o of lv.obstacles || []) for (let r = 0; r < o.h; r++) for (let c = 0; c < o.w; c++) occ.set(`${o.col + c},${o.row + r}`, o.type);
        if (lv.charger) occ.set(`${lv.charger.col},${lv.charger.row}`, 'dock');
        return occ;
    }

    function architecture(levelIndex, th) {
        const main = blk(th.walls), acc = blk(th.accent.color), ceil = blk(th.ceiling);
        const P = s3Shell(th, { mat: (wl) => (wl === th.accent.wall ? acc : main), wallTex: 'voxel:' + th.wallTex, rep: [1, 5], ceilMat: ceil, ceilTex: 'voxel:' + th.ceilTex });
        // the accent wall is built from a second kind of block, and the ceiling gets one picture a tile
        for (const p of P) {
            if (p.mat === acc) p.texture = 'voxel:' + th.accentTex;
            if (p.mat === ceil) p.texRepeat = [16, 13];
        }
        const stone = blk(th.trim), wood = blk(th.beam), plank = blk(th.couchWood), iron = blk(IRON), gold = blk(GOLD);
        const mid = (W.x0 + W.x1) / 2, span = W.x1 - W.x0, wh = W.top - W.sill;
        const door = th.door, aw = th.accent.wall;
        const put = (wl, along, y, inset, size, mat, extra) => {
            const q = s3WallPoint(wl, along, y, inset);
            P.push(B(q.pos, size, mat, Object.assign({ rot: [0, q.yaw, 0] }, extra)));
        };
        // Is the floor beside a stretch of wall free? Things hung high only mind tall walls.
        const occ = occupancy(levelIndex), tall = (th.wallHeight || H) > 2.6;
        const clear = (wl, along, half, high) => {
            for (let a = Math.floor(along - half); a <= Math.floor(along + half - 0.001); a++) {
                const what = occ.get(wl === 'north' ? `${a},0` : wl === 'south' ? `${a},${ROWS - 1}` : wl === 'west' ? `0,${a}` : `${COLS - 1},${a}`);
                if (what && (high ? what === 'wall' && tall : true)) return false;
            }
            return true;
        };
        const spot = (wl, places, half, high) => { const a = places.find((x) => clear(wl, x, half, high)); return a === undefined ? places[0] : a; };

        // Square beams under the ceiling, a course of blocks at the foot of every wall and another near the top
        for (const z of [2, 6, 10]) P.push(B([COLS / 2, H - 0.1875, z], [COLS, 0.375, 0.375], wood));
        for (const x of [3.75, 11.25]) P.push(B([x, H - 0.125, ROWS / 2], [0.375, 0.25, ROWS], wood));
        for (const wl of WALLS) {
            const len = s3WallLength(wl);
            put(wl, len / 2, 0.125, 0.0625, [len, 0.25, 0.125], stone);
            put(wl, len / 2, H - 0.3125, 0.0625, [len, 0.25, 0.125], stone);
        }

        // Window: a chunky plank frame, iron bars, plank shutter boards across the top half, and the pane
        P.push(B([mid, W.sill - 0.0625, 0.0625], [span + 0.5, 0.25, 0.375], plank));
        P.push(B([mid, W.top + 0.0625, 0], [span + 0.5, 0.25, 0.25], plank));
        for (const x of [W.x0 - 0.0625, W.x1 + 0.0625]) P.push(B([x, (W.sill + W.top) / 2, 0], [0.25, wh, 0.25], plank));
        for (const i of [1, 2]) P.push(B([W.x0 + (span * i) / 3, (W.sill + W.top) / 2, -0.125], [0.125, wh, 0.125], iron));
        P.push(B([mid, W.sill + wh * 0.62, -0.125], [span, 0.125, 0.125], iron));
        for (let i = 0; i < 7; i++) P.push(B([mid, W.top - 0.2 - i * 0.2, -0.03], [span - 0.25, 0.0625, 0.25], blk(sh(th.couchWood, 1.1)), { rot: [0.6, 0, 0], tag: 'slat' }));
        P.push(s3WindowGlass(th.glass || '#CFE8F0', 0.18));

        // Door: vertical boards, two iron bands and a block handle, in a frame of stone blocks
        const dw = 2, dh = 4;
        put(door.wall, door.at, dh / 2, 0.1, [dw, dh, 0.125], blk(door.color), { texture: 'voxel:boards', texRepeat: [2, 4], tag: 'door' });
        for (const s of [-1, 1]) put(door.wall, door.at + s * (dw / 2 + 0.125), dh / 2, 0.09375, [0.25, dh, 0.1875], stone);
        put(door.wall, door.at, dh + 0.125, 0.09375, [dw + 0.5, 0.25, 0.1875], stone);
        for (const y of [0.875, 3.125]) put(door.wall, door.at, y, 0.17, [dw, 0.25, 0.03], iron);
        put(door.wall, door.at + 0.625, 2, 0.21, [0.125, 0.25, 0.125], gold);

        // Chandelier: a square ring of beams on a chain, with eight torches burning round it
        const lx = S3_LAMP.x, lz = S3_LAMP.z, ly = H - 1.375;
        P.push(B([lx, (ly + 0.0625 + H - 0.375) / 2, lz], [0.125, H - 0.4375 - ly, 0.125], iron));
        for (const s of [-1, 1]) {
            P.push(B([lx, ly, lz + s * 0.75], [1.75, 0.25, 0.25], plank));
            P.push(B([lx + s * 0.75, ly, lz], [0.25, 0.25, 1.25], plank));
        }
        P.push(B([lx, ly, lz], [1.25, 0.125, 0.125], wood));
        P.push(B([lx, ly, lz], [0.125, 0.125, 1.25], wood));
        const bulb = lit(th.lamp.on ? th.torch : '#8A6A4A', 2.2), tip = lit(EMBER, 2.4);
        // two torches on each outer face of the ring, where they show from the floor
        for (const [dx, dz] of [[-0.4375, -0.96875], [0.4375, -0.96875], [-0.4375, 0.96875], [0.4375, 0.96875], [-0.96875, -0.4375], [-0.96875, 0.4375], [0.96875, -0.4375], [0.96875, 0.4375]]) {
            P.push(B([lx + dx, ly + 0.125, lz + dz], [0.1875, 0.3125, 0.1875], bulb, { tag: 'bulb', noShadow: true }));
            P.push(B([lx + dx, ly + 0.34375, lz + dz], [0.125, 0.125, 0.125], tip, { tag: 'flicker', noShadow: true }));
        }

        // Torches (or lanterns) all round the walls, kept off the door and out of the window
        const torchAt = { north: [1.5, 5.5, 9.5], south: [1.5, 5.5, 9.5, 13.5], west: [2, 6, 10], east: [2, 6, 10] };
        let lights = 0;
        for (const wl of WALLS) {
            for (const a of torchAt[wl]) {
                if (wl === door.wall && Math.abs(a - door.at) < 1.6) continue;
                if (!clear(wl, a, 0.2, true)) continue;
                // each flame gets a slightly different glow so the torches do not flicker as one
                const flame = lit(th.torch, 1.9 + (lights++ % 4) * 0.1);
                if (th.lantern) {
                    put(wl, a, 3.3125, 0.125, [0.3125, 0.0625, 0.25], iron);
                    put(wl, a, 3.125, 0.125, [0.1875, 0.3125, 0.1875], flame, { tag: 'flicker', noShadow: true });
                    put(wl, a, 2.9375, 0.125, [0.3125, 0.0625, 0.25], iron);
                } else {
                    put(wl, a, 2.75, 0.0625, [0.125, 0.5, 0.125], wood);
                    put(wl, a, 3.125, 0.1, [0.1875, 0.25, 0.1875], flame, { tag: 'flicker', noShadow: true });
                    put(wl, a, 3.3125, 0.1, [0.125, 0.125, 0.125], lit(EMBER, 2.3), { noShadow: true });
                }
            }
        }

        // Two banners: a pole, a cloth with two tails, a stripe, and an emblem in pixel blocks
        const banner = (wl, along, emblem) => {
            const cloth = blk(th.banner), mark = blk(th.banner2);
            put(wl, along, 4.25, 0.0625, [1.25, 0.125, 0.125], wood);
            put(wl, along, 3.25, 0.03125, [1, 1.875, 0.0625], cloth);
            for (const s of [-1, 1]) put(wl, along + s * 0.3125, 2.1875, 0.03125, [0.375, 0.25, 0.0625], cloth);
            put(wl, along, 4, 0.05, [0.875, 0.125, 0.06], mark);
            for (const [dx, dy, w, h] of emblem) put(wl, along + dx, 3.125 + dy, 0.05, [w, h, 0.06], mark);
        };
        const SWORD = [[0, 0.1875, 0.125, 0.75], [0, -0.25, 0.5, 0.125], [0, -0.4375, 0.125, 0.25]];
        const DIAMOND = [[0, 0, 0.625, 0.125], [0, 0, 0.375, 0.375], [0, 0, 0.125, 0.625]];
        const side = WALLS.find((wl) => wl !== 'north' && wl !== door.wall && wl !== aw) || 'east';
        banner('north', spot('north', [7.5, 3.5], 0.5, true), SWORD);
        banner(side, spot(side, s3WallLength(side) === COLS ? [7.5, 11.5, 3.5] : [4, 8], 0.5, true), DIAMOND);

        // Three blocks of glowing ore set in the north wall, each in the place of one wall block
        const bw = W.x0 / Math.max(1, Math.round(W.x0));
        for (const [n, row] of [[2, 1], [4, 0], [8, 2]]) {
            const a = (n + 0.5) * bw;
            if (clear('north', a, 0.4, true)) put('north', a, 0.48 + row * 0.96, 0.03, [bw, 0.96, 0.06], blk('#FFFFFF'), { texture: 'voxel:ore', tag: 'pulse', noShadow: true });
        }

        // A chest on a stone ledge on the accent wall, above where the vacuum passes
        const ca = spot(aw, s3WallLength(aw) === COLS ? [12.5, 6.5, 8.5, 1.5] : [8.5, 3.5, 10.5, 1.5], 0.5, false);
        put(aw, ca, 0.4375, 0.09375, [0.75, 0.125, 0.1875], stone);
        put(aw, ca, 0.5625, 0.1875, [1, 0.125, 0.375], stone);
        put(aw, ca, 0.875, 0.1875, [0.75, 0.5, 0.3125], plank, { texture: 'voxel:boards', texRepeat: [0.75, 0.5] });
        put(aw, ca, 1.1875, 0.1875, [0.8125, 0.125, 0.375], blk(sh(th.couchWood, 0.8)));
        for (const s of [-1, 1]) put(aw, ca + s * 0.25, 0.9375, 0.1875, [0.125, 0.64, 0.39], iron);
        put(aw, ca, 1.0625, 0.39, [0.125, 0.1875, 0.0625], gold);

        // Beside the door: a ladder against the wall, or a rack with a sword, a shield and an axe
        const south = door.wall === 'south';
        if (th.rack === 'weapons') {
            const a = spot(door.wall, south ? (door.at < 7.5 ? [7.5, 11.5] : [6.5, 2.5]) : [8.75, 3.25], 0.875, true);
            const steel = blk('#C9D1DA');
            put(door.wall, a, 3, 0.03125, [1.75, 0.25, 0.0625], wood);
            put(door.wall, a - 0.5625, 2.375, 0.08, [0.125, 1, 0.04], steel);
            put(door.wall, a - 0.5625, 2.9375, 0.1, [0.375, 0.125, 0.06], gold);
            put(door.wall, a - 0.5625, 3.125, 0.1, [0.125, 0.25, 0.06], iron);
            put(door.wall, a + 0.5625, 2.5, 0.08, [0.125, 1.5, 0.05], plank);
            put(door.wall, a + 0.75, 3, 0.09, [0.25, 0.375, 0.05], steel);
            put(door.wall, a, 2.375, 0.05, [0.625, 0.625, 0.0625], blk(th.banner));
            put(door.wall, a, 2, 0.05, [0.375, 0.125, 0.0625], blk(th.banner));
            put(door.wall, a, 2.375, 0.095, [0.25, 0.25, 0.0625], gold);
        } else {
            const a = spot(door.wall, south ? (door.at < 7.5 ? [7.5, 12.5, 0.5] : [6.5, 2.5, 13.5]) : [8.5, 3.5, 10.5], 0.375, false);
            for (const s of [-1, 1]) put(door.wall, a + s * 0.3125, 1.75, 0.07, [0.125, 3.5, 0.14], wood);
            for (let i = 0; i < 6; i++) put(door.wall, a, 0.4375 + i * 0.5625, 0.0625, [0.5, 0.125, 0.0625], plank);
        }

        // The forge has a seam of lava low on its accent wall; the crypt has crystals growing from it
        if (th.seam === 'lava') {
            const len = s3WallLength(aw);
            put(aw, len / 2, 0.375, 0.03, [len - 0.5, 0.125, 0.06], blk('#FFFFFF'), { texture: 'voxel:lava', texRepeat: [len - 0.5, 0.125], tag: 'flicker', noShadow: true });
        } else if (th.seam === 'crystal') {
            const at = s3WallLength(aw) === COLS ? [3.5, 7.5, 11.5] : [4, 8];
            at.forEach((a, i) => put(aw, a, [3.5, 2, 3.25][i], 0.0625, [0.25, 0.25, 0.125], lit(i % 2 ? th.gem2 : th.gem, 1.5), { tag: 'pulse', noShadow: true }));
        }
        return P;
    }

    // ---- Painting: the floor, the view outside, the block textures ------------------------------

    const rgbOf = (hex) => hexToRgb(hex) || [128, 128, 128];
    const rgba = (hex, a) => { const c = rgbOf(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
    const blend = (a, b, f) => { const x = rgbOf(a), y = rgbOf(b); return rgbToHex(x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f); };

    // The floors: the block colour, and the colours the 2D board needs to tell clean from dirty.
    // Pale floors take a dark film and dark dust, dark floors a bright glaze and pale dust.
    const DARK_DUST = { fluff: [86, 76, 66], crumb: [58, 46, 36], hair: [44, 36, 30] };
    const PALE_DUST = { fluff: [200, 194, 184], crumb: [214, 200, 176], hair: [208, 200, 190] };
    const FLOORS = {
        cobble: { base: '#9A9DA3', floorBase: [142, 145, 151], glaze: [150, 232, 255], glazeAlpha: 0.42, film: [84, 68, 48], filmAlpha: 0.3, dust: DARK_DUST },
        mossbrick: { base: '#8A967E', floorBase: [128, 140, 117], glaze: [190, 255, 170], glazeAlpha: 0.42, film: [78, 62, 44], filmAlpha: 0.3, dust: DARK_DUST },
        planks: { base: '#B88C54', floorBase: [170, 129, 78], glaze: [255, 236, 170], glazeAlpha: 0.45, film: [70, 52, 36], filmAlpha: 0.3, dust: DARK_DUST },
        carpet: { base: '#76553A', carpet: '#A32E33', floorBase: [118, 76, 53], glaze: [255, 214, 140], glazeAlpha: 0.42, film: [150, 140, 128], filmAlpha: 0.22, dust: PALE_DUST },
        lava: { base: '#4E4850', floorBase: [78, 70, 76], glaze: [255, 160, 70], glazeAlpha: 0.42, film: [160, 152, 142], filmAlpha: 0.26, dust: PALE_DUST },
        slate: { base: '#545C7C', floorBase: [81, 89, 120], glaze: [110, 240, 255], glazeAlpha: 0.42, film: [150, 146, 140], filmAlpha: 0.24, dust: PALE_DUST },
    };
    // Ways to split a cobble tile into four stones: [x, y, w, h] on the tile's 16 x 16 grid
    const COBBLES = [
        [[0, 0, 7, 6], [8, 0, 7, 8], [0, 7, 7, 8], [8, 9, 7, 6]],
        [[0, 0, 9, 7], [10, 0, 5, 7], [0, 8, 5, 7], [6, 8, 9, 7]],
        [[0, 0, 6, 8], [7, 0, 8, 5], [7, 6, 8, 9], [0, 9, 6, 6]],
    ];

    // The whole floor, px pixels to a tile. One block per tile with a dark seam round it, drawn
    // on a grid of sixteen art pixels to the tile and rounded so it is crisp at any px.
    function paintFloor(t, th, px) {
        const u = px / 16;
        const rnd = seededRandom(th.floorSeed);
        const pick = (n) => Math.floor(rnd() * n);
        const F = FLOORS[th.floor] || FLOORS.cobble, base = F.base;
        const R = (color, x, y, w, h) => {
            const x0 = Math.round(x * u), y0 = Math.round(y * u);
            t.fillStyle = color;
            t.fillRect(x0, y0, Math.round((x + w) * u) - x0, Math.round((y + h) * u) - y0);
        };
        // a slab: lit along its top and left edges, with a dark seam along the other two
        const slab = (X, Y, k) => {
            R(sh(base, k), X, Y, 16, 16);
            R(sh(base, k * 1.13), X, Y, 16, 1);
            R(sh(base, k * 1.13), X, Y, 1, 16);
            R(sh(base, k * 0.6), X, Y + 15, 16, 1);
            R(sh(base, k * 0.6), X + 15, Y, 1, 16);
        };
        // stones or bricks inside a tile, each with a lit top row and a shaded bottom row
        const stones = (X, Y, k, list) => {
            R(sh(base, 0.56), X, Y, 16, 16);
            R(sh(base, 0.76), X, Y, 15, 15);
            for (const [x, y, w, h] of list) {
                const v = k * (0.94 + rnd() * 0.14);
                R(sh(base, v), X + x, Y + y, w, h);
                R(sh(base, v * 1.12), X + x, Y + y, w, 1);
                R(sh(base, v * 0.86), X + x, Y + y + h - 1, w, 1);
            }
        };
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const X = c * 16, Y = r * 16, k = 0.94 + rnd() * 0.12;
                // the library's runner lies across the two middle rows; the rest of its floor is boards
                const kind = th.floor === 'carpet' && r !== 5 && r !== 6 ? 'planks' : th.floor;
                switch (kind) {
                    case 'mossbrick': {
                        stones(X, Y, k, (c + r) % 2 ? [[0, 0, 15, 7], [0, 8, 7, 7], [8, 8, 7, 7]] : [[0, 0, 7, 7], [8, 0, 7, 7], [0, 8, 15, 7]]);
                        if (rnd() < 0.5) {
                            let x = pick(2) * 12 + 1, y = pick(2) * 12 + 1;
                            for (let i = 0, n = 4 + pick(6); i < n; i++) {
                                R(MOSS[pick(MOSS.length)], X + x, Y + y, 1 + pick(2), 1);
                                x = Math.max(0, Math.min(13, x + pick(3) - 1));
                                y = Math.max(0, Math.min(14, y + pick(3) - 1));
                            }
                        }
                        if (rnd() < 0.16) {
                            const x = 3 + pick(9), y = 4 + pick(8);
                            R('#8FD45A', X + x, Y + y, 1, 3);
                            R('#6FBF45', X + x + 1, Y + y + 1, 1, 2);
                            R('#8FD45A', X + x + 2, Y + y - 1, 1, 4);
                            R('#6FBF45', X + x - 1, Y + y + 2, 1, 1);
                        }
                        break;
                    }
                    case 'planks': {
                        for (let b = 0; b < 4; b++) {
                            const v = k * (0.93 + rnd() * 0.14);
                            R(sh(base, v), X, Y + b * 4, 16, 4);
                            R(sh(base, v * 1.08), X, Y + b * 4, 16, 1);
                            R(sh(base, v * 0.78), X, Y + b * 4 + 3, 16, 1);
                            if (rnd() < 0.7) R(sh(base, v * 0.88), X + 2 + pick(9), Y + b * 4 + 1 + pick(2), 2 + pick(3), 1);
                        }
                        R(sh(base, 1.16), X, Y, 1, 15);
                        R(sh(base, 0.55), X + 15, Y, 1, 16);
                        R(sh(base, 0.55), X, Y + 15, 16, 1);
                        R(sh(base, 0.5), X + 2, Y + 1, 1, 1);
                        R(sh(base, 0.5), X + 13, Y + 9, 1, 1);
                        break;
                    }
                    case 'carpet': {
                        const red = F.carpet;
                        R(sh(red, k), X, Y, 16, 16);
                        R(sh(red, k * 1.14), X, Y, 1, 16);
                        R(sh(red, k * 0.72), X + 15, Y, 1, 16);
                        R(sh(red, 0.55), X, Y + (r === 5 ? 0 : 15), 16, 1);
                        if (r === 5) R(sh(red, k * 0.72), X, Y + 15, 16, 1);
                        R('#E2B64E', X, Y + (r === 5 ? 1 : 13), 16, 2);
                        R(sh(red, 0.66), X + 7, Y + 5, 2, 6);
                        R(sh(red, 0.66), X + 5, Y + 7, 6, 2);
                        R('#E2B64E', X + 7, Y + 7, 2, 2);
                        break;
                    }
                    case 'lava': {
                        slab(X, Y, k);
                        for (let i = 0; i < 4; i++) R(sh(base, k * (rnd() < 0.5 ? 0.84 : 1.14)), X + 2 + pick(11), Y + 2 + pick(12), 1 + pick(2), 1);
                        if (rnd() < 0.24) {
                            let x = 2 + pick(3), y = 3 + pick(10);
                            for (let i = 0, n = 6 + pick(5); i < n && x < 14; i++) {
                                R('#7A2410', X + x, Y + y - 1, 1, 3);
                                R(i % 3 === 1 ? '#FFD23F' : '#FF7A1F', X + x, Y + y, 1, 1);
                                x++;
                                if (rnd() < 0.5) y = Math.max(2, Math.min(13, y + (rnd() < 0.5 ? 1 : -1)));
                            }
                        }
                        break;
                    }
                    case 'slate': {
                        slab(X, Y, k);
                        R(sh(base, k * 0.9), X + 1, Y + 4 + pick(3), 14, 1);
                        R(sh(base, k * 1.08), X + 1, Y + 10 + pick(3), 14, 1);
                        if (rnd() < 0.22) {
                            const vein = [], dir = rnd() < 0.5 ? 1 : -1;
                            let x = 2 + pick(5), y = 3 + pick(9);
                            for (let i = 0, n = 4 + pick(4); i < n && x < 14; i++) {
                                vein.push([x, y]);
                                x++;
                                if (i % 2) y = Math.max(2, Math.min(13, y + dir));
                            }
                            vein.forEach(([vx, vy], i) => R(sh(i % 2 ? th.gem2 : th.gem, 0.42), X + vx, Y + vy - 1, 1, 3));
                            vein.forEach(([vx, vy], i) => R(i % 2 ? th.gem2 : th.gem, X + vx, Y + vy, 1, 1));
                        }
                        break;
                    }
                    default:
                        stones(X, Y, k, COBBLES[pick(COBBLES.length)]);
                }
            }
        }
    }

    // Where the sun or moon hangs in the picture, as fractions of its width and height
    const SKY_SPOT = { morning: [0.5, 0.2], noon: [0.54, 0.12], afternoon: [0.48, 0.22], 'golden hour': [0.5, 0.36], dusk: [0.47, 0.46], night: [0.52, 0.18] };

    // Outside the window: a sky in flat bands, a square sun or moon, square clouds, stepped
    // hills, and either a block castle or a stepped peak with a waterfall (lava at the forge).
    // Everything is drawn on a grid of 8 pixel squares. Seen from the floor through the window,
    // it is mostly the upper half that shows, so the castle and the peak stand tall.
    function paintBackdrop(t, th, w, h) {
        const q = 8, GW = Math.ceil(w / q), GH = Math.ceil(h / q);
        const rnd = seededRandom(th.floorSeed + 5);
        const pick = (n) => Math.floor(rnd() * n);
        const R = (color, x, y, cw, ch) => { t.fillStyle = color; t.fillRect(x * q, y * q, cw * q, ch * q); };
        const night = th.time === 'night', low = th.time === 'dusk' || th.time === 'golden hour';
        const hz = Math.round(GH * 0.8);
        const bands = 12;
        for (let i = 0; i < bands; i++) {
            const y0 = Math.round((hz * i) / bands), y1 = Math.round((hz * (i + 1)) / bands);
            R(blend(th.sky.zenith, th.sky.horizon, Math.pow(i / (bands - 1), 1.5)), 0, y0, GW, y1 - y0);
        }
        if (night) {
            for (let i = 0; i < 110; i++) {
                const s = rnd() < 0.15 ? 2 : 1;
                R(rnd() < 0.3 ? '#BFD0FF' : '#FFFFFF', pick(GW), pick(hz - 20), s, s);
            }
        }
        // the sun or the moon, with two faint squares of glow round it
        const at = SKY_SPOT[th.time] || SKY_SPOT.morning;
        const sx = Math.round(GW * at[0]), sy = Math.round(GH * at[1]), ss = night ? 10 : 12;
        const disc = night ? '#E6ECFF' : low ? '#FFD27A' : '#FFF3B0';
        R(rgba(disc, 0.14), sx - ss / 2 - 4, sy - ss / 2 - 4, ss + 8, ss + 8);
        R(rgba(disc, 0.22), sx - ss / 2 - 2, sy - ss / 2 - 2, ss + 4, ss + 4);
        R(disc, sx - ss / 2, sy - ss / 2, ss, ss);
        if (night) {
            R('#C4CCE8', sx - 3, sy - 3, 3, 2);
            R('#C4CCE8', sx + 1, sy + 1, 2, 3);
            R('#C4CCE8', sx - 4, sy + 2, 2, 1);
        } else R(low ? '#FFE6A8' : '#FFFBE0', sx - ss / 2 + 2, sy - ss / 2 + 2, ss - 4, ss - 4);
        // square clouds
        const cloud = night ? '#2C3566' : th.time === 'dusk' ? '#F2A27E' : th.time === 'golden hour' ? '#FFE2C0' : '#FFFFFF';
        for (let i = 0; i < 10; i++) {
            const cw = 12 + pick(16), cx = pick(GW) - 6, cy = 3 + pick(Math.round(hz * 0.5));
            R(cloud, cx + 3, cy, cw - 8, 2);
            R(cloud, cx, cy + 2, cw, 3);
            R(sh(cloud, night ? 0.75 : 0.86), cx + 1, cy + 5, cw - 3, 1);
        }
        // stepped ridges, far to near
        const rise = (x, baseY, amp, f, ph) => Math.round(baseY - amp * (0.6 * Math.sin(x * f + ph) + 0.4 * Math.sin(x * f * 2.7 + ph * 1.9)));
        const ridge = (baseY, amp, f, ph, step, color, snow) => {
            for (let x = 0; x < GW; x += step) {
                const top = rise(x, baseY, amp, f, ph);
                R(color, x, top, step, GH - top);
                if (snow && top < baseY - amp * 0.45) R(snow, x, top, step, 2);
            }
        };
        const ph = th.floorSeed % 7;
        ridge(hz - 26, 14, 0.043, 1.3 + ph, 4, blend(th.sky.horizon, night ? '#3A4480' : '#6E86B0', 0.55), night ? '#AEB8E6' : '#F4F8FF');
        const hill = blend(th.sky.ground, th.sky.horizon, 0.3);
        ridge(hz - 10, 5, 0.08, 4.1 + ph, 3, hill);
        const leaf = night ? '#24406A' : th.time === 'dusk' ? '#4E5E36' : low ? '#5E8A3A' : '#4E9A3C';
        for (let i = 0; i < 18; i++) {
            const x = 3 + pick(GW - 6), top = rise(Math.floor(x / 3) * 3, hz - 10, 5, 0.08, 4.1 + ph);
            R('#5E4428', x, top - 3, 1, 3);
            R(sh(leaf, 0.82), x - 2, top - 8, 5, 5);
            R(leaf, x - 1, top - 9, 3, 2);
        }
        const cx = Math.round(GW * (0.7 + rnd() * 0.08)), by = hz - 10;
        R(hill, cx - 44, by, 88, 10);
        if (th.outside === 'castle') {
            const stone = night ? '#4A5280' : low ? '#C09A88' : '#C9CED6', shade = sh(stone, 0.78);
            const glass = night || low ? '#FFD27A' : '#3E4A66';
            const tower = (x, top, wd) => {
                R(stone, x, top, wd, by - top);
                R(shade, x + wd - 2, top, 2, by - top);
                for (let i = 0; i < wd; i += 4) R(stone, x + i, top - 2, 2, 2);
                R(glass, x + Math.floor(wd / 2) - 1, top + 5, 2, 3);
            };
            const spire = (x, top) => {
                for (let i = 0; i < 5; i++) R(i % 2 ? sh(th.banner, 0.85) : th.banner, x + i, top - 2 * (i + 1), 10 - 2 * i, 2);
                R('#3A3A44', x + 5, top - 16, 1, 6);
                R(th.banner2, x + 6, top - 16, 4, 2);
                R(th.banner2, x + 6, top - 14, 2, 1);
            };
            R(stone, cx - 28, by - 10, 56, 10);
            R(shade, cx - 28, by - 2, 56, 2);
            for (let i = 0; i < 56; i += 4) R(stone, cx - 28 + i, by - 12, 2, 2);
            tower(cx - 10, by - 24, 20);
            R(glass, cx - 7, by - 16, 2, 3);
            R(glass, cx + 5, by - 16, 2, 3);
            R(sh(stone, 0.45), cx - 3, by - 8, 6, 8);
            R(sh(stone, 0.45), cx - 2, by - 9, 4, 1);
            for (const s of [-1, 1]) {
                tower(cx + s * 18 - 4, by - 34, 8);
                spire(cx + s * 18 - 5, by - 36);
            }
            tower(cx - 4, by - 40, 8);
            spire(cx - 5, by - 42);
        } else {
            const hot = th.outside === 'volcano';
            const rock = night ? '#3E4670' : hot ? '#5A4850' : '#8E98A8';
            const water = hot ? '#FF7A1F' : night ? '#7FB8E8' : '#5FB4F0', foam = hot ? '#FFD23F' : '#E8F6FF';
            // the mountain, two squares at a time: lit on the left, shaded on the right, snow on top
            for (let x = -40; x < 40; x += 2) {
                const lift = 48 * Math.pow(1 - Math.abs(x + 1) / 40, 0.85) + 3 * Math.sin(x * 0.45 + ph);
                const top = Math.min(hot ? 44 : 60, Math.round(lift / 2) * 2);
                if (top <= 0) continue;
                R(x < 0 ? rock : sh(rock, 0.84), cx + x, by - top, 2, top);
                R(sh(rock, 1.16), cx + x, by - top, 2, 1);
                if (!hot && top > 36) R(night ? '#AEB8E6' : '#F4F8FF', cx + x, by - top, 2, Math.min(6, top - 34));
            }
            if (hot) {
                R('#FF7A1F', cx - 6, by - 45, 12, 1);
                R('#FFD23F', cx - 3, by - 45, 6, 1);
                for (let i = 0; i < 3; i++) R(rgba('#40363C', 0.8), cx - 3 + i * 3, by - 51 - i * 5, 5 + i, 4);
            }
            if (night) for (let i = 0; i < 9; i++) R(i % 2 ? th.gem2 : th.gem, cx - 18 + pick(36), by - 6 - pick(22), 1, 2);
            // the fall comes out of a dark mouth half way up and drops to a pool
            R(sh(rock, 0.5), cx + 3, by - 30, 5, 2);
            R(water, cx + 4, by - 28, 3, 31);
            for (let y = by - 28, i = 0; y < by + 2; y += 3, i++) R(foam, cx + 4 + (i % 2) * 2, y, 1, 2);
            R(water, cx - 3, by + 2, 17, 3);
            R(foam, cx + 2, by + 2, 7, 1);
        }
        const ground = th.sky.ground;
        ridge(hz - 2, 3, 0.11, 2.2 + ph, 2, ground);
        R(ground, 0, hz + 2, GW, GH - hz - 2);
        R(sh(ground, 0.88), 0, hz + 8, GW, GH - hz - 8);
    }

    // Block pictures. Each is drawn on a 16 x 16 grid whatever size its canvas is. Pictures
    // that take the part's colour (tint) are painted in light greys.
    const ink = (color) => {
        const c = hexToRgb(color) || [255, 255, 255];
        return (v) => `rgb(${c.map((x) => Math.max(0, Math.min(255, Math.round(x * v)))).join(',')})`;
    };
    const grey = ink('#FFFFFF');
    const art = (draw) => function (t, n, th, color) {
        t.save();
        t.scale(n / 16, n / 16);
        draw((c, x, y, w, h) => { t.fillStyle = c; t.fillRect(x, y, w, h); }, color, th);
        t.restore();
    };
    // Stone laid in courses: each course is [top row, height, the columns where its joints fall]
    const COBBLE = [[0, 4, [0, 5, 10]], [5, 5, [3, 9, 14]], [11, 4, [1, 7, 12]]];
    const BRICKS = [[0, 7, [7]], [8, 7, [15]]];
    function courses(fill, k, rows, seed) {
        const rnd = seededRandom(seed);
        fill(k(0.5), 0, 0, 16, 16);
        for (const [y, h, gaps] of rows) {
            gaps.forEach((g, i) => {
                const end = i + 1 < gaps.length ? gaps[i + 1] : gaps[0] + 16;
                const v = 0.8 + rnd() * 0.18;
                for (let x = g + 1; x < end; x++) {
                    fill(k(v), x % 16, y, 1, h);
                    fill(k(v + 0.1), x % 16, y, 1, 1);
                    fill(k(v - 0.13), x % 16, y + h - 1, 1, 1);
                    if (rnd() < 0.14) fill(k(v - 0.07), x % 16, y + 1 + Math.floor(rnd() * (h - 2)), 1, 1);
                }
            });
        }
    }
    // Four boards with seams, butt joints, a little grain and a nail each; upright for doors
    function boards(fill, k, upright) {
        const rnd = seededRandom(upright ? 41 : 37);
        const dot = (v, x, y, w, h) => (upright ? fill(k(v), y, x, h, w) : fill(k(v), x, y, w, h));
        const joints = [5, 12, 2, 9];
        for (let b = 0; b < 4; b++) {
            const v = 0.84 + rnd() * 0.14, y = b * 4;
            dot(v, 0, y, 16, 4);
            dot(v + 0.07, 0, y, 16, 1);
            dot(0.58, 0, y + 3, 16, 1);
            dot(0.58, joints[b], y, 1, 3);
            for (let i = 0; i < 3; i++) dot(v - 0.09, Math.floor(rnd() * 13), y + 1 + Math.floor(rnd() * 2), 2 + Math.floor(rnd() * 2), 1);
            dot(0.5, (joints[b] + 2) % 16, y + 1, 1, 1);
        }
    }
    const textures = {
        cobble: { size: 16, tint: true, nearest: true, paint: art((fill) => courses(fill, grey, COBBLE, 11)) },
        brick: { size: 16, tint: true, nearest: true, paint: art((fill) => courses(fill, grey, BRICKS, 23)) },
        // stone brick in the wall's own colour with moss growing along the joints
        mossy: {
            size: 16, byColor: true, nearest: true,
            paint: art((fill, color) => {
                courses(fill, ink(color), BRICKS, 23);
                const rnd = seededRandom(29);
                for (let i = 0; i < 26; i++) {
                    const x = Math.floor(rnd() * 16), y = rnd() < 0.6 ? 6 + Math.floor(rnd() * 3) + (rnd() < 0.5 ? 8 : 0) : Math.floor(rnd() * 16);
                    fill(MOSS[Math.floor(rnd() * MOSS.length)], x, y % 16, 1 + Math.floor(rnd() * 2), 1);
                }
            }),
        },
        // oak planks lying flat; tinted dark they are the dark planks of the library and the crypt
        planks: { size: 16, tint: true, nearest: true, paint: art((fill) => boards(fill, grey, false)) },
        boards: { size: 16, tint: true, nearest: true, paint: art((fill) => boards(fill, grey, true)) },
        // two logs side by side, dark at the edges and light down the middle
        bark: {
            size: 16, tint: true, nearest: true,
            paint: art((fill) => {
                const rnd = seededRandom(53);
                [0.62, 0.8, 0.94, 1, 0.9, 0.96, 0.82, 0.64, 0.62, 0.82, 0.96, 0.9, 1, 0.94, 0.8, 0.64].forEach((v, x) => fill(grey(v), x, 0, 1, 16));
                for (let i = 0; i < 9; i++) fill(grey(0.62 + rnd() * 0.14), Math.floor(rnd() * 16), Math.floor(rnd() * 14), 1, 2 + Math.floor(rnd() * 2));
            }),
        },
        dirt: {
            size: 16, tint: true, nearest: true,
            paint: art((fill) => {
                const rnd = seededRandom(61);
                for (let y = 0; y < 16; y++) {
                    for (let x = 0; x < 16; x++) {
                        const r = rnd();
                        fill(grey(r < 0.12 ? 0.62 : r < 0.3 ? 0.78 : r > 0.9 ? 1 : 0.88), x, y, 1, 1);
                    }
                }
            }),
        },
        // a bookshelf block: two rows of book spines in a plank frame
        shelf: {
            size: 16, nearest: true,
            paint: art((fill) => {
                const rnd = seededRandom(71);
                fill('#2B1D12', 0, 0, 16, 16);
                for (const y0 of [1, 9]) {
                    let x = 1;
                    while (x < 15) {
                        const w = rnd() < 0.3 && x < 14 ? 2 : 1, h = 5 + (rnd() < 0.6 ? 1 : 0);
                        fill(BOOKS[Math.floor(rnd() * BOOKS.length)], x, y0 + 6 - h, w, h);
                        if (rnd() < 0.4) fill('#F2D98A', x, y0 + 7 - h, w, 1);
                        x += w;
                    }
                }
                fill('#8A6238', 0, 0, 16, 1);
                fill('#A87A48', 0, 7, 16, 1);
                fill('#5E4124', 0, 8, 16, 1);
                fill('#8A6238', 0, 15, 16, 1);
                fill('#8A6238', 0, 0, 1, 16);
                fill('#5E4124', 15, 0, 1, 16);
            }),
        },
        // the side of a barrel: staves and two iron hoops
        barrel: {
            size: 16, nearest: true,
            paint: art((fill) => {
                const staves = ['#9C6B3A', '#B07C45', '#8A5C30', '#A67440'];
                for (let x = 0; x < 16; x++) fill(x % 4 === 3 ? '#6E4826' : staves[Math.floor(x / 4)], x, 0, 1, 16);
                fill('#6E4826', 0, 0, 16, 1);
                fill('#6E4826', 0, 15, 16, 1);
                for (const y of [2, 12]) {
                    fill('#6C7079', 0, y, 16, 1);
                    fill('#4A4D55', 0, y + 1, 16, 1);
                }
                fill('#3A2616', 7, 7, 2, 2);
            }),
        },
        // a crate: a frame, three boards and a brace
        crate: {
            size: 16, tint: true, nearest: true,
            paint: art((fill) => {
                fill(grey(0.94), 0, 0, 16, 16);
                for (const x of [6, 10]) fill(grey(0.74), x, 2, 1, 12);
                for (let i = 0; i < 12; i++) fill(grey(0.8), 2 + i, 2 + i, 2, 1);
                fill(grey(0.72), 0, 0, 16, 2);
                fill(grey(0.72), 0, 14, 16, 2);
                fill(grey(0.72), 0, 0, 2, 16);
                fill(grey(0.72), 14, 0, 2, 16);
                fill(grey(0.84), 0, 0, 16, 1);
                fill(grey(0.84), 0, 0, 1, 16);
                for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) fill(grey(0.45), x, y, 1, 1);
            }),
        },
        // a block of ore: dark stone in the wall's colour, with grains in the room's gem colour
        // that light themselves
        ore: {
            size: 16, nearest: true, perTheme: true, glow: 1,
            paint: art((fill, color, th) => {
                const rnd = seededRandom(97), k = ink(th.walls);
                fill(k(0.34), 0, 0, 16, 16);
                fill(k(0.52), 1, 1, 14, 14);
                for (let i = 0; i < 20; i++) fill(k(0.44 + rnd() * 0.16), 1 + Math.floor(rnd() * 13), 1 + Math.floor(rnd() * 13), 1 + Math.floor(rnd() * 2), 1 + Math.floor(rnd() * 2));
                for (const [x, y] of [[3, 3], [10, 2], [6, 7], [11, 9], [3, 11]]) {
                    fill(k(0.3), x, y + 1, 3, 2);
                    fill(th.gem, x, y, 2, 2);
                    fill(th.gem, x + 1, y + 1, 2, 1);
                    fill(blend(th.gem, '#FFFFFF', 0.6), x, y, 1, 1);
                }
            }),
        },
        // lava: it lights itself
        lava: {
            size: 16, nearest: true, glow: 1.2,
            paint: art((fill) => {
                const rnd = seededRandom(83);
                fill('#E8590C', 0, 0, 16, 16);
                for (let i = 0; i < 28; i++) {
                    const r = rnd();
                    fill(r < 0.3 ? '#FFC21F' : r < 0.45 ? '#FFE680' : r < 0.8 ? '#F47A16' : '#B5330A', Math.floor(rnd() * 15), Math.floor(rnd() * 16), 1 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 2));
                }
            }),
        },
    };

    // ---- The 2D board ---------------------------------------------------------------------------

    function palette2d(th) {
        const F = FLOORS[th.floor] || FLOORS.cobble;
        return { floorBase: F.floorBase, glaze: F.glaze, glazeAlpha: F.glazeAlpha, film: F.film, filmAlpha: F.filmAlpha, dust: F.dust };
    }

    // Everything on the board is drawn in squares of three screen pixels: sixteen to a tile
    const Q = TILE / 16;
    const cell = (c, color, x, y, w, h) => { c.fillStyle = color; c.fillRect(x * Q, y * Q, w * Q, h * Q); };
    const glow = (c, color, blur) => { c.save(); c.shadowColor = color; c.shadowBlur = blur; };

    // One interior wall tile from above, in the same six kinds as the 3D walls
    function wallTile(c, col, row, th, wallSet) {
        const X = col * 16, Y = row * 16;
        const rnd = tileRand(col, row);
        const p = (color, x, y, w, h) => cell(c, color, X + x, Y + y, w, h);
        const open = (dc, dr) => !wallSet.has(`${col + dc},${row + dr}`);
        let edge = null;
        switch (th.wallStyle) {
            case 'palisade': {
                const log = th.log;
                for (const [x, y] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
                    p(sh(log, 0.6), x, y, 8, 8);
                    p(sh(log, 1.25), x + 1, y + 1, 6, 6);
                    p(sh(log, 1.05), x + 2, y + 2, 4, 4);
                    p(sh(log, 1.25), x + 3, y + 3, 2, 2);
                }
                rnd();
                if (rnd() > 0.5) {
                    p(sh(th.leaf, 0.8), 1, 1, 6, 6);
                    p(th.leaf, 2, 1, 4, 3);
                }
                break;
            }
            case 'barrels': {
                if (rnd() < 0.5) {
                    p('#4A4D55', 1, 1, 14, 14);
                    p('#8A5C30', 2, 2, 12, 12);
                    p('#B07C45', 3, 3, 10, 10);
                    for (const x of [6, 9]) p('#9C6B3A', x, 3, 1, 10);
                    p('#3A2616', 7, 7, 2, 2);
                } else {
                    p('#7A552E', 1, 1, 14, 14);
                    p('#C69A5E', 3, 3, 10, 10);
                    for (const x of [6, 9]) p('#A67C48', x, 3, 1, 10);
                    for (let i = 0; i < 10; i++) p('#8A6238', 3 + i, 3 + i, 1, 1);
                    p('#9C7446', 1, 1, 14, 1);
                }
                if (rnd() < 0.55) {
                    const tone = TOPPERS[Math.floor(rnd() * TOPPERS.length)];
                    p(sh(tone, 0.7), 4, 4, 8, 8);
                    p(tone, 4, 4, 7, 7);
                    p(sh(tone, 1.2), 4, 4, 7, 1);
                }
                break;
            }
            case 'bookshelf': {
                const wood = '#8A6238';
                edge = sh(wood, 0.5);
                p(wood, 0, 0, 16, 16);
                for (const y of [5, 10]) p(sh(wood, 0.82), 0, y, 16, 1);
                p(sh(wood, 1.18), 1, 1, 14, 1);
                // the books show along the sides that face the room
                for (let i = 1; i < 15; i++) {
                    const a = BOOKS[(i * 7 + col * 3 + row * 5) % BOOKS.length], b = BOOKS[(i * 5 + col + row * 3) % BOOKS.length];
                    if (open(0, -1)) p(a, i, 1, 1, 2);
                    if (open(0, 1)) p(a, i, 13, 1, 2);
                    if (open(-1, 0)) p(b, 1, i, 2, 1);
                    if (open(1, 0)) p(b, 13, i, 2, 1);
                }
                if (rnd() < 0.4) {
                    glow(c, th.gem, 8);
                    p(th.gem, 6, 6, 4, 4);
                    c.restore();
                    p('#FFFFFF', 7, 7, 2, 2);
                }
                break;
            }
            case 'forge': {
                const stone = th.pillar;
                edge = sh(stone, 0.5);
                p(stone, 0, 0, 16, 16);
                p(sh(stone, 1.15), 1, 1, 14, 1);
                p(sh(stone, 1.15), 1, 1, 1, 14);
                p(sh(stone, 0.8), 1, 14, 14, 1);
                p(sh(stone, 0.8), 14, 1, 1, 14);
                p(sh(th.trim, 0.8), 3, 3, 10, 10);
                glow(c, '#FF7A1F', 10);
                p('#E8590C', 5, 5, 6, 6);
                c.restore();
                p('#FFC21F', 6, 6, 4, 4);
                p('#FFE680', 7, 7, 2, 2);
                break;
            }
            case 'crystal': {
                const stone = sh(th.pillar, 1.3);
                edge = sh(stone, 0.45);
                p(stone, 0, 0, 16, 16);
                for (let i = 0; i < 6; i++) p(sh(stone, rnd() < 0.5 ? 0.88 : 1.12), 1 + Math.floor(rnd() * 13), 1 + Math.floor(rnd() * 14), 2, 1);
                for (const [x, y, k] of [[3, 3, 0], [10, 5, 1], [5, 10, 1], [11, 11, 0]]) {
                    const tone = k ? th.gem2 : th.gem;
                    glow(c, tone, 8);
                    p(tone, x, y, 3, 3);
                    c.restore();
                    p('#FFFFFF', x, y, 1, 1);
                }
                break;
            }
            default: {
                const stone = th.pillar;
                edge = sh(stone, 0.5);
                p(stone, 0, 0, 16, 16);
                p(sh(stone, 0.72), 8, 0, 1, 16);
                p(sh(stone, 0.72), 0, 8, 16, 1);
                for (const [x, y, w, h] of [[0, 0, 8, 8], [9, 0, 7, 8], [0, 9, 8, 7], [9, 9, 7, 7]]) {
                    p(sh(stone, 1.14), x, y, w, 1);
                    p(sh(stone, 0.88), x, y + h - 1, w, 1);
                }
                if (rnd() < 0.3) {
                    glow(c, th.torch, 8);
                    p(th.torch, 6, 6, 5, 5);
                    c.restore();
                    p(EMBER, 7, 7, 3, 3);
                }
            }
        }
        // a dark line only along the sides that face the room
        if (edge) {
            if (open(0, -1)) p(edge, 0, 0, 16, 1);
            if (open(0, 1)) p(edge, 0, 15, 16, 1);
            if (open(-1, 0)) p(edge, 0, 0, 1, 16);
            if (open(1, 0)) p(edge, 15, 0, 1, 16);
        }
    }

    const paint2d = {
        wall(c, it, th, wallSet) {
            const o = it.o;
            for (let dr = 0; dr < o.h; dr++) for (let dc = 0; dc < o.w; dc++) wallTile(c, o.col + dc, o.row + dr, th, wallSet);
        },
        // the bench from above: block arms, a back rail, wool cushions and a pillow
        couch(c, lw, ld, th) {
            const w = lw * 16, d = ld * 16;
            const p = (color, x, y, cw, ch) => cell(c, color, x - w / 2, y - d / 2, cw, ch);
            const wood = th.couchWood, wool = th.couch;
            p(sh(wood, 0.5), 1, 1, w - 2, d - 2);
            for (const x of [2, w - 6]) {
                p(wood, x, 2, 4, d - 4);
                p(sh(wood, 1.2), x, 2, 4, 1);
            }
            p(sh(wood, 0.85), 7, 2, w - 14, 3);
            p(sh(wood, 1.1), 7, 2, w - 14, 1);
            const n = Math.max(1, Math.round(lw)), inner = w - 14;
            for (let i = 0; i < n; i++) {
                const x = 7 + Math.round((i * inner) / n), cw = 7 + Math.round(((i + 1) * inner) / n) - x - (i < n - 1 ? 1 : 0);
                const tone = i % 2 ? sh(wool, 0.92) : wool;
                p(sh(wool, 0.78), x, 5, cw, 2);
                p(tone, x, 7, cw, d - 9);
                p(sh(tone, 1.18), x, 7, cw, 1);
                p(sh(tone, 0.8), x, d - 3, cw, 1);
            }
            p(sh(th.pillow, 0.75), w - 13, 7, 5, 4);
            p(th.pillow, w - 12, 8, 3, 2);
        },
        // four boards with the candle, the mug, the treasure block and the book on them
        table(c, lw, ld, th) {
            const w = lw * 16, d = ld * 16;
            const p = (color, x, y, cw, ch) => cell(c, color, x - w / 2, y - d / 2, cw, ch);
            const q = (color, x, y, cw, ch) => cell(c, color, x, y, cw, ch);
            const wood = th.table;
            p(sh(wood, 0.5), 2, 2, w - 4, d - 4);
            for (let i = 0; i < 4; i++) {
                const y = 3 + Math.round((i * (d - 6)) / 4), bh = 3 + Math.round(((i + 1) * (d - 6)) / 4) - y;
                const tone = i % 2 ? sh(wood, 0.9) : wood;
                p(tone, 3, y, w - 6, bh);
                p(sh(tone, 0.8), 3, y + bh - 1, w - 6, 1);
            }
            p(sh(wood, 1.2), 3, 3, w - 6, 1);
            q('#8A8F98', -2, -2, 4, 4);
            glow(c, th.torch, 8);
            q(th.torch, -1, -1, 2, 2);
            c.restore();
            q('#FFF2B0', -1, -1, 1, 1);
            const mx = -lw * 4, mz = ld * 2;
            q('#5E4124', mx - 2, mz - 2, 3, 3);
            q('#F6F1E4', mx - 1, mz - 1, 1, 1);
            q('#5E4124', mx - 3, mz - 1, 1, 1);
            const tx = lw * 4 - 1, tz = -ld * 4 + 1;
            q('#B8860B', tx - 2, tz - 2, 4, 4);
            q(GOLD, tx - 2, tz - 2, 3, 3);
            glow(c, th.gem, 6);
            q(th.gem, tx - 1, tz - 1, 2, 2);
            c.restore();
            const bx = lw * 4 - 2, bz = ld * 4;
            q(th.banner, bx - 3, bz - 2, 6, 4);
            q(sh(th.banner, 0.7), bx - 3, bz - 2, 1, 4);
            q(CREAM, bx + 2, bz - 2, 1, 4);
        },
        // a seat board and a wool pad; a back rail unless it is a stool, a gold crest on a throne
        chair(c, th) {
            const p = (color, x, y, w, h) => cell(c, color, x, y, w, h);
            const wood = th.couchWood, pad = th.chair;
            p(sh(wood, 0.5), -6, -6, 12, 12);
            p(wood, -6, -6, 11, 11);
            p(sh(pad, 0.8), -5, -5, 10, 10);
            p(pad, -5, -5, 9, 9);
            p(sh(pad, 1.2), -5, -5, 9, 1);
            if (th.seat === 'stool') {
                for (const [x, y] of [[-6, -6], [4, -6], [-6, 4], [4, 4]]) p(sh(wood, 0.6), x, y, 2, 2);
                return;
            }
            p(sh(wood, 0.6), -6, -7, 12, 3);
            p(sh(wood, 1.1), -6, -7, 12, 1);
            if (th.seat !== 'throne') return;
            for (const x of [-6, 4]) {
                p(wood, x, -4, 2, 9);
                p(GOLD, x, -7, 2, 2);
            }
            p(GOLD, -2, -7, 4, 2);
            glow(c, th.gem, 6);
            p(th.gem, -1, -7, 2, 1);
            c.restore();
        },
        // the pot, and over it the bush, the sapling's crown or the mushroom's cap
        plant(c, th, seed) {
            const rnd = scrambled(seed || 1);
            const p = (color, x, y, w, h) => cell(c, color, x, y, w, h);
            const pot = th.planter, g = th.leaf;
            p(sh(pot, 0.6), -6, -6, 12, 12);
            p(sh(pot, 1.15), -6, -6, 11, 11);
            p('#4A3424', -4, -4, 8, 8);
            if (th.flora === 'mushroom') {
                const cap = th.cap;
                p(sh(cap, 0.65), -7, -5, 14, 10);
                p(sh(cap, 0.65), -5, -7, 10, 14);
                p(cap, -6, -5, 12, 10);
                p(cap, -5, -6, 10, 12);
                p(sh(cap, 1.18), -5, -5, 10, 10);
                for (let i = 0; i < 4; i++) {
                    const x = -5 + Math.floor(rnd() * 9), y = -5 + Math.floor(rnd() * 9);
                    if (th.glowcap) glow(c, th.gem, 6);
                    p(th.glowcap ? th.gem : '#FFFFFF', x, y, 2, 2);
                    if (th.glowcap) c.restore();
                }
            } else if (th.flora === 'sapling') {
                p(sh(g, 0.6), -7, -7, 14, 14);
                p(sh(g, 0.82), -7, -7, 13, 13);
                p(g, -5, -5, 10, 10);
                p(sh(g, 1.16), -3, -3, 6, 6);
                p(sh(g, 1.3), -3, -3, 6, 1);
                for (let i = 0; i < 3; i++) p(th.pillow, -6 + Math.floor(rnd() * 11), -6 + Math.floor(rnd() * 11), 1, 1);
            } else {
                p(sh(g, 0.6), -6, -4, 12, 8);
                p(sh(g, 0.6), -4, -6, 8, 12);
                for (let i = 0; i < 5; i++) {
                    const a = (i / 5) * Math.PI * 2 + rnd() * 0.8, s = rnd() < 0.5 ? 4 : 6;
                    p(i % 2 ? sh(g, 0.82) : sh(g, 1.1), Math.round(Math.cos(a) * 5 - s / 2), Math.round(Math.sin(a) * 5 - s / 2), s, s);
                }
                p(g, -5, -4, 10, 8);
                p(g, -4, -5, 8, 10);
                p(sh(g, 1.16), -4, -4, 8, 8);
                p(sh(g, 1.3), -4, -4, 8, 1);
                for (let i = 0; i < 3; i++) p(th.pillow, -5 + Math.floor(rnd() * 9), -5 + Math.floor(rnd() * 9), 2, 2);
            }
        },
        // the bed: a wool rim round a pale mattress, studs at the back corners and a name plate
        petbed(c, lw, ld, th) {
            const w = lw * 16, d = ld * 16;
            const p = (color, x, y, cw, ch) => cell(c, color, x - w / 2, y - d / 2, cw, ch);
            const wool = th.petbed;
            p(sh(wool, 0.55), 1, 1, w - 2, d - 2);
            p(wool, 1, 1, w - 2, 2);
            p(sh(wool, 0.82), 1, d - 3, w - 2, 2);
            p(sh(wool, 0.9), 1, 3, 2, d - 6);
            p(sh(wool, 0.9), w - 3, 3, 2, d - 6);
            p('#EFE6D2', 3, 3, w - 6, d - 6);
            p('#D2C7AE', 3, 3, w - 6, 1);
            p(th.pillow, 1, 1, 3, 3);
            p(th.pillow, w - 4, 1, 3, 3);
            p(GOLD, w / 2 - 3, d - 2, 6, 1);
        },
        // the chandelier, drawn lightly so the tiles under it still read: the ring of beams and
        // the eight torches on its outer faces
        lamp(c, th) {
            const p = (color, x, y, w, h) => cell(c, color, x, y, w, h);
            const wood = th.couchWood;
            c.globalAlpha = 0.62;
            p(wood, -14, -14, 28, 4);
            p(wood, -14, 10, 28, 4);
            p(wood, -14, -10, 4, 20);
            p(wood, 10, -10, 4, 20);
            p(th.beam, -10, -1, 20, 2);
            p(th.beam, -1, -10, 2, 20);
            if (th.lamp.on) {
                c.shadowColor = th.torch;
                c.shadowBlur = 8;
            }
            for (const [x, y] of [[-7, -16], [7, -16], [-7, 16], [7, 16], [-16, -7], [-16, 7], [16, -7], [16, 7]]) {
                p(th.torch, x - 2, y - 2, 4, 4);
                p(EMBER, x - 1, y - 1, 2, 2);
            }
        },
    };

    S3_STYLE_PACKS.voxel = { name: 'voxel', themes, couch, table, chair, plant, petbed, wall, architecture, dock, paintFloor, paintBackdrop, textures, palette2d, paint2d };
})();
