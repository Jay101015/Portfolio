"""The channel's own footage library (library/footage/): clips kept once and used in any video by name.

    [broll lib="uk-suburb-drone" caption="..."]

`use_library(sb, project)` copies each named clip into the project's media/ folder and points the scene at it, with
the library's credit, so the footage finder leaves the scene alone and the render treats it like any other clip.
library/footage/manifest.json lists every clip: what it shows, its tags, landscape or vertical, its source and licence.
A vertical clip fills a Short; in a landscape video it is cropped to its middle band, so pick landscape clips there.
"""
from __future__ import annotations

import json
import os
import shutil
from typing import Any

LIB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "library", "footage")


def manifest() -> dict[str, dict[str, Any]]:
    path = os.path.join(LIB, "manifest.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return {e["name"]: e for e in json.load(f)}


def use_library(sb: dict[str, Any], project: str) -> list[str]:
    """Copy every `lib=` clip into <project>/media and set the scene's src and credit; notes for the log."""
    clips, notes = manifest(), []
    for sc in sb["scenes"]:
        p = sc["props"]
        name = p.get("lib")
        if not name or sc["type"] not in ("broll", "clip"):
            continue
        e = clips.get(str(name))
        if not e:
            notes.append(f"WARNING: scene {sc['id']}: lib='{name}' is not in library/footage/manifest.json")
            continue
        media = os.path.join(project, "media")
        os.makedirs(media, exist_ok=True)
        dst = os.path.join(media, e["file"])
        if not os.path.exists(dst):
            shutil.copyfile(os.path.join(LIB, e["file"]), dst)
        p["src"] = e["file"]
        p.setdefault("credit", e.get("credit", ""))
        notes.append(f"scene {sc['id']}: footage from the library: {name}")
    return notes
