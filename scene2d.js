// === 2D SCENE: THE ROOM FROM ABOVE, IN THE SAME ATOMIC-AGE THEMES AS THE 3D VIEW ===
// Classic script sharing globals (loaded after render2d.js). Each room takes its time of day,
// sun, palette, floor and furniture colours from the themes in scene3d.js, so the board and the
// first-person view are the same place seen from two heights. The static parts are painted once
// per level into offscreen layers: the floor and the room shell, the furniture with the shadows
// the sun (or the lamp) casts, and the light itself: sun through the half-drawn blinds, the
// Sputnik lamp. Each frame then draws only what changes: dust and polish on the tiles, the dock,
// the cat, the vacuum and its effects.

const S2_WALL = 7;              // px of wall cap showing around the room
const S2_BLIND_BOTTOM = 2.58;   // the blinds are half drawn: slats from here up to the window top
const S2_SLAT_STEP = 0.14;      // slat spacing in world units, as in scene3d.js
const S2_SLAT_OPEN = 0.6;       // fraction of each slat step the sun gets through
const S2_HEIGHTS = { couch: 1.0, table: 0.95, chair: 1.3, plant: 1.9, petbed: 0.35 };
const S2_WALL_HEIGHTS = { partition: 4.8, counter: 1.9, crate: 2.9, neon: 4.8 };

const scene = {
    level: -1,
    dpr: 0,
    theme: null,
    sun: null,
    palette: null,
    floor: null,
    furniture: null,
    light: null,
    glaze: null,
    dust: [],
    cats: [],
    moteBox: null,
    lampArms: null,
};
const dustPuffs = [];
const bokehMotes = [];
for (let i = 0; i < 9; i++) {
    bokehMotes.push({ u: Math.random(), v: Math.random(), r: 6 + Math.random() * 8, vu: -0.0004 - Math.random() * 0.0004, vv: -0.0005 - Math.random() * 0.0005, phase: Math.random() * Math.PI * 2 });
}

// --- Theme adapter (pure; covered by tests) -------------------------------------------------

// Where the sun's light falls, in tile units. Shadows fall away from the sun; the window's light
// lands on the floor where each height on the window, divided by the sun's slope, puts it. The
// blinds are half drawn, so the upper part of the patch is striped.
function s2Sun(theme) {
    const az = (theme.sun.azimuth * Math.PI) / 180;
    const el = Math.max(0.03, (theme.sun.elevation * Math.PI) / 180);
    const slope = 1 / Math.tan(el);
    const dir = [-Math.sin(az), Math.cos(az)];
    const W = S3_WINDOW;
    const row = (h) => [[W.x0 + dir[0] * slope * h, dir[1] * slope * h], [W.x1 + dir[0] * slope * h, dir[1] * slope * h]];
    const sill = row(W.sill), open = row(S2_BLIND_BOTTOM);
    const bands = [];
    for (let h = S2_BLIND_BOTTOM; h < W.top - 0.01; h += S2_SLAT_STEP) {
        const a = row(h), b = row(Math.min(W.top, h + S2_SLAT_STEP * S2_SLAT_OPEN));
        bands.push([a[0], a[1], b[1], b[0]]);
    }
    const mullions = [1, 2].map((i) => {
        const x = W.x0 + ((W.x1 - W.x0) * i) / 3;
        return [[x + dir[0] * slope * W.sill, dir[1] * slope * W.sill], [x + dir[0] * slope * W.top, dir[1] * slope * W.top]];
    });
    return {
        slope, dir, color: theme.sun.color, intensity: theme.sun.intensity,
        lit: [sill[0], sill[1], open[1], open[0]],
        bands, mullions,
        transom: row(W.sill + (W.top - W.sill) * 0.62),
        reaches: dir[1] * slope * W.sill < ROWS - 0.5,
    };
}

// The shadow a piece of a given height (tiles) casts from a given spot (tiles): by the sun when
// it is strong enough, otherwise radially away from the lamp. Offsets are in tiles.
function s2Shadow(sun, lamp, cx, cy, height) {
    const sunAlpha = 0.42 * Math.min(1, 1.1 / sun.slope) * Math.min(1, sun.intensity / 2.4);
    if (sunAlpha >= 0.16 || !lamp.on) {
        const len = Math.min(0.55, height * sun.slope);
        return { dx: sun.dir[0] * len, dy: sun.dir[1] * len, alpha: Math.max(0.1, sunAlpha), blur: 6 + len * 14 };
    }
    let vx = cx - S3_LAMP.x, vy = cy - S3_LAMP.z;
    const d = Math.hypot(vx, vy) || 1;
    vx /= d;
    vy /= d;
    const len = Math.min(0.5, height * 0.18 * (0.6 + d / 6));
    return { dx: vx * len, dy: vy * len, alpha: 0.3, blur: 6 + len * 10 };
}

// Colours the board needs beyond the theme's own: the polish on clean tiles, the dull film on
// dirty ones, and an average floor colour the tests use to keep the two apart.
function s2Palette(theme) {
    const night = theme.time === 'night';
    const lino = theme.floor === 'lino', concrete = theme.floor === 'concrete';
    // A style pack states its own floor colours, so clean and dirty tiles stay easy to tell apart
    const pack = s3Pack(theme);
    return Object.assign(s2BasePalette(theme, night, lino, concrete), pack && pack.palette2d ? pack.palette2d(theme) : null);
}

function s2BasePalette(theme, night, lino, concrete) {
    return {
        glaze: lino ? [255, 240, 200] : night ? [127, 224, 216] : [108, 224, 172],
        glazeAlpha: lino ? 0.55 : concrete ? 0.56 : 0.52,
        film: night ? [40, 60, 70] : concrete ? [50, 45, 40] : [70, 55, 40],
        filmAlpha: night ? 0.16 : concrete ? 0.12 : 0.08,
        dust: concrete ? { fluff: [72, 64, 58], crumb: [40, 34, 30], hair: [30, 26, 24] }
            : night ? { fluff: [118, 112, 106], crumb: [150, 135, 115], hair: [140, 130, 120] } : null,
        floorBase: lino ? [188, 225, 214] : concrete ? [169, 169, 164] : night ? [96, 86, 74] : [185, 160, 120],
        cushion: '#F2E8D5',
        chrome: '#E6E6E6',
        brass: '#C9A227',
        rubber: '#2B2B2B',
        dockBlue: '#4FA8FF',
    };
}

// How far apart a clean and a dirty tile sit in colour (0..1, Euclidean in sRGB)
function s2CleanContrast(theme) {
    const p = s2Palette(theme);
    const mix = (base, c, a) => base.map((v, i) => v * (1 - a) + c[i] * a);
    const clean = mix(p.floorBase, p.glaze, p.glazeAlpha);
    const dirty = mix(p.floorBase, p.film, p.filmAlpha);
    return Math.hypot(clean[0] - dirty[0], clean[1] - dirty[1], clean[2] - dirty[2]) / 255;
}

// The Sputnik's arms, as the 3D scene lays them out, projected onto the floor (tiles from the lamp)
function s2LampArms() {
    const rnd = seededRandom(77);
    const arms = [];
    for (let i = 0; i < 14; i++) {
        const u = (i + 0.5) / 14, v = rnd();
        const theta = u * Math.PI * 2 + (rnd() - 0.5) * 0.4;
        const phi = Math.acos(1 - 2 * ((i % 7) / 7 + 0.06));
        const len = 0.55 + v * 0.3;
        arms.push({ x: Math.sin(phi) * Math.cos(theta) * len, y: Math.sin(phi) * Math.sin(theta) * len, big: i % 3 === 0 });
    }
    return arms;
}

// --- Layer helpers -----------------------------------------------------------------------

function makeLayer() {
    const c = document.createElement('canvas');
    c.width = Math.round(CANVAS_W * canvasDpr);
    c.height = Math.round(CANVAS_H * canvasDpr);
    const t = c.getContext('2d');
    t.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
    return { canvas: c, ctx: t };
}

function makeTileSprite(draw) {
    const c = document.createElement('canvas');
    c.width = Math.round(TILE * canvasDpr);
    c.height = Math.round(TILE * canvasDpr);
    const t = c.getContext('2d');
    t.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
    draw(t);
    return c;
}

// Run one of the drawing routines into another context
function withCtx(target, fn) {
    const saved = ctx;
    ctx = target;
    try {
        fn();
    } finally {
        ctx = saved;
    }
}

function ensureSceneLayers() {
    if (scene.level === currentLevel && scene.dpr === canvasDpr) return;
    scene.level = currentLevel;
    scene.dpr = canvasDpr;
    const theme = s3Theme(currentLevel);
    scene.theme = theme;
    scene.sun = s2Sun(theme);
    scene.palette = s2Palette(theme);
    if (!scene.lampArms) scene.lampArms = s2LampArms();
    scene.glaze = buildGlazeTile(theme);
    scene.dust = buildDustSprites(theme);
    scene.floor = buildFloorLayer(theme);
    scene.furniture = buildFurnitureLayer(theme);
    scene.light = buildLightLayer(theme);
    scene.cats = findCats(theme);
    scene.moteBox = moteBoxFor(theme);
}

// Repaint only the furniture (and find the cats again): what changes with each piece placed
// while a room is being built. Everything else waits for the theme or the screen to change.
function refreshFurnitureLayer() {
    if (scene.level !== currentLevel || scene.dpr !== canvasDpr || !scene.theme) {
        ensureSceneLayers();
        return;
    }
    scene.furniture = buildFurnitureLayer(scene.theme);
    scene.cats = findCats(scene.theme);
}

// --- Floor -------------------------------------------------------------------------------------

// Hardwood planks: half-tile-high boards of varying length and tone, grain, knots and seams.
// Shared with the 3D floor textures, so the boards run the same way in both views.
function paintWoodFloor(c, seed, tilePx = TILE, cols = COLS, rows = ROWS) {
    const rnd = seededRandom(seed);
    const W = cols * tilePx, H = rows * tilePx;
    const plankH = tilePx / 2;
    const tones = ['#D8BC92', '#CDB286', '#E0C79E', '#C9AA7E', '#D4B78E', '#DCC39A', '#C4A478'];
    for (let row = 0; row < rows * 2; row++) {
        const y = row * plankH;
        let x = -rnd() * tilePx * 2;
        while (x < W) {
            const len = tilePx * (1.4 + rnd() * 2.6);
            const tone = tones[Math.floor(rnd() * tones.length)];
            const g = c.createLinearGradient(x, y, x + len, y);
            g.addColorStop(0, shadeColor(tone, -8));
            g.addColorStop(0.5, tone);
            g.addColorStop(1, shadeColor(tone, -12));
            c.fillStyle = g;
            c.fillRect(x, y, len, plankH);
            c.lineWidth = 0.8;
            for (let i = 0; i < 4; i++) {
                const gy = y + 3 + i * (plankH / 4) + rnd() * 3;
                c.strokeStyle = `rgba(120, 88, 52, ${0.1 + rnd() * 0.14})`;
                c.beginPath();
                c.moveTo(x + 2, gy);
                c.bezierCurveTo(x + len * 0.3, gy + rnd() * 3 - 1.5, x + len * 0.7, gy - rnd() * 3 + 1.5, x + len - 2, gy + rnd() * 2 - 1);
                c.stroke();
            }
            if (rnd() < 0.2) {
                const kx = x + len * (0.2 + rnd() * 0.6);
                const ky = y + plankH * (0.3 + rnd() * 0.4);
                const rot = rnd();
                c.fillStyle = 'rgba(120, 85, 50, 0.24)';
                c.beginPath();
                c.ellipse(kx, ky, 4 + rnd() * 3, 2.5 + rnd() * 1.5, rot, 0, Math.PI * 2);
                c.fill();
                c.strokeStyle = 'rgba(110, 80, 45, 0.28)';
                c.lineWidth = 0.7;
                c.beginPath();
                c.ellipse(kx, ky, 7 + rnd() * 3, 4.5 + rnd() * 2, rot, 0, Math.PI * 2);
                c.stroke();
            }
            c.fillStyle = 'rgba(90, 65, 40, 0.4)';
            c.fillRect(x + len - 1.2, y, 1.4, plankH);
            c.fillStyle = 'rgba(255, 255, 255, 0.1)';
            c.fillRect(x, y, len, 1);
            x += len;
        }
        c.fillStyle = 'rgba(90, 65, 40, 0.32)';
        c.fillRect(0, y + plankH - 1, W, 1);
    }
    const sheen = c.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.3, 'rgba(255,255,255,0.09)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.07)');
    c.fillStyle = sheen;
    c.fillRect(0, 0, W, H);
    paintTileGrid(c, tilePx, cols, rows, 'rgba(60, 40, 20, 0.09)');
}

// A faint tile grid, so moves stay countable on any floor
function paintTileGrid(c, tilePx, cols, rows, color) {
    c.strokeStyle = color;
    c.lineWidth = 1;
    for (let i = 1; i < cols; i++) {
        c.beginPath();
        c.moveTo(i * tilePx + 0.5, 0);
        c.lineTo(i * tilePx + 0.5, rows * tilePx);
        c.stroke();
    }
    for (let i = 1; i < rows; i++) {
        c.beginPath();
        c.moveTo(0, i * tilePx + 0.5);
        c.lineTo(cols * tilePx, i * tilePx + 0.5);
        c.stroke();
    }
}

// Checkerboard lino, as laid in the Chrome Diner
function paintLinoFloor(c, seed) {
    const half = TILE / 2;
    const rnd = seededRandom(seed);
    for (let r = 0; r < ROWS * 2; r++) {
        for (let q = 0; q < COLS * 2; q++) {
            c.fillStyle = (r + q) % 2 ? '#EAF1EC' : '#8ED1C0';
            c.fillRect(q * half, r * half, half, half);
        }
    }
    for (let i = 0; i < 2600; i++) {
        c.fillStyle = rnd() > 0.5 ? 'rgba(40,40,40,0.18)' : 'rgba(255,255,255,0.3)';
        c.fillRect(rnd() * CANVAS_W, rnd() * CANVAS_H, 1, 1);
    }
    c.strokeStyle = 'rgba(0,0,0,0.1)';
    c.lineWidth = 1;
    for (let r = 1; r < ROWS * 2; r++) {
        c.beginPath();
        c.moveTo(0, r * half + 0.5);
        c.lineTo(CANVAS_W, r * half + 0.5);
        c.stroke();
    }
    for (let q = 1; q < COLS * 2; q++) {
        c.beginPath();
        c.moveTo(q * half + 0.5, 0);
        c.lineTo(q * half + 0.5, CANVAS_H);
        c.stroke();
    }
    paintTileGrid(c, TILE, COLS, ROWS, 'rgba(0, 40, 40, 0.14)');
    const sheen = c.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
    sheen.addColorStop(0, 'rgba(255,255,255,0.1)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.05)');
    c.fillStyle = sheen;
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

// Sealed concrete with expansion joints and a safety stripe, as poured in Hangar 51
function paintConcreteFloor(c, seed) {
    const rnd = seededRandom(seed);
    c.fillStyle = '#A9A9A4';
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);
    for (let i = 0; i < 9000; i++) {
        const g = 150 + rnd() * 60;
        c.fillStyle = `rgba(${g},${g},${g - 4},${0.3 + rnd() * 0.4})`;
        c.fillRect(rnd() * CANVAS_W, rnd() * CANVAS_H, 1.2, 1.2);
    }
    for (let i = 0; i < 34; i++) {
        c.fillStyle = `rgba(60,55,50,${0.04 + rnd() * 0.08})`;
        c.beginPath();
        c.ellipse(rnd() * CANVAS_W, rnd() * CANVAS_H, 10 + rnd() * 60, 5 + rnd() * 30, rnd() * 3, 0, Math.PI * 2);
        c.fill();
    }
    paintTileGrid(c, TILE, COLS, ROWS, 'rgba(0, 0, 0, 0.08)');
    c.strokeStyle = 'rgba(40,40,40,0.45)';
    c.lineWidth = 2;
    for (let r = 3; r < ROWS; r += 3) {
        c.beginPath();
        c.moveTo(0, r * TILE);
        c.lineTo(CANVAS_W, r * TILE);
        c.stroke();
    }
    for (let q = 3; q < COLS; q += 3) {
        c.beginPath();
        c.moveTo(q * TILE, 0);
        c.lineTo(q * TILE, CANVAS_H);
        c.stroke();
    }
    c.fillStyle = 'rgba(250,200,40,0.8)';
    c.fillRect(0, 9 * TILE - 3, CANVAS_W, 6);
    for (let i = 0; i < 70; i++) {
        c.fillStyle = `rgba(169,169,164,${0.3 + rnd() * 0.5})`;
        c.fillRect(rnd() * CANVAS_W, 9 * TILE - 3 + rnd() * 6, 1 + rnd() * 6, 1 + rnd() * 2);
    }
}

function paintFloor2D(c, theme) {
    const pack = s3Pack(theme);
    if (pack && pack.paintFloor) {
        // the same painter the 3D floor uses, at the board's scale; it sets its own mood
        pack.paintFloor(c, theme, TILE);
        return;
    }
    if (theme.floor === 'lino') paintLinoFloor(c, theme.floorSeed);
    else if (theme.floor === 'concrete') paintConcreteFloor(c, theme.floorSeed);
    else {
        paintWoodFloor(c, theme.floorSeed, TILE, COLS, ROWS);
        c.globalCompositeOperation = 'multiply';
        c.fillStyle = '#DFC9AA';
        c.fillRect(0, 0, CANVAS_W, CANVAS_H);
        c.globalCompositeOperation = 'source-over';
    }
    const tint = {
        night: 'rgba(20, 30, 40, 0.38)',
        dusk: 'rgba(70, 60, 80, 0.16)',
        'golden hour': 'rgba(255, 170, 90, 0.08)',
        afternoon: 'rgba(255, 214, 160, 0.06)',
    }[theme.time];
    if (tint) {
        c.fillStyle = tint;
        c.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
}

// The walls seen from above: a cap around the room, the window with its sill, the porthole door
// and the arc it swings through on the floor
function paintRoomShell(c, theme) {
    const t = S2_WALL;
    const capFor = (wall) => shadeColor(theme.accent.wall === wall ? theme.accent.color : theme.walls, -14);
    const bands = {
        north: [0, 0, CANVAS_W, t],
        south: [0, CANVAS_H - t, CANVAS_W, t],
        west: [0, 0, t, CANVAS_H],
        east: [CANVAS_W - t, 0, t, CANVAS_H],
    };
    for (const wall of ['north', 'south', 'west', 'east']) {
        const [x, y, w, h] = bands[wall];
        c.fillStyle = capFor(wall);
        c.fillRect(x, y, w, h);
    }
    // skirting along the floor side, and the dark line where the wall meets the floor
    c.fillStyle = theme.trim;
    c.fillRect(t - 2, t - 2, CANVAS_W - 2 * t + 4, 2);
    c.fillRect(t - 2, CANVAS_H - t, CANVAS_W - 2 * t + 4, 2);
    c.fillRect(t - 2, t - 2, 2, CANVAS_H - 2 * t + 4);
    c.fillRect(CANVAS_W - t, t - 2, 2, CANVAS_H - 2 * t + 4);
    c.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    c.lineWidth = 1;
    c.strokeRect(t + 0.5, t + 0.5, CANVAS_W - 2 * t - 1, CANVAS_H - 2 * t - 1);

    // Window on the north wall: sky in the opening, two mullions, a sill board into the room
    const W = S3_WINDOW;
    const wx0 = W.x0 * TILE, wx1 = W.x1 * TILE;
    const sky = c.createLinearGradient(0, 0, 0, t);
    sky.addColorStop(0, theme.sky.zenith);
    sky.addColorStop(1, theme.sky.horizon);
    c.fillStyle = sky;
    c.fillRect(wx0, 0, wx1 - wx0, t - 1);
    c.fillStyle = theme.trim;
    c.fillRect(wx0 - 2, 0, 2, t);
    c.fillRect(wx1, 0, 2, t);
    for (let i = 1; i < 3; i++) c.fillRect(wx0 + ((wx1 - wx0) * i) / 3 - 1, 0, 2, t);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillRect(wx0, 1.5, wx1 - wx0, 1);          // the blind's headrail
    c.fillStyle = theme.trim;
    c.fillRect(wx0 - 0.15 * TILE, t - 2, wx1 - wx0 + 0.3 * TILE, 5); // sill board
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(wx0 - 0.15 * TILE, t + 3, wx1 - wx0 + 0.3 * TILE, 1.5);

    // The door: a coloured leaf in the wall, a chrome porthole, and its swing drawn on the floor
    const door = theme.door;
    const dw = 1.8 * TILE;
    const horizontal = door.wall === 'north' || door.wall === 'south';
    const along = door.at * TILE;
    const bandPos = door.wall === 'north' || door.wall === 'west' ? 0 : (horizontal ? CANVAS_H : CANVAS_W) - t;
    c.save();
    if (horizontal) c.translate(along, bandPos + t / 2);
    else {
        c.translate(bandPos + t / 2, along);
        c.rotate(Math.PI / 2);
    }
    c.fillStyle = door.color;
    c.fillRect(-dw / 2, -t / 2, dw, t);
    c.fillStyle = theme.trim;
    c.fillRect(-dw / 2 - 3, -t / 2, 3, t);
    c.fillRect(dw / 2, -t / 2, 3, t);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(-dw / 2, -t / 2, dw, 1.5);
    c.strokeStyle = scene.palette.chrome;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(0, 0, 2.6, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#AFCBD6';
    c.beginPath();
    c.arc(0, 0, 1.6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = scene.palette.chrome;
    c.fillRect(0.65 * TILE - 4, -1, 8, 2);
    c.restore();
    // swing arc: hinge at one jamb, a quarter circle into the room
    const inward = door.wall === 'north' ? [0, 1] : door.wall === 'south' ? [0, -1] : door.wall === 'west' ? [1, 0] : [-1, 0];
    const hx = horizontal ? along - dw / 2 : bandPos + (door.wall === 'west' ? t : 0);
    const hy = horizontal ? bandPos + (door.wall === 'north' ? t : 0) : along - dw / 2;
    c.save();
    c.strokeStyle = 'rgba(0, 0, 0, 0.16)';
    c.lineWidth = 1;
    c.setLineDash([3, 4]);
    c.beginPath();
    const a0 = Math.atan2(horizontal ? 0 : 1, horizontal ? 1 : 0);
    const a1 = Math.atan2(inward[1], inward[0]);
    c.arc(hx, hy, dw, Math.min(a0, a1), Math.max(a0, a1));
    c.stroke();
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(hx, hy);
    c.lineTo(hx + inward[0] * dw, hy + inward[1] * dw);
    c.stroke();
    c.restore();
}

function buildFloorLayer(theme) {
    const L = makeLayer();
    const c = L.ctx;
    paintFloor2D(c, theme);
    // ambient occlusion where the floor meets the walls
    const ao = 34;
    const edges = [[0, 0, 0, ao], [0, CANVAS_H, 0, CANVAS_H - ao], [0, 0, ao, 0], [CANVAS_W, 0, CANVAS_W - ao, 0]];
    for (const [x0, y0, x1, y1] of edges) {
        const g = c.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(30, 20, 10, 0.26)');
        g.addColorStop(1, 'rgba(30, 20, 10, 0)');
        c.fillStyle = g;
        c.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    paintRoomShell(c, theme);
    return L.canvas;
}

// Dust on a tile that still needs cleaning: fluff, crumbs and a stray hair, in three variants.
// Drawn into an n-pixel square; shared with the 3D floor textures.
function paintDust(t, n, v, tone) {
    const k = n / TILE;
    const rnd = seededRandom(77 + v * 31);
    const fluff = tone ? tone.fluff : [165, 155, 145];
    for (let i = 0; i < 4; i++) {
        const x = (6 + rnd() * 36) * k, y = (6 + rnd() * 36) * k, r = (2.5 + rnd() * 3.5) * k;
        const g = t.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${fluff[0]}, ${fluff[1]}, ${fluff[2]}, 0.5)`);
        g.addColorStop(1, `rgba(${fluff[0]}, ${fluff[1]}, ${fluff[2]}, 0)`);
        t.fillStyle = g;
        t.beginPath();
        t.arc(x, y, r, 0, Math.PI * 2);
        t.fill();
    }
    for (let i = 0; i < 8; i++) {
        const cr = tone ? tone.crumb : [100 + (rnd() * 40) | 0, 70 + (rnd() * 30) | 0, 40 + (rnd() * 20) | 0];
        if (tone) rnd(), rnd(), rnd();
        t.fillStyle = `rgba(${cr[0]}, ${cr[1]}, ${cr[2]}, ${0.35 + rnd() * 0.3})`;
        t.beginPath();
        t.arc((4 + rnd() * 40) * k, (4 + rnd() * 40) * k, (0.7 + rnd() * 1.1) * k, 0, Math.PI * 2);
        t.fill();
    }
    if (v !== 1) {
        const hair = tone ? tone.hair : [60, 50, 45];
        t.strokeStyle = `rgba(${hair[0]}, ${hair[1]}, ${hair[2]}, 0.4)`;
        t.lineWidth = 0.7 * k;
        const x0 = (6 + rnd() * 34) * k, y0 = (6 + rnd() * 34) * k;
        t.beginPath();
        t.moveTo(x0, y0);
        t.bezierCurveTo(x0 + (rnd() * 20 - 10) * k, y0 + (rnd() * 20 - 10) * k, x0 + (rnd() * 20 - 10) * k, y0 + (rnd() * 20 - 10) * k, x0 + (rnd() * 16 - 8) * k, y0 + (rnd() * 16 - 8) * k);
        t.stroke();
    }
}

// Polish over a cleaned tile: the floor shows through a tinted glaze with a gloss highlight.
// Shared with the Classic 3D floor texture (which calls it with no theme).
function paintGlaze(t, n, theme) {
    const k = n / TILE;
    const p = s2Palette(theme || scene.theme || s3Theme(0));
    const [r, g, b] = p.glaze;
    t.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.glazeAlpha})`;
    t.fillRect(0, 0, n, n);
    const gl = t.createLinearGradient(0, 0, n, n);
    gl.addColorStop(0, 'rgba(255,255,255,0)');
    gl.addColorStop(0.32, 'rgba(255,255,255,0.24)');
    gl.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    t.fillStyle = gl;
    t.fillRect(0, 0, n, n);
    const s = t.createRadialGradient(12 * k, 10 * k, 0, 12 * k, 10 * k, 26 * k);
    s.addColorStop(0, 'rgba(255,255,255,0.22)');
    s.addColorStop(1, 'rgba(255,255,255,0)');
    t.fillStyle = s;
    t.fillRect(0, 0, n, n);
    t.strokeStyle = `rgba(${Math.round(r * 0.35)}, ${Math.round(g * 0.5)}, ${Math.round(b * 0.5)}, 0.3)`;
    t.lineWidth = k;
    t.strokeRect(0.5 * k, 0.5 * k, n - k, n - k);
}

function buildDustSprites(theme) {
    const p = s2Palette(theme);
    const out = [];
    for (let v = 0; v < 3; v++) {
        out.push(makeTileSprite((t) => {
            t.fillStyle = `rgba(${p.film[0]}, ${p.film[1]}, ${p.film[2]}, ${p.filmAlpha})`;
            t.fillRect(0, 0, TILE, TILE);
            paintDust(t, TILE, v, p.dust);
        }));
    }
    return out;
}

function buildGlazeTile(theme) {
    return makeTileSprite((t) => paintGlaze(t, TILE, theme));
}

// --- Furniture -----------------------------------------------------------------------------

// Shadow only: the shape is drawn far off-canvas and its shadow offset back on. Shadow
// offsets and blur ignore the canvas transform, so they are scaled by the pixel ratio here.
function castShadow(c, drawShape, ox, oy, blur, alpha) {
    const far = 4000;
    c.save();
    c.shadowColor = `rgba(0, 0, 0, ${alpha})`;
    c.shadowBlur = blur * canvasDpr;
    c.shadowOffsetX = (-far + ox) * canvasDpr;
    c.shadowOffsetY = oy * canvasDpr;
    c.fillStyle = '#000';
    c.translate(far, 0);
    drawShape();
    c.restore();
}

function buildFurnitureLayer(theme) {
    const L = makeLayer();
    withCtx(L.ctx, () => paintFurniture(L.ctx, theme));
    return L.canvas;
}

// Pet beds, with where and which way their cats lie
function findCats(theme) {
    const out = [];
    for (const o of LEVELS[currentLevel].obstacles) {
        if (o.type !== 'petbed') continue;
        const facing = s3Facing(o);
        const swap = facing === 'east' || facing === 'west';
        out.push({
            x: (o.col + o.w / 2) * TILE, y: (o.row + o.h / 2) * TILE, yaw: S3_YAW[facing],
            lw: swap ? o.h : o.w, color: theme.cat, phase: (o.col * 7 + o.row * 3) % 10,
        });
    }
    return out;
}

// --- Light ---------------------------------------------------------------------------------

// Sun through the window onto the floor, striped where the blinds are, with the mullions'
// shadows; the sky's glow at the window; the lamp's pool when it is on
function buildLightLayer(theme) {
    const L = makeLayer();
    const c = L.ctx;
    const sun = scene.sun;
    const px = ([x, y]) => [x * TILE, y * TILE];
    const quad = (q) => {
        c.beginPath();
        q.forEach((p, i) => {
            const [x, y] = px(p);
            if (i) c.lineTo(x, y);
            else c.moveTo(x, y);
        });
        c.closePath();
    };
    const [sr, sg, sb] = hexToRgb(sun.color) || [255, 240, 220];
    const alpha = Math.min(0.62, 0.2 + 0.11 * sun.intensity);
    const blur = 'filter' in c;
    if (blur) c.filter = 'blur(1.4px)';
    c.fillStyle = `rgba(${sr}, ${sg}, ${sb}, ${alpha})`;
    quad(sun.lit);
    c.fill();
    for (const band of sun.bands) {
        quad(band);
        c.fill();
    }
    if (blur) c.filter = 'none';
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.strokeStyle = '#000';
    c.lineWidth = 3;
    for (const m of sun.mullions) {
        c.beginPath();
        c.moveTo(...px(m[0]));
        c.lineTo(...px(m[1]));
        c.stroke();
    }
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(...px(sun.transom[0]));
    c.lineTo(...px(sun.transom[1]));
    c.stroke();
    c.restore();

    // The sky's glow spilling in at the window, and a soft wash across the room from that side
    const wcx = ((S3_WINDOW.x0 + S3_WINDOW.x1) / 2) * TILE;
    const [hr, hg, hb] = hexToRgb(theme.sky.horizon) || [240, 225, 200];
    const spill = c.createLinearGradient(0, 0, 0, 3.2 * TILE);
    spill.addColorStop(0, `rgba(${hr}, ${hg}, ${hb}, 0.34)`);
    spill.addColorStop(1, `rgba(${hr}, ${hg}, ${hb}, 0)`);
    c.fillStyle = spill;
    c.fillRect(S3_WINDOW.x0 * TILE - TILE, 0, (S3_WINDOW.x1 - S3_WINDOW.x0) * TILE + 2 * TILE, 3.2 * TILE);
    const wash = c.createRadialGradient(wcx, 0, TILE, wcx, 0, 9.5 * TILE);
    wash.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, ${0.05 + 0.03 * sun.intensity})`);
    wash.addColorStop(1, `rgba(${sr}, ${sg}, ${sb}, 0)`);
    c.fillStyle = wash;
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (theme.lamp.on) {
        const [lr, lg, lb] = hexToRgb(theme.lamp.color) || [255, 220, 170];
        const lx = S3_LAMP.x * TILE, ly = S3_LAMP.z * TILE;
        const a = Math.min(0.5, 0.16 + theme.lamp.intensity * 0.016);
        const pool = c.createRadialGradient(lx, ly, TILE * 0.3, lx, ly, 4.8 * TILE);
        pool.addColorStop(0, `rgba(${lr}, ${lg}, ${lb}, ${a})`);
        pool.addColorStop(0.35, `rgba(${lr}, ${lg}, ${lb}, ${a * 0.55})`);
        pool.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);
        c.fillStyle = pool;
        c.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    return L.canvas;
}

// Where the bokeh motes drift: in the sun patch when it lands in the room, else under the lamp
function moteBoxFor(theme) {
    const sun = scene.sun;
    if (sun.reaches) {
        const pts = [...sun.lit, ...sun.bands.flat()];
        const xs = pts.map((p) => p[0] * TILE), ys = pts.map((p) => p[1] * TILE);
        const x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(CANVAS_W, Math.max(...xs));
        const y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(CANVAS_H, Math.max(...ys));
        if (x1 - x0 > TILE && y1 - y0 > TILE) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    if (theme.lamp.on) return { x: (S3_LAMP.x - 2.5) * TILE, y: (S3_LAMP.z - 2.5) * TILE, w: 5 * TILE, h: 5 * TILE };
    return { x: CANVAS_W * 0.5, y: 0, w: CANVAS_W * 0.5, h: CANVAS_H * 0.5 };
}

// --- Per-frame drawing -----------------------------------------------------------------------

// Floor, tile states, dock and furniture for a grid (the player's or the ghost's)
function drawScene(g, fades) {
    ensureSceneLayers();
    ctx.drawImage(scene.floor, 0, 0, CANVAS_W, CANVAS_H);
    drawTileStates(g, fades);
    drawChargingPad();
    const lv = LEVELS[currentLevel];
    drawChargerTile(lv.charger.col * TILE, lv.charger.row * TILE);
    ctx.drawImage(scene.furniture, 0, 0, CANVAS_W, CANVAS_H);
    drawCats();
}

function drawTileStates(g, fades) {
    const cleanPath = new Path2D();
    let anyClean = false;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = g[r][c];
            const x = c * TILE, y = r * TILE;
            if (cell === DIRTY) {
                ctx.drawImage(scene.dust[(r * 7 + c * 13) % 3], x, y, TILE, TILE);
            } else if (cell === CLEAN) {
                let f = 1;
                if (fades) {
                    const key = `${c},${r}`;
                    if (fades[key] !== undefined && fades[key] < 1) {
                        fades[key] = Math.min(1, fades[key] + 0.04 * dtFrames);
                        f = fades[key];
                    }
                }
                cleanPath.rect(x, y, TILE, TILE);
                anyClean = true;
                if (f < 1) {
                    ctx.save();
                    ctx.globalAlpha = 1 - f;
                    ctx.drawImage(scene.dust[(r * 7 + c * 13) % 3], x, y, TILE, TILE);
                    ctx.globalAlpha = f;
                    ctx.drawImage(scene.glaze, x, y, TILE, TILE);
                    ctx.restore();
                    drawPolishWipe(x, y, f);
                } else {
                    ctx.drawImage(scene.glaze, x, y, TILE, TILE);
                }
            }
        }
    }
    if (anyClean) drawGlossReflections(cleanPath);
}

// Polished tiles mirror what hangs above them: the lamp when it is on, and the sky's glow
// near the window. Clipped to the clean tiles, so cleaning reveals the ceiling in the floor.
function drawGlossReflections(cleanPath) {
    const th = scene.theme;
    ctx.save();
    ctx.clip(cleanPath);
    ctx.globalCompositeOperation = 'lighter';
    if (th.lamp.on) {
        const [lr, lg, lb] = hexToRgb(th.lamp.color) || [255, 220, 170];
        const lx = S3_LAMP.x * TILE, ly = S3_LAMP.z * TILE;
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 3.6 * TILE);
        g.addColorStop(0, `rgba(${lr}, ${lg}, ${lb}, 0.42)`);
        g.addColorStop(0.3, `rgba(${lr}, ${lg}, ${lb}, 0.16)`);
        g.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    const [hr, hg, hb] = hexToRgb(th.sky.horizon) || [240, 225, 200];
    const wcx = ((S3_WINDOW.x0 + S3_WINDOW.x1) / 2) * TILE;
    const w = ctx.createRadialGradient(wcx, 0, TILE * 0.5, wcx, 0, 5 * TILE);
    w.addColorStop(0, `rgba(${hr}, ${hg}, ${hb}, 0.3)`);
    w.addColorStop(1, `rgba(${hr}, ${hg}, ${hb}, 0)`);
    ctx.fillStyle = w;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
}

// Tiles that charge the vacuum thanks to the charging pad upgrade: the dock's blue, pulsing
function drawChargingPad() {
    if (!chargingPadGrid || padRadius() === 0) return;
    const lv = LEVELS[currentLevel];
    const pulse = 0.14 + 0.06 * Math.sin(chargerPulse * 0.05);
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (!chargingPadGrid[r][c] || (c === lv.charger.col && r === lv.charger.row)) continue;
            const x = c * TILE, y = r * TILE;
            ctx.fillStyle = `rgba(79, 168, 255, ${pulse})`;
            ctx.fillRect(x, y, TILE, TILE);
            ctx.strokeStyle = 'rgba(150, 200, 255, 0.6)';
            ctx.lineWidth = 1;
            roundRect(ctx, x + 3.5, y + 3.5, TILE - 7, TILE - 7, 5);
            ctx.stroke();
        }
    }
}

// A bright band sweeps diagonally across a tile as it comes clean
function drawPolishWipe(x, y, f) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, TILE, TILE);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6 * (1 - f);
    ctx.translate(x + TILE / 2, y + TILE / 2);
    ctx.rotate(-Math.PI / 4);
    const pos = -TILE * 0.9 + f * TILE * 1.8;
    const g = ctx.createLinearGradient(pos - 11, 0, pos + 11, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(pos - 11, -TILE, 22, TILE * 2);
    ctx.restore();
}

// The light layer over the room, the Sputnik seen from below, and the room's vignette
function drawLighting() {
    ensureSceneLayers();
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.84 + 0.12 * (0.5 + 0.5 * Math.sin(chargerPulse * 0.004)) + 0.04 * Math.sin(chargerPulse * 0.012);
    ctx.drawImage(scene.light, 0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
    drawLampFixture();
    drawRoomVignette();
}

// The chandelier hangs between us and the floor: brass arms and bulbs, drawn lightly so the
// tiles beneath still read
function drawLampFixture() {
    const th = scene.theme;
    const lx = S3_LAMP.x * TILE, ly = S3_LAMP.z * TILE;
    // A style pack hangs its own lamp: its painter if it has one, else a plain ring of light
    const pack = s3Pack(th);
    if (pack) {
        ctx.save();
        ctx.translate(lx, ly);
        if (pack.paint2d && pack.paint2d.lamp) pack.paint2d.lamp(ctx, th);
        else {
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = th.lamp.color;
            ctx.shadowColor = th.lamp.color;
            ctx.shadowBlur = 10;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 0.72 * TILE, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
        return;
    }
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.translate(lx, ly);
    ctx.strokeStyle = scene.palette.brass;
    ctx.lineWidth = 1;
    for (const arm of scene.lampArms) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(arm.x * TILE, arm.y * TILE);
        ctx.stroke();
    }
    for (const arm of scene.lampArms) {
        const bx = arm.x * TILE, by = arm.y * TILE;
        if (th.lamp.on) {
            ctx.shadowColor = th.lamp.color;
            ctx.shadowBlur = 8 * canvasDpr;
            ctx.fillStyle = th.lamp.color;
        } else {
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#FFF4E0';
        }
        ctx.beginPath();
        ctx.arc(bx, by, arm.big ? 3 : 2.3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = scene.palette.brass;
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// Larger, slower motes drifting where the light is
function drawBokeh() {
    const box = scene.moteBox || { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
    for (const m of bokehMotes) {
        m.u += m.vu * dtFrames;
        m.v += m.vv * dtFrames;
        if (m.u < 0 || m.v < 0) {
            m.u = 0.3 + Math.random() * 0.7;
            m.v = 0.5 + Math.random() * 0.5;
        }
        const x = box.x + m.u * box.w, y = box.y + m.v * box.h;
        const a = 0.06 + 0.04 * Math.sin(chargerPulse * 0.01 + m.phase);
        const g = ctx.createRadialGradient(x, y, m.r * 0.3, x, y, m.r);
        g.addColorStop(0, `rgba(255, 250, 230, ${a})`);
        g.addColorStop(0.8, `rgba(255, 245, 220, ${a * 0.6})`);
        g.addColorStop(1, 'rgba(255, 245, 220, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, m.r, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Little clouds of dust kicked up behind the Roomba while it drives
function drawDustPuffs() {
    const tx = roomba.col * TILE + TILE / 2, ty = roomba.row * TILE + TILE / 2;
    const moving = Math.abs(tx - roomba.drawX) > 1 || Math.abs(ty - roomba.drawY) > 1;
    if (moving && gameState === 'PLAYING') {
        const a = FP_ANGLE_MAP[roomba.dir];
        for (let i = 0; i < 2; i++) {
            dustPuffs.push({
                x: roomba.drawX - Math.cos(a) * 16 + (Math.random() - 0.5) * 12,
                y: roomba.drawY - Math.sin(a) * 16 + (Math.random() - 0.5) * 12,
                r: 2 + Math.random() * 2,
                alpha: 0.3,
                vx: -Math.cos(a) * 0.4 + (Math.random() - 0.5) * 0.5,
                vy: -Math.sin(a) * 0.4 + (Math.random() - 0.5) * 0.5,
            });
        }
    }
    for (let i = dustPuffs.length - 1; i >= 0; i--) {
        const p = dustPuffs[i];
        p.x += p.vx * dtFrames;
        p.y += p.vy * dtFrames;
        p.r += 0.35 * dtFrames;
        p.alpha -= 0.011 * dtFrames;
        if (p.alpha <= 0) dustPuffs.splice(i, 1);
    }
    if (dustPuffs.length > 90) dustPuffs.splice(0, dustPuffs.length - 90);
    for (const p of dustPuffs) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(190, 180, 165, ${p.alpha})`);
        g.addColorStop(1, 'rgba(190, 180, 165, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
    }
}

// The cat asleep in each pet bed, breathing
function drawCats() {
    for (const cat of scene.cats) {
        const breath = 1 + 0.035 * Math.sin(chargerPulse * 0.045 + cat.phase);
        ctx.save();
        ctx.translate(cat.x, cat.y);
        ctx.rotate(-cat.yaw);
        const T = TILE;
        const base = cat.color;
        const dark = shadeColor(base, -36), light = shadeColor(base, 26);
        // tail curling out behind
        ctx.strokeStyle = base;
        ctx.lineWidth = 0.075 * T;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(-0.42 * T, 0.1 * T, 0.2 * T, Math.PI * 0.1, Math.PI * 1.15);
        ctx.stroke();
        // body
        const g = ctx.createRadialGradient(-0.12 * T, -0.08 * T, 0.03 * T, -0.05 * T, 0, 0.42 * T);
        g.addColorStop(0, light);
        g.addColorStop(0.55, base);
        g.addColorStop(1, dark);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(-0.05 * T, 0, 0.375 * T * breath, 0.2625 * T * breath, 0, 0, Math.PI * 2);
        ctx.fill();
        // faint tabby stripes along the back
        ctx.strokeStyle = dark;
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = 1.2;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.arc(-0.05 * T + i * 0.11 * T, 0.02 * T, 0.17 * T, Math.PI * 1.2, Math.PI * 1.8);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // head and ears
        const hg = ctx.createRadialGradient(0.34 * T, 0.02 * T, 0.02 * T, 0.38 * T, 0.06 * T, 0.16 * T);
        hg.addColorStop(0, light);
        hg.addColorStop(1, dark);
        ctx.fillStyle = hg;
        for (const ey of [-0.01, 0.13]) {
            ctx.beginPath();
            ctx.moveTo(0.36 * T, ey * T);
            ctx.lineTo(0.5 * T, ey * T - 0.03 * T);
            ctx.lineTo(0.47 * T, ey * T + 0.06 * T);
            ctx.closePath();
            ctx.fill();
        }
        ctx.beginPath();
        ctx.ellipse(0.38 * T, 0.06 * T, 0.15 * T, 0.14 * T, 0, 0, Math.PI * 2);
        ctx.fill();
        // closed eyes
        ctx.strokeStyle = dark;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0.44 * T, 0.02 * T, 0.03 * T, Math.PI * 0.1, Math.PI * 0.9);
        ctx.moveTo(0.44 * T + 0.03 * T, 0.1 * T);
        ctx.arc(0.44 * T, 0.1 * T, 0.03 * T, Math.PI * 0.1, Math.PI * 0.9);
        ctx.stroke();
        ctx.restore();
    }
}
