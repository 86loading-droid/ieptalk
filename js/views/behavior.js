// 교사용 행동 기록 화면: 모든(또는 내) 학생의 즉시 기록 버튼과 오늘 기록
import { esc, todayStr } from '../util.js';
import { S, on, rerender, useSub } from '../state.js';
import { recordCard, eventRow } from './record.js';
import { behaviorSeries, baselineStats } from '../charts.js';

export function render() {
  const onlyMine = S.ui.behMine ?? true;
  const list = S.students.filter((s) => !onlyMine || s.caseManager === S.me.uid || (s.teamUids || []).includes(S.me.uid));
  list.forEach((s) => useSub('ev:' + s.id, 'bevents', { sid: s.id }, (r) => { S.eventsBy[s.id] = r; }));
  const cards = list.map((s) => {
    const evs = S.eventsBy[s.id] || [];
    const targets = S.targetsBy[s.id] || [];
    const status = targets.map((t) => {
      const st = baselineStats(behaviorSeries(t, evs));
      const phase = t.interventionStart ? '중재 중' : st.n >= 5 ? '기초선 충분' : st.n >= 3 ? '기초선 최소 충족' : `기초선 ${st.n}회기`;
      return `<a class="tag" href="#/student/${s.id}/behavior">${esc(t.name)} · ${phase}</a>`;
    }).join(' ');
    return recordCard(s, targets, evs).replace('</h3>', `</h3><div class="tags">${status}</div>`);
  }).join('');
  const todays = list.flatMap((s) => (S.eventsBy[s.id] || []).filter((e) => e.date === todayStr())).sort((a, b) => b.at - a.at);
  return `<div class="page-head"><h1>행동 기록</h1>
    <p class="muted">생활지도 중 문제행동이 일어나면 바로 누르세요. 쌓인 기록은 학생 화면의 기초선 그래프가 됩니다.</p>
    <label class="switch"><input type="checkbox" data-change="beh-mine" ${onlyMine ? 'checked' : ''}> 내 담당·팀 학생만</label></div>
    ${cards || '<section class="card"><p>표시할 학생이 없습니다.</p></section>'}
    <section class="card"><h2 class="h3">오늘 기록 (${todays.filter((e) => e.type !== 'session').length}건)</h2>
    <ul class="rows">${todays.map((e) => eventRow(e, { showBy: true })).join('') || '<li class="muted">아직 없습니다.</li>'}</ul></section>`;
}

on('beh-mine', (el) => { S.ui.behMine = el.checked; rerender(); });
