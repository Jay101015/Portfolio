# Drawing guide: which drawing carries which topic

The traced library, labelled by topic, so a script on a topic picks the right picture (the tags in
`library/illus/manifest.json` are what the picker actually matches; this is the human map). The
phone page with thumbnails and the prompts for the missing drawings is the "Money Moves Drawing
Guide" artifact.

## What we have (20)

| drawing | shows | topics |
|---|---|---|
| piggy-coin | Maya drops a coin in a piggy bank | saving, small amounts, getting started |
| budget-jars | Maya fills one of three jars | budgeting, pots, envelope method |
| bank-queue | four people queue at a bank counter | savings accounts, banks, waiting |
| payday | Sam smiles at a payday notification | payday, salary, income |
| sleep-grow | asleep while a plant grows coins | compounding, passive income, dividends |
| coffee-shop | Sam taps to pay for a coffee | small spends, habits, the latte argument |
| shopping-bags | Maya with five shopping bags | overspending, impulse buys |
| car-dealer | a salesman shows Sam a car with a price tag | car finance, PCP, upsells |
| scam-call | Maya alarmed on the phone, warning sign | scams, fraud, phishing |
| rent-day | landlord at the door, Sam's wallet empty | rent, landlords, broke |
| kitchen-table | a worried man at a laptop | stress, bills, debt |
| couple-bills | Sam and Maya argue over bills | couples, joint money |
| crossroads | a person at a fork, two signposts | decisions, rent vs buy, pay off vs invest |
| broken-car | Sam by a broken-down car | emergency fund, unexpected costs |
| job-interview | Sam nervous across a desk | career, pay rise, new job |
| side-hustle | Sam at night with laptop and parcels | side hustles, extra income |
| graduate | Maya in cap and gown, £ suitcase | student loans, university, first job |
| keys | an agent hands Sam house keys | first home, mortgage, deposit |
| pension-letter | an older man reads a letter, puzzled | pensions, retirement |
| high-five | Sam and Maya high-five by a rising chart | goals reached, recap |

## What's missing

Batch A (first eight videos): staircase-coins, snowball-push, fee-slice, house-scales,
contract-signing, rainy-day-umbrella, empty-fridge, subscriptions-phone, payslip, card-scissors.

Batch B (life events): debt-ball-chain, investing-app, small-basket, brown-envelope, pay-rise-ask,
moving-boxes, wedding-bill, pram-bill, friends-split-bill, retired-bench.

Batch C (reactions): sam/maya × worried, surprised, pleased, counting, thinking, facepalm
(prompts in reaction-prompts.md).

The prompts, with the shared style line, are on the guide page; when the pictures arrive they go
through illus-trace.py, the manifest, illus-import.py and art-catalogue.py like the first twenty.
