// 학사일정 파일로 넣기(관리자): 엑셀·한글·PDF 파일 또는 붙여 넣은 글 → 미리보기에서 고치고 고른 것만 넣는다.
import { esc, toast, openModal, closeModal, fmtDate } from '../util.js';
import { S, on, rerender, isAdmin } from '../state.js';
import { ACCEPT, fileToLines, linesToEvents, rowsToEvents, finalize, schoolYearOf, majorityYear, templateBlob } from '../importer.js';
import { CAT } from './calendar.js';

const defaultYear = () => {
  const y = parseInt((S.school?.yearStart || '').slice(0, 4), 10);
  if (y) return y;
  const d = new Date(); return d.getMonth() >= 2 ? d.getFullYear() : d.getFullYear() - 1;
};

function step1() {
  return `<form class="imp-form"><h2>학사일정 파일로 넣기</h2>
    <p class="small">학교 학사일정 파일을 올리면 날짜와 일정 이름을 찾아 미리 보여 줍니다. 확인하고 고친 뒤 고른 것만 넣습니다.</p>
    <label class="drop" data-drop>
      <input type="file" name="file" accept="${ACCEPT}" class="sr-only">
      <span class="drop-big">파일을 여기에 끌어 놓거나 눌러서 고르세요</span>
      <span class="drop-types"><span class="ft xl">엑셀 xlsx·xls·csv</span><span class="ft hw">한글 hwp·hwpx</span><span class="ft pd">PDF</span></span>
    </label>
    <p class="small muted">파일은 이 컴퓨터(브라우저) 안에서만 읽고 어디에도 올리지 않습니다. 넣는 것은 날짜·일정 이름뿐입니다.</p>
    <details class="paste"><summary>파일 대신 글로 붙여 넣기</summary>
      <textarea name="paste" rows="6" placeholder="예)&#10;10. 12.(월) ~ 10. 16.(금) 학부모 상담 주간&#10;10월 21일 현장체험학습&#10;2026.10.28. 15:00 개별화교육지원팀 협의회"></textarea>
      <button type="button" class="ghost sm" data-paste>붙여 넣은 글 읽기</button>
    </details>
    <div class="imp-tips small">
      <p><b>잘 읽히는 파일</b> 엑셀 양식(아래 내려받기), 날짜와 일정이 한 줄(또는 표의 한 행)에 함께 있는 한글·PDF 표, 「3월·4월…」 열로 된 달력 모양 엑셀</p>
      <p><b>읽지 못하는 파일</b> 배포용·암호 한글 파일, 스캔한 그림 PDF → 내용을 복사해 위 「글로 붙여 넣기」를 쓰세요.</p>
    </div>
    <div class="actions"><button type="button" class="ghost" data-template>엑셀 양식 내려받기</button><span class="grow"></span><button type="button" class="ghost" data-close>닫기</button></div>
    <p class="imp-status small" aria-live="polite"></p>
  </form>`;
}

function preview(state) {
  const n = state.evs.filter((e) => e.on).length;
  const rows = state.evs.map((e, i) => `<tr class="${e.on ? '' : 'off'}">
    <td><input type="checkbox" data-i="${i}" data-f="on" ${e.on ? 'checked' : ''} aria-label="${esc(e.title)} 넣기"></td>
    <td class="dates"><input type="date" value="${esc(e.date)}" data-i="${i}" data-f="date" aria-label="시작일"><input type="date" value="${esc(e.endDate)}" data-i="${i}" data-f="endDate" aria-label="끝나는 날"></td>
    <td class="wide"><input value="${esc(e.title)}" data-i="${i}" data-f="title" aria-label="일정 이름"></td>
    <td><select data-i="${i}" data-f="cat" aria-label="분류">${Object.entries(CAT).map(([k, l]) => `<option value="${k}" ${e.cat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
    <td class="note">${e.start ? `<span>${esc(e.start + (e.end ? '~' + e.end : ''))}</span>` : ''}${e.note ? `<span class="muted">${esc(e.note)}</span>` : ''}</td></tr>`).join('');
  return `<form class="imp-form"><h2>읽은 학사일정 확인</h2>
    <p class="small"><b>${esc(state.name)}</b> (${esc(state.kind)})에서 일정 <b>${state.evs.length}</b>건을 찾았습니다. 공휴일과 이미 있는 일정은 빼 두었습니다.</p>
    ${state.warn ? `<p class="small alert">${esc(state.warn)}</p>` : ''}
    <div class="row2 imp-bar"><label>학년도(월·일만 적힌 날짜의 연도 기준)<input type="number" name="sy" min="2020" max="2100" value="${state.sy}" ${state.lines ? '' : 'disabled'}></label>
      <span class="btns"><button type="button" class="ghost sm" data-all="1">모두 고르기</button><button type="button" class="ghost sm" data-all="0">모두 빼기</button></span></div>
    ${state.evs.length ? `<div class="imp-table-wrap"><table class="imp-table"><thead><tr><th>넣기</th><th>시작일 · 끝나는 날</th><th>일정 이름</th><th>분류</th><th>시각 · 비고</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<p class="alert">날짜와 일정 이름을 함께 찾지 못했습니다. 날짜와 일정이 한 줄에 있는지 확인하거나, 엑셀 양식을 쓰거나, 글로 붙여 넣어 보세요.</p>`}
    <details class="small"><summary>파일에서 읽은 글 보기(${state.lineCount}줄)</summary><pre class="imp-raw">${esc(state.raw)}</pre></details>
    <div class="actions"><button type="button" class="ghost" data-back>다른 파일</button><span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="submit" class="primary" ${n ? '' : 'disabled'}>고른 ${n}건 넣기</button></div>
  </form>`;
}

export function openImport() {
  if (!isAdmin()) return toast('학사일정은 관리자만 넣을 수 있습니다');
  const modal = openModal(step1(), { wide: true });
  const st = { evs: [] };
  const reparse = () => { st.evs = finalize(st.rows ? rowsToEvents(st.rows, st.sy).concat(linesToEvents(st.lines || [], st.sy)) : linesToEvents(st.lines || [], st.sy), S.acad, st.sy); };
  const focusFirst = () => { const h = modal.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); } };
  const showPreview = () => { modal.innerHTML = preview(st); bindPreview(); focusFirst(); };
  const read = async (getLines, name) => {
    const status = modal.querySelector('.imp-status'); if (status) status.textContent = '읽는 중입니다…';
    try {
      const r = await getLines();
      Object.assign(st, { name, kind: r.kind, warn: r.warn || '', lines: r.lines || [], rows: r.rows && r.rows.length ? r.rows : null });
      const raw = [...(r.rows || []).map((x) => `${x.dateText} ${x.endText ? '~ ' + x.endText : ''} | ${x.title}`), ...(r.lines || [])];
      st.raw = raw.slice(0, 400).join('\n') + (raw.length > 400 ? `\n… (${raw.length - 400}줄 더)` : '');
      st.lineCount = raw.length;
      // 학년도: 글 속 「2026학년도」 → 연도가 적힌 날짜들의 다수 학년도 → 학교 설정 순서로 정한다
      const named = schoolYearOf(st.lines, 0);
      st.sy = named || defaultYear(); reparse();
      if (!named) { const yrs = st.evs.filter((e) => e.yearGiven); const m = majorityYear(yrs.length ? yrs : [], st.sy); if (m !== st.sy) { st.sy = m; reparse(); } }
      showPreview();
    } catch (err) { console.warn(err); if (status) status.innerHTML = `<span class="alert">${esc(err.message || String(err))}</span>`; }
  };
  const bindStep1 = () => {
    const f = modal.querySelector('form');
    const input = f.querySelector('input[type=file]'), drop = f.querySelector('[data-drop]');
    input.addEventListener('change', () => input.files[0] && read(() => fileToLines(input.files[0]), input.files[0].name));
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { const file = e.dataTransfer.files[0]; if (file) read(() => fileToLines(file), file.name); });
    f.querySelector('[data-paste]').onclick = () => { const t = f.paste.value.trim(); if (!t) return toast('붙여 넣을 글이 없습니다'); read(async () => ({ kind: '붙여 넣은 글', lines: t.split(/\r?\n/) }), '붙여 넣은 글'); };
    f.querySelector('[data-template]').onclick = async () => {
      const blob = await templateBlob(); const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = '학사일정_양식.xlsx'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  };
  const bindPreview = () => {
    const f = modal.querySelector('form');
    const count = () => { const n = st.evs.filter((e) => e.on).length; const b = f.querySelector('[type=submit]'); b.textContent = `고른 ${n}건 넣기`; b.disabled = !n; };
    f.addEventListener('input', (e) => {
      const el = e.target; if (el.name === 'sy') { const v = parseInt(el.value, 10); if (v >= 2020 && v <= 2100) { st.sy = v; reparse(); showPreview(); } return; }
      const i = el.dataset.i; if (i === undefined) return;
      const ev = st.evs[+i]; if (el.dataset.f === 'on') { ev.on = el.checked; el.closest('tr').classList.toggle('off', !ev.on); count(); } else ev[el.dataset.f] = el.value;
    });
    f.addEventListener('change', (e) => { const el = e.target; if (el.dataset.f === 'cat') st.evs[+el.dataset.i].cat = el.value; });
    f.querySelectorAll('[data-all]').forEach((b) => (b.onclick = () => { st.evs.forEach((e) => (e.on = b.dataset.all === '1')); showPreview(); }));
    f.querySelector('[data-back]').onclick = () => { modal.innerHTML = step1(); bindStep1(); focusFirst(); };
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pick = st.evs.filter((x) => x.on && x.date && x.title.trim());
      const bad = pick.find((x) => x.endDate && x.endDate < x.date); if (bad) return toast(`「${bad.title}」의 끝나는 날이 시작일보다 앞입니다`);
      const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = '넣는 중…';
      let n = 0;
      try {
        for (const x of pick) { await S.store.create('acad', {}, { title: x.title.trim(), cat: x.cat, date: x.date, endDate: x.endDate || x.date, start: x.start || '', end: x.end || '', place: x.place || '', memo: x.memo || '', source: st.name, createdBy: S.me.uid, createdAt: Date.now() }); n++; }
        closeModal(); toast(`학사일정 ${n}건을 넣었습니다`);
        if (pick[0]) { S.ui.calMonth = pick[0].date.slice(0, 7); S.ui.calDay = pick[0].date; }
        if (!location.hash.startsWith('#/calendar')) location.hash = '#/calendar'; else rerender();
      } catch (err) { toast(`${n}건을 넣고 멈췄습니다: ${err.message}`); btn.disabled = false; count(); }
    });
  };
  bindStep1();
}

on('acad-import', () => openImport());
export { fmtDate };
