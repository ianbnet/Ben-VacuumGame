// GPU renderer for the first-person view: Three.js over WebGL2, fed by the scene description in
// scene3d.js and the live game state. Renders into its own canvas; game.js composites it onto
// the board canvas and draws the HUD on top. Exposed as window.gl3d for the classic scripts.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const G = {
    ready: false,
    error: null,
    canvas: null,
    renderer: null,
    scene: null,
    camera: null,
    composer: null,
    passes: {},
    level: -1,
    quality: 'high',
    scale: 1,
    basePixelRatio: 1,
    frameTimes: [],
    materials: new Map(),
    textures: new Map(),
    tagged: {},
    lights: {},
    tiles: null,
    tileData: null,
    tileCache: null,
    floorMat: null,
    env: null,
    pmrem: null,
    time: 0,
    exposure: 1,
    focus: 3,
    lastAngle: 0,
    turnBlur: 0,
    glints: [],
    perf: { cpuMs: 0, dtMs: 16 },
};

// mirror: width of the floor's reflection image. env: size of the room's reflection cube.
// lampShadow: the ceiling lamp casts shadows of its own. lights: how many of a style's own
// lights (strips, sconces, crystals) are lit.
const QUALITY = {
    low: { scale: 0.7, shadow: 1024, ao: false, dof: false, reflections: false, bloom: true, mirror: 320, env: 64, lampShadow: false, lights: 2 },
    medium: { scale: 0.85, shadow: 2048, ao: false, dof: false, reflections: true, bloom: true, mirror: 320, env: 128, lampShadow: false, lights: 4 },
    high: { scale: 1, shadow: 2048, ao: true, dof: true, reflections: true, bloom: true, mirror: 512, env: 256, lampShadow: true, lights: 6 },
    ultra: { scale: 1.3, shadow: 4096, ao: true, dof: true, reflections: true, bloom: true, mirror: 768, env: 256, lampShadow: true, lights: 8 },
};

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const eyePos = new THREE.Vector3();
const eyeQ = new THREE.Quaternion();
const topPos = new THREE.Vector3();
const topQ = new THREE.Quaternion();

// Look-around: a drag on the board turns the head while the vacuum stands still
const look = { yaw: 0, pitch: 0, tx: 0, ty: 0 };
function lookDrag(dx, dy) {
    look.tx = Math.max(-1.35, Math.min(1.35, look.tx - dx * 0.0045));
    look.ty = Math.max(-0.5, Math.min(0.4, look.ty - dy * 0.003));
}
function lookRelease(snapBack) {
    if (snapBack) { look.tx = 0; look.ty = 0; }
}

// --- Setup -------------------------------------------------------------------------------

function init() {
    try {
        const canvas = document.createElement('canvas');
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
        if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 unavailable');
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        G.renderer = renderer;
        G.canvas = canvas;
        G.camera = new THREE.PerspectiveCamera(56, CANVAS_W / CANVAS_H, 0.04, 90);
        G.pmrem = new THREE.PMREMGenerator(renderer);
        G.basePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        setQuality(G.quality);
        G.ready = true;
    } catch (e) {
        G.error = e;
        G.ready = false;
        console.warn('3D (GPU) renderer unavailable, using the classic renderer:', e && e.message);
    }
}

function setQuality(name) {
    if (!QUALITY[name]) name = 'high';
    G.quality = name;
    if (!G.renderer) return;
    G.scale = 1;
    resize();
    if (G.lights.sun) {
        G.lights.sun.shadow.mapSize.set(QUALITY[name].shadow, QUALITY[name].shadow);
        if (G.lights.sun.shadow.map) { G.lights.sun.shadow.map.dispose(); G.lights.sun.shadow.map = null; }
    }
    applyPassToggles();
}

function resize() {
    const q = QUALITY[G.quality];
    const pr = G.basePixelRatio * q.scale * G.scale;
    const w = Math.max(160, Math.round(CANVAS_W * pr));
    const h = Math.max(128, Math.round(CANVAS_H * pr));
    G.renderer.setPixelRatio(1);
    G.renderer.setSize(w, h, false);
    if (G.composer) {
        G.composer.setPixelRatio(1);
        G.composer.setSize(w, h);
    }
    if (G.passes.bloom) G.passes.bloom.setSize(w, h);
    if (G.passes.ao) G.passes.ao.setSize(w, h);
    if (G.passes.smaa) G.passes.smaa.setSize(w, h);
    if (G.passes.grade) G.passes.grade.uniforms.resolution.value.set(w, h);
}

function applyPassToggles() {
    const q = QUALITY[G.quality];
    if (G.passes.ao) G.passes.ao.enabled = q.ao;
    if (G.passes.dof) G.passes.dof.enabled = q.dof;
    if (G.passes.bloom) G.passes.bloom.enabled = q.bloom;
    if (G.floorMat) G.floorMat.userData.reflections = q.reflections;
}

// --- Textures (procedural, painted on canvases) ------------------------------------------------

function canvasTexture(c, { srgb = true, repeat = null, anisotropy = true, nearest = false } = {}) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    if (anisotropy) t.anisotropy = Math.min(8, G.renderer.capabilities.getMaxAnisotropy());
    if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; }
    t.needsUpdate = true;
    return t;
}

function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
}

// A tangent-space normal map from a canvas's luminance
function normalFromHeight(src, strength) {
    const w = src.width, h = src.height;
    const sctx = src.getContext('2d');
    const img = sctx.getImageData(0, 0, w, h).data;
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = (img[i * 4] * 0.3 + img[i * 4 + 1] * 0.59 + img[i * 4 + 2] * 0.11) / 255;
    const out = makeCanvas(w, h);
    const octx = out.getContext('2d');
    const od = octx.createImageData(w, h);
    const d = od.data;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const l = lum[y * w + ((x - 1 + w) % w)], r = lum[y * w + ((x + 1) % w)];
            const u = lum[((y - 1 + h) % h) * w + x], b = lum[((y + 1) % h) * w + x];
            const nx = (l - r) * strength, ny = (b - u) * strength;
            const len = Math.sqrt(nx * nx + ny * ny + 1);
            const i = (y * w + x) * 4;
            d[i] = ((nx / len) * 0.5 + 0.5) * 255;
            d[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
            d[i + 2] = (1 / len) * 0.5 * 255 + 127;
            d[i + 3] = 255;
        }
    }
    octx.putImageData(od, 0, 0);
    return out;
}

function noise2(x, y, seed) {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
}

function paintFloorCanvas(theme) {
    const px = 96;
    const c = makeCanvas(COLS * px, ROWS * px);
    const t = c.getContext('2d');
    const pack = s3Pack(theme);
    if (pack && pack.paintFloor) {
        pack.paintFloor(t, theme, px);
        return c;
    }
    if (theme.floor === 'lino') {
        const a = '#EAF1EC', b = '#8ED1C0';
        for (let r = 0; r < ROWS * 2; r++) {
            for (let q = 0; q < COLS * 2; q++) {
                t.fillStyle = (r + q) % 2 ? a : b;
                t.fillRect(q * px / 2, r * px / 2, px / 2, px / 2);
            }
        }
        const rnd = seededRandom(theme.floorSeed);
        t.globalAlpha = 0.5;
        for (let i = 0; i < 9000; i++) {
            t.fillStyle = rnd() > 0.5 ? 'rgba(40,40,40,0.35)' : 'rgba(255,255,255,0.5)';
            t.fillRect(rnd() * c.width, rnd() * c.height, 1.5, 1.5);
        }
        t.globalAlpha = 1;
        t.strokeStyle = 'rgba(0,0,0,0.12)';
        t.lineWidth = 1;
        for (let r = 0; r <= ROWS * 2; r++) { t.beginPath(); t.moveTo(0, r * px / 2); t.lineTo(c.width, r * px / 2); t.stroke(); }
        for (let q = 0; q <= COLS * 2; q++) { t.beginPath(); t.moveTo(q * px / 2, 0); t.lineTo(q * px / 2, c.height); t.stroke(); }
    } else if (theme.floor === 'concrete') {
        t.fillStyle = '#A9A9A4';
        t.fillRect(0, 0, c.width, c.height);
        const rnd = seededRandom(theme.floorSeed);
        for (let i = 0; i < 40000; i++) {
            const g = 150 + rnd() * 60;
            t.fillStyle = `rgba(${g},${g},${g - 4},${0.3 + rnd() * 0.4})`;
            t.fillRect(rnd() * c.width, rnd() * c.height, 2, 2);
        }
        for (let i = 0; i < 60; i++) {
            t.fillStyle = `rgba(60,55,50,${0.04 + rnd() * 0.08})`;
            t.beginPath();
            t.ellipse(rnd() * c.width, rnd() * c.height, 20 + rnd() * 120, 10 + rnd() * 60, rnd() * 3, 0, Math.PI * 2);
            t.fill();
        }
        t.strokeStyle = 'rgba(40,40,40,0.5)';
        t.lineWidth = 3;
        for (let r = 0; r <= ROWS; r += 3) { t.beginPath(); t.moveTo(0, r * px); t.lineTo(c.width, r * px); t.stroke(); }
        for (let q = 0; q <= COLS; q += 3) { t.beginPath(); t.moveTo(q * px, 0); t.lineTo(q * px, c.height); t.stroke(); }
        t.fillStyle = 'rgba(250,200,40,0.85)';
        t.fillRect(0, 9 * px - 6, c.width, 12);
    } else {
        paintWoodFloor(t, theme.floorSeed, px, COLS, ROWS);
        t.globalCompositeOperation = 'multiply';
        t.fillStyle = '#DFC9AA';
        t.fillRect(0, 0, c.width, c.height);
        t.globalCompositeOperation = 'source-over';
        if (theme.time === 'night') {
            t.fillStyle = 'rgba(20,30,40,0.35)';
            t.fillRect(0, 0, c.width, c.height);
        }
    }
    return c;
}

function paintDustAtlas() {
    const n = 128;
    const c = makeCanvas(n * 4, n * 4);
    const t = c.getContext('2d');
    const tile = makeCanvas(n, n);
    const tt = tile.getContext('2d');
    for (let v = 0; v < 16; v++) {
        tt.clearRect(0, 0, n, n);
        paintDust(tt, n, v);
        t.drawImage(tile, (v % 4) * n, Math.floor(v / 4) * n);
    }
    return c;
}

function paintPlasterNormal() {
    const c = makeCanvas(256, 256);
    const t = c.getContext('2d');
    t.fillStyle = '#808080';
    t.fillRect(0, 0, 256, 256);
    const rnd = seededRandom(31);
    for (let i = 0; i < 2600; i++) {
        const g = 110 + rnd() * 40;
        t.fillStyle = `rgba(${g},${g},${g},${0.3 + rnd() * 0.5})`;
        t.beginPath();
        t.arc(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 0, Math.PI * 2);
        t.fill();
    }
    return normalFromHeight(c, 0.9);
}

function paintBreeze(color) {
    const c = makeCanvas(256, 256);
    const t = c.getContext('2d');
    t.fillStyle = color;
    t.fillRect(0, 0, 256, 256);
    t.fillStyle = 'rgba(0,0,0,0.35)';
    t.fillRect(0, 0, 256, 6); t.fillRect(0, 0, 6, 256);
    t.fillStyle = 'rgba(0,0,0,0.5)';
    for (const [cx, cy] of [[64, 64], [192, 64], [64, 192], [192, 192]]) {
        t.beginPath();
        t.arc(cx + 64, cy + 64, 34, 0, Math.PI * 2);
        t.fill();
    }
    t.fillStyle = 'rgba(255,255,255,0.18)';
    t.fillRect(8, 8, 240, 3);
    return c;
}

// Framed prints: atomic-age patterns in the room's colours
function paintPrint(pattern, theme) {
    const c = makeCanvas(512, 384);
    const t = c.getContext('2d');
    const palette = [theme.accent.color, theme.couch, theme.chair, theme.pillow, '#1E1E1E'];
    t.fillStyle = '#F6EFE0';
    t.fillRect(0, 0, 512, 384);
    const rnd = seededRandom(pattern.length * 13 + palette[0].length);
    if (pattern === 'boomerang') {
        for (let i = 0; i < 26; i++) {
            t.save();
            t.translate(rnd() * 512, rnd() * 384);
            t.rotate(rnd() * Math.PI * 2);
            t.fillStyle = palette[i % palette.length];
            t.beginPath();
            t.moveTo(-40, 0); t.quadraticCurveTo(0, -26, 40, 0); t.quadraticCurveTo(0, -4, -40, 0);
            t.fill();
            t.restore();
        }
    } else if (pattern === 'starburst') {
        for (let i = 0; i < 7; i++) {
            const cx = rnd() * 512, cy = rnd() * 384, rays = 10 + Math.floor(rnd() * 8), len = 40 + rnd() * 70;
            t.strokeStyle = palette[i % palette.length];
            t.lineWidth = 2;
            for (let k = 0; k < rays; k++) {
                const a = (k / rays) * Math.PI * 2;
                t.beginPath(); t.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); t.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); t.stroke();
                t.fillStyle = palette[(i + k) % palette.length];
                t.beginPath(); t.arc(cx + Math.cos(a) * len, cy + Math.sin(a) * len, 4, 0, Math.PI * 2); t.fill();
            }
        }
    } else if (pattern === 'rocket') {
        t.fillStyle = palette[0];
        t.fillRect(0, 300, 512, 84);
        t.fillStyle = palette[1];
        t.beginPath(); t.ellipse(256, 170, 42, 130, 0, 0, Math.PI * 2); t.fill();
        t.fillStyle = palette[2];
        for (const s of [-1, 1]) { t.beginPath(); t.moveTo(256 + s * 30, 230); t.lineTo(256 + s * 95, 300); t.lineTo(256 + s * 20, 300); t.closePath(); t.fill(); }
        t.fillStyle = '#F6EFE0';
        t.beginPath(); t.arc(256, 150, 18, 0, Math.PI * 2); t.fill();
        t.fillStyle = palette[4];
        t.beginPath(); t.arc(256, 150, 12, 0, Math.PI * 2); t.fill();
        for (let i = 0; i < 40; i++) { t.fillStyle = '#F6EFE0'; t.fillRect(rnd() * 512, rnd() * 290, 2, 2); }
    } else {
        for (let i = 0; i < 9; i++) {
            const cx = 60 + rnd() * 392, cy = 50 + rnd() * 284;
            t.strokeStyle = palette[i % palette.length];
            t.lineWidth = 2.5;
            for (let k = 0; k < 3; k++) {
                t.beginPath(); t.ellipse(cx, cy, 36, 13, (k * Math.PI) / 3, 0, Math.PI * 2); t.stroke();
            }
            t.fillStyle = palette[(i + 2) % palette.length];
            t.beginPath(); t.arc(cx, cy, 6, 0, Math.PI * 2); t.fill();
        }
    }
    return c;
}

// The world beyond the window: sky, horizon and a few 1950s silhouettes
function paintBackdrop(theme) {
    const w = 2048, h = 768;
    const c = makeCanvas(w, h);
    const t = c.getContext('2d');
    const pack = s3Pack(theme);
    if (pack && pack.paintBackdrop) {
        pack.paintBackdrop(t, theme, w, h);
        return c;
    }
    const out = s3Outside(theme);
    const sky = t.createLinearGradient(0, 0, 0, h * 0.72);
    sky.addColorStop(0, theme.sky.zenith);
    sky.addColorStop(1, theme.sky.horizon);
    t.fillStyle = sky;
    t.fillRect(0, 0, w, h);
    const night = theme.time === 'night';
    const rnd = seededRandom(theme.floorSeed + 5);
    if (night) {
        t.fillStyle = '#FFFFFF';
        for (let i = 0; i < 400; i++) { t.globalAlpha = 0.3 + rnd() * 0.7; t.fillRect(rnd() * w, rnd() * h * 0.6, 2, 2); }
        t.globalAlpha = 1;
    }
    if (out.moon || night) {
        t.fillStyle = night ? '#F2EFD8' : 'rgba(255,255,255,0.75)';
        t.beginPath(); t.arc(w * 0.72, h * 0.22, night ? 74 : 40, 0, Math.PI * 2); t.fill();
        t.fillStyle = 'rgba(0,0,0,0.08)';
        for (const [dx, dy, r] of [[-20, 10, 14], [22, -12, 9], [8, 28, 11]]) { t.beginPath(); t.arc(w * 0.72 + dx, h * 0.22 + dy, r, 0, Math.PI * 2); t.fill(); }
    }
    if (!night) {
        t.fillStyle = 'rgba(255,255,255,0.55)';
        for (let i = 0; i < 6; i++) {
            const cx = rnd() * w, cy = h * (0.12 + rnd() * 0.3), cw = 160 + rnd() * 260;
            for (let k = 0; k < 5; k++) { t.beginPath(); t.ellipse(cx + (k - 2) * cw * 0.18, cy + (k % 2) * 10, cw * 0.22, 26 + rnd() * 18, 0, 0, Math.PI * 2); t.fill(); }
        }
    }
    // ground and hills
    t.fillStyle = theme.sky.ground;
    t.fillRect(0, h * 0.72, w, h * 0.28);
    if (out.hills) {
        const hill = s3Shade(theme.sky.ground, night ? 0.6 : 0.85);
        t.fillStyle = hill;
        t.beginPath();
        t.moveTo(0, h * 0.74);
        for (let x = 0; x <= w; x += 64) t.lineTo(x, h * 0.72 - Math.sin(x / 300) * 40 - Math.sin(x / 130 + 2) * 18 - 20);
        t.lineTo(w, h); t.lineTo(0, h); t.closePath(); t.fill();
    }
    // a suburb of little houses or a launch pad
    const silhouette = night ? '#0C1420' : s3Shade(theme.sky.ground, 0.45);
    t.fillStyle = silhouette;
    if (out.kind === 'suburb') {
        for (let i = 0; i < 14; i++) {
            const x = 40 + i * 145 + rnd() * 50, bw = 60 + rnd() * 50, bh = 36 + rnd() * 30, y = h * 0.72 - bh + 10;
            t.fillRect(x, y, bw, bh);
            t.beginPath(); t.moveTo(x - 6, y); t.lineTo(x + bw / 2, y - 26); t.lineTo(x + bw + 6, y); t.closePath(); t.fill();
            if (night || rnd() > 0.5) { t.fillStyle = '#FFD98A'; t.fillRect(x + 10, y + 10, 10, 12); t.fillStyle = silhouette; }
        }
        for (let i = 0; i < 9; i++) {
            const x = rnd() * w, y = h * 0.72 + 4;
            t.beginPath(); t.arc(x, y - 30, 18, 0, Math.PI * 2); t.fill();
            t.fillRect(x - 3, y - 30, 6, 34);
        }
    }
    if (out.rocket) {
        const x = out.kind === 'launchpad' ? w * 0.5 : w * 0.86, base = h * 0.72 + 6, rh = out.kind === 'launchpad' ? 330 : 150, rw = rh * 0.16;
        t.fillStyle = silhouette;
        t.beginPath();
        t.moveTo(x - rw, base); t.lineTo(x - rw, base - rh * 0.72); t.quadraticCurveTo(x, base - rh * 1.15, x + rw, base - rh * 0.72); t.lineTo(x + rw, base); t.closePath(); t.fill();
        for (const s of [-1, 1]) { t.beginPath(); t.moveTo(x + s * rw, base - rh * 0.3); t.lineTo(x + s * rw * 2.3, base); t.lineTo(x + s * rw, base); t.closePath(); t.fill(); }
        t.fillStyle = night ? '#9FE0FF' : '#F6EFE0';
        t.beginPath(); t.arc(x, base - rh * 0.6, rw * 0.35, 0, Math.PI * 2); t.fill();
        if (out.gantry) {
            t.fillStyle = silhouette;
            for (let k = 0; k < 7; k++) t.fillRect(x + rw * 2.8, base - rh * 0.95 + k * rh * 0.14, rw * 1.6, 6);
            t.fillRect(x + rw * 2.8, base - rh * 1.0, 8, rh); t.fillRect(x + rw * 4.3, base - rh * 1.0, 8, rh);
            t.fillStyle = 'rgba(255,255,255,0.7)';
            for (let k = 0; k < 6; k++) t.fillRect(x + rw * 2.8 + 10, base - rh * 0.9 + k * rh * 0.14, 3, 3);
        }
    }
    if (out.saucer) {
        const x = w * 0.3, y = h * 0.3;
        t.fillStyle = night ? '#B8C7D6' : '#D9DEE3';
        t.beginPath(); t.ellipse(x, y, 70, 14, 0, 0, Math.PI * 2); t.fill();
        t.fillStyle = night ? '#DDE6EE' : '#EEF2F5';
        t.beginPath(); t.ellipse(x, y - 10, 28, 16, 0, Math.PI, 0); t.fill();
        t.fillStyle = night ? '#7FE0D8' : '#F4A261';
        for (let k = -2; k <= 2; k++) { t.beginPath(); t.arc(x + k * 26, y + 4, 3, 0, Math.PI * 2); t.fill(); }
    }
    return c;
}

function getTexture(key, make, opts) {
    if (G.textures.has(key)) return G.textures.get(key);
    const tex = canvasTexture(make(), opts || {});
    G.textures.set(key, tex);
    return tex;
}

// --- Materials -------------------------------------------------------------------------------

function materialFor(spec, textureName, theme, texRepeat) {
    const key = JSON.stringify(spec) + '|' + (textureName || '') + '|' + (texRepeat ? texRepeat.join('x') : '');
    if (G.materials.has(key)) return G.materials.get(key);
    const p = {
        color: new THREE.Color(spec.color || '#888888'),
        roughness: spec.roughness !== undefined ? spec.roughness : 0.7,
        metalness: spec.metalness || 0,
    };
    if (spec.clearcoat) { p.clearcoat = spec.clearcoat; p.clearcoatRoughness = spec.clearcoatRoughness || 0.3; }
    if (spec.sheen) { p.sheen = spec.sheen; p.sheenRoughness = spec.sheenRoughness || 0.6; p.sheenColor = new THREE.Color(spec.sheenColor || '#FFFFFF'); }
    if (spec.emissive) { p.emissive = new THREE.Color(spec.emissive); p.emissiveIntensity = spec.emissiveIntensity || 1; }
    if (spec.transparent) { p.transparent = true; p.opacity = spec.opacity; p.depthWrite = false; }
    if (spec.side === 2) p.side = THREE.DoubleSide;
    if (spec.flat) p.flatShading = true;
    if (spec.iridescence) { p.iridescence = spec.iridescence; p.iridescenceIOR = 1.5; }
    // A style pack's own texture: colour, and a normal map made from the same picture
    const reg = s3PackTexture(textureName);
    if (reg) {
        const size = reg.size || 256;
        const rep = texRepeat || reg.repeat || [1, 1];
        const id = textureName + ':' + (reg.perTheme ? theme.name : '') + ':' + (reg.byColor ? spec.color : '') + ':' + rep.join('x');
        const paint = () => {
            const c = makeCanvas(size, size);
            reg.paint(c.getContext('2d'), size, theme, spec.color);
            return c;
        };
        p.map = getTexture('pack:' + id, paint, { repeat: rep, nearest: !!reg.nearest });
        if (reg.normal) {
            p.normalMap = getTexture('packN:' + id, () => normalFromHeight(paint(), reg.normal), { srgb: false, repeat: rep, nearest: !!reg.nearest });
            const k = reg.normalScale || 0.7;
            p.normalScale = new THREE.Vector2(k, k);
        }
        if (!reg.tint) p.color = new THREE.Color('#FFFFFF');
        if (reg.glow) { p.emissiveMap = p.map; p.emissive = new THREE.Color('#FFFFFF'); p.emissiveIntensity = reg.glow; }
    }
    if (textureName === 'plaster') {
        p.normalMap = getTexture('plasterN', paintPlasterNormal, { srgb: false, repeat: [3, 3] });
        p.normalScale = new THREE.Vector2(0.35, 0.35);
    } else if (textureName === 'breeze') {
        p.map = getTexture('breeze:' + spec.color, () => paintBreeze(spec.color), { repeat: [1, 1] });
        p.normalMap = getTexture('breezeN:' + spec.color, () => normalFromHeight(paintBreeze(spec.color), 1.4), { srgb: false, repeat: [1, 1] });
        p.normalScale = new THREE.Vector2(0.8, 0.8);
        p.color = new THREE.Color('#FFFFFF');
    } else if (textureName && textureName.startsWith('print:')) {
        const pattern = textureName.slice(6);
        p.map = getTexture('print:' + pattern + ':' + theme.name, () => paintPrint(pattern, theme), { repeat: [1, 1] });
        p.map.wrapS = p.map.wrapT = THREE.ClampToEdgeWrapping;
        p.color = new THREE.Color('#FFFFFF');
        p.roughness = 0.8;
    }
    if (textureName === 'ceiling') {
        const bounce = new THREE.Color(theme.walls).lerp(new THREE.Color(theme.ceiling), 0.5);
        p.emissive = bounce;
        p.emissiveIntensity = theme.time === 'night' ? 0.03 : theme.time === 'dusk' || theme.time === 'golden hour' ? 0.12 : 0.2;
    }
    const m = new THREE.MeshPhysicalMaterial(p);
    G.materials.set(key, m);
    return m;
}

// --- Geometry from parts -------------------------------------------------------------------

function geometryFor(p) {
    switch (p.shape) {
        case 'box': {
            const [w, h, d] = p.size;
            const g = p.bevel ? new RoundedBoxGeometry(w, h, d, 3, Math.min(p.bevel, Math.min(w, h, d) / 2.01)) : new THREE.BoxGeometry(w, h, d);
            if (p.taper) {
                const pos = g.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    const y = pos.getY(i);
                    const k = 1 - p.taper * ((y / h) + 0.5);
                    pos.setX(i, pos.getX(i) * k);
                }
                g.computeVertexNormals();
            }
            return g;
        }
        case 'cyl':
            return new THREE.CylinderGeometry(p.rTop, p.rBot, p.h, p.seg || (p.open ? 32 : 24), 1, !!p.open, p.thetaStart || 0, p.thetaLength || Math.PI * 2);
        case 'lathe': {
            // a profile of [radius, height] pairs spun round the y axis: turned legs, urns, shades
            const pts = p.points.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
            return new THREE.LatheGeometry(pts, p.seg || 28);
        }
        case 'tube': {
            // a pipe along a path of points, relative to the part's position
            const curve = new THREE.CatmullRomCurve3(p.path.map((q) => new THREE.Vector3(q[0], q[1], q[2])), !!p.closed, 'catmullrom', p.tension === undefined ? 0.25 : p.tension);
            return new THREE.TubeGeometry(curve, p.steps || p.path.length * 8, p.r, p.seg || 10, !!p.closed);
        }
        case 'gear': {
            // a toothed wheel lying flat, axis up, with a hole through the middle
            const shape = new THREE.Shape();
            const n = p.teeth || 12, r0 = p.r * 0.82;
            for (let i = 0; i < n * 4; i++) {
                const a = (i / (n * 4)) * Math.PI * 2;
                const r = i % 4 < 2 ? p.r : r0;
                if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            shape.closePath();
            if (p.hole) {
                const hole = new THREE.Path();
                hole.absarc(0, 0, p.hole, 0, Math.PI * 2, true);
                shape.holes.push(hole);
            }
            const depth = p.depth || 0.06;
            const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 });
            g.rotateX(-Math.PI / 2);
            g.translate(0, -depth / 2, 0);
            return g;
        }
        case 'gem':
            return p.faces === 20 ? new THREE.IcosahedronGeometry(p.r, 0) : new THREE.OctahedronGeometry(p.r, 0);
        case 'sphere':
            return new THREE.SphereGeometry(p.r, 28, 18);
        case 'torus':
            return new THREE.TorusGeometry(p.r, p.tube, 14, 56, p.arc || Math.PI * 2);
        case 'plane':
            return new THREE.PlaneGeometry(p.size[0], p.size[1]);
        case 'extrude': {
            const shape = new THREE.Shape();
            p.points.forEach(([x, z], i) => { if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z); });
            shape.closePath();
            return new THREE.ExtrudeGeometry(shape, { depth: p.depth, bevelEnabled: !!p.bevel, bevelThickness: p.bevel || 0, bevelSize: p.bevel || 0, bevelSegments: 2, curveSegments: 6 });
        }
        case 'rod': {
            const a = new THREE.Vector3(...p.from), b = new THREE.Vector3(...p.to);
            const len = a.distanceTo(b);
            return new THREE.CylinderGeometry(p.r, p.r, len, 10, 1);
        }
        default:
            return new THREE.BoxGeometry(0.2, 0.2, 0.2);
    }
}

function buildPart(p, theme) {
    const geo = geometryFor(p);
    const mat = materialFor(p.mat, p.texture, theme, p.texRepeat);
    const mesh = new THREE.Mesh(geo, mat);
    if (p.shape === 'rod') {
        const a = new THREE.Vector3(...p.from), b = new THREE.Vector3(...p.to);
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        const dir = tmpV.copy(b).sub(a).normalize();
        mesh.quaternion.setFromUnitVectors(UP, dir);
    } else {
        mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
        if (p.shape === 'extrude') mesh.rotation.x = -Math.PI / 2;
        if (p.rot) {
            if (p.shape === 'extrude') mesh.rotation.y = p.rot[1] || 0;
            else mesh.rotation.set(p.rot[0] || 0, p.rot[1] || 0, p.rot[2] || 0);
        }
        if (p.yawFix) mesh.rotateOnWorldAxis(UP, p.yawFix);
        if (p.scale) mesh.scale.set(p.scale[0], p.scale[1], p.scale[2]);
    }
    const emissive = !!(p.mat && p.mat.emissive);
    const glassy = !!(p.mat && p.mat.transparent);
    mesh.castShadow = !emissive && !glassy && p.shape !== 'plane' && !p.noShadow;
    mesh.receiveShadow = !emissive;
    if (p.tag) {
        (G.tagged[p.tag] = G.tagged[p.tag] || []).push(mesh);
        mesh.userData.base = { y: mesh.position.y, sy: mesh.scale.y, rx: mesh.rotation.x, glow: mat.emissiveIntensity || 0 };
        mesh.userData.speed = p.speed || 0.5;
    }
    return mesh;
}

function buildGroup(item, theme) {
    const g = new THREE.Group();
    g.position.set(item.pos[0], item.pos[1], item.pos[2]);
    g.rotation.y = item.yaw || 0;
    for (const p of item.parts) g.add(buildPart(p, theme));
    return g;
}

// --- Floor with the live tile mask -------------------------------------------------------------

function buildTileTexture() {
    const data = new Uint8Array(COLS * ROWS * 4);
    const tex = new THREE.DataTexture(data, COLS, ROWS, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    G.tiles = tex;
    G.tileData = data;
    G.tileCache = new Int32Array(COLS * ROWS).fill(-1);
}

// R: cleanliness, G: roughness, B: charging pad, A: 255. Returns true when anything changed.
function updateTiles(view) {
    const g = view.grid;
    const pads = typeof chargingPadGrid !== 'undefined' ? chargingPadGrid : null;
    let changed = false;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = g[r][c];
            const pad = pads && pads[r] && pads[r][c] ? 1 : 0;
            const code = cell * 4 + pad;
            const i = r * COLS + c;
            if (G.tileCache[i] === code) continue;
            G.tileCache[i] = code;
            changed = true;
            const o = ((ROWS - 1 - r) * COLS + c) * 4;
            const clean = cell === CLEAN || cell === CHARGER;
            G.tileData[o] = clean ? 255 : 0;
            G.tileData[o + 1] = cell === CHARGER ? 90 : clean ? 70 : 235;
            G.tileData[o + 2] = pad ? 255 : 0;
            G.tileData[o + 3] = 255;
            setDebrisForTile(c, r, cell === DIRTY);
        }
    }
    if (changed) {
        G.tiles.needsUpdate = true;
        if (G.debris) G.debris.instanceMatrix.needsUpdate = true;
    }
    return changed;
}

// --- Crumbs and fluff on dirty tiles -------------------------------------------------------------

const DEBRIS_PER_TILE = 2;
const debrisM = new THREE.Matrix4();
const debrisQ = new THREE.Quaternion();
const debrisP = new THREE.Vector3();
const debrisS = new THREE.Vector3();

function buildDebris(theme) {
    const count = COLS * ROWS * DEBRIS_PER_TILE;
    const geo = new THREE.SphereGeometry(1, 8, 6);
    const mat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 1, envMapIntensity: 0.12 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const rnd = seededRandom(theme.floorSeed + 1234);
    const base = new Float32Array(count * 7);
    const colors = [new THREE.Color('#5A4C40'), new THREE.Color('#7D7568'), new THREE.Color('#4A3E34'), new THREE.Color('#8C857A')];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            for (let k = 0; k < DEBRIS_PER_TILE; k++) {
                const i = (r * COLS + c) * DEBRIS_PER_TILE + k;
                const fluff = rnd() < 0.3;
                const s = fluff ? 0.014 + rnd() * 0.014 : 0.006 + rnd() * 0.009;
                base[i * 7] = c + 0.1 + rnd() * 0.8;
                base[i * 7 + 1] = s * 0.45;
                base[i * 7 + 2] = r + 0.1 + rnd() * 0.8;
                base[i * 7 + 3] = s * (1 + rnd() * 0.6);
                base[i * 7 + 4] = s * 0.5;
                base[i * 7 + 5] = s;
                base[i * 7 + 6] = rnd() * Math.PI;
                mesh.setColorAt(i, colors[fluff ? 1 + Math.floor(rnd() * 3) % 3 : Math.floor(rnd() * 3) % 3]);
            }
        }
    }
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    G.debris = mesh;
    G.debrisBase = base;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
}

function setDebrisForTile(c, r, show) {
    if (!G.debris) return;
    const base = G.debrisBase;
    for (let k = 0; k < DEBRIS_PER_TILE; k++) {
        const i = (r * COLS + c) * DEBRIS_PER_TILE + k;
        debrisP.set(base[i * 7], base[i * 7 + 1], base[i * 7 + 2]);
        debrisQ.setFromAxisAngle(UP, base[i * 7 + 6]);
        if (show) debrisS.set(base[i * 7 + 3], base[i * 7 + 4], base[i * 7 + 5]);
        else debrisS.set(0.0001, 0.0001, 0.0001);
        debrisM.compose(debrisP, debrisQ, debrisS);
        G.debris.setMatrixAt(i, debrisM);
    }
}

// --- The shaft of sun through the window: a translucent prism along the light --------------------

function buildSunBeam(theme) {
    const dir = s3SunDirection(theme); // towards the sun; the beam travels the other way
    const w = S3_WINDOW;
    const corners = [[w.x0, w.sill], [w.x1, w.sill], [w.x1, w.top], [w.x0, w.top]];
    const verts = [];
    const alphas = [];
    const ends = corners.map(([x, y]) => {
        const t = y / Math.max(0.05, dir[1]); // distance along -dir to reach the floor
        return [x - dir[0] * t, 0.02, 0 - dir[2] * t];
    });
    const push = (p, a) => { verts.push(p[0], p[1], p[2]); alphas.push(a); };
    for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        const a0 = [corners[i][0], corners[i][1], 0], a1 = [corners[j][0], corners[j][1], 0];
        const b0 = ends[i], b1 = ends[j];
        push(a0, 1); push(a1, 1); push(b1, 0);
        push(a0, 1); push(b1, 0); push(b0, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('fade', new THREE.Float32BufferAttribute(alphas, 1));
    const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(theme.sun.color) }, uTime: { value: 0 }, uStrength: { value: theme.time === 'night' ? 0.08 : 0.36 } },
        vertexShader: `attribute float fade; varying float vFade; varying vec3 vPos; varying vec3 vNormalW;
void main() { vFade = fade; vPos = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uStrength; varying float vFade; varying vec3 vPos;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
    vec3 toCam = normalize(cameraPosition - vPos);
    float n = noise(vPos.xz * 1.3 + vec2(uTime * 0.05, 0.0)) * 0.6 + noise(vPos.xy * 2.1 - uTime * 0.03) * 0.4;
    float a = uStrength * (0.35 + 0.65 * vFade) * (0.7 + 0.3 * n) * smoothstep(0.0, 0.25, vFade);
    a += uStrength * 0.25 * (1.0 - vFade) * smoothstep(0.0, 0.5, vFade);
    gl_FragColor = vec4(uColor * 1.4, a);
}`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    G.beam = mesh;
    return mesh;
}

// --- Dust drawn into the vacuum as a tile comes clean --------------------------------------------

const INTAKE_N = 240;
function buildIntake() {
    const pos = new Float32Array(INTAKE_N * 3);
    const age = new Float32Array(INTAKE_N).fill(2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('age', new THREE.BufferAttribute(age, 1));
    const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uScale: { value: 1 } },
        vertexShader: `attribute float age; varying float vA; uniform float uScale;
void main() { vA = age; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.0 - age) * uScale * 9.0 / max(0.3, -mv.z); }`,
        fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); if (vA >= 1.0) discard;
  gl_FragColor = vec4(vec3(0.72, 0.66, 0.58), smoothstep(0.5, 0.1, d) * (1.0 - vA) * 0.9); }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    G.intake = { pts, pos, age, next: 0, seen: new Set(), vel: new Float32Array(INTAKE_N * 3) };
    return pts;
}

function spawnIntake(c, r) {
    const I = G.intake;
    if (!I) return;
    for (let k = 0; k < 22; k++) {
        const i = I.next; I.next = (I.next + 1) % INTAKE_N;
        I.pos[i * 3] = c + 0.1 + Math.random() * 0.8;
        I.pos[i * 3 + 1] = 0.01 + Math.random() * 0.03;
        I.pos[i * 3 + 2] = r + 0.1 + Math.random() * 0.8;
        I.vel[i * 3] = (Math.random() - 0.5) * 0.6;
        I.vel[i * 3 + 1] = Math.random() * 0.5;
        I.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
        I.age[i] = Math.random() * 0.15;
    }
}

function updateIntake(view, dt) {
    const I = G.intake;
    if (!I) return;
    // new tiles in the fade list start a puff
    const fades = typeof tileCleanFade !== 'undefined' ? tileCleanFade : null;
    const now = new Set();
    if (fades) {
        for (const key in fades) {
            now.add(key);
            if (!I.seen.has(key)) {
                const [c, r] = key.split(',').map(Number);
                spawnIntake(c, r);
            }
        }
    }
    I.seen = now;
    // particles are pulled under the vacuum's front edge
    const tx = view.camX + Math.cos(view.angle) * 0.05, tz = view.camY + Math.sin(view.angle) * 0.05;
    let any = false;
    for (let i = 0; i < INTAKE_N; i++) {
        if (I.age[i] >= 1) continue;
        any = true;
        I.age[i] += dt * 1.8;
        const pull = Math.min(1, dt * (3 + I.age[i] * 9));
        I.vel[i * 3 + 1] -= dt * 1.5;
        I.pos[i * 3] += I.vel[i * 3] * dt + (tx - I.pos[i * 3]) * pull;
        I.pos[i * 3 + 1] = Math.max(0.005, I.pos[i * 3 + 1] + I.vel[i * 3 + 1] * dt + (0.03 - I.pos[i * 3 + 1]) * pull);
        I.pos[i * 3 + 2] += I.vel[i * 3 + 2] * dt + (tz - I.pos[i * 3 + 2]) * pull;
    }
    if (any) {
        I.pts.geometry.attributes.position.needsUpdate = true;
        I.pts.geometry.attributes.age.needsUpdate = true;
    }
}

// --- A flying saucer that drifts past the window now and then -------------------------------------

function buildSaucer(theme) {
    const g = new THREE.Group();
    const hull = new THREE.MeshPhysicalMaterial({ color: '#D8DDE3', metalness: 1, roughness: 0.25 });
    const disc = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12), hull);
    disc.scale.set(1.6, 0.28, 1.6);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#9FD8FF', transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0 }));
    dome.position.y = 0.2;
    g.add(disc, dome);
    const lightMat = new THREE.MeshPhysicalMaterial({ color: '#F4A261', emissive: theme.time === 'night' ? '#7FE0D8' : '#F4A261', emissiveIntensity: 3 });
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lightMat);
        b.position.set(Math.cos(a) * 1.2, -0.12, Math.sin(a) * 1.2);
        g.add(b);
    }
    g.position.set(8, 8, -16);
    G.saucer = g;
    return g;
}

function updateSaucer() {
    const s = G.saucer;
    if (!s) return;
    const t = G.time;
    s.position.x = 1 + 14 * (0.5 + 0.5 * Math.sin(t * 0.045));
    s.position.y = 7.6 + 0.5 * Math.sin(t * 0.8);
    s.position.z = -15 - 3 * Math.cos(t * 0.045);
    s.rotation.z = 0.12 * Math.cos(t * 0.045);
    s.rotation.y += 0.02;
}

function buildFloor(theme) {
    // A style can say how its floor behaves: theme.floorMat = { bump, normal, metalness,
    // clearcoat, reflect, dust: [keep, r, g, b] }
    const fm = theme.floorMat || {};
    const map = getTexture('floor:' + theme.name, () => paintFloorCanvas(theme));
    const normal = getTexture('floorN:' + theme.name, () => normalFromHeight(paintFloorCanvas(theme), fm.bump || (theme.floor === 'wood' ? 0.6 : 0.3)), { srgb: false });
    const dust = getTexture('dust', paintDustAtlas, { repeat: [COLS / 4, ROWS / 4] });
    const nk = fm.normal === undefined ? 0.45 : fm.normal;
    const mat = new THREE.MeshPhysicalMaterial({
        map, normalMap: normal, normalScale: new THREE.Vector2(nk, nk),
        roughness: 1, roughnessMap: G.tiles, metalness: fm.metalness || 0,
        clearcoat: fm.clearcoat !== undefined ? fm.clearcoat : theme.floor === 'concrete' ? 0 : 0.12, clearcoatRoughness: 0.4,
    });
    const dustMix = fm.dust || [0.62, 0.30, 0.28, 0.25];
    mat.userData.reflections = QUALITY[G.quality].reflections;
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.tDust = { value: dust };
        shader.uniforms.uDustRepeat = { value: new THREE.Vector2(COLS / 4, ROWS / 4) };
        shader.uniforms.uAhead = { value: new THREE.Vector2(-10, -10) };
        shader.uniforms.uAheadColor = { value: new THREE.Color('#1A9A8A') };
        shader.uniforms.uGlints = { value: new Float32Array(8 * 3) };
        shader.uniforms.tReflect = { value: null };
        shader.uniforms.uReflectMatrix = { value: new THREE.Matrix4() };
        shader.uniforms.uReflectStrength = { value: 0 };
        shader.uniforms.uDustKeep = { value: dustMix[0] };
        shader.uniforms.uDustAdd = { value: new THREE.Vector3(dustMix[1], dustMix[2], dustMix[3]) };
        mat.userData.shader = shader;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec4 vReflectUv;\nvarying vec3 vWorldPos;\nuniform mat4 uReflectMatrix;')
            .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vec4 wp = modelMatrix * vec4(transformed, 1.0);\n vWorldPos = wp.xyz;\n vReflectUv = uReflectMatrix * wp;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
uniform sampler2D tDust; uniform vec2 uDustRepeat; uniform vec2 uAhead; uniform vec3 uAheadColor;
uniform float uGlints[24]; uniform sampler2D tReflect; uniform float uReflectStrength;
uniform float uDustKeep; uniform vec3 uDustAdd;
varying vec4 vReflectUv; varying vec3 vWorldPos;`)
            .replace('#include <map_fragment>', `#include <map_fragment>
vec4 tileInfo = texture2D(roughnessMap, vRoughnessMapUv);
float dirty = 1.0 - tileInfo.r;
vec4 dustTex = texture2D(tDust, vMapUv * uDustRepeat);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uDustKeep + uDustAdd, dirty * dustTex.a * 0.9);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.9, 1.12), tileInfo.b * 0.55);
vec2 tileXZ = floor(vWorldPos.xz);
float aheadHit = 1.0 - step(0.5, length(tileXZ - uAhead));
vec2 inTile = fract(vWorldPos.xz) - 0.5;
float edgeM = max(abs(inTile.x), abs(inTile.y));
float edge = smoothstep(0.43, 0.465, edgeM) * (1.0 - smoothstep(0.485, 0.5, edgeM));
vec3 aheadGlow = uAheadColor * edge * aheadHit * 0.6;`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += aheadGlow;
for (int i = 0; i < 8; i++) {
    float gl = uGlints[i * 3 + 2];
    if (gl <= 0.0) continue;
    vec2 gt = vec2(uGlints[i * 3], uGlints[i * 3 + 1]);
    float inside = 1.0 - step(0.5, length(tileXZ - gt));
    float sweep = 1.0 - abs((fract(vWorldPos.x) + fract(vWorldPos.z)) * 0.5 - (1.0 - gl)) * 6.0;
    totalEmissiveRadiance += vec3(1.0, 0.98, 0.9) * inside * max(0.0, sweep) * sin(gl * 3.14159) * 0.9;
}`)
            .replace('#include <opaque_fragment>', `
if (uReflectStrength > 0.0) {
    vec3 refl = texture2DProj(tReflect, vReflectUv).rgb;
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - max(0.0, viewDir.y), 3.0);
    float gloss = (1.0 - dirty) * (1.0 - tileInfo.g);
    outgoingLight = mix(outgoingLight, refl, clamp(gloss * (0.1 + 0.5 * fres) * uReflectStrength, 0.0, 0.72));
}
#include <opaque_fragment>`);
    };
    const geo = new THREE.PlaneGeometry(COLS, ROWS, 1, 1);
    geo.setAttribute('uv1', geo.attributes.uv);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(COLS / 2, 0, ROWS / 2);
    mesh.receiveShadow = true;
    G.floorMat = mat;
    return mesh;
}

// --- Vacuum body, visible along the bottom of the frame -------------------------------------------

function buildVacuumBody() {
    const body = new THREE.Group();
    const chrome = new THREE.MeshPhysicalMaterial({ color: '#E6E6E6', metalness: 1, roughness: 0.18 });
    const dark = new THREE.MeshPhysicalMaterial({ color: '#1C1C1C', metalness: 0.2, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    // local +z is ahead of the camera (the group is turned around below); the body's centre sits
    // behind the camera so only the leading crescent of the bumper shows along the bottom edge
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 48, 1, false, -Math.PI * 0.6, Math.PI * 1.2), dark);
    hood.position.set(0, -0.105, -0.2);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 10, 64, Math.PI * 1.2), chrome);
    rim.rotation.x = Math.PI / 2;
    rim.rotation.z = -Math.PI * 0.1 - Math.PI / 2 + Math.PI * 0.5;
    rim.position.set(0, -0.09, -0.2);
    const ringMat = new THREE.MeshPhysicalMaterial({ color: '#1A9A8A', emissive: '#1A9A8A', emissiveIntensity: 2.2, roughness: 0.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.014, 8, 64, Math.PI * 0.9), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = -Math.PI * 0.45 - Math.PI / 2 + Math.PI * 0.5;
    ring.position.set(0, -0.075, -0.2);
    const lensMat = new THREE.MeshPhysicalMaterial({ color: '#FFE2A8', emissive: '#FFE2A8', emissiveIntensity: 0, roughness: 0.2, clearcoat: 1 });
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), lensMat);
    lens.position.set(0, -0.09, 0.235);
    body.add(hood, rim, ring, lens);
    body.rotation.y = Math.PI; // the arc opens towards the viewer; flip so it curves away ahead
    body.userData = { ringMat, lensMat };
    for (const m of body.children) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; }
    return body;
}

// A stand-alone vacuum, seen during the ghost replay
function buildVacuumModel() {
    const g = new THREE.Group();
    const dark = new THREE.MeshPhysicalMaterial({ color: '#1C1C1C', roughness: 0.3, clearcoat: 0.8 });
    const chrome = new THREE.MeshPhysicalMaterial({ color: '#E6E6E6', metalness: 1, roughness: 0.18 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.42, 0.14, 40), dark);
    base.position.y = 0.07;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 10, 48), chrome);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.15;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), chrome);
    dome.position.y = 0.14; dome.scale.y = 0.6;
    const ringMat = new THREE.MeshPhysicalMaterial({ color: '#1A9A8A', emissive: '#1A9A8A', emissiveIntensity: 3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.012, 8, 48), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.155;
    g.add(base, rim, dome, ring);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    g.userData.ringMat = ringMat;
    return g;
}

// --- Scene -----------------------------------------------------------------------------------------

function disposeScene() {
    if (!G.scene) return;
    G.scene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of G.materials.values()) m.dispose();
    G.materials.clear();
    G.tagged = {};
    G.scene = null;
}

function buildScene(levelIndex) {
    disposeScene();
    const theme = s3Theme(levelIndex);
    const scene = new THREE.Scene();
    G.scene = scene;
    G.theme = theme;
    scene.background = new THREE.Color(theme.sky.horizon);
    // Haze: a style can set its own colour and thickness with theme.fog = { color, density }
    scene.fog = theme.fog
        ? new THREE.FogExp2(new THREE.Color(theme.fog.color), theme.fog.density)
        : new THREE.FogExp2(new THREE.Color(theme.time === 'night' ? '#141C26' : theme.sky.horizon).lerp(new THREE.Color(theme.walls), 0.5), 0.011);

    if (!G.tiles) buildTileTexture();
    G.tileCache.fill(-1);
    scene.add(buildFloor(theme));

    for (const p of s3Architecture(levelIndex)) scene.add(buildPart(p, theme));
    for (const item of s3Furniture(levelIndex)) scene.add(buildGroup(item, theme));
    const dock = s3Dock(levelIndex);
    scene.add(buildGroup(dock, theme));

    // Outside: ground, backdrop with the skyline, and a sun that comes in through the window
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: theme.sky.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(COLS / 2, -0.02, -40);
    ground.receiveShadow = true;
    scene.add(ground);
    const backdropTex = getTexture('backdrop:' + theme.name, () => paintBackdrop(theme));
    backdropTex.wrapS = backdropTex.wrapT = THREE.ClampToEdgeWrapping;
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(96, 36), new THREE.MeshBasicMaterial({ map: backdropTex, fog: false }));
    backdrop.position.set(COLS / 2 + 6, 9.8, -34);
    scene.add(backdrop);

    // Lights
    const sunDir = s3SunDirection(theme);
    const sun = new THREE.DirectionalLight(new THREE.Color(theme.sun.color), theme.sun.intensity);
    sun.position.set(COLS / 2 + sunDir[0] * 22, sunDir[1] * 22, ROWS / 2 + sunDir[2] * 22);
    sun.target.position.set(COLS / 2, 0, ROWS / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(QUALITY[G.quality].shadow, QUALITY[G.quality].shadow);
    sun.shadow.camera.left = -11; sun.shadow.camera.right = 11;
    sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
    sun.shadow.camera.near = 2; sun.shadow.camera.far = 50;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    // theme.fill names the colour of the soft light from above, for rooms whose sky is black
    const hemi = new THREE.HemisphereLight(new THREE.Color(theme.fill || theme.sky.zenith), new THREE.Color(theme.sky.ground).lerp(new THREE.Color(theme.walls), 0.5), theme.ambient * 1.1);
    scene.add(hemi);
    const bounce = new THREE.DirectionalLight(new THREE.Color(theme.walls).lerp(new THREE.Color(theme.sun.color), 0.4), theme.sun.intensity * 0.16);
    bounce.position.set(COLS / 2 - sunDir[0] * 10, 3, ROWS / 2 - sunDir[2] * 10);
    bounce.target.position.set(COLS / 2, 1.5, ROWS / 2);
    scene.add(bounce, bounce.target);
    const q = QUALITY[G.quality];
    const lampOn = theme.lamp.on ? theme.lamp.intensity : 0;
    // With lamp shadows on, part of the lamp's light comes from a wide spot that casts them
    // theme.lamp.down: the lamp only shines downwards (a recessed or shaded fitting), so the
    // ceiling above it stays dark. Such a lamp is a spot at every quality.
    const down = !!theme.lamp.down && lampOn > 0;
    const lampShadow = q.lampShadow && lampOn > 0;
    const lamp = new THREE.PointLight(new THREE.Color(theme.lamp.color), down ? 0 : lampShadow ? lampOn * 0.5 : lampOn, 16, 2);
    lamp.position.set(S3_LAMP.x, S3_WALL_H - 1.0, S3_LAMP.z);
    scene.add(lamp);
    let lampSpot = null;
    if (lampShadow || down) {
        lampSpot = new THREE.SpotLight(new THREE.Color(theme.lamp.color), lampOn * (down ? 2.4 : 1.6), 18, 1.25, 0.7, 2);
        lampSpot.position.set(S3_LAMP.x, S3_WALL_H - 0.6, S3_LAMP.z);
        lampSpot.target.position.set(S3_LAMP.x, 0, S3_LAMP.z);
        lampSpot.castShadow = lampShadow;
        lampSpot.shadow.mapSize.set(1024, 1024);
        lampSpot.shadow.bias = -0.0006;
        lampSpot.shadow.normalBias = 0.04;
        lampSpot.shadow.radius = 5;
        lampSpot.shadow.camera.near = 0.4;
        lampSpot.shadow.camera.far = 18;
        scene.add(lampSpot, lampSpot.target);
    }
    // A style's own lights: strips, sconces, crystals. theme.lights = [{ pos, color, intensity, distance }]
    for (const L of (theme.lights || []).slice(0, q.lights)) {
        const pl = new THREE.PointLight(new THREE.Color(L.color), L.intensity, L.distance || 9, 2);
        pl.position.set(L.pos[0], L.pos[1], L.pos[2]);
        scene.add(pl);
    }
    const dockLight = new THREE.PointLight(new THREE.Color('#4FA8FF'), 0.3, 4.5, 2);
    dockLight.position.set(dock.pos[0], 0.5, dock.pos[2]);
    scene.add(dockLight);
    const vac = new THREE.PointLight(new THREE.Color('#1A9A8A'), 0.35, 3.2, 2);
    scene.add(vac);
    const flash = new THREE.SpotLight(new THREE.Color('#FFE2A8'), 0, 14, 0.42, 0.85, 2);
    flash.castShadow = true;
    flash.shadow.mapSize.set(1024, 1024);
    flash.shadow.bias = -0.0005;
    flash.shadow.camera.near = 0.1;
    flash.shadow.camera.far = 16;
    scene.add(flash, flash.target);
    G.lights = { sun, hemi, lamp, lampSpot, dockLight, vac, flash, baseSun: theme.sun.intensity, baseLamp: lamp.intensity, baseLampSpot: lampSpot ? lampSpot.intensity : 0 };

    // The camera with the vacuum's body hanging off it, and a model of the vacuum for the ghost view
    const camera = G.camera;
    camera.clear && camera.children.slice().forEach((c) => camera.remove(c));
    G.body = buildVacuumBody();
    camera.add(G.body);
    scene.add(camera);
    G.vacModel = buildVacuumModel();
    G.vacModel.visible = false;
    scene.add(G.vacModel);
    // The ghost of the player's best run: the same vacuum, see-through, with a gold ring
    G.bestModel = buildVacuumModel();
    G.bestModel.traverse((m) => {
        if (!m.isMesh) return;
        m.material.transparent = true;
        m.material.opacity = 0.4;
        m.material.depthWrite = false;
        m.castShadow = false;
    });
    G.bestModel.userData.ringMat.color.set('#D9A441');
    G.bestModel.userData.ringMat.emissive.set('#D9A441');
    G.bestModel.userData.ringMat.opacity = 0.9;
    G.bestModel.visible = false;
    scene.add(G.bestModel);

    // Mirror camera for the floor's reflection
    const mw = q.mirror || 320, mh = Math.round(mw * 0.75);
    if (G.mirrorTarget && G.mirrorTarget.width !== mw) { G.mirrorTarget.dispose(); G.mirrorTarget = null; }
    G.mirrorTarget = G.mirrorTarget || new THREE.WebGLRenderTarget(mw, mh, { type: THREE.HalfFloatType });
    G.mirrorCamera = G.mirrorCamera || new THREE.PerspectiveCamera();

    // Crumbs on the dirty tiles and the saucer are solid; the beam, motes and intake dust are
    // translucent effects that live in their own scene so the AO and focus passes ignore them
    scene.add(buildDebris(theme));
    if (s3Outside(theme).saucer) scene.add(buildSaucer(theme)); else G.saucer = null;
    const fx = new THREE.Scene();
    fx.add(buildMotes(theme));
    fx.add(buildSunBeam(theme));
    fx.add(buildIntake());
    G.fxScene = fx;

    // Image-based lighting from the room itself
    bakeEnvironment();

    G.level = levelIndex;
    G.frameTimes.length = 0;
    G.scale = 1;
    resize();
}

function bakeEnvironment() {
    const scene = G.scene;
    const cubeRT = new THREE.WebGLCubeRenderTarget(QUALITY[G.quality].env || 128, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(0.1, 60, cubeRT);
    cubeCam.position.set(COLS / 2, 1.3, ROWS / 2);
    const bodyVisible = G.body.visible;
    G.body.visible = false;
    const fog = scene.fog;
    scene.fog = null;
    cubeCam.update(G.renderer, scene);
    scene.fog = fog;
    G.body.visible = bodyVisible;
    if (G.env) G.env.dispose();
    G.env = G.pmrem.fromCubemap(cubeRT.texture).texture;
    cubeRT.dispose();
    scene.environment = G.env;
    scene.environmentIntensity = G.theme && G.theme.env !== undefined ? G.theme.env : 0.32;
}

function buildMotes(theme) {
    const n = 170;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const rnd = seededRandom(theme.floorSeed + 99);
    for (let i = 0; i < n; i++) {
        pos[i * 3] = S3_WINDOW.x0 - 1.5 + rnd() * (S3_WINDOW.x1 - S3_WINDOW.x0 + 3);
        pos[i * 3 + 1] = 0.1 + rnd() * 3.6;
        pos[i * 3 + 2] = 0.2 + rnd() * 6.5;
        seed[i] = rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const sunDir = s3SunDirection(theme);
    const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(...sunDir) }, uWin: { value: new THREE.Vector4(S3_WINDOW.x0, S3_WINDOW.x1, S3_WINDOW.sill, S3_WINDOW.top) }, uColor: { value: new THREE.Color(theme.sun.color) }, uScale: { value: 1 } },
        vertexShader: `
attribute float seed; uniform float uTime; uniform vec3 uSun; uniform vec4 uWin; uniform float uScale;
varying float vLit;
void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.21 + seed * 31.0) * 0.35 + sin(uTime * 0.05 + seed * 7.0) * 0.6;
    p.y += sin(uTime * 0.17 + seed * 17.0) * 0.25;
    p.z += cos(uTime * 0.13 + seed * 23.0) * 0.4 + sin(uTime * 0.04 + seed * 3.0) * 0.6;
    // back-project along the sun to the window plane (z = 0): lit when it lands inside the window
    float t = (0.0 - p.z) / max(0.05, -uSun.z);
    vec2 hit = vec2(p.x + uSun.x * t, p.y + uSun.y * t);
    float inside = step(uWin.x, hit.x) * step(hit.x, uWin.y) * step(uWin.z, hit.y) * step(hit.y, uWin.w);
    vLit = 0.06 + inside * (0.4 + 0.35 * sin(uTime * 1.3 + seed * 50.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.2 + seed * 2.2) * uScale * 14.0 / max(0.5, -mv.z);
}`,
        fragmentShader: `
uniform vec3 uColor; varying float vLit;
void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * vLit;
    gl_FragColor = vec4(uColor * 1.6, a * 0.45);
}`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    G.motes = pts;
    return pts;
}

// --- Post-processing ---------------------------------------------------------------------------

const GradeShader = {
    uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uVignette: { value: 0.32 },
        uGrain: { value: 0.022 },
        uAberration: { value: 0.0032 },
        uBlur: { value: 0 },
        uWarm: { value: new THREE.Vector3(1.03, 1.0, 0.96) },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float uTime, uVignette, uGrain, uAberration, uBlur; uniform vec3 uWarm;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
    vec2 c = vUv - 0.5;
    float r2 = dot(c, c);
    vec2 ab = c * uAberration * (1.0 + r2 * 6.0);
    vec3 col;
    if (uBlur > 0.0005) {
        col = vec3(0.0);
        for (int i = -4; i <= 4; i++) {
            vec2 o = vec2(float(i) * uBlur, 0.0);
            col += vec3(texture2D(tDiffuse, vUv + o + ab).r, texture2D(tDiffuse, vUv + o).g, texture2D(tDiffuse, vUv + o - ab).b);
        }
        col /= 9.0;
    } else {
        col = vec3(texture2D(tDiffuse, vUv + ab).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ab).b);
    }
    col *= uWarm;
    float vig = 1.0 - uVignette * smoothstep(0.15, 0.85, r2 * 2.2);
    col *= vig;
    float g = (hash(vUv * resolution + fract(uTime)) - 0.5) * uGrain;
    col += g;
    gl_FragColor = vec4(col, 1.0);
}`,
};

function buildComposer() {
    const r = G.renderer;
    const size = r.getSize(new THREE.Vector2());
    const composer = new EffectComposer(r);
    const renderPass = new RenderPass(G.scene, G.camera);
    composer.addPass(renderPass);
    const fxPass = new RenderPass(G.fxScene, G.camera);
    fxPass.clear = false;
    composer.addPass(fxPass);
    const ao = new GTAOPass(G.scene, G.camera, size.x, size.y, { radius: 0.35, distanceExponent: 1.5, thickness: 0.6, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    ao.output = GTAOPass.OUTPUT.Default;
    ao.blendIntensity = 0.85;
    composer.addPass(ao);
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.28, 0.6, 0.95);
    composer.addPass(bloom);
    const dof = new BokehPass(G.scene, G.camera, { focus: 3.0, aperture: 0.0009, maxblur: 0.0075 });
    composer.addPass(dof);
    const output = new OutputPass();
    composer.addPass(output);
    const grade = new ShaderPass(GradeShader);
    grade.uniforms.resolution.value.set(size.x, size.y);
    composer.addPass(grade);
    const smaa = new SMAAPass(size.x, size.y);
    composer.addPass(smaa);
    G.composer = composer;
    G.passes = { renderPass, fxPass, ao, bloom, dof, output, grade, smaa };
    applyPassToggles();
}

// --- Per-frame ---------------------------------------------------------------------------------------

function setCameraPose(view, lean, dt, fly) {
    const cam = G.camera;
    // head turn eases towards where the drag left it, and back to straight ahead once moving
    if (view.moving || view.ghost) { look.tx *= Math.max(0, 1 - dt * 4); look.ty *= Math.max(0, 1 - dt * 4); }
    look.yaw += (look.tx - look.yaw) * Math.min(1, dt * 9);
    look.pitch += (look.ty - look.pitch) * Math.min(1, dt * 9);
    const a = view.angle + look.yaw;
    const p = look.pitch;
    const bobT = G.time;
    const bobX = view.moving ? Math.cos(bobT * 7) * 0.006 : 0;
    const bobY = view.moving ? Math.sin(bobT * 14) * 0.008 : Math.sin(bobT * 1.2) * 0.0025;
    cam.position.set(view.camX + Math.cos(a + Math.PI / 2) * bobX, S3_EYE + bobY, view.camY + Math.sin(a + Math.PI / 2) * bobX);
    tmpV.set(cam.position.x + Math.cos(a) * Math.cos(p), cam.position.y - 0.02 + Math.sin(p), cam.position.z + Math.sin(a) * Math.cos(p));
    cam.up.set(0, 1, 0);
    cam.lookAt(tmpV);
    cam.rotateZ(lean); // bank into the turn
    if (fly > 0) applyFlight(cam, fly);
}

// The dive: blend the eye pose with a shot from straight above that frames the board
function applyFlight(cam, fly) {
    eyePos.copy(cam.position);
    eyeQ.copy(cam.quaternion);
    const top = s3TopDownCamera(cam.fov, cam.aspect);
    cam.position.set(top.x, top.y, top.z);
    cam.up.set(0, 0, -1);
    cam.lookAt(top.x, 0, top.z);
    cam.up.set(0, 1, 0);
    topQ.copy(cam.quaternion);
    topPos.copy(cam.position);
    // ease the height more than the glide so the camera swoops rather than slides
    const k = fly;
    cam.position.lerpVectors(eyePos, topPos, k);
    cam.position.y = eyePos.y + (topPos.y - eyePos.y) * k * k;
    cam.quaternion.slerpQuaternions(eyeQ, topQ, k);
}

function renderMirror() {
    const q = QUALITY[G.quality];
    const shader = G.floorMat && G.floorMat.userData.shader;
    if (!shader) return;
    if (!q.reflections) { shader.uniforms.uReflectStrength.value = 0; return; }
    const cam = G.camera, mc = G.mirrorCamera;
    // mirror the camera across the floor plane y = 0
    cam.updateMatrixWorld();
    const pos = cam.getWorldPosition(tmpV);
    mc.position.set(pos.x, -pos.y, pos.z);
    const look = cam.getWorldDirection(tmpV2);
    look.y = -look.y;
    mc.up.set(0, -1, 0);
    mc.lookAt(mc.position.x + look.x, mc.position.y + look.y, mc.position.z + look.z);
    mc.fov = cam.fov; mc.aspect = cam.aspect; mc.near = cam.near; mc.far = cam.far;
    mc.updateProjectionMatrix();
    mc.updateMatrixWorld();
    // texture matrix: clip space -> [0,1]
    const tm = shader.uniforms.uReflectMatrix.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(mc.projectionMatrix);
    tm.multiply(mc.matrixWorldInverse);
    const r = G.renderer;
    const prevTarget = r.getRenderTarget();
    const floor = G.scene.children.find((o) => o.material === G.floorMat);
    const wasBody = G.body.visible;
    G.body.visible = false;
    if (floor) floor.visible = false;
    const prevShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(G.mirrorTarget);
    r.clear();
    r.render(G.scene, mc);
    r.setRenderTarget(prevTarget);
    r.shadowMap.autoUpdate = prevShadow;
    if (floor) floor.visible = true;
    G.body.visible = wasBody;
    shader.uniforms.tReflect.value = G.mirrorTarget.texture;
    shader.uniforms.uReflectStrength.value = (G.theme && G.theme.floorMat && G.theme.floorMat.reflect) || 1;
}

function hexRgb(rgb) {
    return new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
}

// Distance to the first obstacle or wall straight ahead, for the focus pull
function aheadDistance(view) {
    const g = view.grid;
    const dx = Math.cos(view.angle), dz = Math.sin(view.angle);
    let x = view.camX, z = view.camY;
    for (let i = 0; i < 60; i++) {
        x += dx * 0.25; z += dz * 0.25;
        const c = Math.floor(x), r = Math.floor(z);
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return i * 0.25 + 0.5;
        if (g[r][c] === OBSTACLE) return i * 0.25 + 0.3;
    }
    return 15;
}

function render(view, dtMs, fly) {
    if (!G.ready) return null;
    if (!Number.isFinite(view.camX) || !Number.isFinite(view.camY) || !Number.isFinite(view.angle)) return G.canvas; // a bad pose: keep the last frame
    fly = fly || 0;
    if (G.level !== currentLevel || !G.scene) {
        buildScene(currentLevel);
        if (!G.composer) buildComposer();
        else { G.passes.renderPass.scene = G.scene; G.passes.fxPass.scene = G.fxScene; G.passes.ao.scene = G.scene; G.passes.dof.scene = G.scene; }
    }
    const dt = Math.min(0.1, (dtMs || 16) / 1000);
    G.time += dt;
    const q = QUALITY[G.quality];
    const theme = G.theme;

    updateTiles(view);

    // Turn rate drives a little bank and a touch of horizontal blur
    let dA = view.angle - G.lastAngle;
    while (dA > Math.PI) dA -= Math.PI * 2;
    while (dA < -Math.PI) dA += Math.PI * 2;
    G.lastAngle = view.angle;
    const turnRate = dA / Math.max(0.004, dt);
    const leanTarget = Math.max(-0.07, Math.min(0.07, -turnRate * 0.012));
    G.lean += (leanTarget - G.lean) * Math.min(1, dt * 8);
    G.turnBlur += (Math.min(0.006, Math.abs(turnRate) * 0.0018) - G.turnBlur) * Math.min(1, dt * 10);
    setCameraPose(view, G.lean, dt, fly);
    updateIntake(view, dt);
    updateSaucer();

    // Lights that follow the vacuum
    const glow = hexRgb(view.glow);
    G.lights.vac.color.copy(glow);
    G.lights.vac.position.set(view.camX, 0.12, view.camY);
    G.lights.vac.intensity = view.ghost ? 0.5 : 0.35;
    G.body.userData.ringMat.color.copy(glow);
    G.body.userData.ringMat.emissive.copy(glow);
    const flashOn = !view.ghost && design.flashOn;
    const flash = G.lights.flash;
    flash.intensity = flashOn ? 3.2 : 0;
    if (flashOn) {
        flash.color.copy(hexRgb(design.flashRgb));
        flash.position.set(view.camX + Math.cos(view.angle) * 0.3, 0.2, view.camY + Math.sin(view.angle) * 0.3);
        flash.target.position.set(view.camX + Math.cos(view.angle) * 6, -0.6, view.camY + Math.sin(view.angle) * 6);
        G.body.userData.lensMat.emissive.copy(hexRgb(design.flashRgb));
        G.body.userData.lensMat.emissiveIntensity = 4;
    } else {
        G.body.userData.lensMat.emissiveIntensity = 0;
    }
    G.body.visible = !view.ghost && fly < 0.02;
    G.vacModel.visible = !!view.ghost || fly >= 0.02;
    if (fly >= 0.02 && !view.ghost) {
        G.vacModel.position.set(view.camX, 0, view.camY);
        G.vacModel.rotation.y = -view.angle;
        G.vacModel.userData.ringMat.color.copy(glow);
        G.vacModel.userData.ringMat.emissive.copy(glow);
    }
    G.bestModel.visible = !!view.best && !view.ghost;
    if (view.best) {
        G.bestModel.position.set(view.best.x, 0, view.best.y);
        G.bestModel.rotation.y = -view.best.angle;
    }
    if (view.ghost) {
        G.vacModel.position.set(roomba.drawX / TILE, 0, roomba.drawY / TILE);
        G.vacModel.rotation.y = -fpAngle;
        G.vacModel.userData.ringMat.color.copy(hexRgb(design.lightRgb));
        G.vacModel.userData.ringMat.emissive.copy(hexRgb(design.lightRgb));
    }

    // Sky: clouds drift across the sun; lamps hum
    const cloud = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(G.time * 0.11) * Math.sin(G.time * 0.047 + 1.7));
    G.lights.sun.intensity = G.lights.baseSun * cloud;
    G.lights.lamp.intensity = G.lights.baseLamp * (0.96 + 0.04 * Math.sin(G.time * 9.1) * Math.sin(G.time * 3.3));
    G.lights.dockLight.intensity = 0.26 + 0.1 * Math.sin(G.time * 2.4);
    if (G.motes) { G.motes.material.uniforms.uTime.value = G.time; G.motes.material.uniforms.uScale.value = G.basePixelRatio * q.scale * G.scale; }
    if (G.beam) { G.beam.material.uniforms.uTime.value = G.time; G.beam.material.uniforms.uStrength.value = (theme.time === 'night' ? 0.08 : 0.36) * cloud; }

    // Tagged animations
    const T = G.tagged;
    // The dock's beacon blinks in proportion to its own glow: a small bulb flashes hard, a big
    // crystal only brightens, so it never floods the view when the vacuum faces it
    if (T.blink) {
        const on = Math.sin(G.time * 3) > 0.6;
        for (const m of T.blink) {
            const glow = m.userData.base.glow || 2.5;
            m.material.emissiveIntensity = on ? Math.min(4, glow * 1.6) : Math.min(0.3, glow * 0.25);
        }
    }
    if (T.dockRing) for (const m of T.dockRing) m.material.emissiveIntensity = 0.5 + 0.25 * Math.sin(G.time * 2.4);
    if (T.cat) for (const m of T.cat) m.scale.y = m.userData.base.sy * (1 + 0.045 * Math.sin(G.time * 1.9));
    if (T.catHead) for (const m of T.catHead) m.position.y = m.userData.base.y + 0.012 * Math.sin(G.time * 1.9);
    if (T.slat) T.slat.forEach((m, i) => { m.rotation.x = m.userData.base.rx + 0.02 * Math.sin(G.time * 0.7 + i * 0.3); });
    // For the style packs: things that turn, breathe light, or hover
    if (T.spin) for (const m of T.spin) m.rotateY(dt * m.userData.speed);
    if (T.pulse) T.pulse.forEach((m, i) => { m.material.emissiveIntensity = m.userData.base.glow * (0.72 + 0.28 * Math.sin(G.time * 1.7 + i * 0.9)); });
    if (T.float) T.float.forEach((m, i) => { m.position.y = m.userData.base.y + 0.07 * Math.sin(G.time * 1.1 + i * 1.3); });
    if (T.flicker) T.flicker.forEach((m, i) => { m.material.emissiveIntensity = m.userData.base.glow * (0.82 + 0.18 * Math.sin(G.time * 11 + i * 2.1) * Math.sin(G.time * 7.3 + i)); });
    if (T.clockMinute || T.clockHour) {
        const now = new Date();
        const minutes = now.getMinutes() + now.getSeconds() / 60;
        const hours = (now.getHours() % 12) + minutes / 60;
        if (T.clockMinute) for (const m of T.clockMinute) setClockHand(m, (minutes / 60) * Math.PI * 2, 0.14);
        if (T.clockHour) for (const m of T.clockHour) setClockHand(m, (hours / 12) * Math.PI * 2, 0.09);
    }

    // Ahead-tile highlight and clean glints
    const sh = G.floorMat.userData.shader;
    if (sh) {
        sh.uniforms.uAhead.value.set(view.aheadCol, view.aheadRow);
        sh.uniforms.uAheadColor.value.copy(glow).multiplyScalar(0.7);
        const arr = sh.uniforms.uGlints.value;
        arr.fill(0);
        let k = 0;
        if (typeof tileCleanFade !== 'undefined' && tileCleanFade) {
            for (const key in tileCleanFade) {
                if (k >= 8) break;
                const f = tileCleanFade[key];
                if (!(f > 0)) continue;
                const [c, r] = key.split(',').map(Number);
                arr[k * 3] = c; arr[k * 3 + 1] = r; arr[k * 3 + 2] = Math.min(1, f);
                k++;
            }
        }
    }

    // Exposure: facing the window brightens the frame, then the eye settles
    const toWindow = Math.cos(view.angle + Math.PI / 2); // 1 when facing north
    const windowWeight = Math.max(0, toWindow) * Math.max(0, 1 - Math.abs(view.camX - (S3_WINDOW.x0 + S3_WINDOW.x1) / 2) / 9) * Math.max(0, 1 - view.camY / 12);
    const targetExposure = (theme.exposure || (theme.time === 'night' ? 1.12 : 1.14)) - windowWeight * 0.3 - (flashOn ? 0.18 : 0) - fly * 0.42;
    G.exposure += (targetExposure - G.exposure) * Math.min(1, dt * (fly > 0 ? 6 : 2.2));
    G.renderer.toneMappingExposure = G.exposure;

    // Focus follows what is ahead (and the whole room while flying)
    const want = fly > 0.02 ? 12 : Math.min(10, aheadDistance(view));
    G.focus += (want - G.focus) * Math.min(1, dt * 3);
    if (G.passes.dof) { G.passes.dof.uniforms.focus.value = G.focus; G.passes.dof.uniforms.aperture.value = 0.0012 / Math.max(1, G.focus * 0.5); }
    if (G.passes.grade) {
        G.passes.grade.uniforms.uTime.value = G.time;
        G.passes.grade.uniforms.uBlur.value = G.turnBlur;
        // A style can grade its own picture: theme.grade = [r, g, b], theme.vignette, theme.bloom = [strength, radius, threshold]
        if (theme.grade) G.passes.grade.uniforms.uWarm.value.set(theme.grade[0], theme.grade[1], theme.grade[2]);
        else G.passes.grade.uniforms.uWarm.value.set(theme.time === 'night' ? 0.94 : 1.03, 1.0, theme.time === 'night' ? 1.08 : 0.96);
        G.passes.grade.uniforms.uVignette.value = theme.vignette === undefined ? 0.32 : theme.vignette;
    }
    if (G.passes.bloom) {
        const b = theme.bloom || [0.28, 0.6, 0.95];
        G.passes.bloom.strength = b[0]; G.passes.bloom.radius = b[1]; G.passes.bloom.threshold = b[2];
    }

    const t0 = performance.now();
    renderMirror();
    G.composer.render();
    const cpu = performance.now() - t0;
    G.perf.cpuMs += (cpu - G.perf.cpuMs) * 0.1;
    if (dtMs > 0 && dtMs < 120) G.perf.dtMs += (dtMs - G.perf.dtMs) * 0.1;
    adapt(cpu, dtMs);
    return G.canvas;
}

function setClockHand(m, angle, len) {
    const yaw = m.rotation.y;
    m.rotation.set(0, yaw, -angle);
    m.rotateOnWorldAxis(UP, 0);
    m.scale.y = len / 0.1;
    // move so the hand pivots around its base
    const base = m.userData.base;
    m.position.y = base.y + (Math.cos(angle) * len) / 2;
    const side = (Math.sin(angle) * len) / 2;
    m.position.x = m.userData.cx === undefined ? (m.userData.cx = m.position.x) : m.userData.cx;
    m.position.z = m.userData.cz === undefined ? (m.userData.cz = m.position.z) : m.userData.cz;
    const fx = Math.cos(yaw) * side, fz = -Math.sin(yaw) * side;
    m.position.x += fx; m.position.z += fz;
}

// Drop the internal resolution when frames run long, raise it back when there is headroom
function adapt(cpuMs, dtMs) {
    const ft = G.frameTimes;
    if (dtMs > 0 && dtMs < 120) ft.push(dtMs);
    if (ft.length < 50) return;
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    ft.length = 0;
    if (avg > 19.5 && G.scale > 0.55) { G.scale = Math.max(0.55, G.scale * 0.85); resize(); }
    else if (avg < 11 && G.scale < 1) { G.scale = Math.min(1, G.scale * 1.12); resize(); }
}

function warm() {
    if (!G.ready) return;
    try {
        if (G.level !== currentLevel || !G.scene) {
            buildScene(currentLevel);
            if (!G.composer) buildComposer();
            else { G.passes.renderPass.scene = G.scene; G.passes.fxPass.scene = G.fxScene; G.passes.ao.scene = G.scene; G.passes.dof.scene = G.scene; }
        }
        G.renderer.compile(G.scene, G.camera);
        G.renderer.compile(G.fxScene, G.camera);
    } catch (e) {
        console.warn('3D warm-up failed', e);
    }
}

function setDensity(dpr) {
    const want = Math.min(dpr || 1, 2);
    if (Math.abs(want - G.basePixelRatio) < 0.01) return;
    G.basePixelRatio = want;
    if (G.renderer) resize();
}

G.lean = 0;
init();

window.gl3d = {
    get ready() { return G.ready; },
    get canvas() { return G.canvas; },
    get quality() { return G.quality; },
    get level() { return G.level; },
    get scale() { return G.scale; },
    render,
    warm,
    lookDrag,
    lookRelease,
    setQuality,
    setDensity,
    invalidate() { G.level = -1; },
    theme: s3Theme,
    debug: G,
};
