// === CONSTANTS ===
const TILE = 48;
const COLS = 15;
const ROWS = 12;
const CANVAS_W = COLS * TILE;
const CANVAS_H = ROWS * TILE;

const DIRTY = 0;
const CLEAN = 1;
const OBSTACLE = 2;
const CHARGER = 3;

const MOVE_INTERVAL = 120; // ms between moves when holding

const COLORS = {
    dirty: '#E8D5B7',
    clean: '#B8E6C8',
    gridLine: '#D0C8B8',
    charger: '#A0C4FF',
    background: '#2C2C2C',
};

// === OBSTACLE CATALOG ===
const OBS_TYPES = {
    couch:  { color: '#5D4037', accent: '#795548', label: 'Couch' },
    table:  { color: '#8D6E63', accent: '#A1887F', label: 'Table' },
    chair:  { color: '#757575', accent: '#9E9E9E', label: 'Chair' },
    plant:  { color: '#6D4C41', accent: '#4CAF50', label: 'Plant' },
    wall:   { color: '#424242', accent: '#616161', label: 'Wall' },
    petbed: { color: '#E57373', accent: '#EF9A9A', label: 'Pet Bed' },
};

// === LEVEL DATA ===
const LEVELS = [
    {
        name: 'Living Room',
        batteryCost: 1,
        charger: { col: 14, row: 11 },
        obstacles: [
            { type: 'couch', col: 5, row: 2, w: 3, h: 1 },
            { type: 'table', col: 10, row: 5, w: 2, h: 2 },
            { type: 'chair', col: 3, row: 7, w: 1, h: 1 },
            { type: 'plant', col: 0, row: 0, w: 1, h: 1 },
            { type: 'plant', col: 14, row: 0, w: 1, h: 1 },
        ],
    },
    {
        name: 'Bedroom',
        batteryCost: 1,
        charger: { col: 0, row: 11 },
        obstacles: [
            { type: 'couch', col: 1, row: 1, w: 3, h: 1 },
            { type: 'table', col: 7, row: 0, w: 2, h: 2 },
            { type: 'table', col: 6, row: 5, w: 2, h: 2 },
            { type: 'chair', col: 13, row: 3, w: 1, h: 1 },
            { type: 'chair', col: 5, row: 9, w: 1, h: 1 },
            { type: 'plant', col: 14, row: 0, w: 1, h: 1 },
            { type: 'plant', col: 0, row: 5, w: 1, h: 1 },
            { type: 'petbed', col: 11, row: 9, w: 2, h: 1 },
        ],
    },
    {
        name: 'Kitchen',
        batteryCost: 1,
        charger: { col: 7, row: 11 },
        obstacles: [
            { type: 'table', col: 6, row: 4, w: 2, h: 2 },
            { type: 'chair', col: 5, row: 4, w: 1, h: 1 },
            { type: 'chair', col: 8, row: 4, w: 1, h: 1 },
            { type: 'chair', col: 5, row: 5, w: 1, h: 1 },
            { type: 'chair', col: 8, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 0, row: 0, w: 1, h: 1 },
            { type: 'wall', col: 1, row: 0, w: 1, h: 1 },
            { type: 'wall', col: 2, row: 0, w: 1, h: 1 },
            { type: 'wall', col: 3, row: 0, w: 1, h: 1 },
            { type: 'wall', col: 0, row: 1, w: 1, h: 1 },
            { type: 'wall', col: 0, row: 2, w: 1, h: 1 },
            { type: 'couch', col: 11, row: 1, w: 3, h: 1 },
            { type: 'plant', col: 14, row: 8, w: 1, h: 1 },
            { type: 'plant', col: 0, row: 10, w: 1, h: 1 },
            { type: 'petbed', col: 12, row: 9, w: 2, h: 1 },
            { type: 'wall', col: 3, row: 8, w: 1, h: 1 },
            { type: 'wall', col: 3, row: 9, w: 1, h: 1 },
            { type: 'wall', col: 3, row: 10, w: 1, h: 1 },
        ],
    },
    {
        name: 'Office',
        batteryCost: 2,
        charger: { col: 14, row: 0 },
        obstacles: [
            { type: 'table', col: 1, row: 1, w: 2, h: 2 },
            { type: 'table', col: 12, row: 5, w: 2, h: 2 },
            { type: 'chair', col: 0, row: 1, w: 1, h: 1 },
            { type: 'chair', col: 3, row: 2, w: 1, h: 1 },
            { type: 'chair', col: 11, row: 6, w: 1, h: 1 },
            { type: 'couch', col: 5, row: 10, w: 3, h: 1 },
            { type: 'wall', col: 7, row: 0, w: 1, h: 1 },
            { type: 'wall', col: 7, row: 1, w: 1, h: 1 },
            { type: 'wall', col: 7, row: 2, w: 1, h: 1 },
            { type: 'wall', col: 7, row: 3, w: 1, h: 1 },
            { type: 'wall', col: 7, row: 4, w: 1, h: 1 },
            { type: 'wall', col: 7, row: 6, w: 1, h: 1 },
            { type: 'wall', col: 7, row: 7, w: 1, h: 1 },
            { type: 'plant', col: 0, row: 0, w: 1, h: 1 },
            { type: 'plant', col: 14, row: 11, w: 1, h: 1 },
            { type: 'plant', col: 0, row: 11, w: 1, h: 1 },
            { type: 'petbed', col: 9, row: 2, w: 2, h: 1 },
            { type: 'wall', col: 4, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 4, row: 6, w: 1, h: 1 },
            { type: 'wall', col: 4, row: 7, w: 1, h: 1 },
            { type: 'wall', col: 4, row: 8, w: 1, h: 1 },
            { type: 'chair', col: 10, row: 10, w: 1, h: 1 },
        ],
    },
    {
        name: 'Warehouse',
        batteryCost: 2,
        charger: { col: 0, row: 0 },
        obstacles: [
            { type: 'wall', col: 2, row: 2, w: 1, h: 1 },
            { type: 'wall', col: 3, row: 2, w: 1, h: 1 },
            { type: 'wall', col: 4, row: 2, w: 1, h: 1 },
            { type: 'wall', col: 5, row: 2, w: 1, h: 1 },
            { type: 'wall', col: 6, row: 2, w: 1, h: 1 },
            { type: 'wall', col: 8, row: 2, w: 1, h: 1 },
            { type: 'wall', col: 9, row: 2, w: 1, h: 1 },
            { type: 'wall', col: 10, row: 2, w: 1, h: 1 },
            { type: 'wall', col: 11, row: 2, w: 1, h: 1 },
            { type: 'wall', col: 12, row: 2, w: 1, h: 1 },
            { type: 'wall', col: 2, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 3, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 4, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 6, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 7, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 8, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 9, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 11, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 12, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 1, row: 8, w: 1, h: 1 },
            { type: 'wall', col: 2, row: 8, w: 1, h: 1 },
            { type: 'wall', col: 3, row: 8, w: 1, h: 1 },
            { type: 'wall', col: 4, row: 8, w: 1, h: 1 },
            { type: 'wall', col: 5, row: 8, w: 1, h: 1 },
            { type: 'wall', col: 7, row: 8, w: 1, h: 1 },
            { type: 'wall', col: 8, row: 8, w: 1, h: 1 },
            { type: 'wall', col: 9, row: 8, w: 1, h: 1 },
            { type: 'wall', col: 10, row: 8, w: 1, h: 1 },
            { type: 'wall', col: 12, row: 8, w: 1, h: 1 },
            { type: 'wall', col: 13, row: 8, w: 1, h: 1 },
            { type: 'wall', col: 14, row: 4, w: 1, h: 1 },
            { type: 'wall', col: 14, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 0, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 0, row: 6, w: 1, h: 1 },
            { type: 'table', col: 10, row: 3, w: 2, h: 2 },
            { type: 'chair', col: 3, row: 3, w: 1, h: 1 },
            { type: 'chair', col: 6, row: 6, w: 1, h: 1 },
            { type: 'plant', col: 14, row: 11, w: 1, h: 1 },
            { type: 'plant', col: 0, row: 10, w: 1, h: 1 },
            { type: 'couch', col: 3, row: 10, w: 3, h: 1 },
            { type: 'petbed', col: 10, row: 10, w: 2, h: 1 },
        ],
    },
    {
        name: 'The Gauntlet',
        batteryCost: 3,
        charger: { col: 7, row: 6 },
        obstacles: [
            { type: 'wall', col: 1, row: 1, w: 1, h: 1 },
            { type: 'wall', col: 2, row: 1, w: 1, h: 1 },
            { type: 'wall', col: 3, row: 1, w: 1, h: 1 },
            { type: 'wall', col: 4, row: 1, w: 1, h: 1 },
            { type: 'wall', col: 5, row: 1, w: 1, h: 1 },
            { type: 'wall', col: 7, row: 1, w: 1, h: 1 },
            { type: 'wall', col: 8, row: 1, w: 1, h: 1 },
            { type: 'wall', col: 10, row: 1, w: 1, h: 1 },
            { type: 'wall', col: 11, row: 1, w: 1, h: 1 },
            { type: 'wall', col: 12, row: 1, w: 1, h: 1 },
            { type: 'wall', col: 13, row: 1, w: 1, h: 1 },
            { type: 'wall', col: 1, row: 2, w: 1, h: 1 },
            { type: 'wall', col: 1, row: 3, w: 1, h: 1 },
            { type: 'wall', col: 1, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 1, row: 6, w: 1, h: 1 },
            { type: 'wall', col: 1, row: 7, w: 1, h: 1 },
            { type: 'wall', col: 1, row: 9, w: 1, h: 1 },
            { type: 'wall', col: 1, row: 10, w: 1, h: 1 },
            { type: 'wall', col: 13, row: 2, w: 1, h: 1 },
            { type: 'wall', col: 13, row: 3, w: 1, h: 1 },
            { type: 'wall', col: 13, row: 4, w: 1, h: 1 },
            { type: 'wall', col: 13, row: 6, w: 1, h: 1 },
            { type: 'wall', col: 13, row: 7, w: 1, h: 1 },
            { type: 'wall', col: 13, row: 8, w: 1, h: 1 },
            { type: 'wall', col: 13, row: 10, w: 1, h: 1 },
            { type: 'wall', col: 2, row: 10, w: 1, h: 1 },
            { type: 'wall', col: 3, row: 10, w: 1, h: 1 },
            { type: 'wall', col: 5, row: 10, w: 1, h: 1 },
            { type: 'wall', col: 6, row: 10, w: 1, h: 1 },
            { type: 'wall', col: 7, row: 10, w: 1, h: 1 },
            { type: 'wall', col: 8, row: 10, w: 1, h: 1 },
            { type: 'wall', col: 10, row: 10, w: 1, h: 1 },
            { type: 'wall', col: 11, row: 10, w: 1, h: 1 },
            { type: 'wall', col: 12, row: 10, w: 1, h: 1 },
            { type: 'wall', col: 4, row: 3, w: 1, h: 1 },
            { type: 'wall', col: 5, row: 3, w: 1, h: 1 },
            { type: 'wall', col: 5, row: 4, w: 1, h: 1 },
            { type: 'wall', col: 5, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 9, row: 3, w: 1, h: 1 },
            { type: 'wall', col: 10, row: 3, w: 1, h: 1 },
            { type: 'wall', col: 9, row: 4, w: 1, h: 1 },
            { type: 'wall', col: 9, row: 5, w: 1, h: 1 },
            { type: 'wall', col: 4, row: 7, w: 1, h: 1 },
            { type: 'wall', col: 5, row: 7, w: 1, h: 1 },
            { type: 'wall', col: 5, row: 8, w: 1, h: 1 },
            { type: 'wall', col: 9, row: 7, w: 1, h: 1 },
            { type: 'wall', col: 10, row: 7, w: 1, h: 1 },
            { type: 'wall', col: 9, row: 8, w: 1, h: 1 },
            { type: 'table', col: 2, row: 3, w: 2, h: 2 },
            { type: 'table', col: 11, row: 3, w: 2, h: 2 },
            { type: 'chair', col: 7, row: 3, w: 1, h: 1 },
            { type: 'chair', col: 7, row: 9, w: 1, h: 1 },
            { type: 'plant', col: 3, row: 6, w: 1, h: 1 },
            { type: 'plant', col: 11, row: 6, w: 1, h: 1 },
        ],
    },
];

// === PAR SOLVER ===

// BFS from a single source to all reachable tiles, returns distance grid
function bfsFromSource(g, srcCol, srcRow) {
    const dist = Array.from({ length: ROWS }, () => new Int16Array(COLS).fill(-1));
    dist[srcRow][srcCol] = 0;
    const queue = [[srcCol, srcRow]];
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    let qi = 0;
    while (qi < queue.length) {
        const [cx, cy] = queue[qi++];
        const d = dist[cy][cx];
        for (const [dx, dy] of dirs) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
            if (dist[ny][nx] !== -1) continue;
            if (g[ny][nx] === OBSTACLE) continue;
            dist[ny][nx] = d + 1;
            queue.push([nx, ny]);
        }
    }
    return dist;
}

// BFS path reconstruction: returns array of {col, row} from src to dst (inclusive of dst, exclusive of src)
function bfsPath(g, fromCol, fromRow, toCol, toRow) {
    if (fromCol === toCol && fromRow === toRow) return [];
    const prev = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    const visited = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
    const queue = [[fromCol, fromRow]];
    visited[fromRow][fromCol] = 1;
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    let qi = 0;
    let found = false;
    while (qi < queue.length && !found) {
        const [cx, cy] = queue[qi++];
        for (const [dx, dy] of dirs) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
            if (visited[ny][nx]) continue;
            if (g[ny][nx] === OBSTACLE) continue;
            visited[ny][nx] = 1;
            prev[ny][nx] = [cx, cy];
            if (nx === toCol && ny === toRow) { found = true; break; }
            queue.push([nx, ny]);
        }
    }
    if (!found) return null;
    // Reconstruct
    const path = [];
    let cx = toCol, cy = toRow;
    while (!(cx === fromCol && cy === fromRow)) {
        path.push({ col: cx, row: cy });
        const p = prev[cy][cx];
        cx = p[0]; cy = p[1];
    }
    path.reverse();
    return path;
}

// Build the grid for a level (used by solver)
function buildLevelGrid(levelIndex) {
    const level = LEVELS[levelIndex];
    const g = [];
    for (let r = 0; r < ROWS; r++) {
        g[r] = [];
        for (let c = 0; c < COLS; c++) {
            g[r][c] = DIRTY;
        }
    }
    for (const obs of level.obstacles) {
        for (let dr = 0; dr < obs.h; dr++) {
            for (let dc = 0; dc < obs.w; dc++) {
                g[obs.row + dr][obs.col + dc] = OBSTACLE;
            }
        }
    }
    g[level.charger.row][level.charger.col] = CHARGER;
    return g;
}

// Compute par moves AND full path for a level using greedy nearest-neighbor with battery
function computeParRoute(levelIndex) {
    const level = LEVELS[levelIndex];
    const batteryCost = level.batteryCost || 1;
    const maxBattery = 100;
    const g = buildLevelGrid(levelIndex);

    const chargerDist = bfsFromSource(g, level.charger.col, level.charger.row);

    // Collect dirty tiles
    const dirtyTiles = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (g[r][c] === DIRTY) dirtyTiles.push({ col: c, row: r });
        }
    }

    let curCol = level.charger.col;
    let curRow = level.charger.row;
    let battery = maxBattery;
    let totalMoves = 0;
    const uncleaned = new Set(dirtyTiles.map((_, i) => i));
    const fullPath = [{ col: curCol, row: curRow }]; // starting position

    while (uncleaned.size > 0) {
        const distFromCur = bfsFromSource(g, curCol, curRow);

        let bestIdx = -1;
        let bestDist = Infinity;

        for (const idx of uncleaned) {
            const t = dirtyTiles[idx];
            const distToTile = distFromCur[t.row][t.col];
            if (distToTile < 0) continue;

            const distTileToCharger = chargerDist[t.row][t.col];
            const totalCost = (distToTile + distTileToCharger) * batteryCost;

            if (totalCost <= battery && distToTile < bestDist) {
                bestDist = distToTile;
                bestIdx = idx;
            }
        }

        if (bestIdx === -1) {
            // Return to charger
            const pathToCharger = bfsPath(g, curCol, curRow, level.charger.col, level.charger.row);
            if (!pathToCharger) break;
            for (const step of pathToCharger) fullPath.push(step);
            totalMoves += pathToCharger.length;
            curCol = level.charger.col;
            curRow = level.charger.row;
            battery = maxBattery;
            continue;
        }

        // Move to nearest tile via BFS path
        const t = dirtyTiles[bestIdx];
        const pathToTile = bfsPath(g, curCol, curRow, t.col, t.row);
        if (!pathToTile) break;
        for (const step of pathToTile) {
            fullPath.push(step);
            // Mark tiles cleaned along the way
            const stepIdx = dirtyTiles.findIndex(d => d.col === step.col && d.row === step.row);
            if (stepIdx >= 0) uncleaned.delete(stepIdx);
        }
        totalMoves += pathToTile.length;
        battery -= pathToTile.length * batteryCost;
        curCol = t.col;
        curRow = t.row;
    }

    return { totalMoves, fullPath };
}

// === GAME STATE ===
let canvas, ctx;
let grid = [];
let roomba = { col: 0, row: 0, dir: 'right', battery: 100 };
let currentLevel = 0;
let totalDirty = 0;
let cleaned = 0;
let moves = 0;
let score = 0;
let parMoves = 0;
let parPath = []; // full path for NPC replay
let gameState = 'PLAYING'; // PLAYING, LEVEL_COMPLETE, GAME_OVER, PAR_REPLAY
let bumpFlash = 0;
let chargerPulse = 0;
let cleanAnimations = [];
let roombaWheelAngle = 0; // for spinning wheels

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
};
const NPC_STEP_INTERVAL = 130; // ms between NPC steps

// Press-and-hold state
let heldDir = null;
let holdInterval = null;
let keysDown = new Set();

// DOM elements
let elCleaned, elMoves, elScore, elBatteryFill, elBatteryText, elLevelNum, elBtnRestart, elParCount;

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

    roomba.col = level.charger.col;
    roomba.row = level.charger.row;
    roomba.dir = 'up';
    roomba.battery = 100;

    totalDirty = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] === DIRTY) totalDirty++;
        }
    }

    cleaned = 0;
    moves = 0;
    gameState = 'PLAYING';
    bumpFlash = 0;
    cleanAnimations = [];
    stopHold();

    const parResult = computeParRoute(levelIndex);
    parMoves = parResult.totalMoves;
    parPath = parResult.fullPath;
    npcReplay.active = false;

    updateUI();
}

// === INPUT HANDLING ===
function handleDirection(dir) {
    if (gameState !== 'PLAYING') return;

    const deltas = {
        up:    { dc: 0, dr: -1 },
        down:  { dc: 0, dr: 1 },
        left:  { dc: -1, dr: 0 },
        right: { dc: 1, dr: 0 },
    };

    const d = deltas[dir];
    if (!d) return;

    roomba.dir = dir;
    roombaWheelAngle += 0.5;
    const newCol = roomba.col + d.dc;
    const newRow = roomba.row + d.dr;

    if (newCol < 0 || newCol >= COLS || newRow < 0 || newRow >= ROWS) {
        bumpFlash = 10;
        return;
    }

    if (grid[newRow][newCol] === OBSTACLE) {
        bumpFlash = 10;
        return;
    }

    roomba.col = newCol;
    roomba.row = newRow;
    moves++;

    const cost = LEVELS[currentLevel].batteryCost || 1;
    roomba.battery = Math.max(0, roomba.battery - cost);

    if (grid[newRow][newCol] === DIRTY) {
        grid[newRow][newCol] = CLEAN;
        cleaned++;
        score += 10;
        cleanAnimations.push({ col: newCol, row: newRow, progress: 0 });
    }

    if (grid[newRow][newCol] === CHARGER) {
        roomba.battery = 100;
    }

    if (cleaned >= totalDirty) {
        const bonus = Math.max(0, (totalDirty * 2 - moves)) * 5;
        score += bonus;
        gameState = 'LEVEL_COMPLETE';
        stopHold();
    }

    if (roomba.battery <= 0 && gameState === 'PLAYING') {
        gameState = 'GAME_OVER';
        stopHold();
    }

    updateUI();
}

// === PRESS AND HOLD ===
function startHold(dir) {
    if (heldDir === dir) return;
    stopHold();
    heldDir = dir;
    handleDirection(dir);
    holdInterval = setInterval(() => {
        if (heldDir === dir) {
            handleDirection(dir);
        } else {
            stopHold();
        }
    }, MOVE_INTERVAL);
}

function stopHold() {
    heldDir = null;
    if (holdInterval) {
        clearInterval(holdInterval);
        holdInterval = null;
    }
}

// Keyboard
const keyMap = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
};

document.addEventListener('keydown', (e) => {
    // W key: watch par route when level complete, otherwise move up
    if ((e.key === 'w' || e.key === 'W') && gameState === 'LEVEL_COMPLETE') {
        e.preventDefault();
        startParReplay();
        return;
    }

    // SPACE: skip NPC replay, or next level
    if (e.key === ' ') {
        e.preventDefault();
        if (gameState === 'PAR_REPLAY') {
            npcReplay.active = false;
            gameState = 'LEVEL_COMPLETE';
            return;
        }
        if (gameState === 'LEVEL_COMPLETE') {
            nextLevel();
            return;
        }
    }

    // R: restart (also exits replay)
    if (e.key === 'r' || e.key === 'R') {
        initLevel(currentLevel);
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

// === RENDERING ===

// Floor texture pattern (generated once)
let floorPattern = null;
let cleanPattern = null;
function createFloorPatterns() {
    // Dirty floor - wood/carpet texture
    const fc = document.createElement('canvas');
    fc.width = TILE; fc.height = TILE;
    const fctx = fc.getContext('2d');
    fctx.fillStyle = '#E8D5B7';
    fctx.fillRect(0, 0, TILE, TILE);
    // Wood grain lines
    fctx.strokeStyle = 'rgba(180, 155, 120, 0.3)';
    fctx.lineWidth = 0.5;
    for (let i = 0; i < 6; i++) {
        const y = 4 + i * 8;
        fctx.beginPath();
        fctx.moveTo(0, y);
        fctx.bezierCurveTo(12, y + 1, 24, y - 1, TILE, y + 0.5);
        fctx.stroke();
    }
    // Subtle dust specks
    fctx.fillStyle = 'rgba(160, 140, 110, 0.4)';
    for (let i = 0; i < 8; i++) {
        fctx.beginPath();
        fctx.arc(Math.random() * TILE, Math.random() * TILE, 0.5 + Math.random(), 0, Math.PI * 2);
        fctx.fill();
    }
    floorPattern = ctx.createPattern(fc, 'repeat');

    // Clean floor
    const cc = document.createElement('canvas');
    cc.width = TILE; cc.height = TILE;
    const cctx = cc.getContext('2d');
    cctx.fillStyle = '#B8E6C8';
    cctx.fillRect(0, 0, TILE, TILE);
    // Shine streaks
    cctx.strokeStyle = 'rgba(200, 245, 215, 0.5)';
    cctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
        const y = 8 + i * 14;
        cctx.beginPath();
        cctx.moveTo(4, y);
        cctx.lineTo(TILE - 4, y + 2);
        cctx.stroke();
    }
    cleanPattern = ctx.createPattern(cc, 'repeat');
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
                ctx.fillStyle = cleanPattern || COLORS.clean;
            } else if (cell === CHARGER) {
                drawChargerTile(x, y);
                continue;
            } else if (cell === OBSTACLE) {
                ctx.fillStyle = floorPattern || COLORS.dirty;
            }

            ctx.fillRect(x, y, TILE, TILE);

            // Subtle grid line
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x, y, TILE, TILE);
        }
    }
}

function drawChargerTile(x, y) {
    // Base
    ctx.fillStyle = '#DDD';
    ctx.fillRect(x, y, TILE, TILE);

    // Pulsing glow
    const alpha = 0.3 + 0.25 * Math.sin(chargerPulse * 0.05);
    ctx.fillStyle = `rgba(80, 160, 255, ${alpha})`;
    ctx.fillRect(x, y, TILE, TILE);

    // Dock shape - rounded platform
    ctx.fillStyle = '#555';
    roundRect(ctx, x + 6, y + 6, TILE - 12, TILE - 12, 8);
    ctx.fill();
    ctx.fillStyle = '#333';
    roundRect(ctx, x + 10, y + 10, TILE - 20, TILE - 20, 6);
    ctx.fill();

    // Lightning bolt
    ctx.fillStyle = '#FFD600';
    ctx.beginPath();
    const cx = x + TILE / 2, cy = y + TILE / 2;
    ctx.moveTo(cx - 3, cy - 9);
    ctx.lineTo(cx + 5, cy - 9);
    ctx.lineTo(cx + 1, cy - 1);
    ctx.lineTo(cx + 6, cy - 1);
    ctx.lineTo(cx - 2, cy + 9);
    ctx.lineTo(cx + 1, cy + 1);
    ctx.lineTo(cx - 5, cy + 1);
    ctx.closePath();
    ctx.fill();

    // Grid line
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, TILE, TILE);
}

function drawObstacles() {
    const level = LEVELS[currentLevel];
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
    const pad = 4;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    roundRect(ctx, x + pad + 2, y + pad + 2, w - pad * 2, h - pad * 2, 6);
    ctx.fill();
    // Main body
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#6D4C41');
    grad.addColorStop(0.3, '#5D4037');
    grad.addColorStop(1, '#4E342E');
    ctx.fillStyle = grad;
    roundRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, 6);
    ctx.fill();
    // Backrest (darker strip at top)
    ctx.fillStyle = '#4E342E';
    roundRect(ctx, x + pad, y + pad, w - pad * 2, 8, 6);
    ctx.fill();
    // Cushion dividers
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i < Math.round(w / TILE); i++) {
        const lx = x + i * TILE;
        ctx.beginPath();
        ctx.moveTo(lx, y + pad + 8);
        ctx.lineTo(lx, y + h - pad - 2);
        ctx.stroke();
    }
    // Cushion highlights
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < Math.round(w / TILE); i++) {
        const cx = x + i * TILE + TILE / 2;
        const cy = y + h / 2 + 3;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 14, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    // Armrests
    ctx.fillStyle = '#4E342E';
    roundRect(ctx, x + pad - 1, y + pad + 4, 6, h - pad * 2 - 4, 3);
    ctx.fill();
    roundRect(ctx, x + w - pad - 5, y + pad + 4, 6, h - pad * 2 - 4, 3);
    ctx.fill();
}

function drawTable(x, y, w, h) {
    const pad = 5;
    // Legs (shadows at corners)
    ctx.fillStyle = '#5D4037';
    const legSize = 5;
    ctx.fillRect(x + pad + 2, y + pad + 2, legSize, legSize);
    ctx.fillRect(x + w - pad - legSize - 2, y + pad + 2, legSize, legSize);
    ctx.fillRect(x + pad + 2, y + h - pad - legSize - 2, legSize, legSize);
    ctx.fillRect(x + w - pad - legSize - 2, y + h - pad - legSize - 2, legSize, legSize);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    roundRect(ctx, x + pad + 2, y + pad + 2, w - pad * 2, h - pad * 2, 4);
    ctx.fill();
    // Table surface
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#A1887F');
    grad.addColorStop(0.5, '#8D6E63');
    grad.addColorStop(1, '#795548');
    ctx.fillStyle = grad;
    roundRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, 4);
    ctx.fill();
    // Wood grain
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
        const gy = y + pad + 6 + i * 10;
        if (gy < y + h - pad) {
            ctx.beginPath();
            ctx.moveTo(x + pad + 4, gy);
            ctx.bezierCurveTo(x + w / 3, gy + 1, x + w * 2 / 3, gy - 1, x + w - pad - 4, gy);
            ctx.stroke();
        }
    }
    // Edge highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    roundRect(ctx, x + pad + 1, y + pad + 1, w - pad * 2 - 2, h - pad * 2 - 2, 3);
    ctx.stroke();
}

function drawChair(x, y) {
    const pad = 6;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    roundRect(ctx, x + pad + 2, y + pad + 2, TILE - pad * 2, TILE - pad * 2, 4);
    ctx.fill();
    // Seat
    const grad = ctx.createLinearGradient(x, y, x, y + TILE);
    grad.addColorStop(0, '#9E9E9E');
    grad.addColorStop(1, '#757575');
    ctx.fillStyle = grad;
    roundRect(ctx, x + pad, y + pad, TILE - pad * 2, TILE - pad * 2, 4);
    ctx.fill();
    // Backrest
    ctx.fillStyle = '#616161';
    roundRect(ctx, x + pad, y + pad, TILE - pad * 2, 8, 4);
    ctx.fill();
    // Legs visible at bottom
    ctx.fillStyle = '#555';
    ctx.fillRect(x + pad + 2, y + TILE - pad - 1, 3, 3);
    ctx.fillRect(x + TILE - pad - 5, y + TILE - pad - 1, 3, 3);
    // Seat cushion circle
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(x + TILE / 2, y + TILE / 2 + 2, 10, 0, Math.PI * 2);
    ctx.stroke();
}

function drawPlant(x, y) {
    // Pot shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.moveTo(x + 11, y + 44);
    ctx.lineTo(x + 37, y + 44);
    ctx.lineTo(x + 34, y + 26);
    ctx.lineTo(x + 14, y + 26);
    ctx.closePath();
    ctx.fill();
    // Terracotta pot
    const potGrad = ctx.createLinearGradient(x + 10, y + 24, x + 38, y + 24);
    potGrad.addColorStop(0, '#A1623A');
    potGrad.addColorStop(0.5, '#C77B4A');
    potGrad.addColorStop(1, '#8B5232');
    ctx.fillStyle = potGrad;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 42);
    ctx.lineTo(x + 36, y + 42);
    ctx.lineTo(x + 33, y + 26);
    ctx.lineTo(x + 15, y + 26);
    ctx.closePath();
    ctx.fill();
    // Pot rim
    ctx.fillStyle = '#B5694A';
    roundRect(ctx, x + 12, y + 24, 24, 4, 2);
    ctx.fill();
    // Soil
    ctx.fillStyle = '#4A3520';
    ctx.beginPath();
    ctx.ellipse(x + TILE / 2, y + 26, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Main foliage
    ctx.fillStyle = '#43A047';
    ctx.beginPath();
    ctx.arc(x + TILE / 2, y + 16, 12, 0, Math.PI * 2);
    ctx.fill();
    // Leaf clusters
    ctx.fillStyle = '#388E3C';
    ctx.beginPath();
    ctx.arc(x + TILE / 2 - 7, y + 12, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    ctx.arc(x + TILE / 2 + 5, y + 14, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2E7D32';
    ctx.beginPath();
    ctx.arc(x + TILE / 2, y + 9, 6, 0, Math.PI * 2);
    ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(x + TILE / 2 - 3, y + 12, 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawWall(x, y) {
    // Main wall fill
    ctx.fillStyle = '#5A5A5A';
    ctx.fillRect(x, y, TILE, TILE);

    // Brick pattern
    const brickH = TILE / 4;
    const brickW = TILE / 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let row = 0; row < 4; row++) {
        const by = y + row * brickH;
        const offset = (row % 2) * (brickW / 2);
        ctx.beginPath();
        ctx.moveTo(x, by);
        ctx.lineTo(x + TILE, by);
        ctx.stroke();
        for (let col = 0; col < 3; col++) {
            const bx = x + offset + col * brickW;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx, by + brickH);
            ctx.stroke();
        }
    }
    // Highlight on top edges of bricks
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    for (let row = 0; row < 4; row++) {
        const by = y + row * brickH + 1;
        ctx.beginPath();
        ctx.moveTo(x + 1, by);
        ctx.lineTo(x + TILE - 1, by);
        ctx.stroke();
    }
    // 3D edge - top and left lighter
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, y, TILE, 2);
    ctx.fillRect(x, y, 2, TILE);
    // bottom and right darker
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(x, y + TILE - 2, TILE, 2);
    ctx.fillRect(x + TILE - 2, y, 2, TILE);
}

function drawPetBed(x, y, w, h) {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2 + 1, y + h / 2 + 2, w / 2 - 3, h / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Outer rim
    const rimGrad = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 2);
    rimGrad.addColorStop(0, '#EF9A9A');
    rimGrad.addColorStop(0.7, '#E57373');
    rimGrad.addColorStop(1, '#C62828');
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 4, h / 2 - 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Inner cushion
    const cushGrad = ctx.createRadialGradient(x + w / 2 - 3, y + h / 2 - 2, 0, x + w / 2, y + h / 2, w / 3);
    cushGrad.addColorStop(0, '#FFCDD2');
    cushGrad.addColorStop(1, '#EF9A9A');
    ctx.fillStyle = cushGrad;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 12, h / 2 - 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Fabric stitch
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 8, h / 2 - 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawRoomba() {
    const x = roomba.col * TILE + TILE / 2;
    const y = roomba.row * TILE + TILE / 2;
    const r = 19;
    const dirAngles = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };
    const angle = dirAngles[roomba.dir];

    ctx.save();
    ctx.translate(x, y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(1, 2, r, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bump flash glow
    if (bumpFlash > 0) {
        ctx.shadowColor = '#FF5252';
        ctx.shadowBlur = 20;
    }

    // Main body - dark charcoal like a real Roomba
    const bodyGrad = ctx.createRadialGradient(-4, -4, 0, 0, 0, r);
    bodyGrad.addColorStop(0, '#4A4A4A');
    bodyGrad.addColorStop(0.6, '#333333');
    bodyGrad.addColorStop(1, '#222222');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Outer ring / bumper
    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // Bumper sensor band (front half)
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r - 1, angle - Math.PI / 2, angle + Math.PI / 2);
    ctx.stroke();

    // Top plate - teal accent (like iRobot colored ring)
    ctx.strokeStyle = '#1A7A6D';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r - 5, 0, Math.PI * 2);
    ctx.stroke();

    // Direction indicator - front brush area
    ctx.fillStyle = '#1A7A6D';
    ctx.beginPath();
    ctx.arc(0, 0, r - 6, angle - 0.4, angle + 0.4);
    const fx = Math.cos(angle) * (r - 6);
    const fy = Math.sin(angle) * (r - 6);
    ctx.lineTo(fx * 0.3, fy * 0.3);
    ctx.closePath();
    ctx.fill();

    // Spinning brush rollers (two small lines near the front)
    ctx.save();
    ctx.rotate(angle);
    // Left brush
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1.5;
    const brushAngle = roombaWheelAngle;
    ctx.save();
    ctx.translate(r - 8, -6);
    ctx.rotate(brushAngle);
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(4, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 4);
    ctx.stroke();
    ctx.restore();
    // Right brush
    ctx.save();
    ctx.translate(r - 8, 6);
    ctx.rotate(-brushAngle * 1.3);
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(4, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 4);
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // Center button / power indicator
    const btnGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 5);
    if (roomba.battery > 20) {
        btnGrad.addColorStop(0, '#4CAF50');
        btnGrad.addColorStop(1, '#2E7D32');
    } else {
        btnGrad.addColorStop(0, '#F44336');
        btnGrad.addColorStop(1, '#C62828');
    }
    ctx.fillStyle = btnGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.ellipse(-5, -6, 6, 3, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // Side wheels (two small bumps)
    ctx.fillStyle = '#111';
    ctx.save();
    ctx.rotate(angle + Math.PI / 2);
    // Left wheel
    ctx.fillRect(-3, r - 5, 6, 4);
    // Right wheel
    ctx.fillRect(-3, -r + 1, 6, 4);
    ctx.restore();

    ctx.restore();
}

function drawCleanAnimations() {
    for (let i = cleanAnimations.length - 1; i >= 0; i--) {
        const anim = cleanAnimations[i];
        anim.progress += 0.04;
        if (anim.progress >= 1) {
            cleanAnimations.splice(i, 1);
            continue;
        }
        const x = anim.col * TILE + TILE / 2;
        const y = anim.row * TILE + TILE / 2;
        const alpha = 1 - anim.progress;

        ctx.save();
        ctx.globalAlpha = alpha;
        // Sparkle stars
        for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2 + anim.progress * 3;
            const dist = 6 + anim.progress * 16;
            const px = x + Math.cos(a) * dist;
            const py = y + Math.sin(a) * dist;
            const size = 2 * (1 - anim.progress);
            // 4-point star
            ctx.fillStyle = '#FFF';
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

// === NPC PAR REPLAY ===
function startParReplay() {
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
}

function updateNpcReplay() {
    if (!npcReplay.active || gameState !== 'PAR_REPLAY') return;

    npcReplay.timer++;
    // Step every N frames (NPC_STEP_INTERVAL ms / ~16.6ms per frame)
    const framesPerStep = Math.max(1, Math.round(NPC_STEP_INTERVAL / 16.6));
    if (npcReplay.timer % framesPerStep !== 0) return;

    npcReplay.stepIndex++;
    if (npcReplay.stepIndex >= parPath.length) {
        npcReplay.active = false;
        gameState = 'LEVEL_COMPLETE';
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

    // Clean the tile in the NPC grid
    if (npcReplay.grid[step.row][step.col] === DIRTY) {
        npcReplay.grid[step.row][step.col] = CLEAN;
    }

    // Add to trail
    npcReplay.trailAlpha.push({ col: step.col, row: step.row, alpha: 1.0 });

    // Fade trail
    for (let i = npcReplay.trailAlpha.length - 1; i >= 0; i--) {
        npcReplay.trailAlpha[i].alpha -= 0.02;
        if (npcReplay.trailAlpha[i].alpha <= 0) {
            npcReplay.trailAlpha.splice(i, 1);
        }
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
        ctx.fillStyle = '#00BFFF';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.restore();
    }
}

function drawNpcVacuum() {
    const x = npcReplay.col * TILE + TILE / 2;
    const y = npcReplay.row * TILE + TILE / 2;
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
    // Label
    ctx.fillStyle = 'rgba(0, 191, 255, 0.9)';
    ctx.font = 'bold 14px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`NPC Par Route  —  Step ${npcReplay.stepIndex} / ${parPath.length - 1}`, CANVAS_W / 2, barY + barH + 18);

    // Bar background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    roundRect(ctx, barX, barY, barW, barH, 3);
    ctx.fill();
    // Bar fill
    ctx.fillStyle = '#00BFFF';
    ctx.shadowColor = '#00BFFF';
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
    if (gameState === 'LEVEL_COMPLETE') {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        ctx.fillStyle = '#4CAF50';
        ctx.font = 'bold 40px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Level Complete!', CANVAS_W / 2, CANVAS_H / 2 - 40);

        ctx.fillStyle = '#FFF';
        ctx.font = '20px Segoe UI, sans-serif';
        ctx.fillText(`Score: ${score}`, CANVAS_W / 2, CANVAS_H / 2 + 10);
        ctx.fillText(`Moves: ${moves}`, CANVAS_W / 2, CANVAS_H / 2 + 40);

        // Watch par route option
        ctx.fillStyle = '#00BFFF';
        ctx.font = '16px Segoe UI, sans-serif';
        ctx.fillText('Press W to watch the NPC par route', CANVAS_W / 2, CANVAS_H / 2 + 75);

        if (currentLevel < LEVELS.length - 1) {
            ctx.fillStyle = '#A0C4FF';
            ctx.font = '18px Segoe UI, sans-serif';
            ctx.fillText('Press SPACE or click for Next Level', CANVAS_W / 2, CANVAS_H / 2 + 105);
        } else {
            ctx.fillStyle = '#FFD600';
            ctx.font = 'bold 28px Segoe UI, sans-serif';
            ctx.fillText('You Win! All levels complete!', CANVAS_W / 2, CANVAS_H / 2 + 105);
            ctx.font = '16px Segoe UI, sans-serif';
            ctx.fillStyle = '#CCC';
            ctx.fillText('Press R to play again', CANVAS_W / 2, CANVAS_H / 2 + 135);
        }

        ctx.restore();
    } else if (gameState === 'GAME_OVER') {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        ctx.fillStyle = '#F44336';
        ctx.font = 'bold 40px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Out of Battery!', CANVAS_W / 2, CANVAS_H / 2 - 20);

        ctx.fillStyle = '#FFF';
        ctx.font = '18px Segoe UI, sans-serif';
        ctx.fillText('Return to the charger next time!', CANVAS_W / 2, CANVAS_H / 2 + 20);
        ctx.fillText('Press R to restart', CANVAS_W / 2, CANVAS_H / 2 + 50);

        ctx.restore();
    }
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

// === UI UPDATES ===
function updateUI() {
    elCleaned.textContent = `${cleaned} / ${totalDirty}`;
    elMoves.textContent = moves;
    elParCount.textContent = parMoves;
    elScore.textContent = score;
    elLevelNum.textContent = currentLevel + 1;

    const pct = roomba.battery;
    elBatteryFill.style.width = pct + '%';
    elBatteryText.textContent = pct + '%';
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
}

// === GAME LOOP ===
function render() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    if (gameState === 'PAR_REPLAY') {
        updateNpcReplay();
        drawNpcGrid();
        drawObstacles();
        drawNpcTrail();
        drawNpcVacuum();
        drawNpcOverlay();
    } else {
        drawGrid();
        drawObstacles();
        drawCleanAnimations();
        drawRoomba();
        drawOverlay();
    }

    if (bumpFlash > 0) bumpFlash--;
    chargerPulse++;

    requestAnimationFrame(render);
}

// === NEXT LEVEL / RESTART HANDLERS ===
function nextLevel() {
    if (gameState === 'LEVEL_COMPLETE' && currentLevel < LEVELS.length - 1) {
        currentLevel++;
        initLevel(currentLevel);
    }
}

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    createFloorPatterns();

    elCleaned = document.getElementById('cleanedCount');
    elMoves = document.getElementById('moveCount');
    elScore = document.getElementById('scoreDisplay');
    elBatteryFill = document.getElementById('batteryFill');
    elBatteryText = document.getElementById('batteryText');
    elLevelNum = document.getElementById('levelNum');
    elBtnRestart = document.getElementById('btnRestart');
    elParCount = document.getElementById('parCount');

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
        initLevel(currentLevel);
    });

    // Canvas click for next level
    canvas.addEventListener('click', () => {
        if (gameState === 'LEVEL_COMPLETE') {
            nextLevel();
        }
    });

    initLevel(0);
    render();
});
