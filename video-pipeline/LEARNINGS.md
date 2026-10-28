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
| I Turned £3K Into £11K… Then Lost It (Road to £100K Ep. 1) | 9:47 | 2026-10-25 | 17 (day 2) | 4:56, 51% (2 views measured) | personal story |
| What To Do With £200, £1,000 and £10,000 After Payday | 7:29 | 2026-10-26 | 149 (day 1) | not yet in analytics | best start so far |
| Short: What to do with £200 | 0:48 | 2026-10-27 | 6 (day 1) | | |
| Short: Looking to purchase your first home? | 0:44 | 2026-10-27 | 5 (day 1) | | |
| Can You Afford a Home? (London and the UK) | 10:04 | not yet | | | first 10-minute build; levelled to -14 LUFS; ad breaks ~2:55, ~5:46, 8:10 |

## Lessons so far

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
- Open question: retention curve not in yet. When it is, note where viewers leave and why.

### Can You Afford a Home? (2026-10-27)
- Did not (production): the push-in zoom was there but at 3% per scene nobody could see it on a phone. Rule: 4–8%
  per scene, moving from the first frame (EDITOR.md). Check motion by comparing a scene's first and last frames.
- Did not: the "Watch next" preview of a whiteboard video, full-frame after a whiteboard video, was seamless; viewers
  could not tell this video had ended. Rule: `next=on` frames it as a card on a dark backdrop under "Watch next".
- Did not: three stock clips in ten minutes (18 seconds). Rule: aim for a clip every 90 seconds or so where the
  sentence names something you can film; scout first, then pin the exact clip with `stock=<id>` from the sheet.

### Rules on test (from 2026-10-28)
- WRITING.md: open loops, stakes after numbers, re-hooks every 60 to 90 seconds, a payoff before the title, an
  ending with a next step. First video written to it is the next recording. Read its retention curve against the
  house video's at 48 hours and 7 days; keep the rules that move the curve, drop the ones that do not.

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

## Tests to run next (one at a time)
1. 10 minutes vs 7 to 8: does the longer house video keep a similar average view percentage?
2. Thumbnail: a face (Jeffrey) vs no face, once Canva thumbnails are in use.
3. Shorts: open on the number ("£250 free from the government") vs a question.
4. Recordings cleaned in Descript (fillers and long pauses cut, sound left natural) vs not: compare retention in
   the first 60 seconds.
