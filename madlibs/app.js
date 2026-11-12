// Blanks! — peer-to-peer fill-in-the-blank prototype.
// Serverless: round state travels inside share links as a base64 payload in the
// URL hash, so the whole loop (pick → blind fill → reveal) works from static hosting.

(function () {
    "use strict";

    const app = document.getElementById("app");

    // ---------- Payload codec (URL-safe base64 JSON) ----------

    function encodePayload(obj) {
        const bytes = new TextEncoder().encode(JSON.stringify(obj));
        let bin = "";
        bytes.forEach(function (b) { bin += String.fromCharCode(b); });
        return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    function decodePayload(str) {
        try {
            let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
            while (b64.length % 4) b64 += "=";
            const bin = atob(b64);
            const bytes = Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch (e) {
            return null;
        }
    }

    function linkFor(payload) {
        return location.origin + location.pathname + "#p=" + encodePayload(payload);
    }

    function getScript(id) {
        return SCRIPT_LIBRARY.find(function (s) { return s.id === id; }) || null;
    }

    // ---------- Rendering helpers ----------

    function esc(str) {
        return String(str)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    // Renders one script line. mode "slots" shows typed blanks; mode "filled"
    // drops answers in with highlighter marks.
    function renderLine(line, script, names, mode, answers) {
        return line.replace(/\{(\w+)\}/g, function (_, token) {
            if (token === "from") return "<strong>" + esc(names.from || "Player 1") + "</strong>";
            if (token === "to") return "<strong>" + esc(names.to || "Player 2") + "</strong>";
            const idx = parseInt(token, 10);
            if (isNaN(idx) || !script.blanks[idx]) return "";
            if (mode === "filled" && answers && answers[idx] !== undefined) {
                return '<span class="filled-word">' + esc(answers[idx]) + "</span>";
            }
            return '<span class="blank-slot">' + esc(script.blanks[idx].t) + "</span>";
        });
    }

    function scriptSheet(script, names, mode, answers, animate) {
        const lines = script.body.map(function (line, i) {
            const cls = animate ? ' class="reveal-line" style="animation-delay:' + (0.35 + i * 0.55) + 's"' : "";
            return "<p" + cls + ">" + renderLine(line, script, names, mode, answers) + "</p>";
        });
        return '<div class="script-sheet">' + lines.join("") + "</div>";
    }

    function masthead() {
        return '<header class="masthead">' +
            '<div class="logo" id="logoHome"><mark>Blanks</mark>!</div>' +
            '<span class="proto-tag">prototype</span>' +
            "</header>";
    }

    function setView(html) {
        app.innerHTML = html + '<div class="toast" id="toast" role="status"></div>';
        const logo = document.getElementById("logoHome");
        if (logo) logo.addEventListener("click", function () { go(null); });
        window.scrollTo(0, 0);
    }

    let toastTimer = null;
    function toast(msg) {
        const el = document.getElementById("toast");
        if (!el) return;
        el.textContent = msg;
        el.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
    }

    function shareOrCopy(url, title) {
        if (navigator.share) {
            navigator.share({ title: title, url: url }).catch(function () { /* user cancelled */ });
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(
                function () { toast("Link copied — paste it to your friend"); },
                function () { window.prompt("Copy this link:", url); }
            );
        } else {
            window.prompt("Copy this link:", url);
        }
    }

    // ---------- Screens ----------

    function viewHome() {
        const themes = [];
        SCRIPT_LIBRARY.forEach(function (s) {
            if (themes.indexOf(s.theme) === -1) themes.push(s.theme);
        });
        const groups = themes.map(function (theme) {
            const cards = SCRIPT_LIBRARY
                .filter(function (s) { return s.theme === theme; })
                .map(function (s) {
                    return '<button class="card" data-script="' + s.id + '">' +
                        '<span class="card-title">' + esc(s.title) + "</span>" +
                        '<span class="chip">' + s.blanks.length + " words</span>" +
                        "</button>";
                }).join("");
            return '<div class="theme-group"><div class="theme-label">' + esc(theme) + "</div>" + cards + "</div>";
        }).join("");

        setView(
            masthead() +
            '<h1 class="screen-title">Pick a script for a friend</h1>' +
            '<p class="screen-sub">They’ll fill in the words <em>without seeing it</em>. Then you both get the reveal.</p>' +
            groups +
            '<p class="footnote">Prototype — no ads, no accounts. Rounds travel inside share links.</p>'
        );

        app.querySelectorAll("[data-script]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                viewPreview(btn.getAttribute("data-script"));
            });
        });
    }

    function viewPreview(scriptId) {
        const script = getScript(scriptId);
        if (!script) return viewHome();
        const savedFrom = localStorage.getItem("blanks.name") || "";
        const savedTo = sessionStorage.getItem("blanks.lastTo") || "";

        setView(
            masthead() +
            '<h1 class="screen-title">' + esc(script.title) + "</h1>" +
            '<p class="screen-sub">' + esc(script.theme) + " · only you can see this preview</p>" +
            scriptSheet(script, { from: savedFrom || "you", to: savedTo || "your friend" }, "slots") +
            '<div class="field"><label for="fromName">Your name</label>' +
            '<input type="text" id="fromName" maxlength="20" autocomplete="given-name" value="' + esc(savedFrom) + '"></div>' +
            '<div class="field"><label for="toName">Friend’s name</label>' +
            '<input type="text" id="toName" maxlength="20" value="' + esc(savedTo) + '"></div>' +
            '<p class="form-error" id="formError"></p>' +
            '<div class="btn-row">' +
            '<button class="btn btn-primary" id="btnSend">Create fill link</button>' +
            '<button class="btn btn-secondary" id="btnBack">Pick a different script</button>' +
            "</div>"
        );

        document.getElementById("btnBack").addEventListener("click", function () { go(null); });
        document.getElementById("btnSend").addEventListener("click", function () {
            const from = document.getElementById("fromName").value.trim();
            const to = document.getElementById("toName").value.trim();
            if (!from || !to) {
                document.getElementById("formError").textContent = "Both names, please — the script stars you two.";
                return;
            }
            localStorage.setItem("blanks.name", from);
            sessionStorage.setItem("blanks.lastTo", to);
            viewShareFill(script, { from: from, to: to });
        });
    }

    function viewShareFill(script, names) {
        const url = linkFor({ v: 1, m: "fill", s: script.id, from: names.from, to: names.to });
        setView(
            masthead() +
            '<h1 class="screen-title">Send it to ' + esc(names.to) + "</h1>" +
            '<p class="screen-sub">They’ll answer ' + script.blanks.length +
            " word prompts — they never see the script. When they’re done, they send a reveal link back to you.</p>" +
            '<div class="card"><span style="word-break:break-all; font-size:0.85rem;">' + esc(url) + "</span></div>" +
            '<div class="btn-row">' +
            '<button class="btn btn-primary" id="btnShare">Share fill link</button>' +
            '<button class="btn btn-secondary" id="btnCopy">Copy link</button>' +
            '<button class="link-btn" id="btnHome">Back to scripts</button>' +
            "</div>"
        );
        document.getElementById("btnShare").addEventListener("click", function () {
            shareOrCopy(url, names.from + " needs " + script.blanks.length + " words from you!");
        });
        document.getElementById("btnCopy").addEventListener("click", function () {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(function () { toast("Copied!"); });
            } else {
                window.prompt("Copy this link:", url);
            }
        });
        document.getElementById("btnHome").addEventListener("click", function () { go(null); });
    }

    function viewFill(payload) {
        const script = getScript(payload.s);
        if (!script) return viewHome();
        const answers = [];
        let step = 0;

        function renderStep() {
            const blank = script.blanks[step];
            const dots = script.blanks.map(function (_, i) {
                const cls = i < step ? "done" : (i === step ? "now" : "");
                return "<span" + (cls ? ' class="' + cls + '"' : "") + "></span>";
            }).join("");

            setView(
                masthead() +
                '<h1 class="screen-title">' + esc(payload.from) + " needs your words, " + esc(payload.to) + "!</h1>" +
                '<p class="screen-sub">No peeking at the script — that’s the whole point. Answer honestly. Or don’t.</p>' +
                '<div class="progress-dots">' + dots + "</div>" +
                '<div class="prompt-card">' +
                '<span class="prompt-kicker">Word ' + (step + 1) + " of " + script.blanks.length + "</span>" +
                '<div class="prompt-type">Give me <mark>' + esc(blank.t) + "</mark></div>" +
                '<span class="prompt-hint">' + esc(blank.hint) + "</span>" +
                '<input type="text" id="wordInput" maxlength="30" autocomplete="off" autocapitalize="none" ' +
                'value="' + esc(answers[step] || "") + '" enterkeyhint="next">' +
                '<p class="form-error" id="formError"></p>' +
                "</div>" +
                '<div class="btn-row">' +
                '<button class="btn btn-primary" id="btnNext">' +
                (step === script.blanks.length - 1 ? "Lock in my answers" : "Next word") + "</button>" +
                (step > 0 ? '<button class="btn btn-secondary" id="btnPrev">Back</button>' : "") +
                "</div>"
            );

            const input = document.getElementById("wordInput");
            input.focus();
            function advance() {
                const val = input.value.trim();
                if (!val) {
                    document.getElementById("formError").textContent = "Gotta give me something!";
                    return;
                }
                answers[step] = val;
                if (step === script.blanks.length - 1) {
                    viewFillDone(script, payload, answers);
                } else {
                    step += 1;
                    renderStep();
                }
            }
            document.getElementById("btnNext").addEventListener("click", advance);
            input.addEventListener("keydown", function (e) {
                if (e.key === "Enter") advance();
            });
            const prev = document.getElementById("btnPrev");
            if (prev) prev.addEventListener("click", function () {
                answers[step] = input.value.trim();
                step -= 1;
                renderStep();
            });
        }

        renderStep();
    }

    function viewFillDone(script, payload, answers) {
        const url = linkFor({ v: 1, m: "reveal", s: script.id, from: payload.from, to: payload.to, a: answers });
        setView(
            masthead() +
            '<h1 class="screen-title">Done! 😈</h1>' +
            '<p class="screen-sub">Now send this reveal link back to ' + esc(payload.from) +
            ". In the real app they’d watch an ad to unlock what you did — here it’s a pretend one.</p>" +
            '<div class="card"><span style="word-break:break-all; font-size:0.85rem;">' + esc(url) + "</span></div>" +
            '<div class="btn-row">' +
            '<button class="btn btn-primary" id="btnShare">Send reveal link to ' + esc(payload.from) + "</button>" +
            '<button class="btn btn-secondary" id="btnCopy">Copy link</button>' +
            '<button class="link-btn" id="btnRevenge">Make one for ' + esc(payload.from) + " →</button>" +
            "</div>" +
            '<p class="footnote">You can open the reveal link too — after they’ve had their laugh.</p>'
        );
        document.getElementById("btnShare").addEventListener("click", function () {
            shareOrCopy(url, payload.to + " filled in your blanks!");
        });
        document.getElementById("btnCopy").addEventListener("click", function () {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(function () { toast("Copied!"); });
            } else {
                window.prompt("Copy this link:", url);
            }
        });
        document.getElementById("btnRevenge").addEventListener("click", function () {
            localStorage.setItem("blanks.name", payload.to);
            sessionStorage.setItem("blanks.lastTo", payload.from);
            go(null);
        });
    }

    function viewRevealGate(payload) {
        const script = getScript(payload.s);
        if (!script || !Array.isArray(payload.a)) return viewHome();
        setView(
            masthead() +
            '<h1 class="screen-title">' + esc(payload.to) + " filled in your words 🎉</h1>" +
            '<p class="screen-sub">“' + esc(script.title) + "” · " + esc(script.theme) + "</p>" +
            '<div class="ad-box">' +
            '<span class="ad-label">Pretend ad break</span>' +
            '<div class="ad-count" id="adCount">🎬</div>' +
            '<p class="screen-sub">The real app gates the reveal behind a rewarded ad.<br>The prototype just makes you wait 5 seconds.</p>' +
            "</div>" +
            '<div class="btn-row"><button class="btn btn-primary" id="btnWatch">Watch ad to reveal</button></div>'
        );
        document.getElementById("btnWatch").addEventListener("click", function () {
            const btn = document.getElementById("btnWatch");
            btn.disabled = true;
            let n = 5;
            const count = document.getElementById("adCount");
            count.textContent = n;
            const timer = setInterval(function () {
                n -= 1;
                if (n <= 0) {
                    clearInterval(timer);
                    viewReveal(script, payload);
                } else {
                    count.textContent = n;
                }
            }, 1000);
        });
    }

    function viewReveal(script, payload) {
        const names = { from: payload.from, to: payload.to };
        setView(
            masthead() +
            '<h1 class="screen-title">' + esc(script.title) + "</h1>" +
            '<p class="screen-sub">starring ' + esc(payload.to) + "’s answers, chosen completely blind</p>" +
            scriptSheet(script, names, "filled", payload.a, true) +
            '<div class="laugh-row" id="laughRow" aria-label="Rate the laugh">' +
            ["😐", "🙂", "😄", "🤣", "💀"].map(function (e, i) {
                return '<button data-rate="' + (i + 1) + '" aria-label="Rate ' + (i + 1) + ' of 5">' + e + "</button>";
            }).join("") +
            "</div>" +
            '<div class="btn-row">' +
            '<button class="btn btn-primary" id="btnAgain">Send ' + esc(payload.to) + " another one</button>" +
            '<button class="btn btn-secondary" id="btnCopyText">Copy the script</button>' +
            '<button class="link-btn" id="btnFresh">Start fresh</button>' +
            "</div>"
        );

        document.getElementById("laughRow").addEventListener("click", function (e) {
            const btn = e.target.closest("button[data-rate]");
            if (!btn) return;
            app.querySelectorAll("#laughRow button").forEach(function (b) { b.classList.remove("picked"); });
            btn.classList.add("picked");
            toast("Noted — the laugh meter feeds script ratings in the real app");
        });

        document.getElementById("btnAgain").addEventListener("click", function () {
            localStorage.setItem("blanks.name", payload.from);
            sessionStorage.setItem("blanks.lastTo", payload.to);
            go(null);
        });
        document.getElementById("btnFresh").addEventListener("click", function () {
            sessionStorage.removeItem("blanks.lastTo");
            go(null);
        });
        document.getElementById("btnCopyText").addEventListener("click", function () {
            const plain = script.body.map(function (line) {
                return line.replace(/\{(\w+)\}/g, function (_, token) {
                    if (token === "from") return payload.from;
                    if (token === "to") return payload.to;
                    const idx = parseInt(token, 10);
                    return payload.a[idx] !== undefined ? payload.a[idx].toUpperCase() : "____";
                });
            }).join("\n");
            const text = script.title + "\n\n" + plain + "\n\n— " + payload.to +
                "’s words, " + payload.from + "’s script. Made with Blanks!";
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () { toast("Script copied!"); });
            } else {
                window.prompt("Copy the script:", text);
            }
        });
    }

    // ---------- Router ----------

    function go(hash) {
        if (hash === null) {
            history.replaceState(null, "", location.pathname);
            route();
            return;
        }
        location.hash = hash;
    }

    function route() {
        const match = location.hash.match(/^#p=([A-Za-z0-9_-]+)$/);
        const payload = match ? decodePayload(match[1]) : null;
        if (payload && payload.m === "fill" && payload.s) {
            viewFill(payload);
        } else if (payload && payload.m === "reveal" && payload.s) {
            viewRevealGate(payload);
        } else {
            viewHome();
        }
    }

    window.addEventListener("hashchange", route);
    route();
})();
