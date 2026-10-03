// 앱 전체 상태와 공통 도우미
import { esc } from './util.js';

export const S = {
  store: null, me: null, school: {}, members: [], invites: [], students: [], rooms: [], meetings: [], tasks: [], alerts: [],
  goalsBy: {}, targetsBy: {}, eventsBy: {}, myEvents: [], memosBy: {}, messagesBy: {},
  route: { name: 'today', args: [] }, drafts: {}, running: {}, ui: {}
};

export const actions = {};
export const on = (name, fn) => { actions[name] = fn; };

let scheduled = false;
let renderFn = () => {};
export const setRender = (fn) => { renderFn = fn; };
export function rerender() {
  if (scheduled) return; scheduled = true;
  const run = () => { scheduled = false; renderFn(); };
  // 탭이 가려져 있으면 requestAnimationFrame이 멈추므로 타이머로 그린다(알림이 바로 반영되게)
  if (document.hidden) setTimeout(run, 30); else requestAnimationFrame(run);
}

// 경로에 묶인 구독: 화면을 떠나면 해제
const viewSubs = new Map();
export function useSub(key, kind, params, setter) {
  if (viewSubs.has(key)) return;
  viewSubs.set(key, S.store.sub(kind, params, (rows) => { setter(rows); rerender(); }));
}
export function clearViewSubs(keep = () => false) {
  for (const [k, un] of viewSubs) if (!keep(k)) { un(); viewSubs.delete(k); }
}

export const isTeacher = () => S.me && (S.me.role === 'teacher' || S.me.role === 'admin');
export const isAdmin = () => S.me?.role === 'admin';
export const isAide = () => S.me?.role === 'aide';
export const member = (uid) => S.members.find((m) => m.id === uid || m.uid === uid);
export const nameOf = (uid) => member(uid)?.name || (uid === S.me?.uid ? S.me.name : '알 수 없음');
export const labelOf = (uid) => { const m = member(uid); return m ? `${m.name}${m.title ? ' · ' + m.title : ''}` : nameOf(uid); };
export const teachers = () => S.members.filter((m) => m.active !== false && (m.role === 'teacher' || m.role === 'admin'));
export const aides = () => S.members.filter((m) => m.active !== false && m.role === 'aide');
export const student = (sid) => S.students.find((s) => s.id === sid);
export const avatar = (uid, size = '', name = '') => { const n = name || nameOf(uid); return `<span class="avatar ${size}" aria-hidden="true" style="--h:${[...uid || 'x'].reduce((a, c) => a + c.charCodeAt(0), 0) % 360}">${esc(n.slice(0, 1))}</span>`; };
export const ROLE_LABEL = { admin: '관리자(교사)', teacher: '교사', aide: '보조인력' };

export const go = (hash) => { if (location.hash !== hash) location.hash = hash; else rerender(); };
