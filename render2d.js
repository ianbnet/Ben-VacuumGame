// === TOP-DOWN RENDERER ===
// Classic script sharing globals with game.js: the board's furniture, dock, vacuum, ghost,
// overlays, banner and help, in the same 1950s atomic-age look as the 3D view. The room's
// static layers live in scene2d.js; this file draws the pieces into them and everything that
// moves on top.

const UI_FONT = '"Futura", "Avenir Next", "Century Gothic", "Gill Sans", "Segoe UI", sans-serif';
const UI = { cream: '#F2E8D5', mustard: '#D9A441', teal: '#237E78', mint: '#9ED8CC', coral: '#E76F51', ink: 'rgba(22, 30, 34, 0.94)' };

// The scene layers rebuild themselves when the level or the canvas density changes; this is
// called by game.js at start and after a density change
function createFloorPatterns() {
    scene.level = -1;
}

// Helper to darken/lighten a hex color
function shadeColor(color, amount) {
    const num = parseInt(color.slice(1), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function uiText(text, x, y, size, color, align, weight, spacing) {
    ctx.font = `${weight || '500'} ${size}px ${UI_FONT}`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    if (spacing !== undefined && 'letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

// An atomic starburst: alternating long and short rays with a bead on each long tip
function drawStarburst(c, x, y, r, color, rays = 8, width = 1.2) {
    c.save();
    c.translate(x, y);
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = width;
    c.lineCap = 'round';
    for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2;
        const len = i % 2 ? r * 0.55 : r;
        c.beginPath();
        c.moveTo(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18);
        c.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        c.stroke();
        if (i % 2 === 0) {
            c.beginPath();
            c.arc(Math.cos(a) * len, Math.sin(a) * len, width * 1.3, 0, Math.PI * 2);
            c.fill();
        }
    }
    c.beginPath();
    c.arc(0, 0, width * 1.6, 0, Math.PI * 2);
    c.fill();
    c.restore();
}

// --- Furniture, painted once per level into the furniture layer ----------------------------

// Each piece is drawn in its own frame: origin at the footprint's centre, +x across the piece,
// +y towards its front, then turned so its back faces the nearest wall, as in the 3D room
function paintFurniture(c, theme) {
    const lv = LEVELS[currentLevel];
    const sun = scene.sun;
    const items = lv.obstacles.map((o, i) => {
        const facing = o.type === 'wall' ? 'north' : s3Facing(o);
        const swap = facing === 'east' || facing === 'west';
        return {
            o, i, yaw: S3_YAW[facing], lw: swap ? o.h : o.w, ld: swap ? o.w : o.h,
            cx: (o.col + o.w / 2) * TILE, cy: (o.row + o.h / 2) * TILE,
        };
    });
    const walls = items.filter((it) => it.o.type === 'wall');
    const pieces = items.filter((it) => it.o.type !== 'wall');
    const wallSet = new Set();
    for (const it of walls) for (let dr = 0; dr < it.o.h; dr++) for (let dc = 0; dc < it.o.w; dc++) wallSet.add(`${it.o.col + dc},${it.o.row + dr}`);

    // Shadows first: the walls as one shape, so their shadows merge without seams
    if (walls.length) {
        const h = S2_WALL_HEIGHTS[theme.wallStyle] || 4.8;
        const mid = walls.reduce((a, it) => [a[0] + it.cx / walls.length, a[1] + it.cy / walls.length], [0, 0]);
        const s = s2Shadow(sun, theme.lamp, mid[0] / TILE, mid[1] / TILE, h);
        castShadow(c, () => {
            c.beginPath();
            for (const it of walls) {
                const inset = theme.wallStyle === 'crate' ? 3 : 1;
                c.rect(it.o.col * TILE + inset, it.o.row * TILE + inset, it.o.w * TILE - 2 * inset, it.o.h * TILE - 2 * inset);
            }
            c.fill();
        }, s.dx * TILE, s.dy * TILE, s.blur, s.alpha);
    }
    for (const it of pieces) {
        const s = s2Shadow(sun, theme.lamp, it.cx / TILE, it.cy / TILE, S2_HEIGHTS[it.o.type] || 1);
        castShadow(c, () => {
            c.save();
            c.translate(it.cx, it.cy);
            c.rotate(-it.yaw);
            pieceSilhouette(c, it);
            c.restore();
        }, s.dx * TILE, s.dy * TILE, s.blur, s.alpha);
    }

    // Then the pieces themselves
    for (const it of walls) paintWallTile(c, it, theme, wallSet);
    for (const it of pieces) {
        c.save();
        c.translate(it.cx, it.cy);
        c.rotate(-it.yaw);
        switch (it.o.type) {
            case 'couch': paintCouch(c, it.lw, it.ld, theme); break;
            case 'table': paintTable(c, it.lw, it.ld, theme); break;
            case 'chair': paintChair(c, theme); break;
            case 'plant': paintPlant(c, theme, currentLevel * 17 + it.i); break;
            case 'petbed': paintPetBed(c, it.lw, it.ld, theme); break;
            default:
                c.fillStyle = theme.walls;
                roundRect(c, -it.lw * TILE / 2 + 3, -it.ld * TILE / 2 + 3, it.lw * TILE - 6, it.ld * TILE - 6, 6);
                c.fill();
        }
        c.restore();
    }
}

function pieceSilhouette(c, it) {
    const W = it.lw * TILE, D = it.ld * TILE;
    switch (it.o.type) {
        case 'couch':
            roundRect(c, -W / 2 + 0.05 * TILE, -D / 2 + 0.05 * TILE, W - 0.1 * TILE, D - 0.1 * TILE, 0.1 * TILE);
            c.fill();
            break;
        case 'table':
            tablePath(c, it.lw, it.ld);
            c.fill();
            break;
        case 'chair':
            roundRect(c, -0.33 * TILE, -0.31 * TILE, 0.66 * TILE, 0.64 * TILE, 0.14 * TILE);
            c.fill();
            break;
        case 'plant':
            c.beginPath();
            c.arc(0, 0, 0.36 * TILE, 0, Math.PI * 2);
            c.fill();
            break;
        case 'petbed':
            c.beginPath();
            c.ellipse(0, 0, 0.545 * it.lw * 0.92 * TILE, 0.545 * it.ld * 0.9 * TILE, 0, 0, Math.PI * 2);
            c.fill();
            break;
        default:
            roundRect(c, -W / 2 + 3, -D / 2 + 3, W - 6, D - 6, 6);
            c.fill();
    }
}

// Sofa on a walnut frame: arms, a tufted back bolster, seat cushions, a throw pillow
function paintCouch(c, lw, ld, th) {
    const T = TILE, W = lw * T, D = ld * T;
    const wood = th.couchWood, fab = th.couch;
    const base = c.createLinearGradient(-W / 2, 0, W / 2, 0);
    base.addColorStop(0, shadeColor(wood, 14));
    base.addColorStop(0.5, wood);
    base.addColorStop(1, shadeColor(wood, -10));
    c.fillStyle = base;
    roundRect(c, -W / 2 + 0.05 * T, -D / 2 + 0.05 * T, W - 0.1 * T, D - 0.1 * T, 0.1 * T);
    c.fill();
    // arms
    for (const sx of [-1, 1]) {
        const ax = sx * (W / 2 - 0.09 * T) - 0.08 * T;
        const g = c.createLinearGradient(ax, 0, ax + 0.16 * T, 0);
        g.addColorStop(0, shadeColor(wood, sx < 0 ? 26 : 4));
        g.addColorStop(1, shadeColor(wood, sx < 0 ? 4 : 26));
        c.fillStyle = g;
        roundRect(c, ax, -D / 2 + 0.07 * T, 0.16 * T, D - 0.14 * T, 0.05 * T);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.14)';
        roundRect(c, ax + 1, -D / 2 + 0.07 * T, 0.16 * T - 2, 2, 1);
        c.fill();
    }
    // back bolster with tufting
    const innerW = W - 0.32 * T;
    const bolster = c.createLinearGradient(0, -D / 2 + 0.09 * T, 0, -D / 2 + 0.35 * T);
    bolster.addColorStop(0, shadeColor(fab, -34));
    bolster.addColorStop(0.5, shadeColor(fab, -14));
    bolster.addColorStop(1, shadeColor(fab, -30));
    c.fillStyle = bolster;
    roundRect(c, -innerW / 2, -D / 2 + 0.09 * T, innerW, 0.26 * T, 0.08 * T);
    c.fill();
    c.strokeStyle = 'rgba(255, 240, 220, 0.18)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-innerW / 2 + 0.1 * T, -D / 2 + 0.11 * T);
    c.lineTo(innerW / 2 - 0.1 * T, -D / 2 + 0.11 * T);
    c.stroke();
    // seat cushions
    const n = Math.max(1, Math.round(lw));
    const cw = innerW / n;
    for (let i = 0; i < n; i++) {
        const x = -innerW / 2 + cw * i;
        const sx = x + 0.02 * T, sy = -D / 2 + 0.37 * T, sw = cw - 0.04 * T, sh = D - 0.47 * T;
        const g = c.createRadialGradient(sx + sw * 0.4, sy + sh * 0.35, 2, sx + sw / 2, sy + sh / 2, sw * 0.75);
        g.addColorStop(0, shadeColor(fab, 22));
        g.addColorStop(0.6, fab);
        g.addColorStop(1, shadeColor(fab, -22));
        c.fillStyle = g;
        roundRect(c, sx, sy, sw, sh, 0.1 * T);
        c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.18)';
        c.lineWidth = 1;
        roundRect(c, sx + 0.5, sy + 0.5, sw - 1, sh - 1, 0.1 * T);
        c.stroke();
        c.fillStyle = shadeColor(th.couchWood, -10);
        for (const bx of [-0.25, 0.25]) {
            c.beginPath();
            c.arc(x + cw / 2 + bx * (cw - 0.1 * T), -D / 2 + 0.22 * T, 1.4, 0, Math.PI * 2);
            c.fill();
        }
    }
    // throw pillow, leaning in the corner
    c.save();
    c.translate(W / 2 - 0.5 * T, -D / 2 + 0.44 * T);
    c.rotate(0.3);
    const pg = c.createLinearGradient(-0.2 * T, -0.14 * T, 0.2 * T, 0.14 * T);
    pg.addColorStop(0, shadeColor(th.pillow, 24));
    pg.addColorStop(1, shadeColor(th.pillow, -18));
    c.fillStyle = pg;
    roundRect(c, -0.21 * T, -0.15 * T, 0.42 * T, 0.3 * T, 0.06 * T);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    roundRect(c, -0.19 * T, -0.13 * T, 0.38 * T, 0.26 * T, 0.05 * T);
    c.stroke();
    c.restore();
}

function tablePath(c, lw, ld) {
    const pts = s3TableOutline(lw, ld);
    c.beginPath();
    pts.forEach(([x, z], i) => (i ? c.lineTo(x * TILE, z * TILE) : c.moveTo(x * TILE, z * TILE)));
    c.closePath();
}

// Kidney coffee table: a walnut top with a gloss sweep, three splayed legs, something on it
function paintTable(c, lw, ld, th) {
    const T = TILE;
    const pts = s3TableOutline(lw, ld);
    // splayed legs with brass ferrules, just outside the top
    for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
        let best = pts[0], bd = Infinity;
        for (const p of pts) {
            const d = Math.abs(Math.atan2(Math.sin(Math.atan2(p[1], p[0]) - a), Math.cos(Math.atan2(p[1], p[0]) - a)));
            if (d < bd) { bd = d; best = p; }
        }
        const r = Math.hypot(best[0], best[1]);
        const fx = Math.cos(a) * (r + 0.07) * T, fy = Math.sin(a) * (r + 0.07) * T;
        c.strokeStyle = shadeColor(th.table, 10);
        c.lineWidth = 2.6;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(Math.cos(a) * r * 0.7 * T, Math.sin(a) * r * 0.7 * T);
        c.lineTo(fx, fy);
        c.stroke();
        c.fillStyle = scene.palette.brass;
        c.beginPath();
        c.arc(fx, fy, 2.2, 0, Math.PI * 2);
        c.fill();
    }
    const g = c.createLinearGradient(-lw * T / 2, -ld * T / 2, lw * T / 2, ld * T / 2);
    g.addColorStop(0, shadeColor(th.table, 28));
    g.addColorStop(0.5, th.table);
    g.addColorStop(1, shadeColor(th.table, -14));
    c.fillStyle = g;
    tablePath(c, lw, ld);
    c.fill();
    // grain
    c.save();
    tablePath(c, lw, ld);
    c.clip();
    c.strokeStyle = 'rgba(0,0,0,0.14)';
    c.lineWidth = 0.7;
    for (let i = -6; i <= 6; i++) {
        c.beginPath();
        c.moveTo(-lw * T / 2, i * 5);
        c.bezierCurveTo(-lw * T / 6, i * 5 + 3, lw * T / 6, i * 5 - 3, lw * T / 2, i * 5 + 1);
        c.stroke();
    }
    // gloss sweep
    const sw = c.createLinearGradient(-lw * T / 2, -ld * T / 2, lw * T / 4, ld * T / 2);
    sw.addColorStop(0, 'rgba(255,255,255,0)');
    sw.addColorStop(0.42, 'rgba(255,255,255,0.22)');
    sw.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    sw.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sw;
    c.fillRect(-lw * T, -ld * T, lw * T * 2, ld * T * 2);
    c.restore();
    c.strokeStyle = 'rgba(255, 235, 200, 0.35)';
    c.lineWidth = 1.5;
    tablePath(c, lw, ld);
    c.stroke();
    // a ceramic dish and a magazine
    c.fillStyle = th.pillow;
    c.beginPath();
    c.ellipse(0.28 * T, -0.14 * T, 0.14 * T, 0.1 * T, 0.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = scene.palette.cushion;
    c.beginPath();
    c.ellipse(0.28 * T, -0.14 * T, 0.09 * T, 0.06 * T, 0.2, 0, Math.PI * 2);
    c.fill();
    c.save();
    c.translate(-0.32 * T, 0.16 * T);
    c.rotate(-0.35);
    c.fillStyle = scene.palette.cushion;
    c.fillRect(-0.21 * T, -0.15 * T, 0.42 * T, 0.3 * T);
    c.fillStyle = th.accent.color;
    c.fillRect(-0.21 * T, -0.15 * T, 0.42 * T, 0.07 * T);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 3; i++) c.fillRect(-0.15 * T, -0.03 * T + i * 0.05 * T, 0.3 * T - i * 0.06 * T, 1);
    c.restore();
}

// Moulded shell chair on a wire base
function paintChair(c, th) {
    const T = TILE;
    const shell = th.chair;
    // wire base: four legs out to rubber feet
    c.strokeStyle = 'rgba(40,40,40,0.7)';
    c.lineWidth = 1.2;
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            c.beginPath();
            c.moveTo(sx * 0.2 * T, sz * 0.18 * T);
            c.lineTo(sx * 0.35 * T, sz * 0.34 * T);
            c.stroke();
            c.fillStyle = scene.palette.rubber;
            c.beginPath();
            c.arc(sx * 0.35 * T, sz * 0.34 * T, 2.2, 0, Math.PI * 2);
            c.fill();
        }
    }
    // seat
    const g = c.createRadialGradient(-0.08 * T, 0.06 * T, 2, 0, 0.06 * T, 0.42 * T);
    g.addColorStop(0, shadeColor(shell, 34));
    g.addColorStop(0.55, shell);
    g.addColorStop(1, shadeColor(shell, -20));
    c.fillStyle = g;
    roundRect(c, -0.3 * T, -0.24 * T, 0.6 * T, 0.54 * T, 0.12 * T);
    c.fill();
    // the shell's back curls up along the rear edge: a thick crescent, lit along its top
    const bg = c.createLinearGradient(0, -0.46 * T, 0, -0.12 * T);
    bg.addColorStop(0, shadeColor(shell, 18));
    bg.addColorStop(0.5, shadeColor(shell, -30));
    bg.addColorStop(1, shadeColor(shell, -48));
    c.fillStyle = bg;
    c.beginPath();
    c.arc(0, -0.06 * T, 0.4 * T, Math.PI * 1.04, Math.PI * 1.96);
    c.arc(0, -0.06 * T, 0.26 * T, Math.PI * 1.96, Math.PI * 1.04, true);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.4)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(0, -0.06 * T, 0.39 * T, Math.PI * 1.12, Math.PI * 1.88);
    c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(0, -0.06 * T, 0.265 * T, Math.PI * 1.06, Math.PI * 1.94);
    c.stroke();
    // seat gloss
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.beginPath();
    c.ellipse(-0.08 * T, 0.08 * T, 0.16 * T, 0.09 * T, -0.5, 0, Math.PI * 2);
    c.fill();
}

// Snake plant in a bullet planter: a rosette of sword leaves from above
function paintPlant(c, th, seed) {
    const T = TILE;
    const rnd = seededRandom(seed || 1);
    const g = c.createRadialGradient(-0.1 * T, -0.1 * T, 2, 0, 0, 0.34 * T);
    g.addColorStop(0, shadeColor(th.planter, 30));
    g.addColorStop(0.7, th.planter);
    g.addColorStop(1, shadeColor(th.planter, -30));
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 0.33 * T, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.3)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(0, 0, 0.31 * T, Math.PI * 0.9, Math.PI * 1.7);
    c.stroke();
    c.fillStyle = '#2E1A0E';
    c.beginPath();
    c.arc(0, 0, 0.27 * T, 0, Math.PI * 2);
    c.fill();
    const greens = [th.leaf, s3Shade(th.leaf, 0.85), s3Shade(th.leaf, 1.15), s3Shade(th.leaf, 0.72)];
    const leaves = [];
    for (let i = 0; i < 11; i++) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * 0.17;
        const h = 1.1 + rnd() * 1.1;
        const tilt = 0.06 + rnd() * 0.16;
        const w = 0.13 + rnd() * 0.05;
        const face = rnd() * Math.PI;
        leaves.push({ a, r, len: Math.max(0.24, h * Math.sin(tilt) * 1.6), w: w * (0.45 + 0.55 * Math.abs(Math.cos(face - a))), color: greens[i % greens.length] });
    }
    leaves.sort((p, q) => q.len - p.len);
    for (const l of leaves) {
        const bx = Math.cos(l.a) * l.r * T, by = Math.sin(l.a) * l.r * T;
        const tx = bx + Math.cos(l.a) * l.len * T, ty = by + Math.sin(l.a) * l.len * T;
        const px = -Math.sin(l.a) * l.w * T * 0.5, py = Math.cos(l.a) * l.w * T * 0.5;
        const mx = (bx + tx) / 2, my = (by + ty) / 2;
        const lg = c.createLinearGradient(bx, by, tx, ty);
        lg.addColorStop(0, shadeColor(l.color, -20));
        lg.addColorStop(0.6, l.color);
        lg.addColorStop(1, shadeColor(l.color, 24));
        c.fillStyle = lg;
        c.beginPath();
        c.moveTo(bx, by);
        c.quadraticCurveTo(mx + px, my + py, tx, ty);
        c.quadraticCurveTo(mx - px, my - py, bx, by);
        c.fill();
        c.strokeStyle = 'rgba(255, 255, 220, 0.3)';
        c.lineWidth = 0.8;
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(tx, ty);
        c.stroke();
    }
}

// Oval pet bed with a plush bolster; the cat is drawn per frame, breathing
function paintPetBed(c, lw, ld, th) {
    const T = TILE;
    const rx = 0.545 * lw * 0.92 * T, ry = 0.545 * ld * 0.9 * T;
    const g = c.createRadialGradient(-rx * 0.3, -ry * 0.4, 2, 0, 0, rx);
    g.addColorStop(0, shadeColor(th.petbed, 26));
    g.addColorStop(0.7, th.petbed);
    g.addColorStop(1, shadeColor(th.petbed, -34));
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
    // bolster bumps
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const bx = Math.cos(a) * rx * 0.84, by = Math.sin(a) * ry * 0.8;
        const bg = c.createRadialGradient(bx - 1, by - 1, 0, bx, by, 6);
        bg.addColorStop(0, 'rgba(255,255,255,0.22)');
        bg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = bg;
        c.beginPath();
        c.arc(bx, by, 6, 0, Math.PI * 2);
        c.fill();
    }
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = 1;
    c.setLineDash([2, 3]);
    c.beginPath();
    c.ellipse(0, 0, rx * 0.9, ry * 0.87, 0, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    // cushion
    const cg = c.createRadialGradient(-rx * 0.2, -ry * 0.2, 2, 0, 0, rx * 0.72);
    cg.addColorStop(0, '#FBF5E8');
    cg.addColorStop(1, '#E2D6BF');
    c.fillStyle = cg;
    c.beginPath();
    c.ellipse(0, 0, 0.4 * lw * 0.92 * T, 0.4 * ld * 0.9 * T, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.stroke();
}

// Interior walls per theme: plaster partition, kitchen counter, stacked crates or neon panel
function paintWallTile(c, it, th, wallSet) {
    const T = TILE;
    const o = it.o;
    const x = o.col * T, y = o.row * T, w = o.w * T, h = o.h * T;
    const has = (dc, dr) => wallSet.has(`${o.col + dc},${o.row + dr}`);
    const open = { n: !has(0, -1), s: !has(0, o.h), w: !has(-1, 0), e: !has(o.w, 0) };
    const sun = scene.sun;
    const litX = sun.dir[0] > 0 ? 'w' : 'e', litY = sun.dir[1] > 0 ? 'n' : 's';
    const faceX = sun.dir[0] > 0 ? 'e' : 'w', faceY = sun.dir[1] > 0 ? 's' : 'n';
    const edges = (lightColor, darkColor, faceD) => {
        // a bright line on the sun side, a visible side face on the far side
        c.fillStyle = lightColor;
        if (open[litY]) c.fillRect(x, litY === 'n' ? y : y + h - 1.5, w, 1.5);
        if (open[litX]) c.fillRect(litX === 'w' ? x : x + w - 1.5, y, 1.5, h);
        c.fillStyle = darkColor;
        if (open[faceY]) c.fillRect(x, faceY === 's' ? y + h - faceD : y, w, faceD);
        if (open[faceX]) c.fillRect(faceX === 'e' ? x + w - faceD : x, y, faceD, h);
    };
    switch (th.wallStyle) {
        case 'counter': {
            c.fillStyle = '#9FD8CF';
            c.fillRect(x, y, w, h);
            const rnd = seededRandom(o.col * 31 + o.row * 7 + 3);
            for (let i = 0; i < 40; i++) {
                c.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(0,60,60,0.25)';
                c.fillRect(x + rnd() * w, y + rnd() * h, 1.2, 1.2);
            }
            const kind = (o.col * 7 + o.row * 13) % 5;
            if (kind === 0) {
                // a hob: four rings
                c.fillStyle = '#2B2B2B';
                roundRect(c, x + 7, y + 7, w - 14, h - 14, 3);
                c.fill();
                c.strokeStyle = '#6A6A6A';
                c.lineWidth = 1.5;
                for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                    c.beginPath();
                    c.arc(x + w / 2 + dx * 8.5, y + h / 2 + dy * 8.5, 5, 0, Math.PI * 2);
                    c.stroke();
                }
            } else if (kind === 2) {
                // a sink with a tap
                const sg = c.createLinearGradient(x, y, x + w, y + h);
                sg.addColorStop(0, '#F4F4F4');
                sg.addColorStop(0.5, '#C9CDD0');
                sg.addColorStop(1, '#E8EAEC');
                c.fillStyle = sg;
                roundRect(c, x + 7, y + 10, w - 14, h - 17, 5);
                c.fill();
                c.fillStyle = '#5A5F63';
                c.beginPath();
                c.arc(x + w / 2, y + h / 2 + 2, 2.2, 0, Math.PI * 2);
                c.fill();
                c.strokeStyle = '#E6E6E6';
                c.lineWidth = 2.2;
                c.lineCap = 'round';
                c.beginPath();
                c.moveTo(x + w / 2, y + 6);
                c.quadraticCurveTo(x + w / 2, y + 14, x + w / 2 - 5, y + 15);
                c.stroke();
            }
            // chrome edge on open sides
            c.fillStyle = '#E6E6E6';
            if (open.n) c.fillRect(x, y, w, 2.5);
            if (open.s) c.fillRect(x, y + h - 2.5, w, 2.5);
            if (open.w) c.fillRect(x, y, 2.5, h);
            if (open.e) c.fillRect(x + w - 2.5, y, 2.5, h);
            c.fillStyle = 'rgba(255,255,255,0.7)';
            if (open.n) c.fillRect(x, y + 0.5, w, 0.8);
            if (open.w) c.fillRect(x + 0.5, y, 0.8, h);
            c.fillStyle = 'rgba(0,0,0,0.28)';
            if (open.s) c.fillRect(x, y + h - 1, w, 1);
            if (open.e) c.fillRect(x + w - 1, y, 1, h);
            break;
        }
        case 'crate': {
            const rnd = seededRandom(o.col * 31 + o.row * 7 + 3);
            const shades = ['#8B6B45', '#7A5A3A', '#8B6B45'];
            const sizes = [0.06, 0.11, 0.16];
            for (let k = 0; k < 3; k++) {
                const s = T * (1 - sizes[k]);
                c.save();
                c.translate(x + w / 2 + (rnd() - 0.5) * 3, y + h / 2 + (rnd() - 0.5) * 3);
                c.rotate((rnd() - 0.5) * 0.12);
                const g = c.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
                g.addColorStop(0, shadeColor(shades[k], 18));
                g.addColorStop(1, shadeColor(shades[k], -14));
                c.fillStyle = g;
                c.fillRect(-s / 2, -s / 2, s, s);
                c.strokeStyle = 'rgba(0,0,0,0.35)';
                c.lineWidth = 1;
                c.strokeRect(-s / 2 + 0.5, -s / 2 + 0.5, s - 1, s - 1);
                if (k === 2) {
                    // planks, nails, a stencil
                    c.strokeStyle = 'rgba(40,25,10,0.35)';
                    for (let p = 1; p < 3; p++) {
                        c.beginPath();
                        c.moveTo(-s / 2, -s / 2 + (s * p) / 3);
                        c.lineTo(s / 2, -s / 2 + (s * p) / 3);
                        c.stroke();
                    }
                    c.fillStyle = 'rgba(30,30,30,0.6)';
                    for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                        c.beginPath();
                        c.arc(nx * (s / 2 - 4), ny * (s / 2 - 4), 1.2, 0, Math.PI * 2);
                        c.fill();
                    }
                    c.globalAlpha = 0.55;
                    drawStarburst(c, 0, 0, s * 0.22, '#F2E8D5', 8, 1.4);
                    c.globalAlpha = 1;
                }
                c.restore();
            }
            break;
        }
        case 'neon': {
            // pink glow on the floor around the panel, then the dark panel with its cyan top edge
            c.save();
            c.globalCompositeOperation = 'lighter';
            c.shadowColor = '#D14D9A';
            c.shadowBlur = 16 * canvasDpr;
            c.fillStyle = 'rgba(209, 77, 154, 0.5)';
            c.fillRect(x + 2, y + 2, w - 4, h - 4);
            c.restore();
            c.fillStyle = '#13232A';
            c.fillRect(x, y, w, h);
            c.save();
            c.shadowColor = '#7FE0D8';
            c.shadowBlur = 6 * canvasDpr;
            c.strokeStyle = '#7FE0D8';
            c.lineWidth = 1.5;
            c.beginPath();
            if (open.n) { c.moveTo(x + 1, y + 1.5); c.lineTo(x + w - 1, y + 1.5); }
            if (open.s) { c.moveTo(x + 1, y + h - 1.5); c.lineTo(x + w - 1, y + h - 1.5); }
            if (open.w) { c.moveTo(x + 1.5, y + 1); c.lineTo(x + 1.5, y + h - 1); }
            if (open.e) { c.moveTo(x + w - 1.5, y + 1); c.lineTo(x + w - 1.5, y + h - 1); }
            c.stroke();
            c.restore();
            break;
        }
        default: {
            const col = th.accent.color;
            c.fillStyle = col;
            c.fillRect(x, y, w, h);
            // breeze-block joints
            c.strokeStyle = 'rgba(0,0,0,0.1)';
            c.lineWidth = 1;
            for (let i = 1; i < 3; i++) {
                c.beginPath();
                c.moveTo(x, y + (h * i) / 3 + 0.5);
                c.lineTo(x + w, y + (h * i) / 3 + 0.5);
                c.stroke();
                c.beginPath();
                c.moveTo(x + (w * i) / 3 + 0.5, y);
                c.lineTo(x + (w * i) / 3 + 0.5, y + h);
                c.stroke();
            }
            edges('rgba(255,255,255,0.3)', shadeColor(col, -46), 4);
        }
    }
}

// --- The dock ------------------------------------------------------------------------------

// Chrome saucer with a glowing ring, a fin with a blinking beacon, a rubber ramp
function drawChargerTile(x, y) {
    ensureSceneLayers();
    const T = TILE;
    const cx = x + T / 2, cy = y + T / 2;
    const lv = LEVELS[currentLevel];
    const yaw = S3_YAW[s3Facing({ col: lv.charger.col, row: lv.charger.row, w: 1, h: 1 })];
    const blue = scene.palette.dockBlue;

    // pulsing pool and a ring spreading out across the floor
    const pulse = 0.14 + 0.12 * Math.sin(chargerPulse * 0.04);
    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, T * 0.75);
    glow.addColorStop(0, `rgba(79, 168, 255, ${pulse * 1.4})`);
    glow.addColorStop(0.6, `rgba(79, 168, 255, ${pulse * 0.5})`);
    glow.addColorStop(1, 'rgba(79, 168, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 8, y - 8, T + 16, T + 16);
    const ringT = (chargerPulse * 0.012) % 1;
    ctx.save();
    ctx.globalAlpha = (1 - ringT) * 0.45;
    ctx.strokeStyle = '#8CC8FF';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 8 + ringT * 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // shadow
    const s = s2Shadow(scene.sun, scene.theme.lamp, cx / T, cy / T, 0.12);
    ctx.fillStyle = `rgba(0,0,0,${0.22 + s.alpha * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(cx + s.dx * T + 0.5, cy + s.dy * T + 1, T * 0.46, T * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-yaw);
    // ramp in front
    ctx.fillStyle = scene.palette.rubber;
    roundRect(ctx, -0.14 * T, 0.02 * T, 0.28 * T, 0.2 * T, 2);
    ctx.fill();
    // saucer: chrome with bands of reflection
    const chrome = ctx.createLinearGradient(-0.45 * T, -0.45 * T, 0.45 * T, 0.45 * T);
    chrome.addColorStop(0, '#FDFDFD');
    chrome.addColorStop(0.3, '#B9BEC3');
    chrome.addColorStop(0.5, '#F0F2F4');
    chrome.addColorStop(0.72, '#8E959B');
    chrome.addColorStop(1, '#D8DCDF');
    ctx.fillStyle = chrome;
    ctx.beginPath();
    ctx.arc(0, 0, 0.45 * T, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // the ring light
    ctx.save();
    ctx.shadowColor = blue;
    ctx.shadowBlur = (6 + 4 * Math.sin(chargerPulse * 0.04)) * canvasDpr;
    ctx.strokeStyle = blue;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 0.36 * T, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // the bolt, etched in brass
    ctx.fillStyle = scene.palette.brass;
    ctx.beginPath();
    ctx.moveTo(-1.5, -6);
    ctx.lineTo(3.5, -6);
    ctx.lineTo(0.8, -1);
    ctx.lineTo(3.5, -1);
    ctx.lineTo(-1.5, 6);
    ctx.lineTo(0.6, 1);
    ctx.lineTo(-3, 1);
    ctx.closePath();
    ctx.fill();
    // fin along the back edge, with its indicator and the beacon on the antenna
    ctx.fillStyle = '#E6E6E6';
    roundRect(ctx, -0.17 * T, -0.465 * T, 0.34 * T, 0.07 * T, 1.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-0.17 * T, -0.4 * T, 0.34 * T, 1);
    ctx.fillStyle = blue;
    ctx.fillRect(-0.1 * T, -0.45 * T, 0.2 * T, 1.6);
    const blink = Math.sin(chargerPulse * 0.09) > 0.3;
    ctx.save();
    ctx.shadowColor = '#FF4A3A';
    ctx.shadowBlur = (blink ? 8 : 0) * canvasDpr;
    ctx.fillStyle = blink ? '#FF6A5A' : '#7A2A22';
    ctx.beginPath();
    ctx.arc(0, -0.43 * T, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
}

// --- The vacuum ------------------------------------------------------------------------------

function drawRoomba() {
    ensureSceneLayers();
    const targetX = roomba.col * TILE + TILE / 2;
    const targetY = roomba.row * TILE + TILE / 2;
    const lerp = easeK(0.3);
    roomba.drawX += (targetX - roomba.drawX) * lerp;
    roomba.drawY += (targetY - roomba.drawY) * lerp;
    if (Math.abs(targetX - roomba.drawX) < 0.5) roomba.drawX = targetX;
    if (Math.abs(targetY - roomba.drawY) < 0.5) roomba.drawY = targetY;

    const x = roomba.drawX, y = roomba.drawY;
    const r = 20;
    const angle = FP_ANGLE_MAP[roomba.dir];
    const lightHex = design.lightColor;
    const [lr, lg, lb] = design.lightRgb;

    ctx.save();
    ctx.translate(x, y);

    // the ring light spilling onto the floor
    {
        const pulse = 0.2 + 0.08 * Math.sin(chargerPulse * 0.08);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2.1);
        glow.addColorStop(0, `rgba(${lr},${lg},${lb},${pulse})`);
        glow.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // shadow, cast like the furniture's
    const s = s2Shadow(scene.sun, scene.theme.lamp, x / TILE, y / TILE, 0.14);
    ctx.fillStyle = `rgba(0,0,0,${0.2 + s.alpha * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(s.dx * TILE, s.dy * TILE + 2, r + 1, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    if (bumpFlash > 0) {
        ctx.shadowColor = '#FF5252';
        ctx.shadowBlur = 25 * canvasDpr;
    }

    // hood: dark lacquer with a clearcoat sheen
    const body = ctx.createRadialGradient(-6, -7, 1, 0, 0, r);
    body.addColorStop(0, '#4A4C4E');
    body.addColorStop(0.35, '#2A2B2D');
    body.addColorStop(0.8, '#1C1C1C');
    body.addColorStop(1, '#101010');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // chrome bumper
    const rim = ctx.createLinearGradient(-r, -r, r, r);
    rim.addColorStop(0, '#FFFFFF');
    rim.addColorStop(0.35, '#AEB4B9');
    rim.addColorStop(0.55, '#F2F4F6');
    rim.addColorStop(0.8, '#80878D');
    rim.addColorStop(1, '#D0D4D8');
    ctx.strokeStyle = rim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, r - 2.6, 0, Math.PI * 2);
    ctx.stroke();
    // bumper sensor windows up front
    for (let i = -2; i <= 2; i++) {
        const sa = angle + i * 0.2;
        ctx.fillStyle = 'rgba(15,15,15,0.75)';
        ctx.beginPath();
        ctx.arc(Math.cos(sa) * (r - 1), Math.sin(sa) * (r - 1), 1, 0, Math.PI * 2);
        ctx.fill();
    }

    // ring light in the player's colour
    const ring = ctx.createLinearGradient(-r, 0, r, 0);
    ring.addColorStop(0, shadeColor(lightHex, -24));
    ring.addColorStop(0.5, lightHex);
    ring.addColorStop(1, shadeColor(lightHex, -24));
    ctx.save();
    ctx.shadowColor = lightHex;
    ctx.shadowBlur = (8 + 4 * Math.sin(chargerPulse * 0.08)) * canvasDpr;
    ctx.strokeStyle = ring;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, r - 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // inner plate and the direction wedge
    const inner = ctx.createRadialGradient(-3, -3, 0, 0, 0, r - 7);
    inner.addColorStop(0, '#3A3B3D');
    inner.addColorStop(1, '#232426');
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.arc(0, 0, r - 7.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${lr},${lg},${lb},0.85)`;
    ctx.beginPath();
    ctx.arc(0, 0, r - 7.5, angle - 0.42, angle + 0.42);
    ctx.lineTo(Math.cos(angle) * 4, Math.sin(angle) * 4);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.rotate(angle);
    // tail fin and tail light at the back
    ctx.fillStyle = '#E6E6E6';
    ctx.beginPath();
    ctx.moveTo(-r + 1, 0);
    ctx.lineTo(-r + 10, -2.2);
    ctx.lineTo(-r + 10, 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FF5A48';
    ctx.beginPath();
    ctx.arc(-r + 2.5, 0, 1.2, 0, Math.PI * 2);
    ctx.fill();
    // spinning side brush at the front right
    ctx.save();
    ctx.translate(r - 6, 8);
    ctx.rotate(roombaWheelAngle * 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    for (let a = 0; a < 3; a++) {
        const ba = (a * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ba) * 6, Math.sin(ba) * 6);
        ctx.stroke();
    }
    ctx.fillStyle = '#777';
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // brush rollers
    ctx.strokeStyle = '#6A6A6A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r - 10, -5);
    ctx.lineTo(r - 10, 5);
    ctx.moveTo(r - 13, -5);
    ctx.lineTo(r - 13, 5);
    ctx.stroke();
    // headlamp lens on the bumper
    {
        const [fr, fg, fb] = design.flashRgb;
        ctx.save();
        if (design.flashOn) {
            ctx.shadowColor = `rgb(${fr},${fg},${fb})`;
            ctx.shadowBlur = 14 * canvasDpr;
            ctx.fillStyle = `rgb(${Math.min(255, fr + 60)},${Math.min(255, fg + 60)},${Math.min(255, fb + 60)})`;
        } else {
            ctx.fillStyle = 'rgba(255, 226, 168, 0.55)';
        }
        ctx.beginPath();
        ctx.ellipse(r - 1.5, 0, 2.2, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();

    // centre button: the light colour normally, red when the battery is low
    ctx.save();
    const batteryOk = !isLowBattery();
    ctx.shadowColor = batteryOk ? lightHex : '#F44336';
    ctx.shadowBlur = (batteryOk ? 8 : 10 + 6 * Math.sin(chargerPulse * 0.2)) * canvasDpr;
    const btn = ctx.createRadialGradient(0, -1, 0, 0, 0, 6);
    if (batteryOk) {
        btn.addColorStop(0, shadeColor(lightHex, 60));
        btn.addColorStop(0.6, lightHex);
        btn.addColorStop(1, shadeColor(lightHex, -50));
    } else {
        btn.addColorStop(0, '#FF5252');
        btn.addColorStop(0.6, '#F44336');
        btn.addColorStop(1, '#C62828');
    }
    ctx.fillStyle = btn;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    // clearcoat highlight
    const spec = ctx.createRadialGradient(-6, -8, 0, -5, -7, 9);
    spec.addColorStop(0, 'rgba(255,255,255,0.26)');
    spec.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.ellipse(-6, -8, 9, 4.5, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // wheels
    ctx.save();
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = '#1E1E1E';
    roundRect(ctx, -4, r - 6, 8, 5, 2);
    ctx.fill();
    roundRect(ctx, -4, -r + 1, 8, 5, 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
}

// Flashlight beam on the board: a cone ahead of the Roomba, stopped by furniture and walls,
// drawn additively over a slightly dimmed room so it reads as light.
function drawFlashlight2D() {
    if (!design.flashOn) return;
    const [fr, fg, fb] = design.flashRgb;
    const ang = FP_ANGLE_MAP[roomba.dir];
    const ox = roomba.drawX, oy = roomba.drawY;
    const halfAngle = 0.4;
    const maxLen = 3.8 * TILE;
    const step = TILE * 0.1;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const rays = 19;
    const pts = [];
    for (let i = 0; i < rays; i++) {
        const a = ang - halfAngle + ((2 * halfAngle) * i) / (rays - 1);
        const dx = Math.cos(a), dy = Math.sin(a);
        let len = 0;
        while (len < maxLen) {
            const px = ox + dx * (len + step), py = oy + dy * (len + step);
            const c = Math.floor(px / TILE), r = Math.floor(py / TILE);
            if (c < 0 || c >= COLS || r < 0 || r >= ROWS || grid[r][c] === OBSTACLE) break;
            len += step;
        }
        pts.push([ox + dx * len, oy + dy * len]);
    }

    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createRadialGradient(ox, oy, 4, ox, oy, maxLen);
    beam.addColorStop(0, `rgba(${fr},${fg},${fb},0.6)`);
    beam.addColorStop(0.45, `rgba(${fr},${fg},${fb},0.28)`);
    beam.addColorStop(1, `rgba(${fr},${fg},${fb},0)`);
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();

    const pool = ctx.createRadialGradient(ox, oy, 0, ox, oy, TILE * 0.9);
    pool.addColorStop(0, `rgba(${fr},${fg},${fb},0.35)`);
    pool.addColorStop(1, `rgba(${fr},${fg},${fb},0)`);
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(ox, oy, TILE * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// --- Cleaning effects ------------------------------------------------------------------------

// Dust drawn into the intake as a tile comes clean
const intakeSpecks = [];

function drawCleanAnimations() {
    for (let i = cleanAnimations.length - 1; i >= 0; i--) {
        const anim = cleanAnimations[i];
        if (anim.progress === 0) {
            for (let k = 0; k < 7; k++) {
                intakeSpecks.push({
                    x: anim.col * TILE + 6 + Math.random() * (TILE - 12),
                    y: anim.row * TILE + 6 + Math.random() * (TILE - 12),
                    t: 0, r: 1 + Math.random() * 1.4, delay: Math.random() * 0.3,
                });
            }
        }
        anim.progress += 0.035 * dtFrames;
        if (anim.progress >= 1) {
            cleanAnimations.splice(i, 1);
            continue;
        }
        const x = anim.col * TILE + TILE / 2;
        const y = anim.row * TILE + TILE / 2;
        const alpha = 1 - anim.progress;
        const [gr, gg, gb] = scene.palette ? scene.palette.glaze : [108, 224, 172];

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = `rgba(${gr}, ${gg}, ${gb}, ${alpha * 0.5})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, 4 + anim.progress * 18, 0, Math.PI * 2);
        ctx.stroke();
        // starbursts spinning outward
        for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2 + anim.progress * 3;
            const dist = 5 + anim.progress * 17;
            const size = (3 + (p % 2) * 2) * (1 - anim.progress * 0.6);
            drawStarburst(ctx, x + Math.cos(a) * dist, y + Math.sin(a) * dist, size, p % 2 ? '#FFFFFF' : `rgb(${gr}, ${gg}, ${gb})`, 8, 0.8);
        }
        ctx.restore();
    }

    for (let i = intakeSpecks.length - 1; i >= 0; i--) {
        const s = intakeSpecks[i];
        s.t += (dtFrames / 60) * 2.6;
        if (s.t < s.delay) continue;
        const k = Math.min(1, (s.t - s.delay) / 0.7);
        if (k >= 1) {
            intakeSpecks.splice(i, 1);
            continue;
        }
        const e = k * k;
        const px = s.x + (roomba.drawX - s.x) * e, py = s.y + (roomba.drawY - s.y) * e;
        ctx.fillStyle = `rgba(190, 180, 165, ${0.8 * (1 - k * 0.6)})`;
        ctx.beginPath();
        ctx.arc(px, py, s.r * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
    }
    if (intakeSpecks.length > 120) intakeSpecks.splice(0, intakeSpecks.length - 120);
}

// --- The ghost -----------------------------------------------------------------------------

function drawNpcTrail() {
    for (const t of npcReplay.trailAlpha) {
        const x = t.col * TILE;
        const y = t.row * TILE;
        ctx.save();
        ctx.globalAlpha = t.alpha * 0.32;
        ctx.fillStyle = t.approach ? '#FFB74D' : '#00BFFF';
        roundRect(ctx, x + 4, y + 4, TILE - 8, TILE - 8, 6);
        ctx.fill();
        ctx.restore();
    }
}

// A hologram of the same saucer in cyan
function drawNpcVacuum() {
    const targetX = npcReplay.col * TILE + TILE / 2;
    const targetY = npcReplay.row * TILE + TILE / 2;
    const npcLerp = easeK(0.25);
    npcReplay.drawX += (targetX - npcReplay.drawX) * npcLerp;
    npcReplay.drawY += (targetY - npcReplay.drawY) * npcLerp;
    if (Math.abs(targetX - npcReplay.drawX) < 0.5) npcReplay.drawX = targetX;
    if (Math.abs(targetY - npcReplay.drawY) < 0.5) npcReplay.drawY = targetY;

    const x = npcReplay.drawX, y = npcReplay.drawY;
    const r = 19;
    const angle = FP_ANGLE_MAP[npcReplay.dir];
    const pulse = 0.7 + 0.3 * Math.sin(chargerPulse * 0.1);
    const flicker = 0.85 + 0.15 * Math.sin(chargerPulse * 0.9);

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = flicker;
    ctx.shadowColor = '#00BFFF';
    ctx.shadowBlur = 22 * pulse * canvasDpr;
    const body = ctx.createRadialGradient(-3, -3, 0, 0, 0, r);
    body.addColorStop(0, 'rgba(40, 80, 110, 0.75)');
    body.addColorStop(0.6, 'rgba(10, 30, 50, 0.7)');
    body.addColorStop(1, 'rgba(5, 14, 24, 0.8)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(0, 191, 255, ${0.7 + 0.3 * pulse})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(0, 230, 255, ${0.5 + 0.3 * pulse})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, r - 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // scanlines
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0, 220, 255, 0.14)';
    ctx.lineWidth = 1;
    for (let sy = -r; sy < r; sy += 3) {
        ctx.beginPath();
        ctx.moveTo(-r, sy + ((chargerPulse * 0.3) % 3));
        ctx.lineTo(r, sy + ((chargerPulse * 0.3) % 3));
        ctx.stroke();
    }
    ctx.restore();
    // direction wedge, fin and lens
    ctx.fillStyle = `rgba(0, 191, 255, ${0.45 + 0.2 * pulse})`;
    ctx.beginPath();
    ctx.arc(0, 0, r - 7, angle - 0.42, angle + 0.42);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(160, 230, 255, 0.7)';
    ctx.beginPath();
    ctx.moveTo(-r + 1, 0);
    ctx.lineTo(-r + 10, -2.2);
    ctx.lineTo(-r + 10, 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(r - 1.5, 0, 2, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // centre light
    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur = 10 * pulse * canvasDpr;
    const led = ctx.createRadialGradient(0, 0, 0, 0, 0, 5);
    led.addColorStop(0, '#DFFFFF');
    led.addColorStop(0.5, '#00BFFF');
    led.addColorStop(1, '#0066CC');
    ctx.fillStyle = led;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawNpcOverlay() {
    const progress = npcReplay.stepIndex / (parPath.length - 1);
    const barW = CANVAS_W - 80, barH = 3, barX = 40, barY = 16;
    const isApproach = npcReplay.stepIndex < parApproachLen;
    const phaseLabel = isApproach ? 'APPROACHING START' : 'CLEANING THE PAR ROUTE';
    const cleanStep = isApproach ? 0 : npcReplay.stepIndex - parApproachLen;
    const cleanTotal = parPath.length - parApproachLen - 1;
    const color = isApproach ? '#FFB74D' : '#00BFFF';

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6 * canvasDpr;
    uiText(`${phaseLabel}   ·   STEP ${cleanStep} / ${cleanTotal}`, CANVAS_W / 2, barY + 20, 12, color, 'center', '600', 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    roundRect(ctx, barX, barY, barW, barH, 1.5);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 * canvasDpr;
    roundRect(ctx, barX, barY, Math.max(3, barW * progress), barH, 1.5);
    ctx.fill();
    ctx.shadowBlur = 0;
    uiText('SPACE TO SKIP', CANVAS_W / 2, CANVAS_H - 16, 11, 'rgba(242, 232, 213, 0.6)', 'center', '500', 2);
    ctx.restore();
}

// --- Overlays --------------------------------------------------------------------------------

// A dark card with a cream hairline, a coloured rule and starbursts in the corners
function drawCard(x, y, w, h, accent) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 40 * canvasDpr;
    ctx.shadowOffsetY = 12 * canvasDpr;
    ctx.fillStyle = UI.ink;
    roundRect(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(242, 232, 213, 0.22)';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 18);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(242, 232, 213, 0.1)';
    roundRect(ctx, x + 6.5, y + 6.5, w - 13, h - 13, 13);
    ctx.stroke();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, accent);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x + 30, y, w - 60, 2);
    drawStarburst(ctx, x + 22, y + 22, 7, accent, 8, 1);
    drawStarburst(ctx, x + w - 22, y + h - 22, 7, accent, 8, 1);
    ctx.restore();
}

function drawOverlay() {
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;
    if (gameState === 'LEVEL_COMPLETE') {
        const r = levelResult || { moves, par: parMoves, bonus: 0, stars: 1, tileScore: cleaned * 10, at: 0 };
        ctx.save();
        ctx.fillStyle = 'rgba(10, 14, 18, 0.5)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        drawCard(cx - 270, cy - 156, 540, 312, UI.mint);
        uiText('LEVEL COMPLETE', cx, cy - 112, 28, UI.cream, 'center', '500', 6);

        // Stars pop in one after another
        const since = chargerPulse - (r.at || 0);
        for (let i = 0; i < 3; i++) {
            const s = Math.max(0, Math.min(1, (since - i * 14) / 12));
            const scale = s < 1 ? 0.3 + 0.7 * s + 0.35 * Math.sin(s * Math.PI) : 1;
            const earned = i < r.stars;
            ctx.save();
            ctx.globalAlpha = s;
            ctx.translate(cx + (i - 1) * 54, cy - 62);
            ctx.scale(scale, scale);
            if (earned) {
                ctx.shadowColor = UI.mustard;
                ctx.shadowBlur = 16 * canvasDpr;
                drawStarburst(ctx, 0, 0, 17, UI.mustard, 8, 2.2);
            } else {
                drawStarburst(ctx, 0, 0, 17, 'rgba(242, 232, 213, 0.22)', 8, 1.4);
            }
            ctx.restore();
        }

        const diff = r.par - r.moves;
        const parText = diff > 0 ? `${diff} under par` : diff < 0 ? `${-diff} over par` : 'exactly par';
        uiText(`Moves ${r.moves}   ·   Par ${r.par}   ·   ${parText}`, cx, cy - 14, 19, UI.cream, 'center', '400');
        uiText(`Tiles ${r.tileScore}  +  Bonus ${r.bonus}  =  ${score} total`, cx, cy + 16, 16, 'rgba(242, 232, 213, 0.8)', 'center', '400');

        const earned = r.points | 0;
        const available = progress.points | 0;
        uiText(
            earned > 0
                ? `+${earned} UPGRADE POINT${earned === 1 ? '' : 'S'}   ·   ${available} TO SPEND (U)`
                : `NO NEW STARS, NO UPGRADE POINTS   ·   ${available} TO SPEND (U)`,
            cx, cy + 46, 11, earned > 0 ? UI.mustard : 'rgba(242, 232, 213, 0.5)', 'center', '600', 1.5,
        );
        uiText('G: watch the ghost run the par route', cx, cy + 74, 14, '#7FD6FF', 'center', '400');

        if (currentLevel < LEVELS.length - 1) {
            uiText('SPACE or click the board for the next room', cx, cy + 104, 16, UI.mint, 'center', '500');
        } else {
            uiText('YOU WIN · EVERY ROOM IS CLEAN', cx, cy + 104, 20, UI.mustard, 'center', '600', 3);
            uiText('Press R to play again', cx, cy + 132, 14, 'rgba(242, 232, 213, 0.7)', 'center', '400');
        }
        ctx.restore();
    } else if (gameState === 'GAME_OVER') {
        ctx.save();
        ctx.fillStyle = 'rgba(10, 14, 18, 0.55)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        drawCard(cx - 250, cy - 92, 500, 184, UI.coral);
        uiText('OUT OF BATTERY', cx, cy - 36, 28, UI.coral, 'center', '500', 6);
        uiText('Get back to the dock before it runs out next time.', cx, cy + 8, 16, UI.cream, 'center', '400');
        uiText('Press R or tap Restart', cx, cy + 42, 14, 'rgba(242, 232, 213, 0.7)', 'center', '400');
        ctx.restore();
    }
}

// Level-name banner shown for the first few seconds of a level
function drawBanner() {
    if (bannerTimer <= 0 || helpVisible) return;
    const elapsed = BANNER_MS - bannerTimer;
    const alpha = Math.max(0, Math.min(1, elapsed / 250, bannerTimer / 500));
    const cx = CANVAS_W / 2;
    const best = progress.best[currentLevel];
    const theme = s3Theme(currentLevel);
    const extra = [];
    if (currentLevel === 0 && !best) extra.push('Clean every tile  ·  dock before the battery dies  ·  beat par');
    if (best) extra.push(`Your best: ${best.moves} moves  ${'★'.repeat(best.stars)}   ·   Par ${parMoves}`);
    const boxW = 440;
    const boxH = 92 + extra.length * 22;
    const y = 60;

    ctx.save();
    ctx.globalAlpha = alpha;
    drawCard(cx - boxW / 2, y, boxW, boxH, theme.accent.color);
    uiText(`LEVEL ${currentLevel + 1} OF ${LEVELS.length}   ·   ${theme.name.toUpperCase()}   ·   ${theme.time.toUpperCase()}`, cx, y + 26, 10.5, UI.mustard, 'center', '600', 2.5);
    uiText(bannerText, cx, y + 56, 30, UI.cream, 'center', '400', 1);
    extra.forEach((line, i) => uiText(line, cx, y + 86 + i * 22, 12.5, 'rgba(242, 232, 213, 0.75)', 'center', '400'));
    ctx.restore();
}

// Full-screen help, toggled with H or ?
function drawHelp() {
    const lines = [
        ['Goal', 'Clean every tile. The dock refills the battery. Finishing under par earns a bigger bonus.'],
        ['Move', 'Arrow keys or WASD. Hold a key to keep going. The on-screen d-pad works the same way.'],
        ['3D view', 'V or the 3D View button. In 3D, left and right turn in place; up and down drive forward and back.'],
        ['Restart', 'R or the Restart button. Restarting a level also restarts its score.'],
        ['Next level', 'SPACE, or click the board, once a level is complete.'],
        ['Ghost', 'G or the Ghost button replays the par route at any time; V rides along in 3D. SPACE or G ends it.'],
        ['Upgrades', 'Each new star on a level is a point. U or the Upgrades button spends them on the vacuum or the charger.'],
        ['Flashlight', 'F switches the vacuum\'s flashlight on and off. It lights the way ahead in both views.'],
        ['Design', 'The Design button opens colour wheels for the vacuum\'s lights and the flashlight.'],
        ['Full screen', 'Enter or the Full screen button fills the screen with the game. Enter again or Escape leaves it.'],
        ['Sound', 'M or the Sound button mutes and unmutes.'],
        ['Help', 'H or ? shows this screen. Escape closes it.'],
    ];
    ctx.save();
    ctx.fillStyle = 'rgba(12, 18, 22, 0.86)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    uiText('HOW TO PLAY', CANVAS_W / 2, 50, 24, UI.cream, 'center', '500', 6);
    drawStarburst(ctx, CANVAS_W / 2 - 120, 50, 7, UI.mustard, 8, 1);
    drawStarburst(ctx, CANVAS_W / 2 + 120, 50, 7, UI.mustard, 8, 1);
    let y = 92;
    for (const [key, text] of lines) {
        uiText(key.toUpperCase(), 52, y, 10.5, UI.mustard, 'left', '600', 2);
        ctx.font = `400 13px ${UI_FONT}`;
        ctx.fillStyle = UI.cream;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        wrapText(text, 160, y, CANVAS_W - 210, 17);
        y += 38;
    }
    uiText('H, ? OR ESCAPE TO CLOSE', CANVAS_W / 2, CANVAS_H - 20, 10.5, 'rgba(242, 232, 213, 0.55)', 'center', '500', 2);
    ctx.restore();
}

function wrapText(text, x, y, maxWidth, lineHeight) {
    let line = '';
    for (const word of text.split(' ')) {
        const test = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(test).width > maxWidth) {
            ctx.fillText(line, x, y);
            y += lineHeight;
            line = word;
        } else {
            line = test;
        }
    }
    if (line) ctx.fillText(line, x, y);
}

// === AMBIENT EFFECTS ===

// Floating dust motes
const dustMotes = [];
for (let i = 0; i < 26; i++) {
    dustMotes.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        size: 0.8 + Math.random() * 1.8,
        speed: 0.06 + Math.random() * 0.18,
        drift: Math.random() * Math.PI * 2,
        alpha: 0.18 + Math.random() * 0.28,
        wobble: Math.random() * 0.5 + 0.3,
    });
}

function drawDustMotes() {
    for (const m of dustMotes) {
        m.y -= m.speed * dtFrames;
        m.x += Math.sin(m.drift + chargerPulse * 0.006) * m.wobble * dtFrames;
        if (m.y < -5) { m.y = CANVAS_H + 5; m.x = Math.random() * CANVAS_W; }
        if (m.x < -5) m.x = CANVAS_W + 5;
        if (m.x > CANVAS_W + 5) m.x = -5;

        const flicker = 0.6 + 0.4 * Math.sin(chargerPulse * 0.015 + m.drift);
        ctx.save();
        ctx.globalAlpha = m.alpha * flicker;
        const dg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.size * 2);
        dg.addColorStop(0, 'rgba(255, 250, 230, 0.9)');
        dg.addColorStop(0.5, 'rgba(255, 245, 210, 0.3)');
        dg.addColorStop(1, 'rgba(255, 240, 200, 0)');
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 252, 240, 0.8)';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Corner shadows for depth; the window's corner stays brighter, night rooms fall off harder
function drawRoomVignette() {
    const night = scene.theme && scene.theme.time === 'night';
    const k = night ? 1.6 : 1;
    const cornerSize = 170;
    const corners = [[0, 0, 0.2], [CANVAS_W, 0, 0.07], [0, CANVAS_H, 0.22], [CANVAS_W, CANVAS_H, 0.15]];
    for (const [x, y, a] of corners) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, cornerSize);
        g.addColorStop(0, `rgba(0,0,0,${a * k})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x ? x - cornerSize : 0, y ? y - cornerSize : 0, cornerSize, cornerSize);
    }
    const edges = [[0, 0, 0, 40], [0, CANVAS_H, 0, CANVAS_H - 40], [0, 0, 40, 0], [CANVAS_W, 0, CANVAS_W - 40, 0]];
    for (const [x0, y0, x1, y1] of edges) {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, `rgba(0,0,0,${0.06 * k})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
}
