// 오늘 화면: 법정 기한, 진전도 경고, 일정·초대, 할 일, 안 읽은 대화
import { esc, todayStr, fmtDate, addDays, diffDays, toMs } from '../util.js';
import { S, on, nameOf, student } from '../state.js';
import { warningsFor } from './students.js';
import { meetingCard } from './calendar.js';
import { roomTitle, isUnread, roomLast } from './chat.js';
import { openMeetingModal } from './calendar.js';

export function deadlines(sc) {
  const list = [];
  if (sc.yearStart) list.push({ label: '개별화교육지원팀 구성', due: addDays(sc.yearStart, 14), basis: '학년 시작일부터 2주 이내' });
  if (sc.sem1Start) list.push({ label: '1학기 개별화교육계획 작성', due: addDays(sc.sem1Start, 30), basis: '학기 시작일부터 30일 이내' });
  if (sc.sem1End) list.push({ label: '1학기 학업성취도 평가·보호자 통보', due: sc.sem1End, basis: '매 학기' });
  if (sc.sem2Start) list.push({ label: '2학기 개별화교육계획 작성', due: addDays(sc.sem2Start, 30), basis: '학기 시작일부터 30일 이내' });
  if (sc.sem2End) list.push({ label: '2학기 학업성취도 평가·보호자 통보', due: sc.sem2End, basis: '매 학기' });
  return list.map((d) => ({ ...d, left: diffDays(d.due, todayStr()) })).sort((a, b) => (a.due > b.due ? 1 : -1));
}

export function render() {
  const t = todayStr();
  const dl = deadlines(S.school);
  const upcoming = dl.filter((d) => d.left >= 0).slice(0, 3);
  const myStu = S.students.filter((s) => s.caseManager === S.me.uid || (s.teamUids || []).includes(S.me.uid));
  const warns = myStu.flatMap((s) => warningsFor(s.id).map((g) => ({ s, g })));
  const end = (m) => toMs(m.date, m.start) + (+m.minutes || 30) * 60000;
  const mine = S.meetings.filter((m) => !m.canceled && m.attendeeUids?.includes(S.me.uid) && m.attendees?.[S.me.uid] !== 'declined' && end(m) > Date.now() && m.date <= addDays(t, 7)).sort((a, b) => toMs(a.date, a.start) - toMs(b.date, b.start));
  const tasks = S.tasks.filter((k) => k.assignee === S.me.uid && !k.done).sort((a, b) => (a.due > b.due ? 1 : -1));
  const given = S.tasks.filter((k) => k.createdBy === S.me.uid && k.assignee !== S.me.uid && !k.done);
  const unread = S.rooms.filter(isUnread);
  const taskRow = (k, mineTask) => `<li><label class="chk grow"><input type="checkbox" data-act="task-done" data-id="${k.id}" ${k.done ? 'checked' : ''}> ${esc(k.title)}</label>
    <small class="${k.due && k.due < t ? 'late' : 'muted'}">${k.due ? fmtDate(k.due) + '까지' : ''}${mineTask ? '' : ` · ${esc(nameOf(k.assignee))}`}${k.studentId && student(k.studentId) ? ` · ${esc(student(k.studentId).alias)}` : ''}</small>
    ${k.roomId ? `<a class="link sm" href="#/chat/${k.roomId}">대화</a>` : ''}</li>`;
  return `<div class="page-head"><h1>${esc(S.me.name)} 선생님, 오늘 할 일</h1><p class="muted">${esc(fmtDate(t))}</p></div>
  <div class="dash">
    <section class="card"><h2 class="h3">IEP 법정 기한</h2>
      <ul class="rows">${upcoming.map((d) => `<li><span class="dday ${d.left <= 7 ? 'soon' : ''}">D-${d.left}</span><span class="grow"><b>${esc(d.label)}</b><br><small class="muted">${esc(fmtDate(d.due))}까지 · ${esc(d.basis)}</small></span></li>`).join('') || '<li class="muted">관리 화면에서 학사일정을 넣으면 표시됩니다.</li>'}</ul>
      <p class="small muted">근거: 「장애인 등에 대한 특수교육법」 제22조, 같은 법 시행규칙 제4조.</p></section>
    <section class="card ${warns.length ? 'attn' : ''}"><h2 class="h3">진전도 경고 ${warns.length}건</h2>
      <ul class="rows">${warns.map(({ s, g }) => `<li><span class="grow"><a href="#/student/${s.id}/goals"><b>${esc(s.alias)}</b> · ${esc(g.domain)}</a><br><small class="muted">${esc(g.behavior)}: 최근 ${S.school.warnRun || 3}회 연속 목표선 아래</small></span>
        <button type="button" class="ghost sm" data-act="warn-meet-today" data-sid="${s.id}" data-dom="${esc(g.domain)}">회의 잡기</button></li>`).join('') || '<li class="muted">경고가 없습니다.</li>'}</ul></section>
    <section class="card"><h2 class="h3">다가오는 일정(7일)</h2>${mine.map((m) => meetingCard(m, { compact: true })).join('') || '<p class="muted">예정된 일정이 없습니다.</p>'}
      <a class="link sm" href="#/calendar">달력 보기</a></section>
    <section class="card"><h2 class="h3">내 할 일 ${tasks.length}</h2><ul class="rows">${tasks.map((k) => taskRow(k, true)).join('') || '<li class="muted">남은 할 일이 없습니다.</li>'}</ul>
      ${given.length ? `<h3 class="h4">내가 부탁한 일</h3><ul class="rows">${given.map((k) => taskRow(k, false)).join('')}</ul>` : ''}
      <button type="button" class="ghost sm" data-act="task-new">할 일 추가</button></section>
    <section class="card"><h2 class="h3">안 읽은 대화 ${unread.length}</h2><ul class="rows">${unread.map((r) => `<li><a class="grow" href="#/chat/${r.id}"><b>${esc(roomTitle(r))}</b><br><small class="muted ellip">${esc(roomLast(r).lastText || '')}</small></a></li>`).join('') || '<li class="muted">모두 읽었습니다.</li>'}</ul></section>
  </div>`;
}

on('task-done', async (el) => { await S.store.update('tasks', {}, el.dataset.id, { done: el.checked, doneAt: Date.now() }); });
on('warn-meet-today', (el) => { const s = student(el.dataset.sid); openMeetingModal({ kind: 'meeting', title: `${s.alias} 진전도 협의(${el.dataset.dom})`, attendeeUids: s.teamUids || [], studentId: s.id }); });
on('task-new', async () => {
  const { openModal, toast } = await import('../util.js');
  const { teachers } = await import('../state.js');
  openModal(`<form><h2>할 일 추가</h2><label>할 일<input name="title" required></label>
    <div class="row2"><label>맡을 사람<select name="assignee">${teachers().map((m) => `<option value="${m.id}" ${m.id === S.me.uid ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label><label>기한<input type="date" name="due" value="${addDays(todayStr(), 3)}"></label></div>
    <label>관련 학생<select name="studentId"><option value="">없음</option>${S.students.map((s) => `<option value="${s.id}">${esc(s.alias)}</option>`).join('')}</select></label>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">추가</button></div></form>`, {
    onSubmit: async (fd) => { await S.store.create('tasks', {}, { title: fd.get('title'), assignee: fd.get('assignee'), due: fd.get('due'), studentId: fd.get('studentId'), done: false, createdBy: S.me.uid, createdAt: Date.now() }); toast('할 일을 추가했습니다'); }
  });
});
