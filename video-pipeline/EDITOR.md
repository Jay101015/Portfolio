# The editor's pass

Read LEARNINGS.md first: every video should beat the last one, and its lessons are rules here.

The channel is **The Everyday Investor** (youtube.com/@TheEverydayInvestor1): that name, never MONEY MOVES, on the
end card, the title kicker and the corner. The host says "Road to £100K" for his own series.
Every board scene carries the slow push-in (`brand.motion` stays on): a still frame reads as a slide.
Every long video aims for **10 minutes** (8 is the floor: YouTube only places mid-roll ads from 8 minutes). The
length comes from the script, never from slow pacing or padding: a recording under 10 minutes is flagged to Jeffrey
with the section that would add the minutes, before it is built.
When a finished recording still falls short, the ending makes up the difference, never the middle: after the last
spoken word a `[broll src="watch-next-<slug>.mp4" caption="Watch next: <its title>" credit="The Everyday Investor"
vol=1 dur=<seconds>]` plays the opening of an earlier video of his with its own sound (cut at the end of a sentence,
up to about 90 seconds), then `[outro dur=20 cards=on]` holds the subscribe page for YouTube's 20-second end screen.

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

## Re-cut the scenes first

A scene is one idea. Move the paragraph breaks so every scene starts where a new thought starts (a step, an amount, a
figure, a turn such as "the catch", "what not to do", "what I actually do") and never mid-sentence or mid-phrase.
15 to 45 words a scene, a short one for a punchline. The headline must be true of every sentence in its scene: if it
is not, the scene is cut in the wrong place.

## The shape

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
   four, between board scenes, so the video moves like a documentary; the render fetches it from Pixabay, Pexels,
   Wikimedia Commons or the Internet Archive (`pipeline/find_footage.py`). (`clip=` on a text scene still gives
   the small framed card beside the words; use it only when the words must stay on screen.)
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
