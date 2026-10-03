// 일정·예약: 공유 캘린더, 회의 예약, 전화 예약, 수락·거절, 겹침 확인, 빈 시간 추천, 구글 캘린더 추가
import { esc, todayStr, fmtDate, addDays, toMs, parseDate, openModal, toast, googleCalUrl, timeStr } from '../util.js';
import { S, on, rerender, teachers, nameOf, student, go, isAdmin } from '../state.js';
import { holidayOf } from '../holidays.js';
import { ensureRoom, postMessage } from './chat.js';
import { sendAlert } from './alerts.js';
import { confirmInline } from './record.js';

const KIND = { meeting: '회의', call: '전화' };
const STATUS = { accepted: '수락', declined: '거절', pending: '응답 전' };
const endMs = (m) => toMs(m.date, m.start) + (Number(m.minutes) || 30) * 60000;
const overlaps = (a, b) => toMs(a.date, a.start) < endMs(b) && toMs(b.date, b.start) < endMs(a);
const active = (m) => !m.canceled;

// 학사일정·개인 약속·공휴일
export const CAT = { event: '학교 행사', eval: '평가', meet: '연수·협의', vac: '방학·휴업' };
const SHOW = { hol: '공휴일', acad: '학사일정', mt: '회의·전화', appt: '개인 약속' };
const shown = () => ({ hol: true, acad: true, mt: true, appt: true, ...(S.ui.calShow || {}) });
export const acadOn = (d) => S.acad.filter((a) => a.date <= d && d <= (a.endDate || a.date)).sort((a, b) => ((a.start || '') > (b.start || '') ? 1 : -1));
export const apptsOn = (d) => S.appts.filter((p) => p.date === d).sort((a, b) => (a.start > b.start ? 1 : -1));
const range = (a) => (a.endDate && a.endDate !== a.date ? `${fmtDate(a.date)} ~ ${fmtDate(a.endDate)}` : fmtDate(a.date));
const apptToMeetingLike = (p) => ({ date: p.date, start: p.start, minutes: Math.max(10, (toMs(p.date, p.end) - toMs(p.date, p.start)) / 60000) });

export function acadCard(a) {
  return `<div class="mcard acad"><div class="mcard-head"><span class="tag acad">학사 · ${esc(CAT[a.cat] || '학교 행사')}</span><b>${esc(a.title)}</b></div>
    <p class="small">${esc(range(a))}${a.start ? ` · ${esc(a.start)}${a.end ? '~' + esc(a.end) : ''}` : ' · 종일'}${a.place ? ` · ${esc(a.place)}` : ''}</p>
    ${a.memo ? `<p class="small muted">${esc(a.memo)}</p>` : ''}
    ${isAdmin() ? `<div class="btns"><button type="button" class="ghost sm" data-act="acad-edit" data-id="${a.id}">수정</button></div>` : ''}</div>`;
}
export function apptCard(p) {
  const mine = p.createdBy === S.me.uid;
  const others = (p.memberUids || []).filter((u) => u !== S.me.uid);
  return `<div class="mcard appt"><div class="mcard-head"><span class="tag appt">개인 약속</span><b>${esc(p.title)}</b></div>
    <p class="small">${esc(fmtDate(p.date))} ${esc(p.start)}~${esc(p.end)}${p.place ? ` · ${esc(p.place)}` : ''}</p>
    ${p.memo ? `<p class="small muted">${esc(p.memo)}</p>` : ''}
    <div class="people">${others.length ? others.map((u) => `<span class="chip-s accepted">${esc(nameOf(u))}</span>`).join('') : '<span class="chip-s">나만</span>'}${!mine ? `<span class="small muted">만든 사람 ${esc(nameOf(p.createdBy))}</span>` : ''}</div>
    <p class="small muted">함께하는 선생님만 보입니다.</p>
    ${mine ? `<div class="btns"><button type="button" class="ghost sm" data-act="appt-edit" data-id="${p.id}">수정</button><button type="button" class="ghost sm danger" data-act="appt-del" data-id="${p.id}">삭제</button></div>` : ''}</div>`;
}

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
  const sh = shown();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push('<div class="cell pad" aria-hidden="true"></div>');
  for (let d = 1; d <= days; d++) {
    const ds = `${month}-${String(d).padStart(2, '0')}`;
    const wd = (startPad + d - 1) % 7;
    const hol = sh.hol ? holidayOf(ds) : '';
    const ac = sh.acad ? acadOn(ds) : [];
    const ap = sh.appt ? apptsOn(ds) : [];
    const its = sh.mt ? ms.filter((m) => m.date === ds).sort((a, b) => (a.start > b.start ? 1 : -1)) : [];
    const mine = its.filter((m) => m.attendeeUids?.includes(S.me.uid));
    const chips = [
      ...ac.map((a) => `<span class="ev acad" title="${esc(a.title)}">${esc(a.title)}</span>`),
      ...ap.map((p) => `<span class="ev appt" title="${esc(p.title)}">${esc(p.start)} ${esc(p.title)}</span>`),
      ...its.map((m) => `<span class="ev ${m.kind} ${m.attendeeUids?.includes(S.me.uid) ? 'mine' : ''}">${esc(m.start)} ${esc(m.title)}</span>`)
    ];
    const label = [fmtDate(ds), hol && `공휴일 ${hol}`, ac.length && `학사일정 ${ac.length}개`, ap.length && `개인 약속 ${ap.length}개`, `회의·전화 ${its.length}개`, mine.length && `내 일정 ${mine.length}개`].filter(Boolean).join(', ');
    cells.push(`<button type="button" class="cell ${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''} ${hol ? 'hol' : ''} ${ds === todayStr() ? 'today' : ''} ${ds === sel ? 'sel' : ''}" data-act="cal-day" data-d="${ds}" aria-label="${esc(label)}">
      <span class="dtop"><span class="dnum">${d}</span>${hol ? `<span class="hol-name">${esc(hol)}</span>` : ''}</span>${chips.slice(0, 3).join('')}${chips.length > 3 ? `<span class="more">+${chips.length - 3}</span>` : ''}</button>`);
  }
  const selHol = holidayOf(sel);
  const dayAcad = acadOn(sel), dayAppt = apptsOn(sel);
  const dayList = ms.filter((m) => m.date === sel).sort((a, b) => (a.start > b.start ? 1 : -1));
  const pending = ms.filter((m) => m.attendees?.[S.me.uid] === 'pending' && m.organizer !== S.me.uid && endMs(m) > Date.now());
  const [y, mo] = month.split('-').map(Number);
  const prev = new Date(y, mo - 2, 1), next = new Date(y, mo, 1);
  const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const monthHols = Object.entries(Object.fromEntries([...Array(days)].map((_, i) => { const ds = `${month}-${String(i + 1).padStart(2, '0')}`; return [ds, holidayOf(ds)]; }))).filter(([, n]) => n);
  return `<div class="page-head"><h1>일정·예약</h1><div class="btns"><button type="button" class="primary" data-act="mt-new" data-kind="meeting">회의 예약</button><button type="button" class="ghost" data-act="call-new">전화 예약</button><button type="button" class="ghost" data-act="appt-new">개인 약속</button>${isAdmin() ? '<button type="button" class="ghost" data-act="acad-new">학사일정 추가</button>' : ''}</div></div>
  ${pending.length ? `<section class="card attn"><h2 class="h3">응답을 기다리는 초대 ${pending.length}건</h2>${pending.map((m) => meetingCard(m)).join('')}</section>` : ''}
  <div class="cal-wrap">
    <section class="card cal">
      <div class="cal-head"><button type="button" class="ghost sm" data-act="cal-month" data-m="${ym(prev)}" aria-label="이전 달">‹</button><h2 class="h3">${y}년 ${mo}월</h2><button type="button" class="ghost sm" data-act="cal-month" data-m="${ym(next)}" aria-label="다음 달">›</button></div>
      <div class="cal-legend" role="group" aria-label="달력에 보일 일정 고르기">${Object.entries(SHOW).map(([k, l]) => `<label class="lg-chip k-${k}"><input type="checkbox" data-change="cal-show" data-k="${k}" ${sh[k] ? 'checked' : ''}><span class="sw" aria-hidden="true"></span>${l}</label>`).join('')}</div>
      <div class="wk" aria-hidden="true">${['일', '월', '화', '수', '목', '금', '토'].map((w, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}</div>
      <div class="grid7">${cells.join('')}</div>
      ${monthHols.length ? `<p class="small hol-list">이달의 공휴일: ${monthHols.map(([d, n]) => `${Number(d.slice(8))}일 ${esc(n)}`).join(' · ')}</p>` : ''}
      <p class="small muted">회의·전화와 학사일정은 교사 모두가 봅니다. 개인 약속은 함께하는 선생님에게만 보입니다. 공휴일은 관공서 공휴일(대체·임시공휴일 포함) 기준입니다.</p>
    </section>
    <section class="card day">
      <div class="cal-head"><h2 class="h3">${esc(fmtDate(sel))}${selHol ? ` <span class="tag hol">${esc(selHol)}</span>` : ''}</h2><span class="btns"><button type="button" class="ghost sm" data-act="appt-new" data-date="${sel}">약속 잡기</button><button type="button" class="primary sm" data-act="mt-new" data-kind="meeting" data-date="${sel}">회의 잡기</button></span></div>
      ${selHol ? `<p class="small hol-note">공휴일입니다. 회의·약속을 잡을 때 한 번 더 확인하세요.</p>` : ''}
      ${dayAcad.map(acadCard).join('')}${dayAppt.map(apptCard).join('')}${dayList.map((m) => meetingCard(m)).join('')}
      ${!dayAcad.length && !dayAppt.length && !dayList.length ? '<p class="muted">일정이 없습니다.</p>' : ''}
    </section>
  </div>`;
}

on('cal-show', (el) => { S.ui.calShow = { ...shown(), [el.dataset.k]: el.checked }; rerender(); });

// 개인 약속(선생님들 간): 함께하는 사람만 본다
export function openApptModal(p = {}) {
  const tch = teachers().filter((m) => m.id !== S.me.uid);
  const sel = new Set(p.memberUids || []);
  openModal(`<form class="appt-form"><h2>${p.id ? '개인 약속 수정' : '개인 약속'}</h2>
    <p class="small muted">점심·모임 같은 선생님들 간의 약속입니다. 함께하는 선생님에게만 보이고, 학교 전체 달력에는 나오지 않습니다.</p>
    <label>무슨 약속<input name="title" value="${esc(p.title || '')}" required placeholder="예: 점심 약속, 동학년 모임"></label>
    <div class="row3"><label>날짜<input type="date" name="date" value="${esc(p.date || S.ui.calDay || todayStr())}" required></label>
      <label>시작<input type="time" name="start" value="${esc(p.start || '12:30')}" step="300" required></label>
      <label>끝<input type="time" name="end" value="${esc(p.end || '13:10')}" step="300" required></label></div>
    <div class="hol-warn small" aria-live="polite"></div>
    <fieldset><legend>함께하는 선생님(없으면 나만 보임)</legend><div class="chk-list">${tch.map((m) => `<label class="chk"><input type="checkbox" name="u" value="${m.id}" ${sel.has(m.id) ? 'checked' : ''}> ${esc(m.name)} <small class="muted">${esc(m.title || '')}</small></label>`).join('') || '<p class="muted small">다른 선생님이 아직 없습니다.</p>'}</div></fieldset>
    <label>장소<input name="place" value="${esc(p.place || '')}" placeholder="예: 교내 카페"></label>
    <label>메모<textarea name="memo" rows="2">${esc(p.memo || '')}</textarea></label>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">${p.id ? '저장' : '약속 만들기'}</button></div></form>`, {
    wide: true,
    onOpen: (m) => { const f = m.querySelector('form'); const upd = () => { const h = holidayOf(f.date.value); f.querySelector('.hol-warn').innerHTML = h ? `<p class="hol-note">이날은 공휴일(${esc(h)})입니다.</p>` : ''; }; f.addEventListener('input', upd); upd(); },
    onSubmit: async (fd) => {
      if (fd.get('end') <= fd.get('start')) { toast('끝 시각을 시작보다 늦게 정하세요'); return false; }
      const data = { title: fd.get('title'), date: fd.get('date'), start: fd.get('start'), end: fd.get('end'), place: fd.get('place') || '', memo: fd.get('memo') || '', memberUids: [...new Set([S.me.uid, ...fd.getAll('u')])], updatedAt: Date.now() };
      if (p.id) await S.store.update('appts', {}, p.id, data);
      else await S.store.create('appts', {}, { ...data, createdBy: S.me.uid, createdAt: Date.now() });
      S.ui.calDay = data.date; S.ui.calMonth = data.date.slice(0, 7);
      toast(p.id ? '약속을 고쳤습니다' : '약속을 만들었습니다'); rerender();
    }
  });
}
on('appt-new', (el) => openApptModal({ date: el.dataset.date }));
on('appt-edit', (el) => openApptModal(S.appts.find((x) => x.id === el.dataset.id)));
on('appt-del', async (el) => { if (!confirmInline(el)) return; await S.store.remove('appts', {}, el.dataset.id); toast('약속을 지웠습니다'); });

// 학사일정(관리자): 학교 전체가 보는 일정
export function openAcadModal(a = {}) {
  const d0 = a.date || S.ui.calDay || todayStr();
  openModal(`<form class="acad-form"><h2>${a.id ? '학사일정 수정' : '학사일정 추가'}</h2>
    <label>일정 이름<input name="title" value="${esc(a.title || '')}" required placeholder="예: 학부모 상담 주간"></label>
    <label>분류<select name="cat">${Object.entries(CAT).map(([k, l]) => `<option value="${k}" ${a.cat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="row2"><label>시작일<input type="date" name="date" value="${esc(d0)}" required></label><label>끝나는 날<input type="date" name="endDate" value="${esc(a.endDate || d0)}" required></label></div>
    <div class="row2"><label>시작 시각(선택)<input type="time" name="start" value="${esc(a.start || '')}" step="300"></label><label>끝 시각(선택)<input type="time" name="end" value="${esc(a.end || '')}" step="300"></label></div>
    <label>장소<input name="place" value="${esc(a.place || '')}"></label>
    <label>메모<textarea name="memo" rows="2">${esc(a.memo || '')}</textarea></label>
    <div class="actions">${a.id ? '<button type="button" class="danger ghost" data-del>삭제</button>' : ''}<span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">저장</button></div></form>`, {
    wide: true,
    onOpen: (m) => { const del = m.querySelector('[data-del]'); if (del) del.onclick = async () => { if (!confirmInline(del)) return; await S.store.remove('acad', {}, a.id); m.closest('.modal-back').remove(); toast('학사일정을 지웠습니다'); }; },
    onSubmit: async (fd) => {
      if (fd.get('endDate') < fd.get('date')) { toast('끝나는 날을 시작일 뒤로 정하세요'); return false; }
      const data = { title: fd.get('title'), cat: fd.get('cat'), date: fd.get('date'), endDate: fd.get('endDate'), start: fd.get('start') || '', end: fd.get('end') || '', place: fd.get('place') || '', memo: fd.get('memo') || '', updatedAt: Date.now() };
      if (a.id) await S.store.update('acad', {}, a.id, data);
      else await S.store.create('acad', {}, { ...data, createdBy: S.me.uid, createdAt: Date.now() });
      S.ui.calDay = data.date; S.ui.calMonth = data.date.slice(0, 7);
      toast('학사일정을 저장했습니다'); rerender();
    }
  });
}
on('acad-new', () => openAcadModal());
on('acad-edit', (el) => openAcadModal(S.acad.find((x) => x.id === el.dataset.id)));

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
  const busy = [...S.meetings.filter((m) => active(m) && m.id !== skipId && m.date === date && (m.attendeeUids || []).some((u) => uids.includes(u) && m.attendees?.[u] !== 'declined')),
    ...S.appts.filter((p) => p.date === date && (p.memberUids || []).some((u) => uids.includes(u))).map(apptToMeetingLike)];
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
    <input type="hidden" name="kind" value="meeting">
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
        S.appts.filter((p) => p.date === cand.date && overlaps(apptToMeetingLike(p), cand)).forEach((p) => clash.push(`개인 약속 ${p.start} ${p.title}`));
        const hol = holidayOf(cand.date);
        f.querySelector('.conflict').innerHTML = (hol ? `<p class="hol-note">이날은 공휴일(${esc(hol)})입니다.</p>` : '') + (clash.length ? `<p class="alert">겹치는 일정: ${esc([...new Set(clash)].join(', '))}</p>` : '<p class="ok-text">참석자 모두 이 시간에 다른 일정이 없습니다.</p>');
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
      await sendAlert({ type: data.kind === 'call' ? 'call' : 'meeting', title: `${data.title}${o.editId ? ' (시간 변경)' : ''}`, text: `${fmtDate(data.date)} ${data.start} · ${data.minutes}분${data.place ? ' · ' + data.place : ''}`, to: uids, roomId, meetingId: id });
      S.ui.calDay = data.date; S.ui.calMonth = data.date.slice(0, 7);
      toast(o.editId ? '시간을 바꾸고 참석자에게 다시 물었습니다' : `${KIND[data.kind]} 예약을 보냈습니다`);
      rerender();
    }
  });
}

export { go, timeStr };
