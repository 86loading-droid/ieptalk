// 학기말 종합: 한 학기 동안 쌓인 장애 특성·IEP 목표 진전도·문제행동 기초선과 중재·기능평가·위기행동 사후 기록·
// 관찰 메모·평가조정을 한 화면(한 문서)으로 모은다. 교사가 장애 특성·종합 의견·다음 학기 제언을 고쳐 쓰고
// 저장(memos, kind: 'term' — 교사만 읽고 씀)하거나 인쇄·복사한다. 자동 문장은 자료에서 셈한 사실만 쓰고 해석은 교사가 더한다.
import { esc, todayStr, fmtDate, parseDate, mean, round1, toast } from '../util.js';
import { S, on, useSub, rerender, student, nameOf, labelOf } from '../state.js';
import { behaviorSeries, METHOD_LABEL, unitOf } from '../charts.js';
import { visualAnalysis } from './solution.js';
import { profileFor, abcSummary, hypothesis, masOf, abcOf, commOf, FN, COMM_FNS } from './fba.js';
import { incidentsOf } from './incidents.js';
import { notesOf } from './notes.js';
import { accomsOf, CATS } from './accoms.js';
import { copyText } from './pireport.js';

const UI = {}; // 학생별 화면 상태(기간·고친 글)
const pad = (n) => String(n).padStart(2, '0');
const jong = (w) => { const c = String(w).trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; };
const eun = (w) => `「${w}」${jong(w) ? '은' : '는'}`;

// 학기 기본값: 3~7월 → 1학기(3/1~7/31), 8~2월 → 2학기(8/1~다음 해 2월 말)
export function termRange(kind, today = todayStr()) {
  const d = parseDate(today); const y = d.getFullYear(), m = d.getMonth() + 1;
  const sy = m <= 2 ? y - 1 : y; // 학년도
  if (kind === '1') return [`${sy}-03-01`, `${sy}-07-31`];
  const end = new Date(sy + 1, 2, 0); // 다음 해 2월 말일
  return [`${sy}-08-01`, `${sy + 1}-02-${pad(end.getDate())}`];
}
export const defaultTerm = (today = todayStr()) => { const m = parseDate(today).getMonth() + 1; return m >= 3 && m <= 7 ? '1' : '2'; };
const inR = (d, [a, b]) => d && d >= a && d <= b;
const savedTerm = (sid, r) => (S.memosBy[sid] || []).filter((m) => m.kind === 'term' && m.from === r[0] && m.to === r[1]).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];

// 자료 모으기(화면·인쇄·복사가 같은 결과를 쓰도록 한 곳에서)
export function collect(sid, r) {
  const s = student(sid);
  const evs = S.eventsBy[sid] || [];
  const goals = (S.goalsBy[sid] || []).map((g) => {
    const pts = (g.points || []).filter((p) => inR(p.d, r)).sort((a, b) => (a.d > b.d ? 1 : -1));
    const vals = pts.map((p) => Number(p.v)).filter((v) => Number.isFinite(v));
    const first = vals[0], last = vals[vals.length - 1];
    const up = g.direction !== 'down';
    const met = vals.length ? (up ? last >= Number(g.target) : last <= Number(g.target)) : false;
    const change = vals.length >= 2 ? round1(last - first) : null;
    return { g, n: vals.length, first, last, mean: vals.length ? round1(mean(vals)) : null, met, change, up };
  });
  const targets = (S.targetsBy[sid] || []).map((t) => {
    const series = behaviorSeries(t, evs).filter((p) => inR(p.d || p.date, r));
    const va = visualAnalysis(t, series);
    const p = profileFor(sid, t.id); const sm = abcSummary(sid, t.id);
    const nEv = evs.filter((e) => e.targetId === t.id && e.type !== 'session' && inR(e.date, r)).length;
    return { t, series, va, hyp: p.top ? hypothesis(t, p, sm) : '', agree: p.agree, nSrc: p.src?.length || 0, nEv };
  });
  const mas = masOf(sid).filter((m) => inR(m.date, r));
  const abc = abcOf(sid).filter((m) => inR(m.date, r));
  const comm = commOf(sid).filter((m) => inR(m.date, r));
  const commLatest = commOf(sid)[0];
  const pbFns = commLatest ? COMM_FNS.filter(([id]) => (commLatest.grid?.[id] || []).includes('pb')).map(([, l]) => l) : [];
  const incs = incidentsOf(sid).filter((x) => inR(x.date, r)).sort((a, b) => (a.date > b.date ? 1 : -1));
  const notes = notesOf(sid).filter((n) => inR(n.date, r));
  const tagCount = {}; const subjCount = {};
  notes.forEach((n) => { (n.tags || []).forEach((t) => { tagCount[t] = (tagCount[t] || 0) + 1; }); if (n.subj) subjCount[n.subj] = (subjCount[n.subj] || 0) + 1; });
  const accs = accomsOf(sid);
  return { s, r, goals, targets, mas, abc, comm, pbFns, incs, notes, tagCount, subjCount, accs };
}

// 자료에서 셈한 사실로 종합 의견 초안(해석·평가 낱말은 넣지 않음)
export function draftOpinion(c) {
  const L = [];
  const gm = c.goals.filter((x) => x.n);
  if (c.goals.length) L.push(`IEP 목표 ${c.goals.length}개 가운데 이번 기간에 측정한 목표는 ${gm.length}개이며, 마지막 측정값이 목표 값에 이른 목표는 ${gm.filter((x) => x.met).length}개이다.`);
  gm.filter((x) => x.change != null).forEach((x) => L.push(`「${x.g.domain}」 목표는 ${x.n}회 측정에서 ${x.first} → ${x.last}(${x.change > 0 ? '+' : ''}${x.change})로 바뀌었다.`));
  c.targets.forEach((x) => {
    const a = x.va.a, b = x.va.b;
    if (b && a) L.push(`표적행동 ${eun(x.t.name)} 기초선 평균 ${a.mean}에서 중재 평균 ${b.mean}으로 바뀌었다${x.va.effect ? `(${x.va.effect[1].split('.')[0]})` : ''}.`);
    else if (a) L.push(`표적행동 ${eun(x.t.name)} 기초선 ${a.n}회기(평균 ${a.mean})를 모았고 중재는 아직 시작하지 않았다.`);
    if (x.hyp) L.push(`기능 가설: ${x.hyp}`);
  });
  if (c.incs.length) L.push(`위기행동 사후 기록은 ${c.incs.length}건(물리적 제지 ${c.incs.filter((x) => x.restraint).length}건)이다.`);
  else L.push('이번 기간에 위기행동 사후 기록은 없다.');
  if (c.notes.length) { const top = Object.entries(c.tagCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}건`).join(', '); L.push(`관찰 메모 ${c.notes.length}건(${top}).`); }
  return L.join(' ');
}
export function draftNext(c) {
  const L = [];
  c.goals.filter((x) => x.n && !x.met).forEach((x) => L.push(`「${x.g.domain}」 목표는 이어서 지도하며 교수 방법(촉구·강화·자료)을 점검한다.`));
  c.goals.filter((x) => x.met).forEach((x) => L.push(`「${x.g.domain}」 목표는 다른 장면·사람으로 일반화와 유지를 확인하고 다음 단계 목표를 세운다.`));
  c.targets.filter((x) => x.va.a && !x.va.b).forEach((x) => L.push(`${eun(x.t.name)} 기능 가설에 맞는 중재를 시작한다.`));
  if (c.pbFns.length) L.push(`문제행동으로 전하는 기능(${c.pbFns.join(', ')})을 대체 의사소통으로 가르친다.`);
  if (c.incs.length >= 2) L.push('위기행동이 되풀이되었으므로 행동지원계획을 팀이 다시 검토한다.');
  return L.join('\n') || '다음 학기 목표와 지원을 IEP 팀이 협의한다.';
}

function goalRow(x) {
  const g = x.g;
  return `<tr><td>${esc(g.domain || '')}${g.std?.code ? `<br><small>[${esc(g.std.code)}]</small>` : ''}</td><td>${esc(g.condition || '')} ${esc(g.behavior || '')} ${esc(g.criterion || '')}</td>
    <td>${x.n}</td><td>${x.n ? `${esc(x.first)} → ${esc(x.last)}` : '-'}</td><td>${esc(g.target ?? '')}</td><td>${x.n ? (x.met ? '도달' : '미도달') : '측정 없음'}</td></tr>`;
}

export function reportHtml(c, ed, secs) {
  const s = c.s; const on = (k) => secs[k] !== false;
  const sec = (k, title, body) => (on(k) ? `<section class="tr-sec"><h3>${title}</h3>${body}</section>` : '');
  const accRows = c.accs.map((a) => `<tr><td>${esc(a.subject)}</td><td>${CATS.map(([k, l]) => ((a[k] || []).length ? `${l}: ${(a[k] || []).map(esc).join(', ')}` : '')).filter(Boolean).join('<br>')}${a.other ? `<br>기타: ${esc(a.other)}` : ''}</td><td>${(a.effects || []).length}건</td></tr>`).join('');
  const notesKey = c.notes.filter((n) => (n.tags || []).some((t) => ['잘한 점·성장', 'IEP 목표 관련'].includes(t)) || n.star);
  return `<div class="tr-doc">
    <h2 class="tr-title">학기말 종합 — ${esc(s?.alias || '')}</h2>
    <p class="small">학년 ${esc(s?.grade || '-')} · 기간 ${esc(c.r[0])} ~ ${esc(c.r[1])} · 담당 ${esc(labelOf(s?.caseManager))} · 작성 ${esc(todayStr())}</p>
    ${sec('traits', '1. 장애 특성', `<p class="pre">${esc(ed.traits || '')}</p>`)}
    ${sec('goals', '2. IEP 목표와 진전도', c.goals.length ? `<table class="tr-t"><thead><tr><th>영역</th><th>목표</th><th>측정</th><th>처음→마지막</th><th>목표 값</th><th>도달</th></tr></thead><tbody>${c.goals.map(goalRow).join('')}</tbody></table>` : '<p class="small muted">목표 없음</p>')}
    ${sec('beh', '3. 문제행동 기초선과 중재', c.targets.length ? c.targets.map((x) => `<div class="tr-b"><p class="small"><b>${esc(x.t.name)}</b> <small>(${esc(METHOD_LABEL[x.t.method] || '빈도')}, ${esc(unitOf(x.t))}, 기록 ${x.nEv}건)</small><br>${esc(x.t.definition || '')}</p>
      <ul class="small">${x.va.lines.map((l) => `<li>${esc(l)}</li>`).join('')}${x.va.ready ? `<li>기초선 판단: ${esc(x.va.ready[1])}</li>` : ''}${x.va.effect ? `<li>중재 판단: ${esc(x.va.effect[1])}</li>` : ''}</ul></div>`).join('') : '<p class="small muted">표적행동 없음</p>')}
    ${sec('fba', '4. 기능평가', `<p class="small">이번 기간 기록: 동기평가 ${c.mas.length}건 · ABC 서술 ${c.abc.length}건 · 의사소통기능평가 ${c.comm.length}건</p>
      ${c.targets.filter((x) => x.hyp).map((x) => `<p class="small"><b>${esc(x.t.name)}</b> ${esc(x.hyp)} <small>(근거 ${x.nSrc}종 중 ${x.agree}종 일치)</small></p>`).join('')}
      ${c.pbFns.length ? `<p class="small">문제행동으로 전하는 의사소통 기능: ${c.pbFns.map(esc).join(', ')}</p>` : ''}`)}
    ${sec('crisis', '5. 위기행동 사후 기록', c.incs.length ? `<table class="tr-t"><thead><tr><th>날짜</th><th>장소</th><th>행동</th><th>물리적 제지</th><th>사후 검토</th></tr></thead><tbody>${c.incs.map((x) => `<tr><td>${esc(fmtDate(x.date))}</td><td>${esc(x.place || '')}</td><td>${esc(x.behavior || '')}</td><td>${x.restraint ? '있음' : '없음'}</td><td>${x.debriefDate ? esc(fmtDate(x.debriefDate)) : '전'}</td></tr>`).join('')}</tbody></table>` : '<p class="small">이번 기간 기록 없음</p>')}
    ${sec('notes', '6. 관찰 메모', `<p class="small">전체 ${c.notes.length}건 · 종류: ${Object.entries(c.tagCount).map(([k, v]) => `${esc(k)} ${v}`).join(', ') || '-'} · 교과: ${Object.entries(c.subjCount).map(([k, v]) => `${esc(k)} ${v}`).join(', ') || '-'}</p>
      ${notesKey.length ? `<ul class="small">${notesKey.map((n) => `<li>${esc(fmtDate(n.date))} ${n.subj ? `[${esc(n.subj)}] ` : ''}${esc(n.text || '')}</li>`).join('')}</ul>` : ''}`)}
    ${sec('accom', '7. 평가조정', c.accs.length ? `<table class="tr-t"><thead><tr><th>교과</th><th>조정</th><th>효과 메모</th></tr></thead><tbody>${accRows}</tbody></table>` : '<p class="small muted">평가조정 없음</p>')}
    ${sec('opinion', '8. 종합 의견', `<p class="pre">${esc(ed.opinion || '')}</p>`)}
    ${sec('next', '9. 다음 학기 제언', `<p class="pre">${esc(ed.next || '')}</p>`)}
  </div>`;
}

export function reportText(c, ed, secs) {
  const d = document.createElement('div'); d.innerHTML = reportHtml(c, ed, secs);
  d.querySelectorAll('tr').forEach((tr) => { tr.insertAdjacentText('beforeend', '\n'); tr.querySelectorAll('td,th').forEach((x) => x.insertAdjacentText('beforeend', ' | ')); });
  d.querySelectorAll('h2,h3,p,li,div.tr-b').forEach((x) => x.insertAdjacentText('beforeend', '\n'));
  return d.textContent.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const SECS = [['traits', '장애 특성'], ['goals', 'IEP 진전도'], ['beh', '문제행동'], ['fba', '기능평가'], ['crisis', '위기행동'], ['notes', '관찰 메모'], ['accom', '평가조정'], ['opinion', '종합 의견'], ['next', '다음 학기 제언']];

export function termTab(s) {
  const sid = s.id;
  useSub('ev:' + sid, 'bevents', { sid }, (r) => { S.eventsBy[sid] = r; });
  useSub('memo:' + sid, 'memos', { sid }, (r) => { S.memosBy[sid] = r.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); });
  const u = UI[sid] || (UI[sid] = { term: defaultTerm(), from: '', to: '', ed: null, secs: {} });
  const r = u.term === 'custom' && u.from && u.to ? [u.from, u.to] : termRange(u.term === 'custom' ? defaultTerm() : u.term);
  const c = collect(sid, r);
  const saved = savedTerm(sid, r);
  // 저장본이 있으면 저장본, 없으면 자료로 만든 초안(교사가 고치기 전까지는 자료가 들어올 때마다 새로 만든다)
  if (!u.ed || u.ed._key !== r.join('~') || (u.ed._auto && saved)) {
    u.ed = saved ? { traits: saved.traits || '', opinion: saved.opinion || '', next: saved.next || '', _key: r.join('~'), _saved: saved.id }
      : { traits: s.note ? String(s.note).replace(/^가상 학생\s*·\s*/, '') : '', opinion: '', next: '', _key: r.join('~'), _auto: true };
  }
  if (u.ed._auto) { u.ed.opinion = draftOpinion(c); u.ed.next = draftNext(c); }
  const ed = u.ed;
  return `<div class="bar tr-bar">
      <div class="nt-chips" role="group" aria-label="기간">${[['1', '1학기'], ['2', '2학기'], ['custom', '직접 정하기']].map(([k, l]) => `<button type="button" class="pr-chip sm ${u.term === k ? 'on' : ''}" aria-pressed="${u.term === k}" data-act="tr-term" data-sid="${sid}" data-v="${k}">${l}</button>`).join('')}</div>
      ${u.term === 'custom' ? `<label class="small">시작 <input type="date" data-change="tr-date" data-sid="${sid}" data-k="from" value="${esc(u.from || r[0])}"></label><label class="small">끝 <input type="date" data-change="tr-date" data-sid="${sid}" data-k="to" value="${esc(u.to || r[1])}"></label>` : `<span class="small muted">${esc(r[0])} ~ ${esc(r[1])}</span>`}
      <span class="grow"></span>
      <button type="button" class="ghost" data-act="tr-copy" data-sid="${sid}">복사</button><button type="button" class="ghost" data-act="tr-print" data-sid="${sid}">인쇄</button><button type="button" class="primary" data-act="tr-save" data-sid="${sid}">저장</button></div>
    <section class="card tr-edit">
      <p class="small">넣을 항목: ${SECS.map(([k, l]) => `<label class="tr-chk"><input type="checkbox" data-change="tr-sec" data-sid="${sid}" data-k="${k}" ${u.secs[k] !== false ? 'checked' : ''}> ${l}</label>`).join(' ')}</p>
      <div class="tr-fields">
        <label>장애 특성 <small class="muted">진단명·약 이름 대신 학습과 생활에서 보이는 특성을 적습니다</small><textarea id="tr-traits" rows="3" data-tr="traits" data-sid="${sid}">${esc(ed.traits)}</textarea></label>
        <label>종합 의견 <small class="muted">자료에서 셈한 사실로 만든 초안 — 해석과 평가는 교사가 더합니다</small><textarea id="tr-opinion" rows="5" data-tr="opinion" data-sid="${sid}">${esc(ed.opinion)}</textarea></label>
        <label>다음 학기 제언<textarea id="tr-next" rows="4" data-tr="next" data-sid="${sid}">${esc(ed.next)}</textarea></label>
      </div>
      <p class="tiny muted">${saved ? `저장됨: ${esc(nameOf(saved.updatedBy))} · ${esc(new Date(saved.updatedAt).toLocaleString('ko-KR'))}` : '아직 저장하지 않았습니다. 저장하면 이 기간의 글이 학생 기록에 남습니다(교사만 볼 수 있음).'} <button type="button" class="link sm" data-act="tr-redraft" data-sid="${sid}">자료로 초안 다시 만들기</button></p>
    </section>
    <section class="card tr-prev" aria-label="미리 보기">${reportHtml(c, ed, u.secs)}</section>`;
}

const cur = (sid) => { const s = student(sid); const u = UI[sid]; const r = u.term === 'custom' && u.from && u.to ? [u.from, u.to] : termRange(u.term === 'custom' ? defaultTerm() : u.term); return { s, u, r, c: collect(sid, r) }; };
// 고쳐 쓰는 동안에는 화면 전체를 다시 그리지 않고 미리 보기만 바꾼다(입력 칸 초점·커서 유지)
let prevTimer = 0;
document.addEventListener('input', (e) => {
  const k = e.target.dataset?.tr; if (!k) return;
  const sid = e.target.dataset.sid; const u = UI[sid]; if (!u?.ed) return;
  u.ed[k] = e.target.value; u.ed._auto = false;
  clearTimeout(prevTimer);
  prevTimer = setTimeout(() => { const el = document.querySelector('.tr-prev'); if (el) { const { c } = cur(sid); el.innerHTML = reportHtml(c, u.ed, u.secs); } }, 250);
});
on('tr-term', (el) => { const u = UI[el.dataset.sid]; u.term = el.dataset.v; u.ed = null; rerender(); });
on('tr-date', (el) => { const u = UI[el.dataset.sid]; u[el.dataset.k] = el.value; u.ed = null; rerender(); });
on('tr-sec', (el) => { const u = UI[el.dataset.sid]; u.secs[el.dataset.k] = el.checked; rerender(); });
on('tr-redraft', (el) => { const { u, c } = cur(el.dataset.sid); u.ed._auto = false; u.ed.opinion = draftOpinion(c); u.ed.next = draftNext(c); rerender(); toast('자료로 초안을 다시 만들었습니다'); });
on('tr-copy', async (el) => { const { u, c } = cur(el.dataset.sid); const ok = await copyText(reportText(c, u.ed, u.secs)); toast(ok ? '학기말 종합을 복사했습니다' : '복사하지 못했습니다'); });
on('tr-print', (el) => {
  const { u, c } = cur(el.dataset.sid);
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = reportHtml(c, u.ed, u.secs);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); setTimeout(() => window.print(), 50);
});
on('tr-save', async (el) => {
  const sid = el.dataset.sid; const { u, r } = cur(sid);
  const data = { kind: 'term', from: r[0], to: r[1], traits: u.ed.traits, opinion: u.ed.opinion, next: u.ed.next, title: '', blocks: [], updatedBy: S.me.uid, updatedAt: Date.now() };
  const saved = savedTerm(sid, r);
  if (saved) await S.store.update('memos', { sid }, saved.id, data);
  else await S.store.create('memos', { sid }, { ...data, createdBy: S.me.uid, createdAt: Date.now() });
  toast('학기말 종합을 저장했습니다');
});
