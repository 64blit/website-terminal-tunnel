#!/usr/bin/env bash
# start-web-terminal.sh — Linux twin of start_web_terminal.ps1:
# ttyd (web terminal) -> persistent GNU screen session "main".
# Binds ttyd to 127.0.0.1 ONLY — expose it to the internet through a
# Cloudflare tunnel + Access allowlist (see README), never directly.
# Runs ttyd in a keep-alive loop; run it from the web-terminal.service
# systemd unit (or nohup) and it restarts ttyd whenever it exits.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$DIR")"
PORT="${PORT:-7681}"

# Single-instance guard (same job as the Windows script's process check):
# a second copy exits immediately so a watchdog/timer can fire freely.
exec 8>"${TMPDIR:-/tmp}/web-terminal-launcher.lock"
flock -n 8 || exit 0

# Same nested-launch traps as Windows: if this is ever (re)started from
# inside a Claude session or a screen/tmux pane, the children inherit env
# vars that break transcript saving or make attaching refuse to nest.
for v in $(compgen -e | grep '^CLAUDE' || true); do
    [ "$v" = "CLAUDE_CONFIG_DIR" ] || unset "$v"
done
unset STY WINDOW TMUX TMUX_PANE 2>/dev/null || true

# Custom client page (mobile key toolbar, browser scrolling bridged to
# screen's copy-mode). ttyd exits at startup if the -I file is missing,
# which would turn the keep-alive loop into a busy spin — only pass -I
# when the file exists; otherwise serve ttyd's built-in page.
INDEX="$REPO/ttyd-index-screen.html"
INDEX_ARGS=()
[ -f "$INDEX" ] && INDEX_ARGS=(-I "$INDEX")

# Keep-alive: relaunch ttyd if it ever exits. Each browser connection runs
# attach-main.sh -> multi-attaches to the SAME screen session (refresh-safe,
# several devices can watch the same terminal at once).
while :; do
    ttyd -p "$PORT" -i 127.0.0.1 -W -t fontSize=15 -t cursorBlink=true \
         -t disableLeaveAlert=true -t scrollback=20000 \
         "${INDEX_ARGS[@]}" "$DIR/attach-main.sh"
    sleep 2
done
