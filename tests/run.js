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
for (const f of ['core.js', 'game.js']) {
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

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
