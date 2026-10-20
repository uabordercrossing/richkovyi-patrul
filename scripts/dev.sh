#!/usr/bin/env bash
# Starts the full local dev stack: Firebase emulators + Worker (wrangler dev) + static game server.
# Requires: Java 21+ on PATH (or set JDK21_HOME below), Node 22+ via nvm.
set -e
cd "$(dirname "$0")/.."

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null

if [ -x "$HOME/.local-jdk/jdk-21.0.12.1+1/Contents/Home/bin/java" ]; then
  export JAVA_HOME="$HOME/.local-jdk/jdk-21.0.12.1+1/Contents/Home"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT INT TERM

npx --yes firebase-tools emulators:start --only firestore,auth --project richkovyi-patrul &
pids+=($!)

(cd worker && npx wrangler dev) &
pids+=($!)

python3 -m http.server 8123 &
pids+=($!)

echo "Game:      http://localhost:8123"
echo "Worker:    http://localhost:8787"
echo "Emulators: http://localhost:4000"
wait
