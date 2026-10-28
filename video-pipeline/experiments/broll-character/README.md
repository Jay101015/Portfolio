# B-roll leads, the character punctuates: the two hand-built demos

Prototypes, not pipeline code. They were run from a scratch folder holding the fonts (caveat-brush, inter-800) and
aligned-words.json (from align.py); they are kept here as the reference for building this style into the pipeline.

- demo4.py: the landscape demo (56 s, house video voice). Review: editor 8, animator 8, retention 8.
- short25.py (+ short25_base.py): the vertical Short "Can you buy a house on £25K a year?" (19 s, voice at 1.2x).
  Review: editor 8, animator 8, retention 7. Its first numbers are the channel's best Short start (LEARNINGS.md).
- align.py: the storyboard's words with the transcript's times. Note the transcript can still run 0.4 s early on
  single words, so cuts are placed on pauses measured in the sound.
- selfcheck.py: the final mix's longest run of digital silence and quietest windows.

What they do that the pipeline does not yet: rooms sliced and sized per shot (eye line from known-height objects),
walk-ins, poses mirrored to face the action, props popping on the word, cards pinned outside the camera move, a
room-tone bed under the whole mix, pauses removed inside a span, footage library clips matched per sentence.
