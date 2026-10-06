// 위기행동 사후 기록: 사건 기록 → 학교장 보고·보호자 통지 → 팀 회고 → 마무리를 한 흐름으로 묶는다.
// 국내 근거: 「교원의 학생생활지도에 관한 고시」(교육부고시 제2023-28호)의 물리적 제지와 보고·통지.
// 팀 회고 기한은 법정 수치가 없어 판정하지 않고, 학교가 관리 화면에서 정한 값(수업일 기준)만 안내한다.
import { esc, todayStr, timeStr, fmtDate, addDays, diffDays, parseDate, openModal, closeModal, toast } from '../util.js';
import { S, on, go, teachers, nameOf, student, isAdmin } from '../state.js';
import { HOLIDAYS } from '../holidays.js';
import { confirmInline, INTENSITY } from './record.js';
import { openMeetingModal } from './calendar.js';
import { sendAlert } from './alerts.js';

const isSchoolDay = (d) => { const w = parseDate(d).getDay(); return w !== 0 && w !== 6 && !HOLIDAYS[d]; };
export function schoolDaysAfter(d, n) { let x = d, k = 0; while (k < n) { x = addDays(x, 1); if (isSchoolDay(x)) k++; } return x; }

export const debriefDays = () => { const v = Number(S.school.debriefDays); return Number.isFinite(v) ? v : 2; };
export function debriefDue(ic) { const n = debriefDays(); return n > 0 && ic.date ? schoolDaysAfter(ic.date, n) : ''; }

const STEPS = ['사건 기록', '보고·통지', '팀 회고', '마무리'];
export function stageOf(ic) {
  if (ic.closed) return 4;
  if (ic.debriefDate) return 3;
  if (ic.reportedAt && ic.notifiedAt) return 2;
  return 1;
}
export function nextStep(ic) {
  const st = stageOf(ic);
  if (st === 4) return { label: '마무리됨', due: '' };
  if (st === 1) return { label: !ic.reportedAt ? '학교장 보고 기록' : '보호자 통지 기록', due: ic.date };
  if (st === 2) return { label: '팀 회고', due: debriefDue(ic) };
  return { label: '재발 방지 조치 확인 후 마무리', due: '' };
}

export const incidentsOf = (sid) => S.incidents.filter((x) => x.studentId === sid).sort((a, b) => (b.date + b.time > a.date + a.time ? 1 : -1));
export const incidentDates = (sid) => incidentsOf(sid).map((x) => x.date);

// 검토 기준: 정한 기간 안 사후 기록 수가 기준 이상이면 행동지원계획 재검토를 제안
export function reviewWarning(sid) {
  const n = Number(S.school.reviewN) || 3, days = Number(S.school.reviewDays) || 30;
  const since = addDays(todayStr(), -days);
  const cnt = incidentsOf(sid).filter((x) => x.date >= since).length;
  return cnt >= n ? { cnt, n, days } : null;
}

// 사후 기록이 아직 없는 물리적 제지 표시 행동 기록(최근 14일)
export function flaggedEvents(sid) {
  const since = addDays(todayStr(), -14);
  return (S.eventsBy[sid] || []).filter((e) => !e.ioa && e.date >= since && !e.incidentId && e.restraint).sort((a, b) => b.at - a.at);
}

// stageOf = 끝낸 단계 수. 지금 할 단계는 그다음 칸
const stepper = (ic) => { const st = stageOf(ic); return `<ol class="steps" aria-label="진행 단계">${STEPS.map((l, i) => `<li class="${i + 1 <= st ? 'done' : i === st ? 'now' : ''}" ${i === st ? 'aria-current="step"' : ''}>${l}</li>`).join('')}</ol>`; };

const dday = (due) => { if (!due) return ''; const n = diffDays(due, todayStr()); return `<span class="dday ${n <= 0 ? 'late' : n <= 1 ? 'soon' : ''}">${n < 0 ? `${-n}일 지남` : n === 0 ? '오늘까지' : `D-${n}`}</span>`; };

export function crisisTab(s, args = []) {
  if (args[0] === 'new') {
    const eid = args[1] || '';
    setTimeout(() => { history.replaceState(null, '', `#/student/${s.id}/crisis`); openIncident(null, s.id, eid); }, 0);
  }
  const list = incidentsOf(s.id);
  const rw = reviewWarning(s.id);
  const flagged = flaggedEvents(s.id);
  const cards = list.map((ic) => {
    const nx = nextStep(ic);
    return `<section class="card incident">
      <div class="goal-head"><h2 class="h3">${esc(fmtDate(ic.date))} ${esc(ic.time || '')} <small class="muted">${esc(ic.place || '')}</small></h2><span class="grow"></span>
        ${ic.restraint ? '<span class="tag warn">물리적 제지</span>' : ''}<button type="button" class="ghost sm" data-act="ic-open" data-id="${ic.id}">열기</button></div>
      ${stepper(ic)}
      <p class="small">${esc(ic.behavior || '')}</p>
      <p class="small">다음 단계: <b>${esc(nx.label)}</b> ${dday(nx.due)}</p>
    </section>`;
  }).join('');
  return `<div class="bar"><button type="button" class="primary" data-act="ic-new" data-sid="${s.id}">사후 기록 시작</button>
    <span class="muted small">물리적 제지가 있었거나 팀이 함께 돌아봐야 할 위기행동 뒤에 씁니다. 처벌이 아니라 재발 방지와 지원 계획을 위한 기록입니다.</span></div>
    ${rw ? `<div class="alert warn" role="alert"><span>최근 ${rw.days}일 동안 사후 기록이 ${rw.cnt}건입니다(기준 ${rw.n}건). 행동지원계획 재검토를 권합니다.</span><button type="button" class="sm" data-act="ic-review-meet" data-sid="${s.id}">재검토 회의 예약</button></div>` : ''}
    ${flagged.length ? `<section class="card"><h2 class="h3">사후 기록이 필요한 기록 ${flagged.length}</h2><ul class="rows">${flagged.map((e) => `<li><span class="grow">${esc(fmtDate(e.date))} ${timeStr(new Date(e.at))} · 물리적 제지${e.intensity ? ` · 강도 ${INTENSITY[e.intensity]}` : ''}<small class="muted"> · 기록 ${esc(nameOf(e.createdBy))}</small></span><button type="button" class="sm primary" data-act="ic-from-ev" data-sid="${s.id}" data-eid="${e.id}">사후 기록 시작</button></li>`).join('')}</ul></section>` : ''}
    ${cards || '<section class="card"><p class="muted">아직 사후 기록이 없습니다.</p></section>'}
    <p class="small muted">근거: 「교원의 학생생활지도에 관한 고시」(교육부고시 제2023-28호)는 긴급한 경우의 물리적 제지와 학교장 보고·보호자 통지를 정합니다(조항은 원문으로 확인). 팀 회고 기한은 법정 수치가 없어 학교 설정값(현재 ${debriefDays() > 0 ? `${debriefDays()} 수업일` : '사용 안 함'})으로만 안내합니다.</p>`;
}

function form(ic, sid) {
  const tch = teachers();
  const s = student(sid);
  const due = debriefDue(ic);
  const att = ic.debriefAttendees || [];
  const tx = (name, label, rows = 2, ph = '') => `<label>${label}<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(ic[name] || '')}</textarea></label>`;
  const inp = (name, label, type = 'text', ph = '') => `<label>${label}<input type="${type}" name="${name}" value="${esc(ic[name] || '')}" placeholder="${esc(ph)}"></label>`;
  return `<form class="ic-form"><h2>위기행동 사후 기록 <small class="muted">${esc(s?.alias || '')}</small></h2>
    ${ic.id ? stepper(ic) : ''}
    <fieldset><legend>1. 사건 기록</legend>
      <div class="row3">${inp('date', '날짜', 'date')}${inp('time', '시각', 'time')}${inp('place', '장소', 'text', '예: 통합학급 교실')}</div>
      ${tx('antecedent', '바로 앞 상황(선행사건)', 2, '무엇을 하던 중, 어떤 요구·변화가 있었는지')}
      ${tx('behavior', '행동(보이는 그대로)', 2, '해석 없이 관찰한 행동만')}
      ${tx('prevent', '예방·완화 시도(순서대로)', 2, '예: 1) 언어적 안내 2) 선택 제시 3) 주변 학생 이동')}
      <label class="chk"><input type="checkbox" name="restraint" ${ic.restraint ? 'checked' : ''}> 물리적 제지가 있었음</label>
      <div class="row3">${inp('restraintMethod', '제지 방법', 'text', '예: 양팔을 잡아 자리로 안내')}${inp('rStart', '제지 시작', 'time')}${inp('rEnd', '제지 끝', 'time')}</div>
      <div class="row2">${inp('injuryStudent', '학생 부상', 'text', '없음 / 있음(내용)')}${inp('injuryStaff', '교직원 부상', 'text', '없음 / 있음(내용)')}</div>
    </fieldset>
    <fieldset><legend>2. 보고·통지</legend>
      <div class="row2">${inp('reportedAt', '학교장 보고 일시', 'datetime-local')}${inp('reportedTo', '보고한 사람', 'text', '예: 교장, 교감')}</div>
      <div class="row2">${inp('notifiedAt', '보호자 통지 일시', 'datetime-local')}<label>통지 방법<select name="notifyMethod">${['', '전화', '문자', '면담', '서면'].map((x) => `<option ${ic.notifyMethod === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
    </fieldset>
    <fieldset><legend>3. 팀 회고 ${due ? `<small class="muted">학교 기준 ${fmtDate(due)}까지 ${dday(due)}</small>` : ''}</legend>
      ${inp('debriefDate', '회고한 날', 'date')}
      <div class="chk-list">${tch.map((m) => `<label class="chk"><input type="checkbox" name="att" value="${m.id}" ${att.includes(m.id) ? 'checked' : ''}> ${esc(m.name)}</label>`).join('')}</div>
      ${tx('debriefNotes', '무엇이 도움이 되었고, 무엇을 바꿀지', 2)}
      ${tx('hypothesis', '기능 가설 다시 보기(회피·관심·획득·감각)', 2)}
      <label>행동지원계획 수정<select name="bspChange">${[['', '아직 정하지 않음'], ['yes', '수정함(또는 수정 예정)'], ['no', '수정하지 않음']].map(([v, l]) => `<option value="${v}" ${ic.bspChange === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${tx('actions', '재발 방지 조치(누가·언제까지)', 2)}
    </fieldset>
    <fieldset><legend>4. 마무리</legend><label class="chk"><input type="checkbox" name="closed" ${ic.closed ? 'checked' : ''}> 보고·통지·회고와 조치를 확인하고 마무리함</label></fieldset>
    <p class="small muted">이 기록은 교사만 볼 수 있습니다. 학생 실명과 다른 학생의 개인정보는 적지 마세요.</p>
    <div class="actions">${ic.id && (ic.createdBy === S.me.uid || isAdmin()) ? '<button type="button" class="danger ghost" data-del>삭제</button>' : ''}${ic.id ? '<button type="button" class="ghost" data-notify>팀에 알리기</button><button type="button" class="ghost" data-meet>회고 회의 예약</button>' : ''}<span class="grow"></span><button type="button" class="ghost" data-close>닫기</button><button type="submit" class="primary">저장</button></div></form>`;
}

const fdData = (fd) => ({
  date: fd.get('date'), time: fd.get('time'), place: fd.get('place'), antecedent: fd.get('antecedent'), behavior: fd.get('behavior'), prevent: fd.get('prevent'),
  restraint: fd.get('restraint') === 'on', restraintMethod: fd.get('restraintMethod'), rStart: fd.get('rStart'), rEnd: fd.get('rEnd'), injuryStudent: fd.get('injuryStudent'), injuryStaff: fd.get('injuryStaff'),
  reportedAt: fd.get('reportedAt'), reportedTo: fd.get('reportedTo'), notifiedAt: fd.get('notifiedAt'), notifyMethod: fd.get('notifyMethod'),
  debriefDate: fd.get('debriefDate'), debriefAttendees: fd.getAll('att'), debriefNotes: fd.get('debriefNotes'), hypothesis: fd.get('hypothesis'), bspChange: fd.get('bspChange'), actions: fd.get('actions'),
  closed: fd.get('closed') === 'on', updatedBy: S.me.uid, updatedAt: Date.now()
});

function notifyTeam(ic) {
  const s = student(ic.studentId);
  return sendAlert({ type: 'notice', title: `${s?.alias || ''} 위기행동 사후 기록`, text: `${fmtDate(ic.date)} ${ic.time || ''} · 다음 단계: ${nextStep(ic).label}`, to: s?.teamUids || [] });
}

export function openIncident(id, sid, eventId = '') {
  let ic = id ? S.incidents.find((x) => x.id === id) : null;
  if (id && !ic) return toast('기록을 아직 불러오지 못했습니다');
  if (!ic) {
    const ev = eventId ? (S.eventsBy[sid] || []).find((e) => e.id === eventId) : null;
    ic = { studentId: sid, date: ev?.date || todayStr(), time: ev ? timeStr(new Date(ev.at)) : timeStr(), antecedent: ev?.antecedent || '', restraint: !!ev?.restraint, eventId: eventId || '' };
  }
  openModal(form(ic, sid), {
    wide: true,
    onOpen: (m) => {
      const del = m.querySelector('[data-del]');
      if (del) del.onclick = async () => { if (!confirmInline(del)) return; await S.store.remove('incidents', {}, ic.id); closeModal(); toast('사후 기록을 지웠습니다'); };
      const nt = m.querySelector('[data-notify]');
      if (nt) nt.onclick = async () => { await notifyTeam(ic); toast('IEP 팀에 알림을 보냈습니다'); };
      const mt = m.querySelector('[data-meet]');
      if (mt) mt.onclick = () => { const s = student(sid); openMeetingModal({ kind: 'meeting', title: `${s?.alias || ''} 위기행동 팀 회고`, attendeeUids: s?.teamUids || [], studentId: sid, date: debriefDue(ic) || todayStr(), memo: `${fmtDate(ic.date)} 사건 회고: 무엇이 도움이 되었는지, 재발 방지 조치` }); };
    },
    onSubmit: async (fd) => {
      const data = fdData(fd);
      if (ic.id) { await S.store.update('incidents', {}, ic.id, data); toast('사후 기록을 저장했습니다'); return; }
      const nid = await S.store.create('incidents', {}, { ...data, studentId: sid, eventId: ic.eventId || '', createdBy: S.me.uid, createdAt: Date.now() });
      if (ic.eventId) S.store.update('bevents', {}, ic.eventId, { incidentId: nid }).catch(() => {});
      toast('사후 기록을 만들었습니다', { label: '팀에 알리기', run: () => notifyTeam({ ...data, studentId: sid }).then(() => toast('IEP 팀에 알림을 보냈습니다')) });
    }
  });
}

// 한눈에 보기 칸: 진행 중 사후 기록과 사후 기록이 필요한 행동 기록
export function crisisPostItems(stuList) {
  const ids = new Set(stuList.map((s) => s.id));
  const open = S.incidents.filter((x) => ids.has(x.studentId) && !x.closed).map((ic) => ({ ic, nx: nextStep(ic) }));
  const flagged = stuList.flatMap((s) => flaggedEvents(s.id).map((e) => ({ s, e })));
  return { open, flagged };
}
export function crisisPostBody({ open, flagged }) {
  const rows = [
    ...flagged.map(({ s, e }) => `<li><span class="grow"><a href="#/student/${s.id}/crisis"><b>${esc(s.alias)}</b></a><small>${esc(fmtDate(e.date))} 물리적 제지 · 사후 기록 없음</small></span><button type="button" class="sm primary" data-act="ic-from-ev" data-sid="${s.id}" data-eid="${e.id}">시작</button></li>`),
    ...open.map(({ ic, nx }) => { const s = student(ic.studentId); return `<li><span class="grow"><a href="#/student/${ic.studentId}/crisis"><b>${esc(s?.alias || '')}</b></a><small>${esc(fmtDate(ic.date))} · 다음: ${esc(nx.label)}</small></span>${dday(nx.due)}<button type="button" class="sm ghost" data-act="ic-open" data-id="${ic.id}">열기</button></li>`; })
  ];
  return `<ul class="mini">${rows.join('') || '<li class="muted">진행 중인 사후 기록이 없습니다.</li>'}</ul>`;
}

on('ic-new', (el) => openIncident(null, el.dataset.sid));
on('ic-open', (el) => { const ic = S.incidents.find((x) => x.id === el.dataset.id); openIncident(el.dataset.id, ic?.studentId); });
on('ic-from-ev', (el) => openIncident(null, el.dataset.sid, el.dataset.eid));
on('ic-review-meet', (el) => { const s = student(el.dataset.sid); openMeetingModal({ kind: 'meeting', title: `${s.alias} 행동지원계획 재검토`, attendeeUids: s.teamUids || [], studentId: s.id, memo: '위기행동 사후 기록 반복: 기능 가설과 행동지원계획 재검토' }); });

export { addDays };
