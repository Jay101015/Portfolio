"""Stop-motion drawings: every strip in the library cuts into its panels, and every manifest entry has its frames."""
import importlib.util
import json
import os

import pytest

np = pytest.importorskip("numpy")
Image = pytest.importorskip("PIL.Image")

ROOT = os.path.join(os.path.dirname(__file__), "..")
spec = importlib.util.spec_from_file_location("flipbook_cut", os.path.join(ROOT, "scripts", "flipbook-cut.py"))
fc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fc)


def test_each_strip_cuts_into_five_panels():
    src = os.path.join(ROOT, "library", "flipbook", "source")
    for name in ("celebrate", "hand-money", "train"):
        a = np.array(Image.open(os.path.join(src, f"{name}-strip.png")).convert("L"))
        boxes = fc.panels(a)
        assert len(boxes) == 5, (name, boxes)
        widths = [x1 - x0 for x0, _, x1, _ in boxes]
        assert min(widths) > 250 and max(widths) < 400, (name, widths)


def test_manifest_frames_exist_and_are_transparent():
    with open(os.path.join(ROOT, "library", "flipbook", "manifest.json"), encoding="utf-8") as f:
        entries = json.load(f)
    for e in entries:
        for i in range(1, e["frames"] + 1):
            p = os.path.join(ROOT, "remotion", "public", "flipbook", e["name"], f"{i:02d}.png")
            im = Image.open(p)
            assert im.mode == "RGBA", p
            assert im.getpixel((2, 2))[3] == 0, f"{p}: the corner should be see-through, so the board shows"
