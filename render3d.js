// === FIRST-PERSON RENDERER ===
// Classic script sharing globals with game.js (loaded after scene2d.js).
//
// A software raycaster drawing into an ImageData buffer, one ray per pixel column, at up to
// the display's full pixel density. Rays keep going past low furniture so the wall behind a
// couch shows above it, and table tops are open underneath. Light comes from a baked lightmap
// (a window on the north wall with soft shadows, a ceiling lamp, the dock's blue glow, ambient
// occlusion), plus the vacuum's own light and its flashlight. Polished floor tiles reflect the
// walls, furniture and sprites. A bloom, grade and vignette pass finishes each frame.

// --- Settings -----------------------------------------------------------------

const FP_EYE = 0.28;                         // camera height in tile units; walls are 1.0
const FP_HORIZON_FRAC = 0.47;                // pitched slightly down: the floor is the game
const FP_MAX_STEPS = 48;
const FP_FOG = [236, 226, 208];              // warm haze
const FP_FOG_PER_TILE = 0.028;
const FP_FOG_MAX = 0.4;
const FP_FOV = Math.PI / 3;                  // 60 degree field of view
const FP_HEIGHT_FACTORS = { wall: 1.0, couch: 0.55, table: 0.5, chair: 0.65, plant: 0.9, petbed: 0.25 };
const FP_SPRITE_TYPES = { plant: 'spritePlant', chair: 'spriteChair', mote: 'mote' };
const FP_BOTTOM_FACTORS = { table: 0.42 };   // raised slabs you can see under
const FP_TABLE_LEG_INSET = 0.17;             // how far in from the table's edge its legs stand
const FP_SPRITE_SIZE = {
    plant: { w: 0.8, h: 0.95 },
    chair: { w: 0.85, h: 0.7 },
    mote: { w: 0.045, h: 0.045 },
    tableLeg: { w: 0.16, h: FP_BOTTOM_FACTORS.table }, // floor up to the underside of the top
};
const FP_MINIMAP_SCALE = 9;
const FP_RES_MAX = 1.5;                      // internal resolution as a multiple of the canvas size
const FP_SLOW_FRAME_MS = 14;                 // average frame cost that drops the resolution a notch
const FP_LIGHT_CELLS = 8;                    // lightmap cells per tile
const FP_WINDOW = { x0: 10.75, x1: 14.25 };  // on the north wall, where the 2D light comes from
const FP_LAMP = { x: 7.5, y: 6 };            // ceiling lamp over the middle of the room
const FP_REFLECT = { clean: 0.55, dirty: 0, dock: 0.35 };   // only polished tiles reflect
// 4x4 ordered dither (-0.5..0.5) applied to lightmap sample positions so cells never band
const FP_DITHER = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47));
const FP_FX = { reflections: true, bloom: true, motes: true, shaft: true, bob: true };
const FP_LIGHT_GAIN = 1.15;                  // flashlight strength

let fp3d = null;      // renderer state: buffers, textures, lightmap, motes
const fpLight = { on: false, dim: 1, r: 0, g: 0, b: 0 }; // flashlight for the frame being drawn
const fpDive = { t: 0, dir: 0, rx: 0, ry: 0 };         // view transition in progress

function lerpAngle(from, to, t) {
    let diff = to - from;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return from + diff * t;
}

// --- Textures -------------------------------------------------------------------

// Bake a canvas region to packed 0xAARRGGBB texels with its size attached
function fpTextureFromCanvas(c, sx, sy, w, h) {
    const data = c.getContext('2d').getImageData(sx, sy, w, h).data;
    const out = new Uint32Array(w * h);
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let i = 0; i < out.length; i++) {
        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
        out[i] = (a << 24) | (r << 16) | (g << 8) | b;
        if (a > 127) { sr += r; sg += g; sb += b; n++; }
    }
    n = n || 1;
    out.w = w;
    out.h = h;
    out.avg = ((sr / n) << 16) | ((sg / n) << 8) | (sb / n);
    return out;
}

function fpMakeTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    return fpTextureFromCanvas(c, 0, 0, w, h);
}

function fpRand(seed) {
    return seededRandom(seed);
}

function fpBuildTextures() {
    const tex = {};
    const S = 256;

    // Room walls: warm plaster with a wooden baseboard and a picture rail
    tex.plaster = fpMakeTexture(S, S, (t, n) => {
        const g = t.createLinearGradient(0, 0, 0, n);
        g.addColorStop(0, '#E6DECF');
        g.addColorStop(1, '#EFE7D8');
        t.fillStyle = g;
        t.fillRect(0, 0, n, n);
        const rnd = fpRand(21);
        for (let i = 0; i < 2600; i++) {
            t.fillStyle = `rgba(${rnd() < 0.5 ? '120,100,80' : '255,255,255'}, ${0.03 + rnd() * 0.06})`;
            t.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 2, 1 + rnd() * 2);
        }
        // picture rail
        t.fillStyle = '#CDBB9C';
        t.fillRect(0, n * 0.2, n, n * 0.016);
        t.fillStyle = 'rgba(0,0,0,0.18)';
        t.fillRect(0, n * 0.216, n, n * 0.012);
        t.fillStyle = 'rgba(255,255,255,0.35)';
        t.fillRect(0, n * 0.2, n, 2);
        // baseboard
        const bb = n * 0.9;
        const bg = t.createLinearGradient(0, bb, 0, n);
        bg.addColorStop(0, '#D4B896');
        bg.addColorStop(0.2, '#B89470');
        bg.addColorStop(0.7, '#9A7A58');
        bg.addColorStop(1, '#7A5A3E');
        t.fillStyle = bg;
        t.fillRect(0, bb, n, n - bb);
        t.fillStyle = 'rgba(255,255,255,0.3)';
        t.fillRect(0, bb, n, 2);
        t.fillStyle = 'rgba(0,0,0,0.25)';
        t.fillRect(0, bb - 3, n, 3);
    });

    // Interior walls: brick, matching the 2D wall tile
    tex.wall = fpMakeTexture(S, S, (t, n) => {
        t.fillStyle = '#A89890';
        t.fillRect(0, 0, n, n);
        const bricks = ['#826565', '#8A7070', '#7A5E5E', '#908580', '#7E6262'];
        const bw = n / 4, bh = n / 8;
        const rnd = fpRand(3);
        for (let row = 0; row < 8; row++) {
            const off = (row % 2) * (bw / 2);
            for (let i = -1; i <= 4; i++) {
                const x = i * bw + off + 2, y = row * bh + 2, w = bw - 4, h = bh - 4;
                const base = bricks[(row * 3 + i + 6) % bricks.length];
                const g = t.createLinearGradient(x, y, x, y + h);
                g.addColorStop(0, shadeColor(base, 14));
                g.addColorStop(1, shadeColor(base, -16));
                t.fillStyle = g;
                t.fillRect(x, y, w, h);
                t.fillStyle = 'rgba(255,255,255,0.12)';
                t.fillRect(x, y, w, 2);
                t.fillStyle = 'rgba(0,0,0,0.22)';
                t.fillRect(x, y + h - 2, w, 2);
                for (let k = 0; k < 6; k++) {
                    t.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.06})`;
                    t.fillRect(x + rnd() * w, y + rnd() * h, 2 + rnd() * 5, 1 + rnd() * 2);
                }
            }
        }
    });

    // The window: frame, panes, bright sky and a soft garden below (emissive in the scene)
    tex.window = fpMakeTexture(512, S, (t, w, h) => {
        t.fillStyle = '#B9AF9E';
        t.fillRect(0, 0, w, h);
        const fx = w * 0.06, fy = h * 0.14, fw = w * 0.88, fh = h * 0.66;
        t.fillStyle = '#CFC7B8';
        t.fillRect(fx - 10, fy - 10, fw + 20, fh + 20);
        t.fillStyle = 'rgba(0,0,0,0.18)';
        t.fillRect(fx - 10, fy + fh + 6, fw + 20, 4);
        const sky = t.createLinearGradient(0, fy, 0, fy + fh);
        sky.addColorStop(0, '#CFE9FF');
        sky.addColorStop(0.45, '#F3FAFF');
        sky.addColorStop(0.62, '#D8EFC4');
        sky.addColorStop(1, '#8FBF72');
        t.fillStyle = sky;
        t.fillRect(fx, fy, fw, fh);
        const rnd = fpRand(9);
        for (let i = 0; i < 40; i++) {
            t.fillStyle = `rgba(90, 150, 70, ${0.12 + rnd() * 0.2})`;
            t.beginPath();
            t.ellipse(fx + rnd() * fw, fy + fh * (0.62 + rnd() * 0.36), 18 + rnd() * 30, 10 + rnd() * 16, 0, 0, Math.PI * 2);
            t.fill();
        }
        // mullions
        t.fillStyle = '#CFC7B8';
        for (let i = 1; i < 3; i++) t.fillRect(fx + (fw * i) / 3 - 5, fy, 10, fh);
        t.fillRect(fx, fy + fh / 2 - 5, fw, 10);
        t.fillStyle = 'rgba(0,0,0,0.15)';
        for (let i = 1; i < 3; i++) t.fillRect(fx + (fw * i) / 3 + 5, fy, 2, fh);
        t.fillRect(fx, fy + fh / 2 + 5, fw, 2);
        // sill
        t.fillStyle = '#B4A890';
        t.fillRect(fx - 16, fy + fh + 10, fw + 32, 10);
        t.fillStyle = 'rgba(255,255,255,0.45)';
        t.fillRect(fx - 16, fy + fh + 10, fw + 32, 2);
        // baseboard to match the plaster
        const bb = h * 0.9;
        const bg = t.createLinearGradient(0, bb, 0, h);
        bg.addColorStop(0, '#A89070');
        bg.addColorStop(0.7, '#7A5E42');
        bg.addColorStop(1, '#604630');
        t.fillStyle = bg;
        t.fillRect(0, bb, w, h - bb);
    });

    tex.couch = fpMakeTexture(S, S, (t, n) => {
        t.fillStyle = '#5D4037';
        t.fillRect(0, 0, n, n);
        const rnd = fpRand(5);
        for (let y = 0; y < n; y += 3) {
            t.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.04})`;
            t.fillRect(0, y, n, 1);
        }
        for (let i = 0; i < 900; i++) {
            t.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.08})`;
            t.fillRect(rnd() * n, rnd() * n, 1, 1 + rnd() * 2);
        }
        // cushion top band with piping, skirt below
        const top = t.createLinearGradient(0, 0, 0, n * 0.24);
        top.addColorStop(0, '#7A5A4C');
        top.addColorStop(1, '#5D4037');
        t.fillStyle = top;
        t.fillRect(0, 0, n, n * 0.24);
        t.fillStyle = '#3E2723';
        t.fillRect(0, n * 0.24, n, 3);
        t.fillStyle = 'rgba(255,255,255,0.18)';
        t.fillRect(0, 0, n, 3);
        t.fillStyle = '#4A3028';
        t.fillRect(0, n * 0.84, n, n * 0.16);
        t.fillStyle = 'rgba(0,0,0,0.25)';
        t.fillRect(0, n * 0.84, n, 3);
        // seams between cushions
        t.fillStyle = '#3E2723';
        t.fillRect(n / 3 - 2, 0, 4, n * 0.84);
        t.fillRect((2 * n) / 3 - 2, 0, 4, n * 0.84);
        t.fillStyle = 'rgba(255,255,255,0.1)';
        t.fillRect(n / 3 + 2, 0, 1, n * 0.84);
        t.fillRect((2 * n) / 3 + 2, 0, 1, n * 0.84);
    });

    tex.table = fpMakeTexture(S, S, (t, n) => {
        t.fillStyle = '#7D5E53';
        t.fillRect(0, 0, n, n);
        const rnd = fpRand(7);
        t.lineWidth = 1.5;
        for (let i = 0; i < 22; i++) {
            const y = 4 + i * 11 + rnd() * 4;
            t.strokeStyle = `rgba(80, 50, 25, ${0.2 + rnd() * 0.25})`;
            t.beginPath();
            t.moveTo(0, y);
            t.bezierCurveTo(n * 0.3, y + rnd() * 6 - 3, n * 0.7, y - rnd() * 6 + 3, n, y + rnd() * 4 - 2);
            t.stroke();
        }
        const top = t.createLinearGradient(0, 0, 0, n * 0.12);
        top.addColorStop(0, 'rgba(255,255,255,0.35)');
        top.addColorStop(1, 'rgba(255,255,255,0)');
        t.fillStyle = top;
        t.fillRect(0, 0, n, n * 0.12);
        t.fillStyle = '#6D5040';
        t.fillRect(0, n * 0.12, n, 5);
        t.fillStyle = 'rgba(0,0,0,0.2)';
        t.fillRect(0, n * 0.17, n, 3);
    });

    tex.chair = fpMakeTexture(S, S, (t, n) => {
        t.fillStyle = '#757575';
        t.fillRect(0, 0, n, n);
        for (let x = 0; x < n; x += n / 8) {
            const g = t.createLinearGradient(x, 0, x + n / 8, 0);
            g.addColorStop(0, '#8E8E8E');
            g.addColorStop(0.5, '#6A6A6A');
            g.addColorStop(1, '#5C5C5C');
            t.fillStyle = g;
            t.fillRect(x, 0, n / 8, n);
        }
        t.fillStyle = '#505050';
        t.fillRect(0, n * 0.55, n, 8);
        t.fillStyle = 'rgba(0,0,0,0.3)';
        t.fillRect(0, n * 0.9, n, n * 0.1);
    });

    tex.petbed = fpMakeTexture(S, S, (t, n) => {
        t.fillStyle = '#E57373';
        t.fillRect(0, 0, n, n);
        const rnd = fpRand(13);
        for (let i = 0; i < 1800; i++) {
            t.fillStyle = `rgba(255,255,255,${0.04 + rnd() * 0.08})`;
            t.fillRect(rnd() * n, rnd() * n, 2, 2);
        }
        const rim = t.createLinearGradient(0, 0, 0, n * 0.32);
        rim.addColorStop(0, '#F5B0B0');
        rim.addColorStop(1, '#E88A8A');
        t.fillStyle = rim;
        t.fillRect(0, 0, n, n * 0.32);
        t.strokeStyle = 'rgba(160, 60, 60, 0.6)';
        t.setLineDash([8, 6]);
        t.lineWidth = 3;
        t.beginPath();
        t.moveTo(0, n * 0.32 + 5);
        t.lineTo(n, n * 0.32 + 5);
        t.stroke();
        t.setLineDash([]);
    });

    tex.ceiling = fpMakeTexture(S, S, (t, n) => {
        t.fillStyle = '#EDE7DB';
        t.fillRect(0, 0, n, n);
        const rnd = fpRand(11);
        for (let i = 0; i < 2200; i++) {
            t.fillStyle = `rgba(120, 100, 80, ${0.02 + rnd() * 0.05})`;
            t.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 3, 1);
        }
    });

    // Floor: a 4x4-tile stretch of the same planks as the 2D board, so the boards run across tiles
    const tile = 128;
    const atlas = document.createElement('canvas');
    atlas.width = tile * 4;
    atlas.height = tile * 4;
    paintWoodFloor(atlas.getContext('2d'), 4242, tile, 4, 4);
    tex.floorDirty = [];
    tex.floorClean = [];
    tex.floorDirtyPad = [];
    tex.floorCleanPad = [];
    const padWash = (t, n) => {
        t.fillStyle = 'rgba(70, 140, 255, 0.38)';
        t.fillRect(0, 0, n, n);
        t.strokeStyle = 'rgba(150, 200, 255, 0.75)';
        t.lineWidth = 5;
        t.strokeRect(2.5, 2.5, n - 5, n - 5);
    };
    for (let i = 0; i < 16; i++) {
        const sx = (i % 4) * tile, sy = Math.floor(i / 4) * tile;
        const variant = (t, n, clean, pad) => {
            t.drawImage(atlas, sx, sy, tile, tile, 0, 0, n, n);
            if (clean) paintGlaze(t, n);
            else paintDust(t, n, i % 3);
            if (pad) padWash(t, n);
        };
        tex.floorDirty.push(fpMakeTexture(tile, tile, (t, n) => variant(t, n, false, false)));
        tex.floorClean.push(fpMakeTexture(tile, tile, (t, n) => variant(t, n, true, false)));
        tex.floorDirtyPad.push(fpMakeTexture(tile, tile, (t, n) => variant(t, n, false, true)));
        tex.floorCleanPad.push(fpMakeTexture(tile, tile, (t, n) => variant(t, n, true, true)));
    }

    tex.dock = fpMakeTexture(tile, tile, (t, n) => {
        t.drawImage(atlas, 0, 0, tile, tile, 0, 0, n, n);
        const glow = t.createRadialGradient(n / 2, n / 2, 4, n / 2, n / 2, n * 0.7);
        glow.addColorStop(0, 'rgba(60, 180, 255, 0.6)');
        glow.addColorStop(1, 'rgba(60, 140, 255, 0)');
        t.fillStyle = glow;
        t.fillRect(0, 0, n, n);
        t.fillStyle = 'rgba(0,0,0,0.25)';
        t.beginPath();
        t.ellipse(n / 2 + 2, n / 2 + 4, n * 0.36, n * 0.33, 0, 0, Math.PI * 2);
        t.fill();
        const dg = t.createLinearGradient(n * 0.15, n * 0.15, n * 0.85, n * 0.85);
        dg.addColorStop(0, '#6A6A6A');
        dg.addColorStop(1, '#3A3A3A');
        t.fillStyle = dg;
        roundRect(t, n * 0.15, n * 0.15, n * 0.7, n * 0.7, 14);
        t.fill();
        t.fillStyle = '#262626';
        roundRect(t, n * 0.25, n * 0.25, n * 0.5, n * 0.5, 10);
        t.fill();
        t.fillStyle = '#FFD600';
        const cx = n / 2, cy = n / 2, k = n / 64;
        t.beginPath();
        t.moveTo(cx - 3 * k, cy - 10 * k); t.lineTo(cx + 6 * k, cy - 10 * k); t.lineTo(cx + 1 * k, cy - 1 * k);
        t.lineTo(cx + 6 * k, cy - 1 * k); t.lineTo(cx - 3 * k, cy + 10 * k); t.lineTo(cx + 1 * k, cy + 1 * k);
        t.lineTo(cx - 5 * k, cy + 1 * k); t.closePath();
        t.fill();
    });

    // Billboard sprites with transparency
    tex.spritePlant = fpMakeTexture(S, S, (t, n) => {
        t.clearRect(0, 0, n, n);
        const pot = t.createLinearGradient(n * 0.28, 0, n * 0.72, 0);
        pot.addColorStop(0, '#9A5835');
        pot.addColorStop(0.4, '#D08858');
        pot.addColorStop(1, '#9A5835');
        t.fillStyle = pot;
        t.beginPath();
        t.moveTo(n * 0.28, n * 0.62);
        t.lineTo(n * 0.72, n * 0.62);
        t.lineTo(n * 0.66, n * 0.98);
        t.lineTo(n * 0.34, n * 0.98);
        t.closePath();
        t.fill();
        t.fillStyle = '#8A4E2E';
        t.fillRect(n * 0.26, n * 0.6, n * 0.48, n * 0.07);
        t.fillStyle = 'rgba(255,255,255,0.25)';
        t.fillRect(n * 0.26, n * 0.6, n * 0.48, 3);
        const rnd = fpRand(5);
        const greens = ['#4CAF50', '#388E3C', '#2E7D32', '#5CBF60', '#43A047', '#66BB6A'];
        t.fillStyle = '#2E7D32';
        t.fillRect(n * 0.485, n * 0.4, n * 0.03, n * 0.24);
        for (let i = 0; i < 46; i++) {
            const a = rnd() * Math.PI * 2;
            const len = n * (0.14 + rnd() * 0.24);
            const cx = n * 0.5 + Math.cos(a) * len * 0.55;
            const cy = n * 0.36 + Math.sin(a) * len * 0.5;
            t.fillStyle = greens[i % greens.length];
            t.beginPath();
            t.ellipse(cx, cy, len * 0.5, len * 0.17, a, 0, Math.PI * 2);
            t.fill();
            t.strokeStyle = 'rgba(0,0,0,0.18)';
            t.lineWidth = 1;
            t.stroke();
        }
    });

    tex.spriteChair = fpMakeTexture(S, S, (t, n) => {
        t.clearRect(0, 0, n, n);
        const dark = '#555', mid = '#7A7A7A', light = '#969696';
        t.fillStyle = mid;
        t.fillRect(n * 0.22, n * 0.04, n * 0.08, n * 0.5);
        t.fillRect(n * 0.70, n * 0.04, n * 0.08, n * 0.5);
        t.fillStyle = light;
        t.fillRect(n * 0.22, n * 0.06, n * 0.56, n * 0.07);
        t.fillRect(n * 0.22, n * 0.2, n * 0.56, n * 0.06);
        t.fillRect(n * 0.22, n * 0.33, n * 0.56, n * 0.06);
        const seat = t.createLinearGradient(0, n * 0.5, 0, n * 0.62);
        seat.addColorStop(0, '#9A9A9A');
        seat.addColorStop(1, '#6A6A6A');
        t.fillStyle = seat;
        t.fillRect(n * 0.14, n * 0.5, n * 0.72, n * 0.12);
        t.fillStyle = dark;
        t.fillRect(n * 0.17, n * 0.62, n * 0.07, n * 0.36);
        t.fillRect(n * 0.76, n * 0.62, n * 0.07, n * 0.36);
        t.fillRect(n * 0.3, n * 0.62, n * 0.05, n * 0.3);
        t.fillRect(n * 0.65, n * 0.62, n * 0.05, n * 0.3);
        t.fillRect(n * 0.17, n * 0.8, n * 0.66, n * 0.04);
    });

    // A turned wooden table leg: an apron block under the top, a tapering shaft, a foot
    tex.tableLeg = fpMakeTexture(32, 256, (t, w, h) => {
        t.clearRect(0, 0, w, h);
        const wood = t.createLinearGradient(w * 0.25, 0, w * 0.75, 0);
        wood.addColorStop(0, '#8E6A55');
        wood.addColorStop(0.3, '#6E4E3F');
        wood.addColorStop(1, '#3A2820');
        t.fillStyle = wood;
        t.fillRect(w * 0.1, 0, w * 0.8, h * 0.13);              // apron
        const halfAt = (f) => 0.25 - (0.07 * (f - 0.13)) / 0.82; // shaft half-width, tapering down
        t.beginPath();
        t.moveTo(w * (0.5 - halfAt(0.13)), h * 0.13);
        t.lineTo(w * (0.5 + halfAt(0.13)), h * 0.13);
        t.lineTo(w * (0.5 + halfAt(0.95)), h * 0.95);
        t.lineTo(w * (0.5 - halfAt(0.95)), h * 0.95);
        t.closePath();
        t.fill();
        t.fillStyle = 'rgba(0,0,0,0.28)';
        t.fillRect(w * 0.1, h * 0.115, w * 0.8, h * 0.015);     // shadow line under the apron
        for (const f of [0.24, 0.5, 0.76]) {                    // turned rings
            const hw = halfAt(f);
            t.fillStyle = 'rgba(0,0,0,0.24)';
            t.fillRect(w * (0.5 - hw), h * f, w * 2 * hw, h * 0.012);
            t.fillStyle = 'rgba(255,255,255,0.16)';
            t.fillRect(w * (0.5 - hw), h * (f + 0.012), w * 2 * hw, h * 0.008);
        }
        t.fillStyle = '#33221B';
        t.fillRect(w * (0.5 - halfAt(0.95)), h * 0.95, w * 2 * halfAt(0.95), h * 0.05); // foot
    });

    tex.mote = fpMakeTexture(16, 16, (t, n) => {
        t.clearRect(0, 0, n, n);
        const g = t.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
        g.addColorStop(0, 'rgba(255,250,230,1)');
        g.addColorStop(0.5, 'rgba(255,245,215,0.6)');
        g.addColorStop(1, 'rgba(255,240,200,0)');
        t.fillStyle = g;
        t.fillRect(0, 0, n, n);
    });

    return tex;
}

// --- Buffers (resolution dependent) --------------------------------------------------

function fpSetupBuffers(res) {
    const W = Math.round(CANVAS_W * res);
    const H = Math.round(CANVAS_H * res);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const t = c.getContext('2d');
    const image = t.createImageData(W, H);
    const horizon = Math.round(H * FP_HORIZON_FRAC);
    const scale = H;

    const floorDist = new Float32Array(H);
    const ceilDist = new Float32Array(H);
    const floorFog = new Float32Array(H);
    const ceilFog = new Float32Array(H);
    const floorLight = new Float32Array(H);
    const ceilLight = new Float32Array(H);
    for (let y = 0; y < H; y++) {
        if (y > horizon) {
            floorDist[y] = (FP_EYE * scale) / (y - horizon);
            floorFog[y] = Math.min(FP_FOG_MAX, floorDist[y] * FP_FOG_PER_TILE);
            floorLight[y] = fpLightFalloff(floorDist[y]);
        } else if (y < horizon) {
            ceilDist[y] = ((1 - FP_EYE) * scale) / (horizon - y);
            ceilFog[y] = Math.min(FP_FOG_MAX, ceilDist[y] * FP_FOG_PER_TILE);
            ceilLight[y] = fpLightFalloff(ceilDist[y]) * 0.45;
        }
    }
    const cone = new Float32Array(W);
    for (let x = 0; x < W; x++) {
        const cx = (2 * x) / W - 1;
        cone[x] = Math.exp(-(cx * cx) / 0.14);
    }

    const bloom = document.createElement('canvas');
    bloom.width = Math.round(CANVAS_W / 8);
    bloom.height = Math.round(CANVAS_H / 8);

    Object.assign(fp3d, {
        res, W, H, horizon, scale, canvas: c, ctx: t, image,
        buf: new Uint32Array(image.data.buffer),
        floorDist, ceilDist, floorFog, ceilFog, floorLight, ceilLight, cone,
        bloom, bloomCtx: bloom.getContext('2d'),
        frameTimes: [],
    });
}

function initFirstPerson() {
    fp3d = {
        tex: fpBuildTextures(),
        hits: [],
        sprites: [],
        colSprites: [],
        frameSprites: [],
        levelSprites: [],
        spriteLevel: -1,
        map: null,
        motes: [],
        bobPhase: 0,
        sceneBuf: null,
        fogPacked: 0xFF000000 | (FP_FOG[2] << 16) | (FP_FOG[1] << 8) | FP_FOG[0],
    };
    fpSetupBuffers(Math.min(FP_RES_MAX, Math.max(1, canvasDpr || 1)));
    const rnd = fpRand(99);
    for (let i = 0; i < 36; i++) {
        fp3d.motes.push({
            x: 9.5 + rnd() * 5, y: 0.2 + rnd() * 4.5, z: 0.1 + rnd() * 0.85,
            vx: (rnd() - 0.5) * 0.0006, vy: (rnd() - 0.5) * 0.0006, vz: (rnd() - 0.5) * 0.0004,
            phase: rnd() * Math.PI * 2,
            type: 'mote', texKey: 'mote', emissive: true,
        });
    }
}

// --- Lightmap --------------------------------------------------------------------------

function fpLightFalloff(d) {
    return 1 / (1 + 0.45 * d * d);
}

// Light reaching every cell of the floor: ambient, the window (an area light with soft
// shadows), the ceiling lamp, the dock's glow, and ambient occlusion by nearby walls.
// Pure data, so it runs headlessly too.
function fpBakeLightmap(levelIndex) {
    const N = FP_LIGHT_CELLS, LW = COLS * N, LH = ROWS * N;
    const level = LEVELS[levelIndex];
    const block = Array.from({ length: ROWS }, () => new Float32Array(COLS));
    for (const o of level.obstacles) {
        const f = o.type === 'wall' ? 1 : o.type === 'plant' || o.type === 'chair' ? 0.35 : 0.6;
        for (let dr = 0; dr < o.h; dr++) for (let dc = 0; dc < o.w; dc++) block[o.row + dr][o.col + dc] = f;
    }

    // Ambient occlusion: distance to the nearest blocked cell or the room edge
    const blocked = new Uint8Array(LW * LH);
    for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) {
        if (block[(j / N) | 0][(i / N) | 0] > 0) blocked[j * LW + i] = 1;
    }
    const dist = new Int16Array(LW * LH).fill(-1);
    const queue = [];
    for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) {
        const edge = i === 0 || j === 0 || i === LW - 1 || j === LH - 1;
        if (blocked[j * LW + i] || edge) { dist[j * LW + i] = 0; queue.push(i, j); }
    }
    for (let q = 0; q < queue.length; q += 2) {
        const i = queue[q], j = queue[q + 1], d = dist[j * LW + i];
        if (i > 0 && dist[j * LW + i - 1] < 0) { dist[j * LW + i - 1] = d + 1; queue.push(i - 1, j); }
        if (i < LW - 1 && dist[j * LW + i + 1] < 0) { dist[j * LW + i + 1] = d + 1; queue.push(i + 1, j); }
        if (j > 0 && dist[(j - 1) * LW + i] < 0) { dist[(j - 1) * LW + i] = d + 1; queue.push(i, j - 1); }
        if (j < LH - 1 && dist[(j + 1) * LW + i] < 0) { dist[(j + 1) * LW + i] = d + 1; queue.push(i, j + 1); }
    }

    // How much light gets from a cell to a source: walls block it, low furniture most of it
    function visibility(x0, y0, x1, y1) {
        const dx = x1 - x0, dy = y1 - y0;
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.2));
        let t = 1, last = -1;
        for (let i = 1; i < steps; i++) {
            const x = x0 + (dx * i) / steps, y = y0 + (dy * i) / steps;
            const c = x | 0, r = y | 0;
            if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
            const key = r * COLS + c;
            if (key === last) continue;
            last = key;
            const b = block[r][c];
            if (b >= 1) return 0;
            if (b > 0) t *= 1 - b;
        }
        return t;
    }

    const windowSamples = [];
    for (let i = 0; i < 11; i++) {
        windowSamples.push({ x: FP_WINDOW.x0 + ((FP_WINDOW.x1 - FP_WINDOW.x0) * (i + 0.5)) / 11, y: -0.02 });
    }
    const dockX = level.charger.col + 0.5, dockY = level.charger.row + 0.5;
    const data = new Float32Array(LW * LH * 3);
    for (let j = 0; j < LH; j++) {
        for (let i = 0; i < LW; i++) {
            const x = (i + 0.5) / N, y = (j + 0.5) / N;
            let lr = 0.42, lg = 0.41, lb = 0.44; // ambient, slightly cool
            let wsum = 0;
            for (const s of windowSamples) {
                const d = Math.hypot(x - s.x, y - s.y);
                wsum += visibility(x, y, s.x, s.y) / (1 + (d / 5.5) * (d / 5.5));
            }
            const win = (0.95 * wsum) / windowSamples.length;
            lr += win * 1.0; lg += win * 0.92; lb += win * 0.74;
            const dl = Math.hypot(x - FP_LAMP.x, y - FP_LAMP.y);
            const lamp = (0.6 * visibility(x, y, FP_LAMP.x, FP_LAMP.y)) / (1 + (dl / 3.5) * (dl / 3.5));
            lr += lamp * 0.95; lg += lamp * 0.93; lb += lamp * 0.86;
            const dd = Math.hypot(x - dockX, y - dockY);
            const dock = 0.45 / (1 + (dd / 1.5) * (dd / 1.5));
            lr += dock * 0.3; lg += dock * 0.5; lb += dock * 1.0;
            const ao = 0.45 + 0.55 * Math.min(1, dist[j * LW + i] / (N * 0.7));
            const k = (j * LW + i) * 3;
            data[k] = Math.min(1.4, lr * ao);
            data[k + 1] = Math.min(1.4, lg * ao);
            data[k + 2] = Math.min(1.4, lb * ao);
        }
    }
    // Two passes of a 3x3 box blur: soft penumbrae, no visible cells
    let src = data;
    for (let pass = 0; pass < 2; pass++) {
        const out = new Float32Array(src.length);
        for (let j = 0; j < LH; j++) {
            for (let i = 0; i < LW; i++) {
                for (let ch = 0; ch < 3; ch++) {
                    let sum = 0, cnt = 0;
                    for (let dj = -1; dj <= 1; dj++) {
                        const jj = j + dj;
                        if (jj < 0 || jj >= LH) continue;
                        for (let di = -1; di <= 1; di++) {
                            const ii = i + di;
                            if (ii < 0 || ii >= LW) continue;
                            sum += src[(jj * LW + ii) * 3 + ch];
                            cnt++;
                        }
                    }
                    out[(j * LW + i) * 3 + ch] = sum / cnt;
                }
            }
        }
        src = out;
    }
    return { data: src, w: LW, h: LH, n: N, level: levelIndex };
}

// Bilinear sample of the lightmap at a world position, into fpLightSample
const fpLightSample = [1, 1, 1];
function fpSampleLight(map, x, y) {
    const L = map.data, LW = map.w, LH = map.h;
    let fx = x * map.n - 0.5, fy = y * map.n - 0.5;
    if (fx < 0) fx = 0; else if (fx > LW - 1.001) fx = LW - 1.001;
    if (fy < 0) fy = 0; else if (fy > LH - 1.001) fy = LH - 1.001;
    const i0 = fx | 0, j0 = fy | 0;
    const tx = fx - i0, ty = fy - j0;
    const a = (j0 * LW + i0) * 3, b = a + 3, c = a + LW * 3, d = c + 3;
    for (let ch = 0; ch < 3; ch++) {
        const top = L[a + ch] + (L[b + ch] - L[a + ch]) * tx;
        const bot = L[c + ch] + (L[d + ch] - L[c + ch]) * tx;
        fpLightSample[ch] = top + (bot - top) * ty;
    }
    return fpLightSample;
}

function fpEnsureLightmap() {
    if (!fp3d.map || fp3d.map.level !== currentLevel) {
        fp3d.map = fpBakeLightmap(currentLevel);
        fp3d.frameTimes.length = 0;
    }
    return fp3d.map;
}

// --- Pixel helpers --------------------------------------------------------------------

// Texel * shade * light, blended toward fog, plus the flashlight; returns ABGR for the buffer
function fpShade(rgb, shade, fog, lit, lr, lg, lb) {
    let r = ((rgb >> 16) & 255) * shade * lr;
    let g = ((rgb >> 8) & 255) * shade * lg;
    let b = (rgb & 255) * shade * lb;
    if (fog > 0) {
        r += (FP_FOG[0] - r) * fog;
        g += (FP_FOG[1] - g) * fog;
        b += (FP_FOG[2] - b) * fog;
    }
    if (lit > 0) {
        r += fpLight.r * lit;
        g += fpLight.g * lit;
        b += fpLight.b * lit;
    }
    if (r > 255) r = 255;
    if (g > 255) g = 255;
    if (b > 255) b = 255;
    return 0xFF000000 | (b << 16) | (g << 8) | r;
}

// Mix two buffer pixels: a + (b - a) * k
function fpBlend(a, b, k) {
    const ar = a & 255, ag = (a >> 8) & 255, ab = (a >> 16) & 255;
    const br = b & 255, bg = (b >> 8) & 255, bb = (b >> 16) & 255;
    return 0xFF000000 | ((ab + (bb - ab) * k) << 16) | ((ag + (bg - ag) * k) << 8) | (ar + (br - ar) * k);
}

// --- Views ---------------------------------------------------------------------------

// Where a table's legs stand: one in from each corner of its footprint
function fpTableLegPositions(obs) {
    const i = FP_TABLE_LEG_INSET;
    return [
        { x: obs.col + i, y: obs.row + i },
        { x: obs.col + obs.w - i, y: obs.row + i },
        { x: obs.col + i, y: obs.row + obs.h - i },
        { x: obs.col + obs.w - i, y: obs.row + obs.h - i },
    ];
}

function fpLevelSprites() {
    if (!fp3d) initFirstPerson();
    if (fp3d.spriteLevel !== currentLevel) {
        fp3d.levelSprites = [];
        for (const obs of LEVELS[currentLevel].obstacles) {
            if (FP_BOTTOM_FACTORS[obs.type]) {
                for (const p of fpTableLegPositions(obs)) {
                    fp3d.levelSprites.push({ x: p.x, y: p.y, z: 0, type: 'tableLeg', texKey: 'tableLeg', emissive: false });
                }
            }
            const key = FP_SPRITE_TYPES[obs.type];
            if (!key) continue;
            for (let dr = 0; dr < obs.h; dr++) {
                for (let dc = 0; dc < obs.w; dc++) {
                    fp3d.levelSprites.push({ x: obs.col + dc + 0.5, y: obs.row + dr + 0.5, z: 0, type: obs.type, texKey: key, emissive: false });
                }
            }
        }
        fp3d.spriteLevel = currentLevel;
    }
    return fp3d.levelSprites;
}

// Level sprites plus the dust motes drifting in the window light
function fpFrameSprites() {
    const out = fp3d.frameSprites;
    out.length = 0;
    for (const s of fpLevelSprites()) out.push(s);
    if (FP_FX.motes) {
        for (const m of fp3d.motes) {
            m.x += (m.vx + Math.sin(chargerPulse * 0.01 + m.phase) * 0.0004) * dtFrames;
            m.y += (m.vy + Math.cos(chargerPulse * 0.008 + m.phase) * 0.0004) * dtFrames;
            m.z += m.vz * dtFrames;
            if (m.x < 9.2) m.x = 14.6; else if (m.x > 14.7) m.x = 9.3;
            if (m.y < 0.1) m.y = 4.8; else if (m.y > 4.9) m.y = 0.2;
            if (m.z < 0.08) m.vz = Math.abs(m.vz); else if (m.z > 0.95) m.vz = -Math.abs(m.vz);
            out.push(m);
        }
    }
    return out;
}

// Smooth the player's position and heading, and describe the scene to draw
function fpPlayerView() {
    const targetX = roomba.col * TILE + TILE / 2;
    const targetY = roomba.row * TILE + TILE / 2;
    const k = easeK(0.3);
    roomba.drawX += (targetX - roomba.drawX) * k;
    roomba.drawY += (targetY - roomba.drawY) * k;
    if (Math.abs(targetX - roomba.drawX) < 0.5) roomba.drawX = targetX;
    if (Math.abs(targetY - roomba.drawY) < 0.5) roomba.drawY = targetY;
    fpAngle = lerpAngle(fpAngle, fpTargetAngle, easeK(0.22));

    const d = DIR_DELTAS[roomba.dir];
    const aheadCol = roomba.col + d.dc;
    const aheadRow = roomba.row + d.dr;
    const aheadOk = aheadCol >= 0 && aheadCol < COLS && aheadRow >= 0 && aheadRow < ROWS && grid[aheadRow][aheadCol] !== OBSTACLE;

    return {
        camX: roomba.drawX / TILE,
        camY: roomba.drawY / TILE,
        angle: fpAngle,
        grid,
        typeMap: obstacleTypeMap,
        sprites: fpFrameSprites(),
        aheadCol: aheadOk ? aheadCol : -1,
        aheadRow: aheadOk ? aheadRow : -1,
        onDock: grid[roomba.row][roomba.col] === CHARGER,
        showHud: true,
        ghost: false,
        best: typeof bestGhostPose === 'function' ? bestGhostPose() : null,
        glow: design.lightRgb,
        moving: Math.abs(targetX - roomba.drawX) > 1 || Math.abs(targetY - roomba.drawY) > 1,
    };
}

// The ghost's point of view during the par-route replay
function fpGhostView() {
    if (!fp3d) initFirstPerson();
    const targetX = npcReplay.col * TILE + TILE / 2;
    const targetY = npcReplay.row * TILE + TILE / 2;
    const k = easeK(0.25);
    npcReplay.drawX += (targetX - npcReplay.drawX) * k;
    npcReplay.drawY += (targetY - npcReplay.drawY) * k;
    if (Math.abs(targetX - npcReplay.drawX) < 0.5) npcReplay.drawX = targetX;
    if (Math.abs(targetY - npcReplay.drawY) < 0.5) npcReplay.drawY = targetY;
    if (npcReplay.angle === undefined) npcReplay.angle = FP_ANGLE_MAP[npcReplay.dir];
    npcReplay.angle = lerpAngle(npcReplay.angle, FP_ANGLE_MAP[npcReplay.dir], easeK(0.22));

    return {
        camX: npcReplay.drawX / TILE,
        camY: npcReplay.drawY / TILE,
        angle: npcReplay.angle,
        grid: npcReplay.grid || grid,
        typeMap: obstacleTypeMap,
        sprites: fpFrameSprites(),
        aheadCol: -1,
        aheadRow: -1,
        onDock: false,
        showHud: false,
        ghost: true,
        glow: [0, 191, 255],
        moving: true,
    };
}

// --- Scene -------------------------------------------------------------------------------

function fpRenderScene(view) {
    const W = fp3d.W, H = fp3d.H;
    const buf = fp3d.buf;
    const tex = fp3d.tex;
    const g = view.grid;
    const tmap = view.typeMap;
    const padGrid = chargingPadGrid;
    const camX = view.camX, camY = view.camY;
    const dirX = Math.cos(view.angle), dirY = Math.sin(view.angle);
    const planeLen = Math.tan(FP_FOV / 2);
    const planeX = -dirY * planeLen, planeY = dirX * planeLen;
    const horizon = fp3d.horizon;
    const S = fp3d.scale;
    const eyeS = FP_EYE * S;
    const floorDist = fp3d.floorDist, ceilDist = fp3d.ceilDist;
    const floorFog = fp3d.floorFog, ceilFog = fp3d.ceilFog;
    const fogPacked = fp3d.fogPacked;
    const hits = fp3d.hits;
    const aheadCol = view.aheadCol, aheadRow = view.aheadRow;
    const map = fpEnsureLightmap();
    const L = map.data, LN = map.n, LW = map.w, LH = map.h;
    const reflect = FP_FX.reflections;

    // One flat byte per tile: 0 dirty, 1 clean, 2 dock, 3 obstacle; +4 on the charging pad
    if (!fp3d.kinds) fp3d.kinds = new Uint8Array(ROWS * COLS);
    const kinds = fp3d.kinds;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = g[r][c];
            let k = cell === CLEAN ? 1 : cell === CHARGER ? 2 : cell === OBSTACLE ? 3 : 0;
            if (k !== 2 && padGrid !== null && padGrid[r][c] === 1) k |= 4;
            kinds[r * COLS + c] = k;
        }
    }
    const floorDirty = tex.floorDirty, floorClean = tex.floorClean, floorDirtyPad = tex.floorDirtyPad, floorCleanPad = tex.floorCleanPad, dockTex = tex.dock;

    // The vacuum's own light on the floor around it
    const glowR = view.glow[0] / 255, glowG = view.glow[1] / 255, glowB = view.glow[2] / 255;
    const glowX = camX, glowY = camY;

    // Flashlight for this frame (the ghost has none)
    const lightOn = !view.ghost && design.flashOn;
    fpLight.on = lightOn;
    fpLight.dim = lightOn ? 0.6 : 1;
    if (lightOn) {
        fpLight.r = design.flashRgb[0];
        fpLight.g = design.flashRgb[1];
        fpLight.b = design.flashRgb[2];
    }
    const dim = fpLight.dim;
    const cone = fp3d.cone, floorLight = fp3d.floorLight, ceilLight = fp3d.ceilLight;

    // Project this frame's sprites to screen space, farthest first
    const sprites = fp3d.sprites;
    sprites.length = 0;
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const halfW = W / 2;
    for (const s of view.sprites) {
        const rx = s.x - camX, ry = s.y - camY;
        const tx = invDet * (dirY * rx - dirX * ry);
        const ty = invDet * (-planeY * rx + planeX * ry); // depth
        if (ty <= 0.08) continue;
        const sx = halfW * (1 + tx / ty);
        const size = FP_SPRITE_SIZE[s.type];
        const wPx = Math.max(1.5, ((halfW / planeLen) * size.w) / ty);
        const left = sx - wPx / 2, right = sx + wPx / 2;
        if (right < 0 || left >= W) continue;
        const z = s.z || 0;
        let lr = 1, lg = 1, lb = 1;
        if (!s.emissive) {
            const ls = fpSampleLight(map, s.x, s.y);
            lr = ls[0] * dim; lg = ls[1] * dim; lb = ls[2] * dim;
        }
        sprites.push({
            depth: ty, left, right,
            top: horizon - ((z + size.h - FP_EYE) * S) / ty,
            bot: horizon - ((z - FP_EYE) * S) / ty,
            botRefl: z === 0 ? horizon + ((size.h + FP_EYE) * S) / ty : -1,
            h: size.h,
            tex: tex[s.texKey],
            fog: s.emissive ? 0 : Math.min(FP_FOG_MAX, ty * FP_FOG_PER_TILE),
            light: lightOn && !s.emissive ? fpLightFalloff(ty) * FP_LIGHT_GAIN : 0,
            lr, lg, lb,
            emissive: s.emissive,
        });
    }
    sprites.sort((a, b) => b.depth - a.depth);
    const colSprites = fp3d.colSprites;

    // Reflectivity of the floor tile under a screen row of this column
    const floorReflect = (y, rayDirX, rayDirY) => {
        const fd = floorDist[y];
        const fx = camX + rayDirX * fd, fy = camY + rayDirY * fd;
        const tc = fx | 0, tr = fy | 0;
        if (fx < 0 || tc >= COLS || fy < 0 || tr >= ROWS) return 0;
        const k = kinds[tr * COLS + tc] & 3;
        return k === 1 ? FP_REFLECT.clean : k === 2 ? FP_REFLECT.dock : k === 3 ? 0 : FP_REFLECT.dirty;
    };

    const paintSprite = (s, x, rayDirX, rayDirY) => {
        const texture = s.tex;
        const tw = texture.w, th = texture.h;
        const u = (((x - s.left) / (s.right - s.left)) * (tw - 1)) | 0;
        const hgt = s.bot - s.top;
        const y0 = Math.max(0, Math.ceil(s.top));
        const y1 = Math.min(H - 1, Math.floor(s.bot));
        const lit = s.light * cone[x];
        const shade = s.emissive ? 1.6 : 1.0;
        for (let y = y0; y <= y1; y++) {
            const tv = (((y - s.top) / hgt) * (th - 1)) | 0;
            const texel = texture[tv * tw + u];
            if (texel >>> 24 < 128) continue; // transparent
            buf[y * W + x] = fpShade(texel, shade, s.fog, lit, s.lr, s.lg, s.lb);
        }
        if (reflect && s.botRefl > 0) {
            const ya = Math.max(horizon + 1, Math.ceil(s.bot));
            const yb = Math.min(H - 1, Math.floor(s.botRefl));
            const span = s.botRefl - s.bot;
            for (let y = ya; y <= yb; y++) {
                let k = floorReflect(y, rayDirX, rayDirY);
                if (k <= 0) continue;
                const hh = ((y - horizon) * s.depth) / S - FP_EYE; // height on the sprite being reflected
                let tv = ((1 - hh / s.h) * (th - 1)) | 0;
                if (tv < 0) tv = 0; else if (tv > th - 1) tv = th - 1;
                const texel = texture[tv * tw + u];
                if (texel >>> 24 < 128) continue;
                k *= (1 - (0.55 * (y - s.bot)) / span) * Math.min(1, 0.35 + s.depth * 0.12);
                buf[y * W + x] = fpBlend(buf[y * W + x], fpShade(texel, shade, s.fog, lit, s.lr, s.lg, s.lb), k);
            }
        }
    };

    for (let x = 0; x < W; x++) {
        const cameraX = (2 * x) / W - 1;
        const rayDirX = dirX + planeX * cameraX;
        const rayDirY = dirY + planeY * cameraX;
        const coneX = lightOn ? cone[x] * FP_LIGHT_GAIN : 0;

        // Floor: every row below the horizon, textured and lit by the tile the ray lands on
        for (let y = horizon + 1; y < H; y++) {
            const d = floorDist[y];
            const fx = camX + rayDirX * d;
            const fy = camY + rayDirY * d;
            const tc = fx | 0, tr = fy | 0;
            if (fx < 0 || tc >= COLS || fy < 0 || tr >= ROWS) {
                buf[y * W + x] = fogPacked;
                continue;
            }
            const kind = kinds[tr * COLS + tc];
            const k = kind & 3;
            const variant = (tc & 3) + ((tr & 3) << 2);
            const texture = k === 2 ? dockTex
                : k === 1 ? (kind & 4 ? floorCleanPad : floorClean)[variant]
                : (kind & 4 ? floorDirtyPad : floorDirty)[variant];
            const tw = texture.w;
            const tu = ((fx - tc) * (tw - 1)) | 0;
            const tv = ((fy - tr) * (tw - 1)) | 0;
            let shade = 1.0;
            if (tc === aheadCol && tr === aheadRow) shade = 1.16; // the tile a forward press reaches
            const dz = FP_DITHER[((y & 3) << 2) | (x & 3)];
            let lj = (fy * LN + dz) | 0, lix = (fx * LN - dz) | 0;
            if (lj < 0) lj = 0; else if (lj >= LH) lj = LH - 1;
            if (lix < 0) lix = 0; else if (lix >= LW) lix = LW - 1;
            const li = lj * LW + lix;
            let lr = L[li * 3] * dim, lg = L[li * 3 + 1] * dim, lb = L[li * 3 + 2] * dim;
            const gx = fx - glowX, gy = fy - glowY;
            if (gx > -2.5 && gx < 2.5 && gy > -2.5 && gy < 2.5) {
                const gl = 0.55 / (1 + (gx * gx + gy * gy) * 2.5);
                lr += glowR * gl; lg += glowG * gl; lb += glowB * gl;
            }
            buf[y * W + x] = fpShade(texture[tv * tw + tu], shade, floorFog[y], coneX * floorLight[y], lr, lg, lb);
        }

        // Ceiling: rows above the horizon, with the lamp as a bright disc
        const ceilTex = tex.ceiling, ctw = ceilTex.w;
        for (let y = 0; y < horizon; y++) {
            const d = ceilDist[y];
            const fx = camX + rayDirX * d;
            const fy = camY + rayDirY * d;
            const lx = fx - FP_LAMP.x, ly = fy - FP_LAMP.y;
            if (lx * lx + ly * ly < 0.05) {
                buf[y * W + x] = fpShade(0xFFFFFF, 1.0, 0, 0, 1.7, 1.65, 1.5);
                continue;
            }
            const tcx = fx | 0, tcy = fy | 0;
            const tu = ((fx - tcx) * (ctw - 1)) | 0;
            const tv = ((fy - tcy) * (ctw - 1)) | 0;
            let lr = 0.8, lg = 0.8, lb = 0.82;
            if (fx >= 0 && fx < COLS && fy >= 0 && fy < ROWS) {
                const dz = FP_DITHER[((y & 3) << 2) | (x & 3)];
                let lj = (fy * LN + dz) | 0, lix = (fx * LN - dz) | 0;
                if (lj < 0) lj = 0; else if (lj >= LH) lj = LH - 1;
                if (lix < 0) lix = 0; else if (lix >= LW) lix = LW - 1;
                const li = (lj * LW + lix) * 3;
                lr = L[li] * 0.86; lg = L[li + 1] * 0.86; lb = L[li + 2] * 0.88;
            }
            buf[y * W + x] = fpShade(ceilTex[tv * ctw + tu], dim, ceilFog[y], coneX * ceilLight[y], lr, lg, lb);
        }
        buf[horizon * W + x] = fogPacked;

        // DDA: walk the grid, collecting every obstacle this ray crosses until a full-height wall
        let mapX = Math.floor(camX), mapY = Math.floor(camY);
        const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
        const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);
        let stepX, stepY, sideDistX, sideDistY;
        if (rayDirX < 0) { stepX = -1; sideDistX = (camX - mapX) * deltaDistX; }
        else { stepX = 1; sideDistX = (mapX + 1 - camX) * deltaDistX; }
        if (rayDirY < 0) { stepY = -1; sideDistY = (camY - mapY) * deltaDistY; }
        else { stepY = 1; sideDistY = (mapY + 1 - camY) * deltaDistY; }

        hits.length = 0;
        for (let n = 0; n < FP_MAX_STEPS; n++) {
            let side, perp;
            if (sideDistX < sideDistY) { perp = sideDistX; sideDistX += deltaDistX; mapX += stepX; side = 0; }
            else { perp = sideDistY; sideDistY += deltaDistY; mapY += stepY; side = 1; }
            if (hits.length && hits[hits.length - 1].dExit === 0) hits[hits.length - 1].dExit = perp;
            if (perp < 0.02) perp = 0.02;

            let type = null;
            const outside = mapX < 0 || mapX >= COLS || mapY < 0 || mapY >= ROWS;
            if (outside) {
                type = 'plaster';
            } else if (g[mapY][mapX] === OBSTACLE) {
                type = tmap[mapY][mapX] || 'wall';
                if (FP_SPRITE_TYPES[type]) type = null; // drawn as a sprite instead
            }
            if (type) {
                const wallX = side === 0 ? camY + perp * rayDirY : camX + perp * rayDirX;
                let u = wallX - Math.floor(wallX);
                if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) u = 1 - u;
                // The window sits on the north wall between x0 and x1
                if (outside && mapY < 0 && side === 1 && wallX >= FP_WINDOW.x0 && wallX <= FP_WINDOW.x1) {
                    type = 'window';
                    u = 1 - (wallX - FP_WINDOW.x0) / (FP_WINDOW.x1 - FP_WINDOW.x0);
                }
                const h = FP_HEIGHT_FACTORS[type] || 1;
                // light just in front of the face
                const ls = fpSampleLight(map, camX + rayDirX * (perp - 0.08), camY + rayDirY * (perp - 0.08));
                hits.push({
                    dist: perp, dExit: 0, type, side, u, h,
                    hb: FP_BOTTOM_FACTORS[type] || 0,
                    lr: type === 'window' ? 1.3 : ls[0] * dim,
                    lg: type === 'window' ? 1.27 : ls[1] * dim,
                    lb: type === 'window' ? 1.2 : ls[2] * dim,
                });
                if (h >= 1) break;
            }
        }

        // Sprites covering this column, farthest first
        colSprites.length = 0;
        for (let k = 0; k < sprites.length; k++) {
            const s = sprites[k];
            if (x >= s.left && x < s.right) colSprites.push(s);
        }
        let si = 0;

        // Paint the hits back to front so near furniture covers what is behind it,
        // slotting each sprite in at its own depth, each followed by its floor reflection
        for (let i = hits.length - 1; i >= 0; i--) {
            const hit = hits[i];
            const d = hit.dist;
            const texture = tex[hit.type] || tex.wall;
            const tw = texture.w, th = texture.h;
            const top = horizon - ((hit.h - FP_EYE) * S) / d;
            const raised = hit.hb > FP_EYE; // a table top: open underneath
            const bot = raised ? horizon - ((hit.hb - FP_EYE) * S) / d : horizon + eyeS / d;
            const fog = hit.type === 'window' ? 0 : Math.min(FP_FOG_MAX, d * FP_FOG_PER_TILE);
            const shade = hit.side === 1 ? 0.8 : 1.0;
            const tu = (hit.u * (tw - 1)) | 0;
            const lit = coneX > 0 ? coneX * fpLightFalloff(d) : 0;
            const lr = hit.lr, lg = hit.lg, lb = hit.lb;
            const under = raised && hit.dExit > 0;
            // Sprites behind this hit (behind the far edge of a slab you can see under)
            const farDepth = under ? hit.dExit : d;
            while (si < colSprites.length && colSprites[si].depth >= farDepth) paintSprite(colSprites[si++], x, rayDirX, rayDirY);
            // Underside of a raised slab, painted back to front in segments so the legs
            // standing under it are slotted in at their own depth
            if (under) {
                const c = fpShade(texture.avg, 0.45, fog, lit * 0.5, lr, lg, lb);
                const hbS = (hit.hb - FP_EYE) * S;
                let farRow = Math.min(H, Math.ceil(horizon - hbS / hit.dExit));
                for (;;) {
                    const legged = si < colSprites.length && colSprites[si].depth >= d;
                    const nearDepth = legged ? colSprites[si].depth : d;
                    const ya = Math.max(0, Math.ceil(horizon - hbS / nearDepth));
                    for (let y = ya; y < farRow; y++) buf[y * W + x] = c;
                    farRow = ya;
                    if (!legged) break;
                    paintSprite(colSprites[si++], x, rayDirX, rayDirY);
                }
            }
            const faceH = bot - top;
            const y0 = Math.max(0, Math.ceil(top));
            const y1 = Math.min(H - 1, Math.floor(bot));
            for (let y = y0; y <= y1; y++) {
                const tv = (((y - top) / faceH) * (th - 1)) | 0;
                buf[y * W + x] = fpShade(texture[tv * tw + tu], y === y0 ? shade * 0.75 : shade, fog, lit, lr, lg, lb);
            }
            // Top face of anything lower than the eye
            if (hit.h < FP_EYE && hit.dExit > 0) {
                const topFar = horizon - ((hit.h - FP_EYE) * S) / hit.dExit;
                const ya = Math.max(0, Math.ceil(topFar));
                const yb = Math.min(H - 1, Math.floor(top));
                const c = fpShade(texture.avg, 1.25, fog, lit, lr, lg, lb);
                for (let y = ya; y < yb; y++) buf[y * W + x] = c;
            }
            // Reflection in the floor of anything standing on it
            if (reflect && !raised) {
                const botRefl = horizon + ((hit.h + FP_EYE) * S) / d;
                const ya = Math.max(horizon + 1, Math.ceil(bot));
                const yb = Math.min(H - 1, Math.floor(botRefl));
                const span = botRefl - bot;
                const fres = Math.min(1, 0.35 + d * 0.12);
                for (let y = ya; y <= yb; y++) {
                    let k = floorReflect(y, rayDirX, rayDirY);
                    if (k <= 0) continue;
                    const hh = ((y - horizon) * d) / S - FP_EYE; // height on the face being reflected
                    let tv = ((1 - hh / hit.h) * (th - 1)) | 0;
                    if (tv < 0) tv = 0; else if (tv > th - 1) tv = th - 1;
                    k *= (1 - (0.55 * (y - bot)) / span) * fres;
                    buf[y * W + x] = fpBlend(buf[y * W + x], fpShade(texture[tv * tw + tu], shade, fog, lit, lr, lg, lb), k);
                }
            }
        }
        // Sprites nearer than everything solid
        while (si < colSprites.length) paintSprite(colSprites[si++], x, rayDirX, rayDirY);
    }

    fp3d.ctx.putImageData(fp3d.image, 0, 0);
}

// --- HUD -----------------------------------------------------------------------------------

function fpDrawCompass(angle) {
    const cx = CANVAS_W / 2;
    const stripW = 260, stripH = 24, y = 10;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, cx - stripW / 2, y, stripW, stripH, 6);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const points = [['N', -Math.PI / 2], ['E', 0], ['S', Math.PI / 2], ['W', Math.PI]];
    const span = 1.15;
    for (const [label, a] of points) {
        let off = a - angle;
        while (off > Math.PI) off -= 2 * Math.PI;
        while (off < -Math.PI) off += 2 * Math.PI;
        if (Math.abs(off) > span) continue;
        const px = cx + (off / span) * (stripW / 2 - 16);
        const centred = Math.abs(off) < 0.12;
        ctx.globalAlpha = 1 - (Math.abs(off) / span) * 0.7;
        ctx.fillStyle = centred ? '#9ED8CC' : '#FFF';
        ctx.font = (centred ? 'bold 16px' : 'bold 13px') + ' Segoe UI, sans-serif';
        ctx.fillText(label, px, y + stripH / 2 + 1);
    }
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#9ED8CC';
    ctx.fillRect(cx - 1, y + 2, 2, 5);
    ctx.restore();
}

function fpDrawStatus() {
    const left = totalDirty - cleaned;
    const dockDist = chargerDistGrid ? chargerDistGrid[roomba.row][roomba.col] : -1;
    const cost = moveCost();
    const max = batteryMax();
    const lowBattery = isLowBattery();
    const needsDock = dockDist >= 0 && roomba.battery <= (dockDist + 2) * cost && dockDist > 0;

    ctx.save();
    ctx.textBaseline = 'middle';

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, 10, 10, 150, 46, 6);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px Segoe UI, sans-serif';
    ctx.fillStyle = '#FFF';
    ctx.fillText(`${left} tile${left === 1 ? '' : 's'} left`, 20, 24);
    ctx.fillStyle = needsDock ? '#FF6B5B' : '#C8E8FF';
    const dockText = dockDist < 0 ? 'Dock unreachable' : dockDist === 0 ? 'On the dock' : `Dock ${dockDist} move${dockDist === 1 ? '' : 's'}`;
    ctx.fillText(needsDock ? `${dockText}  ·  head back!` : dockText, 20, 43);

    if (design.flashOn) {
        const [fr, fg, fb] = design.flashRgb;
        ctx.save();
        ctx.shadowColor = `rgb(${fr},${fg},${fb})`;
        ctx.shadowBlur = 8;
        ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
        ctx.beginPath();
        ctx.arc(148, 24, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    const bw = 130, bh = 12, bx = CANVAS_W - bw - 14, by = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, bx - 8, 10, bw + 16, 46, 6);
    ctx.fill();
    ctx.fillStyle = '#222';
    roundRect(ctx, bx, by, bw, bh, 5);
    ctx.fill();
    const pct = Math.min(1, roomba.battery / max);
    let color = pct > 0.5 ? '#4CAF50' : pct > 0.2 ? '#FFC107' : '#F44336';
    if (roomba.battery > max + 0.5) color = '#6EC6FF';
    if (lowBattery) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(chargerPulse * 0.25);
    ctx.fillStyle = color;
    if (pct > 0) {
        roundRect(ctx, bx, by, Math.max(6, bw * pct), bh, 5);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right';
    ctx.font = 'bold 13px Segoe UI, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(`Battery ${Math.round(roomba.battery)} / ${max}`, bx + bw, 43);
    ctx.restore();

    if (lowBattery && gameState === 'PLAYING') {
        ctx.save();
        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(chargerPulse * 0.25);
        const vg = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.35, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.75);
        vg.addColorStop(0, 'rgba(255,0,0,0)');
        vg.addColorStop(1, 'rgba(255,40,40,0.8)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.restore();
    }
}

function fpDrawMinimap(view) {
    const s = FP_MINIMAP_SCALE;
    const mapW = COLS * s, mapH = ROWS * s;
    const mx = 12, my = CANVAS_H - mapH - 12;
    const g = view.grid;
    const tmap = view.typeMap;

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, mx - 4, my - 4, mapW + 8, mapH + 8, 5);
    ctx.fill();
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = g[r][c];
            if (cell === OBSTACLE) ctx.fillStyle = (OBS_TYPES[tmap[r][c]] || OBS_TYPES.wall).color;
            else if (cell === CLEAN) ctx.fillStyle = '#9FD9B4';
            else if (cell === CHARGER) ctx.fillStyle = '#6090DD';
            else ctx.fillStyle = '#CDB48E';
            ctx.fillRect(mx + c * s, my + r * s, s - 0.6, s - 0.6);
        }
    }
    const px = mx + view.camX * s, py = my + view.camY * s;
    ctx.fillStyle = 'rgba(255,255,150,0.18)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    const cone = 30;
    ctx.lineTo(px + Math.cos(view.angle - FP_FOV / 2) * cone, py + Math.sin(view.angle - FP_FOV / 2) * cone);
    ctx.lineTo(px + Math.cos(view.angle + FP_FOV / 2) * cone, py + Math.sin(view.angle + FP_FOV / 2) * cone);
    ctx.closePath();
    ctx.fill();
    if (view.best) {
        ctx.fillStyle = '#D9A441';
        ctx.beginPath();
        ctx.arc(mx + view.best.x * s, my + view.best.y * s, 2.6, 0, Math.PI * 2);
        ctx.fill();
    }
    const dotColor = view.ghost ? '#00BFFF' : '#00FF88';
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(px, py, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = dotColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(view.angle) * 9, py + Math.sin(view.angle) * 9);
    ctx.stroke();
    ctx.restore();
}

// The Roomba's own front bumper along the bottom edge, so the camera reads as a vehicle
function fpDrawBumper(shakeX, shakeY) {
    const cx = CANVAS_W / 2 + shakeX;
    const cy = CANVAS_H + 168 + shakeY;
    const r = 210;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy + 6, r + 4, Math.PI, Math.PI * 2);
    ctx.fill();
    const body = ctx.createLinearGradient(0, cy - r, 0, cy - r + 50);
    body.addColorStop(0, '#4A4A4A');
    body.addColorStop(0.4, '#2E2E2E');
    body.addColorStop(1, '#1C1C1C');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, Math.PI * 2);
    ctx.fill();
    // a hint of the room reflected in the hood
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, Math.PI, Math.PI * 2);
    ctx.clip();
    const frame = fpFrameCanvas();
    if (frame) {
        ctx.translate(0, CANVAS_H * 2 - 30);
        ctx.scale(1, -1);
        ctx.drawImage(frame, 0, 0, CANVAS_W, CANVAS_H);
    }
    ctx.restore();
    ctx.strokeStyle = bumpFlash > 0 ? `rgba(255, 82, 82, ${0.5 + bumpFlash / 20})` : design.lightColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = design.lightColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 7, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(20,20,20,0.7)';
    for (let i = -3; i <= 3; i++) {
        const a = Math.PI * 1.5 + i * 0.09;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), 2, 0, Math.PI * 2);
        ctx.fill();
    }
    if (design.flashOn) {
        const [fr, fg, fb] = design.flashRgb;
        ctx.shadowColor = `rgb(${fr},${fg},${fb})`;
        ctx.shadowBlur = 22;
        ctx.fillStyle = `rgb(${Math.min(255, fr + 50)},${Math.min(255, fg + 50)},${Math.min(255, fb + 50)})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy - r + 11, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    ctx.restore();
}

// --- Post-processing -------------------------------------------------------------------

// Bloom: the frame shrunk, pushed through a curve that keeps only the bright parts, and
// added back blurred by the upscale. No canvas filters needed.
function fpDrawBloom() {
    const b = fp3d.bloom, bc = fp3d.bloomCtx;
    bc.globalCompositeOperation = 'source-over';
    bc.imageSmoothingEnabled = true;
    bc.drawImage(fp3d.canvas, 0, 0, b.width, b.height);
    bc.globalCompositeOperation = 'multiply';
    bc.drawImage(b, 0, 0);
    bc.drawImage(b, 0, 0);
    bc.drawImage(b, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(b, 0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
}

// Colour grade and vignette: cool at the ceiling, warm at the floor, dark at the edges
function fpDrawGrade() {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    g.addColorStop(0, 'rgba(90, 120, 200, 0.14)');
    g.addColorStop(0.45, 'rgba(128, 128, 128, 0)');
    g.addColorStop(1, 'rgba(255, 190, 120, 0.08)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.globalCompositeOperation = 'source-over';
    const v = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.35, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.36)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
}

// A soft shaft of light when the window is in view
function fpDrawShaft(view) {
    const wx = (FP_WINDOW.x0 + FP_WINDOW.x1) / 2, wy = -0.2;
    const dirX = Math.cos(view.angle), dirY = Math.sin(view.angle);
    const planeLen = Math.tan(FP_FOV / 2);
    const planeX = -dirY * planeLen, planeY = dirX * planeLen;
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const rx = wx - view.camX, ry = wy - view.camY;
    const tx = invDet * (dirY * rx - dirX * ry);
    const ty = invDet * (-planeY * rx + planeX * ry);
    if (ty <= 0.5) return;
    const sx = (CANVAS_W / 2) * (1 + tx / ty);
    if (sx < -200 || sx > CANVAS_W + 200) return;
    const facing = Math.max(0, (dirX * rx + dirY * ry) / Math.hypot(rx, ry));
    const a = 0.12 * facing * facing * Math.min(1, 4 / ty);
    if (a < 0.01) return;
    const sy = CANVAS_H * FP_HORIZON_FRAC - 40 / Math.max(1, ty * 0.5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(sx, sy, 10, sx, sy, 320);
    g.addColorStop(0, `rgba(255, 240, 200, ${a})`);
    g.addColorStop(0.4, `rgba(255, 232, 180, ${a * 0.35})`);
    g.addColorStop(1, 'rgba(255, 225, 160, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
}

// --- Entry point -------------------------------------------------------------------------

function renderFirstPerson(view) {
    if (!fp3d) initFirstPerson();
    view = view || fpPlayerView();

    const t0 = performance.now();
    fpRenderScene(view);
    const ms = performance.now() - t0;

    // Drop the internal resolution a notch when frames are consistently slow
    const ft = fp3d.frameTimes;
    if (ms < 60) ft.push(ms); // ignore one-off hitches such as a lightmap bake
    if (ft.length > 30) {
        ft.shift();
        const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
        if (avg > FP_SLOW_FRAME_MS && fp3d.res > 1) {
            fpSetupBuffers(fp3d.res > 1.5 ? 1.5 : 1);
            ft.length = 0;
        }
    }

    // Head-bob while driving, camera shake on a bump
    if (FP_FX.bob) {
        if (view.moving) fp3d.bobPhase += dtMs * 0.014;
        else fp3d.bobPhase += (Math.round(fp3d.bobPhase / Math.PI) * Math.PI - fp3d.bobPhase) * easeK(0.2);
    }
    const bobX = FP_FX.bob ? Math.cos(fp3d.bobPhase * 0.5) * 1.2 : 0;
    const bobY = FP_FX.bob ? Math.sin(fp3d.bobPhase) * 2.2 : 0;
    const shakeX = bumpFlash > 0 ? Math.sin(chargerPulse * 1.9) * bumpFlash * 0.7 : 0;
    const shakeY = bumpFlash > 0 ? Math.cos(chargerPulse * 2.6) * bumpFlash * 0.45 : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    const grow = 5;
    ctx.drawImage(fp3d.canvas, bobX + shakeX - grow, bobY + shakeY - grow, CANVAS_W + grow * 2, CANVAS_H + grow * 2);
    ctx.restore();

    if (FP_FX.shaft) fpDrawShaft(view);
    if (FP_FX.bloom) fpDrawBloom();
    fpDrawGrade();

    if (view.onDock) {
        ctx.save();
        ctx.globalAlpha = 0.08 + 0.05 * Math.sin(chargerPulse * 0.06);
        ctx.fillStyle = '#4080FF';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.restore();
    }

    if (bumpFlash > 0) {
        ctx.save();
        ctx.globalAlpha = (bumpFlash / 10) * 0.35;
        const bf = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.3, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.7);
        bf.addColorStop(0, 'rgba(255,0,0,0)');
        bf.addColorStop(1, 'rgba(255,50,50,0.7)');
        ctx.fillStyle = bf;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.restore();
    }

    fpDrawHud(view, true, shakeX, shakeY);
}

// The HUD both renderers share: bumper (classic only; the GPU renderer draws the body itself),
// compass, status and minimap
function fpDrawHud(view, bumper, shakeX, shakeY) {
    if (bumper && !view.ghost) fpDrawBumper(shakeX || 0, shakeY || 0);
    fpDrawCompass(view.angle);
    if (view.showHud) fpDrawStatus();
    fpDrawMinimap(view);
}

// The canvas holding the last 3D frame, whichever renderer drew it
function fpFrameCanvas() {
    if (typeof useGl === 'function' && useGl() && window.gl3d.canvas) return window.gl3d.canvas;
    return fp3d && fp3d.canvas;
}

// Build textures, bake the current level's light and run one hidden frame so the first visible
// 3D frame is not the one paying for setup and cold code. Called in the background after load
// and after every level change.
function fpWarmUp() {
    if (typeof document === 'undefined' || !grid.length) return;
    if (!fp3d) initFirstPerson();
    fpEnsureLightmap();
    if (!fp3d.warmed) {
        fp3d.warmed = true;
        const saved = { x: roomba.drawX, y: roomba.drawY, a: fpAngle };
        fpRenderScene(fpPlayerView());
        roomba.drawX = saved.x;
        roomba.drawY = saved.y;
        fpAngle = saved.a;
        fp3d.frameTimes.length = 0;
    }
}

// --- Dive transition -----------------------------------------------------------------------

// Start the transition: dir +1 drops from the board into the Roomba's eye, -1 climbs back out
function fpStartDive(dir) {
    fpDive.t = 1;
    fpDive.dir = dir;
    fpDive.rx = roomba.drawX;
    fpDive.ry = roomba.drawY;
}

// How far the GPU renderer's camera is along its flight: 0 at the vacuum's eye, 1 above the board
function fpDiveFly() {
    if (fpDive.t <= 0) return 0;
    const p = fpDive.dir > 0 ? fpDive.t : 1 - fpDive.t;
    return p * p * (3 - 2 * p);
}

// Draw the transition over whatever the frame already shows; returns true while active
function fpDrawDive() {
    if (fpDive.t <= 0) return false;
    if (!fp3d) initFirstPerson();
    const t = fpDive.t;
    const p = 1 - t;
    const ease = p * p * (3 - 2 * p);
    const gl = typeof useGl === 'function' && useGl();
    ctx.save();
    if (gl && fpDive.dir > 0) {
        // The camera is flying down from above the board; the board itself just fades away
        if (!fp3d.sceneBuf) fp3d.sceneBuf = makeLayer();
        const L = fp3d.sceneBuf;
        withCtx(L.ctx, () => {
            ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
            drawScene(grid, null);
            drawLighting();
            drawRoomba();
        });
        ctx.globalAlpha = Math.max(0, Math.min(1, (t - 0.55) / 0.4));
        ctx.drawImage(L.canvas, 0, 0, CANVAS_W, CANVAS_H);
    } else if (gl) {
        // Back out: a fresh 3D frame climbs to the overhead shot, then gives way to the board
        const frame = window.gl3d.render(fpPlayerView(), dtMs, fpDiveFly());
        if (frame) {
            ctx.globalAlpha = Math.max(0, Math.min(1, t / 0.35));
            ctx.drawImage(frame, 0, 0, CANVAS_W, CANVAS_H);
        }
    } else if (fpDive.dir > 0) {
        // The 2D board zooms into the Roomba and fades out over the 3D frame beneath
        if (!fp3d.sceneBuf) fp3d.sceneBuf = makeLayer();
        const L = fp3d.sceneBuf;
        withCtx(L.ctx, () => {
            ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
            drawScene(grid, null);
            drawLighting();
            drawRoomba();
        });
        const s = 1 + 9 * ease * ease;
        ctx.globalAlpha = Math.max(0, 1 - ease * 1.25);
        ctx.translate(fpDive.rx, fpDive.ry);
        ctx.scale(s, s);
        ctx.translate(-fpDive.rx, -fpDive.ry);
        ctx.drawImage(L.canvas, 0, 0, CANVAS_W, CANVAS_H);
    } else {
        // The last 3D frame lifts away and fades over the board
        const s = 1 + 0.5 * ease;
        ctx.globalAlpha = Math.max(0, 1 - ease * 1.1);
        ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
        ctx.scale(s, s);
        ctx.translate(-CANVAS_W / 2, -CANVAS_H / 2);
        const frame = fpFrameCanvas();
        if (frame) ctx.drawImage(frame, 0, 0, CANVAS_W, CANVAS_H);
    }
    ctx.restore();
    fpDive.t -= dtMs / (gl ? 1150 : 520);
    return true;
}
