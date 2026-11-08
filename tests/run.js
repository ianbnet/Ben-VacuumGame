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
for (const f of ['core.js', 'upgrades.js', 'design.js', 'scene3d.js', 'render3d.js', 'game.js']) {
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

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
