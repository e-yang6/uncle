#!/usr/bin/env bash
# Build a head from a video:  head/build.sh captures/<video> <name>
# Output: head/builds/<name>/head.glb and report.json. Run head/setup.sh once first.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
if [ ! -x "$here/.venv/bin/python" ]; then
  echo "Run head/setup.sh first." >&2
  exit 2
fi
if [ $# -ne 2 ] || [ ! -f "$1" ]; then
  echo "usage: head/build.sh <video file> <name>" >&2
  exit 2
fi
video="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
cd "$here"
exec .venv/bin/python -m uncle_head.build "$video" "$2"
