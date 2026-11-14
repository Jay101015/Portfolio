# The editor's pass

Read LEARNINGS.md first: every video should beat the last one, and its lessons are rules here.

The channel is **The Everyday Investor** (youtube.com/@TheEverydayInvestor1): that name, never MONEY MOVES, on the
end card, the title kicker and the corner. The host says "Road to £100K" for his own series.
Every board scene carries the slow push-in (`brand.motion` stays on): a still frame reads as a slide. It is 4–8% per scene and moves from the first frame; 3% was invisible on a phone. As it pushes in the camera also pans slightly to the right (a share of the room the zoom makes, so no edge ever shows and a headline at the margin keeps about 2.5% clear).
Every long video aims for **10 minutes** (8 is the floor: YouTube only places mid-roll ads from 8 minutes). The
length comes from the script, never from slow pacing or padding: a recording under 10 minutes is flagged to Jeffrey
with the section that would add the minutes, before it is built.
When a finished recording still falls short, the ending makes up the difference, never the middle: after the last
spoken word a `[broll src="watch-next-<slug>.mp4" caption="Watch next: <its title>" credit="The Everyday Investor"
vol=1 dur=<seconds> next=on]` plays the opening of an earlier video of his with its own sound (cut at the end of a
sentence, up to about 90 seconds), framed as a card on a dark backdrop under "Watch next" so it never reads as more of
this video, then `[outro dur=20 cards=on]` holds the subscribe page for YouTube's 20-second end screen.

A draft built from a recording has the words but not the board. Before the studio shows it, give it the editor's
pass: rewrite ONLY the scene tags so the board tells the story properly. The narration is the host's own words,
transcribed and matched to the recording.

## Hard rules

- Never change, add, remove or reorder a word of narration, not even a typo or punctuation: the words are matched to
  the recording. `python3 -m pipeline.polish_check before.md after.md` refuses a pass that changes a word.
- Keep the header lines exactly as they are (`synced:`, `request:`, `slug:` and the rest).
- You may split a paragraph at a sentence boundary or merge neighbouring paragraphs, as long as the words stay in
  order. Keep every paragraph's words.
- Attribute values never contain double quotes.

## The writing check (report, never rewrite)

WRITING.md holds the retention rules for the words: open loops, a stake sentence after every big number, a re-hook
every 60 to 90 seconds, something useful before the title card, an ending with a next step. The words are
recorded, so the pass changes none of them: it reads the draft against that list and writes each miss as a
`WRITING:` line in the notes for Jeffrey (the lines are listed in WRITING.md), so the next recording has it.

## Real material first (Jeffrey, 12 November 2026)

"Every video should have something new about it... where are the images of Jensen Huang, the real snapshot of the
CNN post, the real footage? If you can find it yourself that is preferable." The Nvidia video first went out as
drawings, retyped headline cards and stock; with real photos and pages he said "so much better looking already".
- A video about a real person, company or story shows them: a free-licence photo (Wikimedia Commons, credited), the
  company's own statement on its own page, the real article where a headline is quoted. Full frame, not a small card.
- Gather before the picture is planned: write projects/<name>/real/wanted.json (pages to screenshot, Commons
  searches) and run the "Gather real material" workflow (scripts/gather_real.py); look at real/sheet.png; crop into
  media/ and use as [broll src="real-..." caption="outlet, date" credit="..."]. Credits go in the description.
- A drawing, a retyped [news] card or a stock clip is the fallback, used only where nothing real exists.
- Sensitivity is handled by which real picture is chosen and how it is captioned (admitted against alleged, nobody
  beside him), not by leaving reality out.
- Ask Jeffrey only for what cannot be found: his own app recordings, a page that blocks the screenshot.

Working on a real page. A real article or official page is not left as a still picture under cards that retype it.
The real words are marked as they are said.
- Three marks, each drawn on its cue word:
  `marks="highlight 12,18,46,7@China; box 10,52,60,14@analysts; underline 12,40,30@fell"`. The numbers are per cent
  of the picture. For a highlight and a box they are the left edge, the top edge, the width and the height of the
  rectangle. For an underline they are the left end of the line and its length.
- The highlight is the yellow marker, and the words show through it. The box and the underline are ink. `green:` or
  `red:` in front of a mark changes its colour. Red only ever means a loss, so nothing is red unless the script says so.
- Read the numbers off the page. Never guess them.
  `python3 scripts/mark-grid.py projects/<name>/media/real-page.jpg /tmp/real-page-grid.png` writes a copy of the
  picture with a numbered 10% grid over it. Find the words on that copy and read the rectangle off the grid. The
  picture itself is not changed.
- A marked page holds still. There is no push-in, so each mark stays on its words. Crop the page to 16:9 (1920 by
  1080) so the frame shows all of it.
- On a page scene the marks do the work and cards are the exception. `cards_at=strip` on the scene puts its cards two
  side by side along the foot of the frame, clear of the headline, and the caption moves to a tab on the top left
  edge of the frame. `cards_at=tr`, `br` or `bl` puts two cards in that corner. With no `cards_at` the cards go where
  they always went.
- New scripts carry the header line `brand.pagecards: strip`. It gives the strip to every picture named real-...,
  with no `cards_at` on each scene. Older scripts do not carry the line, so their videos do not change.
- Quote little. Mark a headline, one line or a phrase, never a whole article. The outlet and the date stay in the
  caption, and the credit goes in the description.
- A page scene meant for a Short is shown whole or keeps one card. The marks are drawn on a Short only where the same
  picture is shown whole (`vfit=contain`, no `vsrc=`, and `w=` and `h=` set to the picture's size). A page cropped
  upright shows no marks, so that scene keeps a card to make the point.

Pages and news: the standard. Four reviewers marked the Nvidia video down for these on 13 November 2026, after it
had been delivered. Every one is checked before the first render now (`python -m pipeline.preflight` warns on the
ones a script can show).
- Crop every page to the article: the masthead, the headline, the standfirst. Nothing else is in the frame: no
  adverts rail, no sponsored thumbnails, no cookie banner, no live price chip, no other people's photographs. An
  unrelated face beside a card about the story reads as part of the story.
- A figure that can be read on the page is the figure the voice says. If the page carries another one (a later
  price, a rounder number), crop it out, or use the page that carries the figure said.
- No card ever covers a word of a headline. New scripts carry `brand.pagecards: strip`, and the page's own words
  are marked as they are said. Cards are for what the page does not say, two at most on a page.
- A page holds still (`zoom=none`, or marked). A photograph pushes in (`zoom=in`).
- A news video carries its date. `recorded: 11 November 2026` in the header writes "Recorded 11 November 2026" above
  the title on the title card. A caption that gives someone a role says until when once it has changed ("Nvidia's
  CEO until 12 November 2026").
- When the story moves after the voice is made, the words stay and the picture says it. A card "update: he resigned
  on 12 November" lands on each line the news has overtaken. It states the fact and nothing else. The update is the
  first paragraph of the description and of the pinned comment, where a phone shows it.
- A click or a half-sound at the edge of a made voice chunk is silenced with `mute: 388.66-388.78` in the header
  (seconds in the voiceover file, half a second at most). It is never used on a word.
- The captions file of a made voice is the script's own words in the script's order. A made voice is never cut for
  "restarts": a word said twice in it is the script.

## His voice (docs/voice.md)

A script is Jeffrey talking, not an article read out. docs/voice.md holds how he talks (from his own unscripted
recording), what he has said on camera about his own money, and how far to take the fillers when the voice is made by
ElevenLabs. Write every script against it; a new claim about what he holds or has done stays in [BRACKETS] until he
confirms it.

Exact timing (`timing: exact`). A script whose voice was made here carries `timing: exact` in its header. The build
then takes every word's time from the voice's own timestamps: no transcriber, no closed pauses, no cut words, and
the same times on every machine. Cuts, cards, bars and captions land on the word that is heard. Shorts picked in
seconds on such a video carry `"clock": "exact"` at the top of shorts.json. A video on Jeffrey's own recording does
not use the line. README.md, "Exact timing for a voice the pipeline made", has the detail.

## Re-cut the scenes first

A scene is one idea. Move the paragraph breaks so every scene starts where a new thought starts (a step, an amount, a
figure, a turn such as "the catch", "what not to do", "what I actually do") and never mid-sentence or mid-phrase.
15 to 45 words a scene, a short one for a punchline. The headline must be true of every sentence in its scene: if it
is not, the scene is cut in the wrong place.

## No empty white space (Jeffrey's direction)

A board with one line on plain paper is a page the eye has nothing to do on. Every text board, stat and chart gets
something beside its words: a traced drawing (`art=`), a doodle that draws and moves (`icon=`), or text pop-ups
(`cards="..."` on any scene, each landing on its word). Two things on the page by the halfway point of its words,
and something still landing after that. The review kit lists every stretch of mostly empty page; the director
(.claude/agents/director.md) treats each as a note.
Fill with traced drawings, footage and cards first: Jeffrey was not keen on the cartoon icon doodles (a rabbit, a
sun, a rocket) beside the Gen Z boards. A doodle only where nothing else fits.

## The look (library/brand/palette.md)

The colours are the channel's, from the logo: navy ink for every word and line, the logo's green for fills and the
progress line, a deeper green for gains written in words, one red that only ever means a loss, slate for labels,
notes and source lines. So a handwritten label is never red; red on the page is always a fee, a debt or a fall.
- Footage is taped to the board: a navy frame with an offset shadow, a degree or two of tilt, a lighter grade, the
  caption on the frame's bottom edge (landscape; a Short keeps its full-bleed cut). Jeffrey's own clips first.
- Living lines: every sketched shape re-wobbles about seven times a second and the traced drawings shift a pixel
  with it, so a finished board is never dead still (`brand.boil: off` in a header turns it off).
- The key number gets a marker ring as it is said (red for a loss, green for a gain) instead of a camera punch; the
  slow push-in on every board is off (`brand.motion: on` brings it back).
- A thin green progress line fills along the top of a long video (`brand.progress: off` hides it); never on a Short.
- Drawings on boards show objects, hands and places. People only when it is the character: a traced person beside
  his set pieces reads as a second host.

## What lands by itself, and the tags that put more on the page

Automatic on every build (pipeline/craft.py):
- **Key words.** The figures said pop up big on a highlighter in the band along the bottom ("£83,000 a year",
  "7.6×", "18 years") and go after a second: never the scene's own figure, never one a card already carries, never a
  bare small number ("22"). For the viewer watching muted. Long videos only; a Short's captions say every word.
- **Cards on empty stretches.** A board that runs more than six seconds with nothing landing gets cards from the
  figures it says (red after a cost word, green otherwise), four seconds apart.
- **Count-up.** A stat's figure counts up to its value as it is said, then the ring (`count=off` writes it instead).
- **"Coming up".** The chapters' titles small in the bottom-right corner, from the first takeaway to the recap,
  ticked off as each is covered, the one in hand on the highlighter. It steps aside on footage and in a room.
  `brand.comingup: off` hides it.
- **One set piece a video** until the character's animated clips are in the library: a second one gets a warning.
- **The chapter strip.** As a takeaway card opens, the boards of the chapter just finished fly in along the top as
  small frozen frames: one big board per chapter, seen at its end. `brand.strip: off` hides it.
- **The footage gate.** A downloaded stock clip that barely moves, is too dark, is letterboxed, or has lettering or
  a logo burned in is dropped and the next candidate tried (pipeline/footage_gate.py; a clip picked by hand with
  pick= or stock= is never gated). footage-report.md lists what was gated and why.

Tags for the script:
- `marks="circle 62,40@price; arrow 30,70@word; note:the bit that matters 50,80@word"` on footage or a photo: a
  marker ring, an arrow from lower left, or a handwritten note drawn on the picture at that point (per cent of the
  picture, left to right and top to bottom) on the word. Red unless `green:` or `ink:` leads the mark.
- `anim=<loop>` on any board, stat or chart: a stop-motion scene where a drawing would go (`art_at`, `art_size`,
  `art_start` place it), six to nine seconds with a beginning, a middle and an end, moving in steps eight a second.
  Spending and bills: coins-jar, piggy-bank, card-tap, money-flies, bills-pile, receipt-print, phone-ping. Growth:
  stack-grow, bar-race, snowball, plant-grow, arrow-up. A home: house-build, deposit-jar. Time: calendar-flip,
  clock, hourglass. This against that: scales. Stories: payday-split (a payslip split into save, bills and spend),
  price-creep (a coffee's tag flips up four times, the cup shrinks), rent-day (three months of the envelope leaving
  the wallet), interest-grows (a red layer a month on a card's debt), isa-shield (the tax arrow bounces off).
  A loop plays once and holds its end state until the cut, so a scene longer than the loop keeps the picture
  (it used to start again, or fade to its shadow, under the payoff line). A loop carries its own figures
  (payday-split's £2,100 payslip, deposit-jar's £5K to £20K scale): cast it only where those figures are not
  arguing with the words; a stat about a £1,000 bonus takes a drawing (lisa-bonus), not deposit-jar. The cards
  on a board with a loop land under the written lines, on the left, as on a board with a drawing; a stat with a
  loop puts its note under the figure; a bite's cards land top right, above the bar's end (low on the right they
  covered the lost figure). `dur=` on the
  board sets how long it has when there is no recording to time it, and caps it: a `dur` shorter than the words
  cuts the scene before they end.
- `screen=laptop` on `[broll]`: the clip in a drawn laptop with a browser bar, for screen recordings; `phone=on`
  is the upright phone, which letterboxes a cropped recording (status bar and balances cut off) rather than cropping
  its sides, and draws `marks=` on the screen (per cent of the screen, not the page). A clip shorter than half its
  scene loops, which shows: cut the recording to the part you want and let the player slow it (a chart scrub at
  0.6x reads fine), or record 25 seconds in one slow scroll.
- `[outro ... dur=20 cards=on]` holds the subscribe page for YouTube's 20-second end screen; `cards=on` there is the
  end-screen flag, not a card.
- Cards and drawings never share a spot: on any board, list, stat or recap with a drawing or a loop on the right,
  the cards sit top right above it, two at a time; on a bare board they go under the lines; on a chart top left; on
  a bite top right above the bar; on footage in the right column. A board line is one colour: a line that carries a
  gain and a loss ("Nvidia +308% → 2002: −83%") is two lines. A year is never a money word, and "£1,000 → £30" is a
  loss. List lines land on their own words, so one beat a line: "2001: Nvidia, up 308%" then "2002: it lost 83%".
- Key words pop only for figures the script says; a transcriber's mishearing ("109 years") never reaches the page,
  and bare words ("never", "free") no longer pop at all.
- `pauses.ceiling: -36` in the header for a take with breaths inside its pauses: the pause closer (pauses over
  0.7 s shut to 0.4 s) otherwise treats a -40 dB breath as speech and leaves a five-second gap at a title card. The
  silences the pace adds carry the room's own tone, so the room never drops out at a cut.
- A recording sent in parts is levelled part by part before the join (each to -23 LUFS, linear gain): his 13 parts
  sat 6.4 dB apart and the final leveller, one even gain, cannot fix that. The pause closer keeps 60 ms either side
  of a cut and joins with a 25 ms crossfade; a 10 ms join on a cut that touched a word's tail read as chops.
- A smoke alarm's low-battery chirp (a 3.1 kHz beep, 100 to 300 ms, once every 30 to 60 seconds; it came through
  22 times on one take, in speech and in the pauses) is found and notched out of the take by pipeline/dechirp.py:
  a band-stop at 2.85 to 3.35 kHz and at the harmonic, only inside a gated window round each chirp, so speech is
  untouched. The build prints how many it took out and where. Still: change the battery before the next recording.
- Traced drawings never render thinner than 3 px and sit at 0.5 of the page beside a board: at 0.4 with their
  natural line they read as fuzzy grey, and a figure whose hair was a fill in the source comes out bald, so pick
  figures whose hair is drawn in lines (phone-balance-drop, sam-thinking, maya-facepalm, maya-pleased).
- `pace.lead` and `pace.hold` in the header: the air before a scene's first word and after its last (the
  illustrated style's `pace: calm` default is 1.2 and 0.6, about 1.8 s a scene; the £10K demo ran at 0.6 and 0.4
  after the retention reviewer measured 29% of the film with no words at all). A card's words must be in the
  scene's narration: "from a few pounds" on a scene that never says it landed on the wrong word.
- "tax-free" is not a cost word: the figure in "ISA: £20,000 a year, tax-free" is green. "Spend £1,000" is red
  (spending is money going), so a board about the £1,000 to enjoy says "£1,000 for you".

## Punch-ins (automatic) and sound effects (light by default)

A money or hook scene's key number gets a punch-in as it is said (the figure matched to the spoken number). The sound
effects (pipeline/sfx.py) have three levels in the script header: `sfx: light` (the default): a soft ding on the
key number and a quiet whoosh on a cut to footage only, about one sound every 20 to 30 seconds; `sfx: on`: a
whoosh on every cut, a pop on every card, a scribble as a board starts writing (175 sounds in 7 minutes: Jeffrey
turned it off); `sfx: off`: none. All sit about 20 dB under the voice.

## Loops beside a figure carry no labels

A loop (`anim=`) on a stat, pie, grow, shrink, bite, chart or compare scene draws without its written labels and
counters ("month 7", "+ interest", "BILLS", "year 3"): beside the big figure a second number argued with it.
`anim_labels=on` puts them back. On text, list and recap boards the labels stay.

## Cards keep off the drawing

On a landscape board the card column tries its usual place first and, if that sits on the drawing or loop, moves:
top right, then bottom left under the lines, then mid left, then the strip along the bottom. On a Short a traced
drawing's board puts its card above the drawing. Cards still never cover a heading or a figure.

## Chapters and captions are written by the build

After the render's timing is known, the build writes `<slug>.srt` (captions from the script's words, for Studio >
Subtitles) and the chapter timestamps from the takeaway cards into description.md's "Chapters" block (or
chapters.txt when there is none), so they never have to be read off frames by hand.

## Preflight

`python -m pipeline.preflight projects/<name>` (also at the start of every build) warns about: a recording with no
`voice:` line; the first board with no number on it; a first sentence that does not say the title's number;
"Takeaway" cards or a recap ending two videos in a row (docs/formats.md); no footage scenes. Fix the warnings
before pushing a script.

## The voice from ElevenLabs (python -m pipeline.tts)

Jeffrey's cloned voice can be made by the pipeline instead of pasted in by hand:
- `python -m pipeline.tts projects/<name> --dry-run` lists the chunks and the characters they cost; without
  `--dry-run` it makes `voiceover.m4a` and `voice.json`. Only chunks whose words changed are paid for again (the
  cache is in `.cache/tts`; in a new container unchanged chunks are cut from the take on the branch). `--redo 4,7`
  makes a new take of those chunks.
- The words are sent as said: figures spelled out the British way ("twelve thousand, five hundred and forty-eight
  pounds"), tax years as "twenty twenty-six to twenty-seven". Digits, symbols or [BRACKETS] left in the narration
  stop the run. `tts.say: ISA=eye-sah` in the header respells a word the voice gets wrong.
- Chunks are a few scenes each (about 1,500 characters), never cut inside a scene; a takeaway or title card starts a
  new chunk and a longer pause (`tts.gap` 0.45 s, `tts.section_gap` 0.9 s). Chunks are matched in level before joining.
- The repo is public: the key and the voice ID are read from `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` or from
  `~/.config/everyday-investor/`, never from the repo, and never printed. `voice.json` holds neither.
- The words are Jeffrey's: no voice is made until he has approved the script. The script carries `voice: natural`.
- Lines printed as `LISTEN:` (a chunk read much faster or slower than the rest, a hole inside a chunk, a chunk that
  came back at a different level) are listened to before the render.

## A Short's page (vertical)

One file holds the phone's frame: remotion/src/components/upright.json. The renderer lays a Short out from it
(components/layout.ts), so a fix to one zone no longer lands on its neighbour. tests/test_upright.py checks that the
zones do not overlap and that this table quotes the same numbers. To move a zone, change the file and this table
together. The numbers are the rulebook's until Jeffrey sends a screenshot of a Short on his phone.

| Zone | Where | What it is for |
|---|---|---|
| YouTube's header | the top 8% | The phone's status bar and the Shorts header. Nothing of ours goes here. |
| YouTube's title strip | the bottom 15% | The Short's title, the channel name and the sound. Nothing of ours goes here. |
| YouTube's buttons | the right 15%, from 45% down | Like, comment and share. Nothing of ours goes here. |
| Hook sticker | 8.5% to 16.5% down | The hook line on its yellow tape. |
| Hook sticker on a set piece | 7.5% to 12.5% down | Its older, smaller place, kept where the caption sits high. |
| Caption | 17.5% to 23.5% down | The words being said, on a white pill. |
| Caption on a board | 44% down | The middle of the board, under its lines and over the character's head. |
| Caption on a set piece | 13.5% down | Over the character's head in the room. |
| Stage | from 25% down. 5% to 95% across above 45% of the height, 5% to 84% across below it | The scene's own content. |
| Stage foot | 83% down with nothing under it, 71% over cards, 63% over a drawing or loop, 52% over the character | Where the stage ends. |
| Cards | 72.5% to 85% down, right edge at 84% across | The cards under the stage. They hang from that edge. |
| Cards beside a drawing or loop | from 46% across | Where the cards start when a drawing stands bottom left. |
| Cards beside the character | up to 57% across | Where the cards end when the character stands lower right. |
| Drawing or loop | 5% to 44% across, 63% to 85% down | A placed drawing or loop, bottom left. |
| Character | 55% to 81% across, 52% to 80% down | The posing character, lower right. |
| Photo opener's number | foot at 82% down, right edge at 84% across | The big number on an opening photo. |

The caption rule. On a Short the caption is always one line, on a white pill that never changes height. It shows
three words at a time at 76 px. Words too wide for the line are set smaller, down to 56 px. A caption that would
still not fit, or runs over about 28 characters, hands its last word on to the next one. Nothing wraps. The pill
sits in the caption band on every scene whose content sits in the stage. A board carries it in the middle and a
set piece carries it high. The second table says which scene is which.

The sticker rule. The sticker stays inside its band. It is one line at 72 px, or two lines at 60 px, cut where the
two lines come out most alike, so no word is left alone on the second line. After three seconds (the scroll-in
moment) it settles to 50 px, on one line when it fits. It hangs from the top of its band and never climbs into
YouTube's header. A set piece is the exception: there the caption sits high, so the sticker keeps its older
place (9% down at 72 px for three seconds, then 7.5% down at 50 px), and while it is big the caption rides just
under it.

| Scene | Caption | Where its content sits |
|---|---|---|
| stat, pie | in the caption band, 17.5% down | In the stage, centred. The figure or the pie is as big as the stage allows. |
| chart | in the caption band, 17.5% down | In the stage. The title is at its top, the source line along its foot, and the plot fills what is between, 5% to 84% across. |
| compare | in the caption band, 17.5% down | In the stage. The title is at its top, the source line along its foot, and the two boxes are stacked between them, 5% to 84% across. |
| list, clip | in the caption band, 17.5% down | From 29% down, as before. A list is not laid in the stage yet. |
| a page or a phone screen shown whole | in the caption band, 17.5% down | From 29% down, fitted whole. |
| footage or a photo | in the caption band, 17.5% down | The whole frame. |
| receipt | in the caption band, 17.5% down | In the stage. The headline is at 25% down and the strip under it runs 5% to 84% across. The source line is along the stage's foot, or beside the drawing when the scene has one. |
| text, hook, takeaway, recap | 44% down | The board's own layout: its lines above the caption, the drawing and the character below it. |
| set | 13.5% down | The whole frame, as before. |

- A phone clip is fitted between the caption band and the title strip (29% to 84% down: 72% of the width on a
  1080x1480 recording), the whole screen in view, its marks on it, the caption label on its lower right; never
  cover-fitted (the app's price readout went off the edge).
- Cards on a board, stat or chart hang from the right edge of their zone (84% across), two at a time, in the band
  under the stage. They never go under YouTube's buttons. With nothing else in the band a card may run back to
  the left margin, so a line of thirty characters stays on one line. Beside a drawing or loop the cards start at
  46% across, one card at a time when its words have to wrap. Beside the character they end at 57% across. A
  Short's cards are what fills its lower half, so the storyboard's cards must render on every scene, not only on
  footage.
- A page shown whole keeps its size, and its cards hang under the page's foot, never on it: two cards while both
  end above the title strip, else one. Real material is not shrunk to make room for cards.
- A set piece's cards hang from the far edge of their side: the left margin, or 84% across when they are on the
  right. They are no wider than the room between that edge and the character at his widest pose in the scene (a
  third of the width at least), so a long card wraps beside him and does not lie on his arm.
- A stat is laid in the stage, centred: label, figure, sub-line, source. The figure is fitted to 78% of the
  stage's width, 420 px at most and 190 px at least. A very long figure is set smaller, so its ring stays in the
  stage. The label and the sub-line grow with the figure, up to 1.6 times their usual size, while they still fit
  on one line. Over a drawing or over the character the stage is shorter, and the figure and the lines give way
  until everything fits.
- A pie is laid in the stage, centred, with its sub-line under it. Its radius is 350 px when nothing stands under
  the stage. It is smaller when the label, the sub-line and the source line need the room (about 300 px over
  cards). A slice too thin to hold its figure has the figure over the top of the circle.
- A photo opener's big number (`big=`) sits above YouTube's title: the block's foot is 82% down and it stays left
  of 84% across. The hook sticker is hidden while the opener is up, because the number is the hook. The sticker
  is back with the next scene. The block is red only when the figure is a loss (a minus sign, or a losing word
  such as "lost" or "down"). Any other figure gets a navy block. This holds on the long video too.
- The first frame is the Short's picture in the feed, so the first scene is complete on it. A Short that opens
  on a chart shows the title, the axes and every bar in pencil outline, with its label, on frame 0. A Short that
  opens on a compare shows both boxes with their headings and values on frame 0. What is said still lands when it
  is said: a bar fills and gets its figure on the spoken number. Any other first scene is already 0.8 s into its
  drawing (ink on frame 0, never bare paper with a sticker). The last board holds to the file's end, so the loop
  runs payoff to hook.
- A chart is laid in the stage. The title is at the top of the stage and the source line along its foot. The plot
  fills what is between: about 700 px over cards when the source line takes two lines, over 900 px with nothing
  under the stage. It runs 5% to 84% across, because it reaches down beside YouTube's buttons. A line chart keeps
  room for its tip figures inside that width. The bars' figures and labels are as big as the bars leave room for
  (56 px and 40 px at most). Over a drawing or over the character the stage is shorter, and the plot with it. A
  chart still draws in five seconds at most and prints its tip figures only once drawn.
- A compare is laid in the stage: the two boxes stacked, with heading, value and items centred in each. The value
  is fitted to 80% of the box's width (176 px for "Down £950") and is the same size in both boxes. It is smaller
  when the boxes are too short for it. The items are 50 px. The source line is along the stage's foot.
- `brand.pencil: on` in the script header, for new scripts: every bar chart shows its bars in pencil outline as
  soon as the axes are drawn, on the long video and on a Short. The chart never sits on empty axes waiting for
  the voice. The fill and the figure still land on the spoken number. Without the line nothing changes.
- A clip shorter than half its scene plays slower and holds its last frame.
- The sticker is a claim or a comparison with the figure in it ("Chase the hottest stock: £30. Do nothing:
  £1,280"), never a label a cold viewer cannot place ("hype pot vs boring pot").

## Length: 8 to 9 minutes

Every long video over 10 minutes has averaged about 13% watched; every one under 8 has averaged 30% or more (three
videos each way by 2026-11-09). Until a 10-minute video holds over 20%, a long video is 8 to 9 minutes: about
1,450 to 1,650 spoken words. Still over the 8-minute mid-roll line.

## The first 30 seconds, muted (retirement video's real retention)

Most first views of a long video are muted autoplay in the home feed; the retirement video kept ~20% past 0:40 and
almost all of them to the end, so the opening is where a video is won or lost, and it must work with the sound off:
- Frame one shows the title's question and its number in huge type ("£1M?"), not handwriting starting to appear.
- The first sentence says the title's number; a question title gets its short answer inside 30 seconds (the reasons
  follow). Viewers skipped to the answer near the end when it came at 11 minutes.
- One teaser line of about 8 seconds, not a list of promises; the title card at most a beat.
- The captions file (<slug>.srt) goes up with the video.

## Footage: look before the long render

After changing any footage scene, run the Render video workflow with `footage_only` ticked: it finds the clips, pins
them in script.md and publishes footage-check.png (three frames from each clip, beside the words it plays under) to
the release in a few minutes. Look at every strip; re-search or use a library clip or a board for any wrong one; then
render. A search= changed under an old src= is searched again on its own.

## No clones (docs/formats.md)

Every long video picks a format, a signature device, a chapter device, an opening and an ending that the last
two videos did not use, and records them in the ledger in docs/formats.md before the script is written. "Takeaway n
of N" cards are an option, never the default, and never two videos in a row.

## The shape

The title's number is paid off late. A viewer clicks for the figure in the title; once it is said, some leave (the
£83,000 video lost a fifth of its viewers in the 25 seconds after "£83,000" was said, at 1:30). Tease it in the
first 30 seconds, pay it in the last third or as the end reveal. And the whole video answers the title's question:
a second topic (the same video turned from house prices to AI and jobs at 2:04 and lost viewers again) is its own
video.

1. `[hook board="..." art="..."]` as the first scene, holding the first sentence or two. The hook is the attention
   grabber, How Money Works style: a counter-intuitive claim or a question with the number in it, stated flat, 4
   to 8 words on the board, the figure in it, and beside it the drawing of the moment (payday, rent-day,
   broken-car, a reaction). Never a greeting, never the channel name, never "in this video", never a vague line.
2. `[title kicker="<3 or 4 words>" subtitle="<the promise, with the number>"]` holding the rest of the opening.
3. Every `[text]` scene gets `board="<a proper headline, 3 to 8 words, that a viewer would repeat: the point of
   that paragraph, not a fragment of it>"` and `art="<a drawing name from the list below that shows the moment the
   paragraph describes>"`. The drawings must tell the story in order with the words (payday, then rent-day, then
   piggy-coin...), a reaction drawing (sam-*, maya-*) for a feeling, and the board line must not say what the drawing
   already shows. The same drawing may come back when the same moment does.
   Stock footage is its own scene, never a picture beside the words: `[broll search="<3 to 5 words of stock
   footage to search for>" caption="<the point, 2 to 6 words>"]` holding the sentence or two about the world
   (places, money, work, shops, crowds: a busy high street, a car dealership, a payslip on a desk, a bank branch,
   a supermarket till). The footage fills the whole frame with the caption on a white label and the credit, the
   way How Money Works cuts to footage (see docs/style-how-money-works.md). The search words name what is in
   the picture of the idea (things and actions: a supermarket trolley, hands counting notes, keys handed over),
   never a place or a mood for its own sake ("london rain" finds the London Eye); the clip must show what the
   sentence is about, and the render's footage-check.png is looked at before the video goes out. When the sentence
   names a company, a person or a public body (Microsoft, HMRC, the Bank of England, the Chancellor), stock has
   nothing: use that organisation's own press footage or an Open Government Licence clip, linked in
   media/sources.txt and put on the scene as src= with credit= (docs/footage-sources.md lists where to look and
   the terms); never a broadcaster's clip as decoration. Roughly one broll scene in every
   four, between board scenes, so the video moves like a documentary, on every topic: a numbers video still gets
   free-use stock between its charts (ticker screens, trading apps, a calendar turning, coins in a jar), not only
   Jeffrey's app clips (chasing-winners went out with 3 of 23; the parser now flags anything under one in five); Jeffrey, 3 November: "b-roll footage is useful", so aim for about one scene in three as footage
   where the topic allows, with one in four the floor; the render fetches it from Pixabay, Pexels,
   Wikimedia Commons or the Internet Archive (`pipeline/find_footage.py`). (`clip=` on a text scene still gives
   the small framed card beside the words; use it only when the words must stay on screen.)
   The channel's own footage comes first: `[broll lib="<name>" caption="..."]` uses a clip from library/footage
   (manifest.json says what each shows and whether it is landscape or vertical; vertical clips are for Shorts),
   before any stock search.
   **B-roll leads; the character punctuates.** Footage carries most of the picture. The character (docs/pose-library.md)
   comes in for two or three set pieces a video, at the beats that matter (the hook's payoff, the big number, the
   ending), and a set piece uses the whole scene: a background from library/backgrounds with him in it, sized to
   the room, doing one clear thing start to finish (walks in and reacts, jumps on good news, hands over the money,
   drives the car off). Never the character on every scene; never two set pieces back to back. Write one as
   `[set room=<a measured room> walk cards="..."]` with `{pose}` cues before the words (docs/pose-library.md
   "Set pieces"); keep it to one beat of 6 to 14 seconds.
4. `[stat value="<the figure>" label="<what it is, handwritten>" sub="<short note>"]` only where the narration states
   a real figure; the value is a figure actually said, formatted (£2,400, 20%). Never a stat with a made-up or
   meaningless value.
5. `[takeaway title="<the line, 3 to 7 words>" n="1" of="3"]` on the two or three paragraphs that open the big beats
   (an amount, a step, a rule), numbered in order.
6. `[recap title="<2 or 3 words>"]` with 2 to 4 `- ` lines (one per takeaway, in order) on the paragraph where the
   host sums up: the `- ` lines first, then the narration.
7. Keep an `[outro]` if there is one; one is added at render time if not.
8. Real figures, never guesses. Where the host states or leans on a figure about the UK or the US (inflation, the
   base rate, a tax allowance, the state pension, US rates, what people earn or save), the board shows the real
   number with its publisher and date: `[stat fact="<a catalogue key or plain words: uk.cpi, base rate, isa
   allowance, us inflation>" sub="<short note>"]` on that paragraph. The render fills `value=`, `source=` ("ONS,
   September 2026") and a label from the official series (ONS, Bank of England, FRED for the US; `python3 -m
   pipeline.find_facts --list` prints the catalogue). A figure the catalogue does not carry: look it up (web
   search, an official or reputable source), write `value=` and `source="<publisher>, <month year>"` yourself,
   and never round it into a different claim. Where the host says what may happen (a rule changing, a rate rising,
   the government planning something), a `[news search="<what it is about, 3 to 6 words>"]` scene holding that
   sentence: the render pins a real headline with its outlet and date (reputable outlets only), or you write
   `headline=`, `outlet=`, `date=` and `url=` from what you found. The host's own numbers (what I put in each
   month, what I earn) need no source. After a render, facts-report.md lists every sentence that states a figure
   without a source: give each one a fact, a source, a news scene, or leave it as the host's own experience.

Headlines are plain spoken English, sentence case, no hashtags, no exclamation marks. The money words land in
colour by themselves: the figure in a line is green, or red when the line is about a fee, a loss, a debt.

## The drawings (name: what it shows)

Stop-motion flipbooks (celebrate, hand-money, train; docs/drawing-guide.md) are in the library but held back: use
one only when LEARNINGS.md says their test has started, so a change in retention can be read against one thing.

- bank-queue: four people queueing at a bank counter, the clerk behind the desk
- crossroads: a person with a backpack scratching their head at a fork in the road, two signposts
- keys: an agent in a suit handing house keys to a buyer and shaking hands, the house behind
- kitchen-table: a worried man at a table with a laptop and a mug, hand in his hair
- piggy-coin: a woman at a table dropping a coin into a piggy bank, a stack of coins beside it
- sleep-grow: someone asleep in bed by a window at night, a plant growing coins on the sill
- payday: a young man smiling at his phone, a coin and a plus sign in a bubble: payday
- rent-day: a landlord at the door with his hand out, the young man holding an empty wallet
- car-dealer: a car salesman showing off a shiny car with a price tag, the young man scratching his head
- scam-call: a young woman on the phone, alarmed, hand over her mouth, a warning sign in the bubble
- couple-bills: a young man and woman at a table arguing over a pile of bills and envelopes
- shopping-bags: a young woman walking along smiling with five big shopping bags
- job-interview: the young man, nervous and sweating, across a desk from an interviewer reading his CV
- pension-letter: an older man with glasses reading a letter by a postbox, puzzled
- coffee-shop: the young man tapping his phone to pay at a cafe counter while the barista hands him a coffee
- graduate: a young woman in cap and gown with a diploma, a suitcase marked with a pound sign at her feet
- budget-jars: a young woman dropping coins into one of three jars on a shelf
- side-hustle: the young man working late at a desk lamp with a laptop and a stack of parcels to post
- high-five: the young man and woman high-fiving in front of a chart going up
- broken-car: the young man with his hands on his head beside a broken-down car, bonnet up, smoke rising
- staircase-coins: Sam climbing a staircase of coin stacks, each step taller
- snowball-push: Sam pushing a snowball bigger than himself up a slope
- fee-slice: a man in a suit cutting a thin slice from Sam's cake
- house-scales: Sam weighing a house against a rent contract on scales
- contract-signing: Sam about to sign a contract with small print, a salesman pointing
- rainy-day-umbrella: Sam dry under an umbrella while coins rain down
- empty-fridge: Sam looking into an almost empty fridge
- subscriptions-phone: Maya's phone with a stack of app icons and price tags
- payslip: Sam reading a payslip through a magnifying glass
- card-scissors: Maya cutting a credit card in half with scissors
- debt-ball-chain: Sam dragging an iron ball chained to his ankle
- investing-app: Maya smiling at a phone with a rising chart
- small-basket: Sam at a checkout with a small basket and a long receipt
- brown-envelope: Maya opening a letter at the door, worried
- pay-rise-ask: Sam in front of a boss who leans back with folded arms
- moving-boxes: Sam and Maya carrying boxes through a doorway
- wedding-bill: Sam and Maya in wedding clothes reading a long bill
- pram-bill: Sam and Maya with a pram and a long receipt
- friends-split-bill: four friends passing one bill around a restaurant table
- retired-bench: an older couple on a bench with ice creams
- stock-chart-laptop: a young man at a laptop, a chart on the screen climbing up and to the right, his hand on the mouse
- estate-agent: an estate agent with a clipboard and keys outside a terraced house, a To Let board beside her
- tax-return: a brown envelope opened on a table, a tax return form and a calculator, a hand with a pen over the form
- isa-shield: Sam holding a shield marked ISA, three arrows labelled tax bouncing off it
- lisa-bonus: Maya dropping a £1,000 note into a glass jar while a hand from above adds a £250 bonus
- pension-match: Sam and his boss each placing a coin on a stack of coins, labelled me and boss
- phone-balance-drop: Sam frowning at a phone showing a falling chart, hand on his head
- phone-balance-up: Maya smiling at a phone showing a rising chart, a small fist pump
- emergency-jar: a big glass jar labelled 3 months half full of banknotes, a spanner and a cracked phone beside it
- bnpl-boxes: Sam sitting among parcel boxes, each tagged pay later, worried
- inflation-trolley: Maya at a supermarket trolley frowning at a long receipt with a small up arrow on it
- road-to-100k: a winding road with a sign reading 100K and a small figure walking past milestones of 20K, 40K, 60K, 80K
- laptop-standing-order: a laptop showing a calendar with one date circled and an arrow to a savings jar
- cash-vs-stocks-isa: Maya at a signpost with two arms, Cash ISA one way and Stocks & Shares the other, wondering which
- overdraft-hole: Sam sitting at the bottom of a hole with a ladder up it, a bank card lying at the top edge
- credit-score-meter: Sam watching a speedometer-style dial with a needle in the middle, thinking
- student-loan-letter: Maya reading a letter at a table with a graduation cap on it
- car-finance-monthly: Sam in a car showroom looking at a price tag that reads per month, thinking
- christmas-bags: Maya with a pile of shopping bags with bows, reading a long receipt
- first-flat: Maya holding a cardboard box in an empty flat, keys in her other hand
- index-fund-basket: one big basket full of dozens of small eggs, a hand placing one more in
- sam-celebrating: Sam with both arms raised and a big grin
- maya-shrug: Maya shrugging with her palms up, no idea
- house-price-tag: a small terraced house with a large price tag hanging off it
- london-essex-map: a map outline with two places marked and a dotted railway line joining them
- deposit-wall: Sam and Maya looking up at a tall brick wall with a money bag sitting on top
- calculator-table: Maya at a table with a calculator, a pen and a sheet of sums
- shared-ownership-house: a house split down the middle, a key on one half and a rent sign on the other
- estate-agent-window: Sam and Maya looking at house listings in an estate agent's window
- mortgage-offer-letter: Sam opening a letter with a house symbol on it, pleased
- house-viewing: an estate agent showing Sam and Maya round an empty room
- train-to-london: a commuter train heading towards a city skyline
- stamp-duty-receipt: a long receipt with a big rubber stamp pressed onto it
- pub-round: three friends at a pub bar with drinks, one tapping a bank card on the reader
- online-shopping: a young woman on a sofa shopping on her phone, a stack of delivery parcels beside her
- commute-platform: a young man on a crowded train platform with headphones and a takeaway coffee, a train arriving
- family-dinner: two parents and a small child eating at a kitchen table, a toy on the floor
- hospital-desk: a young woman at a hospital reception desk talking to the receptionist, a waiting area behind
- airport-departures: a young man at an airport with a suitcase and a passport, the departures board behind him
- garden-retirement: a man in his sixties watering plants in a garden, a dog beside him, relaxed
- sam-worried: Sam, head and shoulders, worried, hand on his neck
- sam-surprised: Sam, head and shoulders, surprised, hands up
- sam-pleased: Sam, head and shoulders, grinning with two thumbs up
- sam-counting: Sam, head and shoulders, counting banknotes
- sam-thinking: Sam, head and shoulders, chin on fist, a question mark
- sam-facepalm: Sam, head and shoulders, palm over his face
- maya-worried: Maya, head and shoulders, worried, hands clasped
- maya-surprised: Maya, head and shoulders, surprised, hand on cheek
- maya-pleased: Maya, head and shoulders, grinning with a fist pump
- maya-counting: Maya, head and shoulders, dropping a coin into her palm
- maya-thinking: Maya, head and shoulders, finger on chin, a question mark
- maya-facepalm: Maya, head and shoulders, palm over her face
