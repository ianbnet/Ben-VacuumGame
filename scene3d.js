// Scene description for the GPU renderer (render3d-gl.js): a 1950s atomic-age take on the
// six rooms. Themes, furniture built from simple parts, the room's architecture and its
// decor are all plain data here, with no DOM or WebGL, so the tests can check them.
//
// Units: one tile is one unit (about half a metre); x runs along columns, z along rows and y
// is up. Each piece of furniture is described in its own local space, centred on its
// footprint with its back towards -z, then placed with a yaw so the back faces the nearest
// wall.

const S3_WALL_H = 4.8;          // 2.4 m of wall
const S3_EYE = 0.28;            // the camera sits 14 cm up, on top of the vacuum
const S3_WALL_T = 0.35;         // wall thickness
const S3_WINDOW = { x0: 10.75, x1: 14.25, sill: 1.5, top: 4.1 }; // on the north wall (z = 0)
const S3_LAMP = { x: 7.5, z: 6 };

// Material presets. Colours are hex; the renderer maps the rest onto MeshPhysicalMaterial.
function s3Mat(kind, color) {
    switch (kind) {
        case 'walnut': return { color: color || '#5A3A25', roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3 };
        case 'teak': return { color: color || '#8B5A2B', roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 };
        case 'brass': return { color: color || '#C9A227', roughness: 0.32, metalness: 1 };
        case 'chrome': return { color: color || '#E6E6E6', roughness: 0.14, metalness: 1 };
        case 'steel': return { color: color || '#2B2B2B', roughness: 0.45, metalness: 0.85 };
        case 'fabric': return { color: color || '#D9A441', roughness: 0.95, metalness: 0, sheen: 0.7, sheenRoughness: 0.6, sheenColor: '#FFFFFF' };
        case 'vinyl': return { color: color || '#2A9D8F', roughness: 0.35, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 };
        case 'shell': return { color: color || '#E76F51', roughness: 0.38, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.35 };
        case 'ceramic': return { color: color || '#EFE3C8', roughness: 0.25, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.15 };
        case 'plaster': return { color: color || '#F1E6D0', roughness: 0.92, metalness: 0 };
        case 'paint': return { color: color || '#237E78', roughness: 0.6, metalness: 0 };
        case 'leaf': return { color: color || '#3F7D53', roughness: 0.62, metalness: 0, side: 2 };
        case 'soil': return { color: color || '#2E1F16', roughness: 1, metalness: 0 };
        case 'fur': return { color: color || '#8A8A8A', roughness: 1, metalness: 0, sheen: 0.4, sheenColor: '#FFFFFF' };
        case 'glass': return { color: color || '#CFE8F0', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, side: 2 };
        case 'emissive': return { color: color || '#FFFFFF', emissive: color || '#FFFFFF', emissiveIntensity: 2.5, roughness: 0.4, metalness: 0 };
        case 'concrete': return { color: color || '#BDBDB8', roughness: 0.95, metalness: 0 };
        case 'formica': return { color: color || '#9FD8CF', roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 };
        case 'rubber': return { color: color || '#1A1A1A', roughness: 0.9, metalness: 0 };
        default: return { color: color || '#888888', roughness: 0.7, metalness: 0 };
    }
}

// One theme per room: time of day, palette, floor and wall styles, what is outside the window
const S3_THEMES = [
    {
        name: 'Atomic Lounge', time: 'morning',
        sun: { azimuth: -28, elevation: 42, color: '#FFF1DA', intensity: 3.4 },
        sky: { zenith: '#5EA9DA', horizon: '#F4E2C4', ground: '#9FB27A' },
        ambient: 0.5, lamp: { on: false, color: '#FFD9A0', intensity: 0 },
        walls: '#F1E6D0', accent: { wall: 'west', color: '#237E78' }, trim: '#FBF7EE', ceiling: '#F7F2E8',
        floor: 'wood', floorSeed: 4242, wallStyle: 'partition',
        couch: '#D9A441', pillow: '#237E78', couchWood: '#5A3A25', chair: '#E76F51', table: '#5A3A25',
        leaf: '#3F7D53', planter: '#EFE3C8', petbed: '#E9C46A', cat: '#9A9A9A',
        door: { wall: 'south', at: 3.5, color: '#237E78' }, outside: 'suburb', prints: ['boomerang', 'starburst'],
    },
    {
        name: 'Rocket Nursery', time: 'golden hour',
        sun: { azimuth: 38, elevation: 13, color: '#FFBE78', intensity: 3.0 },
        sky: { zenith: '#6F86B8', horizon: '#F6B98A', ground: '#8F8A62' },
        ambient: 0.42, lamp: { on: true, color: '#FFD2A0', intensity: 10 },
        walls: '#D4DCC6', accent: { wall: 'east', color: '#E8A598' }, trim: '#F6F3EA', ceiling: '#F3F1EA',
        floor: 'wood', floorSeed: 7, wallStyle: 'partition',
        couch: '#2A9D8F', pillow: '#F4A261', couchWood: '#8B5A2B', chair: '#8ED1C0', table: '#8B5A2B',
        leaf: '#4F8A5B', planter: '#F4A261', petbed: '#E57373', cat: '#D98E4A',
        door: { wall: 'west', at: 6, color: '#F4A261' }, outside: 'suburb', prints: ['rocket', 'atoms'],
    },
    {
        name: 'Chrome Diner', time: 'noon',
        sun: { azimuth: -8, elevation: 58, color: '#FFFBF2', intensity: 3.6 },
        sky: { zenith: '#4C9BD8', horizon: '#EAF2F7', ground: '#B9B59A' },
        ambient: 0.55, lamp: { on: false, color: '#FFFFFF', intensity: 0 },
        walls: '#F5F2EA', accent: { wall: 'south', color: '#C8413B' }, trim: '#FFFFFF', ceiling: '#F7F7F2',
        floor: 'lino', floorSeed: 11, wallStyle: 'counter',
        couch: '#2A9D8F', pillow: '#C8413B', couchWood: '#D9D9D9', chair: '#C8413B', table: '#D9D9D9',
        leaf: '#3F7D53', planter: '#F5F2EA', petbed: '#8ED1C0', cat: '#2B2B2B',
        door: { wall: 'west', at: 6, color: '#8ED1C0' }, outside: 'suburb', prints: ['starburst', 'boomerang'],
    },
    {
        name: 'Mission Control', time: 'afternoon',
        sun: { azimuth: -52, elevation: 27, color: '#FFE3B8', intensity: 2.6 },
        sky: { zenith: '#6FA3CF', horizon: '#F1DBB8', ground: '#8A8F6A' },
        ambient: 0.6, lamp: { on: true, color: '#FFE2B8', intensity: 12 },
        walls: '#D9D2B4', accent: { wall: 'west', color: '#6B4A2B' }, trim: '#EFE9D8', ceiling: '#F1EEE4',
        floor: 'wood', floorSeed: 99, wallStyle: 'partition',
        couch: '#6B7A3A', pillow: '#D9A441', couchWood: '#3E2A1E', chair: '#2B2B2B', table: '#3E2A1E',
        leaf: '#3F7D53', planter: '#2B2B2B', petbed: '#6B7A3A', cat: '#E8E2D4',
        door: { wall: 'south', at: 10.5, color: '#6B4A2B' }, outside: 'launchpad', prints: ['atoms', 'rocket'],
    },
    {
        name: 'Hangar 51', time: 'dusk',
        sun: { azimuth: 62, elevation: 7, color: '#FF9A5C', intensity: 2.4 },
        sky: { zenith: '#3B4A7A', horizon: '#FF9D6C', ground: '#5A5A52' },
        ambient: 0.5, lamp: { on: true, color: '#D8E8FF', intensity: 18 },
        walls: '#B9BCBE', accent: { wall: 'east', color: '#8E9AA3' }, trim: '#9A9EA2', ceiling: '#A9ACAE',
        floor: 'concrete', floorSeed: 5, wallStyle: 'crate',
        couch: '#6B7A3A', pillow: '#D9A441', couchWood: '#3E2A1E', chair: '#B9BCBE', table: '#4A4A4A',
        leaf: '#3F7D53', planter: '#8E9AA3', petbed: '#8E9AA3', cat: '#4A4A4A',
        door: { wall: 'west', at: 6, color: '#C8413B' }, outside: 'launchpad', prints: ['rocket', 'rocket'],
    },
    {
        name: 'Night Lab', time: 'night',
        sun: { azimuth: 18, elevation: 34, color: '#9FB7FF', intensity: 1.4 },
        sky: { zenith: '#0B1430', horizon: '#2A3A6A', ground: '#1A2030' },
        ambient: 0.32, lamp: { on: true, color: '#7FE0D8', intensity: 20 },
        walls: '#243F49', accent: { wall: 'south', color: '#D14D9A' }, trim: '#3A5A64', ceiling: '#1F3038',
        floor: 'wood', floorSeed: 606, wallStyle: 'neon',
        couch: '#D14D9A', pillow: '#7FE0D8', couchWood: '#1E1E1E', chair: '#7FE0D8', table: '#1E1E1E',
        leaf: '#2E6B45', planter: '#1E1E1E', petbed: '#3A5A64', cat: '#1E1E1E',
        door: { wall: 'west', at: 6, color: '#7FE0D8' }, outside: 'night', prints: ['atoms', 'starburst'],
    },
];

// The theme for a level: its own choice when it has one (extra rooms do), else by position
function s3Theme(levelIndex) {
    const lv = typeof LEVELS !== 'undefined' ? LEVELS[levelIndex] : null;
    const n = lv && Number.isInteger(lv.theme) ? lv.theme : levelIndex;
    return S3_THEMES[((n % S3_THEMES.length) + S3_THEMES.length) % S3_THEMES.length];
}

// Direction from a footprint to its nearest wall: where a couch or chair puts its back.
// A long piece keeps its back along its long side, so a sofa never backs onto a wall end-on.
function s3Facing(obs) {
    let d = [
        ['north', obs.row], ['south', ROWS - (obs.row + obs.h)],
        ['west', obs.col], ['east', COLS - (obs.col + obs.w)],
    ];
    if (obs.w > obs.h) d = d.slice(0, 2);
    else if (obs.h > obs.w) d = d.slice(2);
    d.sort((a, b) => a[1] - b[1]);
    return d[0][0];
}

const S3_YAW = { north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 };

function s3Rand(seed) {
    return seededRandom(seed);
}

// --- Furniture, each in local space: centred, back towards -z, footprint lw x ld --------------

function s3Couch(lw, ld, th) {
    const P = [];
    const wood = s3Mat('walnut', th.couchWood);
    const fab = s3Mat('fabric', th.couch);
    const pillow = s3Mat('fabric', th.pillow);
    const legH = 0.42;
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            const x = sx * (lw / 2 - 0.22), z = sz * (ld / 2 - 0.16);
            P.push({ shape: 'cyl', pos: [x, legH / 2, z], rTop: 0.045, rBot: 0.028, h: legH, rot: [sz * 0.12, 0, -sx * 0.12], mat: wood });
            P.push({ shape: 'cyl', pos: [x + sx * 0.02, 0.03, z + sz * 0.015], rTop: 0.03, rBot: 0.032, h: 0.06, mat: s3Mat('brass') });
        }
    }
    const baseY = legH;
    P.push({ shape: 'box', pos: [0, baseY + 0.12, 0], size: [lw - 0.1, 0.24, ld - 0.1], bevel: 0.03, mat: wood });
    const n = Math.max(1, Math.round(lw));
    const inner = lw - 0.32;
    const cw = inner / n;
    for (let i = 0; i < n; i++) {
        const x = -inner / 2 + cw * (i + 0.5);
        P.push({ shape: 'box', pos: [x, baseY + 0.24 + 0.15, 0.08], size: [cw - 0.04, 0.3, ld - 0.4], bevel: 0.1, mat: fab });
        P.push({ shape: 'box', pos: [x, baseY + 0.24 + 0.56, -ld / 2 + 0.22], size: [cw - 0.04, 0.82, 0.26], bevel: 0.1, rot: [-0.12, 0, 0], mat: fab });
        for (const by of [0.42, 0.7]) {
            for (const bx of [-0.25, 0.25]) {
                P.push({ shape: 'sphere', pos: [x + bx * (cw - 0.1), baseY + 0.24 + by, -ld / 2 + 0.22 + 0.13 - (by - 0.56) * 0.12], r: 0.025, mat: s3Mat('fabric', th.couchWood) });
            }
        }
    }
    for (const sx of [-1, 1]) {
        P.push({ shape: 'box', pos: [sx * (lw / 2 - 0.09), baseY + 0.24 + 0.28, 0], size: [0.16, 0.58, ld - 0.14], bevel: 0.06, mat: wood });
    }
    P.push({ shape: 'box', pos: [lw / 2 - 0.5, baseY + 0.24 + 0.5, -ld / 2 + 0.46], size: [0.42, 0.42, 0.14], bevel: 0.08, rot: [-0.22, 0, 0.3], mat: pillow });
    return P;
}

// Kidney-shaped coffee table on three splayed legs with brass ferrules
function s3TableOutline(lw, ld) {
    const pts = [];
    const n = 56;
    for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const x = Math.cos(t) * (lw / 2 - 0.1);
        const z = Math.sin(t) * (ld / 2 - 0.26) + Math.cos(2 * t) * 0.2 - 0.08;
        pts.push([x, z]);
    }
    return pts;
}

function s3Table(lw, ld, th) {
    const P = [];
    const wood = s3Mat('walnut', th.table);
    const topY = 0.95, topT = 0.07;
    P.push({ shape: 'extrude', pos: [0, topY - topT, 0], points: s3TableOutline(lw, ld), depth: topT, bevel: 0.015, mat: wood });
    for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
        const r = Math.min(lw, ld) / 2 - 0.42;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const h = topY - topT;
        P.push({ shape: 'cyl', pos: [x * 1.12, h / 2, z * 1.12], rTop: 0.05, rBot: 0.028, h, rot: [Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1], mat: wood });
        P.push({ shape: 'cyl', pos: [x * 1.24, 0.03, z * 1.24], rTop: 0.03, rBot: 0.032, h: 0.06, mat: s3Mat('brass') });
    }
    return P;
}

// Moulded shell chair on a wire base
function s3Chair(lw, ld, th) {
    const P = [];
    const shell = s3Mat('shell', th.chair);
    const wire = s3Mat('steel', '#333333');
    const seatY = 0.9;
    P.push({ shape: 'box', pos: [0, seatY, 0.02], size: [0.66, 0.05, 0.62], bevel: 0.025, mat: shell });
    P.push({ shape: 'cyl', pos: [0, seatY + 0.36, -0.1], rTop: 0.34, rBot: 0.34, h: 0.68, open: true, thetaStart: Math.PI - 0.42 * Math.PI, thetaLength: 0.84 * Math.PI, rot: [-0.2, 0, 0], mat: shell });
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            P.push({ shape: 'rod', from: [sx * 0.2, seatY - 0.03, sz * 0.18 + 0.02], to: [sx * 0.31, 0, sz * 0.3], r: 0.014, mat: wire });
        }
        P.push({ shape: 'rod', from: [sx * 0.31, 0.3, -0.3], to: [sx * 0.31, 0.3, 0.3], r: 0.01, mat: wire });
    }
    P.push({ shape: 'rod', from: [-0.31, 0.3, 0], to: [0.31, 0.3, 0], r: 0.01, mat: wire });
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            P.push({ shape: 'sphere', pos: [sx * 0.31, 0.02, sz * 0.3], r: 0.025, mat: s3Mat('rubber') });
        }
    }
    return P;
}

// A snake plant in a bullet planter on three legs
function s3Plant(lw, ld, th, seed) {
    const P = [];
    const rnd = s3Rand(seed || 1);
    const planter = s3Mat('ceramic', th.planter);
    const legs = s3Mat('steel', '#1E1E1E');
    const standH = 0.55;
    for (let i = 0; i < 3; i++) {
        const a = Math.PI / 6 + (i * Math.PI * 2) / 3;
        P.push({ shape: 'rod', from: [Math.cos(a) * 0.14, standH, Math.sin(a) * 0.14], to: [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], r: 0.014, mat: legs });
    }
    P.push({ shape: 'cyl', pos: [0, standH + 0.3, 0], rTop: 0.31, rBot: 0.12, h: 0.6, mat: planter });
    P.push({ shape: 'cyl', pos: [0, standH + 0.6, 0], rTop: 0.33, rBot: 0.31, h: 0.03, mat: planter });
    P.push({ shape: 'cyl', pos: [0, standH + 0.585, 0], rTop: 0.28, rBot: 0.28, h: 0.02, mat: s3Mat('soil') });
    const greens = [th.leaf, s3Shade(th.leaf, 0.85), s3Shade(th.leaf, 1.15), s3Shade(th.leaf, 0.72)];
    for (let i = 0; i < 11; i++) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * 0.17;
        const h = 1.1 + rnd() * 1.1;
        const tilt = 0.06 + rnd() * 0.16;
        P.push({
            shape: 'box', pos: [Math.cos(a) * r, standH + 0.6 + h / 2 - 0.05, Math.sin(a) * r],
            size: [0.13 + rnd() * 0.05, h, 0.022], bevel: 0.01, taper: 0.25,
            rot: [Math.sin(a) * tilt, rnd() * Math.PI, -Math.cos(a) * tilt],
            mat: s3Mat('leaf', greens[i % greens.length]),
        });
    }
    return P;
}

// An oval pet bed with a sleeping cat in it
function s3PetBed(lw, ld, th) {
    const P = [];
    const sx = lw * 0.92, sz = ld * 0.9;
    P.push({ shape: 'cyl', pos: [0, 0.1, 0], rTop: 0.5, rBot: 0.46, h: 0.2, scale: [sx, 1, sz], mat: s3Mat('fabric', th.petbed) });
    P.push({ shape: 'torus', pos: [0, 0.22, 0], r: 0.46, tube: 0.085, scale: [sx, sz, 1], rot: [Math.PI / 2, 0, 0], mat: s3Mat('fabric', th.petbed) });
    P.push({ shape: 'cyl', pos: [0, 0.21, 0], rTop: 0.4, rBot: 0.4, h: 0.04, scale: [sx, 1, sz], mat: s3Mat('fabric', '#F2E8D5') });
    const fur = s3Mat('fur', th.cat);
    P.push({ shape: 'sphere', pos: [-0.05, 0.42, 0], r: 0.25, scale: [1.5, 0.82, 1.05], mat: fur, tag: 'cat' });
    P.push({ shape: 'sphere', pos: [0.38, 0.5, 0.06], r: 0.15, scale: [1, 0.9, 0.95], mat: fur, tag: 'catHead' });
    P.push({ shape: 'cyl', pos: [0.42, 0.64, -0.01], rTop: 0, rBot: 0.045, h: 0.1, rot: [0, 0, -0.2], mat: fur });
    P.push({ shape: 'cyl', pos: [0.42, 0.64, 0.13], rTop: 0, rBot: 0.045, h: 0.1, rot: [0, 0, -0.2], mat: fur });
    P.push({ shape: 'torus', pos: [-0.42, 0.3, 0.1], r: 0.2, tube: 0.032, arc: Math.PI, rot: [Math.PI / 2, 0, Math.PI * 0.75], mat: fur });
    return P;
}

// Interior "walls": partitions, kitchen counters, crates or neon panels depending on the room
function s3WallParts(obs, th) {
    const P = [];
    const lw = obs.w, ld = obs.h;
    switch (th.wallStyle) {
        case 'counter': {
            P.push({ shape: 'box', pos: [0, 0.9, 0], size: [lw - 0.04, 1.8, ld - 0.04], bevel: 0.01, mat: s3Mat('paint', '#F5F2EA') });
            P.push({ shape: 'box', pos: [0, 1.84, 0], size: [lw + 0.06, 0.08, ld + 0.06], bevel: 0.02, mat: s3Mat('formica', '#9FD8CF') });
            P.push({ shape: 'box', pos: [0, 1.84, 0], size: [lw + 0.1, 0.05, ld + 0.1], bevel: 0.02, mat: s3Mat('chrome') });
            P.push({ shape: 'box', pos: [0, 0.06, 0], size: [lw - 0.16, 0.12, ld - 0.16], mat: s3Mat('rubber', '#2B2B2B') });
            for (const side of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
                const along = side[0] ? ld : lw;
                for (let i = 0; i < Math.round(along); i++) {
                    const a = -along / 2 + i + 0.5;
                    const pos = side[0] ? [side[0] * (lw / 2 - 0.01), 1.0, a] : [a, 1.0, side[1] * (ld / 2 - 0.01)];
                    P.push({ shape: 'box', pos, size: side[0] ? [0.02, 1.3, 0.86] : [0.86, 1.3, 0.02], mat: s3Mat('paint', '#E9E4D8') });
                    const hpos = side[0] ? [side[0] * (lw / 2 + 0.01), 1.45, a + 0.3] : [a + 0.3, 1.45, side[1] * (ld / 2 + 0.01)];
                    P.push({ shape: 'box', pos: hpos, size: side[0] ? [0.03, 0.03, 0.18] : [0.18, 0.03, 0.03], mat: s3Mat('chrome') });
                }
            }
            break;
        }
        case 'crate': {
            const rnd = s3Rand(obs.col * 31 + obs.row * 7 + 3);
            let y = 0;
            const heights = [1.15, 1.0, 0.8];
            for (let k = 0; k < 3; k++) {
                const h = heights[k];
                const shrink = 0.06 + k * 0.05;
                P.push({ shape: 'box', pos: [(rnd() - 0.5) * 0.08, y + h / 2, (rnd() - 0.5) * 0.08], size: [lw - shrink, h, ld - shrink], bevel: 0.015, rot: [0, (rnd() - 0.5) * 0.12, 0], mat: s3Mat('teak', k === 1 ? '#7A5A3A' : '#8B6B45'), tag: 'crate' });
                y += h;
            }
            break;
        }
        case 'neon': {
            P.push({ shape: 'box', pos: [0, S3_WALL_H / 2, 0], size: [lw, S3_WALL_H, ld], mat: s3Mat('paint', '#13232A') });
            for (const yy of [1.2, 3.2]) {
                P.push({ shape: 'box', pos: [0, yy, 0], size: [lw + 0.02, 0.05, ld + 0.02], mat: s3Mat('emissive', yy > 2 ? '#7FE0D8' : '#D14D9A'), tag: 'neon' });
            }
            break;
        }
        default:
            P.push({ shape: 'box', pos: [0, S3_WALL_H / 2, 0], size: [lw, S3_WALL_H, ld], mat: s3Mat('plaster', th.accent.color), texture: 'breeze' });
    }
    return P;
}

function s3Shade(hex, k) {
    const rgb = hexToRgb(hex) || [128, 128, 128];
    return rgbToHex(...rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))));
}

// Every obstacle of a level as placed furniture groups: { pos, yaw, parts }
function s3Furniture(levelIndex) {
    const th = s3Theme(levelIndex);
    const out = [];
    const level = LEVELS[levelIndex];
    level.obstacles.forEach((obs, i) => {
        const facing = s3Facing(obs);
        const yaw = S3_YAW[facing];
        const swap = facing === 'east' || facing === 'west';
        const lw = swap ? obs.h : obs.w, ld = swap ? obs.w : obs.h;
        let parts;
        switch (obs.type) {
            case 'couch': parts = s3Couch(lw, ld, th); break;
            case 'table': parts = s3Table(lw, ld, th); break;
            case 'chair': parts = s3Chair(lw, ld, th); break;
            case 'plant': parts = s3Plant(lw, ld, th, levelIndex * 17 + i); break;
            case 'petbed': parts = s3PetBed(lw, ld, th); break;
            case 'wall': parts = s3WallParts({ w: lw, h: ld, col: obs.col, row: obs.row }, th); break;
            default: parts = [{ shape: 'box', pos: [0, 0.5, 0], size: [lw - 0.1, 1, ld - 0.1], mat: s3Mat('plaster') }];
        }
        out.push({ type: obs.type, pos: [obs.col + obs.w / 2, 0, obs.row + obs.h / 2], yaw, parts, footprint: obs });
    });
    return out;
}

// The dock: a chrome saucer flush with the floor and a finned beacon on its wall side
function s3Dock(levelIndex) {
    const level = LEVELS[levelIndex];
    const th = s3Theme(levelIndex);
    const c = level.charger;
    const facing = s3Facing({ col: c.col, row: c.row, w: 1, h: 1 });
    const parts = [];
    parts.push({ shape: 'cyl', pos: [0, 0.02, 0], rTop: 0.44, rBot: 0.46, h: 0.04, mat: s3Mat('chrome') });
    parts.push({ shape: 'torus', pos: [0, 0.045, 0], r: 0.36, tube: 0.012, rot: [Math.PI / 2, 0, 0], mat: s3Mat('emissive', '#4FA8FF'), tag: 'dockRing' });
    parts.push({ shape: 'box', pos: [0, 0.62, -0.42], size: [0.34, 1.2, 0.07], bevel: 0.02, mat: s3Mat('chrome') });
    parts.push({ shape: 'box', pos: [0, 0.9, -0.42], size: [0.2, 0.08, 0.09], mat: s3Mat('emissive', '#4FA8FF'), tag: 'dockRing' });
    parts.push({ shape: 'cyl', pos: [0, 1.5, -0.42], rTop: 0.008, rBot: 0.012, h: 0.6, mat: s3Mat('chrome') });
    parts.push({ shape: 'sphere', pos: [0, 1.82, -0.42], r: 0.035, mat: s3Mat('emissive', '#FF4A3A'), tag: 'blink' });
    parts.push({ shape: 'box', pos: [0, 0.07, 0.1], size: [0.28, 0.03, 0.2], bevel: 0.01, mat: s3Mat('rubber') });
    return { pos: [c.col + 0.5, 0, c.row + 0.5], yaw: S3_YAW[facing], parts, color: th.accent.color };
}

// --- Architecture: walls, window, door, skirting, cornice, ceiling, decor ----------------------

// A point on a wall's inner face plus the yaw that faces the room
function s3WallPoint(wall, along, y, inset) {
    const d = inset || 0;
    switch (wall) {
        case 'north': return { pos: [along, y, d], yaw: 0 };
        case 'south': return { pos: [along, y, ROWS - d], yaw: Math.PI };
        case 'west': return { pos: [d, y, along], yaw: Math.PI / 2 };
        default: return { pos: [COLS - d, y, along], yaw: -Math.PI / 2 };
    }
}

function s3WallLength(wall) {
    return wall === 'north' || wall === 'south' ? COLS : ROWS;
}

function s3Architecture(levelIndex) {
    const th = s3Theme(levelIndex);
    const P = [];
    const H = S3_WALL_H, T = S3_WALL_T;
    const plaster = (wall) => s3Mat('plaster', th.accent.wall === wall ? th.accent.color : th.walls);
    const trim = s3Mat('paint', th.trim);
    trim.roughness = 0.45;

    // North wall around the window
    const wx0 = S3_WINDOW.x0, wx1 = S3_WINDOW.x1, sill = S3_WINDOW.sill, top = S3_WINDOW.top;
    const north = plaster('north');
    P.push({ shape: 'box', pos: [wx0 / 2, H / 2, -T / 2], size: [wx0, H, T], mat: north, texture: 'plaster' });
    P.push({ shape: 'box', pos: [(wx1 + COLS) / 2, H / 2, -T / 2], size: [COLS - wx1, H, T], mat: north, texture: 'plaster' });
    P.push({ shape: 'box', pos: [(wx0 + wx1) / 2, sill / 2, -T / 2], size: [wx1 - wx0, sill, T], mat: north, texture: 'plaster' });
    P.push({ shape: 'box', pos: [(wx0 + wx1) / 2, (top + H) / 2, -T / 2], size: [wx1 - wx0, H - top, T], mat: north, texture: 'plaster' });
    // South, west, east walls
    P.push({ shape: 'box', pos: [COLS / 2, H / 2, ROWS + T / 2], size: [COLS, H, T], mat: plaster('south'), texture: 'plaster' });
    P.push({ shape: 'box', pos: [-T / 2, H / 2, ROWS / 2], size: [T, H, ROWS + 2 * T], mat: plaster('west'), texture: 'plaster' });
    P.push({ shape: 'box', pos: [COLS + T / 2, H / 2, ROWS / 2], size: [T, H, ROWS + 2 * T], mat: plaster('east'), texture: 'plaster' });
    // Ceiling
    P.push({ shape: 'box', pos: [COLS / 2, H + 0.05, ROWS / 2], size: [COLS + 2 * T, 0.1, ROWS + 2 * T], mat: s3Mat('plaster', th.ceiling), texture: 'ceiling' });
    // Skirting and cornice
    for (const wall of ['north', 'south', 'west', 'east']) {
        const len = s3WallLength(wall);
        const base = s3WallPoint(wall, len / 2, 0.13, 0.02);
        P.push({ shape: 'box', pos: base.pos, size: [len, 0.26, 0.04], rot: [0, base.yaw, 0], mat: trim });
        const cor = s3WallPoint(wall, len / 2, H - 0.11, 0.05);
        P.push({ shape: 'box', pos: cor.pos, size: [len, 0.22, 0.1], rot: [0, cor.yaw, 0], mat: trim });
    }
    // Window: frame, sill board, mullions, glass
    const frame = s3Mat('paint', th.trim);
    const fz = -0.02;
    P.push({ shape: 'box', pos: [(wx0 + wx1) / 2, sill - 0.03, 0.08], size: [wx1 - wx0 + 0.3, 0.07, 0.5], bevel: 0.01, mat: frame });
    P.push({ shape: 'box', pos: [wx0 - 0.05, (sill + top) / 2, fz], size: [0.1, top - sill + 0.2, 0.08], mat: frame });
    P.push({ shape: 'box', pos: [wx1 + 0.05, (sill + top) / 2, fz], size: [0.1, top - sill + 0.2, 0.08], mat: frame });
    P.push({ shape: 'box', pos: [(wx0 + wx1) / 2, top + 0.05, fz], size: [wx1 - wx0 + 0.2, 0.1, 0.08], mat: frame });
    for (let i = 1; i < 3; i++) {
        P.push({ shape: 'box', pos: [wx0 + ((wx1 - wx0) * i) / 3, (sill + top) / 2, -0.1], size: [0.05, top - sill, 0.05], mat: frame });
    }
    P.push({ shape: 'box', pos: [(wx0 + wx1) / 2, sill + (top - sill) * 0.62, -0.1], size: [wx1 - wx0, 0.05, 0.05], mat: frame });
    P.push({ shape: 'plane', pos: [(wx0 + wx1) / 2, (sill + top) / 2, -0.2], size: [wx1 - wx0, top - sill], mat: s3Mat('glass'), tag: 'glass' });
    // Venetian blinds, half drawn, slats tilted to let the sun through in stripes
    const slats = 11;
    for (let i = 0; i < slats; i++) {
        const y = top - 0.12 - i * 0.14;
        P.push({ shape: 'box', pos: [(wx0 + wx1) / 2, y, -0.06], size: [wx1 - wx0 - 0.08, 0.012, 0.09], rot: [0.55, 0, 0], mat: s3Mat('paint', '#F7F2E8'), tag: 'slat' });
    }
    P.push({ shape: 'box', pos: [(wx0 + wx1) / 2, top - 0.02, -0.06], size: [wx1 - wx0 - 0.04, 0.08, 0.1], mat: s3Mat('paint', '#F7F2E8') });

    // Door with a porthole
    const door = th.door;
    const dw = 1.8, dh = 4.1;
    const dc = s3WallPoint(door.wall, door.at, dh / 2, 0.02);
    P.push({ shape: 'box', pos: dc.pos, size: [dw, dh, 0.08], rot: [0, dc.yaw, 0], mat: s3Mat('paint', door.color), tag: 'door' });
    const jamb = s3Mat('paint', th.trim);
    for (const s of [-1, 1]) {
        const j = s3WallPoint(door.wall, door.at + s * (dw / 2 + 0.06), dh / 2 + 0.06, 0.07);
        P.push({ shape: 'box', pos: j.pos, size: [0.12, dh + 0.12, 0.14], rot: [0, j.yaw, 0], mat: jamb });
    }
    const head = s3WallPoint(door.wall, door.at, dh + 0.06, 0.07);
    P.push({ shape: 'box', pos: head.pos, size: [dw + 0.24, 0.12, 0.14], rot: [0, head.yaw, 0], mat: jamb });
    const port = s3WallPoint(door.wall, door.at, 2.9, 0.08);
    P.push({ shape: 'torus', pos: port.pos, r: 0.32, tube: 0.035, rot: [0, port.yaw, 0], mat: s3Mat('chrome') });
    P.push({ shape: 'cyl', pos: s3WallPoint(door.wall, door.at, 2.9, 0.06).pos, rTop: 0.3, rBot: 0.3, h: 0.02, rot: [Math.PI / 2, 0, 0], yawFix: port.yaw, mat: s3Mat('glass', '#AFCBD6') });
    const handle = s3WallPoint(door.wall, door.at + 0.65, 2.0, 0.1);
    P.push({ shape: 'box', pos: handle.pos, size: [0.22, 0.05, 0.05], rot: [0, handle.yaw, 0], mat: s3Mat('chrome') });

    // Sputnik chandelier
    const lampY = H - 0.95;
    P.push({ shape: 'cyl', pos: [S3_LAMP.x, H - 0.45, S3_LAMP.z], rTop: 0.012, rBot: 0.012, h: 0.9, mat: s3Mat('brass') });
    P.push({ shape: 'sphere', pos: [S3_LAMP.x, lampY, S3_LAMP.z], r: 0.13, mat: s3Mat('brass') });
    const rnd = s3Rand(77);
    const arms = 14;
    for (let i = 0; i < arms; i++) {
        const u = (i + 0.5) / arms, v = rnd();
        const theta = u * Math.PI * 2 + (rnd() - 0.5) * 0.4;
        const phi = Math.acos(1 - 2 * ((i % 7) / 7 + 0.06));
        const len = 0.55 + v * 0.3;
        const dir = [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
        const tip = [S3_LAMP.x + dir[0] * len, lampY + dir[1] * len, S3_LAMP.z + dir[2] * len];
        P.push({ shape: 'rod', from: [S3_LAMP.x, lampY, S3_LAMP.z], to: tip, r: 0.012, mat: s3Mat('brass') });
        P.push({ shape: 'sphere', pos: tip, r: 0.065, mat: s3Mat('emissive', th.lamp.on ? th.lamp.color : '#FFF4E0'), tag: 'bulb' });
    }

    // Starburst clock on the accent wall, away from the window and the door
    const clockWall = th.accent.wall;
    const clockAlong = clockWall === 'north' ? 5 : s3WallLength(clockWall) / 2 + (door.wall === clockWall ? 3.2 : 0);
    const ck = s3WallPoint(clockWall, clockAlong, 3.1, 0.06);
    P.push({ shape: 'cyl', pos: ck.pos, rTop: 0.16, rBot: 0.16, h: 0.05, rot: [Math.PI / 2, 0, 0], yawFix: ck.yaw, mat: s3Mat('brass') });
    P.push({ shape: 'cyl', pos: s3WallPoint(clockWall, clockAlong, 3.1, 0.09).pos, rTop: 0.12, rBot: 0.12, h: 0.02, rot: [Math.PI / 2, 0, 0], yawFix: ck.yaw, mat: s3Mat('paint', '#1E1E1E') });
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const len = i % 3 === 0 ? 0.5 : 0.36;
        const inner = s3WallRadial(clockWall, clockAlong, 3.1, 0.06, a, 0.18);
        const outer = s3WallRadial(clockWall, clockAlong, 3.1, 0.06, a, len);
        P.push({ shape: 'rod', from: inner, to: outer, r: 0.012, mat: s3Mat('brass') });
        P.push({ shape: 'sphere', pos: outer, r: i % 3 === 0 ? 0.045 : 0.03, mat: i % 3 === 0 ? s3Mat('ceramic', th.accent.wall === 'south' ? th.trim : th.pillow) : s3Mat('brass') });
    }
    P.push({ shape: 'box', pos: s3WallPoint(clockWall, clockAlong, 3.1, 0.11).pos, size: [0.02, 0.1, 0.02], rot: [0, ck.yaw, 0], tag: 'clockHour', mat: s3Mat('paint', '#F7F2E8') });
    P.push({ shape: 'box', pos: s3WallPoint(clockWall, clockAlong, 3.1, 0.12).pos, size: [0.02, 0.1, 0.02], rot: [0, ck.yaw, 0], tag: 'clockMinute', mat: s3Mat('paint', '#F7F2E8') });

    // Two framed prints on walls that have room for them
    const printWalls = ['north', 'south', 'west', 'east'].filter((w) => w !== door.wall && w !== th.accent.wall);
    th.prints.forEach((pattern, i) => {
        const wall = printWalls[i % printWalls.length];
        const len = s3WallLength(wall);
        let along = wall === 'north' ? 3 + i * 3 : len * (0.3 + 0.4 * (i % 2));
        if (wall === 'north' && along > S3_WINDOW.x0 - 1) along = S3_WINDOW.x0 - 1.2;
        const fr = s3WallPoint(wall, along, 2.9, 0.05);
        P.push({ shape: 'box', pos: fr.pos, size: [1.1, 0.85, 0.06], rot: [0, fr.yaw, 0], mat: s3Mat('walnut', '#3E2A1E') });
        const cv = s3WallPoint(wall, along, 2.9, 0.085);
        P.push({ shape: 'plane', pos: cv.pos, size: [0.98, 0.73], rot: [0, cv.yaw, 0], mat: s3Mat('paint', '#F7F2E8'), texture: 'print:' + pattern });
    });

    return P;
}

// A point offset radially (in the wall's plane) from a wall point, for the clock's rays
function s3WallRadial(wall, along, y, inset, angle, len) {
    const dx = Math.cos(angle) * len, dy = Math.sin(angle) * len;
    return s3WallPoint(wall, along + dx, y + dy, inset).pos;
}

// A camera straight above the room that frames the whole board like the 2D view does
function s3TopDownCamera(fovDeg, aspect) {
    const halfH = ROWS / 2 + 0.8;
    const halfW = COLS / 2 + 0.8;
    const t = Math.tan(((fovDeg || 56) * Math.PI) / 360);
    const height = Math.max(halfH / t, halfW / (t * (aspect || COLS / ROWS)));
    return { x: COLS / 2, y: height, z: ROWS / 2 };
}

// Where the sun is, as a unit direction from the room towards the light
function s3SunDirection(theme) {
    const az = (theme.sun.azimuth * Math.PI) / 180;
    const el = (theme.sun.elevation * Math.PI) / 180;
    return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

// What is outside the window, as a few named elements for the backdrop painter
function s3Outside(theme) {
    switch (theme.outside) {
        case 'launchpad': return { kind: 'launchpad', rocket: true, gantry: true, hills: false, moon: theme.time === 'night' };
        case 'night': return { kind: 'night', rocket: false, gantry: false, hills: true, moon: true, saucer: true };
        default: return { kind: 'suburb', rocket: true, gantry: false, hills: true, moon: false, saucer: true };
    }
}
