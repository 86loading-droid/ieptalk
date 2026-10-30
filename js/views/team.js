// 지원팀: 위기행동 대응 전담 인력 5자리 배치도, 교시별 당번표와 공백 점검, 연수 이수 현황, 긴급 호출, 투입 기록, 보상·인사평가 근거, 교직원 회복 지원, 학기·연간 보고.
// 보상(교수님 확정 2026-10-31): 3자리 수업 대체는 수업 결보강비(보강 시수 × 단가), 행동지원 자리는 투입 횟수를 세어 기준 이상이면 성과급 연동·인사평가 근거로 쓴다. 보조인력은 보상·인사평가에서 제외한다.
// 5자리 이름은 교수님 확정(2026-10-30): 1 소통자, 2 지원대피 담당, 3 수업 대체, 4 수업지원, 5 연락 및 기록. 관리자가 이름과 설명을 고칠 수 있다.
// 저장: 명부·당번표·단가는 학교 설정 문서(supportTeam, 관리자만 씀), 투입 기록은 위기행동 사후 기록(incidents)의 deploy 칸(교사가 씀). 보안 규칙 변경 없음.
import { esc, todayStr, timeStr, fmtDate, parseDate, toast, openModal, closeModal } from '../util.js';
import { S, on, rerender, go, isAdmin, teachers, aides, member, student } from '../state.js';
import { sendAlert } from './alerts.js';

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

export const BONUS_SLOTS = ['s1', 's2', 's4', 's5'];
export const LEVELS = [['', '미이수'], ['초급', '초급'], ['중급', '중급'], ['고급', '고급']];
const NEAR = ['s1', 's2']; // 학생 곁 자리: 연수 이수자만 권장

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
    training: t.training || {},
    rates: { kyulbo: 0, bonusN: 0, bonusSlots: BONUS_SLOTS, note: '', ...(t.rates || {}) }
  };
}
const saveTeam = (patch) => S.store.saveSchool({ supportTeam: { ...(S.school?.supportTeam || {}), ...patch } });
export const slotName = (k) => team().slots.find((s) => s.k === k)?.name || k;
export function people() {
  const ms = [...teachers(), ...aides()].map((m) => ({ id: m.id, name: m.name, title: m.title || '' }));
  return [...ms, ...team().extras.map((x) => ({ id: x.id, name: x.name, title: x.title || '' }))];
}
// 보조인력: 계정 역할이 보조인력이거나, 계정 없는 인력 중 「보조인력」으로 넣은 사람. 보상·인사평가에서 제외한다.
export const isAidePerson = (id) => member(id)?.role === 'aide' || team().extras.find((x) => x.id === id)?.kind === 'aide';
export const trainOf = (id) => team().training?.[id] || {};
const trained = (id) => !!trainOf(id).level;
export const personName = (id) => (id ? member(id)?.name || team().extras.find((x) => x.id === id)?.name || '(지운 사람)' : '');
const personOpts = (sel, empty = '비어 있음') => `<option value="">${empty}</option>${people().map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}${p.title ? ' · ' + esc(p.title) : ''}</option>`).join('')}`;
const won = (n) => `${Math.round(n || 0).toLocaleString('ko-KR')}원`;
const toMin = (hm) => { const [h, m] = String(hm || '').split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };

/* ---------- 투입 기록 계산 ---------- */
export function entryMin(st) { const a = toMin(st.arrive), b = toMin(st.end); return a == null || b == null ? null : Math.max(0, b - a); }
// 수업 결보강 시수: 따로 적은 값이 있으면 그 값, 없으면 도착~끝과 겹치는 교시 수(점심 제외)
export function coverHours(st, periods = team().periods) {
  if (st.hours !== '' && st.hours != null && Number.isFinite(Number(st.hours))) return Number(st.hours);
  const a = toMin(st.arrive), b = toMin(st.end);
  if (a == null || b == null || b <= a) return 0;
  return periods.filter((p) => p.k !== 'lunch' && toMin(p.start) < b && toMin(p.end) > a).length;
}
// 구분: kyulbo(수업 결보강비) / count(행동지원 횟수) / none(보조인력 등 제외)
export function entryPay(st, ic, r = team().rates) {
  if (isAidePerson(st.who)) return { kind: 'none', hours: 0, total: 0 };
  if (st.slot === 's3') { const hours = coverHours(st); return { kind: 'kyulbo', hours, total: hours * (Number(r.kyulbo) || 0) }; }
  if ((r.bonusSlots || BONUS_SLOTS).includes(st.slot)) return { kind: 'count', hours: 0, total: 0, high: ['high', 'crit'].includes(ic.deploy?.risk) };
  return { kind: 'none', hours: 0, total: 0 };
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
  // 연수 이수: 학생 곁 자리(1·2자리)에 미이수자
  const nearBad = {};
  NEAR.forEach((k) => { ['p1', 'p2'].forEach((q) => { const id = t.roster[k]?.[q]; if (id && !t.training?.[id]?.level) (nearBad[id] ||= new Set()).add(`${t.slots.find((s) => s.k === k).name} ${q === 'p1' ? '1' : '2'}순위`); }); });
  DAYS.forEach(([d]) => t.periods.forEach((p) => NEAR.forEach((k) => { const id = t.duty?.[d]?.[p.k]?.[k]; if (id && !t.training?.[id]?.level) (nearBad[id] ||= new Set()).add(`${t.slots.find((s) => s.k === k).name} 당번`); })));
  Object.entries(nearBad).forEach(([id, set]) => issues.push({ kind: 'train', who: id, text: `${personName(id)}: 신체적 개입 연수 미이수인데 ${[...set].join(', ')}에 들어가 있습니다.` }));
  return { issues, empties };
}
const cellIssue = (issues, d, p, k, id) => issues.some((x) => (x.day === d && x.p === p && ((x.kind === 'dup' && x.who === id && id) || (x.kind === 'gap' && !id))) || (x.kind === 'train' && id && x.who === id && NEAR.includes(k)));

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
      <text class="tm-p1" x="12" y="40">${esc(p1 || '비어 있음')}${!who && r.p1 && NEAR.includes(s.k) && !trained(r.p1) ? ' (연수 미이수)' : ''}</text>${p2 ? `<text class="tm-p2" x="12" y="54">2순위 ${esc(p2)}</text>` : ''}</g>`;
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
const TABS = [['map', '5자리 배치도'], ['duty', '당번표·공백 점검'], ['train', '연수 이수'], ['log', '투입 기록'], ['pay', '보상·인사평가 근거'], ['care', '교직원 회복'], ['report', '학기·연간 보고']];
export function render(route) {
  const tab = TABS.some(([k]) => k === route.args[0]) ? route.args[0] : 'map';
  const tabs = TABS.filter(([k]) => k !== 'pay' || isAdmin());
  const body = tab === 'duty' ? dutyTab() : tab === 'train' ? trainTab() : tab === 'log' ? logTab() : tab === 'pay' ? (isAdmin() ? payTab() : '<p class="muted">관리자만 볼 수 있습니다.</p>') : tab === 'care' ? careTab() : tab === 'report' ? reportTab() : mapTab();
  return `<div class="page-head tm-head"><div><h1>지원팀</h1><p class="muted">위기행동이 일어났을 때 함께 움직이는 전담 인력을 다섯 자리로 나누어 미리 정하고, 실제 투입을 기록해 보상·인사평가와 회복 지원의 근거로 씁니다.</p></div>
    <button type="button" class="tm-sos" data-act="tm-sos">지원팀 긴급 호출</button></div>${soundCard()}
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
  const rosterIss = issues.filter((x) => !x.day && x.kind !== 'train');
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
    <ul class="rows">${t.extras.map((x) => `<li><span class="grow"><b>${esc(x.name)}</b> <small class="muted">${esc(x.title || '')}${x.kind === 'aide' ? ' · 보조인력' : ''}</small></span><button type="button" class="link sm" data-act="tm-extra-del" data-id="${esc(x.id)}">빼기</button></li>`).join('') || '<li class="muted">아직 없습니다.</li>'}</ul>
    <form id="team-extra-form" class="row3"><label>이름(또는 직책)<input name="name" required placeholder="예: 보건교사"></label><label>직책<input name="title" placeholder="예: 보건실"></label><label>구분<select name="kind"><option value="">교원·교직원</option><option value="aide">보조인력(보상·인사평가 제외)</option></select></label><span class="btns"><button type="submit" class="ghost">더하기</button></span></form>
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
    ${issues.length ? `<ul class="rows tm-issues">${[...issues.filter((x) => !x.day && x.kind !== 'train'), ...issues.filter((x) => x.kind === 'train'), ...dayIss.filter((x) => x.day === day), ...dayIss.filter((x) => x.day !== day)].slice(0, 40).map((x) => `<li class="${x.kind}"><span class="tag ${x.kind === 'dup' || x.kind === 'empty' || x.kind === 'train' ? 'warn' : ''}">${x.kind === 'dup' ? '겹침' : x.kind === 'soft' ? '대신할 사람' : x.kind === 'train' ? '연수' : '빈 자리'}</span><span class="grow">${esc(x.text)}</span></li>`).join('')}</ul>${issues.length > 40 ? `<p class="small muted">그 밖에 ${issues.length - 40}건</p>` : ''}`
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
function semKeyNow() { return todayStr() >= (S.school?.sem2Start || '9999') ? 'sem2' : 'sem1'; }
// 수업 결보강비: 3자리(수업 대체) 투입, 보조인력 제외, 달 단위
function kyulboRows(month) {
  const r = team().rates, by = {};
  entries(`${month}-01`, `${month}-31`).forEach(({ ic, st }) => { const p = entryPay(st, ic, r); if (p.kind !== 'kyulbo') return; const o = (by[st.who] ||= { who: st.who, n: 0, hours: 0, total: 0 }); o.n++; o.hours += p.hours; o.total += p.total; });
  return Object.values(by).sort((a, b) => b.total - a.total || b.hours - a.hours);
}
// 행동지원 투입 횟수: 정한 자리, 보조인력 제외, 학기·학년 단위
export function evalRows(semKey) {
  const t = team(), r = t.rates, [from, to] = semRange(semKey), by = {};
  const n = Number(r.bonusN) || 0;
  entries(from, to).forEach(({ ic, st }) => { const p = entryPay(st, ic, r); if (p.kind !== 'count') return; const o = (by[st.who] ||= { who: st.who, n: 0, high: 0, slots: {}, min: 0 }); o.n++; o.high += p.high ? 1 : 0; o.slots[st.slot] = (o.slots[st.slot] || 0) + 1; o.min += entryMin(st) || 0; });
  return Object.values(by).map((o) => ({ ...o, reach: n > 0 && o.n >= n })).sort((a, b) => b.n - a.n);
}
function payTab() {
  const t = team(), r = t.rates;
  const month = S.ui.teamMonth || monthNow();
  const sem = ['sem1', 'sem2', 'year'].includes(S.ui.teamEvalSem) ? S.ui.teamEvalSem : semKeyNow();
  const ky = kyulboRows(month), ev = evalRows(sem);
  const aideN = new Set(entries().filter((x) => isAidePerson(x.st.who)).map((x) => x.st.who)).size;
  const slotChk = t.slots.filter((s) => s.k !== 's3').map((s) => `<label class="chk small"><input type="checkbox" name="bs-${s.k}" ${(r.bonusSlots || BONUS_SLOTS).includes(s.k) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('');
  return `<section class="card"><h2 class="h3">기준 정하기 <small class="muted">관리자</small></h2>
    <form id="team-rate-form" class="stack">
      <div class="row3"><label>수업 결보강비 1시간 단가(원)<input type="number" min="0" step="100" name="kyulbo" value="${esc(r.kyulbo || '')}" placeholder="학교 결보강 수당 기준"></label>
      <label>성과급 연동 기준(횟수 이상)<input type="number" min="0" max="200" name="bonusN" value="${esc(r.bonusN || '')}" placeholder="예: 5"></label>
      <label>근거 규정(학교·교육청 기준 이름)<input name="note" value="${esc(r.note || '')}" placeholder="예: 학교 성과상여금 지급 기준(확인 필요)"></label></div>
      <fieldset><legend class="small">횟수로 세는 행동지원 자리</legend><div class="chk-list">${slotChk}</div></fieldset>
      <button type="submit" class="primary">기준 저장</button>
    </form>
    <p class="small muted">3자리 수업 대체는 보강한 수업 시수 × 결보강 단가로 수업 결보강비를 계산합니다. 보강 시수는 도착~끝 시각과 겹치는 교시 수로 자동 계산하고, 사후 기록에서 직접 고칠 수 있습니다. 행동지원 자리는 금액 대신 투입 횟수를 세어, 기준 횟수 이상이면 「성과급 연동 대상」으로 표시해 인사평가(성과상여금 평가) 근거 자료로 씁니다. 보조인력(특수교육실무사·사회복무요원 등)은 결보강비와 인사평가 집계에서 제외합니다. 실제 지급과 평가 반영은 학교 규정과 다면평가 기준을 따릅니다.</p>
  </section>
  <section class="card"><h2 class="h3">수업 결보강비 <small class="muted">3자리 수업 대체</small></h2>
    <div class="bar"><label class="small">달<input type="month" data-change="tm-month" value="${esc(month)}"></label><span class="grow"></span><button type="button" class="ghost" data-act="tm-csv" data-month="${esc(month)}">CSV 내려받기</button></div>
    ${!Number(r.kyulbo) ? '<p class="alert warn">결보강 단가가 비어 있어 금액은 0원으로 나옵니다. 시수는 그대로 셉니다.</p>' : ''}
    <div class="tm-tbl-wrap"><table class="tm-tbl tm-ky"><thead><tr><th>사람</th><th>보강 횟수</th><th>보강 시수</th><th>결보강비</th><th></th></tr></thead><tbody>
    ${ky.map((o) => `<tr><th scope="row">${esc(personName(o.who))}</th><td>${o.n}</td><td>${o.hours}시간</td><td><b>${won(o.total)}</b></td><td><button type="button" class="sm ghost" data-act="tm-cert" data-kind="ky" data-who="${esc(o.who)}" data-month="${esc(month)}">결보강 확인서</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">이 달 수업 대체 기록이 없습니다.</td></tr>'}
    </tbody></table></div></section>
  <section class="card"><h2 class="h3">행동지원 투입 횟수 <small class="muted">성과급 연동·인사평가 근거</small></h2>
    <div class="tm-seg" role="group" aria-label="기간">${[['sem1', '1학기'], ['sem2', '2학기'], ['year', '학년 전체']].map(([v, l]) => `<button type="button" class="${v === sem ? 'on' : ''}" data-act="tm-eval-sem" data-v="${v}" aria-pressed="${v === sem}">${l}</button>`).join('')}</div>
    ${!Number(r.bonusN) ? '<p class="alert warn">성과급 연동 기준 횟수가 비어 있어 대상 표시가 나오지 않습니다.</p>' : ''}
    <div class="tm-tbl-wrap"><table class="tm-tbl tm-ev"><thead><tr><th>사람</th><th>투입 횟수</th><th>자리별</th><th>고위험 이상</th><th>연수</th><th>기준 ${Number(r.bonusN) || '-'}회</th><th></th></tr></thead><tbody>
    ${ev.map((o) => `<tr><th scope="row">${esc(personName(o.who))}</th><td><b>${o.n}회</b></td><td><small>${Object.entries(o.slots).map(([k, n]) => `${esc(slotName(k))} ${n}`).join(' · ')}</small></td><td>${o.high}회</td><td>${esc(trainOf(o.who).level || '미이수')}</td><td>${o.reach ? '<span class="tag ok">성과급 연동 대상</span>' : Number(r.bonusN) ? `<small class="muted">${Math.max(0, Number(r.bonusN) - o.n)}회 남음</small>` : '-'}</td><td><button type="button" class="sm ghost" data-act="tm-cert" data-kind="ev" data-who="${esc(o.who)}" data-sem="${sem}">실적 확인서</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">이 기간 행동지원 투입 기록이 없습니다.</td></tr>'}
    </tbody></table></div>
    ${aideN ? `<p class="small muted">보조인력 ${aideN}명의 투입은 기록에는 남지만 이 표와 결보강비에서 제외했습니다.</p>` : ''}</section>`;
}

function kyulboCert(who, month) {
  const r = team().rates;
  const list = entries(`${month}-01`, `${month}-31`).filter((x) => x.st.who === who && entryPay(x.st, x.ic, r).kind === 'kyulbo').reverse();
  let sum = 0, hrs = 0;
  const rows = list.map(({ ic, st }) => { const p = entryPay(st, ic, r); sum += p.total; hrs += p.hours; return `<tr><td>${esc(fmtDate(ic.date))}</td><td>${esc(st.arrive || '')}~${esc(st.end || '')}</td><td>${esc(ic.place || '')}</td><td>${p.hours}시간</td><td>${won(p.total)}</td></tr>`; }).join('');
  const [y, m] = month.split('-');
  return `<h1>수업 결보강 확인서(위기행동 대응)</h1>
    <p>${esc(S.school?.name || '')} · ${y}년 ${Number(m)}월 · 보강 교사 ${esc(personName(who))}${member(who)?.title ? ` (${esc(member(who).title)})` : ''}</p>
    <table class="pf"><thead><tr><th>날짜</th><th>보강 시각</th><th>장소(학급)</th><th>보강 시수</th><th>결보강비</th></tr></thead><tbody>${rows || '<tr><td colspan="5">기록 없음</td></tr>'}</tbody>
    <tfoot><tr><th colspan="3">합계 ${list.length}회</th><th>${hrs}시간</th><th>${won(sum)}</th></tr></tfoot></table>
    <p class="print-note">계산: 보강 시수 × 1시간 단가 ${won(r.kyulbo)}. 근거 규정: ${esc(r.note || '학교 결보강 수당 기준(확인 필요)')}. 위기행동 사후 기록의 「지원팀 투입」 3자리(수업 대체) 기록을 모은 것입니다.</p>
    <table class="pf sign"><tr><th>본인 확인</th><td></td><th>교무 담당</th><td></td><th>학교장</th><td></td></tr></table>`;
}
function evalCert(who, sem) {
  const r = team().rates, [from, to, label] = semRange(sem);
  const list = entries(from, to).filter((x) => x.st.who === who && entryPay(x.st, x.ic, r).kind === 'count').reverse();
  const n = list.length, th = Number(r.bonusN) || 0;
  const rows = list.map(({ ic, st }) => `<tr><td>${esc(fmtDate(ic.date))} ${esc(ic.time || '')}</td><td>${esc(student(ic.studentId)?.alias || '')}</td><td>${esc(slotName(st.slot))}</td><td>${esc(st.arrive || '')}~${esc(st.end || '')}</td><td>${esc(RISK_L[ic.deploy?.risk || ''] === '선택' ? '' : RISK_L[ic.deploy?.risk || ''] || '')}</td><td>${st.injury ? '있음' : '없음'}</td><td>${ic.pir ? '있음' : '-'}</td></tr>`).join('');
  return `<h1>위기행동 행동지원 투입 실적 확인서</h1>
    <p>${esc(S.school?.name || '')} · ${esc(label)}(${esc(fmtDate(from))}~${esc(fmtDate(to))}) · 성명 ${esc(personName(who))}${member(who)?.title ? ` (${esc(member(who).title)})` : ''} · 신체적 개입 연수 ${esc(trainOf(who).level || '미이수')}${trainOf(who).date ? `(${esc(fmtDate(trainOf(who).date))})` : ''}</p>
    <table class="pf"><thead><tr><th>일시</th><th>학생(가명)</th><th>자리</th><th>투입 시각</th><th>위험 수준</th><th>부상</th><th>사후 보고서</th></tr></thead><tbody>${rows || '<tr><td colspan="7">기록 없음</td></tr>'}</tbody></table>
    <p><b>투입 ${n}회</b>${th ? ` · 성과급 연동 기준 ${th}회 ${n >= th ? '이상(대상)' : '미만'}` : ''}</p>
    <p class="print-note">이 확인서는 성과상여금 평가와 인사평가에 쓰는 근거 자료입니다. 반영 여부와 배점은 학교 다면평가 기준을 따릅니다. 근거 규정: ${esc(r.note || '학교 기준(확인 필요)')}. 학생 이름은 가명으로 적습니다.</p>
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
  const reach = k === 'sem1' || k === 'sem2' || k === 'year' ? evalRows(k).filter((o) => o.reach).length : 0;
  const people = new Set(list.map((x) => x.st.who)).size;
  return { reach, from, to, label, n: ics.length, staff: list.length, people, min, inj, deb, resp: resp.length ? Math.round(resp.reduce((a, b) => a + b, 0) / resp.length) : null, bySlot, months, risk, pay };
}
function reportHtml(k, { print = false } = {}) {
  const d = reportData(k), t = team();
  const mx = Math.max(1, ...Object.values(d.months));
  const ms = Object.entries(d.months);
  const bw = Math.max(18, Math.min(56, Math.floor(560 / Math.max(1, ms.length)) - 10));
  const bars = `<svg class="tm-bars" viewBox="0 0 ${ms.length * (bw + 10) + 20} 150" role="img" aria-label="월별 투입 건수 ${ms.map(([m, n]) => `${Number(m.slice(5))}월 ${n}건`).join(', ')}">${ms.map(([m, n], i) => { const h = Math.round((n / mx) * 100); const x = 10 + i * (bw + 10); return `<rect x="${x}" y="${118 - h}" width="${bw}" height="${h}" rx="4"/><text x="${x + bw / 2}" y="${112 - h}" text-anchor="middle">${n || ''}</text><text x="${x + bw / 2}" y="138" text-anchor="middle">${Number(m.slice(5))}월</text>`; }).join('')}<line x1="6" y1="118" x2="${ms.length * (bw + 10) + 14}" y2="118"/></svg>`;
  const tile = (v, l) => `<div class="tm-tile"><b>${v}</b><span>${l}</span></div>`;
  return `${print ? `<h1>위기행동 지원팀 운영 보고 (${esc(d.label)})</h1><p>${esc(S.school?.name || '')} · ${esc(fmtDate(d.from))}~${esc(fmtDate(d.to))}</p>` : ''}
    <div class="tm-tiles">${tile(d.n + '건', '지원팀이 투입된 사건')}${tile(d.staff + '명', '연인원')}${tile(d.people + '명', '참여한 사람')}${tile(d.min + '분', '투입 시간 합계')}${tile(d.resp == null ? '-' : d.resp + '분', '호출부터 모두 도착까지(평균)')}${tile(d.inj + '건', '교직원 부상')}${tile(d.staff ? Math.round((d.deb / d.staff) * 100) + '%' : '-', '돌아보기 참석')}${isAdmin() ? tile(won(d.pay), '수업 결보강비 합계') + tile(d.reach + '명', '성과급 연동 기준 도달') : ''}</div>
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

function trainTab() {
  const adm = isAdmin(), t = team(), ps = people();
  const cnt = { '': 0, 초급: 0, 중급: 0, 고급: 0 }; ps.forEach((p) => { cnt[trainOf(p.id).level || ''] = (cnt[trainOf(p.id).level || ''] || 0) + 1; });
  const where = (id) => t.slots.filter((s) => t.roster[s.k]?.p1 === id || t.roster[s.k]?.p2 === id).map((s) => s.name).join(', ');
  const iss = gapCheck(t).issues.filter((x) => x.kind === 'train');
  return `<section class="card"><h2 class="h3">신체적 개입 연수 이수 현황 <small class="muted">초급 ${cnt['초급']} · 중급 ${cnt['중급']} · 고급 ${cnt['고급']} · 미이수 ${cnt['']}</small></h2>
    ${iss.length ? `<div class="alert warn" role="status"><span>${iss.map((x) => esc(x.text)).join('<br>')}</span></div>` : ''}
    <form id="team-train-form" class="stack"><div class="tm-tbl-wrap"><table class="tm-tbl tm-train"><thead><tr><th>사람</th><th>맡은 자리</th><th>이수 등급</th><th>이수일</th></tr></thead><tbody>
    ${ps.map((p) => { const tr = trainOf(p.id); return `<tr><th scope="row">${esc(p.name)}<small>${esc(p.title)}${isAidePerson(p.id) ? ' · 보조인력' : ''}</small></th><td><small>${esc(where(p.id)) || '-'}</small></td>
      <td>${adm ? `<select name="lv-${esc(p.id)}" aria-label="${esc(p.name)} 이수 등급">${LEVELS.map(([v, l]) => `<option value="${v}" ${(tr.level || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : `<span class="${tr.level ? '' : 'warn-t'}">${esc(tr.level || '미이수')}</span>`}</td>
      <td>${adm ? `<input type="date" name="dt-${esc(p.id)}" value="${esc(tr.date || '')}" aria-label="${esc(p.name)} 이수일">` : esc(tr.date ? fmtDate(tr.date) : '-')}</td></tr>`; }).join('')}
    </tbody></table></div>${adm ? '<button type="submit" class="primary">이수 현황 저장</button>' : ''}</form>
    <p class="small muted">학생 곁에서 움직이는 1자리(소통자)와 2자리(지원대피 담당)에는 연수 이수자를 두기를 권합니다. 미이수자가 들어가면 배치도·당번표·공백 점검에 표시합니다. 등급은 케어브릿지 과정(초급·중급·고급, 등급별 이론 6시간 + 실기 6시간) 기준이며, 다른 기관 연수는 이수일과 함께 해당 등급으로 적습니다.</p></section>`;
}

/* ---------- 긴급 호출 ---------- */
export function dutyNow(date = todayStr(), hm = timeStr()) {
  const t = team(), w = parseDate(date).getDay();
  const p = w >= 1 && w <= 5 ? periodOf(date, hm) : null;
  const cell = p ? t.duty?.[DAYS[w - 1][0]]?.[p.k] || {} : {};
  return { p, who: Object.fromEntries(t.slots.map((s) => [s.k, cell[s.k] || t.roster[s.k]?.p1 || ''])) };
}
// 전체 지원팀: 명부 1·2순위와 당번표에 한 번이라도 들어간 사람
export function teamAll() {
  const t = team(), ids = new Map();
  t.slots.forEach((s) => ['p1', 'p2'].forEach((q) => { const id = t.roster[s.k]?.[q]; if (id && !ids.has(id)) ids.set(id, s.k); }));
  DAYS.forEach(([d]) => t.periods.forEach((p) => t.slots.forEach((s) => { const id = t.duty?.[d]?.[p.k]?.[s.k]; if (id && !ids.has(id)) ids.set(id, s.k); })));
  return [...ids].map(([id, k]) => ({ id, slot: k, app: !!member(id) && member(id).role !== 'aide' && member(id).active !== false }));
}
const myDesk = () => S.desk || {};
export const sosPlaces = () => (myDesk().sosPlaces || []).filter(Boolean);
function sosForm(sid) {
  const all = teamAll(), places = sosPlaces(), defSid = sid || myDesk().sosSid || '';
  return `<form class="tm-sos-form"><h2>지원팀 긴급 호출</h2>
    <p class="tm-sos-q">확인을 누르면 아래 지원팀에게 바로 깜박이는 알림이 갑니다.</p>
    <fieldset><legend>장소</legend>${places.length ? `<div class="tm-chips">${places.map((p, i) => `<label class="tm-chip"><input type="radio" name="place" value="${esc(p)}" ${i === 0 ? 'checked' : ''}><span>${esc(p)}</span></label>`).join('')}</div>` : '<p class="small warn-t">미리 정한 장소가 없습니다. 아래 「장소 미리 정하기」에서 한 번만 적어 두세요. 지금은 장소 없이 보냅니다.</p>'}</fieldset>
    <label>학생(고르면 사후 기록이 바로 만들어집니다)<select name="sid"><option value="">고르지 않음</option>${S.students.map((x) => `<option value="${x.id}" ${x.id === defSid ? 'selected' : ''}>${esc(x.alias)}</option>`).join('')}</select></label>
    <fieldset><legend>받는 사람 <span class="small"><button type="button" class="link sm" data-sos-all="1">모두</button> · <button type="button" class="link sm" data-sos-all="0">모두 빼기</button></span></legend>
    <ul class="rows tm-sos-to">${all.map((x) => `<li><label class="chk"><input type="checkbox" name="to" value="${esc(x.id)}" checked> <b>${esc(personName(x.id))}</b> <small class="muted">${esc(slotName(x.slot))}</small></label><span class="grow"></span>${x.app ? '<small class="ok-t">앱 알림</small>' : '<small class="warn-t">전화·인터폰</small>'}</li>`).join('') || '<li class="muted">지원팀 명부가 비어 있습니다. 지원팀 화면에서 먼저 정해 주세요.</li>'}</ul></fieldset>
    <details class="tm-sos-set"><summary>장소 미리 정하기(한 줄에 하나, 맨 위가 기본)</summary>
      <textarea name="places" rows="3" placeholder="예:&#10;특수학급(3층 301호)&#10;4-2 통합학급&#10;체육관">${esc(places.join('\n'))}</textarea>
      <button type="button" class="ghost sm" data-sos-save>장소·학생 기본값 저장</button></details>
    <p class="small muted">보조인력과 앱 계정이 없는 사람은 앱 알림을 받지 못합니다. 전화·인터폰으로 함께 부르세요. 112·119 신고가 필요하면 먼저 신고합니다.</p>
    <div class="actions"><button type="button" class="ghost" data-close>닫기</button><span class="grow"></span><button type="submit" class="tm-sos big" data-sos-go>확인 — 전체 송출</button></div></form>`;
}
export function openSos(sid = '') {
  openModal(sosForm(sid), {
    onOpen: (m) => {
      const f = m.querySelector('form'), go2 = m.querySelector('[data-sos-go]');
      const label = () => { const boxes = [...f.querySelectorAll('input[name=to]')], n = boxes.filter((b) => b.checked).length; go2.textContent = n === boxes.length ? '확인 — 전체 송출' : `확인 — ${n}명에게 송출`; go2.disabled = n === 0; };
      f.addEventListener('change', label);
      m.querySelectorAll('[data-sos-all]').forEach((b) => { b.onclick = () => { f.querySelectorAll('input[name=to]').forEach((x) => { x.checked = b.dataset.sosAll === '1'; }); label(); }; });
      const sv = m.querySelector('[data-sos-save]');
      if (sv) sv.onclick = async () => {
        const list = String(f.places.value || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12);
        await saveDeskSos({ sosPlaces: list, sosSid: f.sid.value || '' });
        toast('긴급 호출 기본값을 저장했습니다'); openSos(f.sid.value || '');
      };
      setTimeout(() => go2.focus(), 30);
    },
    onSubmit: async (fd) => {
      const t = team(), now = timeStr(), place = fd.get('place') || '', sid2 = fd.get('sid') || '';
      const chosen = fd.getAll('to');
      const to = chosen.filter((id) => member(id) && member(id).role !== 'aide');
      const s2 = sid2 ? student(sid2) : null;
      if (s2) {
        const pick = (k) => chosen.includes(t.roster[k]?.p1) ? t.roster[k].p1 : chosen.includes(t.roster[k]?.p2) ? t.roster[k].p2 : '';
        await S.store.create('incidents', {}, { studentId: s2.id, date: todayStr(), time: now, place, antecedent: '', behavior: '', prevent: '', restraint: false, createdBy: S.me.uid, createdAt: Date.now(), updatedBy: S.me.uid, updatedAt: Date.now(), closed: false,
          deploy: { called: now, risk: '', sos: true, staff: t.slots.map((s) => ({ slot: s.k, who: dutyNow().who[s.k] && chosen.includes(dutyNow().who[s.k]) ? dutyNow().who[s.k] : pick(s.k), arrive: '', end: '', injury: false, injuryNote: '' })) } });
      }
      await sendAlert({ type: 'sos', title: `지원팀 긴급 호출${place ? ' · ' + place : ''}`, text: `${s2 ? s2.alias + ' · ' : ''}${now} 호출 · 보낸 사람 ${S.me.name}`, to });
      const phone = chosen.length - to.length;
      toast(`지원팀 ${to.length}명에게 알렸습니다${phone ? ` · ${phone}명은 전화로 부르세요` : ''}`, s2 ? { label: '사후 기록 열기', run: () => go(`#/student/${s2.id}/crisis`) } : undefined);
    }
  });
}
async function saveDeskSos(patch) {
  const next = { ...(S.desk || {}), ...patch, owner: S.me.uid, updatedAt: Date.now() };
  delete next.id;
  S.desk = { ...next, id: S.me.uid };
  await S.store.create('desks', {}, next, S.me.uid);
}
on('tm-sos', (el) => openSos(el.dataset.sid || ''));


/* ---------- 긴급 호출 경보음(받는 사람 화면) ---------- */
// 보조인력은 알림 대상이 아니므로 경보음도 울리지 않는다. 각자 지원팀 화면 「내 알림 설정」에서 끄고 켠다(desks.sosSound, 기본 켜짐).
let actx = null, ringTimer = null;
export function unlockAudio() { try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch { /* 소리를 못 내는 브라우저 */ } }
document.addEventListener('pointerdown', unlockAudio, { passive: true });
document.addEventListener('keydown', unlockAudio, { passive: true });
export const sosSoundOn = () => S.desk?.sosSound !== false;
export function playAlarm(sec = 3) {
  window.__iepAlarm = (window.__iepAlarm || 0) + 1;
  try { navigator.vibrate?.([400, 150, 400, 150, 400]); } catch { /* 진동 없음 */ }
  try {
    unlockAudio(); if (!actx) return;
    const t0 = actx.currentTime + 0.05, g = actx.createGain(), o = actx.createOscillator();
    o.type = 'square'; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.03);
    for (let i = 0; i < sec * 4; i++) o.frequency.setValueAtTime(i % 2 ? 660 : 990, t0 + i * 0.25);
    g.gain.setValueAtTime(0.25, t0 + sec - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + sec);
    o.start(t0); o.stop(t0 + sec + 0.05);
  } catch { /* 소리를 못 내는 브라우저 */ }
}
const RUNG_KEY = 'ieptalk-sos-rung';
const rung = (() => { try { return new Set(JSON.parse(sessionStorage.getItem(RUNG_KEY) || '[]')); } catch { return new Set(); } })();
const pending = () => {
  const me = S.me?.uid;
  if (!me || S.me.role === 'aide') return [];
  return (S.alerts || []).filter((a) => a.type === 'sos' && (a.to || []).includes(me) && a.from !== me && !a.ack?.[me] && !a.hidden?.[me] && Date.now() - (a.at || 0) < 10 * 60e3);
};
// 알림 목록이 바뀔 때마다 부른다: 새 호출이면 바로 울리고, 확인을 누르기 전까지 20초마다 세 번 더 울린다.
export function ringSos() {
  if (!sosSoundOn()) return;
  const fresh = pending().filter((a) => !rung.has(a.id));
  if (!fresh.length) return;
  fresh.forEach((a) => rung.add(a.id));
  try { sessionStorage.setItem(RUNG_KEY, JSON.stringify([...rung].slice(-50))); } catch { /* 저장 안 됨 */ }
  playAlarm();
  clearInterval(ringTimer); let n = 0;
  ringTimer = setInterval(() => { if (++n > 3 || !pending().length || !sosSoundOn()) { clearInterval(ringTimer); return; } playAlarm(); }, 20000);
}
export function soundCard() {
  const on = sosSoundOn();
  return `<section class="card tm-sound"><div class="bar"><div class="grow"><b>내 알림 설정</b><br><small class="muted">지원팀 긴급 호출을 받으면 경보음과 진동이 울립니다(확인을 누를 때까지 20초마다 최대 세 번 더). 이 기기와 계정에만 적용됩니다.</small></div>
    <label class="tm-switch"><input type="checkbox" data-change="tm-sound" ${on ? 'checked' : ''}><span>경보음 ${on ? '켜짐' : '꺼짐'}</span></label>
    <button type="button" class="ghost sm" data-act="tm-sound-test">소리 시험</button></div></section>`;
}
on('tm-sound', async (el) => { await saveDeskSos({ sosSound: el.checked }); if (!el.checked) clearInterval(ringTimer); toast(el.checked ? '긴급 호출 경보음을 켰습니다' : '긴급 호출 경보음을 껐습니다'); rerender(); });
on('tm-sound-test', () => { unlockAudio(); playAlarm(2); });

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
      <td><label class="chk small"><input type="checkbox" name="dpInj-${s.k}" ${x.injury ? 'checked' : ''}> 있음</label>${s.k === 's3' ? `<label class="small tm-hrs">보강 시수<input type="number" min="0" max="8" name="dpHrs-s3" value="${esc(x.hours ?? '')}" placeholder="자동"></label>` : ''}<input name="dpInjN-${s.k}" value="${esc(x.injuryNote || '')}" placeholder="부위·내용" aria-label="${esc(s.name)} 부상 내용"></td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="small muted">투입 인력의 상태 확인과 돌아보기 참석은 「지원팀 → 교직원 회복」에서 적습니다.</p></fieldset>`;
}
export function deployFromForm(fd, prev = {}) {
  const old = prev.deploy?.staff || [];
  const staff = team().slots.map((s) => {
    const o = old.find((x) => x.slot === s.k) || {};
    return { ...o, slot: s.k, who: fd.get(`dpWho-${s.k}`) || '', arrive: fd.get(`dpArr-${s.k}`) || '', end: fd.get(`dpEnd-${s.k}`) || '', injury: fd.get(`dpInj-${s.k}`) === 'on', injuryNote: fd.get(`dpInjN-${s.k}`) || '', ...(s.k === 's3' ? { hours: fd.get('dpHrs-s3') === '' || fd.get('dpHrs-s3') == null ? '' : Number(fd.get('dpHrs-s3')) } : {}) };
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
    if (p.k === 'lunch') { c.s4 = u.t2 || roster.s4.p1; }
    duty[d][p.k] = c;
  }); });
  duty.wed.p3.s3 = u.cm; // 겹침 예시(소통자와 수업 대체에 같은 사람)
  duty.fri.p6.s3 = ''; // 빈 자리 예시
  return { slots: DEFAULT_SLOTS, roster, extras: ex, periods: DEFAULT_TEAM_PERIODS, duty, training: { [u.cm]: { level: '중급', date: '2026-08-20' }, [u.t3]: { level: '초급', date: '2026-09-12' }, [u.t4]: { level: '초급', date: '2026-09-12' }, [u.a1]: { level: '초급', date: '2026-09-12' } }, rates: { kyulbo: 20000, bonusN: 2, bonusSlots: BONUS_SLOTS, note: '시연용 가상 기준(실제 기준 아님)' } };
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
  const KIND = { kyulbo: '수업 결보강비', count: '행동지원 횟수', none: '집계 제외(보조인력 등)' };
  const lines = [['날짜', '시각', '학생(가명)', '자리', '사람', '구분', '도착', '끝', '분', '보강 시수', '결보강비', '위험 수준', '부상', '부상 내용', '연수'].map(q).join(',')];
  entries(`${month}-01`, `${month}-31`).reverse().forEach(({ ic, st }) => { const p = entryPay(st, ic, r); lines.push([ic.date, ic.time, student(ic.studentId)?.alias || '', slotName(st.slot), personName(st.who), KIND[p.kind], st.arrive, st.end, entryMin(st) ?? '', p.kind === 'kyulbo' ? p.hours : '', p.kind === 'kyulbo' ? p.total : '', RISK_L[ic.deploy?.risk || ''] === '선택' ? '' : RISK_L[ic.deploy?.risk || ''], st.injury ? '있음' : '없음', st.injuryNote || '', trainOf(st.who).level || '미이수'].map(q).join(',')); });
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
on('tm-cert', (el) => printHtml(el.dataset.kind === 'ev' ? evalCert(el.dataset.who, el.dataset.sem) : kyulboCert(el.dataset.who, el.dataset.month)));
on('tm-eval-sem', (el) => { S.ui.teamEvalSem = el.dataset.v; rerender(); });
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
    const x = { id: 'x-' + Date.now().toString(36), name: String(fd.get('name')).trim(), title: String(fd.get('title') || '').trim(), kind: fd.get('kind') || '' };
    if (!x.name) return;
    await saveTeam({ extras: [...team().extras, x] }); e.target.reset(); toast(`${x.name}을(를) 더했습니다`);
  }
  if (e.target.id === 'team-rate-form') {
    e.preventDefault(); if (!isAdmin()) return;
    const fd = new FormData(e.target), num = (k) => Math.max(0, Number(fd.get(k)) || 0);
    const rates = { kyulbo: num('kyulbo'), bonusN: num('bonusN'), bonusSlots: team().slots.filter((s) => s.k !== 's3' && fd.get(`bs-${s.k}`) === 'on').map((s) => s.k), note: String(fd.get('note') || '').trim() };
    await saveTeam({ rates }); toast('기준을 저장했습니다');
  }
  if (e.target.id === 'team-train-form') {
    e.preventDefault(); if (!isAdmin()) return;
    const fd = new FormData(e.target);
    const training = Object.fromEntries(people().map((p) => [p.id, { level: fd.get(`lv-${p.id}`) || '', date: fd.get(`dt-${p.id}`) || '' }]));
    await saveTeam({ training }); toast('연수 이수 현황을 저장했습니다');
  }
});
