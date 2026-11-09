// === THE BAR AT THE TOP: WHAT TO PLAY ===
// Classic script sharing globals (loaded after game.js). The three ways to play: The House,
// Room of the Day and Build a Room; the switch for racing your best run; and the room editor,
// which lives on the board itself. The rules for rooms are in rooms.js; this file is interface.

const BUILD_TOOLS = [
    ['couch', 'Sofa'], ['table', 'Table'], ['chair', 'Chair'], ['plant', 'Plant'],
    ['petbed', 'Pet bed'], ['wall', 'Wall'], ['dock', 'Dock'], ['erase', 'Erase'],
];
const DAILY_ARCHIVE_DAYS = 365;

const build = {
    room: null,       // the room being built or played
    id: '',           // its id among the saved rooms ('' for a shared room not kept yet)
    shared: false,    // it came from a link
    editing: false,
    tool: 'couch',
    vertical: false,  // sofas and pet beds can stand upright
    hover: null,      // the tile under the pointer
    down: false,
    lastTile: '',
    check: null,      // validateRoom's verdict on the room as it stands
    par: 0,
    note: '',         // a passing message for the status line
    noteUntil: 0,
    listKey: '',      // what the room list was built from, so it is rebuilt only when it changes
    linkCode: '',     // the layout the link on show was made for
    deleteArmedUntil: 0,
};

function modeEl(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
}

function modeShow(id, on) {
    const el = modeEl(id);
    if (el) el.hidden = !on;
}

function todayKey() {
    return dateKeyOf(new Date());
}

// --- The bar ---------------------------------------------------------------------------------

function syncModeBar() {
    const tabs = { house: 'tabHouse', daily: 'tabDaily', custom: 'tabBuild' };
    for (const mode of Object.keys(tabs)) {
        const el = modeEl(tabs[mode]);
        if (!el) return;
        el.classList.toggle('current', roomMode === mode);
        el.setAttribute('aria-pressed', roomMode === mode ? 'true' : 'false');
    }
    modeShow('ctxHouse', roomMode === 'house');
    modeShow('ctxDaily', roomMode === 'daily');
    modeShow('ctxBuild', roomMode === 'custom');
    const race = modeEl('raceBestToggle');
    if (race) race.checked = !!progress.raceBest;
    if (roomMode === 'daily') syncDailyBar();
    if (roomMode === 'custom' && build.room) syncBuildBar();
}

// In full screen the bar moves into the side column, so the board keeps its height
function placeModeBar(on) {
    const bar = modeEl('modeBar'), side = modeEl('sidePanel'), container = modeEl('gameContainer');
    if (!bar || !side || !container || !container.insertBefore || !canvas) return;
    if (on) side.insertBefore(bar, side.firstChild);
    else container.insertBefore(bar, canvas);
}

function showHouse() {
    leaveEditor();
    if (roomMode !== 'house') returnToHouse();
}

// --- Room of the day ---------------------------------------------------------------------------

function openDaily(key) {
    const today = todayKey();
    if (!parseDateKey(key) || dayNumber(key) > dayNumber(today)) key = today;
    if (dayNumber(key) < dayNumber(today) - DAILY_ARCHIVE_DAYS) key = shiftDateKey(today, -DAILY_ARCHIVE_DAYS);
    leaveEditor();
    loadSpecialRoom(generateDailyRoom(key), 'daily', 'd' + key);
}

function syncDailyBar() {
    const room = LEVELS[SPECIAL_LEVEL];
    const label = modeEl('dailyLabel');
    if (!room || !label) return;
    const today = dayNumber(todayKey()), day = dayNumber(dailyKey);
    label.textContent = `${formatDateKey(dailyKey)} · ${room.name}`;
    modeEl('dailyNext').disabled = day >= today;
    modeEl('dailyPrev').disabled = day <= today - DAILY_ARCHIVE_DAYS;
    modeEl('dailyToday').disabled = day === today;
    const run = progress.runs['d' + dailyKey];
    modeEl('dailyBest').textContent = run
        ? `Your best: ${run.moves} moves ${'★'.repeat(run.stars)} · par ${parMoves}`
        : `Not played yet · par ${parMoves}`;
}

// --- Build a room: the list of rooms -------------------------------------------------------------

function newRoomId() {
    return Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

function savedRoom(id) {
    return progress.rooms.find((r) => r.id === id) || null;
}

// A shared room that has not been kept still gets a best run, filed under its layout
function buildRunKey() {
    return build.id ? 'c' + build.id : 's' + hashString(encodeRoom(build.room)).toString(36);
}

function buildNote(text) {
    build.note = text;
    build.noteUntil = performance.now() + 4000;
    syncBuildBar();
    setTimeout(() => { if (roomMode === 'custom' && build.room) syncBuildBar(); }, 4100);
}

function openBuild() {
    const entry = savedRoom(build.id) || progress.rooms[progress.rooms.length - 1];
    if (entry) editSavedRoom(entry.id);
    else createRoom();
}

function createRoom() {
    if (progress.rooms.length >= MAX_SAVED_ROOMS) {
        if (build.room) buildNote(`You have ${MAX_SAVED_ROOMS} rooms. Delete one to make another.`);
        return false;
    }
    const names = new Set(progress.rooms.map((r) => r.name));
    let n = progress.rooms.length + 1;
    while (names.has(`My Room ${n}`)) n++;
    const room = blankRoom(`My Room ${n}`, progress.rooms.length % S3_THEMES.length);
    const id = newRoomId();
    progress.rooms.push({ id, name: room.name, code: encodeRoom(room) });
    saveProgress();
    editSavedRoom(id);
    return true;
}

function editSavedRoom(id) {
    const entry = savedRoom(id);
    const room = entry ? decodeRoom(entry.code, entry.name) : null;
    if (!room) return false;
    build.room = room;
    build.id = id;
    build.shared = false;
    startEditing();
    return true;
}

function startEditing() {
    build.editing = true;
    build.hover = null;
    build.down = false;
    loadSpecialRoom(build.room, 'custom', buildRunKey());
    gameState = 'EDITING';
    bannerTimer = 0;
    stopHold();
    if (viewMode === 'FP') {
        viewMode = 'TD';
        updateViewButtons();
    }
    if (canvas && canvas.style) canvas.style.touchAction = 'none';
    recheckRoom();
    updateUI();
    syncModeBar();
}

function leaveEditor() {
    build.editing = false;
    build.hover = null;
    build.down = false;
    if (canvas && canvas.style) canvas.style.touchAction = '';
}

function recheckRoom() {
    build.check = validateRoom(build.room);
    build.par = build.check.ok ? computeParRoute(build.room).totalMoves : 0;
}

function playBuiltRoom() {
    if (!build.room) return false;
    recheckRoom();
    if (!build.check.ok) {
        syncBuildBar();
        sound('bump');
        return false;
    }
    leaveEditor();
    loadSpecialRoom(build.room, 'custom', buildRunKey());
    return true;
}

// Something about the room changed: check it again, repaint what changed, save it
function roomEdited(what) {
    recheckRoom();
    if (what === 'theme') scene.level = -1;
    else if (what === 'piece' && canvas) refreshFurnitureLayer(); // no board to repaint in the headless tests
    const entry = savedRoom(build.id);
    if (entry) {
        entry.code = encodeRoom(build.room);
        entry.name = build.room.name;
        // A best run belongs to a layout; once the pieces or the dock move it no longer fits
        if (what === 'piece' || what === 'dock') delete progress.runs['c' + build.id];
        saveProgress();
    }
    syncBuildBar();
}

// A room that arrived as a link. Finished rooms open ready to play; a room that cannot be
// finished yet opens in the editor as a room of your own.
function openSharedRoom(code, name) {
    const room = decodeRoom(code, name);
    if (!room) return false;
    build.room = room;
    build.id = '';
    build.shared = true;
    recheckRoom();
    if (build.check.ok) {
        leaveEditor();
        loadSpecialRoom(room, 'custom', buildRunKey());
        return true;
    }
    if (!keepSharedRoom()) return false;
    startEditing();
    return true;
}

// Put a shared room among your own, and bring its best run along
function keepSharedRoom() {
    if (!build.room || build.id) return false;
    if (progress.rooms.length >= MAX_SAVED_ROOMS) {
        buildNote(`You have ${MAX_SAVED_ROOMS} rooms. Delete one to keep this one.`);
        return false;
    }
    const oldKey = buildRunKey();
    const id = newRoomId();
    progress.rooms.push({ id, name: build.room.name, code: encodeRoom(build.room) });
    build.id = id;
    build.shared = false;
    if (progress.runs[oldKey]) {
        progress.runs['c' + id] = progress.runs[oldKey];
        delete progress.runs[oldKey];
    }
    if (roomMode === 'custom') specialKey = 'c' + id;
    saveProgress();
    syncModeBar();
    return true;
}

function deleteBuiltRoom() {
    if (!build.id) return;
    const btn = modeEl('roomDelete');
    const now = performance.now();
    if (now > build.deleteArmedUntil) {
        build.deleteArmedUntil = now + 3500;
        if (btn) btn.textContent = 'Really delete?';
        setTimeout(() => { if (btn && performance.now() >= build.deleteArmedUntil) btn.textContent = 'Delete'; }, 3600);
        return;
    }
    build.deleteArmedUntil = 0;
    if (btn) btn.textContent = 'Delete';
    progress.rooms = progress.rooms.filter((r) => r.id !== build.id);
    delete progress.runs['c' + build.id];
    saveProgress();
    build.room = null;
    build.id = '';
    openBuild();
}

function shareRoomLink() {
    if (!build.room || !build.check || !build.check.ok || typeof location === 'undefined') return;
    const url = `${String(location.href).split('#')[0]}#room=${encodeRoom(build.room)}~${encodeURIComponent(build.room.name)}`;
    const box = modeEl('roomLink');
    const fallback = () => {
        if (!box) return;
        build.linkCode = encodeRoom(build.room);
        box.hidden = false;
        box.value = url;
        box.focus();
        box.select();
        buildNote('Copy the link below and send it.');
    };
    try {
        navigator.clipboard.writeText(url).then(() => buildNote('Link copied. Whoever opens it gets this room.'), fallback);
    } catch (e) {
        fallback();
    }
}

// A link like ...#room=<code>~<name> opens that room
function roomFromHash() {
    if (typeof location === 'undefined') return false;
    const m = /^#room=([^~]+)(?:~(.*))?$/.exec(location.hash || '');
    if (!m) return false;
    let name = '';
    try { name = decodeURIComponent(m[2] || ''); } catch (e) { /* a mangled name: use the default */ }
    const ok = openSharedRoom(m[1], name || 'Shared Room');
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* file pages */ }
    return ok;
}

function syncBuildBar() {
    const room = build.room;
    const sel = modeEl('roomSelect');
    if (!room || !sel) return;
    const unkept = build.shared && !build.id;
    const listKey = (unkept ? `~${room.name}|` : '') + progress.rooms.map((r) => `${r.id}:${r.name}`).join('|');
    if (listKey !== build.listKey) {
        build.listKey = listKey;
        sel.innerHTML = '';
        const add = (value, text) => {
            const o = document.createElement('option');
            o.value = value;
            o.textContent = text;
            sel.appendChild(o);
        };
        if (unkept) add('', `${room.name} (shared)`);
        for (const r of progress.rooms) add(r.id, r.name);
    }
    sel.value = build.id || '';

    const editing = build.editing;
    const name = modeEl('roomName');
    if (typeof document === 'undefined' || document.activeElement !== name) name.value = room.name;
    name.disabled = !editing;
    const theme = modeEl('roomTheme'), battery = modeEl('roomBattery');
    theme.value = String(room.theme);
    theme.disabled = !editing;
    battery.value = String(room.batteryCost);
    battery.disabled = !editing;
    modeShow('buildTools', editing);
    modeShow('roomPlay', editing);
    modeShow('roomEdit', !editing);
    modeEl('roomEdit').textContent = unkept ? 'Edit a copy' : 'Edit';
    modeShow('roomKeep', unkept);
    modeShow('roomDelete', !!build.id);
    const check = build.check || { ok: false, reason: '' };
    modeEl('roomPlay').disabled = !check.ok;
    modeEl('roomShare').disabled = !check.ok;
    if (editing) {
        for (const [tool] of BUILD_TOOLS) {
            const b = modeEl('tool-' + tool);
            if (b) b.classList.toggle('current', build.tool === tool);
        }
        const turn = modeEl('toolTurn');
        if (turn) {
            turn.setAttribute('aria-pressed', build.vertical ? 'true' : 'false');
            turn.textContent = build.vertical ? 'Upright (R)' : 'Turn (R)';
        }
    }

    // A link shown for copying belongs to one layout; put it away when the room moves on
    const linkBox = modeEl('roomLink');
    if (linkBox && !linkBox.hidden && build.linkCode !== encodeRoom(room)) linkBox.hidden = true;

    const status = modeEl('buildStatus');
    let text, tone = '';
    if (build.note && performance.now() < build.noteUntil) {
        text = build.note;
        tone = 'good';
    } else if (editing) {
        text = check.ok ? `${check.tiles} tiles · par ${build.par} · ready to play` : check.reason;
        tone = check.ok ? 'good' : 'problem';
    } else {
        const run = progress.runs[buildRunKey()];
        text = run ? `Your best: ${run.moves} moves ${'★'.repeat(run.stars)} · par ${parMoves}` : `Not played yet · par ${parMoves}`;
    }
    status.textContent = text;
    status.classList.toggle('problem', tone === 'problem');
    status.classList.toggle('good', tone === 'good');
}

// --- Build a room: the editor on the board -------------------------------------------------------

function setBuildTool(tool) {
    build.tool = tool;
    syncBuildBar();
}

function editorTile(e) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * COLS);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * ROWS);
    return col >= 0 && col < COLS && row >= 0 && row < ROWS ? { col, row } : null;
}

// A piece goes down centred on the tile you point at
function editorAnchor(tile) {
    const size = roomPieceSize(build.tool, build.vertical);
    if (!size) return tile;
    return { col: tile.col - Math.floor((size.w - 1) / 2), row: tile.row - Math.floor((size.h - 1) / 2) };
}

function editorApply(tile, dragging) {
    const room = build.room;
    let changed = false, what = 'piece';
    if (build.tool === 'erase') {
        changed = roomErase(room, tile.col, tile.row);
    } else if (build.tool === 'dock') {
        changed = roomMoveDock(room, tile.col, tile.row);
        what = 'dock';
    } else {
        const a = editorAnchor(tile);
        changed = !!roomPlace(room, build.tool, a.col, a.row, build.vertical);
    }
    if (changed) {
        sound(build.tool === 'erase' ? 'turn' : 'clean');
        roomEdited(what);
    } else if (!dragging && build.tool !== 'erase') {
        sound('bump');
    }
    return changed;
}

// Keys while building: R turns the piece, 1 to 8 pick a tool, Space plays the room
function editorKey(e) {
    const k = e.key;
    if (k === 'r' || k === 'R') {
        build.vertical = !build.vertical;
        syncBuildBar();
    } else if (k >= '1' && k <= String(BUILD_TOOLS.length)) {
        setBuildTool(BUILD_TOOLS[Number(k) - 1][0]);
    } else if (k === ' ') {
        playBuiltRoom();
    } else if (k === 'Backspace' || k === 'Delete') {
        setBuildTool('erase');
    } else {
        return false;
    }
    e.preventDefault();
    return true;
}

// The room as it stands, a grid to place by, the tiles that could never be cleaned, and the
// piece about to go down
function drawEditor() {
    const room = build.room;
    if (!room) return;
    ensureSceneLayers();
    ctx.drawImage(scene.floor, 0, 0, CANVAS_W, CANVAS_H);
    drawChargerTile(room.charger.col * TILE, room.charger.row * TILE);
    ctx.drawImage(scene.furniture, 0, 0, CANVAS_W, CANVAS_H);
    drawCats();
    drawLighting();

    ctx.save();
    ctx.strokeStyle = 'rgba(242, 232, 213, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
        ctx.moveTo(c * TILE + 0.5, 0);
        ctx.lineTo(c * TILE + 0.5, CANVAS_H);
    }
    for (let r = 1; r < ROWS; r++) {
        ctx.moveTo(0, r * TILE + 0.5);
        ctx.lineTo(CANVAS_W, r * TILE + 0.5);
    }
    ctx.stroke();

    const hatch = (tiles, rgb) => {
        for (const t of tiles) {
            const x = t.col * TILE, y = t.row * TILE;
            ctx.fillStyle = `rgba(${rgb}, 0.34)`;
            ctx.fillRect(x, y, TILE, TILE);
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, TILE, TILE);
            ctx.clip();
            ctx.strokeStyle = `rgba(${rgb}, 0.9)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let d = -TILE; d < TILE; d += 12) {
                ctx.moveTo(x + d, y + TILE);
                ctx.lineTo(x + d + TILE, y);
            }
            ctx.stroke();
            ctx.restore();
        }
    };
    const check = build.check;
    if (check) {
        hatch(check.unreachable, '231, 111, 81');
        hatch(check.tooFar, '217, 164, 65');
    }

    // What the pointer would do here
    const h = build.hover;
    if (h) {
        let box = null, good = true;
        if (build.tool === 'erase') {
            const i = roomPieceAt(room, h.col, h.row);
            box = i >= 0 ? room.obstacles[i] : { col: h.col, row: h.row, w: 1, h: 1 };
            good = false;
        } else if (build.tool === 'dock') {
            box = { col: h.col, row: h.row, w: 1, h: 1 };
            good = roomPieceAt(room, h.col, h.row) < 0;
        } else {
            const a = editorAnchor(h);
            box = roomFootprint(build.tool, a.col, a.row, build.vertical);
            good = roomCanPlace(room, build.tool, a.col, a.row, build.vertical);
        }
        const rgb = good ? '158, 216, 204' : '231, 111, 81';
        ctx.fillStyle = `rgba(${rgb}, ${build.tool === 'erase' ? 0.22 : 0.34})`;
        roundRect(ctx, box.col * TILE + 2, box.row * TILE + 2, box.w * TILE - 4, box.h * TILE - 4, 8);
        ctx.fill();
        ctx.strokeStyle = `rgba(${rgb}, 0.95)`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // The verdict, where the builder is looking
    const ok = check && check.ok;
    const text = ok ? `${check.tiles} TILES   ·   PAR ${build.par}   ·   SPACE TO PLAY` : (check ? check.reason.toUpperCase() : '');
    if (text) {
        ctx.font = `600 11px ${UI_FONT}`;
        const w = Math.min(CANVAS_W - 40, ctx.measureText(text).width + text.length * 1.5 + 36);
        ctx.fillStyle = UI.ink;
        roundRect(ctx, CANVAS_W / 2 - w / 2, CANVAS_H - 40, w, 26, 13);
        ctx.fill();
        uiText(text, CANVAS_W / 2, CANVAS_H - 27, 11, ok ? UI.mint : UI.coral, 'center', '600', 1.5);
    }
    ctx.restore();
}

// --- Wiring ----------------------------------------------------------------------------------------

function initModeBar() {
    const on = (id, type, fn) => {
        const el = modeEl(id);
        if (el) el.addEventListener(type, fn);
        return el;
    };
    const click = (id, fn) => on(id, 'click', (e) => {
        fn(e);
        if (e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
    });

    click('tabHouse', showHouse);
    click('tabDaily', () => { if (roomMode !== 'daily') openDaily(todayKey()); });
    click('tabBuild', () => { if (roomMode !== 'custom') openBuild(); });
    on('raceBestToggle', 'change', (e) => {
        toggleRaceBest(e.target.checked);
        e.target.blur();
    });

    click('dailyPrev', () => openDaily(shiftDateKey(dailyKey, -1)));
    click('dailyNext', () => openDaily(shiftDateKey(dailyKey, 1)));
    click('dailyToday', () => openDaily(todayKey()));

    const tools = modeEl('buildTools');
    if (tools && tools.appendChild) {
        BUILD_TOOLS.forEach(([tool, label], i) => {
            const b = document.createElement('button');
            b.className = 'tool-btn';
            b.id = 'tool-' + tool;
            b.textContent = label;
            b.title = `${label} (${i + 1})`;
            b.addEventListener('click', () => {
                setBuildTool(tool);
                b.blur();
            });
            tools.appendChild(b);
        });
        const turn = document.createElement('button');
        turn.className = 'tool-btn tool-turn';
        turn.id = 'toolTurn';
        turn.textContent = 'Turn (R)';
        turn.title = 'Stand sofas and pet beds upright (R)';
        turn.addEventListener('click', () => {
            build.vertical = !build.vertical;
            syncBuildBar();
            turn.blur();
        });
        tools.appendChild(turn);
    }
    const themeSel = modeEl('roomTheme');
    if (themeSel && themeSel.appendChild) {
        S3_THEMES.forEach((t, i) => {
            const o = document.createElement('option');
            o.value = String(i);
            o.textContent = t.name;
            themeSel.appendChild(o);
        });
    }

    on('roomSelect', 'change', (e) => {
        if (e.target.value) editSavedRoom(e.target.value);
        e.target.blur();
    });
    click('roomNew', createRoom);
    on('roomName', 'input', (e) => {
        if (!build.room || !build.editing) return;
        build.room.name = cleanRoomName(e.target.value);
        roomEdited('name');
        updateUI();
    });
    on('roomName', 'keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); });
    on('roomTheme', 'change', (e) => {
        if (!build.room || !build.editing) return;
        build.room.theme = Number(e.target.value) | 0;
        roomEdited('theme');
        e.target.blur();
    });
    on('roomBattery', 'change', (e) => {
        if (!build.room || !build.editing) return;
        build.room.batteryCost = Math.max(1, Math.min(3, Number(e.target.value) | 0));
        roomEdited('battery');
        e.target.blur();
    });
    click('roomPlay', playBuiltRoom);
    click('roomEdit', () => {
        if (!build.room) return;
        if (!build.id && !keepSharedRoom()) return;
        startEditing();
    });
    click('roomKeep', () => { if (keepSharedRoom()) buildNote('Kept. It is in My rooms now.'); });
    click('roomShare', shareRoomLink);
    click('roomDelete', deleteBuiltRoom);

    // The editor's pointer: click to place, drag to paint walls or erase
    if (canvas && canvas.addEventListener) {
        canvas.addEventListener('pointerdown', (e) => {
            if (gameState !== 'EDITING' || helpVisible) return;
            const t = editorTile(e);
            if (!t) return;
            e.preventDefault();
            build.down = true;
            build.hover = t;
            build.lastTile = `${t.col},${t.row}`;
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not every pointer can be captured */ }
            editorApply(t, false);
        });
        canvas.addEventListener('pointermove', (e) => {
            if (gameState !== 'EDITING' || helpVisible) return;
            const t = editorTile(e);
            build.hover = t;
            if (!build.down || !t || (build.tool !== 'wall' && build.tool !== 'erase')) return;
            const key = `${t.col},${t.row}`;
            if (key === build.lastTile) return;
            // A fast drag skips tiles between pointer samples: fill in the straight line between
            const [lc, lr] = build.lastTile.split(',').map(Number);
            const steps = Math.max(Math.abs(t.col - lc), Math.abs(t.row - lr));
            for (let i = 1; i <= steps; i++) {
                editorApply({ col: Math.round(lc + ((t.col - lc) * i) / steps), row: Math.round(lr + ((t.row - lr) * i) / steps) }, true);
            }
            build.lastTile = key;
        });
        const up = () => { build.down = false; };
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);
        canvas.addEventListener('pointerleave', () => { if (!build.down) build.hover = null; });
    }

    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('hashchange', roomFromHash);
    syncModeBar();
    roomFromHash();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initModeBar);
