// 알림 띠: 전화 예약·긴급회의·공지를 한 사람 또는 여러 사람에게 보내면, 받는 사람 화면 맨 위에 깜박이며 뜬다.
// 받은 사람은 「확인」으로 깜박임을 끄거나 「삭제」로 띠에서 지울 수 있다. 메신저 대화방에는 기록이 그대로 남는다.
import { esc, todayStr, timeStr, fmtDate, relTime, openModal, toast, addDays } from '../util.js';
import { S, on, go, teachers, nameOf, isTeacher } from '../state.js';
import { ensureRoom, postMessage } from './chat.js';
import { autoRespond } from './bots.js';

export const ALERT_TYPES = {
  urgent: { label: '긴급회의', cls: 'urgent' },
  call: { label: '전화 예약', cls: 'call' },
  meeting: { label: '회의 예약', cls: 'meeting' },
  notice: { label: '공지', cls: 'notice' }
};

// 받는 사람에게 알림 띠를 만든다(보낸 사람 자신은 제외)
export async function sendAlert({ type, title, text, to, roomId = '', meetingId = '' }) {
  const recipients = [...new Set(to)].filter((u) => u && u !== S.me.uid);
  if (!recipients.length) return null;
  const id = await S.store.create('alerts', {}, { type, title, text, from: S.me.uid, to: recipients, at: Date.now(), roomId, meetingId, ack: {}, hidden: {} });
  autoRespond({ to: recipients, roomId, meetingId });
  return id;
}

// 화면 맨 위 알림 띠
export function alertsBar() {
  if (!isTeacher()) return '';
  const me = S.me.uid;
  const list = S.alerts.filter((a) => (a.to || []).includes(me) && !a.hidden?.[me]).sort((a, b) => {
    const na = a.ack?.[me] ? 1 : 0, nb = b.ack?.[me] ? 1 : 0;
    return na - nb || b.at - a.at;
  });
  if (!list.length) return '';
  const open = S.ui.alertsOpen;
  const shown = open ? list : list.slice(0, 3);
  const items = shown.map((a) => {
    const t = ALERT_TYPES[a.type] || ALERT_TYPES.notice;
    const fresh = !a.ack?.[me];
    return `<li class="alert-item ${t.cls} ${fresh ? 'blink' : 'seen'}">
      <span class="alert-kind">${fresh ? '<span class="alert-new">새 알림</span>' : ''}${t.label}</span>
      <span class="alert-text"><b>${esc(a.title || t.label)}</b>${a.text ? ` <span>${esc(a.text)}</span>` : ''}<small>${esc(nameOf(a.from))} · ${relTime(a.at)}</small></span>
      <span class="alert-btns">
        ${a.roomId ? `<button type="button" class="sm ghost" data-act="alert-open" data-id="${a.id}">대화 보기</button>` : ''}
        ${fresh ? `<button type="button" class="sm primary" data-act="alert-ack" data-id="${a.id}">확인</button>` : ''}
        <button type="button" class="sm ghost" data-act="alert-hide" data-id="${a.id}" aria-label="이 알림을 띠에서 삭제">삭제</button>
      </span></li>`;
  }).join('');
  const more = list.length > 3 ? `<button type="button" class="link sm" data-act="alerts-toggle">${open ? '접기' : `알림 ${list.length - 3}건 더 보기`}</button>` : '';
  return `<section class="alerts-bar" role="region" aria-label="받은 알림 ${list.length}건" aria-live="polite"><ul>${items}</ul>${more}</section>`;
}

on('alert-ack', async (el) => { await S.store.update('alerts', {}, el.dataset.id, { [`ack.${S.me.uid}`]: Date.now() }); });
on('alert-hide', async (el) => { await S.store.update('alerts', {}, el.dataset.id, { [`ack.${S.me.uid}`]: Date.now(), [`hidden.${S.me.uid}`]: Date.now() }); toast('알림 띠에서 지웠습니다. 대화방 기록은 남아 있습니다.'); });
on('alert-open', async (el) => {
  const a = S.alerts.find((x) => x.id === el.dataset.id);
  if (!a) return;
  if (!a.ack?.[S.me.uid]) await S.store.update('alerts', {}, a.id, { [`ack.${S.me.uid}`]: Date.now() });
  go('#/chat/' + a.roomId);
});
on('alerts-toggle', () => { S.ui.alertsOpen = !S.ui.alertsOpen; import('../state.js').then((m) => m.rerender()); });

// 받는 사람들과의 대화방: 한 명이면 1:1, 여럿이면 같은 사람들로 된 방을 다시 쓰거나 새로 만든다
async function roomFor(uids) {
  const set = [...new Set([S.me.uid, ...uids])];
  if (set.length === 2) return ensureRoom(set.filter((u) => u !== S.me.uid));
  const same = S.rooms.find((r) => r.type === 'group' && r.memberUids.length === set.length && set.every((u) => r.memberUids.includes(u)));
  if (same) return same.id;
  return ensureRoom(set.filter((u) => u !== S.me.uid), { name: set.filter((u) => u !== S.me.uid).map(nameOf).join(', ') });
}

const nextSlot = (min = 10) => { const d = new Date(Date.now() + min * 60000); d.setMinutes(Math.ceil(d.getMinutes() / 10) * 10, 0, 0); return d; };

// 공지·알림 보내기 창. roomId가 있으면 그 방 사람들에게, 없으면 고른 사람들에게
export function openNoticeModal(o = {}) {
  const room = o.roomId ? S.rooms.find((r) => r.id === o.roomId) : null;
  const pre = new Set(room ? room.memberUids : o.to || []);
  const others = teachers().filter((m) => m.id !== S.me.uid);
  const slot = nextSlot();
  const type = o.type || 'urgent';
  openModal(`<form class="notice-form"><h2>공지·알림 보내기</h2>
    <p class="muted small">받는 사람 화면 맨 위에 깜박이는 알림으로 뜨고, 메신저 대화방에도 기록이 남습니다.</p>
    <fieldset class="seg seg3"><legend class="sr">종류</legend>
      <label><input type="radio" name="type" value="urgent" ${type === 'urgent' ? 'checked' : ''}><span>긴급회의 공지</span></label>
      <label><input type="radio" name="type" value="call" ${type === 'call' ? 'checked' : ''}><span>전화 예약</span></label>
      <label><input type="radio" name="type" value="notice" ${type === 'notice' ? 'checked' : ''}><span>일반 공지</span></label></fieldset>
    ${room ? `<p class="small">받는 사람: ${esc(room.memberUids.filter((u) => u !== S.me.uid).map(nameOf).join(', '))} (이 대화방)</p>`
      : `<fieldset><legend>받는 사람 <button type="button" class="link sm" data-all>모두 고르기</button></legend><div class="chk-list">${others.map((m) => `<label class="chk"><input type="checkbox" name="u" value="${m.id}" ${pre.has(m.id) ? 'checked' : ''}> ${esc(m.name)} <small class="muted">${esc(m.title || '')}</small></label>`).join('') || '<p class="muted small">초대된 다른 교사가 없습니다.</p>'}</div></fieldset>`}
    <label>제목<input name="title" required maxlength="40" value="${esc(o.title || '')}" placeholder="예: 하람 위기행동 긴급 협의"></label>
    <div class="when">
      <div class="row3"><label>날짜<input type="date" name="date" value="${todayStr(slot)}"></label>
      <label>시각<input type="time" name="start" step="600" value="${timeStr(slot)}"></label>
      <label>길이<select name="minutes">${[10, 20, 30, 40, 60].map((n) => `<option value="${n}" ${n === 20 ? 'selected' : ''}>${n}분</option>`).join('')}</select></label></div>
      <label data-place>장소<input name="place" placeholder="예: 특수학급 교실, 내선 214"></label>
    </div>
    <label>내용<textarea name="text" rows="3" placeholder="꼭 알려야 할 내용을 짧게"></textarea></label>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">보내기</button></div></form>`, {
    wide: true,
    onOpen: (m) => {
      const f = m.querySelector('form');
      const upd = () => {
        const t = f.type.value;
        f.querySelector('.when').hidden = t === 'notice';
        f.querySelector('[data-place]').firstChild.textContent = t === 'call' ? '연락 방법(내선·교무실 전화 등)' : '장소';
        f.minutes.value = t === 'call' ? (f.minutes.value === '20' ? '10' : f.minutes.value) : f.minutes.value;
      };
      f.addEventListener('change', upd); upd();
      const all = m.querySelector('[data-all]');
      if (all) all.onclick = () => f.querySelectorAll('[name=u]').forEach((c) => { c.checked = true; });
    },
    onSubmit: async (fd) => {
      const t = fd.get('type');
      const to = room ? room.memberUids.filter((u) => u !== S.me.uid) : fd.getAll('u');
      if (!to.length) { toast('받는 사람을 한 명 이상 고르세요'); return false; }
      const title = fd.get('title'), text = fd.get('text') || '';
      const roomId = room ? room.id : await roomFor(to);
      let meetingId = '', when = '';
      if (t !== 'notice') {
        const uids = [S.me.uid, ...to];
        const data = { kind: t === 'call' ? 'call' : 'meeting', title, date: fd.get('date'), start: fd.get('start'), minutes: Number(fd.get('minutes')), place: fd.get('place') || '', studentId: '', memo: text, attendeeUids: uids, attendees: Object.fromEntries(uids.map((u) => [u, u === S.me.uid ? 'accepted' : 'pending'])), roomId, organizer: S.me.uid, urgent: t === 'urgent', createdAt: Date.now(), canceled: false };
        meetingId = await S.store.create('meetings', {}, data);
        when = `${fmtDate(data.date)} ${data.start}${data.place ? ' · ' + data.place : ''}`;
      }
      const label = { urgent: '긴급회의', call: '전화 예약', notice: '공지' }[t];
      await postMessage(roomId, { kind: 'notice', noticeType: t, meetingId, text: `[${label}] ${title}${when ? ' · ' + when : ''}${text ? '\n' + text : ''}` });
      await sendAlert({ type: t, title, text: [when, text].filter(Boolean).join(' · '), to, roomId, meetingId });
      toast(`${to.length}명에게 ${label}을(를) 보냈습니다`);
      go('#/chat/' + roomId);
    }
  });
}
on('notice-new', (el) => openNoticeModal({ roomId: el.dataset.rid || '', type: el.dataset.type || '' }));

export { addDays };
