// 관리 화면: 구글 계정 초대(역할 지정), 구성원 관리, 학사일정·경고 기준, 가상 학생 예시
import { esc, toast } from '../util.js';
import { S, on, rerender, ROLE_LABEL, avatar, teachers, aides, nameOf, student } from '../state.js';
import { ACTION_LABEL, KIND_LABEL } from '../access.js';
import { fmtDateTime, toast as toast2 } from '../util.js';
import { DEFAULT_PLACE, findSchool, resetPlaceCache } from './widgets.js';
import { demoSeed, defaultSchool } from '../store.js';
import { confirmInline } from './record.js';
import { botMembers } from './bots.js';
import { acadExamples, apptExamples } from '../calExamples.js';

const TITLES = ['특수학급 담임', '통합학급 담임', '교과 교사', '특수교육 부장', '교감', '교장', '특수교육실무사', '사회복무요원', '치료지원 담당'];

export function render() {
  const sc = { ...defaultSchool(), ...S.school };
  const members = [...S.members].sort((a, b) => (a.role > b.role ? 1 : -1));
  const invites = S.invites.filter((i) => !S.members.some((m) => m.email === i.id));
  return `<div class="page-head"><h1>관리</h1><p class="muted">구글 계정을 이메일로 초대하면, 그 사람이 처음 로그인할 때 정해 둔 역할로 들어옵니다.</p></div>
  <div class="dash">
  <section class="card"><h2 class="h3">구글 계정 초대</h2>
    <form class="stack" id="invite-form">
      <label>구글 이메일<input type="email" name="email" required placeholder="name@gmail.com" autocomplete="off"></label>
      <div class="row2"><label>이름<input name="name" required></label>
      <label>역할<select name="role"><option value="teacher">교사(메신저·일정·IEP)</option><option value="aide">보조인력(행동 기록만)</option><option value="admin">관리자(교사 + 초대)</option></select></label></div>
      <label>직책<input name="title" list="titles" placeholder="예: 통합학급 담임"><datalist id="titles">${TITLES.map((t) => `<option value="${t}">`).join('')}</datalist></label>
      <button type="submit" class="primary">초대 저장</button>
    </form>
    ${invites.length ? `<h3 class="h4">아직 로그인하지 않은 초대 ${invites.length}</h3><ul class="rows">${invites.map((i) => `<li><span class="grow">${esc(i.name)} <small class="muted">${esc(i.id)} · ${ROLE_LABEL[i.role]}${i.title ? ' · ' + esc(i.title) : ''}</small></span><button type="button" class="link sm" data-act="inv-del" data-id="${esc(i.id)}">취소</button></li>`).join('')}</ul>` : ''}
    <p class="small muted">초대받은 분께 앱 주소를 알려 주세요. 처음 로그인할 때 이메일이 초대 목록과 같아야 들어올 수 있습니다.</p>
  </section>
  <section class="card"><h2 class="h3">구성원 ${members.length}명 <small class="muted">교사 ${teachers().length} · 보조인력 ${aides().length}</small></h2>
    <ul class="rows">${members.map((m) => `<li>${avatar(m.id, 'sm')}<span class="grow"><b>${esc(m.name)}</b> <small class="muted">${esc(m.email || '')}</small><br>
      <select data-change="mem-role" data-id="${m.id}" aria-label="${esc(m.name)} 역할" ${m.id === S.me.uid ? 'disabled' : ''}>${Object.entries(ROLE_LABEL).map(([k, l]) => `<option value="${k}" ${m.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input class="sm-input" value="${esc(m.title || '')}" list="titles" data-change="mem-title" data-id="${m.id}" aria-label="${esc(m.name)} 직책"></span>
      ${m.id !== S.me.uid ? `<label class="chk small"><input type="checkbox" data-change="mem-active" data-id="${m.id}" ${m.active !== false ? 'checked' : ''}> 사용</label>` : '<small class="muted">나</small>'}</li>`).join('')}</ul>
  </section>
  <section class="card"><h2 class="h3">학사일정·운영 기준</h2>
    <form class="stack" id="school-form">
      <label>학교 이름(표시용)<input name="name" value="${esc(sc.name)}"></label>
      <div class="row2"><label>학년 시작일<input type="date" name="yearStart" value="${esc(sc.yearStart)}"></label><label>진전도 경고(연속 횟수)<input type="number" name="warnRun" min="2" max="6" value="${esc(sc.warnRun)}"></label></div>
      <div class="row2"><label>1학기 시작<input type="date" name="sem1Start" value="${esc(sc.sem1Start)}"></label><label>1학기 끝<input type="date" name="sem1End" value="${esc(sc.sem1End)}"></label></div>
      <div class="row2"><label>2학기 시작<input type="date" name="sem2Start" value="${esc(sc.sem2Start)}"></label><label>2학기 끝<input type="date" name="sem2End" value="${esc(sc.sem2End)}"></label></div>
      <div class="row2"><label>근무시간 외 시작<input type="time" name="quietFrom" value="${esc(sc.quietFrom)}"></label><label>근무 시작<input type="time" name="quietTo" value="${esc(sc.quietTo)}"></label></div>
      <fieldset><legend>위기행동 사후 기록</legend>
        <div class="row3"><label>팀 회고 기한(수업일, 0은 안 씀)<input type="number" name="debriefDays" min="0" max="10" value="${esc(sc.debriefDays ?? 2)}"></label>
        <label>재검토 제안 건수<input type="number" name="reviewN" min="2" max="10" value="${esc(sc.reviewN ?? 3)}"></label>
        <label>재검토 기간(일)<input type="number" name="reviewDays" min="7" max="120" value="${esc(sc.reviewDays ?? 30)}"></label></div>
        <p class="small muted">회고 기한은 법정 수치가 없어 학교가 정하는 값입니다. 정한 기간 안 사후 기록이 기준 건수 이상이면 행동지원계획 재검토를 제안합니다.</p></fieldset>
      <fieldset><legend>첫 화면 급식·날씨</legend>
        <div class="row3"><label>급식 학교 이름<input name="mealSchoolName" value="${esc(sc.mealSchoolName || DEFAULT_PLACE.mealSchoolName)}"></label>
        <label>교육청 코드<input name="mealOffice" value="${esc(sc.mealOffice || DEFAULT_PLACE.mealOffice)}"></label>
        <label>학교 코드<input name="mealSchool" value="${esc(sc.mealSchool || DEFAULT_PLACE.mealSchool)}"></label></div>
        <p class="small"><button type="button" class="ghost sm" data-act="find-school">학교 이름으로 코드 찾기(NEIS)</button> <span class="muted" data-school-hits></span></p>
        <div class="row3"><label>날씨 지역 이름<input name="wxName" value="${esc(sc.wxName || DEFAULT_PLACE.wxName)}"></label>
        <label>위도<input name="wxLat" inputmode="decimal" value="${esc(sc.wxLat ?? DEFAULT_PLACE.wxLat)}"></label>
        <label>경도<input name="wxLon" inputmode="decimal" value="${esc(sc.wxLon ?? DEFAULT_PLACE.wxLon)}"></label></div>
        <p class="small muted">급식은 NEIS 교육정보 개방 포털, 날씨는 Open-Meteo 공개 예보를 브라우저에서 바로 불러옵니다. 학생 정보는 보내지 않습니다.</p></fieldset>
      <button type="submit" class="primary">저장</button>
    </form>
  </section>
  <section class="card"><h2 class="h3">학사일정 파일로 넣기</h2>
    <p class="small">학교 학사일정 파일(엑셀 xlsx·xls·csv, 한글 hwp·hwpx, PDF)을 올리면 날짜와 일정 이름을 찾아 미리 보여 줍니다. 고친 뒤 고른 것만 달력에 넣습니다. 파일은 이 브라우저 안에서만 읽습니다.</p>
    <div class="btns"><button type="button" class="primary" data-act="acad-import">파일 올리기</button><a class="btn-link sm" href="#/calendar">달력 보기</a></div>
    <p class="small muted">지금 들어 있는 학사일정 ${S.acad.length}건</p>
  </section>
  <section class="card"><h2 class="h3">시험용 봇 교사</h2>
    <p class="small">로그인하지 않는 시험용 교사입니다. 봇에게 공지·예약·메시지를 보내면 몇 초 뒤 자동으로 답하고, 아래 버튼으로 봇이 나에게 알림을 보내게 할 수 있습니다.</p>
    ${botMembers().length ? `<ul class="rows">${botMembers().map((b) => `<li><span class="grow"><b>${esc(b.name)}</b> <small class="muted">${esc(b.title || '')}</small><br>
      <span class="btns"><button type="button" class="sm notice-btn" data-act="bot-send" data-bot="${b.id}" data-type="urgent">나에게 긴급회의 공지</button><button type="button" class="sm ghost" data-act="bot-send" data-bot="${b.id}" data-type="call">나에게 전화 예약</button><button type="button" class="sm ghost" data-act="bot-send" data-bot="${b.id}" data-type="notice">나에게 일반 공지</button></span></span></li>`).join('')}</ul>
      <button type="button" class="ghost sm danger" data-act="bots-remove">봇 지우기</button>`
    : '<button type="button" class="primary" data-act="bots-create">봇 교사 2명 만들기</button>'}
  </section>
  <section class="card access-card"><h2 class="h3">접근 기록 <small class="muted">최근 ${Math.min(S.access.length, 40)}건 / 전체 ${S.access.length}건</small></h2>
    <p class="small">누가 언제 어느 학생 자료를 열람·작성·수정·삭제·인쇄했는지 남습니다. 관리자만 볼 수 있고 아무도 고치거나 지울 수 없습니다.</p>
    <label class="small">학생<select data-change="acc-log-filter"><option value="">전체</option>${S.students.map((x) => `<option value="${x.id}" ${S.ui.accLog === x.id ? 'selected' : ''}>${esc(x.alias)}</option>`).join('')}</select></label>
    <ul class="rows">${S.access.filter((a) => !S.ui.accLog || a.sid === S.ui.accLog).slice(0, 40).map((a) => `<li><small class="time">${esc(fmtDateTime(a.at))}</small><span class="grow"><b>${esc(nameOf(a.uid))}</b> ${esc(student(a.sid)?.alias || '(지운 학생)')} · ${esc(KIND_LABEL[a.what] || a.what || '')} ${esc(ACTION_LABEL[a.action] || a.action)}</span></li>`).join('') || '<li class="muted">아직 기록이 없습니다.</li>'}</ul>
  </section>
  <section class="card"><h2 class="h3">시연 자료</h2>
    <p class="small">가상 학생 3명(가명), IEP 목표, 표적행동(빈도·지속시간·간격기록·잠재시간), 기초선 기록, 위기행동 사후 기록과 평가조정 예시를 넣습니다. 지금 구성원 중 교사·보조인력이 팀과 기록 담당으로 자동 배정됩니다.</p>
    <button type="button" class="ghost" data-act="seed">가상 학생 예시 넣기</button>
    <button type="button" class="ghost" data-act="seed-cal">학사일정·개인 약속 예시 넣기</button>
    ${S.acad.some((a) => a.sample) || S.appts.some((p) => p.sample) ? '<button type="button" class="ghost danger" data-act="unseed-cal">일정 예시 지우기</button>' : ''}
    ${S.store.mode === 'demo' ? '<button type="button" class="ghost" data-act="demo-reset">데모 자료 처음으로</button>' : ''}
    <p class="small muted">학교 서버로 옮기는 방법은 저장소의 README 「학교 DB 이식」과 db/schema.sql을 보세요.</p>
  </section></div>`;
}

document.addEventListener('submit', async (e) => {
  if (e.target.id === 'invite-form') {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = String(fd.get('email')).trim().toLowerCase();
    await S.store.create('invites', {}, { name: fd.get('name'), role: fd.get('role'), title: fd.get('title') || '', invitedBy: S.me.uid, createdAt: Date.now() }, email);
    e.target.reset(); toast(`${email} 초대를 저장했습니다`);
  }
  if (e.target.id === 'school-form') {
    e.preventDefault();
    const fd = new FormData(e.target);
    const patch = Object.fromEntries(fd.entries()); patch.warnRun = Number(patch.warnRun) || 3;
    patch.wxLat = Number(patch.wxLat) || DEFAULT_PLACE.wxLat; patch.wxLon = Number(patch.wxLon) || DEFAULT_PLACE.wxLon; resetPlaceCache();
    patch.debriefDays = Math.max(0, Number(patch.debriefDays) || 0); patch.reviewN = Number(patch.reviewN) || 3; patch.reviewDays = Number(patch.reviewDays) || 30;
    await S.store.saveSchool(patch); toast('학사일정을 저장했습니다');
  }
});
on('find-school', async (el) => {
  const f = el.closest('form'); const out = f.querySelector('[data-school-hits]');
  const name = f.querySelector('[name="mealSchoolName"]').value.trim(); if (!name) return;
  out.textContent = '찾는 중…';
  try {
    const hits = await findSchool(name);
    if (!hits.length) { out.textContent = '찾지 못했습니다. 학교 이름을 정확히 적어 주세요.'; return; }
    const h = hits[0];
    f.querySelector('[name="mealOffice"]').value = h.office; f.querySelector('[name="mealSchool"]').value = h.code; f.querySelector('[name="mealSchoolName"]').value = h.name;
    out.textContent = `${h.name}(${h.kind}) · ${h.addr}${hits.length > 1 ? ` 외 ${hits.length - 1}곳` : ''} — 저장을 눌러 주세요`;
  } catch { out.textContent = '조회하지 못했습니다(인터넷 연결 확인).'; toast2('학교 코드 조회 실패'); }
});
on('acc-log-filter', (el) => { S.ui.accLog = el.value; rerender(); });
on('inv-del', async (el) => { if (!confirmInline(el)) return; await S.store.remove('invites', {}, el.dataset.id); });
on('mem-role', async (el) => { await S.store.update('members', {}, el.dataset.id, { role: el.value }); toast('역할을 바꿨습니다'); });
on('mem-title', async (el) => { await S.store.update('members', {}, el.dataset.id, { title: el.value }); toast('직책을 저장했습니다'); });
on('mem-active', async (el) => { await S.store.update('members', {}, el.dataset.id, { active: el.checked }); toast(el.checked ? '사용하도록 했습니다' : '사용을 멈췄습니다'); });

on('seed', async (el) => {
  el.disabled = true;
  try {
    const tch = teachers().filter((m) => m.id !== S.me.uid), ad = aides();
    const sd = demoSeed({ cm: S.me.uid, t2: tch[0]?.id, t3: tch[1]?.id, t4: tch[2]?.id, a1: ad[0]?.id, a2: ad[1]?.id || ad[0]?.id });
    const map = {};
    for (const s of sd.students) { const { id, ...d } = s; map[id] = await S.store.create('students', {}, { ...d, createdBy: S.me.uid, createdAt: Date.now() }); }
    const tmap = {};
    for (const [sid, gs] of Object.entries(sd.goals)) for (const g of gs) { const { id, ...d } = g; await S.store.create('goals', { sid: map[sid] }, { ...d, createdBy: S.me.uid, createdAt: Date.now() }); }
    for (const [sid, ts] of Object.entries(sd.targets)) for (const t of ts) { const { id, ...d } = t; tmap[id] = await S.store.create('targets', { sid: map[sid] }, { ...d, createdBy: S.me.uid, createdAt: Date.now() }); }
    for (const ev of sd.bevents) { const { id, ...d } = ev; await S.store.create('bevents', {}, { ...d, studentId: map[ev.studentId], targetId: tmap[ev.targetId], createdBy: S.me.uid }); }
    for (const ic of sd.incidents) { const { id, ...d } = ic; await S.store.create('incidents', {}, { ...d, studentId: map[ic.studentId], createdBy: S.me.uid }); }
    for (const [sid, as] of Object.entries(sd.accoms)) for (const a of as) { const { id, ...d } = a; await S.store.create('accoms', { sid: map[sid] }, { ...d, createdBy: S.me.uid, updatedBy: S.me.uid }); }
    toast('가상 학생 예시를 넣었습니다');
  } finally { el.disabled = false; rerender(); }
});

// 일정 예시: 2026학년도 2학기 학사일정과, 나와 다른 교사(봇 포함) 사이의 개인 약속
on('seed-cal', async (el) => {
  el.disabled = true;
  try {
    const others = teachers().filter((m) => m.id !== S.me.uid).map((m) => m.id);
    const haveA = new Set(S.acad.map((a) => a.date + a.title)), haveP = new Set(S.appts.map((p) => p.date + p.start + p.title));
    let n = 0;
    for (const a of acadExamples()) if (!haveA.has(a.date + a.title)) { await S.store.create('acad', {}, { ...a, createdBy: S.me.uid, createdAt: Date.now() }); n++; }
    for (const p of apptExamples(S.me.uid, others)) if (!haveP.has(p.date + p.start + p.title)) { await S.store.create('appts', {}, { ...p, createdAt: Date.now() }); n++; }
    toast(n ? `일정 예시 ${n}건을 넣었습니다. 일정·예약에서 확인하세요.` : '이미 들어가 있습니다');
  } finally { el.disabled = false; rerender(); }
});
on('unseed-cal', async (el) => {
  if (!confirmInline(el)) return;
  for (const a of S.acad.filter((x) => x.sample)) await S.store.remove('acad', {}, a.id);
  for (const p of S.appts.filter((x) => x.sample && (x.createdBy === S.me.uid || x.createdBy.startsWith('bot-')))) await S.store.remove('appts', {}, p.id);
  toast('일정 예시를 지웠습니다');
});
