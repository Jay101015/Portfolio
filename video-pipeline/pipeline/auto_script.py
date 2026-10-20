"""Build a tagged script from a transcript, so a recording alone is enough to make a video.

Your words stay exactly as you said them: they become the narration, split into scenes at sentence ends and pauses.
Each scene gets a layout from what is in it:

- the first scene is the title (the script's title if it has one, else your first sentence);
- a sentence with a money figure or a percentage becomes a big-number scene;
- a run of sentences that start "first", "second", "step one", "number two"... becomes a list;
- a last scene that asks people to subscribe becomes the outro;
- everything else is a text scene, written on the board as you say it.

The studio can then hand the same transcript to Claude for better headlines and charts; this is the version that
works with no one in the loop.
"""
from __future__ import annotations

import re
from typing import Any

Word = dict[str, Any]

FIGURE_RE = re.compile(
    r"[£$€]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|million|billion|thousand))?\b"
    r"|\b\d[\d,]*(?:\.\d+)?\s?(?:%|per\s?cent\b|percent\b)",
    re.I,
)
ORDINAL_RE = re.compile(r"^(first(ly)?|second(ly)?|third(ly)?|fourth|fifth|next|then|finally|lastly|step\s+(one|two|three|four|five|\d)|number\s+(one|two|three|four|five|\d))\b[,:]?", re.I)
SUBSCRIBE_RE = re.compile(r"\bsubscrib|thanks for watching|see you next", re.I)
TOPIC_RE = re.compile(r"\b(today|how to|what to|why|this video)\b", re.I)

MIN_WORDS = 18  # a scene shorter than this joins the next one
MAX_WORDS = 46  # a scene stops growing at the first sentence end past this
PAUSE = 1.1  # a silence this long (seconds) ends a scene


def sentences(words: list[Word]) -> list[list[Word]]:
    """Split on sentence punctuation. A transcript without punctuation (some offline models) is split at its pauses
    instead: at the longest gaps, so a "sentence" is a breath group of about a dozen words."""
    punctuated = sum(1 for w in words if re.search(r"[.!?,;:…]$", w["w"])) >= max(3, len(words) // 60)
    gaps = sorted((words[i + 1]["s"] - words[i]["e"]) for i in range(len(words) - 1))
    # without punctuation, break at roughly one gap in twelve: the longest ones
    breath = gaps[int(len(gaps) * (1 - 1 / 12))] if gaps and not punctuated else 0.9
    out: list[list[Word]] = []
    cur: list[Word] = []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        gap = (nxt["s"] - w["e"]) if nxt else 0.0
        if (punctuated and re.search(r"[.!?…]$", w["w"])) or (gap >= breath and len(cur) >= 4) or gap >= 0.9 or len(cur) >= (40 if punctuated else 22):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def _text(ws: list[Word]) -> str:
    return " ".join(w["w"] for w in ws).strip()


UNITS = {w: i for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split())}
TENS = {w: 10 * (i + 2) for i, w in enumerate("twenty thirty forty fifty sixty seventy eighty ninety".split())}
SCALES = {"hundred": 100, "thousand": 1_000, "grand": 1_000, "k": 1_000, "million": 1_000_000, "billion": 1_000_000_000}
CURRENCY = {"pounds": "£", "pound": "£", "quid": "£", "dollars": "$", "dollar": "$", "euros": "€", "euro": "€"}


def _spoken_figure(text: str) -> str | None:
    """'ten thousand pounds' -> '£10,000', 'twenty four percent' -> '24%', 'a hundred thousand' -> '100,000'."""
    toks = re.findall(r"[a-z]+|\d[\d,.]*", text.lower())
    i = 0
    while i < len(toks):
        if toks[i] in UNITS or toks[i] in TENS or (toks[i] in ("a", "one") and i + 1 < len(toks) and toks[i + 1] in ("hundred", "thousand", "million")):
            total, cur, j, seen = 0, 0, i, False
            while j < len(toks):
                t = toks[j]
                if t.endswith("s") and t[:-1] in SCALES:  # "a hundred thousands"
                    t = t[:-1]
                if t in UNITS:
                    cur += UNITS[t]
                elif t in TENS:
                    cur += TENS[t]
                elif t == "a" and not seen:
                    cur += 1
                elif t == "hundred":
                    cur = max(cur, 1) * 100
                elif t in SCALES:
                    total += max(cur, 1) * SCALES[t]
                    cur = 0
                elif t == "and" and seen:
                    pass
                else:
                    break
                seen = True
                j += 1
            n = total + cur
            nxt = toks[j] if j < len(toks) else ""
            nxt2 = toks[j + 1] if j + 1 < len(toks) else ""
            if nxt in ("percent",) or (nxt == "per" and nxt2 == "cent"):
                return f"{n}%"
            if nxt in CURRENCY:
                return f"{CURRENCY[nxt]}{n:,}"
            if n >= 1000:
                return f"{n:,}"
            i = max(j, i + 1)
        else:
            i += 1
    return None


def _figure(text: str) -> str | None:
    m = FIGURE_RE.search(text)
    if not m:
        return _spoken_figure(text)
    v = re.sub(r"\s+", "", m.group(0))
    v = re.sub(r"(?i)per\s?cent", "%", v)
    v = re.sub(r"(?i)thousand$", "K", v)
    v = re.sub(r"(?i)million$", "M", v)
    v = re.sub(r"(?i)billion$|bn$", "B", v)
    return v


def _short(text: str, n: int = 7) -> str:
    """The gist of a sentence for a list item or a headline: its first words, without the ordinal and trailing punctuation."""
    t = ORDINAL_RE.sub("", text).strip(" ,:;.-")
    ws = t.split()
    s = " ".join(ws[:n])
    return (s[0].upper() + s[1:]) if s else s


def group(sents: list[list[Word]]) -> list[list[list[Word]]]:
    """Sentences into scenes. A scene ends at a long pause or once it is long enough; the opening line stands alone as
    the title; a run of "first / second / third" sentences is kept together as one scene; a sentence with a figure
    starts a scene of its own."""
    scenes: list[list[list[Word]]] = []
    cur: list[list[Word]] = []
    n = 0

    def close() -> None:
        nonlocal cur, n
        if cur:
            scenes.append(cur)
        cur, n = [], 0

    def ordinal(s: list[Word]) -> bool:
        return bool(ORDINAL_RE.match(_text(s)))

    for i, s in enumerate(sents):
        has_fig = _figure(_text(s)) is not None
        in_run = bool(cur) and sum(ordinal(c) for c in cur) >= 1 and ordinal(cur[-1])
        if cur and ordinal(s) and not in_run and n >= 6:
            close()  # a list starts
        elif cur and in_run and not ordinal(s):
            close()  # a list ended
        elif cur and has_fig and n >= 6 and not in_run:
            close()  # a figure gets its own scene
        cur.append(s)
        n += len(s)
        nxt = sents[i + 1] if i + 1 < len(sents) else None
        pause = (nxt[0]["s"] - s[-1]["e"]) if nxt else 0.0
        if not scenes and len(cur) == 1 and n >= 5:
            close()  # the opening line is the title
        elif ordinal(s) and nxt is not None and ordinal(nxt) and n < MAX_WORDS + 20:
            continue  # keep a list together
        elif n >= MAX_WORDS or (n >= MIN_WORDS and pause >= PAUSE) or (has_fig and n >= MIN_WORDS):
            close()
    if cur:
        if len(scenes) > 1 and n < MIN_WORDS and not ordinal(cur[0]) and not SUBSCRIBE_RE.search(" ".join(_text(c) for c in cur)):
            scenes[-1].extend(cur)
        else:
            scenes.append(cur)
    # the sign-off is its own scene (the outro), even when it follows on without a pause
    if len(scenes) > 1:
        last = scenes[-1]
        k = next((j for j, c in enumerate(last) if SUBSCRIBE_RE.search(_text(c))), None)
        if k:
            scenes[-1:] = [last[:k], last[k:]]
    return scenes


def _q(v: str) -> str:
    return '"' + v.replace('"', "'") + '"'


def script_from_words(words: list[Word], header: dict[str, str] | None = None, title: str | None = None) -> str:
    """A complete script.md: the header (kept from an existing script, else defaults) and one tag per scene."""
    if not words:
        raise ValueError("no words in the transcript")
    header = dict(header or {})
    sents = sentences(words)
    scenes = group(sents)
    if not title or title.strip().lower() in ("untitled", "from my voice", ""):
        # the line that says what the video is about, else the first line
        cands = [_text(x) for x in sents[:4]]
        pick = next((c for c in cands if TOPIC_RE.search(c)), cands[0])
        pick = re.sub(r"(?i)^(so,?\s+)?today(\s+is\s+the\s+big\s+one)?[,:]?\s*", "", pick).rstrip(".!?:, ")
        pick = pick[:1].upper() + pick[1:]
        title = (pick[:70].rsplit(" ", 1)[0] if len(pick) > 70 else pick) or "My video"
    header.setdefault("theme", "whiteboard")
    header.setdefault("host", "none")
    header.setdefault("brand.name", "MONEY MOVES")
    header["source"] = "voiceover"
    lines = [f"# {title}"] + [f"{k}: {v}" for k, v in header.items()] + [""]
    for i, sc in enumerate(scenes):
        texts = [_text(s) for s in sc]
        prose = " ".join(texts)
        last = i == len(scenes) - 1
        if i == 0:
            tag = "[title]"
        elif last and SUBSCRIBE_RE.search(prose):
            tag = '[outro title="Thanks for watching" cta="Subscribe for the next one"]'
        elif sum(1 for t in texts if ORDINAL_RE.match(t)) >= 2:
            items = [_short(t) for t in texts if ORDINAL_RE.match(t)]
            tag = "[list]\n" + "\n".join(f"- {it}" for it in items)
        elif (fig := _figure(prose)) is not None:
            tag = f"[stat value={_q(fig)}]"
        else:
            tag = "[text]"
        lines += [tag, prose, ""]
    return "\n".join(lines).rstrip() + "\n"
