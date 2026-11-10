// The home screen icon, drawn in code so it can be redrawn at any size.
// Not loaded by the game. Open scripts/make-icons.html through the dev server
// to see every size and save the PNGs into icons/.
//
// kind: 'any'      rounded tile with clear corners (browser tabs, desktop)
//       'maskable' full square, art kept inside the middle 80% (Android crops the rest)
//       'apple'    full square, no clear pixels (iOS rounds the corners itself)
function drawAppIcon(ctx, size, kind) {
    const u = size / 512;
    ctx.save();
    ctx.scale(u, u);
    ctx.clearRect(0, 0, 512, 512);

    if (kind === 'any') {
        const rad = 112;
        ctx.beginPath();
        ctx.moveTo(rad, 0);
        ctx.arcTo(512, 0, 512, 512, rad);
        ctx.arcTo(512, 512, 0, 512, rad);
        ctx.arcTo(0, 512, 0, 0, rad);
        ctx.arcTo(0, 0, 512, 0, rad);
        ctx.closePath();
        ctx.clip();
    }

    // wall-teal ground, brighter where the lamp would be
    const ground = ctx.createRadialGradient(200, 170, 20, 256, 256, 400);
    ground.addColorStop(0, '#34A69C');
    ground.addColorStop(0.45, '#237E78');
    ground.addColorStop(1, '#123F3C');
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, 512, 512);

    // everything else shrinks for the maskable icon so no launcher crops it
    if (kind === 'maskable') {
        ctx.translate(256, 256);
        ctx.scale(0.8, 0.8);
        ctx.translate(-256, -256);
    }

    const cx = 262, cy = 276, R = 166;
    const heading = -Math.PI / 4; // driving up and to the right

    // the stripe it has already cleaned, coming in from the bottom left
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(heading);
    const stripe = ctx.createLinearGradient(0, -R * 0.82, 0, R * 0.82);
    stripe.addColorStop(0, 'rgba(255,255,255,0)');
    stripe.addColorStop(0.12, 'rgba(255,255,255,0.16)');
    stripe.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    stripe.addColorStop(0.88, 'rgba(255,255,255,0.16)');
    stripe.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = stripe;
    ctx.fillRect(-520, -R * 0.82, 520, R * 1.64);
    ctx.restore();

    iconStarburst(ctx, 408, 104, 58, '#F0BD55', 10);
    iconStarburst(ctx, 92, 398, 34, '#F2E8D5', 7);

    ctx.save();
    ctx.translate(cx, cy);

    // soft shadow on the floor
    const shade = ctx.createRadialGradient(14, 22, R * 0.6, 14, 22, R * 1.16);
    shade.addColorStop(0, 'rgba(0,0,0,0.5)');
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(14, 22, R * 1.16, 0, Math.PI * 2);
    ctx.fill();

    // hood: dark lacquer, as in the game
    const hood = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.05, 0, 0, R);
    hood.addColorStop(0, '#56585B');
    hood.addColorStop(0.35, '#2C2D30');
    hood.addColorStop(0.8, '#1C1C1D');
    hood.addColorStop(1, '#0E0E0F');
    ctx.fillStyle = hood;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();

    // chrome bumper
    const rim = ctx.createLinearGradient(-R, -R, R, R);
    rim.addColorStop(0, '#FFFFFF');
    rim.addColorStop(0.35, '#AEB4B9');
    rim.addColorStop(0.55, '#F2F4F6');
    rim.addColorStop(0.8, '#80878D');
    rim.addColorStop(1, '#D0D4D8');
    ctx.strokeStyle = rim;
    ctx.lineWidth = R * 0.14;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.93, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = R * 0.03;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.85, 0, Math.PI * 2);
    ctx.stroke();

    // sensor windows in the bumper, up front
    ctx.fillStyle = 'rgba(15,15,15,0.8)';
    for (let i = -2; i <= 2; i++) {
        const a = heading + i * 0.2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * R * 0.93, Math.sin(a) * R * 0.93, R * 0.038, 0, Math.PI * 2);
        ctx.fill();
    }

    // ring light
    ctx.save();
    ctx.shadowColor = '#3FE0CC';
    ctx.shadowBlur = R * 0.22 * u;
    ctx.strokeStyle = '#4FE3D0';
    ctx.lineWidth = R * 0.1;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // inner plate and the wedge that shows which way it faces
    const plate = ctx.createRadialGradient(-R * 0.15, -R * 0.15, 0, 0, 0, R * 0.64);
    plate.addColorStop(0, '#3E4043');
    plate.addColorStop(1, '#222325');
    ctx.fillStyle = plate;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.635, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(79,227,208,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.62, heading - 0.42, heading + 0.42);
    ctx.lineTo(Math.cos(heading) * R * 0.2, Math.sin(heading) * R * 0.2);
    ctx.closePath();
    ctx.fill();

    // tail fin and tail light at the back
    ctx.save();
    ctx.rotate(heading);
    ctx.fillStyle = '#E6E6E6';
    ctx.beginPath();
    ctx.moveTo(-R * 0.84, 0);
    ctx.lineTo(-R * 0.5, -R * 0.085);
    ctx.lineTo(-R * 0.5, R * 0.085);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FF5A48';
    ctx.beginPath();
    ctx.arc(-R * 0.93, 0, R * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // clearcoat sheen across the top of the hood
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = R * 0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.47, Math.PI * 1.08, Math.PI * 1.42);
    ctx.stroke();

    ctx.restore();
    ctx.restore();
}

// An atomic-age starburst: long and short rays with a bead on each long one.
function iconStarburst(ctx, x, y, r, color, width) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const len = i % 2 ? r * 0.55 : r;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        ctx.stroke();
        if (i % 2 === 0) {
            ctx.beginPath();
            ctx.arc(Math.cos(a) * len, Math.sin(a) * len, width * 0.95, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.beginPath();
    ctx.arc(0, 0, width * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// The files the game ships: [file name, pixel size, kind].
const APP_ICON_FILES = [
    ['icon-192.png', 192, 'any'],
    ['icon-512.png', 512, 'any'],
    ['icon-maskable-512.png', 512, 'maskable'],
    ['apple-touch-icon.png', 180, 'apple'],
];
