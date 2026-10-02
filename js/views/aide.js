// 보조인력 화면: 휴대폰 첫 화면에 즉시 기록 버튼, 내 기록(본인 것만) 보기·수정
import { esc, fmtDate, todayStr } from '../util.js';
import { S } from '../state.js';
import { recordCard, eventRow } from './record.js';

export function render(route) {
  if (route.name === 'mine') return mine();
  const list = [...S.students].sort((a, b) => (S.targetsBy[b.id] || []).length - (S.targetsBy[a.id] || []).length).map((s) => recordCard(s, S.targetsBy[s.id] || [], S.myEvents)).join('');
  const recent = [...S.myEvents].sort((a, b) => b.at - a.at).slice(0, 5);
  return `<div class="page-head"><h1>행동 기록</h1><p class="muted">행동이 일어나면 버튼을 한 번 누르세요. 내가 남긴 기록만 저장·수정됩니다.</p></div>
    ${list || '<section class="card"><p>배정된 학생이 아직 없습니다. 담당 교사에게 배정을 요청하세요.</p></section>'}
    <section class="card"><h2 class="h3"><a href="#/mine">내 최근 기록 ›</a></h2><ul class="rows">${recent.map((e) => eventRow(e)).join('') || '<li class="muted">아직 남긴 기록이 없습니다.</li>'}</ul></section>`;
}

function mine() {
  const evs = [...S.myEvents].sort((a, b) => b.at - a.at);
  const byDate = new Map();
  evs.forEach((e) => { if (!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date).push(e); });
  const groups = [...byDate.entries()].map(([d, es]) => `<section class="card"><h2 class="h3">${d === todayStr() ? '오늘 · ' : ''}${esc(fmtDate(d))} <small class="muted">${es.filter((e) => e.type !== 'session').length}건</small></h2><ul class="rows">${es.map((e) => eventRow(e)).join('')}</ul></section>`).join('');
  return `<div class="page-head"><h1>내 기록</h1><p class="muted">내가 저장한 기록만 보입니다. 누르면 고칠 수 있습니다.</p></div>${groups || '<section class="card"><p>아직 남긴 기록이 없습니다.</p></section>'}`;
}
