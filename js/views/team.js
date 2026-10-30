// 지원팀: 위기행동 대응 전담 인력 5자리 배치도, 교시별 당번표와 공백 점검, 투입 기록, 보상 근거(관리자 단가), 교직원 회복 지원, 학기·연간 보고.
// 5자리 이름은 교수님 확정(2026-10-30): 1 소통자, 2 지원대피 담당, 3 수업 대체, 4 수업지원, 5 연락 및 기록. 관리자가 이름과 설명을 고칠 수 있다.
// 저장: 명부·당번표·단가는 학교 설정 문서(supportTeam, 관리자만 씀), 투입 기록은 위기행동 사후 기록(incidents)의 deploy 칸(교사가 씀). 보안 규칙 변경 없음.
import { esc, todayStr, fmtDate, parseDate, toast } from '../util.js';
import { S, on, rerender, isAdmin, teachers, aides, member, student } from '../state.js';

export const DEFAULT_SLOTS = [
  { k: 's1', name: '소통자', desc: '학생에게 한 사람만 말합니다. 한 팔 길이 이상 거리와 45도 자세를 지키고, 짧고 차분한 말로 안내하며 개입 시작과 종료를 판단합니다.' },
  { k: 's2', name: '지원대피 담당', desc: '소통자 곁에서 안전을 지원하고, 주변 학생을 먼저 대피시키며 던질 수 있는 물건을 치우고 퇴로를 확보합니다.' },
  { k: 's3', name: '수업 대체', desc: '위기 대응에 빠진 교사 대신 그 학급의 수업을 이어서 맡아, 다른 학생의 학습이 끊기지 않게 합니다.' },
  { k: 's4', name: '수업지원', desc: '대체 수업과 대피한 학생들을 돕고, 교실 이동과 다른 학생의 정서 안정을 지원합니다.' },
  { k: 's5', name: '연락 및 기록', desc: '시각을 적고, 관리자 보고·보건교사 호출·보호자 통지 준비를 맡으며, 사후 보고서에 쓸 사실을 기록합니다.' }
];
export const DAYS = [['mon', '월'], ['tue', '화'], ['wed', '수'], ['thu', '목'], ['fri', '금']];
export const DEFAULT_TEAM_PERIODS = [
  { k: 'p1', label: '1교시', start: '09:00', end: '09:40' }, { k: 'p2', label: '2교시', start: '09:50', end: '10:30' },
  { k: 'p3', label: '3교시', start: '10:40', end: '11:20' }, { k: 'p4', label: '4교시', start: '11:30', end: '12:10' },
  { k: 'lunch', label: '점심', start: '12:10', end: '13:00' },
  { k: 'p5', label: '5교시', start: '13:00', end: '13:40' }, { k: 'p6', label: '6교시', start: '13:50', end: '14:30' }
];
export const RISKS = [['', '선택'], ['low', '저위험'], ['mid', '중위험'], ['high', '고위험'], ['crit', '치명적 위험']];
const RISK_L = Object.fromEntries(RISKS);
export const STATES = [['', '확인 전'], ['ok', '괜찮음'], ['rest', '쉬어야 함'], ['talk', '상담·심리 지원 필요']];
const STATE_L = Object.fromEntries(STATES);
// 부상 시 준비 목록: 학교·교육청 기준과 신분(교원·교육공무직·사회복무요원)에 따라 절차가 다르므로 「확인」 항목으로만 둔다.
export const CARE = [
  ['rep', '학교장에게 부상 사실 보고'],
  ['doc', '부상 부위 사진과 진료 기록(진료일·병원) 남기기'],
  ['claim', '치료비 신청 경로 확인(교원은 공무상 요양, 교육공무직·사회복무요원은 소속 기관 기준)'],
  ['protect', '교육활동 침해 여부 상담 안내(교원)'],
  ['psy', '심리 지원 기관 안내']
];

/* ---------- 자료 ---------- */
export function team() {
  const t = S.school?.supportTeam || {};
  const slots = DEFAULT_SLOTS.map((d) => ({ ...d, ...(t.slots || []).find((x) => x.k === d.k) }));
  return {
    slots,
    roster: t.roster || {},
    extras: t.extras || [],
    periods: t.periods?.length ? t.periods : DEFAULT_TEAM_PERIODS,
    duty: t.duty || {},
    rates: { base: {}, per30: 0, high: 0, crit: 0, injury: 0, note: '', ...(t.rates || {}) }
  };
}
const saveTeam = (patch) => S.store.saveSchool({ supportTeam: { ...(S.school?.supportTeam || {}), ...patch } });
export const slotName = (k) => team().slots.find((s) => s.k === k)?.name || k;
export function people() {
  const ms = [...teachers(), ...aides()].map((m) => ({ id: m.id, name: m.name, title: m.title || '' }));
  return [...ms, ...team().extras.map((x) => ({ id: x.id, name: x.name, title: x.title || '' }))];
}
export const personName = (id) => (id ? member(id)?.name || team().extras.find((x) => x.id === id)?.name || '(지운 사람)' : '');
const personOpts = (sel, empty = '비어 있음') => `<option value="">${empty}</option>${people().map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}${p.title ? ' · ' + esc(p.title) : ''}</option>`).join('')}`;
const won = (n) => `${Math.round(n || 0).toLocaleString('ko-KR')}원`;
const toMin = (hm) => { const [h, m] = String(hm || '').split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };

/* ---------- 투입 기록 계산 ---------- */
export function entryMin(st) { const a = toMin(st.arrive), b = toMin(st.end); return a == null || b == null ? null : Math.max(0, b - a); }
export function entryPay(st, ic, r = team().rates) {
  const base = Number(r.base?.[st.slot]) || 0, per30 = Number(r.per30) || 0;
  const min = entryMin(st) || 0;
  const time = Math.ceil(min / 30) * per30;
  const risk = ic.deploy?.risk;
  const pct = risk === 'crit' ? Number(r.crit) || 0 : risk === 'high' ? Number(r.high) || 0 : 0;
  const sub = Math.round((base + time) * (1 + pct / 100));
  const inj = st.injury ? Number(r.injury) || 0 : 0;
  return { base, time, pct, inj, total: sub + inj };
}
// 모든 투입 줄: { ic, st, i }
export function entries(from = '', to = '9999') {
  return S.incidents.filter((ic) => ic.date >= from && ic.date <= to)
    .flatMap((ic) => (ic.deploy?.staff || []).map((st, i) => ({ ic, st, i })).filter((x) => x.st.who))
    .sort((a, b) => (b.ic.date + (b.ic.time || '') > a.ic.date + (a.ic.time || '') ? 1 : -1));
}

/* ---------- 공백 점검(당번표·명부) ---------- */
export function gapCheck(t = team()) {
  const issues = [];
  t.slots.forEach((s) => {
    const r = t.roster[s.k] || {};
    if (!r.p1) issues.push({ kind: 'empty', text: `${s.name}: 1순위가 비어 있습니다.` });
    else if (r.p1 === r.p2) issues.push({ kind: 'dup', text: `${s.name}: 1순위와 2순위가 같은 사람입니다.` });
    else if (!r.p2) issues.push({ kind: 'soft', text: `${s.name}: 2순위(대신할 사람)가 없습니다.` });
    if (r.p1 && personName(r.p1) === '(지운 사람)') issues.push({ kind: 'empty', text: `${s.name}: 1순위가 구성원 목록에 없습니다.` });
  });
  let empties = 0;
  DAYS.forEach(([d, dl]) => t.periods.forEach((p) => {
    const cell = t.duty?.[d]?.[p.k] || {};
    const who = t.slots.map((s) => cell[s.k]).filter(Boolean);
    const miss = t.slots.filter((s) => !cell[s.k]);
    empties += miss.length;
    if (miss.length && miss.length < t.slots.length) issues.push({ kind: 'gap', day: d, p: p.k, text: `${dl} ${p.label}: ${miss.map((s) => s.name).join(', ')} 자리가 비어 있습니다.` });
    if (miss.length === t.slots.length) issues.push({ kind: 'gap', day: d, p: p.k, text: `${dl} ${p.label}: 당번이 한 명도 없습니다.` });
    const seen = {};
    who.forEach((id) => { seen[id] = (seen[id] || 0) + 1; });
    Object.entries(seen).filter(([, n]) => n > 1).forEach(([id]) => issues.push({ kind: 'dup', day: d, p: p.k, who: id, text: `${dl} ${p.label}: ${personName(id)} 님이 두 자리 이상에 들어가 있습니다.` }));
  }));
  return { issues, empties };
}
const cellIssue = (issues, d, p, k, id) => issues.some((x) => x.day === d && x.p === p && ((x.kind === 'dup' && x.who === id && id) || (x.kind === 'gap' && !id)));

/* ---------- 5자리 배치도 ---------- */
const NODE = { s1: [85, 82], s2: [225, 262], s3: [398, 108], s4: [462, 236], s5: [622, 172] };
export function teamMap(t = team(), { who = null } = {}) {
  const node = (s, i) => {
    const [x, y] = NODE[s.k];
    const r = t.roster[s.k] || {};
    const p1 = who ? personName(who[s.k] || '') : personName(r.p1);
    const p2 = who ? '' : personName(r.p2);
    return `<g class="tm-node tm-${s.k}" transform="translate(${x - 66} ${y - 30})"><rect width="132" height="60" rx="12"/>
      <circle cx="16" cy="16" r="11"/><text class="tm-no" x="16" y="20" text-anchor="middle">${i + 1}</text>
      <text class="tm-name" x="32" y="21">${esc(s.name)}</text>
      <text class="tm-p1" x="12" y="40">${esc(p1 || '비어 있음')}</text>${p2 ? `<text class="tm-p2" x="12" y="54">2순위 ${esc(p2)}</text>` : ''}</g>`;
  };
  const label = t.slots.map((s, i) => `${i + 1} ${s.name}: ${personName((who || {})[s.k] || t.roster[s.k]?.p1) || '비어 있음'}`).join(', ');
  return `<svg class="tm-map" viewBox="0 0 780 330" role="img" aria-label="지원팀 5자리 배치도. ${esc(label)}">
    <g class="tm-zone"><rect x="8" y="8" width="300" height="314" rx="16"/><text x="22" y="32">위기 현장</text></g>
    <g class="tm-zone b"><rect x="318" y="8" width="222" height="314" rx="16"/><text x="332" y="32">교실 수업(다른 학생)</text></g>
    <g class="tm-zone c"><rect x="550" y="8" width="222" height="314" rx="16"/><text x="564" y="32">연락·기록</text></g>
    <circle class="tm-dist" cx="165" cy="170" r="78"/><text class="tm-small" x="236" y="112">한 팔 이상</text><text class="tm-small" x="236" y="126">거리 유지</text>
    <line class="tm-link" x1="120" y1="112" x2="146" y2="152"/><line class="tm-link" x1="205" y1="232" x2="182" y2="192"/>
    <circle class="tm-stu" cx="165" cy="170" r="24"/><text class="tm-stu-t" x="165" y="175" text-anchor="middle">학생</text>
    <g class="tm-door"><rect x="40" y="282" width="78" height="28" rx="6"/><text x="79" y="301" text-anchor="middle">대피 →</text></g>
    <line class="tm-link" x1="159" y1="282" x2="118" y2="296"/>
    ${[[350, 196], [372, 182], [394, 206], [420, 186], [350, 280], [380, 290], [500, 120], [512, 160]].map(([x, y]) => `<circle class="tm-peer" cx="${x}" cy="${y}" r="7"/>`).join('')}
    ${[['관리자', 70], ['보건교사', 172], ['보호자', 274]].map(([l, y]) => `<g class="tm-box"><rect x="702" y="${y - 16}" width="62" height="32" rx="8"/><text x="733" y="${y + 5}" text-anchor="middle">${l}</text></g><line class="tm-link" x1="688" y1="${172 + (y - 172) * 0.25}" x2="702" y2="${y}"/>`).join('')}
    ${t.slots.map(node).join('')}
  </svg>`;
}

/* ---------- 화면 ---------- */
const TABS = [['map', '5자리 배치도'], ['duty', '당번표·공백 점검'], ['log', '투입 기록'], ['pay', '보상 근거'], ['care', '교직원 회복'], ['report', '학기·연간 보고']];
export function render(route) {
  const tab = TABS.some(([k]) => k === route.args[0]) ? route.args[0] : 'map';
  const tabs = TABS.filter(([k]) => k !== 'pay' || isAdmin());
  const body = tab === 'duty' ? dutyTab() : tab === 'log' ? logTab() : tab === 'pay' ? (isAdmin() ? payTab() : '<p class="muted">관리자만 볼 수 있습니다.</p>') : tab === 'care' ? careTab() : tab === 'report' ? reportTab() : mapTab();
  return `<div class="page-head"><h1>지원팀</h1><p class="muted">위기행동이 일어났을 때 함께 움직이는 전담 인력을 다섯 자리로 나누어 미리 정하고, 실제 투입을 기록해 보상과 회복 지원의 근거로 씁니다.</p></div>
  <nav class="tabs" aria-label="지원팀 메뉴">${tabs.map(([k, l]) => `<a href="#/team/${k}" class="${k === tab ? 'on' : ''}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>${body}`;
}

function mapTab() {
  const t = team(), adm = isAdmin();
  const rows = t.slots.map((s, i) => {
    const r = t.roster[s.k] || {};
    return adm ? `<tr><th scope="row"><span class="tm-badge tm-${s.k}">${i + 1}</span></th>
      <td><input name="name-${s.k}" value="${esc(s.name)}" aria-label="${i + 1}자리 이름" required><textarea name="desc-${s.k}" rows="2" aria-label="${i + 1}자리 하는 일">${esc(s.desc)}</textarea></td>
      <td><span class="tm-lbl">1순위</span><select name="p1-${s.k}" aria-label="${esc(s.name)} 1순위">${personOpts(r.p1)}</select></td><td><span class="tm-lbl">2순위</span><select name="p2-${s.k}" aria-label="${esc(s.name)} 2순위">${personOpts(r.p2)}</select></td></tr>`
      : `<tr><th scope="row"><span class="tm-badge tm-${s.k}">${i + 1}</span></th><td><b>${esc(s.name)}</b><br><small>${esc(s.desc)}</small></td><td>${esc(personName(r.p1)) || '<span class="muted">비어 있음</span>'}</td><td>${esc(personName(r.p2)) || '<span class="muted">비어 있음</span>'}</td></tr>`;
  }).join('');
  const { issues } = gapCheck(t);
  const rosterIss = issues.filter((x) => !x.day);
  return `<section class="card"><h2 class="h3">5자리 배치도</h2>
    <div class="tm-scroll">${teamMap(t)}</div><p class="tm-swipe small muted">그림을 옆으로 밀면 나머지 자리가 보입니다.</p>
    <p class="small muted">자리 번호는 움직이는 순서가 아니라 맡는 일입니다. 1·2자리는 학생 곁, 3·4자리는 다른 학생의 수업, 5자리는 연락과 기록을 맡습니다. 혼자 대응하지 않는 것이 원칙입니다(신체적 개입 과정 FIRST의 S 「혼자 하지 않는다」).</p>
  </section>
  ${rosterIss.length ? `<div class="alert warn" role="status"><span>${rosterIss.map((x) => esc(x.text)).join('<br>')}</span></div>` : ''}
  <section class="card"><h2 class="h3">자리별 담당 ${adm ? '<small class="muted">관리자만 고칠 수 있습니다</small>' : ''}</h2>
    <form id="team-roster-form" class="stack"><div class="tm-tbl-wrap"><table class="tm-tbl tm-roster"><thead><tr><th>자리</th><th>이름과 하는 일</th><th>1순위</th><th>2순위(대신할 사람)</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${adm ? '<div class="btns"><button type="submit" class="primary">명부 저장</button><button type="button" class="ghost" data-act="tm-slot-reset">자리 이름 처음으로</button></div>' : ''}</form>
  </section>
  ${adm ? extrasCard(t) : ''}`;
}

function extrasCard(t) {
  return `<section class="card"><h2 class="h3">앱 계정이 없는 지원 인력</h2>
    <p class="small">보건교사, 행정실 직원, 교육청 지원 인력처럼 IEP톡 계정이 없는 사람을 이름과 직책으로 넣어 자리에 배치할 수 있습니다. 실명 대신 직책만 적어도 됩니다.</p>
    <ul class="rows">${t.extras.map((x) => `<li><span class="grow"><b>${esc(x.name)}</b> <small class="muted">${esc(x.title || '')}</small></span><button type="button" class="link sm" data-act="tm-extra-del" data-id="${esc(x.id)}">빼기</button></li>`).join('') || '<li class="muted">아직 없습니다.</li>'}</ul>
    <form id="team-extra-form" class="row3"><label>이름(또는 직책)<input name="name" required placeholder="예: 보건교사"></label><label>직책<input name="title" placeholder="예: 보건실"></label><span class="btns"><button type="submit" class="ghost">더하기</button></span></form>
  </section>`;
}

function dutyTab() {
  const t = team(), adm = isAdmin();
  const day = DAYS.some(([d]) => d === S.ui.teamDay) ? S.ui.teamDay : (() => { const w = new Date().getDay(); return DAYS[w >= 1 && w <= 5 ? w - 1 : 0][0]; })();
  const { issues, empties } = gapCheck(t);
  const head = `<tr><th>교시</th>${t.slots.map((s, i) => `<th><span class="tm-badge tm-${s.k}">${i + 1}</span> ${esc(s.name)}</th>`).join('')}</tr>`;
  const body = t.periods.map((p) => {
    const cell = t.duty?.[day]?.[p.k] || {};
    return `<tr><th scope="row">${esc(p.label)}<small>${esc(p.start)}~${esc(p.end)}</small></th>${t.slots.map((s) => {
      const id = cell[s.k] || '';
      const bad = cellIssue(issues, day, p.k, s.k, id);
      return `<td class="${bad ? 'tm-bad' : ''}">${adm ? `<select data-change="tm-duty" data-day="${day}" data-p="${p.k}" data-slot="${s.k}" aria-label="${esc(p.label)} ${esc(s.name)}">${personOpts(id, '—')}</select>` : esc(personName(id)) || '<span class="muted">—</span>'}</td>`;
    }).join('')}</tr>`;
  }).join('');
  const dayIss = issues.filter((x) => x.day);
  return `<section class="card"><h2 class="h3">교시별 당번표</h2>
    <div class="tm-seg" role="group" aria-label="요일">${DAYS.map(([d, l]) => `<button type="button" class="${d === day ? 'on' : ''}" data-act="tm-day" data-day="${d}" aria-pressed="${d === day}">${l}</button>`).join('')}</div>
    <div class="tm-tbl-wrap"><table class="tm-tbl tm-duty"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    ${adm ? `<div class="btns"><button type="button" class="ghost" data-act="tm-duty-fill" data-day="${day}">이 요일을 1순위로 채우기</button><button type="button" class="ghost" data-act="tm-duty-fill" data-day="all">월~금 모두 1순위로 채우기</button><button type="button" class="ghost danger" data-act="tm-duty-clear" data-day="${day}">이 요일 비우기</button></div>` : ''}
    <p class="small muted">교시마다 그 시간에 수업이 없거나 바로 움직일 수 있는 사람을 넣습니다. 담임이 수업 중인 시간에는 그 담임을 3자리(수업 대체)에 넣지 않습니다.</p>
  </section>
  <section class="card"><h2 class="h3">공백 점검 <small class="muted">빈 칸 ${empties} · 확인할 것 ${issues.length}</small></h2>
    ${issues.length ? `<ul class="rows tm-issues">${[...issues.filter((x) => !x.day), ...dayIss.filter((x) => x.day === day), ...dayIss.filter((x) => x.day !== day)].slice(0, 40).map((x) => `<li class="${x.kind}"><span class="tag ${x.kind === 'dup' || x.kind === 'empty' ? 'warn' : ''}">${x.kind === 'dup' ? '겹침' : x.kind === 'soft' ? '대신할 사람' : '빈 자리'}</span><span class="grow">${esc(x.text)}</span></li>`).join('')}</ul>${issues.length > 40 ? `<p class="small muted">그 밖에 ${issues.length - 40}건</p>` : ''}`
    : '<p class="ok-t">모든 요일·교시의 다섯 자리가 채워져 있고 겹친 사람이 없습니다.</p>'}
  </section>`;
}

function logTab() {
  const who = S.ui.teamWho || '';
  const list = entries().filter((x) => !who || x.st.who === who);
  const noDeploy = S.incidents.filter((ic) => !(ic.deploy?.staff || []).some((s) => s.who)).sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, 8);
  const groups = {};
  list.forEach((x) => { (groups[x.ic.id] ||= { ic: x.ic, rows: [] }).rows.push(x); });
  const cards = Object.values(groups).map(({ ic, rows }) => `<li><span class="grow"><b>${esc(fmtDate(ic.date))} ${esc(ic.time || '')}</b> ${esc(student(ic.studentId)?.alias || '')} <small class="muted">${esc(ic.place || '')}${ic.deploy?.risk ? ' · ' + RISK_L[ic.deploy.risk] : ''}${ic.deploy?.called ? ' · 호출 ' + esc(ic.deploy.called) : ''}</small><br>
    <small>${rows.map(({ st }) => `${esc(slotName(st.slot))} ${esc(personName(st.who))} ${entryMin(st) == null ? '<span class="warn-t">시각 빠짐</span>' : entryMin(st) + '분'}${st.injury ? ' <span class="tag warn">부상</span>' : ''}`).join(' · ')}</small></span>
    <button type="button" class="sm ghost" data-act="ic-open" data-id="${ic.id}">열기</button></li>`).join('');
  return `<section class="card"><h2 class="h3">투입 기록</h2>
    <label class="small">사람<select data-change="tm-who"><option value="">전체</option>${people().map((p) => `<option value="${esc(p.id)}" ${p.id === who ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <ul class="rows">${cards || '<li class="muted">투입 기록이 없습니다.</li>'}</ul>
    <p class="small muted">투입 기록은 학생 화면 「위기행동」의 사후 기록 안 「지원팀 투입」 칸에 적습니다. 도착·종료 시각이 있어야 투입 시간이 계산됩니다.</p></section>
  ${noDeploy.length ? `<section class="card"><h2 class="h3">투입 인력을 아직 적지 않은 사후 기록</h2><ul class="rows">${noDeploy.map((ic) => `<li><span class="grow">${esc(fmtDate(ic.date))} ${esc(ic.time || '')} ${esc(student(ic.studentId)?.alias || '')}</span><button type="button" class="sm primary" data-act="ic-open" data-id="${ic.id}">투입 인력 적기</button></li>`).join('')}</ul></section>` : ''}`;
}

const monthNow = () => todayStr().slice(0, 7);
function payRows(month) {
  const r = team().rates;
  const list = entries(`${month}-01`, `${month}-31`);
  const by = {};
  list.forEach(({ ic, st }) => { const p = entryPay(st, ic, r); const o = (by[st.who] ||= { who: st.who, n: 0, min: 0, inj: 0, total: 0, miss: 0 }); o.n++; o.min += entryMin(st) || 0; o.miss += entryMin(st) == null ? 1 : 0; o.inj += st.injury ? 1 : 0; o.total += p.total; });
  return { list, by: Object.values(by).sort((a, b) => b.total - a.total || b.n - a.n) };
}
function payTab() {
  const t = team(), r = t.rates;
  const month = S.ui.teamMonth || monthNow();
  const { by } = payRows(month);
  const noRate = !Object.values(r.base || {}).some((v) => Number(v)) && !Number(r.per30);
  return `<section class="card"><h2 class="h3">단가 정하기 <small class="muted">관리자</small></h2>
    <form id="team-rate-form" class="stack">
      <div class="tm-rate">${t.slots.map((s, i) => `<label><span class="tm-badge tm-${s.k}">${i + 1}</span> ${esc(s.name)} 1회<input type="number" min="0" step="100" name="base-${s.k}" value="${esc(r.base?.[s.k] ?? '')}" placeholder="원"></label>`).join('')}</div>
      <div class="row3"><label>투입 30분마다 더함(원)<input type="number" min="0" step="100" name="per30" value="${esc(r.per30 || '')}"></label>
      <label>고위험 가산(%)<input type="number" min="0" max="300" name="high" value="${esc(r.high || '')}"></label>
      <label>치명적 위험 가산(%)<input type="number" min="0" max="300" name="crit" value="${esc(r.crit || '')}"></label></div>
      <div class="row2"><label>부상 시 더함(원)<input type="number" min="0" step="100" name="injury" value="${esc(r.injury || '')}"></label>
      <label>근거 규정(학교·교육청 기준 이름)<input name="note" value="${esc(r.note || '')}" placeholder="예: OO교육청 위기행동 대응 지원 기준(확인 필요)"></label></div>
      <button type="submit" class="primary">단가 저장</button>
    </form>
    <p class="small muted">계산: (자리 1회 단가 + 30분마다 단가 × 올림한 30분 수) × (1 + 위험 가산%) + 부상 시 더함. 단가와 근거 규정은 학교가 정합니다. IEP톡은 정해진 값으로 계산만 하며, 실제 지급 여부와 금액은 학교·교육청 규정을 따릅니다.</p>
  </section>
  <section class="card"><h2 class="h3">월별 합계</h2>
    <div class="bar"><label class="small">달<input type="month" data-change="tm-month" value="${esc(month)}"></label><span class="grow"></span><button type="button" class="ghost" data-act="tm-csv" data-month="${esc(month)}">CSV 내려받기</button></div>
    ${noRate ? '<p class="alert warn">단가가 비어 있어 금액은 0원으로 나옵니다. 횟수와 시간은 그대로 셉니다.</p>' : ''}
    <div class="tm-tbl-wrap"><table class="tm-tbl"><thead><tr><th>사람</th><th>횟수</th><th>투입 시간</th><th>부상</th><th>금액</th><th></th></tr></thead><tbody>
    ${by.map((o) => `<tr><th scope="row">${esc(personName(o.who))}</th><td>${o.n}</td><td>${o.min}분${o.miss ? ` <small class="warn-t">시각 빠짐 ${o.miss}</small>` : ''}</td><td>${o.inj || '-'}</td><td><b>${won(o.total)}</b></td><td><button type="button" class="sm ghost" data-act="tm-cert" data-who="${esc(o.who)}" data-month="${esc(month)}">확인서 인쇄</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">이 달 투입 기록이 없습니다.</td></tr>'}
    </tbody></table></div></section>`;
}

function certHtml(who, month) {
  const t = team(), r = t.rates;
  const list = entries(`${month}-01`, `${month}-31`).filter((x) => x.st.who === who).reverse();
  let sum = 0, min = 0;
  const rows = list.map(({ ic, st }) => { const p = entryPay(st, ic, r); sum += p.total; min += entryMin(st) || 0; return `<tr><td>${esc(fmtDate(ic.date))} ${esc(ic.time || '')}</td><td>${esc(student(ic.studentId)?.alias || '')}</td><td>${esc(slotName(st.slot))}</td><td>${esc(st.arrive || '')}~${esc(st.end || '')} (${entryMin(st) ?? '-'}분)</td><td>${esc(RISK_L[ic.deploy?.risk || ''] === '선택' ? '' : RISK_L[ic.deploy?.risk || ''] || '')}</td><td>${st.injury ? '있음' : '없음'}</td><td>${ic.pir ? '있음' : '-'}</td><td>${won(p.total)}</td></tr>`; }).join('');
  const [y, m] = month.split('-');
  return `<h1>위기행동 지원 인력 투입 확인서</h1>
    <p>${esc(S.school?.name || '')} · ${y}년 ${Number(m)}월 · 성명 ${esc(personName(who))}${member(who)?.title ? ` (${esc(member(who).title)})` : ''}</p>
    <table class="pf"><thead><tr><th>일시</th><th>학생(가명)</th><th>자리</th><th>투입 시각(시간)</th><th>위험 수준</th><th>부상</th><th>사후 보고서</th><th>금액</th></tr></thead><tbody>${rows || '<tr><td colspan="8">투입 기록 없음</td></tr>'}</tbody>
    <tfoot><tr><th colspan="3">합계 ${list.length}회</th><th>${min}분</th><th colspan="3"></th><th>${won(sum)}</th></tr></tfoot></table>
    <p class="print-note">계산 기준: 자리 1회 단가, 30분마다 ${won(r.per30)}, 고위험 +${Number(r.high) || 0}%, 치명적 위험 +${Number(r.crit) || 0}%, 부상 시 +${won(r.injury)}. 근거 규정: ${esc(r.note || '학교가 정한 기준(확인 필요)')}.</p>
    <p class="print-note">위 내용은 위기행동 사후 기록의 「지원팀 투입」 칸에 기록된 사실을 모은 것입니다. 학생 이름은 가명으로 적습니다.</p>
    <table class="pf sign"><tr><th>본인 확인</th><td></td><th>작성(관리자)</th><td></td><th>학교장</th><td></td></tr></table>`;
}

function careTab() {
  const list = entries();
  const open = (x) => !x.st.debrief || !x.st.state || x.st.state === 'rest' || x.st.state === 'talk' || (x.st.injury && CARE.some(([k]) => !x.st.care?.[k]));
  const todo = list.filter(open), done = list.filter((x) => !open(x)).slice(0, 10);
  const row = ({ ic, st, i }) => `<li class="tm-care"><div class="grow"><b>${esc(personName(st.who))}</b> <small class="muted">${esc(fmtDate(ic.date))} ${esc(ic.time || '')} · ${esc(student(ic.studentId)?.alias || '')} · ${esc(slotName(st.slot))}</small>${st.injury ? ` <span class="tag warn">부상${st.injuryNote ? ': ' + esc(st.injuryNote) : ''}</span>` : ''}
      <div class="tm-care-row"><label class="small">상태<select data-change="tm-care" data-id="${ic.id}" data-i="${i}" data-f="state">${STATES.map(([v, l]) => `<option value="${v}" ${(st.state || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="chk small"><input type="checkbox" data-change="tm-care" data-id="${ic.id}" data-i="${i}" data-f="debrief" ${st.debrief ? 'checked' : ''}> 디브리핑(돌아보기) 참석</label></div>
      ${st.injury ? `<div class="chk-list">${CARE.map(([k, l]) => `<label class="chk small"><input type="checkbox" data-change="tm-care" data-id="${ic.id}" data-i="${i}" data-f="care.${k}" ${st.care?.[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>` : ''}</div></li>`;
  return `<section class="card"><h2 class="h3">확인이 남은 사람 ${todo.length}</h2>
    <ul class="rows">${todo.map(row).join('') || '<li class="muted">확인이 남은 사람이 없습니다.</li>'}</ul>
    <p class="small muted">투입한 사람도 다칠 수 있고 마음이 흔들릴 수 있습니다. 상태 확인과 돌아보기(정·황·분·석·약·속)는 학생 회복 대화와 따로, 교직원끼리 합니다. 부상 시 절차는 신분(교원, 교육공무직, 사회복무요원)과 교육청 기준에 따라 다르므로 담당 부서에 확인하세요.</p></section>
  ${done.length ? `<section class="card"><h2 class="h3">확인을 마친 최근 기록</h2><ul class="rows">${done.map(row).join('')}</ul></section>` : ''}`;
}

function semRange(k) {
  const sc = S.school || {}, y = new Date().getFullYear();
  if (k === 'sem1') return [sc.sem1Start || `${y}-03-01`, sc.sem1End || `${y}-07-31`, '1학기'];
  if (k === 'sem2') return [sc.sem2Start || `${y}-08-01`, sc.sem2End || `${y}-12-31`, '2학기'];
  return [sc.yearStart || `${y}-03-01`, sc.sem2End || `${y}-12-31`, '올해 전체'];
}
export function reportData(k) {
  const [from, to, label] = semRange(k);
  const list = entries(from, to);
  const ics = [...new Set(list.map((x) => x.ic))];
  const t = team();
  const bySlot = Object.fromEntries(t.slots.map((s) => [s.k, 0]));
  list.forEach(({ st }) => { bySlot[st.slot] = (bySlot[st.slot] || 0) + 1; });
  const months = {};
  for (let d = parseDate(from); todayStr(d) <= to; d.setMonth(d.getMonth() + 1, 1)) months[todayStr(d).slice(0, 7)] = 0;
  ics.forEach((ic) => { const m = ic.date.slice(0, 7); if (m in months) months[m]++; });
  const risk = {}; ics.forEach((ic) => { const r = ic.deploy?.risk || ''; risk[r] = (risk[r] || 0) + 1; });
  const resp = ics.map((ic) => { const c = toMin(ic.deploy?.called); const a = (ic.deploy?.staff || []).map((s) => toMin(s.arrive)).filter((v) => v != null); return c == null || !a.length ? null : Math.max(0, Math.max(...a) - c); }).filter((v) => v != null);
  const min = list.reduce((a, x) => a + (entryMin(x.st) || 0), 0);
  const inj = list.filter((x) => x.st.injury).length;
  const deb = list.filter((x) => x.st.debrief).length;
  const pay = list.reduce((a, x) => a + entryPay(x.st, x.ic).total, 0);
  const people = new Set(list.map((x) => x.st.who)).size;
  return { from, to, label, n: ics.length, staff: list.length, people, min, inj, deb, resp: resp.length ? Math.round(resp.reduce((a, b) => a + b, 0) / resp.length) : null, bySlot, months, risk, pay };
}
function reportHtml(k, { print = false } = {}) {
  const d = reportData(k), t = team();
  const mx = Math.max(1, ...Object.values(d.months));
  const ms = Object.entries(d.months);
  const bw = Math.max(18, Math.min(56, Math.floor(560 / Math.max(1, ms.length)) - 10));
  const bars = `<svg class="tm-bars" viewBox="0 0 ${ms.length * (bw + 10) + 20} 150" role="img" aria-label="월별 투입 건수 ${ms.map(([m, n]) => `${Number(m.slice(5))}월 ${n}건`).join(', ')}">${ms.map(([m, n], i) => { const h = Math.round((n / mx) * 100); const x = 10 + i * (bw + 10); return `<rect x="${x}" y="${118 - h}" width="${bw}" height="${h}" rx="4"/><text x="${x + bw / 2}" y="${112 - h}" text-anchor="middle">${n || ''}</text><text x="${x + bw / 2}" y="138" text-anchor="middle">${Number(m.slice(5))}월</text>`; }).join('')}<line x1="6" y1="118" x2="${ms.length * (bw + 10) + 14}" y2="118"/></svg>`;
  const tile = (v, l) => `<div class="tm-tile"><b>${v}</b><span>${l}</span></div>`;
  return `${print ? `<h1>위기행동 지원팀 운영 보고 (${esc(d.label)})</h1><p>${esc(S.school?.name || '')} · ${esc(fmtDate(d.from))}~${esc(fmtDate(d.to))}</p>` : ''}
    <div class="tm-tiles">${tile(d.n + '건', '지원팀이 투입된 사건')}${tile(d.staff + '명', '연인원')}${tile(d.people + '명', '참여한 사람')}${tile(d.min + '분', '투입 시간 합계')}${tile(d.resp == null ? '-' : d.resp + '분', '호출부터 모두 도착까지(평균)')}${tile(d.inj + '건', '교직원 부상')}${tile(d.staff ? Math.round((d.deb / d.staff) * 100) + '%' : '-', '돌아보기 참석')}${isAdmin() ? tile(won(d.pay), '보상 근거 금액 합계') : ''}</div>
    <h3 class="h4">월별 투입 건수</h3>${bars}
    <div class="row2"><div><h3 class="h4">자리별 투입 연인원</h3><table class="tm-tbl"><tbody>${t.slots.map((s, i) => `<tr><th scope="row"><span class="tm-badge tm-${s.k}">${i + 1}</span> ${esc(s.name)}</th><td>${d.bySlot[s.k] || 0}명</td></tr>`).join('')}</tbody></table></div>
    <div><h3 class="h4">위험 수준</h3><table class="tm-tbl"><tbody>${RISKS.map(([v, l]) => `<tr><th scope="row">${v ? l : '적지 않음'}</th><td>${d.risk[v] || 0}건</td></tr>`).join('')}</tbody></table></div></div>
    <p class="small muted">위기행동 사후 기록의 「지원팀 투입」 칸을 모은 값입니다. 학생 이름은 가명만 씁니다. 학교 위기대응팀 운영 실적 보고와 다음 학기 배치 조정에 씁니다.</p>`;
}
function reportTab() {
  const k = ['sem1', 'sem2', 'year'].includes(S.ui.teamSem) ? S.ui.teamSem : (todayStr() >= (S.school?.sem2Start || '9999') ? 'sem2' : 'sem1');
  return `<section class="card"><div class="bar"><div class="tm-seg" role="group" aria-label="기간">${[['sem1', '1학기'], ['sem2', '2학기'], ['year', '올해 전체']].map(([v, l]) => `<button type="button" class="${v === k ? 'on' : ''}" data-act="tm-sem" data-v="${v}" aria-pressed="${v === k}">${l}</button>`).join('')}</div><span class="grow"></span><button type="button" class="ghost" data-act="tm-report-print" data-v="${k}">한 장 인쇄</button></div>
    ${reportHtml(k)}</section>`;
}

/* ---------- 사후 기록 안 「지원팀 투입」 칸 ---------- */
export function deployFieldset(ic) {
  const t = team(), dp = ic.deploy || {};
  const st = (k) => (dp.staff || []).find((x) => x.slot === k) || {};
  return `<fieldset class="tm-deploy"><legend>지원팀 투입 <small class="muted">보상·회복 지원의 근거가 됩니다</small></legend>
    <div class="row3"><label>지원팀을 부른 시각<input type="time" name="dpCalled" value="${esc(dp.called || '')}"></label>
    <label>위험 수준<select name="dpRisk">${RISKS.map(([v, l]) => `<option value="${v}" ${(dp.risk || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <span class="btns"><button type="button" class="ghost sm" data-dp-fill>당번표로 채우기</button></span></div>
    <div class="tm-tbl-wrap"><table class="tm-tbl tm-dp"><thead><tr><th>자리</th><th>투입한 사람</th><th>도착</th><th>끝</th><th>부상</th></tr></thead><tbody>
    ${t.slots.map((s, i) => { const x = st(s.k); return `<tr><th scope="row"><span class="tm-badge tm-${s.k}">${i + 1}</span> ${esc(s.name)}</th>
      <td><select name="dpWho-${s.k}" aria-label="${esc(s.name)} 투입한 사람">${personOpts(x.who || '', '투입 없음')}</select></td>
      <td><input type="time" name="dpArr-${s.k}" value="${esc(x.arrive || '')}" aria-label="${esc(s.name)} 도착 시각"></td>
      <td><input type="time" name="dpEnd-${s.k}" value="${esc(x.end || '')}" aria-label="${esc(s.name)} 끝난 시각"></td>
      <td><label class="chk small"><input type="checkbox" name="dpInj-${s.k}" ${x.injury ? 'checked' : ''}> 있음</label><input name="dpInjN-${s.k}" value="${esc(x.injuryNote || '')}" placeholder="부위·내용" aria-label="${esc(s.name)} 부상 내용"></td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="small muted">투입 인력의 상태 확인과 돌아보기 참석은 「지원팀 → 교직원 회복」에서 적습니다.</p></fieldset>`;
}
export function deployFromForm(fd, prev = {}) {
  const old = prev.deploy?.staff || [];
  const staff = team().slots.map((s) => {
    const o = old.find((x) => x.slot === s.k) || {};
    return { ...o, slot: s.k, who: fd.get(`dpWho-${s.k}`) || '', arrive: fd.get(`dpArr-${s.k}`) || '', end: fd.get(`dpEnd-${s.k}`) || '', injury: fd.get(`dpInj-${s.k}`) === 'on', injuryNote: fd.get(`dpInjN-${s.k}`) || '' };
  });
  return { called: fd.get('dpCalled') || '', risk: fd.get('dpRisk') || '', staff };
}
export function periodOf(date, hm) {
  const m = toMin(hm); if (m == null) return null;
  const ps = team().periods;
  return ps.find((p) => m >= toMin(p.start) && m < toMin(p.end)) || ps.find((p) => m < toMin(p.start)) || ps[ps.length - 1];
}
export function fillDeploy(root) {
  const f = root.querySelector('form'); if (!f) return;
  const date = f.date?.value || todayStr(), time = f.time?.value || '';
  const w = parseDate(date).getDay();
  if (w < 1 || w > 5) return toast('주말에는 당번표가 없습니다');
  const p = periodOf(date, time);
  if (!p) return toast('시각을 먼저 적어 주세요');
  const cell = team().duty?.[DAYS[w - 1][0]]?.[p.k] || {};
  let n = 0;
  team().slots.forEach((s) => { const sel = f.querySelector(`[name="dpWho-${s.k}"]`); const id = cell[s.k] || team().roster[s.k]?.p1 || ''; if (sel && id && !sel.value) { sel.value = id; n++; } });
  if (f.dpCalled && !f.dpCalled.value) f.dpCalled.value = time;
  toast(n ? `${DAYS[w - 1][1]}요일 ${p.label} 당번 ${n}명을 넣었습니다` : '채울 빈 칸이 없습니다');
}

/* ---------- 예시(시연) ---------- */
export function demoTeam(u) {
  const ex = [{ id: 'x-nurse', name: '보건교사', title: '보건실' }, { id: 'x-sub', name: '교무 지원 교사', title: '교무실' }];
  const roster = { s1: { p1: u.cm, p2: u.t3 }, s2: { p1: u.a1, p2: u.a2 }, s3: { p1: u.t3, p2: 'x-sub' }, s4: { p1: u.a2, p2: u.a1 }, s5: { p1: u.t4, p2: 'x-nurse' } };
  const duty = {};
  DAYS.forEach(([d], di) => { duty[d] = {}; DEFAULT_TEAM_PERIODS.forEach((p, pi) => {
    const c = { s1: roster.s1.p1, s2: roster.s2.p1, s3: roster.s3.p1, s4: roster.s4.p1, s5: roster.s5.p1 };
    if ((di + pi) % 3 === 1) { c.s3 = 'x-sub'; }
    if (p.k === 'lunch') { c.s4 = roster.s4.p2; }
    duty[d][p.k] = c;
  }); });
  duty.wed.p3.s3 = u.cm; // 겹침 예시(소통자와 수업 대체에 같은 사람)
  duty.fri.p6.s3 = ''; // 빈 자리 예시
  return { slots: DEFAULT_SLOTS, roster, extras: ex, periods: DEFAULT_TEAM_PERIODS, duty, rates: { base: { s1: 30000, s2: 30000, s3: 20000, s4: 15000, s5: 15000 }, per30: 10000, high: 20, crit: 50, injury: 50000, note: '시연용 가상 단가(실제 기준 아님)' } };
}

/* ---------- 동작 ---------- */
on('tm-day', (el) => { S.ui.teamDay = el.dataset.day; rerender(); });
on('tm-sem', (el) => { S.ui.teamSem = el.dataset.v; rerender(); });
on('tm-who', (el) => { S.ui.teamWho = el.value; rerender(); });
on('tm-month', (el) => { S.ui.teamMonth = el.value || monthNow(); rerender(); });
on('tm-duty', async (el) => {
  const t = team(); const duty = structuredClone(t.duty || {});
  ((duty[el.dataset.day] ||= {})[el.dataset.p] ||= {})[el.dataset.slot] = el.value;
  await saveTeam({ duty });
});
on('tm-duty-fill', async (el) => {
  const t = team(); const duty = structuredClone(t.duty || {});
  const days = el.dataset.day === 'all' ? DAYS.map(([d]) => d) : [el.dataset.day];
  days.forEach((d) => { duty[d] ||= {}; t.periods.forEach((p) => { const c = (duty[d][p.k] ||= {}); t.slots.forEach((s) => { c[s.k] = t.roster[s.k]?.p1 || c[s.k] || ''; }); }); });
  await saveTeam({ duty }); toast('1순위로 채웠습니다');
});
on('tm-duty-clear', async (el) => {
  const t = team(); const duty = structuredClone(t.duty || {});
  duty[el.dataset.day] = Object.fromEntries(t.periods.map((p) => [p.k, Object.fromEntries(t.slots.map((s) => [s.k, '']))]));
  await saveTeam({ duty }); toast('이 요일 당번을 비웠습니다');
});
on('tm-slot-reset', async () => { await saveTeam({ slots: DEFAULT_SLOTS }); toast('자리 이름을 처음으로 되돌렸습니다'); });
on('tm-extra-del', async (el) => { await saveTeam({ extras: team().extras.filter((x) => x.id !== el.dataset.id) }); toast('뺐습니다'); });
on('tm-care', async (el) => {
  const ic = S.incidents.find((x) => x.id === el.dataset.id); if (!ic) return;
  const deploy = structuredClone(ic.deploy || {}); const st = deploy.staff?.[Number(el.dataset.i)]; if (!st) return;
  const f = el.dataset.f, v = el.type === 'checkbox' ? el.checked : el.value;
  if (f.startsWith('care.')) (st.care ||= {})[f.slice(5)] = v; else st[f] = v;
  st.careBy = S.me.uid; st.careAt = Date.now();
  await S.store.update('incidents', {}, ic.id, { deploy }); toast('저장했습니다');
});
on('tm-csv', (el) => {
  const month = el.dataset.month, r = team().rates;
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['날짜', '시각', '학생(가명)', '자리', '사람', '도착', '끝', '분', '위험 수준', '부상', '부상 내용', '자리 단가', '시간 단가', '가산%', '부상 더함', '금액'].map(q).join(',')];
  entries(`${month}-01`, `${month}-31`).reverse().forEach(({ ic, st }) => { const p = entryPay(st, ic, r); lines.push([ic.date, ic.time, student(ic.studentId)?.alias || '', slotName(st.slot), personName(st.who), st.arrive, st.end, entryMin(st) ?? '', RISK_L[ic.deploy?.risk || ''] === '선택' ? '' : RISK_L[ic.deploy?.risk || ''], st.injury ? '있음' : '없음', st.injuryNote || '', p.base, p.time, p.pct, p.inj, p.total].map(q).join(',')); });
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `지원팀_투입_${month}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
});
function printHtml(html) {
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = html;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); setTimeout(() => window.print(), 50);
}
on('tm-cert', (el) => printHtml(certHtml(el.dataset.who, el.dataset.month)));
on('tm-report-print', (el) => printHtml(reportHtml(el.dataset.v, { print: true })));

document.addEventListener('submit', async (e) => {
  if (e.target.id === 'team-roster-form') {
    e.preventDefault(); if (!isAdmin()) return;
    const fd = new FormData(e.target), t = team();
    const slots = t.slots.map((s) => ({ k: s.k, name: String(fd.get(`name-${s.k}`) || s.name).trim() || s.name, desc: String(fd.get(`desc-${s.k}`) || '').trim() }));
    const roster = Object.fromEntries(t.slots.map((s) => [s.k, { p1: fd.get(`p1-${s.k}`) || '', p2: fd.get(`p2-${s.k}`) || '' }]));
    await saveTeam({ slots, roster }); toast('지원팀 명부를 저장했습니다');
  }
  if (e.target.id === 'team-extra-form') {
    e.preventDefault(); if (!isAdmin()) return;
    const fd = new FormData(e.target);
    const x = { id: 'x-' + Date.now().toString(36), name: String(fd.get('name')).trim(), title: String(fd.get('title') || '').trim() };
    if (!x.name) return;
    await saveTeam({ extras: [...team().extras, x] }); e.target.reset(); toast(`${x.name}을(를) 더했습니다`);
  }
  if (e.target.id === 'team-rate-form') {
    e.preventDefault(); if (!isAdmin()) return;
    const fd = new FormData(e.target), num = (k) => Math.max(0, Number(fd.get(k)) || 0);
    const rates = { base: Object.fromEntries(team().slots.map((s) => [s.k, num(`base-${s.k}`)])), per30: num('per30'), high: num('high'), crit: num('crit'), injury: num('injury'), note: String(fd.get('note') || '').trim() };
    await saveTeam({ rates }); toast('단가를 저장했습니다');
  }
});
