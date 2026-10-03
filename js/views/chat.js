// 교사 전용 메신저: 1:1·모둠·학생 IEP팀 대화, 전화·회의 예약 카드, 할 일 만들기, 읽음 표시, 근무시간 외 예약 전송
import { esc, relTime, fmtDate, todayStr, addDays, toMs, openModal, toast, timeStr } from '../util.js';
import { S, on, rerender, useSub, go, teachers, nameOf, avatar, student, member } from '../state.js';
import { openMeetingModal, meetingCard } from './calendar.js';
import { autoRespond } from './bots.js';

export function roomTitle(r) {
  if (r.type === 'dm') return nameOf((r.memberUids || []).find((u) => u !== S.me.uid) || S.me.uid);
  return r.name || '대화방';
}
// 예약 전송된 메시지는 보낼 시각이 되어야 마지막 메시지로 보인다
export function roomLast(r) {
  const now = Date.now();
  if (r.schedAt && r.schedAt <= now && r.schedAt > (r.lastAt || 0)) return { lastAt: r.schedAt, lastText: r.schedText, lastBy: r.schedBy };
  return { lastAt: r.lastAt, lastText: r.lastText, lastBy: r.lastBy };
}
export const isUnread = (r) => { const l = roomLast(r); return l.lastAt && l.lastBy !== S.me.uid && (r.readBy?.[S.me.uid] || 0) < l.lastAt; };

export async function ensureRoom(memberUids, opts = {}) {
  const uids = [...new Set([S.me.uid, ...memberUids])];
  let r;
  if (opts.studentId) r = S.rooms.find((x) => x.type === 'student' && x.studentId === opts.studentId);
  else if (uids.length === 2 && !opts.name) r = S.rooms.find((x) => x.type === 'dm' && x.memberUids.length === 2 && uids.every((u) => x.memberUids.includes(u)));
  if (r) {
    const add = uids.filter((u) => !r.memberUids.includes(u));
    if (add.length) await S.store.update('rooms', {}, r.id, { memberUids: [...r.memberUids, ...add] });
    return r.id;
  }
  const type = opts.studentId ? 'student' : uids.length === 2 && !opts.name ? 'dm' : 'group';
  return S.store.create('rooms', {}, { type, name: opts.name || '', studentId: opts.studentId || '', memberUids: uids, createdBy: S.me.uid, createdAt: Date.now(), lastAt: Date.now(), lastBy: S.me.uid, lastText: '대화방을 열었습니다.', readBy: { [S.me.uid]: Date.now() } });
}

export async function openStudentRoom(sid) {
  const s = student(sid);
  const id = await ensureRoom(s.teamUids || [], { studentId: sid, name: `${s.alias} IEP팀` });
  go('#/chat/' + id);
}

export async function postMessage(rid, msg) {
  const at = msg.at || Date.now();
  await S.store.create('messages', { rid }, { kind: 'text', text: '', ...msg, by: S.me.uid, at });
  const preview = (msg.kind === 'booking' ? `[${msg.bookingKind === 'call' ? '전화' : '회의'} 예약] ${msg.text}` : msg.text).slice(0, 80);
  if (at > Date.now() + 5000) await S.store.update('rooms', {}, rid, { schedAt: at, schedBy: S.me.uid, schedText: preview });
  else await S.store.update('rooms', {}, rid, { lastAt: at, lastBy: S.me.uid, lastText: preview, [`readBy.${S.me.uid}`]: at });
}

function inQuiet(d = new Date()) {
  const from = S.school.quietFrom || '17:00', to = S.school.quietTo || '08:00';
  const t = timeStr(d);
  const wk = d.getDay() === 0 || d.getDay() === 6;
  return wk || (from > to ? t >= from || t < to : t >= from && t < to);
}
function nextWorkMorning() {
  const to = S.school.quietTo || '08:00';
  let d = todayStr();
  if (timeStr() >= to) d = addDays(d, 1);
  while ([0, 6].includes(new Date(toMs(d, to)).getDay())) d = addDays(d, 1);
  return toMs(d, to);
}

export function render(route) {
  const rid = route.args[0];
  const rooms = [...S.rooms].sort((a, b) => (roomLast(b).lastAt || 0) - (roomLast(a).lastAt || 0));
  const list = rooms.map((r) => { const l = roomLast(r); return `<a href="#/chat/${r.id}" class="room ${r.id === rid ? 'on' : ''}">
      ${r.type === 'dm' ? avatar((r.memberUids || []).find((u) => u !== S.me.uid) || S.me.uid) : `<span class="avatar grp" aria-hidden="true">${r.type === 'student' ? '학' : '모'}</span>`}
      <span class="grow"><b>${esc(roomTitle(r))}</b>${r.type !== 'dm' ? ` <small class="muted">${r.memberUids.length}명</small>` : ''}<br><small class="muted ellip">${esc(l.lastText || '')}</small></span>
      <span class="room-side"><small class="muted">${l.lastAt ? relTime(l.lastAt) : ''}</small>${isUnread(r) ? '<span class="dot-new" aria-label="안 읽음"></span>' : ''}</span></a>`; }).join('');
  const listCol = `<aside class="rooms ${rid ? 'hide-m' : ''}"><div class="rooms-head"><h1 class="h2">메신저</h1><span class="btns"><button type="button" class="ghost sm" data-act="notice-new">공지·알림</button><button type="button" class="primary sm" data-act="room-new">새 대화</button></span></div>
    <p class="muted small">교사끼리만 쓰는 대화입니다(담임·옆반·부장·교감). 보조인력과 보호자는 들어오지 않습니다.</p>${list || '<p class="muted">대화가 없습니다.</p>'}</aside>`;
  return `<div class="chat ${rid ? 'has-room' : ''}">${listCol}${rid ? roomView(rid) : '<section class="room-view empty hide-m"><p class="muted">왼쪽에서 대화를 고르세요.</p></section>'}</div>`;
}

function roomView(rid) {
  const r = S.rooms.find((x) => x.id === rid);
  if (!r) return '<section class="room-view"><p class="muted">대화방을 불러오는 중이거나 참여하지 않은 방입니다.</p><a href="#/chat">목록으로</a></section>';
  useSub('msg:' + rid, 'messages', { rid }, (rows) => { S.messagesBy[rid] = rows.sort((a, b) => a.at - b.at); });
  const now = Date.now();
  const msgs = (S.messagesBy[rid] || []).filter((m) => m.at <= now || m.by === S.me.uid);
  const others = r.memberUids.filter((u) => u !== S.me.uid);
  const myName = S.me.name;
  let lastDate = '';
  const items = msgs.map((m) => {
    const mine = m.by === S.me.uid;
    const d = new Date(m.at); const ds = todayStr(d);
    const sep = ds !== lastDate ? `<li class="day-sep"><span>${esc(fmtDate(ds))}</span></li>` : ''; lastDate = ds;
    const readers = others.filter((u) => (r.readBy?.[u] || 0) >= m.at).length;
    let body;
    if (m.kind === 'booking') {
      const mt = S.meetings.find((x) => x.id === m.meetingId);
      body = mt ? meetingCard(mt, { compact: true }) : `<p>${esc(m.text)}</p><small class="muted">(취소된 예약)</small>`;
    } else if (m.kind === 'notice') {
      const nt = { urgent: ['urgent', '긴급회의'], call: ['call', '전화 예약'], notice: ['notice', '공지'] }[m.noticeType] || ['notice', '공지'];
      const mt = m.meetingId ? S.meetings.find((x) => x.id === m.meetingId) : null;
      body = `<p><span class="tag ${nt[0]}">${nt[1]}</span></p><p>${esc(m.text).replace(/\n/g, '<br>')}</p>${mt ? meetingCard(mt, { compact: true }) : ''}`;
    } else if (m.kind === 'task') {
      body = `<p>할 일을 만들었습니다: <b>${esc(m.text)}</b></p>`;
    } else {
      const t = esc(m.text).replace(/@([^\s@]{2,10})/g, (all, n) => `<span class="mention ${myName.startsWith(n) || n.startsWith(myName) ? 'me' : ''}">@${n}</span>`);
      body = `<p>${t.replace(/\n/g, '<br>')}</p>`;
    }
    return `${sep}<li class="msg ${mine ? 'mine' : ''}">
      ${mine ? '' : avatar(m.by, 'sm')}
      <div class="bubble-wrap">${mine ? '' : `<small class="who">${esc(nameOf(m.by))}</small>`}
        <div class="bubble ${m.kind}">${body}</div>
        <small class="meta">${m.at > now ? `<span class="tag">예약 ${esc(fmtDate(todayStr(d)))} ${timeStr(d)}</span>` : timeStr(d)}${mine && others.length ? ` · ${readers === others.length ? '모두 읽음' : `안 읽음 ${others.length - readers}`}` : ''}
        ${m.kind === 'text' ? `<button type="button" class="link sm" data-act="msg-task" data-rid="${rid}" data-mid="${m.id}">할 일로</button>` : ''}</small>
      </div></li>`;
  }).join('');
  // 읽음 처리
  if (isUnread(r)) setTimeout(() => S.store.update('rooms', {}, rid, { [`readBy.${S.me.uid}`]: Date.now() }).catch(() => {}), 300);
  const stu = r.studentId ? student(r.studentId) : null;
  const quiet = inQuiet();
  return `<section class="room-view">
    <header class="room-head"><a class="back only-m" href="#/chat" aria-label="대화 목록으로">‹</a>
      <div class="grow"><h2 class="h3">${esc(roomTitle(r))}</h2><small class="muted">${r.memberUids.map((u) => esc(nameOf(u))).join(', ')}</small>
      ${stu ? `<br><a class="small" href="#/student/${stu.id}/goals">${esc(stu.alias)} 학생 화면 열기</a>` : ''}</div>
      <div class="btns"><button type="button" class="sm notice-btn" data-act="notice-new" data-rid="${rid}">공지·알림 보내기</button><button type="button" class="ghost sm" data-act="call-new" data-rid="${rid}">전화 예약</button>
      <button type="button" class="ghost sm" data-act="room-meet" data-rid="${rid}">회의 예약</button>
      ${r.type !== 'dm' ? `<button type="button" class="ghost sm" data-act="room-members" data-rid="${rid}">참여자</button>` : ''}</div></header>
    <ol class="msgs" data-keep-scroll="msgs-${rid}" aria-live="polite">${items || '<li class="muted">첫 메시지를 남겨 보세요.</li>'}</ol>
    <form class="composer" data-rid="${rid}">
      ${quiet ? `<p class="quiet small">지금은 근무시간 외입니다. 「아침에 보내기」를 고르면 다음 근무일 ${esc(S.school.quietTo || '08:00')}에 전달됩니다.</p>` : ''}
      <label class="sr" for="cmp-${rid}">메시지</label>
      <textarea id="cmp-${rid}" rows="2" data-draft="cmp-${rid}" placeholder="메시지 입력 · @이름으로 부르기 · Enter 전송, Shift+Enter 줄바꿈"></textarea>
      <div class="cmp-btns">${quiet ? `<button type="button" class="ghost sm" data-act="send-later" data-rid="${rid}">아침에 보내기</button>` : ''}<button type="submit" class="primary">보내기</button></div>
    </form></section>`;
}

on('room-new', () => {
  const list = teachers().filter((m) => m.id !== S.me.uid);
  openModal(`<form><h2>새 대화</h2><p class="muted small">한 명을 고르면 1:1, 여러 명이면 모둠 대화가 됩니다.</p>
    <div class="chk-list">${list.map((m) => `<label class="chk"><input type="checkbox" name="u" value="${m.id}"> ${esc(m.name)} <small class="muted">${esc(m.title || '')}</small></label>`).join('') || '<p class="muted">초대된 다른 교사가 없습니다.</p>'}</div>
    <label>모둠 이름(여러 명일 때)<input name="name" placeholder="예: 4학년 협의"></label>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">대화 시작</button></div></form>`, {
    onSubmit: async (fd) => {
      const u = fd.getAll('u'); if (!u.length) { toast('대화할 교사를 고르세요'); return false; }
      const id = await ensureRoom(u, u.length > 1 ? { name: fd.get('name') || u.map(nameOf).join(', ') } : {});
      go('#/chat/' + id);
    }
  });
});
on('room-members', (el) => {
  const r = S.rooms.find((x) => x.id === el.dataset.rid);
  const list = teachers();
  openModal(`<form><h2>참여자</h2><div class="chk-list">${list.map((m) => `<label class="chk"><input type="checkbox" name="u" value="${m.id}" ${r.memberUids.includes(m.id) ? 'checked' : ''} ${m.id === S.me.uid ? 'disabled' : ''}> ${esc(m.name)} <small class="muted">${esc(m.title || '')}</small></label>`).join('')}</div>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>닫기</button><button type="submit" class="primary">저장</button></div></form>`, {
    onSubmit: async (fd) => { await S.store.update('rooms', {}, r.id, { memberUids: [...new Set([S.me.uid, ...fd.getAll('u')])] }); toast('참여자를 바꿨습니다'); }
  });
});

async function send(form, at) {
  const rid = form.dataset.rid; const ta = form.querySelector('textarea');
  const text = ta.value.trim(); if (!text) return;
  ta.value = ''; S.drafts['cmp-' + rid] = '';
  await postMessage(rid, { text, at });
  if (!at) autoRespond({ to: S.rooms.find((r) => r.id === rid)?.memberUids || [], roomId: rid, kind: 'chat' });
  if (at) toast(`예약 전송: ${new Date(at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
}
document.addEventListener('submit', (e) => { const f = e.target.closest('.composer'); if (f) { e.preventDefault(); send(f).catch((err) => toast('보내지 못했습니다: ' + err.message)); } });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target.matches('.composer textarea')) { e.preventDefault(); e.target.form.requestSubmit(); }
});
on('send-later', (el) => send(el.closest('.composer'), nextWorkMorning()));

on('room-call', (el) => {
  const r = S.rooms.find((x) => x.id === el.dataset.rid);
  openMeetingModal({ kind: 'call', title: `${roomTitle(r)} 통화`, attendeeUids: r.memberUids, roomId: r.id, studentId: r.studentId || '' });
});
on('room-meet', (el) => {
  const r = S.rooms.find((x) => x.id === el.dataset.rid);
  openMeetingModal({ kind: 'meeting', title: r.type === 'dm' ? `${roomTitle(r)} 선생님과 협의` : `${roomTitle(r)} 회의`, attendeeUids: r.memberUids, roomId: r.id, studentId: r.studentId || '' });
});

on('msg-task', (el) => {
  const { rid, mid } = el.dataset;
  const m = (S.messagesBy[rid] || []).find((x) => x.id === mid);
  const r = S.rooms.find((x) => x.id === rid);
  openModal(`<form><h2>메시지를 할 일로</h2>
    <label>할 일<input name="title" value="${esc((m?.text || '').slice(0, 60))}" required></label>
    <div class="row2"><label>맡을 사람<select name="assignee">${r.memberUids.map((u) => `<option value="${u}" ${u === S.me.uid ? 'selected' : ''}>${esc(nameOf(u))}</option>`).join('')}</select></label>
    <label>기한<input type="date" name="due" value="${addDays(todayStr(), 3)}"></label></div>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">만들기</button></div></form>`, {
    onSubmit: async (fd) => {
      await S.store.create('tasks', {}, { title: fd.get('title'), assignee: fd.get('assignee'), due: fd.get('due'), done: false, roomId: rid, messageId: mid, studentId: r.studentId || '', createdBy: S.me.uid, createdAt: Date.now() });
      await postMessage(rid, { kind: 'task', text: `${fd.get('title')} → ${nameOf(fd.get('assignee'))}, ${fmtDate(fd.get('due'))}까지` });
      toast('할 일을 만들었습니다(오늘 화면에 표시)');
    }
  });
});

export { member };
