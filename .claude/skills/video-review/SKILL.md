---
name: video-review
description: Review a finished video for The Everyday Investor before it goes to Jeffrey - the editor, the animator, the retention psychologist and the director each judge it independently, must-fix findings are fixed and re-rendered, at most two rounds. The director also plans the picture before a long video's first build. Use after every render (long video, Short or demo), or when Jeffrey asks for a review.
---

# Video review: four independent reviewers, then fix, at most twice

Every finished video goes through this before it is sent to Jeffrey. The reviewers are separate agents so they judge
with fresh eyes, not anchored on the choices made while building it (that is how a wrongly sized character got
through once). Never review your own render in their place.

## 0. Before the first build: the director's plan (long videos)
Run `python3 video-pipeline/scripts/asset-usage.py`, then the Agent tool with `subagent_type` `director` in PLAN mode:
give it the script (script.md or the STUDIO file), the recording's length if there is one, and the project folder.
Put its scene tags into the script before building. Send Jeffrey its ASK JEFFREY list straight away (clips to film,
drawings, poses or props to make): he decides what to make, and the build goes ahead with what exists. Its NEW TOOLS
lines are pipeline work: build the ones a scene needs now, list the rest for him.

## 1. Build the review kit
```
python3 video-pipeline/scripts/review-kit.py <video.mp4> <kit dir> [--storyboard <storyboard or a Short's cut json>] [--words <words.json>]
```
Give it the words when you have them (a project's storyboard.json; a Short's projects/<slug>/.cache/short-N.json;
for a hand-built demo, write the words with their times to a json first). Put the kit dir in the scratchpad.

## 2. Run the four reviewers, in parallel, in one message
Use the Agent tool four times with `subagent_type` `editor`, `animator`, `retention-psychologist` and `director`
(REVIEW mode; run asset-usage.py first so its library/usage.md is current)
(.claude/agents/). If those types are not loaded in this session, use `general-purpose` and paste the body of the
matching .claude/agents/<name>.md as the start of the prompt. Each prompt gives: the kit dir, the video's path, the
project folder (if any), what the video is (long video, Short, demo; its topic) and, from round two, the previous
round's findings and what was changed. Never tell a reviewer what you think is wrong.

## 3. Act on the findings
- **Must fix** from any reviewer: fix it, unless it is wrong. A reviewer can be wrong (a figure it miscalculated, a
  rule it misread): check it against the source before changing anything, and when you overrule a finding, say why
  in the report. Changes to the spoken words are never made: those go to Jeffrey as notes for the next recording.
- **Nice to have**: do it only when it is quick and certain; otherwise list it.
- Re-render, rebuild the kit, and run the reviewers once more with what changed. **Two rounds at most**; what is
  still open after round two goes to Jeffrey as open, not hidden.

## 4. Send and log
Send the video with a short report: the four scores (round one, then round two), what was fixed, what was
overruled and why, and the NEXT RECORDING notes. Then, under each reviewer's name (Editor, Animator, Retention,
Director), that reviewer's IDEAS FOR JEFFREY from the last round, in its own words: Jeffrey wants to hear each
persona's improvement ideas, so never merge them into one list or drop one as a duplicate. Then add a line to video-pipeline/LEARNINGS.md under the video:
`Review: editor X, animator Y, retention Z, director W (round 2)`, so the predicted scores can be read against the real
retention graph later. Do not send a video whose round-two must-fix list still has an item a viewer would notice
without telling Jeffrey exactly what it is.
