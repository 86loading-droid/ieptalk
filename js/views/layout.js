// 한눈에 보기 배치 편집: 각 칸의 위치(순서)·너비·높이·이름을 바꾸고, 숨기거나 다시 넣을 수 있다.
// 교사마다 따로 저장된다(desks/{uid}.layout). 왼쪽 「내 책상」(desk)과 오른쪽 「학생 지원·협업」(board) 두 구역.
import { esc, openModal, toast } from '../util.js';
import { S, on, rerender } from '../state.js';
import { desk, saveDesk } from './desk.js';

export const DEFAULTS = {
  desk: [['clock', '시계', 3], ['now', '지금 이 시간', 5], ['weather', '지금 날씨', 4], ['meal', '급식', 4], ['dday', 'D-Day', 4], ['memo', '메모', 4], ['week', '주간 시간표', 7], ['month', '이달 달력', 5], ['task', '할 일', 6], ['acad', '학사일정', 6]],
  board: [['rec', '행동 기록'], ['warn', '진전도 경고'], ['crisis', '위기행동 사후 기록'], ['deadline', 'IEP 법정 기한'], ['cal', '일정·예약'], ['chat', '메신저'], ['acc', '평가조정 한 장'], ['stu', '학생·IEP'], ['memo', '공유 메모'], ['admin', '관리']]
};
export const SIZES = [[3, '좁게'], [4, '보통'], [6, '넓게'], [8, '아주 넓게'], [12, '한 줄 전체']];
export const HEIGHTS = [['', '높이 자동'], ['low', '낮게(스크롤)'], ['high', '높게']];
const defName = (zone, id) => (DEFAULTS[zone].find((d) => d[0] === id) || [])[1] || id;

// 저장된 배치 + 새로 생긴 칸(기본값)을 합친다
export function layoutOf(zone) {
  const saved = desk().layout?.[zone] || [];
  const known = new Set(saved.map((x) => x.id));
  const merged = saved.filter((x) => DEFAULTS[zone].some((d) => d[0] === x.id));
  DEFAULTS[zone].forEach(([id, , span]) => { if (!known.has(id)) merged.push({ id, span: span || 0, h: '', hidden: false, title: '' }); });
  return merged;
}
const save = (zone, list) => { saveDesk({ layout: { ...(desk().layout || {}), [zone]: list.map(({ id, span, h, hidden, title }) => ({ id, span: span || 0, h: h || '', hidden: !!hidden, title: title || '' })) } }); rerender(); };
export const titleOf = (zone, id, fallback) => { const it = layoutOf(zone).find((x) => x.id === id); return it?.title || fallback; };
export const editing = () => !!S.ui.layoutEdit;

// 좁아졌을 때(6칸 격자) 쓸 너비
export const spanM = (n) => (n >= 6 ? 6 : 3);

export function toolbar(zone, it, i, n) {
  if (!editing()) return '';
  const name = esc(it.title || defName(zone, it.id));
  return `<div class="lay-bar" role="toolbar" aria-label="${name} 배치 편집">
    <span class="lay-grip" aria-hidden="true" title="끌어서 옮기기">⠿</span>
    <button type="button" class="lay-btn" data-act="lay-move" data-z="${zone}" data-id="${it.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="${name} 앞으로">${zone === 'desk' ? '◀' : '▲'}</button>
    <button type="button" class="lay-btn" data-act="lay-move" data-z="${zone}" data-id="${it.id}" data-d="1" ${i === n - 1 ? 'disabled' : ''} aria-label="${name} 뒤로">${zone === 'desk' ? '▶' : '▼'}</button>
    ${zone === 'desk' ? `<select class="lay-sel" data-change="lay-size" data-z="${zone}" data-id="${it.id}" aria-label="${name} 너비">${SIZES.map(([v, l]) => `<option value="${v}" ${+it.span === v ? 'selected' : ''}>${l}</option>`).join('')}${SIZES.some(([v]) => v === +it.span) ? '' : `<option value="${it.span}" selected>기본</option>`}</select>` : ''}
    <select class="lay-sel" data-change="lay-height" data-z="${zone}" data-id="${it.id}" aria-label="${name} 높이">${HEIGHTS.map(([v, l]) => `<option value="${v}" ${(it.h || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button type="button" class="lay-btn" data-act="lay-rename" data-z="${zone}" data-id="${it.id}" aria-label="${name} 이름 바꾸기">이름</button>
    <button type="button" class="lay-btn danger" data-act="lay-hide" data-z="${zone}" data-id="${it.id}" aria-label="${name} 숨기기">숨기기</button>
  </div>`;
}

// 편집 막대(한눈에 보기 맨 위)
export function editBar() {
  const hidden = ['desk', 'board'].flatMap((z) => layoutOf(z).filter((x) => x.hidden).map((x) => ({ z, ...x })));
  if (!editing()) return `<div class="lay-top"><button type="button" class="ghost sm" data-act="lay-toggle" aria-pressed="false">화면 편집</button></div>`;
  return `<div class="lay-top on" role="region" aria-label="화면 편집">
    <b>화면 편집 중</b><span class="small muted">칸을 끌어 옮기거나 ◀ ▶ ▲ ▼로 순서를 바꾸고, 너비·높이·이름을 고르세요. 숨긴 칸은 아래에서 다시 넣을 수 있습니다.</span>
    ${hidden.length ? `<span class="lay-hidden">숨긴 칸: ${hidden.map((x) => `<button type="button" class="chip-btn" data-act="lay-show" data-z="${x.z}" data-id="${x.id}">+ ${esc(x.title || defName(x.z, x.id))}</button>`).join('')}</span>` : ''}
    <span class="grow"></span>
    <button type="button" class="ghost sm" data-act="lay-reset">기본 배치로</button>
    <button type="button" class="primary sm" data-act="lay-toggle" aria-pressed="true">편집 끝내기</button>
  </div>`;
}

const upd = (zone, id, f) => { const list = layoutOf(zone); const it = list.find((x) => x.id === id); if (!it) return; f(it, list); save(zone, list); };
on('lay-toggle', () => { S.ui.layoutEdit = !S.ui.layoutEdit; rerender(); });
on('lay-move', (el) => upd(el.dataset.z, el.dataset.id, (it, list) => { const i = list.indexOf(it); const vis = list.filter((x) => !x.hidden); const vi = vis.indexOf(it); const other = vis[vi + Number(el.dataset.d)]; if (!other) return; const j = list.indexOf(other); list[i] = other; list[j] = it; }));
on('lay-size', (el) => upd(el.dataset.z, el.dataset.id, (it) => { it.span = Number(el.value); }));
on('lay-height', (el) => upd(el.dataset.z, el.dataset.id, (it) => { it.h = el.value; }));
on('lay-hide', (el) => { upd(el.dataset.z, el.dataset.id, (it) => { it.hidden = true; }); toast('칸을 숨겼습니다. 화면 편집 막대에서 다시 넣을 수 있습니다.'); });
on('lay-show', (el) => upd(el.dataset.z, el.dataset.id, (it) => { it.hidden = false; }));
on('lay-reset', () => { saveDesk({ layout: {} }); rerender(); toast('기본 배치로 되돌렸습니다'); });
on('lay-rename', (el) => {
  const { z, id } = el.dataset; const it = layoutOf(z).find((x) => x.id === id);
  openModal(`<form><h2>칸 이름 바꾸기</h2><label>새 이름<input name="t" maxlength="20" value="${esc(it?.title || '')}" placeholder="${esc(defName(z, id))}"></label>
    <p class="small muted">비우면 기본 이름(${esc(defName(z, id))})으로 돌아갑니다.</p>
    <div class="actions"><span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">저장</button></div></form>`, {
    onSubmit: (fd) => { upd(z, id, (x) => { x.title = String(fd.get('t') || '').trim(); }); }
  });
});

// 끌어서 옮기기(교사 컴퓨터용). 같은 구역 안에서만 옮긴다
let dragging = null;
document.addEventListener('dragstart', (e) => {
  const el = e.target.closest?.('[data-lay-id]'); if (!el || !editing()) return;
  dragging = { z: el.dataset.layZone, id: el.dataset.layId };
  el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', dragging.id); } catch {}
});
document.addEventListener('dragend', (e) => { e.target.closest?.('[data-lay-id]')?.classList.remove('dragging'); document.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before')); dragging = null; });
document.addEventListener('dragover', (e) => {
  if (!dragging) return; const el = e.target.closest('[data-lay-id]');
  if (!el || el.dataset.layZone !== dragging.z) return;
  e.preventDefault(); document.querySelectorAll('.drop-before').forEach((x) => x !== el && x.classList.remove('drop-before')); el.classList.add('drop-before');
});
document.addEventListener('drop', (e) => {
  if (!dragging) return; const el = e.target.closest('[data-lay-id]');
  if (!el || el.dataset.layZone !== dragging.z) return;
  e.preventDefault();
  const { z, id } = dragging; const target = el.dataset.layId; if (target === id) return;
  const list = layoutOf(z); const from = list.findIndex((x) => x.id === id); const [it] = list.splice(from, 1);
  list.splice(list.findIndex((x) => x.id === target), 0, it); save(z, list);
});
