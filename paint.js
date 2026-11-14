// === PAINTED ROOMS ===
// A room with `paint: 'watercolor'` is not vacuumed, it is painted. The floor is a sheet
// of rough paper, the vacuum carries a loaded brush, and every tile it crosses takes colour.
// The rules do not change: a tile the vacuum has crossed is done, whatever the paint does next.
//
// The paint itself is Blooms' watercolor engine (watercolor.js, vendor/blooms/). It is a
// living wash: colour keeps moving on the water, is pushed aside by new colour, and sets
// into the paper when the vacuum rests. So the paint cannot say which tiles are done.
// A light pencil hatch does that: it marks each tile still to paint and goes as the tile is done.
//
// What the vacuum does, in the engine's terms:
//   - Each trip out from the dock is one stroke, in the palette's next pigment.
//   - The brush empties as the battery does, and the dock refills both.
//   - Waiting on the dock lets clean water run in under it: a bloom.

const PAINT_STEP = 1 / 60;        // the engine is stepped at this rate, whatever the display's
const PAINT_LAG = 0.07;           // seconds the brush trails the vacuum, which rounds its corners
const PAINT_STILL_CAP = 0.45;     // the engine reloads a brush that rests longer than this; only the dock may
const PAINT_DOCK_BLOOM = 1.3;     // seconds of water the dock gives each visit
const PAINT_HOLD_DELAY = 0.28;    // the engine's own pause before water starts to run
const PAINT_EMPTY_AT = 0.3;       // how much paint is left in the brush when the battery runs out
const PAINT_ADMIRE_FRAMES = 120;  // frames (at 60 a second) a finished painting is shown before the result card
// Blooms' palettes, in the order fresh sheets take them. Dusk is left out: it turns to mud.
const PAINT_PALETTES = [0, 3, 6, 7, 5, 2, 4];
// The same palettes for the plain wash, as the colours look on paper
const PAINT_FLAT_COLOURS = {
    0: [[38, 122, 196], [44, 176, 174], [222, 164, 78], [58, 74, 120]],
    3: [[112, 66, 168], [216, 138, 148], [36, 140, 116], [58, 74, 120]],
    6: [[36, 140, 116], [112, 150, 52], [240, 172, 44], [62, 150, 210]],
    7: [[226, 62, 122], [216, 138, 148], [222, 164, 78], [58, 78, 196]],
    5: [[62, 150, 210], [44, 176, 174], [58, 78, 196], [84, 86, 104]],
    2: [[112, 150, 52], [240, 172, 44], [180, 92, 52], [150, 44, 62]],
    4: [[240, 172, 44], [180, 92, 52], [150, 44, 62], [58, 74, 120]],
};
const PAINT_PAPER = [246, 241, 230];

const paint = {
    level: -1,          // the room this sheet was laid for
    sheet: null,        // what holds the picture: the engine's sheet, or the plain wash
    sheetNo: 0,         // sheets laid so far; picks the palette and the grain
    bx: 0, by: 0,       // the brush, in board pixels
    placed: false,
    inStroke: false,    // the engine has a stroke open for this brush
    newStroke: false,   // the next move starts a new one
    wasCharging: true,
    still: 0,
    speed: 0,
    dockHold: 0,
    strokes: 0,         // strokes begun on this sheet
    acc: 0,
    version: 0,         // goes up whenever the picture changes, so the 3D floor knows to take it again
    ptr: { id: 1, x: 0, y: 0, px: 0, py: 0, speed: 0, still: 0, engaged: false, isNew: false },
};

function isPaintRoom(levelIndex) {
    const lv = LEVELS[levelIndex === undefined ? currentLevel : levelIndex];
    return !!(lv && lv.paint);
}

// --- Paper and pencil, drawn with the 2D canvas ----------------------------------------------

// Rough warm-white paper: the plain wash paints on it, and the 3D floor takes its tooth from it
function paintPaper(t, w, h, seed) {
    t.fillStyle = `rgb(${PAINT_PAPER[0]}, ${PAINT_PAPER[1]}, ${PAINT_PAPER[2]})`;
    t.fillRect(0, 0, w, h);
    const rnd = seededRandom(seed || 1);
    const grains = Math.round(w * h / 60);
    for (let i = 0; i < grains; i++) {
        const dark = rnd() < 0.55;
        t.fillStyle = dark ? `rgba(120, 104, 80, ${0.04 + rnd() * 0.06})` : `rgba(255, 255, 255, ${0.2 + rnd() * 0.3})`;
        const s = 1 + rnd() * 2.2;
        t.fillRect(rnd() * w, rnd() * h, s, s);
    }
}

// The mark on a tile still to paint: three loose strokes of soft pencil. Drawn into an
// n-pixel square; shared with the 3D floor, which asks for a bolder hand (`bold` above 1)
// because it sees the floor at a slant and from far off.
function paintPencilMark(t, n, v, bold) {
    const k = n / TILE;
    const w = bold || 1;
    const rnd = seededRandom(911 + v * 53);
    const angle = -Math.PI / 4 + (rnd() - 0.5) * 0.5;
    const ux = Math.cos(angle), uy = Math.sin(angle);
    t.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
        const cx = n / 2 - uy * i * 6.5 * k + (rnd() - 0.5) * 2 * k;
        const cy = n / 2 + ux * i * 6.5 * k + (rnd() - 0.5) * 2 * k;
        const half = (6 + rnd() * 3.5) * k;
        const bend = (rnd() - 0.5) * 5 * k;
        for (let pass = 0; pass < 2; pass++) {
            const j = pass * 0.7 * k;
            t.strokeStyle = `rgba(78, 80, 94, ${Math.min(1, (pass ? 0.14 : 0.34) * w)})`;
            t.lineWidth = (pass ? 1.6 : 0.9) * k * w;
            t.beginPath();
            t.moveTo(cx - ux * half + j, cy - uy * half + j);
            t.quadraticCurveTo(cx - uy * bend + j, cy + ux * bend + j, cx + ux * half + j, cy + uy * half + j);
            t.stroke();
        }
    }
}

// --- The plain wash: what paints the floor where the engine cannot run -------------------------

function paintFlatSheet(seed, palette, phone) {
    const scale = phone ? 1 : 2;
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W * scale;
    canvas.height = CANVAS_H * scale;
    const t = canvas.getContext('2d');
    paintPaper(t, canvas.width, canvas.height, seed);
    const colours = PAINT_FLAT_COLOURS[palette] || PAINT_FLAT_COLOURS[0];
    const short = Math.min(canvas.width, canvas.height);
    const rnd = seededRandom(seed + 5);
    let turn = -1;
    let open = false;       // a stroke is under way
    let travelled = 0;
    let reach = 2.4;
    return {
        kind: 'flat',
        canvas,
        palette: 'wash',
        lost: false,
        atRest: () => true,
        get turn() { return turn; },
        setReach(shortEdges) { reach = Math.max(0.5, shortEdges); },
        // Follows the engine's rule for strokes: a brush that was away, or is marked new, takes the next pigment
        step(dt, pointers) {
            const p = pointers[0];
            if (!p) {
                open = false;
                return;
            }
            if (!open || p.isNew) {
                open = true;
                turn = (turn + 1) % 4;
                travelled = 0;
            }
            const ax = p.px * short, ay = canvas.height - p.py * short;
            const bx = p.x * short, by = canvas.height - p.y * short;
            const seg = Math.hypot(bx - ax, by - ay);
            if (seg < 0.01) return;
            const load = Math.max(0.2, Math.exp(-travelled / reach));
            const [r, g, b] = colours[turn];
            const radius = short / ROWS * 0.6;
            t.globalCompositeOperation = 'multiply';
            const dabs = Math.max(1, Math.ceil(seg / (radius * 0.3)));
            for (let i = 1; i <= dabs; i++) {
                const f = i / dabs;
                const x = ax + (bx - ax) * f + (rnd() - 0.5) * radius * 0.3;
                const y = ay + (by - ay) * f + (rnd() - 0.5) * radius * 0.3;
                const rr = radius * (0.8 + rnd() * 0.4);
                const wash = t.createRadialGradient(x, y, 0, x, y, rr);
                wash.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.1 * load})`);
                wash.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${0.07 * load})`);
                wash.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
                t.fillStyle = wash;
                t.beginPath();
                t.arc(x, y, rr, 0, Math.PI * 2);
                t.fill();
            }
            t.globalCompositeOperation = 'source-over';
            travelled += seg / short;
        },
        draw() {},
        dispose() {},
    };
}

// --- Sheets -----------------------------------------------------------------------------------

function paintPalette() {
    return PAINT_PALETTES[Math.max(0, paint.sheetNo - 1) % PAINT_PALETTES.length];
}

function paintSeed() {
    return (paint.level + 1) * 7919 + paint.sheetNo * 104729;
}

function paintOnPhone() {
    return typeof DESIGN_ON_PHONE !== 'undefined' && !!DESIGN_ON_PHONE;
}

function paintEngineSheet() {
    if (typeof wcEngine === 'undefined' || !wcEngine || !wcEngine.create) return null;
    const made = wcEngine.create({ aspect: CANVAS_W / CANVAS_H, palette: paintPalette(), seed: paintSeed(), phone: paintOnPhone() });
    if (made) made.kind = 'engine';
    return made;
}

// A new sheet of paper for the room on screen: every start and every restart gets one,
// with the next palette. Does nothing in a room that is not painted.
function paintFreshSheet() {
    if (paint.sheet) paint.sheet.dispose();
    paint.sheet = null;
    paint.level = -1;
    if (!isPaintRoom()) return;
    paint.level = currentLevel;
    paint.sheetNo++;
    paint.sheet = paintEngineSheet() || paintFlatSheet(paintSeed(), paintPalette(), paintOnPhone());
    paint.placed = false;
    paint.inStroke = false;
    paint.newStroke = false;
    paint.wasCharging = true;
    paint.still = 0;
    paint.speed = 0;
    paint.dockHold = 0;
    paint.strokes = 0;
    paint.acc = 0;
    paint.version++;
}

// The engine arrives a moment after the page (it is a module), and a phone can take its
// graphics away. A sheet no brush has touched moves to the engine; a lost one falls back.
function paintAdopt() {
    const s = paint.sheet;
    if (!s) return;
    if (s.kind === 'flat' && paint.strokes === 0) {
        const made = paintEngineSheet();
        if (made) {
            paint.sheet = made;
            paint.inStroke = false;
            paint.version++;
        }
    } else if (s.kind === 'engine' && s.lost) {
        s.dispose();
        paint.sheet = paintFlatSheet(paintSeed(), paintPalette(), paintOnPhone());
        paint.inStroke = false;
        paint.version++;
    }
}

// The canvas holding the painted floor, or null in a room that is not painted
function paintPicture() {
    return paint.sheet && paint.level === currentLevel ? paint.sheet.canvas : null;
}

// --- The brush ----------------------------------------------------------------------------------

// Where the brush should be: under the vacuum. Null lifts it (the par replay does not paint).
function paintBrushTarget() {
    if (gameState !== 'PLAYING' && gameState !== 'LEVEL_COMPLETE' && gameState !== 'GAME_OVER') return null;
    return { col: roomba.col, row: roomba.row, x: roomba.col * TILE + TILE / 2, y: roomba.row * TILE + TILE / 2 };
}

// Moves a full battery pays for in this room, with the upgrades the player owns
function paintFullCharge() {
    const net = moveCost() - solarPerMove();
    return net <= 0 ? 999 : batteryMax() / net;
}

// Move the brush for one step and say what the engine should see: its pointers
function paintBrush(dt) {
    const target = paintBrushTarget();
    if (!target) {
        paint.inStroke = false;
        paint.placed = false;
        return [];
    }
    const short = Math.min(CANVAS_W, CANVAS_H);
    if (!paint.placed || Math.hypot(target.x - paint.bx, target.y - paint.by) > TILE * 2.5) {
        // first placing, or the vacuum was put somewhere else: no stroke is drawn across the room
        paint.bx = target.x;
        paint.by = target.y;
        paint.placed = true;
        paint.inStroke = false;
        paint.speed = 0;
        return [];
    }
    const ox = paint.bx, oy = paint.by;
    const k = 1 - Math.exp(-dt / PAINT_LAG);
    paint.bx += (target.x - paint.bx) * k;
    paint.by += (target.y - paint.by) * k;
    if (Math.hypot(target.x - paint.bx, target.y - paint.by) < 0.2) {
        paint.bx = target.x;
        paint.by = target.y;
    }
    const seg = Math.hypot(paint.bx - ox, paint.by - oy);
    const moving = seg > 0.01;

    // Leaving the dock (or any tile that charges) starts the next stroke, in the next pigment
    const charging = isChargingTile(target.col, target.row);
    if (paint.wasCharging && !charging && paint.inStroke) paint.newStroke = true;
    paint.wasCharging = charging;

    paint.speed += (seg / dt / short - paint.speed) * (1 - Math.exp(-dt / 0.15));
    paint.still = moving ? 0 : Math.min(PAINT_STILL_CAP, paint.still + dt);

    // Only the dock itself gives water, and only for a moment each visit
    const dock = LEVELS[currentLevel].charger;
    const onDock = target.col === dock.col && target.row === dock.row;
    if (!onDock) paint.dockHold = 0;
    const engaged = onDock && !moving && paint.strokes > 0 && paint.dockHold < PAINT_DOCK_BLOOM;
    if (engaged && paint.still > PAINT_HOLD_DELAY) paint.dockHold += dt;

    if (!moving && !paint.inStroke) return []; // nothing to say until the first move
    const p = paint.ptr;
    p.px = ox / short;
    p.py = (CANVAS_H - oy) / short;
    p.x = paint.bx / short;
    p.y = (CANVAS_H - paint.by) / short;
    p.speed = paint.speed;
    p.still = paint.still;
    p.engaged = engaged;
    p.isNew = false;
    if (moving) {
        if (!paint.inStroke) {
            paint.strokes++;
        } else if (paint.newStroke) {
            p.isNew = true;
            paint.strokes++;
        }
        paint.newStroke = false;
        paint.inStroke = true;
    }
    return [p];
}

function paintAdvance(dt) {
    const s = paint.sheet;
    // the brush is mostly empty when a full battery is spent; the engine counts in short edges
    s.setReach(paintFullCharge() / Math.min(COLS, ROWS) / Math.log(1 / PAINT_EMPTY_AT));
    const pointers = paintBrush(dt);
    if (!pointers.length && s.atRest()) return false; // the paint has set and nothing moves: no work at all
    s.step(dt, pointers);
    return true;
}

// Called once a frame by the game
function paintTick(ms) {
    if (!isPaintRoom()) {
        if (paint.sheet) paintFreshSheet(); // left the room: put the sheet away
        return;
    }
    if (gameState === 'EDITING') return;
    if (paint.level !== currentLevel || !paint.sheet) paintFreshSheet();
    paintAdopt();
    paint.acc += Math.min(0.1, Math.max(0, ms) / 1000);
    let worked = false;
    let n = 0;
    while (paint.acc >= PAINT_STEP && n < 2) {
        paint.acc -= PAINT_STEP;
        n++;
        if (paintAdvance(PAINT_STEP)) worked = true;
    }
    if (paint.acc > PAINT_STEP * 2) paint.acc = 0; // fell behind: drop the backlog rather than race
    if (worked) {
        paint.sheet.draw();
        paint.version++;
    }
}

// For tuning and tests: run the paint for some seconds without waiting for frames
function paintRun(seconds) {
    if (!paint.sheet) return 0;
    const steps = Math.round(seconds / PAINT_STEP);
    for (let i = 0; i < steps; i++) paintAdvance(PAINT_STEP);
    paint.sheet.draw();
    paint.version++;
    return steps;
}
