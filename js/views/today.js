// 첫 화면(한눈에 보기): 모든 기능을 패들릿 담벼락처럼 펼쳐 보여 준다. 각 칸의 제목을 누르면 세부 화면으로 들어간다.
import { esc, todayStr, fmtDate, addDays, diffDays, toMs, fmtDur, relTime, openModal, toast } from '../util.js';
import { S, on, nameOf, student, teachers, aides, isAdmin, useSub, avatar } from '../state.js';
import { warningsFor, goalMissing } from './students.js';
import { openMeetingModal } from './calendar.js';
import { roomTitle, isUnread, roomLast } from './chat.js';
import { behaviorSeries, baselineStats } from '../charts.js';
import { HOLIDAYS } from '../holidays.js';
import { crisisPostItems, crisisPostBody } from './incidents.js';
import { accomsOf, needsMyConfirm } from './accoms.js';
import { deskWidgets } from './desk.js';
import { alertsBar } from './alerts.js';

export function deadlines(sc) {
  const list = [];
  if (sc.yearStart) list.push({ label: '개별화교육지원팀 구성', due: addDays(sc.yearStart, 14), basis: '학년 시작일부터 2주 이내' });
  if (sc.sem1Start) list.push({ label: '1학기 개별화교육계획 작성', due: addDays(sc.sem1Start, 30), basis: '학기 시작일부터 30일 이내' });
  if (sc.sem1End) list.push({ label: '1학기 학업성취도 평가·보호자 통보', due: sc.sem1End, basis: '매 학기' });
  if (sc.sem2Start) list.push({ label: '2학기 개별화교육계획 작성', due: addDays(sc.sem2Start, 30), basis: '학기 시작일부터 30일 이내' });
  if (sc.sem2End) list.push({ label: '2학기 학업성취도 평가·보호자 통보', due: sc.sem2End, basis: '매 학기' });
  return list.map((d) => ({ ...d, left: diffDays(d.due, todayStr()) })).sort((a, b) => (a.due > b.due ? 1 : -1));
}

// 담벼락의 한 칸. 제목이 곧 세부 화면으로 가는 길
const post = (tone, href, title, count, body, extra = '') => `<section class="post ${tone}">
  <h2 class="post-title">${href ? `<a href="${href}">` : '<span>'}${esc(title)}${count != null ? ` <span class="cnt">${count}</span>` : ''}${href ? '<span class="go" aria-hidden="true">›</span></a>' : '</span>'}</h2>
  <div class="post-body">${body}</div>${extra}</section>`;

const end = (m) => toMs(m.date, m.start) + (+m.minutes || 30) * 60000;

export function render() {
  const t = todayStr();
  const myStu = S.students.filter((s) => s.caseManager === S.me.uid || (s.teamUids || []).includes(S.me.uid));
  const stuList = myStu.length ? myStu : S.students;
  stuList.forEach((s) => useSub('ev:' + s.id, 'bevents', { sid: s.id }, (r) => { S.eventsBy[s.id] = r; }));

  // 1. 법정 기한
  const dl = deadlines(S.school).filter((d) => d.left >= 0).slice(0, 3);
  const pDeadline = post('tone-sun', isAdmin() ? '#/admin' : '', 'IEP 법정 기한', null,
    `<ul class="mini">${dl.map((d) => `<li><span class="dday ${d.left <= 7 ? 'soon' : ''}">D-${d.left}</span><span><b>${esc(d.label)}</b><small>${esc(fmtDate(d.due))}까지 · ${esc(d.basis)}</small></span></li>`).join('') || '<li class="muted">관리에서 학사일정을 넣으면 표시됩니다.</li>'}</ul>`);

  // 2. 진전도 경고
  const warns = stuList.flatMap((s) => warningsFor(s.id).map((g) => ({ s, g })));
  const pWarn = post(warns.length ? 'tone-warn' : 'tone-plain', '#/students', '진전도 경고', warns.length,
    `<ul class="mini">${warns.map(({ s, g }) => `<li><span><a href="#/student/${s.id}/goals"><b>${esc(s.alias)}</b> ${esc(g.domain)}</a><small>${esc(g.behavior)} · 최근 ${S.school.warnRun || 3}회 연속 목표선 아래</small></span>
      <button type="button" class="sm ghost" data-act="warn-meet-today" data-sid="${s.id}" data-dom="${esc(g.domain)}">회의 잡기</button></li>`).join('') || '<li class="muted">경고가 없습니다.</li>'}</ul>`);

  // 3. 학생·IEP
  const pStu = post('tone-green', '#/students', '학생·IEP', S.students.length,
    `<ul class="mini">${S.students.map((s) => {
      const gs = S.goalsBy[s.id] || []; const w = warningsFor(s.id).length; const miss = gs.filter((g) => goalMissing(g).length).length;
      return `<li class="stu-row"><a class="grow" href="#/student/${s.id}/goals"><b>${esc(s.alias)}</b> <small>${esc(s.grade || '')} · 목표 ${gs.length}${w ? ` · <span class="late">경고 ${w}</span>` : ''}${miss ? ` · 요소 빠짐 ${miss}` : ''}</small></a>
        <span class="links"><a href="#/student/${s.id}/goals">목표</a><a href="#/student/${s.id}/behavior">행동</a><a href="#/student/${s.id}/memo">메모</a></span></li>`;
    }).join('') || '<li class="muted">학생이 없습니다.</li>'}</ul>`,
    `<div class="post-foot"><button type="button" class="sm ghost" data-act="stu-new">학생 추가</button></div>`);

  // 4. 행동 기록(즉시 기록 버튼 축소판)
  const recRows = stuList.map((s) => {
    const ts = S.targetsBy[s.id] || []; if (!ts.length) return '';
    const evs = S.eventsBy[s.id] || [];
    return `<div class="mini-rec"><a href="#/student/${s.id}/behavior" class="mini-rec-name">${esc(s.alias)}</a>${ts.map((tg) => {
      const key = `${s.id}:${tg.id}`; const run = S.running[key];
      const todays = evs.filter((e) => e.targetId === tg.id && e.date === t && e.type !== 'session');
      const st = baselineStats(behaviorSeries(tg, evs));
      const prim = todays.filter((e) => !e.ioa);
      const cnt = tg.method === 'dur' ? fmtDur(prim.reduce((a, e) => a + ((e.end || e.at) - e.at) / 1000, 0)) : tg.method === 'int' ? `${prim.length}회기` : tg.method === 'lat' ? `${prim.length}번 지시` : `${prim.length}회`;
      const act = tg.method === 'int' ? 'int-open' : tg.method === 'lat' ? (run ? 'lat-stop' : 'rec-start') : tg.method === 'dur' ? (run ? 'rec-stop' : 'rec-start') : 'rec-tap';
      return `<button type="button" class="rec-btn mini ${run ? 'running' : ''}" data-act="${act}" data-sid="${s.id}" data-tid="${tg.id}" aria-label="${esc(s.alias)} ${esc(tg.name)} ${run ? '기록 끝내기' : '기록'}">
        <span class="rec-name">${esc(tg.name)}</span><span class="rec-sub">${run ? `끝내기 <span data-timer="${run.start}">0:00</span>` : `오늘 ${cnt} · ${tg.interventionStart ? '중재' : `기초선 ${st.n}회기`}`}</span></button>`;
    }).join('')}</div>`;
  }).join('');
  const pRec = post('tone-rec', '#/behavior', '행동 기록', null, recRows || '<p class="muted">표적행동을 정하면 여기에 바로 누르는 버튼이 생깁니다.</p>');

  // 5. 메신저
  const rooms = [...S.rooms].sort((a, b) => (roomLast(b).lastAt || 0) - (roomLast(a).lastAt || 0)).slice(0, 6);
  const unread = S.rooms.filter(isUnread).length;
  const pChat = post('tone-sky', '#/chat', '메신저', unread || null,
    `<ul class="mini">${rooms.map((r) => { const l = roomLast(r); return `<li><a class="grow room-mini" href="#/chat/${r.id}">${isUnread(r) ? '<span class="dot-new" aria-label="안 읽음"></span>' : ''}<b>${esc(roomTitle(r))}</b><small class="ellip">${esc(l.lastText || '')}</small></a><small class="muted">${l.lastAt ? relTime(l.lastAt) : ''}</small></li>`; }).join('') || '<li class="muted">대화가 없습니다.</li>'}</ul>`,
    `<div class="post-foot"><button type="button" class="sm notice-btn" data-act="notice-new" data-type="urgent">긴급회의 공지</button><button type="button" class="sm ghost" data-act="call-new">전화 예약</button><button type="button" class="sm ghost" data-act="notice-new" data-type="notice">단체 공지</button><button type="button" class="sm ghost" data-act="room-new">새 대화</button></div>`);

  // 6. 일정·예약
  const pending = S.meetings.filter((m) => !m.canceled && m.attendees?.[S.me.uid] === 'pending' && m.organizer !== S.me.uid && end(m) > Date.now());
  const mine = S.meetings.filter((m) => !m.canceled && m.attendeeUids?.includes(S.me.uid) && m.attendees?.[S.me.uid] === 'accepted' && end(m) > Date.now() && m.date <= addDays(t, 14)).sort((a, b) => toMs(a.date, a.start) - toMs(b.date, b.start)).slice(0, 5);
  const mRow = (m, ask) => `<li><span class="tag ${m.kind}">${m.kind === 'call' ? '전화' : '회의'}</span><span class="grow"><b>${esc(m.title)}</b><small>${esc(fmtDate(m.date))} ${esc(m.start)} · ${esc(m.minutes)}분${m.organizer !== S.me.uid ? ` · ${esc(nameOf(m.organizer))}` : ''}</small></span>
    ${ask ? `<span class="btns"><button type="button" class="sm primary" data-act="mt-resp" data-id="${m.id}" data-v="accepted">수락</button><button type="button" class="sm ghost" data-act="mt-resp" data-id="${m.id}" data-v="declined">거절</button></span>` : ''}</li>`;
  const t14 = addDays(t, 14);
  const soon = [
    ...Object.entries(HOLIDAYS).filter(([d]) => d >= t && d <= t14).map(([d, n]) => ({ d, s: '', k: 'hol', tag: '공휴일', title: n, when: fmtDate(d) })),
    ...S.acad.filter((a) => (a.endDate || a.date) >= t && a.date <= t14).map((a) => ({ d: a.date < t ? t : a.date, s: a.start || '', k: 'acad', tag: '학사', title: a.title, when: `${fmtDate(a.date)}${a.endDate && a.endDate !== a.date ? ' ~ ' + fmtDate(a.endDate) : ''}${a.start ? ' ' + a.start : ''}` })),
    ...S.appts.filter((p) => p.date >= t && p.date <= t14).map((p) => ({ d: p.date, s: p.start, k: 'appt', tag: '약속', title: p.title, when: `${fmtDate(p.date)} ${p.start}` }))
  ].sort((a, b) => (a.d + a.s > b.d + b.s ? 1 : -1)).slice(0, 6);
  const pCal = post('tone-violet', '#/calendar', '일정·예약', pending.length || null,
    `${pending.length ? `<p class="sub">응답할 초대</p><ul class="mini">${pending.map((m) => mRow(m, true)).join('')}</ul>` : ''}
     <p class="sub">다가오는 일정(2주)</p><ul class="mini">${mine.map((m) => mRow(m, false)).join('') || '<li class="muted">예정된 일정이 없습니다.</li>'}</ul>
     ${soon.length ? `<p class="sub">학사일정·약속·공휴일(2주)</p><ul class="mini">${soon.map((x) => `<li><span class="tag ${x.k}">${x.tag}</span><span class="grow"><b>${esc(x.title)}</b><small>${esc(x.when)}</small></span></li>`).join('')}</ul>` : ''}`,
    `<div class="post-foot"><button type="button" class="sm ghost" data-act="mt-new" data-kind="meeting">회의 예약</button><button type="button" class="sm ghost" data-act="call-new">전화 예약</button></div>`);

  // 7. 할 일
  const tasks = S.tasks.filter((k) => k.assignee === S.me.uid && !k.done).sort((a, b) => (a.due > b.due ? 1 : -1));
  const given = S.tasks.filter((k) => k.createdBy === S.me.uid && k.assignee !== S.me.uid && !k.done);
  const taskRow = (k, mineTask) => `<li><label class="chk grow"><input type="checkbox" data-act="task-done" data-id="${k.id}"> <span>${esc(k.title)}<small class="${k.due && k.due < t ? 'late' : ''}">${k.due ? fmtDate(k.due) + '까지' : ''}${mineTask ? '' : ` · ${esc(nameOf(k.assignee))}`}</small></span></label>${k.roomId ? `<a class="link sm" href="#/chat/${k.roomId}">대화</a>` : ''}</li>`;
  const taskBody = `<ul class="mini">${tasks.map((k) => taskRow(k, true)).join('') || '<li class="muted">남은 할 일이 없습니다.</li>'}</ul>${given.length ? `<p class="sub">내가 부탁한 일</p><ul class="mini">${given.map((k) => taskRow(k, false)).join('')}</ul>` : ''}<div class="post-foot"><button type="button" class="sm ghost" data-act="task-new">할 일 추가</button></div>`;
  const pTask = post('tone-plain', '#/tasks', '할 일', tasks.length,
    `<ul class="mini">${tasks.map((k) => taskRow(k, true)).join('') || '<li class="muted">남은 할 일이 없습니다.</li>'}</ul>${given.length ? `<p class="sub">내가 부탁한 일</p><ul class="mini">${given.map((k) => taskRow(k, false)).join('')}</ul>` : ''}`,
    `<div class="post-foot"><button type="button" class="sm ghost" data-act="task-new">할 일 추가</button></div>`);

  // 8. 공유 메모
  const pMemo = post('tone-plain', stuList[0] ? `#/student/${stuList[0].id}/memo` : '#/students', '공유 메모', null,
    `<p class="small muted">학생마다 교사들이 함께 고치는 메모(회의 안건, 행동 관찰 양식)입니다.</p><ul class="mini">${stuList.map((s) => `<li><a href="#/student/${s.id}/memo"><b>${esc(s.alias)}</b> 메모 열기</a></li>`).join('')}</ul>`);

  // 9. 관리(관리자만)
  const pAdmin = isAdmin() ? post('tone-plain', '#/admin', '관리', null,
    `<ul class="mini"><li><span>교사 <b>${teachers().length}</b>명 · 보조인력 <b>${aides().length}</b>명</span></li>
      <li><span>로그인 기다리는 초대 <b>${S.invites.filter((i) => !S.members.some((m) => m.email === i.id)).length}</b>건</span></li>
      <li><span>진전도 경고 기준: 연속 ${S.school.warnRun || 3}회</span></li></ul>`,
    `<div class="post-foot"><a class="sm btn-link" href="#/admin">초대·역할·학사일정</a></div>`) : '';

  // 10. 위기행동 사후 기록
  const ci = crisisPostItems(stuList);
  const firstCrisis = ci.flagged[0]?.s.id || ci.open[0]?.ic.studentId || stuList[0]?.id;
  const pCrisis = post(ci.flagged.length || ci.open.length ? 'tone-warn' : 'tone-plain', firstCrisis ? `#/student/${firstCrisis}/crisis` : '#/students', '위기행동 사후 기록', (ci.flagged.length + ci.open.length) || null, crisisPostBody(ci));

  // 11. 평가조정 확인 요청(공유받은 것)과 내가 공유한 것의 확인 현황
  const toConfirm = S.students.flatMap((s) => accomsOf(s.id).filter(needsMyConfirm).map((a) => ({ s, a })));
  const shared = S.students.flatMap((s) => accomsOf(s.id).filter((a) => a.createdBy === S.me.uid && (a.sharedWith || []).length).map((a) => ({ s, a })));
  const pAcc = post(toConfirm.length ? 'tone-sky' : 'tone-plain', toConfirm[0] ? `#/student/${toConfirm[0].s.id}/accom` : stuList[0] ? `#/student/${stuList[0].id}/accom` : '#/students', '평가조정 한 장', toConfirm.length || null,
    `${toConfirm.length ? `<p class="sub">확인을 부탁받은 평가조정</p><ul class="mini">${toConfirm.map(({ s, a }) => `<li><span class="grow"><a href="#/student/${s.id}/accom"><b>${esc(s.alias)}</b> ${esc(a.subject)}</a><small>${esc(nameOf(a.createdBy))} 선생님이 공유</small></span><button type="button" class="sm primary" data-act="acc-confirm" data-sid="${s.id}" data-id="${a.id}">확인했어요</button></li>`).join('')}</ul>` : ''}
     <p class="sub">내가 공유한 평가조정</p><ul class="mini">${shared.map(({ s, a }) => { const n = (a.sharedWith || []).length, k = (a.sharedWith || []).filter((u) => a.confirms?.[u]).length; return `<li><a class="grow" href="#/student/${s.id}/accom"><b>${esc(s.alias)}</b> ${esc(a.subject)}</a><span class="tag ${k === n ? 'ok' : ''}">확인 ${k}/${n}</span></li>`; }).join('') || '<li class="muted">공유한 평가조정이 없습니다.</li>'}</ul>`);

  return `${alertsBar('board')}<div class="page-head board-head"><h1>${esc(S.me.name)} 선생님의 한눈에 보기</h1><p class="muted">${esc(fmtDate(t))} · 칸 제목을 누르면 자세한 화면으로 들어갑니다.</p></div>
  <div class="today-layout"><div class="today-main">${deskWidgets(taskBody)}</div>
  <aside class="today-side" aria-label="학생 지원·협업"><h2 class="board-sub">학생 지원·협업</h2>
  <div class="board">${pRec}${pWarn}${pCrisis}${pDeadline}${pCal}${pChat}${pAcc}${pStu}${pMemo}${pAdmin}</div></aside></div>`;
}

on('task-done', async (el) => { await S.store.update('tasks', {}, el.dataset.id, { done: el.checked, doneAt: Date.now() }); });
on('warn-meet-today', (el) => { const s = student(el.dataset.sid); openMeetingModal({ kind: 'meeting', title: `${s.alias} 진전도 협의(${el.dataset.dom})`, attendeeUids: s.teamUids || [], studentId: s.id }); });
on('task-new', () => {
  openModal(`<form><h2>할 일 추가</h2><label>할 일<input name="title" required></label>
    <div class="row2"><label>맡을 사람<select name="assignee">${teachers().map((m) => `<option value="${m.id}" ${m.id === S.me.uid ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label><label>기한<input type="date" name="due" value="${addDays(todayStr(), 3)}"></label></div>
    <label>관련 학생<select name="studentId"><option value="">없음</option>${S.students.map((s) => `<option value="${s.id}">${esc(s.alias)}</option>`).join('')}</select></label>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">추가</button></div></form>`, {
    onSubmit: async (fd) => { await S.store.create('tasks', {}, { title: fd.get('title'), assignee: fd.get('assignee'), due: fd.get('due'), studentId: fd.get('studentId'), done: false, createdBy: S.me.uid, createdAt: Date.now() }); toast('할 일을 추가했습니다'); }
  });
});

export { avatar };

// 할 일 세부 화면
export function renderTasks() {
  const t = todayStr();
  const sec = (title, list) => `<section class="card"><h2 class="h3">${title} ${list.length}</h2><ul class="rows">${list.map((k) => `<li><label class="chk grow"><input type="checkbox" data-act="task-done" data-id="${k.id}" ${k.done ? 'checked' : ''}> ${esc(k.title)}</label>
    <small class="${!k.done && k.due && k.due < t ? 'late' : 'muted'}">${k.due ? fmtDate(k.due) + '까지' : ''} · ${esc(nameOf(k.assignee))}${k.studentId && student(k.studentId) ? ' · ' + esc(student(k.studentId).alias) : ''}</small>
    ${k.roomId ? `<a class="link sm" href="#/chat/${k.roomId}">대화</a>` : ''}</li>`).join('') || '<li class="muted">없습니다.</li>'}</ul></section>`;
  const by = (f) => S.tasks.filter(f).sort((a, b) => (a.due > b.due ? 1 : -1));
  return `<a class="back" href="#/today">‹ 한눈에 보기</a><div class="page-head"><h1>할 일</h1><button type="button" class="primary" data-act="task-new">할 일 추가</button></div>
    <div class="dash">${sec('내가 할 일', by((k) => k.assignee === S.me.uid && !k.done))}${sec('내가 부탁한 일', by((k) => k.createdBy === S.me.uid && k.assignee !== S.me.uid && !k.done))}${sec('끝낸 일', by((k) => (k.assignee === S.me.uid || k.createdBy === S.me.uid) && k.done))}</div>`;
}
