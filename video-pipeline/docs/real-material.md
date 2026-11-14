# The real-material board

Before a voice is made, one picture shows which scenes of a video use real material and which fall back to stock or
drawings. A short list asks Jeffrey only for what could not be found. Every captured page is marked usable, blocked
or covered.

EDITOR.md says "Ask Jeffrey only for what cannot be found". This is the tool that writes that list.

It reports. It fixes nothing and changes nothing in the project.

## The command

Run it from the `video-pipeline` folder.

```
python -m pipeline.realboard projects/nvidia-400-billion --out ~/board
```

`--out` is the folder the files go in. You must give it. Keep it outside the project folder.

It reads `script.md`, `real/sources.json`, `real/wanted.json` and `media/`. It takes about ten seconds.

What you get in the `--out` folder:

- `board.png`. One tile for each scene, with the picture that scene will use.
- `verdicts.md`. A verdict on every captured page, the crop check, and what the script still breaks of the standard
  for pages.
- `asks.md`. At most five things to ask Jeffrey for.
- `board.json`. The same facts, for another tool to read.

The command also prints the heading, the verdicts, the crop table and the asks.

## When to run it

1. Write the script and `real/wanted.json`. Run the "Gather real material" workflow.
2. Run this command. Read `verdicts.md` before you crop a page into `media/`.
3. Crop the pages. Run it again. Read the crop table and look at `board.png`.
4. Send Jeffrey `asks.md` if it has asks in it.
5. Make the voice only after that.

A script with no `real/` folder can be run too. The board then shows how much of it is drawings and stock, and
`asks.md` lists what to gather first.

## The board

The heading reads "13 of 46 scenes show real material". A scene counts when its picture is a file named `real-...`.

Under the heading:

- How many scenes are in each class.
- How the video opens. A long video should open on a real picture that fills the frame. If it does not, the board says
  so: "Opens on a board, not a real picture". A script with fewer than eight scenes is not judged.
- What the script breaks of the standard for pages and news. The board does not have its own rules for this. It asks
  `pipeline.preflight`, so the board and the build say the same thing.
- How many captured pages got each verdict, and how many asks there are.

Each tile carries the scene's number, its type and one class.

| Class | What it means | What the label adds |
|---|---|---|
| REAL PHOTO | A photo from `real/`, cropped into `media/`. | The author and the licence, from `sources.json`. |
| REAL PAGE | A captured page, cropped into `media/`. | The outlet, and the verdict on the capture it was cut from. |
| APP RECORDING | One of Jeffrey's own app recordings. | "check for balances". No balance or holding value is ever shown. |
| STOCK | A stock clip, found or still to be found. | The credit, or the search words. |
| BOARD | A drawing or a figure on paper. A retyped `[news]` card is one too. | What kind it is. |

A real tile has a white edge. A note in amber under a tile is something to look at. There are three kinds:

- "its capture is blocked" or "its capture is covered". The scene shows a page that cannot be used.
- What the crop check found in the scene's crop: "crop: right edge cuts text", or "both crops: advert box still in
  frame" when the upright crop has it too.
- What the standard for pages says: "4 cards and none of the page's own words marked".

A crop is matched to the file it came from by its credit. A page is credited to its site, so `credit="cnbc.com"`
finds the capture from that site. When two captures are from one site, the crop's name decides. A photo is credited
to its author. A crop with no match gets the note "no source on record".

## The verdicts

Each page capture in `real/` gets one verdict. The title rule is reliable. The pixel rules are guesses from ten
captures. They will miss some, and now and then they will flag something harmless. Look at the capture.

| Verdict | The rule | What to do |
|---|---|---|
| blocked | The page's saved title is a wall's title, such as "Access to this page has been denied" or "Just a moment". Or the page is near empty: less than 1.5% of it is anything but its background. Or no screenshot was saved. | It cannot be used. An ask is written. |
| covered | A light panel, clear of every edge, sits over a page that is dimmed everywhere else. | It cannot be used. An ask is written. |
| banner | A full-width bar of another colour runs along the bottom edge. Or one runs along the top edge with another bar below it. | Usable. Crop the bar out. |
| advert box | A large flat empty box. It can be filled, outlined, or a full-width empty band. | Usable. Crop the box out. |
| ok | None of the above. | Usable. Still crop it to the article. |

A capture can have more than one thing wrong. The worst one is its verdict and the others are listed after it.

Flat means one colour. A smooth sky or a plain wall in a photograph is not counted as a box. The rules were tried on
the 34 photographs in the Nvidia project and called every one of them ok.

The table in `verdicts.md` also says which scenes each capture belongs to. "shown in 5" means scene 5's picture was
cut from it. "its link is in 27" means scene 27 gives the page's link. "its outlet is named in 4" means scene 4
names the outlet in its `source=` or `outlet=`, which may be about another page from the same outlet.

What the pixel rules do not see:

- An advert with a picture in it, a rail of sponsored stories, or other people's photographs.
- A live price chip.
- A banner that is the same colour as the page.
- A dark dialog.

A bar along the top edge can be the site's own header. A site whose header is two bars of different colours will be
called a banner. Look before you crop the masthead off.

"ok" does not mean the page is clean. It means these rules found nothing. EDITOR.md has the standard: crop every
page to the masthead, the headline and the standfirst, with nothing else in the frame.

## The crop check

This looks at the page crops in `media/`: the `real-*.jpg` files cut from a captured page, and their upright `-v`
files. It prints a table and changes nothing.

For each crop it says, for the left edge, the right edge and the top edge, whether the edge is clear or cuts text.
An edge cuts text when it passes through a row of words. That is how a headline gets cut mid-word. The table says how
far down the picture the cut is and how tall the row is. A tall row is a headline. A short one is small print.

The bottom edge is not judged. A crop always ends somewhere in the article.

A bar or a picture that runs off the edge is not text and is not flagged. The check sees words on a flat ground.
It does not see words set over a photograph.

The "still in it" column runs the banner and advert box rules on the crop itself. A crop made from a capture with a
banner should say "ok" here. If it does not, the banner is still in the frame.

## The asks

`asks.md` has at most five lines. Each one names a scene, quotes its first sentence, and says exactly what to send.

An ask is written only when the automatic route failed:

- A page in `real/` is blocked or covered, and the script shows it, cites it, or asked for it in `wanted.json`. The
  ask is: open this link on your phone and send a screenshot of the top of the article.
- A search in `wanted.json` found no photo with a free licence. The ask is: send one you took, or the link to one on
  Wikimedia Commons.

Nothing else is ever asked for. A missing drawing, a stock clip or a figure is not an ask.

The order, most valuable first:

1. A blocked or covered page that a scene shows.
2. A blocked or covered page that a scene cites, by its link or by the outlet's name.
3. A search that found nothing.
4. A blocked or covered page that no scene names.

Within each group the earlier scene comes first. When no scene names the page or the search, the ask is tied to the
scene whose words match it best, and it says so: "the nearest scene: none names it yet".

If there are more than five, the first five are written and the file says how many were left out. Too many asks and
he stops reading them.

With no `real/wanted.json` nothing has been tried, so nothing has failed. `asks.md` then has no asks. It lists the
sources the script names with `source=` and `url=`, each with its scene. That is the list to gather first.

When there is a `wanted.json`, `verdicts.md` ends with the sources the script names. First the ones with no page in
`real/`. Then the ones where a page from the same outlet is in `real/`. That page may not be the one the scene means,
so check it by eye.

## What it does not do

- It does not fetch anything. Cleaner captures need the "Gather real material" workflow.
- It does not crop, and it does not change the script.
- It does not render. A board's tile shows the board's words on paper, not the finished drawing.
- It does not read the words on a page. It cannot tell that a figure on the page differs from the figure said.
