// 시험용 봇 교사: 로그인하지 않는 자료용 교사 2명. 관리자 화면에서 만들고,
// 봇에게 공지·예약을 보내면 몇 초 뒤 자동으로 답하고, 봇이 나에게 알림을 보내는 시험도 할 수 있다.
import { toast, todayStr, timeStr, fmtDate } from '../util.js';
import { S, on, rerender, isAdmin, nameOf } from '../state.js';
import { ensureRoom } from './chat.js';

export const BOTS = [
  { id: 'bot-teacher-1', name: '봇 이서준', title: '통합학급 담임(시험용 봇)' },
  { id: 'bot-teacher-2', name: '봇 박지민', title: '특수교육 부장(시험용 봇)' }
];
export const isBotUid = (u) => typeof u === 'string' && u.startsWith('bot-');
export const botMembers = () => S.members.filter((m) => m.bot);

// 봇 이름으로 대화방에 말한다(관리자 화면에서만)
export async function botSay(rid, botUid, text, extra = {}) {
  const at = Date.now();
  await S.store.create('messages', { rid }, { kind: 'text', text, ...extra, by: botUid, at });
  await S.store.update('rooms', {}, rid, { lastAt: at, lastBy: botUid, lastText: text.slice(0, 80), [`readBy.${botUid}`]: at });
}

// 관리자가 봇에게 공지·예약·메시지를 보내면 봇이 자동으로 답한다
export function autoRespond({ to = [], roomId = '', meetingId = '', kind = 'alert' }) {
  if (!isAdmin()) return;
  const bots = to.filter(isBotUid);
  if (!bots.length || !roomId) return;
  bots.forEach((b, i) => setTimeout(async () => {
    try {
      const mt = meetingId ? S.meetings.find((m) => m.id === meetingId) : null;
      if (mt && mt.organizer === S.me.uid && mt.attendees?.[b] === 'pending') await S.store.update('meetings', {}, mt.id, { [`attendees.${b}`]: 'accepted' });
      const text = kind === 'chat' ? '메시지 받았습니다. (시험용 봇 자동 응답)'
        : mt ? `알림 확인했습니다. ${fmtDate(mt.date)} ${mt.start} ${mt.kind === 'call' ? '통화' : '회의'}에 참석하겠습니다. (시험용 봇 자동 응답)`
        : '공지 확인했습니다. (시험용 봇 자동 응답)';
      await botSay(roomId, b, text);
    } catch (e) { console.warn('bot', e); }
  }, 2500 + i * 1200));
}

on('bots-create', async (el) => {
  el.disabled = true;
  for (const b of BOTS) {
    if (S.members.some((m) => m.id === b.id)) continue;
    await S.store.create('members', {}, { email: `${b.id}@ieptalk.test`, name: b.name, role: 'teacher', title: b.title, bot: true, active: true, createdAt: Date.now() }, b.id);
  }
  toast('시험용 봇 교사 2명을 만들었습니다');
  rerender();
});
on('bots-remove', async (el) => {
  if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = '한 번 더 누르면 봇 삭제'; setTimeout(() => { delete el.dataset.armed; el.textContent = '봇 지우기'; }, 3000); return; }
  for (const b of botMembers()) await S.store.remove('members', {}, b.id);
  toast('봇 교사를 지웠습니다(대화 기록은 남습니다)');
});

// 봇이 나에게 알림을 보낸다(받는 화면 시험)
on('bot-send', async (el) => {
  const bot = el.dataset.bot, type = el.dataset.type;
  const rid = await ensureRoom([bot]);
  const soon = new Date(Date.now() + 30 * 60000); soon.setMinutes(Math.ceil(soon.getMinutes() / 10) * 10);
  const when = `${fmtDate(todayStr(soon))} ${timeStr(soon)}`;
  const t = {
    urgent: ['긴급회의', '하람 위기행동 긴급 협의', `${when} · 특수학급 교실 · 오늘 사건 공유`],
    call: ['전화 예약', '도담 수업 조정 통화 요청', `${when} · 10분 · 내선 214`],
    notice: ['공지', '다음 주 IEP 중간 점검 안내', '목요일까지 목표별 측정값을 입력해 주세요']
  }[type];
  await botSay(rid, bot, `[${t[0]}] ${t[1]} · ${t[2]}`, { kind: 'notice', noticeType: type });
  await S.store.create('alerts', {}, { type, title: t[1], text: t[2], from: bot, to: [S.me.uid], at: Date.now(), roomId: rid, meetingId: '', ack: {}, hidden: {} });
  toast(`${nameOf(bot)}이(가) 보낸 ${t[0]} 알림이 화면 맨 위에 떴습니다`);
});
