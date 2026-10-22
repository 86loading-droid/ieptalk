"""교사용 지도서 추출본(JSON, 파일당 1권) → data/guide/<학년>-<교과id>.json + index.json
실행: python3 tools/guide-build.py <추출본 폴더>
추출본은 지도서 원문 텍스트에서 단원명·단원 목표·성취기준·차시 계획을 원문 그대로 옮긴 것(원문 대조 검증을 거친 것)."""
import json, glob, os, re, sys
SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'guide')
SUBJ = {'국어': 'kor', '사회': 'soc', '과학': 'sci', '수학': 'math', '음악': 'music', '미술': 'art', '체육': 'pe', '실과': 'prac', '진로와 직업': 'career', '일상생활 활동': 'dl'}
cur = set()
for f in glob.glob(os.path.join(os.path.dirname(__file__), '..', 'data', 'cur', '*.json')):
    if f.endswith('index.json'): continue
    for areas in json.load(open(f))['groups'].values():
        for a in areas: cur.update(s['c'] for s in a['stds'])
def norm(c):
    c = c.strip().strip('[]').replace(' ', '')
    c = re.sub(r'^0(\d)', r'\1', c)
    c = re.sub(r'^(\d+)음(\d)', r'\1음악\2', c); c = re.sub(r'^(\d+)사(\d)', r'\1사회\2', c)
    c = c.replace('사회-', '사회')
    c = re.sub(r'-(\d)$', r'-0\1', c)  # [4수학02-1] → 4수학02-01
    return c
NAME_MATCHED = ('체육',)  # 중·고 체육: 단원 쪽에 코드가 없어 성취기준 문장 속 단원명으로 짝지은 것
groups, books = {}, []
for f in sorted(glob.glob(os.path.join(SRC, '*.json'))):
    j = json.load(open(f)); rel = j['file']
    subj = j['subject'].strip(); grade = j['grade'].strip()
    m2 = re.match(r'^초(\d)\s*[~∼\-]\s*(\d)$', grade)
    grades = [f'초{g}' for g in range(int(m2[1]), int(m2[2]) + 1)] if m2 else [grade]  # 두 학년 공통 책(초1~2 등)은 두 학년 모두에
    if subj == '통합교과': keys = [(g, sid) for g in grades for sid in ('bs', 'ss', 'jl')]
    elif subj.startswith('일상생활'): keys = [('공통', 'dl')]
    else: keys = [(g, SUBJ[subj]) for g in grades]
    matched = subj in NAME_MATCHED and grade in ('중', '고')
    units = []
    for u in j['units']:
        m = [norm(c) for c in u.get('stds', {}).get('main', [])]; r = [norm(c) for c in u.get('stds', {}).get('rel', [])]
        m = list(dict.fromkeys(m)); r = [c for c in dict.fromkeys(r) if c not in m]
        lessons = [{'p': l.get('part', '').strip(), 'n': str(l.get('n', '')).strip(), 't': l.get('t', '').strip(), 'c': [x.strip() for x in l.get('c', [])]} for l in u.get('lessons', []) if l.get('t')]
        no = str(u.get('no', '')).strip()
        units.append({'u': f"{no}. {u['title'].strip()}" if no and not u['title'].startswith(no) else u['title'].strip(),
                      'b': (u.get('book') or j.get('book') or '').strip(), 'g': [g.strip() for g in u.get('goals', [])],
                      'm': m, 'r': r, **({'k': 'name'} if matched and m else {}), 's': lessons})
    book = os.path.splitext(os.path.basename(rel))[0]
    for k in keys:
        groups.setdefault(k, []).append({'book': j.get('book') or book, 'from': rel, 'units': units})
    books.append({'file': rel, 'subject': subj, 'grade': grade, 'units': len(units), 'lessons': sum(len(u['s']) for u in units)})
os.makedirs(OUT, exist_ok=True)
for f in glob.glob(os.path.join(OUT, '*.json')): os.remove(f)
index = {'source': '교육부·국립특수교육원, 2022 개정 특수교육 기본 교육과정 교사용 지도서(초등 1~6학년, 중학교, 고등학교, 일상생활 활동)', 'note': '단원명·단원 목표·성취기준·차시 계획은 지도서 원문 그대로 옮겼습니다(원문 대조). 교육과정 원문(국가교육위원회 고시 제2026-2호)에 없는 코드는 선택할 수 없게 표시합니다.', 'keys': {}}
for (g, sid), vols in sorted(groups.items()):
    name = f"{({'중': 'm', '고': 'h', '공통': 'all'}.get(g) or 'e' + g[1:])}-{sid}"  # 파일 이름은 영문(초5→e5, 중→m, 고→h, 공통→all)
    units = [dict(u, src=v['from']) for v in vols for u in v['units']]
    for u in units: u['src'] = os.path.splitext(os.path.basename(u['src']))[0]
    json.dump({'key': f"{g}|{sid}", 'units': units}, open(os.path.join(OUT, name + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    index['keys'][f"{g}|{sid}"] = {'file': name + '.json', 'units': len(units), 'lessons': sum(len(u['s']) for u in units), 'books': sorted({u['src'] for u in units})}
json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), ensure_ascii=False, indent=1)
bad = sorted({c for (g, s), vols in groups.items() for v in vols for u in v['units'] for c in u['m'] + u['r'] if c not in cur})
print('keys', len(index['keys']), 'books', len(books), 'units', sum(b['units'] for b in books), 'lessons', sum(b['lessons'] for b in books))
print('교육과정에 없는 코드', len(bad), bad[:40])
