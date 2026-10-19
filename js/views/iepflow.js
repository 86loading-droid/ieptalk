// IEP 전체 흐름: 한 학생의 IEP를 일곱 단계로 이어 본다.
// 학생 이해 → 평가·기능평가 → IEP 목표 → 교수·지원 계획 → 행동 지원 → 진전도 점검 → 학기말 평가
// 각 단계는 이미 쌓인 자료(관찰 메모·기초선·기능평가·목표·평가조정·시각자료·사후 기록·학기말 종합)를 모아 보여 주고,
// 고칠 곳은 해당 탭으로 보낸다. 「전체 인쇄」는 이 흐름을 그대로 한 문서로 인쇄한다(정해진 서식 없음).
import { esc, todayStr, fmtDate, addDays } from '../util.js';
import { S, on, useSub, student, labelOf, nameOf } from '../state.js';
import { behaviorSeries, METHOD_LABEL } from '../charts.js';
import { visualAnalysis, STRAT } from './solution.js';
import { profileFor, abcSummary, hypothesis, masOf, abcOf, commOf, COMM_FNS, FN } from './fba.js';
import { incidentsOf } from './incidents.js';
import { notesOf } from './notes.js';
import { accomsOf, CATS } from './accoms.js';
import { visSection, visItems } from './visuals.js';

export const STEPS = [
  ['know', '학생 이해', '현행 수준·장애 특성'],
  ['assess', '평가', '기초선·기능평가'],
  ['goals', 'IEP 목표', '성취기준·단원·차시'],
  ['plan', '교수·지원 계획', '지원·평가조정'],
  ['beh', '행동 지원', '중재 전략·시각자료'],
  ['prog', '진전도 점검', '측정·경고'],
  ['term', '학기말 평가', '종합 의견']
];
const supportsOf = (g) => { const m = String(g.note || '').match(/지원과 조정:\n((?:- .*(?:\n|$))+)/); return m ? m[1].split('\n').map((x) => x.replace(/^- /, '').trim()).filter(Boolean) : []; };
const spark = (vals, target) => {
  if (vals.length < 2) return '';
  const w = 120, h = 32, mx = Math.max(...vals, Number(target) || 0, 1), mn = Math.min(...vals, 0);
  const X = (i) => 4 + (i * (w - 8)) / (vals.length - 1), Y = (v) => h - 4 - ((v - mn) / (mx - mn || 1)) * (h - 8);
  const tl = target != null && target !== '' ? `<line x1="4" x2="${w - 4}" y1="${Y(Number(target))}" y2="${Y(Number(target))}" class="fl-tgt"/>` : '';
  return `<svg class="fl-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="측정값 ${vals.join(', ')}">${tl}<polyline points="${vals.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}" class="fl-line"/>${vals.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="2.5" class="fl-pt"/>`).join('')}</svg>`;
};

export function collectFlow(sid) {
  const s = student(sid);
  const evs = S.eventsBy[sid] || [];
  const memos = S.memosBy[sid] || [];
  const term = memos.filter((m) => m.kind === 'term').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  const notes = notesOf(sid);
  const recent = notes.filter((n) => n.date >= addDays(todayStr(), -30));
  const grow = notes.filter((n) => (n.tags || []).includes('잘한 점·성장') || n.star).slice(0, 3);
  const targets = (S.targetsBy[sid] || []).map((t) => {
    const series = behaviorSeries(t, evs); const va = visualAnalysis(t, series);
    const p = profileFor(sid, t.id); const sm = abcSummary(sid, t.id);
    const fns = p.top ? (p.mixed && p.second ? [p.top, p.second] : [p.top]) : [];
    return { t, va, p, hyp: p.top ? hypothesis(t, p, sm) : '', fns };
  });
  const comm = commOf(sid)[0];
  const pbFns = comm ? COMM_FNS.filter(([id]) => (comm.grid?.[id] || []).includes('pb')).map(([, l]) => l) : [];
  const goals = (S.goalsBy[sid] || []).map((g) => {
    const pts = [...(g.points || [])].sort((a, b) => (a.d > b.d ? 1 : -1)); const vals = pts.map((p) => Number(p.v)).filter(Number.isFinite);
    const up = g.direction !== 'down'; const last = vals[vals.length - 1];
    return { g, vals, last, met: vals.length ? (up ? last >= Number(g.target) : last <= Number(g.target)) : false, sup: supportsOf(g) };
  });
  const accs = accomsOf(sid);
  const incs = incidentsOf(sid);
  const vis = visItems(sid);
  const status = {
    know: s?.note || term?.traits || notes.length ? 'ok' : 'empty',
    assess: targets.some((x) => x.va.a) || masOf(sid).length || abcOf(sid).length || comm ? 'ok' : 'empty',
    goals: goals.length ? 'ok' : 'empty',
    plan: accs.length || goals.some((x) => x.sup.length) ? 'ok' : 'empty',
    beh: targets.length ? (targets.some((x) => x.t.interventionStart) || vis.length ? 'ok' : 'part') : 'empty',
    prog: goals.some((x) => x.vals.length) ? 'ok' : goals.length ? 'part' : 'empty',
    term: term ? 'ok' : 'empty'
  };
  return { s, term, notes, recent, grow, targets, comm, pbFns, goals, accs, incs, vis, status, mas: masOf(sid), abc: abcOf(sid) };
}

const ST_LABEL = { ok: '자료 있음', part: '진행 중', empty: '비어 있음' };
function stepBody(k, f, sid, print) {
  const link = (tab, label) => (print ? '' : `<a class="btn-link sm" href="#/student/${sid}/${tab}">${label}</a>`);
  if (k === 'know') return `<p class="small"><b>학년</b> ${esc(f.s?.grade || '-')} · <b>담당</b> ${esc(labelOf(f.s?.caseManager))}</p>
    <p class="small"><b>장애 특성·현행 수준</b> ${esc(f.term?.traits || String(f.s?.note || '').replace(/^가상 학생\s*·\s*/, '') || '적지 않음')}</p>
    <p class="small"><b>관찰 메모</b> 전체 ${f.notes.length}건, 최근 30일 ${f.recent.length}건</p>
    ${f.grow.length ? `<ul class="small">${f.grow.map((n) => `<li>${esc(fmtDate(n.date))} ${n.subj ? `[${esc(n.subj)}] ` : ''}${esc(n.text || '')}</li>`).join('')}</ul>` : ''}${link('note', '관찰 메모 열기')}`;
  if (k === 'assess') return `${f.targets.length ? `<ul class="small">${f.targets.map((x) => `<li><b>${esc(x.t.name)}</b> ${x.va.a ? `기초선 ${x.va.a.n}회기 평균 ${x.va.a.mean}` : '기초선 없음'}${x.va.ready ? ` — ${esc(x.va.ready[1].split('.')[0])}` : ''}${x.hyp ? `<br>기능 가설: ${esc(x.hyp)}` : ''}</li>`).join('')}</ul>` : '<p class="small muted">표적행동 없음</p>'}
    <p class="small">기능평가 기록: 동기평가 ${f.mas.length}건 · ABC ${f.abc.length}건 · 의사소통기능평가 ${f.comm ? 1 : 0}건${f.pbFns.length ? ` · 문제행동으로 전하는 기능: ${esc(f.pbFns.join(', '))}` : ''}</p>${link('fba', '기능평가 열기')} ${link('behavior', '기초선 열기')}`;
  if (k === 'goals') return f.goals.length ? `<ol class="small fl-goals">${f.goals.map((x) => { const g = x.g; return `<li><span class="tag">${esc(g.domain || '')}</span> ${esc(g.condition || '')} <b>${esc(g.behavior || '')}</b> ${esc(g.criterion || '')}
      ${g.std?.text ? `<br><small>성취기준 ${g.std.code ? `[${esc(g.std.code)}] ` : ''}${esc(g.std.text)}${g.unit ? ` · 단원 ${esc(g.unit)}` : ''}${g.lesson ? ` · ${esc(g.lesson)}` : ''}</small>` : ''}</li>`; }).join('')}</ol>${link('goals', 'IEP 목표 열기')}` : `<p class="small muted">목표가 없습니다.</p>${print ? '' : `<button type="button" class="ghost sm" data-act="iep-gen" data-sid="${sid}">IEP 생성기</button>`}`;
  if (k === 'plan') { const sup = [...new Set(f.goals.flatMap((x) => x.sup))];
    return `${sup.length ? `<p class="small"><b>지원과 조정</b></p><ul class="small">${sup.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="small muted">목표에 적힌 지원·조정이 없습니다(IEP 생성기로 만든 목표에 들어갑니다).</p>'}
      ${f.accs.length ? `<p class="small"><b>평가조정</b></p><ul class="small">${f.accs.map((a) => `<li>${esc(a.subject)}: ${CATS.map(([kk, l]) => ((a[kk] || []).length ? `${l} ${(a[kk] || []).map(esc).join(', ')}` : '')).filter(Boolean).join(' / ')}</li>`).join('')}</ul>` : ''}${link('accom', '평가조정 열기')}`; }
  if (k === 'beh') return `${f.targets.map((x) => `<div class="fl-beh"><p class="small"><b>${esc(x.t.name)}</b> <small>${esc(METHOD_LABEL[x.t.method] || '빈도')} · ${x.t.interventionStart ? `${esc(fmtDate(x.t.interventionStart))}부터 중재` : '기초선 단계'}${x.va.effect ? ` · ${esc(x.va.effect[1].split('.')[0])}` : ''}</small></p>
      ${x.fns.map((fn) => `<p class="tiny"><b>${esc(FN[fn])}</b> 예방: ${esc(STRAT[fn].A[0])} / 교체행동: ${esc(STRAT[fn].B[0])} / 결과: ${esc(STRAT[fn].C[0])}</p>`).join('')}</div>`).join('') || '<p class="small muted">표적행동 없음</p>'}
    <p class="small"><b>행동지원 시각자료</b></p>${visSection(sid, { edit: !print })}
    <p class="small">위기행동 사후 기록 ${f.incs.length}건${f.incs.length ? `(최근 ${esc(fmtDate(f.incs[0].date))})` : ''}</p>${link('crisis', '사후 기록 열기')}`;
  if (k === 'prog') return f.goals.length ? `<ul class="small fl-prog">${f.goals.map((x) => `<li><span>${esc(x.g.domain || '')}</span>${spark(x.vals, x.g.target)}<span>${x.vals.length ? `${x.vals.length}회 · 처음 ${x.vals[0]} → 마지막 ${x.last} (목표 ${esc(x.g.target)})` : '측정 없음'}</span>${x.vals.length ? `<span class="tag ${x.met ? 'ok' : ''}">${x.met ? '목표 도달' : '진행'}</span>` : ''}</li>`).join('')}</ul>${link('goals', '측정값 넣기')}` : '<p class="small muted">목표가 없습니다.</p>';
  if (k === 'term') return f.term ? `<p class="small">${esc(f.term.from)} ~ ${esc(f.term.to)} 저장 · ${esc(nameOf(f.term.updatedBy))}</p><p class="small pre">${esc((f.term.opinion || '').slice(0, 400))}${(f.term.opinion || '').length > 400 ? '…' : ''}</p>${link('term', '학기말 종합 열기')}` : `<p class="small muted">아직 저장한 학기말 종합이 없습니다.</p>${link('term', '학기말 종합 만들기')}`;
  return '';
}

export function flowHtml(sid, print = false) {
  const f = collectFlow(sid);
  return `<div class="fl ${print ? 'fl-print' : ''}">
    ${print ? `<h2 class="tr-title">IEP 전체 흐름 — ${esc(f.s?.alias || '')}</h2><p class="small">작성 ${esc(todayStr())} · 가상 학생 시연 자료</p>` : ''}
    <ol class="fl-steps" aria-label="IEP 단계">${STEPS.map(([k, l, d], i) => `<li class="fl-st ${f.status[k]}"><button type="button" class="fl-go" data-act="fl-go" data-k="${k}"><span class="fl-n">${i + 1}</span><span><b>${l}</b><small>${d}</small></span><span class="fl-dot" title="${ST_LABEL[f.status[k]]}" aria-label="${ST_LABEL[f.status[k]]}"></span></button></li>`).join('')}</ol>
    ${STEPS.map(([k, l, d], i) => `<section class="card fl-sec" id="fl-${k}"><div class="goal-head"><h3 class="h3"><span class="fl-n">${i + 1}</span> ${l} <small class="muted">${d}</small></h3><span class="grow"></span><span class="tag ${f.status[k] === 'ok' ? 'ok' : f.status[k] === 'part' ? 'warn' : ''}">${ST_LABEL[f.status[k]]}</span></div>${stepBody(k, f, sid, print)}</section>`).join('')}
  </div>`;
}

export function flowTab(s) {
  const sid = s.id;
  useSub('ev:' + sid, 'bevents', { sid }, (r) => { S.eventsBy[sid] = r; });
  useSub('memo:' + sid, 'memos', { sid }, (r) => { S.memosBy[sid] = r.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); });
  return `<div class="bar"><span class="small muted">학생 이해에서 학기말 평가까지 IEP를 한 흐름으로 봅니다. 단계 이름을 누르면 그 칸으로 갑니다.</span><span class="grow"></span>
    <button type="button" class="ghost" data-act="vis-pick" data-sid="${sid}">시각자료 고르기</button><button type="button" class="primary" data-act="fl-print" data-sid="${sid}">전체 인쇄</button></div>
    ${flowHtml(sid)}`;
}

on('fl-go', (el) => { const t = document.getElementById('fl-' + el.dataset.k); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); } });
on('fl-print', (el) => {
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = flowHtml(el.dataset.sid, true);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); setTimeout(() => window.print(), 50);
});
