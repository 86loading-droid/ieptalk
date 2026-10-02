// IEP톡 앱 시작점: 로그인, 화면 틀, 경로, 전역 구독
import { makeStore, isDemo } from './store.js';
import { APP_NAME } from './config.js';
import { esc, $, toast, closeModal } from './util.js';
import { S, actions, on, setRender, rerender, clearViewSubs, isTeacher, isAdmin, isAide, avatar, ROLE_LABEL } from './state.js';
import * as Today from './views/today.js';
import * as Students from './views/students.js';
import * as Behavior from './views/behavior.js';
import * as Chat from './views/chat.js';
import * as Cal from './views/calendar.js';
import * as Admin from './views/admin.js';
import * as Aide from './views/aide.js';

const TEACHER_NAV = [
  ['today', '오늘', 'M3 12l9-8 9 8M5 10v10h14V10'],
  ['students', '학생·IEP', 'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0'],
  ['behavior', '행동 기록', 'M12 3v18M3 12h18'],
  ['chat', '메신저', 'M4 5h16v11H8l-4 4z'],
  ['calendar', '일정·예약', 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5']
];
const ADMIN_NAV = ['admin', '관리', 'M12 8a4 4 0 100 8 4 4 0 000-8zM3 12h2m14 0h2M12 3v2m0 14v2'];
const AIDE_NAV = [
  ['record', '기록하기', 'M12 3v18M3 12h18'],
  ['mine', '내 기록', 'M5 4h14v16H5zM8 9h8M8 13h8']
];
const VIEWS = { today: Today, students: Students, student: Students, behavior: Behavior, chat: Chat, calendar: Cal, admin: Admin, record: Aide, mine: Aide };

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  let name = parts[0] || (isAide() ? 'record' : 'today');
  if (isAide() && !['record', 'mine'].includes(name)) name = 'record';
  if (!isAide() && ['record', 'mine'].includes(name)) name = 'today';
  if (name === 'admin' && !isAdmin()) name = 'today';
  return { name, args: parts.slice(1) };
}

const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

function unreadCount() { return S.rooms.filter(Chat.isUnread).length; }

function pendingInvites() {
  return S.meetings.filter((m) => m.attendees?.[S.me.uid] === 'pending' && m.organizer !== S.me.uid).length;
}

function shell(content) {
  const nav = isAide() ? AIDE_NAV : [...TEACHER_NAV, ...(isAdmin() ? [ADMIN_NAV] : [])];
  const cur = S.route.name === 'student' ? 'students' : S.route.name;
  const badge = (k) => {
    const n = k === 'chat' ? unreadCount() : k === 'calendar' ? pendingInvites() : 0;
    return n ? `<span class="badge" aria-label="새 항목 ${n}개">${n}</span>` : '';
  };
  const links = nav.map(([k, label, d]) => `<a href="#/${k}" class="nav-item ${cur === k ? 'on' : ''}" ${cur === k ? 'aria-current="page"' : ''}>${icon(d)}<span>${label}</span>${badge(k)}</a>`).join('');
  return `
  <a class="skip" href="#main">본문 바로가기</a>
  <header class="topbar">
    <div class="brand"><span class="logo" aria-hidden="true">톡</span><span>${APP_NAME}</span>${S.store.mode === 'demo' ? '<span class="pill">데모</span>' : ''}</div>
    <div class="me">
      ${avatar(S.me.uid)}<span class="me-name">${esc(S.me.name)}<small>${esc(S.me.title || ROLE_LABEL[S.me.role])}</small></span>
      <button type="button" class="ghost sm" data-act="signout">${S.store.mode === 'demo' ? '사용자 바꾸기' : '로그아웃'}</button>
    </div>
  </header>
  <nav class="sidenav" aria-label="주 메뉴">${links}</nav>
  <main id="main" tabindex="-1">${content}</main>
  <nav class="tabbar" aria-label="주 메뉴(하단)">${links}</nav>`;
}

let lastRouteKey = '';
function render() {
  const root = $('#app');
  if (!S.me) return;
  S.route = parseRoute();
  const key = S.route.name + '/' + S.route.args.join('/');
  if (key !== lastRouteKey) { clearViewSubs(); lastRouteKey = key; }
  const view = VIEWS[S.route.name] || Today;
  // 입력 중인 칸 보존
  const act = document.activeElement;
  const focusId = act && act.id && root.contains(act) ? act.id : null;
  let sel = null; try { sel = focusId && act.selectionStart != null ? [act.selectionStart, act.selectionEnd] : null; } catch {}
  const focusVal = focusId && 'value' in act ? act.value : null;
  const scrollers = {}; root.querySelectorAll('[data-keep-scroll]').forEach((el) => { scrollers[el.dataset.keepScroll] = { top: el.scrollTop, atEnd: el.scrollHeight - el.scrollTop - el.clientHeight < 40 }; });
  let html;
  try { html = view.render(S.route); } catch (e) { console.error(e); html = `<section class="card"><h2>화면을 그리지 못했습니다</h2><p>${esc(e.message)}</p></section>`; }
  root.innerHTML = shell(html);
  root.querySelectorAll('[data-draft]').forEach((el) => { const v = S.drafts[el.dataset.draft]; if (v != null && el.value === '') el.value = v; });
  if (focusId) { const el = document.getElementById(focusId); if (el) { if (focusVal != null && el.type !== 'checkbox' && el.type !== 'radio') el.value = focusVal; el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch {} } }
  root.querySelectorAll('[data-keep-scroll]').forEach((el) => { const s = scrollers[el.dataset.keepScroll]; el.scrollTop = !s || s.atEnd ? el.scrollHeight : s.top; });
  view.after && view.after(root, S.route);
  document.title = `${APP_NAME}`;
}
setRender(render);

// 공통 이벤트 위임
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); Promise.resolve(fn(el, e)).catch((err) => { console.error(err); toast('처리하지 못했습니다: ' + (err.message || err)); }); }
});
document.addEventListener('input', (e) => { const k = e.target.dataset?.draft; if (k) S.drafts[k] = e.target.value; });
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el && actions[el.dataset.change]) Promise.resolve(actions[el.dataset.change](el, e)).catch((err) => toast('처리하지 못했습니다: ' + err.message));
});
window.addEventListener('hashchange', () => { closeModal(); rerender(); window.scrollTo(0, 0); });

on('signout', () => S.store.signOut());

/* 전역 구독 */
const studentSubs = new Map();
function syncStudentSubs() {
  const ids = new Set(S.students.map((s) => s.id));
  for (const [sid, uns] of studentSubs) if (!ids.has(sid)) { uns.forEach((u) => u()); studentSubs.delete(sid); }
  for (const s of S.students) {
    if (studentSubs.has(s.id)) continue;
    const uns = [S.store.sub('targets', { sid: s.id }, (r) => { S.targetsBy[s.id] = r; rerender(); })];
    if (isTeacher()) uns.push(S.store.sub('goals', { sid: s.id }, (r) => { S.goalsBy[s.id] = r; rerender(); }));
    studentSubs.set(s.id, uns);
  }
}
function startGlobal() {
  const st = S.store;
  st.sub('school', {}, (d) => { S.school = d; rerender(); });
  st.sub('members', {}, (r) => { S.members = r.map((m) => ({ ...m, uid: m.id })); rerender(); });
  st.sub('students', {}, (r) => { S.students = r.sort((a, b) => (a.alias > b.alias ? 1 : -1)); syncStudentSubs(); rerender(); });
  if (isTeacher()) {
    st.sub('rooms', {}, (r) => { S.rooms = r.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)); rerender(); });
    st.sub('meetings', {}, (r) => { S.meetings = r; rerender(); });
    st.sub('tasks', {}, (r) => { S.tasks = r; rerender(); });
    if (isAdmin()) st.sub('invites', {}, (r) => { S.invites = r; rerender(); });
  } else {
    st.sub('bevents', { mine: true }, (r) => { S.myEvents = r; rerender(); });
  }
}

/* 로그인 화면 */
function loginScreen(status, err) {
  const root = $('#app');
  const demo = S.store.mode === 'demo';
  const msg = {
    noInvite: '이 구글 계정은 아직 초대되지 않았습니다. 관리자에게 이메일 주소로 초대를 요청하세요.',
    inactive: '사용이 중지된 계정입니다. 관리자에게 문의하세요.',
    error: '로그인 정보를 확인하지 못했습니다. ' + (err?.message || '')
  }[status];
  const demoUsers = demo ? S.store.users.map((u) => `<button type="button" class="user-pick" data-act="demo-login" data-uid="${u.uid}">${avatar(u.uid)}<span><b>${esc(u.name)}</b><small>${esc(u.title)} · ${ROLE_LABEL[u.role]}</small></span></button>`).join('') : '';
  root.innerHTML = `
  <main class="login" id="main">
    <div class="login-card">
      <div class="brand big"><span class="logo" aria-hidden="true">톡</span><span>${APP_NAME}</span></div>
      <p class="lead">현장 특수교사의 IEP 작성·진전도·행동 기록과 교사 간 협업을 한곳에서.</p>
      ${msg ? `<p class="alert" role="alert">${esc(msg)}</p>` : ''}
      ${demo ? `<h2 class="h3">데모 사용자 선택</h2><p class="muted">가상 학생 자료로 움직이는 시연판입니다. 다른 창(탭)에서 다른 사용자를 고르면 메신저·예약이 실시간으로 오갑니다.</p><div class="user-list">${demoUsers}</div>
        <button type="button" class="ghost sm" data-act="demo-reset">데모 자료 처음으로</button>`
      : `<button type="button" class="primary block" data-act="google-login"><svg viewBox="0 0 24 24" aria-hidden="true" class="g"><path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4"/><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0012 22z" fill="#34A853"/><path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 000 9.2z" fill="#FBBC05"/><path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 003.1 7.4L6.4 10C7.2 7.7 9.4 5.9 12 5.9z" fill="#EA4335"/></svg>구글 계정으로 로그인</button>
        ${status === 'noInvite' || status === 'inactive' ? '<button type="button" class="ghost block" data-act="signout">다른 계정으로 로그인</button>' : ''}
        <p class="muted small">초대받은 교사·보조인력만 들어올 수 있습니다. 실제 학생 정보는 넣지 마세요(시연판).</p>
        <p class="small"><a href="?demo=1">로그인 없이 둘러보기(가상 자료, 이 브라우저 안에서만)</a></p>`}
    </div>
  </main>`;
}

on('google-login', async () => { try { await S.store.signIn(); } catch (e) { toast('로그인하지 못했습니다: ' + (e.code || e.message)); } });
on('demo-login', (el) => { S.store.demoLogin(el.dataset.uid); location.hash = ''; location.reload(); });
on('demo-reset', () => { S.store.resetDemo(); toast('데모 자료를 처음 상태로 되돌렸습니다.'); });

async function boot() {
  S.store = await makeStore();
  let started = false;
  S.store.init((status, err) => {
    if (status !== 'ok') { S.me = null; return loginScreen(status, err); }
    S.me = S.store.me;
    if (!started) { started = true; startGlobal(); }
    render();
  });
  if (isDemo()) document.documentElement.dataset.demo = '1';
}
boot().catch((e) => { console.error(e); $('#app').innerHTML = `<p class="alert">앱을 시작하지 못했습니다: ${esc(e.message)}</p>`; });

// 진행 중 지속시간 타이머 화면 갱신
setInterval(() => { if (Object.keys(S.running).length) document.querySelectorAll('[data-timer]').forEach((el) => { const s = (Date.now() - Number(el.dataset.timer)) / 1000; el.textContent = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }); }, 1000);
