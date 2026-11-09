// The HUD over the GPU-rendered first-person view: hairline type, no boxes, and it fades away
// after a few seconds without input so the room can be looked at. Draws on the board canvas.

const HUD_FONT = '"Futura", "Avenir Next", "Century Gothic", "Gill Sans", "Segoe UI", sans-serif';
const HUD_IDLE_SECONDS = 3.2;
let hud3dAlpha = 1;

function hudText(text, x, y, size, color, align, weight, spacing) {
    ctx.font = `${weight || '500'} ${size}px ${HUD_FONT}`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    if (spacing !== undefined && 'letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function fpDrawHudGl(view) {
    const idle = (performance.now() - (lastInputAt || 0)) / 1000;
    const busy = gameState !== 'PLAYING' || view.ghost || isLowBattery();
    const target = busy || idle < HUD_IDLE_SECONDS ? 1 : 0;
    hud3dAlpha += (target - hud3dAlpha) * easeK(0.07);
    const alpha = Math.max(0, Math.min(1, hud3dAlpha));

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;

    // Compass: a hairline with ticks every 15 degrees; always at least faintly there
    ctx.globalAlpha = 0.25 + 0.75 * alpha;
    const cx = CANVAS_W / 2, cy = 24, half = 130, span = 1.15;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - half, cy + 10);
    ctx.lineTo(cx + half, cy + 10);
    ctx.stroke();
    for (let deg = 0; deg < 360; deg += 15) {
        let off = (deg * Math.PI) / 180 - view.angle - Math.PI / 2;
        while (off > Math.PI) off -= 2 * Math.PI;
        while (off < -Math.PI) off += 2 * Math.PI;
        if (Math.abs(off) > span) continue;
        const px = cx + (off / span) * half;
        const major = deg % 90 === 0;
        ctx.globalAlpha = (0.25 + 0.75 * alpha) * (1 - (Math.abs(off) / span) * 0.8);
        ctx.beginPath();
        ctx.moveTo(px, cy + 10);
        ctx.lineTo(px, cy + (major ? 2 : 6));
        ctx.stroke();
        if (major) hudText('NESW'[(deg / 90) % 4], px, cy - 6, Math.abs(off) < 0.12 ? 14 : 11, Math.abs(off) < 0.12 ? '#9ED8CC' : '#FFFFFF', 'center', '600', 1);
    }
    ctx.globalAlpha = 0.25 + 0.75 * alpha;
    ctx.fillStyle = '#9ED8CC';
    ctx.beginPath();
    ctx.moveTo(cx, cy + 12);
    ctx.lineTo(cx - 4, cy + 18);
    ctx.lineTo(cx + 4, cy + 18);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = alpha;
    if (alpha > 0.01) {
        // Status, top left
        const left = totalDirty - cleaned;
        const dockDist = chargerDistGrid ? chargerDistGrid[roomba.row][roomba.col] : -1;
        const cost = moveCost();
        const needsDock = dockDist > 0 && roomba.battery <= (dockDist + 2) * cost;
        hudText(`${left} TILE${left === 1 ? '' : 'S'} LEFT`, 18, 22, 12, '#FFFFFF', 'left', '600', 2);
        const dockText = dockDist < 0 ? 'DOCK UNREACHABLE' : dockDist === 0 ? 'ON THE DOCK' : `DOCK ${dockDist} MOVE${dockDist === 1 ? '' : 'S'}${needsDock ? '  ·  HEAD BACK' : ''}`;
        hudText(dockText, 18, 40, 10.5, needsDock ? '#FF8A7A' : 'rgba(210,232,255,0.9)', 'left', '500', 1.5);
        if (design.flashOn) {
            const [fr, fg, fb] = design.flashRgb;
            ctx.save();
            ctx.shadowColor = `rgb(${fr},${fg},${fb})`;
            ctx.shadowBlur = 10;
            ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
            ctx.beginPath();
            ctx.arc(18 + 4, 58, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            hudText('FLASHLIGHT', 30, 58, 9.5, 'rgba(255,255,255,0.8)', 'left', '500', 1.5);
        }

        // Battery, top right: a hairline bar and the number
        const max = batteryMax();
        const bw = 120, bx = CANVAS_W - bw - 18, by = 20;
        const pct = Math.min(1, roomba.battery / max);
        let color = pct > 0.5 ? '#7BDB8A' : pct > 0.2 ? '#FFD36B' : '#FF6B5B';
        if (roomba.battery > max + 0.5) color = '#8FD3FF';
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(bx, by, bw, 3);
        if (isLowBattery()) ctx.globalAlpha = alpha * (0.6 + 0.4 * Math.sin(chargerPulse * 0.25));
        ctx.fillStyle = color;
        ctx.fillRect(bx, by, Math.max(3, bw * pct), 3);
        ctx.globalAlpha = alpha;
        hudText(`BATTERY ${Math.round(roomba.battery)} / ${max}`, bx + bw, 38, 10.5, color, 'right', '600', 1.5);

        // Minimap, bottom left, small and quiet
        const s = 6.5;
        const mapW = COLS * s, mapH = ROWS * s;
        const mx = 18, my = CANVAS_H - mapH - 18;
        const g = view.grid;
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha * 0.82;
        ctx.fillStyle = 'rgba(10,12,16,0.45)';
        roundRect(ctx, mx - 5, my - 5, mapW + 10, mapH + 10, 6);
        ctx.fill();
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const cell = g[r][c];
                if (cell === OBSTACLE) ctx.fillStyle = 'rgba(255,255,255,0.55)';
                else if (cell === CLEAN) ctx.fillStyle = 'rgba(158,216,204,0.75)';
                else if (cell === CHARGER) ctx.fillStyle = 'rgba(96,160,255,0.95)';
                else ctx.fillStyle = 'rgba(255,255,255,0.14)';
                ctx.fillRect(mx + c * s, my + r * s, s - 0.8, s - 0.8);
            }
        }
        const px = mx + view.camX * s, py = my + view.camY * s;
        ctx.fillStyle = 'rgba(255,255,200,0.16)';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(view.angle - FP_FOV / 2) * 22, py + Math.sin(view.angle - FP_FOV / 2) * 22);
        ctx.lineTo(px + Math.cos(view.angle + FP_FOV / 2) * 22, py + Math.sin(view.angle + FP_FOV / 2) * 22);
        ctx.closePath();
        ctx.fill();
        if (view.best) {
            ctx.fillStyle = '#D9A441';
            ctx.beginPath();
            ctx.arc(mx + view.best.x * s, my + view.best.y * s, 2.2, 0, Math.PI * 2);
            ctx.fill();
        }
        const dot = view.ghost ? '#00BFFF' : design.lightColor;
        ctx.fillStyle = dot;
        ctx.beginPath();
        ctx.arc(px, py, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = dot;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(view.angle) * 7, py + Math.sin(view.angle) * 7);
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();

    // Low battery: the edges pulse red whatever the HUD is doing
    if (isLowBattery() && gameState === 'PLAYING') {
        ctx.save();
        ctx.globalAlpha = 0.16 + 0.1 * Math.sin(chargerPulse * 0.25);
        const vg = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.35, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.75);
        vg.addColorStop(0, 'rgba(255,0,0,0)');
        vg.addColorStop(1, 'rgba(255,40,40,0.8)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.restore();
    }
}
