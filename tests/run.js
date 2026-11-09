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
for (const f of ['core.js', 'rooms.js', 'upgrades.js', 'design.js', 'scene3d.js', 'render2d.js', 'scene2d.js', 'render3d.js', 'game.js', 'modes.js']) {
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
check(G('holdInterval') === null, 'holding a turn key does not auto-repeat in 3D');
G('stopHold(); startHold("up")');
check(G('holdInterval') !== null, 'holding forward does auto-repeat');
G('stopHold()');
check(G('holdInterval') === null && G('heldDir') === null, 'stopHold clears the hold');

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
check(G('S3_THEMES.length') === G('LEVELS.length'), 'one theme per room');
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
check(G('HOUSE_LEVELS') === 6 && G('SPECIAL_LEVEL') === 6 && G('LEVELS.length') === 6, 'the house has six rooms and one more slot after them');
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
check(G('roomMode') === 'daily' && G('currentLevel') === 6 && G('LEVELS.length') === 7 && G('totalDirty') === dayRoom.tiles && G('roomKey()') === 'd2026-11-09' && G('gameState') === 'PLAYING', 'the room of the day loads into the extra slot and starts');
check(G('s3Theme(currentLevel) === S3_THEMES[LEVELS[SPECIAL_LEVEL].theme]') && G('scene.level') === -1, 'it wears its own theme, and what was cached for the slot is thrown away');
check(G(drivePar) === 'LEVEL_COMPLETE' && G('levelResult.points') === 0 && G('JSON.stringify({ points: progress.points, best: progress.best, unlocked: progress.unlocked })') === before, 'finishing it pays no upgrade points and leaves the house progress alone');
check(G("progress.runs['d2026-11-09'].moves") === G('moves'), 'it does keep a best run of its own');
G('nextLevel()');
check(G('currentLevel') === 6 && G('gameState') === 'LEVEL_COMPLETE', 'there is no next room after the room of the day');
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
check(G('roomMode') === 'house' && G('gameState') === 'PLAYING' && G('HOUSE_LEVELS') === 6, 'and the house is still there afterwards');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
