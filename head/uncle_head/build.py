"""Run the whole head build, each step in its own process, and write report.json.

CLI: python -m uncle_head.build <video> <name>  -> head/builds/<name>/head.glb, report.json
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

HEAD = Path(__file__).resolve().parents[1]
STEPS = [
    ("frames", lambda video, work: ["uncle_head.frames", video, work]),
    ("cameras", lambda video, work: ["uncle_head.cameras", work]),
    ("landmarks", lambda video, work: ["uncle_head.landmarks3d", work]),
    ("assemble", lambda video, work: ["uncle_head.assemble", work, str(Path(work).parent)]),
]


def main(video, name) -> int:
    if not name.replace("-", "").replace("_", "").isalnum():
        print("Use letters, numbers, - or _ for the head's name.", file=sys.stderr)
        return 2
    out = HEAD / "builds" / name
    work = out / "work"
    if work.exists():
        shutil.rmtree(work)  # a rebuild never mixes in old frames or cameras
    work.mkdir(parents=True)
    report = {"name": name, "video": str(video), "steps": {}}
    start = time.time()
    for step, args in STEPS:
        t0 = time.time()
        proc = subprocess.run([sys.executable, "-m", *args(str(Path(video).resolve()), str(work))], cwd=HEAD, capture_output=True, text=True)
        report["steps"][step] = {"seconds": round(time.time() - t0, 1)}
        (work / f"{step}.log").write_text(proc.stdout + proc.stderr)
        if proc.returncode != 0:
            msg = proc.stderr.strip().splitlines()[-1] if proc.stderr.strip() else f"{step} failed"
            report["failed"] = {"step": step, "message": msg}
            (out / "report.json").write_text(json.dumps(report, indent=2))
            print(f"Build failed at {step}: {msg}\nFull log: {work / (step + '.log')}", file=sys.stderr)
            return 1
        print(proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else f"{step} done")
    for part in ("cameras_report.json", "assemble.json"):
        if (work / part).exists():
            report[part.split(".")[0].replace("_report", "")] = json.loads((work / part).read_text())
    lm = json.loads((work / "landmarks3d.json").read_text())
    frames = json.loads((work / "frames.json").read_text())
    report["frames"] = {"kept": len(frames["frames"]), "decoded": frames["decoded"], "face_views": sum(1 for f in frames["frames"] if f["landmarks"]), "size": [frames["width"], frames["height"]]}
    report["landmarks"] = {"heldout_px": lm["heldout_px"], "used_views": lm["used_views"]}
    report["total_seconds"] = round(time.time() - start, 1)
    (out / "report.json").write_text(json.dumps(report, indent=2))
    print(f"Built {out / 'head.glb'} in {report['total_seconds']} s. Open /xr/?head={name}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: head/build.sh <video> <name>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
