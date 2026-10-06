// 내 책상: 첫 화면 위쪽 위젯 묶음(시계, 지금 이 시간·다음 시간, D-Day, 이달 달력, 할 일, 메모, 주간 시간표, 학사일정)
// 시간표·메모·D-Day 별표는 교사 개인 자료(desks/{uid})로, 본인만 읽고 쓴다.
import { esc, todayStr, fmtDate, addDays, diffDays, parseDate, openModal, toast } from '../util.js';
import { S, on, rerender, nameOf } from '../state.js';
import { HOLIDAYS } from '../holidays.js';
import { weatherBody, mealBody, DEFAULT_PLACE } from './widgets.js';
import { layoutOf, toolbar, spanM, editing } from './layout.js';

const DAYS = ['월', '화', '수', '목', '금'];
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
export const DEFAULT_PERIODS = [['09:00', '09:40'], ['09:50', '10:30'], ['10:40', '11:20'], ['11:30', '12:10'], ['13:00', '13:40'], ['13:50', '14:30']];
const DEFAULT_LUNCH = { after: 4, start: '12:10', end: '13:00' };

export const desk = () => S.desk || {};
const periods = () => (desk().periods?.length ? desk().periods : DEFAULT_PERIODS);
const lunch = () => desk().lunch || DEFAULT_LUNCH;
const cell = (day, p) => (desk().cells || {})[`${day}-${p}`] || '';
const stars = () => desk().stars || [];
const mins = (hm) => { const [h, m] = String(hm || '0:0').split(':').map(Number); return h * 60 + m; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
const weekday = (d = new Date()) => d.getDay(); // 1=월 … 5=금

export function saveDesk(patch) {
  const next = { ...desk(), ...patch, owner: S.me.uid, updatedAt: Date.now() };
  delete next.id;
  S.desk = { ...next, id: S.me.uid };
  return Promise.resolve(S.store.create('desks', {}, next, S.me.uid)).catch((e) => toast('저장하지 못했습니다: ' + e.message));
}

// 지금 몇 교시인지, 쉬는 시간인지, 다음 시간은 무엇인지
export function nowInfo() {
  const wd = weekday(), ps = periods(), n = nowMin(), L = lunch();
  const today = todayStr();
  const off = wd === 0 || wd === 6 || HOLIDAYS[today];
  const label = (i) => `${i + 1}교시`;
  const subj = (i, d = wd) => cell(d, i + 1);
  if (off) return { state: 'off', title: HOLIDAYS[today] ? `오늘은 ${HOLIDAYS[today]}` : '오늘은 수업이 없는 날', sub: '', next: nextSchoolPeriod() };
  for (let i = 0; i < ps.length; i++) {
    const [s, e] = ps[i].map(mins);
    if (n >= s && n < e) return { state: 'class', title: `${label(i)}${subj(i) ? ' · ' + subj(i) : ''}`, sub: `${ps[i][0]} ~ ${ps[i][1]}`, left: Math.ceil(e - n), pct: Math.round(((n - s) / (e - s)) * 100), next: i + 1 < ps.length ? { label: label(i + 1), subj: subj(i + 1), at: ps[i + 1][0] } : null };
  }
  if (n < mins(ps[0][0])) return { state: 'before', title: '수업 전', sub: `첫 수업 ${ps[0][0]}`, left: Math.ceil(mins(ps[0][0]) - n), next: { label: label(0), subj: subj(0), at: ps[0][0] } };
  if (n >= mins(ps[ps.length - 1][1])) return { state: 'after', title: '오늘 수업 끝', sub: `마지막 수업 ${ps[ps.length - 1][1]}`, next: nextSchoolPeriod() };
  const i = ps.findIndex(([s]) => mins(s) > n);
  const isLunch = n >= mins(L.start) && n < mins(L.end);
  return { state: 'break', title: isLunch ? '점심시간' : '쉬는 시간', sub: `${label(i)} ${ps[i][0]} 시작`, left: Math.ceil(mins(ps[i][0]) - n), next: { label: label(i), subj: subj(i), at: ps[i][0] } };
}
function nextSchoolPeriod() {
  let d = addDays(todayStr(), 1);
  for (let k = 0; k < 7; k++, d = addDays(d, 1)) { const w = parseDate(d).getDay(); if (w >= 1 && w <= 5 && !HOLIDAYS[d]) return { label: `${WEEK[w]}요일 1교시`, subj: cell(w, 1), at: periods()[0][0] }; }
  return null;
}

const nowBody = () => {
  const x = nowInfo();
  return `<p class="now-title">${esc(x.title)}</p><p class="now-sub">${esc(x.sub || '')}</p>
    ${x.state === 'class' ? `<div class="now-bar" role="progressbar" aria-valuenow="${x.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="수업 진행"><span style="width:${x.pct}%"></span></div><p class="now-left">${x.left}분 남음</p>` : x.left ? `<p class="now-left">${x.left}분 뒤 시작</p>` : ''}
    ${x.next ? `<p class="now-next"><span class="tag">다음 시간</span> ${esc(x.next.label)} ${x.next.subj ? `<b>${esc(x.next.subj)}</b>` : '<span class="muted">비어 있음</span>'} <small>${esc(x.next.at)}</small></p>` : ''}`;
};
const clockBody = () => {
  const d = new Date();
  return `<p class="clock-time">${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</p><p class="clock-date">${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일</p>`;
};
const LIVE = { now: nowBody, clock: clockBody };
setInterval(() => document.querySelectorAll('[data-live]').forEach((el) => { const f = LIVE[el.dataset.live]; if (f) el.innerHTML = f(); }), 20000);

// 학사일정(별표로 D-Day)
const acadUpcoming = (days = 60) => { const t = todayStr(), to = addDays(t, days); return S.acad.filter((a) => (a.endDate || a.date) >= t && a.date <= to).sort((a, b) => (a.date > b.date ? 1 : -1)); };
const ddays = () => S.acad.filter((a) => stars().includes(a.id) && a.date >= todayStr()).sort((a, b) => (a.date > b.date ? 1 : -1));

function monthGrid() {
  const t = todayStr();
  const base = S.ui.deskMonth || t.slice(0, 7);
  const first = parseDate(base + '-01');
  const start = addDays(base + '-01', -first.getDay());
  const items = (d) => [
    ...(HOLIDAYS[d] ? [{ k: 'hol', t: HOLIDAYS[d] }] : []),
    ...S.acad.filter((a) => a.date <= d && (a.endDate || a.date) >= d).map((a) => ({ k: stars().includes(a.id) ? 'star' : 'acad', t: a.title })),
    ...S.meetings.filter((m) => !m.canceled && m.date === d && m.attendeeUids?.includes(S.me.uid)).map((m) => ({ k: 'meet', t: m.title })),
    ...S.appts.filter((p) => p.date === d).map((p) => ({ k: 'appt', t: p.title }))
  ];
  const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const total = Math.ceil((first.getDay() + dim) / 7) * 7;
  let cells = '';
  for (let i = 0; i < total; i++) {
    const d = addDays(start, i); const w = i % 7; const inM = d.slice(0, 7) === base;
    const it = items(d);
    cells += `<div class="m-cell ${inM ? '' : 'out'} ${d === t ? 'today' : ''} ${w === 0 || HOLIDAYS[d] ? 'sun' : w === 6 ? 'sat' : ''}"><span class="m-d">${Number(d.slice(8))}</span>${it.slice(0, 2).map((x) => `<span class="m-ev ${x.k}" title="${esc(x.t)}">${esc(x.t)}</span>`).join('')}${it.length > 2 ? `<span class="m-more">+${it.length - 2}</span>` : ''}</div>`;
  }
  const [y, m] = base.split('-').map(Number);
  return { head: `${y}년 ${m}월`, html: `<div class="m-grid">${WEEK.map((w, i) => `<span class="m-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}${cells}</div>` };
}

function weekTable() {
  const ps = periods(), L = lunch(), wd = weekday(), cur = nowInfo();
  const curIdx = cur.state === 'class' ? ps.findIndex(([s, e]) => nowMin() >= mins(s) && nowMin() < mins(e)) : -1;
  let rows = '';
  ps.forEach(([s, e], i) => {
    rows += `<tr><th scope="row">${i + 1}<small>${s}</small></th>${DAYS.map((_, k) => { const c = cell(k + 1, i + 1); return `<td class="${k + 1 === wd ? 'td-today' : ''} ${k + 1 === wd && i === curIdx ? 'td-now' : ''} ${c ? '' : 'empty'}">${esc(c)}</td>`; }).join('')}</tr>`;
    if (i + 1 === Number(L.after)) rows += `<tr class="lunch"><td colspan="6">점심시간 ${esc(L.start)} ~ ${esc(L.end)}</td></tr>`;
  });
  return `<div class="tt-wrap"><table class="tt"><thead><tr><th></th>${DAYS.map((d, k) => `<th class="${k + 1 === wd ? 'td-today' : ''}">${d}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

const w = (cls, title, href, body, extra = '') => ({ cls, title, href, body, extra });

export function deskWidgets(pTaskBody) {
  const dd = ddays();
  const mg = monthGrid();
  const acad = acadUpcoming();
  const star = (a) => `<button type="button" class="star ${stars().includes(a.id) ? 'on' : ''}" data-act="desk-star" data-id="${a.id}" aria-pressed="${stars().includes(a.id)}" aria-label="${esc(a.title)} D-Day ${stars().includes(a.id) ? '해제' : '설정'}">${stars().includes(a.id) ? '★' : '☆'}</button>`;
  const mealName = S.school.mealSchoolName || DEFAULT_PLACE.mealSchoolName;
  const W = {
    clock: () => w('w-clock', '시계', '', `<div data-live="clock">${clockBody()}</div>`),
    now: () => w('w-now', '지금 이 시간', '', `<div data-live="now">${nowBody()}</div>`),
    weather: () => w('w-weather', '지금 날씨', '', `<div data-fill="weather">${weatherBody()}</div>`),
    meal: () => w('w-meal', `급식 <small class="muted">${esc(mealName)}</small>`, '', `<div data-fill="meal">${mealBody()}</div>`),
    dday: () => w('w-dday', 'D-Day', '#/calendar', `<ul class="dd-list">${dd.slice(0, 4).map((a) => { const n = diffDays(a.date, todayStr()); return `<li><span class="dd-n ${n <= 7 ? 'soon' : ''}">${n === 0 ? 'D-day' : `D-${n}`}</span><span class="grow">${esc(a.title)}</span><small>${esc(fmtDate(a.date))}</small></li>`; }).join('') || '<li class="muted small">학사일정 옆 ☆을 누르면 D-Day로 표시됩니다.</li>'}</ul>`),
    memo: () => w('w-memo', '메모', '', `<textarea class="desk-memo" data-desk-memo aria-label="내 메모" placeholder="나만 보는 메모. 쓰는 대로 저장됩니다.">${esc(desk().memo || '')}</textarea><p class="small muted memo-state" aria-live="polite">${desk().updatedAt ? '저장됨' : ''}</p>`),
    week: () => w('w-week', '주간 시간표', '', weekTable(), '<button type="button" class="ghost sm" data-act="tt-edit">시간표 편집</button>'),
    month: () => w('w-month', esc(mg.head), '#/calendar', mg.html, `<span class="w-nav"><button type="button" class="ghost sm" data-act="desk-month" data-d="-1" aria-label="이전 달">‹</button><button type="button" class="ghost sm" data-act="desk-month" data-d="0">오늘</button><button type="button" class="ghost sm" data-act="desk-month" data-d="1" aria-label="다음 달">›</button></span>`),
    task: () => w('w-task', '할 일', '#/tasks', pTaskBody),
    acad: () => w('w-acad', '학사일정', '#/calendar', `<ul class="acad-list">${acad.slice(0, 7).map((a) => `<li>${star(a)}<span class="grow"><b>${esc(a.title)}</b><small>${esc(fmtDate(a.date))}${a.endDate && a.endDate !== a.date ? ' ~ ' + esc(fmtDate(a.endDate)) : ''}</small></span></li>`).join('') || '<li class="muted small">다가오는 학사일정이 없습니다.</li>'}</ul>`)
  };
  const list = layoutOf('desk').filter((it) => !it.hidden && W[it.id]);
  const ed = editing();
  const html = list.map((it, i) => {
    const x = W[it.id]();
    const title = it.title ? (it.id === 'meal' ? `${esc(it.title)} <small class="muted">${esc(mealName)}</small>` : esc(it.title)) : x.title;
    const span = it.span || 4;
    return `<section class="widget ${x.cls} ${ed ? 'lay-edit' : ''}" data-lay-zone="desk" data-lay-id="${it.id}" ${ed ? 'draggable="true"' : ''} ${it.h ? `data-h="${it.h}"` : ''} style="--span:${span};--span-m:${spanM(span)}">
      ${toolbar('desk', it, i, list.length)}<h2 class="w-title">${x.href && !ed ? `<a href="${x.href}">${title}<span class="go" aria-hidden="true">›</span></a>` : `<span>${title}</span>`}${x.extra}</h2><div class="w-body">${x.body}</div></section>`;
  }).join('');
  return `<div class="desk-wrap"><div class="desk">${html || '<p class="muted">모든 칸을 숨겼습니다. 「화면 편집」에서 다시 넣을 수 있습니다.</p>'}</div></div>`;
}

on('desk-star', (el) => { const id = el.dataset.id; const s = stars(); saveDesk({ stars: s.includes(id) ? s.filter((x) => x !== id) : [...s, id] }); rerender(); });
on('desk-month', (el) => {
  const d = Number(el.dataset.d);
  if (!d) S.ui.deskMonth = ''; else { const base = parseDate((S.ui.deskMonth || todayStr().slice(0, 7)) + '-01'); base.setMonth(base.getMonth() + d); S.ui.deskMonth = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`; }
  rerender();
});

// 메모: 입력을 멈추고 0.8초 뒤 저장(화면을 다시 그리지 않아 쓰는 중에 커서가 튀지 않음)
let memoTimer = null;
document.addEventListener('input', (e) => {
  const ta = e.target.closest('[data-desk-memo]'); if (!ta) return;
  const st = ta.parentElement.querySelector('.memo-state'); if (st) st.textContent = '쓰는 중…';
  clearTimeout(memoTimer);
  memoTimer = setTimeout(() => { saveDesk({ memo: ta.value }); if (st) st.textContent = '저장됨'; }, 800);
});

// 시간표 편집
on('tt-edit', () => {
  const ps = periods(), L = lunch();
  const html = `<form class="tt-form"><h2>내 주간 시간표</h2>
    <p class="small muted">교시 시간과 요일별 과목(학급·장소를 함께 적어도 됩니다)을 넣으세요. 나만 보는 시간표입니다.</p>
    <div class="tt-wrap"><table class="tt edit"><thead><tr><th>교시</th><th>시작</th><th>끝</th>${DAYS.map((d) => `<th>${d}</th>`).join('')}</tr></thead><tbody>
    ${ps.map(([s, e], i) => `<tr><th>${i + 1}</th><td><input type="time" name="s${i}" value="${s}" required></td><td><input type="time" name="e${i}" value="${e}" required></td>${DAYS.map((_, k) => `<td><input name="c${k + 1}-${i + 1}" value="${esc(cell(k + 1, i + 1))}" aria-label="${DAYS[k]}요일 ${i + 1}교시"></td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <div class="row3"><label>교시 수<input type="number" name="np" min="1" max="10" value="${ps.length}"></label><label>점심 앞 교시<input type="number" name="la" min="1" max="10" value="${esc(L.after)}"></label><label>점심 시작·끝<span class="row2"><input type="time" name="ls" value="${esc(L.start)}"><input type="time" name="le" value="${esc(L.end)}"></span></label></div>
    <p class="small muted">교시 수를 바꾸면 저장 뒤 표의 줄 수가 바뀝니다(늘린 교시는 앞 교시 시간에 이어 50분 간격으로 채웁니다).</p>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">저장</button></div></form>`;
  openModal(html, {
    wide: true,
    onSubmit: async (fd) => {
      const np = Math.max(1, Math.min(10, Number(fd.get('np')) || ps.length));
      const out = [], cells = {};
      for (let i = 0; i < np; i++) {
        if (i < ps.length) out.push([fd.get(`s${i}`), fd.get(`e${i}`)]);
        else { const [ps0, pe0] = out[i - 1]; const add = (hm, k) => { const t = mins(hm) + k; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }; out.push([add(ps0, 50), add(pe0, 50)]); }
        for (let k = 1; k <= 5; k++) { const v = (fd.get(`c${k}-${i + 1}`) || '').trim(); if (v) cells[`${k}-${i + 1}`] = v; }
      }
      await saveDesk({ periods: out, cells, lunch: { after: Number(fd.get('la')) || 4, start: fd.get('ls') || '12:10', end: fd.get('le') || '13:00' } });
      toast('시간표를 저장했습니다'); rerender();
    }
  });
});

export { nameOf };
