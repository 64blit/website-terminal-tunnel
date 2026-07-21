/* Custom ttyd client with a psmux key toolbar for mobile.
   Speaks ttyd's websocket protocol directly:
     client -> server: raw JSON auth on open, then '0'+input, '1'+resize-JSON
     server -> client: '0'+output, '1'+window-title, '2'+preferences-JSON
   Served via `ttyd -I ttyd-index.html` — rebuild with ttyd-ui\build.ps1 after editing. */
(function () {
    'use strict';

    var FONT_KEY = 'ttyd_font_size';
    var savedFont = parseInt(localStorage.getItem(FONT_KEY), 10);
    var fontOverride = !isNaN(savedFont);

    var term = new Terminal({
        fontSize: fontOverride ? savedFont : 15,
        fontFamily: 'Consolas, "Cascadia Mono", Menlo, monospace',
        cursorBlink: true,
        scrollback: 20000,
        theme: { background: '#000000' }
    });
    var fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(document.getElementById('term'));

    var enc = new TextEncoder();
    var dec = new TextDecoder();
    var socket = null;
    var reconnectPending = false;
    var statusEl = document.getElementById('status');
    var basePath = location.pathname.replace(/[^/]*$/, '');

    function setStatus(text) {
        statusEl.textContent = text;
        statusEl.style.display = text ? 'block' : 'none';
    }

    function sendInput(data) {
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(enc.encode('0' + data));
    }

    /* xterm onBinary delivers a string of raw bytes (charCode <= 255) */
    function sendBinary(data) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        var buf = new Uint8Array(data.length + 1);
        buf[0] = 48; /* '0' */
        for (var i = 0; i < data.length; i++) buf[i + 1] = data.charCodeAt(i) & 255;
        socket.send(buf);
    }

    function sendResize() {
        if (socket && socket.readyState === WebSocket.OPEN)
            socket.send(enc.encode('1' + JSON.stringify({ columns: term.cols, rows: term.rows })));
    }

    function connect() {
        setStatus('connecting…');
        fetch(basePath + 'token', { cache: 'no-cache' })
            .then(function (r) { return r.json(); })
            .catch(function () { return { token: '' }; })
            .then(function (data) {
                var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
                var ws = new WebSocket(proto + location.host + basePath + 'ws' + location.search, ['tty']);
                ws.binaryType = 'arraybuffer';
                socket = ws;

                ws.onopen = function () {
                    setStatus('');
                    scrollMode = false; scrollOffset = 0; /* fresh attach = live view */
                    ws.send(enc.encode(JSON.stringify({
                        AuthToken: (data && data.token) || '',
                        columns: term.cols,
                        rows: term.rows
                    })));
                    fit.fit();
                    sendResize();
                };

                ws.onmessage = function (ev) {
                    var raw = new Uint8Array(ev.data);
                    var cmd = String.fromCharCode(raw[0]);
                    var payload = raw.subarray(1);
                    if (cmd === '0') {
                        term.write(payload);
                    } else if (cmd === '1') {
                        document.title = dec.decode(payload);
                    } else if (cmd === '2') {
                        try {
                            var prefs = JSON.parse(dec.decode(payload));
                            if ('cursorBlink' in prefs) term.options.cursorBlink = prefs.cursorBlink;
                            if ('scrollback' in prefs) term.options.scrollback = prefs.scrollback;
                            if ('fontSize' in prefs && !fontOverride) term.options.fontSize = prefs.fontSize;
                            fit.fit();
                        } catch (e) { }
                    }
                };

                ws.onclose = function () {
                    if (socket === ws) socket = null;
                    if (reconnectPending) return;
                    reconnectPending = true;
                    setStatus('disconnected — reconnecting…');
                    setTimeout(function () { reconnectPending = false; connect(); }, 2000);
                };
            });
    }

    /* --- sticky Ctrl: press the Ctrl button, then any key on the mobile keyboard --- */
    var ctrlBtn = null;
    var ctrlSticky = false;
    function setSticky(on) {
        ctrlSticky = on;
        if (ctrlBtn) ctrlBtn.classList.toggle('active', on);
    }
    function toggleCtrl() { setSticky(!ctrlSticky); }
    function applySticky(data) {
        if (!ctrlSticky || data.length !== 1) return data;
        setSticky(false);
        if (data === ' ') return '\x00';
        var c = data.toUpperCase().charCodeAt(0);
        if (c >= 64 && c < 96) return String.fromCharCode(c - 64); /* @, A-Z, [\]^_ */
        return data;
    }

    term.onData(function (d) { d = applySticky(d); trackInput(d); sendInput(d); });
    term.onBinary(sendBinary);
    term.onResize(sendResize);

    /* OSC 52: if psmux copy-mode yank forwards the buffer, mirror it to the device clipboard */
    term.parser.registerOscHandler(52, function (data) {
        var idx = data.indexOf(';');
        if (idx >= 0) {
            try {
                var bytes = Uint8Array.from(atob(data.slice(idx + 1)), function (ch) { return ch.charCodeAt(0); });
                navigator.clipboard.writeText(dec.decode(bytes)).catch(function () { });
            } catch (e) { }
        }
        return true;
    });

    /* arrows must honor DECCKM (vim, less, etc. switch to application cursor keys) */
    function arrowSeq(ch) {
        var app = false;
        try { app = !!term.modes.applicationCursorKeysMode; } catch (e) { }
        return (app ? '\x1bO' : '\x1b[') + ch;
    }

    function setFont(sz) {
        sz = Math.max(8, Math.min(28, sz));
        fontOverride = true;
        localStorage.setItem(FONT_KEY, sz);
        term.options.fontSize = sz;
        fit.fit();
    }
    function fontUp() { setFont(term.options.fontSize + 1); }
    function fontDown() { setFont(term.options.fontSize - 1); }

    function flash(btn, text) {
        var old = btn.textContent;
        btn.textContent = text;
        setTimeout(function () { btn.textContent = old; }, 800);
    }
    function doCopy(btn) {
        var sel = term.getSelection();
        if (!sel) { flash(btn, 'select!'); return; }
        navigator.clipboard.writeText(sel).then(
            function () { flash(btn, '✓'); },
            function () { flash(btn, '✗'); }
        );
    }
    function promptPaste() {
        var t = window.prompt('Paste text:');
        if (t) term.paste(t);
    }
    function doPaste() {
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(
                function (t) { if (t) term.paste(t); term.focus(); },
                function () { promptPaste(); }
            );
        } else {
            promptPaste();
        }
    }

    /* One client, two multiplexers — window.TTYD_MUX is stamped by the build:
       psmux (Windows): prefix Ctrl+B, copy-mode exits with q.
       GNU screen (Linux): prefix Ctrl+A, copy-mode exits with Esc. */
    var SCREEN = (window.TTYD_MUX === 'screen');
    var P = SCREEN ? '\x01' : '\x02';
    var COPY_EXIT = SCREEN ? '\x1b' : 'q';

    /* --- wheel / touch scrolling bridged to psmux copy-mode ---
       psmux keeps the terminal in the alternate buffer and owns its scrollback, so
       xterm's own viewport never has history to scroll (and ConPTY on Win10 drops VT
       mouse events, so psmux's `mouse on` can't help — psmux/psmux#360). Instead:
       scroll up enters copy-mode (prefix+[) and sends Up arrows; scroll down sends
       Down arrows and auto-exits ('q') once we're back at the live bottom. */
    var scrollMode = false;   /* our belief: psmux copy-mode is active */
    var scrollOffset = 0;     /* approx lines scrolled above the live bottom */

    /* input that enters/leaves copy-mode by other routes (Scroll button, typed q/Esc,
       Enter/y yank-exit) keeps the flag honest */
    function trackInput(d) {
        if (d.indexOf(P + '[') !== -1) { scrollMode = true; scrollOffset = 0; }
        else if (scrollMode && (SCREEN
            ? (d === '\x1b' || d === '\r')
            : (d === 'q' || d === '\x1b' || d === '\r' || d === 'y' || d === '\x03'))) {
            scrollMode = false; scrollOffset = 0;
        }
    }

    function cellPx() {
        try {
            var h = term._core._renderService.dimensions.css.cell.height;
            if (h > 0) return h;
        } catch (e) { }
        return term.options.fontSize * 1.4;
    }

    /* n > 0 scrolls up into history, n < 0 back down toward live */
    function scrollLines(n) {
        var seq = '';
        if (n > 0) {
            if (!scrollMode) { scrollMode = true; scrollOffset = 0; sendInput(P + '['); }
            n = Math.min(n, 120);
            scrollOffset += n;
            while (n-- > 0) seq += arrowSeq('A');
            sendInput(seq);
        } else if (n < 0 && scrollMode) {
            n = Math.min(-n, 120);
            while (n-- > 0 && scrollOffset > 0) { scrollOffset--; seq += arrowSeq('B'); }
            if (seq) sendInput(seq);
            if (scrollOffset <= 0) { scrollMode = false; scrollOffset = 0; sendInput(COPY_EXIT); }
        }
    }

    var wheelRem = 0;
    /* NOTE: no alternate-buffer check — ConPTY repaints psmux on the NORMAL buffer
       (verified: no ?1049h ever reaches the browser), so xterm's own scrollback is
       always empty and the bridge must handle every scroll. */
    term.attachCustomWheelEventHandler(function (ev) {
        if (ev.ctrlKey) return true; /* pinch/ctrl zoom */
        /* an app (vim, htop) turned on mouse tracking: let xterm report the wheel to it.
           Never happens through Win10 ConPTY, but works on Linux ptys. */
        try { if (term.modes.mouseTrackingMode !== 'none') return true; } catch (e) { }
        var px = ev.deltaY;
        if (ev.deltaMode === 1) px *= cellPx();
        else if (ev.deltaMode === 2) px *= term.rows * cellPx();
        wheelRem += px;
        var lines = (wheelRem / cellPx()) | 0;
        if (lines) { wheelRem -= lines * cellPx(); scrollLines(-lines); }
        ev.preventDefault();
        return false;
    });

    /* touch drag scrolls like a web page (finger down = older history), with a fling */
    var termEl = document.getElementById('term');
    var tY = null, tMoved = false, tRem = 0, tVel = 0, tLast = 0, flingTimer = null;
    termEl.addEventListener('touchstart', function (e) {
        if (flingTimer) { cancelAnimationFrame(flingTimer); flingTimer = null; }
        if (e.touches.length === 1) {
            tY = e.touches[0].clientY; tMoved = false; tRem = 0; tVel = 0; tLast = e.timeStamp;
        } else tY = null;
    }, { capture: true, passive: true });
    termEl.addEventListener('touchmove', function (e) {
        if (tY === null || e.touches.length !== 1) return;
        var y = e.touches[0].clientY;
        var dy = y - tY;
        tY = y;
        tRem += dy;
        var dt = e.timeStamp - tLast; tLast = e.timeStamp;
        if (dt > 0) tVel = 0.8 * tVel + 0.2 * (dy / dt);
        if (!tMoved && Math.abs(tRem) < 6) return; /* still just a tap */
        tMoved = true;
        e.preventDefault();  /* keep the browser/xterm from also reacting to the drag */
        e.stopPropagation();
        var lines = (tRem / cellPx()) | 0;
        if (lines) { tRem -= lines * cellPx(); scrollLines(lines); }
    }, { capture: true, passive: false });
    termEl.addEventListener('touchend', function () {
        if (tY === null) return;
        tY = null;
        if (!tMoved) return;
        var v = tVel * 16; /* px per ~frame */
        var rem = 0;
        function step() {
            v *= 0.94;
            if (Math.abs(v) < 1) { flingTimer = null; return; }
            rem += v;
            var lines = (rem / cellPx()) | 0;
            if (lines) { rem -= lines * cellPx(); scrollLines(lines); }
            flingTimer = requestAnimationFrame(step);
        }
        flingTimer = requestAnimationFrame(step);
    }, { capture: true, passive: true });
    termEl.addEventListener('touchcancel', function () { tY = null; }, { capture: true, passive: true });

    /* create a session via the psmux command prompt (prefix+: opens it, \r runs it) */
    function newSession() {
        var name = window.prompt('New session name (blank = auto):');
        if (name === null) return; /* cancelled */
        name = name.trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
        var cmd = name ? 'new-session -s ' + name : 'new-session';
        sendInput(P + ':' + cmd + '\r');
        term.focus();
    }
    var ROWS = [
        SCREEN ? [
            { label: 'Win ▶', seq: P + 'n', title: 'Next window' },
            { label: '◀ Win', seq: P + 'p', title: 'Previous window' },
            { label: '+ Win', seq: P + 'c', title: 'New window' },
            { label: 'Windows', seq: P + '"', title: 'Window chooser' },
            { label: 'Rename', seq: P + 'A', title: 'Rename window (type name, Enter)' },
            { label: 'Cmd :', seq: P + ':', title: 'screen command prompt' },
            { label: 'Scroll', seq: P + '[', title: 'Copy/scroll mode (Esc to exit)' },
            { label: 'A−', action: fontDown, title: 'Smaller font' },
            { label: 'A+', action: fontUp, title: 'Larger font' }
        ] : [
            { label: 'Win ▶', seq: P + 'n', title: 'Next window' },
            { label: '◀ Win', seq: P + 'p', title: 'Previous window' },
            { label: '+ Win', seq: P + 'c', title: 'New window' },
            { label: 'Sess ▶', seq: P + ')', title: 'Next session' },
            { label: '◀ Sess', seq: P + '(', title: 'Previous session' },
            { label: 'Sessions', seq: P + 's', title: 'Session chooser' },
            { label: '+ Sess', action: newSession, title: 'New session (asks for a name)' },
            { label: 'Rename', seq: P + '$', title: 'Rename session (type name, Enter)' },
            { label: 'Cmd :', seq: P + ':', title: 'psmux command prompt' },
            { label: 'Scroll', seq: P + '[', title: 'Copy/scroll mode (q to exit)' },
            { label: 'A−', action: fontDown, title: 'Smaller font' },
            { label: 'A+', action: fontUp, title: 'Larger font' }
        ],
        [
            { label: 'Esc', seq: '\x1b' },
            { label: 'Tab', seq: '\t' },
            { label: 'Ctrl', action: toggleCtrl, sticky: true, title: 'Ctrl + next typed key' },
            { label: '^C', seq: '\x03', title: 'Interrupt' },
            /* under screen a literal Ctrl+A must be sent as prefix+a */
            SCREEN ? { label: '^A', seq: P + 'a', title: 'Literal Ctrl+A' } : { label: '^A', seq: '\x01' },
            { label: '↑', arrow: 'A' },
            { label: '↓', arrow: 'B' },
            { label: '←', arrow: 'D' },
            { label: '→', arrow: 'C' },
            { label: '⏎', seq: '\r', title: 'Enter' },
            { label: 'Copy', action: doCopy, title: 'Copy selection' },
            { label: 'Paste', action: doPaste },
            { label: '⌨', action: function () { term.focus(); }, title: 'Show keyboard' }
        ]
    ];

    var toolbar = document.getElementById('toolbar');
    ROWS.forEach(function (row) {
        var rowEl = document.createElement('div');
        rowEl.className = 'btn-row';
        row.forEach(function (spec) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = spec.label;
            if (spec.title) b.title = spec.title;
            if (spec.sticky) ctrlBtn = b;
            var act = function () {
                if (spec.action) spec.action(b);
                else if (spec.arrow) sendInput(arrowSeq(spec.arrow));
                else if (spec.seq) { trackInput(spec.seq); sendInput(spec.seq); }
            };
            /* touchstart/mousedown preventDefault keeps focus on the terminal so the
               mobile keyboard stays open while tapping buttons */
            b.addEventListener('touchstart', function (e) { e.preventDefault(); act(); }, { passive: false });
            b.addEventListener('mousedown', function (e) { e.preventDefault(); });
            b.addEventListener('click', function () { act(); });
            rowEl.appendChild(b);
        });
        toolbar.appendChild(rowEl);
    });

    /* keep the toolbar above the mobile keyboard: size #app to the visual viewport */
    var app = document.getElementById('app');
    var refitTimer = null;
    function refit() {
        clearTimeout(refitTimer);
        refitTimer = setTimeout(function () { fit.fit(); }, 60);
    }
    function syncViewport() {
        if (window.visualViewport) {
            app.style.height = window.visualViewport.height + 'px';
            window.scrollTo(0, 0);
        }
        refit();
    }
    window.addEventListener('resize', syncViewport);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', syncViewport);
    syncViewport();

    connect();
})();
