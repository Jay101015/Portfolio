# The editor's pass

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
   grabber: a question the viewer wants answered, or a bold claim with the number in it, 4 to 8 words on the board,
   the figure in it, and beside it the drawing of the moment (payday, rent-day, broken-car, a reaction). Never a
   greeting, never the title, never a vague line.
2. `[title kicker="<3 or 4 words>" subtitle="<the promise, with the number>"]` holding the rest of the opening.
3. Every `[text]` scene gets `board="<a proper headline, 3 to 8 words, that a viewer would repeat: the point of
   that paragraph, not a fragment of it>"` and `art="<a drawing name from the list below that shows the moment the
   paragraph describes>"`. The drawings must tell the story in order with the words (payday, then rent-day, then
   piggy-coin...), a reaction drawing (sam-*, maya-*) for a feeling, and the board line must not say what the drawing
   already shows. The same drawing may come back when the same moment does.
4. `[stat value="<the figure>" label="<what it is, handwritten>" sub="<short note>"]` only where the narration states
   a real figure; the value is a figure actually said, formatted (£2,400, 20%). Never a stat with a made-up or
   meaningless value.
5. `[takeaway title="<the line, 3 to 7 words>" n="1" of="3"]` on the two or three paragraphs that open the big beats
   (an amount, a step, a rule), numbered in order.
6. `[recap title="<2 or 3 words>"]` with 2 to 4 `- ` lines (one per takeaway, in order) on the paragraph where the
   host sums up: the `- ` lines first, then the narration.
7. Keep an `[outro]` if there is one; one is added at render time if not.

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
