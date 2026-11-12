// === UPGRADES ===
// Classic script sharing globals; nothing touches the DOM at load time.
// Every new star earned on a house room or a room of the day is one upgrade point. Points buy levels of five upgrades,
// three on the vacuum and two on the charger. Progress holds the points and the levels.

const UPGRADES = [
    {
        key: 'motor', group: 'Vacuum', name: 'Efficient motor',
        desc: 'Each move drains less battery.',
        levels: [
            { cost: 2, text: '15% less drain' },
            { cost: 3, text: '30% less drain' },
            { cost: 4, text: '45% less drain' },
        ],
    },
    {
        key: 'battery', group: 'Vacuum', name: 'Bigger battery',
        desc: 'A larger cell, so there is more charge between docks.',
        levels: [
            { cost: 2, text: '125 capacity' },
            { cost: 3, text: '150 capacity' },
        ],
    },
    {
        key: 'solar', group: 'Vacuum', name: 'Solar cells',
        desc: 'Trickle-charges from the window light as you move.',
        levels: [
            { cost: 2, text: '+1 charge every 5 moves' },
            { cost: 3, text: '+1 charge every 3 moves' },
        ],
    },
    {
        key: 'coast', group: 'Vacuum', name: 'Coasting',
        desc: 'Rolling over floor that is already clean drains less.',
        levels: [
            { cost: 3, text: '25% less on clean floor' },
            { cost: 4, text: '50% less on clean floor' },
        ],
    },
    {
        key: 'glide', group: 'Gadgets', name: 'Glide',
        desc: 'Holding a direction runs faster over clean floor. Moves and battery stay the same.',
        levels: [
            { cost: 2, text: 'half as fast again' },
            { cost: 3, text: 'twice as fast' },
        ],
    },
    {
        key: 'brush', group: 'Gadgets', name: 'Corner brush',
        desc: 'A side brush sweeps out a dead-end tile from the tile next to it.',
        levels: [
            { cost: 4, text: 'fitted' },
        ],
    },
    {
        key: 'trip', group: 'Gadgets', name: 'Trip computer',
        desc: 'Shows how many moves are left on this charge.',
        levels: [
            { cost: 2, text: 'fitted' },
        ],
    },
    {
        key: 'travel', group: 'Charger', name: 'Travel pad',
        desc: 'Drop a second charging spot where the vacuum stands (P, or the Drop pad button). It can be used in one room out of every ten.',
        levels: [
            { cost: 6, text: 'one pad every ten rooms' },
        ],
    },
    {
        key: 'pad', group: 'Charger', name: 'Charging pad',
        desc: 'The dock charges the tiles around it too.',
        levels: [
            { cost: 2, text: 'the neighbouring tiles' },
            { cost: 3, text: 'two tiles out' },
        ],
    },
    {
        key: 'overcharge', group: 'Charger', name: 'Overcharge',
        desc: 'Leave the dock with more than a full charge.',
        levels: [
            { cost: 2, text: '115% on the dock' },
            { cost: 3, text: '130% on the dock' },
        ],
    },
];

const UPGRADE_MOTOR_MULT = [1, 0.85, 0.7, 0.55];
const UPGRADE_BATTERY_MAX = [100, 125, 150];
const UPGRADE_SOLAR_PER_MOVE = [0, 0.2, 0.34];
const UPGRADE_PAD_RADIUS = [0, 1, 2];
const UPGRADE_OVERCHARGE = [1, 1.15, 1.3];
const UPGRADE_COAST_MULT = [1, 0.75, 0.5];
const UPGRADE_GLIDE_MULT = [1, 2 / 3, 0.5];
const UPGRADE_GROUPS = ['Vacuum', 'Charger', 'Gadgets'];

let upgradePanelOpen = false;

function upgradeDef(key) {
    return UPGRADES.find((u) => u.key === key);
}

function upgradeLevel(key) {
    const lv = progress.upgrades ? progress.upgrades[key] : 0;
    return Math.max(0, Math.min(upgradeDef(key).levels.length, lv | 0));
}

// --- Effects --------------------------------------------------------------------

function moveCostMultiplier() { return UPGRADE_MOTOR_MULT[upgradeLevel('motor')]; }
function batteryMax() { return UPGRADE_BATTERY_MAX[upgradeLevel('battery')]; }
function solarPerMove() { return UPGRADE_SOLAR_PER_MOVE[upgradeLevel('solar')]; }
function padRadius() { return UPGRADE_PAD_RADIUS[upgradeLevel('pad')]; }
function overchargeFactor() { return UPGRADE_OVERCHARGE[upgradeLevel('overcharge')]; }
function coastMultiplier() { return UPGRADE_COAST_MULT[upgradeLevel('coast')]; }
function glideMultiplier() { return UPGRADE_GLIDE_MULT[upgradeLevel('glide')]; }
function hasCornerBrush() { return upgradeLevel('brush') > 0; }
function hasTripComputer() { return upgradeLevel('trip') > 0; }
function hasTravelPad() { return upgradeLevel('travel') > 0; }
function lowBatteryLevel() { return batteryMax() * 0.2; }

// Trip computer: how many moves this charge pays for, counting every move at full price
// (coasting can only make it better). Arriving on a charging tile with nothing left is fine.
function chargeMoves() {
    const net = moveCost() - solarPerMove();
    return net <= 0 ? 999 : Math.floor(roomba.battery / net + 1e-9);
}
function isLowBattery() { return roomba.battery <= lowBatteryLevel(); }

// Battery drained by one move on the current level
function moveCost() {
    return (LEVELS[currentLevel].batteryCost || 1) * moveCostMultiplier();
}

// The dock itself plus, with a charging pad, the walkable tiles within its radius
function isChargingTile(col, row) {
    const ch = LEVELS[currentLevel].charger;
    if (col === ch.col && row === ch.row) return true;
    if (typeof travelPad !== 'undefined' && travelPad && travelPad.col === col && travelPad.row === row) return true;
    if (Math.abs(col - ch.col) + Math.abs(row - ch.row) > padRadius()) return false;
    return col >= 0 && col < COLS && row >= 0 && row < ROWS && grid[row][col] !== OBSTACLE;
}

function chargingTiles() {
    const out = [];
    const ch = LEVELS[currentLevel].charger;
    const r = padRadius();
    for (let row = ch.row - r; row <= ch.row + r; row++) {
        for (let col = ch.col - r; col <= ch.col + r; col++) {
            if (isChargingTile(col, row)) out.push({ col, row });
        }
    }
    // a travel pad dropped in this room charges too, wherever it is
    if (typeof travelPad !== 'undefined' && travelPad && !out.some((t) => t.col === travelPad.col && t.row === travelPad.row)) {
        out.push({ col: travelPad.col, row: travelPad.row });
    }
    return out;
}

// --- Points and purchases ------------------------------------------------------------

function upgradeTotalSpent() {
    let spent = 0;
    for (const u of UPGRADES) {
        const lv = upgradeLevel(u.key);
        for (let i = 0; i < lv; i++) spent += u.levels[i].cost;
    }
    return spent;
}

function sanitizeUpgrades(raw) {
    const out = {};
    for (const u of UPGRADES) {
        const v = raw && typeof raw === 'object' ? raw[u.key] | 0 : 0;
        out[u.key] = Math.max(0, Math.min(u.levels.length, v));
    }
    return out;
}

function canBuyUpgrade(key) {
    const u = upgradeDef(key);
    const lv = upgradeLevel(key);
    if (lv >= u.levels.length) return false;
    return (progress.points | 0) >= u.levels[lv].cost;
}

function buyUpgrade(key) {
    if (!canBuyUpgrade(key)) return false;
    const u = upgradeDef(key);
    const lv = upgradeLevel(key);
    progress.points -= u.levels[lv].cost;
    progress.upgrades[key] = lv + 1;
    saveProgress();
    applyUpgrades();
    buildUpgradePanel();
    return true;
}

// Give every point back and clear the levels
function refundUpgrades() {
    progress.points = (progress.points | 0) + upgradeTotalSpent();
    progress.upgrades = sanitizeUpgrades(null);
    saveProgress();
    applyUpgrades();
    buildUpgradePanel();
}

// --- Panel --------------------------------------------------------------------------------

function toggleUpgradePanel(open) {
    upgradePanelOpen = open === undefined ? !upgradePanelOpen : !!open;
    const panel = document.getElementById('upgradePanel');
    if (panel) panel.hidden = !upgradePanelOpen;
    const btn = document.getElementById('btnUpgrades');
    if (btn) btn.setAttribute('aria-expanded', upgradePanelOpen ? 'true' : 'false');
    if (upgradePanelOpen) buildUpgradePanel();
}

function buildUpgradePanel() {
    if (typeof document === 'undefined') return;
    const points = progress.points | 0;
    const btn = document.getElementById('btnUpgrades');
    if (btn) {
        btn.textContent = points > 0 ? `Upgrades (${points})` : 'Upgrades';
        btn.classList.toggle('has-points', points > 0);
    }
    const ptsEl = document.getElementById('upgradePoints');
    if (ptsEl) ptsEl.textContent = String(points);
    const list = document.getElementById('upgradeList');
    if (!list) return;
    list.innerHTML = '';
    const reserve = document.getElementById('reserveToggle');
    if (reserve) reserve.checked = !!progress.reserve;
    for (const group of UPGRADE_GROUPS) {
        const col = document.createElement('div');
        col.className = 'upgrade-group';
        const h = document.createElement('div');
        h.className = 'upgrade-group-title';
        h.textContent = group;
        col.appendChild(h);
        for (const u of UPGRADES.filter((x) => x.group === group)) {
            const lv = upgradeLevel(u.key);
            const maxed = lv >= u.levels.length;
            const card = document.createElement('div');
            card.className = 'upgrade-card' + (lv > 0 ? ' owned' : '');
            const name = document.createElement('div');
            name.className = 'upgrade-name';
            name.textContent = u.name;
            const pips = document.createElement('span');
            pips.className = 'upgrade-pips';
            pips.setAttribute('aria-label', `level ${lv} of ${u.levels.length}`);
            pips.textContent = '●'.repeat(lv) + '○'.repeat(u.levels.length - lv);
            name.appendChild(pips);
            const desc = document.createElement('div');
            desc.className = 'upgrade-desc';
            desc.textContent = u.desc;
            const now = document.createElement('div');
            now.className = 'upgrade-now';
            now.textContent = lv > 0 ? `Now: ${u.levels[lv - 1].text}` : 'Not fitted';
            const buy = document.createElement('button');
            buy.className = 'action-btn upgrade-buy';
            if (maxed) {
                buy.textContent = 'Maxed';
                buy.disabled = true;
            } else {
                const next = u.levels[lv];
                buy.textContent = `${next.text} · ${next.cost} pt${next.cost === 1 ? '' : 's'}`;
                buy.disabled = !canBuyUpgrade(u.key);
                buy.setAttribute('aria-label', `Buy ${u.name}: ${next.text} for ${next.cost} points`);
                buy.addEventListener('click', () => {
                    if (buyUpgrade(u.key)) sound('dock');
                    buy.blur();
                });
            }
            card.appendChild(name);
            card.appendChild(desc);
            card.appendChild(now);
            card.appendChild(buy);
            col.appendChild(card);
        }
        list.appendChild(col);
    }
}

function initUpgradeUI() {
    const btn = document.getElementById('btnUpgrades');
    if (btn) btn.addEventListener('click', () => { toggleUpgradePanel(); btn.blur(); });
    const close = document.getElementById('btnUpgradeClose');
    if (close) close.addEventListener('click', () => { toggleUpgradePanel(false); close.blur(); });
    const refund = document.getElementById('btnUpgradeRefund');
    if (refund) refund.addEventListener('click', () => { refundUpgrades(); refund.blur(); });
    // The reserve cell is a free option, not an upgrade: on or off as the player likes
    const reserve = document.getElementById('reserveToggle');
    if (reserve) reserve.addEventListener('change', () => { setReserveCell(reserve.checked); reserve.blur(); });
    buildUpgradePanel();
}
