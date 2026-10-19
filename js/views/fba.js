// 기능평가: 문제행동 동기평가(감각·회피·관심·선호활동/물건) + ABC 관찰기록 + 의사소통기능평가.
// 세 자료와 즉시 기록 버튼의 결과(뒤 상황)를 합쳐 표적행동별 기능 가설을 만든다(solution.js가 이 결과로 중재 전략을 제안).
// 저장: 학생별 memos 안에 kind: 'mas' | 'abc' | 'comm'(공유 메모와 같은 권한 = 교사만).
// 동기평가 문항은 IEP톡이 새로 쓴 관찰 문항이다(출판 척도 MAS의 문항을 옮기지 않음). 표준화 검사 점수로 쓰지 않는다.
import { esc, todayStr, timeStr, fmtDate, openModal, toast } from '../util.js';
import { S, on, useSub, nameOf, isAdmin, student } from '../state.js';
import { ANTECEDENTS, CONSEQUENCES, confirmInline } from './record.js';
import { copyText } from './pireport.js';

export const FN = { sens: '감각 추구', esc: '회피·도피', att: '관심 끌기', tan: '선호 활동·물건 얻기' };
export const FN_KEYS = ['sens', 'esc', 'att', 'tan'];

export const MAS_ITEMS = [
  ['sens', '주변에 아무도 없거나 할 일이 없을 때도 이 행동을 한다.'],
  ['esc', '어렵거나 싫어하는 과제·지시가 주어진 직후에 나타난다.'],
  ['att', '주변 어른이 다른 사람과 이야기하거나 자신에게 관심을 주지 않을 때 나타난다.'],
  ['tan', '원하는 물건이나 활동을 가질 수 없다고 들었을 때 나타난다.'],
  ['sens', '같은 동작을 되풀이하며 혼자 몰두하는 모습이 보인다.'],
  ['esc', '과제나 요구를 거두면 곧 멈춘다.'],
  ['att', '행동 뒤에 어른이 다가오거나 말을 걸면 곧 멈춘다.'],
  ['tan', '원하는 물건이나 활동을 주면 곧 멈춘다.'],
  ['sens', '장소·사람·활동과 관계없이 비슷하게 나타난다.'],
  ['esc', '하기 싫은 활동으로 옮기라고 할 때 나타난다.'],
  ['att', '행동하면서 어른의 반응을 살피듯 쳐다본다.'],
  ['tan', '좋아하는 활동을 그만두라고 할 때 나타난다.'],
  ['sens', '소리·촉감·움직임 같은 감각 자극을 스스로 만들어 내는 모습이다.'],
  ['esc', '요구가 거의 없는 자유 시간에는 드물게 나타난다.'],
  ['att', '일대일로 관심을 받는 동안에는 드물게 나타난다.'],
  ['tan', '원하는 것이 보이지만 손에 닿지 않을 때 나타난다.']
];
const SCALE = ['전혀 아님', '드물게', '가끔', '자주', '거의 항상'];

// ABC 서술 기록의 결과 → 기능 추정(교사가 바꿀 수 있음)
export const C_FN = { '교사 관심': 'att', '또래 관심': 'att', '꾸중·말리기': 'att', '과제 중단·회피': 'esc', '자리 옮김': 'esc', '과제 쉬움으로 바꿈': 'esc', '물건·활동 얻음': 'tan', '반응 없음(행동 계속)': 'sens' };
const C_LIST = [...CONSEQUENCES, '꾸중·말리기', '과제 쉬움으로 바꿈', '반응 없음(행동 계속)'];
const A_LIST = [...ANTECEDENTS, '선호 활동 종료', '원하는 것 못 가짐'];

export const COMM_FNS = [
  ['obj', '원하는 물건 요구', 'tan'], ['act', '원하는 활동 요구', 'tan'], ['help', '도움 요청', 'esc'], ['brk', '휴식 요청', 'esc'],
  ['no', '거부·싫다고 하기', 'esc'], ['call', '관심 끌기(부르기)', 'att'], ['greet', '인사', ''], ['yn', '예/아니오 대답', ''],
  ['tell', '정보 말하기·언급', ''], ['feel', '감정·상태 표현(아파요·화나요)', '']
];
export const COMM_FORMS = [['spk', '구어(낱말·문장)'], ['voc', '발성'], ['ges', '몸짓·가리키기'], ['aac', '그림·AAC·수어'], ['pb', '문제행동'], ['none', '아직 없음']];

const of = (sid, kind) => (S.memosBy[sid] || []).filter((m) => m.kind === kind);
export const masOf = (sid) => of(sid, 'mas').sort((a, b) => ((b.date || '') > (a.date || '') ? 1 : -1));
export const abcOf = (sid) => of(sid, 'abc').sort((a, b) => ((b.date || '') + (b.time || '') > (a.date || '') + (a.time || '') ? 1 : -1));
export const commOf = (sid) => of(sid, 'comm').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
export const isAssess = (m) => ['mas', 'abc', 'comm'].includes(m.kind);

export function masScores(m) {
  const sum = { sens: 0, esc: 0, att: 0, tan: 0 }, cnt = { sens: 0, esc: 0, att: 0, tan: 0 };
  MAS_ITEMS.forEach(([f], i) => { const v = m.ans?.[i]; if (v != null && v !== '') { sum[f] += Number(v); cnt[f]++; } });
  const out = {}; FN_KEYS.forEach((f) => { out[f] = cnt[f] ? Math.round((sum[f] / cnt[f]) * 100) / 100 : null; });
  return out;
}
const rank = (sc) => FN_KEYS.filter((f) => sc[f] != null).sort((a, b) => sc[b] - sc[a]);

// 표적행동별 기능 종합: 출처마다 0~1로 바꿔 평균
export function profileFor(sid, tid) {
  const src = [];
  const mas = masOf(sid).filter((m) => !tid || m.tid === tid);
  if (mas.length) {
    const byRater = new Map(); mas.forEach((m) => { if (!byRater.has(m.createdBy)) byRater.set(m.createdBy, m); });
    const acc = { sens: 0, esc: 0, att: 0, tan: 0 }; let n = 0;
    byRater.forEach((m) => { const sc = masScores(m); FN_KEYS.forEach((f) => { acc[f] += (sc[f] ?? 0) / 4; }); n++; });
    FN_KEYS.forEach((f) => { acc[f] /= n; });
    src.push({ key: 'mas', label: `동기평가 ${byRater.size}명`, sc: acc });
  }
  const abc = abcOf(sid).filter((m) => !tid || !m.tid || m.tid === tid).filter((m) => m.fn);
  if (abc.length) { const c = { sens: 0, esc: 0, att: 0, tan: 0 }; abc.forEach((m) => { c[m.fn]++; }); FN_KEYS.forEach((f) => { c[f] /= abc.length; }); src.push({ key: 'abc', label: `ABC 서술 기록 ${abc.length}건`, sc: c }); }
  const evs = (S.eventsBy[sid] || []).filter((e) => (!tid || e.targetId === tid) && !e.ioa && C_FN[e.consequence]);
  if (evs.length) { const c = { sens: 0, esc: 0, att: 0, tan: 0 }; evs.forEach((e) => { c[C_FN[e.consequence]]++; }); FN_KEYS.forEach((f) => { c[f] /= evs.length; }); src.push({ key: 'ev', label: `즉시 기록의 뒤 상황 ${evs.length}건`, sc: c }); }
  const comm = commOf(sid)[0];
  if (comm) {
    const c = { sens: 0, esc: 0, att: 0, tan: 0 }; let k = 0;
    COMM_FNS.forEach(([id, , f]) => { if (f && (comm.grid?.[id] || []).includes('pb')) { c[f]++; k++; } });
    if (k) { FN_KEYS.forEach((f) => { c[f] /= k; }); src.push({ key: 'comm', label: `의사소통기능평가(문제행동으로 표현 ${k}개)`, sc: c }); }
  }
  if (!src.length) return { src, sc: null, top: null, agree: 0 };
  const sc = { sens: 0, esc: 0, att: 0, tan: 0 };
  src.forEach((s) => FN_KEYS.forEach((f) => { sc[f] += s.sc[f] / src.length; }));
  const r = rank(sc);
  const top = r[0], second = r[1];
  const agree = src.filter((s) => rank(s.sc)[0] === top).length;
  const mixed = second && sc[top] - sc[second] < 0.1;
  return { src, sc, top, second, mixed, agree };
}

// ABC 기록에서 자주 나온 앞·뒤 상황(가설 문장용)
export function abcSummary(sid, tid) {
  const list = abcOf(sid).filter((m) => !tid || !m.tid || m.tid === tid);
  const evs = (S.eventsBy[sid] || []).filter((e) => (!tid || e.targetId === tid) && !e.ioa);
  const count = (arr) => { const c = {}; arr.filter(Boolean).forEach((x) => { c[x] = (c[x] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]); };
  return { a: count([...list.map((m) => m.a), ...evs.map((e) => e.antecedent)]), c: count([...list.map((m) => m.c), ...evs.map((e) => e.consequence)]), n: list.length + evs.filter((e) => e.antecedent || e.consequence).length };
}

const bar = (v, max = 1) => `<span class="fa-bar"><span style="width:${Math.round(((v || 0) / max) * 100)}%"></span></span>`;

function profileCard(s) {
  const targets = S.targetsBy[s.id] || [];
  if (!targets.length) return '<section class="card"><p class="muted">표적행동을 먼저 정하면(행동·기초선 탭) 표적행동별로 기능을 종합합니다.</p></section>';
  return `<section class="card"><h2 class="h3">기능 종합(표적행동별)</h2>
    ${targets.map((t) => {
      const p = profileFor(s.id, t.id), sm = abcSummary(s.id, t.id);
      if (!p.sc) return `<div class="fa-prof"><b>${esc(t.name)}</b> <span class="muted small">아직 자료 없음 — 동기평가·ABC 기록·의사소통기능평가 중 하나 이상을 하세요.</span></div>`;
      return `<div class="fa-prof"><div class="goal-head"><b>${esc(t.name)}</b><span class="tag ${p.agree >= 2 ? 'ok' : 'warn'}">${p.mixed ? '복합 기능 가능성' : `주된 기능: ${FN[p.top]}`}</span><small class="muted">근거 ${p.src.length}종 중 ${p.agree}종 일치</small></div>
        <div class="fa-grid">${FN_KEYS.map((f) => `<span class="fa-l">${FN[f]}</span>${bar(p.sc[f])}<span class="fa-v">${Math.round(p.sc[f] * 100)}</span>`).join('')}</div>
        <p class="small">가설: ${esc(hypothesis(t, p, sm))}</p>
        <p class="tiny muted">근거: ${p.src.map((x) => esc(x.label)).join(' · ')}. 점수는 출처별 비율(0~100)의 평균이며 가설 세우기 도움용입니다.</p></div>`;
    }).join('')}</section>`;
}

export function hypothesis(t, p, sm) {
  const a = sm.a[0]?.[0], c = sm.c[0]?.[0];
  const fn = p.mixed ? `${FN[p.top]} 또는 ${FN[p.second]}` : FN[p.top];
  return `${a ? `「${a}」 상황에서` : '특정 상황에서'} ${t.name} 행동이 나타나고, ${c ? `그 뒤 「${c}」이(가) 따르는 일이 많아` : '그 뒤 결과를 더 관찰해야 하며'}, 행동의 기능은 ${fn}일 가능성이 높다.`;
}

function masCard(s) {
  const list = masOf(s.id);
  const tname = (tid) => (S.targetsBy[s.id] || []).find((t) => t.id === tid)?.name || '표적행동 미지정';
  return `<section class="card"><div class="goal-head"><h2 class="h3">문제행동 동기평가</h2><small class="muted">감각·회피·관심·선호 활동/물건 16문항</small><span class="grow"></span>
    <button type="button" class="ghost sm" data-act="fa-print" data-k="mas" data-sid="${s.id}">빈 서식 인쇄</button><button type="button" class="primary sm" data-act="fa-mas" data-sid="${s.id}">새 평가</button></div>
    ${list.length ? `<ul class="fa-list">${list.map((m) => { const sc = masScores(m), r = rank(sc); return `<li><div class="goal-head"><b>${esc(fmtDate(m.date))}</b><span class="tag">${esc(tname(m.tid))}</span><small class="muted">${esc(nameOf(m.createdBy))}${m.setting ? ` · ${esc(m.setting)}` : ''}</small><span class="grow"></span>
      <button type="button" class="ghost sm" data-act="fa-mas" data-sid="${s.id}" data-id="${m.id}">열기</button>${m.createdBy === S.me.uid || isAdmin() ? `<button type="button" class="ghost sm danger" data-act="fa-del" data-sid="${s.id}" data-id="${m.id}">지우기</button>` : ''}</div>
      <div class="fa-grid">${FN_KEYS.map((f) => `<span class="fa-l">${FN[f]}${f === r[0] ? ' ★' : ''}</span>${bar(sc[f], 4)}<span class="fa-v">${sc[f] ?? '-'}</span>`).join('')}</div></li>`; }).join('')}</ul>`
      : '<p class="muted small">아직 평가가 없습니다. 담임·특수교사·보조인력 등 학생을 잘 아는 사람이 각자 평가하면 평가자별로 비교할 수 있습니다.</p>'}
    <p class="tiny muted">IEP톡이 새로 쓴 관찰 문항(0~4점)으로, 표준화 검사 점수가 아닙니다. 기능평가는 면담·관찰과 함께 판단합니다.</p></section>`;
}

function abcCard(s) {
  const list = abcOf(s.id);
  const sm = abcSummary(s.id);
  const tname = (tid) => (S.targetsBy[s.id] || []).find((t) => t.id === tid)?.name || '';
  const top = (arr) => arr.slice(0, 4).map(([k, v]) => `${esc(k)} ${v}`).join(', ') || '자료 없음';
  return `<section class="card"><div class="goal-head"><h2 class="h3">ABC 관찰기록</h2><small class="muted">서술 기록 ${list.length}건 + 즉시 기록 버튼의 앞·뒤 선택</small><span class="grow"></span>
    <button type="button" class="ghost sm" data-act="fa-print" data-k="abc" data-sid="${s.id}">빈 서식 인쇄</button><button type="button" class="primary sm" data-act="fa-abc" data-sid="${s.id}">기록 추가</button></div>
    <p class="small">자주 나온 앞 상황: ${top(sm.a)}<br>자주 나온 뒤 결과: ${top(sm.c)}</p>
    ${list.length ? `<div class="fa-abc"><div class="fa-abc-h"><span>날짜·장소</span><span>A 앞 상황</span><span>B 행동</span><span>C 뒤 결과</span><span>추정 기능</span></div>${list.slice(0, 30).map((m) => `<div class="fa-abc-r"><span><b>${esc(fmtDate(m.date))} ${esc(m.time || '')}</b><br><small>${esc(m.setting || '')}${m.tid ? ` · ${esc(tname(m.tid))}` : ''}</small></span><span>${esc(m.a || '')}${m.aText ? `<br><small>${esc(m.aText)}</small>` : ''}</span><span>${esc(m.b || '')}</span><span>${esc(m.c || '')}${m.cText ? `<br><small>${esc(m.cText)}</small>` : ''}</span><span>${m.fn ? esc(FN[m.fn]) : '-'}${m.createdBy === S.me.uid || isAdmin() ? `<br><button type="button" class="link sm" data-act="fa-abc" data-sid="${s.id}" data-id="${m.id}">고치기</button> <button type="button" class="link sm danger" data-act="fa-del" data-sid="${s.id}" data-id="${m.id}">지우기</button>` : ''}</span></div>`).join('')}</div>` : '<p class="muted small">문제행동이 있을 때 앞 상황(A), 행동(B), 뒤 결과(C)를 보이는 그대로 적습니다.</p>'}
  </section>`;
}

function commCard(s) {
  const c = commOf(s.id)[0];
  const g = c?.grid || {};
  const pbFns = COMM_FNS.filter(([id]) => (g[id] || []).includes('pb'));
  const noneFns = COMM_FNS.filter(([id]) => !(g[id] || []).length || (g[id] || []).includes('none'));
  return `<section class="card"><div class="goal-head"><h2 class="h3">의사소통기능평가</h2><small class="muted">${c ? `${esc(fmtDate(c.date))} · ${esc(nameOf(c.updatedBy || c.createdBy))}` : '아직 없음'}</small><span class="grow"></span>
    <button type="button" class="ghost sm" data-act="fa-print" data-k="comm" data-sid="${s.id}">빈 서식 인쇄</button><button type="button" class="primary sm" data-act="fa-comm" data-sid="${s.id}">${c ? '새로 평가(지난 평가에서 이어서)' : '평가하기'}</button></div>
    ${c ? `<div class="fa-comm">${COMM_FNS.map(([id, label]) => `<div class="fa-comm-r ${(g[id] || []).includes('pb') ? 'pb' : ''}"><span>${esc(label)}</span><span>${(g[id] || []).map((f) => esc(COMM_FORMS.find(([k]) => k === f)?.[1] || f)).join(', ') || '<span class="muted">-</span>'}</span></div>`).join('')}</div>
      <p class="small">${pbFns.length ? `문제행동으로 전하는 기능: <b>${pbFns.map(([, l]) => esc(l)).join(', ')}</b> → 같은 기능을 전하는 대체 의사소통을 가르칩니다.` : '문제행동으로 전하는 기능은 표시되지 않았습니다.'} ${noneFns.length ? `아직 수단이 없는 기능: ${noneFns.map(([, l]) => esc(l)).join(', ')}.` : ''}</p>` : '<p class="muted small">기능(요구·거부·도움·휴식 등)마다 학생이 지금 어떤 형태로 전하는지 표시합니다. 문제행동으로 전하는 기능은 기능적 의사소통 훈련의 표적이 됩니다.</p>'}
  </section>`;
}

export function fbaTab(s) {
  useSub('memo:' + s.id, 'memos', { sid: s.id }, (r) => { S.memosBy[s.id] = r.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); });
  useSub('ev:' + s.id, 'bevents', { sid: s.id }, (r) => { S.eventsBy[s.id] = r; });
  return `<p class="small muted">기능평가 순서: ① ABC 관찰기록으로 앞·뒤 상황을 모으고 ② 학생을 잘 아는 사람들이 동기평가를 하고 ③ 의사소통기능평가로 대체 행동을 찾습니다. 종합 결과와 중재 제안은 「행동·기초선」 탭의 분석에 이어집니다.</p>
    ${profileCard(s)}${abcCard(s)}${masCard(s)}${commCard(s)}`;
}

/* ---------- 입력 ---------- */
const targetSel = (sid, cur) => `<label>표적행동<select name="tid"><option value="">고르지 않음</option>${(S.targetsBy[sid] || []).map((t) => `<option value="${t.id}" ${cur === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>`;

function masModal(sid, m = null) {
  const ro = m && !(m.createdBy === S.me.uid || isAdmin());
  openModal(`<form class="fa-form"><h2>문제행동 동기평가 <small class="muted">${esc(student(sid)?.alias || '')}</small></h2>
    <div class="row3">${targetSel(sid, m?.tid || (S.targetsBy[sid] || [])[0]?.id)}<label>날짜<input type="date" name="date" value="${esc(m?.date || todayStr())}"></label><label>주로 본 장면<input name="setting" value="${esc(m?.setting || '')}" placeholder="예: 국어 시간, 통합학급"></label></div>
    <p class="small muted">최근 2~4주를 떠올려 각 문장이 얼마나 맞는지 고릅니다. 평가자: ${esc(nameOf(m?.createdBy || S.me.uid))}</p>
    <ol class="fa-items">${MAS_ITEMS.map(([, q], i) => `<li><span>${esc(q)}</span><span class="fa-scale" role="radiogroup">${SCALE.map((l, v) => `<label><input type="radio" name="q${i}" value="${v}" ${m?.ans?.[i] == v && m?.ans?.[i] !== '' && m?.ans?.[i] != null ? 'checked' : ''} ${ro ? 'disabled' : ''}><span>${v}<small>${l}</small></span></label>`).join('')}</span></li>`).join('')}</ol>
    <div class="fa-live small" aria-live="polite"></div>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>닫기</button>${ro ? '' : '<button type="submit" class="primary">저장</button>'}</div></form>`, {
    wide: true,
    onOpen: (box) => {
      const live = box.querySelector('.fa-live');
      const upd = () => { const ans = MAS_ITEMS.map((_, i) => box.querySelector(`[name=q${i}]:checked`)?.value ?? null); const sc = masScores({ ans }); const done = ans.filter((x) => x != null).length; live.innerHTML = `응답 ${done}/16 · ${FN_KEYS.map((f) => `${FN[f]} ${sc[f] ?? '-'}`).join(' · ')}`; };
      box.addEventListener('change', upd); upd();
    },
    onSubmit: async (fd) => {
      const ans = MAS_ITEMS.map((_, i) => (fd.get(`q${i}`) == null ? null : Number(fd.get(`q${i}`))));
      if (ans.filter((x) => x != null).length < 12) { toast('16문항 중 12문항 이상 답해 주세요'); return false; }
      const data = { kind: 'mas', tid: fd.get('tid') || '', date: fd.get('date'), setting: fd.get('setting') || '', ans, title: '', blocks: [], updatedBy: S.me.uid, updatedAt: Date.now() };
      if (m) await S.store.update('memos', { sid }, m.id, data); else await S.store.create('memos', { sid }, { ...data, createdBy: S.me.uid, createdAt: Date.now() });
      toast('동기평가를 저장했습니다');
    }
  });
}

function abcModal(sid, m = null) {
  let cur = { a: m?.a || '', c: m?.c || '', fn: m?.fn || '' };
  const chips = (k, list) => `<div class="nt-chips">${list.map((x) => `<button type="button" class="pr-chip sm ${cur[k] === x ? 'on' : ''}" data-fk="${k}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
  const fnChips = () => `<div class="nt-chips">${FN_KEYS.map((f) => `<button type="button" class="pr-chip sm ${cur.fn === f ? 'on' : ''}" data-fk="fn" data-v="${f}">${FN[f]}</button>`).join('')}</div>`;
  openModal(`<form class="fa-form"><h2>ABC 관찰기록 <small class="muted">${esc(student(sid)?.alias || '')}</small></h2>
    <div class="row3"><label>날짜<input type="date" name="date" value="${esc(m?.date || todayStr())}"></label><label>시각<input type="time" name="time" value="${esc(m?.time || timeStr())}"></label><label>장소·활동<input name="setting" value="${esc(m?.setting || '')}" placeholder="예: 수학, 특수학급"></label></div>
    ${targetSel(sid, m?.tid)}
    <fieldset><legend>A 앞 상황</legend><div data-row="a">${chips('a', A_LIST)}</div><input name="aText" value="${esc(m?.aText || '')}" placeholder="보이는 그대로(예: 10:20 학습지 2쪽 제시)"></fieldset>
    <fieldset><legend>B 행동</legend><textarea name="b" rows="2" placeholder="보이는 그대로, 횟수·시간(예: 학습지를 찢고 책상을 2번 침, 약 1분)">${esc(m?.b || '')}</textarea></fieldset>
    <fieldset><legend>C 뒤 결과</legend><div data-row="c">${chips('c', C_LIST)}</div><input name="cText" value="${esc(m?.cText || '')}" placeholder="보이는 그대로(예: 교사가 학습지를 치우고 쉬는 자리로 안내)"></fieldset>
    <fieldset><legend>추정 기능 <small class="muted">결과를 고르면 자동으로 제안, 바꿀 수 있음</small></legend><div data-row="fn">${fnChips()}</div></fieldset>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>닫기</button><button type="submit" class="primary">저장</button></div></form>`, {
    wide: true,
    onOpen: (box) => box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fk]'); if (!b) return;
      const k = b.dataset.fk, v = b.dataset.v;
      cur[k] = cur[k] === v ? '' : v;
      if (k === 'c' && cur.c && C_FN[cur.c]) cur.fn = C_FN[cur.c];
      box.querySelector('[data-row="a"]').innerHTML = chips('a', A_LIST);
      box.querySelector('[data-row="c"]').innerHTML = chips('c', C_LIST);
      box.querySelector('[data-row="fn"]').innerHTML = fnChips();
    }),
    onSubmit: async (fd) => {
      if (!String(fd.get('b') || '').trim()) { toast('B 행동을 적어 주세요'); return false; }
      const data = { kind: 'abc', tid: fd.get('tid') || '', date: fd.get('date'), time: fd.get('time'), setting: fd.get('setting') || '', a: cur.a, aText: fd.get('aText') || '', b: String(fd.get('b')).trim(), c: cur.c, cText: fd.get('cText') || '', fn: cur.fn, title: '', blocks: [], updatedBy: S.me.uid, updatedAt: Date.now() };
      if (m) await S.store.update('memos', { sid }, m.id, data); else await S.store.create('memos', { sid }, { ...data, createdBy: S.me.uid, createdAt: Date.now() });
      toast('ABC 기록을 저장했습니다');
    }
  });
}

function commModal(sid) {
  const last = commOf(sid)[0];
  const g = last?.grid || {};
  openModal(`<form class="fa-form"><h2>의사소통기능평가 <small class="muted">${esc(student(sid)?.alias || '')}</small></h2>
    <p class="small muted">기능마다 학생이 지금 쓰는 형태를 모두 고릅니다. 문제행동으로 전하는 기능은 「문제행동」을 함께 고릅니다.</p>
    <div class="fa-cgrid" role="table"><div class="fa-cg-h" role="row"><span role="columnheader">기능</span>${COMM_FORMS.map(([, l]) => `<span role="columnheader">${esc(l)}</span>`).join('')}</div>
      ${COMM_FNS.map(([id, label]) => `<div class="fa-cg-r" role="row"><span role="rowheader">${esc(label)}</span>${COMM_FORMS.map(([k, l]) => `<label role="cell"><input type="checkbox" name="${id}" value="${k}" ${(g[id] || []).includes(k) ? 'checked' : ''} aria-label="${esc(label)} ${esc(l)}"></label>`).join('')}</div>`).join('')}</div>
    <label>메모(사용하는 낱말·기기 등)<textarea name="note" rows="2">${esc(last?.note || '')}</textarea></label>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>닫기</button><button type="submit" class="primary">저장(새 평가로)</button></div></form>`, {
    wide: true,
    onSubmit: async (fd) => {
      const grid = {}; COMM_FNS.forEach(([id]) => { grid[id] = fd.getAll(id); });
      await S.store.create('memos', { sid }, { kind: 'comm', date: todayStr(), grid, note: fd.get('note') || '', title: '', blocks: [], createdBy: S.me.uid, updatedBy: S.me.uid, createdAt: Date.now(), updatedAt: Date.now() });
      toast('의사소통기능평가를 저장했습니다');
    }
  });
}

/* ---------- 빈 서식 인쇄 ---------- */
function printForm(sid, k) {
  const s = student(sid);
  const head = (t) => `<h1>${t}</h1><p>학생: ${esc(s?.alias || '')} · 평가자: ________ · 날짜: ________ · 장면: ________</p>`;
  let html = '';
  if (k === 'mas') html = `${head('문제행동 동기평가')}<p>표적행동: ______________________ (0 전혀 아님 · 1 드물게 · 2 가끔 · 3 자주 · 4 거의 항상)</p>
    <table class="pf"><thead><tr><th>번호</th><th>문항</th><th>0</th><th>1</th><th>2</th><th>3</th><th>4</th></tr></thead><tbody>${MAS_ITEMS.map(([, q], i) => `<tr><td>${i + 1}</td><td>${esc(q)}</td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')}</tbody></table>
    <p>합산: 감각 추구(1·5·9·13) ___ · 회피·도피(2·6·10·14) ___ · 관심 끌기(3·7·11·15) ___ · 선호 활동·물건(4·8·12·16) ___</p>`;
  if (k === 'abc') html = `${head('ABC 관찰기록')}<table class="pf abc"><thead><tr><th>날짜·시각</th><th>장소·활동</th><th>A 앞 상황</th><th>B 행동(보이는 그대로)</th><th>C 뒤 결과</th><th>추정 기능</th></tr></thead><tbody>${'<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(10)}</tbody></table>`;
  if (k === 'comm') html = `${head('의사소통기능평가')}<table class="pf"><thead><tr><th>기능</th>${COMM_FORMS.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${COMM_FNS.map(([, l]) => `<tr><td>${esc(l)}</td>${COMM_FORMS.map(() => '<td></td>').join('')}</tr>`).join('')}</tbody></table>`;
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = html + '<p class="print-note">IEP톡 기능평가 서식. 동기평가 문항은 IEP톡이 새로 쓴 관찰 문항으로 표준화 검사가 아닙니다. 학생 개인정보가 담긴 내부 자료이므로 사용 후 파기합니다.</p>';
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 500); }, 50);
}

on('fa-mas', (el) => masModal(el.dataset.sid, el.dataset.id ? masOf(el.dataset.sid).find((m) => m.id === el.dataset.id) : null));
on('fa-abc', (el) => abcModal(el.dataset.sid, el.dataset.id ? abcOf(el.dataset.sid).find((m) => m.id === el.dataset.id) : null));
on('fa-comm', (el) => commModal(el.dataset.sid));
on('fa-print', (el) => printForm(el.dataset.sid, el.dataset.k));
on('fa-del', async (el) => { if (!confirmInline(el)) return; await S.store.remove('memos', { sid: el.dataset.sid }, el.dataset.id); toast('지웠습니다'); });
export { copyText };
