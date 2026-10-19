// 기초선·중재 자료의 시각적 분석과 중재 솔루션 제안.
// 시각적 분석 여섯 요소(수준·추세·변동성·즉각성·중첩·일관성)를 문장으로 풀고(Kratochwill 외, 2010 WWC 기준 틀),
// 기능평가 종합(fba.js)의 주된 기능에 맞춰 예방(A)·교체행동(B)·결과(C) 전략을 제안한다.
// 제안은 팀 협의를 돕는 초안이며, 최종 결정은 행동지원팀이 한다.
import { esc, round1, mean, median, slope } from '../util.js';
import { S, on } from '../state.js';
import { behaviorSeries } from '../charts.js';
import { profileFor, abcSummary, hypothesis, FN, commOf, COMM_FNS, COMM_FORMS } from './fba.js';
import { copyText } from './pireport.js';
import { toast } from '../util.js';

const lowerIsBetter = (t) => t.goalDirection !== 'up'; // 문제행동은 줄어드는 것이 좋다(기본)

export function visualAnalysis(t, series) {
  const A = series.filter((p) => p.phase === 'A').map((p) => p.v);
  const B = series.filter((p) => p.phase === 'B').map((p) => p.v);
  const down = lowerIsBetter(t);
  const desc = (arr) => {
    if (!arr.length) return null;
    const md = median(arr), m = mean(arr), sl = slope(arr);
    const within = md === 0 ? arr.filter((v) => v === 0).length / arr.length : arr.filter((v) => Math.abs(v - md) <= md * 0.25).length / arr.length;
    const rel = Math.abs(sl) / Math.max(1e-9, m || 1);
    const trend = arr.length < 3 ? '판단 이름' : rel < 0.05 ? '평평함' : sl > 0 ? '올라감' : '내려감';
    return { n: arr.length, mean: round1(m), median: round1(md), min: Math.min(...arr), max: Math.max(...arr), slope: round1(sl), stab: Math.round(within * 100), trend };
  };
  const a = desc(A), b = desc(B);
  const out = { a, b, lines: [], ready: null, effect: null };
  if (!a) { out.lines.push('기초선 자료가 아직 없습니다.'); return out; }
  // 기초선 판단
  const improving = (down && a.trend === '내려감') || (!down && a.trend === '올라감');
  const worsening = (down && a.trend === '올라감') || (!down && a.trend === '내려감');
  out.lines.push(`기초선 ${a.n}회기: 평균 ${a.mean}, 중앙값 ${a.median}, 범위 ${a.min}~${a.max}, 추세 ${a.trend}, 안정성 ${a.stab}%(중앙값 ±25% 안).`);
  if (a.n < 3) out.ready = ['low', '기초선이 3회기 미만입니다. 최소 3회기, 가능하면 5회기 이상 모읍니다.'];
  else if (improving) out.ready = ['mid', '기초선이 이미 좋아지는 방향으로 움직입니다. 중재 없이도 변할 수 있으니 2~3회기 더 모아 추세가 멈추는지 봅니다.'];
  else if (a.stab < 60 && a.n < 7) out.ready = ['mid', '기초선 변동이 큽니다. 변동 원인(요일·과목·결석 등)을 ABC 기록으로 확인하고 회기를 더 모읍니다.'];
  else out.ready = ['ok', `${worsening ? '기초선이 나빠지는 방향이거나 ' : ''}안정적이어서 중재를 시작해도 됩니다(${a.n >= 5 ? '권장 기준 5회기 충족' : '최소 기준 3회기 충족'}).`];
  if (!b) return out;
  // 중재 비교
  const lastA = A.slice(-3), firstB = B.slice(0, 3);
  const imm = round1(mean(firstB) - mean(lastA));
  const lvl = round1(b.mean - a.mean);
  const pct = a.mean ? Math.round((lvl / a.mean) * 100) : null;
  const pnd = down ? Math.round((B.filter((v) => v < a.min).length / B.length) * 100) : Math.round((B.filter((v) => v > a.max).length / B.length) * 100);
  const better = (x) => (down ? x < 0 : x > 0);
  out.lines.push(`중재 ${b.n}회기: 평균 ${b.mean}, 범위 ${b.min}~${b.max}, 추세 ${b.trend}, 안정성 ${b.stab}%.`);
  out.lines.push(`수준: 기초선보다 평균이 ${Math.abs(lvl)} ${lvl === 0 ? '같음' : lvl < 0 ? '낮아짐' : '높아짐'}${pct != null ? `(${pct > 0 ? '+' : ''}${pct}%)` : ''}.`);
  out.lines.push(`즉각성: 기초선 마지막 3회기와 중재 처음 3회기 평균 차이 ${imm > 0 ? '+' : ''}${imm}${better(imm) ? '(바로 좋아짐)' : imm === 0 ? '(변화 없음)' : '(바로 좋아지지 않음)'}.`);
  out.lines.push(`중첩: 중재 회기 중 기초선 ${down ? '최솟값보다 낮은' : '최댓값보다 높은'} 회기 비율(PND) ${pnd}%.`);
  let effect;
  if (b.n < 3) effect = ['low', '중재 자료가 3회기 미만이라 효과를 판단하기 이릅니다.'];
  else if (better(lvl) && pnd >= 70 && b.trend !== (down ? '올라감' : '내려감')) effect = ['ok', `중재 효과의 근거가 ${pnd >= 90 ? '강합니다' : '있습니다'}.`];
  else if (better(lvl) && pnd >= 50) effect = ['mid', '좋아지는 경향은 있으나 기초선과 겹치는 회기가 많아 효과가 분명하지 않습니다.'];
  else effect = ['low', '기초선과 비교해 뚜렷한 개선이 보이지 않습니다.'];
  out.effect = effect;
  out.lines.push('일관성: 같은 단계 안 자료가 비슷한 모양인지 그래프로 함께 확인합니다. 한 번의 A→B 비교는 기능적 관계를 증명하지 못하며, 반전(ABAB)이나 다른 행동·장면에서의 반복이 있어야 강한 근거가 됩니다.');
  return out;
}

// 기능별 근거기반 전략(예방·교체행동·결과). 대표 근거: 기능적 의사소통 훈련(Carr & Durand, 1985), 비유관 강화, 선택 기회, 과제 수정, 높은 확률 요구 연속, 대체행동 차별강화
const STRAT = {
  esc: {
    A: ['과제를 짧게 나누고 쉬운 과제와 섞기(과제 수정·난이도 조절)', '시작 전에 활동 순서·끝나는 시점을 그림 일과표로 예고하기', '과제 순서나 재료를 고르게 하기(선택 기회)', '쉬운 요구 2~3개 뒤 목표 요구 제시하기(높은 확률 요구 연속)'],
    B: ['「쉬어요」·「도와주세요」 카드나 말로 휴식·도움 요청하기(기능적 의사소통 훈련)', '과제 일부를 마치면 짧은 휴식을 받는 약속(먼저-다음)'],
    C: ['요청하면 바로 짧은 휴식을 주고, 점차 과제량을 늘린 뒤 휴식 주기', '문제행동으로는 과제가 없어지지 않게 하되(도피 소거) 안전과 신체적 개입 금지선을 지키기', '과제 참여에 칭찬·토큰 주기(대체행동 차별강화)']
  },
  att: {
    A: ['문제행동이 없을 때 정해진 간격으로 먼저 관심 주기(비유관 강화)', '교사가 다른 학생을 도울 때 할 수 있는 활동과 「기다려요」 시각 단서 주기', '자리를 교사 가까이로 옮기기'],
    B: ['손 들기·「선생님」 부르기·관심 카드 내밀기 등 적절하게 관심 요청하기(기능적 의사소통 훈련)', '친구와 함께하는 역할 주기(또래 관심을 적절히 얻는 기회)'],
    C: ['적절한 요청에는 바로 관심 주기, 문제행동에는 최소한의 반응(계획된 무시, 안전이 우선)', '바른 행동을 구체적으로 칭찬하기(대체행동 차별강화)']
  },
  tan: {
    A: ['「먼저-다음」 판과 타이머로 선호 활동이 언제 오는지 예고하기', '선호 활동을 끝내기 전 2분·1분 예고하기', '하루 일과에 선호 활동 시간을 예측 가능하게 넣기'],
    B: ['원하는 물건·활동을 그림 카드·말로 요구하기(기능적 의사소통 훈련)', '「기다려요」 카드를 받고 짧게 기다리기(기다리기 시간 점차 늘리기)'],
    C: ['적절한 요구에는 바로 또는 약속한 시간에 주기', '문제행동 뒤에는 원하는 것을 주지 않되 적절한 요구로 다시 안내하기', '기다리기에 성공하면 칭찬과 함께 주기']
  },
  sens: {
    A: ['같은 감각을 주는 안전한 대체 활동·도구 제공하기(환경 풍부화)', '빈 시간을 줄이고 손이 바쁜 활동 넣기', '감각 활동 시간을 일과에 정해 두기'],
    B: ['같은 감각을 얻는 다른 행동 가르치기(예: 손 대신 쥐는 공)', '「○○하고 싶어요」로 감각 활동 요청하기'],
    C: ['대체 행동을 할 때 칭찬하기, 문제행동이 이어지면 대체 도구로 조용히 바꿔 주기', '자해처럼 위험한 감각 행동은 보호 장구·환경 조정과 함께 전문가 협의']
  }
};

function replacementComm(sid, fn) {
  const c = commOf(sid)[0];
  if (!c) return '';
  const fnIds = COMM_FNS.filter(([, , f]) => f === fn).map(([id]) => id);
  const forms = {}; Object.values(c.grid || {}).flat().filter((f) => !['pb', 'none'].includes(f)).forEach((f) => { forms[f] = (forms[f] || 0) + 1; });
  const best = Object.entries(forms).sort((a, b) => b[1] - a[1])[0]?.[0];
  const pbList = COMM_FNS.filter(([id]) => fnIds.includes(id) && (c.grid?.[id] || []).includes('pb')).map(([, l]) => l);
  if (!best && !pbList.length) return '';
  const formL = COMM_FORMS.find(([k]) => k === best)?.[1];
  return `${pbList.length ? `의사소통기능평가에서 「${pbList.join(', ')}」을(를) 문제행동으로 전하고 있습니다. ` : ''}${formL ? `학생이 가장 많이 쓰는 「${formL}」 형태로 대체 의사소통을 가르치면 배우기 쉽습니다.` : ''}`;
}

function decisions(va) {
  if (!va.b) return [];
  if (va.effect?.[0] === 'ok') return ['효과가 보이면 지금 중재를 유지하고, 다른 장면·교사에게 일반화하며, 촉구와 강화를 서서히 줄입니다(용암).', '목표 기준에 3회기 연속 도달하면 다음 목표로 올립니다.'];
  if (va.b.n < 5) return ['중재 5회기까지 자료를 더 모은 뒤 다시 판단합니다.', '중재가 계획대로 실행되는지(실행 충실도) 짧은 점검표로 확인합니다.'];
  return ['중재 5회기 이상 개선이 없으면: ① 실행 충실도 점검 ② 기능 가설 재검토(ABC 추가 관찰) ③ 강화제 선호도 다시 확인 ④ 중재 강도·빈도 조정 순서로 팀이 협의합니다.', '위기행동이 함께 늘면 위기행동 지원 계획을 따로 세웁니다.'];
}

export function solutionPanel(s, t) {
  const series = behaviorSeries(t, S.eventsBy[s.id] || []);
  const va = visualAnalysis(t, series);
  const p = profileFor(s.id, t.id);
  const sm = abcSummary(s.id, t.id);
  const fns = p.sc ? (p.mixed ? [p.top, p.second] : [p.top]) : [];
  const strat = fns.map((f) => `<div class="sol-fn"><h4>${esc(FN[f])} 기능일 때</h4>
      <p class="small"><b>예방(앞 상황 바꾸기)</b></p><ul>${STRAT[f].A.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p class="small"><b>교체행동 가르치기</b></p><ul>${STRAT[f].B.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${replacementComm(s.id, f) ? `<p class="small sol-note">${esc(replacementComm(s.id, f))}</p>` : ''}
      <p class="small"><b>결과 바꾸기</b></p><ul>${STRAT[f].C.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('');
  const dec = decisions(va);
  return `<details class="sol" ${series.length ? 'open' : ''}><summary>분석과 솔루션 ${va.effect ? `<span class="tag ${va.effect[0] === 'ok' ? 'ok' : va.effect[0] === 'mid' ? 'warn' : ''}">${va.effect[0] === 'ok' ? '효과 있음' : va.effect[0] === 'mid' ? '효과 불분명' : '효과 미확인'}</span>` : va.ready ? `<span class="tag ${va.ready[0] === 'ok' ? 'ok' : 'warn'}">${va.ready[0] === 'ok' ? '중재 시작 가능' : '기초선 보완'}</span>` : ''}</summary>
    <div class="sol-grid">
      <section><h4>시각적 분석</h4><ul class="small">${va.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        ${va.ready && !va.b ? `<p class="small sol-${va.ready[0]}">${esc(va.ready[1])}</p>` : ''}${va.effect ? `<p class="small sol-${va.effect[0]}">${esc(va.effect[1])}</p>` : ''}
        ${dec.length ? `<p class="small"><b>다음 결정</b></p><ul class="small">${dec.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</section>
      <section><h4>기능 가설</h4>${p.sc ? `<p class="small">${esc(hypothesis(t, p, sm))}</p><p class="tiny muted">근거 ${p.src.length}종 중 ${p.agree}종 일치${p.agree < 2 ? ' — 근거가 하나뿐이면 다른 평가로 확인하세요' : ''}.</p>` : `<p class="small">기능평가 자료가 없습니다. <a href="#/student/${s.id}/fba">기능평가</a>에서 ABC 기록·동기평가를 하면 기능에 맞는 전략을 제안합니다.</p>`}</section>
    </div>
    ${strat ? `<h4>중재 전략 제안</h4><div class="sol-strat">${strat}</div>` : ''}
    <div class="bar"><button type="button" class="ghost sm" data-act="sol-copy" data-sid="${s.id}" data-tid="${t.id}">행동지원계획 초안 복사</button><a class="btn-link sm" href="#/student/${s.id}/fba">기능평가 열기</a></div>
    <p class="tiny muted">근거 틀: 단일대상설계 시각적 분석(Kratochwill 외, 2010), PND(Scruggs 외, 1987), 기능적 의사소통 훈련(Carr & Durand, 1985). 제안은 팀 협의용 초안이며 최종 결정은 행동지원팀이 합니다.</p>
  </details>`;
}

export function planText(s, t) {
  const series = behaviorSeries(t, S.eventsBy[s.id] || []);
  const va = visualAnalysis(t, series);
  const p = profileFor(s.id, t.id), sm = abcSummary(s.id, t.id);
  const fns = p.sc ? (p.mixed ? [p.top, p.second] : [p.top]) : [];
  const L = [];
  L.push(`행동지원계획 초안 — ${s.alias} / 표적행동: ${t.name}`);
  L.push(`1. 조작적 정의: ${t.definition || '[적지 않음]'}${t.examples ? ` (해당 예: ${t.examples})` : ''}${t.nonExamples ? ` (비해당 예: ${t.nonExamples})` : ''}`);
  L.push(`2. 기능 가설: ${p.sc ? hypothesis(t, p, sm) : '[기능평가 필요]'}${p.sc ? ` (근거 ${p.src.map((x) => x.label).join(', ')})` : ''}`);
  L.push(`3. 기초선과 분석:\n- ${va.lines.join('\n- ')}${va.ready && !va.b ? `\n- 판단: ${va.ready[1]}` : ''}${va.effect ? `\n- 판단: ${va.effect[1]}` : ''}`);
  fns.forEach((f, i) => {
    L.push(`${4 + i}. ${FN[f]} 기능 전략\n- 예방: ${STRAT[f].A.join(' / ')}\n- 교체행동: ${STRAT[f].B.join(' / ')}${replacementComm(s.id, f) ? `\n- 참고: ${replacementComm(s.id, f)}` : ''}\n- 결과: ${STRAT[f].C.join(' / ')}`);
  });
  const d = decisions(va);
  if (d.length) L.push(`${4 + fns.length}. 다음 결정: ${d.join(' ')}`);
  L.push('※ 팀 협의용 초안입니다. 신체적 개입은 학교의 위기행동 지원 절차와 금지선을 따릅니다.');
  return L.join('\n');
}

on('sol-copy', async (el) => {
  const s = S.students.find((x) => x.id === el.dataset.sid); const t = (S.targetsBy[s.id] || []).find((x) => x.id === el.dataset.tid);
  const ok = await copyText(planText(s, t));
  toast(ok ? '행동지원계획 초안을 복사했습니다' : '복사하지 못했습니다');
});
