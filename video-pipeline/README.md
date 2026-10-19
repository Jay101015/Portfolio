# Review video pipeline

Script + voiceover in, finished video out, with an animated host character.
You write the review and record the narration; this repo does the storyboard,
the timing, the character, and the assembly.

```
projects/<name>/script.md  +  voiceover.mp3  +  media/ (clips, stills, poster)
        │
        ▼  pipeline/script_parser.py   tagged Markdown -> storyboard.json (scene list + visual data)
        ▼  pipeline/align.py           Whisper word timestamps -> every cut lands on your words;
        │                              loudness envelope -> the character's mouth
        ▼  pipeline/preview.py         storyboard.html for a one-minute human review
        ▼  remotion/                   React motion graphics + vector avatar -> <name>.mp4 (1080p) and -vertical.mp4
```

## Setup (once)

```bash
cd video-pipeline
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt            # faster-whisper pulls its model from Hugging Face on first run
cd remotion && npm install && cd ..
```

Rendering needs Chrome. Remotion downloads a headless build on first render
unless `remotion.config.ts` finds one already installed (set `REMOTION_BROWSER`
to point at your own).

## Approve the character first

```bash
cd remotion && npx remotion still AvatarSheet avatar.png --frame=20
```

That renders all ten poses on one sheet. Tune the look with `avatar.*` lines in
any script header (or change the defaults in `remotion/src/avatar/Avatar.tsx`):

| key | values |
|---|---|
| `avatar.skin` | any hex colour |
| `avatar.hair` | short, curly, buzz, fade, long, locs, afro, bun, bald |
| `avatar.hair_color` | hex |
| `avatar.facial_hair` | none, stubble, beard, goatee, mustache |
| `avatar.glasses` | none, round, square |
| `avatar.eye_color` | hex |
| `avatar.shirt` | hoodie, tee, jacket |
| `avatar.shirt_color`, `avatar.shirt_accent` | hex |
| `avatar.accessory` | none, cap, beanie, headphones |
| `avatar.accessory_color` | hex |

Poses: `idle`, `point`, `crossed`, `think`, `shocked`, `thumbsup`, `facepalm`,
`laugh`, `wave`, `shrug`. Placements: `corner-right`, `corner-left`,
`side-left`, `side-right`, `full`, `none`. Every scene tag accepts `pose=` and
`pos=`; the character blinks on its own and its mouth follows your recording.

## Make a video

```bash
mkdir -p projects/my-review/media
# write projects/my-review/script.md            (format below)
# drop  projects/my-review/voiceover.mp3        (wav, m4a, flac... all fine)
# drop  clips / stills / poster into media/
. .venv/bin/activate
python -m pipeline.build projects/my-review --no-render   # storyboard.json + storyboard.html: review this
python -m pipeline.build projects/my-review --vertical    # renders my-review.mp4 and my-review-vertical.mp4
```

The transcript is cached per recording, so re-rendering after a script tweak
skips the slow transcription step. `--model small.en` if alignment coverage
comes back low; `--retranscribe` forces a fresh pass. Live preview while
editing scenes: `cd remotion && npx remotion studio`.

## Script format

A Markdown file. `key: value` lines at the top set the title, theme, brand and
avatar; each `[tag ...]` starts a scene; the prose under a tag is what you read
aloud for that scene. Read it as written (small ad-libs are fine): the
narration is what the cut is aligned to.

```markdown
# Night of the Living Dead (1968)
slug: notld-review
theme: movie
brand.name: REEL TAKES
avatar.hair: curly
avatar.glasses: round

[avatar headline="The zombie movie that belongs to everyone" pose=wave]
Host on screen with a headline beside them.

[poster title="Night of the Living Dead" year="1968" director="George A. Romero" runtime="96 min" genre="Horror" starring="Duane Jones" tagline="They won't stay dead." pose=point]
Film card. Add src="poster.jpg" for the real poster from media/.

[clip src="opening.mp4" from=12 vol=0.15 credit="Night of the Living Dead (1968), public domain" caption="The opening" pose=idle]
Footage cutaway. `from` trims the start in seconds, `vol` ducks the clip's own
audio (0 = muted, which is the default). The character sits in the corner.

[still src="farmhouse.jpg" credit="..." caption="One house, one night" pose=think pos=corner-left]
A still with a slow push-in. zoom=out pulls back instead.

[list title="Why it still works"]
- The dead are slow, the people are the problem
- Duane Jones in the lead
Items animate in when you say them.

[compare title="What works and what doesn't"]
left: What doesn't | | Barbra is furniture; The middle sags
right: What works | | The pacing; The ending
                                      <- "Title | big value | item; item"

[stat value="$114,000" label="Budget" source="Widely reported" pose=crossed]
[chart bar title="..." y="$"]
bars: Opening:1.2M, Total:30M
[quote by="Roger Ebert"]
> ...

[score value="8.5" max="10" label="The verdict" verdict="Rough edges, perfect bones." pose=thumbsup]
Score counts up, stars fill.

[outro title="Watch it tonight." cta="Subscribe for a review every week"]
End-screen slots are left clear for YouTube's overlay.
```

Scene types: `avatar`, `poster`, `clip`, `still`, `title`, `text`, `list`,
`compare`, `stat`, `chart`, `quote`, `score`, `outro`. A script with no tags at
all still renders (each paragraph becomes a scene), but tags are the point.

Header keys: `theme` (`movie` or `finance`), `slug`, `kicker`,
`captions: false`, any `brand.*` (`name`, `bg`, `panel`, `text`, `muted`,
`accent`, `accent2`, `font`) and any `avatar.*` from the table above.

## Footage policy

Built in on purpose:

- Every `clip` and `still` carries a `credit=` tag rendered on screen.
- Clip audio is muted unless you set `vol=`; your narration is always the bed.
- The character is on screen during footage by default, so a cutaway is
  commentary, not a re-upload.

What the tooling cannot do for you: there is no "free use" footage from
current films. Long clips are only safe from public-domain titles. For current
releases keep cutaways short, use official trailers and stills, and expect the
occasional Content ID claim on the ad revenue. Public domain lists worth
knowing: the Internet Archive's feature film collection and Wikipedia's list
of films in the public domain in the United States.

## Offline alignment fallback

If Hugging Face is unreachable, `--backend sherpa_onnx --model <dir>` uses a
sherpa-onnx model (NeMo CTC or transducer export) from the sherpa-onnx GitHub
releases. Requires `pip install sherpa-onnx`.

## Layout

```
pipeline/               script_parser.py, align.py, preview.py, build.py, gen_images.py
remotion/src/avatar/    Avatar.tsx (the character), AvatarLayer.tsx (where it stands)
remotion/src/scenes/    one component per scene type
projects/notld-review/  sample review with placeholder footage and a robot voice
projects/first-10k/     the earlier finance sample (theme: finance)
tests/                  python -m unittest discover -s tests
```
