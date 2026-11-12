// === EXTRA ROOMS ===
// Classic script with no DOM (loaded after core.js). Rooms beyond the six in the house: the
// room of the day and rooms the player builds. A room has the same shape as a level
// ({ name, batteryCost, charger, obstacles }) plus a theme index, and is loaded into the one
// extra slot LEVELS[SPECIAL_LEVEL]. This file holds the piece catalogue, validation, the compact
// text code a room is saved and shared as, dates, the daily generator, the editor's placement
// rules, and the replay of a recorded run.

const ROOM_PIECES = {
    couch:  { w: 3, h: 1, code: 's', turns: true, label: 'Sofa' },
    table:  { w: 2, h: 2, code: 't', turns: false, label: 'Table' },
    chair:  { w: 1, h: 1, code: 'c', turns: false, label: 'Chair' },
    plant:  { w: 1, h: 1, code: 'p', turns: false, label: 'Plant' },
    petbed: { w: 2, h: 1, code: 'b', turns: true, label: 'Pet bed' },
    wall:   { w: 1, h: 1, code: 'w', turns: false, label: 'Wall' },
};
const ROOM_CODE_VERSION = 1;
const ROOM_MIN_TILES = 20;
const ROOM_BATTERY = 100;      // every room must be solvable on a stock battery
const ROOM_NAME_MAX = 28;
const ROOM_B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

function roomPieceSize(type, vertical) {
    const p = ROOM_PIECES[type];
    if (!p) return null;
    return vertical && p.turns ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

// The farthest a tile may be from the dock and still be reached and returned from on one charge
function roomReach(batteryCost) {
    return Math.floor(ROOM_BATTERY / (2 * (batteryCost || 1)));
}

function cleanRoomName(name) {
    const s = String(name == null ? '' : name).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
    return s.slice(0, ROOM_NAME_MAX) || 'My Room';
}

function blankRoom(name, theme) {
    return { name: cleanRoomName(name), theme: theme | 0, batteryCost: 1, charger: { col: 0, row: ROWS - 1 }, obstacles: [] };
}

// --- Validation ------------------------------------------------------------------------------

// Can this room be played to the end? `sound` says the pieces fit and do not overlap;
// `ok` adds that every tile can be reached and returned from on a stock battery.
function validateRoom(room) {
    const out = { ok: false, sound: false, tiles: 0, unreachable: [], tooFar: [], reason: '' };
    if (!room || !room.charger || !Array.isArray(room.obstacles)) {
        out.reason = 'This is not a room.';
        return out;
    }
    const inside = (c, r) => Number.isInteger(c) && Number.isInteger(r) && c >= 0 && c < COLS && r >= 0 && r < ROWS;
    const ch = room.charger;
    if (!inside(ch.col, ch.row)) {
        out.reason = 'The dock is outside the room.';
        return out;
    }
    if (![1, 2, 3].includes(room.batteryCost)) {
        out.reason = 'The battery setting is not valid.';
        return out;
    }
    const taken = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
    for (const o of room.obstacles) {
        if (!o || !ROOM_PIECES[o.type] || !(o.w >= 1) || !(o.h >= 1) || !inside(o.col, o.row) || !inside(o.col + o.w - 1, o.row + o.h - 1)) {
            out.reason = 'A piece is outside the room.';
            return out;
        }
        for (let dr = 0; dr < o.h; dr++) {
            for (let dc = 0; dc < o.w; dc++) {
                if (taken[o.row + dr][o.col + dc]) {
                    out.reason = 'Two pieces overlap.';
                    return out;
                }
                taken[o.row + dr][o.col + dc] = 1;
            }
        }
    }
    if (taken[ch.row][ch.col]) {
        out.reason = 'The dock needs a free tile.';
        return out;
    }
    out.sound = true;
    const g = buildLevelGrid(room);
    const dist = bfsFromSource(g, ch.col, ch.row);
    const reach = roomReach(room.batteryCost);
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (g[r][c] !== DIRTY) continue;
            out.tiles++;
            if (dist[r][c] < 0) out.unreachable.push({ col: c, row: r });
            else if (dist[r][c] > reach) out.tooFar.push({ col: c, row: r });
        }
    }
    const count = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
    if (out.unreachable.length) out.reason = `${count(out.unreachable.length, 'tile is', 'tiles are')} walled off.`;
    else if (out.tooFar.length) out.reason = `${count(out.tooFar.length, 'tile is', 'tiles are')} too far from the dock for this battery.`;
    else if (out.tiles < ROOM_MIN_TILES) out.reason = `Leave at least ${ROOM_MIN_TILES} tiles of floor to clean.`;
    else out.ok = true;
    return out;
}

// --- Room codes --------------------------------------------------------------------------------

// A room as a short string of URL-safe characters, for saving and for share links:
// version . theme . battery cost . dock . pieces. A piece is a letter, a column, a row, and a
// "v" when it stands upright; columns and rows are single base-36 digits.
function encodeRoom(room) {
    const items = room.obstacles.map((o) => ROOM_PIECES[o.type].code + ROOM_B36[o.col] + ROOM_B36[o.row] + (o.h > o.w ? 'v' : ''));
    return [ROOM_CODE_VERSION, room.theme | 0, room.batteryCost || 1, ROOM_B36[room.charger.col] + ROOM_B36[room.charger.row], items.join('_')].join('.');
}

// The room a code describes, or null when the code is not a sound room. A sound room that
// cannot be finished yet (one saved mid-edit) still decodes; check validateRoom(...).ok to play.
function decodeRoom(code, name) {
    if (typeof code !== 'string' || code.length > 1200) return null;
    const parts = code.split('.');
    if (parts.length !== 5 || parts[0] !== String(ROOM_CODE_VERSION)) return null;
    if (!/^[0-5]$/.test(parts[1]) || !/^[1-3]$/.test(parts[2]) || !/^[0-9a-e][0-9a-b]$/.test(parts[3])) return null;
    const byCode = {};
    for (const type of Object.keys(ROOM_PIECES)) byCode[ROOM_PIECES[type].code] = type;
    const obstacles = [];
    if (parts[4] !== '') {
        for (const item of parts[4].split('_')) {
            const m = /^([a-z])([0-9a-e])([0-9a-b])(v?)$/.exec(item);
            if (!m || !byCode[m[1]]) return null;
            const type = byCode[m[1]];
            if (m[4] && !ROOM_PIECES[type].turns) return null;
            const size = roomPieceSize(type, !!m[4]);
            obstacles.push({ type, col: ROOM_B36.indexOf(m[2]), row: ROOM_B36.indexOf(m[3]), w: size.w, h: size.h });
        }
    }
    const room = {
        name: cleanRoomName(name),
        theme: Number(parts[1]),
        batteryCost: Number(parts[2]),
        charger: { col: ROOM_B36.indexOf(parts[3][0]), row: ROOM_B36.indexOf(parts[3][1]) },
        obstacles,
    };
    return validateRoom(room).sound ? room : null;
}

// --- Editing -------------------------------------------------------------------------------------

// Where a piece would sit with its top-left at (col, row), nudged to stay inside the room
function roomFootprint(type, col, row, vertical) {
    const size = roomPieceSize(type, vertical);
    if (!size) return null;
    return {
        col: Math.max(0, Math.min(COLS - size.w, col)),
        row: Math.max(0, Math.min(ROWS - size.h, row)),
        w: size.w,
        h: size.h,
    };
}

function roomPieceAt(room, col, row) {
    return room.obstacles.findIndex((o) => col >= o.col && col < o.col + o.w && row >= o.row && row < o.row + o.h);
}

function roomCanPlace(room, type, col, row, vertical) {
    const f = roomFootprint(type, col, row, vertical);
    if (!f) return false;
    const ch = room.charger;
    if (ch.col >= f.col && ch.col < f.col + f.w && ch.row >= f.row && ch.row < f.row + f.h) return false;
    return !room.obstacles.some((o) => f.col < o.col + o.w && o.col < f.col + f.w && f.row < o.row + o.h && o.row < f.row + f.h);
}

// Put a piece down; returns it, or null when something is in the way
function roomPlace(room, type, col, row, vertical) {
    if (!roomCanPlace(room, type, col, row, vertical)) return null;
    const f = roomFootprint(type, col, row, vertical);
    const obs = { type, col: f.col, row: f.row, w: f.w, h: f.h };
    room.obstacles.push(obs);
    return obs;
}

function roomErase(room, col, row) {
    const i = roomPieceAt(room, col, row);
    if (i < 0) return false;
    room.obstacles.splice(i, 1);
    return true;
}

function roomMoveDock(room, col, row) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS || roomPieceAt(room, col, row) >= 0) return false;
    if (room.charger.col === col && room.charger.row === row) return false;
    room.charger = { col, row };
    return true;
}

// --- Dates ---------------------------------------------------------------------------------------

function roomPad2(n) {
    return (n < 10 ? '0' : '') + n;
}

// The player's own calendar day, as YYYY-MM-DD
function dateKeyOf(date) {
    return `${date.getFullYear()}-${roomPad2(date.getMonth() + 1)}-${roomPad2(date.getDate())}`;
}

function parseDateKey(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
    return { y, m: mo, d, time: t.getTime() };
}

// Whole days since 1 January 1970; consecutive calendar days differ by exactly one
function dayNumber(key) {
    const p = parseDateKey(key);
    return p ? Math.round(p.time / 86400000) : 0;
}

function shiftDateKey(key, days) {
    const t = new Date((dayNumber(key) + days) * 86400000);
    return `${t.getUTCFullYear()}-${roomPad2(t.getUTCMonth() + 1)}-${roomPad2(t.getUTCDate())}`;
}

function formatDateKey(key) {
    const p = parseDateKey(key);
    if (!p) return String(key);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[new Date(p.time).getUTCDay()]} ${p.d} ${months[p.m - 1]} ${p.y}`;
}

// --- Room of the day -------------------------------------------------------------------------------

const DAILY_ADJECTIVES = ['Cosmic', 'Atomic', 'Starlit', 'Rocket', 'Saucer', 'Orbit', 'Comet', 'Nebula',
    'Sputnik', 'Neon', 'Chrome', 'Lunar', 'Solar', 'Galaxy', 'Jet-Age', 'Moonbeam'];
const DAILY_NOUNS = ['Parlour', 'Den', 'Lounge', 'Kitchenette', 'Study', 'Workshop', 'Playroom', 'Sunroom',
    'Rumpus Room', 'Pantry', 'Hideout', 'Clubhouse', 'Gallery', 'Lab', 'Hangar', 'Diner'];

// 32-bit FNV-1a, to turn a date into a seed
function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

// The room for a calendar day: the same room for everyone, on any device. Layouts are rolled
// from the date until one passes validation and is neither cramped nor mostly commuting.
function generateDailyRoom(key) {
    const day = dayNumber(key);
    for (let attempt = 0; attempt < 80; attempt++) {
        const rnd = seededRandom(hashString(`${key}#${attempt}`));
        for (let i = 0; i < 5; i++) rnd();
        const room = rollRoom(rnd, day);
        const v = validateRoom(room);
        if (!v.ok || v.tiles < 96) continue;
        const par = computeParRoute(room).totalMoves;
        if (par < v.tiles || par > v.tiles * 2.7) continue;
        room.daily = key;
        return room;
    }
    // Not reached in practice: an open room with a plant in each corner always passes
    const room = blankRoom('Quiet Room', ((day % 6) + 6) % 6);
    room.charger = { col: 7, row: ROWS - 1 };
    for (const [c, r] of [[0, 0], [COLS - 1, 0], [0, ROWS - 1], [COLS - 1, ROWS - 1]]) roomPlace(room, 'plant', c, r, false);
    room.daily = key;
    return room;
}

// One candidate layout from a random source. Every piece is checked as it goes down: nothing
// overlaps, the dock keeps clear tiles around it, and no part of the floor is ever walled off.
function rollRoom(rnd, day) {
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
    const style = pick(['open', 'open', 'rooms', 'rooms', 'rooms', 'maze']);
    const cost = style === 'open' ? 1 : pick([1, 1, 2]);
    const docks = cost === 1
        ? [[0, 0], [14, 0], [0, 11], [14, 11], [7, 11], [7, 0], [0, 6], [14, 6], [7, 6]]
        : [[7, 6], [7, 5], [7, 11], [7, 0], [0, 6], [14, 6]];
    const [dockCol, dockRow] = pick(docks);
    const room = {
        name: `${pick(DAILY_ADJECTIVES)} ${pick(DAILY_NOUNS)}`,
        theme: ((day % 6) + 6) % 6,
        batteryCost: cost,
        charger: { col: dockCol, row: dockRow },
        obstacles: [],
    };
    const nearDock = (c, r) => Math.abs(c - dockCol) + Math.abs(r - dockRow) <= 1;
    const connected = () => {
        const g = buildLevelGrid(room);
        const dist = bfsFromSource(g, dockCol, dockRow);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (g[r][c] !== OBSTACLE && dist[r][c] < 0) return false;
        return true;
    };
    // Put a group of pieces down together, or none of them
    const tryGroup = (group) => {
        const before = room.obstacles.length;
        for (const p of group) {
            let clear = p.col >= 0 && p.row >= 0 && p.col + p.w <= COLS && p.row + p.h <= ROWS;
            for (let dr = 0; clear && dr < p.h; dr++) for (let dc = 0; dc < p.w; dc++) if (nearDock(p.col + dc, p.row + dr)) clear = false;
            if (!clear || !roomPlace(room, p.type, p.col, p.row, p.h > p.w)) {
                room.obstacles.length = before;
                return false;
            }
        }
        if (!connected()) {
            room.obstacles.length = before;
            return false;
        }
        return true;
    };
    const piece = (type, col, row, vertical) => {
        const size = roomPieceSize(type, vertical);
        return { type, col, row, w: size.w, h: size.h };
    };

    // Walls first: a few runs that divide the room without closing any of it off
    const runs = style === 'open' ? int(0, 1) : style === 'rooms' ? int(2, 4) : int(5, 7);
    for (let i = 0; i < runs; i++) {
        for (let t = 0; t < 24; t++) {
            const across = rnd() < 0.5;
            const len = int(2, style === 'maze' ? 4 : 5);
            const col = int(1, COLS - 2 - (across ? len - 1 : 0));
            const row = int(1, ROWS - 2 - (across ? 0 : len - 1));
            const group = [];
            for (let k = 0; k < len; k++) group.push(piece('wall', col + (across ? k : 0), row + (across ? 0 : k), false));
            if (tryGroup(group)) break;
        }
    }
    // Sofas, mostly with their backs to a wall
    for (let i = int(1, style === 'maze' ? 1 : 2); i > 0; i--) {
        for (let t = 0; t < 24; t++) {
            const upright = rnd() < 0.35;
            const hug = rnd() < 0.6;
            const col = upright ? (hug ? pick([0, COLS - 1]) : int(0, COLS - 1)) : int(0, COLS - 3);
            const row = upright ? int(0, ROWS - 3) : (hug ? pick([0, ROWS - 1]) : int(0, ROWS - 1));
            if (tryGroup([piece('couch', col, row, upright)])) break;
        }
    }
    // Tables, then chairs that mostly pull up to them
    const tables = [];
    for (let i = int(1, style === 'open' ? 3 : 2); i > 0; i--) {
        for (let t = 0; t < 24; t++) {
            const p = piece('table', int(1, COLS - 3), int(1, ROWS - 3), false);
            if (tryGroup([p])) {
                tables.push(p);
                break;
            }
        }
    }
    for (let i = int(2, 4); i > 0; i--) {
        for (let t = 0; t < 24; t++) {
            let col = int(0, COLS - 1), row = int(0, ROWS - 1);
            if (tables.length && rnd() < 0.65) {
                const tb = pick(tables);
                const side = int(0, 3);
                col = side === 0 ? tb.col - 1 : side === 1 ? tb.col + 2 : tb.col + int(0, 1);
                row = side === 2 ? tb.row - 1 : side === 3 ? tb.row + 2 : tb.row + int(0, 1);
            }
            if (tryGroup([piece('chair', col, row, false)])) break;
        }
    }
    // Plants like the edges of a room
    for (let i = int(2, 4); i > 0; i--) {
        for (let t = 0; t < 24; t++) {
            let col = int(0, COLS - 1), row = int(0, ROWS - 1);
            if (rnd() < 0.75) {
                if (rnd() < 0.5) row = pick([0, ROWS - 1]);
                else col = pick([0, COLS - 1]);
            }
            if (tryGroup([piece('plant', col, row, false)])) break;
        }
    }
    if (rnd() < 0.7) {
        for (let t = 0; t < 24; t++) {
            const upright = rnd() < 0.3;
            if (tryGroup([piece('petbed', int(0, COLS - 2), int(0, ROWS - 2), upright)])) break;
        }
    }
    return room;
}

// --- Recorded runs ---------------------------------------------------------------------------------

// Replay a recorded run (a string of U, D, L and R moves from the dock) on a room: where the
// vacuum stood after each move, which way it faced, and how many tiles were clean by then.
// Entry 0 is the dock before any move. Stops at the first move the room does not allow.
function replayRun(room, path, cornerBrush) {
    const g = buildLevelGrid(room);
    let col = room.charger.col, row = room.charger.row, cleanedSoFar = 0;
    const steps = [{ col, row, dir: 'up', cleaned: 0 }];
    const dirs = { U: 'up', D: 'down', L: 'left', R: 'right' };
    for (const ch of String(path || '')) {
        const dir = dirs[ch];
        if (!dir) break;
        const d = DIR_DELTAS[dir];
        const nc = col + d.dc, nr = row + d.dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS || g[nr][nc] === OBSTACLE) break;
        col = nc;
        row = nr;
        if (g[row][col] === DIRTY) {
            g[row][col] = CLEAN;
            cleanedSoFar++;
        }
        // with a corner brush fitted, the run sweeps out dead ends as the vacuum does now
        if (cornerBrush) {
            for (const t of cornerBrushTargets(g, col, row)) {
                g[t.row][t.col] = CLEAN;
                cleanedSoFar++;
            }
        }
        steps.push({ col, row, dir, cleaned: cleanedSoFar });
    }
    return steps;
}
