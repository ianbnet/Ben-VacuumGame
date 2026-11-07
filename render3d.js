// === FIRST-PERSON RENDERER ===
// Classic script that shares globals with game.js (loaded after it).
//
// A software raycaster drawing into an ImageData buffer, one ray per pixel column.
// Rays keep going past low furniture so the wall behind a couch is visible above it,
// floor and ceiling are texture-mapped, and every surface uses the 2D view's palette.

const FP_W = CANVAS_W;
const FP_H = CANVAS_H;
const FP_EYE = 0.28;                        // camera height in tile units; walls are 1.0, a Roomba is low
const FP_HORIZON = Math.round(FP_H * 0.47); // pitched slightly down: the floor is what the game is about
const FP_SCALE = FP_H;                      // screen pixels per tile unit at distance 1
const FP_MAX_STEPS = 48;
const FP_TEX = 64;                          // texture size in texels (square)
const FP_FOG = [236, 226, 208];             // warm haze, matching the 2D sunlight
const FP_FOG_PER_TILE = 0.04;
const FP_FOG_MAX = 0.5;
const FP_SPRITE_TYPES = { plant: 'spritePlant', chair: 'spriteChair' }; // drawn as billboards, not boxes
const FP_SPRITE_SIZE = { plant: { w: 0.8, h: 0.95 }, chair: { w: 0.85, h: 0.7 } }; // world size in tiles
const FP_BOTTOM_FACTORS = { table: 0.42 };  // raised slabs you can see under; a Roomba is lower than a table top
const FP_MINIMAP_SCALE = 9;

let fp3d = null; // renderer state: offscreen canvas, pixel buffer, textures

function lerpAngle(from, to, t) {
    let diff = to - from;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return from + diff * t;
}

// --- Textures -------------------------------------------------------------

// Draw a texture with canvas calls and bake it to packed 0xAARRGGBB texels.
// Alpha only matters for sprites, where transparent texels are skipped.
function fpMakeTexture(draw) {
    const c = document.createElement('canvas');
    c.width = FP_TEX;
    c.height = FP_TEX;
    const t = c.getContext('2d');
    draw(t, FP_TEX);
    const data = t.getImageData(0, 0, FP_TEX, FP_TEX).data;
    const out = new Uint32Array(FP_TEX * FP_TEX);
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let i = 0; i < out.length; i++) {
        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
        out[i] = (a << 24) | (r << 16) | (g << 8) | b;
        if (a > 127) { sr += r; sg += g; sb += b; n++; }
    }
    n = n || 1;
    out.avg = ((sr / n) << 16) | ((sg / n) << 8) | (sb / n);
    return out;
}

// Deterministic pseudo-random so textures look the same every load
function fpRand(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function fpBuildTextures() {
    const tex = {};

    tex.wall = fpMakeTexture((t, n) => {
        t.fillStyle = '#A89890'; // mortar
        t.fillRect(0, 0, n, n);
        const bricks = ['#826565', '#8A7070', '#7A5E5E', '#908580'];
        const bw = 16, bh = 8;
        for (let row = 0; row < n / bh; row++) {
            const off = (row % 2) * (bw / 2);
            for (let i = -1; i <= n / bw; i++) {
                t.fillStyle = bricks[(row * 3 + i + 4) % bricks.length];
                t.fillRect(i * bw + off + 1, row * bh + 1, bw - 2, bh - 2);
                t.fillStyle = 'rgba(255,255,255,0.08)';
                t.fillRect(i * bw + off + 1, row * bh + 1, bw - 2, 1);
            }
        }
    });

    tex.couch = fpMakeTexture((t, n) => {
        t.fillStyle = '#5D4037';
        t.fillRect(0, 0, n, n);
        // fabric weave
        t.fillStyle = 'rgba(255,255,255,0.05)';
        for (let y = 0; y < n; y += 3) t.fillRect(0, y, n, 1);
        // cushion top band and skirt
        t.fillStyle = '#6D4C41';
        t.fillRect(0, 0, n, n * 0.22);
        t.fillStyle = '#4E342E';
        t.fillRect(0, n * 0.84, n, n * 0.16);
        // seams between cushions
        t.fillStyle = '#3E2723';
        t.fillRect(n / 3 - 1, 0, 2, n * 0.84);
        t.fillRect((2 * n) / 3 - 1, 0, 2, n * 0.84);
        t.fillRect(0, n * 0.22, n, 2);
        t.fillStyle = 'rgba(255,255,255,0.12)';
        t.fillRect(0, 0, n, 2);
    });

    tex.table = fpMakeTexture((t, n) => {
        t.fillStyle = '#7D5E53';
        t.fillRect(0, 0, n, n);
        const rnd = fpRand(7);
        t.strokeStyle = 'rgba(80, 50, 25, 0.35)';
        t.lineWidth = 1;
        for (let i = 0; i < 9; i++) {
            const y = 4 + i * 7 + rnd() * 3;
            t.beginPath();
            t.moveTo(0, y);
            t.bezierCurveTo(n * 0.3, y + rnd() * 3 - 1.5, n * 0.7, y - rnd() * 3 + 1.5, n, y + rnd() * 2 - 1);
            t.stroke();
        }
        t.fillStyle = '#6D5040'; // apron under the top
        t.fillRect(0, n * 0.1, n, 3);
        t.fillStyle = 'rgba(255,255,255,0.18)';
        t.fillRect(0, 0, n, n * 0.1);
    });

    tex.chair = fpMakeTexture((t, n) => {
        t.fillStyle = '#757575';
        t.fillRect(0, 0, n, n);
        for (let x = 0; x < n; x += 8) {
            t.fillStyle = x % 16 === 0 ? '#8A8A8A' : '#666666';
            t.fillRect(x, 0, 8, n);
            t.fillStyle = 'rgba(255,255,255,0.12)';
            t.fillRect(x, 0, 2, n);
        }
        t.fillStyle = '#5E5E5E'; // seat line
        t.fillRect(0, n * 0.55, n, 3);
        t.fillStyle = 'rgba(0,0,0,0.25)';
        t.fillRect(0, n * 0.9, n, n * 0.1);
    });

    tex.plant = fpMakeTexture((t, n) => {
        // pot on the lower part, leaves above
        t.fillStyle = '#2E7D32';
        t.fillRect(0, 0, n, n);
        const rnd = fpRand(3);
        const greens = ['#4CAF50', '#388E3C', '#2E7D32', '#5CBF60'];
        for (let i = 0; i < 70; i++) {
            t.fillStyle = greens[i % greens.length];
            t.beginPath();
            t.ellipse(rnd() * n, rnd() * n * 0.62, 3 + rnd() * 4, 1.5 + rnd() * 2, rnd() * Math.PI, 0, Math.PI * 2);
            t.fill();
        }
        t.fillStyle = '#C07848';
        t.fillRect(0, n * 0.62, n, n * 0.38);
        t.fillStyle = '#9A5835';
        t.fillRect(0, n * 0.62, n, 4);
        t.fillRect(0, n * 0.9, n, n * 0.1);
        t.fillStyle = 'rgba(255,255,255,0.15)';
        t.fillRect(n * 0.15, n * 0.68, 4, n * 0.2);
    });

    tex.petbed = fpMakeTexture((t, n) => {
        t.fillStyle = '#E57373';
        t.fillRect(0, 0, n, n);
        t.fillStyle = '#EF9A9A'; // padded rim
        t.fillRect(0, 0, n, n * 0.3);
        t.strokeStyle = 'rgba(160, 60, 60, 0.5)';
        t.setLineDash([3, 3]);
        t.lineWidth = 1;
        t.beginPath();
        t.moveTo(0, n * 0.3 + 1.5);
        t.lineTo(n, n * 0.3 + 1.5);
        t.stroke();
        t.setLineDash([]);
        t.fillStyle = 'rgba(255,255,255,0.15)';
        for (let y = n * 0.4; y < n; y += 6) t.fillRect(0, y, n, 1);
    });

    // Billboard sprites: transparent background, drawn from a low viewpoint
    tex.spritePlant = fpMakeTexture((t, n) => {
        t.clearRect(0, 0, n, n);
        // pot
        t.fillStyle = '#C07848';
        t.beginPath();
        t.moveTo(n * 0.28, n * 0.62);
        t.lineTo(n * 0.72, n * 0.62);
        t.lineTo(n * 0.66, n * 0.98);
        t.lineTo(n * 0.34, n * 0.98);
        t.closePath();
        t.fill();
        t.fillStyle = '#9A5835';
        t.fillRect(n * 0.26, n * 0.6, n * 0.48, n * 0.07);
        t.fillStyle = 'rgba(255,255,255,0.18)';
        t.fillRect(n * 0.34, n * 0.7, n * 0.06, n * 0.22);
        // leaves
        const rnd = fpRand(5);
        const greens = ['#4CAF50', '#388E3C', '#2E7D32', '#5CBF60', '#43A047'];
        for (let i = 0; i < 26; i++) {
            const a = rnd() * Math.PI * 2;
            const len = n * (0.16 + rnd() * 0.22);
            const cx = n * 0.5 + Math.cos(a) * len * 0.5;
            const cy = n * 0.36 + Math.sin(a) * len * 0.45;
            t.fillStyle = greens[i % greens.length];
            t.beginPath();
            t.ellipse(cx, cy, len * 0.5, len * 0.18, a, 0, Math.PI * 2);
            t.fill();
        }
        t.fillStyle = '#2E7D32';
        t.fillRect(n * 0.48, n * 0.4, n * 0.04, n * 0.24);
    });

    tex.spriteChair = fpMakeTexture((t, n) => {
        t.clearRect(0, 0, n, n);
        const dark = '#5E5E5E', mid = '#757575', light = '#8F8F8F';
        // back posts and rails
        t.fillStyle = mid;
        t.fillRect(n * 0.22, n * 0.04, n * 0.08, n * 0.5);
        t.fillRect(n * 0.70, n * 0.04, n * 0.08, n * 0.5);
        t.fillStyle = light;
        t.fillRect(n * 0.22, n * 0.06, n * 0.56, n * 0.07);
        t.fillRect(n * 0.22, n * 0.2, n * 0.56, n * 0.06);
        t.fillRect(n * 0.22, n * 0.33, n * 0.56, n * 0.06);
        // seat
        t.fillStyle = mid;
        t.fillRect(n * 0.14, n * 0.5, n * 0.72, n * 0.12);
        t.fillStyle = 'rgba(255,255,255,0.15)';
        t.fillRect(n * 0.14, n * 0.5, n * 0.72, n * 0.03);
        // legs
        t.fillStyle = dark;
        t.fillRect(n * 0.17, n * 0.62, n * 0.07, n * 0.36);
        t.fillRect(n * 0.76, n * 0.62, n * 0.07, n * 0.36);
        t.fillRect(n * 0.3, n * 0.62, n * 0.05, n * 0.3);
        t.fillRect(n * 0.65, n * 0.62, n * 0.05, n * 0.3);
        t.fillRect(n * 0.17, n * 0.8, n * 0.66, n * 0.04);
    });

    tex.ceiling = fpMakeTexture((t, n) => {
        t.fillStyle = '#E9E2D5';
        t.fillRect(0, 0, n, n);
        const rnd = fpRand(11);
        for (let i = 0; i < 160; i++) {
            t.fillStyle = `rgba(120, 100, 80, ${0.03 + rnd() * 0.05})`;
            t.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 2, 1);
        }
        t.fillStyle = 'rgba(0,0,0,0.06)'; // panel seams
        t.fillRect(0, 0, n, 1);
        t.fillRect(0, 0, 1, n);
    });

    // Floor textures come straight from the 2D tile artwork so both views match
    tex.floor = fpMakeTexture((t, n) => {
        if (floorTileCanvas) t.drawImage(floorTileCanvas, 0, 0, n, n);
        else { t.fillStyle = COLORS.dirty; t.fillRect(0, 0, n, n); }
    });
    tex.clean = fpMakeTexture((t, n) => {
        if (cleanTileCanvas) t.drawImage(cleanTileCanvas, 0, 0, n, n);
        else { t.fillStyle = COLORS.clean; t.fillRect(0, 0, n, n); }
    });

    tex.dock = fpMakeTexture((t, n) => {
        t.fillStyle = '#E0D4C0';
        t.fillRect(0, 0, n, n);
        const glow = t.createRadialGradient(n / 2, n / 2, 2, n / 2, n / 2, n * 0.7);
        glow.addColorStop(0, 'rgba(60, 180, 255, 0.55)');
        glow.addColorStop(1, 'rgba(60, 140, 255, 0)');
        t.fillStyle = glow;
        t.fillRect(0, 0, n, n);
        t.fillStyle = '#444';
        roundRect(t, n * 0.15, n * 0.15, n * 0.7, n * 0.7, 8);
        t.fill();
        t.fillStyle = '#262626';
        roundRect(t, n * 0.25, n * 0.25, n * 0.5, n * 0.5, 6);
        t.fill();
        t.fillStyle = '#FFD600';
        const cx = n / 2, cy = n / 2;
        t.beginPath();
        t.moveTo(cx - 3, cy - 10); t.lineTo(cx + 6, cy - 10); t.lineTo(cx + 1, cy - 1);
        t.lineTo(cx + 6, cy - 1); t.lineTo(cx - 3, cy + 10); t.lineTo(cx + 1, cy + 1);
        t.lineTo(cx - 5, cy + 1); t.closePath();
        t.fill();
    });

    return tex;
}

// --- Setup ----------------------------------------------------------------

function initFirstPerson() {
    const c = document.createElement('canvas');
    c.width = FP_W;
    c.height = FP_H;
    const t = c.getContext('2d');
    const image = t.createImageData(FP_W, FP_H);

    // Per-row distances and fog for floor and ceiling never change, so bake them once
    const floorDist = new Float32Array(FP_H);
    const ceilDist = new Float32Array(FP_H);
    const floorFog = new Float32Array(FP_H);
    const ceilFog = new Float32Array(FP_H);
    for (let y = 0; y < FP_H; y++) {
        if (y > FP_HORIZON) {
            floorDist[y] = (FP_EYE * FP_SCALE) / (y - FP_HORIZON);
            floorFog[y] = Math.min(FP_FOG_MAX, floorDist[y] * FP_FOG_PER_TILE);
        } else if (y < FP_HORIZON) {
            ceilDist[y] = ((1 - FP_EYE) * FP_SCALE) / (FP_HORIZON - y);
            ceilFog[y] = Math.min(FP_FOG_MAX, ceilDist[y] * FP_FOG_PER_TILE);
        }
    }

    fp3d = {
        canvas: c,
        ctx: t,
        image,
        buf: new Uint32Array(image.data.buffer),
        tex: fpBuildTextures(),
        floorDist, ceilDist, floorFog, ceilFog,
        hits: [],
        sprites: [],      // projected sprites for the current frame
        colSprites: [],   // the ones covering the column being drawn
        levelSprites: [], // world positions of sprite obstacles, rebuilt per level
        spriteLevel: -1,
        fogPacked: 0xFF000000 | (FP_FOG[2] << 16) | (FP_FOG[1] << 8) | FP_FOG[0],
    };
}

// World positions of the plants and chairs in the current level
function fpLevelSprites() {
    if (fp3d.spriteLevel !== currentLevel) {
        fp3d.levelSprites = [];
        for (const obs of LEVELS[currentLevel].obstacles) {
            const key = FP_SPRITE_TYPES[obs.type];
            if (!key) continue;
            for (let dr = 0; dr < obs.h; dr++) {
                for (let dc = 0; dc < obs.w; dc++) {
                    fp3d.levelSprites.push({ x: obs.col + dc + 0.5, y: obs.row + dr + 0.5, type: obs.type, texKey: key });
                }
            }
        }
        fp3d.spriteLevel = currentLevel;
    }
    return fp3d.levelSprites;
}

// Shade a packed 0xRRGGBB texel: multiply by `shade`, blend toward fog by `fog`, return ABGR for the buffer
function fpShade(rgb, shade, fog) {
    let r = ((rgb >> 16) & 255) * shade;
    let g = ((rgb >> 8) & 255) * shade;
    let b = (rgb & 255) * shade;
    if (fog > 0) {
        r += (FP_FOG[0] - r) * fog;
        g += (FP_FOG[1] - g) * fog;
        b += (FP_FOG[2] - b) * fog;
    }
    if (r > 255) r = 255;
    if (g > 255) g = 255;
    if (b > 255) b = 255;
    return 0xFF000000 | (b << 16) | (g << 8) | r;
}

// --- Camera ---------------------------------------------------------------

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
        sprites: fpLevelSprites(),
        aheadCol: aheadOk ? aheadCol : -1,
        aheadRow: aheadOk ? aheadRow : -1,
        onDock: grid[roomba.row][roomba.col] === CHARGER,
        showHud: true,
        ghost: false,
    };
}

// The ghost's point of view during the par-route replay
function fpGhostView() {
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
        sprites: fpLevelSprites(),
        aheadCol: -1,
        aheadRow: -1,
        onDock: false,
        showHud: false,
        ghost: true,
    };
}

// --- Scene ----------------------------------------------------------------

function fpRenderScene(view) {
    const W = FP_W, H = FP_H;
    const buf = fp3d.buf;
    const tex = fp3d.tex;
    const g = view.grid;
    const tmap = view.typeMap;
    const camX = view.camX, camY = view.camY;
    const dirX = Math.cos(view.angle), dirY = Math.sin(view.angle);
    const planeLen = Math.tan(FP_FOV / 2);
    const planeX = -dirY * planeLen, planeY = dirX * planeLen;
    const horizon = FP_HORIZON;
    const eyeS = FP_EYE * FP_SCALE;
    const floorDist = fp3d.floorDist, ceilDist = fp3d.ceilDist;
    const floorFog = fp3d.floorFog, ceilFog = fp3d.ceilFog;
    const fogPacked = fp3d.fogPacked;
    const hits = fp3d.hits;
    const aheadCol = view.aheadCol, aheadRow = view.aheadRow;
    const T = FP_TEX, TM = FP_TEX - 1;

    // Project this frame's sprites to screen space, farthest first
    const sprites = fp3d.sprites;
    sprites.length = 0;
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const halfW = W / 2;
    for (const s of view.sprites || []) {
        const rx = s.x - camX, ry = s.y - camY;
        const tx = invDet * (dirY * rx - dirX * ry);
        const ty = invDet * (-planeY * rx + planeX * ry); // depth
        if (ty <= 0.08) continue;
        const sx = halfW * (1 + tx / ty);
        const size = FP_SPRITE_SIZE[s.type];
        const wPx = ((halfW / planeLen) * size.w) / ty;
        const left = sx - wPx / 2, right = sx + wPx / 2;
        if (right < 0 || left >= W) continue;
        sprites.push({
            depth: ty, left, right,
            top: horizon - ((size.h - FP_EYE) * FP_SCALE) / ty,
            bot: horizon + eyeS / ty,
            tex: tex[s.texKey],
            fog: Math.min(FP_FOG_MAX, ty * FP_FOG_PER_TILE),
        });
    }
    sprites.sort((a, b) => b.depth - a.depth);
    const colSprites = fp3d.colSprites;

    const paintSprite = (s, x) => {
        const texture = s.tex;
        const u = (((x - s.left) / (s.right - s.left)) * TM) | 0;
        const hgt = s.bot - s.top;
        const y0 = Math.max(0, Math.ceil(s.top));
        const y1 = Math.min(H - 1, Math.floor(s.bot));
        for (let y = y0; y <= y1; y++) {
            const tv = (((y - s.top) / hgt) * TM) | 0;
            const texel = texture[tv * T + u];
            if (texel >>> 24 < 128) continue; // transparent
            buf[y * W + x] = fpShade(texel, 1.0, s.fog);
        }
    };

    for (let x = 0; x < W; x++) {
        const cameraX = (2 * x) / W - 1;
        const rayDirX = dirX + planeX * cameraX;
        const rayDirY = dirY + planeY * cameraX;

        // Floor: every row below the horizon, textured by the tile the ray lands on
        for (let y = horizon + 1; y < H; y++) {
            const d = floorDist[y];
            const fx = camX + rayDirX * d;
            const fy = camY + rayDirY * d;
            const tc = Math.floor(fx), tr = Math.floor(fy);
            if (tc < 0 || tc >= COLS || tr < 0 || tr >= ROWS) {
                buf[y * W + x] = fogPacked;
                continue;
            }
            const cell = g[tr][tc];
            const texture = cell === CLEAN ? tex.clean : cell === CHARGER ? tex.dock : tex.floor;
            const tu = ((fx - tc) * TM) | 0;
            const tv = ((fy - tr) * TM) | 0;
            let shade = (tc + tr) & 1 ? 0.95 : 1.0; // faint checker so tiles can be counted
            if (tc === aheadCol && tr === aheadRow) shade = 1.18; // the tile a forward press reaches
            buf[y * W + x] = fpShade(texture[tv * T + tu], shade, floorFog[y]);
        }

        // Ceiling: rows above the horizon
        for (let y = 0; y < horizon; y++) {
            const d = ceilDist[y];
            const fx = camX + rayDirX * d;
            const fy = camY + rayDirY * d;
            const tu = ((fx - Math.floor(fx)) * TM) | 0;
            const tv = ((fy - Math.floor(fy)) * TM) | 0;
            buf[y * W + x] = fpShade(tex.ceiling[tv * T + tu], 1.0, ceilFog[y]);
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
            if (mapX < 0 || mapX >= COLS || mapY < 0 || mapY >= ROWS) {
                type = 'wall';
            } else if (g[mapY][mapX] === OBSTACLE) {
                type = tmap[mapY][mapX] || 'wall';
                if (FP_SPRITE_TYPES[type]) type = null; // drawn as a sprite instead
            }
            if (type) {
                const wallX = side === 0 ? camY + perp * rayDirY : camX + perp * rayDirX;
                let u = wallX - Math.floor(wallX);
                if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) u = 1 - u;
                const h = FP_HEIGHT_FACTORS[type] || 1;
                hits.push({ dist: perp, dExit: 0, type, side, u, h, hb: FP_BOTTOM_FACTORS[type] || 0 });
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
        // slotting each sprite in at its own depth
        for (let i = hits.length - 1; i >= 0; i--) {
            const hit = hits[i];
            const d = hit.dist;
            while (si < colSprites.length && colSprites[si].depth >= d) paintSprite(colSprites[si++], x);
            const texture = tex[hit.type] || tex.wall;
            const top = horizon - ((hit.h - FP_EYE) * FP_SCALE) / d;
            const raised = hit.hb > FP_EYE; // a table top: open underneath
            const bot = raised ? horizon - ((hit.hb - FP_EYE) * FP_SCALE) / d : horizon + eyeS / d;
            const faceH = bot - top;
            const y0 = Math.max(0, Math.ceil(top));
            const y1 = Math.min(H - 1, Math.floor(bot));
            const fog = Math.min(FP_FOG_MAX, d * FP_FOG_PER_TILE);
            const shade = hit.side === 1 ? 0.78 : 1.0;
            const tu = (hit.u * TM) | 0;
            for (let y = y0; y <= y1; y++) {
                const tv = (((y - top) / faceH) * TM) | 0;
                buf[y * W + x] = fpShade(texture[tv * T + tu], y === y0 ? shade * 0.75 : shade, fog);
            }
            // Top face of anything lower than the eye
            if (hit.h < FP_EYE && hit.dExit > 0) {
                const topFar = horizon - ((hit.h - FP_EYE) * FP_SCALE) / hit.dExit;
                const ya = Math.max(0, Math.ceil(topFar));
                const yb = Math.min(H - 1, Math.floor(top));
                const c = fpShade(texture.avg, 1.25, fog);
                for (let y = ya; y < yb; y++) buf[y * W + x] = c;
            }
            // Underside of a raised slab
            if (raised && hit.dExit > 0) {
                const botFar = horizon - ((hit.hb - FP_EYE) * FP_SCALE) / hit.dExit;
                const ya = Math.max(0, Math.ceil(bot));
                const yb = Math.min(H - 1, Math.floor(botFar));
                const c = fpShade(texture.avg, 0.45, fog);
                for (let y = ya; y < yb; y++) buf[y * W + x] = c;
            }
        }
        // Sprites nearer than everything solid
        while (si < colSprites.length) paintSprite(colSprites[si++], x);
    }

    fp3d.ctx.putImageData(fp3d.image, 0, 0);
}

// --- HUD ------------------------------------------------------------------

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
    const span = 1.15; // radians visible to each side of centre
    for (const [label, a] of points) {
        let off = a - angle;
        while (off > Math.PI) off -= 2 * Math.PI;
        while (off < -Math.PI) off += 2 * Math.PI;
        if (Math.abs(off) > span) continue;
        const px = cx + (off / span) * (stripW / 2 - 16);
        const centred = Math.abs(off) < 0.12;
        ctx.globalAlpha = 1 - Math.abs(off) / span * 0.7;
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
    const cost = LEVELS[currentLevel].batteryCost || 1;
    const lowBattery = roomba.battery <= 20;
    const needsDock = dockDist >= 0 && roomba.battery <= (dockDist + 2) * cost && dockDist > 0;

    ctx.save();
    ctx.textBaseline = 'middle';

    // Top-left: tiles left and dock distance
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

    // Top-right: battery bar
    const bw = 130, bh = 12, bx = CANVAS_W - bw - 14, by = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, bx - 8, 10, bw + 16, 46, 6);
    ctx.fill();
    ctx.fillStyle = '#222';
    roundRect(ctx, bx, by, bw, bh, 5);
    ctx.fill();
    const pct = roomba.battery / 100;
    let color = pct > 0.5 ? '#4CAF50' : pct > 0.2 ? '#FFC107' : '#F44336';
    if (lowBattery) {
        const pulse = 0.6 + 0.4 * Math.sin(chargerPulse * 0.25);
        ctx.globalAlpha = pulse;
    }
    ctx.fillStyle = color;
    if (pct > 0) {
        roundRect(ctx, bx, by, Math.max(6, bw * pct), bh, 5);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right';
    ctx.font = 'bold 13px Segoe UI, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(`Battery ${roomba.battery}%`, bx + bw, 43);
    ctx.restore();

    // Low battery: red vignette that breathes
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
    // Field of view and position
    const px = mx + view.camX * s, py = my + view.camY * s;
    ctx.fillStyle = 'rgba(255,255,150,0.18)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    const cone = 30;
    ctx.lineTo(px + Math.cos(view.angle - FP_FOV / 2) * cone, py + Math.sin(view.angle - FP_FOV / 2) * cone);
    ctx.lineTo(px + Math.cos(view.angle + FP_FOV / 2) * cone, py + Math.sin(view.angle + FP_FOV / 2) * cone);
    ctx.closePath();
    ctx.fill();
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
    ctx.strokeStyle = bumpFlash > 0 ? `rgba(255, 82, 82, ${0.5 + bumpFlash / 20})` : '#1A9A8A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 7, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    ctx.fillStyle = 'rgba(20,20,20,0.7)';
    for (let i = -3; i <= 3; i++) {
        const a = Math.PI * 1.5 + i * 0.09;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), 2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// --- Entry point ----------------------------------------------------------

function renderFirstPerson(view) {
    if (!fp3d) initFirstPerson();
    view = view || fpPlayerView();

    fpRenderScene(view);

    // Bumping shakes the camera a little
    const shakeX = bumpFlash > 0 ? Math.sin(chargerPulse * 1.9) * bumpFlash * 0.7 : 0;
    const shakeY = bumpFlash > 0 ? Math.cos(chargerPulse * 2.6) * bumpFlash * 0.45 : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const grow = bumpFlash > 0 ? 6 : 0;
    ctx.drawImage(fp3d.canvas, shakeX - grow, shakeY - grow, CANVAS_W + grow * 2, CANVAS_H + grow * 2);
    ctx.restore();

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

    if (!view.ghost) fpDrawBumper(shakeX, shakeY);
    fpDrawCompass(view.angle);
    if (view.showHud) fpDrawStatus();
    fpDrawMinimap(view);
}
