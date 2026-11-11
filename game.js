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
let gameState = 'PLAYING'; // PLAYING, LEVEL_COMPLETE, GAME_OVER, PAR_REPLAY, EDITING
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

// Which rooms are being played: the six in the house, the room of the day, or one the player built
let roomMode = 'house';   // 'house' | 'daily' | 'custom'
let houseLevel = 0;       // the house room to come back to
let dailyKey = '';        // the calendar day of the loaded room of the day
let specialKey = '';      // what the loaded extra room's best run is saved under
let runPath = '';         // this run's moves so far, one of U D L R each
let bestGhost = null;     // the best recorded run in this room, replayed alongside the player

// Saved progress (localStorage): highest level reached, best result per level, upgrade points and levels
const SAVE_KEY = 'ben-vacuum-game.progress.v1';
let progress = { unlocked: 0, best: {}, bestScore: 0, points: 0, upgrades: {}, runs: {}, dailyStars: {}, rooms: [], raceBest: true };
const MAX_SAVED_ROOMS = 24;
const MAX_DAILY_RUNS = 150;
const MAX_DAILY_STARS = 800; // days of the room of the day whose stars are remembered as paid for

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
let holdTimer = null;
let lastDpadTouchAt = -Infinity;
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

    runPath = '';
    setupBestGhost();
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
            progress.best = s.best && typeof s.best === 'object' ? s.best : {};
            // A save from a smaller house stops at what was its last room. Finishing a room
            // has earned the next one, so open it now that there is one.
            let reached = Math.max(0, s.unlocked | 0);
            for (const k of Object.keys(progress.best)) {
                if (/^\d+$/.test(k)) reached = Math.max(reached, Number(k) + 1);
            }
            progress.unlocked = Math.min(HOUSE_LEVELS - 1, reached);
            progress.bestScore = s.bestScore | 0;
            progress.points = Math.max(0, s.points | 0);
            progress.upgrades = sanitizeUpgrades(s.upgrades);
            progress.runs = sanitizeRuns(s.runs);
            if (s.dailyStars && typeof s.dailyStars === 'object') progress.dailyStars = sanitizeDailyStars(s.dailyStars);
            else {
                // A save from before rooms of the day paid points: pay now, once, for the
                // stars its saved runs already earned
                progress.dailyStars = {};
                for (const key of Object.keys(progress.runs)) {
                    if (!/^d\d{4}-\d{2}-\d{2}$/.test(key)) continue;
                    progress.dailyStars[key.slice(1)] = progress.runs[key].stars;
                    progress.points += progress.runs[key].stars;
                }
            }
            progress.rooms = sanitizeRooms(s.rooms);
            progress.raceBest = s.raceBest !== false;
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

// Saved runs: a key, the move count, the stars, and the moves themselves
function sanitizeRuns(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const key of Object.keys(raw)) {
        const r = raw[key];
        if (key.length > 40 || !r || typeof r.path !== 'string' || !/^[UDLR]{1,4000}$/.test(r.path)) continue;
        out[key] = { moves: r.path.length, stars: Math.max(1, Math.min(3, r.stars | 0)), path: r.path };
    }
    return out;
}

// Stars already paid for on rooms of the day: a date and one to three stars. Kept apart from
// the saved runs, which are pruned, so a day can never pay for the same star twice.
function sanitizeDailyStars(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    const days = Object.keys(raw).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-MAX_DAILY_STARS);
    for (const day of days) {
        const stars = raw[day] | 0;
        if (stars >= 1) out[day] = Math.min(3, stars);
    }
    return out;
}

// Saved rooms: an id, a name and a room code that still decodes
function sanitizeRooms(raw) {
    const out = [];
    if (!Array.isArray(raw)) return out;
    for (const r of raw) {
        if (!r || typeof r.id !== 'string' || !/^[a-z0-9]{1,16}$/.test(r.id) || out.some((o) => o.id === r.id)) continue;
        if (!decodeRoom(r.code, r.name)) continue;
        out.push({ id: r.id, name: cleanRoomName(r.name), code: r.code });
        if (out.length >= MAX_SAVED_ROOMS) break;
    }
    return out;
}

// --- Rooms beyond the house ---------------------------------------------------

// What this room's best run is saved under
function roomKey() {
    return roomMode === 'house' ? 'h' + currentLevel : specialKey;
}

// Everything cached per level index must be rebuilt when the extra slot gets a different room
function invalidateRoomCaches() {
    if (typeof scene !== 'undefined') scene.level = -1;
    if (typeof fp3d !== 'undefined' && fp3d) {
        fp3d.map = null;
        fp3d.spriteLevel = -1;
        fp3d.sceneBuf = null;
    }
    if (typeof window !== 'undefined' && window.gl3d) window.gl3d.invalidate();
}

// Load the room of the day or a built room into the extra slot and start it
function loadSpecialRoom(room, mode, key) {
    if (roomMode === 'house') houseLevel = currentLevel;
    LEVELS[SPECIAL_LEVEL] = room;
    roomMode = mode;
    specialKey = key || '';
    dailyKey = mode === 'daily' ? room.daily || '' : '';
    currentLevel = SPECIAL_LEVEL;
    levelStartScore = 0;
    npcReplay.active = false;
    helpVisible = false;
    invalidateRoomCaches();
    initLevel(SPECIAL_LEVEL);
    if (typeof syncModeBar === 'function') syncModeBar();
}

function returnToHouse() {
    roomMode = 'house';
    specialKey = '';
    dailyKey = '';
    currentLevel = Math.max(0, Math.min(houseLevel, progress.unlocked));
    levelStartScore = 0;
    npcReplay.active = false;
    helpVisible = false;
    initLevel(currentLevel);
    if (typeof syncModeBar === 'function') syncModeBar();
}

// --- Racing your best run -------------------------------------------------------

// Keep a finished run when it beats the one on file; true when it became the best
function saveRun(key, result, path) {
    if (!key || !path || path.length !== result.moves) return false;
    const prev = progress.runs[key];
    if (prev && prev.moves <= result.moves) {
        prev.stars = Math.max(prev.stars, result.stars);
        return false;
    }
    progress.runs[key] = { moves: result.moves, stars: Math.max(result.stars, prev ? prev.stars : 0), path };
    // Old days of the room of the day make way; nothing else is ever dropped
    const days = Object.keys(progress.runs).filter((k) => k[0] === 'd').sort();
    while (days.length > MAX_DAILY_RUNS) delete progress.runs[days.shift()];
    return true;
}

// Line the best run up at the dock, if this room has one and it still fits the room
function setupBestGhost() {
    bestGhost = null;
    const run = progress.runs[roomKey()];
    if (!run || !run.path || typeof replayRun !== 'function') return;
    const steps = replayRun(LEVELS[currentLevel], run.path);
    if (steps.length !== run.path.length + 1) return;
    bestGhost = {
        steps,
        moves: run.moves,
        drawX: steps[0].col * TILE + TILE / 2,
        drawY: steps[0].row * TILE + TILE / 2,
        dir: 'up',
        angle: FP_ANGLE_MAP.up,
    };
}

function bestGhostStep() {
    return bestGhost ? bestGhost.steps[Math.min(moves, bestGhost.steps.length - 1)] : null;
}

// Tiles cleaned compared with the best run at the same move: positive is ahead
function bestGhostDelta() {
    const s = bestGhostStep();
    return s ? cleaned - s.cleaned : 0;
}

function bestGhostShown() {
    return !!bestGhost && progress.raceBest && (gameState === 'PLAYING' || gameState === 'GAME_OVER');
}

// The ghost takes one step for each of the player's; ease it between tiles once a frame
function updateBestGhost() {
    const s = bestGhostStep();
    if (!s) return;
    const tx = s.col * TILE + TILE / 2, ty = s.row * TILE + TILE / 2;
    const k = easeK(0.3);
    bestGhost.drawX += (tx - bestGhost.drawX) * k;
    bestGhost.drawY += (ty - bestGhost.drawY) * k;
    if (Math.abs(tx - bestGhost.drawX) < 0.5) bestGhost.drawX = tx;
    if (Math.abs(ty - bestGhost.drawY) < 0.5) bestGhost.drawY = ty;
    bestGhost.dir = s.dir;
    if (typeof lerpAngle === 'function') bestGhost.angle = lerpAngle(bestGhost.angle, FP_ANGLE_MAP[s.dir], easeK(0.22));
    bestGhost.done = moves >= bestGhost.steps.length - 1;
}

// Where the ghost is for the 3D views, in tiles; null when it is not showing
function bestGhostPose() {
    if (!bestGhostShown()) return null;
    return { x: bestGhost.drawX / TILE, y: bestGhost.drawY / TILE, angle: bestGhost.angle, done: !!bestGhost.done };
}

function toggleRaceBest(on) {
    progress.raceBest = on === undefined ? !progress.raceBest : !!on;
    saveProgress();
    updateUI();
    if (typeof syncModeBar === 'function') syncModeBar();
}

function recordLevelResult(levelIndex, result) {
    const prev = progress.best[levelIndex];
    progress.best[levelIndex] = {
        moves: prev ? Math.min(prev.moves, result.moves) : result.moves,
        stars: prev ? Math.max(prev.stars, result.stars) : result.stars,
    };
    progress.unlocked = Math.max(progress.unlocked, Math.min(levelIndex + 1, HOUSE_LEVELS - 1));
    progress.bestScore = Math.max(progress.bestScore, score);
    saveProgress();
}

// --- Level select ------------------------------------------------------------

// The picker shows one floor of the house at a time. It follows the room being played,
// and the arrows browse the other floors without leaving that room.
let levelFloor = 0;
let levelFloorFor = -1;

function levelFloorCount() {
    return Math.ceil(HOUSE_LEVELS / FLOOR_SIZE);
}

function showLevelFloor(floor) {
    levelFloor = Math.max(0, Math.min(levelFloorCount() - 1, floor));
    buildLevelSelect();
}

function buildLevelSelect() {
    const el = document.getElementById('levelSelect');
    if (!el) return;
    const anchor = Math.min(HOUSE_LEVELS - 1, roomMode === 'house' ? currentLevel : houseLevel);
    if (anchor !== levelFloorFor) {
        levelFloorFor = anchor;
        levelFloor = Math.floor(anchor / FLOOR_SIZE);
    }
    const floors = levelFloorCount();
    levelFloor = Math.max(0, Math.min(floors - 1, levelFloor));
    el.innerHTML = '';
    const arrow = (text, name, to) => {
        const b = document.createElement('button');
        b.className = 'level-nav';
        b.textContent = text;
        b.setAttribute('aria-label', name);
        b.title = name;
        b.disabled = to < 0 || to >= floors;
        b.addEventListener('click', () => showLevelFloor(to));
        return b;
    };
    el.appendChild(arrow('\u2039', 'Floor below', levelFloor - 1));
    const label = document.createElement('span');
    label.className = 'level-label';
    label.textContent = FLOOR_NAMES[levelFloor] || `Floor ${levelFloor + 1}`;
    el.appendChild(label);
    const first = levelFloor * FLOOR_SIZE;
    LEVELS.slice(first, Math.min(HOUSE_LEVELS, first + FLOOR_SIZE)).forEach((lv, k) => {
        const i = first + k;
        const b = document.createElement('button');
        b.className = 'level-btn' + (roomMode === 'house' && i === currentLevel ? ' current' : '');
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
    el.appendChild(arrow('\u203A', 'Floor above', levelFloor + 1));
}

function selectLevel(i) {
    if (i < 0 || i >= HOUSE_LEVELS || i > progress.unlocked) return;
    if (i !== currentLevel) levelStartScore = 0; // jumping to another level starts a fresh run
    if (roomMode !== 'house') {
        roomMode = 'house';
        specialKey = '';
        dailyKey = '';
        levelStartScore = 0;
        if (typeof syncModeBar === 'function') syncModeBar();
    }
    houseLevel = i;
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
    runPath += dc > 0 ? 'R' : dc < 0 ? 'L' : dr > 0 ? 'D' : 'U';
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
    // Upgrade points: one for every star earned for the first time, on a house room or on a
    // room of the day (any day's, so nothing is lost by missing one). Built rooms keep a best
    // run but pay no points: a player could build a room to farm them.
    const house = roomMode === 'house';
    const daily = roomMode === 'daily' && !!dailyKey;
    const prevBest = house ? progress.best[currentLevel] : null;
    const paidStars = house ? (prevBest ? prevBest.stars : 0) : daily ? progress.dailyStars[dailyKey] | 0 : 0;
    const points = house || daily ? Math.max(0, stars - paidStars) : 0;
    progress.points = (progress.points | 0) + points;
    if (daily && stars > paidStars) {
        progress.dailyStars[dailyKey] = stars;
        progress.dailyStars = sanitizeDailyStars(progress.dailyStars);
    }
    const key = roomKey();
    const prevRun = progress.runs[key];
    const newBest = saveRun(key, { moves, stars }, runPath);
    levelResult = {
        moves, par: parMoves, bonus, stars, points, tileScore: cleaned * 10, at: chargerPulse,
        newBest, prevMoves: prevRun ? prevRun.moves : 0,
    };
    gameState = 'LEVEL_COMPLETE';
    stopHold();
    sound('levelComplete');
    if (house) recordLevelResult(currentLevel, levelResult);
    else saveProgress();
    buildLevelSelect();
    buildUpgradePanel();
    if (typeof syncModeBar === 'function') syncModeBar();
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
// A press: one move at once, then, if it is still held after `delay`, a move every interval.
// The pause before repeating is what makes a tap a single move (see HOLD_DELAY_KEYS in core.js).
function startHold(dir, delay) {
    lastInputAt = performance.now();
    if (useGl()) window.gl3d.lookRelease(true);
    if (heldDir === dir) return;
    stopHold();
    heldDir = dir;
    handleDirection(dir);
    // Turning in 3D is one step per press. Auto-repeating it spins the camera.
    if (viewMode === 'FP' && (dir === 'left' || dir === 'right')) return;
    const interval = viewMode === 'FP' ? FP_MOVE_INTERVAL : MOVE_INTERVAL;
    const repeat = () => {
        if (heldDir !== dir) return;
        handleDirection(dir);
        holdTimer = setTimeout(repeat, interval);
    };
    holdTimer = setTimeout(repeat, Math.max(interval, delay === undefined ? HOLD_DELAY_KEYS : delay));
}

// A press on the on-screen d-pad, by finger or by mouse. Some browsers follow a touch with
// made-up mouse events; that press has already been handled, so those are ignored.
function dpadPress(dir, fromTouch, now) {
    if (fromTouch) lastDpadTouchAt = now;
    else if (now - lastDpadTouchAt < GHOST_MOUSE_MS) return false;
    startHold(dir, HOLD_DELAY_TOUCH);
    return true;
}

function stopHold() {
    heldDir = null;
    if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
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
    if (gameState === 'EDITING') return;
    if (roomMode === 'house' && gameState === 'LEVEL_COMPLETE' && currentLevel === HOUSE_LEVELS - 1) {
        currentLevel = 0;
        houseLevel = 0;
        levelStartScore = 0;
    }
    npcReplay.active = false;
    initLevel(currentLevel);
}

function toggleHelp() {
    helpVisible = !helpVisible;
    stopHold();
}

// The credits: a panel under the controls, opened by its button
let creditsPanelOpen = false;
function toggleCreditsPanel(open) {
    creditsPanelOpen = open === undefined ? !creditsPanelOpen : !!open;
    if (typeof document === 'undefined') return;
    const panel = document.getElementById('creditsPanel');
    if (panel) {
        panel.hidden = !creditsPanelOpen;
        if (creditsPanelOpen && typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const btn = document.getElementById('btnCredits');
    if (btn) btn.setAttribute('aria-expanded', creditsPanelOpen ? 'true' : 'false');
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
    if (typeof placeModeBar === 'function') placeModeBar(on);
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
    const t = e.target;
    if (!t || !t.closest) return false;
    if (t.closest('#designPanel, #upgradePanel')) return true;
    // In the bar at the top only the things you type into keep their keys
    return !!(t.matches && t.matches('#modeBar input[type="text"], #modeBar select'));
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

    // While a room is being built the keys belong to the editor
    if (gameState === 'EDITING') {
        if (typeof editorKey === 'function') editorKey(e);
        return;
    }

    // B: race the ghost of your best run, on / off
    if (e.key === 'b' || e.key === 'B') {
        toggleRaceBest();
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
    elLevelNum.textContent = roomMode === 'house' ? `${currentLevel + 1} · ${LEVELS[currentLevel].name}` : LEVELS[currentLevel].name;
    const elBest = document.getElementById('bestStat');
    if (elBest) {
        const racing = !!bestGhost && progress.raceBest && gameState !== 'EDITING';
        elBest.hidden = !racing;
        if (racing) {
            const d = bestGhostDelta();
            const elDelta = document.getElementById('bestDelta');
            elDelta.textContent = d > 0 ? `${d} ahead` : d < 0 ? `${-d} behind` : 'level';
            elDelta.classList.toggle('ahead', d > 0);
            elDelta.classList.toggle('behind', d < 0);
        }
    }

    const max = batteryMax();
    const pct = Math.max(0, Math.min(100, (roomba.battery / max) * 100));
    elBatteryFill.style.width = pct + '%';
    elBatteryText.textContent = `${Math.round(roomba.battery)} / ${max}`;
    elBatteryFill.classList.toggle('over', roomba.battery > max + 0.5);
    if (pct > 50) {
        elBatteryFill.style.backgroundColor = '#5BC8A8';
        elBatteryText.style.color = '#5BC8A8';
    } else if (pct > 20) {
        elBatteryFill.style.backgroundColor = '#D9A441';
        elBatteryText.style.color = '#D9A441';
    } else {
        elBatteryFill.style.backgroundColor = '#E76F51';
        elBatteryText.style.color = '#E76F51';
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
    updateBestGhost();

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
    } else if (gameState === 'EDITING') {
        if (typeof drawEditor === 'function') drawEditor();
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
        if (bestGhostShown() && typeof drawBestGhost === 'function') drawBestGhost();
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
    if (roomMode === 'house' && gameState === 'LEVEL_COMPLETE' && currentLevel < HOUSE_LEVELS - 1) {
        currentLevel++;
        houseLevel = currentLevel;
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
    const elBtnCredits = document.getElementById('btnCredits');
    if (elBtnCredits) elBtnCredits.addEventListener('click', () => { toggleCreditsPanel(); elBtnCredits.blur(); });
    const elBtnCreditsClose = document.getElementById('btnCreditsClose');
    if (elBtnCreditsClose) elBtnCreditsClose.addEventListener('click', () => toggleCreditsPanel(false));
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
            dpadPress(dir, false, performance.now());
        });
        // Not passive, so preventDefault can stop the browser's follow-up mouse events
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            dpadPress(dir, true, performance.now());
        }, { passive: false });
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
            return;
        }
        if (gameState === 'EDITING') return; // the editor handles its own pointer
        if (gameState === 'LEVEL_COMPLETE') nextLevel();
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
    houseLevel = currentLevel;
    initLevel(currentLevel);
    if (typeof initUpgradeUI === 'function') initUpgradeUI();
    updateViewButtons();
    requestAnimationFrame(render);
    if (typeof fpWarmUp === 'function') setTimeout(warmUp3d, 400);
});
