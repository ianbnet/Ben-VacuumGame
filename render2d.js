// === TOP-DOWN RENDERER ===
// Classic script sharing globals with game.js: the 2D board, furniture, Roomba, ghost,
// overlays, banner, help and ambient effects.

// === RENDERING ===

// Floor texture pattern (generated once)
let floorPattern = null;
let cleanPattern = null;
let floorTileCanvas = null; // the tile artwork itself, reused as the 3D floor texture
let cleanTileCanvas = null;
function createFloorPatterns() {
    // Dirty floor - realistic hardwood plank texture (drawn at device resolution so it stays crisp)
    const fc = document.createElement('canvas');
    fc.width = TILE * canvasDpr; fc.height = TILE * canvasDpr;
    const fctx = fc.getContext('2d');
    fctx.scale(canvasDpr, canvasDpr);
    // Base warm wood tone
    const woodBase = fctx.createLinearGradient(0, 0, TILE, 0);
    woodBase.addColorStop(0, '#D4BC96');
    woodBase.addColorStop(0.3, '#E0CBA4');
    woodBase.addColorStop(0.7, '#D8C49A');
    woodBase.addColorStop(1, '#CCAE88');
    fctx.fillStyle = woodBase;
    fctx.fillRect(0, 0, TILE, TILE);
    // Plank seam at bottom
    fctx.strokeStyle = 'rgba(140, 115, 80, 0.35)';
    fctx.lineWidth = 1;
    fctx.beginPath();
    fctx.moveTo(0, TILE - 0.5);
    fctx.lineTo(TILE, TILE - 0.5);
    fctx.stroke();
    // Wood grain - multiple organic lines
    for (let i = 0; i < 10; i++) {
        const y = 2 + i * 4.5 + (Math.sin(i * 1.7) * 1.5);
        const alpha = 0.08 + Math.random() * 0.12;
        fctx.strokeStyle = `rgba(140, 110, 70, ${alpha})`;
        fctx.lineWidth = 0.4 + Math.random() * 0.6;
        fctx.beginPath();
        fctx.moveTo(0, y);
        fctx.bezierCurveTo(TILE * 0.25, y + Math.sin(i) * 1.2, TILE * 0.75, y - Math.cos(i) * 0.8, TILE, y + Math.sin(i * 0.5) * 1);
        fctx.stroke();
    }
    // Knot mark (subtle)
    fctx.fillStyle = 'rgba(160, 130, 85, 0.12)';
    fctx.beginPath();
    fctx.ellipse(32, 20, 4, 2.5, 0.3, 0, Math.PI * 2);
    fctx.fill();
    // Dust particles
    const dustSeeds = [[8,12],[22,35],[38,8],[14,40],[42,28],[6,22],[30,18],[44,40]];
    for (const [dx, dy] of dustSeeds) {
        fctx.fillStyle = `rgba(155, 135, 105, ${0.25 + Math.random() * 0.2})`;
        fctx.beginPath();
        fctx.arc(dx, dy, 0.4 + Math.random() * 0.8, 0, Math.PI * 2);
        fctx.fill();
    }
    // Subtle vignette/wear
    const vign = fctx.createRadialGradient(TILE/2, TILE/2, 0, TILE/2, TILE/2, TILE * 0.7);
    vign.addColorStop(0, 'rgba(0,0,0,0)');
    vign.addColorStop(1, 'rgba(0,0,0,0.04)');
    fctx.fillStyle = vign;
    fctx.fillRect(0, 0, TILE, TILE);
    floorPattern = ctx.createPattern(fc, 'repeat');
    floorPattern.setTransform(new DOMMatrix().scale(1 / canvasDpr));
    floorTileCanvas = fc;

    // Clean floor - polished gleaming surface
    const cc = document.createElement('canvas');
    cc.width = TILE * canvasDpr; cc.height = TILE * canvasDpr;
    const cctx = cc.getContext('2d');
    cctx.scale(canvasDpr, canvasDpr);
    // Base clean color with subtle gradient
    const cleanBase = cctx.createLinearGradient(0, 0, TILE, TILE);
    cleanBase.addColorStop(0, '#A8DEB8');
    cleanBase.addColorStop(0.5, '#BBE8C8');
    cleanBase.addColorStop(1, '#A0D8B2');
    cctx.fillStyle = cleanBase;
    cctx.fillRect(0, 0, TILE, TILE);
    // Polished shine streaks
    cctx.strokeStyle = 'rgba(220, 255, 235, 0.45)';
    cctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
        const y = 6 + i * 11;
        cctx.beginPath();
        cctx.moveTo(2, y);
        cctx.bezierCurveTo(TILE * 0.3, y - 1, TILE * 0.7, y + 1.5, TILE - 2, y + 0.5);
        cctx.stroke();
    }
    // Specular highlight spot
    const spec = cctx.createRadialGradient(16, 14, 0, 16, 14, 12);
    spec.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
    spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
    cctx.fillStyle = spec;
    cctx.fillRect(0, 0, TILE, TILE);
    // Plank seam to match
    cctx.strokeStyle = 'rgba(100, 170, 130, 0.2)';
    cctx.lineWidth = 0.5;
    cctx.beginPath();
    cctx.moveTo(0, TILE - 0.5);
    cctx.lineTo(TILE, TILE - 0.5);
    cctx.stroke();
    cleanPattern = ctx.createPattern(cc, 'repeat');
    cleanPattern.setTransform(new DOMMatrix().scale(1 / canvasDpr));
    cleanTileCanvas = cc;
}

function drawGrid() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const x = c * TILE;
            const y = r * TILE;
            const cell = grid[r][c];

            if (cell === DIRTY) {
                ctx.fillStyle = floorPattern || COLORS.dirty;
            } else if (cell === CLEAN) {
                const fadeKey = `${c},${r}`;
                if (tileCleanFade[fadeKey] !== undefined && tileCleanFade[fadeKey] < 1) {
                    // Smooth fade from dirty to clean
                    ctx.fillStyle = floorPattern || COLORS.dirty;
                    ctx.fillRect(x, y, TILE, TILE);
                    tileCleanFade[fadeKey] = Math.min(1, tileCleanFade[fadeKey] + 0.05 * dtFrames);
                    ctx.save();
                    ctx.globalAlpha = tileCleanFade[fadeKey];
                    ctx.fillStyle = cleanPattern || COLORS.clean;
                    ctx.fillRect(x, y, TILE, TILE);
                    ctx.restore();
                    continue;
                }
                ctx.fillStyle = cleanPattern || COLORS.clean;
            } else if (cell === CHARGER) {
                drawChargerTile(x, y);
                continue;
            } else if (cell === OBSTACLE) {
                ctx.fillStyle = floorPattern || COLORS.dirty;
            }

            ctx.fillRect(x, y, TILE, TILE);

            // Plank seam lines (horizontal between rows, vertical offset)
            ctx.strokeStyle = 'rgba(100, 80, 50, 0.08)';
            ctx.lineWidth = 0.8;
            // Bottom seam
            ctx.beginPath();
            ctx.moveTo(x, y + TILE - 0.5);
            ctx.lineTo(x + TILE, y + TILE - 0.5);
            ctx.stroke();
            // Vertical seam (staggered per row like real wood planks)
            if ((r + c) % 3 === 0) {
                ctx.beginPath();
                ctx.moveTo(x + TILE - 0.5, y);
                ctx.lineTo(x + TILE - 0.5, y + TILE);
                ctx.stroke();
            }

            // Dirt/debris marks on dirty tiles (seeded by position for consistency)
            if (cell === DIRTY) {
                const seed = (r * 17 + c * 31) % 100;
                if (seed < 40) {
                    // Small crumb/debris
                    ctx.fillStyle = `rgba(130, 105, 75, ${0.15 + (seed % 10) * 0.02})`;
                    ctx.beginPath();
                    ctx.arc(x + 10 + (seed % 28), y + 8 + ((seed * 3) % 32), 0.8 + (seed % 3) * 0.4, 0, Math.PI * 2);
                    ctx.fill();
                }
                if (seed > 25 && seed < 65) {
                    // Scuff mark
                    ctx.strokeStyle = `rgba(120, 100, 70, 0.06)`;
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(x + (seed % 20) + 5, y + ((seed * 2) % 30) + 8);
                    ctx.lineTo(x + (seed % 20) + 15, y + ((seed * 2) % 30) + 12);
                    ctx.stroke();
                }
            }
        }
    }
}

function drawChargerTile(x, y) {
    // Floor base underneath
    ctx.fillStyle = '#E0D4C0';
    ctx.fillRect(x, y, TILE, TILE);

    // Pulsing ambient glow on floor
    const pulse = 0.15 + 0.15 * Math.sin(chargerPulse * 0.04);
    const glowGrad = ctx.createRadialGradient(x + TILE/2, y + TILE/2, 2, x + TILE/2, y + TILE/2, TILE * 0.7);
    glowGrad.addColorStop(0, `rgba(60, 180, 255, ${pulse * 1.5})`);
    glowGrad.addColorStop(0.6, `rgba(60, 140, 255, ${pulse * 0.5})`);
    glowGrad.addColorStop(1, `rgba(60, 140, 255, 0)`);
    ctx.fillStyle = glowGrad;
    ctx.fillRect(x, y, TILE, TILE);

    // A ring of light spreading out from the dock
    const ringT = (chargerPulse * 0.012) % 1;
    ctx.save();
    ctx.globalAlpha = (1 - ringT) * 0.45;
    ctx.strokeStyle = '#6EC6FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + TILE / 2, y + TILE / 2, 8 + ringT * 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Shadow under dock
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x + TILE/2 + 1, y + TILE/2 + 2, 17, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dock base - metallic platform
    const dockGrad = ctx.createLinearGradient(x + 5, y + 5, x + TILE - 5, y + TILE - 5);
    dockGrad.addColorStop(0, '#6A6A6A');
    dockGrad.addColorStop(0.3, '#555');
    dockGrad.addColorStop(0.7, '#4A4A4A');
    dockGrad.addColorStop(1, '#3A3A3A');
    ctx.fillStyle = dockGrad;
    roundRect(ctx, x + 5, y + 5, TILE - 10, TILE - 10, 8);
    ctx.fill();
    // Metallic rim highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 5, y + 5, TILE - 10, TILE - 10, 8);
    ctx.stroke();

    // Inner recessed area
    const innerGrad = ctx.createRadialGradient(x + TILE/2 - 2, y + TILE/2 - 2, 0, x + TILE/2, y + TILE/2, 14);
    innerGrad.addColorStop(0, '#3A3A3A');
    innerGrad.addColorStop(1, '#222');
    ctx.fillStyle = innerGrad;
    roundRect(ctx, x + 9, y + 9, TILE - 18, TILE - 18, 6);
    ctx.fill();

    // Contact pins (two small metallic bumps)
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(x + TILE/2 - 6, y + TILE - 14, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + TILE/2 + 6, y + TILE - 14, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(x + TILE/2 - 6, y + TILE - 14.5, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + TILE/2 + 6, y + TILE - 14.5, 1, 0, Math.PI * 2);
    ctx.fill();

    // Lightning bolt with glow
    const cx = x + TILE / 2, cy = y + TILE / 2 - 2;
    ctx.save();
    ctx.shadowColor = '#FFD600';
    ctx.shadowBlur = 6 + 4 * Math.sin(chargerPulse * 0.06);
    ctx.fillStyle = '#FFD600';
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy - 8);
    ctx.lineTo(cx + 5, cy - 8);
    ctx.lineTo(cx + 1, cy - 1);
    ctx.lineTo(cx + 5, cy - 1);
    ctx.lineTo(cx - 2, cy + 8);
    ctx.lineTo(cx + 1, cy + 1);
    ctx.lineTo(cx - 4, cy + 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // LED indicator light
    const ledAlpha = 0.6 + 0.4 * Math.sin(chargerPulse * 0.08);
    ctx.fillStyle = `rgba(0, 220, 100, ${ledAlpha})`;
    ctx.beginPath();
    ctx.arc(x + TILE - 11, y + 11, 2, 0, Math.PI * 2);
    ctx.fill();

    // Grid line
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, TILE, TILE);
}

function drawObstacles() {
    const level = LEVELS[currentLevel];

    // First pass: ambient occlusion / contact shadows under furniture
    for (const obs of level.obstacles) {
        if (obs.type === 'wall') continue; // walls sit flush
        const x = obs.col * TILE;
        const y = obs.row * TILE;
        const w = obs.w * TILE;
        const h = obs.h * TILE;
        const pad = 3;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        // Soft spread shadow
        roundRect(ctx, x + pad - 2, y + pad + 2, w - pad * 2 + 4, h - pad * 2 + 4, 6);
        ctx.fill();
        ctx.restore();
    }

    // Second pass: actual obstacle rendering
    for (const obs of level.obstacles) {
        const x = obs.col * TILE;
        const y = obs.row * TILE;
        const w = obs.w * TILE;
        const h = obs.h * TILE;

        ctx.save();

        if (obs.type === 'couch') {
            drawCouch(x, y, w, h);
        } else if (obs.type === 'table') {
            drawTable(x, y, w, h);
        } else if (obs.type === 'chair') {
            drawChair(x, y);
        } else if (obs.type === 'plant') {
            drawPlant(x, y);
        } else if (obs.type === 'wall') {
            drawWall(x, y);
        } else if (obs.type === 'petbed') {
            drawPetBed(x, y, w, h);
        }

        ctx.restore();
    }
}

function drawCouch(x, y, w, h) {
    const pad = 2;
    const numCush = Math.round(w / TILE);

    // Deep drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#3E2723';
    roundRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, 8);
    ctx.fill();
    ctx.restore();

    // Couch base frame (visible at bottom)
    ctx.fillStyle = '#2E1B14';
    roundRect(ctx, x + pad + 2, y + h - pad - 4, w - pad * 2 - 4, 4, 2);
    ctx.fill();
    // Feet/legs
    ctx.fillStyle = '#1A1008';
    ctx.fillRect(x + pad + 4, y + h - pad - 2, 5, 3);
    ctx.fillRect(x + w - pad - 9, y + h - pad - 2, 5, 3);

    // Main body - rich leather with multi-stop gradient
    const bodyGrad = ctx.createLinearGradient(x, y, x, y + h);
    bodyGrad.addColorStop(0, '#8B6B5A');
    bodyGrad.addColorStop(0.08, '#7B5B4F');
    bodyGrad.addColorStop(0.2, '#6D4C41');
    bodyGrad.addColorStop(0.5, '#5D4037');
    bodyGrad.addColorStop(0.8, '#4E342E');
    bodyGrad.addColorStop(1, '#3E2723');
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2 - 3, 8);
    ctx.fill();

    // Backrest - taller, rounded top, darker recessed area
    const backH = 14;
    const backGrad = ctx.createLinearGradient(x, y + pad, x, y + pad + backH);
    backGrad.addColorStop(0, '#3E2723');
    backGrad.addColorStop(0.3, '#4A302A');
    backGrad.addColorStop(0.6, '#5D4037');
    backGrad.addColorStop(1, '#4E342E');
    ctx.fillStyle = backGrad;
    roundRect(ctx, x + pad + 1, y + pad, w - pad * 2 - 2, backH, 7);
    ctx.fill();
    // Backrest shadow crease
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + pad + 6, y + pad + backH);
    ctx.lineTo(x + w - pad - 6, y + pad + backH);
    ctx.stroke();

    // Individual cushions with realistic puffy shape
    const cushTop = y + pad + backH + 1;
    const cushH = h - pad * 2 - backH - 5;
    const cushW = (w - pad * 2 - 2) / numCush;
    for (let i = 0; i < numCush; i++) {
        const cx = x + pad + 1 + i * cushW;
        // Cushion body
        const cGrad = ctx.createRadialGradient(cx + cushW/2 - 2, cushTop + cushH/2 - 2, 0, cx + cushW/2, cushTop + cushH/2, cushW * 0.7);
        cGrad.addColorStop(0, '#7A5A4A');
        cGrad.addColorStop(0.4, '#6D4C41');
        cGrad.addColorStop(1, '#5D4037');
        ctx.fillStyle = cGrad;
        roundRect(ctx, cx + 1, cushTop, cushW - 2, cushH, 5);
        ctx.fill();
        // Puffy highlight
        const pGrad = ctx.createRadialGradient(cx + cushW/2 - 3, cushTop + 3, 0, cx + cushW/2, cushTop + cushH/2, cushW * 0.5);
        pGrad.addColorStop(0, 'rgba(255,255,255,0.1)');
        pGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = pGrad;
        roundRect(ctx, cx + 2, cushTop + 1, cushW - 4, cushH - 2, 4);
        ctx.fill();
        // Cushion crease at bottom
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.ellipse(cx + cushW/2, cushTop + cushH - 4, cushW * 0.35, 2, 0, 0, Math.PI);
        ctx.stroke();
    }
    // Divider shadows between cushions
    for (let i = 1; i < numCush; i++) {
        const dx = x + pad + 1 + i * cushW;
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(dx, cushTop + 2);
        ctx.bezierCurveTo(dx - 0.5, cushTop + cushH * 0.4, dx + 0.5, cushTop + cushH * 0.6, dx, cushTop + cushH - 2);
        ctx.stroke();
    }

    // Armrests - 3D rounded with highlight
    for (const side of ['left', 'right']) {
        const ax = side === 'left' ? x + pad - 1 : x + w - pad - 8;
        const aGrad = ctx.createLinearGradient(ax, 0, ax + 9, 0);
        if (side === 'left') {
            aGrad.addColorStop(0, '#6A4A3A');
            aGrad.addColorStop(0.4, '#5A3E32');
            aGrad.addColorStop(1, '#4E342E');
        } else {
            aGrad.addColorStop(0, '#4E342E');
            aGrad.addColorStop(0.6, '#5A3E32');
            aGrad.addColorStop(1, '#6A4A3A');
        }
        ctx.fillStyle = aGrad;
        roundRect(ctx, ax, y + pad + 2, 9, h - pad * 2 - 5, 5);
        ctx.fill();
        // Armrest top highlight
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        roundRect(ctx, ax + 1, y + pad + 2, 7, 3, 2);
        ctx.fill();
    }

    // Fabric texture - subtle crosshatch
    ctx.save();
    ctx.globalAlpha = 0.03;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.3;
    for (let ty = y + pad; ty < y + h - pad; ty += 3) {
        ctx.beginPath();
        ctx.moveTo(x + pad, ty);
        ctx.lineTo(x + w - pad, ty);
        ctx.stroke();
    }
    ctx.restore();

    // Piping/trim along top edge
    ctx.strokeStyle = 'rgba(255,220,180,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + pad + 10, y + pad + 1);
    ctx.lineTo(x + w - pad - 10, y + pad + 1);
    ctx.stroke();
}

function drawTable(x, y, w, h) {
    const pad = 3;

    // Table legs (wooden, visible peeking out from under surface)
    const legW = 5, legH = 6;
    for (const [lx, ly] of [
        [x + pad + 4, y + pad + 4],
        [x + w - pad - legW - 4, y + pad + 4],
        [x + pad + 4, y + h - pad - legH - 3],
        [x + w - pad - legW - 4, y + h - pad - legH - 3],
    ]) {
        const legGrad = ctx.createLinearGradient(lx, 0, lx + legW, 0);
        legGrad.addColorStop(0, '#5A4030');
        legGrad.addColorStop(0.5, '#6D5040');
        legGrad.addColorStop(1, '#4A3525');
        ctx.fillStyle = legGrad;
        ctx.fillRect(lx, ly, legW, legH);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(lx, ly, legW, 1);
    }

    // Drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#7D5E53';
    roundRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, 4);
    ctx.fill();
    ctx.restore();

    // Table edge/apron (thicker wood border visible from top-down)
    const edgeGrad = ctx.createLinearGradient(x + pad, 0, x + w - pad, 0);
    edgeGrad.addColorStop(0, '#6D5040');
    edgeGrad.addColorStop(0.5, '#7D5E53');
    edgeGrad.addColorStop(1, '#5A4535');
    ctx.fillStyle = edgeGrad;
    roundRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, 4);
    ctx.fill();

    // Table surface (inset from edge, lighter wood)
    const inset = 3;
    const surfGrad = ctx.createLinearGradient(x, y, x + w * 0.7, y + h);
    surfGrad.addColorStop(0, '#C4A080');
    surfGrad.addColorStop(0.2, '#B89474');
    surfGrad.addColorStop(0.5, '#A88468');
    surfGrad.addColorStop(0.8, '#9A7660');
    surfGrad.addColorStop(1, '#8D6E58');
    ctx.fillStyle = surfGrad;
    roundRect(ctx, x + pad + inset, y + pad + inset, w - pad * 2 - inset * 2, h - pad * 2 - inset * 2, 3);
    ctx.fill();

    // Rich wood grain - organic curves
    const grainCount = Math.floor(h / 5);
    for (let i = 0; i < grainCount; i++) {
        const gy = y + pad + inset + 3 + i * 5;
        if (gy > y + h - pad - inset - 2) break;
        const alpha = 0.04 + (Math.sin(i * 2.3) * 0.02 + 0.02);
        ctx.strokeStyle = `rgba(80, 50, 25, ${alpha})`;
        ctx.lineWidth = 0.3 + Math.sin(i * 1.1) * 0.3;
        ctx.beginPath();
        ctx.moveTo(x + pad + inset + 2, gy);
        const cp1x = x + w * 0.25 + Math.sin(i * 0.7) * 5;
        const cp2x = x + w * 0.75 - Math.cos(i * 0.5) * 4;
        ctx.bezierCurveTo(cp1x, gy + Math.sin(i) * 2, cp2x, gy - Math.cos(i) * 1.5, x + w - pad - inset - 2, gy + Math.sin(i * 0.3) * 1);
        ctx.stroke();
    }

    // Wood knot
    const kx = x + w * 0.6, ky = y + h * 0.4;
    ctx.strokeStyle = 'rgba(80, 50, 25, 0.08)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(kx, ky, 4, 3, 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(100, 65, 35, 0.06)';
    ctx.beginPath();
    ctx.ellipse(kx, ky, 3, 2, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Surface reflection/sheen
    const sheen = ctx.createLinearGradient(x + pad, y + pad, x + w * 0.6, y + h * 0.4);
    sheen.addColorStop(0, 'rgba(255,255,255,0.1)');
    sheen.addColorStop(0.3, 'rgba(255,255,255,0.03)');
    sheen.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sheen;
    roundRect(ctx, x + pad + inset, y + pad + inset, w - pad * 2 - inset * 2, h - pad * 2 - inset * 2, 3);
    ctx.fill();

    // Beveled edge - light on top-left, shadow on bottom-right
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + pad + 4, y + pad);
    ctx.lineTo(x + w - pad - 4, y + pad);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + pad, y + pad + 4);
    ctx.lineTo(x + pad, y + h - pad - 4);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.moveTo(x + pad + 4, y + h - pad);
    ctx.lineTo(x + w - pad - 4, y + h - pad);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w - pad, y + pad + 4);
    ctx.lineTo(x + w - pad, y + h - pad - 4);
    ctx.stroke();
}

function drawChair(x, y) {
    const pad = 4;
    const cx = x + TILE / 2, cy = y + TILE / 2;

    // Four wooden legs (seen from above)
    const legs = [[pad + 3, pad + 3], [TILE - pad - 6, pad + 3], [pad + 3, TILE - pad - 5], [TILE - pad - 6, TILE - pad - 5]];
    for (const [lx, ly] of legs) {
        const legGrad = ctx.createRadialGradient(x + lx + 1.5, y + ly + 1, 0, x + lx + 1.5, y + ly + 1.5, 3);
        legGrad.addColorStop(0, '#AA8866');
        legGrad.addColorStop(1, '#775533');
        ctx.fillStyle = legGrad;
        ctx.beginPath();
        ctx.arc(x + lx + 1.5, y + ly + 1.5, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Leg highlight
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(x + lx + 1, y + ly + 1, 1, 0, Math.PI * 2);
        ctx.fill();
    }

    // Chair shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#757575';
    roundRect(ctx, x + pad + 1, y + pad + 1, TILE - pad * 2 - 2, TILE - pad * 2 - 2, 5);
    ctx.fill();
    ctx.restore();

    // Seat cushion - padded fabric
    const seatGrad = ctx.createRadialGradient(cx - 3, cy - 1, 0, cx, cy + 2, 20);
    seatGrad.addColorStop(0, '#B0B0B0');
    seatGrad.addColorStop(0.3, '#989898');
    seatGrad.addColorStop(0.7, '#808080');
    seatGrad.addColorStop(1, '#686868');
    ctx.fillStyle = seatGrad;
    roundRect(ctx, x + pad + 1, y + pad + 1, TILE - pad * 2 - 2, TILE - pad * 2 - 2, 5);
    ctx.fill();

    // Backrest - raised darker section at top
    const backH = 12;
    const backGrad = ctx.createLinearGradient(x, y + pad, x, y + pad + backH);
    backGrad.addColorStop(0, '#606060');
    backGrad.addColorStop(0.3, '#555');
    backGrad.addColorStop(0.7, '#656565');
    backGrad.addColorStop(1, '#757575');
    ctx.fillStyle = backGrad;
    roundRect(ctx, x + pad + 1, y + pad, TILE - pad * 2 - 2, backH, 5);
    ctx.fill();
    // Backrest shadow below it
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + pad + 4, y + pad + backH);
    ctx.lineTo(x + TILE - pad - 4, y + pad + backH);
    ctx.stroke();

    // Seat cushion puffy center
    const puffGrad = ctx.createRadialGradient(cx - 1, cy + 3, 0, cx, cy + 3, 12);
    puffGrad.addColorStop(0, 'rgba(255,255,255,0.1)');
    puffGrad.addColorStop(0.6, 'rgba(255,255,255,0.02)');
    puffGrad.addColorStop(1, 'rgba(0,0,0,0.04)');
    ctx.fillStyle = puffGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Button tufting (center of seat)
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy + 4, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(cx - 0.5, cy + 3.5, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Fabric texture lines
    ctx.save();
    ctx.globalAlpha = 0.03;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.3;
    for (let ty = y + pad + backH + 2; ty < y + TILE - pad; ty += 2.5) {
        ctx.beginPath();
        ctx.moveTo(x + pad + 3, ty);
        ctx.lineTo(x + TILE - pad - 3, ty);
        ctx.stroke();
    }
    ctx.restore();

    // Edge piping
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.8;
    roundRect(ctx, x + pad + 2, y + pad + 1, TILE - pad * 2 - 4, TILE - pad * 2 - 3, 4);
    ctx.stroke();
}

function drawPlant(x, y) {
    const cx = x + TILE / 2;

    // Ground shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;

    // Terracotta pot - realistic cylindrical shading
    const potGrad = ctx.createLinearGradient(x + 10, y + 24, x + 38, y + 24);
    potGrad.addColorStop(0, '#7A4428');
    potGrad.addColorStop(0.15, '#9A5835');
    potGrad.addColorStop(0.35, '#C07848');
    potGrad.addColorStop(0.5, '#D08858');
    potGrad.addColorStop(0.65, '#C07848');
    potGrad.addColorStop(0.85, '#9A5835');
    potGrad.addColorStop(1, '#6A3820');
    ctx.fillStyle = potGrad;
    ctx.beginPath();
    ctx.moveTo(x + 13, y + 44);
    ctx.lineTo(x + 35, y + 44);
    ctx.lineTo(x + 32, y + 27);
    ctx.lineTo(x + 16, y + 27);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Pot texture - subtle terracotta speckle
    ctx.save();
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i % 2 ? '#FFF' : '#000';
        ctx.beginPath();
        ctx.arc(x + 16 + (i * 7 % 18), y + 30 + (i * 3 % 12), 0.5 + (i % 3) * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // Pot rim - thick rounded lip
    const rimGrad = ctx.createLinearGradient(x + 11, y + 22, x + 11, y + 29);
    rimGrad.addColorStop(0, '#D8986A');
    rimGrad.addColorStop(0.3, '#C88050');
    rimGrad.addColorStop(0.7, '#B06838');
    rimGrad.addColorStop(1, '#8A5030');
    ctx.fillStyle = rimGrad;
    roundRect(ctx, x + 12, y + 22, 24, 6, 3);
    ctx.fill();
    // Rim top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    roundRect(ctx, x + 13, y + 22, 22, 2, 2);
    ctx.fill();

    // Soil - dark earth with pebbles
    ctx.fillStyle = '#2E1A0E';
    ctx.beginPath();
    ctx.ellipse(cx, y + 27, 10, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Soil highlights (small pebbles/bark)
    const soilBits = [[cx-4, y+26, '#4A3520'], [cx+3, y+27, '#5A4530'], [cx-1, y+25.5, '#3A2515'], [cx+5, y+26.5, '#45301A']];
    for (const [sx, sy, sc] of soilBits) {
        ctx.fillStyle = sc;
        ctx.beginPath();
        ctx.arc(sx, sy, 1 + Math.random() * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Main stem + branches
    ctx.strokeStyle = '#33691E';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, y + 25);
    ctx.bezierCurveTo(cx - 1, y + 20, cx + 1, y + 16, cx, y + 12);
    ctx.stroke();
    // Side branches
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, y + 18);
    ctx.bezierCurveTo(cx - 4, y + 15, cx - 8, y + 12, cx - 10, y + 9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, y + 16);
    ctx.bezierCurveTo(cx + 3, y + 13, cx + 7, y + 11, cx + 9, y + 8);
    ctx.stroke();

    // Individual leaves with pointed shape and veins
    const leafData = [
        { bx: cx, by: y + 12, angle: -1.2, len: 10, color: '#43A047' },
        { bx: cx - 10, by: y + 9, angle: -0.8, len: 8, color: '#388E3C' },
        { bx: cx + 9, by: y + 8, angle: -0.3, len: 9, color: '#4CAF50' },
        { bx: cx - 3, by: y + 10, angle: -2.0, len: 7, color: '#2E7D32' },
        { bx: cx + 4, by: y + 14, angle: 0.2, len: 8, color: '#66BB6A' },
        { bx: cx - 6, by: y + 14, angle: -2.5, len: 6, color: '#388E3C' },
        { bx: cx, by: y + 8, angle: -1.5, len: 9, color: '#4CAF50' },
        { bx: cx + 2, by: y + 6, angle: -1.0, len: 7, color: '#2E7D32' },
    ];
    for (const l of leafData) {
        const tipX = l.bx + Math.cos(l.angle) * l.len;
        const tipY = l.by + Math.sin(l.angle) * l.len;
        const perpX = Math.cos(l.angle + Math.PI / 2) * l.len * 0.3;
        const perpY = Math.sin(l.angle + Math.PI / 2) * l.len * 0.3;
        const midX = (l.bx + tipX) / 2;
        const midY = (l.by + tipY) / 2;

        // Leaf shape
        const lGrad = ctx.createLinearGradient(l.bx, l.by, tipX, tipY);
        lGrad.addColorStop(0, shadeColor(l.color, 10));
        lGrad.addColorStop(0.5, l.color);
        lGrad.addColorStop(1, shadeColor(l.color, -15));
        ctx.fillStyle = lGrad;
        ctx.beginPath();
        ctx.moveTo(l.bx, l.by);
        ctx.quadraticCurveTo(midX + perpX, midY + perpY, tipX, tipY);
        ctx.quadraticCurveTo(midX - perpX, midY - perpY, l.bx, l.by);
        ctx.fill();

        // Central vein
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(l.bx, l.by);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
    }

    // Foliage specular highlight
    const foliageSpec = ctx.createRadialGradient(cx - 4, y + 9, 0, cx - 2, y + 10, 8);
    foliageSpec.addColorStop(0, 'rgba(255,255,255,0.22)');
    foliageSpec.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    foliageSpec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = foliageSpec;
    ctx.beginPath();
    ctx.arc(cx - 3, y + 10, 8, 0, Math.PI * 2);
    ctx.fill();
}

function drawWall(x, y) {
    // 3D wall thickness (south and east faces visible from top-down)
    const depth = 5;

    // South face (bottom edge, darker)
    const southGrad = ctx.createLinearGradient(x, y + TILE, x, y + TILE + depth);
    southGrad.addColorStop(0, '#4A4040');
    southGrad.addColorStop(1, '#353030');
    ctx.fillStyle = southGrad;
    ctx.fillRect(x + depth, y + TILE - depth, TILE - depth, depth);

    // East face (right edge, medium dark)
    const eastGrad = ctx.createLinearGradient(x + TILE, y, x + TILE + depth, y);
    eastGrad.addColorStop(0, '#504545');
    eastGrad.addColorStop(1, '#3A3535');
    ctx.fillStyle = eastGrad;
    ctx.fillRect(x + TILE - depth, y + depth, depth, TILE - depth);

    // Corner (darkest)
    ctx.fillStyle = '#302828';
    ctx.fillRect(x + TILE - depth, y + TILE - depth, depth, depth);

    // Mortar/grout base for top face
    ctx.fillStyle = '#908580';
    ctx.fillRect(x, y, TILE - depth, TILE - depth);

    // Brick pattern with individual brick colors and 3D per-brick
    const brickH = (TILE - depth) / 4;
    const brickW = (TILE - depth) / 2;
    const brickColors = ['#7B6060', '#826565', '#6E5555', '#755D5D', '#8A7070', '#695050'];
    let colorIdx = 0;
    for (let row = 0; row < 4; row++) {
        const by = y + row * brickH;
        const offset = (row % 2) * (brickW / 2);
        for (let col = -1; col < 3; col++) {
            const bx = x + offset + col * brickW;
            const brickLeft = Math.max(x, bx + 1);
            const brickRight = Math.min(x + TILE - depth, bx + brickW - 1);
            const brickTop = by + 1;
            const brickBot = Math.min(y + TILE - depth, by + brickH - 1);
            if (brickRight <= brickLeft || brickBot <= brickTop) continue;
            const bW = brickRight - brickLeft;
            const bH = brickBot - brickTop;

            // Brick fill with gradient
            const baseColor = brickColors[(colorIdx++) % brickColors.length];
            const bGrad = ctx.createLinearGradient(brickLeft, brickTop, brickLeft, brickBot);
            bGrad.addColorStop(0, shadeColor(baseColor, 8));
            bGrad.addColorStop(0.5, baseColor);
            bGrad.addColorStop(1, shadeColor(baseColor, -8));
            ctx.fillStyle = bGrad;
            ctx.fillRect(brickLeft, brickTop, bW, bH);

            // 3D brick edges - top/left lighter
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(brickLeft, brickTop, bW, 1.5);
            ctx.fillRect(brickLeft, brickTop, 1, bH);
            // bottom/right darker (recessed mortar shadow)
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.fillRect(brickLeft, brickBot - 1.5, bW, 1.5);
            ctx.fillRect(brickRight - 1, brickTop, 1, bH);

            // Brick surface variation (speckle)
            ctx.fillStyle = `rgba(0,0,0,${0.01 + (colorIdx % 3) * 0.01})`;
            ctx.beginPath();
            ctx.arc(brickLeft + bW * 0.3, brickTop + bH * 0.4, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Top face - outer 3D edge bevel
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x, y, TILE - depth, 2.5);
    ctx.fillRect(x, y, 2.5, TILE - depth);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(x, y + TILE - depth - 2.5, TILE - depth, 2.5);
    ctx.fillRect(x + TILE - depth - 2.5, y, 2.5, TILE - depth);
}

// Helper to darken/lighten a hex color
function shadeColor(color, amount) {
    const num = parseInt(color.slice(1), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

function drawPetBed(x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2;

    // Soft ground shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;

    // Outer rim - plush bolster with fabric gradient
    const rimGrad = ctx.createRadialGradient(cx - 6, cy - 4, 0, cx, cy, w / 2);
    rimGrad.addColorStop(0, '#F8B0B0');
    rimGrad.addColorStop(0.3, '#EF9A9A');
    rimGrad.addColorStop(0.6, '#E57373');
    rimGrad.addColorStop(0.85, '#D32F2F');
    rimGrad.addColorStop(1, '#B71C1C');
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2 - 2, h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Individual bolster bumps (3D puffy sections around rim)
    const numBumps = 10;
    for (let i = 0; i < numBumps; i++) {
        const a = (i / numBumps) * Math.PI * 2;
        const br = w / 2 - 7;
        const bx = cx + Math.cos(a) * br;
        const by = cy + Math.sin(a) * (h / 2 - 5);
        const bumpR = 6 + (i % 2);
        const bGrad = ctx.createRadialGradient(bx - 1, by - 1, 0, bx, by, bumpR);
        bGrad.addColorStop(0, 'rgba(255,200,200,0.15)');
        bGrad.addColorStop(0.5, 'rgba(255,180,180,0.05)');
        bGrad.addColorStop(1, 'rgba(0,0,0,0.03)');
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.ellipse(bx, by, bumpR, bumpR * 0.7, a, 0, Math.PI * 2);
        ctx.fill();
    }

    // Inner cushion - soft plush with depth
    const cushOuter = ctx.createRadialGradient(cx - 5, cy - 4, 0, cx, cy, w / 2.5);
    cushOuter.addColorStop(0, '#FFE8EA');
    cushOuter.addColorStop(0.3, '#FFCDD2');
    cushOuter.addColorStop(0.7, '#EF9A9A');
    cushOuter.addColorStop(1, '#E08080');
    ctx.fillStyle = cushOuter;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2 - 11, h / 2 - 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cushion wrinkle/indent (where pet sleeps)
    ctx.strokeStyle = 'rgba(180, 100, 100, 0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy + 1, w / 5, h / 6, 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx - 3, cy, w / 6, h / 7, -0.3, 0, Math.PI * 2);
    ctx.stroke();

    // Pet hair detail (tiny lines)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#8B6060';
    ctx.lineWidth = 0.3;
    const hairs = [[cx-8,cy-2,cx-5,cy+1],[cx+6,cy-1,cx+3,cy+2],[cx-2,cy+3,cx+1,cy+5],[cx+10,cy,cx+7,cy+2]];
    for (const [hx1,hy1,hx2,hy2] of hairs) {
        ctx.beginPath();
        ctx.moveTo(hx1, hy1);
        ctx.quadraticCurveTo((hx1+hx2)/2, (hy1+hy2)/2 - 1, hx2, hy2);
        ctx.stroke();
    }
    ctx.restore();

    // Stitching detail around bolster
    ctx.strokeStyle = 'rgba(160, 60, 60, 0.15)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2.5]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2 - 7, h / 2 - 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Tag detail (little tag sticking out)
    ctx.fillStyle = '#F5F5F5';
    ctx.fillRect(cx + w/2 - 14, cy + 2, 4, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(cx + w/2 - 13, cy + 4, 2, 2);

    // Specular highlight
    const specGrad = ctx.createRadialGradient(cx - 8, cy - 3, 0, cx - 6, cy - 2, 10);
    specGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
    specGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.ellipse(cx - 7, cy - 3, 10, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
}

function drawRoomba() {
    // Smooth interpolation toward target position
    const targetX = roomba.col * TILE + TILE / 2;
    const targetY = roomba.row * TILE + TILE / 2;
    const lerp = easeK(0.3); // smoothing factor per 60 fps frame, scaled to real elapsed time
    roomba.drawX += (targetX - roomba.drawX) * lerp;
    roomba.drawY += (targetY - roomba.drawY) * lerp;
    // Snap if very close to avoid infinite creep
    if (Math.abs(targetX - roomba.drawX) < 0.5) roomba.drawX = targetX;
    if (Math.abs(targetY - roomba.drawY) < 0.5) roomba.drawY = targetY;

    const x = roomba.drawX;
    const y = roomba.drawY;
    const r = 20;
    const dirAngles = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };
    const angle = dirAngles[roomba.dir];

    ctx.save();
    ctx.translate(x, y);

    // Soft glow in the light colour spilling onto the floor
    {
        const [lr, lg, lb] = design.lightRgb;
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

    // Ground shadow (soft ellipse, cast down-left like the furniture)
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(-3, 4, r + 2, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bump flash glow
    if (bumpFlash > 0) {
        ctx.shadowColor = '#FF5252';
        ctx.shadowBlur = 25;
    }

    // Main body - realistic dark plastic with multi-stop gradient
    const bodyGrad = ctx.createRadialGradient(-5, -5, 0, 0, 0, r);
    bodyGrad.addColorStop(0, '#505050');
    bodyGrad.addColorStop(0.3, '#404040');
    bodyGrad.addColorStop(0.7, '#2D2D2D');
    bodyGrad.addColorStop(1, '#1A1A1A');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Outer bumper ring - subtle metallic
    const bumperGrad = ctx.createLinearGradient(-r, -r, r, r);
    bumperGrad.addColorStop(0, '#3A3A3A');
    bumperGrad.addColorStop(0.5, '#2A2A2A');
    bumperGrad.addColorStop(1, '#1A1A1A');
    ctx.strokeStyle = bumperGrad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // Bumper sensor strip (front half) - rubber look
    ctx.strokeStyle = '#4A4A4A';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, r - 0.5, angle - Math.PI * 0.55, angle + Math.PI * 0.55);
    ctx.stroke();
    // IR sensor windows on bumper
    for (let i = -2; i <= 2; i++) {
        const sAngle = angle + i * 0.22;
        const sx = Math.cos(sAngle) * (r - 1);
        const sy = Math.sin(sAngle) * (r - 1);
        ctx.fillStyle = 'rgba(20,20,20,0.6)';
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Top plate accent ring, in the player's chosen light colour
    const lightHex = design.lightColor;
    const accentGrad = ctx.createLinearGradient(-r, 0, r, 0);
    accentGrad.addColorStop(0, shadeColor(lightHex, -24));
    accentGrad.addColorStop(0.5, lightHex);
    accentGrad.addColorStop(1, shadeColor(lightHex, -24));
    ctx.save();
    ctx.shadowColor = lightHex;
    ctx.shadowBlur = (8 + 4 * Math.sin(chargerPulse * 0.08)) * canvasDpr;
    ctx.strokeStyle = accentGrad;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, r - 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Inner plate - slightly lighter
    const innerGrad = ctx.createRadialGradient(-3, -3, 0, 0, 0, r - 7);
    innerGrad.addColorStop(0, '#3D3D3D');
    innerGrad.addColorStop(1, '#2A2A2A');
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r - 7, 0, Math.PI * 2);
    ctx.fill();

    // Direction indicator - front brush opening
    ctx.fillStyle = shadeColor(lightHex, -10);
    ctx.beginPath();
    ctx.arc(0, 0, r - 7, angle - 0.5, angle + 0.5);
    ctx.lineTo(Math.cos(angle) * 3, Math.sin(angle) * 3);
    ctx.closePath();
    ctx.fill();

    // Spinning side brush (single multi-arm brush at front-right)
    ctx.save();
    ctx.rotate(angle);
    const brushAngle = roombaWheelAngle;
    // Side brush (3-arm spinner)
    ctx.save();
    ctx.translate(r - 5, 8);
    ctx.rotate(brushAngle * 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let a = 0; a < 3; a++) {
        const ba = a * Math.PI * 2 / 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ba) * 6, Math.sin(ba) * 6);
        ctx.stroke();
    }
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Roller brushes (two parallel lines under the body at front)
    ctx.save();
    ctx.translate(r - 10, 0);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(0, 5);
    ctx.stroke();
    ctx.strokeStyle = '#777';
    ctx.beginPath();
    ctx.moveTo(-3, -5);
    ctx.lineTo(-3, 5);
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // Center CLEAN button with glow: the light colour normally, red when the battery is low
    ctx.save();
    const batteryOk = !isLowBattery();
    if (batteryOk) {
        ctx.shadowColor = lightHex;
        ctx.shadowBlur = 8;
    } else {
        ctx.shadowColor = '#F44336';
        ctx.shadowBlur = 6;
    }
    const btnGrad = ctx.createRadialGradient(0, -1, 0, 0, 0, 6);
    if (batteryOk) {
        btnGrad.addColorStop(0, shadeColor(lightHex, 60));
        btnGrad.addColorStop(0.6, lightHex);
        btnGrad.addColorStop(1, shadeColor(lightHex, -50));
    } else {
        btnGrad.addColorStop(0, '#FF5252');
        btnGrad.addColorStop(0.6, '#F44336');
        btnGrad.addColorStop(1, '#C62828');
    }
    ctx.fillStyle = btnGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    // Specular highlight - realistic plastic shine
    const specGrad = ctx.createRadialGradient(-5, -7, 0, -4, -6, 8);
    specGrad.addColorStop(0, 'rgba(255,255,255,0.22)');
    specGrad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    specGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.ellipse(-5, -7, 8, 4, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Side wheels - rubber treads
    ctx.save();
    ctx.rotate(angle + Math.PI / 2);
    // Left wheel
    const wheelGrad = ctx.createLinearGradient(-4, r - 6, 4, r - 6);
    wheelGrad.addColorStop(0, '#222');
    wheelGrad.addColorStop(0.3, '#333');
    wheelGrad.addColorStop(0.7, '#333');
    wheelGrad.addColorStop(1, '#1A1A1A');
    ctx.fillStyle = wheelGrad;
    roundRect(ctx, -4, r - 6, 8, 5, 2);
    ctx.fill();
    // Right wheel
    roundRect(ctx, -4, -r + 1, 8, 5, 2);
    ctx.fill();
    // Tread lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    for (let t = 0; t < 3; t++) {
        ctx.beginPath();
        ctx.moveTo(-3 + t * 3, r - 5);
        ctx.lineTo(-3 + t * 3, r - 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-3 + t * 3, -r + 2);
        ctx.lineTo(-3 + t * 3, -r + 5);
        ctx.stroke();
    }
    ctx.restore();

    // Front caster wheel
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(r - 3, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Headlight lens on the bumper when the flashlight is on
    if (design.flashOn) {
        const [fr, fg, fb] = design.flashRgb;
        ctx.save();
        ctx.rotate(angle);
        ctx.shadowColor = `rgb(${fr},${fg},${fb})`;
        ctx.shadowBlur = 14;
        ctx.fillStyle = `rgb(${Math.min(255, fr + 60)},${Math.min(255, fg + 60)},${Math.min(255, fb + 60)})`;
        ctx.beginPath();
        ctx.ellipse(r - 1, 0, 2.5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    ctx.restore();
}

// Flashlight beam on the board: a cone ahead of the Roomba, stopped by furniture and walls,
// drawn additively over a slightly dimmed room so it reads as light.
function drawFlashlight2D() {
    if (!design.flashOn) return;
    const [fr, fg, fb] = design.flashRgb;
    const ang = FP_ANGLE_MAP[roomba.dir];
    const ox = roomba.drawX, oy = roomba.drawY;
    const halfAngle = 0.4;          // radians, about 23 degrees each side
    const maxLen = 3.8 * TILE;
    const step = TILE * 0.1;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Beam outline: march a fan of rays until each hits something
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

    // Soft pool right in front of the lens
    const pool = ctx.createRadialGradient(ox, oy, 0, ox, oy, TILE * 0.9);
    pool.addColorStop(0, `rgba(${fr},${fg},${fb},0.35)`);
    pool.addColorStop(1, `rgba(${fr},${fg},${fb},0)`);
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(ox, oy, TILE * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawCleanAnimations() {
    for (let i = cleanAnimations.length - 1; i >= 0; i--) {
        const anim = cleanAnimations[i];
        anim.progress += 0.035 * dtFrames;
        if (anim.progress >= 1) {
            cleanAnimations.splice(i, 1);
            continue;
        }
        const x = anim.col * TILE + TILE / 2;
        const y = anim.row * TILE + TILE / 2;
        const alpha = 1 - anim.progress;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Expanding clean ring
        ctx.strokeStyle = `rgba(180, 240, 200, ${alpha * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 4 + anim.progress * 18, 0, Math.PI * 2);
        ctx.stroke();

        // Sparkle stars (more, with varied sizes)
        for (let p = 0; p < 7; p++) {
            const a = (p / 7) * Math.PI * 2 + anim.progress * 4;
            const dist = 5 + anim.progress * 18;
            const px = x + Math.cos(a) * dist;
            const py = y + Math.sin(a) * dist;
            const size = (1.5 + (p % 3) * 0.5) * (1 - anim.progress);
            // 4-point star with glow
            ctx.fillStyle = p % 2 === 0 ? '#FFF' : 'rgba(180, 255, 220, 0.9)';
            ctx.beginPath();
            ctx.moveTo(px, py - size);
            ctx.lineTo(px + size * 0.3, py);
            ctx.lineTo(px, py + size);
            ctx.lineTo(px - size * 0.3, py);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(px - size, py);
            ctx.lineTo(px, py + size * 0.3);
            ctx.lineTo(px + size, py);
            ctx.lineTo(px, py - size * 0.3);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }
}

function drawNpcGrid() {
    // Draw the NPC's version of the grid (showing its cleaning progress)
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const x = c * TILE;
            const y = r * TILE;
            const cell = npcReplay.grid[r][c];

            if (cell === DIRTY) {
                ctx.fillStyle = floorPattern || COLORS.dirty;
            } else if (cell === CLEAN) {
                ctx.fillStyle = cleanPattern || COLORS.clean;
            } else if (cell === CHARGER) {
                drawChargerTile(x, y);
                continue;
            } else if (cell === OBSTACLE) {
                ctx.fillStyle = floorPattern || COLORS.dirty;
            }

            ctx.fillRect(x, y, TILE, TILE);
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x, y, TILE, TILE);
        }
    }
}

function drawNpcTrail() {
    for (const t of npcReplay.trailAlpha) {
        const x = t.col * TILE;
        const y = t.row * TILE;
        ctx.save();
        ctx.globalAlpha = t.alpha * 0.3;
        // Yellow/dim trail during approach, cyan during cleaning
        ctx.fillStyle = t.approach ? '#FFB74D' : '#00BFFF';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.restore();
    }
}

function drawNpcVacuum() {
    // Smooth interpolation
    const targetX = npcReplay.col * TILE + TILE / 2;
    const targetY = npcReplay.row * TILE + TILE / 2;
    const npcLerp = easeK(0.25);
    npcReplay.drawX += (targetX - npcReplay.drawX) * npcLerp;
    npcReplay.drawY += (targetY - npcReplay.drawY) * npcLerp;
    if (Math.abs(targetX - npcReplay.drawX) < 0.5) npcReplay.drawX = targetX;
    if (Math.abs(targetY - npcReplay.drawY) < 0.5) npcReplay.drawY = targetY;

    const x = npcReplay.drawX;
    const y = npcReplay.drawY;
    const r = 19;
    const dirAngles = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };
    const angle = dirAngles[npcReplay.dir];
    const pulse = 0.7 + 0.3 * Math.sin(chargerPulse * 0.1);

    ctx.save();
    ctx.translate(x, y);

    // Outer neon glow (layered for intensity)
    ctx.shadowColor = '#00BFFF';
    ctx.shadowBlur = 25 * pulse;

    // Body - dark with blue tint
    const bodyGrad = ctx.createRadialGradient(-3, -3, 0, 0, 0, r);
    bodyGrad.addColorStop(0, '#1A2A3A');
    bodyGrad.addColorStop(0.5, '#0D1B2A');
    bodyGrad.addColorStop(1, '#050E18');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Neon outer ring
    ctx.shadowColor = '#00BFFF';
    ctx.shadowBlur = 15 * pulse;
    ctx.strokeStyle = `rgba(0, 191, 255, ${0.7 + 0.3 * pulse})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // Inner neon ring
    ctx.strokeStyle = `rgba(0, 230, 255, ${0.5 + 0.3 * pulse})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r - 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Bumper sensor band (front half) - neon accent
    ctx.strokeStyle = `rgba(0, 191, 255, 0.4)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r - 1, angle - Math.PI / 2, angle + Math.PI / 2);
    ctx.stroke();

    // Direction indicator - neon wedge
    ctx.fillStyle = `rgba(0, 191, 255, ${0.4 + 0.2 * pulse})`;
    ctx.beginPath();
    ctx.arc(0, 0, r - 6, angle - 0.4, angle + 0.4);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();

    // Spinning brush rollers
    ctx.save();
    ctx.rotate(angle);
    ctx.strokeStyle = `rgba(0, 230, 255, 0.6)`;
    ctx.lineWidth = 1.5;
    const ba = npcReplay.wheelAngle;
    // Left brush
    ctx.save();
    ctx.translate(r - 8, -6);
    ctx.rotate(ba);
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.stroke();
    ctx.restore();
    // Right brush
    ctx.save();
    ctx.translate(r - 8, 6);
    ctx.rotate(-ba * 1.3);
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.stroke();
    ctx.restore();
    ctx.restore();

    // Center power LED - bright cyan
    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur = 10 * pulse;
    const ledGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 5);
    ledGrad.addColorStop(0, '#00FFFF');
    ledGrad.addColorStop(0.5, '#00BFFF');
    ledGrad.addColorStop(1, '#0066CC');
    ctx.fillStyle = ledGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Specular highlight
    ctx.fillStyle = 'rgba(100, 200, 255, 0.15)';
    ctx.beginPath();
    ctx.ellipse(-5, -6, 6, 3, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // Side wheels
    ctx.fillStyle = '#0A1520';
    ctx.save();
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillRect(-3, r - 5, 6, 4);
    ctx.fillRect(-3, -r + 1, 6, 4);
    ctx.restore();

    ctx.restore();
}

function drawNpcOverlay() {
    // Progress bar at top
    const progress = npcReplay.stepIndex / (parPath.length - 1);
    const barW = CANVAS_W - 40;
    const barH = 6;
    const barX = 20;
    const barY = 12;

    ctx.save();
    // Label - show phase
    const isApproach = npcReplay.stepIndex < parApproachLen;
    const phaseLabel = isApproach ? 'Approaching start...' : 'Cleaning par route';
    const cleanStep = isApproach ? 0 : npcReplay.stepIndex - parApproachLen;
    const cleanTotal = parPath.length - parApproachLen - 1;
    ctx.fillStyle = isApproach ? 'rgba(255, 183, 77, 0.9)' : 'rgba(0, 191, 255, 0.9)';
    ctx.font = 'bold 14px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${phaseLabel}  —  Step ${cleanStep} / ${cleanTotal}`, CANVAS_W / 2, barY + barH + 18);

    // Bar background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    roundRect(ctx, barX, barY, barW, barH, 3);
    ctx.fill();
    // Bar fill - orange during approach, cyan during cleaning
    const barColor = isApproach ? '#FFB74D' : '#00BFFF';
    ctx.fillStyle = barColor;
    ctx.shadowColor = barColor;
    ctx.shadowBlur = 8;
    roundRect(ctx, barX, barY, barW * progress, barH, 3);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Skip hint
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px Segoe UI, sans-serif';
    ctx.fillText('Press SPACE to skip', CANVAS_W / 2, CANVAS_H - 10);

    ctx.restore();
}

function drawOverlay() {
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;
    if (gameState === 'LEVEL_COMPLETE') {
        const r = levelResult || { moves, par: parMoves, bonus: 0, stars: 1, tileScore: cleaned * 10, at: 0 };
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        drawCard(cx - 270, cy - 150, 540, 300, '#4CAF50');
        ctx.textAlign = 'center';

        ctx.fillStyle = '#5CD36A';
        ctx.font = 'bold 40px Segoe UI, sans-serif';
        ctx.fillText('Level Complete!', cx, cy - 105);

        // Stars pop in one after another
        const since = chargerPulse - (r.at || 0);
        for (let i = 0; i < 3; i++) {
            const s = Math.max(0, Math.min(1, (since - i * 14) / 12));
            const scale = s < 1 ? 0.3 + 0.7 * s + 0.35 * Math.sin(s * Math.PI) : 1;
            const earned = i < r.stars;
            ctx.save();
            ctx.globalAlpha = s;
            ctx.translate(cx + (i - 1) * 48, cy - 66);
            ctx.scale(scale, scale);
            ctx.textBaseline = 'middle';
            ctx.font = '40px Segoe UI, sans-serif';
            if (earned) {
                ctx.shadowColor = '#FFD600';
                ctx.shadowBlur = 18 * canvasDpr;
                ctx.fillStyle = '#FFD600';
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.22)';
            }
            ctx.fillText(earned ? '★' : '☆', 0, 0);
            ctx.restore();
        }

        const diff = r.par - r.moves;
        const parText = diff > 0 ? `${diff} under par` : diff < 0 ? `${-diff} over par` : 'exactly par';
        ctx.fillStyle = '#FFF';
        ctx.font = '20px Segoe UI, sans-serif';
        ctx.fillText(`Moves ${r.moves}   ·   Par ${r.par}   ·   ${parText}`, cx, cy - 18);

        ctx.fillStyle = '#DDD';
        ctx.font = '17px Segoe UI, sans-serif';
        ctx.fillText(`Tiles ${r.tileScore}  +  Bonus ${r.bonus}  =  ${score} total`, cx, cy + 12);

        // Upgrade points earned (only new stars pay)
        const earned = r.points | 0;
        const available = progress.points | 0;
        ctx.font = 'bold 15px Segoe UI, sans-serif';
        ctx.fillStyle = earned > 0 ? '#FFD600' : '#999';
        ctx.fillText(
            earned > 0
                ? `+${earned} upgrade point${earned === 1 ? '' : 's'}   ·   ${available} to spend (U)`
                : `No new stars, no upgrade points   ·   ${available} to spend (U)`,
            cx, cy + 40,
        );

        ctx.fillStyle = '#00BFFF';
        ctx.font = '15px Segoe UI, sans-serif';
        ctx.fillText('G: watch the ghost run the par route', cx, cy + 70);

        if (currentLevel < LEVELS.length - 1) {
            ctx.fillStyle = '#A0C4FF';
            ctx.font = '18px Segoe UI, sans-serif';
            ctx.fillText('SPACE or click the board: next level', cx, cy + 100);
        } else {
            ctx.fillStyle = '#FFD600';
            ctx.font = 'bold 24px Segoe UI, sans-serif';
            ctx.fillText('You Win! All levels complete!', cx, cy + 104);
            ctx.font = '15px Segoe UI, sans-serif';
            ctx.fillStyle = '#CCC';
            ctx.fillText('Press R to play again', cx, cy + 130);
        }

        ctx.restore();
    } else if (gameState === 'GAME_OVER') {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        drawCard(cx - 250, cy - 90, 500, 180, '#F44336');

        ctx.fillStyle = '#FF6B5B';
        ctx.font = 'bold 40px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Out of Battery!', cx, cy - 22);

        ctx.fillStyle = '#FFF';
        ctx.font = '18px Segoe UI, sans-serif';
        ctx.fillText('Get back to the dock before it runs out next time.', cx, cy + 18);
        ctx.fillStyle = '#CCC';
        ctx.font = '16px Segoe UI, sans-serif';
        ctx.fillText('Press R or tap Restart', cx, cy + 50);

        ctx.restore();
    }
}

// A dark rounded card with a drop shadow and a coloured accent along the top
function drawCard(x, y, w, h, accent) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 40 * canvasDpr;
    ctx.shadowOffsetY = 12 * canvasDpr;
    ctx.fillStyle = 'rgba(18, 20, 30, 0.94)';
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 16);
    ctx.stroke();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, accent);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x + 24, y, w - 48, 2);
    ctx.restore();
}

// Level-name banner shown for the first few seconds of a level
function drawBanner() {
    if (bannerTimer <= 0 || helpVisible) return;
    const elapsed = BANNER_MS - bannerTimer;
    const alpha = Math.max(0, Math.min(1, elapsed / 250, bannerTimer / 500));
    const cx = CANVAS_W / 2;
    const best = progress.best[currentLevel];
    const extra = [];
    if (currentLevel === 0 && !best) extra.push('Clean every tile  ·  dock before the battery dies  ·  beat par');
    if (best) extra.push(`Your best: ${best.moves} moves  ${'★'.repeat(best.stars)}   ·   Par ${parMoves}`);
    const boxW = 420;
    const boxH = 76 + extra.length * 22;
    const y = 64;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    drawCard(cx - boxW / 2, y, boxW, boxH, '#9ED8CC');
    ctx.fillStyle = '#9ED8CC';
    ctx.font = 'bold 13px Segoe UI, sans-serif';
    ctx.fillText(`LEVEL ${currentLevel + 1} OF ${LEVELS.length}`, cx, y + 26);
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 28px Segoe UI, sans-serif';
    ctx.fillText(bannerText, cx, y + 58);
    ctx.fillStyle = '#CCC';
    ctx.font = '13px Segoe UI, sans-serif';
    extra.forEach((line, i) => ctx.fillText(line, cx, y + 84 + i * 22));
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
        ['Sound', 'M or the Sound button mutes and unmutes.'],
        ['Help', 'H or ? shows this screen. Escape closes it.'],
    ];
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 30px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('How to play', CANVAS_W / 2, 64);
    ctx.textAlign = 'left';
    let y = 94;
    for (const [key, text] of lines) {
        ctx.fillStyle = '#9ED8CC';
        ctx.font = 'bold 13px Segoe UI, sans-serif';
        ctx.fillText(key, 52, y);
        ctx.fillStyle = '#EEE';
        ctx.font = '13px Segoe UI, sans-serif';
        wrapText(text, 150, y, CANVAS_W - 200, 17);
        y += 41;
    }
    ctx.fillStyle = '#AAA';
    ctx.font = '13px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Press H, ? or Escape to close', CANVAS_W / 2, CANVAS_H - 22);
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

function roundRect(ctx, x, y, w, h, r) {
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

// === AMBIENT EFFECTS ===

// Floating dust motes
const dustMotes = [];
for (let i = 0; i < 30; i++) {
    dustMotes.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        size: 0.8 + Math.random() * 2.0,
        speed: 0.06 + Math.random() * 0.18,
        drift: Math.random() * Math.PI * 2,
        alpha: 0.2 + Math.random() * 0.3,
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
        // Soft glowing dust particle
        const dg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.size * 2);
        dg.addColorStop(0, 'rgba(255, 250, 230, 0.9)');
        dg.addColorStop(0.5, 'rgba(255, 245, 210, 0.3)');
        dg.addColorStop(1, 'rgba(255, 240, 200, 0)');
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size * 2, 0, Math.PI * 2);
        ctx.fill();
        // Bright core
        ctx.fillStyle = 'rgba(255, 252, 240, 0.8)';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawBaseboards() {
    const bH = 8;

    // Bottom baseboard - wood molding
    let baseGrad = ctx.createLinearGradient(0, CANVAS_H - bH, 0, CANVAS_H);
    baseGrad.addColorStop(0, '#D4B896');
    baseGrad.addColorStop(0.15, '#C4A882');
    baseGrad.addColorStop(0.5, '#B09068');
    baseGrad.addColorStop(0.85, '#9A7A58');
    baseGrad.addColorStop(1, '#8A6A48');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, CANVAS_H - bH, CANVAS_W, bH);
    // Top edge highlight (light catching the molding)
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(0, CANVAS_H - bH, CANVAS_W, 1.5);
    // Mid groove
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, CANVAS_H - bH + 3, CANVAS_W, 1);
    // Bottom shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, CANVAS_H - 1, CANVAS_W, 1);

    // Top baseboard
    baseGrad = ctx.createLinearGradient(0, 0, 0, bH);
    baseGrad.addColorStop(0, '#8A6A48');
    baseGrad.addColorStop(0.15, '#9A7A58');
    baseGrad.addColorStop(0.5, '#B09068');
    baseGrad.addColorStop(0.85, '#C4A882');
    baseGrad.addColorStop(1, '#D4B896');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, CANVAS_W, bH);
    // Bottom highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, bH - 1.5, CANVAS_W, 1.5);
    // Groove
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, bH - 4, CANVAS_W, 1);
    // Top shadow line
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, CANVAS_W, 1);

    // Left baseboard
    let sideGrad = ctx.createLinearGradient(0, 0, bH, 0);
    sideGrad.addColorStop(0, '#8A6A48');
    sideGrad.addColorStop(0.3, '#9A7A58');
    sideGrad.addColorStop(0.6, '#B09068');
    sideGrad.addColorStop(1, '#C4A882');
    ctx.fillStyle = sideGrad;
    ctx.fillRect(0, 0, bH, CANVAS_H);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bH - 1.5, 0, 1.5, CANVAS_H);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(bH - 4, 0, 1, CANVAS_H);

    // Right baseboard
    sideGrad = ctx.createLinearGradient(CANVAS_W - bH, 0, CANVAS_W, 0);
    sideGrad.addColorStop(0, '#C4A882');
    sideGrad.addColorStop(0.4, '#B09068');
    sideGrad.addColorStop(0.7, '#9A7A58');
    sideGrad.addColorStop(1, '#8A6A48');
    ctx.fillStyle = sideGrad;
    ctx.fillRect(CANVAS_W - bH, 0, bH, CANVAS_H);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(CANVAS_W - bH, 0, 1.5, CANVAS_H);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(CANVAS_W - bH + 3, 0, 1, CANVAS_H);

    // Corner shadows where baseboards meet (darker corners)
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, bH, bH);
    ctx.fillRect(CANVAS_W - bH, 0, bH, bH);
    ctx.fillRect(0, CANVAS_H - bH, bH, bH);
    ctx.fillRect(CANVAS_W - bH, CANVAS_H - bH, bH, bH);
}

function drawRoomVignette() {
    // Corner shadows for depth; the lit corner (top right, by the window) stays brighter
    const cornerSize = 170;

    // Top-left
    let g = ctx.createRadialGradient(0, 0, 0, 0, 0, cornerSize);
    g.addColorStop(0, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cornerSize, cornerSize);

    // Top-right
    g = ctx.createRadialGradient(CANVAS_W, 0, 0, CANVAS_W, 0, cornerSize);
    g.addColorStop(0, 'rgba(0,0,0,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(CANVAS_W - cornerSize, 0, cornerSize, cornerSize);

    // Bottom-left
    g = ctx.createRadialGradient(0, CANVAS_H, 0, 0, CANVAS_H, cornerSize);
    g.addColorStop(0, 'rgba(0,0,0,0.24)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, CANVAS_H - cornerSize, cornerSize, cornerSize);

    // Bottom-right
    g = ctx.createRadialGradient(CANVAS_W, CANVAS_H, 0, CANVAS_W, CANVAS_H, cornerSize);
    g.addColorStop(0, 'rgba(0,0,0,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(CANVAS_W - cornerSize, CANVAS_H - cornerSize, cornerSize, cornerSize);

    // Subtle edge darkening along all sides
    // Top edge
    g = ctx.createLinearGradient(0, 0, 0, 40);
    g.addColorStop(0, 'rgba(0,0,0,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_W, 40);

    // Bottom edge
    g = ctx.createLinearGradient(0, CANVAS_H, 0, CANVAS_H - 40);
    g.addColorStop(0, 'rgba(0,0,0,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, CANVAS_H - 40, CANVAS_W, 40);

    // Left edge
    g = ctx.createLinearGradient(0, 0, 40, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 40, CANVAS_H);

    // Right edge
    g = ctx.createLinearGradient(CANVAS_W, 0, CANVAS_W - 40, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(CANVAS_W - 40, 0, 40, CANVAS_H);
}

// Sunlight beam effect from top-right corner (like window light)
function drawSunlight() {
    ctx.save();

    // Main warm light patch on floor
    ctx.globalCompositeOperation = 'overlay';
    const sunGrad = ctx.createRadialGradient(CANVAS_W - 80, 50, 0, CANVAS_W - 80, 50, 350);
    sunGrad.addColorStop(0, 'rgba(255, 235, 180, 0.2)');
    sunGrad.addColorStop(0.3, 'rgba(255, 230, 170, 0.1)');
    sunGrad.addColorStop(0.6, 'rgba(255, 225, 160, 0.04)');
    sunGrad.addColorStop(1, 'rgba(255, 220, 150, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Diagonal light streak (like light through blinds)
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = '#FFF8E0';
    for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.translate(CANVAS_W - 100 - i * 80, -20);
        ctx.rotate(0.6);
        ctx.fillRect(0, 0, 25, CANVAS_H * 1.5);
        ctx.restore();
    }

    ctx.restore();
}
