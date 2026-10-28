"""storyboard words (the corrected text) with the transcript's times (accurate): match the two word lists, take the
transcript's times for matched words and spread the rest evenly across their gap"""
import difflib, json, re, sys
LIB = '/home/user/Portfolio/video-pipeline'
def norm(w): return re.sub(r"[^a-z0-9£$]", "", w.lower().replace('$', '£'))
def load():
    sb = json.load(open(f'{LIB}/projects/afford-a-home-uk/storyboard.json'))
    S = [w for sc in sb['scenes'] for w in (sc.get('words') or [])]
    T = []
    for w in json.load(open(f'{LIB}/projects/afford-a-home-uk/transcript.json'))['words']:
        if T and (w['w'].startswith(',') or w['w'].startswith('%') or (w['w'].startswith('-') and T[-1]['w'] in ('S',))):
            T[-1] = dict(w=T[-1]['w'] + w['w'], s=T[-1]['s'], e=w['e'])
        else:
            T.append(dict(w))
    return S, T
def align():
    S, T = load()
    a, b = [norm(w['w']) for w in S], [norm(w['w']) for w in T]
    m = difflib.SequenceMatcher(None, a, b, autojunk=False)
    out = [None] * len(S)
    for i, j, n in m.get_matching_blocks():
        for k in range(n): out[i + k] = (T[j + k]['s'], T[j + k]['e'])
    # unmatched runs: spread between the neighbours
    i = 0
    while i < len(S):
        if out[i] is None:
            j = i
            while j < len(S) and out[j] is None: j += 1
            lo = out[i - 1][1] if i else 0.0
            hi = out[j][0] if j < len(S) else S[-1]['e']
            step = (hi - lo) / (j - i)
            for k in range(i, j): out[k] = (round(lo + step * (k - i), 3), round(lo + step * (k - i + 1), 3))
            i = j
        else: i += 1
    return [dict(w=s['w'], s=o[0], e=o[1], sb=s['s']) for s, o in zip(S, out)], m.ratio()
if __name__ == '__main__':
    W, r = align()
    print('match ratio', round(r, 3), len(W))
    import statistics
    for lo in range(0, 500, 25):
        d = [w['s'] - w['sb'] for w in W if lo <= w['s'] < lo + 25]
        if d: print(f'{lo:4d}-{lo+25:<4d} n={len(d):3d} drift median {statistics.median(d):+.2f} max {max(d,key=abs):+.2f}')
    json.dump([dict(w=w['w'], s=w['s'], e=w['e']) for w in W], open(sys.argv[1] if len(sys.argv) > 1 else '/dev/null', 'w'))
