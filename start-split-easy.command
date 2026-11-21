#!/bin/bash
# Split Easy launcher. Works from the project folder OR when copied to ~/Desktop.
# Serves the production build on http://localhost:8840 and opens it. Never kills anything.
set -euo pipefail
PROJECT_DIR="/Users/kevindumas/Projects/split-easy"
if [ ! -f "$PROJECT_DIR/package.json" ]; then           # project moved? try the script's own folder
  PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi
[ -f "$PROJECT_DIR/package.json" ] || { echo "Can't find the Split Easy project."; read -r -p "Press Enter to close"; exit 1; }
cd "$PROJECT_DIR"
PORT=8840; URL="http://localhost:$PORT/"
command -v npm >/dev/null || { echo "Node.js/npm not found. Install Node first."; read -r -p "Press Enter"; exit 1; }
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  if curl -fsS "$URL" | grep -q "<title>Split Easy"; then
    echo "Split Easy is already running. Opening $URL"
    open "$URL"; exit 0
  fi
  echo "Port $PORT is being used by another app. Split Easy won't touch it."; read -r -p "Press Enter"; exit 1
fi
[ -d node_modules ] || npm install
if [ ! -f dist/index.html ] || [ -n "$(find src public index.html vite.config.ts -newer dist/index.html -print -quit)" ]; then
  npm run build
fi
( for _ in $(seq 1 40); do curl -fsS "$URL" >/dev/null 2>&1 && { open "$URL"; break; }; sleep 0.25; done ) &
echo "Split Easy is running at $URL. Close this window (or press Ctrl+C) to stop."
exec npx vite preview --port $PORT --strictPort --host localhost
