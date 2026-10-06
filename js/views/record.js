// 행동 즉시 기록 버튼과 기록 수정(교사·보조인력 공용)
import { esc, todayStr, timeStr, toMs, dateOf, fmtClock, fmtDur, openModal, closeModal, toast, newId } from '../util.js';
import { S, on, rerender, nameOf, isTeacher, go } from '../state.js';
import { INT_LABEL } from '../charts.js';

export const ANTECEDENTS = ['과제 제시', '활동 전환', '요구 거절', '대기 시간', '소음·혼잡', '혼자 있음', '또래 상호작용'];
export const CONSEQUENCES = ['교사 관심', '또래 관심', '과제 중단·회피', '물건·활동 얻음', '무시(계획된)', '자리 옮김'];
export const INTENSITY = { 1: '약함', 2: '중간', 3: '강함' };

const RUN_KEY = 'ieptalk-running';
try { S.running = JSON.parse(localStorage.getItem(RUN_KEY)) || {}; } catch { S.running = {}; }
const saveRunning = () => { try { localStorage.setItem(RUN_KEY, JSON.stringify(S.running)); } catch {} };

// 두 번째 관찰자(관찰자 간 일치도용) 모드: 학생별로 이 기기에 기억한다
const IOA_KEY = 'ieptalk-ioa';
let ioaOn = {}; try { ioaOn = JSON.parse(localStorage.getItem(IOA_KEY)) || {}; } catch {}
export const isIoa = (sid) => !!ioaOn[sid];
on('ioa-toggle', (el) => { ioaOn[el.dataset.sid] = el.checked; try { localStorage.setItem(IOA_KEY, JSON.stringify(ioaOn)); } catch {} rerender(); });

// 저장: 통신이 끊겨도 기기에 먼저 저장되고(파이어베이스 로컬 캐시), 연결되면 서버로 올라간다. 그래서 응답을 기다리지 않는다.
export function saveEvent(ev) {
  const id = newId();
  Promise.resolve(S.store.create('bevents', {}, ev, id)).catch((err) => { console.error(err); toast('기록을 저장하지 못했습니다: ' + (err.message || err)); });
  return id;
}

// 학생 한 명의 표적행동 버튼 묶음. events: 오늘 집계에 쓸 기록(보조인력은 자기 기록만)
export function recordCard(stu, targets, events) {
  const today = todayStr();
  const btns = targets.length ? targets.map((t) => {
    const key = `${stu.id}:${t.id}`;
    const todays = events.filter((e) => e.targetId === t.id && e.date === today && e.type !== 'session');
    const run = S.running[key];
    const mineToday = todays.filter((e) => !!e.ioa === isIoa(stu.id));
    const count = t.method === 'dur' ? `오늘 ${fmtDur(mineToday.reduce((a, e) => a + ((e.end || e.at) - e.at) / 1000, 0))}`
      : t.method === 'int' ? `오늘 ${mineToday.length}회기${mineToday.length ? ` · 발생 ${Math.round(100 * mineToday.flatMap((e) => e.results || []).filter(Boolean).length / Math.max(1, mineToday.flatMap((e) => e.results || []).length))}%` : ''}`
      : t.method === 'lat' ? `오늘 ${mineToday.length}번 지시${mineToday.filter((e) => e.end).length ? ` · 평균 ${Math.round(mineToday.filter((e) => e.end).reduce((a, e) => a + (e.end - e.at) / 1000, 0) / mineToday.filter((e) => e.end).length)}초` : ''}`
      : `오늘 ${mineToday.length}회`;
    const observed = events.some((e) => e.targetId === t.id && e.date === today);
    const main = t.method === 'int'
      ? `<button type="button" class="rec-btn" data-act="int-open" data-sid="${stu.id}" data-tid="${t.id}" aria-label="${esc(t.name)} 간격기록 회기 시작"><span class="rec-name">${esc(t.name)}</span><span class="rec-sub">${INT_LABEL[t.intType || 'partial']} ${esc(t.intervalSec || 10)}초 × ${esc(t.intervals || 30)}칸 시작</span></button>`
      : t.method === 'lat'
      ? (run ? `<button type="button" class="rec-btn running" data-act="lat-stop" data-sid="${stu.id}" data-tid="${t.id}" aria-label="${esc(t.name)} 행동 시작함"><span class="rec-name">${esc(t.name)}</span><span class="rec-sub">행동 시작함 · <span data-timer="${run.start}">0:00</span></span></button>
          <button type="button" class="link sm" data-act="lat-none" data-sid="${stu.id}" data-tid="${t.id}">반응 없음으로 끝내기</button>`
        : `<button type="button" class="rec-btn" data-act="rec-start" data-sid="${stu.id}" data-tid="${t.id}" aria-label="${esc(t.name)} 지시 줌, 잠재시간 측정 시작"><span class="rec-name">${esc(t.name)}</span><span class="rec-sub">지시를 주면 누름(잠재시간)</span></button>`)
      : t.method === 'dur'
      ? (run ? `<button type="button" class="rec-btn running" data-act="rec-stop" data-sid="${stu.id}" data-tid="${t.id}" aria-label="${esc(t.name)} 지속시간 기록 끝내기"><span class="rec-name">${esc(t.name)}</span><span class="rec-sub">끝내기 · <span data-timer="${run.start}">0:00</span></span></button>`
        : `<button type="button" class="rec-btn" data-act="rec-start" data-sid="${stu.id}" data-tid="${t.id}" aria-label="${esc(t.name)} 지속시간 기록 시작"><span class="rec-name">${esc(t.name)}</span><span class="rec-sub">누르면 시작(지속시간)</span></button>`)
      : `<button type="button" class="rec-btn" data-act="rec-tap" data-sid="${stu.id}" data-tid="${t.id}" aria-label="${esc(t.name)} 1회 기록"><span class="rec-name">${esc(t.name)}</span><span class="rec-sub">한 번 누르면 1회</span></button>`;
    return `<div class="rec-item">${main}
      <div class="rec-meta"><span>${count}</span>
        ${!observed ? `<button type="button" class="link sm" data-act="rec-none" data-sid="${stu.id}" data-tid="${t.id}">오늘 관찰했고 발생 없음</button>` : ''}
        <details><summary>정의</summary><p>${esc(t.definition || '정의가 아직 없습니다.')}</p>${t.examples ? `<p><b>해당:</b> ${esc(t.examples)}</p>` : ''}${t.nonExamples ? `<p><b>해당 안 됨:</b> ${esc(t.nonExamples)}</p>` : ''}</details>
      </div></div>`;
  }).join('') : '<p class="muted">표적행동이 아직 정해지지 않았습니다. 담당 교사가 정하면 버튼이 나타납니다.</p>';
  const ioa = isIoa(stu.id);
  const ioaSw = targets.length ? `<label class="switch ioa-sw"><input type="checkbox" data-change="ioa-toggle" data-sid="${stu.id}" ${ioa ? 'checked' : ''}> 두 번째 관찰자로 기록(관찰자 간 일치도용)</label>` : '';
  return `<section class="card rec-card ${ioa ? 'ioa-on' : ''}" aria-label="${esc(stu.alias)} 행동 기록"><h3>${esc(stu.alias)} <small class="muted">${esc(stu.grade || '')}</small></h3>
    ${ioa ? '<p class="small ioa-note">지금 누르는 기록은 일치도 계산에만 쓰이고 그래프에는 들어가지 않습니다. 주 관찰자와 같은 시간에 따로 관찰하세요.</p>' : ''}<div class="rec-grid">${btns}</div>${ioaSw}</section>`;
}

export const baseEvent = (sid, tid, type, at) => ({ studentId: sid, targetId: tid, type, at, date: dateOf(at), intensity: null, antecedent: '', consequence: '', note: '', ...(isIoa(sid) ? { ioa: true } : {}), createdBy: S.me.uid, createdAt: Date.now(), updatedAt: Date.now() });

on('rec-tap', async (el) => {
  const { sid, tid } = el.dataset;
  el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 400);
  if (navigator.vibrate) navigator.vibrate(30);
  const id = saveEvent(baseEvent(sid, tid, 'freq', Date.now()));
  toast('1회 기록했습니다', { label: '상황 덧붙이기', run: () => editEvent(id, sid, tid) });
});
on('rec-start', (el) => {
  const { sid, tid } = el.dataset;
  S.running[`${sid}:${tid}`] = { start: Date.now() }; saveRunning();
  if (navigator.vibrate) navigator.vibrate(30);
  rerender();
});
on('rec-stop', async (el) => {
  const { sid, tid } = el.dataset; const key = `${sid}:${tid}`;
  const run = S.running[key]; if (!run) return;
  delete S.running[key]; saveRunning();
  const ev = baseEvent(sid, tid, 'dur', run.start); ev.end = Date.now();
  const id = saveEvent(ev);
  toast(`${fmtDur((ev.end - ev.at) / 1000)} 기록했습니다`, { label: '상황 덧붙이기', run: () => editEvent(id, sid, tid) });
});
on('rec-none', async (el) => {
  const { sid, tid } = el.dataset;
  saveEvent(baseEvent(sid, tid, 'session', Date.now()));
  toast('오늘 관찰 회기(발생 0)를 남겼습니다');
});
// 잠재시간: 지시를 주면 시작(rec-start 재사용), 행동이 시작되면 끝
on('lat-stop', (el) => {
  const { sid, tid } = el.dataset; const key = `${sid}:${tid}`; const run = S.running[key]; if (!run) return;
  delete S.running[key]; saveRunning();
  const ev = baseEvent(sid, tid, 'lat', run.start); ev.end = Date.now();
  const id = saveEvent(ev);
  toast(`잠재시간 ${fmtDur((ev.end - ev.at) / 1000)} 기록했습니다`, { label: '메모 덧붙이기', run: () => editEvent(id, sid, tid) });
});
on('lat-none', (el) => {
  const { sid, tid } = el.dataset; const key = `${sid}:${tid}`; const run = S.running[key]; if (!run) return;
  delete S.running[key]; saveRunning();
  const ev = baseEvent(sid, tid, 'lat', run.start); ev.end = null; ev.noResponse = true;
  saveEvent(ev); toast('반응 없음으로 남겼습니다(평균에는 넣지 않음)');
});
on('rec-edit', (el) => editEvent(el.dataset.id, el.dataset.sid, el.dataset.tid));

// 기록 찾기: 교사는 학생별 구독, 보조인력은 내 기록
function findEvent(id) {
  return S.myEvents.find((e) => e.id === id) || Object.values(S.eventsBy).flat().find((e) => e.id === id);
}

const chipGroup = (name, opts, val) => `<div class="chips" role="radiogroup" aria-label="${name === 'antecedent' ? '선행사건' : '결과'}">${opts.map((o) => `<label class="chip"><input type="radio" name="${name}" value="${esc(o)}" ${val === o ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`;

export function editEvent(id, sid, tid) {
  const e = findEvent(id);
  const stu = S.students.find((s) => s.id === (e?.studentId || sid));
  const t = (S.targetsBy[stu?.id] || []).find((x) => x.id === (e?.targetId || tid));
  if (!e) return toast('기록을 아직 불러오지 못했습니다. 잠시 뒤 다시 눌러 주세요.');
  const mine = e.createdBy === S.me.uid;
  const isDur = e.type === 'dur';
  const durSec = isDur ? Math.round(((e.end || e.at) - e.at) / 1000) : 0;
  openModal(`<form>
    <h2>${esc(stu?.alias || '')} · ${esc(t?.name || '행동')} 기록</h2>
    <p class="muted small">기록자 ${esc(nameOf(e.createdBy))} · ${fmtClock(e.createdAt)} 저장${e.updatedAt && e.updatedAt !== e.createdAt ? ` · ${fmtClock(e.updatedAt)} 수정` : ''}</p>
    <div class="row2"><label>날짜<input type="date" name="date" value="${esc(e.date)}" required></label>
    <label>시각<input type="time" name="time" value="${timeStr(new Date(e.at))}" required></label></div>
    ${e.type === 'lat' ? `<div class="row2"><label>잠재시간 초<input type="number" min="0" name="ls" value="${e.end ? Math.round((e.end - e.at) / 1000) : ''}" placeholder="반응 없음이면 비움"></label></div>` : ''}
    ${e.type === 'int' ? `<p class="small">${INT_LABEL[e.intType || 'partial']} ${esc(e.intervalSec)}초 × ${(e.results || []).length}칸 · 발생 ${(e.results || []).filter(Boolean).length}칸</p>` : ''}
    ${isDur ? `<div class="row2"><label>지속 분<input type="number" min="0" name="dm" value="${Math.floor(durSec / 60)}"></label><label>지속 초<input type="number" min="0" max="59" name="ds" value="${durSec % 60}"></label></div>` : ''}
    ${e.ioa ? '<p class="small ioa-note">두 번째 관찰자(일치도용) 기록입니다. 그래프에는 들어가지 않습니다.</p>' : ''}
    ${e.type === 'session' ? '<p class="muted">발생 없음(관찰 회기) 기록입니다.</p>' : e.type === 'int' || e.type === 'lat' ? '' : `
    <fieldset><legend>강도</legend><div class="chips">${[1, 2, 3].map((n) => `<label class="chip"><input type="radio" name="intensity" value="${n}" ${+e.intensity === n ? 'checked' : ''}><span>${INTENSITY[n]}</span></label>`).join('')}</div></fieldset>
    <fieldset><legend>바로 앞 상황(선행사건)</legend>${chipGroup('antecedent', ANTECEDENTS, e.antecedent)}</fieldset>
    <fieldset><legend>바로 뒤 결과</legend>${chipGroup('consequence', CONSEQUENCES, e.consequence)}</fieldset>
    <label class="chk restraint"><input type="checkbox" name="restraint" ${e.restraint ? 'checked' : ''}> 물리적 제지가 있었음(위기행동 사후 기록이 필요함)</label>`}
    <label>메모<textarea name="note" rows="2" placeholder="필요할 때만 짧게">${esc(e.note || '')}</textarea></label>
    <div class="actions">
      ${mine || S.me.role !== 'aide' ? `<button type="button" class="danger ghost" data-del>삭제</button>` : ''}
      <span class="grow"></span><button type="button" class="ghost" data-close>닫기</button><button type="submit" class="primary">저장</button>
    </div></form>`, {
    onOpen: (m) => {
      const del = m.querySelector('[data-del]');
      if (del) del.onclick = async () => { if (!confirmInline(del)) return; await S.store.remove('bevents', {}, id); closeModal(); toast('기록을 지웠습니다'); };
    },
    onSubmit: async (fd) => {
      const at = toMs(fd.get('date'), fd.get('time'));
      const patch = { at, date: fd.get('date'), note: fd.get('note') || '', updatedAt: Date.now() };
      if (!['session', 'int', 'lat'].includes(e.type)) Object.assign(patch, { intensity: fd.get('intensity') ? Number(fd.get('intensity')) : null, antecedent: fd.get('antecedent') || '', consequence: fd.get('consequence') || '', restraint: fd.get('restraint') === 'on' });
      if (isDur) patch.end = at + ((Number(fd.get('dm')) || 0) * 60 + (Number(fd.get('ds')) || 0)) * 1000;
      if (e.type === 'int') patch.end = at + ((e.end || e.at) - e.at);
      if (e.type === 'lat') { const ls = fd.get('ls'); patch.end = ls === '' ? null : at + Number(ls) * 1000; patch.noResponse = ls === ''; }
      Promise.resolve(S.store.update('bevents', {}, id, patch)).catch((err) => toast('수정을 저장하지 못했습니다: ' + err.message));
      const crisis = !!patch.restraint;
      if (crisis && isTeacher() && !e.incidentId) toast('위기행동 사후 기록을 시작할까요?', { label: '사후 기록 열기', run: () => go(`#/student/${e.studentId}/crisis/new/${id}`) });
      else if (crisis) toast('저장했습니다. 담당 교사 화면에 사후 기록 요청이 표시됩니다.');
      else toast('수정 내용을 저장했습니다');
    }
  });
}

// 확인 대화상자 대신 버튼을 두 번 누르게 한다
export function confirmInline(btn) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1'; const t = btn.textContent; btn.textContent = '한 번 더 누르면 삭제';
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = t; }, 3000);
  return false;
}

// 기록 목록(행)
export function eventRow(e, { showStudent = true, showBy = false } = {}) {
  const stu = S.students.find((s) => s.id === e.studentId);
  const t = (S.targetsBy[e.studentId] || []).find((x) => x.id === e.targetId);
  const what = e.type === 'session' ? '관찰함(발생 없음)' : e.type === 'dur' ? fmtDur(((e.end || e.at) - e.at) / 1000)
    : e.type === 'int' ? `${INT_LABEL[e.intType || 'partial']} 발생 ${(e.results || []).filter(Boolean).length}/${(e.results || []).length}칸`
    : e.type === 'lat' ? (e.end ? `잠재시간 ${fmtDur((e.end - e.at) / 1000)}` : '반응 없음') : '1회';
  const ctx = [e.antecedent && `앞: ${e.antecedent}`, e.consequence && `뒤: ${e.consequence}`, e.intensity && `강도 ${INTENSITY[e.intensity]}`].filter(Boolean).join(' · ');
  return `<li><button type="button" class="row-btn" data-act="rec-edit" data-id="${e.id}" data-sid="${e.studentId}" data-tid="${e.targetId}">
    <span class="time">${fmtClock(e.at)}</span>
    <span class="grow"><b>${showStudent ? esc(stu?.alias || '') + ' · ' : ''}${esc(t?.name || '행동')}</b> ${what}${e.ioa ? ' <span class="tag">일치도</span>' : ''}${e.restraint ? ' <span class="tag warn">물리적 제지</span>' : ''}${ctx ? `<br><small class="muted">${esc(ctx)}</small>` : ''}${e.note ? `<br><small>${esc(e.note)}</small>` : ''}</span>
    ${showBy ? `<small class="muted">${esc(nameOf(e.createdBy))}</small>` : ''}<span class="chev" aria-hidden="true">›</span></button></li>`;
}
