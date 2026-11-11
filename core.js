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

const MOVE_INTERVAL = 120;    // ms between moves when holding (top-down)
const FP_MOVE_INTERVAL = 180; // slower in first person, where 8 tiles/s feels like a sprint
// A press moves once straight away and only starts repeating after it has been held this long.
// Without the pause an ordinary tap, which outlasts one repeat interval, moved the vacuum twice.
const HOLD_DELAY_KEYS = 220;  // keyboard
const HOLD_DELAY_TOUCH = 300; // the on-screen d-pad: a finger stays down longer than a key
const GHOST_MOUSE_MS = 800;   // how long after a touch a browser may still send made-up mouse events
const FRAME_MS = 1000 / 60;   // animation constants below are tuned for 60 fps and scaled by dt
const BANNER_MS = 2800;       // how long the level-name banner stays up

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

// These six are the ground floor. levels.js adds the other floors and then counts the house.

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

// Build the grid for a level (used by solver). Takes a level index or a room object.
function buildLevelGrid(levelIndex) {
    const level = typeof levelIndex === 'number' ? LEVELS[levelIndex] : levelIndex;
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

// Find the farthest walkable corner from the charger for NPC start
function findNpcStartCorner(g, chargerCol, chargerRow) {
    const corners = [
        { col: 0, row: 0 },
        { col: COLS - 1, row: 0 },
        { col: 0, row: ROWS - 1 },
        { col: COLS - 1, row: ROWS - 1 },
    ];
    const chargerDist = bfsFromSource(g, chargerCol, chargerRow);
    let best = null;
    let bestDist = -1;
    for (const corner of corners) {
        // Skip corners occupied by obstacles
        if (g[corner.row][corner.col] === OBSTACLE) continue;
        const d = chargerDist[corner.row][corner.col];
        if (d > bestDist) {
            bestDist = d;
            best = corner;
        }
    }
    // Fallback: if no corner is reachable, just use charger position
    return best || { col: chargerCol, row: chargerRow };
}

// Compute par moves AND full path for a level using greedy nearest-neighbor with battery
function computeParRoute(levelIndex) {
    const level = typeof levelIndex === 'number' ? LEVELS[levelIndex] : levelIndex;
    const batteryCost = level.batteryCost || 1;
    const maxBattery = 100;
    const g = buildLevelGrid(level);

    const chargerDist = bfsFromSource(g, level.charger.col, level.charger.row);

    // Collect dirty tiles
    const dirtyTiles = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (g[r][c] === DIRTY) dirtyTiles.push({ col: c, row: r });
        }
    }

    // NPC starts from farthest corner and walks to charger first
    const npcStart = findNpcStartCorner(g, level.charger.col, level.charger.row);
    const approachPath = bfsPath(g, npcStart.col, npcStart.row, level.charger.col, level.charger.row) || [];

    let curCol = level.charger.col;
    let curRow = level.charger.row;
    let battery = maxBattery;
    let totalMoves = 0;
    const uncleaned = new Set(dirtyTiles.map((_, i) => i));
    const fullPath = [{ col: npcStart.col, row: npcStart.row }]; // start at far corner

    // Prepend approach path (corner → charger) — NPC does NOT clean during approach
    for (const step of approachPath) {
        fullPath.push(step);
    }
    const approachLength = approachPath.length + 1; // includes starting position

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
            // Already home on a full battery and still nothing in range: the rest cannot be
            // cleaned (walled off, or too far for this battery). Stop instead of looping.
            if (curCol === level.charger.col && curRow === level.charger.row && battery === maxBattery) break;
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

    return { totalMoves, fullPath, approachLength };
}

// === DIRECTIONS ===
// Grid deltas and camera angles for the four facings
const FP_TURN_STEP = Math.PI / 2; // 90 degree turns
const FP_DIR_ORDER = ['up', 'right', 'down', 'left']; // clockwise
const FP_ANGLE_MAP = { up: -Math.PI / 2, right: 0, down: Math.PI / 2, left: Math.PI };

const DIR_DELTAS = {
    up:    { dc: 0, dr: -1 },
    down:  { dc: 0, dr: 1 },
    left:  { dc: -1, dr: 0 },
    right: { dc: 1, dr: 0 },
};
const OPPOSITE_DIR = { up: 'down', down: 'up', left: 'right', right: 'left' };

// Deterministic pseudo-random generator, so procedural artwork looks the same every load
function seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// BFS from several sources at once (e.g. every tile that charges), returns a distance grid
function bfsFromSources(g, sources) {
    const dist = Array.from({ length: ROWS }, () => new Int16Array(COLS).fill(-1));
    const queue = [];
    for (const s of sources) {
        if (dist[s.row][s.col] !== -1) continue;
        dist[s.row][s.col] = 0;
        queue.push([s.col, s.row]);
    }
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
