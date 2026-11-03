"""Turn a STUDIO script into ElevenLabs-ready text: narration only, numbers and pounds spelled out the British way,
a 1-second break between sections.  usage: python3 scripts/tts-text.py <script.md> <out.txt> <title>"""
import re, sys
sys.path.insert(0, "/home/user/Portfolio/video-pipeline")
from pipeline.script_parser import parse_script
ONES="zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS="_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
def w(n):
    n=int(n)
    if n<20: return ONES[n]
    if n<100: return TENS[n//10]+("" if n%10==0 else "-"+ONES[n%10])
    if n<1000:
        r=n%100; return ONES[n//100]+" hundred"+("" if r==0 else " and "+w(r))
    for big,name in ((10**9,"billion"),(10**6,"million"),(1000,"thousand")):
        if n>=big:
            h,r=divmod(n,big)
            s=w(h)+" "+name
            if r==0: return s
            return s+(" and " if r<100 else ", ")+w(r)
def dec(x):  # "1.05" -> "one point zero five"
    a,b=x.split("."); return w(a)+" point "+" ".join("oh" if c=="0" else ONES[int(c)] for c in b)
def year(y):
    y=int(y)
    if 2000<=y<2010: return "two thousand and "+ONES[y-2000] if y>2000 else "two thousand"
    return w(y//100)+" "+(w(y%100) if y%100>=10 else "oh "+ONES[y%100])
def money(m):
    s=m.group(0)
    mm=re.fullmatch(r"£([\d,]+(?:\.\d+)?)(\s(?:million|billion))?",s)
    num=mm.group(1).replace(",",""); scale=(mm.group(2) or "").strip()
    if scale:
        return (dec(num) if "." in num else w(num))+" "+scale+" pounds"
    if "." in num:
        p,pe=num.split("."); return w(p)+" pounds "+w(int(pe)) if int(pe) else w(p)+" pounds"
    return w(num)+(" pound" if num=="1" else " pounds")
def norm(t):
    t=t.replace("GOV.UK","gov dot UK").replace("Pension Wise","Pension Wise")
    t=re.sub(r"£[\d,]+(?:\.\d+)?(?:\s(?:million|billion))?",money,t)
    t=re.sub(r"(\d+(?:\.\d+)?)%",lambda m:(dec(m.group(1)) if "." in m.group(1) else w(m.group(1)))+" percent",t)
    t=re.sub(r"\b(19|20)(\d\d)\b",lambda m:year(m.group(0)),t)
    t=re.sub(r"\b\d+\.\d+\b",lambda m:dec(m.group(0)),t)
    t=re.sub(r"\b\d{1,3}(?:,\d{3})+\b",lambda m:w(m.group(0).replace(",","")),t)
    t=re.sub(r"\b\d+\b",lambda m:w(m.group(0)),t)
    return t
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
