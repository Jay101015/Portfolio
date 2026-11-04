# What each video taught us

Every video should beat the one before it. This file is read before every editor pass (EDITOR.md) and before
every build (COURIER.md), and updated twice after each upload: at 48 hours and at 7 days, from the channel's own
numbers (vidIQ: `vidiq_user_videos` for live counts, `vidiq_channel_analytics` with `report=audience_retention`
and `filters=video==<id>` for the drop-off curve, `report=traffic_sources` for where views came from).
YouTube's analytics lag two to three days; the per-video counts are near live.

Not every video will take off, and that is fine. Views depend on the topic and the algorithm; what we control is
whether the people who start a video keep watching. So a video is judged on its retention curve and average view
duration against the one before it, never on views alone. A video that holds viewers better than the last one is
a success at 40 views, and a video that leaks them is a lesson at 4,000. Quality rising video on video is the
goal; the views follow it, in their own time.

Each entry: the numbers, what worked, what did not, and the rule it changed. A rule that came from a lesson goes
into EDITOR.md or COURIER.md too, so it is applied, not just remembered. Keep the test list at the bottom honest:
one change at a time where possible, so a result can be read.

## Scoreboard

| Video | Length | Published | Views (when) | Avg view | Notes |
| --- | --- | --- | --- | --- | --- |
| I Turned £3K Into £11K… Then Lost It (Road to £100K Ep. 1) | 9:47 | 2026-10-25 | 11 (to 25 Oct) | 1:52, 19%; 70% gone by 0:12 | personal story; reached mostly people who knew the channel |
| What To Do With £200, £1,000 and £10,000 After Payday | 7:29 | 2026-10-26 | 155 (36 h) | ~14 s, ~3% | 141 of 155 views from YouTube recommendations; pushed for ~20 h, then flatlined once viewers left |
| Short: What to do with £200 | 0:48 | 2026-10-27 | 6 (day 1) | | |
| Short: Looking to purchase your first home? | 0:44 | 2026-10-27 | 5 (day 1) | | |
| How Much House Can You Afford (Can You Afford a Home?) | 10:01 | ~2026-10-28 | 270 impressions, 4.8% CTR (4 days, Studio) | 1:21, 13% | 73% home feed, 14% search; 12-second title card at 0:05 the likely leak; busy photo thumbnail |
| You'd Need £83,000 a Year… (Is the Dream Dead for Gen Z?) | 7:22 | ~2026-10-30 | 589 impressions, 5.6% CTR, curve accelerating (~3.5 days, Studio) | 2:14, 30%; 62% at 0:31 | taking off; 95% home feed; title card at 0:27 after the promises; one-number thumbnail; Jeffrey: 8/10 |
| I Bought the Best Stock Every Year Since 2000 (chasing-winners) | 5:58 | 2026-11-01 | | | 3 footage scenes of 23 (Jeffrey noticed); 4 Shorts; numbers at the 7-day review |

## Lessons so far
- Weekly review, 2026-11-02 (Jeffrey's Studio screenshots; vidIQ at 0 credits until 27 Nov, so no retention
  curves): the channel at 16 videos, 3,655 views, 7 subscribers; Shorts about 3,000 views, long videos about 1,200.
  The Gen Z video beat the house video on every number (8.2% vs 4.8% click-through, 33% vs 13% watched). The two
  differences that line up with it: a one-number thumbnail on white, and an opening that holds the title card until
  the promises are made. Both are already the rules (EDITOR.md, the retention-scenes skill); nothing new to add.

### £200 / £1,000 / £10,000 (2026-10-26)
- Worked: a concrete money question in the title with three amounts; 149 views in a day on a 5-subscriber
  channel, so the topic and packaging are pulling viewers in from outside the channel.
- Did not: 7:29 is under 8 minutes, so no mid-roll ads. Rule: aim for 10 minutes (EDITOR.md).
- Did not (production): silences cut into the voice at scene changes ("calm" pace) made the delivery sound broken;
  rule: voiceover videos run tight. The heavy clean-up made a clean recording watery; rule: `voice: natural`.
  Quick opening cuts ended before the writing finished; rule: writing and drawings are timed to finish inside
  short scenes. Footage that did not show the sentence (a London Eye under "top up your emergency fund", an owl);
  rule: footage-check.png is looked at before anything goes out, search words name the thing in the picture.
  Credits in the corner of footage looked like watermarks; rule: credits go in the description (credits.txt).
- Channel review #1 (28 Oct, 36 hours in): average view about 14 seconds (3%). YouTube recommended it to
  strangers within a day (141 of 155 views), then stopped once it saw them leave. So the packaging works and the
  opening does not. It opened with scene-setting ("Payday hits. The rent's gone out...") before any number.
  Episode 1 had the same shape: a story lead-in ("Just after Covid...") and 70% gone by 0:12.
  Rule (WRITING.md): a number or a sharp claim in the first sentence, specific teasers by 15 seconds, no
  scene-setting before the hook. The house video already opens this way, so it is the test.
  What success looks like next: average view above 1 minute, and views still climbing after 48 hours.
  To check: the Engagement tab's retention graph, to see whether viewers leave at 3 seconds (a thumbnail or
  title promise the opening does not keep) or at 15 (the hook itself).

### Can You Afford a Home? (2026-10-27)
- Did not (production): the push-in zoom was there but at 3% per scene nobody could see it on a phone. Rule: 4–8%
  per scene, moving from the first frame (EDITOR.md). Check motion by comparing a scene's first and last frames.
- Did not: the "Watch next" preview of a whiteboard video, full-frame after a whiteboard video, was seamless; viewers
  could not tell this video had ended. Rule: `next=on` frames it as a card on a dark backdrop under "Watch next".
- Did not: three stock clips in ten minutes (18 seconds). Rule: aim for a clip every 90 seconds or so where the
  sentence names something you can film; scout first, then pin the exact clip with `stock=<id>` from the sheet.
- Real numbers (Studio, first 4 days, published as "How Much House Can You Afford..."): 270 impressions, 4.8%
  click-through, 73% of views from the home feed and 14% from search, average view 1:21 of 10:01 (13%). The
  opening is the likely leak: a 12-second title card from 0:05 to 0:17 under "In this video, I'll show you...",
  the pattern the retention rules now forbid. The thumbnail is a busy photo whose "£111K" is hard to read small.

### Rules on test (from 2026-10-28)
- WRITING.md: open loops, stakes after numbers, re-hooks every 60 to 90 seconds, a payoff before the title, an
  ending with a next step. First video written to it is the next recording. Read its retention curve against the
  house video's at 48 hours and 7 days; keep the rules that move the curve, drop the ones that do not.

### Queued test: stop-motion flipbooks
- Three flipbooks (celebrate, hand-money, train) are built and checked, made from one generated strip each. Held
  back until the house video's retention is in, so the opening change is read on its own. Then use three or four
  of them at money moments in one video and read the retention graph at exactly those seconds.

### Shorts (2026-10-27)
- 5 to 6 views each on day one, far behind the long video. Too early to judge; check at 7 days. If they stay low,
  test a different first line and on-screen hook before changing anything else.

### Can You Afford a Home? (built 2026-10-27)
- The stock libraries have no UK homes (a search for terraced houses returned rice terraces in Asia, Kensington
  returned a puppet). Rule: scout footage first (scout.txt), and use a drawing or Jeffrey's own phone clips where
  stock has nothing. Ask Jeffrey for 10-second phone clips of his house hunt for videos like this.
- The quick transcript dropped a whole sentence (Basildon and Chelmsford). Rule: after a render, diff the script
  against the render's transcript and put back anything missing.
- The editor wrongly flagged a correct figure: stamp duty on £1.25 million is £68,750 at the rates from April 2025
  (0% to £125K, 2%, 5% to £925K, 10% to £1.5M), so Jeffrey's £69,000 was right. Rule: check every figure in the
  recording before building, and work any tax figure out band by band from the GOV.UK rates page before calling
  it wrong.
- Four drawings showed a couple (estate agent's window, viewing, deposit wall, moving boxes) in a video Jeffrey
  asked to be about one buyer. Rule: the people in the drawings match who the video is for; look at every drawing
  on a contact sheet of the render before it goes out, not only the footage.
- Loudness varied: the long video came out at -16 LUFS and the Shorts between -15 and -18, though the voice was
  levelled to -14 before rendering (the render and the cuts lose some). YouTube never turns a quiet video up.
  Rule: every finished file is levelled to -14 LUFS as the last step of the render (build.py `level_audio`).
- Reached 10 minutes with a "watch next" preview of the £200 video and a 20-second end card. To judge at 7 days:
  how many viewers stay into the preview, and whether the £200 video gets views from the end screen.

### Demo: b-roll leads, the character punctuates (2026-10-28)
- Review: editor 6, animator 7, retention 6 (round 1, v2); editor 5, animator 6, retention 7 (round 2, v3);
  editor 8, animator 8, retention 8 (final check, v4). Jeffrey scored v1 7.25 (sizing off, a motorway for Essex).
- Cuts made from the storyboard's word times clipped words ("For", the end of "£310,000"): those times agree with
  the recording on average but single words can be a second out. Rule: cut a hand-built edit on the measured times
  in transcript.json, at the quietest point between two words.
- The recording has patches of digital silence where the noise gate zeroed it (67.2 s, 311.1 s). A cut into one, or
  room tone taken from one, drops the sound to nothing. Rule: cut outside the gated patches and lay a continuous
  room-tone bed under the whole edit.
- Captions built from the script showed words Jeffrey did not say ("per year" for "a year"). Rule: captions follow
  the take, not the script.
- A card with a figure the voice does not say ("nearly 3x", "salary × 4.5") is a fault, even when it is right.

### Shorts demo: what £25K a year buys (2026-10-28)
- Review: editor 7, animator 7, retention 7 (round 1); editor 8, animator 8, retention 7 (round 2).
- The transcript's word times can run 0.4 s early in places (around "small towns, or a terraced"): a cut placed on
  them landed mid-word. Rule: place every cut on a pause measured in the sound itself, not on a word time.
- On a vertical slice of a room he must stay clear of the Shorts overlays: feet above the bottom 15% (the title),
  body left of the button column (right 15%). Cards go beside him, captions high (about 19% down).
- Retention's ceiling here is the script, not the edit: open on a claim, not a bare salary; give each number its
  stake out loud; put Jeffrey's own numbers in.
- Posted as "£25K Salary? Here's the House You Can Afford". 30 views 8 minutes after upload, the
  fastest start yet (the earlier Shorts had 5 to 6 views on day one; the salary-ladder Short about 20 soon after
  posting). Check at 48 hours and 7 days: views, "viewed vs swiped away", average percentage viewed.
- Channel, 48 hours to 2026-10-29 (Studio real time): 1,085 views. £200/£1,000/£10,000 long video 569 (woke up
  this week after a near-flat start), £25K Short 338, £250K Short 143, house long video 18. The long video is
  where watch hours come from: find its traffic source, and point the Shorts at long videos (Related video link).

### Set pieces built into the pipeline (2026-10-29)
- First pipeline-made test (a 47 s slice of the house recording, two set pieces, three footage scenes, plus a Short
  the planner cut): Review: editor 6, animator 8, retention 7 / Short 4 (round 1); editor 6, animator 7,
  retention 7 / Short 7 (round 2). Round two's must-fixes were then fixed and checked by eye, not reviewed again.
- Found by the reviewers and fixed in the pipeline: every chunked render had 20-40 ms of digital silence at each
  15 s chunk join (the voice is now laid back over the joined picture in one piece); Shorts opened and closed on a
  blank page; a Short's last word was cut (its edge on the transcript's early end time; edges now snap to measured
  pauses); the planner ended a Short on a setup line and hooked on a bare salary; a clip shorter than its scene
  looped (a freeze and a jump back; it now plays slower); numbers said over footage had no cards.
- Rule: a character walking out of frame reads as "the end" on a phone: no exits inside a Short.
- Open: the planner could lift the sharpest claim to the front as a cold open (retention's idea); the footage
  library needs more landscape UK homes and a saving shot (the street pan had to carry two scenes).

### Is the Dream Dead for Gen Z? (built 2026-10-29)
- Review: editor 4, animator 6, retention 6 (round 1); editor 6, animator 8, retention 7 (round 2). Round two's
  must-fixes were then fixed in a final render and checked by eye, not reviewed again.
- Then rebuilt with a director (a fourth reviewer for the picture) and Jeffrey's own material (desk poses, his AI
  chat and fund-holdings screen recordings, trades clips): Review: editor 5, animator 7, retention 7, director 6
  (round 1); editor 6, animator 7, retention 7.5, director 7 (round 2). Still picture 178 s -> 29 s; mostly empty
  page 195 s -> about 115 s. Shorts (round 2): 5-7 out of 10 each, then their layout fixed and checked by eye.
- Found on the way and fixed in the pipeline: the picture drifted 1.5 s behind the voice over 7 minutes (each render
  chunk's sound ran past its picture and the join pushed the next chunk later; chunks are now joined as picture only
  under a one-piece sound track); the chunk-join dropouts came back whenever footage had its own sound (the preview's
  sound is now mixed into the one-piece track); a wordless card covered the line before it (it now gets its own beat
  in room tone); the transcriber dropped 7 s (a build warning now names a scene whose words were barely heard);
  captions took the transcriber's mishearings of short content words ('bulls' for 'doors'); a news lookup refused
  (HTTP 429) put its search words on screen; every pose had a white strip cut through his soles.
- Rule: Jeffrey's direction, no empty white space: every board gets a drawing, a moving doodle or text pop-ups, two
  things on the page by the halfway point of its words (EDITOR.md, the director's third rule).
- Jeffrey reads at about 175 words a minute, not 159: a 1,540-word script came out at 7:49. Rule: 10 minutes is about
  1,750 spoken words at his pace. He also left out the personal-plan section, so the two lines that promised it were
  cut from the take at measured pauses (an open loop costs more than a shorter video).
- Found by the reviewers and fixed in the pipeline: the stop-motion strips have no tags, and their empty pattern
  matched every scene, so every illustrated text board showed the same train strip; board= with several lines beside a
  drawing only wrote the first line (the promises and the disclaimer never showed); a card with no words (the title)
  took its time out of the scene before it and covered the last line said there (it now gets its own beat in room
  tone); the compare always put the cross on the left (good=left); a slowed clip played a found film's titles; the
  limiter after levelling (true peak -0.7 became -2.0); non-breaking spaces now hold ("Gen Z?" on one line).
- The stock libraries have no electricians or tradespeople (searches returned hens and keyboards). Rule: a board with
  a doodle, or Jeffrey's own phone clip, for trades; never take the first search result for a job on trust.
- The library's "Sam" drawings are a curly-haired lookalike of the set-piece character: next to a set piece they read
  as an off-model double. Rule: on a video with set pieces, boards use Maya, objects or doodles, never Sam.
- Figures on screen must be the words said ("39K", "16%", "8,400", "over 15,000"), even where the source is more exact.
- Next recording: his own numbers in the plan; a spoken one-line disclaimer and a specific comment question; end on a
  bridge to the next video, not "thank you for watching, like and subscribe"; say "ISA", "uni" and "ChatGPT" clearly
  (Shorts cut from the take carry captions).
- Real numbers (Studio, first 2 days, published as "You'd Need £83,000 a Year..."): 122 impressions and still
  climbing, 8.2% click-through, 89% of views from the home feed, average view 2:30 of 7:38 (33%). Hook, stakes,
  footage by 0:08 and the title card only at 0:27; thumbnail one big figure ("7.6x your salary"), a drawn figure
  and a house on white. The retention reviewer had scored it 7.5; the house video was built before the reviews.

### Animation: what moves and what does not (2026-10-30)
- Jeffrey's verdict on the stop-motion character: "very choppy, not 5 seconds of legit animation". Pose swaps on twos
  with a hold jiggle read as slides, not motion. A rig test (the standing drawing cut into head, torso, arms and
  legs, moved smoothly) was "so much worse": a detailed drawing cut into parts reads as a paper doll. Both routes are
  closed for this character (experiments/rig/ is kept as the record, not for use).
- Kling (image-to-video, about 50 credits a 5 s clip) is the route that works. Two of the first six clips were
  usable, both from a seated front-facing desk drawing: a typing-then-shock reaction and a typing-then-lean-back.
  Rules from the test: start from a front or three-quarter drawing that shows the whole outfit (the side view came
  back as a different person); one clear action per 5 s clip, never a walk plus a turn; put the style lines ("clean
  black ink line art on white, no shading, no colour, including inside the mouth") at the very front of the prompt
  (the first clip shouted with a red mouth, the second, prompted that way, has no colour in any frame); name his
  face, hair, jumper with pushed-up sleeves and rolled jeans in every prompt. The library entries are still to make.
- The retention reviewer and the director both measured the same thing on the money graphics: a single shape on
  plain paper for 30 s (0:35-1:07 of the animation demo). Rule: every money graphic carries cards (the demo's fixes).

### Quick wins in the pipeline (2026-10-30)
- Sound effects under the voice (pipeline/sfx.py) and a punch-in on the key number: the first cut (the Gen Z
  opening, before and after) has not been heard by anyone yet; the effects measure 21.5 dB under the voice, 175
  events in 7.6 minutes (91 card pops, 53 cut whooshes). Jeffrey listened and did not like them: off by default now
  (`sfx: on` to try again). Rule: his taste is editorial and clean (the flat thumbnail, no icon doodles, no GIFs, no
  effects); add polish, not gimmicks.
- The punch-in must land on the figure that is on screen, not the first number said: "2021" is a year, "one" in
  "there's one our parents never paid" is a pronoun, and "thirty-nine thousand" is the salary before the £1,300 the
  stat shows. It now matches the spoken number to the figure in the scene's value/to/lose/board and only then falls
  back to the longest run of number words (tests in tests/test_sfx.py).
- Ink on frame 0: the hook was already writing before frame 0 in its own clock, but the first scene faded up from
  blank paper, so the first frame was empty anyway. Two rules have to agree for an opening to work.

### The look, from the logo (2026-10-30)
- Jeffrey sent the channel logo (navy, white, a green arrow) and signed off a palette built from it
  (library/brand/palette.md): navy ink, the logo green for fills, a deeper green for gains in words, one red that
  only means a loss, slate for labels and notes. He did not want a navy title card or outro: every page stays on
  the white board. Rule: red was the default colour of every handwritten label; now a red word is always a loss.
- Built on it: footage taped to the board in a navy frame (landscape only; the Shorts cut stays full-bleed), living
  lines (every sketched shape re-wobbles about 7 times a second, the traced drawings shift a pixel with it), a marker
  ring round the key number on the word that says it (instead of the camera punch; the slow push-in on every board
  is off), a progress line along the top, a paper grain tile. The ring's size comes from the font (0.38 em a
  character in Caveat Brush): the first guess of 0.5 em drew a ring over the label and the underline.
- Rendering here (not on the runner): a 48 s cut stalled three times on a delayRender timeout at the default two
  browsers and 120 s. Chunks of 300 frames, one browser (`--concurrency=1`) and a 240 s timeout rendered it first
  time with no retries. The runner's own chunked render with retries is the same idea.
- What he does not want, in one list, so it is not tried again: sound effects, icon doodles, GIFs, a stop-motion or
  paper-doll character, a navy title card. What he likes: little animations, text pop-ups, a clean editorial page.

### Animations and drawings (2026-10-31)
- Built, all on by default on the board look: figures count up and get a ring on their word; the figures said pop
  up as key words on the highlighter along the bottom (never the scene's own figure, never one on a card or in the
  chart's data, never a bare small number); a board over six seconds with nothing landing gets cards from its
  figures; marks (`marks=`) drawn on footage and photos on their word; five drawn loops (`anim=`); a laptop frame
  for screen recordings; the chapters' titles ticking off in the corner (it steps aside on footage and in a room);
  a takeaway card opens with the last chapter's boards along its top; a quality gate on downloaded stock (too
  still, too dark, letterboxed, lettering burned in); one set piece a video until the animated clips exist.
- Spoken figures are harder than they look: "percent" alone is not a number ("a few percent"), "thousand." with a
  full stop ends a run unless the dot is stripped, "three pound fifty" is £3.50, "twenty-four year olds" is an age,
  and a bare "22" says nothing on a card. The rules are in pipeline/craft.py with tests; a new oddity goes there.
- The colour rule caught two more reds that were not losses: the takeaway kicker and the handwritten labels in the
  money graphics. Rule: every `accent2` in the renderer is a loss or it is wrong.

### Stop-motion loops (2026-10-31)
- Jeffrey liked the drawn loops and asked for more stop motion. Seventeen now (`anim=`), drawn by code from the
  sketch primitives, so each costs nothing and always matches the hand; they move in steps, eight a second, the
  pace of a flip book, with the lines boiling between steps. What he did not like was the stop-motion *character*
  (a person swapped between poses); small objects doing one thing each read as animation, not as a slide show.
- A loop on an illustrated board replaces the auto-picked drawing: with both, the loop sat on a stranger's shoulder.
  Rule: one picture per beat; the loop is the second thing beside the words, never on top of a first thing.
- Jeffrey scored the first seventeen 5/10 and asked for more and longer. What moved them: each became a small scene
  of six to nine seconds with a beginning, a middle and an end (the receipt prints, says TOTAL, tears off and
  drops); properly drawn objects (the pig has ears, a snout and a tail; the notes have a £); and the craft of
  animation on top: a squash on every landing, a wobble after it, a wind-up before a move, a fade instead of a snap.
  Rule for any new loop: it is a scene, not an icon that twitches.
- Scoreboard: the first seventeen loops 5/10; the twenty-three scenes 8.5/10 (Jeffrey, 2026-10-31). The gap was
  not more loops but each loop being a scene with craft in it. The same test applies to anything new on the page.

### Demo: I just got paid £10K (2026-10-31)
- A 2:30 silent demo on estimated timing, built to show the look with everything on: five drawn loops, cards,
  key words, the chapter strip, the coming-up ticks, a bite, a chart, a taped clip with a drawn circle.
- Review: editor 6, animator 6, retention 6, director 6 (round 1; a demo gets one round, so the fixes went in
  without a second score). All four found the same things, which is the useful part:
  - Three of the five loops were miscast: a loop carries its own figures (payday-split's £2,100 payslip,
    deposit-jar's £5K to £20K scale, interest-grows' £1,581) and beside a stat about other numbers it argues with
    the words. Rule: a loop goes where its own story is the beat; otherwise a drawing. The calendar flipped months
    under "30 days" (now it counts the days and holds the 30).
  - Loops restarted or faded to their shadow before the cut, under the payoff line. Now a loop plays once and
    holds its end state.
  - Cards landed on the loops (the card placer thought a board with `anim` had no picture), the stat's note ran
    under the loop, the hook's card sat on the character's head, and the hook's one-line headline ran under the
    loop. All four were the same bug: `anim` sets `art=off`, and four places asked "is there art?".
  - Red where there was no loss: the title and recap underlines, "tax-free" (the "tax" in it), "Spend £1,000", a
    key word after "pay tax." in the previous sentence, a circle on footage (red by default). Each is now a rule.
  - The bite rang "thousand" (its value) instead of "two hundred" (its loss) and wrote the £200 four seconds before
    the word. The punch now prefers the lose figure and the bite waits for it.
  - A card whose words are not in the scene's narration landed on the wrong word ("from a few pounds").
  - 29% of the film had no words: the illustrated default pace (1.2 s lead, 0.6 s hold a scene) is a lot of air on
    a 17-scene video. The demo runs at 0.6/0.4 (`pace.lead`, `pace.hold`). Decide the default from the next real
    video's retention graph, not from a reviewer.
- What a frame grid catches in a minute that reviewers take ten on: pull one frame per scene from the first chunks
  while the rest renders. Three rounds of fixes went in before the reviewers saw the file.
- Chunked local render recipe, improved: 300 frames a chunk, three browser tabs on drawn scenes, one tab on the
  chunks that decode a clip; a fix to one scene re-renders only its chunks and the parts are joined again.

### Chasing winners (built 2026-11-01, Jeffrey's recording)
- The first long video cut to his own recording in the new look: 13 phone-recorded parts joined, 5:45 of speech,
  transcribed on the GitHub runner (the cloud session cannot fetch the speech model). He skipped five scripted
  lines; the build kept their boards with guessed timing, so the first render showed two boards nobody spoke over.
  Rule: after the first transcript, read the per-scene match (a scene under 40% heard was skipped) and cut those
  scenes from the script before anyone reviews.
- Review: editor 5, animator 5, retention 7, director 5 (round 1). The figures were all right; the picture was not:
  cards on the lines and on the drawings (one placement rule for cards on a board with a drawing was missing),
  list lines written seconds ahead of the words because a line carried two beats, the marks on his phone clips
  never drawn (the drawn phone never mounted the mark layer), a transcriber's "109 years" on the highlighter, the
  room dropping out at every cut, a five-second pause the closer could not see past his breaths. Each is a rule
  now (EDITOR.md).
- Review: editor 6.5, animator 6, retention 7.5, director 6 (round 2). Round two's own finds: the pause closer had
  turned three of his restarts into stammers (a restart cut now removes the half-said word), whisper stamped one
  sentence on one instant so a list wrote ahead of the voice (a de-spike pass re-times such runs), and the new
  top-right card column needed its own rules for bites, clippings, charts and pies. Open after round two: no set
  piece, no watch-next clip in the 20-second outro, the chart on a linear axis (the £30 decade is a floor, not a
  cliff), the cast mixed across drawings, the 1.3-second holdings clip held still, and every list the same frame.
- Jeffrey's own notes on the sent cut: the audio slightly choppy and uneven, some drawings blurry and bald. Measured:
  the 13 phone parts sat 6.4 dB apart (the final leveller is one gain, so the spread stayed); the pause closer joined
  with 10 ms fades on cuts that could touch a word's tail; two record-button knocks near full scale, one the first
  thing heard; about fifteen lip clicks at speech level in the pauses. Now: parts levelled to -23 LUFS before the join
  (every 30 s window within 0.7 dB), 60 ms margins and a 25 ms crossfade at each cut, knocks in pauses zeroed and
  filled with room tone, ffmpeg's adeclick over the take. Drawings: a 3 px minimum stroke, 0.5 on the page, and
  figures whose hair is drawn in lines (a traced fill comes out bald). Editor's verdict on the pass: 7, levels and
  joins resolved; animator's: 7, drawings resolved.
- Jeffrey heard his smoke alarm in the sent cut: a low-battery chirp at 3.09 kHz, 100 to 300 ms, 22 times across
  the take (as loud as -19 dBFS in a pause, masked inside words elsewhere). Found from its narrowness (13 dB above
  the bands either side, which speech never holds for that long) and taken out with a gated band-stop
  (pipeline/dechirp.py, now in the voice chain after the de-click); the sent video and the four Shorts were
  patched the same way without a re-render (audio re-muxed, loudness unchanged at -14.5 LUFS).
- Retention's best mark yet for an opening: number, counter-number, three promises, title by 0:33, the last promise
  paid off in the same words. Keep writing openings that way.
- Ask for next time: the VUAG holdings page scrolled slowly for 10 s; app charts recorded in one slow 25-second
  scroll with no taps; say the live number with its date so it never needs a headline.

### Chasing winners: the four Shorts (2026-11-01)
- Review: editor 7/6/6/6, animator 5/4/5/5, retention 7/5.5/7/6, director 5/4/7/5 (round 1); editor 8/7.5/6/6.5,
  animator 7/7/6/7, retention 7.5/7/7/6, director 6/7/7/5 (round 2; Shorts 1 to 4). Round one's finds were the
  vertical page itself, not the cuts: the renderer dropped every card on a drawn scene in a Short, the first frame
  was bare paper with a sticker and the last a bare tail, captions sat on a list's rows and a pie's label, a phone
  clip was cover-fitted so its price readout ran off the edge, the chart was a sixth of the page, and a 1.3 s clip
  looped with jumps. Now in EDITOR.md as "A Short's page": bands for the sticker, the caption, the figure and the
  cards; the first scene already into its board (0.8 s; 2.6 s for a stat, 3.6 s for a pie) and the last held; a
  phone clip fitted 29% to 84% down with its marks; figures landing on their words (count-ups, written figures, a
  chart's tips, a pie's small slice in green); a short clip slowed to 0.3x and held. Round two's finds: the one
  transcript word that flipped a stat ("it is up" heard as "not"; the caption said the opposite), a ring on an
  empty part of the holdings page, cards wanted through every beat of a long scene (a Short's lower band should
  land one every 3 to 4 s), and the phone clip's foot under the Shorts title strip. Fixed and re-rendered without
  a third review round.
- Jeffrey, after it was posted: the long video had almost no b-roll (3 footage scenes of 23, all his app clips;
  the channel's rule is about one in four). A numbers topic still needs stock between the charts. Now flagged by
  the parser under one in five, in EDITOR.md and in the director's plan.
- Open, told to Jeffrey: the chart's linear axis (the £30 decade is a floor); the trap board's second line in one
  go; the hook's money-flies loop runs out before "£1,000" is said; the hourglass idles once it has run (an
  "again" cue); every inner cut still opens on a bare page for half a second (a head start on every scene, not
  only the first); a card over a phone clip's rows; Sam three sizes across the set.
- Ask for next time: a 5-second cold-open line per Short on the take; the figure in every sticker; the Sandisk
  quote page and the Nvidia 2001-2002 fall as phone clips; a two-jars drawing (hype and boring); an "owns
  everything" drawing; a baited-trap drawing; the holdings page as one slow 10 s scroll.

### What went right on the £83,000 video (Jeffrey: "taking off", 2026-11-02)
- The numbers: 589 impressions in about three and a half days and accelerating, 95% from the home feed;
  click-through 8.2% at two days, 5.6% once YouTube widened it to strangers (a normal fall as the test grows).
  Average view 2:14 of 7:22 (30%). Retention 62% at 0:31 and level to about 1:28: the best hold on the channel.
- What made the first 90 seconds hold: a title with one specific number; a thumbnail with one big figure
  ("7.6x your salary") on white; a hook, stakes, footage by 0:08, three promises, the title card only at 0:27;
  then a picture change every 6 to 10 seconds through the cost-of-living run (shrink, footage, stat, footage,
  stat), a third of the running time footage. Keep all of it.
- Where they left: the curve falls from about 62% to 50% between 1:30 and 1:55, exactly where the £83,000 the
  title promises is said (the 20-second set piece at 1:30). Viewers came for that number, got it, and some went.
  A second step around 2:04 to 2:50 follows the turn to AI and jobs, a topic the title does not mention. From
  about 4:00 the line is flat near 30% to the end: the ones who stay for the advice stay.
- Rules: the title's number is the end reveal or the last third, never in the first two minutes (tease it
  early, pay it late); everything in the video serves the title's question, and a second topic gets its own
  video. Into EDITOR.md.

- Jeffrey's handoff, 3 November (docs/channel-brief.md): retitling to a search-style, viewer-first title with a
  money number is what moved both stalled videos (house: 48 to 200+ impressions; £83,000: 11 to 738). Chasing
  winners got the biggest first test (1K impressions in 2 days) but lost half its viewers by 0:40 (1:12 of 5:58):
  its first sentence says the title's answer, £30. Same lesson as the £83,000 drop at 1:30: pay the title late.

### Do You Really Need £1 Million to Retire? (built 2026-11-04, ElevenLabs clone of Jeffrey's voice)
- Review round 1: editor 6, animator 5, retention 7 (predicted 26% average view, 58% at 0:30), director 5. Every
  figure checked band by band. The faults were all in the picture: six fallback stock searches found the wrong
  thing (chickens for "still renting", hair clippers for "working longer", calligraphy for "lost pension pots",
  a café for "annuity or drawdown", a metro in Asia for London, a door against a green screen for "gardening");
  the coming-up checklist sat on every bottom-right drawing all chapter; red used where nothing is lost (a rule
  of thumb, tax relief, the state pension); rings narrower than "4%" and "3x"; the first frame an empty page.
- Rules: a stock search is a guess, so check footage-candidates.png and pin by id (stock=) before the build, or use
  a library clip or a drawn scene for anything stock cannot show (UK renting, lost paperwork, annuity vs drawdown);
  the checklist shows only at chapter changes; a voice clone gets pace.lead 0.4 and pace.hold 0.3 (no breaths to
  hide a long gap in); proof-read the take's transcript against the text ("under 40 in" came out "and").
- Both uploads were takes of part 1; the transcript caught it before anything was sent. Check part order and
  coverage on every multi-part voice.

## Tests to run next (one at a time)
1. 10 minutes vs 7 to 8: does the longer house video keep a similar average view percentage? Leans no (13% at 10:01
   against 33% at 7:38), but not a clean result: the two openings differ too, so the length is not proven guilty.
2. Thumbnail: a face (Jeffrey) vs no face, once Canva thumbnails are in use.
3. Shorts: open on the number ("£250 free from the government") vs a question.
4. Recordings cleaned in Descript (fillers and long pauses cut, sound left natural) vs not: compare retention in
   the first 60 seconds.

## Retirement round 2 (editor 6.5, animator 6, retention 7.5, director 6.5)
- A broll scene's `src=` wins over its `search=`: changing the search alone keeps the old clip. To re-find footage,
  delete `src=` and `credit=` too, then look at the clip (six frames) before it goes in. Round 2 lost every footage
  fix to this.
- Rings are sized by measuring the figure on a canvas in the display face (digits as '0', tabular-nums); the glyph
  table guessed digits too narrow and cut the last '0', '%' and 'x'.
- "tax relief" is good news: isLoss no longer reads it as a tax, so the relief slice is navy.
- A compare's cards go in the strip under the boxes, two at a time, never over a heading.
- A list row lands on its figure ("£1,492"), not on its first two words, which matched the first row.
- Check the numbers and labels drawn into a loop before casting it: interest-grows shows a red £1,581 debt and
  stack-grow a "year N" counter, both wrong beside a growth figure.
