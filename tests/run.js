#!/usr/bin/env node
// Headless checks for the level data, the par solver and the movement rules.
// The game scripts are classic browser scripts, so they are loaded into a VM context
// with just enough DOM stand-ins for game.js to initialise. Run: node tests/run.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

// --- DOM stand-ins ----------------------------------------------------------

function stubElement() {
    const base = {
        style: {},
        dataset: {},
        textContent: '',
        innerHTML: '',
        title: '',
        disabled: false,
        classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    };
    return new Proxy(base, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'getContext') return () => stubContext();
            return () => stubElement();
        },
        set(t, k, v) {
            t[k] = v;
            return true;
        },
    });
}

function stubContext() {
    return new Proxy({}, { get: () => () => ({}) });
}

const storage = new Map();
const sandbox = {
    console, Math, Date, performance, setInterval, clearInterval, setTimeout, clearTimeout,
    requestAnimationFrame: () => 0,
    addEventListener() {},
    devicePixelRatio: 1,
    localStorage: {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k),
    },
    document: {
        addEventListener() {},
        getElementById: () => stubElement(),
        createElement: () => stubElement(),
        querySelectorAll: () => [],
    },
    DOMMatrix: class { scale() { return this; } },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ['core.js', 'levels.js', 'rooms.js', 'upgrades.js', 'design.js', 'scene3d.js', ...['style-scifi.js', 'style-steam.js', 'style-voxel.js', 'style-wonder.js'].filter((f) => fs.existsSync(path.join(root, f))), 'render2d.js', 'scene2d.js', 'render3d.js', 'game.js', 'modes.js', 'install.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
}
const G = (expr) => vm.runInContext(expr, sandbox);

// --- Tiny harness ------------------------------------------------------------

let passes = 0;
let failures = 0;
function check(cond, msg) {
    if (cond) passes++;
    else {
        failures++;
        console.error('  FAIL:', msg);
    }
}
function section(name) {
    console.log(name);
}

const COLS = G('COLS'), ROWS = G('ROWS');
const DIRTY = G('DIRTY'), OBSTACLE = G('OBSTACLE'), CHARGER = G('CHARGER'), CLEAN = G('CLEAN');
const LEVELS = G('LEVELS');

// --- Level data ------------------------------------------------------------

section('Level data');
LEVELS.forEach((lv, i) => {
    const g = G(`buildLevelGrid(${i})`);
    check(lv.charger.col >= 0 && lv.charger.col < COLS && lv.charger.row >= 0 && lv.charger.row < ROWS, `${lv.name}: charger in bounds`);
    check(g[lv.charger.row][lv.charger.col] === CHARGER, `${lv.name}: charger tile is not under an obstacle`);
    for (const o of lv.obstacles) {
        check(o.col >= 0 && o.row >= 0 && o.col + o.w <= COLS && o.row + o.h <= ROWS, `${lv.name}: obstacle ${o.type} at ${o.col},${o.row} in bounds`);
        check(!!G('OBS_TYPES')[o.type], `${lv.name}: obstacle type ${o.type} exists`);
    }
    const dist = G(`bfsFromSource(buildLevelGrid(${i}), LEVELS[${i}].charger.col, LEVELS[${i}].charger.row)`);
    let unreachable = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (g[r][c] === DIRTY && dist[r][c] < 0) unreachable++;
    check(unreachable === 0, `${lv.name}: every dirty tile is reachable from the dock (${unreachable} are not)`);
});

// --- Par solver --------------------------------------------------------------

section('Par solver');
LEVELS.forEach((lv, i) => {
    const res = G(`computeParRoute(${i})`);
    const g = G(`buildLevelGrid(${i})`);
    const cost = lv.batteryCost || 1;
    const p = res.fullPath;
    check(p.length > 1, `${lv.name}: route has steps`);
    check(res.totalMoves === p.length - res.approachLength, `${lv.name}: totalMoves matches the cleaning part of the route`);
    check(g[p[0].row][p[0].col] !== OBSTACLE, `${lv.name}: ghost starts on a walkable tile`);
    const dockStep = p[res.approachLength - 1];
    check(dockStep && dockStep.col === lv.charger.col && dockStep.row === lv.charger.row, `${lv.name}: approach ends on the dock`);

    let adjacent = true, throughObstacle = false, batteryOk = true;
    let battery = 100;
    const visited = new Set();
    for (let k = 1; k < p.length; k++) {
        const a = p[k - 1], b = p[k];
        if (Math.abs(a.col - b.col) + Math.abs(a.row - b.row) !== 1) adjacent = false;
        if (g[b.row][b.col] === OBSTACLE) throughObstacle = true;
        if (k >= res.approachLength) {
            battery -= cost;
            if (battery < 0) batteryOk = false;
            if (g[b.row][b.col] === CHARGER) battery = 100;
            visited.add(`${b.col},${b.row}`);
        }
    }
    check(adjacent, `${lv.name}: every step moves one tile`);
    check(!throughObstacle, `${lv.name}: the route never crosses an obstacle`);
    check(batteryOk, `${lv.name}: the ghost never runs out of battery`);
    let missed = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (g[r][c] === DIRTY && !visited.has(`${c},${r}`)) missed++;
    check(missed === 0, `${lv.name}: the route cleans every tile (${missed} missed)`);
});

// --- Movement rules ----------------------------------------------------------

section('Movement rules');
G('viewMode = "TD"; initLevel(0)');
const lv0 = LEVELS[0];
check(G('roomba.col') === lv0.charger.col && G('roomba.row') === lv0.charger.row, 'starts on the dock');
check(G('roomba.dir') === 'up' && G('fpTargetAngle') === G('FP_ANGLE_MAP.up'), 'starts facing up with the camera in step');
check(G('roomba.battery') === 100 && G('cleaned') === 0 && G('gameState') === 'PLAYING', 'fresh level state');

check(G('tryMove(1, 0)') === false, 'moving off the east edge is a bump');
check(G('bumpFlash') === 10, 'a bump flashes');
G('bumpFlash = 0');
check(G('tryMove(0, -1)') === true, 'moving north from the dock works');
check(G('cleaned') === 1 && G('moves') === 1 && G('score') === 10, 'one tile cleaned, one move, ten points');
check(G('roomba.battery') === 99, 'a move costs one battery on level 1');
check(G('grid[10][14]') === CLEAN, 'the tile is now clean');
check(G('tryMove(0, 1)') === true && G('roomba.battery') === 100, 'returning to the dock refills the battery');
check(G('cleaned') === 1, 'the dock tile does not count as cleaned');

G('roomba.col = 9; roomba.row = 5;'); // the table occupies 10-11, 5-6
check(G('tryMove(1, 0)') === false && G('roomba.col') === 9, 'furniture blocks movement');

section('First-person controls');
G('viewMode = "FP"; roomba.dir = "up"; roomba.col = 5; roomba.row = 5;');
G('handleFpDirection("right")');
check(G('roomba.dir') === 'right', 'right turns clockwise');
G('handleFpDirection("left"); handleFpDirection("left")');
check(G('roomba.dir') === 'left', 'left turns anticlockwise');
G('roomba.dir = "up"; handleFpDirection("up")');
check(G('roomba.row') === 4 && G('roomba.col') === 5, 'up drives forward in the facing direction');
G('handleFpDirection("down")');
check(G('roomba.row') === 5 && G('roomba.dir') === 'up', 'down reverses without turning');
G('startHold("left")');
check(G('holdTimer') === null, 'holding a turn key does not auto-repeat in 3D');
G('stopHold(); startHold("up")');
check(G('holdTimer') !== null, 'holding forward does auto-repeat');
G('stopHold()');
check(G('holdTimer') === null && G('heldDir') === null, 'stopHold clears the hold');

section('Scoring and progression');
G('viewMode = "TD"; initLevel(0); tryMove(0, -1); tryMove(-1, 0);');
check(G('score') === 20, 'two tiles, twenty points');
G('restartLevel()');
check(G('score') === 0 && G('cleaned') === 0 && G('moves') === 0, 'restart puts the score back to the level start');

G('initLevel(0); for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if (grid[r][c] === DIRTY && !(c === 14 && r === 10)) grid[r][c] = CLEAN; } cleaned = totalDirty - 1; moves = 100;');
check(G('tryMove(0, -1)') === true && G('gameState') === 'LEVEL_COMPLETE', 'cleaning the last tile completes the level');
const par0 = G('parMoves');
check(G('levelResult.stars') === 3 && G('levelResult.moves') === 101, 'under par earns three stars');
check(G('levelResult.bonus') === 200 + (par0 - 101) * 10, 'bonus is 200 plus 10 per move under par');
check(G('progress.best[0].moves') === 101 && G('progress.unlocked') === 1, 'best result and unlock are recorded');
check(storage.has('ben-vacuum-game.progress.v1'), 'progress is written to storage');
const scoreAfterLevel1 = G('score');
G('nextLevel()');
check(G('currentLevel') === 1 && G('levelStartScore') === scoreAfterLevel1 && G('cleaned') === 0, 'next level keeps the running score');

G('roomba.battery = 1; tryMove(0, -1)');
check(G('gameState') === 'GAME_OVER' && G('roomba.battery') === 0, 'running the battery to zero is game over');

G('progress.unlocked = 5; selectLevel(3)');
check(G('currentLevel') === 3 && G('score') === 0 && G('levelStartScore') === 0, 'jumping to a level starts a fresh run');
G('selectLevel(3); tryMove(0, 1); selectLevel(3)');
check(G('score') === 0, 'selecting the current level restarts it');

section('Vacuum design');
check(G('hsvToHex(0, 1, 1)') === '#FF0000' && G('hsvToHex(120, 1, 1)') === '#00FF00' && G('hsvToHex(240, 1, 1)') === '#0000FF', 'hue to hex at the primaries');
check(G('hsvToHex(0, 0, 1)') === '#FFFFFF', 'zero saturation is white');
const rt = G('hexToHsv("#1A9A8A")');
check(Math.abs(rt.h - 172.5) < 1 && Math.abs(rt.s - 0.831) < 0.01 && Math.abs(rt.v - 0.604) < 0.01, 'hex to hsv round trip values');
check(G('hsvToHex(hexToHsv("#FFE2A8").h, hexToHsv("#FFE2A8").s, 1)') === '#FFE2A8', 'wheel colours survive a round trip at full brightness');
check(G('isHexColor("#abcdef") && !isHexColor("abcdef") && !isHexColor("#abcd") && !isHexColor(42)'), 'hex validation');
G('designReset()');
check(G('design.lightColor') === '#1A9A8A' && G('design.flashOn') === false, 'defaults');
G('setLightColor("#ff00aa"); toggleFlashlight(); setFlashColor("#00ffcc")');
check(G('design.lightColor') === '#FF00AA' && G('design.flashOn') === true && G('design.flashColor') === '#00FFCC', 'setters normalise and apply');
check(G('design.lightRgb[0]') === 255 && G('design.lightRgb[1]') === 0 && G('design.lightRgb[2]') === 170, 'derived rgb follows the colour');
const savedDesign = JSON.parse(storage.get('ben-vacuum-game.design.v1'));
check(savedDesign.lightColor === '#FF00AA' && savedDesign.flashOn === true && savedDesign.flashColor === '#00FFCC', 'design is written to storage');
G('design.lightColor = "#000000"; design.flashOn = false; designLoad()');
check(G('design.lightColor') === '#FF00AA' && G('design.flashOn') === true, 'design is read back from storage');
G('designReset()');
storage.set('ben-vacuum-game.design.v1', JSON.stringify({ lightColor: 'red', flashOn: 'yes', flashColor: 12 }));
G('designLoad()');
check(G('design.lightColor') === '#1A9A8A' && G('design.flashColor') === '#FFE2A8' && G('design.flashOn') === true, 'bad stored colours are ignored, the switch is coerced');
G('setLightColor("not a colour")');
check(G('design.lightColor') === '#1A9A8A', 'an invalid colour is rejected');
G('designReset()');

section('Ghost replay from any state');
G('viewMode = "TD"; progress.unlocked = 5; selectLevel(0); tryMove(0, -1);');
G('startParReplay()');
check(G('gameState') === 'PAR_REPLAY' && G('npcReplay.returnState') === 'PLAYING', 'the ghost can start mid-level');
check(G('cleaned') === 1 && G('roomba.row') === 10, 'the player\'s game is untouched while the ghost runs');
G('endParReplay()');
check(G('gameState') === 'PLAYING' && G('cleaned') === 1, 'ending the replay returns to play');
G('gameState = "GAME_OVER"; startParReplay()');
check(G('gameState') === 'GAME_OVER', 'no ghost from the game-over screen');

section('Upgrades');
G('progress.points = 0; progress.upgrades = sanitizeUpgrades(null); selectLevel(0);');
check(G('batteryMax()') === 100 && G('moveCostMultiplier()') === 1 && G('padRadius()') === 0 && G('overchargeFactor()') === 1 && G('solarPerMove()') === 0, 'no upgrades by default');
check(G('roomba.battery') === 100, 'starts with a full standard battery');
check(G('canBuyUpgrade("motor")') === false && G('buyUpgrade("motor")') === false, 'cannot buy without points');
G('progress.points = 9');
check(G('buyUpgrade("motor")') === true && G('progress.points') === 7 && G('upgradeLevel("motor")') === 1, 'buying spends the cost');
check(Math.abs(G('moveCost()') - 0.85) < 1e-9, 'efficient motor cuts the drain');
G('tryMove(0, -1)');
check(Math.abs(G('roomba.battery') - 99.15) < 1e-9, 'a move costs the reduced amount');
G('buyUpgrade("battery")');
check(G('batteryMax()') === 125 && G('upgradeLevel("battery")') === 1 && G('progress.points') === 5, 'bigger battery raises the maximum');
G('buyUpgrade("pad")');
check(G('padRadius()') === 1 && G('isChargingTile(14, 10)') === true && G('isChargingTile(14, 9)') === false && G('isChargingTile(13, 11)') === true, 'the charging pad covers the dock\'s neighbours');
check(G('chargerDistGrid[9][14]') === 1 && G('chargerDistGrid[10][14]') === 0, 'dock distance measures to the nearest charging tile');
check(G('chargingPadGrid[10][14]') === 1 && G('chargingPadGrid[9][14]') === 0, 'the pad grid marks charging tiles');
G('roomba.battery = 40; roomba.col = 14; roomba.row = 9; tryMove(0, 1)');
check(G('roomba.battery') === 125, 'a pad tile charges to the new maximum');
G('progress.points = 10; buyUpgrade("overcharge"); roomba.battery = 40; roomba.col = 14; roomba.row = 10; tryMove(0, 1)');
check(Math.abs(G('roomba.battery') - 143.75) < 1e-9, 'overcharge takes the battery past full on the dock');
G('roomba.col = 7; roomba.row = 7; tryMove(0, -1)');
check(Math.abs(G('roomba.battery') - (143.75 - 0.85)) < 1e-9, 'an overcharged battery drains normally away from the dock');
G('progress.points = 10; buyUpgrade("solar"); roomba.battery = 140; roomba.col = 7; roomba.row = 7; tryMove(0, -1)');
check(Math.abs(G('roomba.battery') - (140 - 0.85)) < 1e-9, 'solar cells do not top up an overcharged battery');
G('roomba.battery = 50; roomba.col = 7; roomba.row = 7; tryMove(0, -1)');
check(Math.abs(G('roomba.battery') - (50 - 0.85 + 0.2)) < 1e-9, 'solar cells trickle-charge on the move');
check(G('isLowBattery()') === false, 'low battery is relative to the maximum');
G('roomba.battery = 24');
check(G('isLowBattery()') === true, 'under 20% of a 125 battery is low');
const spent = G('upgradeTotalSpent()');
const pointsBeforeRefund = G('progress.points');
G('refundUpgrades()');
check(G('upgradeLevel("motor")') === 0 && G('batteryMax()') === 100 && G('progress.points') === pointsBeforeRefund + spent, 'refund returns every point');
check(JSON.parse(storage.get('ben-vacuum-game.progress.v1')).upgrades.motor === 0, 'upgrade levels are saved');
G('progress.points = 0; buyUpgrade("motor")');
check(G('upgradeLevel("motor")') === 0, 'no points, no purchase after refund');

section('Upgrade points for new stars');
G('progress.points = 0; progress.best = {}; progress.upgrades = sanitizeUpgrades(null); selectLevel(0);');
G('for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if (grid[r][c] === DIRTY && !(c === 14 && r === 10)) grid[r][c] = CLEAN; } cleaned = totalDirty - 1; moves = 300; tryMove(0, -1)');
check(G('levelResult.stars') === 1 && G('levelResult.points') === 1 && G('progress.points') === 1, 'one star on a new level earns one point');
G('selectLevel(0); for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if (grid[r][c] === DIRTY && !(c === 14 && r === 10)) grid[r][c] = CLEAN; } cleaned = totalDirty - 1; moves = 100; tryMove(0, -1)');
check(G('levelResult.stars') === 3 && G('levelResult.points') === 2 && G('progress.points') === 3, 'improving to three stars earns the two new ones');
G('selectLevel(0); for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if (grid[r][c] === DIRTY && !(c === 14 && r === 10)) grid[r][c] = CLEAN; } cleaned = totalDirty - 1; moves = 100; tryMove(0, -1)');
check(G('levelResult.points') === 0 && G('progress.points') === 3, 'repeating a result earns nothing');
check(JSON.parse(storage.get('ben-vacuum-game.progress.v1')).points === 3, 'points are saved');
G('progress.points = 0; progress.upgrades = sanitizeUpgrades(null); saveProgress();');

section('3D lightmap');
const lm = G('fpBakeLightmap(0)');
check(lm.w === G('COLS * FP_LIGHT_CELLS') && lm.h === G('ROWS * FP_LIGHT_CELLS') && lm.data.length === lm.w * lm.h * 3, 'lightmap covers the room at the cell resolution');
const cellAt = (x, y) => { const i = ((y * lm.n) | 0) * lm.w + ((x * lm.n) | 0); return [lm.data[i * 3], lm.data[i * 3 + 1], lm.data[i * 3 + 2]]; };
const nearWindow = cellAt(12.5, 1.5), farCorner = cellAt(1.5, 10.5);
check(nearWindow[0] > farCorner[0] * 1.4, 'the floor by the window is much brighter than the far corner');
check(nearWindow[0] > nearWindow[2], 'window light is warm');
const dock = G('LEVELS[0].charger');
const atDock = cellAt(dock.col + 0.5, dock.row + 0.5), awayFromDock = cellAt(dock.col - 3.5, dock.row + 0.5);
check(atDock[2] - atDock[0] > awayFromDock[2] - awayFromDock[0], 'the dock adds blue light around it');
// Level 1 couch spans columns 5-7 on row 2: the tile just south of it is shaded from the window
const underCouch = cellAt(6.5, 3.5), openFloor = cellAt(6.5, 6.5);
check(underCouch[0] < openFloor[0], 'furniture casts a shadow away from the window');
let finite = true;
for (let i = 0; i < lm.data.length; i++) if (!Number.isFinite(lm.data[i]) || lm.data[i] < 0 || lm.data[i] > 1.4001) { finite = false; break; }
check(finite, 'every light value is finite and within range');

section('Table legs and full screen');
const legs = G("fpTableLegPositions({ type: 'table', col: 10, row: 5, w: 2, h: 2 })");
check(legs.length === 4, 'a table stands on four legs');
check(legs.every((p) => p.x > 10 && p.x < 12 && p.y > 5 && p.y < 7), 'every leg stands inside the table footprint');
check(legs.every((p) => Math.min(p.x - 10, 12 - p.x) < 0.25 && Math.min(p.y - 5, 7 - p.y) < 0.25), 'the legs stand near the corners');
check(new Set(legs.map((p) => `${p.x},${p.y}`)).size === 4, 'the four legs are in four different places');
check(G('FP_SPRITE_SIZE.tableLeg.h') === G('FP_BOTTOM_FACTORS.table'), 'legs reach exactly the underside of the table top');
check(G('canvasDensityFor(2, 720)') === 2 && G('canvasDensityFor(2, 360)') === 2, 'canvas density is the display ratio at layout size or smaller');
check(Math.abs(G('canvasDensityFor(1, 1350)') - 1.875) < 1e-9, 'a 1x display showing the board at 1350 px renders it at 1.875x');
check(G('canvasDensityFor(2, 1440)') === 3, 'canvas density is capped at 3');
check(G('canvasDensityFor(undefined, undefined)') === 1, 'missing display information falls back to 1x');

section('3D scene description');
check(G('S3_THEMES.length') === G('FLOOR_SIZE'), 'one theme for each room on a floor');
check(G("s3Facing({ col: 5, row: 2, w: 3, h: 1 })") === 'north', 'a couch near the top wall puts its back to the north');
check(G("s3Facing({ col: 12, row: 5, w: 2, h: 2 })") === 'east', 'furniture near the right wall faces west');
let fitAll = true, floorAll = true, headroomAll = true, legsAll = true;
for (let lv = 0; lv < G('LEVELS.length'); lv++) {
    const items = G(`s3Furniture(${lv})`);
    for (const item of items) {
        const obs = item.footprint;
        const swap = Math.abs(Math.abs(item.yaw) - Math.PI / 2) < 1e-6;
        const lw = swap ? obs.h : obs.w, ld = swap ? obs.w : obs.h;
        for (const p of item.parts) {
            const pts = p.shape === 'rod' ? [p.from, p.to] : [p.pos];
            for (const [x, y, z] of pts) {
                if (Math.abs(x) > lw / 2 + 0.3 || Math.abs(z) > ld / 2 + 0.3) fitAll = false;
                if (y < -0.001) floorAll = false;
                const half = p.size ? p.size[1] / 2 : p.h ? p.h / 2 : p.r || 0;
                if (y + half > G('S3_WALL_H') + 0.001) headroomAll = false;
            }
        }
        if ((obs.type === 'table' || obs.type === 'couch') && !item.parts.some((p) => p.shape === 'cyl' && p.pos[1] < 0.5)) legsAll = false;
    }
}
check(fitAll, 'every part of every piece of furniture stays over its footprint');
check(floorAll, 'nothing sits below the floor');
check(headroomAll, 'nothing pokes through the ceiling');
check(legsAll, 'tables and couches stand on legs');
const arch = G('s3Architecture(0)');
const glass = arch.find((p) => p.tag === 'glass');
check(glass && Math.abs(glass.size[0] - (G('S3_WINDOW.x1') - G('S3_WINDOW.x0'))) < 1e-9, 'the window glass spans the window opening');
check(arch.filter((p) => p.tag === 'slat').length > 5, 'the window has blinds');
check(arch.some((p) => p.tag === 'door') && arch.filter((p) => p.tag === 'bulb').length >= 10, 'there is a door and a chandelier with many bulbs');
const dock0 = G('s3Dock(0)');
check(dock0.pos[0] === G('LEVELS[0].charger.col') + 0.5 && dock0.pos[2] === G('LEVELS[0].charger.row') + 0.5, 'the dock sits on the charger tile');
check(dock0.parts.every((p) => p.pos[1] < 0.1 || Math.abs(p.pos[2]) > 0.3), 'nothing tall stands where the vacuum parks on the dock');
let sunOk = true;
for (let lv = 0; lv < G('LEVELS.length'); lv++) {
    const d = G(`s3SunDirection(s3Theme(${lv}))`);
    if (!(d[1] > 0 && d[2] < 0)) sunOk = false;
}
check(sunOk, 'in every room the sun is up and comes in through the north window');
const top = G('s3TopDownCamera(56, 720 / 576)');
check(top.x === G('COLS / 2') && top.z === G('ROWS / 2') && top.y * Math.tan((56 * Math.PI) / 360) >= G('ROWS / 2'), 'the overhead camera frames the whole board');

section('2D room theming');
let patchOk = true, shadowsOk = true, contrastOk = true, reachesAny = false;
for (let lv = 0; lv < G('LEVELS.length'); lv++) {
    const sun = G(`s2Sun(s3Theme(${lv}))`);
    if (!(sun.dir[1] > 0)) patchOk = false;
    for (const q of [sun.lit, ...sun.bands]) for (const [x, y] of q) if (!Number.isFinite(x) || !Number.isFinite(y)) patchOk = false;
    if (sun.bands.length < 5) patchOk = false;
    if (sun.reaches) reachesAny = true;
    for (const [cx, cy, h] of [[1, 1, 1], [7, 5.5, 0.95], [14, 11, 4.8], [3, 9, 1.9]]) {
        const s = G(`s2Shadow(s2Sun(s3Theme(${lv})), s3Theme(${lv}).lamp, ${cx}, ${cy}, ${h})`);
        const len = Math.hypot(s.dx, s.dy);
        if (!(len > 0 && len <= 0.56 && s.alpha >= 0.1 && s.alpha <= 0.5 && Number.isFinite(s.blur))) shadowsOk = false;
    }
    if (!(G(`s2CleanContrast(s3Theme(${lv}))`) >= 0.18)) contrastOk = false;
}
check(patchOk, 'in every room the sun comes through the north window in finite, striped bands');
check(reachesAny, 'in some rooms the window light lands inside the room');
check(G('s2Sun(s3Theme(0)).reaches') && G('s2Sun(s3Theme(0)).lit.every(([x, y]) => y > 0 && y < ROWS)'), 'the morning sun of the Atomic Lounge lands on the floor');
check(shadowsOk, 'every shadow falls a short, finite way with a readable alpha');
check(contrastOk, 'clean and dirty tiles stay apart in colour in every room');
const shadow0 = G('s2Shadow(s2Sun(s3Theme(0)), s3Theme(0).lamp, 5, 5, 1)');
const dir0 = G('s2Sun(s3Theme(0)).dir');
check(Math.abs(shadow0.dx * dir0[1] - shadow0.dy * dir0[0]) < 1e-9 && shadow0.dx * dir0[0] + shadow0.dy * dir0[1] > 0, 'sunlit shadows fall away from the sun');
const lampShadow = G('s2Shadow(s2Sun(s3Theme(1)), s3Theme(1).lamp, 12, 10, 1)');
check(lampShadow.dx > 0 && lampShadow.dy > 0, 'under a weak sun a lit lamp casts the shadows, away from itself');
check(G('s2LampArms().length') === 14, 'the Sputnik has fourteen arms from above too');
check(G('typeof paintGlaze') === 'function' && G('typeof paintDust') === 'function' && G('typeof paintWoodFloor') === 'function' && G('typeof castShadow') === 'function', 'the painters the 3D renderers share are still there');
check(['drawScene', 'drawLighting', 'drawRoomba', 'drawNpcTrail', 'drawNpcVacuum', 'drawNpcOverlay', 'drawOverlay', 'drawBanner', 'drawHelp', 'drawCleanAnimations', 'drawDustMotes', 'drawBokeh', 'drawFlashlight2D', 'drawDustPuffs', 'createFloorPatterns'].every((f) => G(`typeof ${f}`) === 'function'), 'every routine the game loop calls is defined');

section('Extra rooms: codes and validation');
check(G('HOUSE_LEVELS') === 30 && G('SPECIAL_LEVEL') === 30 && G('LEVELS.length') === 30, 'the house has thirty rooms and one more slot after them');
let houseRoomsOk = true, roundTripOk = true;
for (let i = 0; i < 6; i++) {
    const v = G(`validateRoom(Object.assign({ theme: ${i} }, LEVELS[${i}]))`);
    if (!v.ok || v.tiles !== G(`(() => { const g = buildLevelGrid(${i}); let n = 0; for (const row of g) for (const c of row) if (c === DIRTY) n++; return n; })()`)) houseRoomsOk = false;
    const code = G(`encodeRoom(Object.assign({ theme: ${i} }, LEVELS[${i}]))`);
    if (G(`encodeRoom(decodeRoom(${JSON.stringify(code)}, 'x'))`) !== code || !/^[0-9a-z._]+$/.test(code)) roundTripOk = false;
}
check(houseRoomsOk, 'every house room passes the same validation as a built room');
check(roundTripOk, 'every house room survives a trip through its URL-safe room code');
const badCodes = ['', 'x', '2.0.1.00.', '1.9.1.00.', '1.0.4.00.', '1.0.1.00.t11_c22', '1.0.1.00.sd0', '1.0.1.11.t11', '1.0.1.00.t11v', '1.0.1.00.q11', '1.0.1.zz.'];
check(badCodes.every((c) => G(`decodeRoom(${JSON.stringify(c)}, 'x')`) === null), 'codes that are malformed, overlapping, out of bounds or sitting on the dock are refused');
check(G("decodeRoom(null, 'x')") === null && G("decodeRoom('1.0.1.00.' + 'w00_'.repeat(400), 'x')") === null, 'codes that are not strings or are far too long are refused');
const sealed = G("validateRoom(decodeRoom('1.0.1.00.wd0_we1', 'x'))");
check(sealed.sound && !sealed.ok && sealed.unreachable.length === 1 && sealed.unreachable[0].col === 14 && sealed.unreachable[0].row === 0, 'a walled-off tile is found and named, and the room still decodes for editing');
const farRoom = G("(() => { const r = blankRoom('a', 0); r.batteryCost = 3; const v = validateRoom(r); r.charger = { col: 7, row: 6 }; return [v.ok, v.tooFar.length, validateRoom(r).ok]; })()");
check(farRoom[0] === false && farRoom[1] === 45 && farRoom[2] === true, 'tiles beyond a round trip on one charge fail the room, and moving the dock to the middle fixes it');
check(G('roomReach(1)') === 50 && G('roomReach(2)') === 25 && G('roomReach(3)') === 16, 'reach is half a charge in moves');
check(G("validateRoom({ charger: { col: 0, row: 0 }, batteryCost: 1, obstacles: [], theme: 0 }).tiles") === 179 && G("validateRoom(null).reason") !== '', 'an empty room has 179 tiles to clean; nothing at all is not a room');
check(G("cleanRoomName('  <b>Hi</b>\\n there  ')") === 'bHi/b there' && G("cleanRoomName('')") === 'My Room' && G("cleanRoomName('x'.repeat(99)).length") === 28, 'room names lose markup and control characters, are capped, and never end up empty');
const stuck = G("computeParRoute(decodeRoom('1.0.1.00.wd0_we1', 'x'))");
check(Number.isFinite(stuck.totalMoves) && stuck.totalMoves > 150, 'the par solver stops instead of looping on a room it cannot finish');

section('Extra rooms: building');
const built = G(`(() => {
    const r = blankRoom('Test', 2);
    const out = {};
    out.sofa = roomPlace(r, 'couch', 14, 0, false);
    out.overlap = roomPlace(r, 'table', 12, 0, false);
    out.onDock = roomPlace(r, 'chair', 0, 11, false);
    out.upright = roomPlace(r, 'couch', 0, 0, true);
    out.table = roomPlace(r, 'table', 5, 5, false);
    out.dockUnderTable = roomMoveDock(r, 6, 6);
    out.dockMoved = roomMoveDock(r, 7, 11);
    out.count = r.obstacles.length;
    out.eraseCorner = roomErase(r, 6, 6);
    out.eraseNothing = roomErase(r, 9, 9);
    out.after = r.obstacles.length;
    out.turnTable = roomPieceSize('table', true);
    out.code = encodeRoom(r);
    return out;
})()`);
check(built.sofa && built.sofa.col === 12 && built.sofa.w === 3 && built.sofa.h === 1, 'a piece put down at the edge is nudged back inside the room');
check(built.overlap === null && built.onDock === null, 'a piece cannot go on top of another piece or on the dock');
check(built.upright && built.upright.w === 1 && built.upright.h === 3 && built.turnTable.w === 2 && built.turnTable.h === 2, 'sofas stand upright when turned; tables do not turn');
check(built.dockUnderTable === false && built.dockMoved === true, 'the dock moves to a free tile and never under furniture');
check(built.count === 3 && built.eraseCorner === true && built.eraseNothing === false && built.after === 2, 'erasing any tile of a piece removes the whole piece');
check(built.code === '1.2.1.7b.sc0_s00v', 'a built room has the code its pieces spell out');
check(G("s3Facing({ col: 0, row: 5, w: 3, h: 1 })") === 'north' && G("s3Facing({ col: 0, row: 8, w: 3, h: 1 })") === 'south', 'a sofa lying across the room backs onto the top or bottom wall, never a side wall');
check(G("s3Facing({ col: 2, row: 0, w: 1, h: 3 })") === 'west' && G("s3Facing({ col: 12, row: 0, w: 1, h: 3 })") === 'east', 'an upright sofa backs onto a side wall');

section('Room of the day');
check(G("dateKeyOf(new Date(2026, 10, 9))") === '2026-11-09' && G("formatDateKey('2026-11-09')") === 'Mon 9 Nov 2026', 'dates are keyed by the calendar day and read plainly');
check(G("shiftDateKey('2026-12-31', 1)") === '2027-01-01' && G("shiftDateKey('2028-02-28', 1)") === '2028-02-29' && G("shiftDateKey('2026-03-01', -1)") === '2026-02-28', 'the day after and before cross months, years and leap days');
check(G("dayNumber('2026-11-10') - dayNumber('2026-11-09')") === 1 && G("parseDateKey('2026-02-30')") === null && G("parseDateKey('nonsense')") === null, 'consecutive days are one apart and impossible dates are refused');
check(G("encodeRoom(generateDailyRoom('2026-11-09'))") === '1.0.1.0b.w63_w73_w83_w93_sa2_s60_t46_c96_c4a_c37_cc5_p20_p02_pea' && G("generateDailyRoom('2026-11-09').name") === 'Galaxy Hideout',
    'the room for 9 November 2026 is the same room it has always been (changing the generator changes every day for everyone)');
check(G("encodeRoom(generateDailyRoom('2027-03-01'))") === G("encodeRoom(generateDailyRoom('2027-03-01'))"), 'the same day always gives the same room');
let dailyOk = true;
const dailyCodes = new Set();
for (let d = 0; d < 90; d++) {
    const key = G(`shiftDateKey('2026-11-01', ${d})`);
    const info = G(`(() => { const r = generateDailyRoom('${key}'); const v = validateRoom(r); return { ok: v.ok, tiles: v.tiles, par: computeParRoute(r).totalMoves, theme: r.theme, want: ((dayNumber('${key}') % 6) + 6) % 6, name: r.name, daily: r.daily, code: encodeRoom(r), back: !!decodeRoom(encodeRoom(r), r.name) }; })()`);
    dailyCodes.add(info.code);
    if (!info.ok || info.tiles < 96 || info.par < info.tiles || info.par > info.tiles * 2.7 || info.theme !== info.want || !info.name || info.daily !== key || !info.back) dailyOk = false;
}
check(dailyOk, 'ninety days in a row give rooms that can be finished, are not cramped, are not mostly commuting, and rotate through the six themes');
check(dailyCodes.size === 90, 'ninety days give ninety different rooms');

section('Racing your best run');
const drivePar = `(() => { const path = parPath.slice(parApproachLen); let prev = { col: roomba.col, row: roomba.row }; for (const s of path) { tryMove(s.col - prev.col, s.row - prev.row); prev = s; if (gameState !== 'PLAYING') break; } return gameState; })()`;
const replay = G("replayRun(LEVELS[0], 'UUR')");
check(replay.length === 3 && replay[2].col === 14 && replay[2].row === 9 && replay[1].cleaned === 1 && replay[2].cleaned === 2 && replay[2].dir === 'up', 'a recorded run replays move by move and stops at a move the room does not allow');
G("progress.runs = {}; progress.rooms = []; progress.raceBest = true; roomMode = 'house'; specialKey = ''; currentLevel = 0; houseLevel = 0; levelStartScore = 0; initLevel(0)");
check(G('bestGhost') === null && G('runPath') === '', 'a room with no finished run has no ghost');
check(G(drivePar) === 'LEVEL_COMPLETE' && G('levelResult.newBest') === true && G('progress.runs.h0.path.length') === G('moves') && G('progress.runs.h0.moves') === G('parMoves'), 'finishing a room saves the run, move for move');
G('restartLevel()');
check(G('bestGhost.steps.length') === G('progress.runs.h0.moves') + 1 && G('bestGhostShown()') === true && G('bestGhostDelta()') === 0, 'on the next go the best run is lined up at the dock, level with the player');
G('tryMove(-1, 0); tryMove(1, 0)');
check(G('bestGhostDelta()') < 0 && G('bestGhostStep().cleaned') === 2, 'wasting moves puts the player behind the ghost');
check(G(drivePar) === 'LEVEL_COMPLETE' && G('levelResult.newBest') === false && G('progress.runs.h0.moves') === G('parMoves') && G('moves') === G('parMoves') + 2, 'a slower run does not replace the best one');
G('restartLevel(); toggleRaceBest(false)');
check(G('bestGhostShown()') === false && G('bestGhostPose()') === null, 'the ghost can be switched off');
G('toggleRaceBest(true)');
check(G("JSON.stringify(sanitizeRuns({ a: { path: 'XYZ' }, b: { path: 'UDLR', stars: 9, moves: 99 }, c: null }))") === '{"b":{"moves":4,"stars":3,"path":"UDLR"}}', 'saved runs that are not runs are dropped on load, and the move count comes from the moves');
check(G("saveRun('', { moves: 1, stars: 1 }, 'U')") === false && G("saveRun('zz', { moves: 3, stars: 1 }, 'U')") === false, 'a run with no room to file it under, or the wrong length, is not saved');

section('Room modes');
const before = G('JSON.stringify({ points: progress.points, best: progress.best, unlocked: progress.unlocked })');
G("openDaily('2026-11-09')");
const dayRoom = G("validateRoom(LEVELS[SPECIAL_LEVEL])");
check(G('roomMode') === 'daily' && G('currentLevel') === G('SPECIAL_LEVEL') && G('LEVELS.length') === G('HOUSE_LEVELS') + 1 && G('totalDirty') === dayRoom.tiles && G('roomKey()') === 'd2026-11-09' && G('gameState') === 'PLAYING', 'the room of the day loads into the extra slot and starts');
check(G('s3Theme(currentLevel) === S3_THEMES[LEVELS[SPECIAL_LEVEL].theme]') && G('scene.level') === -1, 'it wears its own theme, and what was cached for the slot is thrown away');
const was = JSON.parse(before);
check(G(drivePar) === 'LEVEL_COMPLETE' && G('levelResult.stars') === 3 && G('levelResult.points') === 3 && G('progress.points') === was.points + 3 && G("progress.dailyStars['2026-11-09']") === 3, 'finishing it at par pays three upgrade points, one for each star');
check(G('JSON.stringify({ best: progress.best, unlocked: progress.unlocked })') === JSON.stringify({ best: was.best, unlocked: was.unlocked }), 'and leaves the house progress alone');
check(G("progress.runs['d2026-11-09'].moves") === G('moves'), 'it does keep a best run of its own');
G('nextLevel()');
check(G('currentLevel') === G('SPECIAL_LEVEL') && G('gameState') === 'LEVEL_COMPLETE', 'there is no next room after the room of the day');
G("openDaily('2999-01-01')");
check(G('dailyKey') === G('todayKey()'), 'a day that has not happened yet opens today instead');
G('showHouse()');
check(G('roomMode') === 'house' && G('currentLevel') === 0 && G('roomKey()') === 'h0' && G('gameState') === 'PLAYING', 'going back to the house returns to the room you left');
G("openDaily('2026-11-08'); selectLevel(0)");
check(G('roomMode') === 'house' && G('currentLevel') === 0, 'picking a house room leaves the room of the day');

G('openBuild()');
const roomId = G('build.id');
check(G('roomMode') === 'custom' && G('gameState') === 'EDITING' && G('progress.rooms.length') === 1 && roomId.length > 0 && G('build.check.ok') === true, 'Build a Room starts a blank room of your own in the editor');
G('restartLevel(); handleDirection("up")');
check(G('gameState') === 'EDITING' && G('moves') === 0, 'the vacuum does not drive and the room does not restart while it is being built');
G("progress.runs['c' + build.id] = { moves: 1, stars: 1, path: 'U' }; build.tool = 'couch'; editorApply({ col: 5, row: 2 }, false)");
check(G('build.room.obstacles.length') === 1 && G('progress.rooms[0].code') === G('encodeRoom(build.room)') && G("progress.runs['c' + build.id]") === undefined, 'placing a piece saves the room and retires the best run of the old layout');
G("build.tool = 'wall'; editorApply({ col: 1, row: 11 }, false); editorApply({ col: 0, row: 10 }, false)");
check(G('build.check.ok') === false && G('build.check.unreachable.length') > 100 && G('playBuiltRoom()') === false && G('gameState') === 'EDITING', 'a room that walls the dock in cannot be played until it is fixed');
G("build.tool = 'erase'; editorApply({ col: 1, row: 11 }, false)");
check(G('build.check.ok') === true && G('playBuiltRoom()') === true && G('gameState') === 'PLAYING' && G('roomKey()') === 'c' + roomId && G('totalDirty') === G('build.check.tiles'), 'once every tile can be reached it plays, with a best run filed under the room');
check(G(drivePar) === 'LEVEL_COMPLETE' && G('levelResult.points') === 0 && G("!!progress.runs['c' + build.id]"), 'a built room keeps a best run and pays no points');

const giftCode = G('encodeRoom(build.room)');
G('showHouse()');
check(G(`openSharedRoom(${JSON.stringify(giftCode)}, 'Gift')`) === true && G('roomMode') === 'custom' && G('gameState') === 'PLAYING' && G('build.id') === '' && G('roomKey()')[0] === 's' && G('progress.rooms.length') === 1, 'a room that arrives as a link opens ready to play and is not saved until you keep it');
check(G('keepSharedRoom()') === true && G('progress.rooms.length') === 2 && G('roomKey()')[0] === 'c' && G('progress.rooms[1].name') === 'Gift', 'keeping it puts it among your rooms');
check(G("openSharedRoom('not a room', 'x')") === false, 'a link that is not a room opens nothing');
check(G("openSharedRoom('1.0.1.00.wd0_we1', 'Half built')") === true && G('gameState') === 'EDITING' && G('progress.rooms.length') === 3, 'a shared room that cannot be finished yet opens in the editor as a room of your own');
G('build.deleteArmedUntil = performance.now() + 5000; deleteBuiltRoom()');
check(G('progress.rooms.length') === 2 && G('gameState') === 'EDITING' && G('build.id') === G('progress.rooms[1].id'), 'deleting a room opens the next one you have');
check(G("JSON.stringify(sanitizeRooms([{ id: 'a1', name: 'Ok', code: '1.0.1.00.' }, { id: 'a1', name: 'Twin', code: '1.0.1.00.' }, { id: 'BAD ID', name: 'x', code: '1.0.1.00.' }, { id: 'b2', name: 'x', code: 'junk' }]))") === '[{"id":"a1","name":"Ok","code":"1.0.1.00."}]', 'saved rooms with a bad id, a twin id or a code that no longer decodes are dropped on load');
G('showHouse()');
check(G('roomMode') === 'house' && G('gameState') === 'PLAYING' && G('HOUSE_LEVELS') === 30, 'and the house is still there afterwards');

// --- Upgrade points from rooms of the day ------------------------------------------

section('Upgrade points from rooms of the day');
{
    // two wasted moves: one tile out from the dock and straight back
    const wiggle = `(() => { for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (tryMove(dc, dr)) { tryMove(-dc, -dr); return true; } } return false; })()`;
    const pts = G('progress.points');
    G("openDaily('2026-11-09')");
    check(G(drivePar) === 'LEVEL_COMPLETE' && G('levelResult.points') === 0 && G('progress.points') === pts, 'playing the same day again for the same stars pays nothing more');
    G("delete progress.runs['d2026-11-09']; restartLevel()");
    check(G(drivePar) === 'LEVEL_COMPLETE' && G('levelResult.points') === 0 && G('progress.points') === pts && G("progress.dailyStars['2026-11-09']") === 3, 'a day never pays for the same star twice, even after its saved run has been dropped');
    G("openDaily('2026-11-07')");
    check(G(wiggle) === true && G(drivePar) === 'LEVEL_COMPLETE' && G('levelResult.stars') === 2 && G('levelResult.points') === 2 && G('progress.points') === pts + 2, 'an earlier day pays too: two stars, two points');
    G('restartLevel()');
    check(G(drivePar) === 'LEVEL_COMPLETE' && G('levelResult.stars') === 3 && G('levelResult.points') === 1 && G('progress.points') === pts + 3 && G("progress.dailyStars['2026-11-07']") === 3, 'and a better run on it pays only for the star that is new');

    G(`localStorage.setItem(SAVE_KEY, JSON.stringify({ unlocked: 0, points: 5, runs: { 'd2026-11-01': { stars: 2, path: 'UDL' }, 'd2026-11-02': { stars: 3, path: 'UD' }, h0: { stars: 3, path: 'UDL' }, cabc: { stars: 3, path: 'UD' } } })); loadProgress()`);
    check(G('progress.points') === 10 && G('JSON.stringify(progress.dailyStars)') === '{"2026-11-01":2,"2026-11-02":3}', 'a save from before this rule is paid once for the stars its saved days had already earned');
    G('saveProgress(); loadProgress()');
    check(G('progress.points') === 10, 'and is not paid again the next time it loads');
    check(G("JSON.stringify(sanitizeDailyStars({ '2026-11-01': 9, nonsense: 3, '2026-11-02': 0, '2026-11-03': 2 }))") === '{"2026-11-01":3,"2026-11-03":2}', 'saved daily stars with a bad date or count are tidied on load');
    G('localStorage.removeItem(SAVE_KEY); progress.unlocked = 0; progress.best = {}; progress.points = 0; progress.runs = {}; progress.dailyStars = {}; showHouse()');
}

// --- Taps and held moves ----------------------------------------------------------

section('Taps and held moves');
{
    // A clock the test can wind forward, in place of the real timers
    const clock = { now: 0, list: [], id: 0 };
    const real = { st: sandbox.setTimeout, ct: sandbox.clearTimeout, si: sandbox.setInterval, ci: sandbox.clearInterval };
    sandbox.setTimeout = (fn, ms) => { clock.list.push({ id: ++clock.id, at: clock.now + ms, fn, every: 0 }); return clock.id; };
    sandbox.setInterval = (fn, ms) => { clock.list.push({ id: ++clock.id, at: clock.now + ms, fn, every: ms }); return clock.id; };
    sandbox.clearTimeout = sandbox.clearInterval = (id) => { clock.list = clock.list.filter((t) => t.id !== id); };
    const wait = (ms) => {
        const end = clock.now + ms;
        for (;;) {
            const due = clock.list.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
            if (!due) break;
            clock.now = due.at;
            if (due.every) due.at += due.every; else clock.list = clock.list.filter((t) => t !== due);
            due.fn();
        }
        clock.now = end;
    };
    const fresh = () => { G('stopHold(); showHouse(); progress.unlocked = 0; selectLevel(0); viewMode = "TD"'); clock.list = []; };

    // The living room's dock is bottom right with open floor above it
    fresh();
    G('startHold("up")');
    wait(160);
    G('stopHold()');
    wait(1000);
    check(G('moves') === 1, `a press of 160 ms is one move, not two (it made ${G('moves')})`);

    // The on-screen d-pad: a finger stays down longer than a key
    const KEYS = G('HOLD_DELAY_KEYS'), TOUCH = G('HOLD_DELAY_TOUCH'), STEP = G('MOVE_INTERVAL'), FPSTEP = G('FP_MOVE_INTERVAL');
    check(TOUCH >= 250 && KEYS >= 180 && TOUCH >= KEYS && KEYS > STEP, 'the pause before repeating is longer than a tap, and longer for fingers than for keys');
    fresh();
    G('dpadPress("up", true, 1000)');
    check(G('moves') === 1, 'a touch on the d-pad moves at once');
    wait(TOUCH - 1);
    G('stopHold()');
    wait(2000);
    check(G('moves') === 1, 'a tap as long as a quarter of a second is still one move');

    fresh();
    G('dpadPress("up", true, 5000)');
    wait(TOUCH);
    check(G('moves') === 2, 'held past the pause, it starts to repeat');
    wait(STEP * 3);
    check(G('moves') === 5, 'and then repeats at the usual pace');
    G('stopHold()');
    wait(2000);
    check(G('moves') === 5, 'letting go stops it at once');

    fresh();
    G('startHold("up")');
    wait(KEYS - 1);
    const beforeRepeat = G('moves');
    wait(1 + STEP);
    check(beforeRepeat === 1 && G('moves') === 3, 'a held key pauses, then repeats the same way');
    G('stopHold()');

    // Made-up mouse events after a touch must not press the button a second time
    fresh();
    G('dpadPress("up", true, 10000); stopHold()');
    check(G('dpadPress("up", false, 10300)') === false && G('moves') === 1, 'a mouse press that trails a touch by a moment is ignored');
    G('stopHold()');
    check(G('dpadPress("up", false, 10000 + GHOST_MOUSE_MS)') === true && G('moves') === 2, 'a real mouse press later on still works');
    G('stopHold()');

    // Quick taps in a row are one move each
    fresh();
    for (let i = 0; i < 4; i++) { G(`dpadPress("up", true, ${20000 + i * 400})`); wait(140); G('stopHold()'); wait(120); }
    check(G('moves') === 4, 'four quick taps are four moves');

    // First person: forward repeats after the same pause, a turn never repeats
    fresh();
    G('viewMode = "FP"; roomba.dir = "up"; dpadPress("up", true, 30000)');
    wait(TOUCH - 1);
    const fpTap = G('moves');
    wait(1 + FPSTEP);
    check(fpTap === 1 && G('moves') === 3, 'in first person a tap forward is one tile, and a hold drives on');
    G('stopHold(); dpadPress("left", true, 40000)');
    wait(3000);
    check(G('holdTimer') === null && G('roomba.dir') === 'left', 'a turn in first person is one quarter turn however long it is held');
    G('stopHold(); viewMode = "TD"');

    Object.assign(sandbox, { setTimeout: real.st, clearTimeout: real.ct, setInterval: real.si, clearInterval: real.ci });
    G('stopHold(); showHouse()');
}

// --- More upgrades, and the reserve cell ---------------------------------------------

section('More upgrades, and the reserve cell');
{
    const fit = (levels) => G(`progress.upgrades = sanitizeUpgrades(${JSON.stringify(levels)}); applyUpgrades()`);
    const fresh = (lv) => G(`stopHold(); showHouse(); progress.unlocked = HOUSE_LEVELS - 1; selectLevel(${lv}); viewMode = "TD"`);
    const up = (n) => { for (let i = 0; i < n; i++) G('tryMove(0, -1)'); };
    const down = (n) => { for (let i = 0; i < n; i++) G('tryMove(0, 1)'); };
    G('progress.reserve = false; progress.padRest = 0');

    const defs = G('UPGRADES');
    check(defs.length === 10 && new Set(defs.map((u) => u.key)).size === 10 && defs.every((u) => G('UPGRADE_GROUPS').includes(u.group)), 'ten upgrades, each with its own key, each in a group the panel shows');
    check(defs.reduce((n, u) => n + u.levels.reduce((m, l) => m + l.cost, 0), 0) === 53, 'everything together costs 53 points');

    // Coasting: clean floor costs less to cross (the living room drains one a move)
    const coastAfter = (level) => { fit({ coast: level }); fresh(0); up(2); down(1); return G('roomba.battery'); };
    check(coastAfter(0) === 97 && coastAfter(1) === 97.25 && coastAfter(2) === 97.5, 'coasting takes a quarter, then a half, off a move over clean floor');
    fit({ coast: 2 }); fresh(0); up(3);
    check(G('roomba.battery') === 97, 'and nothing off a move that cleans a tile');

    // Trip computer
    fit({}); fresh(0);
    check(G('hasTripComputer()') === false && G('chargeMoves()') === 100, 'a full charge in the living room pays for a hundred moves');
    fresh(29);
    const full30 = G('chargeMoves()');
    up(1);
    check(full30 === 25 && G('chargeMoves()') === 24, 'in room 30 a full charge pays for 25 moves, and one move leaves 24');
    fit({ trip: 1, motor: 3, solar: 2 }); fresh(29);
    check(G('hasTripComputer()') === true && G('chargeMoves()') === Math.floor(100 / (4 * 0.55 - 0.34) + 1e-9), 'the count allows for the motor and the solar cells');

    // Corner brush
    G(`__nook = buildLevelGrid({ charger: { col: 0, row: 5 }, obstacles: [{ type: 'wall', col: 2, row: 0, w: 1, h: 1 }, { type: 'wall', col: 4, row: 0, w: 1, h: 1 }] })`);
    check(G('JSON.stringify(cornerBrushTargets(__nook, 3, 1))') === '[{"col":3,"row":0}]', 'a dirty tile with no way in but this one is a dead end the brush reaches');
    check(G('cornerBrushTargets(__nook, 3, 2).length') === 0 && G('cornerBrushTargets(__nook, 1, 1).length') === 0, 'ordinary neighbours and tiles two away are left alone');
    G('__nook[0][3] = CLEAN');
    check(G('cornerBrushTargets(__nook, 3, 1).length') === 0, 'a dead end that is already clean is not swept again');
    // The banquet hall is full of dead ends between its chairs; its dock is at 4,5 and the tile
    // at 2,4 can only be entered from 2,5
    fit({}); fresh(26);
    G('tryMove(-1, 0); tryMove(-1, 0)');
    check(G('cleaned') === 2 && G('brushSweeps.length') === 0 && G('grid[4][2]') === DIRTY, 'without the brush, driving past a dead end leaves it dirty');
    fit({ brush: 1 }); fresh(26);
    G('tryMove(-1, 0); tryMove(-1, 0)');
    check(G('cleaned') === 3 && G('brushSweeps.length') === 1 && G('grid[4][2]') === CLEAN && G('score') === 30 && G('moves') === 2, 'with it, the dead end beside the vacuum is swept: it counts and scores like any other tile, and leaves a stroke to draw');
    check(G('JSON.stringify(brushSweeps[0])') === '{"fromCol":2,"fromRow":5,"col":2,"row":4,"t":0}', 'the stroke runs from the vacuum\'s tile into the dead end');
    fresh(26);
    check(G(drivePar) === 'LEVEL_COMPLETE' && G('cleaned') === G('totalDirty') && G('moves') <= G('parMoves'), 'the room still finishes cleanly with the brush fitted');
    const path26 = G('runPath');
    const without = G(`replayRun(LEVELS[26], ${JSON.stringify(path26)})`), withBrush = G(`replayRun(LEVELS[26], ${JSON.stringify(path26)}, true)`);
    check(without.length === withBrush.length && withBrush.every((st, i) => st.cleaned >= without[i].cleaned) && withBrush.some((st, i) => st.cleaned > without[i].cleaned) && withBrush[withBrush.length - 1].cleaned === G('totalDirty'), 'a saved run replayed with the brush fitted sweeps the dead ends too, so the ghost compares like with like');

    // Glide: only the pace of a held direction changes, and only over clean floor
    {
        const clock = { now: 0, list: [], id: 0 };
        const real = { st: sandbox.setTimeout, ct: sandbox.clearTimeout };
        sandbox.setTimeout = (fn, ms) => { clock.list.push({ id: ++clock.id, at: clock.now + ms, fn }); return clock.id; };
        sandbox.clearTimeout = (id) => { clock.list = clock.list.filter((t) => t.id !== id); };
        const wait = (ms) => {
            const end = clock.now + ms;
            for (;;) {
                const due = clock.list.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
                if (!due) break;
                clock.now = due.at;
                clock.list = clock.list.filter((t) => t !== due);
                due.fn();
            }
            clock.now = end;
        };
        const TOUCH = G('HOLD_DELAY_TOUCH'), STEP = G('MOVE_INTERVAL');
        const heldOverClean = (level) => {
            fit({ glide: level }); fresh(0); clock.list = [];
            up(6); down(6);                       // six clean tiles above the dock, vacuum back home
            const m0 = G('moves'), b0 = G('roomba.battery');
            G('startHold("up", HOLD_DELAY_TOUCH)');
            wait(TOUCH + STEP * 2);
            G('stopHold()');
            return { moves: G('moves') - m0, drained: b0 - G('roomba.battery') };
        };
        const g0 = heldOverClean(0), g1 = heldOverClean(1), g2 = heldOverClean(2);
        check(g0.moves === 4 && g1.moves === 5 && g2.moves === 6, `held over clean floor for the same time, glide covers more tiles (${g0.moves}, ${g1.moves}, ${g2.moves})`);
        check(g2.drained === g2.moves, 'and every one of those moves still costs what a move costs');
        fit({ glide: 2 }); fresh(0); clock.list = [];
        const d0 = G('moves');
        G('startHold("up", HOLD_DELAY_TOUCH)');
        wait(TOUCH + STEP * 2);
        G('stopHold()');
        check(G('moves') - d0 === 4, 'over dirty floor glide changes nothing');
        Object.assign(sandbox, { setTimeout: real.st, clearTimeout: real.ct });
    }

    // The reserve cell: an option, not an upgrade
    fit({}); fresh(0);
    G('progress.reserve = false; roomba.battery = 1; tryMove(0, -1)');
    check(G('gameState') === 'GAME_OVER', 'with the reserve cell off, an empty battery ends the run');
    fresh(0);
    G('setReserveCell(true); roomba.battery = 1; tryMove(0, -1)');
    check(G('gameState') === 'PLAYING' && G('roomba.battery') === G('RESERVE_MOVES') && G('reserveUsed') === true && /Reserve cell/.test(G('gameNotice.text')), 'switched on, it gives six more moves and says so');
    G('roomba.battery = 1; tryMove(0, -1)');
    check(G('gameState') === 'GAME_OVER', 'but only once in a room');
    G('restartLevel()');
    check(G('reserveUsed') === false && G('progress.reserve') === true, 'the next try at the room has its reserve back');
    fresh(29);
    G('roomba.battery = 4; tryMove(0, -1)');
    check(G('roomba.battery') === 24, 'in room 30 the reserve is still six moves, at four a move');
    G('setReserveCell(false)');

    // The travel pad: one room in every ten
    fit({}); fresh(0);
    check(G('travelPadState()') === 'none' && G('dropTravelPad()') === false, 'no pad until the upgrade is bought');
    fit({ travel: 1 }); fresh(0);
    check(G('travelPadState()') === 'here' && G('dropTravelPad()') === false, 'it cannot be dropped on a tile that already charges');
    up(3);
    check(G('travelPadState()') === 'ready' && G('roomba.battery') === 97, 'away from the dock it is ready');
    check(G('dropTravelPad()') === true && G('JSON.stringify(travelPad)') === '{"col":14,"row":8}' && G('roomba.battery') === 100 && G('isChargingTile(14, 8)') && G('chargerDistGrid[8][14]') === 0, 'dropping it charges the vacuum there and makes that tile a place to charge');
    check(G('travelPadState()') === 'down' && G('dropTravelPad()') === false, 'one pad a room');
    up(3);
    const awayDist = G('chargerDistGrid[roomba.row][roomba.col]'), awayBattery = G('roomba.battery');
    down(3);
    check(awayDist === 3 && awayBattery === 97 && G('roomba.battery') === 100, 'home is now as near as the pad, and driving back onto it charges again');
    G('restartLevel()');
    check(G('travelPad') === null && G('progress.padRest') === 0 && G('travelPadState()') === 'here', 'restarting the room picks the pad back up without spending it');
    up(2); G('dropTravelPad()'); down(2);
    check(G(drivePar) === 'LEVEL_COMPLETE' && G('progress.padRest') === G('PAD_EVERY') - 1, 'finishing a room with the pad down spends it for the next nine rooms');
    fresh(1);
    up(1);
    check(G('travelPadState()') === 'resting' && G('dropTravelPad()') === false, 'while it rests it cannot be dropped');
    down(1);
    check(G(drivePar) === 'LEVEL_COMPLETE' && G('progress.padRest') === G('PAD_EVERY') - 2, 'each room finished without it brings it one room closer');
    G('progress.padRest = 1'); fresh(2);
    G(drivePar);
    fresh(3); G('tryMove(-1, 0); tryMove(0, 1)');
    check(G('progress.padRest') === 0 && G('travelPadState()') === 'ready', 'and after the ninth it is ready again');

    // Saved with the rest of the progress
    G(`localStorage.setItem(SAVE_KEY, JSON.stringify({ reserve: true, padRest: 99, upgrades: { travel: 5, glide: 2, nonsense: 3 } })); loadProgress()`);
    check(G('progress.reserve') === true && G('progress.padRest') === 9 && G('progress.upgrades.travel') === 1 && G('progress.upgrades.glide') === 2 && G('progress.upgrades.nonsense') === undefined, 'the option, the pad\'s rest and the new upgrade levels are saved and tidied on load');
    G(`localStorage.setItem(SAVE_KEY, JSON.stringify({ unlocked: 2 })); loadProgress()`);
    check(G('progress.reserve') === false && G('progress.padRest') === 0, 'a save from before them starts with the reserve off and the pad ready');
    const page2 = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    check(/id="tripStat"/.test(page2) && /id="btnPad"/.test(page2) && /id="reserveToggle"/.test(page2), 'the page has the trip readout, the Drop pad button and the reserve switch');

    G('localStorage.removeItem(SAVE_KEY); progress.unlocked = 0; progress.best = {}; progress.points = 0; progress.runs = {}; progress.dailyStars = {}; progress.reserve = false; progress.padRest = 0');
    fit({});
    G('showHouse()');
}

// --- The rest of the house -------------------------------------------------------

section('Thirty rooms on five floors');
{
    const HOUSE = G('HOUSE_LEVELS'), FLOOR = G('FLOOR_SIZE');
    check(G('FLOOR_NAMES.length') * FLOOR === HOUSE && HOUSE === 30, 'five named floors of six rooms');
    check(new Set(LEVELS.slice(0, HOUSE).map((lv) => lv.name)).size === HOUSE, 'every room has a name of its own');

    // How many times the par route has to come home, and how close the far tiles are to the limit
    const facts = LEVELS.slice(0, HOUSE).map((lv, i) => {
        const g = G(`buildLevelGrid(${i})`);
        const dist = G(`bfsFromSource(buildLevelGrid(${i}), LEVELS[${i}].charger.col, LEVELS[${i}].charger.row)`);
        const reach = G(`roomReach(${lv.batteryCost})`);
        let tiles = 0, far = 0, lost = 0;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            if (g[r][c] !== DIRTY) continue;
            tiles++;
            if (dist[r][c] < 0) lost++;
            else far = Math.max(far, dist[r][c]);
        }
        const par = G(`computeParRoute(${i})`);
        let trips = 0;
        for (let k = par.approachLength; k < par.fullPath.length; k++) {
            if (par.fullPath[k].col === lv.charger.col && par.fullPath[k].row === lv.charger.row) trips++;
        }
        const pieces = G(`validateRoom({ charger: LEVELS[${i}].charger, obstacles: LEVELS[${i}].obstacles, batteryCost: 1 })`);
        return { name: lv.name, cost: lv.batteryCost, tiles, far, lost, reach, trips, par: par.totalMoves, sound: pieces.sound };
    });
    facts.forEach((f, i) => {
        check(f.sound && f.lost === 0, `${i + 1} ${f.name}: no overlapping pieces and no tile walled off`);
        check(f.far <= f.reach, `${i + 1} ${f.name}: every tile can be reached and returned from on one charge (${f.far} of ${f.reach})`);
        check(f.tiles >= 100, `${i + 1} ${f.name}: a full-size room (${f.tiles} tiles)`);
    });

    // The real game, no upgrades: drive the par route and the room must come out clean
    G('showHouse(); progress.upgrades = sanitizeUpgrades({}); progress.unlocked = HOUSE_LEVELS - 1');
    let finished = 0;
    for (let i = 0; i < HOUSE; i++) {
        G(`selectLevel(${i})`);
        if (G('currentLevel') === i && G('roomba.battery') === 100 && G(drivePar) === 'LEVEL_COMPLETE') finished++;
        else console.error(`  room ${i + 1} did not finish on the standard battery`);
    }
    check(finished === HOUSE, `all thirty rooms can be finished with no upgrades (${finished} of ${HOUSE})`);

    const last = facts[HOUSE - 1];
    check(facts.every((f, i) => i === HOUSE - 1 || f.trips < last.trips), `room 30 needs more trips home than any other room (${last.trips})`);
    check(last.cost === 4 && facts.slice(0, HOUSE - 1).every((f) => f.cost <= 3) && last.far === last.reach, 'room 30 alone drains four per move, and its far tiles sit exactly at the limit');
    const floorTrips = [];
    for (let f = 0; f < HOUSE / FLOOR; f++) {
        const rooms = facts.slice(f * FLOOR, (f + 1) * FLOOR);
        floorTrips.push(rooms.reduce((n, r) => n + r.trips, 0));
        check(rooms.every((r) => r.trips <= rooms[FLOOR - 1].trips), `${G('FLOOR_NAMES')[f]}: the last room is the hardest on its floor`);
    }
    check(floorTrips.every((n, f) => f === 0 || n > floorTrips[f - 1]), `each floor asks more than the one below (${floorTrips.join(', ')} trips)`);

    // The map reader
    const blank = Array.from({ length: ROWS }, () => '.'.repeat(COLS));
    const withRows = (rows) => JSON.stringify({ name: 'Test', batteryCost: 1, map: blank.map((r, i) => rows[i] || r) });
    const sample = G(`levelFromMap(${withRows(['D.SSS.S.BB.B.TT', '......S....B.TT', 'c.p.#.S........'])})`);
    const has = (type, col, row, w, h) => sample.obstacles.some((o) => o.type === type && o.col === col && o.row === row && o.w === w && o.h === h);
    check(sample.charger.col === 0 && sample.charger.row === 0 && sample.obstacles.length === 8, 'a map gives a dock and one piece per shape');
    check(has('couch', 2, 0, 3, 1) && has('couch', 6, 0, 1, 3) && has('petbed', 8, 0, 2, 1) && has('petbed', 11, 0, 1, 2) && has('table', 13, 0, 2, 2), 'sofas, pet beds and tables are read whole, either way round');
    check(has('chair', 0, 2, 1, 1) && has('plant', 2, 2, 1, 1) && has('wall', 4, 2, 1, 1), 'chairs, plants and walls are one tile each');
    const refuses = (rows) => { try { G(`levelFromMap(${withRows(rows)})`); return false; } catch (e) { return true; } };
    check(refuses(['...']) && refuses(['D.T............']) && refuses(['D.SS...........']) && refuses(['D.D............']) && refuses(['...............']) && refuses(['D.x............']), 'a map that is the wrong size, has a broken piece, two docks, no dock or a stray letter is refused');

    // The picker pages by floor
    G('showHouse(); progress.unlocked = HOUSE_LEVELS - 1; selectLevel(13)');
    check(G('currentLevel') === 13 && G('levelFloor') === 2, 'the picker opens on the floor of the room being played');
    G('showLevelFloor(4)');
    check(G('levelFloor') === 4 && G('currentLevel') === 13 && G('gameState') === 'PLAYING', 'the arrows browse other floors without leaving the room');
    G('showLevelFloor(99)');
    check(G('levelFloor') === 4, 'and stop at the top floor');
    G('selectLevel(0)');
    check(G('levelFloor') === 0, 'picking a room brings the picker back to its floor');

    // A save from the six-room house
    G(`localStorage.setItem(SAVE_KEY, JSON.stringify({ unlocked: 5, points: 18, best: { 0: { moves: 200, stars: 3 }, 5: { moves: 260, stars: 3 } } })); loadProgress()`);
    check(G('progress.unlocked') === 6, 'a player who finished the old last room finds room 7 open');
    G(`localStorage.setItem(SAVE_KEY, JSON.stringify({ unlocked: 2, best: { 0: { moves: 200, stars: 3 }, 1: { moves: 190, stars: 2 } } })); loadProgress()`);
    check(G('progress.unlocked') === 2, 'and a player part way through stays where they were');
    G(`localStorage.removeItem(SAVE_KEY); progress.unlocked = 0; progress.best = {}; progress.points = 0; showHouse()`);
}

// --- Floor styles --------------------------------------------------------------

section('Floor styles');
{
    check(G('S3_FLOOR_STYLE.length') === G('FLOOR_NAMES.length') && G('S3_FLOOR_STYLE[0]') === 'atomic', 'every floor names a style, and the ground floor keeps the atomic one');
    let same = true;
    for (let i = 0; i < 6; i++) if (G(`s3Theme(${i}) !== S3_THEMES[${i}] || s3Theme(${i}).style !== undefined`)) same = false;
    check(same, 'the six ground floor rooms use the original themes, untouched');
    check(G('s3Theme(6).style') === 'scifi' && G('s3Theme(6) === S3_STYLE_PACKS.scifi.themes[0] && s3Theme(11) === S3_STYLE_PACKS.scifi.themes[5]'), 'the second floor wears the sci-fi pack, one theme for each place on the floor');
    check(G("S3_FLOOR_STYLE.every((name) => name === 'atomic' || !!S3_STYLE_PACKS[name])") && G('new Set(S3_FLOOR_STYLE).size') === 5, 'every floor above the ground floor has its own registered style pack');
    let floorsOk = true;
    for (let lv = 6; lv < G('HOUSE_LEVELS'); lv++) {
        if (G(`s3Theme(${lv}).style`) !== G(`S3_FLOOR_STYLE[Math.floor(${lv} / FLOOR_SIZE)]`)) floorsOk = false;
    }
    check(floorsOk, 'every room above the ground floor wears the style of its floor');
    const themeNames = [];
    for (let lv = 0; lv < G('HOUSE_LEVELS'); lv++) themeNames.push(G(`s3Theme(${lv}).name`));
    check(new Set(themeNames).size === G('HOUSE_LEVELS'), 'all thirty rooms have a theme name of their own');
    G('LEVELS[SPECIAL_LEVEL] = { name: "x", theme: 9, batteryCost: 1, charger: { col: 0, row: 0 }, obstacles: [] }');
    check(G('s3Theme(SPECIAL_LEVEL) === S3_THEMES[3]'), 'an extra room names one of the six atomic themes, whatever floors exist');
    G('LEVELS.length = HOUSE_LEVELS');
    check(G("s3PackTexture('scifi:panel') !== null && s3PackTexture('print:rocket') === null && s3PackTexture('plaster') === null"), 'a pack texture is found by its handle and nothing else is mistaken for one');

    // Every registered pack keeps the contract in docs/style-pack-brief.md
    const packProblems = `(function (name) {
        const pack = S3_STYLE_PACKS[name];
        const bad = [];
        const SHAPES = ['box', 'cyl', 'sphere', 'torus', 'plane', 'rod', 'extrude', 'lathe', 'tube', 'gear', 'gem'];
        const TIMES = ['morning', 'noon', 'afternoon', 'golden hour', 'dusk', 'night'];
        const num = (v) => typeof v === 'number' && isFinite(v);
        const checkParts = (parts, what) => {
            if (!Array.isArray(parts) || !parts.length) { bad.push(what + ': no parts'); return; }
            for (const p of parts) {
                if (!SHAPES.includes(p.shape)) bad.push(what + ': unknown shape ' + p.shape);
                if (!p.mat || typeof p.mat.color !== 'string') bad.push(what + ': a ' + p.shape + ' without a material colour');
                const pts = p.shape === 'rod' ? [p.from, p.to] : [p.pos];
                for (const q of pts) if (!Array.isArray(q) || q.length !== 3 || !q.every(num)) bad.push(what + ': a ' + p.shape + ' with a bad position');
                if (typeof p.texture === 'string' && p.texture.indexOf(name + ':') === 0 && !s3PackTexture(p.texture)) bad.push(what + ': texture ' + p.texture + ' is not defined');
            }
        };
        if (!pack.themes || pack.themes.length !== 6) bad.push('needs six themes');
        const names = new Set();
        (pack.themes || []).forEach((th, i) => {
            const w = 'theme ' + (i + 1);
            if (th.style !== name) bad.push(w + ': style is not ' + name);
            if (!th.name || names.has(th.name)) bad.push(w + ': needs a name of its own');
            names.add(th.name);
            if (!TIMES.includes(th.time)) bad.push(w + ': time of day');
            for (const k of ['walls', 'trim', 'ceiling', 'couch', 'pillow', 'couchWood', 'chair', 'table', 'leaf', 'planter', 'petbed', 'cat']) {
                if (!/^#[0-9A-Fa-f]{6}$/.test(th[k] || '')) bad.push(w + ': colour ' + k);
            }
            if (!th.sun || !(th.sun.elevation >= 6 && th.sun.elevation <= 60 && Math.abs(th.sun.azimuth) <= 70)) bad.push(w + ': the sun must come in through the north window');
            if (!th.lamp || typeof th.lamp.on !== 'boolean' || !num(th.lamp.intensity)) bad.push(w + ': lamp');
            if (!th.accent || !['north', 'south', 'west', 'east'].includes(th.accent.wall)) bad.push(w + ': accent wall');
            if (!th.door || !['south', 'west', 'east'].includes(th.door.wall) || !num(th.door.at)) bad.push(w + ': door');
            if (th.fog && !(th.fog.density <= 0.02)) bad.push(w + ': haze too thick');
            if (th.lights && th.lights.length > 8) bad.push(w + ': more than eight lights');
            for (const [fn, lw, ld] of [['couch', 3, 1], ['table', 2, 2], ['chair', 1, 1], ['plant', 1, 1], ['petbed', 2, 1]]) {
                if (pack[fn]) checkParts(pack[fn](lw, ld, th, 7), w + ' ' + fn);
            }
            if (pack.wall) {
                const parts = pack.wall({ w: 1, h: 1, col: 3, row: 4 }, th);
                checkParts(parts, w + ' wall');
                if (parts.length > 9) bad.push(w + ': a wall tile of ' + parts.length + ' parts');
            }
            if (pack.dock) {
                const parts = pack.dock(th);
                checkParts(parts, w + ' dock');
                if (!parts.every((p) => p.shape === 'rod' || p.pos[1] < 0.12 || Math.hypot(p.pos[0], p.pos[2]) > 0.3)) bad.push(w + ': something tall stands where the vacuum parks');
            }
            if (pack.architecture) {
                const arch = pack.architecture(0, th);
                checkParts(arch, w + ' room');
                if (arch.filter((p) => p.tag === 'glass').length !== 1) bad.push(w + ': the window needs exactly one pane of glass');
                if (arch.filter((p) => p.tag === 'slat').length < 6) bad.push(w + ': the window needs at least six blades');
                if (arch.length > 260) bad.push(w + ': a room shell of ' + arch.length + ' parts');
            }
            if (pack.palette2d) {
                const pal = pack.palette2d(th);
                for (const k of ['floorBase', 'glaze', 'film']) if (!Array.isArray(pal[k]) || pal[k].length !== 3) bad.push(w + ': palette ' + k);
            }
        });
        return bad;
    })`;
    for (const name of G('Object.keys(S3_STYLE_PACKS)')) {
        const bad = G(`${packProblems}(${JSON.stringify(name)})`);
        for (const line of bad.slice(0, 8)) console.error(`  ${name}: ${line}`);
        check(bad.length === 0, `the ${name} pack keeps the style pack contract (${bad.length} problems)`);
    }

    const shell = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    const creditText = (shell.match(/<div id="creditsPanel"[\s\S]*?<\/dl>/) || [''])[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    check(/Created by Benjamin, Ian and Claude/.test(creditText) && /Tested by Georgie, Liam, Vera, Pam, Dwight, Kristina/.test(creditText) && /id="btnCredits"/.test(shell), 'the credits name who made the game and who tested it, behind a Credits button');
    G('toggleCreditsPanel(true)');
    const creditsOpened = G('creditsPanelOpen');
    G('toggleCreditsPanel()');
    check(creditsOpened === true && G('creditsPanelOpen') === false, 'the Credits button opens the panel and closes it again');
    check(/<title>Ben's Vacuum Game<\/title>/.test(shell) && />Ben's Vacuum Game<\/h1>/.test(shell) && man.name === "Ben's Vacuum Game" && !/Roomba/.test(shell + JSON.stringify(man)), "the game is called Ben's Vacuum Game wherever a player reads its name");
}

// --- Home screen install ------------------------------------------------------

section('Home screen install');
{
    const platform = (ua, touchPoints, standalone) => G(`installPlatform(${JSON.stringify({ ua, touchPoints, standalone })})`);
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    const PIXEL = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
    const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    check(platform(IPHONE, 5, false) === 'ios', 'an iPhone is offered the iOS steps');
    check(platform(MAC, 5, false) === 'ios', 'an iPad, which says it is a Mac but has a touch screen, is offered the iOS steps');
    check(platform(MAC, 0, false) === null && platform(WINDOWS, 0, false) === null, 'a desktop browser is not asked at all');
    check(platform(PIXEL, 5, false) === 'android', 'an Android phone is offered the Android route');
    check(platform(IPHONE, 5, true) === null && platform(PIXEL, 5, true) === null, 'a game already opened from its icon is not asked again');

    const ios = G("installCopy('ios', false)");
    check(ios.action === null && /Share/.test(ios.steps) && /Add to Home Screen/.test(ios.steps), 'iOS gets the two taps spelled out, with no button it cannot honour');
    check(G("installCopy('android', true)").action === 'Add it' && G("installCopy('android', false)").action === null && /Add to Home screen/.test(G("installCopy('android', false)").steps), 'Android gets a button when the browser offers a prompt and the menu steps when it does not');
    check(G('installCopy(null, false)') === null, 'no platform, no words');
    // Two ways to say no: "Not now" sleeps for a week, "Don't ask again" is for good
    const DAY = 24 * 60 * 60 * 1000, T0 = Date.UTC(2026, 10, 10);
    const stored = () => G('localStorage.getItem(INSTALL_KEY)');
    G('localStorage.removeItem(INSTALL_KEY)');
    check(G(`installShouldAsk(${T0})`) === true && stored() === null, 'a new player is offered the home screen');
    G(`installSnooze(${T0})`);
    check(G(`installShouldAsk(${T0 + DAY})`) === false && G(`installShouldAsk(${T0 + 6.9 * DAY})`) === false, '"Not now" keeps the bar away for the rest of the week');
    check(G(`installShouldAsk(${T0 + 7 * DAY})`) === true, 'and it offers itself again a week later');
    check(G(`installShouldAsk(${T0 - 30 * DAY})`) === true, 'a clock that jumped back does not hide it for ever');
    G('installNever()');
    check(stored() === 'never' && G(`installShouldAsk(${T0})`) === false && G(`installShouldAsk(${T0 + 3650 * DAY})`) === false, '"Don\'t ask again" means it never comes back');
    G(`installSnooze(${T0}); installNever()`);
    check(G(`installShouldAsk(${T0 + 365 * DAY})`) === false, 'even after an earlier "Not now"');
    G("localStorage.setItem(INSTALL_KEY, 'dismissed')");
    check(G(`installShouldAsk(${T0})`) === false && stored() === `later:${T0}` && G(`installShouldAsk(${T0 + 7 * DAY})`) === true, 'a "Not now" saved by the first version counts as a week from today, not as never');
    G("localStorage.setItem(INSTALL_KEY, 'later:banana')");
    check(G(`installShouldAsk(${T0})`) === true, 'a saved answer that makes no sense is ignored');
    G('localStorage.removeItem(INSTALL_KEY)');
    const barPage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    check(/id="installLater"[^>]*>Not now</.test(barPage) && /id="installNever"[^>]*>Don't ask again</.test(barPage), 'the bar carries both answers');

    const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    check(/<link rel="manifest" href="manifest\.json">/.test(page) && /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/.test(page) && /<script src="install\.js"><\/script>/.test(page), 'the page links the manifest, the iOS icon and the install script');

    const pngSize = (file) => {
        const b = fs.readFileSync(path.join(root, file));
        return b.subarray(1, 4).toString() === 'PNG' ? `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` : 'not a png';
    };
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    check(manifest.display === 'standalone' && !!manifest.start_url && manifest.name.length > 0 && manifest.short_name.length <= 12, 'the manifest opens the game full screen under a name short enough for an icon label');
    const has = (size, purpose) => manifest.icons.some((i) => i.sizes === size && i.purpose === purpose);
    check(has('192x192', 'any') && has('512x512', 'any') && has('512x512', 'maskable'), 'the manifest lists the icon sizes Android asks for, one of them maskable');
    check(manifest.icons.every((i) => i.type === 'image/png' && pngSize(i.src) === i.sizes), 'every icon file is a PNG of the size the manifest claims');
    check(pngSize('icons/apple-touch-icon.png') === '180x180', 'the iOS icon is 180 pixels square');
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
