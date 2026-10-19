// IEP 전체 흐름: 한 학생의 IEP를 일곱 단계로 이어 본다.
// 학생 이해 → 평가·기능평가 → IEP 목표 → 교수·지원 계획 → 행동 지원 → 진전도 점검 → 학기말 평가
// 각 단계는 이미 쌓인 자료(관찰 메모·기초선·기능평가·목표·평가조정·시각자료·사후 기록·학기말 종합)를 모아 보여 주고,
// 고칠 곳은 해당 탭으로 보낸다. 「전체 인쇄」는 이 흐름을 그대로 한 문서로 인쇄한다(정해진 서식 없음).
import { esc, todayStr, fmtDate, addDays } from '../util.js';
import { S, on, useSub, student, labelOf, nameOf, rerender } from '../state.js';
import { behaviorSeries, METHOD_LABEL } from '../charts.js';
import { visualAnalysis, STRAT } from './solution.js';
import { profileFor, abcSummary, hypothesis, masOf, abcOf, commOf, COMM_FNS, FN } from './fba.js';
import { incidentsOf } from './incidents.js';
import { notesOf } from './notes.js';
import { accomsOf, CATS } from './accoms.js';
import { visSection, visItems } from './visuals.js';

export const STEPS = [
  ['know', '학생 이해', '현행 수준·장애 특성'],
  ['assess', '평가', '기초선·기능평가'],
  ['goals', 'IEP 목표', '성취기준·단원·차시'],
  ['plan', '교수·지원 계획', '지원·평가조정'],
  ['beh', '행동 지원', '중재 전략·시각자료'],
  ['prog', '진전도 점검', '측정·경고'],
  ['term', '학기말 평가', '종합 의견']
];
const supportsOf = (g) => { const m = String(g.note || '').match(/지원과 조정:\n((?:- .*(?:\n|$))+)/); return m ? m[1].split('\n').map((x) => x.replace(/^- /, '').trim()).filter(Boolean) : []; };
const spark = (vals, target) => {
  if (vals.length < 2) return '';
  const w = 120, h = 32, mx = Math.max(...vals, Number(target) || 0, 1), mn = Math.min(...vals, 0);
  const X = (i) => 4 + (i * (w - 8)) / (vals.length - 1), Y = (v) => h - 4 - ((v - mn) / (mx - mn || 1)) * (h - 8);
  const tl = target != null && target !== '' ? `<line x1="4" x2="${w - 4}" y1="${Y(Number(target))}" y2="${Y(Number(target))}" class="fl-tgt"/>` : '';
  return `<svg class="fl-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="측정값 ${vals.join(', ')}">${tl}<polyline points="${vals.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}" class="fl-line"/>${vals.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="2.5" class="fl-pt"/>`).join('')}</svg>`;
};

export function collectFlow(sid) {
  const s = student(sid);
  const evs = S.eventsBy[sid] || [];
  const memos = S.memosBy[sid] || [];
  const term = memos.filter((m) => m.kind === 'term').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  const notes = notesOf(sid);
  const recent = notes.filter((n) => n.date >= addDays(todayStr(), -30));
  const grow = notes.filter((n) => (n.tags || []).includes('잘한 점·성장') || n.star).slice(0, 3);
  const targets = (S.targetsBy[sid] || []).map((t) => {
    const series = behaviorSeries(t, evs); const va = visualAnalysis(t, series);
    const p = profileFor(sid, t.id); const sm = abcSummary(sid, t.id);
    const fns = p.top ? (p.mixed && p.second ? [p.top, p.second] : [p.top]) : [];
    return { t, va, p, hyp: p.top ? hypothesis(t, p, sm) : '', fns };
  });
  const comm = commOf(sid)[0];
  const pbFns = comm ? COMM_FNS.filter(([id]) => (comm.grid?.[id] || []).includes('pb')).map(([, l]) => l) : [];
  const goals = (S.goalsBy[sid] || []).map((g) => {
    const pts = [...(g.points || [])].sort((a, b) => (a.d > b.d ? 1 : -1)); const vals = pts.map((p) => Number(p.v)).filter(Number.isFinite);
    const up = g.direction !== 'down'; const last = vals[vals.length - 1];
    return { g, vals, last, met: vals.length ? (up ? last >= Number(g.target) : last <= Number(g.target)) : false, sup: supportsOf(g) };
  });
  const accs = accomsOf(sid);
  const incs = incidentsOf(sid);
  const vis = visItems(sid);
  const status = {
    know: s?.note || term?.traits || notes.length ? 'ok' : 'empty',
    assess: targets.some((x) => x.va.a) || masOf(sid).length || abcOf(sid).length || comm ? 'ok' : 'empty',
    goals: goals.length ? 'ok' : 'empty',
    plan: accs.length || goals.some((x) => x.sup.length) ? 'ok' : 'empty',
    beh: targets.length ? (targets.some((x) => x.t.interventionStart) || vis.length ? 'ok' : 'part') : 'empty',
    prog: goals.some((x) => x.vals.length) ? 'ok' : goals.length ? 'part' : 'empty',
    term: term ? 'ok' : 'empty'
  };
  return { s, term, notes, recent, grow, targets, comm, pbFns, goals, accs, incs, vis, status, mas: masOf(sid), abc: abcOf(sid) };
}

const ST_LABEL = { ok: '자료 있음', part: '진행 중', empty: '비어 있음' };
function stepBody(k, f, sid, print) {
  const link = (tab, label) => (print ? '' : `<a class="btn-link sm" href="#/student/${sid}/${tab}">${label}</a>`);
  if (k === 'know') return `<p class="small"><b>학년</b> ${esc(f.s?.grade || '-')} · <b>담당</b> ${esc(labelOf(f.s?.caseManager))}</p>
    <p class="small"><b>장애 특성·현행 수준</b> ${esc(f.term?.traits || String(f.s?.note || '').replace(/^가상 학생\s*·\s*/, '') || '적지 않음')}</p>
    <p class="small"><b>관찰 메모</b> 전체 ${f.notes.length}건, 최근 30일 ${f.recent.length}건</p>
    ${f.grow.length ? `<ul class="small">${f.grow.map((n) => `<li>${esc(fmtDate(n.date))} ${n.subj ? `[${esc(n.subj)}] ` : ''}${esc(n.text || '')}</li>`).join('')}</ul>` : ''}${link('note', '관찰 메모 열기')}`;
  if (k === 'assess') return `${f.targets.length ? `<ul class="small">${f.targets.map((x) => `<li><b>${esc(x.t.name)}</b> ${x.va.a ? `기초선 ${x.va.a.n}회기 평균 ${x.va.a.mean}` : '기초선 없음'}${x.va.ready ? ` — ${esc(x.va.ready[1].split('.')[0])}` : ''}${x.hyp ? `<br>기능 가설: ${esc(x.hyp)}` : ''}</li>`).join('')}</ul>` : '<p class="small muted">표적행동 없음</p>'}
    <p class="small">기능평가 기록: 동기평가 ${f.mas.length}건 · ABC ${f.abc.length}건 · 의사소통기능평가 ${f.comm ? 1 : 0}건${f.pbFns.length ? ` · 문제행동으로 전하는 기능: ${esc(f.pbFns.join(', '))}` : ''}</p>${link('fba', '기능평가 열기')} ${link('behavior', '기초선 열기')}`;
  if (k === 'goals') return f.goals.length ? `<ol class="small fl-goals">${f.goals.map((x) => { const g = x.g; return `<li><span class="tag">${esc(g.domain || '')}</span> ${esc(g.condition || '')} <b>${esc(g.behavior || '')}</b> ${esc(g.criterion || '')}
      ${g.std?.text ? `<br><small>성취기준 ${g.std.code ? `[${esc(g.std.code)}] ` : ''}${esc(g.std.text)}${g.unit ? ` · 단원 ${esc(g.unit)}` : ''}${g.lesson ? ` · ${esc(g.lesson)}` : ''}</small>` : ''}</li>`; }).join('')}</ol>${link('goals', 'IEP 목표 열기')}` : `<p class="small muted">목표가 없습니다.</p>${print ? '' : `<button type="button" class="ghost sm" data-act="iep-gen" data-sid="${sid}">IEP 생성기</button>`}`;
  if (k === 'plan') { const sup = [...new Set(f.goals.flatMap((x) => x.sup))];
    return `${sup.length ? `<p class="small"><b>지원과 조정</b></p><ul class="small">${sup.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="small muted">목표에 적힌 지원·조정이 없습니다(IEP 생성기로 만든 목표에 들어갑니다).</p>'}
      ${f.accs.length ? `<p class="small"><b>평가조정</b></p><ul class="small">${f.accs.map((a) => `<li>${esc(a.subject)}: ${CATS.map(([kk, l]) => ((a[kk] || []).length ? `${l} ${(a[kk] || []).map(esc).join(', ')}` : '')).filter(Boolean).join(' / ')}</li>`).join('')}</ul>` : ''}${link('accom', '평가조정 열기')}`; }
  if (k === 'beh') return `${f.targets.map((x) => `<div class="fl-beh"><p class="small"><b>${esc(x.t.name)}</b> <small>${esc(METHOD_LABEL[x.t.method] || '빈도')} · ${x.t.interventionStart ? `${esc(fmtDate(x.t.interventionStart))}부터 중재` : '기초선 단계'}${x.va.effect ? ` · ${esc(x.va.effect[1].split('.')[0])}` : ''}</small></p>
      ${x.fns.map((fn) => `<p class="tiny"><b>${esc(FN[fn])}</b> 예방: ${esc(STRAT[fn].A[0])} / 교체행동: ${esc(STRAT[fn].B[0])} / 결과: ${esc(STRAT[fn].C[0])}</p>`).join('')}</div>`).join('') || '<p class="small muted">표적행동 없음</p>'}
    <p class="small"><b>행동지원 시각자료</b></p>${visSection(sid, { edit: !print })}
    <p class="small">위기행동 사후 기록 ${f.incs.length}건${f.incs.length ? `(최근 ${esc(fmtDate(f.incs[0].date))})` : ''}</p>${link('crisis', '사후 기록 열기')}`;
  if (k === 'prog') return f.goals.length ? `<ul class="small fl-prog">${f.goals.map((x) => `<li><span>${esc(x.g.domain || '')}</span>${spark(x.vals, x.g.target)}<span>${x.vals.length ? `${x.vals.length}회 · 처음 ${x.vals[0]} → 마지막 ${x.last} (목표 ${esc(x.g.target)})` : '측정 없음'}</span>${x.vals.length ? `<span class="tag ${x.met ? 'ok' : ''}">${x.met ? '목표 도달' : '진행'}</span>` : ''}</li>`).join('')}</ul>${link('goals', '측정값 넣기')}` : '<p class="small muted">목표가 없습니다.</p>';
  if (k === 'term') return f.term ? `<p class="small">${esc(f.term.from)} ~ ${esc(f.term.to)} 저장 · ${esc(nameOf(f.term.updatedBy))}</p><p class="small pre">${esc((f.term.opinion || '').slice(0, 400))}${(f.term.opinion || '').length > 400 ? '…' : ''}</p>${link('term', '학기말 종합 열기')}` : `<p class="small muted">아직 저장한 학기말 종합이 없습니다.</p>${link('term', '학기말 종합 만들기')}`;
  return '';
}

// 큰 그림: 일곱 영역을 학생 둘레에 고리로 놓고, 영역 사이 흐름(실선)과 서로 주고받는 자료(점선)를 잇는다.
// 영역을 누르면 아래에 그 영역 내용이 펼쳐지고, 작은 글씨(하위 기록)를 누르면 해당 기록 화면으로 간다.
const NODE_TABS = {
  know: [['관찰 메모', 'note'], ['학생 정보', 'now']],
  assess: [['기초선', 'behavior'], ['기능평가', 'fba']],
  goals: [['IEP 목표', 'goals']],
  plan: [['평가조정', 'accom'], ['IEP 목표', 'goals']],
  beh: [['행동 기록', 'behavior'], ['위기행동', 'crisis']],
  prog: [['측정값', 'goals'], ['그래프', 'behavior']],
  term: [['학기말 종합', 'term']]
};
// 영역 사이 연결: [보내는 영역, 받는 영역, 무엇이 넘어가는지]
const LINKS = [
  ['know', 'assess', '관찰한 사실'], ['assess', 'goals', '현행 수준'], ['goals', 'plan', '목표에 맞춘 지원'], ['plan', 'beh', '수업 속 지원'],
  ['beh', 'prog', '중재 기록'], ['prog', 'term', '한 학기 변화'], ['term', 'know', '다음 IEP로']
];
const CROSS = [['assess', 'beh', '기능 가설 → 중재 전략'], ['prog', 'goals', '경고 → 목표 조정'], ['know', 'plan', '장애 특성 → 지원·조정']];

function nodeFacts(k, f) {
  const n = (x) => x.length;
  if (k === 'know') return [`관찰 메모 ${n(f.notes)}건`, `최근 30일 ${n(f.recent)}건`];
  if (k === 'assess') { const hyp = f.targets.find((x) => x.p.top); return [`기초선 ${f.targets.filter((x) => x.va.a).length}/${n(f.targets)}개 행동`, hyp ? `기능: ${FN[hyp.p.top]}` : `기능평가 ${n(f.mas) + n(f.abc) + (f.comm ? 1 : 0)}건`]; }
  if (k === 'goals') return [`목표 ${n(f.goals)}개`, `성취기준 연결 ${f.goals.filter((x) => x.g.std?.text).length}개`];
  if (k === 'plan') return [`지원·조정 ${new Set(f.goals.flatMap((x) => x.sup)).size}가지`, `평가조정 ${n(f.accs)}과목`];
  if (k === 'beh') return [`중재 ${f.targets.filter((x) => x.t.interventionStart).length}/${n(f.targets)}개 행동`, `그림 ${n(f.vis)} · 사후 기록 ${n(f.incs)}`];
  if (k === 'prog') { const m = f.goals.reduce((a, x) => a + x.vals.length, 0); return [`측정 ${m}회`, `도달 ${f.goals.filter((x) => x.met).length}/${n(f.goals)}`]; }
  if (k === 'term') return f.term ? ['종합 저장됨', `${f.term.from || ''}~`] : ['아직 없음', '학기말에 작성'];
  return [];
}

function fmNodes(f, sid, sel, pos, nw, nh, print) {
  return STEPS.map(([k, l], i) => { const [x, y] = pos[k]; const st = f.status[k]; const facts = nodeFacts(k, f);
    const chips = print ? '' : NODE_TABS[k].map(([cl, tab], j) => `<a href="#/student/${sid}/${tab}" class="fm-chip"><text x="${x - nw / 2 + 14 + j * 92}" y="${y + nh / 2 - 12}">${esc(cl)} ›</text></a>`).join('');
    return `<g class="fm-node ${st} ${sel === k ? 'sel' : ''}" ${print ? '' : `data-act="fl-node" data-k="${k}" data-sid="${sid}" role="button" tabindex="0" aria-pressed="${sel === k}" aria-label="${i + 1}. ${esc(l)} — ${esc(facts.join(', '))}. 눌러서 내용 보기"`}>
      <rect x="${x - nw / 2}" y="${y - nh / 2}" width="${nw}" height="${nh}" rx="16" class="fm-box"/>
      <circle cx="${x - nw / 2 + 22}" cy="${y - nh / 2 + 22}" r="13" class="fm-num"/><text x="${x - nw / 2 + 22}" y="${y - nh / 2 + 27}" class="fm-numt">${st === 'ok' ? '✓' : i + 1}</text>
      <text x="${x - nw / 2 + 42}" y="${y - nh / 2 + 28}" class="fm-t">${esc(l)}</text>
      ${facts.map((t, j) => `<text x="${x - nw / 2 + 14}" y="${y - nh / 2 + 52 + j * 18}" class="fm-f">${esc(t)}</text>`).join('')}
    </g>${chips}`; }).join('');
}
export function flowMap(f, sid, sel = '', print = false) {
  const W = 1000, H = 640, cx = 500, cy = 318, rx = 375, ry = 232, nw = 210, nh = 104;
  const pos = {}; STEPS.forEach(([k], i) => { const a = (-90 + (360 / STEPS.length) * i) * Math.PI / 180; pos[k] = [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
  const edge = ([x1, y1], [x2, y2], hw, hh) => { const dx = x2 - x1, dy = y2 - y1; const t = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6)); return [x1 + dx * t, y1 + dy * t]; };
  const seg = (a, b, pad = 6) => { const p1 = edge(pos[a], pos[b], nw / 2 + pad, nh / 2 + pad), p2 = edge(pos[b], pos[a], nw / 2 + pad, nh / 2 + pad); return [p1, p2]; };
  const flow = LINKS.map(([a, b, l]) => { const [[x1, y1], [x2, y2]] = seg(a, b); const mx = (x1 + x2) / 2, my = (y1 + y2) / 2; const ox = (mx - cx) * 0.06, oy = (my - cy) * 0.06;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="fm-flow" marker-end="url(#fm-ar)"/><text x="${mx + ox}" y="${my + oy}" class="fm-ll">${esc(l)}</text>`; }).join('');
  const cross = CROSS.map(([a, b, l]) => { const [[x1, y1], [x2, y2]] = seg(a, b, 8); const qx = (x1 + x2) / 2 + (cx - (x1 + x2) / 2) * 0.35, qy = (y1 + y2) / 2 + (cy - (y1 + y2) / 2) * 0.35;
    const t = 0.27, bx = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * qx + t * t * x2, by = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * qy + t * t * y2;
    return `<path d="M${x1},${y1} Q${qx},${qy} ${x2},${y2}" class="fm-cross" marker-end="url(#fm-ar2)"/><text x="${bx}" y="${by - 5}" class="fm-cl">${esc(l)}</text>`; }).join('');
  const nodes = fmNodes(f, sid, sel, pos, nw, nh, print);
  const s = f.s;
  const center = `<g class="fm-center"><circle cx="${cx}" cy="${cy}" r="78" class="fm-cbg"/><circle cx="${cx}" cy="${cy - 28}" r="15" class="fm-cfg"/><path d="M${cx - 26},${cy + 12} c4,-16 14,-22 26,-22 s22,6 26,22" class="fm-cfg"/>
    <text x="${cx}" y="${cy + 34}" class="fm-ct">${esc(s?.alias || '')}</text><text x="${cx}" y="${cy + 52}" class="fm-cs">${esc(s?.grade || '')} · IEP 순환</text></g>`;
  return `<svg class="fm" viewBox="0 0 ${W} ${H}" role="group" aria-label="IEP 전체 흐름 도식: 학생을 가운데 두고 일곱 영역이 고리로 이어지며, 점선은 영역끼리 주고받는 자료">
    <defs><marker id="fm-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="fm-arh"/></marker>
    <marker id="fm-ar2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="fm-arh2"/></marker></defs>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" class="fm-ring"/>${center}${cross}${flow}${nodes}</svg>`;
}


// 휴대폰용 세로 그림: 같은 일곱 영역을 위에서 아래로, 마지막 영역에서 처음으로 돌아가는 화살표는 왼쪽, 서로 주고받는 자료는 오른쪽 곡선
export function flowMapV(f, sid, sel = '') {
  const W = 440, nw = 210, nh = 104, x0 = 205, top = 130, gap = 150, H = top + gap * (STEPS.length - 1) + nh / 2 + 30;
  const pos = {}; STEPS.forEach(([k], i) => { pos[k] = [x0, top + i * gap]; });
  const idx = Object.fromEntries(STEPS.map(([k], i) => [k, i]));
  const flow = LINKS.map(([a, b, l]) => {
    const [xa, ya] = pos[a], [xb, yb] = pos[b];
    if (idx[b] === idx[a] + 1) return `<line x1="${xa}" y1="${ya + nh / 2 + 4}" x2="${xb}" y2="${yb - nh / 2 - 6}" class="fm-flow" marker-end="url(#fmv-ar)"/><text x="${xa + 10}" y="${(ya + yb) / 2 + 4}" class="fm-ll" style="text-anchor:start">${esc(l)}</text>`;
    const lx = xa - nw / 2 - 6;
    return `<path d="M${lx},${ya} C${18},${ya} ${18},${yb} ${lx},${yb}" class="fm-flow" fill="none" marker-end="url(#fmv-ar)"/><text x="16" y="${(ya + yb) / 2}" class="fm-ll" transform="rotate(-90 16 ${(ya + yb) / 2})">${esc(l)}</text>`;
  }).join('');
  const cross = CROSS.map(([a, b, l], j) => { const [xa, ya] = pos[a], [xb, yb] = pos[b]; const rx = xa + nw / 2 + 6, bx = rx + 40 + j * 22;
    return `<path d="M${rx},${ya + 10} C${bx},${ya + 10} ${bx},${yb - 10} ${rx},${yb - 10}" class="fm-cross" marker-end="url(#fmv-ar2)"/><text x="${bx - 6}" y="${(ya + yb) / 2}" class="fm-cl" transform="rotate(90 ${bx - 6} ${(ya + yb) / 2})">${esc(l)}</text>`; }).join('');
  const s = f.s;
  const head = `<g class="fm-center"><rect x="${x0 - nw / 2}" y="8" width="${nw}" height="60" rx="30" class="fm-cbg"/><circle cx="${x0 - nw / 2 + 30}" cy="31" r="10" class="fm-cfg"/><path d="M${x0 - nw / 2 + 14},58 c3,-11 9,-15 16,-15 s13,4 16,15" class="fm-cfg"/>
    <text x="${x0 + 18}" y="35" class="fm-ct">${esc(s?.alias || '')}</text><text x="${x0 + 18}" y="54" class="fm-cs">${esc(s?.grade || '')} · IEP 순환</text></g>
    <line x1="${x0}" y1="70" x2="${x0}" y2="${top - nh / 2 - 6}" class="fm-flow" marker-end="url(#fmv-ar)"/>`;
  return `<svg class="fm fm-v" viewBox="0 0 ${W} ${H}" role="group" aria-label="IEP 전체 흐름 도식(세로)">
    <defs><marker id="fmv-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="fm-arh"/></marker>
    <marker id="fmv-ar2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="fm-arh2"/></marker></defs>
    ${head}${cross}${flow}${fmNodes(f, sid, sel, pos, nw, nh, false)}</svg>`;
}
const selBy = {};
export function flowHtml(sid, print = false) {
  const f = collectFlow(sid);
  const sel = selBy[sid] || '';
  const legend = `<p class="tiny muted fm-legend"><span class="fm-k ok"></span>자료 있음 <span class="fm-k part"></span>진행 중 <span class="fm-k empty"></span>비어 있음 · 실선 화살표 = IEP 순서 · 점선 = 영역끼리 주고받는 자료</p>`;
  if (print) return `<div class="fl fl-print"><h2 class="tr-title">IEP 전체 흐름 — ${esc(f.s?.alias || '')}</h2><p class="small">작성 ${esc(todayStr())} · 가상 학생 시연 자료</p>
    ${flowMap(f, sid, '', true)}${legend}
    ${STEPS.map(([k, l, d], i) => `<section class="card fl-sec"><h3 class="h3"><span class="fl-n">${i + 1}</span> ${l} <small class="muted">${d}</small></h3>${stepBody(k, f, sid, true)}</section>`).join('')}</div>`;
  const i = STEPS.findIndex(([k]) => k === sel);
  const detail = i < 0 ? '<section class="card fm-detail fm-hint"><p class="small">위 그림에서 영역을 누르면 그 영역에 쌓인 내용이 여기에 펼쳐집니다. 영역 아래 작은 글씨(예: 기능평가 ›)를 누르면 그 기록 화면으로 바로 갑니다.</p></section>'
    : `<section class="card fm-detail" id="fl-${sel}" tabindex="-1"><div class="goal-head"><h3 class="h3"><span class="fl-n">${i + 1}</span> ${STEPS[i][1]} <small class="muted">${STEPS[i][2]}</small></h3><span class="grow"></span>
      <span class="tag ${f.status[sel] === 'ok' ? 'ok' : f.status[sel] === 'part' ? 'warn' : ''}">${ST_LABEL[f.status[sel]]}</span>
      ${i > 0 ? `<button type="button" class="ghost sm" data-act="fl-node" data-sid="${sid}" data-k="${STEPS[i - 1][0]}">‹ 앞 영역</button>` : ''}${i < STEPS.length - 1 ? `<button type="button" class="ghost sm" data-act="fl-node" data-sid="${sid}" data-k="${STEPS[i + 1][0]}">다음 영역 ›</button>` : ''}
      <button type="button" class="ghost sm" data-act="fl-node" data-sid="${sid}" data-k="">닫기</button></div>${stepBody(sel, f, sid, false)}</section>`;
  return `<div class="fl"><section class="card fm-wrap"><div class="fm-h">${flowMap(f, sid, sel)}</div><div class="fm-vw">${flowMapV(f, sid, sel)}</div>${legend}</section>${detail}</div>`;
}

export function flowTab(s) {
  const sid = s.id;
  useSub('ev:' + sid, 'bevents', { sid }, (r) => { S.eventsBy[sid] = r; });
  useSub('memo:' + sid, 'memos', { sid }, (r) => { S.memosBy[sid] = r.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); });
  return `<div class="bar"><span class="small muted">학생의 IEP가 영역마다 어떻게 이어지는지 한 장의 그림으로 봅니다.</span><span class="grow"></span>
    <button type="button" class="primary" data-act="fl-print" data-sid="${sid}">전체 인쇄</button></div>
    ${flowHtml(sid)}`;
}

on('fl-node', (el) => {
  const { sid, k } = el.dataset; selBy[sid] = selBy[sid] === k && el.closest('svg') ? '' : k; rerender();
  if (selBy[sid]) setTimeout(() => { const d = document.querySelector('.fm-detail'); d?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 30);
});
// 그림 속 영역도 키보드(Enter·Space)로 누를 수 있게
document.addEventListener('keydown', (e) => { const g = e.target.closest?.('g[data-act="fl-node"]'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
on('fl-print', (el) => {
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = flowHtml(el.dataset.sid, true);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); setTimeout(() => window.print(), 50);
});
