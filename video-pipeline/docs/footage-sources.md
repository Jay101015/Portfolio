# Where footage comes from, and where to look when a script names someone

The render searches the free stock libraries (Pixabay, Pexels, Wikimedia Commons, the Internet Archive) for every
`[broll search=...]` scene and ranks twenty results. Stock covers everyday life: phones, laptops, kitchens, streets,
supermarkets, cars, houses, coins, charts. It does not have named companies, named people or news events, and it
never will: that footage belongs to someone.

There is no "under ten seconds is free". UK fair dealing (criticism, review, quotation, news reporting) and US fair use
allow a short extract of the thing being discussed, credited, used only as far as the point needs. They do not cover
decoration. And Content ID matches fingerprints regardless of the law: a four-second keynote clip can draw a claim that
takes the video's ad revenue. On a channel working towards monetisation, claims are the thing to avoid.

## Sources that are properly free for commentary

| Who | Where | Terms |
|---|---|---|
| Microsoft | news.microsoft.com (image gallery, b-roll) | editorial use, unaltered, credited |
| Apple, Google, Amazon, Meta, Tesla, Nvidia | each company's newsroom / press page | the same: editorial use, credit |
| UK banks and apps (Barclays, Lloyds, NatWest, Monzo, Starling, Trading 212, Vanguard UK) | their press or media pages | editorial use, credit; ask when unclear |
| UK government (gov.uk, HMRC, DWP, HM Treasury) | gov.uk, the department's YouTube | Open Government Licence: free with a credit |
| ONS | ons.gov.uk | Open Government Licence |
| UK Parliament | parliamentlive.tv, the PRU | news and analysis with a credit; never in adverts, satire or comedy |
| Bank of England | bankofengland.co.uk | charts and data with a credit; its own videos are copyright, quote briefly or do not |
| US government (Federal Reserve, BLS, SEC, Treasury) | their sites and YouTube | public domain |
| EU institutions | audiovisual.ec.europa.eu | free for editorial use |
| IMF, World Bank | their media centres | editorial use, credit |

Not free: BBC, Sky, ITV, Bloomberg, CNBC and any other broadcaster; other YouTube channels; films and TV; sport.
A short quoted clip under fair dealing is a judgement each time, and the credit goes on screen for it.

## How to use one

1. Find the clip or image on the press page and copy its direct download link.
2. In `media/sources.txt` add a line: `<file name> <https link>` (for example `microsoft-copilot-demo.mp4 https://...`).
   The render downloads it before the build; the file never goes into git.
3. On the scene: `[broll src="microsoft-copilot-demo.mp4" caption="Copilot, launched this week" credit="Microsoft"]`.
   A still goes on `[still src=... credit=...]`. For a quoted clip under fair dealing, `credits: screen` in the
   header or `credit=` on that scene so the attribution is on the picture, not only in credits.txt.
4. The footage check sheet shows it beside its words like any other clip.

When a script names a company, a person or a public body, this is the first place to look, before any stock search.
