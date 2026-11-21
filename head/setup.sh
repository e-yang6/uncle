#!/usr/bin/env bash
# One-time setup for the head build (macOS, Apple Silicon).
# Makes head/.venv with Python 3.11 and downloads the CC0 template, its targets and the
# MediaPipe models into head/models/ (ignored by git). Safe to run again: skips what's there.
set -euo pipefail
cd "$(dirname "$0")"

PY=/opt/homebrew/opt/python@3.11/bin/python3.11
if [ ! -x "$PY" ]; then
  brew install python@3.11
fi
if [ ! -x .venv/bin/python ]; then
  "$PY" -m venv .venv
fi
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt

mkdir -p models
get() { # url dest
  if [ ! -s "$2" ]; then
    mkdir -p "$(dirname "$2")"
    curl -fsSL "$1" -o "$2.part" && mv "$2.part" "$2"
  fi
}

# MakeHuman hm08 base mesh and targets, CC0, via naver/anny (see models/LICENSE.md).
ANNY=https://raw.githubusercontent.com/naver/anny/main/src/anny/data/mpfb2
get "$ANNY/3dobjs/base.obj" models/base.obj
get "$ANNY/LICENSE.md" models/LICENSE.md
for t in mouth-open mouth-retraction mouth-corner-puller mouth-pursing mouth-protusion eye-left-closure eye-right-closure; do
  get "$ANNY/targets/expression/units/caucasian/$t.target.gz" "models/targets/expression/units/caucasian/$t.target.gz"
done
for s in male female; do
  for a in young old; do
    get "$ANNY/targets/macrodetails/caucasian-$s-$a.target.gz" "models/targets/macrodetails/caucasian-$s-$a.target.gz"
  done
done

# MediaPipe models (Apache-2.0).
MP=https://storage.googleapis.com/mediapipe-models
get "$MP/face_landmarker/face_landmarker/float16/latest/face_landmarker.task" models/face_landmarker.task
get "$MP/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite" models/selfie_multiclass_256x256.tflite

echo "head setup done"
