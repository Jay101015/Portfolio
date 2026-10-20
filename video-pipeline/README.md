# Money video pipeline

Script + voiceover in, finished video out, with an illustrated host who
explains money. You write the explainer and record the narration; this repo
does the storyboard, the timing, the host, the charts and the assembly. The
same pipeline reviews a film (`[poster]`, `[score]` and the film kit are still
here), but the channel plan in `docs/monetisation-plan.md` is finance and
investing.

```
projects/<name>/script.md  +  voiceover.mp3  +  media/ (illustrations, stills, clips)
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

## The look

`theme: paper` with `host: none` is the channel's look: a page someone
wrote on. Warm paper with a faint grain and dot grid, a serif (Fraunces) for
the big words, handwriting (Caveat) for the notes and labels, charts sketched
with a pen by rough.js, hand-drawn underlines and arrows, a highlighter
swipe on the word being said, photos taped to the page, and no presenter.
`projects/first-10k` and `projects/fee-drag` are the samples.

`theme: finance` is the alternative: a deep navy motion-graphics style with
glowing numbers, charts with a live value pill and comparison cards that
swing in.

The older default is `toon`: hand-drawn storytime style in the spirit of channels
like Let Me Explain Studios. Paper background, thick ink outlines, hand-lettered
type, hard cuts, and a painted host who holds still while the charts, numbers
and cards do the moving. Footage and illustrations sit inside a drawn screen
beside the host. `theme: finance` and `theme: movie` keep the older glossy
motion-graphics look.

## Approve the host first

The host is a painted portrait (`projects/host-art/base.jpg`) cut into
animation layers by `pipeline/host_rig.py`; see `projects/host-art/README.md`
for changing the portrait. The host holds still like the illustrated host of a
storytime channel: only the eyes, brows and mouth move, and reactions pop up as
marks beside the head. Check it close up before making a video:

```bash
cd remotion && npx remotion still Portrait host.png --frame=20
npx remotion still Portrait host-shocked.png --props='{"pose":"shocked","mouth":0.6,"viseme":1}'
```

`host: drawn` in a script header swaps in the older hand-drawn SVG character
(`npx remotion still AvatarSheet avatar.png` shows all its poses), styled with
`avatar.*` header lines:

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
`laugh`, `wave`, `shrug`. Expressions: `neutral`, `happy`, `angry`, `sad`,
`smug`, `surprised`, `confused`, `laugh_face`, `closed`, `flat`. Placements:
`corner-right`, `corner-left`, `side-left`, `side-right`, `full`, `none`.
Every scene tag accepts `pose=`, `face=` and `pos=`; the host blinks on its
own and its mouth follows your recording. A pose is a still and a pose change
is a cut, so poses mostly pick the reaction marks and the default expression.

**Reaction cues inside the narration** are what make the host feel alive.
Drop a pose or expression name in braces where the reaction should land:

```
It opens in a cemetery, and within three minutes {confused} the movie has
already broken its own rules. {shocked} The slow man is not a mourner.
```

The cue fires on the word that follows it, timed from your recording, as a
hard cut to the new expression. Cues are stripped from
the captions and the alignment text, so read the line without them.

## Make a video

```bash
mkdir -p projects/my-video/media
# write projects/my-video/script.md             (format below)
# drop  projects/my-video/voiceover.mp3         (wav, m4a, flac... all fine)
# drop  illustrations / stills / clips into media/
. .venv/bin/activate
python -m pipeline.build projects/my-video --no-render   # storyboard.json + storyboard.html: review this
python -m pipeline.build projects/my-video --vertical    # renders my-video.mp4 and my-video-vertical.mp4
```

Long renders run in frame chunks (450 frames each, `--chunk` to change, `0`
for a single pass); a chunk that hangs is retried and the chunks are joined
losslessly with ffmpeg, so one stuck frame never costs you a whole render.
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
# The 1% fee that eats a third of your retirement
slug: fee-drag
topic: Investment fees
theme: toon
brand.name: MONEY MOVES

[avatar headline="The 1% that eats a third of your retirement" pose=wave]
Host on screen with a headline beside them. {point} A cue in braces changes
the host's expression on the word that follows.

[stat value="1%" label="A typical fund or adviser fee" sub="Charged every year, on everything" source="Illustrative" pose=crossed]
One big number with a label and a source line. from="$0" count="3" counts
it up over three seconds.

[chart line title="$10,000 over 40 years" y="$" x="Year" source="7% a year before fees, illustrative"]
data: No fee = 0:10000, 10:19672, 20:38697, 30:76123, 40:149745
data: 1% fee = 0:10000, 10:17908, 20:32071, 30:57435, 40:102857
A line chart draws itself as you talk. One `data:` line per series.

[chart bar title="Share of funds that beat the index" y="%" source="SPIVA US scorecard, year-end 2023"]
bars: Over 1 year:40, Over 5 years:21, Over 15 years:12
Bars rise in turn.

[compare title="Same market, two funds"]
left: Index fund | 0.03% | Tracks the market; Three dollars a year per ten thousand
right: Active fund | 1.0% | Tries to beat it; A hundred dollars a year per ten thousand
                                      <- "Title | big value | item; item"

[still src="bucket.jpg" credit="Illustration" caption="The leak" want="A bucket of coins with a hole" pose=think]
A still with a slow push-in (zoom=out pulls back). `want=` is a note for
whoever finds or draws the picture; `search=` is a free-use footage query.

[clip src="broll.mp4" search="stock market trading floor" from=12 vol=0.15 fallback="broll.png" credit="..." caption="The floor" pose=idle]
Footage cutaway. `from` trims the start in seconds, `vol` ducks the clip's
own audio (0 = muted, the default). `fallback=` names a still to use when the
footage file is not in media/ yet, so a script renders before the clips
arrive. Big files need not be committed: list them in `media/sources.txt`
as `<name> <direct https link>` and the build fetches what is missing.

[list title="Find your fees in five minutes"]
- Look up the expense ratio of every fund you own
- Ask an adviser what you pay, in dollars
Items animate in when you say them.

[quote by="John Bogle, founder of Vanguard"]
> In investing, you get what you don't pay for.

[outro title="Keep your third." cta="Subscribe for one money idea a week"]
End-screen slots are left clear for YouTube's overlay. Put the "education,
not advice" line in this scene's narration, every video.
```

Scene types: `avatar`, `stat`, `chart`, `compare`, `list`, `quote`, `still`,
`image`, `clip`, `title`, `text`, `outro`, plus `poster` and `score` for a film
review. A script with no tags at all still renders (each paragraph becomes a
scene), but tags are the point.

Header keys: `topic` (what the video is about; `film` for a review), `theme`
(`paper`, `finance`, `toon` or `movie`), `host` (`none` for pure motion graphics, the
default on the `finance` and `movie` themes; `painted` or `drawn` to put the
host on screen, the default on `toon`), `slug`, `kicker`, `captions: false`, any
`brand.*` (`name`, `bg`, `panel`, `text`, `muted`, `accent`, `accent2`,
`font`) and any `avatar.*` from the table above.

## Footage and sources policy

Built in on purpose:

- Every `clip`, `still` and `image` carries a `credit=` tag rendered on screen.
- Every `stat` and `chart` carries a `source=` line rendered under the figure.
  Fill it in: a finance channel is quotable only when its numbers are.
- Clip audio is muted unless you set `vol=`; your narration is always the bed.
- The host is on screen during footage by default, so a cutaway is
  commentary, not a re-upload.

What the tooling cannot do for you: screenshots of paid apps, news footage,
brokerage interfaces and other people's charts are not free use. Draw the
chart yourself with a `chart` scene, use an illustration, or search free-use
b-roll. Charts and illustrations also never trigger a Content ID claim,
which is the quiet advantage of this niche over film reviews.

## Reviewing a film instead

```bash
python -m pipeline.film "10 Things I Hate About You" --year 1999 --trailer
```

The pipeline started as a review tool and the film kit is still here: it
finds the film on Wikidata, decides whether it is public domain, gathers a kit
of free, promotional and trailer material into `projects/<title-year>/media/kit/`
with the rights of each item labelled, and writes a review script with the
film card filled in. On GitHub, the **Film kit** workflow does the same from a
title. For a film under copyright nothing of the film itself is free to use;
the kit says so. Public-domain lists worth knowing: the Internet Archive's
feature film collection and Wikipedia's list of films in the public domain in
the United States.

## Finding free-use footage

```bash
python -m pipeline.find_footage projects/my-video             # searches, downloads, writes credits into the script
python -m pipeline.find_footage projects/my-video --dry-run   # report only
```

For every `clip`, `still` or `image` scene without a file, the finder builds
a query (`search=`, else the caption, else the narration's keywords, else the
topic) and asks, in order: the Internet Archive (the film itself when the header says
`rights: public-domain`, otherwise public-domain and CC items), Wikimedia
Commons (CC0, public domain, CC BY, CC BY-SA), and Pexels stock b-roll (set
`PEXELS_API_KEY`; free at pexels.com/api). The first usable hit lands in
`media/`, the scene gets `src=` and an on-screen `credit=`, and
`footage-report.md` lists every scene with its licence and what was not
found. CC BY-NC and CC BY-ND are skipped on purpose: a monetised channel is
commercial use.

Header keys it reads: `topic:` (what the video is about; the fallback query),
`film:` (a review's title), `rights: public-domain` (search for the feature
itself), `licenses:` (narrow the accepted set). For a film under copyright
there is no free-use footage of the film; the finder returns thematic b-roll
and says so in the report. The GitHub workflow runs the finder
before every render, so a pushed script with `search=` hints comes back with
footage attached.

## Offline alignment fallback

If Hugging Face is unreachable, `--backend sherpa_onnx --model <dir>` uses a
sherpa-onnx model (NeMo CTC or transducer export) from the sherpa-onnx GitHub
releases. Requires `pip install sherpa-onnx`.

## Layout

```
pipeline/               script_parser.py, align.py, preview.py, build.py, film.py, find_footage.py
remotion/src/avatar/    RasterHost.tsx (the painted host), AvatarLayer.tsx (where it stands),
                        Avatar.tsx (the drawn fallback character)
remotion/src/studio/    the host drawing bundled for the studio web page
projects/host-art/      the host portrait, its landmarks and how to replace it
remotion/src/scenes/    one component per scene type
projects/fee-drag/      the demo explainer: the 1% fee (placeholder voice)
projects/first-10k/     the earlier finance sample in the glossy finance theme
projects/jurassic-park/ a film review demo; projects/oppenheimer/ a second
projects/notld-review/  the original review sample with a robot voice
docs/                   monetisation-plan.md: the plan from zero to a paying finance channel
tests/                  python -m unittest discover -s tests
```
