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

## The look

Default theme is `toon`: hand-drawn storytime style in the spirit of channels
like Let Me Explain Studios. Paper background, thick ink outlines, hand-lettered
type, hard cuts, and a host character whose line work re-draws every few
frames and moves on twos so it reads as animated by hand. Borrowed footage sits
inside a drawn screen beside the host. `theme: movie` and `theme: finance` keep
the older glossy motion-graphics look.

## Approve the character first

```bash
cd remotion && npx remotion still AvatarSheet avatar.png --frame=20
```

That renders all ten poses and all ten expressions on one sheet. Tune the look with `avatar.*` lines in
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
`laugh`, `wave`, `shrug`. Expressions: `neutral`, `happy`, `angry`, `sad`,
`smug`, `surprised`, `confused`, `laugh_face`, `closed`, `flat`. Placements:
`corner-right`, `corner-left`, `side-left`, `side-right`, `full`, `none`.
Every scene tag accepts `pose=`, `face=` and `pos=`; the character blinks on
its own and its mouth follows your recording.

**Reaction cues inside the narration** are what make the host feel alive.
Drop a pose or expression name in braces where the reaction should land:

```
It opens in a cemetery, and within three minutes {confused} the movie has
already broken its own rules. {shocked} The slow man is not a mourner.
```

The cue fires on the word that follows it, timed from your recording, with a
little squash so the change reads as a drawn re-pose. Cues are stripped from
the captions and the alignment text, so read the line without them.

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

[clip src="trailer.mp4" from=12 vol=0.15 fallback="gate.png" credit="Jurassic Park (1993), Universal Pictures. Official trailer." caption="The opening" pose=idle]
Footage cutaway. `from` trims the start in seconds, `vol` ducks the clip's own
audio (0 = muted, which is the default). `fallback=` names a still to use
when the footage file is not in media/ yet, so a script renders before the
clips arrive. Big files need not be committed: list them in
`media/sources.txt` as `<name> <direct https link>` and the build fetches
what is missing (the GitHub workflow does this too).

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

## Start from a film title

```bash
python -m pipeline.film "10 Things I Hate About You" --year 1999 --trailer
```

One command turns "I watched X" into a project. It finds the film on Wikidata
(year, director, cast, runtime, genre, distributor, filming locations,
copyright status), decides whether it is public domain, and gathers a kit
into `projects/<title-year>/media/kit/`:

| rights | what | source |
|---|---|---|
| free | the feature itself, when it is public domain | Internet Archive |
| free | CC / public-domain photos of the cast, director and filming locations | Wikimedia Commons |
| promotional | poster and studio stills (customary in reviews; a fair-use judgement) | TMDB, with `TMDB_API_KEY` |
| trailer | the official trailer (fair use with commentary; expect a Content ID claim) | TMDB id, fetched with yt-dlp and `--trailer` |

It then writes `script.md` with the film card filled in and scene slots
pointing at the kit, `media/sources.txt` so the render can re-fetch footage,
and `footage-report.md` with the rights status of every item. Your opinions
go into the script; the facts are already there. On GitHub, the **Film kit**
workflow does the same from a title and commits the project to the branch.

For a film under copyright, nothing of the film itself is free to use; the
kit says so and gives you the free photos, the promotional material and the
trailer, each labelled. Public-domain lists worth knowing: the Internet
Archive's feature film collection and Wikipedia's list of films in the
public domain in the United States.

## Finding free-use footage

```bash
python -m pipeline.find_footage projects/my-review            # searches, downloads, writes credits into the script
python -m pipeline.find_footage projects/my-review --dry-run  # report only
```

For every `clip`, `still` or `image` scene without a file, the finder builds
a query (`search=`, else the caption, else the narration's keywords) and asks,
in order: the Internet Archive (the film itself when the header says
`rights: public-domain`, otherwise public-domain and CC items), Wikimedia
Commons (CC0, public domain, CC BY, CC BY-SA), and Pexels stock b-roll (set
`PEXELS_API_KEY`; free at pexels.com/api). The first usable hit lands in
`media/`, the scene gets `src=` and an on-screen `credit=`, and
`footage-report.md` lists every scene with its licence and what was not
found. CC BY-NC and CC BY-ND are skipped on purpose: a monetised channel is
commercial use.

Header keys it reads: `film:` (the title), `rights: public-domain` (search
for the feature itself), `licenses:` (narrow the accepted set). For a film
under copyright there is no free-use footage of the film; the finder returns
thematic b-roll and says so in the report. The GitHub workflow runs the finder
before every render, so a pushed script with `search=` hints comes back with
footage attached.

## Offline alignment fallback

If Hugging Face is unreachable, `--backend sherpa_onnx --model <dir>` uses a
sherpa-onnx model (NeMo CTC or transducer export) from the sherpa-onnx GitHub
releases. Requires `pip install sherpa-onnx`.

## Layout

```
pipeline/               script_parser.py, align.py, preview.py, build.py, film.py, find_footage.py
remotion/src/avatar/    Avatar.tsx (the character), AvatarLayer.tsx (where it stands)
remotion/src/scenes/    one component per scene type
projects/notld-review/  sample review with placeholder footage and a robot voice
docs/                   monetisation-plan.md: the plan from zero to a paying channel
projects/first-10k/     the earlier finance sample (theme: finance)
tests/                  python -m unittest discover -s tests
```
