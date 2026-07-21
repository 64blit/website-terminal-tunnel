#!/usr/bin/env bash
# attach-main.sh — run by ttyd for every browser connection.
# Create the persistent screen session "main" if it's gone, then multi-attach
# (-x) so every open browser tab shares the same live terminal, like
# `psmux new-session -A` does on the Windows side.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"

# flock: two tabs connecting at the same instant must not BOTH create a
# session named "main" (screen happily makes duplicates; -x then errors
# out with an ambiguous match).
exec 9>"${TMPDIR:-/tmp}/web-terminal-screen.lock"
flock 9
if ! screen -S main -X select . >/dev/null 2>&1; then
    screen -c "$DIR/screenrc" -dmS main
fi
flock -u 9

exec screen -x -S main
