# The influence: How Money Works

The channel we model the videos on is How Money Works (YouTube, about 1.7 million subscribers, nearly all of its
views on long videos). This is a working description of what it does and what we copy; it is my reading of the
channel, not a document from them, so watch three recent videos before trusting any line of it.

## What the channel does

- **The hook is a claim, not a greeting.** The first sentence is a surprising or counter-intuitive statement with a
  number in it, said flat, and the second sentence tells you why it matters to you. No "hey guys", no channel name,
  no "in this video". The title and thumbnail make the same claim in five words.
- **It explains the mechanism.** Every video is "here is how this actually works": the system behind the headline,
  with concrete examples, real figures, a "here's the catch" turn two-thirds in, and a reframe at the end that
  tells you what to do differently.
- **The narrator is dry.** Measured pace, a little sardonic, never hyped, never shouting. Jokes are one-liners
  dropped without a pause.
- **A new picture every few seconds.** Continuous stock footage (b-roll) cut on the beat of the sentences, charts
  drawn simply, bold keyword headlines on screen over the footage. No frame sits still for ten seconds.
- **Numbers on screen.** When a figure is said, it is on screen, large, as a figure.
- **A recap and a tease.** The ending restates the three points and sets up the next video; the subscribe ask is
  one line.

## What we copy, and how the pipeline does it

| How Money Works | Money Moves |
| --- | --- |
| A claim with a number opens the video | `[hook board="..." art="..."]`: the figure in colour, a drawing beside it |
| Bold headlines over footage | `board="..."` on every scene: a proper headline, the money word in colour |
| Stock b-roll cut every few seconds | `clip="busy high street"` on a text scene: a stock clip in the picture column, fetched free-use by the render; the drawings carry the cast's moments; the pace rules give every scene its own picture |
| Figures on screen, large | `[stat value="£2,400" label="..."]` only where a real figure is said |
| Sections with a turn | `[takeaway]` cards at the big beats; a "the catch" headline on the turn |
| A recap and a one-line ask | `[recap]` with the three lines; the MONEY MOVES subscribe page |

## What we do not copy

- The 15 to 25 minute length. Ours are 2 to 8 minutes; the same shape, shorter.
- Footage of real companies, news clips and screenshots: a Content ID and fair-use question we avoid. Only
  free-use footage (Pexels, Wikimedia Commons, the Internet Archive) and our own drawings.
- The anonymous narrator. The host's own voice and own numbers are the channel's edge.

## The free-use footage

`pipeline/find_footage.py` runs before every render. For a scene with `clip="..."` it searches the Internet
Archive, Wikimedia Commons and Pexels in that order, takes the first clip whose licence allows commercial use,
downloads it into `media/`, writes `clip_src=` and `clip_credit=` into the script and lists it all in
`footage-report.md`. Pexels needs a free key: `PEXELS_API_KEY` as a repository secret (pexels.com/api). Without
it, only Commons and the Archive answer, and they have far less everyday b-roll.
