// 그래프(SVG 직접 그리기): 진전도 그래프, 행동 기초선 그래프
import { esc, parseDate, fmtDate, round1, mean, median, slope, diffDays } from './util.js';

const W = 640, H = 240, L = 44, R = 16, T = 18, B = 34;

function axes(ymax, ylabel) {
  const steps = 4, out = [];
  for (let i = 0; i <= steps; i++) {
    const v = (ymax / steps) * i, y = T + (H - T - B) * (1 - i / steps);
    out.push(`<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="gl"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" class="tick">${round1(v)}</text>`);
  }
  out.push(`<text x="${L}" y="12" class="axis-label">${esc(ylabel)}</text>`);
  return out.join('');
}

// 진전도: 목표선(시작 기초값 → 목표일 목표값)과 측정점, 경고 표시
export function progressChart(goal, warn) {
  const pts = [...(goal.points || [])].sort((a, b) => (a.d < b.d ? -1 : 1));
  const d0 = goal.startDate || pts[0]?.d, d1 = goal.targetDate || pts.at(-1)?.d;
  if (!d0 || !d1) return '<p class="muted">시작일과 목표일을 넣으면 그래프가 나옵니다.</p>';
  const span = Math.max(1, diffDays(d1, d0));
  const ymax = Math.max(Number(goal.target) || 0, Number(goal.baseline) || 0, ...pts.map((p) => +p.v), 1) * 1.15;
  const X = (d) => L + (W - L - R) * Math.min(1.05, Math.max(-0.02, diffDays(d, d0) / span));
  const Y = (v) => T + (H - T - B) * (1 - v / ymax);
  const aim = `<line x1="${X(d0)}" y1="${Y(+goal.baseline || 0)}" x2="${X(d1)}" y2="${Y(+goal.target || 0)}" class="aim"/>`;
  const line = pts.length > 1 ? `<polyline class="series" points="${pts.map((p) => `${X(p.d)},${Y(+p.v)}`).join(' ')}"/>` : '';
  const warnSet = new Set((warn?.idx || []));
  const dots = pts.map((p, i) => `<circle cx="${X(p.d)}" cy="${Y(+p.v)}" r="5" class="${warnSet.has(i) ? 'dot warn' : 'dot'}"><title>${esc(fmtDate(p.d))} · ${esc(p.v)}</title></circle>`).join('');
  const labels = `<text x="${X(d0)}" y="${H - 12}" class="tick">${esc(fmtDate(d0))} 시작</text><text x="${X(d1)}" y="${H - 12}" text-anchor="end" class="tick">${esc(fmtDate(d1))} 목표</text>`;
  const summary = `${goal.measure || '측정값'} 진전도. 기초 ${goal.baseline}, 목표 ${goal.target}. 측정 ${pts.length}회, 최근 값 ${pts.at(-1)?.v ?? '없음'}.`;
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}">${axes(ymax, goal.measure || '측정값')}${aim}${line}${dots}${labels}</svg>
  <figcaption><span class="lg aim-lg"></span>목표선 <span class="lg dot-lg"></span>측정값 <span class="lg warn-lg"></span>목표선 아래(경고)</figcaption></figure>`;
}

// 진전도 경고: 최근 n회 연속으로 목표선보다 나쁘면 경고
export function progressWarning(goal, n = 3) {
  const pts = [...(goal.points || [])].sort((a, b) => (a.d < b.d ? -1 : 1));
  if (pts.length < n || !goal.startDate || !goal.targetDate) return null;
  const span = Math.max(1, diffDays(goal.targetDate, goal.startDate));
  const aimAt = (d) => (+goal.baseline || 0) + ((+goal.target || 0) - (+goal.baseline || 0)) * (diffDays(d, goal.startDate) / span);
  const down = goal.direction === 'down';
  const bad = (p) => (down ? +p.v > aimAt(p.d) : +p.v < aimAt(p.d));
  const last = pts.slice(-n);
  if (last.every(bad)) return { idx: last.map((_, i) => pts.length - n + i), n };
  return null;
}

// 행동 자료를 날짜별 값으로 묶는다. 하루 안의 관찰 회기(예: 2교시·4교시)를 합친 값이다.
// 빈도는 하루 합계 횟수, 지속시간은 하루 합계 분, 간격기록은 하루 전체 간격 중 발생 간격 %, 잠재시간은 하루 평균 초.
// 두 번째 관찰자(일치도용, ioa) 기록은 그래프에 넣지 않고 관찰자 간 일치도 계산에만 쓴다.
export function behaviorSeries(target, events) {
  const byDay = new Map();
  events.filter((e) => e.targetId === target.id && !e.ioa).forEach((e) => {
    const d = e.date; if (!byDay.has(d)) byDay.set(d, { sum: 0, n: 0, yes: 0, all: 0 });
    const b = byDay.get(d);
    if (e.type === 'session') return;
    if (e.type === 'int') { const r = (e.results || []).filter((x) => x === true || x === false); b.all += r.length; b.yes += r.filter(Boolean).length; return; }
    if (e.type === 'lat') { if (e.end) { b.sum += (e.end - e.at) / 1000; b.n += 1; } return; }
    if (target.method === 'dur') b.sum += e.end ? (e.end - e.at) / 60000 : 0;
    else b.sum += 1;
  });
  const val = (b) => target.method === 'int' ? (b.all ? (b.yes / b.all) * 100 : 0) : target.method === 'lat' ? (b.n ? b.sum / b.n : 0) : b.sum;
  return [...byDay.entries()].filter(([, b]) => target.method !== 'int' || b.all).filter(([, b]) => target.method !== 'lat' || b.n)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, b]) => ({ d, v: round1(val(b)), phase: target.interventionStart && d >= target.interventionStart ? 'B' : 'A' }));
}

export const METHOD_LABEL = { freq: '빈도', dur: '지속시간', int: '간격기록', lat: '잠재시간' };
export const INT_LABEL = { partial: '부분간격', whole: '전체간격', momentary: '순간표집' };
export function unitOf(target) {
  return { dur: '하루(관찰 회기 합계) 지속시간(분)', int: '하루 전체 간격 중 발생 간격(%)', lat: '하루 평균 잠재시간(초)' }[target.method] || '하루(관찰 회기 합계) 발생 횟수';
}

// 관찰자 간 일치도: 두 번째 관찰자(ioa) 기록이 있는 날마다 주 관찰자 기록과 비교한다.
// 빈도·지속시간·잠재시간은 총합(평균) 일치도(작은 값 ÷ 큰 값 × 100), 간격기록은 간격별 일치도(일치 간격 ÷ 전체 간격 × 100).
export function ioaDays(target, events) {
  const evs = events.filter((e) => e.targetId === target.id);
  const days = [...new Set(evs.filter((e) => e.ioa).map((e) => e.date))].sort();
  return days.map((d) => {
    const prim = evs.filter((e) => e.date === d && !e.ioa), sec = evs.filter((e) => e.date === d && e.ioa);
    let a, b, pct, how;
    if (target.method === 'int') {
      const r1 = prim.filter((e) => e.type === 'int').flatMap((e) => e.results || []), r2 = sec.filter((e) => e.type === 'int').flatMap((e) => e.results || []);
      const n = Math.min(r1.length, r2.length); let agree = 0, cmp = 0;
      for (let i = 0; i < n; i++) { if (r1[i] == null || r2[i] == null) continue; cmp++; if (r1[i] === r2[i]) agree++; }
      pct = cmp ? (agree / cmp) * 100 : null; a = `${r1.filter(Boolean).length}/${r1.length}`; b = `${r2.filter(Boolean).length}/${r2.length}`; how = '간격별';
    } else {
      const total = (list) => {
        if (target.method === 'dur') return list.filter((e) => e.type === 'dur').reduce((x, e) => x + ((e.end || e.at) - e.at) / 60000, 0);
        if (target.method === 'lat') { const l = list.filter((e) => e.type === 'lat' && e.end); return l.length ? l.reduce((x, e) => x + (e.end - e.at) / 1000, 0) / l.length : 0; }
        return list.filter((e) => e.type === 'freq').length;
      };
      a = round1(total(prim)); b = round1(total(sec));
      pct = a === 0 && b === 0 ? 100 : Math.min(a, b) / Math.max(a, b) * 100; how = target.method === 'lat' ? '평균' : '총합';
    }
    return { d, a, b, pct: pct == null ? null : round1(pct), how, by: [...new Set(sec.map((e) => e.createdBy))] };
  });
}

// 기초선 판단 자료: 회기 수, 평균, 중앙값, 범위, 추세, 중앙값 ±20% 안 비율(참고)
export function baselineStats(series) {
  const a = series.filter((p) => p.phase === 'A').map((p) => p.v);
  if (!a.length) return { n: 0 };
  const md = median(a);
  const within = md === 0 ? a.filter((v) => v === 0).length / a.length : a.filter((v) => Math.abs(v - md) <= md * 0.2).length / a.length;
  const sl = slope(a);
  return { n: a.length, mean: round1(mean(a)), median: round1(md), min: Math.min(...a), max: Math.max(...a), slope: round1(sl), within: Math.round(within * 100) };
}

export function behaviorChart(target, series, marks = []) {
  if (!series.length) return '<p class="muted">아직 기록이 없습니다. 기록 버튼을 누르면 회기별 그래프가 그려집니다.</p>';
  const unit = unitOf(target);
  const ymax = target.method === 'int' ? 100 : Math.max(...series.map((p) => p.v), 1) * 1.2;
  const n = series.length;
  const X = (i) => L + 14 + (W - L - R - 28) * (n === 1 ? 0.5 : i / (n - 1));
  const Y = (v) => T + (H - T - B) * (1 - v / ymax);
  const segs = ['A', 'B'].map((ph) => {
    const idx = series.map((p, i) => [p, i]).filter(([p]) => p.phase === ph);
    return idx.length > 1 ? `<polyline class="series ${ph === 'B' ? 'phase-b' : ''}" points="${idx.map(([p, i]) => `${X(i)},${Y(p.v)}`).join(' ')}"/>` : '';
  }).join('');
  const dots = series.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.v)}" r="5" class="dot ${p.phase === 'B' ? 'phase-b' : ''}"><title>${esc(fmtDate(p.d))} · ${p.v}</title></circle>`).join('');
  const firstB = series.findIndex((p) => p.phase === 'B');
  const phaseLine = firstB > 0 ? `<line x1="${(X(firstB - 1) + X(firstB)) / 2}" x2="${(X(firstB - 1) + X(firstB)) / 2}" y1="${T}" y2="${H - B}" class="phase-line"/><text x="${(X(firstB - 1) + X(firstB)) / 2 + 6}" y="${T + 12}" class="tick">중재</text>` : '';
  const st = baselineStats(series);
  const lastA = firstB > 0 ? firstB - 1 : n - 1;
  const meanLine = st.n ? `<line x1="${X(0)}" x2="${X(lastA)}" y1="${Y(st.mean)}" y2="${Y(st.mean)}" class="mean"/>` : '';
  const ticks = series.map((p, i) => (n <= 10 || i % Math.ceil(n / 8) === 0 ? `<text x="${X(i)}" y="${H - 12}" text-anchor="middle" class="tick">${esc(fmtDate(p.d).replace(/\(.\)/, ''))}</text>` : '')).join('');
  const markSet = new Set(marks);
  const stars = series.map((p, i) => (markSet.has(p.d) ? `<text x="${X(i)}" y="${Y(p.v) - 10}" text-anchor="middle" class="crisis-mark">★<title>${esc(fmtDate(p.d))} 위기행동 사후 기록</title></text>` : '')).join('');
  const summary = `${target.name} ${unit}. 기초선 ${st.n}회기, 평균 ${st.mean ?? 0}.${marks.length ? ` 위기행동 ${marks.length}건 표시.` : ''}`;
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}">${axes(ymax, unit)}<text x="${L + 4}" y="${T + 12}" class="tick">기초선(A)</text>${meanLine}${segs}${dots}${stars}${phaseLine}${ticks}</svg>
  <figcaption><span class="lg dot-lg"></span>기초선 <span class="lg b-lg"></span>중재 <span class="lg mean-lg"></span>기초선 평균${marks.length ? ' <span class="crisis-mark" aria-hidden="true">★</span> 위기행동 사후 기록' : ''}</figcaption></figure>`;
}

export const parseD = parseDate;
