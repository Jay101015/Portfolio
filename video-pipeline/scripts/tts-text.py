"""Turn a STUDIO script into ElevenLabs-ready text: narration only, numbers and pounds spelled out the British way,
a 1-second break between sections.  usage: python3 scripts/tts-text.py <script.md> <out.txt> <title>"""
import re, sys
sys.path.insert(0, "/home/user/Portfolio/video-pipeline")
from pipeline.script_parser import parse_script
from pipeline.tts import say as norm  # the same words the pipeline's own voice step sends (python -m pipeline.tts)
src, out, title = sys.argv[1], sys.argv[2], sys.argv[3]
sb=parse_script(open(src).read())
paras=[]; section=[]
for s in sb["scenes"]:
    n=(s.get("narration") or "").strip()
    if not n: continue
    if s["type"]=="takeaway" and section:
        paras.append(" ".join(section)); section=[]
    section.append(norm(n))
paras.append(" ".join(section))
body="\n\n<break time=\"1.0s\" />\n\n".join(paras)
open(out,"w").write(body+"\n")
left=re.findall(r"[\d£%]",body)
print("chars",len(body),"leftover digits/symbols",len(left))
