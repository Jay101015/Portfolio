"""The pose library: every source sheet cuts into its eight panels, and every pose in the manifest has its file,
its feet position and its tags."""
import importlib.util
import json
import os

import pytest

np = pytest.importorskip("numpy")
Image = pytest.importorskip("PIL.Image")

ROOT = os.path.join(os.path.dirname(__file__), "..")
spec = importlib.util.spec_from_file_location("pose_cut", os.path.join(ROOT, "scripts", "pose-cut.py"))
pc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pc)


def test_each_sheet_cuts_into_as_many_panels_as_it_has_poses():
    with open(os.path.join(ROOT, "library", "poses", "manifest.json"), encoding="utf-8") as fh:
        from_sheet = {}
        for e in json.load(fh):
            from_sheet[e["source"]] = from_sheet.get(e["source"], 0) + 1
    src = os.path.join(ROOT, "library", "poses", "source")
    for f in sorted(os.listdir(src)):
        if f.endswith("-single.png"):  # one unboxed drawing, cut whole
            assert from_sheet.get(f, 0) <= 1, f
            continue
        a = np.array(Image.open(os.path.join(src, f)).convert("L"))
        n = len(pc.grid(a))
        # a sheet is a 4 x 2 grid, a short redo row or a single redone panel, and holds at least the poses taken from it
        assert n in (1, 3, 8) and n >= from_sheet.get(f, 0), (f, n)


def test_manifest_poses_have_files_feet_and_tags():
    with open(os.path.join(ROOT, "library", "poses", "manifest.json"), encoding="utf-8") as fh:
        poses = json.load(fh)
    assert len(poses) >= 40
    for e in poses:
        im = Image.open(os.path.join(ROOT, "remotion", "public", e["file"]))
        assert im.mode == "RGBA" and im.size == (e["w"], e["h"]), e["name"]
        # the floor can sit below the drawing (a jump), never above its middle
        assert 0 < e["foot_x"] < e["w"] and e["floor_y"] > e["h"] * 0.5, e["name"]
        assert e["tags"], e["name"]
