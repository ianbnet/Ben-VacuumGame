// === VACUUM DESIGN ===
// Colour wheels for the vacuum's lights and its flashlight. Classic script sharing globals;
// nothing here touches the DOM at load time, so tests can load it headlessly.

const DESIGN_KEY = 'ben-vacuum-game.design.v1';
const DESIGN_DEFAULTS = { lightColor: '#1A9A8A', flashOn: false, flashColor: '#FFE2A8', renderer: 'gl', quality: 'high' };
const RENDERERS = ['gl', 'classic'];
const QUALITIES = ['low', 'medium', 'high', 'ultra'];

// Current settings plus derived RGB triples the renderers read every frame
const design = {
    lightColor: DESIGN_DEFAULTS.lightColor,
    flashOn: DESIGN_DEFAULTS.flashOn,
    flashColor: DESIGN_DEFAULTS.flashColor,
    renderer: DESIGN_DEFAULTS.renderer,
    quality: DESIGN_DEFAULTS.quality,
    lightRgb: [26, 154, 138],
    flashRgb: [255, 226, 168],
};
let designPanelOpen = false;
let designWheels = null; // { lights, flash } once the UI exists

// --- Colour maths ------------------------------------------------------------

function isHexColor(s) {
    return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}

function hexToRgb(hex) {
    if (!isHexColor(hex)) return null;
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

// h in degrees, s and v in 0..1
function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d > 0) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex(h, s, v) {
    const [r, g, b] = hsvToRgb(h, s, v);
    return rgbToHex(r, g, b);
}

function hexToHsv(hex) {
    const rgb = hexToRgb(hex);
    return rgb ? rgbToHsv(rgb[0], rgb[1], rgb[2]) : { h: 0, s: 0, v: 1 };
}

// --- Settings ------------------------------------------------------------------

function designApply() {
    design.lightRgb = hexToRgb(design.lightColor) || hexToRgb(DESIGN_DEFAULTS.lightColor);
    design.flashRgb = hexToRgb(design.flashColor) || hexToRgb(DESIGN_DEFAULTS.flashColor);
    updateDesignUI();
}

function designLoad() {
    try {
        const raw = localStorage.getItem(DESIGN_KEY);
        if (raw) {
            const s = JSON.parse(raw);
            if (s && typeof s === 'object') {
                if (isHexColor(s.lightColor)) design.lightColor = s.lightColor.toUpperCase();
                if (isHexColor(s.flashColor)) design.flashColor = s.flashColor.toUpperCase();
                design.flashOn = !!s.flashOn;
                if (RENDERERS.includes(s.renderer)) design.renderer = s.renderer;
                if (QUALITIES.includes(s.quality)) design.quality = s.quality;
            }
        }
    } catch (e) {
        // storage blocked or corrupt: keep defaults
    }
    designApply();
}

function designSave() {
    try {
        localStorage.setItem(DESIGN_KEY, JSON.stringify({
            lightColor: design.lightColor,
            flashOn: design.flashOn,
            flashColor: design.flashColor,
            renderer: design.renderer,
            quality: design.quality,
        }));
    } catch (e) {
        // storage blocked
    }
}

function setLightColor(hex) {
    if (!isHexColor(hex)) return;
    design.lightColor = hex.toUpperCase();
    designSave();
    designApply();
}

function setFlashColor(hex) {
    if (!isHexColor(hex)) return;
    design.flashColor = hex.toUpperCase();
    designSave();
    designApply();
}

function toggleFlashlight(on) {
    design.flashOn = on === undefined ? !design.flashOn : !!on;
    designSave();
    designApply();
}

// Graphics: which 3D renderer draws the first-person view, and how hard it works
function setRenderer(name) {
    if (!RENDERERS.includes(name)) return;
    design.renderer = name;
    designSave();
    updateDesignUI();
    if (typeof warmUp3d === 'function') setTimeout(warmUp3d, 0);
}

function setQuality(name) {
    if (!QUALITIES.includes(name)) return;
    design.quality = name;
    designSave();
    if (typeof window !== 'undefined' && window.gl3d && window.gl3d.ready) window.gl3d.setQuality(name);
    updateDesignUI();
}

function designReset() {
    design.lightColor = DESIGN_DEFAULTS.lightColor;
    design.flashColor = DESIGN_DEFAULTS.flashColor;
    design.flashOn = DESIGN_DEFAULTS.flashOn;
    designSave();
    designApply();
    if (designWheels) {
        designWheels.lights.setColor(design.lightColor);
        designWheels.flash.setColor(design.flashColor);
    }
}

// --- Colour wheel widget -----------------------------------------------------------

// A hue/saturation disc at full brightness. Click or drag to pick; arrow keys nudge.
function createColorWheel(canvasEl, { color, onChange, label }) {
    const size = canvasEl.width; // CSS pixels requested by the markup
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvasEl.width = Math.round(size * dpr);
    canvasEl.height = Math.round(size * dpr);
    canvasEl.style.width = `${size}px`;
    canvasEl.style.height = `${size}px`;
    const c = canvasEl.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = size / 2, cy = size / 2, radius = size / 2 - 3;
    let hsv = hexToHsv(color);
    let dragging = false;

    // The disc itself never changes, so draw it once to its own canvas
    const disc = document.createElement('canvas');
    disc.width = canvasEl.width;
    disc.height = canvasEl.height;
    const dc = disc.getContext('2d');
    dc.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let deg = 0; deg < 360; deg += 2) {
        const a0 = ((deg - 1) * Math.PI) / 180, a1 = ((deg + 1.5) * Math.PI) / 180;
        dc.fillStyle = `hsl(${deg}, 100%, 50%)`;
        dc.beginPath();
        dc.moveTo(cx, cy);
        dc.arc(cx, cy, radius, a0, a1);
        dc.closePath();
        dc.fill();
    }
    const white = dc.createRadialGradient(cx, cy, 0, cx, cy, radius);
    white.addColorStop(0, 'rgba(255,255,255,1)');
    white.addColorStop(1, 'rgba(255,255,255,0)');
    dc.fillStyle = white;
    dc.beginPath();
    dc.arc(cx, cy, radius, 0, Math.PI * 2);
    dc.fill();

    function draw() {
        c.clearRect(0, 0, size, size);
        c.drawImage(disc, 0, 0, size, size);
        c.strokeStyle = 'rgba(0,0,0,0.35)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(cx, cy, radius, 0, Math.PI * 2);
        c.stroke();
        // handle
        const a = (hsv.h * Math.PI) / 180;
        const hx = cx + Math.cos(a) * hsv.s * radius;
        const hy = cy + Math.sin(a) * hsv.s * radius;
        c.fillStyle = hsvToHex(hsv.h, hsv.s, 1);
        c.strokeStyle = '#FFF';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(hx, hy, 6, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.strokeStyle = 'rgba(0,0,0,0.5)';
        c.lineWidth = 1;
        c.beginPath();
        c.arc(hx, hy, 7.5, 0, Math.PI * 2);
        c.stroke();
    }

    function emit() {
        const hex = hsvToHex(hsv.h, hsv.s, 1);
        canvasEl.setAttribute('aria-valuetext', `${label} ${hex}`);
        onChange(hex);
    }

    function pick(ev) {
        const rect = canvasEl.getBoundingClientRect();
        const scale = size / rect.width; // the panel may be scaled on phones
        const dx = (ev.clientX - rect.left) * scale - cx;
        const dy = (ev.clientY - rect.top) * scale - cy;
        hsv.h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        hsv.s = Math.min(1, Math.sqrt(dx * dx + dy * dy) / radius);
        draw();
        emit();
    }

    canvasEl.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        dragging = true;
        canvasEl.setPointerCapture(ev.pointerId);
        pick(ev);
    });
    canvasEl.addEventListener('pointermove', (ev) => { if (dragging) pick(ev); });
    const stop = () => { dragging = false; };
    canvasEl.addEventListener('pointerup', stop);
    canvasEl.addEventListener('pointercancel', stop);
    canvasEl.addEventListener('keydown', (ev) => {
        let used = true;
        if (ev.key === 'ArrowLeft') hsv.h = (hsv.h + 354) % 360;
        else if (ev.key === 'ArrowRight') hsv.h = (hsv.h + 6) % 360;
        else if (ev.key === 'ArrowUp') hsv.s = Math.min(1, hsv.s + 0.05);
        else if (ev.key === 'ArrowDown') hsv.s = Math.max(0, hsv.s - 0.05);
        else used = false;
        if (used) {
            ev.preventDefault();
            ev.stopPropagation();
            draw();
            emit();
        }
    });

    draw();
    return {
        setColor(hex) {
            hsv = hexToHsv(hex);
            draw();
        },
        redraw: draw,
    };
}

// --- Panel -----------------------------------------------------------------------

function updateDesignUI() {
    if (typeof document === 'undefined') return;
    const swL = document.getElementById('swatchLights');
    const swF = document.getElementById('swatchFlash');
    const hexL = document.getElementById('hexLights');
    const hexF = document.getElementById('hexFlash');
    const toggle = document.getElementById('flashToggle');
    const flashField = document.getElementById('flashField');
    if (swL) swL.style.background = design.lightColor;
    if (swF) swF.style.background = design.flashColor;
    if (hexL) hexL.textContent = design.lightColor;
    if (hexF) hexF.textContent = design.flashColor;
    if (toggle) toggle.checked = design.flashOn;
    if (flashField) flashField.classList.toggle('is-off', !design.flashOn);
    const rendererSel = document.getElementById('rendererSelect');
    const qualitySel = document.getElementById('qualitySelect');
    const glOk = typeof window !== 'undefined' && window.gl3d && window.gl3d.ready;
    if (rendererSel) {
        rendererSel.value = design.renderer;
        const glOpt = rendererSel.querySelector('option[value="gl"]');
        if (glOpt && !glOk) { glOpt.disabled = true; glOpt.textContent = 'Modern (unavailable here)'; }
    }
    if (qualitySel) { qualitySel.value = design.quality; qualitySel.disabled = design.renderer === 'classic' || !glOk; }
    const btn = document.getElementById('btnDesign');
    if (btn) btn.setAttribute('aria-expanded', designPanelOpen ? 'true' : 'false');
}

function toggleDesignPanel(open) {
    designPanelOpen = open === undefined ? !designPanelOpen : !!open;
    const panel = document.getElementById('designPanel');
    if (panel) {
        panel.hidden = !designPanelOpen;
        if (designPanelOpen && designWheels) {
            designWheels.lights.redraw();
            designWheels.flash.redraw();
        }
    }
    updateDesignUI();
}

function initDesignUI() {
    const wheelL = document.getElementById('wheelLights');
    const wheelF = document.getElementById('wheelFlash');
    if (!wheelL || !wheelF) return;
    designWheels = {
        lights: createColorWheel(wheelL, { color: design.lightColor, onChange: setLightColor, label: 'Vacuum lights' }),
        flash: createColorWheel(wheelF, { color: design.flashColor, onChange: setFlashColor, label: 'Flashlight' }),
    };
    const toggle = document.getElementById('flashToggle');
    if (toggle) toggle.addEventListener('change', () => toggleFlashlight(toggle.checked));
    const rendererSel = document.getElementById('rendererSelect');
    if (rendererSel) rendererSel.addEventListener('change', () => { setRenderer(rendererSel.value); rendererSel.blur(); });
    const qualitySel = document.getElementById('qualitySelect');
    if (qualitySel) qualitySel.addEventListener('change', () => { setQuality(qualitySel.value); qualitySel.blur(); });
    if (typeof window !== 'undefined' && window.gl3d && window.gl3d.ready) window.gl3d.setQuality(design.quality);
    const reset = document.getElementById('btnDesignReset');
    if (reset) reset.addEventListener('click', () => { designReset(); reset.blur(); });
    const btn = document.getElementById('btnDesign');
    if (btn) btn.addEventListener('click', () => { toggleDesignPanel(); btn.blur(); });
    const close = document.getElementById('btnDesignClose');
    if (close) close.addEventListener('click', () => { toggleDesignPanel(false); close.blur(); });
    updateDesignUI();
}
