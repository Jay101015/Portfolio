"""Put files sent from the studio into the repo, and bring the transcription back.

claude.ai has no GitHub connector, so the studio cannot commit by itself. It stores the files in its own page storage
(as base64 or plain text), writes a job that lists them, and starts a Claude Code session that fetches them and runs:

    python -m pipeline.courier place JOB.json FETCHED_DIR    # write the files, commit, push; prints the commit
    python -m pipeline.courier wait JOB.json RESULT.json     # wait for the transcription; writes the job's answer

A job (the studio's document, as JSON):

    {"message": "Studio: voice for ...", "branch": "claude/video-pipeline",
     "files": [{"path": "video-pipeline/projects/x/studio-recording.m4a", "encoding": "base64", "assets": ["<id>", ...]},
               {"path": "video-pipeline/projects/x/draft.md", "encoding": "text", "inline": "# ..."},
               {"path": "video-pipeline/projects/x/media/sources.txt", "encoding": "text", "inline": "...", "mode": "append-lines"}],
     "wait": {"file": "video-pipeline/projects/x/draft.md", "request": "r123", "timing": "video-pipeline/projects/x/timing.json"}}

Each asset id is fetched into FETCHED_DIR as <id>.<ext>; an entry's assets are joined in order before decoding.
"""
from __future__ import annotations

import argparse
import base64
import glob
import json
import os
import subprocess
import sys
import time

ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip() or os.getcwd()


def load_job(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        job = json.load(f)
    # an ArtifactData read saves the document's fields, sometimes wrapped
    for key in ("data", "fields", "document"):
        if isinstance(job.get(key), dict) and "files" in job[key]:
            job = job[key]
    if "files" not in job:
        raise SystemExit(f"{path} is not a studio job (no files)")
    return job


def _asset_text(fetched: str, asset_id: str) -> str:
    hits = sorted(glob.glob(os.path.join(fetched, "**", asset_id + "*"), recursive=True))
    if not hits:
        raise SystemExit(f"asset {asset_id} was not fetched into {fetched}")
    with open(hits[0], encoding="utf-8") as f:
        return f.read()


def entry_bytes(entry: dict, fetched: str) -> bytes:
    if "inline" in entry and not entry.get("assets"):
        text = entry["inline"]
    else:
        text = "".join(_asset_text(fetched, a) for a in entry.get("assets", []))
    if entry.get("encoding") == "base64":
        return base64.b64decode("".join(text.split()))
    return text.encode("utf-8")


PROJECTS = os.path.join("video-pipeline", "projects")


def _safe(path: str) -> str:
    """Only a project's own folder: the studio sends recordings, drafts, scripts and pictures, never code."""
    full = os.path.realpath(os.path.join(ROOT, path))
    base = os.path.realpath(os.path.join(ROOT, PROJECTS))
    rel = os.path.relpath(full, base)
    if rel.startswith("..") or os.sep not in rel or "/." in "/" + rel:
        raise SystemExit(f"refusing to write {path}: the studio may only write inside {PROJECTS}/<project>/")
    return full


def _git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    p = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    if check and p.returncode:
        raise SystemExit(f"git {' '.join(args)} failed: {p.stderr.strip() or p.stdout.strip()}")
    return p


def place(job: dict, fetched: str) -> str:
    branch = job.get("branch") or "claude/video-pipeline"
    if _git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip() != branch:
        _git("fetch", "-q", "origin", branch)
        _git("checkout", "-q", "-B", branch, f"origin/{branch}")
    paths = []
    for entry in job["files"]:
        full = _safe(entry["path"])
        data = entry_bytes(entry, fetched)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        if entry.get("mode") == "append-lines" and os.path.exists(full):
            with open(full, encoding="utf-8") as f:
                have = f.read()
            seen = {ln.split()[0] for ln in have.splitlines() if ln.strip()}
            new = [ln for ln in data.decode("utf-8").splitlines() if ln.strip() and ln.split()[0] not in seen]
            data = (have.rstrip("\n") + "\n" + "".join(ln + "\n" for ln in new)).lstrip("\n").encode("utf-8")
        with open(full, "wb") as f:
            f.write(data)
        print(f"wrote {entry['path']} ({len(data) // 1024} KB)")
        paths.append(entry["path"])
    _git("add", "-f", "--", *paths)
    if _git("diff", "--cached", "--quiet", check=False).returncode == 0:
        print("nothing changed")
        return _git("rev-parse", "HEAD").stdout.strip()
    _git("-c", "user.name=MONEY MOVES studio", "-c", "user.email=studio@users.noreply.github.com", "commit", "-q", "-m", job.get("message") or "Studio")
    for attempt in range(4):
        _git("pull", "-q", "--rebase", "origin", branch, check=False)
        if _git("push", "-q", "origin", f"HEAD:{branch}", check=False).returncode == 0:
            break
        time.sleep(2 ** (attempt + 1))
    else:
        raise SystemExit("git push failed four times")
    return _git("rev-parse", "HEAD").stdout.strip()


def _header(text: str) -> list[str]:
    out = []
    for line in text.splitlines():
        if line.lstrip().startswith("["):
            break
        out.append(line.strip())
    return out


def wait(job: dict, limit: float, every: float = 15.0) -> dict | None:
    """Pull until the transcription is back (the draft carries this request id and `synced:`), up to `limit` seconds."""
    w = job.get("wait") or {}
    if not w:
        return {"status": "pushed"}
    branch = job.get("branch") or "claude/video-pipeline"
    end = time.time() + limit
    while True:
        _git("pull", "-q", "--rebase", "origin", branch, check=False)
        path = os.path.join(ROOT, w["file"])
        if os.path.exists(path):
            text = open(path, encoding="utf-8").read()
            head = _header(text)
            if f"request: {w['request']}" in head and any(h.startswith("synced:") for h in head):
                timing = os.path.join(ROOT, w.get("timing") or "")
                return {
                    "status": "transcribed",
                    "draft": text,
                    "timing": open(timing, encoding="utf-8").read() if w.get("timing") and os.path.isfile(timing) else "",
                }
        if time.time() >= end:
            return None
        time.sleep(every)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("place")
    p.add_argument("job")
    p.add_argument("fetched")
    w = sub.add_parser("wait")
    w.add_argument("job")
    w.add_argument("result")
    w.add_argument("--limit", type=float, default=540.0, help="seconds (stay under the 10-minute command limit)")
    args = ap.parse_args(argv)
    job = load_job(args.job)
    if args.cmd == "place":
        sha = place(job, args.fetched)
        print(f"pushed {sha}")
        return 0
    res = wait(job, args.limit)
    if res is None:
        print("still waiting: run this again")
        return 2
    with open(args.result, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False)
    print(f"{res['status']}: wrote {args.result}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
