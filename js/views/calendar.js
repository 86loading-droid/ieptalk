// 일정·예약: 공유 캘린더, 회의 예약, 전화 예약, 수락·거절, 겹침 확인, 빈 시간 추천, 구글 캘린더 추가
import { esc, todayStr, fmtDate, addDays, toMs, parseDate, openModal, toast, googleCalUrl, timeStr } from '../util.js';
import { S, on, rerender, teachers, nameOf, student, go } from '../state.js';
import { ensureRoom, postMessage } from './chat.js';
import { confirmInline } from './record.js';

const KIND = { meeting: '회의', call: '전화' };
const STATUS = { accepted: '수락', declined: '거절', pending: '응답 전' };
const endMs = (m) => toMs(m.date, m.start) + (Number(m.minutes) || 30) * 60000;
const overlaps = (a, b) => toMs(a.date, a.start) < endMs(b) && toMs(b.date, b.start) < endMs(a);
const active = (m) => !m.canceled;

export function meetingCard(m, { compact = false } = {}) {
  const my = m.attendees?.[S.me.uid];
  const org = m.organizer === S.me.uid;
  const stu = m.studentId ? student(m.studentId) : null;
  const past = endMs(m) < Date.now();
  const people = (m.attendeeUids || []).map((u) => `<span class="chip-s ${m.attendees?.[u] || 'pending'}">${esc(nameOf(u))} ${u === m.organizer ? '(예약자)' : STATUS[m.attendees?.[u] || 'pending']}</span>`).join('');
  return `<div class="mcard ${m.kind} ${m.canceled ? 'canceled' : ''}">
    <div class="mcard-head"><span class="tag ${m.kind}">${KIND[m.kind] || '회의'}</span><b>${esc(m.title)}</b></div>
    <p class="small">${esc(fmtDate(m.date))} ${esc(m.start)} · ${esc(m.minutes)}분${m.place ? ` · ${esc(m.place)}` : ''}${stu ? ` · <a href="#/student/${stu.id}/goals">${esc(stu.alias)}</a>` : ''}</p>
    ${m.memo && !compact ? `<p class="small muted">${esc(m.memo)}</p>` : ''}
    <div class="people">${people}</div>
    ${m.canceled ? '<p class="small alert">취소된 일정입니다.</p>' : `<div class="btns">
      ${!org && my && !past ? `<button type="button" class="sm ${my === 'accepted' ? 'primary' : 'ghost'}" data-act="mt-resp" data-id="${m.id}" data-v="accepted" aria-pressed="${my === 'accepted'}">수락</button><button type="button" class="sm ${my === 'declined' ? 'danger' : 'ghost'}" data-act="mt-resp" data-id="${m.id}" data-v="declined" aria-pressed="${my === 'declined'}">거절</button>` : ''}
      ${(my || org) ? `<a class="sm link" href="${googleCalUrl(m)}" target="_blank" rel="noopener">구글 캘린더에 추가</a>` : ''}
      ${org && !past ? `<button type="button" class="ghost sm" data-act="mt-edit" data-id="${m.id}">시간 변경</button><button type="button" class="ghost sm danger" data-act="mt-cancel" data-id="${m.id}">취소</button>` : ''}
    </div>`}</div>`;
}

export function render() {
  const month = S.ui.calMonth || todayStr().slice(0, 7);
  const sel = S.ui.calDay || todayStr();
  const first = parseDate(month + '-01');
  const startPad = first.getDay();
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const ms = S.meetings.filter(active);
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push('<div class="cell pad" aria-hidden="true"></div>');
  for (let d = 1; d <= days; d++) {
    const ds = `${month}-${String(d).padStart(2, '0')}`;
    const its = ms.filter((m) => m.date === ds).sort((a, b) => (a.start > b.start ? 1 : -1));
    const mine = its.filter((m) => m.attendeeUids?.includes(S.me.uid));
    cells.push(`<button type="button" class="cell ${ds === todayStr() ? 'today' : ''} ${ds === sel ? 'sel' : ''}" data-act="cal-day" data-d="${ds}" aria-label="${fmtDate(ds)} 일정 ${its.length}개${mine.length ? `, 내 일정 ${mine.length}개` : ''}">
      <span class="dnum">${d}</span>${its.slice(0, 3).map((m) => `<span class="ev ${m.kind} ${m.attendeeUids?.includes(S.me.uid) ? 'mine' : ''}">${esc(m.start)} ${esc(m.title)}</span>`).join('')}${its.length > 3 ? `<span class="more">+${its.length - 3}</span>` : ''}</button>`);
  }
  const dayList = ms.filter((m) => m.date === sel).sort((a, b) => (a.start > b.start ? 1 : -1));
  const pending = ms.filter((m) => m.attendees?.[S.me.uid] === 'pending' && m.organizer !== S.me.uid && endMs(m) > Date.now());
  const [y, mo] = month.split('-').map(Number);
  const prev = new Date(y, mo - 2, 1), next = new Date(y, mo, 1);
  const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `<div class="page-head"><h1>일정·예약</h1><div class="btns"><button type="button" class="primary" data-act="mt-new" data-kind="meeting">회의 예약</button><button type="button" class="ghost" data-act="mt-new" data-kind="call">전화 예약</button></div></div>
  ${pending.length ? `<section class="card attn"><h2 class="h3">응답을 기다리는 초대 ${pending.length}건</h2>${pending.map((m) => meetingCard(m)).join('')}</section>` : ''}
  <div class="cal-wrap">
    <section class="card cal">
      <div class="cal-head"><button type="button" class="ghost sm" data-act="cal-month" data-m="${ym(prev)}" aria-label="이전 달">‹</button><h2 class="h3">${y}년 ${mo}월</h2><button type="button" class="ghost sm" data-act="cal-month" data-m="${ym(next)}" aria-label="다음 달">›</button></div>
      <div class="wk" aria-hidden="true">${['일', '월', '화', '수', '목', '금', '토'].map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="grid7">${cells.join('')}</div>
      <p class="small muted">교사 전체가 함께 보는 달력입니다. 진하게 표시된 일정은 내가 참여하는 일정입니다.</p>
    </section>
    <section class="card day">
      <div class="cal-head"><h2 class="h3">${esc(fmtDate(sel))}</h2><button type="button" class="primary sm" data-act="mt-new" data-kind="meeting" data-date="${sel}">이날 회의 잡기</button></div>
      ${dayList.map((m) => meetingCard(m)).join('') || '<p class="muted">일정이 없습니다.</p>'}
    </section>
  </div>`;
}

on('cal-day', (el) => { S.ui.calDay = el.dataset.d; rerender(); });
on('cal-month', (el) => { S.ui.calMonth = el.dataset.m; rerender(); });
on('mt-new', (el) => openMeetingModal({ kind: el.dataset.kind, date: el.dataset.date }));
on('mt-resp', async (el) => {
  const m = S.meetings.find((x) => x.id === el.dataset.id);
  await S.store.update('meetings', {}, m.id, { [`attendees.${S.me.uid}`]: el.dataset.v });
  if (m.roomId) await postMessage(m.roomId, { text: `「${m.title}」 ${fmtDate(m.date)} ${m.start} ${el.dataset.v === 'accepted' ? '참석하겠습니다.' : '참석이 어렵습니다. 다른 시간을 제안해 주세요.'}` }).catch(() => {});
  toast(el.dataset.v === 'accepted' ? '수락했습니다' : '거절했습니다');
});
on('mt-cancel', async (el) => {
  if (!confirmInline(el)) return;
  const m = S.meetings.find((x) => x.id === el.dataset.id);
  await S.store.update('meetings', {}, m.id, { canceled: true });
  if (m.roomId) await postMessage(m.roomId, { text: `「${m.title}」(${fmtDate(m.date)} ${m.start}) 일정을 취소했습니다.` }).catch(() => {});
  toast('일정을 취소했습니다');
});
on('mt-edit', (el) => { const m = S.meetings.find((x) => x.id === el.dataset.id); openMeetingModal({ ...m, editId: m.id }); });

// 빈 시간 추천: 참석자 모두 비어 있는 30분 단위 시각(08:40~16:30)
function freeSlots(date, uids, minutes, skipId) {
  const busy = S.meetings.filter((m) => active(m) && m.id !== skipId && m.date === date && (m.attendeeUids || []).some((u) => uids.includes(u) && m.attendees?.[u] !== 'declined'));
  const out = [];
  for (let t = 8 * 60 + 40; t + minutes <= 16 * 60 + 30 && out.length < 4; t += 10) {
    const start = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    const cand = { date, start, minutes };
    if (toMs(date, start) < Date.now()) continue;
    if (!busy.some((b) => overlaps(b, cand))) { out.push(start); t += 20; }
  }
  return out;
}

export function openMeetingModal(o = {}) {
  const kind = o.kind || 'meeting';
  const tch = teachers();
  const att = new Set(o.attendeeUids || []); att.add(S.me.uid);
  const date = o.date || addDays(todayStr(), 1);
  openModal(`<form class="mt-form"><h2>${o.editId ? '일정 시간 변경' : kind === 'call' ? '전화 예약' : '회의 예약'}</h2>
    <fieldset class="seg"><legend class="sr">종류</legend>
      <label><input type="radio" name="kind" value="meeting" ${kind === 'meeting' ? 'checked' : ''}><span>회의</span></label>
      <label><input type="radio" name="kind" value="call" ${kind === 'call' ? 'checked' : ''}><span>전화</span></label></fieldset>
    <label>제목<input name="title" value="${esc(o.title || '')}" required placeholder="예: 4학년 통합학급 수업 조정 협의"></label>
    <div class="row3"><label>날짜<input type="date" name="date" value="${esc(date)}" required></label>
      <label>시작<input type="time" name="start" value="${esc(o.start || '15:00')}" step="600" required></label>
      <label>길이<select name="minutes">${[10, 20, 30, 40, 60, 90].map((n) => `<option value="${n}" ${(+o.minutes || (kind === 'call' ? 10 : 40)) === n ? 'selected' : ''}>${n}분</option>`).join('')}</select></label></div>
    <div class="slots small" aria-live="polite"></div>
    <fieldset><legend>${kind === 'call' ? '통화할 선생님' : '참석자'}</legend><div class="chk-list">${tch.map((m) => `<label class="chk"><input type="checkbox" name="u" value="${m.id}" ${att.has(m.id) ? 'checked' : ''} ${m.id === S.me.uid ? 'disabled' : ''}> ${esc(m.name)} <small class="muted">${esc(m.title || '')}</small></label>`).join('')}</div></fieldset>
    <div class="conflict small" aria-live="polite"></div>
    <div class="row2"><label data-place>${kind === 'call' ? '연락 방법(내선·교무실 전화 등)' : '장소'}<input name="place" value="${esc(o.place || '')}" placeholder="${kind === 'call' ? '예: 내선 214' : '예: 특수학급 교실'}"></label>
      <label>관련 학생<select name="studentId"><option value="">없음</option>${S.students.map((s) => `<option value="${s.id}" ${o.studentId === s.id ? 'selected' : ''}>${esc(s.alias)}</option>`).join('')}</select></label></div>
    <label>안건·메모<textarea name="memo" rows="2">${esc(o.memo || '')}</textarea></label>
    <label class="chk"><input type="checkbox" name="notify" checked> ${o.roomId ? '이 대화방에 예약 카드 보내기' : '참석자와의 대화방에 예약 카드 보내기'}</label>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">${o.editId ? '변경 저장' : '예약하기'}</button></div></form>`, {
    wide: true,
    onOpen: (modal) => {
      const f = modal.querySelector('form');
      const upd = () => {
        const uids = [S.me.uid, ...[...f.querySelectorAll('[name=u]:checked')].map((x) => x.value)];
        const cand = { date: f.date.value, start: f.start.value, minutes: +f.minutes.value };
        const clash = S.meetings.filter((m) => active(m) && m.id !== o.editId && m.date === cand.date && overlaps(m, cand))
          .flatMap((m) => (m.attendeeUids || []).filter((u) => uids.includes(u) && m.attendees?.[u] !== 'declined').map((u) => `${nameOf(u)}(${m.start} ${m.title})`));
        f.querySelector('.conflict').innerHTML = clash.length ? `<p class="alert">겹치는 일정: ${esc([...new Set(clash)].join(', '))}</p>` : '<p class="ok-text">참석자 모두 이 시간에 다른 일정이 없습니다.</p>';
        const slots = f.date.value ? freeSlots(f.date.value, uids, +f.minutes.value, o.editId) : [];
        f.querySelector('.slots').innerHTML = slots.length ? `모두 비어 있는 시간: ${slots.map((s) => `<button type="button" class="chip-btn" data-slot="${s}">${s}</button>`).join(' ')}` : '<span class="muted">이날은 모두 비어 있는 시간이 없습니다.</span>';
        f.querySelector('[data-place]').firstChild.textContent = f.kind.value === 'call' ? '연락 방법(내선·교무실 전화 등)' : '장소';
      };
      f.addEventListener('input', upd); f.addEventListener('change', upd);
      f.querySelector('.slots').addEventListener('click', (e) => { const b = e.target.closest('[data-slot]'); if (b) { f.start.value = b.dataset.slot; upd(); } });
      upd();
    },
    onSubmit: async (fd) => {
      const uids = [...new Set([S.me.uid, ...fd.getAll('u')])];
      if (uids.length < 2) { toast('함께할 선생님을 한 명 이상 고르세요'); return false; }
      const data = { kind: fd.get('kind'), title: fd.get('title'), date: fd.get('date'), start: fd.get('start'), minutes: Number(fd.get('minutes')), place: fd.get('place') || '', studentId: fd.get('studentId') || '', memo: fd.get('memo') || '', attendeeUids: uids };
      const attendees = Object.fromEntries(uids.map((u) => [u, u === S.me.uid ? 'accepted' : 'pending']));
      let id = o.editId, roomId = o.roomId || '';
      if (fd.get('notify') && !roomId) roomId = data.studentId ? await ensureRoom(student(data.studentId)?.teamUids || uids, { studentId: data.studentId, name: `${student(data.studentId)?.alias} IEP팀` }) : await ensureRoom(uids.filter((u) => u !== S.me.uid), uids.length > 2 ? { name: data.title } : {});
      if (roomId) { const r = S.rooms.find((x) => x.id === roomId); const add = uids.filter((u) => r && !r.memberUids.includes(u)); if (add.length) await S.store.update('rooms', {}, roomId, { memberUids: [...r.memberUids, ...add] }); }
      if (id) await S.store.update('meetings', {}, id, { ...data, attendees, roomId });
      else id = await S.store.create('meetings', {}, { ...data, attendees, roomId, organizer: S.me.uid, createdAt: Date.now(), canceled: false });
      if (fd.get('notify') && roomId) await postMessage(roomId, { kind: 'booking', meetingId: id, bookingKind: data.kind, text: `${data.title} ${fmtDate(data.date)} ${data.start}${o.editId ? ' (시간 변경)' : ''}` });
      S.ui.calDay = data.date; S.ui.calMonth = data.date.slice(0, 7);
      toast(o.editId ? '시간을 바꾸고 참석자에게 다시 물었습니다' : `${KIND[data.kind]} 예약을 보냈습니다`);
      rerender();
    }
  });
}

export { go, timeStr };
