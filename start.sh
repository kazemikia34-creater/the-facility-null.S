#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
PORT="${PORT:-3000}"
BUILD_DIR="$PROJECT_DIR/.omgithub-runtime/dist"
DEPLOYMENT_FILE="/home/runner/work/_temp/omgithub-web/deployment-output.json"

run() {
  /usr/bin/time -p "$@"
}

run npm ci --no-audit --no-fund

HAS_BUILD="$(run node -e 'const p=require("./package.json"); process.stdout.write(p.scripts?.build ? "yes" : "no")')"
if [[ "$HAS_BUILD" == yes ]]; then
  run npm run build
  BUILD_DIR="$PROJECT_DIR/dist"
else
  run rm -rf "$BUILD_DIR"
  run mkdir -p "$BUILD_DIR"
  run cp -a index.html style.css src assets vendor "$BUILD_DIR/"
fi

[[ -f "$BUILD_DIR/index.html" ]] || { echo "Built static entry point not found: $BUILD_DIR/index.html" >&2; exit 1; }
run mkdir -p "$(dirname "$DEPLOYMENT_FILE")"
run env PROJECT_DIR="$PROJECT_DIR" BUILD_DIR="$BUILD_DIR" DEPLOYMENT_FILE="$DEPLOYMENT_FILE" node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const metadata = { project: process.env.PROJECT_DIR, directory: path.resolve(process.env.BUILD_DIR) };
  fs.writeFileSync(process.env.DEPLOYMENT_FILE, JSON.stringify(metadata) + "\n");
'

# Keep the static server in the foreground so the controller can monitor it.
run python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$BUILD_DIR"
