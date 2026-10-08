// 학생 관찰 메모: 날짜·시각·교과·상황·종류를 눌러 고르고 한두 줄로 바로 적는 누가 기록.
// 날짜별·상황별·교과별로 모아 보고, 보이는 메모만 복사해 IEP 평가·학기 말 누가기록·보호자 상담에 쓴다.
// 저장: schools/{학교}/students/{학생}/memos 안에 kind: 'note'로 둔다(공유 메모와 같은 권한: 교사만, 보조인력은 볼 수 없음).
// 교과·상황·종류 버튼 목록은 교사마다 고칠 수 있다(desks/{uid}.noteChips).
import { esc, todayStr, timeStr, parseDate, openModal, toast } from '../util.js';
import { S, on, useSub, rerender, nameOf, isAdmin } from '../state.js';
import { desk, saveDesk, periodAt } from './desk.js';
import { confirmInline } from './record.js';
import { copyText } from './pireport.js';

const DEF = {
  subj: ['국어', '수학', '사회', '과학', '영어', '체육', '음악', '미술', '진로와 직업', '일상생활 활동', '창의적 체험활동', '통합학급 수업', '기타'],
  sit: ['수업 중', '모둠·짝 활동', '쉬는 시간', '점심·급식', '등교', '하교', '교실 이동', '화장실', '현장체험', '방과후', '기타'],
  tag: ['잘한 점·성장', '학습 반응', '행동 관찰', '의사소통', '사회성·또래', '건강·컨디션', '보호자 연락', 'IEP 목표 관련', '기타']
};
const KIND = { subj: '교과', sit: '상황', tag: '종류' };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const dLabel = (d) => { const x = parseDate(d); return `${x.getMonth() + 1}/${x.getDate()}(${WD[x.getDay()]})`; };
const dLong = (d) => { const x = parseDate(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}(${WD[x.getDay()]})`; };

// 기본 목록(교사가 고친 목록이 있으면 그것). 시간표에서 자동으로 고른 교과가 목록에 없으면 맨 앞에 붙인다.
export function chipList(k, cur = '') {
  const mine = desk().noteChips?.[k];
  const base = Array.isArray(mine) && mine.length ? mine : DEF[k];
  return k === 'subj' && cur && !base.includes(cur) ? [cur, ...base] : base;
}

export const notesOf = (sid) => (S.memosBy[sid] || []).filter((m) => m.kind === 'note').sort((a, b) => ((b.date || '') + (b.time || '') > (a.date || '') + (a.time || '') ? 1 : -1));
export const isNote = (m) => m.kind === 'note';

const draftOf = (sid) => {
  S.ui.noteDraft ||= {};
  if (!S.ui.noteDraft[sid]) {
    const d = todayStr(), t = timeStr();
    S.ui.noteDraft[sid] = { date: d, time: t, subj: periodAt(d, t).subj || '', sit: '', tags: [], text: '', star: false, autoSubj: true };
  }
  return S.ui.noteDraft[sid];
};
const filterOf = (sid) => { S.ui.noteF ||= {}; return (S.ui.noteF[sid] ||= { view: 'date', range: '30', subj: '', sit: '', tag: '', q: '' }); };

const chipRow = (sid, k, cur, multi = false) => `<div class="nt-chips" role="group" aria-label="${KIND[k]}">${chipList(k, multi ? '' : cur).map((c) => {
  const on = multi ? cur.includes(c) : cur === c;
  return `<button type="button" class="pr-chip sm ${on ? 'on' : ''}" aria-pressed="${on}" data-act="nt-chip" data-sid="${sid}" data-k="${k}" data-v="${esc(c)}">${esc(c)}</button>`;
}).join('')}</div>`;

function inRange(n, f) {
  if (f.range === 'all') return true;
  const days = Number(f.range) || 30;
  const since = new Date(); since.setDate(since.getDate() - (days - 1));
  return (n.date || '') >= todayStr(since);
}
function filtered(sid) {
  const f = filterOf(sid), q = f.q.trim();
  return notesOf(sid).filter((n) => inRange(n, f) && (!f.subj || n.subj === f.subj) && (!f.sit || n.sit === f.sit) && (!f.tag || (n.tags || []).includes(f.tag)) && (!f.star || n.star) && (!q || (n.text || '').includes(q)));
}

const noteLine = (n) => `${dLong(n.date)} ${n.time || ''}${n.period ? ` ${n.period}교시` : ''} [${[n.subj, n.sit, ...(n.tags || [])].filter(Boolean).join('/')}]${n.star ? ' ★' : ''} ${n.text || ''} — ${nameOf(n.createdBy)}`;

function noteCard(sid, n) {
  const mine = n.createdBy === S.me.uid || isAdmin();
  return `<li class="nt-item ${n.star ? 'nt-imp' : ''}">
    <div class="nt-meta"><b>${esc(dLabel(n.date))} ${esc(n.time || '')}</b>${n.period ? `<span class="muted">${n.period}교시</span>` : ''}
      ${n.subj ? `<span class="tag subj">${esc(n.subj)}</span>` : ''}${n.sit ? `<span class="tag sit">${esc(n.sit)}</span>` : ''}${(n.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}${n.star ? '<span class="nt-star" aria-label="중요">★</span>' : ''}</div>
    <p class="nt-text">${esc(n.text || '')}</p>
    <div class="nt-foot"><small class="muted">${esc(nameOf(n.createdBy))}${n.updatedAt && n.updatedAt - (n.createdAt || 0) > 60000 ? ' · 고침' : ''}</small><span class="grow"></span>
      ${mine ? `<button type="button" class="ghost sm" data-act="nt-edit" data-sid="${sid}" data-id="${n.id}">고치기</button><button type="button" class="ghost sm danger" data-act="nt-del" data-sid="${sid}" data-id="${n.id}">지우기</button>` : ''}</div></li>`;
}

export function notesTab(s) {
  const sid = s.id;
  useSub('memo:' + sid, 'memos', { sid }, (r) => { S.memosBy[sid] = r.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); });
  const d = draftOf(sid), f = filterOf(sid);
  const pa = periodAt(d.date, d.time);
  const list = filtered(sid);
  const all = notesOf(sid);
  const key = f.view === 'sit' ? (n) => n.sit || '상황 미기재' : f.view === 'subj' ? (n) => n.subj || '교과 미기재' : (n) => n.date || '';
  const groups = new Map();
  list.forEach((n) => { const k = key(n); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); });
  const order = [...groups.keys()];
  if (f.view !== 'date') order.sort((a, b) => groups.get(b).length - groups.get(a).length);
  const sel = (k, label) => `<label class="nt-f">${label}<select data-change="nt-filter" data-sid="${sid}" data-f="${k}"><option value="">전체</option>${chipList(k === 'tag' ? 'tag' : k).map((c) => `<option ${f[k] === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`;
  const today = all.filter((n) => n.date === todayStr()).length;

  return `<section class="card nt-quick">
    <div class="goal-head"><h2 class="h3">빠른 기록</h2><small class="muted">오늘 ${today}건 · 모두 ${all.length}건</small><span class="grow"></span><button type="button" class="ghost sm" data-act="nt-chips-edit">버튼 고치기</button></div>
    <div class="nt-when"><label>날짜<input type="date" value="${esc(d.date)}" data-change="nt-draft" data-sid="${sid}" data-k="date"></label>
      <label>시각<input type="time" value="${esc(d.time)}" data-change="nt-draft" data-sid="${sid}" data-k="time"></label>
      <span class="nt-period">${pa.p ? `${pa.p}교시${pa.subj ? ` · 시간표 ${esc(pa.subj)}` : ''}` : '수업 시간 밖'}</span>
      <button type="button" class="ghost sm" data-act="nt-now" data-sid="${sid}">지금</button></div>
    <div class="nt-row"><span class="nt-k">교과</span>${chipRow(sid, 'subj', d.subj)}</div>
    <div class="nt-row"><span class="nt-k">상황</span>${chipRow(sid, 'sit', d.sit)}</div>
    <div class="nt-row"><span class="nt-k">종류</span>${chipRow(sid, 'tag', d.tags, true)}</div>
    <textarea class="nt-input" id="nt-text-${sid}" rows="3" data-nt-text="${sid}" placeholder="보고 들은 그대로 짧게. 예: 받아쓰기 10문항 중 7문항 바르게 씀, 3번째 문항부터 「도와주세요」 카드를 스스로 냄 (Ctrl+Enter로 저장)">${esc(d.text)}</textarea>
    <div class="bar"><label class="chk"><input type="checkbox" data-change="nt-draft" data-sid="${sid}" data-k="star" ${d.star ? 'checked' : ''}> ★ 중요(IEP 평가·상담 때 다시 볼 것)</label><span class="grow"></span>
      <button type="button" class="ghost sm" data-act="nt-clear" data-sid="${sid}">비우기</button><button type="button" class="primary" data-act="nt-save" data-sid="${sid}">기록</button></div>
    <p class="tiny muted">교과는 날짜·시각에 맞는 내 시간표 칸(한눈에 → 주간 시간표)으로 자동 선택됩니다. 진단명·다른 학생 이름은 적지 않습니다.</p>
  </section>
  <section class="card">
    <div class="nt-filters">
      <div class="seg-btns" role="group" aria-label="모아 보기">${[['date', '날짜별'], ['sit', '상황별'], ['subj', '교과별']].map(([k, l]) => `<button type="button" class="${f.view === k ? 'on' : ''}" aria-pressed="${f.view === k}" data-act="nt-view" data-sid="${sid}" data-v="${k}">${l}</button>`).join('')}</div>
      <label class="nt-f">기간<select data-change="nt-filter" data-sid="${sid}" data-f="range">${[['1', '오늘'], ['7', '7일'], ['30', '30일'], ['120', '한 학기(120일)'], ['all', '전체']].map(([v, l]) => `<option value="${v}" ${f.range === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${sel('subj', '교과')}${sel('sit', '상황')}${sel('tag', '종류')}
      <label class="nt-f">찾기<input type="search" id="nt-q-${sid}" value="${esc(f.q)}" placeholder="낱말" data-change="nt-filter" data-sid="${sid}" data-f="q"></label>
      <label class="chk nt-f"><input type="checkbox" data-change="nt-filter" data-sid="${sid}" data-f="star" ${f.star ? 'checked' : ''}> ★만</label>
    </div>
    <div class="bar"><small class="muted">보이는 메모 ${list.length}건</small><span class="grow"></span><button type="button" class="ghost sm" data-act="nt-copy" data-sid="${sid}" ${list.length ? '' : 'disabled'}>보이는 메모 복사</button></div>
    ${order.length ? order.map((k) => `<div class="nt-group"><h3 class="nt-gh">${esc(f.view === 'date' ? dLong(k) : k)} <small class="muted">${groups.get(k).length}건</small></h3><ul class="nt-list">${groups.get(k).map((n) => noteCard(sid, n)).join('')}</ul></div>`).join('') : '<p class="muted">조건에 맞는 메모가 없습니다.</p>'}
  </section>`;
}

async function saveDraft(sid) {
  const d = draftOf(sid);
  const ta = document.querySelector(`[data-nt-text="${sid}"]`);
  if (ta) d.text = ta.value;
  if (!d.text.trim()) { toast('메모 내용을 적어 주세요'); ta?.focus(); return; }
  const pa = periodAt(d.date, d.time);
  await S.store.create('memos', { sid }, { kind: 'note', date: d.date, time: d.time, period: pa.p || 0, subj: d.subj, sit: d.sit, tags: d.tags, text: d.text.trim(), star: !!d.star, title: '', blocks: [], createdBy: S.me.uid, updatedBy: S.me.uid, createdAt: Date.now(), updatedAt: Date.now() });
  // 같은 교과·상황으로 이어 적기 쉽게 날짜·교과·상황은 남기고 내용·종류·중요만 비운다
  Object.assign(d, { text: '', tags: [], star: false });
  if (ta) { ta.value = ''; ta.blur(); } // 화면을 다시 그릴 때 초점 칸의 옛 글이 되살아나지 않게
  toast('메모를 기록했습니다'); rerender();
  setTimeout(() => document.querySelector(`[data-nt-text="${sid}"]`)?.focus(), 80);
}

function editModal(sid, n) {
  let cur = { subj: n.subj || '', sit: n.sit || '', tags: [...(n.tags || [])] };
  const rows = () => ['subj', 'sit', 'tag'].map((k) => `<div class="nt-row"><span class="nt-k">${KIND[k]}</span><div class="nt-chips">${chipList(k, k === 'subj' ? cur.subj : '').map((c) => { const on = k === 'tag' ? cur.tags.includes(c) : cur[k] === c; return `<button type="button" class="pr-chip sm ${on ? 'on' : ''}" data-ek="${k}" data-v="${esc(c)}">${esc(c)}</button>`; }).join('')}</div></div>`).join('');
  openModal(`<form><h2>관찰 메모 고치기</h2>
    <div class="nt-when"><label>날짜<input type="date" name="date" value="${esc(n.date || '')}" required></label><label>시각<input type="time" name="time" value="${esc(n.time || '')}"></label></div>
    <div class="nt-erows">${rows()}</div>
    <label>내용<textarea name="text" rows="4" required>${esc(n.text || '')}</textarea></label>
    <label class="chk"><input type="checkbox" name="star" ${n.star ? 'checked' : ''}> ★ 중요</label>
    <p class="tiny muted">처음 기록 ${esc(nameOf(n.createdBy))} · ${n.createdAt ? new Date(n.createdAt).toLocaleString('ko-KR') : ''}</p>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>닫기</button><button type="submit" class="primary">저장</button></div></form>`, {
    onOpen: (m) => m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ek]'); if (!b) return;
      const k = b.dataset.ek, v = b.dataset.v;
      if (k === 'tag') cur.tags = cur.tags.includes(v) ? cur.tags.filter((x) => x !== v) : [...cur.tags, v]; else cur[k] = cur[k] === v ? '' : v;
      m.querySelector('.nt-erows').innerHTML = rows();
    }),
    onSubmit: async (fd) => {
      const date = fd.get('date'), time = fd.get('time');
      await S.store.update('memos', { sid }, n.id, { date, time, period: periodAt(date, time).p || 0, subj: cur.subj, sit: cur.sit, tags: cur.tags, text: String(fd.get('text') || '').trim(), star: fd.get('star') === 'on', updatedBy: S.me.uid, updatedAt: Date.now() });
      toast('메모를 고쳤습니다');
    }
  });
}

function chipsModal() {
  const cur = (k) => (desk().noteChips?.[k]?.length ? desk().noteChips[k] : DEF[k]).join('\n');
  openModal(`<form><h2>메모 버튼 고치기</h2><p class="small muted">줄마다 하나씩 적습니다. 시간표에서 자동으로 고른 교과가 목록에 없으면 그 교과가 맨 앞에 잠시 붙습니다. 내 계정에만 저장됩니다.</p>
    <div class="row3">${['subj', 'sit', 'tag'].map((k) => `<label>${KIND[k]}<textarea name="${k}" rows="12">${esc(cur(k))}</textarea></label>`).join('')}</div>
    <div class="actions"><button type="button" class="ghost" data-reset>기본값으로</button><span class="grow"></span><button type="button" class="ghost" data-close>닫기</button><button type="submit" class="primary">저장</button></div></form>`, {
    wide: true,
    onOpen: (m) => { m.querySelector('[data-reset]').onclick = () => { ['subj', 'sit', 'tag'].forEach((k) => { m.querySelector(`[name=${k}]`).value = DEF[k].join('\n'); }); }; },
    onSubmit: async (fd) => {
      const pick = (k) => [...new Set(String(fd.get(k) || '').split('\n').map((x) => x.trim()).filter(Boolean))];
      await saveDesk({ noteChips: { subj: pick('subj'), sit: pick('sit'), tag: pick('tag') } });
      toast('메모 버튼을 저장했습니다'); rerender();
    }
  });
}

on('nt-chip', (el) => {
  const sid = el.dataset.sid, k = el.dataset.k, v = el.dataset.v, d = draftOf(sid);
  const ta = document.querySelector(`[data-nt-text="${sid}"]`); if (ta) d.text = ta.value;
  if (k === 'tag') d.tags = d.tags.includes(v) ? d.tags.filter((x) => x !== v) : [...d.tags, v];
  else { d[k] = d[k] === v ? '' : v; if (k === 'subj') d.autoSubj = false; }
  rerender();
});
on('nt-draft', (el) => {
  const sid = el.dataset.sid, k = el.dataset.k, d = draftOf(sid);
  const ta = document.querySelector(`[data-nt-text="${sid}"]`); if (ta) d.text = ta.value;
  d[k] = el.type === 'checkbox' ? el.checked : el.value;
  if ((k === 'date' || k === 'time') && d.autoSubj) d.subj = periodAt(d.date, d.time).subj || d.subj;
  rerender();
});
on('nt-now', (el) => { const d = draftOf(el.dataset.sid); const ta = document.querySelector(`[data-nt-text="${el.dataset.sid}"]`); if (ta) d.text = ta.value; d.date = todayStr(); d.time = timeStr(); d.autoSubj = true; d.subj = periodAt(d.date, d.time).subj || d.subj; rerender(); });
on('nt-clear', (el) => { const sid = el.dataset.sid; S.ui.noteDraft[sid] = null; draftOf(sid); rerender(); });
on('nt-save', (el) => saveDraft(el.dataset.sid));
on('nt-view', (el) => { filterOf(el.dataset.sid).view = el.dataset.v; rerender(); });
on('nt-filter', (el) => { const f = filterOf(el.dataset.sid); f[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; rerender(); });
on('nt-edit', (el) => { const n = notesOf(el.dataset.sid).find((x) => x.id === el.dataset.id); if (n) editModal(el.dataset.sid, n); });
on('nt-del', async (el) => { if (!confirmInline(el)) return; await S.store.remove('memos', { sid: el.dataset.sid }, el.dataset.id); toast('메모를 지웠습니다'); });
on('nt-chips-edit', () => chipsModal());
on('nt-copy', async (el) => {
  const sid = el.dataset.sid, f = filterOf(sid), list = filtered(sid);
  const head = `관찰 메모 ${list.length}건 (${f.view === 'date' ? '날짜별' : f.view === 'sit' ? '상황별' : '교과별'}${f.subj ? ` · 교과 ${f.subj}` : ''}${f.sit ? ` · 상황 ${f.sit}` : ''}${f.tag ? ` · ${f.tag}` : ''})`;
  const ok = await copyText([head, ...list.map(noteLine)].join('\n'));
  toast(ok ? '보이는 메모를 복사했습니다' : '복사하지 못했습니다');
});

// 메모 입력 중 내용 유지(다른 자료가 바뀌어 화면을 다시 그려도 지워지지 않게)와 Ctrl+Enter 저장
document.addEventListener('input', (e) => { const sid = e.target.dataset?.ntText; if (sid) draftOf(sid).text = e.target.value; });
document.addEventListener('keydown', (e) => { const sid = e.target.dataset?.ntText; if (sid && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveDraft(sid); } });
