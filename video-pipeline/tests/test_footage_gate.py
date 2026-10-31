import os
import subprocess

import pytest

from pipeline import footage_gate


def _clip(tmp_path, name, src, extra=()):
    out = str(tmp_path / name)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", src, *extra, "-t", "2.4", "-r", "10", "-pix_fmt", "yuv420p", out], check=True)
    return out


@pytest.mark.skipif(subprocess.run(["which", "ffmpeg"], capture_output=True).returncode != 0, reason="ffmpeg")
def test_the_gate_passes_a_moving_picture_and_names_what_is_wrong_with_the_rest(tmp_path):
    ok = _clip(tmp_path, "ok.mp4", "testsrc2=size=320x180:rate=10")
    assert footage_gate.check(ok)[1] is None
    still = _clip(tmp_path, "still.mp4", "color=c=0x808080:size=320x180:rate=10")
    assert "barely moves" in footage_gate.check(still)[1]
    dark = _clip(tmp_path, "dark.mp4", "testsrc2=size=320x180:rate=10", ("-vf", "eq=brightness=-0.9"))
    assert "too dark" in footage_gate.check(dark)[1]
    boxed = _clip(tmp_path, "boxed.mp4", "testsrc2=size=320x180:rate=10", ("-vf", "pad=320:260:0:40:black,scale=320:180"))
    assert "letterboxed" in footage_gate.check(boxed)[1]
    overlay = _clip(tmp_path, "overlay.mp4", "testsrc2=size=320x180:rate=10", ("-vf", "drawbox=x=60:y=120:w=200:h=30:color=white:t=fill,drawbox=x=60:y=120:w=200:h=30:color=black:t=4"))
    assert "lettering or a logo" in footage_gate.check(overlay)[1]
