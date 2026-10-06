// 평가조정 한 장: 학생별·교과별 평가조정을 정리해 통합학급·교과 교사와 공유하고, 확인 표시와 효과 메모를 남긴다.
// 설계 근거: 평가조정의 효과는 학생마다 다르므로(상호작용 가설의 단서, Sireci·Scarpati·Li, 2005) 일괄 목록 대신 개별 결정과 효과 점검을 함께 둔다.
import { esc, todayStr, fmtDate, openModal, closeModal, toast } from '../util.js';
import { S, on, teachers, nameOf, student } from '../state.js';
import { confirmInline } from './record.js';
import { logAccess } from '../access.js';

export const CATS = [
  ['presentation', '제시', ['문항 읽어 주기', '글자 확대(14pt 이상)', '한 쪽에 문항 수 줄이기', '그림·기호 보조', '점자·음성 자료']],
  ['response', '반응', ['구두로 답하기', '대필(받아 적기)', '보조공학 기기 사용', '답안지 대신 문제지에 표시', '계산기 허용(연산 외 문항)']],
  ['timing', '시간', ['시간 1.5배', '시간 2배', '중간 휴식 허용', '나눠 보기(2회)']],
  ['setting', '장소', ['별도 공간', '소음이 적은 자리', '앞자리', '개별 감독']],
  ['scheduling', '일정', ['오전 시행', '다른 날로 옮겨 시행', '한 과목씩 시행']]
];

export const accomsOf = (sid) => (S.accomsBy[sid] || []).sort((a, b) => (a.subject > b.subject ? 1 : -1));
export const needsMyConfirm = (a) => (a.sharedWith || []).includes(S.me.uid) && !a.confirms?.[S.me.uid];

function sheet(a, s) {
  const list = CATS.map(([k, l]) => (a[k] || []).length ? `<tr><th scope="row">${l}</th><td>${(a[k] || []).map(esc).join(', ')}</td></tr>` : '').join('');
  const conf = (a.sharedWith || []).map((u) => `<li>${esc(nameOf(u))} ${a.confirms?.[u] ? `<span class="tag ok">확인 ${esc(fmtDate(todayStr(new Date(a.confirms[u]))))}</span>` : '<span class="tag">확인 전</span>'}</li>`).join('');
  return `<table class="acc-table"><tbody>${list}${a.other ? `<tr><th scope="row">기타</th><td>${esc(a.other)}</td></tr>` : ''}</tbody></table>
    ${a.modification ? `<p class="alert small">교육과정 수정 포함: 성취기준이나 평가기준 자체를 바꾸는 것은 평가조정이 아니라 수정입니다. IEP 팀 협의와 기록이 필요합니다. ${esc(a.modNote || '')}</p>` : ''}
    ${conf ? `<p class="small"><b>공유한 선생님</b></p><ul class="mini">${conf}</ul>` : ''}`;
}

export function accomTab(s) {
  const list = accomsOf(s.id);
  const cards = list.map((a) => `<section class="card acc">
    <div class="goal-head"><h2 class="h3">${esc(a.subject)} 평가조정</h2><span class="grow"></span>
      ${needsMyConfirm(a) ? `<button type="button" class="primary sm" data-act="acc-confirm" data-sid="${s.id}" data-id="${a.id}">확인했어요</button>` : ''}
      <button type="button" class="ghost sm" data-act="acc-print" data-sid="${s.id}" data-id="${a.id}">한 장 인쇄</button>
      <button type="button" class="ghost sm" data-act="acc-edit" data-sid="${s.id}" data-id="${a.id}">수정</button></div>
    ${sheet(a, s)}
    <details ${(a.effects || []).length ? 'open' : ''}><summary>적용 후 효과 메모 ${(a.effects || []).length}</summary>
      <ul class="rows">${(a.effects || []).map((x, i) => `<li><span>${esc(fmtDate(x.d))}</span><span class="grow">${esc(x.text)} <small class="muted">${esc(nameOf(x.by))}</small></span>${x.by === S.me.uid ? `<button type="button" class="link sm" data-act="acc-eff-del" data-sid="${s.id}" data-id="${a.id}" data-i="${i}">지우기</button>` : ''}</li>`).join('')}</ul>
      <form class="inline-form acc-eff" data-sid="${s.id}" data-id="${a.id}"><label class="grow">이번 평가에서 어땠나요<input name="text" required placeholder="예: 읽어 주기 뒤 미응답 문항이 줄어듦"></label><button type="submit" class="sm primary">메모 추가</button></form>
    </details>
  </section>`).join('');
  return `<div class="bar"><button type="button" class="primary" data-act="acc-new" data-sid="${s.id}">교과 평가조정 추가</button>
    <span class="muted small">교과마다 한 장으로 정리해 통합학급·교과 선생님께 공유하고, 확인 표시를 받습니다. 효과 메모는 다음 IEP 회의 자료가 됩니다.</span></div>
    ${cards || '<section class="card"><p class="muted">아직 평가조정이 없습니다.</p></section>'}`;
}

function form(a = {}) {
  const tch = teachers().filter((m) => m.id !== S.me.uid);
  const opts = (k, base) => [...new Set([...base, ...(a[k] || [])])];
  return `<form><h2>${a.id ? '평가조정 수정' : '교과 평가조정 추가'}</h2>
    <label>교과<input name="subject" value="${esc(a.subject || '')}" required placeholder="예: 국어, 수학"></label>
    ${CATS.map(([k, l, base]) => `<fieldset><legend>${l}</legend><div class="chips">${opts(k, base).map((o) => `<label class="chip"><input type="checkbox" name="${k}" value="${esc(o)}" ${(a[k] || []).includes(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>
      <label class="small">직접 입력(쉼표로 구분)<input name="${k}_x" placeholder="목록에 없는 조정"></label></fieldset>`).join('')}
    <label>기타<input name="other" value="${esc(a.other || '')}"></label>
    <label class="chk"><input type="checkbox" name="modification" ${a.modification ? 'checked' : ''}> 성취기준·평가기준 자체를 바꾸는 교육과정 수정이 포함됨</label>
    <label>수정 내용<input name="modNote" value="${esc(a.modNote || '')}" placeholder="수정이 있을 때만"></label>
    <fieldset><legend>공유할 선생님(확인 요청)</legend><div class="chk-list">${tch.map((m) => `<label class="chk"><input type="checkbox" name="share" value="${m.id}" ${(a.sharedWith || []).includes(m.id) ? 'checked' : ''}> ${esc(m.name)} <small class="muted">${esc(m.title || '')}</small></label>`).join('') || '<p class="muted small">다른 교사가 아직 없습니다.</p>'}</div></fieldset>
    <div class="actions">${a.id ? '<button type="button" class="danger ghost" data-del>삭제</button>' : ''}<span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary">저장</button></div></form>`;
}

const data = (fd, prev = {}) => {
  const out = { subject: fd.get('subject'), other: fd.get('other') || '', modification: fd.get('modification') === 'on', modNote: fd.get('modNote') || '', sharedWith: fd.getAll('share'), updatedBy: S.me.uid, updatedAt: Date.now() };
  CATS.forEach(([k]) => { out[k] = [...new Set([...fd.getAll(k), ...String(fd.get(k + '_x') || '').split(',').map((x) => x.trim()).filter(Boolean)])]; });
  // 내용이 바뀌면 다시 확인받는다(공유 대상 중 새로 들어온 사람은 당연히 확인 전)
  const changed = CATS.some(([k]) => JSON.stringify(out[k]) !== JSON.stringify(prev[k] || [])) || out.modification !== !!prev.modification || out.other !== (prev.other || '');
  out.confirms = changed ? {} : Object.fromEntries(Object.entries(prev.confirms || {}).filter(([u]) => out.sharedWith.includes(u)));
  return out;
};

on('acc-new', (el) => { const sid = el.dataset.sid; openModal(form(), { wide: true, onSubmit: async (fd) => { await S.store.create('accoms', { sid }, { ...data(fd), effects: [], createdBy: S.me.uid, createdAt: Date.now() }); toast('평가조정을 저장했습니다. 공유한 선생님 화면에 확인 요청이 뜹니다.'); } }); });
on('acc-edit', (el) => {
  const { sid, id } = el.dataset; const a = accomsOf(sid).find((x) => x.id === id);
  openModal(form(a), { wide: true, onOpen: (m) => { const d = m.querySelector('[data-del]'); if (d) d.onclick = async () => { if (!confirmInline(d)) return; await S.store.remove('accoms', { sid }, id); closeModal(); toast('평가조정을 지웠습니다'); }; },
    onSubmit: async (fd) => { const v = data(fd, a); await S.store.update('accoms', { sid }, id, v); toast(Object.keys(v.confirms).length < Object.keys(a.confirms || {}).length ? '저장했습니다. 내용이 바뀌어 다시 확인을 요청합니다.' : '저장했습니다'); } });
});
on('acc-confirm', async (el) => { const { sid, id } = el.dataset; await S.store.update('accoms', { sid }, id, { [`confirms.${S.me.uid}`]: Date.now() }); toast('확인 표시를 남겼습니다'); });
on('acc-eff-del', async (el) => { if (!confirmInline(el)) return; const { sid, id, i } = el.dataset; const a = accomsOf(sid).find((x) => x.id === id); const ef = [...(a.effects || [])]; ef.splice(+i, 1); await S.store.update('accoms', { sid }, id, { effects: ef }); });
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form.acc-eff'); if (!f) return;
  e.preventDefault();
  const { sid, id } = f.dataset; const a = accomsOf(sid).find((x) => x.id === id);
  const text = new FormData(f).get('text');
  await S.store.update('accoms', { sid }, id, { effects: [...(a.effects || []), { d: todayStr(), by: S.me.uid, text }] });
  toast('효과 메모를 남겼습니다');
});

// 한 장 인쇄: 화면 대신 A4 한 장 분량의 표만 인쇄한다
on('acc-print', (el) => {
  const { sid, id } = el.dataset; const a = accomsOf(sid).find((x) => x.id === id); const s = student(sid);
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = `<h1>${esc(s?.alias || '')} ${esc(a.subject)} 평가조정</h1>
    <p>${esc(S.school.name || '')} · 담당 ${esc(nameOf(s?.caseManager))} · 출력 ${esc(fmtDate(todayStr()))}</p>
    ${sheet(a, s)}
    <p class="print-note">평가조정은 평가 내용과 기준은 그대로 두고 제시·반응·시간·장소·일정만 바꿉니다. 이 문서는 학생 개인정보가 담긴 내부 자료이므로 사용 후 파기합니다.</p>`;
  document.body.classList.add('printing');
  logAccess(sid, 'print', `${a.subject} 평가조정 인쇄`);
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 500); }, 50);
});
