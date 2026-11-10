// Offers to put the game on the home screen of a phone or tablet.
// Android browsers hand the page an install prompt it can show on a tap. iOS has
// nothing like that, so there the bar just names the two taps. It shows once;
// "Not now" is remembered, and the Home screen button brings it back.

const INSTALL_KEY = 'ben-vacuum-game.install.v1';

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

function installDismissed() {
    try { return localStorage.getItem(INSTALL_KEY) === 'dismissed'; } catch (e) { return false; }
}

function installRemember() {
    try { localStorage.setItem(INSTALL_KEY, 'dismissed'); } catch (e) { /* private mode: ask again next time */ }
}

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
    document.getElementById('installLater').textContent = copy.action ? 'Not now' : 'Got it';
    bar.hidden = false;
    return true;
}

function hideInstallBar(remember) {
    const bar = document.getElementById('installBar');
    if (bar) bar.hidden = true;
    if (remember) installRemember();
}

// The browser's own install sheet. Only Android gives the page one.
async function installAsk() {
    const prompt = install.deferred;
    if (!prompt) return;
    install.deferred = null;
    prompt.prompt();
    try { await prompt.userChoice; } catch (e) { /* closed without choosing */ }
    hideInstallBar(true);
}

function installFinished() {
    install.platform = null;
    install.deferred = null;
    hideInstallBar(true);
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
    document.getElementById('installLater').addEventListener('click', () => hideInstallBar(true));
    btn.addEventListener('click', () => { if (bar.hidden) showInstallBar(); else hideInstallBar(false); });

    if (!install.platform) return;
    btn.hidden = false;
    // Give the page a moment to settle, and the browser a moment to offer its prompt.
    if (!installDismissed()) setTimeout(() => { if (install.platform) showInstallBar(); }, 1500);
}

initInstall();
