"""Write a one-page HTML storyboard for review before rendering."""
from __future__ import annotations

import html
import json
from typing import Any

CSS = """
body{font-family:Inter,system-ui,sans-serif;background:#0b1020;color:#f4f6fb;margin:0;padding:32px}
h1{margin:0 0 4px}.meta{color:#9aa3b8;margin-bottom:24px}
.scene{display:grid;grid-template-columns:120px 1fr 1fr;gap:20px;background:#141b33;border-radius:14px;padding:18px;margin-bottom:12px;border:1px solid #ffffff14}
.n{font-size:28px;font-weight:800;color:#22c55e}.t{font-size:12px;letter-spacing:2px;color:#f5b942;font-weight:700}
.time{color:#9aa3b8;font-size:13px;margin-top:6px}.vis{font-size:14px;line-height:1.5}.vis b{color:#f5b942}
.nar{color:#d8dce8;font-size:15px;line-height:1.5}pre{white-space:pre-wrap;margin:0;font:13px/1.5 ui-monospace,monospace;color:#c7cbe0}
.warn{background:#3b1d1d;border:1px solid #ef4444;padding:10px 14px;border-radius:10px;margin-bottom:16px}
"""


def _visual_summary(sc: dict[str, Any]) -> str:
    p = sc["props"]
    t = sc["type"]
    e = html.escape
    if t == "title":
        return f"<b>Title card</b><br>{e(str(p.get('title','')))}<br><i>{e(str(p.get('subtitle','')))}</i>"
    if t == "stat":
        return f"<b>Big number</b> {e(str(p.get('value','')))}<br>{e(str(p.get('label','')))} {e(str(p.get('sub','')))}<br><small>src: {e(str(p.get('source','-')))}</small>"
    if t == "list":
        items = "".join(f"<li>{e(i)}</li>" for i in p.get("items", []))
        return f"<b>List</b> {e(str(p.get('title','')))}<ol>{items}</ol>"
    if t == "chart":
        if p.get("chartType") == "bar":
            body = ", ".join(f"{b['label']}={b['value']}" for b in p.get("bars", []))
        else:
            body = "; ".join(f"{s.get('name','series')}: {len(s['points'])} pts, {s['points'][0][1]}→{s['points'][-1][1]}" for s in p.get("series", []))
        return f"<b>{e(str(p.get('chartType','line')))} chart</b> {e(str(p.get('title','')))}<br>{e(body)}<br><small>src: {e(str(p.get('source','-')))}</small>"
    if t == "compare":
        l, r = p.get("left", {}), p.get("right", {})
        return f"<b>Compare</b> {e(str(p.get('title','')))}<br>{e(l.get('title',''))} {e(str(l.get('value','')))} vs {e(r.get('title',''))} {e(str(r.get('value','')))}"
    if t == "quote":
        return f"<b>Quote</b> “{e(str(p.get('quote','')))}” — {e(str(p.get('attribution','')))}"
    if t in ("image", "still"):
        return f"<b>Still</b> {e(str(p.get('src') or 'MISSING'))}<br>{e(str(p.get('caption','')))}<br><small>{e(str(p.get('credit','')))}</small>"
    if t == "clip":
        return f"<b>Footage</b> {e(str(p.get('src') or 'MISSING'))} from {p.get('from', 0)}s, vol {p.get('vol', 0)}<br>{e(str(p.get('caption','')))}<br><small>{e(str(p.get('credit','')))}</small>"
    if t == "poster":
        return f"<b>Film card</b> {e(str(p.get('title','')))} ({e(str(p.get('year','')))}) dir. {e(str(p.get('director','')))}"
    if t == "score":
        return f"<b>Score</b> {e(str(p.get('value','')))}/{e(str(p.get('max','10')))} — {e(str(p.get('verdict','')))}"
    if t == "avatar":
        return f"<b>Host on camera</b> {e(str(p.get('headline','')))} <small>pose: {e(str(p.get('pose','idle')))}</small>"
    if t == "outro":
        return f"<b>Outro</b> {e(str(p.get('cta','')))}"
    return f"<b>Kinetic text</b> {e(str(p.get('headline','')))}"


def write_preview(storyboard: dict[str, Any], path: str, align_report: str = "") -> None:
    sb = storyboard
    rows = []
    for sc in sb["scenes"]:
        rows.append(
            f"<div class=scene><div><div class=n>{sc['id']}</div><div class=t>{html.escape(sc['type'].upper())}</div>"
            f"<div class=time>{sc['start']:.1f}s → {sc['end']:.1f}s<br>({sc['end']-sc['start']:.1f}s)</div></div>"
            f"<div class=vis>{_visual_summary(sc)}{(' <small style=color:#9aa3b8>cues: ' + ', '.join(str(c.get('pose') or c.get('face')) + '@' + str(c['t']) + 's' for c in sc.get('cues', [])) + '</small>') if sc.get('cues') else ''}{(' <small style=color:#9aa3b8>[avatar: ' + str(sc['props'].get('pose','')) + ' ' + str(sc['props'].get('pos','')) + ']</small>') if sc['props'].get('pose') or sc['props'].get('pos') else ''}</div><div class=nar>{html.escape(sc['narration'])}</div></div>"
        )
    warn = ""
    if sb.get("timing") != "aligned":
        warn = "<div class=warn>Timings are estimated from reading pace. Add a voiceover and rebuild to align scenes to your narration.</div>"
    doc = f"""<!doctype html><html><head><meta charset=utf-8><title>{html.escape(sb['title'])} storyboard</title><style>{CSS}</style></head>
<body><h1>{html.escape(sb['title'])}</h1><div class=meta>{len(sb['scenes'])} scenes · {sb['durationSec']:.0f}s · timing: {sb.get('timing','estimated')}</div>
{warn}{'<pre>' + html.escape(align_report) + '</pre><br>' if align_report else ''}{''.join(rows)}</body></html>"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(doc)
