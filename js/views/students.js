// 학생 목록과 학생별 IEP(목표·진전도), 행동 기초선, 공유 메모
import { esc, todayStr, fmtDate, addDays, openModal, toast, newId } from '../util.js';
import { S, on, rerender, useSub, go, teachers, aides, nameOf, labelOf, avatar, student, isTeacher } from '../state.js';
import { progressChart, progressWarning, behaviorChart, behaviorSeries, baselineStats, ioaDays, METHOD_LABEL, INT_LABEL } from '../charts.js';
import { crisisTab, incidentDates, reviewWarning } from './incidents.js';
import { notesTab, isNote } from './notes.js';
import { accomTab, accomsOf, needsMyConfirm } from './accoms.js';
import { logAccess } from '../access.js';
import { recordCard, eventRow, confirmInline, ANTECEDENTS, CONSEQUENCES } from './record.js';
import { openMeetingModal } from './calendar.js';
import { openStudentRoom } from './chat.js';

export const goalMissing = (g) => {
  const miss = [];
  if (!g.condition?.trim()) miss.push('조건');
  if (!g.behavior?.trim()) miss.push('행동');
  if (!g.criterion?.trim()) miss.push('기준');
  else if (!/\d/.test(g.criterion)) miss.push('기준의 수치');
  return miss;
};

export function warningsFor(sid) {
  const n = Number(S.school.warnRun) || 3;
  return (S.goalsBy[sid] || []).filter((g) => g.status !== '달성' && progressWarning(g, n));
}

export function render(route) {
  if (route.name === 'student' && route.args[0]) return detail(route.args[0], route.args[1] || 'goals', route.args.slice(2));
  const cards = S.students.map((s) => {
    const w = warningsFor(s.id).length;
    const gs = S.goalsBy[s.id] || [];
    const ts = S.targetsBy[s.id] || [];
    return `<a class="card stu-card" href="#/student/${s.id}/goals">
      <div class="stu-top"><h2 class="h3">${esc(s.alias)}</h2><span class="muted">${esc(s.grade || '')}</span>${w ? `<span class="tag warn">진전도 경고 ${w}</span>` : ''}</div>
      <p class="muted small">${esc(s.note || '')}</p>
      <p class="small">담당 ${esc(nameOf(s.caseManager))} · 목표 ${gs.length}개 · 표적행동 ${ts.length}개</p>
      <div class="avatars">${(s.teamUids || []).map((u) => avatar(u, 'sm')).join('')}</div></a>`;
  }).join('');
  return `<div class="page-head"><h1>학생·IEP</h1><button type="button" class="primary" data-act="stu-new">학생 추가</button></div>
    <p class="muted small">시연판에는 가명·가상 학생만 넣습니다.</p>
    <div class="grid">${cards || '<section class="card"><p>아직 학생이 없습니다. 「학생 추가」를 누르거나 관리 화면에서 가상 학생 예시를 넣으세요.</p></section>'}</div>`;
}

function detail(sid, tab, args = []) {
  const s = student(sid);
  if (!s) return '<section class="card"><p>학생을 찾을 수 없습니다.</p><a href="#/students">목록으로</a></section>';
  const nAcc = accomsOf(sid).filter(needsMyConfirm).length;
  const tabs = [['goals', 'IEP 목표·진전도'], ['note', '관찰 메모'], ['behavior', '행동·기초선'], ['crisis', '위기행동 사후 기록'], ['accom', `평가조정${nAcc ? ` <span class="badge">${nAcc}</span>` : ''}`], ['memo', '공유 메모']];
  logAccess(sid, 'view', tab === 'goals' ? 'goals_tab' : tab);
  const body = tab === 'behavior' ? behaviorTab(s) : tab === 'note' ? notesTab(s) : tab === 'memo' ? memoTab(s) : tab === 'crisis' ? crisisTab(s, args) : tab === 'accom' ? accomTab(s) : goalsTab(s);
  return `<a class="back" href="#/students">‹ 학생 목록</a>
  <div class="page-head"><h1>${esc(s.alias)} <small class="muted">${esc(s.grade || '')}</small></h1>
    <div class="btns"><button type="button" class="ghost" data-act="stu-room" data-sid="${sid}">팀 대화방</button>
    <button type="button" class="ghost" data-act="stu-meet" data-sid="${sid}">팀 회의 예약</button>
    <button type="button" class="ghost" data-act="stu-edit" data-sid="${sid}">정보·팀 수정</button></div></div>
  <p class="small">담당 ${esc(labelOf(s.caseManager))}<br>팀 ${(s.teamUids || []).map((u) => esc(nameOf(u))).join(', ') || '-'} · 행동 기록 보조인력 ${(s.aideUids || []).map((u) => esc(nameOf(u))).join(', ') || '없음'}</p>
  <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" href="#/student/${sid}/${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}">${l}</a>`).join('')}</div>
  ${body}`;
}

/* ---------- IEP 목표·진전도 ---------- */
function goalsTab(s) {
  const n = Number(S.school.warnRun) || 3;
  const goals = (S.goalsBy[s.id] || []).sort((a, b) => (a.domain > b.domain ? 1 : -1));
  const cards = goals.map((g) => {
    const miss = goalMissing(g);
    const w = progressWarning(g, n);
    const pts = [...(g.points || [])].sort((a, b) => (a.d < b.d ? 1 : -1));
    return `<section class="card goal">
      <div class="goal-head"><span class="tag">${esc(g.domain || '영역')}</span><span class="tag ${g.status === '달성' ? 'ok' : ''}">${esc(g.status || '진행')}</span><span class="grow"></span>
        <button type="button" class="ghost sm" data-act="goal-edit" data-sid="${s.id}" data-gid="${g.id}">수정</button></div>
      <p class="goal-text">${esc(g.condition)} <b>${esc(g.behavior)}</b> ${esc(g.criterion)}</p>
      ${miss.length ? `<p class="alert small">측정 가능한 목표가 되려면 ${miss.join(', ')}이(가) 필요합니다.</p>` : ''}
      ${w ? `<div class="alert warn" role="alert"><b>진전도 경고</b> 최근 ${n}회 연속 목표선에 못 미쳤습니다. 교수 방법이나 목표 조정을 팀과 협의하세요.
        <button type="button" class="sm" data-act="warn-meet" data-sid="${s.id}" data-gid="${g.id}">팀 회의 예약</button></div>` : ''}
      ${progressChart(g, w)}
      <form class="inline-form" data-gid="${g.id}" data-sid="${s.id}">
        <label>날짜<input type="date" name="d" value="${todayStr()}" required></label>
        <label>${esc(g.measure || '값')}<input type="number" step="any" name="v" required inputmode="decimal"></label>
        <button type="submit" class="primary sm">측정값 추가</button>
      </form>
      ${pts.length ? `<details><summary>측정 기록 ${pts.length}회</summary><ul class="rows">${pts.map((p) => `<li><span>${esc(fmtDate(p.d))}</span><span class="grow">${esc(p.v)}</span><button type="button" class="link sm" data-act="pt-del" data-sid="${s.id}" data-gid="${g.id}" data-d="${p.d}" data-v="${p.v}">지우기</button></li>`).join('')}</ul></details>` : ''}
    </section>`;
  }).join('');
  return `<div class="bar"><button type="button" class="primary" data-act="goal-new" data-sid="${s.id}">목표 추가</button>
    <span class="muted small">조건·행동·기준을 갖춘 목표에 측정값을 넣으면 목표선과 비교해 경고합니다(연속 ${n}회 기준, 관리 화면에서 변경).</span></div>
    ${cards || '<section class="card"><p>아직 목표가 없습니다.</p></section>'}`;
}

function goalForm(g = {}) {
  const t = todayStr();
  return `<form><h2>${g.id ? 'IEP 목표 수정' : 'IEP 목표 추가'}</h2>
    <div class="row2"><label>영역<input name="domain" value="${esc(g.domain || '')}" placeholder="예: 의사소통, 수학, 사회성" required></label>
    <label>상태<select name="status">${['진행', '수정 필요', '달성', '보류'].map((x) => `<option ${g.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
    <label>조건(언제·어떤 상황에서)<input name="condition" value="${esc(g.condition || '')}" placeholder="예: 쉬는 시간에 그림카드 3장이 제시되면"></label>
    <label>행동(관찰 가능한 동사)<input name="behavior" value="${esc(g.behavior || '')}" placeholder="예: 원하는 활동 카드를 골라 교사에게 건넨다"></label>
    <label>기준(얼마나·몇 번)<input name="criterion" value="${esc(g.criterion || '')}" placeholder="예: 10회 기회 중 8회 이상, 3회기 연속"></label>
    <p class="hint" data-miss></p>
    <div class="row2"><label>측정 단위<input name="measure" value="${esc(g.measure || '정반응률(%)')}"></label>
    <label>좋아지는 방향<select name="direction"><option value="up" ${g.direction !== 'down' ? 'selected' : ''}>값이 커질수록 좋음</option><option value="down" ${g.direction === 'down' ? 'selected' : ''}>값이 작아질수록 좋음</option></select></label></div>
    <div class="row2"><label>기초 수준(현재 값)<input type="number" step="any" name="baseline" value="${esc(g.baseline ?? '')}" required></label>
    <label>목표 값<input type="number" step="any" name="target" value="${esc(g.target ?? '')}" required></label></div>
    <div class="row2"><label>시작일<input type="date" name="startDate" value="${esc(g.startDate || t)}" required></label>
    <label>목표일<input type="date" name="targetDate" value="${esc(g.targetDate || addDays(t, 56))}" required></label></div>
    <div class="actions">${g.id ? '<button type="button" class="danger ghost" data-del>삭제</button>' : ''}<span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">저장</button></div></form>`;
}
function bindGoalForm(m, sid, g) {
  const f = m.querySelector('form');
  const upd = () => { const miss = goalMissing({ condition: f.condition.value, behavior: f.behavior.value, criterion: f.criterion.value }); m.querySelector('[data-miss]').textContent = miss.length ? `아직 빠진 요소: ${miss.join(', ')}` : '조건·행동·기준이 모두 들어 있습니다.'; };
  f.addEventListener('input', upd); upd();
  const del = m.querySelector('[data-del]');
  if (del) del.onclick = async () => { if (!confirmInline(del)) return; await S.store.remove('goals', { sid }, g.id); m.closest('.modal-back').remove(); toast('목표를 지웠습니다'); };
}
const goalData = (fd) => ({ domain: fd.get('domain'), status: fd.get('status'), condition: fd.get('condition'), behavior: fd.get('behavior'), criterion: fd.get('criterion'), measure: fd.get('measure'), direction: fd.get('direction'), baseline: Number(fd.get('baseline')), target: Number(fd.get('target')), startDate: fd.get('startDate'), targetDate: fd.get('targetDate'), updatedBy: S.me.uid, updatedAt: Date.now() });

on('goal-new', (el) => { const sid = el.dataset.sid; openModal(goalForm(), { wide: true, onOpen: (m) => bindGoalForm(m, sid, {}), onSubmit: async (fd) => { await S.store.create('goals', { sid }, { ...goalData(fd), points: [], createdBy: S.me.uid, createdAt: Date.now() }); toast('목표를 추가했습니다'); } }); });
on('goal-edit', (el) => { const { sid, gid } = el.dataset; const g = (S.goalsBy[sid] || []).find((x) => x.id === gid); openModal(goalForm(g), { wide: true, onOpen: (m) => bindGoalForm(m, sid, g), onSubmit: async (fd) => { await S.store.update('goals', { sid }, gid, goalData(fd)); toast('목표를 저장했습니다'); } }); });
on('pt-del', async (el) => {
  if (!confirmInline(el)) return;
  const { sid, gid, d, v } = el.dataset; const g = (S.goalsBy[sid] || []).find((x) => x.id === gid);
  let removed = false;
  const pts = (g.points || []).filter((p) => { if (!removed && p.d === d && String(p.v) === v) { removed = true; return false; } return true; });
  await S.store.update('goals', { sid }, gid, { points: pts });
});
on('warn-meet', (el) => { const s = student(el.dataset.sid); const g = (S.goalsBy[s.id] || []).find((x) => x.id === el.dataset.gid); openMeetingModal({ kind: 'meeting', title: `${s.alias} 진전도 협의(${g?.domain || ''})`, attendeeUids: s.teamUids || [], studentId: s.id, memo: `진전도 경고: ${g?.behavior || ''}` }); });

document.addEventListener('submit', async (e) => {
  const f = e.target.closest('.inline-form[data-gid]');
  if (!f) return;
  e.preventDefault();
  const { sid, gid } = f.dataset; const g = (S.goalsBy[sid] || []).find((x) => x.id === gid);
  const fd = new FormData(f);
  const pts = [...(g.points || []), { d: fd.get('d'), v: Number(fd.get('v')), by: S.me.uid }];
  await S.store.update('goals', { sid }, gid, { points: pts, updatedAt: Date.now() });
  toast('측정값을 추가했습니다');
});

/* ---------- 행동·기초선 ---------- */
function behaviorTab(s) {
  useSub('ev:' + s.id, 'bevents', { sid: s.id }, (r) => { S.eventsBy[s.id] = r; });
  const evs = S.eventsBy[s.id] || [];
  const targets = S.targetsBy[s.id] || [];
  const blocks = targets.map((t) => {
    const series = behaviorSeries(t, evs);
    const st = baselineStats(series);
    const enough = st.n >= 5 ? ['ok', `${st.n}회기: 권장 기준(5회기 이상)을 충족했습니다.`] : st.n >= 3 ? ['mid', `${st.n}회기: 최소 기준(3회기)은 충족했습니다. 가능하면 5회기까지 모으세요.`] : ['low', `${st.n}회기: 최소 3회기가 필요합니다.`];
    const trend = st.n >= 3 ? (Math.abs(st.slope) < 0.15 * (st.mean || 1) / Math.max(1, st.n / 3) ? '뚜렷한 추세 없음' : st.slope > 0 ? '늘어나는 추세' : '줄어드는 추세') : '-';
    const tevs = evs.filter((e) => e.targetId === t.id && e.type !== 'session');
    const freq = (key) => { const c = {}; tevs.forEach((e) => { if (e[key]) c[e[key]] = (c[e[key]] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${esc(k)} ${v}`).join(', ') || '자료 없음'; };
    const recent = [...evs.filter((e) => e.targetId === t.id)].sort((a, b) => b.at - a.at).slice(0, 8);
    return `<section class="card">
      <div class="goal-head"><h2 class="h3">${esc(t.name)} <small class="muted">${METHOD_LABEL[t.method] || '빈도'}${t.method === 'int' ? ` · ${INT_LABEL[t.intType || 'partial']} ${esc(t.intervalSec || 10)}초 × ${esc(t.intervals || 30)}칸` : ''} · 회기 ${esc(t.sessionMin || 40)}분</small></h2><span class="grow"></span>
        <button type="button" class="ghost sm" data-act="tgt-edit" data-sid="${s.id}" data-tid="${t.id}">정의 수정</button></div>
      <p class="small"><b>조작적 정의</b> ${esc(t.definition || '-')}</p>
      ${behaviorChart(t, series, incidentDates(s.id))}
      <div class="stats">
        <div class="stat ${enough[0]}"><span>기초선 회기</span><b>${st.n || 0}</b><small>${enough[1]}</small></div>
        <div class="stat"><span>평균</span><b>${st.mean ?? '-'}</b><small>중앙값 ${st.median ?? '-'}</small></div>
        <div class="stat"><span>범위</span><b>${st.n ? `${st.min}~${st.max}` : '-'}</b><small>${trend}</small></div>
        <div class="stat"><span>안정성(참고)</span><b>${st.n ? st.within + '%' : '-'}</b><small>중앙값 ±20% 안에 든 회기 비율</small></div>
      </div>
      <p class="small muted">안정성 판정은 그래프와 함께 교사가 합니다. 자료점 기준은 WWC 단일대상설계 기준(단계당 3개 이상, 5개 이상 권장)을 따릅니다.</p>
      ${ioaPanel(t, evs, series)}
      ${['int', 'lat'].includes(t.method) ? '' : `<div class="hyp"><p class="small"><b>기능 가설 도움(자주 나온 상황)</b><br>앞: ${freq('antecedent')}<br>뒤: ${freq('consequence')}</p></div>`}
      <div class="btns">${t.interventionStart
        ? `<span class="tag ok">${esc(fmtDate(t.interventionStart))}부터 중재(B)</span><button type="button" class="ghost sm" data-act="tgt-phase-reset" data-sid="${s.id}" data-tid="${t.id}">기초선으로 되돌리기</button>`
        : `<button type="button" class="primary sm" data-act="tgt-phase" data-sid="${s.id}" data-tid="${t.id}" ${st.n < 3 ? 'aria-describedby="need3"' : ''}>기초선 확정·중재 시작</button>${st.n < 3 ? '<small id="need3" class="muted">3회기 이상 모은 뒤 권장</small>' : ''}`}
        <button type="button" class="ghost sm" data-act="stu-meet" data-sid="${s.id}">행동지원 협의 예약</button></div>
      <details><summary>최근 기록(누구나 기록한 것 전체)</summary><ul class="rows">${recent.map((e) => eventRow(e, { showStudent: false, showBy: true })).join('') || '<li class="muted">없음</li>'}</ul></details>
    </section>`;
  }).join('');
  const rw = reviewWarning(s.id);
  return `<div class="bar"><button type="button" class="primary" data-act="tgt-new" data-sid="${s.id}">표적행동 정하기</button>
    <span class="muted small">표적행동을 정하면 교사와 배정된 보조인력의 휴대폰에 즉시 기록 버튼이 생깁니다.</span></div>
    ${rw ? `<div class="alert warn" role="alert"><span>최근 ${rw.days}일 위기행동 사후 기록 ${rw.cnt}건(기준 ${rw.n}건). 행동지원계획 재검토를 권합니다.</span><a class="btn-link sm" href="#/student/${s.id}/crisis">사후 기록 보기</a></div>` : ''}
    ${recordCard(s, targets, evs)}${blocks || ''}`;
}

// 관찰자 간 일치도: WWC 단일대상설계 기준(일치도 .80 이상, 단계마다 회기의 20% 이상에서 수집)에 비추어 보여 준다
function ioaPanel(t, evs, series) {
  const days = ioaDays(t, evs);
  const nA = series.filter((p) => p.phase === 'A').length, nB = series.filter((p) => p.phase === 'B').length;
  const inA = days.filter((d) => !t.interventionStart || d.d < t.interventionStart).length, inB = days.length - inA;
  const valid = days.filter((d) => d.pct != null);
  const avg = valid.length ? Math.round(valid.reduce((a, d) => a + d.pct, 0) / valid.length) : null;
  const cover = (k, n) => (n ? Math.round((k / n) * 100) : 0);
  const okAvg = avg != null && avg >= 80, okA = cover(inA, nA) >= 20, okB = !nB || cover(inB, nB) >= 20;
  return `<details class="ioa" ${days.length ? 'open' : ''}><summary>관찰자 간 일치도 ${days.length ? `<span class="tag ${okAvg ? 'ok' : 'warn'}">평균 ${avg ?? '-'}%</span>` : '<span class="tag">자료 없음</span>'}</summary>
    ${days.length ? `<table class="ioa-table"><thead><tr><th>날짜</th><th>주 관찰자</th><th>두 번째 관찰자</th><th>일치도(${esc(days[0].how)})</th></tr></thead><tbody>${days.slice(-8).map((d) => `<tr><td>${esc(fmtDate(d.d))}</td><td>${esc(d.a)}</td><td>${esc(d.b)} <small class="muted">${d.by.map(nameOf).map(esc).join(', ')}</small></td><td><b class="${d.pct != null && d.pct >= 80 ? 'ok-t' : 'warn-t'}">${d.pct ?? '-'}%</b></td></tr>`).join('')}</tbody></table>
      <p class="small">기초선 ${nA}회기 중 ${inA}회기(${cover(inA, nA)}%)${nB ? `, 중재 ${nB}회기 중 ${inB}회기(${cover(inB, nB)}%)` : ''}에서 일치도를 냈습니다. ${okAvg && okA && okB ? '기준을 충족합니다.' : '기준(평균 80% 이상, 단계마다 회기의 20% 이상)에 아직 못 미칩니다.'}</p>`
      : '<p class="small muted">같은 시간에 다른 선생님이나 보조인력이 「두 번째 관찰자로 기록」을 켜고 따로 기록하면 날마다 일치도를 계산합니다.</p>'}
    <p class="small muted">기준: WWC 단일대상설계 기준(Kratochwill 외, 2010) — 일치도 .80 이상, 단계마다 회기의 20% 이상.</p></details>`;
}

function targetForm(t = {}) {
  return `<form><h2>${t.id ? '표적행동 정의 수정' : '표적행동 정하기'}</h2>
    <label>행동 이름(버튼에 표시)<input name="name" value="${esc(t.name || '')}" required maxlength="20" placeholder="예: 소리 지르기"></label>
    <label>조작적 정의(보이고 셀 수 있게)<textarea name="definition" rows="2" required placeholder="예: 수업 중 다른 사람이 들을 만큼 큰 소리를 1초 이상 내는 행동">${esc(t.definition || '')}</textarea></label>
    <div class="row2"><label>해당하는 예<input name="examples" value="${esc(t.examples || '')}"></label><label>해당하지 않는 예<input name="nonExamples" value="${esc(t.nonExamples || '')}"></label></div>
    <div class="row2"><label>측정 방법<select name="method" data-method>${[['freq', '빈도(한 번 누르면 1회)'], ['dur', '지속시간(시작·끝 누름)'], ['int', '간격기록·순간표집(신호마다 예/아니오)'], ['lat', '잠재시간(지시 → 행동 시작까지)']].map(([v, l]) => `<option value="${v}" ${(t.method || 'freq') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>회기(관찰) 시간(분)<input type="number" name="sessionMin" min="1" value="${esc(t.sessionMin || 40)}"></label></div>
    <div class="row3 int-only" ${t.method === 'int' ? '' : 'hidden'}><label>간격 방식<select name="intType">${Object.entries(INT_LABEL).map(([v, l]) => `<option value="${v}" ${(t.intType || 'partial') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>간격(초)<input type="number" name="intervalSec" min="5" max="600" value="${esc(t.intervalSec || 10)}"></label><label>칸 수<input type="number" name="intervals" min="2" max="120" value="${esc(t.intervals || 30)}"></label></div>
    <p class="small muted int-only" ${t.method === 'int' ? '' : 'hidden'}>부분간격은 한 번이라도 일어나면, 전체간격은 간격 내내 이어지면, 순간표집은 간격이 끝나는 순간에 하고 있으면 「예」입니다. 자주 일어나 일일이 세기 어려운 행동에 씁니다.</p>
    <p class="small muted lat-only" ${t.method === 'lat' ? '' : 'hidden'}>지시를 준 순간 버튼을 누르고, 학생이 지시한 행동을 시작하면 다시 누릅니다. 반응이 없으면 「반응 없음」으로 끝냅니다.</p>
    <label>기초선 시작일<input type="date" name="baselineStart" value="${esc(t.baselineStart || todayStr())}"></label>
    <div class="actions">${t.id ? '<button type="button" class="danger ghost" data-del>삭제</button>' : ''}<span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">저장</button></div></form>`;
}
const targetData = (fd) => ({ name: fd.get('name'), definition: fd.get('definition'), examples: fd.get('examples'), nonExamples: fd.get('nonExamples'), method: fd.get('method'), sessionMin: Number(fd.get('sessionMin')) || 40, baselineStart: fd.get('baselineStart'),
  intType: fd.get('intType') || 'partial', intervalSec: Number(fd.get('intervalSec')) || 10, intervals: Number(fd.get('intervals')) || 30, updatedAt: Date.now() });
const bindTargetForm = (m) => { const sel = m.querySelector('[data-method]'); const upd = () => { m.querySelectorAll('.int-only').forEach((x) => (x.hidden = sel.value !== 'int')); m.querySelectorAll('.lat-only').forEach((x) => (x.hidden = sel.value !== 'lat')); }; sel.addEventListener('change', upd); upd(); };
on('tgt-new', (el) => { const sid = el.dataset.sid; openModal(targetForm(), { wide: true, onOpen: bindTargetForm, onSubmit: async (fd) => { await S.store.create('targets', { sid }, { ...targetData(fd), phase: 'baseline', interventionStart: '', createdBy: S.me.uid, createdAt: Date.now() }); toast('표적행동을 정했습니다. 기록 버튼이 생겼습니다.'); } }); });
on('tgt-edit', (el) => {
  const { sid, tid } = el.dataset; const t = (S.targetsBy[sid] || []).find((x) => x.id === tid);
  openModal(targetForm(t), { wide: true, onOpen: (m) => { bindTargetForm(m); const d = m.querySelector('[data-del]'); d.onclick = async () => { if (!confirmInline(d)) return; await S.store.remove('targets', { sid }, tid); m.closest('.modal-back').remove(); toast('표적행동을 지웠습니다(기록은 남습니다)'); }; }, onSubmit: async (fd) => { await S.store.update('targets', { sid }, tid, targetData(fd)); toast('저장했습니다'); } });
});
on('tgt-phase', (el) => {
  const { sid, tid } = el.dataset;
  openModal(`<form><h2>기초선 확정·중재 시작</h2><p class="small">이 날짜부터의 기록은 중재 단계(B)로 그래프에 표시됩니다. 기초선 자료는 그대로 남습니다.</p>
    <label>중재 시작일<input type="date" name="d" value="${todayStr()}" required></label>
    <label>중재 메모(무엇을 바꾸는지)<textarea name="memo" rows="2" placeholder="예: 과제 제시 전 그림 일과표 안내, 대체행동(도움 카드) 강화"></textarea></label>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">중재 시작</button></div></form>`, {
    onSubmit: async (fd) => { await S.store.update('targets', { sid }, tid, { interventionStart: fd.get('d'), phase: 'intervention', interventionMemo: fd.get('memo') || '' }); toast('중재 단계로 바꿨습니다'); }
  });
});
on('tgt-phase-reset', async (el) => { if (!confirmInline(el)) return; const { sid, tid } = el.dataset; await S.store.update('targets', { sid }, tid, { interventionStart: '', phase: 'baseline' }); });

/* ---------- 학생 추가·수정 ---------- */
function studentForm(s = {}) {
  const tch = teachers(), ad = aides();
  const box = (name, list, sel) => list.map((m) => `<label class="chk"><input type="checkbox" name="${name}" value="${m.id}" ${(sel || []).includes(m.id) ? 'checked' : ''}> ${esc(m.name)} <small class="muted">${esc(m.title || '')}</small></label>`).join('') || '<p class="muted small">해당하는 사람이 아직 없습니다(관리 화면에서 초대).</p>';
  return `<form><h2>${s.id ? '학생 정보·팀 수정' : '학생 추가'}</h2>
    <div class="row2"><label>가명(별칭)<input name="alias" value="${esc(s.alias || '')}" required placeholder="실명 대신 별칭"></label><label>학년·반<input name="grade" value="${esc(s.grade || '')}"></label></div>
    <label>메모(장애 유형 등은 최소한으로)<input name="note" value="${esc(s.note || '')}"></label>
    <label>IEP 담당 교사<select name="caseManager">${tch.map((m) => `<option value="${m.id}" ${(s.caseManager || S.me.uid) === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
    <fieldset><legend>IEP 팀 교사</legend><div class="chk-list">${box('team', tch, s.teamUids || [S.me.uid])}</div></fieldset>
    <fieldset><legend>행동 기록 보조인력(기초선 기록에만 연결)</legend><div class="chk-list">${box('aides', ad, s.aideUids)}</div></fieldset>
    <div class="actions">${s.id ? '<button type="button" class="danger ghost" data-del>삭제</button>' : ''}<span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">저장</button></div></form>`;
}
const studentData = (fd) => {
  const cm = fd.get('caseManager');
  const team = [...new Set([cm, ...fd.getAll('team')])].filter(Boolean);
  return { alias: fd.get('alias'), grade: fd.get('grade'), note: fd.get('note'), caseManager: cm, teamUids: team, aideUids: fd.getAll('aides'), updatedAt: Date.now() };
};
on('stu-new', () => openModal(studentForm(), { wide: true, onSubmit: async (fd) => { const id = await S.store.create('students', {}, { ...studentData(fd), createdBy: S.me.uid, createdAt: Date.now() }); toast('학생을 추가했습니다'); go(`#/student/${id}/goals`); } }));
on('stu-edit', (el) => {
  const s = student(el.dataset.sid);
  openModal(studentForm(s), { wide: true, onOpen: (m) => { const d = m.querySelector('[data-del]'); d.onclick = async () => { if (!confirmInline(d)) return; await S.store.remove('students', {}, s.id); m.closest('.modal-back').remove(); go('#/students'); }; }, onSubmit: async (fd) => { await S.store.update('students', {}, s.id, studentData(fd)); toast('저장했습니다'); } });
});
on('stu-meet', (el) => { const s = student(el.dataset.sid); openMeetingModal({ kind: 'meeting', title: `${s.alias} IEP 팀 협의`, attendeeUids: s.teamUids || [], studentId: s.id }); });
on('stu-room', (el) => openStudentRoom(el.dataset.sid));

/* ---------- 공유 메모(블록 문서) ---------- */
function memoTab(s) {
  useSub('memo:' + s.id, 'memos', { sid: s.id }, (r) => { S.memosBy[s.id] = r.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); });
  const memos = (S.memosBy[s.id] || []).filter((m) => !isNote(m));
  const openId = S.ui.memo?.[s.id] || memos[0]?.id;
  const cur = memos.find((m) => m.id === openId);
  const list = memos.map((m) => `<button type="button" class="memo-item ${m.id === openId ? 'on' : ''}" data-act="memo-open" data-sid="${s.id}" data-mid="${m.id}"><b>${esc(m.title || '제목 없음')}</b><small class="muted">${esc(nameOf(m.updatedBy))} · ${m.updatedAt ? new Date(m.updatedAt).toLocaleDateString('ko-KR') : ''}</small></button>`).join('');
  const editor = cur ? `<div class="memo-editor" data-sid="${s.id}" data-mid="${cur.id}">
      <input class="memo-title" id="mt-${cur.id}" value="${esc(cur.title || '')}" aria-label="메모 제목" data-memo-field="title">
      <p class="muted small">함께 편집하는 메모입니다. 칸을 벗어나면 저장되고, 다른 선생님 화면에도 바로 반영됩니다. 마지막 수정: ${esc(nameOf(cur.updatedBy))}</p>
      <ol class="blocks">${(cur.blocks || []).map((b, i) => `<li class="block b-${b.t}">
        ${b.t === 'c' ? `<input type="checkbox" aria-label="완료" data-act="blk-check" data-i="${i}" ${b.done ? 'checked' : ''}>` : ''}
        <input class="blk" id="b-${cur.id}-${i}" data-i="${i}" value="${esc(b.text || '')}" aria-label="${b.t === 'h' ? '소제목' : b.t === 'c' ? '할 일' : '문단'}">
        <button type="button" class="link sm" data-act="blk-del" data-i="${i}" aria-label="이 줄 지우기">×</button></li>`).join('')}</ol>
      <div class="btns"><button type="button" class="ghost sm" data-act="blk-add" data-t="h">+ 소제목</button><button type="button" class="ghost sm" data-act="blk-add" data-t="p">+ 문단</button><button type="button" class="ghost sm" data-act="blk-add" data-t="c">+ 체크리스트</button>
      <span class="grow"></span><button type="button" class="danger ghost sm" data-act="memo-del">메모 삭제</button></div></div>` : '<p class="muted">메모가 없습니다. 새 메모를 만드세요.</p>';
  return `<div class="memo-wrap"><aside class="memo-list"><button type="button" class="primary sm block" data-act="memo-new" data-sid="${s.id}">새 메모</button>${list}
    <p class="muted small">템플릿: 새 메모를 만들 때 「IEP 회의 안건」, 「행동 관찰 메모」 중에서 고를 수 있습니다.</p></aside><div class="card memo-main">${editor}</div></div>`;
}
const TEMPLATES = {
  '빈 메모': [{ t: 'p', text: '' }],
  'IEP 회의 안건': [{ t: 'h', text: '안건' }, { t: 'c', text: '현행 수준 확인' }, { t: 'c', text: '목표별 진전도 검토' }, { t: 'c', text: '교수·평가 조정 점검' }, { t: 'h', text: '결정 사항' }, { t: 'p', text: '' }, { t: 'h', text: '할 일' }, { t: 'c', text: '' }],
  '행동 관찰 메모': [{ t: 'h', text: '관찰 상황' }, { t: 'p', text: '' }, { t: 'h', text: '앞 상황 → 행동 → 뒤 결과' }, { t: 'p', text: '' }, { t: 'h', text: '다음에 시도할 것' }, { t: 'c', text: '' }]
};
on('memo-new', (el) => {
  const sid = el.dataset.sid;
  openModal(`<form><h2>새 공유 메모</h2><label>제목<input name="title" required></label><label>양식<select name="tpl">${Object.keys(TEMPLATES).map((k) => `<option>${k}</option>`).join('')}</select></label>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">만들기</button></div></form>`, {
    onSubmit: async (fd) => { const id = await S.store.create('memos', { sid }, { title: fd.get('title'), blocks: TEMPLATES[fd.get('tpl')], createdBy: S.me.uid, updatedBy: S.me.uid, createdAt: Date.now(), updatedAt: Date.now() }); (S.ui.memo ||= {})[sid] = id; rerender(); }
  });
});
on('memo-open', (el) => { (S.ui.memo ||= {})[el.dataset.sid] = el.dataset.mid; rerender(); });
const memoCtx = (el) => { const ed = el.closest('.memo-editor'); const { sid, mid } = ed.dataset; return { sid, mid, memo: (S.memosBy[sid] || []).find((m) => m.id === mid) }; };
const saveBlocks = (sid, mid, blocks, extra = {}) => S.store.update('memos', { sid }, mid, { blocks, updatedBy: S.me.uid, updatedAt: Date.now(), ...extra });
on('blk-add', async (el) => { const { sid, mid, memo } = memoCtx(el); await saveBlocks(sid, mid, [...(memo.blocks || []), { t: el.dataset.t, text: '', done: false }]); setTimeout(() => { const ins = document.querySelectorAll('.memo-editor .blk'); ins[ins.length - 1]?.focus(); }, 60); });
on('blk-del', async (el) => { const { sid, mid, memo } = memoCtx(el); const b = [...memo.blocks]; b.splice(+el.dataset.i, 1); await saveBlocks(sid, mid, b); });
on('blk-check', async (el) => { const { sid, mid, memo } = memoCtx(el); const b = structuredClone(memo.blocks); b[+el.dataset.i].done = el.checked; await saveBlocks(sid, mid, b); });
on('memo-del', async (el) => { if (!confirmInline(el)) return; const { sid, mid } = memoCtx(el); await S.store.remove('memos', { sid }, mid); S.ui.memo[sid] = null; });
document.addEventListener('focusout', async (e) => {
  const el = e.target;
  if (!el.closest?.('.memo-editor')) return;
  const { sid, mid, memo } = memoCtx(el);
  if (!memo) return;
  if (el.dataset.memoField === 'title' && el.value !== memo.title) await S.store.update('memos', { sid }, mid, { title: el.value, updatedBy: S.me.uid, updatedAt: Date.now() });
  if (el.classList.contains('blk')) { const i = +el.dataset.i; if (memo.blocks[i] && memo.blocks[i].text !== el.value) { const b = structuredClone(memo.blocks); b[i].text = el.value; await saveBlocks(sid, mid, b); } }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList?.contains('blk')) { e.preventDefault(); e.target.blur(); }
});

export { ANTECEDENTS, CONSEQUENCES, isTeacher, newId };
