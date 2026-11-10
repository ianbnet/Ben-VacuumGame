// Offers to put the game on the home screen of a phone or tablet.
// Android browsers hand the page an install prompt it can show on a tap. iOS has
// nothing like that, so there the bar just names the two taps.
//
// The player has two ways to say no. "Not now" puts the bar away for a week.
// "Don't ask again" puts it away for good: it never offers itself again on this
// device. The quiet Home screen button stays, for a player who changes their mind.

const INSTALL_KEY = 'ben-vacuum-game.install.v1';
const INSTALL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

// Which home screen route this device has: 'ios', 'android', or null for a
// desktop browser or a game that is already running from its icon.
function installPlatform(env) {
    if (!env || env.standalone) return null;
    const ua = env.ua || '';
    if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
    // An iPad says it is a Mac. A real Mac has no touch screen.
    if (/Macintosh/.test(ua) && env.touchPoints > 1) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return null;
}

// The words for the bar. `action` is the button label, when the browser lets us ask.
function installCopy(platform, canPrompt) {
    if (platform === 'ios') {
        return {
            title: 'Put this game on your Home Screen',
            steps: 'Tap Share, then Add to Home Screen. No Share button? Look under the three dots first.',
            action: null,
        };
    }
    if (platform === 'android') {
        return canPrompt
            ? { title: 'Put this game on your home screen', steps: 'It opens full screen, like an app.', action: 'Add it' }
            : { title: 'Put this game on your home screen', steps: 'Open the browser menu, then tap Add to Home screen.', action: null };
    }
    return null;
}

// What the player last told the bar: nothing, "not now" (and when), or "never".
function installAnswer() {
    let raw = null;
    try { raw = localStorage.getItem(INSTALL_KEY); } catch (e) { return { kind: 'none' }; }
    if (raw === 'never') return { kind: 'never' };
    // The first version had one button, labelled "Not now", and saved this word.
    if (raw === 'dismissed') return { kind: 'later', at: null };
    const m = /^later:(\d+)$/.exec(raw || '');
    return m ? { kind: 'later', at: Number(m[1]) } : { kind: 'none' };
}

// Should the bar offer itself on this visit? Never after "Don't ask again".
function installShouldAsk(now) {
    const answer = installAnswer();
    if (answer.kind === 'never') return false;
    if (answer.kind === 'none') return true;
    if (answer.at === null) {
        installSnooze(now); // an old "Not now" with no date: the week starts today
        return false;
    }
    // A clock that has jumped backwards must not hide the bar for ever
    return Math.abs(now - answer.at) >= INSTALL_SNOOZE_MS;
}

function installSave(value) {
    try { localStorage.setItem(INSTALL_KEY, value); } catch (e) { /* storage blocked: it will ask again next visit */ }
}

function installSnooze(now) { installSave('later:' + Math.floor(now)); }
function installNever() { installSave('never'); }

const install = { platform: null, deferred: null, offered: false };

// The iOS share glyph, so the words match what is on the toolbar.
const INSTALL_SHARE_SVG = '<svg viewBox="0 0 20 24" aria-hidden="true" focusable="false"><path d="M10 15V2.5M5.5 6.5 10 2l4.5 4.5M5 10H3.5A1.5 1.5 0 0 0 2 11.500V20.500A1.500 1.500 0 0 0 3.500 22h13A1.500 1.500 0 0 0 18 20.500V11.500A1.500 1.500 0 0 0 16.500 10H15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function showInstallBar() {
    const bar = document.getElementById('installBar');
    const copy = installCopy(install.platform, !!install.deferred);
    if (!bar || !copy) return false;
    document.getElementById('installTitle').textContent = copy.title;
    const steps = document.getElementById('installSteps');
    steps.textContent = copy.steps;
    if (install.platform === 'ios') steps.innerHTML = copy.steps.replace('Tap Share,', 'Tap Share ' + INSTALL_SHARE_SVG + ',');
    const add = document.getElementById('installAdd');
    add.hidden = !copy.action;
    if (copy.action) add.textContent = copy.action;
    bar.hidden = false;
    return true;
}

function hideInstallBar() {
    const bar = document.getElementById('installBar');
    if (bar) bar.hidden = true;
}

// "Not now": away for a week.
function installNotNow() {
    installSnooze(Date.now());
    hideInstallBar();
}

// "Don't ask again": away for good.
function installStopAsking() {
    installNever();
    hideInstallBar();
}

// The browser's own install sheet. Only Android gives the page one.
async function installAsk() {
    const prompt = install.deferred;
    if (!prompt) return;
    install.deferred = null;
    prompt.prompt();
    let choice = null;
    try { choice = await prompt.userChoice; } catch (e) { /* closed without choosing */ }
    // Backing out of the browser's sheet is a "not now", not a "never"
    if (!choice || choice.outcome !== 'accepted') installSnooze(Date.now());
    hideInstallBar();
}

function installFinished() {
    install.platform = null;
    install.deferred = null;
    installNever(); // it is on the home screen; nothing left to ask
    hideInstallBar();
    const btn = document.getElementById('btnInstall');
    if (btn) btn.hidden = true;
}

function initInstall() {
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return;
    const bar = document.getElementById('installBar');
    const btn = document.getElementById('btnInstall');
    if (!bar || !btn) return;
    const standalone = navigator.standalone === true
        || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
    install.platform = installPlatform({ ua: navigator.userAgent, touchPoints: navigator.maxTouchPoints || 0, standalone });

    window.addEventListener('beforeinstallprompt', (e) => {
        install.offered = true; // the browser judged the page installable; handy when checking a release
        if (install.platform !== 'android') return;
        e.preventDefault();
        install.deferred = e;
        if (!bar.hidden) showInstallBar();
    });
    window.addEventListener('appinstalled', installFinished);
    document.getElementById('installAdd').addEventListener('click', installAsk);
    document.getElementById('installLater').addEventListener('click', installNotNow);
    document.getElementById('installNever').addEventListener('click', installStopAsking);
    btn.addEventListener('click', () => { if (bar.hidden) showInstallBar(); else hideInstallBar(); });

    if (!install.platform) return;
    btn.hidden = false;
    // Give the page a moment to settle, and the browser a moment to offer its prompt.
    if (installShouldAsk(Date.now())) setTimeout(() => { if (install.platform) showInstallBar(); }, 1500);
}

initInstall();
