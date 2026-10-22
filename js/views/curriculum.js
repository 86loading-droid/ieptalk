// 교육과정 자료 불러오기: 2022 개정 특수교육 기본 교육과정(국가교육위원회 고시 제2026-2호 일부개정 포함) 성취기준과
// 「성취기준 적용 시 고려 사항」, 국립특수교육원 디지털 교과서·멀티미디어 자료의 단원·차시 차례.
// 자료는 data/ 아래 JSON으로 두고, 교과를 고를 때 그 교과 파일만 내려받는다(처음 한 번, 이후 메모리 보관).
const cache = {};
const BASE = 'data/';
async function getJson(path) {
  if (!cache[path]) cache[path] = fetch(BASE + path + '?v=25').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch((e) => { delete cache[path]; throw e; });
  return cache[path];
}
export const loadIndex = () => getJson('cur/index.json');
export const loadSubject = (id) => getJson(`cur/${id}.json`);
export const loadUnits = () => getJson('units.json');
// 교사용 지도서(2022 개정 기본 교육과정) 단원·차시 계획: 학년·교과마다 파일 하나
export const loadGuideIndex = () => getJson('guide/index.json');
export const loadGuide = (file) => getJson('guide/' + file);
export function guideKey(grade, subjId, idx) {
  const lv = grade === '전공과' ? '고' : /^[중고]/.test(grade) ? grade[0] : grade;
  for (const k of [`${grade}|${subjId}`, `${lv}|${subjId}`, `공통|${subjId}`]) if (idx?.keys?.[k]) return k;
  return '';
}

// 학년 → 학년군(성취기준 묶음)
export const GRADES = [
  ['초1', '초1~2'], ['초2', '초1~2'], ['초3', '초3~4'], ['초4', '초3~4'], ['초5', '초5~6'], ['초6', '초5~6'],
  ['중1', '중1~3'], ['중2', '중1~3'], ['중3', '중1~3'], ['고1', '고1~3'], ['고2', '고1~3'], ['고3', '고1~3'], ['전공과', '고1~3']
];
export const bandOf = (g) => (GRADES.find(([k]) => k === g) || [])[1] || '';

// 원문 고려 사항 중 중도중복장애·장애 정도가 심한 학생 지도 내용(원문에서 그대로)
export const SEV_RE = /중도중복|중도･중복|중도·중복|장애 정도가 심한|장애에 따른 특별한 지원/;

// 성취기준 하나와 그 영역 정보를 찾는다
export function findStd(subjData, band, code) {
  for (const a of subjData?.groups?.[band] || []) {
    const s = a.stds.find((x) => x.c === code);
    if (s) return { std: s, area: a };
  }
  return null;
}

// 성취기준 안내: 그 성취기준에 붙은 고려 사항 + 영역 공통 고려 사항. 중도중복장애 관련을 앞에.
export function guidanceOf(hit) {
  if (!hit) return { sev: [], other: [] };
  const all = [...hit.std.con.map((x) => ({ ...x, own: true })), ...(hit.area.con || []).map((x) => ({ ...x, own: false }))];
  return { sev: all.filter((x) => x.s), other: all.filter((x) => !x.s) };
}

// 단원·차시 제목과 성취기준의 낱말 겹침으로 참고 추천(최대 3개). 원문 대응표가 아니므로 「참고」로만 쓴다.
const STOP = new Set(['합니다', '봅시다', '해요', '있다', '한다', '다양한', '여러', '가지', '알아봅시다', '생활', '활동', '이해', '하기', '알기']);
const words = (t) => (String(t).match(/[가-힣]{2,}/g) || []).map((w) => w.replace(/(을|를|이|가|은|는|에|의|와|과|로|으로|에서|하고|해|하여|한다|합니다|봅시다)$/, '')).filter((w) => w.length >= 2 && !STOP.has(w));
export function suggestStds(subjData, band, text) {
  const q = new Set(words(text));
  if (!q.size) return [];
  const scored = [];
  for (const a of subjData?.groups?.[band] || []) for (const s of a.stds) {
    const w = words(s.t + ' ' + (s.exp[0]?.x || '').slice(0, 120));
    let sc = 0; for (const x of new Set(w)) if (q.has(x)) sc += 1; else if ([...q].some((y) => y.length >= 2 && (x.startsWith(y) || y.startsWith(x)))) sc += 0.5;
    if (sc >= 1) scored.push([sc, s.c]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, c]) => c);
}

export function sourceLine(idx) {
  const s = idx?.source; if (!s) return '';
  return `출처: ${s.title}(${s.notice}). ${s.from}.`;
}
