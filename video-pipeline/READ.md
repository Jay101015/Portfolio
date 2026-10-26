# The Everyday Investor: what we have built, and the tools behind it

A phone-first studio and a render pipeline that turn a recording, or a few typed lines, into a whiteboard
explainer video in the style of How Money Works, two or three times a week, with no editing by hand.
This file is the map. The detailed rules live in README.md, EDITOR.md, COURIER.md and docs/.

## 1. The loop, start to finish

1. **Record or type on the phone.** The studio (https://claude.ai/artifact/VB5NA2S3VMxxKTUHRWtvgn) takes a
   voice memo, a written script, or a topic and a hook that Claude turns into a draft.
2. **Send.** The studio files a job; the courier (a Claude Code session) pushes it to the repository branch
   `claude/video-pipeline`.
3. **Transcribe.** A GitHub Actions run transcribes the recording with Whisper, cuts it into scenes at the ideas,
   and the courier gives the draft the editor's pass (hook, headlines, drawings, footage, real figures).
4. **Render.** A second run finds free-use footage, fills in real figures and headlines, renders landscape,
   vertical and up to two Shorts, publishes them as a GitHub release and commits what it found back to the branch.
5. **Watch and post.** The courier brings the videos back into the studio's Finished list, you get a push
   notification, you save them to the phone and upload.

Typical run time on the free GitHub runner: 6 minutes for a 2-minute video, 25 to 30 for a 9-minute one.

## 2. The studio (the phone app)

An artifact page, version 91, that works on iPhone Safari. What it does:

- **Draft flow**: topic, hook, the one number, numbers and sources, then Claude writes the script in the channel's
  tagged format. A hook step is built in. A sample script shows the format.
- **Record**: a teleprompter to read from, or just talk; the recording uploads with the draft and the scenes are
  rebuilt from what was actually said. Voice levels are cleaned up on the runner (pipeline/enhance.py).
- **Preview**: every scene type drawn in the whiteboard look as it will render, with the money words in colour,
  the drawings, footage placeholders, the real-figure placeholders and the news clipping.
- **Edit sheet**: per scene, the fields that matter (board line, drawing name, footage search, fact key, caption).
  Drag drawings and stickers into place on the preview.
- **Claude in the page**: polish (the editor's pass, checked so no spoken word changes), rewrite a scene, write
  the whole draft, and an offer bar that loads Claude's re-cut of a draft when one is waiting.
- **Media**: camera roll photos, GIFs and video onto any scene, with focus, zoom, turn, flip, brightness, contrast,
  black and white and a sketch look.
- **Art library**: 52 traced whiteboard drawings (people, moments, reactions) plus doodles and icons, searchable
  like a GIF keyboard; a drawing guide in docs/drawing-guide.md.
- **Thumbnail maker**, **Drafts** (saved per user), **Finished videos** (every render, downloadable in pieces),
  **Look sheet** (hand on or off, captions, text density).

## 3. The script format (projects/<slug>/script.md)

A title line, header lines (`theme: whiteboard`, `host: none`, `brand.style: illustrated`, `captions: off`,
`topic:`), then scenes: a tag line, then the words said in that scene.

| Scene | What it is |
|---|---|
| `[hook board= art=]` | The first five seconds: a claim or a question with the number in it, and a drawing |
| `[title kicker= subtitle=]` | The title card |
| `[text board= art=]` | A board line (a proper headline) and the drawing of that moment |
| `[broll search= caption=]` | Stock footage filling the whole frame, with a caption label and the credit |
| `[stat value= label= sub= source=]` | One big number, written on the board |
| `[stat fact="uk.cpi"]` | The same, filled at render with the real figure, publisher and month |
| `[news search=]` | A real headline pinned to the board as a clipping: outlet, date, link |
| `[takeaway title= n= of=]` | A numbered card for each big beat |
| `[recap title=]` + `- ` lines | The summary |
| `[list]`, `[compare]`, `[chart]`, `[quote]` | Steps, this-versus-that, numbers over time, a quote |
| `[bite]`, `[grow]`, `[pie]`, `[shrink]` | The money pictures: a fee bite, compound growth, a share, inflation |
| `[still]`, `[image]`, `[clip]` | A framed photo, a generated picture, a framed clip beside the words |
| `[art name=]`, `[outro]` | A drawing on its own; the sign-off (added automatically, always the same page) |

Scenes cut at ideas, never by length. Not every spoken word goes on the board.

## 4. The pipeline (video-pipeline/pipeline)

| Module | Job |
|---|---|
| `script_parser.py` | The tagged markdown into a storyboard |
| `transcribe.py`, `align.py`, `sync.py` | Whisper transcription, word timings, matching the draft to what was said |
| `auto_script.py` | Builds scenes from a recording alone, cut at thoughts and breaths |
| `polish_check.py` | Refuses an editor's pass that changes a spoken word |
| `find_footage.py` | Free-use footage for broll and clip scenes: Pixabay, Pexels, Wikimedia Commons, Internet Archive; writes footage-report.md |
| `find_facts.py` | Real figures and headlines: ONS, Bank of England, FRED, GDELT; writes facts-report.md |
| `build.py` | Everything together: decode uploads, fit clips, timings, render with Remotion, storyboard.html |
| `shorts.py` | Picks and renders the Shorts from the best slices |
| `enhance.py` | Voice clean-up |
| `courier.py` | Splits videos into 15 MiB pieces for the studio |
| `film.py`, `gen_images.py`, `host_rig.py`, `preview.py` | Film-review mode, generated pictures, the old host rig, the storyboard page |

Tests: `cd video-pipeline && PYTHONPATH=. pytest -q tests` (65 pass). Renderer: `cd remotion && npx tsc --noEmit`.

## 5. The renderer (video-pipeline/remotion)

Remotion, React. The whiteboard look: marker handwriting that draws itself (no hand by default; `hand: on`
brings it back), per-letter wobble, sketch lines and underlines, the money words green and losses red, a board
that slides or wipes between scenes, the illustrated style with the traced drawings big beside one line, full-frame
footage scenes with a hard cut, the news clipping, the takeaway cards, the recap, the money pictures, and the same
The Everyday Investor subscribe page at the end of every video. Landscape 1920x1080 and vertical 1080x1920 from the same
script; Shorts get a pinned hook banner.

## 6. The services we have access to

| Service | Used for | Key |
|---|---|---|
| GitHub Actions (free runner) | Transcribe and render runs; releases hold the videos | the repo's own token |
| Pixabay | Stock footage, first choice | `PIXABAY_API_KEY` secret: set and working |
| Pexels | Stock footage, second choice | `PEXELS_API_KEY`: not set yet (free at pexels.com/api) |
| Wikimedia Commons, Internet Archive | Public-domain and CC footage and photos | none |
| Office for National Statistics API | UK inflation, unemployment, pay growth, GDP, saving ratio | none |
| Bank of England database | Bank Rate, mortgage rates | none |
| FRED (St Louis Fed) | US inflation, Fed rate, unemployment, mortgages, income, S&P 500 | none |
| GDELT | Real headlines from reputable outlets | none |
| Whisper (faster-whisper) | Transcription with word timings, on the runner | none |
| Claude (in the studio page) | Drafting, polishing, rewriting scenes | the page's own access |
| Claude Code (courier sessions) | Pushing jobs, the editor's pass, bringing videos back, notifications | this account |
| Gamma | Generated pictures and the traced-drawing sources | key kept in the scratchpad only |
| Adobe tools | Background removal and vectorising for the art library | connector |
| Artifact storage and database | The studio's drafts, jobs and finished videos | the artifact |

Keys never go in the repository. The Pixabay key lives as a GitHub secret and in the session scratchpad; the Gamma
key only in the scratchpad.

## 7. The standing rules (settled with you)

- Not every spoken word goes on the board: a headline a viewer would repeat, 3 to 8 words.
- No marker hand. The board draws itself.
- Drawings never overlap the words, and they tell the story in order with the words.
- Every video ends on the same The Everyday Investor subscribe page. No "education, not advice" line on the title.
- The hook grabs: a claim or a question with the number in it, with a drawing, never a greeting.
- Scenes are cut at ideas, never by length; the editor's pass re-cuts before anything else.
- Money words in colour: green for the figure, red for a fee, a loss, a debt.
- Footage is its own full-frame scene, about one in four, hard cut in and out.
- Real figures with a publisher and a date for anything about the UK or the US; your own numbers excepted.
- How Money Works is the model: docs/style-how-money-works.md says what we copy and what we do not.

## 8. Which model to run

Opus 5.5 for everyday work (edits, fixes, logs, the courier); Sonnet 5.5 for routine checks and lookups;
Haiku 5.5 for polling and file handling; Fable 5.1 only for deep research, redesigns across the parser, renderer
and studio, and faults that survived two attempts. `/model` switches a session.

## 9. Where things are

- Repository: jay101015/portfolio, branch `claude/video-pipeline`, folder `video-pipeline/`
- Projects: `video-pipeline/projects/<slug>/` (script.md, draft.md, voiceover, media/, reports, timing.json)
- Releases: https://github.com/Jay101015/Portfolio/releases (tag `demo-<slug>`)
- Runs: https://github.com/Jay101015/Portfolio/actions
- Secrets: https://github.com/Jay101015/Portfolio/settings/secrets/actions
- Rules: README.md (the manual), EDITOR.md (the editor's pass), COURIER.md (the courier's steps),
  docs/style-how-money-works.md, docs/drawing-guide.md, docs/monetisation-plan.md, docs/niche-study.md

## 10. Still on the table (ranked, not built until you say)

1. Pace: tighter scenes, a new picture every few seconds
2. Argument shape: setup, turn, payoff in every video
3. Visual density: more footage, less bare board
4. A music bed
5. Hook tension and two-part titles
6. Evidence cards (a chart or a document for every claim)
7. The "who benefits" beat
8. A news field in the Draft flow
9. A rewrite of the style sheet
10. A demo made entirely from footage
