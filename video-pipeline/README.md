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

`theme: whiteboard` with `host: none` is the channel's look: a whiteboard
being written on, in the spirit of channels like The Swedish Investor. A
clean white board, marker handwriting (Caveat Brush for the big words,
Patrick Hand for the rest, Caveat for notes), and nothing fades in: every
line is written on a character at a time at a marker's pace, boxes, axes,
underlines and chart lines are drawn stroke by stroke, a doodle (a Lucide
outline, chosen from the words on the scene or set with `icon=` on any tag)
is sketched in the corner, and a cartoon hand holding the marker follows
whatever is being written, switching marker colour with the line. Three
markers: black, green for the good side, red for the warning side, and a
blue for charts and doodles. Photos are held to the board with a magnet.
`projects/first-10k` and `projects/fee-drag` are the samples.

`theme: paper` is the same set of layouts on a page someone
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

## Record, and the script catches up with what you said

Transcription starts the moment a recording arrives. In the studio's Read
tab, after recording or picking a file (or pasting a Drive / Dropbox link):

- **Transcribe and match my script**: your scenes stay as they are, and the
  words under each one change to what you actually said, so the captions and
  the writing on the board match your voice. Layouts, numbers, list items,
  chart data and headlines are kept. A scene you skipped keeps its written
  words and is reported.
- **Transcribe and build scenes from my voice**: the scenes are written from
  the recording (see below).

The studio sends the recording with `draft.md` (your script, stamped with a
request id). That push runs `transcribe.yml`, which does no rendering:
`pipeline/transcribe.py` transcribes once (Whisper, about a minute on
GitHub), aligns, rewrites the draft (`pipeline/sync.py`) and commits
`draft.md`, `transcript.json`, `timing.json` and `voice-preview.mp3`. The
studio waits for its answer (a couple of minutes, with a timer) and loads the
matched script with your voice and the real timings. Edit, then **Ship**:
that writes `script.md`, which is what renders, and the render reuses the
transcript. Close the page while it waits and it picks the wait up next time.

Locally the same step is:

    python -m pipeline.transcribe projects/<name>

## Your voice, cleaned up

A phone in a bedroom is not a studio microphone, so every recording is cleaned
up before it is used: the rumble and hum below 80 Hz go, the hiss is reduced,
harsh "s" sounds are softened, a little mud is taken out and presence put in,
the level is evened out and brought to the loudness YouTube plays at (-14 LUFS), loud enough on a phone speaker.
The original file is never touched; the cleaned copy is what the transcription
listens to and what the video plays, and `voice-preview.mp3` after a
transcription is the cleaned version, so you can hear it in the studio.

In the studio's Read sheet, under the player, **Your voice** has four choices:

- **As recorded**: no clean-up at all (`voice: raw` in the script header).
- **Light**: gentle noise removal and light compression.
- **Normal**: the default; proper noise removal and compression.
- **Strong**: a neural noise suppressor (RNNoise) in front of all of that, for
  noisy rooms and bad mics (`voice: strong`).

**Hear it roughly cleaned (preview)** plays your recording through the
browser's own EQ and compressor so you get an idea; the real clean-up, with
noise removal, happens when the recording is sent. It adds about twelve
seconds per minute of audio to the transcription job.

Locally:

    python -m pipeline.enhance in.m4a out.mp3 --level strong --measure

## A written script and your voice

If you wrote a script and read from it, give the studio both. In Read, paste it
into **Your written script**; the prompter shows it, so you record from it.
Then **Transcribe and build from my written script**. Your voice is what gets
transcribed, so the video says exactly what you said, when you said it. The
written script is not transcribed: it is the plan for how the video is built.

- the first line (`# Title` or `Title: ...`) is the title; else the first
  sentence is;
- each paragraph is a scene (a long one is split at sentence ends);
- a short line on its own ending in a colon, `## like this`, or IN CAPITALS is
  a heading for the next scene: the handwritten line above a text scene, the
  label on a figure, the title of a list;
- lines starting with `-`, `*` or `1.` make a list; a figure (`£10,000`, `24%`)
  makes a big number; a sign-off is the outro.

The transcription lines your words up with those scenes and swaps the written
words for the spoken ones; layouts, numbers, headings and lists are kept. A
scene you skipped keeps its written words and is reported. The written script
is also the transcriber's vocabulary, so names and figures come out right.

The pieces: the studio sends `written.md` with `plan: written.md` in the
draft's header; `pipeline/auto_script.py` has `script_from_text`.

## Drafts

**Save** in the top bar opens Drafts: name the version and save it. Drafts
are kept in the studio's storage on your claude.ai account under a path only
you can read, so they are there on any device; a recording you made or picked
is kept with the draft on the device it was made on. Open brings a draft
back (with its recording on that device); delete asks for a second tap. The
script is also autosaved on the device as you work.

## Just talk: a recording is enough

You do not need a finished script. Record yourself (in the studio's Read
tab, or any voice memo app) and in Read choose **Build the scenes from my
voice**. The studio sends the recording; the render transcribes it,
writes the scenes from what you said (`pipeline/auto_script.py`: your
words stay exactly as said; the opening line becomes the title, a money
figure or a percentage, spoken as words or digits, becomes a big-number
scene, "first / second / third" becomes a list, the sign-off becomes the
outro), lines every scene up with your voice and renders. The script it
wrote, the transcript and the timings are committed back next to your
recording.

Then, in Read: **Load the scenes the render built** brings that script
into the studio with the real timings and your voice, so you edit around
the actual recording. **Better scenes from my words (Claude)** hands the
transcript to Claude for sharper headlines, comparisons and charts,
keeping your words untouched. Ship again and the new scenes are lined up
with the same recording; the transcript is kept, so this re-render does not
transcribe again.

Getting the recording in: **Use a recording** takes any audio or video
file. On an iPhone a Voice Memo has to be saved to Files first (open the
memo, ⋯ → Share → Save to Files). Big recordings are sent in pieces (each
piece is its own small commit under `uploads/`; the studio halves the piece
size if GitHub refuses one, and the render joins them), or paste a Google
Drive or Dropbox link instead (shared as "anyone with the link"): the
studio commits `voiceover.url` and the render downloads the file.

If you did write the script first, **Send my voice with this script** keeps
your scenes and moves them to your timing. Either way a new recording
replaces the old one, and the recording, the script and any pictures go up
in one commit, so there is one render.

On the command line the same thing works: put `voiceover.m4a` (or mp3,
wav, webm) in an empty project folder, or next to a `script.md` with only
header lines, and run the build.

## Read, record, upload: the video cuts itself around your voice

The order of work is: Claude turns what you dictated into a script; you read
it; you record it; the video is built around the recording.

1. In the studio, **Read** shows the script as a teleprompter: your words per
   scene, big, with an auto-scroll you can set to your pace. Tap a scene to see
   its picture in the preview. "Copy the reading script" gives you the same
   text for any other prompter.
2. Record in the studio (the microphone, when the page is allowed to use it)
   or on your phone (Voice Memos, Recorder, anything). "Play it with the
   preview" plays the recording against the preview, with the scenes
   stretched to its length, so you can hear whether a scene is too long
   before anything is rendered.
3. "Transcribe…" sends it from the studio. claude.ai has no GitHub
   connector, so the studio keeps the recording in its own storage and
   starts a short Claude Code session that commits it
   (`pipeline/courier.py`, which only writes inside a project folder), waits
   for the transcription and hands the draft back; the studio shows each
   step and a link to the session. Ship goes the same way. Without Claude
   Code, "Send it through GitHub instead" opens the project folder on GitHub: drop
   the recording in under any name ("New Recording 3.m4a" is fine; `m4a`,
   `mp3`, `webm`, `wav`, `mp4`, `mov` all work) and commit. That push starts
   the transcription: the file becomes `voiceover.<ext>` (replacing the old
   recording), the draft is matched to what you said, and "Load the latest
   transcription" brings it back. Phone and browser recordings are
   transcoded to mp3 for the renderer.
4. After the render, "Use the voice and timings from the last render" loads
   the real word timings and the voice into the studio, so the preview plays
   to the actual recording and you edit scenes around it. Change a scene's
   words and re-ship; the alignment is re-run on the same recording (the
   transcript is cached), so a re-render takes minutes, not a re-record.

Keep the tags; change the words. If you drift from the script while
recording, the aligner follows the voice, not the page: scenes still land
where you say them.

### Editing after the transcription

Once a recording is in, every scene in Edit says what the recording says
about it: "Heard in your recording (31 of 33 words)", or a warning that only
a few of its words, or none, were heard. Change the words, add a scene (the
**+ Add a scene after this** button, or **+ add** at the end of the strip),
duplicate or delete one, and the timings follow the words rather than the
scene number: a word you kept keeps its time, a word you changed takes its
place between the kept ones, a deleted scene hands its stretch to the scene
before, an added scene sits between its neighbours. The render does the same
fit against the real transcript, so what the preview shows is what the video
does. Words that nobody said are shown, not spoken: record again if they
should be.

## The weekly loop: two or three videos a week

The studio is tuned for throughput. One video is four taps and one recording:

1. **Draft**: type the title and the one number, tap Draft it. Claude writes the whole
   script in the channel's shape: the number in the first line, three takeaway cards
   each with a picture scene behind it, one money picture, a recap, the outro. 90 to
   150 seconds. Without Claude you get the same shape as a scaffold to fill in.
2. **Record**: Read mode, record over the script on the phone, upload. Recorded in
   parts? The Read sheet's **Join them** block merges two or more takes into one
   recording in the page (order them, a breath between, the silence at each end
   trimmed) and that becomes the recording to send. The voice
   is cleaned, transcribed and matched to the scenes; the pace opens each scene
   up so the picture lands before the words.
3. **Ship**: one tap. It comes back as the landscape cut, the vertical cut and the
   two best Shorts (scored, with hooks), all on the Videos list, with a push
   notification when they are ready. The Look sheet's "Shorts with every ship"
   switch turns the Shorts off; the Shorts sheet still lets you pick by hand.
4. **Post**: save to the camera roll from the card. Thumbnail from the ⋯ menu.

Everything else (drawings, transitions, pace, captions on Shorts) is a default
you never have to touch.

## Drawings: the art library

`remotion/src/paper/art.tsx` is a catalogue of little animated drawings in the marker look, one per situation a
money video runs into: a piggy bank that coins drop into, a snowball rolling down a slope and growing, a plant
growing out of a pot, a rocket taking off, an hourglass that flips, a card being cut up, a target an arrow flies
into, and forty-odd more. Each is a few Lucide outlines and sketched strokes drawn on stroke by stroke (the hand
follows), then set in motion.

- Every scene picks one up by itself from the words on it, in the top corner, so two videos never use the same
  handful. `art=off` keeps a scene's corner clear; `icon=<lucide name>` draws a still outline instead.
- `art=snowball` puts a named one on any scene, with `art_at` (tl, tr, l, c, r, bl, br), `art_size` (of the height,
  0.12 to 0.8) and `art_start` (seconds).
- `[art name=rocket headline="Lift off" caption="the first ten grand"]` is a scene that is one big drawing, the
  headline written above it and the caption under.
- `scripts/art-gifs.sh` renders the whole catalogue to looping GIFs in `library/art/` (480 px, 12 fps); the
  studio's Drawings library shows them, puts them on scenes and saves them to the phone.

### Thumbnails

The studio's Thumbnail sheet (⋯ menu, or Ship) draws a 1280 × 720 thumbnail in the look you are using, from the
script: the title split into a small line and the hook, the first big number ringed in red, a drawing from the
library, the hand. Three layouts (hook, big number, question); edit the words, pick another drawing, shuffle, then
save it to the camera roll. `library/art/<name>.png` are the finished stills it draws with (`scripts/art-stills.sh`).

### The looks

The board look comes in five skins, all the same writing, hand and drawings: `theme: whiteboard` (the default),
`chalkboard` (deep green, chalk colours, a wooden ledge), `notebook` (a ruled page with a red margin, blue ink),
`graph` (squared paper, teal and orange) and `cream` (a warm card, brown ink). The studio's ⋯ menu switches them
and the preview follows.

### Traced illustrations: people and situations

Icons say "a piggy bank"; a story needs "a worried man at a kitchen table".
Those come in as line drawings (an illustrator's, or generated in one marker
style), traced to pen strokes so the hand draws them like everything else:

    python3 scripts/illus-trace.py drawing.png ../library/illus/kitchen-table.svg

finds the centreline of every stroke (not the outline, which a pen would go
round twice), orders the strokes the way a hand would, and writes an SVG.
A flat-colour illustration (black outlines round coloured fills, the way
image models like to draw) works too: `--mode auto` (the default) notices
the colour and keeps only the outlines, turning a black fill such as hair
or a suit into its rim and giving a coloured area that meets the white page
an edge. Brown or olive outlines need `--dark 70` or so (anything darker
than this counts as line) and a textured fill `--speck 60` (drop ink blobs
smaller than this).
Add the drawing to `library/illus/manifest.json` (name, about, tags,
search), then `python3 scripts/illus-import.py` puts it in the catalogue
under its name, `scripts/art-catalogue.py` updates the studio's list, and
the GIF and still scripts render it with the rest. From then on it works
anywhere a drawing does: `[art name=kitchen-table]`, `art=` on a scene, the
library search.

Twenty so far, generated as one set and traced this way, with a recurring
cast (Sam, short wavy hair and a t-shirt; Maya, long straight hair and a
jumper): `bank-queue`, `broken-car`, `budget-jars`, `car-dealer`,
`coffee-shop`, `couple-bills`, `crossroads`, `graduate`, `high-five`,
`job-interview`, `keys`, `kitchen-table`, `payday`, `pension-letter`,
`piggy-coin`, `rent-day`, `scam-call`, `shopping-bags`, `side-hustle`,
`sleep-grow`. The prompt that gets this look: "simple clean black line art
illustration, black outlines only on a pure white background, no colour,
no fill, no shading, uniform medium line weight, cartoon vector style like
a whiteboard explainer", then the cast and the situation. A word in the
narration picks the drawing, so a sentence about the jars should not also
say "payday" or the payday drawing wins.

#### The illustrated style

`brand.style: illustrated` in the header (the studio's Look sheet,
**Drawing style: People & scenes**) is a second video style. Every scene
whose words call up one of the traced drawings gets it large, on the right
half of the board, the words keeping to the left; scenes that call up
nothing stay plain. Icons (the default) is the usual style: little symbols
in the corner, only when asked for. The studio's library has a **People &
scenes** chip for the traced ones.

The board has two transitions of its own, and the illustrated style uses
them by default. After a scene with a person on it the board **clears**: the
writing and the drawing fade off in the scene's last half second and the
next scene starts on a clean board. After plain words the board **slides**:
the last drawing leaves to the left as the new one comes in from the right,
like a camera moving along a long whiteboard. `transition=wipe` (clear),
`transition=slide` or `transition=cut` on any board scene picks one by hand
(the studio's More details has the field); `keep=` scenes never clear. There
is no eraser anywhere: a full page of phrases and a `wrong=` idea fade off
the same way.

#### Takeaway cards

`[takeaway title="Fees compound too"]` is a numbered section card: a small
"Takeaway 2 of 5" above, the number drawn in a ring, the title written
large beside it. Cards count themselves in order; `n=` and `of=` override.
They are the re-hook the money channels put every minute or so, and in the
illustrated style the board clears before and after one. The studio's
**+ takeaway card** chip adds one.

#### Recap

`[recap]` before the outro writes the video's takeaways again as a checklist:
a box drawn, the line written, a green tick, one by one as the voice reaches
each (spaced out when it does not say them). With no lines of its own it
lists the takeaway cards in order; `- ` lines under the tag set your own;
`title=` replaces the "Takeaways" heading. The studio's **+ recap** chip adds
one, and its preview fills the lines from the cards the same way.

#### Picture first

In the illustrated style a text scene whose words call up a traced drawing
is picture first: the drawing fills 70 percent of the board's height on the
right, and the words keep to a column on the left as one written line, the
`board=` line if the scene has one, else the phrase that carries the
narration. Scenes with no matching drawing keep the usual page of phrases.

#### Shorts

A long video has two or three slices in it that would travel on their own.
The studio's **Shorts** sheet (⋯ menu) finds them: every run of one to five
scenes between 15 and 60 seconds is scored for what the money channels'
Shorts have in common (a number in the first line, a takeaway card, a person
in the picture, a curiosity word, a question, 20 to 45 seconds; the title
card and the outro count against), the best non-overlapping three are
listed with their reasons and a hook line each, and you tick the ones to
make and edit the hooks. They are cut vertical with captions on and the hook
pinned at the top of the frame, and your recording is cut to match. They
come back to the Videos list as Short 1, 2, 3 beside the two cuts.

On the command line, `python -m pipeline.build projects/x --shorts 3` plans
and renders them (`projects/x/shorts.json`, the studio's picks, says which
if it exists; the plan used is written to `shorts-plan.json`).

#### Pace

`pace: calm` (the illustrated style's default) gives every scene air: it
starts 1.2 seconds before its first word, so the picture is down before the
words begin, and keeps 0.6 seconds after its last, so the board has a beat
before it clears. With a voiceover the same silences go into the voice, so the
words and the speaker still move together; without one the estimate just
stretches. `pace: tight` runs the scenes back to back (the default for the
icon style); `pace.lead: 0.8` and `pace.hold: 0.4` set the numbers.

### Searching it like a GIF keyboard

In the studio, **GIFs & drawings** (in the ⋯ menu, the **+ GIF or drawing**
chip in Edit, or "Choose a drawing" on a scene) is a search box over the
whole library, the way the GIF button in WhatsApp works: type what you mean
(`lol`, `money`, `scam`, `holiday`, `tired`, `night out`) and the drawings
that fit appear as you type, best first. Chips narrow it to Money, Feelings,
Time, Ups & downs, Warnings, Life, or Work & travel. Tap one, then put it on
the scene you are on, add it as a scene, or save the GIF to your phone.

Each drawing has two word lists in `art.tsx`: `tags` are the specific phrases
that put it on a scene by themselves from the narration ("make it rain",
"scam alert"), and `search` are the everyday words that find it in the
library ("money", "lol", "no") but are too common to trigger it on a scene.

When nothing fits, the sheet offers a GIPHY search for the same words (it
opens in Safari, because the page cannot call GIPHY from inside claude.ai);
copy the GIF's link, paste it into the box under the grid and **Use it**: it
goes on the scene as a sticker or in as a picture scene, and the render
fetches it.

## Pictures, GIFs and video from your phone

In the studio, Add → "Photo or video from camera roll" (or "Take a photo",
or "GIF from a link"; a Giphy page link works) puts a picture scene in after
the one you are on. Edit on a picture scene shows the picture controls, and
every scene has a "Sticker" section for a GIF or picture on top of it.

| Control | In the script | What it does |
|---|---|---|
| Drag on the preview, or the two position sliders | `focus="40 30"` | which part of the picture stays in frame |
| Zoom | `mag=1.6` | zoom in on that point |
| Rotate, Flip | `rotate=90`, `flip=h` / `v` / `hv` | quarter turns and mirroring |
| Brightness, Contrast, Colour | `bright=1.2 contrast=1.1 sat=0.8` | colour (1 is unchanged) |
| B&W | `bw` | black and white |
| Sketch look | `look=sketch` | traces the photo as marker lines, so it sits on the whiteboard like a drawing |
| Slow zoom | `zoom=in` / `out` / `none` | the push-in over the scene |
| Start at (video) | `from=3.5` | where in the clip to start |
| Sticker | `sticker="x.gif" sticker_at=tr sticker_size=0.35` | a GIF or picture on any scene; `sticker_` + any edit above applies to it |

The edits are settings, not changes to the file, so you can go back and
change them; the preview and the render apply the same ones. Photos are
shrunk to 1920 pixels before they leave the phone. GIFs play, videos play
muted (your voice is the soundtrack).

When you ship, anything you picked on the phone is uploaded first, then the
script, so one render picks everything up. The connector carries text only,
so each file goes up as `media/<name>.b64`; the build decodes it and the
render keeps the real file on the branch. GIF links the studio could not
fetch are written to `media/sources.txt` and downloaded by the render.
Very large videos are better trimmed first, or uploaded on GitHub directly
into the project's `media/` folder.

### Moving and sizing them on the preview

A GIF, picture or drawing on a scene is grabbed on the preview the way it is
in Canva: drag it to move it anywhere, drag the white dot at its corner (or
pinch) to resize, tap ✕ to take it off. The script keeps the place as
`sticker_x` / `sticker_y` (or `art_x` / `art_y`): the centre, as a share of
the width and height, so the render puts it exactly there. A corner chip in
Edit snaps it back to a corner.

A GIF from a link (GIPHY, Tenor) only goes into the rendered video: the
studio page cannot load other sites, so on the preview it is a labelled box.
For a GIF you can see and move, save it to your camera roll first (in the
GIPHY app or site: ⋯ → Save) and add it from there.

### The corner, the little drawings, the outro boxes

**Look & style** (the "Corner & drawings…" chip under the preview, or the
⋯ menu) has the looks and three switches, kept in the script header:

- `brand.corner: on` shows the handwritten channel name in the top right (off
  unless asked for); `brand.name:` sets what it says.
- `brand.doodles: on` gives every scene a small drawing picked from its
  words. It is off by default: a scene gets a drawing or GIF only when you
  put one on it.
- `[outro cards=on]` shows the two empty end-screen boxes on the outro
  (where YouTube end-screen links sit). They are hidden unless asked for,
  because a new channel has nothing to put in them; the switch is on the
  outro scene in Edit.

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

Any tag can take `icon="piggy-bank"` (a Lucide icon name) to pick the doodle the
whiteboard look draws in the corner; without it, one is chosen from the words.

Header keys: `topic` (what the video is about; `film` for a review), `theme`
(`whiteboard`, `paper`, `finance`, `toon` or `movie`), `host` (`none` for pure motion graphics, the
default on the `finance` and `movie` themes; `painted` or `drawn` to put the
host on screen, the default on `toon`), `slug`, `kicker`, `captions: false`, any
`brand.*` (`name`, `bg`, `panel`, `text`, `muted`, `accent`, `accent2`,
`font`) and any `avatar.*` from the table above.

### The editor's pass: headlines and drawings from a recording

A draft built from your voice has the words but not the board. In the
studio, Video tab, "✦ Headlines & drawings" sends the script to Claude for
the editor's pass: a hook, a proper headline on every scene (the point, not
a fragment), a story drawing named on every text scene, stat cards only
where a real figure is said, takeaway cards at the big beats, a recap. Every
spoken word is checked against the original, word by word, before the pass
is accepted; a pass that changes a word is refused. The pass runs by itself
when a transcription is loaded and the script has no headlines yet.

### Stock b-roll: its own scene

Footage is a scene of its own, the way How Money Works cuts away from the
board to the world:

```
[broll search="crowd rushing busy street" caption="What ignoring it looks like"]
Everyone pays it and nobody looks.
```

The clip fills the whole frame with a slow push-in, the caption on a white
label in the corner, the credit beside it; a hard cut in and a hard cut back to
a clean board. The render's footage finder fetches a free-use clip for it,
Pixabay first (`PIXABAY_API_KEY`), then Pexels (`PEXELS_API_KEY`), Wikimedia
Commons and the Internet Archive, and writes `src=` and `credit=` back into the
script. With no footage yet the frame says what was asked for. The editor's
pass puts about one broll scene in every four, between board scenes.

`clip="busy high street"` on a text scene still gives the small framed card
beside the words, for when the words must stay on screen.

### Real figures and news

A finance video should show the real number, not a guess, with the publisher
and the month it was published. Put `fact=` on a stat scene:

```
[stat fact="uk.cpi" sub="and your savings pay less"]
Inflation is running at nearly four per cent.

[stat fact="base rate"]
The Bank of England base rate is four per cent.
```

Before the render, `pipeline/find_facts.py` fills `value=`, `source=` ("ONS,
September 2026") and a label from the official series: the Office for National
Statistics API (inflation, unemployment, pay growth, GDP, the saving ratio),
the Bank of England's database (Bank Rate, mortgage rates) and FRED (US
inflation, the Fed funds rate, unemployment, mortgage rates, median income, the
S&P 500). Allowances that change once a year (the ISA allowance, the Lifetime
ISA bonus, the personal allowance, the state pension, the 401(k) and IRA
limits) are fixed with their tax year and checked each April. `fact=` takes a
key or plain words; `python3 -m pipeline.find_facts --list` prints the
catalogue.

For what may happen (a rule changing, a rate rising, a government plan), a
news scene pins a real headline to the board with its outlet and date:

```
[news search="state pension age rise"]
The government is looking at raising the pension age again.
```

The render finds the most recent article from a reputable outlet (BBC, the
Guardian, the FT, Reuters, Bloomberg, the Times, the Telegraph, Sky, Which?,
MoneySavingExpert, GOV.UK and the US equivalents) through the GDELT index, or
you write `headline=`, `outlet=`, `date=` and `url=` yourself.

Every render writes `facts-report.md`: the figures filled, the headlines found,
and every sentence that states a figure or a UK/US claim without a source on
the board, for the editor's pass to verify. The rule is in EDITOR.md: real
figures with a publisher and date, the host's own numbers excepted.

### Standing rules for the pictures

- The drawing on a scene shows the moment the words describe, and the
  drawings across a video tell the story in order. Name it on the scene,
  `art="payday"`, from the library (`docs/drawing-guide.md` lists them); the
  drafter does this for every text scene. Without a name the renderer picks
  by keyword, which is a fallback, not the plan.
- Words and drawings never sit on top of each other. Landscape: the words
  keep a column on the left, the picture has the right. Vertical: the words
  sit at the top, the picture below them, the captions under that.
- Every video ends on the same page: MONEY MOVES, the yellow "Subscribe for
  the next one" button. A script that leaves the outro out gets it added.

### The hook: the first five seconds

A `[hook]` scene goes before the title: one line, big, in the middle of a
clean board, nothing else on it. `board="£420 a month = £1,000,000"` sets the
words (else the first clause of what is said); the narration is the very
first thing said, a number or a question, no greeting. The Draft sheet asks
for it, the drafted script starts with it, and a Short that opens on it
scores higher.

### The money words in colour

The figure in a line is the thing the eye should catch, so it lands in
colour: green when the line is about money growing (£420 a month, 7%, forty
years), red when the line is about money going (a fee, a loss, a debt, tax,
interest, inflation). Every other word stays in ink. It applies to the board
lines of text scenes, takeaway titles, recap and list items and the hook.

### No hand: the board draws itself

The marker hand that used to follow the writing is off. Words still write
themselves letter by letter and drawings still draw stroke by stroke, with a
little unevenness in the pace so it reads as a hand at work, but nothing sits
on top of the pictures and nothing has to travel across the board between
lines. `hand: on` in the header brings the hand back; the Look sheet has the
same switch.

### The board writes the point, not the sentence

On the whiteboard a `[text]` scene no longer writes every word you say. The
voice says the sentence; the marker writes the three to five words that carry
it (a figure and the words around it, else the first content words), and the
phrases build up on the board one under the other. When the board is full
the page fades off and a fresh one starts. Two attributes
steer it:

- `board="1% fee | a third gone"`: write exactly these lines, `|` between them.
- `wrong="Buy the dip"`: write the wrong idea first, in red, and clear it
  before the point is made.

`brand.text: full` in the header brings back whole sentences everywhere.

Standing style rule: not every spoken word goes on the video. The board
carries the point in a few words, captions stay off (`captions: off` is the
default in the illustrated style and the recommended header everywhere),
and the only place the whole sentence is shown is a Short, where sound is
often off.

### Building on the board

`keep=yes` on any scene keeps the board before it, small in the top left,
and draws this scene beside it, so an argument builds instead of swapping
pages: the fee, then the bite it takes, then the share that is. `keep=arrow`
draws an arrow from the old to the new; `keep=strike` crosses the old one
out (a wrong figure, then the right one). In Edit the switch under the
words cycles Fresh board, Keep the last board, arrow, crossed out.

### The money pictures

Four scene types draw the pictures money ideas are always drawn with, with
the figure written where it belongs on the picture. The hand draws each in
the order a person would, and the number is the point of the scene.

| Tag | What it draws |
| --- | --- |
| `[bite value="£10,000" lose="£2,800" label="A 1% fee over 30 years" sub="" source=""]` | a bar for the whole, a red hatched bite out of its end, the lost amount beside it; `pct=28` instead of `lose=` |
| `[grow from="£100" per=month years=30 rate=7% label="" source=""]` | bars rising year by year, the last one shaded, the end value written above; `to=` instead of `rate=` |
| `[pie value="33%" label="" sub="" source=""]` | a circle with a red hatched slice and the percentage on it |
| `[shrink value="£100" to="£74" years=10 label="" source=""]` | a banknote drawn, then its right part fades off and what is left is written in red; `rate=3%` instead of `to=` |

Give these six to nine seconds of narration each; the drawing paces itself to
the scene.

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
