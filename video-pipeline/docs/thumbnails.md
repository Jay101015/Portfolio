# Thumbnail mock-ups

This makes thumbnail mock-ups from a real photo. Each one has a picture, one figure and at most one short line.
You get three layouts for every photo, and one sheet that shows them all at the size a phone shows them.

These are mock-ups to choose from. They are not a final style.

## The command

Run it from the `video-pipeline` folder.

```
python -m pipeline.thumbnail projects/nvidia-400-billion --photo real/huang-06.jpg \
    --figure '−$400BN' --line 'in 2 days' --out ~/thumbs
```

With no photo it makes one figure-only mock-up:

```
python -m pipeline.thumbnail projects/50k-salary-uk --figure '£50,000' --line 'still a good salary?' --out ~/thumbs
```

What you get in the `--out` folder:

- One PNG for each layout. Each is 1280x720 and under 2 MB, which is what YouTube accepts.
- `sheet-320.png`. Every thumbnail in the folder, each 320 px wide.
- `thumbs.json`. A list of the thumbnails with their photo, licence and credit line.

Run the command again with another photo, or other words, and the same `--out` folder. The new thumbnails are added
to the sheet. The first run takes a few seconds longer because it bundles the layouts. Later runs reuse that.

The options:

| Option | What it does |
|---|---|
| `--photo` | A file in the project's `real/` folder. Leave it out for a figure-only mock-up. |
| `--figure` | The one figure or phrase. For example `'−$400BN'` or `'CEO OUT'`. |
| `--line` | One more line, four words or fewer. You can leave it out. |
| `--out` | The folder the files go in. Keep mock-ups outside the project folder. |
| `--focus x,y` | Where the subject is in the photo, counted from the top left, from 0 to 1. For a face, point at the eyes. The default is `0.5,0.4`. |
| `--zoom` | Pulls in on the subject. `1` is the default. `1.3` is 30% closer. |
| `--label` | The heading for this set on the sheet. The default is the figure and the line. |
| `--layouts` | Make only some layouts, for example `photo,band`. |
| `--credit-from` | For a `media/` crop: the `real/` file it was cut from. |

## The layouts

- `photo`. The picture fills the frame under a dark fade. The figure sits in a block at the bottom left, with the
  line under it. This is the look of the opening frame Jeffrey approved.
- `band`. The picture fills the frame. The figure is in heavy type on a solid block at the side away from the subject.
  The photo slides across so the subject stays clear of the block.
- `split`. The picture is on one side. One huge figure is on white on the other side. This is the pattern of his
  best-performing video. It shares a white ground with the thumbnail he rejected, and the sheet says so under each one.
- `figure`. Used when there is no real picture yet. The figure and one line on plain navy. The sheet labels it
  "no real picture yet".

A photo where the subject has some room around it works best. A tight portrait fills the frame and the block covers
the face in `photo` and `band`. Use `--focus` to say where the subject is.

## The rules

The command checks these before it draws anything. If one is broken it stops and says which.

- At most two pieces of text: the figure, and one line of four words or fewer.
- Red only means a loss. A figure or a line is red only when it starts with a minus. Nothing else is ever red.
  So `'−$400BN'` is red, and `'CEO OUT'` is white or navy.
- Real photos only. The photo must be in the project's `real/` folder, with a licence written in `real/sources.json`.
  A crop in `media/` is allowed when you name the `real/` file it came from with `--credit-from`.
  A crop of a news page is credited to the outlet.
- Nothing in the bottom-right corner. YouTube prints the video's length there. The command draws each layout with
  its text and without it, compares the two, and fails if any text falls in that corner.
- No ring, highlight, arrow or hand. The layouts do not draw them.

Three more rules are yours to keep. The command cannot check them.

- No picture made by AI. The `real/` folder and its licence list are there to keep those out.
- No drawing of Jeffrey.
- No personal balance or holding as the figure.

## The credit line

The command prints a credit line for each photo, like this:

```
credit for the description: Photo: Anderseidesvik, CC BY-SA 4.0, via Wikimedia Commons
```

Put that line in the video description when you use the thumbnail. A CC BY or CC BY-SA photo needs its credit.

## How to use the sheet

Open `sheet-320.png` at full size on a screen. Each tile is 320 px wide, about the size of a thumbnail in the phone
app. Jeffrey judges at that size by eye: which one would he tap?

There are no measured rules for text size or contrast yet. Those wait until he has picked a layout. Then the
checks can be written for the layout he chose.

## How it works

- `remotion/thumb/` holds the layouts. It is separate from the video renderer and shares no code with it. It has
  its own copy of the brand colours, and a test checks they match the video's colours.
- `pipeline/thumbnail.py` checks the rules, builds the thumbnails and draws the sheet.
- The photo is scaled to 1,600 px wide and sent along with the words. Nothing is copied into `remotion/public`.
- The bundle is kept in `<out>/.work`. You can delete that folder at any time.
- If a PNG comes out over 2 MB, its colours are thinned a little until it fits. The command says when it did this.

Tests: `python -m pytest tests/test_thumbnail.py -q`
