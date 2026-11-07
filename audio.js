// === SOUND ===
// Classic script sharing globals with game.js. Everything is synthesised with Web Audio,
// so there are no sound files. The context starts on the first key press or tap, which is
// what browsers require, and the mute setting is remembered.

const MUTE_KEY = 'ben-vacuum-game.muted';

const audio = {
    ctx: null,
    master: null,
    hum: null,       // { osc, gain } motor hum while driving
    muted: false,
    lastMoveAt: 0,   // ms timestamp of the last successful move, for the hum
    lowWarned: false,
};

function audioLoadMute() {
    try {
        audio.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch (e) {
        audio.muted = false;
    }
}

function audioSaveMute() {
    try {
        localStorage.setItem(MUTE_KEY, audio.muted ? '1' : '0');
    } catch (e) {
        // storage blocked
    }
}

// Create the context on a user gesture; safe to call repeatedly
function audioInit() {
    if (audio.ctx) {
        if (audio.ctx.state === 'suspended') audio.ctx.resume();
        return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = audio.muted ? 0 : 0.5;
    master.connect(ctx.destination);

    // Motor hum: a filtered sawtooth that fades in while moving
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 85;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    const humGain = ctx.createGain();
    humGain.gain.value = 0;
    osc.connect(filter);
    filter.connect(humGain);
    humGain.connect(master);
    osc.start();

    audio.ctx = ctx;
    audio.master = master;
    audio.hum = { osc, gainNode: humGain };
}

function audioSetMuted(muted) {
    audio.muted = muted;
    audioSaveMute();
    if (audio.master) {
        audio.master.gain.setTargetAtTime(muted ? 0 : 0.5, audio.ctx.currentTime, 0.02);
    }
    const btn = document.getElementById('btnMute');
    if (btn) {
        btn.textContent = muted ? 'Sound off' : 'Sound on';
        btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    }
}

function audioToggleMute() {
    audioInit();
    audioSetMuted(!audio.muted);
}

// One oscillator note with a quick envelope
function audioTone(freq, { type = 'sine', duration = 0.1, gain = 0.25, delay = 0, slideTo = null } = {}) {
    if (!audio.ctx || audio.muted) return;
    const ctx = audio.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(audio.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
}

// A short burst of noise, for thuds
function audioNoise({ duration = 0.12, gain = 0.3, delay = 0, cutoff = 400 } = {}) {
    if (!audio.ctx || audio.muted) return;
    const ctx = audio.ctx;
    const t0 = ctx.currentTime + delay;
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(audio.master);
    src.start(t0);
}

const sfx = {
    clean() { audioTone(880, { duration: 0.06, gain: 0.08, slideTo: 1320 }); },
    bump() {
        audioNoise({ duration: 0.1, gain: 0.35, cutoff: 500 });
        audioTone(110, { type: 'triangle', duration: 0.14, gain: 0.3, slideTo: 60 });
    },
    dock() {
        audioTone(660, { duration: 0.12, gain: 0.18 });
        audioTone(990, { duration: 0.2, gain: 0.18, delay: 0.1 });
    },
    lowBattery() {
        audioTone(440, { type: 'square', duration: 0.09, gain: 0.08 });
        audioTone(440, { type: 'square', duration: 0.09, gain: 0.08, delay: 0.16 });
    },
    turn() { audioTone(220, { type: 'triangle', duration: 0.04, gain: 0.05, slideTo: 180 }); },
    levelComplete() {
        [523, 659, 784, 1047].forEach((f, i) => audioTone(f, { duration: 0.16, gain: 0.2, delay: i * 0.09 }));
        audioTone(1319, { duration: 0.4, gain: 0.16, delay: 0.4 });
    },
    gameOver() {
        audioTone(330, { type: 'sawtooth', duration: 0.25, gain: 0.12 });
        audioTone(220, { type: 'sawtooth', duration: 0.45, gain: 0.12, delay: 0.22, slideTo: 140 });
    },
};

// Called every frame: the motor hum follows whether the Roomba moved recently
function audioUpdate(nowMs) {
    if (!audio.hum || !audio.ctx) return;
    const moving = gameState === 'PLAYING' && nowMs - audio.lastMoveAt < 260;
    const target = moving ? 0.09 : 0;
    audio.hum.gainNode.gain.setTargetAtTime(target, audio.ctx.currentTime, moving ? 0.05 : 0.12);
}

// Start audio on the first gesture
document.addEventListener('keydown', audioInit, { once: false });
document.addEventListener('pointerdown', audioInit, { once: false });
document.addEventListener('touchstart', audioInit, { once: false, passive: true });
