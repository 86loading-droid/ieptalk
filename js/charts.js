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

// 행동 자료를 회기(날짜)별 값으로 묶는다. 빈도는 회기당 횟수, 지속시간은 회기당 총 분.
export function behaviorSeries(target, events) {
  const byDay = new Map();
  events.filter((e) => e.targetId === target.id).forEach((e) => {
    const d = e.date; if (!byDay.has(d)) byDay.set(d, 0);
    if (e.type === 'session') return;
    if (target.method === 'dur') byDay.set(d, byDay.get(d) + (e.end ? (e.end - e.at) / 60000 : 0));
    else byDay.set(d, byDay.get(d) + 1);
  });
  return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, v]) => ({ d, v: round1(v), phase: target.interventionStart && d >= target.interventionStart ? 'B' : 'A' }));
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

export function behaviorChart(target, series) {
  if (!series.length) return '<p class="muted">아직 기록이 없습니다. 기록 버튼을 누르면 회기별 그래프가 그려집니다.</p>';
  const unit = target.method === 'dur' ? '회기당 지속시간(분)' : '회기당 발생 횟수';
  const ymax = Math.max(...series.map((p) => p.v), 1) * 1.2;
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
  const summary = `${target.name} ${unit}. 기초선 ${st.n}회기, 평균 ${st.mean ?? 0}.`;
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}">${axes(ymax, unit)}<text x="${L + 4}" y="${T + 12}" class="tick">기초선(A)</text>${meanLine}${segs}${dots}${phaseLine}${ticks}</svg>
  <figcaption><span class="lg dot-lg"></span>기초선 <span class="lg b-lg"></span>중재 <span class="lg mean-lg"></span>기초선 평균</figcaption></figure>`;
}

export const parseD = parseDate;
