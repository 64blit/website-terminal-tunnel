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

    term.onData(function (d) { sendInput(applySticky(d)); });
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

    var P = '\x02'; /* Ctrl+B — psmux prefix */
    var ROWS = [
        [
            { label: 'Win ▶', seq: P + 'n', title: 'Next window' },
            { label: '◀ Win', seq: P + 'p', title: 'Previous window' },
            { label: 'Sessions', seq: P + 's', title: 'Session chooser' },
            { label: 'Rename', seq: P + '$', title: 'Rename session (type name, Enter)' },
            { label: 'Cmd :', seq: P + ':', title: 'psmux command prompt' },
            { label: 'New Win', seq: P + 'c', title: 'New window' },
            { label: 'Scroll', seq: P + '[', title: 'Copy/scroll mode (q to exit)' },
            { label: 'A−', action: fontDown, title: 'Smaller font' },
            { label: 'A+', action: fontUp, title: 'Larger font' }
        ],
        [
            { label: 'Esc', seq: '\x1b' },
            { label: 'Tab', seq: '\t' },
            { label: 'Ctrl', action: toggleCtrl, sticky: true, title: 'Ctrl + next typed key' },
            { label: '^C', seq: '\x03', title: 'Interrupt' },
            { label: '^A', seq: '\x01' },
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
                else if (spec.seq) sendInput(spec.seq);
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
