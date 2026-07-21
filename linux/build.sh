#!/usr/bin/env bash
# build.sh — Linux twin of ttyd-ui/build.ps1: assemble ttyd-index.html (psmux)
# and ttyd-index-screen.html (screen) from template.html + client.js + vendor.
# Uses python3 for literal string replacement (sed chokes on the minified JS).
set -eu
DIR="$(cd "$(dirname "$0")/../ttyd-ui" && pwd)"

python3 - "$DIR" <<'EOF'
import sys, pathlib
ui = pathlib.Path(sys.argv[1])
root = ui.parent
html = (ui / 'template.html').read_text(encoding='utf-8')
html = html.replace('@@XTERM_CSS@@', (ui / 'vendor' / 'xterm.min.css').read_text(encoding='utf-8'))
html = html.replace('@@XTERM_JS@@',  (ui / 'vendor' / 'xterm.min.js').read_text(encoding='utf-8'))
html = html.replace('@@FIT_JS@@',    (ui / 'vendor' / 'addon-fit.min.js').read_text(encoding='utf-8'))
html = html.replace('@@CLIENT_JS@@', (ui / 'client.js').read_text(encoding='utf-8'))
for mux, name in (('psmux', 'ttyd-index.html'), ('screen', 'ttyd-index-screen.html')):
    out = root / name
    out.write_text(html.replace('@@MUX@@', mux), encoding='utf-8')
    print(f'Built {out} ({out.stat().st_size // 1024} KB)')
EOF
