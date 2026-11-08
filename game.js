// === GAME ===
// Classic script sharing globals: state, level setup, movement rules, input, saved progress,
// level select and the frame loop. Loaded last (see index.html).

// === GAME STATE ===
let canvas, ctx;
let canvasDpr = 1; // device pixel ratio the canvas backing store is scaled by
let lastInputAt = 0; // when the player last pressed or dragged anything (the 3D HUD fades when idle)
let lookDragged = false; // the current pointer gesture was a look-around drag, not a click
let glFailures = 0; // frames the GPU renderer has thrown on; three in a row and Classic takes over
let fullscreenFallback = false; // full-screen layout without the browser API (iPhone Safari)
let fullscreenTimer = null;
let resizeTimer = null;
let grid = [];
let roomba = { col: 0, row: 0, dir: 'right', battery: 100, drawX: 0, drawY: 0 };
let currentLevel = 0;
let totalDirty = 0;
let cleaned = 0;
let moves = 0;
let score = 0;
let parMoves = 0;
let parPath = []; // full path for NPC replay
let parApproachLen = 0; // steps before NPC reaches charger and starts cleaning
let gameState = 'PLAYING'; // PLAYING, LEVEL_COMPLETE, GAME_OVER, PAR_REPLAY
let bumpFlash = 0;
let chargerPulse = 0;
let cleanAnimations = [];
let roombaWheelAngle = 0; // for spinning wheels
let tileCleanFade = {}; // tracks fade-in progress for recently cleaned tiles
let levelStartScore = 0; // score when the level began; restored on restart so tiles can't pay twice
let levelResult = null;  // summary shown on the Level Complete overlay
let lastFrameTime = 0;
let dtMs = FRAME_MS;     // elapsed ms since the previous frame (clamped)
let dtFrames = 1;        // the same, in units of 60 fps frames
let bannerText = '';
let bannerTimer = 0;     // ms left to show the level banner
let helpVisible = false;
let chargerDistGrid = null; // BFS distance from every tile to the nearest charging tile, for the "dock N moves" hint
let chargingPadGrid = null; // 1 where a tile charges the vacuum (the dock, plus its pad once upgraded)

// Saved progress (localStorage): highest level reached, best result per level, upgrade points and levels
const SAVE_KEY = 'ben-vacuum-game.progress.v1';
let progress = { unlocked: 0, best: {}, bestScore: 0, points: 0, upgrades: {} };

// === FIRST-PERSON MODE ===
let viewMode = 'TD'; // 'TD' = top-down, 'FP' = first-person
let fpAngle = -Math.PI / 2; // camera facing angle (starts north/up)
let fpTargetAngle = -Math.PI / 2;
let obstacleTypeMap = []; // 2D array: obstacleTypeMap[row][col] = type string or null

// NPC replay state
let npcReplay = {
    active: false,
    stepIndex: 0,
    col: 0,
    row: 0,
    dir: 'up',
    timer: 0,
    grid: null, // separate grid for NPC cleaning
    trailAlpha: [], // fading trail positions
    wheelAngle: 0,
    drawX: 0, // smooth interpolated position
    drawY: 0,
};
const NPC_STEP_INTERVAL = 195; // ms between NPC steps (50% slower)

// Press-and-hold state
let heldDir = null;
let holdInterval = null;
let keysDown = new Set();

// DOM elements
let elCleaned, elMoves, elScore, elBatteryFill, elBatteryText, elLevelNum, elBtnRestart, elParCount, elBtnView, elBtnHelp,
    elDockDist, elSrStatus;

// === INITIALIZATION ===
function initLevel(levelIndex) {
    const level = LEVELS[levelIndex];
    grid = [];
    for (let r = 0; r < ROWS; r++) {
        grid[r] = [];
        for (let c = 0; c < COLS; c++) {
            grid[r][c] = DIRTY;
        }
    }

    for (const obs of level.obstacles) {
        for (let dr = 0; dr < obs.h; dr++) {
            for (let dc = 0; dc < obs.w; dc++) {
                grid[obs.row + dr][obs.col + dc] = OBSTACLE;
            }
        }
    }

    grid[level.charger.row][level.charger.col] = CHARGER;

    // Build obstacle type lookup map for raycaster
    obstacleTypeMap = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    for (const obs of level.obstacles) {
        for (let dr = 0; dr < obs.h; dr++)
            for (let dc = 0; dc < obs.w; dc++)
                obstacleTypeMap[obs.row + dr][obs.col + dc] = obs.type;
    }

    roomba.col = level.charger.col;
    roomba.row = level.charger.row;
    roomba.dir = 'up';
    roomba.battery = batteryMax();
    roomba.drawX = level.charger.col * TILE + TILE / 2;
    roomba.drawY = level.charger.row * TILE + TILE / 2;
    // Keep the first-person camera in step with the Roomba's facing
    fpTargetAngle = FP_ANGLE_MAP[roomba.dir];
    fpAngle = fpTargetAngle;

    totalDirty = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] === DIRTY) totalDirty++;
        }
    }

    cleaned = 0;
    moves = 0;
    score = levelStartScore;
    levelResult = null;
    gameState = 'PLAYING';
    bumpFlash = 0;
    cleanAnimations = [];
    tileCleanFade = {};
    bannerText = level.name;
    bannerTimer = BANNER_MS;
    stopHold();

    const parResult = computeParRoute(levelIndex);
    parMoves = parResult.totalMoves;
    parPath = parResult.fullPath;
    parApproachLen = parResult.approachLength;
    npcReplay.active = false;

    applyUpgrades();
    buildLevelSelect();
    updateUI();
    // Get the 3D view ready for this level while the banner is up
    if (typeof fpWarmUp === 'function' && typeof requestAnimationFrame === 'function') setTimeout(warmUp3d, 80);
}

// Everything that depends on the upgrade levels: which tiles charge, and how far home is from
// every tile. Called on level start and again whenever an upgrade is bought.
function applyUpgrades() {
    if (!grid.length) return;
    const tiles = chargingTiles();
    chargingPadGrid = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
    for (const t of tiles) chargingPadGrid[t.row][t.col] = 1;
    chargerDistGrid = bfsFromSources(grid, tiles);
    updateUI();
}

// --- Saved progress ---------------------------------------------------------

function loadProgress() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s && typeof s === 'object') {
            progress.unlocked = Math.min(LEVELS.length - 1, Math.max(0, s.unlocked | 0));
            progress.best = s.best && typeof s.best === 'object' ? s.best : {};
            progress.bestScore = s.bestScore | 0;
            progress.points = Math.max(0, s.points | 0);
            progress.upgrades = sanitizeUpgrades(s.upgrades);
        }
    } catch (e) {
        // Storage blocked or corrupt: play without saving
    }
}

function saveProgress() {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
    } catch (e) {
        // Storage blocked: nothing to do
    }
}

function recordLevelResult(levelIndex, result) {
    const prev = progress.best[levelIndex];
    progress.best[levelIndex] = {
        moves: prev ? Math.min(prev.moves, result.moves) : result.moves,
        stars: prev ? Math.max(prev.stars, result.stars) : result.stars,
    };
    progress.unlocked = Math.max(progress.unlocked, Math.min(levelIndex + 1, LEVELS.length - 1));
    progress.bestScore = Math.max(progress.bestScore, score);
    saveProgress();
}

// --- Level select ------------------------------------------------------------

function buildLevelSelect() {
    const el = document.getElementById('levelSelect');
    if (!el) return;
    el.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'level-label';
    label.textContent = 'Levels';
    el.appendChild(label);
    LEVELS.forEach((lv, i) => {
        const b = document.createElement('button');
        b.className = 'level-btn' + (i === currentLevel ? ' current' : '');
        b.textContent = String(i + 1);
        const best = progress.best[i];
        b.title = best ? `${lv.name} · best ${best.moves} moves` : lv.name;
        b.setAttribute('aria-label', `Level ${i + 1}: ${lv.name}${best ? `, best ${best.moves} moves` : ''}`);
        b.disabled = i > progress.unlocked;
        if (best) {
            const s = document.createElement('span');
            s.className = 'level-stars';
            s.textContent = '★'.repeat(best.stars);
            b.appendChild(s);
        }
        b.addEventListener('click', () => {
            selectLevel(i);
            b.blur();
        });
        el.appendChild(b);
    });
}

function selectLevel(i) {
    if (i < 0 || i >= LEVELS.length || i > progress.unlocked) return;
    if (i !== currentLevel) levelStartScore = 0; // jumping to another level starts a fresh run
    currentLevel = i;
    npcReplay.active = false;
    helpVisible = false;
    initLevel(i);
}

// === INPUT HANDLING ===
// In FP mode, remap controls: up=forward, down=back, left/right=rotate

// The one movement rule, shared by both views. Returns true if the Roomba moved.
function tryMove(dc, dr) {
    const newCol = roomba.col + dc;
    const newRow = roomba.row + dr;

    if (newCol < 0 || newCol >= COLS || newRow < 0 || newRow >= ROWS || grid[newRow][newCol] === OBSTACLE) {
        bumpFlash = 10;
        sound('bump');
        return false;
    }

    roomba.col = newCol;
    roomba.row = newRow;
    moves++;
    roombaWheelAngle += 0.5;
    noteMove();

    const max = batteryMax();
    const low = lowBatteryLevel();
    const batteryBefore = roomba.battery;
    roomba.battery = Math.max(0, roomba.battery - moveCost());

    if (grid[newRow][newCol] === DIRTY) {
        grid[newRow][newCol] = CLEAN;
        cleaned++;
        score += 10;
        cleanAnimations.push({ col: newCol, row: newRow, progress: 0 });
        tileCleanFade[`${newCol},${newRow}`] = 0; // start fade-in
        sound('clean');
    }

    if (isChargingTile(newCol, newRow)) {
        // The dock (or its pad) fills the battery; overcharge takes it past full
        const target = max * overchargeFactor();
        if (roomba.battery < target) {
            if (roomba.battery < max) sound('dock');
            roomba.battery = target;
        }
    } else {
        // Solar cells trickle-charge on the move, but never past full
        if (roomba.battery < max) roomba.battery = Math.min(max, roomba.battery + solarPerMove());
        if (batteryBefore > low && roomba.battery <= low) sound('lowBattery');
    }

    if (cleaned >= totalDirty) {
        completeLevel();
    } else if (roomba.battery < 0.01) {
        gameState = 'GAME_OVER';
        stopHold();
        sound('gameOver');
    }

    updateUI();
    return true;
}

// Sound hooks; harmless when audio.js is not loaded (tests)
function sound(name) {
    if (typeof sfx !== 'undefined' && sfx[name]) sfx[name]();
}

function noteMove() {
    if (typeof audio !== 'undefined' && typeof performance !== 'undefined') audio.lastMoveAt = performance.now();
}

// Level finished. The bonus is tied to par so the target on screen and the scoring agree.
function completeLevel() {
    const underPar = Math.max(0, parMoves - moves);
    const bonus = 200 + underPar * 10;
    const stars = moves <= parMoves ? 3 : moves <= parMoves * 1.25 ? 2 : 1;
    score += bonus;
    // Upgrade points: one for every star earned on this level for the first time
    const prevBest = progress.best[currentLevel];
    const points = Math.max(0, stars - (prevBest ? prevBest.stars : 0));
    progress.points = (progress.points | 0) + points;
    levelResult = { moves, par: parMoves, bonus, stars, points, tileScore: cleaned * 10, at: chargerPulse };
    gameState = 'LEVEL_COMPLETE';
    stopHold();
    sound('levelComplete');
    recordLevelResult(currentLevel, levelResult);
    buildLevelSelect();
    buildUpgradePanel();
}

// First person: left/right turn 90 degrees in place, up/down drive forward/back relative to facing.
function handleFpDirection(dir) {
    if (dir === 'left' || dir === 'right') {
        let idx = FP_DIR_ORDER.indexOf(roomba.dir);
        if (idx < 0) idx = 0;
        idx = (idx + (dir === 'right' ? 1 : -1) + 4) % 4;
        roomba.dir = FP_DIR_ORDER[idx];
        fpTargetAngle = FP_ANGLE_MAP[roomba.dir];
        sound('turn');
        return;
    }
    const moveDir = dir === 'up' ? roomba.dir : OPPOSITE_DIR[roomba.dir];
    const d = DIR_DELTAS[moveDir];
    tryMove(d.dc, d.dr);
}

function handleDirection(dir) {
    if (gameState !== 'PLAYING' || helpVisible) return;

    if (viewMode === 'FP') {
        handleFpDirection(dir);
        return;
    }

    const d = DIR_DELTAS[dir];
    if (!d) return;

    roomba.dir = dir;
    fpTargetAngle = FP_ANGLE_MAP[dir];
    tryMove(d.dc, d.dr);
}

// === PRESS AND HOLD ===
function startHold(dir) {
    lastInputAt = performance.now();
    if (useGl()) window.gl3d.lookRelease(true);
    if (heldDir === dir) return;
    stopHold();
    heldDir = dir;
    handleDirection(dir);
    // Turning in 3D is one step per press. Auto-repeating it spins the camera.
    if (viewMode === 'FP' && (dir === 'left' || dir === 'right')) return;
    const interval = viewMode === 'FP' ? FP_MOVE_INTERVAL : MOVE_INTERVAL;
    holdInterval = setInterval(() => {
        if (heldDir === dir) {
            handleDirection(dir);
        } else {
            stopHold();
        }
    }, interval);
}

function stopHold() {
    heldDir = null;
    if (holdInterval) {
        clearInterval(holdInterval);
        holdInterval = null;
    }
}

// Works while playing and during the ghost replay
function toggleView() {
    if (gameState !== 'PLAYING' && gameState !== 'PAR_REPLAY') return;
    viewMode = viewMode === 'TD' ? 'FP' : 'TD';
    if (gameState === 'PLAYING') {
        // Snap the camera to the Roomba's real facing so the two views never disagree
        fpTargetAngle = FP_ANGLE_MAP[roomba.dir];
        fpAngle = fpTargetAngle;
    }
    if (typeof fpStartDive === 'function') fpStartDive(viewMode === 'FP' ? 1 : -1);
    stopHold();
    updateViewButtons();
}

// The d-pad means something different in 3D (turn / drive), so say so on the buttons
function updateViewButtons() {
    const fp = viewMode === 'FP';
    if (elBtnView) elBtnView.textContent = fp ? '2D View' : '3D View';
    const btnLeft = document.getElementById('btnLeft');
    const btnRight = document.getElementById('btnRight');
    const btnUp = document.getElementById('btnUp');
    const btnDown = document.getElementById('btnDown');
    if (btnLeft) {
        btnLeft.textContent = fp ? '↶' : '◀';
        btnLeft.setAttribute('aria-label', fp ? 'Turn left' : 'Left');
    }
    if (btnRight) {
        btnRight.textContent = fp ? '↷' : '▶';
        btnRight.setAttribute('aria-label', fp ? 'Turn right' : 'Right');
    }
    if (btnUp) btnUp.setAttribute('aria-label', fp ? 'Forward' : 'Up');
    if (btnDown) btnDown.setAttribute('aria-label', fp ? 'Reverse' : 'Down');
}

// Restart keeps the current view. After the final level it starts the game over.
function restartLevel() {
    if (gameState === 'LEVEL_COMPLETE' && currentLevel === LEVELS.length - 1) {
        currentLevel = 0;
        levelStartScore = 0;
    }
    npcReplay.active = false;
    initLevel(currentLevel);
}

function toggleHelp() {
    helpVisible = !helpVisible;
    stopHold();
}

// Keyboard
const keyMap = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
};

// --- 3D renderer selection -----------------------------------------------------------------

// The GPU renderer (render3d-gl.js) when it loaded and the player has not chosen Classic
function useGl() {
    return design.renderer !== 'classic' && typeof window !== 'undefined' && !!window.gl3d && window.gl3d.ready;
}

// Draw the first-person frame with whichever renderer is active, then the shared HUD
function renderFirstPersonAny(view) {
    if (!useGl()) {
        renderFirstPerson(view);
        return;
    }
    if (!fp3d) initFirstPerson(); // the view model and HUD live in render3d.js
    view = view || fpPlayerView();
    let frame = null;
    const fly = typeof fpDiveFly === 'function' ? fpDiveFly() : 0;
    try {
        frame = window.gl3d.render(view, dtMs, fly);
    } catch (e) {
        glFailures++;
        console.warn(`GPU renderer frame failed (${glFailures})`, e);
        if (glFailures >= 3) {
            console.warn('GPU renderer keeps failing, switching to Classic for this session');
            design.renderer = 'classic';
            if (typeof updateDesignUI === 'function') updateDesignUI();
        }
    }
    if (!frame) {
        renderFirstPerson(view);
        return;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(frame, 0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
    if (bumpFlash > 0) {
        ctx.save();
        ctx.globalAlpha = (bumpFlash / 10) * 0.3;
        const bf = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.3, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.7);
        bf.addColorStop(0, 'rgba(255,0,0,0)');
        bf.addColorStop(1, 'rgba(255,50,50,0.7)');
        ctx.fillStyle = bf;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.restore();
    }
    if (fly < 0.02) {
        if (typeof fpDrawHudGl === 'function') fpDrawHudGl(view);
        else fpDrawHud(view, false);
    }
}

// Pre-build whatever the active 3D renderer needs so the first 3D frame is instant
function warmUp3d() {
    if (typeof fpWarmUp === 'function') fpWarmUp();
    if (useGl()) window.gl3d.warm();
}

// --- Full screen ---------------------------------------------------------------------------

// Backing-store density for a canvas displayed cssWidth CSS pixels wide: the display's pixel
// ratio, scaled up when the canvas is drawn larger than its 720 px layout size, capped at 3
function canvasDensityFor(pixelRatio, cssWidth) {
    const ratio = Math.max(1, pixelRatio || 1);
    const grow = Math.max(1, (cssWidth || CANVAS_W) / CANVAS_W);
    return Math.min(3, ratio * grow);
}

function isFullscreen() {
    return fullscreenFallback || !!(document.fullscreenElement || document.webkitFullscreenElement);
}

// Enter or Escape, or the Full screen button. Uses the browser's full screen where it exists and
// a fixed full-viewport layout where it does not.
function toggleFullscreen() {
    if (isFullscreen()) {
        fullscreenFallback = false;
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
        syncFullscreen();
        return;
    }
    const root = document.documentElement;
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    const useFallback = () => {
        if (isFullscreen()) return;
        fullscreenFallback = true;
        syncFullscreen();
    };
    if (request) {
        const p = request.call(root, { navigationUI: 'hide' });
        if (p && p.catch) p.catch(useFallback);
        // Some embedded browsers neither enter full screen nor refuse; give them a moment, then fill the window
        clearTimeout(fullscreenTimer);
        fullscreenTimer = setTimeout(useFallback, 700);
    } else {
        useFallback();
    }
    syncFullscreen();
}

// Apply the layout class and button label, then match the canvas density to its new size
function syncFullscreen() {
    const on = isFullscreen();
    if (on) clearTimeout(fullscreenTimer);
    document.body.classList.toggle('is-fullscreen', on);
    const btn = document.getElementById('btnFullscreen');
    if (btn) {
        btn.textContent = on ? 'Exit full screen' : 'Full screen';
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    fitCanvasDensity();
}

// Size the canvas backing store to the density it is displayed at (sharp when full screen
// scales it up) and rebuild what depends on that density; the 2D scene layers rebuild themselves
function fitCanvasDensity() {
    if (!canvas) return;
    const cssW = canvas.getBoundingClientRect().width || CANVAS_W;
    const want = canvasDensityFor(window.devicePixelRatio, cssW);
    if (Math.abs(want - canvasDpr) < 0.02) return;
    canvasDpr = want;
    canvas.width = Math.round(CANVAS_W * canvasDpr);
    canvas.height = Math.round(CANVAS_H * canvasDpr);
    ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
    createFloorPatterns();
    if (typeof fp3d !== 'undefined' && fp3d) fp3d.sceneBuf = null;
    if (useGl()) window.gl3d.setDensity(canvasDpr);
}

// Keys pressed inside the design or upgrades panels (wheels, switches, buttons) belong to them
function keyIsForPanel(e) {
    return !!(e.target && e.target.closest && e.target.closest('#designPanel, #upgradePanel'));
}

document.addEventListener('keydown', (e) => {
    if (keyIsForPanel(e)) return;
    lastInputAt = performance.now();

    // F: flashlight on / off
    if (e.key === 'f' || e.key === 'F') {
        if (typeof toggleFlashlight === 'function') {
            toggleFlashlight();
            sound('turn');
        }
        return;
    }

    // H or ? toggles the help screen; Escape closes it; nothing else gets through while it is up
    if (e.key === 'h' || e.key === 'H' || e.key === '?') {
        e.preventDefault();
        toggleHelp();
        return;
    }
    if (helpVisible) {
        if (e.key === 'Escape') toggleHelp();
        return;
    }

    // Enter: full screen on / off (unless a button or control has focus, which Enter should press)
    if (e.key === 'Enter') {
        const t = e.target;
        if (t && t !== document.body && t.closest && t.closest('button, input, select, textarea, a, [tabindex]')) return;
        e.preventDefault();
        toggleFullscreen();
        return;
    }
    // Escape leaves the fallback full-screen layout (the browser handles the real one itself)
    if (e.key === 'Escape' && fullscreenFallback) {
        toggleFullscreen();
        return;
    }

    // G: watch the ghost run the par route, any time; it brings you back where you were
    if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        if (gameState === 'PAR_REPLAY') endParReplay();
        else startParReplay();
        return;
    }

    // U: upgrades panel
    if (e.key === 'u' || e.key === 'U') {
        if (typeof toggleUpgradePanel === 'function') toggleUpgradePanel();
        return;
    }

    // SPACE: skip NPC replay, or next level
    if (e.key === ' ') {
        e.preventDefault();
        if (gameState === 'PAR_REPLAY') {
            endParReplay();
            return;
        }
        if (gameState === 'LEVEL_COMPLETE') {
            nextLevel();
            return;
        }
    }

    // V: toggle first-person view
    if (e.key === 'v' || e.key === 'V') {
        toggleView();
        return;
    }

    // M: mute / unmute
    if (e.key === 'm' || e.key === 'M') {
        if (typeof audioToggleMute === 'function') audioToggleMute();
        return;
    }

    // R: restart the level in the current view (also exits replay)
    if (e.key === 'r' || e.key === 'R') {
        restartLevel();
        return;
    }

    // Movement keys
    const dir = keyMap[e.key];
    if (dir) {
        e.preventDefault();
        if (!keysDown.has(e.key)) {
            keysDown.add(e.key);
            startHold(dir);
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (keyIsForPanel(e)) return;
    const dir = keyMap[e.key];
    if (dir) {
        keysDown.delete(e.key);
        if (heldDir === dir) {
            stopHold();
            // Check if another direction key is still held
            for (const k of keysDown) {
                if (keyMap[k]) {
                    startHold(keyMap[k]);
                    break;
                }
            }
        }
    }
});

// A key released while another window has focus never sends keyup; don't leave the Roomba driving.
window.addEventListener('blur', () => {
    stopHold();
    keysDown.clear();
});

// === NPC PAR REPLAY ===
// Can be watched before, during or after a level; it leaves the player's own game untouched
function startParReplay() {
    if (gameState !== 'PLAYING' && gameState !== 'LEVEL_COMPLETE') return;
    npcReplay.returnState = gameState;
    stopHold();
    gameState = 'PAR_REPLAY';
    // Reset the grid to dirty for the replay
    npcReplay.grid = buildLevelGrid(currentLevel);
    npcReplay.stepIndex = 0;
    npcReplay.col = parPath[0].col;
    npcReplay.row = parPath[0].row;
    npcReplay.dir = 'up';
    npcReplay.active = true;
    npcReplay.timer = 0;
    npcReplay.trailAlpha = [];
    npcReplay.wheelAngle = 0;
    npcReplay.drawX = parPath[0].col * TILE + TILE / 2;
    npcReplay.drawY = parPath[0].row * TILE + TILE / 2;
    npcReplay.angle = FP_ANGLE_MAP.up;
}

function updateNpcReplay() {
    if (!npcReplay.active || gameState !== 'PAR_REPLAY') return;

    // Step every NPC_STEP_INTERVAL ms of real time, whatever the display's refresh rate
    npcReplay.timer += dtMs;
    if (npcReplay.timer < NPC_STEP_INTERVAL) return;
    npcReplay.timer -= NPC_STEP_INTERVAL;

    npcReplay.stepIndex++;
    if (npcReplay.stepIndex >= parPath.length) {
        endParReplay();
        return;
    }

    const step = parPath[npcReplay.stepIndex];
    const prev = { col: npcReplay.col, row: npcReplay.row };

    // Determine direction
    const dc = step.col - prev.col;
    const dr = step.row - prev.row;
    if (dc > 0) npcReplay.dir = 'right';
    else if (dc < 0) npcReplay.dir = 'left';
    else if (dr > 0) npcReplay.dir = 'down';
    else if (dr < 0) npcReplay.dir = 'up';

    npcReplay.col = step.col;
    npcReplay.row = step.row;
    npcReplay.wheelAngle += 0.5;

    // Only clean tiles after the approach phase (NPC walks to charger first without cleaning)
    const isCleaning = npcReplay.stepIndex >= parApproachLen;
    if (isCleaning && npcReplay.grid[step.row][step.col] === DIRTY) {
        npcReplay.grid[step.row][step.col] = CLEAN;
    }

    // Add to trail (different color during approach vs cleaning)
    npcReplay.trailAlpha.push({ col: step.col, row: step.row, alpha: 1.0, approach: !isCleaning });

    // Fade trail
    for (let i = npcReplay.trailAlpha.length - 1; i >= 0; i--) {
        npcReplay.trailAlpha[i].alpha -= 0.02;
        if (npcReplay.trailAlpha[i].alpha <= 0) {
            npcReplay.trailAlpha.splice(i, 1);
        }
    }
}

function endParReplay() {
    npcReplay.active = false;
    gameState = npcReplay.returnState || 'LEVEL_COMPLETE';
    updateUI();
}

// === UI UPDATES ===
function updateUI() {
    if (!elCleaned) return; // headless (tests) or before init
    elCleaned.textContent = `${cleaned} / ${totalDirty}`;
    elMoves.textContent = moves;
    elParCount.textContent = parMoves;
    elScore.textContent = score;
    elLevelNum.textContent = `${currentLevel + 1} · ${LEVELS[currentLevel].name}`;

    const max = batteryMax();
    const pct = Math.max(0, Math.min(100, (roomba.battery / max) * 100));
    elBatteryFill.style.width = pct + '%';
    elBatteryText.textContent = `${Math.round(roomba.battery)} / ${max}`;
    elBatteryFill.classList.toggle('over', roomba.battery > max + 0.5);
    if (pct > 50) {
        elBatteryFill.style.backgroundColor = '#4CAF50';
        elBatteryText.style.color = '#4CAF50';
    } else if (pct > 20) {
        elBatteryFill.style.backgroundColor = '#FFC107';
        elBatteryText.style.color = '#FFC107';
    } else {
        elBatteryFill.style.backgroundColor = '#F44336';
        elBatteryText.style.color = '#F44336';
    }
    elBatteryFill.classList.toggle('low', pct <= 20);
    elBatteryText.classList.toggle('low', pct <= 20);

    // How far home is, and whether the battery still covers it
    const dockDist = chargerDistGrid ? chargerDistGrid[roomba.row][roomba.col] : -1;
    if (elDockDist) {
        elDockDist.textContent = dockDist < 0 ? '--' : dockDist === 0 ? 'here' : `${dockDist} moves`;
        elDockDist.classList.toggle('warn', dockDist > 0 && roomba.battery <= (dockDist + 2) * moveCost());
    }

    // Screen-reader status: every ten tiles, and on every state change
    if (elSrStatus && (cleaned % 10 === 0 || gameState !== 'PLAYING')) {
        const state = gameState === 'LEVEL_COMPLETE' ? 'Level complete. ' : gameState === 'GAME_OVER' ? 'Out of battery. ' : '';
        elSrStatus.textContent = `${state}${cleaned} of ${totalDirty} tiles cleaned, battery ${Math.round(roomba.battery)} of ${max}, dock ${dockDist} moves away.`;
    }
}

// === GAME LOOP ===
// Convert a per-60fps-frame ease factor into one for the real elapsed time
function easeK(k) {
    return 1 - Math.pow(1 - k, dtFrames);
}

function render(timestamp) {
    try {
        renderFrame(timestamp);
    } catch (e) {
        // One bad frame must not freeze the game; report it once and keep going
        if (!render.reported) {
            render.reported = true;
            console.error('render', e);
        }
    }
    requestAnimationFrame(render);
}

function renderFrame(timestamp = performance.now()) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    dtMs = Math.min(100, Math.max(0, timestamp - lastFrameTime)); // clamp so a hidden tab doesn't jump
    lastFrameTime = timestamp;
    dtFrames = dtMs / FRAME_MS;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const fpActive = viewMode === 'FP' &&
        (gameState === 'PLAYING' || gameState === 'LEVEL_COMPLETE' || gameState === 'GAME_OVER');

    if (gameState === 'PAR_REPLAY') {
        updateNpcReplay();
        if (viewMode === 'FP' && gameState === 'PAR_REPLAY') {
            // Ride along with the ghost
            renderFirstPersonAny(fpGhostView());
        } else {
            drawScene(npcReplay.grid, null);
            drawNpcTrail();
            drawLighting();
            drawDustMotes();
            drawBokeh();
            drawNpcVacuum();
        }
        if (gameState === 'PAR_REPLAY') drawNpcOverlay();
        else drawOverlay();
    } else if (fpActive) {
        renderFirstPersonAny();
        drawOverlay();
    } else {
        drawScene(grid, tileCleanFade);
        drawCleanAnimations();
        drawLighting();
        drawDustMotes();
        drawBokeh();
        drawFlashlight2D();
        drawDustPuffs();
        drawRoomba();
        drawOverlay();
    }

    // Dive into, or climb out of, the first-person view
    if (typeof fpDrawDive === 'function') fpDrawDive();

    drawBanner();
    if (helpVisible) drawHelp();

    if (bumpFlash > 0) bumpFlash = Math.max(0, bumpFlash - dtFrames);
    chargerPulse += dtFrames;
    if (bannerTimer > 0) bannerTimer -= dtMs;
    if (typeof audioUpdate === 'function') {
        try { audioUpdate(timestamp); } catch (e) { console.error('audio', e); }
    }
}

// === NEXT LEVEL / RESTART HANDLERS ===
function nextLevel() {
    if (gameState === 'LEVEL_COMPLETE' && currentLevel < LEVELS.length - 1) {
        currentLevel++;
        levelStartScore = score;
        initLevel(currentLevel);
    }
}

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    // Render at the display's native density so lines and text are crisp on 2x screens
    canvasDpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(CANVAS_W * canvasDpr);
    canvas.height = Math.round(CANVAS_H * canvasDpr);
    ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);

    createFloorPatterns();

    elCleaned = document.getElementById('cleanedCount');
    elMoves = document.getElementById('moveCount');
    elScore = document.getElementById('scoreDisplay');
    elBatteryFill = document.getElementById('batteryFill');
    elBatteryText = document.getElementById('batteryText');
    elLevelNum = document.getElementById('levelNum');
    elBtnRestart = document.getElementById('btnRestart');
    elParCount = document.getElementById('parCount');
    elBtnView = document.getElementById('btnViewToggle');
    elBtnHelp = document.getElementById('btnHelp');
    elDockDist = document.getElementById('dockDist');
    elSrStatus = document.getElementById('srStatus');

    // View toggle button (blur afterwards so Space/Enter don't re-trigger it)
    if (elBtnView) {
        elBtnView.addEventListener('click', () => {
            toggleView();
            elBtnView.blur();
        });
    }
    if (elBtnHelp) {
        elBtnHelp.addEventListener('click', () => {
            toggleHelp();
            elBtnHelp.blur();
        });
    }
    const elBtnFull = document.getElementById('btnFullscreen');
    if (elBtnFull) {
        elBtnFull.addEventListener('click', () => {
            toggleFullscreen();
            elBtnFull.blur();
        });
    }
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(fitCanvasDensity, 120);
    });
    const elBtnGhost = document.getElementById('btnGhost');
    if (elBtnGhost) {
        elBtnGhost.addEventListener('click', () => {
            if (gameState === 'PAR_REPLAY') endParReplay();
            else startParReplay();
            elBtnGhost.blur();
        });
    }
    const elBtnMute = document.getElementById('btnMute');
    if (elBtnMute && typeof audioToggleMute === 'function') {
        audioLoadMute();
        audioSetMuted(audio.muted);
        elBtnMute.addEventListener('click', () => {
            audioToggleMute();
            elBtnMute.blur();
        });
    }

    // D-pad buttons - press and hold support
    document.querySelectorAll('.dpad-btn[data-dir]').forEach(btn => {
        const dir = btn.dataset.dir;

        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startHold(dir);
        });
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startHold(dir);
        });
    });

    // Stop hold on mouse/touch release anywhere
    document.addEventListener('mouseup', stopHold);
    document.addEventListener('touchend', stopHold);
    document.addEventListener('touchcancel', stopHold);

    // Restart button
    elBtnRestart.addEventListener('click', () => {
        restartLevel();
        elBtnRestart.blur();
    });

    // Canvas click: close help, or go to the next level
    canvas.addEventListener('click', () => {
        if (lookDragged) return; // a drag to look around is not a click
        if (helpVisible) {
            toggleHelp();
        } else if (gameState === 'LEVEL_COMPLETE') {
            nextLevel();
        }
    });

    // Drag on the board in 3D to look around; the view eases back when you drive
    let lookPointer = null;
    canvas.addEventListener('pointerdown', (e) => {
        if (viewMode !== 'FP' || !useGl()) return;
        lookPointer = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
        lookDragged = false;
        lastInputAt = performance.now();
    });
    canvas.addEventListener('pointermove', (e) => {
        if (!lookPointer || e.pointerId !== lookPointer.id) return;
        const dx = e.clientX - lookPointer.x, dy = e.clientY - lookPointer.y;
        lookPointer.x = e.clientX; lookPointer.y = e.clientY;
        lookPointer.moved += Math.abs(dx) + Math.abs(dy);
        if (lookPointer.moved > 6) {
            lookDragged = true;
            const scale = CANVAS_W / (canvas.getBoundingClientRect().width || CANVAS_W);
            window.gl3d.lookDrag(dx * scale, dy * scale);
            lastInputAt = performance.now();
            e.preventDefault();
        }
    });
    const endLook = (e) => {
        if (!lookPointer || (e && e.pointerId !== lookPointer.id)) return;
        lookPointer = null;
        if (useGl()) window.gl3d.lookRelease(false);
        setTimeout(() => { lookDragged = false; }, 0);
    };
    canvas.addEventListener('pointerup', endLook);
    canvas.addEventListener('pointercancel', endLook);
    canvas.addEventListener('pointerleave', endLook);

    loadProgress();
    if (typeof designLoad === 'function') {
        designLoad();
        initDesignUI();
    }
    currentLevel = progress.unlocked; // resume at the furthest level reached
    initLevel(currentLevel);
    if (typeof initUpgradeUI === 'function') initUpgradeUI();
    updateViewButtons();
    requestAnimationFrame(render);
    if (typeof fpWarmUp === 'function') setTimeout(warmUp3d, 400);
});
