"""Optional: generate hero images for [image prompt="..."] scenes with FLUX on Hugging Face.

    HF_TOKEN=hf_... python -m pipeline.gen_images projects/<name>

Needs network access to huggingface.co and an account token. Images land in
<project>/images/ and the script is left untouched; build.py picks them up by
the src name written back into storyboard.json. Untested from inside the
sandbox this was written in (huggingface.co was not reachable there).
"""
from __future__ import annotations

import os
import re
import sys

from .script_parser import parse_script

STYLE = "clean editorial illustration, flat vector shapes, dark navy background, green and gold accents, no text, 16:9"


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    from huggingface_hub import InferenceClient

    project = os.path.abspath(argv[0])
    model = os.environ.get("HF_IMAGE_MODEL", "black-forest-labs/FLUX.1-schnell")
    client = InferenceClient(model=model, token=os.environ.get("HF_TOKEN"))
    with open(os.path.join(project, "script.md"), encoding="utf-8") as f:
        md = f.read()
    sb = parse_script(md)
    out_dir = os.path.join(project, "images")
    os.makedirs(out_dir, exist_ok=True)
    for sc in sb["scenes"]:
        p = sc["props"]
        if sc["type"] != "image" or not p.get("prompt"):
            continue
        name = p.get("src") or f"scene{sc['id']}.png"
        path = os.path.join(out_dir, name)
        if os.path.exists(path):
            print(f"skip {name} (exists)")
            continue
        print(f"generating {name}: {p['prompt']}")
        img = client.text_to_image(f"{p['prompt']}, {STYLE}", width=1344, height=768)
        img.save(path)
        if not p.get("src"):
            md = re.sub(rf"(\[image\b)(?![^\]]*\bsrc=)([^\]]*prompt=\"{re.escape(p['prompt'])}\")", rf'\1 src="{name}"\2', md, count=1)
    with open(os.path.join(project, "script.md"), "w", encoding="utf-8") as f:
        f.write(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
