// 지금 현황(학생 모니터): 학생 화면을 열면 가장 먼저 보이는 한 장.
// 신호등 요약 → IEP 단계 도식 → 목표 진전(기대 위치와 비교) → 문제행동 그래프(기초선·중재) → 행동 기능 도식
// → 최근 30일 사건 시간선 → 지금 쓰는 행동지원 그림 → 다음 할 일. 그림·그래프는 모두 자료에서 바로 그린다(사진 없음).
import { esc, todayStr, fmtDate, addDays, parseDate } from '../util.js';
import { S, on, useSub, student, labelOf } from '../state.js';
import { behaviorSeries, progressWarning, METHOD_LABEL } from '../charts.js';
import { visualAnalysis } from './solution.js';
import { profileFor, FN, FN_KEYS } from './fba.js';
import { incidentsOf, nextStep, stageOf } from './incidents.js';
import { notesOf } from './notes.js';
import { accomsOf, needsMyConfirm } from './accoms.js';
import { visItems, visCard } from './visuals.js';
import { collectFlow, STEPS } from './iepflow.js';

const DAY = 86400000;
const days = (a, b) => Math.round((parseDate(b) - parseDate(a)) / DAY);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x * 10) / 10;

// 목표 하나의 진전: 실제 위치(기초→목표 중 몇 %)와 날짜로 본 기대 위치
export function goalProgress(g, today = todayStr()) {
  const pts = [...(g.points || [])].sort((a, b) => (a.d > b.d ? 1 : -1));
  const vals = pts.map((p) => Number(p.v)).filter(Number.isFinite);
  const b = Number(g.baseline), t = Number(g.target);
  const span = t - b;
  const last = vals[vals.length - 1];
  const act = vals.length && span ? clamp(((last - b) / span) * 100, 0, 100) : vals.length && last === t ? 100 : 0;
  let exp = null;
  if (g.startDate && g.targetDate && g.targetDate > g.startDate) exp = clamp((days(g.startDate, today) / days(g.startDate, g.targetDate)) * 100, 0, 100);
  const lastD = pts.length ? pts[pts.length - 1].d : '';
  return { vals, last, act: Math.round(act), exp: exp == null ? null : Math.round(exp), lastD, stale: !lastD || days(lastD, today) > 14 };
}

// 행동 추세: 최근 7일과 그 앞 7일 비교(발생한 날 기준 합/평균)
export function behaviorTrend(t, series, today = todayStr()) {
  const a7 = addDays(today, -7), a14 = addDays(today, -14);
  const now = series.filter((p) => p.d > a7 && p.d <= today).map((p) => p.v);
  const prev = series.filter((p) => p.d > a14 && p.d <= a7).map((p) => p.v);
  const avg = (x) => (x.length ? x.reduce((s, v) => s + v, 0) / x.length : null);
  const n = avg(now), p = avg(prev);
  const down = t.method !== 'lat'; // 잠재시간은 길수록(행동이 늦게 나올수록) 좋음
  if (n == null || p == null) return { n, p, dir: 'none', good: null };
  const ch = p ? ((n - p) / p) * 100 : n ? 100 : 0;
  const dir = Math.abs(ch) < 10 ? 'flat' : ch > 0 ? 'up' : 'down';
  return { n: r1(n), p: r1(p), ch: Math.round(ch), dir, good: dir === 'flat' ? null : (dir === 'down') === down };
}

export function collectMonitor(sid, today = todayStr()) {
  const f = collectFlow(sid);
  const evs = S.eventsBy[sid] || [];
  const n = Number(S.school.warnRun) || 3;
  const goals = (S.goalsBy[sid] || []).filter((g) => g.status !== '보류').map((g) => ({ g, pr: goalProgress(g, today), warn: g.status !== '달성' && progressWarning(g, n) }));
  const targets = (S.targetsBy[sid] || []).map((t) => { const series = behaviorSeries(t, evs); return { t, series, va: visualAnalysis(t, series), tr: behaviorTrend(t, series, today), p: profileFor(sid, t.id) }; });
  const prof = profileFor(sid);
  const incs = incidentsOf(sid);
  const inc30 = incs.filter((x) => x.date >= addDays(today, -30));
  const openInc = incs.filter((x) => stageOf(x) < 4);
  const notes = notesOf(sid);
  const note14 = notes.filter((x) => x.date >= addDays(today, -14));
  const accWait = accomsOf(sid).filter(needsMyConfirm);
  const todo = [];
  goals.filter((x) => x.warn).forEach((x) => todo.push(['danger', `「${x.g.domain || '목표'}」 진전도 경고 — 교수 방법·목표 조정 협의`, 'goals']));
  openInc.forEach((ic) => { const ns = nextStep(ic); todo.push([ns.due && ns.due < today ? 'danger' : 'warn', `위기행동(${fmtDate(ic.date)}) 다음 단계: ${ns.label}${ns.due ? ` · 기한 ${fmtDate(ns.due)}` : ''}`, 'crisis']); });
  goals.filter((x) => x.g.status !== '달성' && x.pr.stale).forEach((x) => todo.push(['warn', `「${x.g.domain || '목표'}」 ${x.pr.lastD ? `마지막 측정 ${fmtDate(x.pr.lastD)}` : '측정값 없음'} — 측정값 넣기`, 'goals']));
  targets.filter((x) => !x.t.interventionStart && x.va.ready?.[0] === 'ok').forEach((x) => todo.push(['ok', `「${x.t.name}」 기초선이 안정적 — 중재 시작일을 정할 수 있음`, 'behavior']));
  targets.filter((x) => !x.p.top).forEach((x) => todo.push(['warn', `「${x.t.name}」 기능평가 자료 없음 — 동기평가·ABC 관찰기록`, 'fba']));
  if (accWait.length) todo.push(['warn', `평가조정 확인 요청 ${accWait.length}건`, 'accom']);
  if (!f.vis.length && targets.length) todo.push(['ok', '행동지원 시각자료를 아직 고르지 않음', 'flow']);
  if (!f.term) todo.push(['ok', '학기말 종합을 아직 저장하지 않음', 'term']);
  return { f, goals, targets, prof, incs, inc30, openInc, notes, note14, accWait, todo, today };
}

/* ---------- 그림 조각(SVG) ---------- */
// 학생 그림: 사진 대신 가명 첫 글자로 그린 표지
const badge = (alias) => `<svg class="mo-av" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" class="mo-av-bg"/><circle cx="32" cy="25" r="10" class="mo-av-fg"/><path d="M14 54c3-10 10-15 18-15s15 5 18 15" class="mo-av-fg"/><text x="50" y="18" class="mo-av-t">${esc(String(alias || '?').slice(0, 1))}</text></svg>`;

// IEP 일곱 단계 도식(원과 선)
function stepDiagram(status) {
  const w = 700, h = 86, gap = (w - 60) / (STEPS.length - 1);
  return `<svg class="mo-steps" viewBox="0 0 ${w} ${h}" role="img" aria-label="IEP 단계 진행: ${STEPS.map(([k, l]) => `${l} ${status[k] === 'ok' ? '자료 있음' : status[k] === 'part' ? '진행 중' : '비어 있음'}`).join(', ')}">
    <line x1="30" x2="${w - 30}" y1="30" y2="30" class="mo-st-line"/>
    ${STEPS.map(([k, l], i) => { const x = 30 + i * gap; return `<g class="mo-st ${status[k]}"><circle cx="${x}" cy="30" r="17"/><text x="${x}" y="35" class="mo-st-n">${status[k] === 'ok' ? '✓' : i + 1}</text><text x="${x}" y="72" class="mo-st-l">${esc(l)}</text></g>`; }).join('')}
  </svg>`;
}

// 목표 진전 막대: 실제 위치(채움)와 날짜로 본 기대 위치(세로 선)
function goalBar(x) {
  const { pr, g } = x;
  const cls = g.status === '달성' || pr.act >= 100 ? 'ok' : x.warn ? 'danger' : pr.exp != null && pr.act + 10 < pr.exp ? 'warn' : 'ok';
  return `<li class="mo-goal">
    <div class="mo-gl"><span class="tag">${esc(g.domain || '목표')}</span><span class="small mo-gt">${esc(g.behavior || '')}</span></div>
    <svg class="mo-bar" viewBox="0 0 300 26" preserveAspectRatio="none" role="img" aria-label="목표까지 ${pr.act}% 왔음${pr.exp != null ? `, 날짜로 본 기대 위치 ${pr.exp}%` : ''}">
      <rect x="0" y="6" width="300" height="14" rx="7" class="mo-bar-bg"/>
      <rect x="0" y="6" width="${(pr.act / 100) * 300}" height="14" rx="7" class="mo-bar-fill ${cls}"/>
      ${pr.exp != null ? `<line x1="${(pr.exp / 100) * 300}" x2="${(pr.exp / 100) * 300}" y1="1" y2="25" class="mo-bar-exp"/>` : ''}
    </svg>
    <div class="mo-gn tiny"><b>${pr.act}%</b>${pr.exp != null ? ` / 기대 ${pr.exp}%` : ''} · ${pr.vals.length ? `${pr.vals.length}회 측정, 최근 ${esc(pr.last)} (기초 ${esc(g.baseline)} → 목표 ${esc(g.target)})` : '측정 없음'}
      ${x.warn ? '<span class="tag warn">진전도 경고</span>' : g.status === '달성' ? '<span class="tag ok">달성</span>' : ''}</div></li>`;
}

// 행동 그래프: 최근 6주, 기초선(A) 평균선과 중재(B) 구간 음영
function behaviorMini(x, today) {
  const from = addDays(today, -42);
  const pts = x.series.filter((p) => p.d >= from && p.d <= today);
  const w = 320, h = 120, L = 30, R = 8, T = 10, B = 22;
  const head = `<p class="small"><b>${esc(x.t.name)}</b> <small class="muted">${esc(METHOD_LABEL[x.t.method] || '빈도')} · ${x.t.interventionStart ? `${esc(fmtDate(x.t.interventionStart))} 중재 시작` : '기초선 단계'}</small></p>`;
  if (!pts.length) return `<div class="mo-beh">${head}<p class="tiny muted">최근 6주 기록이 없습니다.</p></div>`;
  const mx = Math.max(...pts.map((p) => p.v), 1);
  const X = (d) => L + (days(from, d) / 42) * (w - L - R), Y = (v) => T + (1 - v / mx) * (h - T - B);
  const bx = x.t.interventionStart && x.t.interventionStart > from ? X(x.t.interventionStart) : x.t.interventionStart ? L : null;
  const aMean = x.va.a ? x.va.a.mean : null;
  const tr = x.tr;
  const arrow = tr.dir === 'none' ? '' : `<span class="mo-tr ${tr.good === true ? 'ok' : tr.good === false ? 'danger' : ''}">${tr.dir === 'up' ? '▲' : tr.dir === 'down' ? '▼' : '▶'} 최근 7일 평균 ${tr.n} (그 전 7일 ${tr.p}${tr.dir !== 'flat' ? `, ${tr.ch > 0 ? '+' : ''}${tr.ch}%` : ', 비슷함'})</span>`;
  return `<div class="mo-beh">${head}
    <svg class="mo-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(x.t.name)} 최근 6주 ${pts.length}일 기록, 최댓값 ${mx}">
      ${bx != null ? `<rect x="${bx}" y="${T}" width="${w - R - bx}" height="${h - T - B}" class="mo-phB"/><text x="${bx + 3}" y="${T + 10}" class="mo-ax">중재</text>` : ''}
      <line x1="${L}" x2="${w - R}" y1="${h - B}" y2="${h - B}" class="mo-axis"/><line x1="${L}" x2="${L}" y1="${T}" y2="${h - B}" class="mo-axis"/>
      <text x="${L - 4}" y="${T + 4}" class="mo-ax" text-anchor="end">${mx}</text><text x="${L - 4}" y="${h - B}" class="mo-ax" text-anchor="end">0</text>
      <text x="${L}" y="${h - 6}" class="mo-ax">${esc(fmtDate(from))}</text><text x="${w - R}" y="${h - 6}" class="mo-ax" text-anchor="end">오늘</text>
      ${aMean != null ? `<line x1="${L}" x2="${bx ?? w - R}" y1="${Y(aMean)}" y2="${Y(aMean)}" class="mo-amean"/>` : ''}
      <polyline points="${pts.map((p) => `${X(p.d)},${Y(p.v)}`).join(' ')}" class="mo-line"/>
      ${pts.map((p) => `<circle cx="${X(p.d)}" cy="${Y(p.v)}" r="3" class="mo-pt ${p.phase}"><title>${esc(fmtDate(p.d))} ${p.v}</title></circle>`).join('')}
    </svg>
    <p class="tiny">${arrow}${aMean != null ? ` <span class="muted">· 점선은 기초선 평균 ${aMean}</span>` : ''}${x.va.effect ? `<br>${esc(x.va.effect[1])}` : ''}</p></div>`;
}

// 행동 기능 도식: 네 기능(감각·회피·관심·선호물)을 마름모 레이더로
function fnRadar(p) {
  if (!p.sc) return '<p class="small muted">기능평가 자료(동기평가·ABC·의사소통기능평가·행동 기록의 뒤 상황)가 쌓이면 행동의 기능을 도식으로 보여 줍니다.</p>';
  const c = 90, R = 64; const ang = { att: -90, esc: 0, tan: 90, sens: 180 };
  const P = (f, r) => { const a = (ang[f] * Math.PI) / 180; return [c + Math.cos(a) * r, c + Math.sin(a) * r]; };
  const top = Math.max(...FN_KEYS.map((f) => p.sc[f]), 0.01);
  const poly = FN_KEYS.map((f) => P(f, R * clamp(p.sc[f] / top, 0.05, 1)).join(',')).join(' ');
  const lab = { att: [c, 14, 'middle'], esc: [c + R + 8, c + 4, 'start'], tan: [c, c + R + 20, 'middle'], sens: [c - R - 8, c + 4, 'end'] };
  return `<div class="mo-fn"><svg class="mo-radar" viewBox="-80 0 340 186" role="img" aria-label="행동 기능 점수: ${FN_KEYS.map((f) => `${FN[f]} ${Math.round(p.sc[f] * 100)}%`).join(', ')}">
    ${[1, 0.66, 0.33].map((k) => `<polygon points="${FN_KEYS.map((f) => P(f, R * k).join(',')).join(' ')}" class="mo-rg"/>`).join('')}
    ${FN_KEYS.map((f) => `<line x1="${c}" y1="${c}" x2="${P(f, R)[0]}" y2="${P(f, R)[1]}" class="mo-rg"/>`).join('')}
    <polygon points="${poly}" class="mo-rp"/>
    ${FN_KEYS.map((f) => `<text x="${lab[f][0]}" y="${lab[f][1]}" text-anchor="${lab[f][2]}" class="mo-rl ${f === p.top ? 'top' : ''}">${esc(FN[f])} ${Math.round(p.sc[f] * 100)}</text>`).join('')}
  </svg>
  <p class="small">주된 기능: <b>${esc(FN[p.top])}</b>${p.mixed && p.second ? ` · ${esc(FN[p.second])}와 비슷(복합 기능 가능)` : ''}<br><span class="tiny muted">근거 ${p.src.map((s) => esc(s.label)).join(', ')} · ${p.agree}/${p.src.length}개 자료가 같은 기능을 가리킴</span></p></div>`;
}

// 최근 30일 시간선: 관찰 메모·측정·위기행동·중재 시작
function timeline(m) {
  const from = addDays(m.today, -30), w = 640, h = 92, L = 70, R = 10;
  const X = (d) => L + (days(from, d) / 30) * (w - L - R);
  const rows = [
    ['관찰 메모', 'note', m.notes.filter((n) => n.date >= from).map((n) => [n.date, n.text || ''])],
    ['목표 측정', 'meas', m.goals.flatMap((x) => (x.g.points || []).filter((p) => p.d >= from).map((p) => [p.d, `${x.g.domain} ${p.v}`]))],
    ['위기행동', 'inc', m.incs.filter((x) => x.date >= from).map((x) => [x.date, x.behavior || '위기행동'])]
  ];
  const starts = m.targets.filter((x) => x.t.interventionStart && x.t.interventionStart >= from).map((x) => [x.t.interventionStart, x.t.name]);
  const ticks = [0, 7, 14, 21, 28].map((k) => addDays(from, k));
  return `<svg class="mo-tl" viewBox="0 0 ${w} ${h}" role="img" aria-label="최근 30일: ${rows.map(([l, , a]) => `${l} ${a.length}건`).join(', ')}">
    ${ticks.map((d) => `<line x1="${X(d)}" x2="${X(d)}" y1="4" y2="${h - 16}" class="mo-tk"/><text x="${X(d)}" y="${h - 4}" class="mo-ax" text-anchor="middle">${esc(fmtDate(d))}</text>`).join('')}
    ${starts.map(([d, n]) => `<line x1="${X(d)}" x2="${X(d)}" y1="4" y2="${h - 16}" class="mo-start"><title>${esc(n)} 중재 시작 ${esc(fmtDate(d))}</title></line>`).join('')}
    ${rows.map(([l, k, arr], i) => { const y = 16 + i * 22; return `<text x="4" y="${y + 4}" class="mo-tl-l">${l} ${arr.length}</text><line x1="${L}" x2="${w - R}" y1="${y}" y2="${y}" class="mo-tl-row"/>${arr.map(([d, t]) => `<circle cx="${X(d)}" cy="${y}" r="${k === 'inc' ? 6 : 4.5}" class="mo-tl-${k}"><title>${esc(fmtDate(d))} ${esc(String(t).slice(0, 40))}</title></circle>`).join('')}`; }).join('')}
  </svg>`;
}

/* ---------- 화면 ---------- */
export function monitorHtml(sid, today = todayStr()) {
  const s = student(sid); const m = collectMonitor(sid, today);
  const gWarn = m.goals.filter((x) => x.warn).length, gMet = m.goals.filter((x) => x.g.status === '달성' || x.pr.act >= 100).length;
  const worse = m.targets.filter((x) => x.tr.good === false).length, better = m.targets.filter((x) => x.tr.good === true).length;
  const tiles = [
    ['목표 진전', m.goals.length ? `${gMet}/${m.goals.length}` : '-', gWarn ? `경고 ${gWarn}` : m.goals.length ? '경고 없음' : '목표 없음', gWarn ? 'danger' : m.goals.length ? 'ok' : 'none', 'goals'],
    ['문제행동 추세', m.targets.length ? (worse ? `악화 ${worse}` : better ? `개선 ${better}` : '비슷함') : '-', `표적행동 ${m.targets.length}개 · 최근 7일`, worse ? 'warn' : better ? 'ok' : 'none', 'behavior'],
    ['위기행동', `${m.inc30.length}건`, m.openInc.length ? `사후 절차 진행 중 ${m.openInc.length}` : '최근 30일', m.openInc.length ? 'danger' : m.inc30.length ? 'warn' : 'ok', 'crisis'],
    ['관찰 메모', `${m.note14.length}건`, '최근 14일', m.note14.length ? 'ok' : 'warn', 'note'],
    ['평가조정', `${accomsOf(sid).length}과목`, m.accWait.length ? `내 확인 대기 ${m.accWait.length}` : '확인 완료', m.accWait.length ? 'warn' : 'none', 'accom'],
    ['기능 가설', m.prof.top ? FN[m.prof.top] : '-', m.prof.top ? `${m.prof.agree}/${m.prof.src.length} 자료 일치` : '자료 없음', m.prof.top ? 'ok' : 'none', 'fba']
  ];
  const vis = visItems(sid);
  return `<div class="mo">
    <section class="card mo-head">${badge(s?.alias)}<div class="grow"><h2 class="h3">${esc(s?.alias || '')} 지금 현황 <small class="muted">${esc(fmtDate(today))} 기준</small></h2>
      <p class="small">${esc(s?.grade || '')} · 담당 ${esc(labelOf(s?.caseManager))}${s?.note ? ` · ${esc(String(s.note).replace(/^가상 학생\s*·\s*/, ''))}` : ''}</p></div></section>
    <ul class="mo-tiles" aria-label="현황 요약">${tiles.map(([l, v, sub, c, tab]) => `<li class="mo-tile ${c}"><a href="#/student/${sid}/${tab}"><span class="mo-tl-h">${l}</span><b class="mo-tv">${esc(v)}</b><span class="tiny">${esc(sub)}</span></a></li>`).join('')}</ul>
    <section class="card"><div class="goal-head"><h3 class="h3">IEP 단계</h3><span class="grow"></span><a class="btn-link sm" href="#/student/${sid}/flow">전체 흐름 보기</a></div><div class="mo-scroll">${stepDiagram(m.f.status)}</div></section>
    <div class="mo-grid">
      <section class="card"><div class="goal-head"><h3 class="h3">목표 진전</h3><span class="grow"></span><span class="tiny muted">채움 = 기초→목표 중 온 거리 · 세로선 = 날짜로 본 기대 위치</span></div>
        ${m.goals.length ? `<ul class="mo-goals">${m.goals.map(goalBar).join('')}</ul>` : `<p class="small muted">아직 목표가 없습니다.</p><button type="button" class="ghost sm" data-act="iep-gen" data-sid="${sid}">IEP 생성기</button>`}</section>
      <section class="card"><h3 class="h3">행동의 기능</h3>${fnRadar(m.prof)}</section>
    </div>
    <section class="card"><div class="goal-head"><h3 class="h3">문제행동 그래프 <small class="muted">최근 6주</small></h3><span class="grow"></span><a class="btn-link sm" href="#/student/${sid}/behavior">자세히</a></div>
      ${m.targets.length ? `<div class="mo-behs">${m.targets.map((x) => behaviorMini(x, today)).join('')}</div>` : '<p class="small muted">표적행동이 없습니다.</p>'}</section>
    <section class="card"><h3 class="h3">최근 30일 <small class="muted">점에 손을 올리면 내용</small></h3><div class="mo-scroll">${timeline(m)}</div>
      <p class="tiny muted"><span class="mo-key note"></span> 관찰 메모 <span class="mo-key meas"></span> 목표 측정 <span class="mo-key inc"></span> 위기행동 <span class="mo-key start"></span> 중재 시작</p></section>
    <div class="mo-grid">
      <section class="card"><div class="goal-head"><h3 class="h3">지금 쓰는 행동지원 그림</h3><span class="grow"></span><button type="button" class="ghost sm" data-act="vis-pick" data-sid="${sid}">고르기</button></div>
        ${vis.length ? `<div class="mo-vis">${vis.slice(0, 6).map((it) => visCard(it)).join('')}</div>` : '<p class="small muted">아직 고른 그림이 없습니다.</p>'}</section>
      <section class="card"><h3 class="h3">다음 할 일 <small class="muted">${m.todo.length}</small></h3>
        ${m.todo.length ? `<ul class="mo-todo">${m.todo.slice(0, 8).map(([c, t, tab]) => `<li class="${c}"><a href="#/student/${sid}/${tab}">${esc(t)}</a></li>`).join('')}</ul>` : '<p class="small">지금 바로 할 일이 없습니다.</p>'}</section>
    </div>
    <p class="tiny muted">모든 그림과 그래프는 이 앱에 쌓인 기록에서 바로 그립니다. 학생 사진은 쓰지 않습니다.</p>
  </div>`;
}

export function monitorTab(s) {
  const sid = s.id;
  useSub('ev:' + sid, 'bevents', { sid }, (r) => { S.eventsBy[sid] = r; });
  useSub('memo:' + sid, 'memos', { sid }, (r) => { S.memosBy[sid] = r.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); });
  return `<div class="bar"><span class="small muted">학생의 지금 상황을 한 장으로 봅니다. 칸을 누르면 해당 기록으로 갑니다.</span><span class="grow"></span>
    <button type="button" class="ghost" data-act="mo-print" data-sid="${sid}">인쇄</button></div>${monitorHtml(sid)}`;
}

on('mo-print', (el) => {
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = monitorHtml(el.dataset.sid);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); setTimeout(() => window.print(), 50);
});
