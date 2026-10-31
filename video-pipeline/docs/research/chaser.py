"""The two pots, year by year, from best-stock-by-year.json.

The boring pot: £1,000 in the S&P 500 (total return, dollars) from the start of 2000.
The chaser's pot: £1,000 that buys last year's best S&P 500 stock on the first trading day of the year and holds
it twelve months (the first year, 2000, it sits in the index because there is no 1999 winner in the table).
The fantasy pot: £1,000 that somehow buys each year's best stock in advance (the hook's number).
Run: python3 docs/research/chaser.py
"""
import json
import os

here = os.path.dirname(__file__)
rows = sorted(json.load(open(os.path.join(here, "best-stock-by-year.json"), encoding="utf-8")), key=lambda r: r["year"])


def pct(v):
    return None if v in (None, "", "not found") else float(str(v).replace("%", "").replace(",", ""))


boring = chaser = fantasy = 1000.0
prev_next = None
print(f"{'year':>4} {'S&P':>7} {'boring':>9}  {'best':<6}{'gain':>8} {'next yr':>8} {'chaser':>9} {'fantasy':>12}")
for r in rows:
    spx = pct(r.get("spx_total_return_pct"))
    best = pct(r.get("best_return_pct"))
    nxt = pct(r.get("next_year_return_pct"))
    if spx is None:
        break
    boring *= 1 + spx / 100
    # the chaser holds last year's winner this year: last year's row gives what that stock did this year
    chaser *= 1 + (prev_next if prev_next is not None else spx) / 100
    if best is not None:
        fantasy *= 1 + best / 100
    print(f"{r['year']:>4} {spx:>6.1f}% {boring:>9,.0f}  {r.get('best_ticker',''):<6}{(best if best is not None else 0):>7.0f}% {(nxt if nxt is not None else float('nan')):>7.0f}% {chaser:>9,.0f} {fantasy:>12,.0f}")
    prev_next = nxt
print(f"\nboring £{boring:,.0f}   chaser £{chaser:,.0f}   fantasy £{fantasy:,.0f}  (all in dollars terms, x1.20 for pounds)")
