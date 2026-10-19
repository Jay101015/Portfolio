# The host's art

The host in every video is a painted portrait cut into animation layers, not a
hand-coded drawing. The portrait lives here as `base.jpg`; the rig layers are
built from it by `pipeline/host_rig.py` into `remotion/public/host/`.

## Changing the portrait

1. Generate or commission a bust portrait in the house style (webtoon / manhwa
   character art: painted cel shading, fine dark line work, facing the camera,
   neutral closed mouth, eyes open, plain light background, about 1856x2304).
   The current one is a flat vector illustration with round glasses; set
   `"style": "flat"` or `"painted"` in landmarks.json to match the art.
   The current one came from a text-to-image tool with this brief:

   > Webtoon manhwa style digital illustration, bust portrait of a young Black
   > man ... thin round wire glasses ... high-top fade with dense tight black
   > curls, shaved faded sides and a sharp line-up ... dark charcoal hoodie
   > with a bright red hood bunched up around the neck, white drawstrings ...
   > clean line art, hard two-tone cel shading ... plain flat light grey-blue
   > background, no text.

   If the sandbox cannot download the result, run the **Fetch assets** workflow
   on GitHub with the image URL and `video-pipeline/projects/host-art/gen` as
   the destination.

2. Save it as `base.jpg` and update `landmarks.json`: the head polygon, the
   neck polygon, the brow boxes, the eye boxes and ellipses, the mouth polygon,
   centre and half width, the neck base, the shoulder points, and the colour
   sample points. Coordinates are pixels in `base.jpg`.

3. Run `python -m pipeline.host_rig`. It keys out the background, splits the
   head from the body (the neck stays on the body), lifts the brows into their
   own layers and heals the skin under them, paints skin over the mouth for the
   drawn mouth shapes, and writes `host.json` with the boxes and sampled colours.

4. Check `remotion/public/host/*.png` and render the `Portrait` composition
   (`npx remotion still Portrait out.png`).

## What the rig animates

Poses and reaction cues are the same as before (`{point}`, `{shocked}` and so
on). The head bobs, nods and turns on the neck; the brows move and tilt; lids
and blinks are painted over the eyes in the portrait's skin tone; the mouth
shapes for speech and expressions are drawn in the portrait's lip colours over
the healed patch; arms and hands are drawn in the hoodie and skin tones.

Set `host: drawn` in a script header to use the hand-drawn SVG character instead.
