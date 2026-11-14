# The proof sheet: look before any render

A render takes 25 minutes. A review round takes ten more. Most of what the reviewers find shows on one still: a card
over a headline, a bare first frame, a chart small in the top half of a Short, a page cropped in the middle of a
word. The proof sheet draws small stills straight from the storyboard in a few minutes and measures the empty white
space on them. The sheet comes before any render: look at it, fix the script, then render.

## The command

Build the project first, without rendering, so its storyboard, its media and its Shorts' cuts exist:

    python -m pipeline.build projects/<name> --no-render

Bundle the renderer once (in `remotion/`; a minute or two, about 700 MB). Bundle again only after a change under
`remotion/src` or when the project's media has changed:

    cd remotion && npx remotion bundle --public-dir=public --out-dir=/tmp/ei-bundle

Then, from `video-pipeline/`:

    python -m pipeline.proof projects/<name> --bundle /tmp/ei-bundle --out /tmp/proof-<name>

For the Nvidia video and its five Shorts that is 439 stills on six sheets in a little over three minutes, on four
cores. It takes a project folder or a storyboard JSON. What else it takes:

- `--bundle DIR`: the bundle to draw from. Without it the command bundles into `--out/bundle` first. That needs
  about 700 MB and a minute or two, every time, so keep a bundle and pass it.
- `--out DIR`: where everything is written. Nothing is written anywhere else: not in the project, not in
  `remotion/public`.
- `--cuts DIR`: a folder of Shorts' cuts. A cut is a JSON file with a `short` field. The build writes them to the
  project's `.cache` folder, which is where the command looks when you give it a project folder.
- `--scenes 14,19`: only those scenes of the long video, for a quick look after a fix.
- `--upright`: also the whole long video in the upright frame, to see how each scene would look in a Short before
  any Short is picked. That sheet has no hook sticker and no captions, which a Short has, so it reads a little
  emptier than a Short cut from it.
- `--at-once N`: how many stills are drawn at a time. By default one fewer than the machine's cores, four at most.

The stills are drawn by the browser a render on the same machine uses: the one `REMOTION_BROWSER` names, else the
first installed Chrome that `remotion/remotion.config.ts` lists, else Remotion's own. When the disk is nearly full
Chrome refuses the larger video frames: point `TMPDIR` at a folder with room.

## What it writes

- `sheet-main.png`: the long video.
- `sheet-<short>.png`: one sheet for each Short.
- `sheet-upright.png`: with `--upright`.
- `proof.md`: read this first. It lists the tiles to check for balances, then what the gates found tile by tile,
  then each Short's first and last five words.
- `proof.json`: the same for a program.
- `stills/`: the stills. Open one when a tile is too small to judge.

## How to read a sheet

Each tile is stamped with its scene, the scene's type and the time, then what the still is for. On a Short's sheet a
scene cut from the long video shows that scene's number in brackets: `3 (19) broll 0:17.7`.

- A blue tint on an upright tile is where YouTube draws over a Short: its header across the top, its title strip
  across the bottom, its buttons down the right. The numbers come from `remotion/src/components/upright.json`. The
  command stops without that file.
- **check for balances** on a yellow band: the picture is an app or a screen recording. Look at every such tile
  first. No personal balance or holding value is ever shown.
- An orange frame: a gate names this tile. The gate is written above it.
- **not in the bundle**: the scene's photo or clip is not in the bundle's public folder, so the tile shows a
  placeholder. This happens for a project never built on this machine. Such a tile is not judged.

## Which frames

- Every scene: 0.4 seconds after its start, and 0.6 seconds before its end.
- A scene over 8 seconds: its midpoint as well.
- 0.3 seconds after every mark and every card lands.
- A scene drawn on paper (anything but a photo or a clip): 1, 3 and 5 seconds in. The near-empty check reads these.
- A Short: also frame 0, 1.5 seconds in, and its last frame.

The last frame is the last one a render writes. A Short of 15 seconds or less is rendered in one piece, and that
piece can run one frame past the end of its last scene. The sheet shows that frame as `no scene`.

## The gates

The gates report. They stop nothing: the command exits 0 whatever they find, and nothing else in the pipeline calls
them. On a Short a finding is printed as FAIL. On the long video it is a warning.

Measured on the stills. Ink is grey under 170. Plain paper is 228 and over. These are the review kit's measures.

- **First frame.** A Short's frame 0 fails with under 4% ink below the sticker band, unless footage fills it. A
  scroller sees this frame first.
- **Bare band.** An upright scene is judged on its busiest still. It fails when the band from 60% to 85% down has
  under 4% ink and over 92% paper. It also fails when a stretch with no ink at all between 25% and 85% down is taller
  than 12% of the height.
- **Near-empty page.** Any scene fails when its stills at 1, 3 and 5 seconds are all under 3.5% ink and over 90%
  paper. A scene too short for a still at 3 seconds is not judged.
- **Last frame.** A Short's last frame fails with under 80% of the ink of its last scene's busiest still. A Short
  loops, so a fading or empty last frame blinks every time round.

Read from the storyboard alone:

- **Held still.** A still picture on screen for over 8 seconds (6 in a Short) is named when no mark lands on it.
  Cards beside a page do not count: they do not point at it. It is also named when it has a mark but then sits for
  that long with neither a mark nor a card landing. A clip frozen on its last frame counts as a still.
- **Opening.** A long video opens on one full-frame picture with one figure on it: a `[broll]` with `big=`. Any
  other first scene is reported.

## The thresholds are a first guess

They come from about 25 frames of one video, the Nvidia Shorts as first delivered. They are to be tuned on a second
video. Until then they may nag, so they only report. The numbers live at the top of `pipeline/gates.py`, and
`tests/test_gates.py` checks that this page quotes them.

The stills are drawn at 0.4 of full size, and the thresholds were set at that size. On smaller stills thin lines
read as more ink.

## What the sheet cannot show

- Sound, timing and motion. A still is one frame.
- Anything the bundle does not hold. The stills are as true as the bundle they come from.
- A render fault. The sheet is drawn by the same renderer, but a render can still fail on its own.
