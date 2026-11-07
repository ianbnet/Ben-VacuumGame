// === 2D SCENE LAYERS AND EFFECTS ===
// Classic script sharing globals (loaded after render2d.js). The static parts of the top-down
// view are painted once per level into offscreen layers: a plank floor with ambient
// occlusion and baseboards, the furniture with cast shadows, and the window light.
// Each frame then draws only what changes: tile dust and polish, the dock, the Roomba.

const scene = {
    level: -1,
    dpr: 0,
    floor: null,
    furniture: null,
    light: null,
    dust: [],
    glaze: null,
};
const dustPuffs = [];
const bokehMotes = [];
for (let i = 0; i < 7; i++) {
    bokehMotes.push({
        x: CANVAS_W * 0.45 + Math.random() * CANVAS_W * 0.55,
        y: Math.random() * CANVAS_H * 0.7,
        r: 7 + Math.random() * 9,
        vx: -0.06 - Math.random() * 0.05,
        vy: -0.04 - Math.random() * 0.05,
        phase: Math.random() * Math.PI * 2,
    });
}

// --- Layer helpers -----------------------------------------------------------------

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

// Run one of the existing drawing routines into another context
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
    if (!scene.glaze) {
        scene.glaze = buildGlazeTile();
        scene.dust = buildDustSprites();
    }
    scene.floor = buildFloorLayer();
    scene.furniture = buildFurnitureLayer();
    scene.light = buildLightLayer();
}

// --- Floor -------------------------------------------------------------------------------

// Hardwood planks: half-tile-high boards of varying length and tone, grain, knots and seams
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
            // grain
            c.lineWidth = 0.8;
            for (let i = 0; i < 4; i++) {
                const gy = y + 3 + i * (plankH / 4) + rnd() * 3;
                c.strokeStyle = `rgba(120, 88, 52, ${0.1 + rnd() * 0.14})`;
                c.beginPath();
                c.moveTo(x + 2, gy);
                c.bezierCurveTo(x + len * 0.3, gy + rnd() * 3 - 1.5, x + len * 0.7, gy - rnd() * 3 + 1.5, x + len - 2, gy + rnd() * 2 - 1);
                c.stroke();
            }
            // a knot now and then
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
            // board end and top-edge catchlight
            c.fillStyle = 'rgba(90, 65, 40, 0.4)';
            c.fillRect(x + len - 1.2, y, 1.4, plankH);
            c.fillStyle = 'rgba(255, 255, 255, 0.1)';
            c.fillRect(x, y, len, 1);
            x += len;
        }
        c.fillStyle = 'rgba(90, 65, 40, 0.32)';
        c.fillRect(0, y + plankH - 1, W, 1);
    }
    // a soft sheen across the room
    const sheen = c.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.3, 'rgba(255,255,255,0.09)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.07)');
    c.fillStyle = sheen;
    c.fillRect(0, 0, W, H);
    // faint tile grid, so moves stay countable
    c.strokeStyle = 'rgba(60, 40, 20, 0.09)';
    c.lineWidth = 1;
    for (let i = 1; i < cols; i++) {
        c.beginPath();
        c.moveTo(i * tilePx + 0.5, 0);
        c.lineTo(i * tilePx + 0.5, H);
        c.stroke();
    }
    for (let i = 1; i < rows; i++) {
        c.beginPath();
        c.moveTo(0, i * tilePx + 0.5);
        c.lineTo(W, i * tilePx + 0.5);
        c.stroke();
    }
}

function buildFloorLayer() {
    const L = makeLayer();
    const c = L.ctx;
    paintWoodFloor(c, 1000 + currentLevel * 7919);
    // ambient occlusion where the floor meets the walls
    const ao = 36;
    const edges = [
        [0, 0, 0, ao],
        [0, CANVAS_H, 0, CANVAS_H - ao],
        [0, 0, ao, 0],
        [CANVAS_W, 0, CANVAS_W - ao, 0],
    ];
    for (const [x0, y0, x1, y1] of edges) {
        const g = c.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(40, 25, 10, 0.3)');
        g.addColorStop(1, 'rgba(40, 25, 10, 0)');
        c.fillStyle = g;
        c.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    withCtx(c, drawBaseboards);
    return L.canvas;
}

// Dust on a tile that still needs cleaning: fluff, crumbs and a stray hair, in three variants.
// Drawn into an n-pixel square; shared with the 3D floor textures.
function paintDust(t, n, v) {
    const k = n / TILE;
    const rnd = seededRandom(77 + v * 31);
    for (let i = 0; i < 4; i++) {
        const x = (6 + rnd() * 36) * k, y = (6 + rnd() * 36) * k, r = (2.5 + rnd() * 3.5) * k;
        const g = t.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(165, 155, 145, 0.5)');
        g.addColorStop(1, 'rgba(165, 155, 145, 0)');
        t.fillStyle = g;
        t.beginPath();
        t.arc(x, y, r, 0, Math.PI * 2);
        t.fill();
    }
    for (let i = 0; i < 8; i++) {
        t.fillStyle = `rgba(${100 + (rnd() * 40) | 0}, ${70 + (rnd() * 30) | 0}, ${40 + (rnd() * 20) | 0}, ${0.35 + rnd() * 0.3})`;
        t.beginPath();
        t.arc((4 + rnd() * 40) * k, (4 + rnd() * 40) * k, (0.7 + rnd() * 1.1) * k, 0, Math.PI * 2);
        t.fill();
    }
    if (v !== 1) {
        t.strokeStyle = 'rgba(60, 50, 45, 0.4)';
        t.lineWidth = 0.7 * k;
        const x0 = (6 + rnd() * 34) * k, y0 = (6 + rnd() * 34) * k;
        t.beginPath();
        t.moveTo(x0, y0);
        t.bezierCurveTo(x0 + (rnd() * 20 - 10) * k, y0 + (rnd() * 20 - 10) * k, x0 + (rnd() * 20 - 10) * k, y0 + (rnd() * 20 - 10) * k, x0 + (rnd() * 16 - 8) * k, y0 + (rnd() * 16 - 8) * k);
        t.stroke();
    }
}

// Polish over a cleaned tile: the wood shows through a mint glaze with a gloss highlight
function paintGlaze(t, n) {
    const k = n / TILE;
    t.fillStyle = 'rgba(108, 224, 172, 0.6)';
    t.fillRect(0, 0, n, n);
    const g = t.createLinearGradient(0, 0, n, n);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.32, 'rgba(255,255,255,0.24)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    t.fillStyle = g;
    t.fillRect(0, 0, n, n);
    const s = t.createRadialGradient(12 * k, 10 * k, 0, 12 * k, 10 * k, 26 * k);
    s.addColorStop(0, 'rgba(255,255,255,0.22)');
    s.addColorStop(1, 'rgba(255,255,255,0)');
    t.fillStyle = s;
    t.fillRect(0, 0, n, n);
    t.strokeStyle = 'rgba(30, 110, 80, 0.28)';
    t.lineWidth = k;
    t.strokeRect(0.5 * k, 0.5 * k, n - k, n - k);
}

function buildDustSprites() {
    const out = [];
    for (let v = 0; v < 3; v++) out.push(makeTileSprite((t) => paintDust(t, TILE, v)));
    return out;
}

function buildGlazeTile() {
    return makeTileSprite((t) => paintGlaze(t, TILE));
}

// --- Furniture ---------------------------------------------------------------------------

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

function buildFurnitureLayer() {
    const L = makeLayer();
    const c = L.ctx;
    const lv = LEVELS[currentLevel];
    const walls = new Set();
    for (const o of lv.obstacles) {
        if (o.type !== 'wall') continue;
        for (let dr = 0; dr < o.h; dr++) for (let dc = 0; dc < o.w; dc++) walls.add(`${o.col + dc},${o.row + dr}`);
    }

    // Light comes from the window at the top right, so shadows fall down and to the left
    for (const o of lv.obstacles) {
        const x = o.col * TILE, y = o.row * TILE, w = o.w * TILE, h = o.h * TILE;
        if (o.type === 'wall') {
            castShadow(c, () => c.fillRect(x, y, w, h), -5, 7, 9, 0.42);
        } else if (o.type === 'plant') {
            castShadow(c, () => { c.beginPath(); c.ellipse(x + TILE / 2, y + TILE / 2, 15, 13, 0, 0, Math.PI * 2); c.fill(); }, -8, 10, 12, 0.38);
        } else if (o.type === 'chair') {
            castShadow(c, () => { roundRect(c, x + 8, y + 8, TILE - 16, TILE - 16, 5); c.fill(); }, -8, 10, 12, 0.38);
        } else {
            castShadow(c, () => { roundRect(c, x + 3, y + 3, w - 6, h - 6, 8); c.fill(); }, -10, 13, 20, 0.4);
        }
    }

    withCtx(c, drawObstacles);

    // Walls read as standing up: a catchlight on top, a dark lip where they meet the floor
    for (const key of walls) {
        const [cc, rr] = key.split(',').map(Number);
        const x = cc * TILE, y = rr * TILE;
        if (!walls.has(`${cc},${rr + 1}`)) {
            c.fillStyle = 'rgba(0, 0, 0, 0.3)';
            c.fillRect(x, y + TILE - 5, TILE, 5);
            c.fillStyle = 'rgba(0, 0, 0, 0.12)';
            c.fillRect(x, y + TILE - 9, TILE, 4);
        }
        if (!walls.has(`${cc},${rr - 1}`)) {
            c.fillStyle = 'rgba(255, 255, 255, 0.16)';
            c.fillRect(x, y, TILE, 2);
        }
        if (!walls.has(`${cc + 1},${rr}`)) {
            c.fillStyle = 'rgba(255, 255, 255, 0.08)';
            c.fillRect(x + TILE - 2, y, 2, TILE);
        }
    }
    return L.canvas;
}

// --- Light -----------------------------------------------------------------------------------

// Warm window light pooling on the floor from the top right, with stripes from the blinds
function buildLightLayer() {
    const L = makeLayer();
    const c = L.ctx;
    const pool = c.createRadialGradient(CANVAS_W - 110, 40, 20, CANVAS_W - 110, 40, 470);
    pool.addColorStop(0, 'rgba(255, 238, 196, 0.6)');
    pool.addColorStop(0.45, 'rgba(255, 230, 175, 0.26)');
    pool.addColorStop(1, 'rgba(255, 220, 150, 0)');
    c.fillStyle = pool;
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);
    c.save();
    c.translate(CANVAS_W - 50, -60);
    c.rotate(0.62);
    for (let i = 0; i < 7; i++) {
        c.fillStyle = `rgba(255, 248, 225, ${0.13 - i * 0.012})`;
        c.fillRect(-i * 64, 0, 28, CANVAS_H * 1.9);
    }
    c.restore();
    return L.canvas;
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
}

function drawTileStates(g, fades) {
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
                if (f < 1) {
                    ctx.save();
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
}

// Tiles that charge the vacuum thanks to the charging pad upgrade
function drawChargingPad() {
    if (!chargingPadGrid || padRadius() === 0) return;
    const lv = LEVELS[currentLevel];
    const pulse = 0.16 + 0.07 * Math.sin(chargerPulse * 0.05);
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (!chargingPadGrid[r][c] || (c === lv.charger.col && r === lv.charger.row)) continue;
            const x = c * TILE, y = r * TILE;
            ctx.fillStyle = `rgba(80, 150, 255, ${pulse})`;
            ctx.fillRect(x, y, TILE, TILE);
            ctx.strokeStyle = 'rgba(140, 190, 255, 0.55)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
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

function drawLighting() {
    ensureSceneLayers();
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.9 + 0.08 * Math.sin(chargerPulse * 0.012);
    ctx.drawImage(scene.light, 0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
    drawRoomVignette();
}

// Larger, slower motes drifting in the window light
function drawBokeh() {
    for (const m of bokehMotes) {
        m.x += m.vx * dtFrames;
        m.y += m.vy * dtFrames;
        if (m.y < -20 || m.x < CANVAS_W * 0.3) {
            m.y = CANVAS_H * 0.75 + Math.random() * 40;
            m.x = CANVAS_W * 0.5 + Math.random() * CANVAS_W * 0.5;
        }
        const a = 0.06 + 0.04 * Math.sin(chargerPulse * 0.01 + m.phase);
        const g = ctx.createRadialGradient(m.x, m.y, m.r * 0.3, m.x, m.y, m.r);
        g.addColorStop(0, `rgba(255, 250, 230, ${a})`);
        g.addColorStop(0.8, `rgba(255, 245, 220, ${a * 0.6})`);
        g.addColorStop(1, 'rgba(255, 245, 220, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
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
                alpha: 0.32,
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
