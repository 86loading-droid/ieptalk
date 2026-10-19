// IEP 생성기(v21): 두 방식
//  1) 교과·성취기준: 학년 → 교과 → 단원 → 차시 → 성취기준(원문) → 학생 요구(장애영역·현행 수준·참여 방식·반응 양식)
//     → 수준별 차시 목표와 IEP 목표 초안. 원문의 중도중복장애 지도 내용(성취기준 적용 시 고려 사항)을 함께 안내.
//  2) 생활 기능 영역: 과정·장애영역·교과(생활 영역)·하위 영역·현행 수준(v20 방식).
// 「IEP 목표로 저장」을 누르면 조건·행동·기준을 갖춘 목표로 저장되어 진전도 그래프를 바로 쓸 수 있다. 생성 문장은 초안이다.
import { esc, todayStr, addDays, openModal, toast } from '../util.js';
import { S, on, student } from '../state.js';
import { COURSES, DISABILITIES, SUBJECTS, SUBJECT_GROUPS, LEVELS } from './iepdata.js';
import { copyText } from './pireport.js';
import { goalMissing } from './students.js';
import { loadIndex, loadSubject, loadUnits, GRADES, bandOf, findStd, guidanceOf, suggestStds, sourceLine } from './curriculum.js';

// 받침에 따라 을/를, 이/가
const hasJong = (w) => { const c = String(w).trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; };
const eul = (w) => `${w}${hasJong(w) ? '을' : '를'}`;

function subjectsFor(course) {
  if (course === 'kinder') return [['누리과정 영역', Object.keys(SUBJECTS.kinder)], SUBJECT_GROUPS[1]];
  return SUBJECT_GROUPS;
}
const areasOf = (course, subj) => (course === 'kinder' && SUBJECTS.kinder[subj]) || SUBJECTS[subj] || [];

const SCENE = { kinder: '놀이와 일과 중', major: '작업·실습 장면에서', default: '수업 중' };
const LV_DESC = { 1: '대부분 시범이나 신체 도움을 받아', 2: '언어 촉구나 그림 단서가 있을 때 일부', 3: '대체로 혼자 하지만 정확도가 일정하지 않게' };

export function buildIep(st) {
  const s = student(st.sid);
  const course = COURSES.find(([k]) => k === st.course);
  const area = areasOf(st.course, st.subj).find(([n]) => n === st.area);
  if (!course || !st.subj || !area) return null;
  const [areaName, behs, unit, evalHow] = area;
  const lv = Number(st.level) || course[2];
  const beh = behs[Math.min(behs.length, lv) - 1];
  const scene = SCENE[st.course] || SCENE.default;
  const task = unit.includes('단계');
  const crit = task ? '과제분석 단계의 80% 이상을 3회기 연속' : '10회 기회 중 8회 이상(80%)을 3회기 연속';
  const base = st.base === '' || st.base == null ? null : Number(st.base);
  const period = st.period === 'year' ? '학년 말' : '학기 말';
  const dis = st.dis.map((k) => DISABILITIES[k]).filter(Boolean);
  const supports = [...new Set(dis.flatMap(([, list]) => list))];
  const out = {
    title: `${s?.alias || ''} · ${course[1]} · ${st.subj}(${areaName})${dis.length ? ` · ${dis.map(([n]) => n).join(', ')}` : ''}`,
    present: `${st.subj} ${areaName} 영역에서 ${eul(beh)} ${LV_DESC[lv]} 수행한다${base != null ? `(현재 정반응 약 ${base}%)` : ''}. [관찰한 사실·자료로 고쳐 쓰기]`,
    long: `${period}까지 ${scene} 교사의 도움 없이 ${eul(beh)} ${crit} 수행한다.`,
    shorts: [
      `${scene} 교사가 시범을 보이고 언어 촉구를 주면 ${eul(beh)} 5회 기회 중 3회 이상 수행한다.`,
      `${scene} 언어 촉구나 그림 단서만 주면 ${eul(beh)} 5회 기회 중 4회 이상 수행한다.`,
      `${scene} 도움 없이 ${eul(beh)} ${crit} 수행한다.`
    ],
    eval: `${evalHow}(측정: ${unit}). 2주마다 진전도를 기록하고, 3회 연속 목표선 아래면 교수 방법을 조정한다.`,
    supports,
    udl: [
      `표상: ${st.subj} 내용을 실물·그림·영상·음성 등 여러 방식으로 제시`,
      `표현: 말하기·고르기·가리키기·AAC·쓰기 중 학생이 할 수 있는 방식으로 답하게 함`,
      `참여: 관심사 소재 활용, 선택 기회, 짧은 목표와 즉각적인 피드백`
    ],
    goal: { domain: `${st.subj}·${areaName}`, condition: `${scene} 교사의 도움 없이`, behavior: `${eul(beh)} 수행한다`, criterion: crit, measure: task ? '독립 수행 단계 비율(%)' : '정반응률(%)', direction: 'up', baseline: base ?? 0, target: 80 }
  };
  return out;
}

export function iepText(o) {
  return [
    `IEP 초안 — ${o.title}`,
    `현행 수준: ${o.present}`,
    `장기 목표: ${o.long}`,
    `단기 목표:\n 1) ${o.shorts[0]}\n 2) ${o.shorts[1]}\n 3) ${o.shorts[2]}`,
    `평가 방법: ${o.eval}`,
    o.supports.length ? `지원과 조정:\n- ${o.supports.join('\n- ')}` : '',
    `보편적 학습설계(UDL):\n- ${o.udl.join('\n- ')}`,
    '※ 성취기준은 교육과정 원문에서 골라 연결합니다. 이 초안은 IEP 팀 협의용입니다.'
  ].filter(Boolean).join('\n\n');
}

/* ---------- 교과·성취기준 모드 ----------
   학년 → 교과 → 단원 → 차시 → 성취기준을 버튼·드롭다운으로 고르고, 학생의 장애영역·현행 수준·참여 방식·반응 양식을 더하면
   수준별 차시 목표와 IEP 목표 초안을 만든다. 성취기준 원문과 원문의 「성취기준 적용 시 고려 사항」 가운데
   중도중복장애·장애 정도가 심한 학생 지도 내용을 함께 보여 준다(원문 그대로). */
export const PARTS = [['indep', '독립 수행'], ['partial', '부분 참여(일부 단계)'], ['alt', '대안 활동(같은 주제)']];
export const RESP = [['speak', '말'], ['point', '가리키기·고르기'], ['aac', '그림카드·AAC'], ['sign', '몸짓·수어'], ['gaze', '눈 응시'], ['switch', '스위치·보조공학'], ['write', '쓰기']];
const ro = (w) => { const c = String(w).trim().slice(-1).charCodeAt(0); if (!(c >= 0xac00 && c <= 0xd7a3)) return /[A-Za-z]$/.test(w) ? `${w}로` : `${w}(으)로`; const j = (c - 0xac00) % 28; return `${w}${j === 0 || j === 8 ? '로' : '으로'}`; };
const noDot = (t) => String(t || '').trim().replace(/[.。]\s*$/, '');
const lessonCore = (t) => noDot(String(t || '').replace(/^(도입 차시|\d+차시)\s*/, ''));
const SCENE_G = (g) => (g === '전공과' ? '실습 장면에서' : g?.startsWith('고') || g?.startsWith('중') ? '수업 중' : '수업 중');

function gradeFromStudent(s) {
  const g = String(s?.grade || ''); const n = (g.match(/\d/) || [])[0];
  if (!n) return '';
  if (/고/.test(g)) return `고${n}`; if (/중/.test(g)) return `중${n}`; if (/전공/.test(g)) return '전공과';
  return Number(n) <= 6 ? `초${n}` : '';
}
export function unitsKey(grade, subjName, units) {
  const lv = grade === '전공과' ? '고' : grade.slice(0, 1);
  for (const k of [`${grade}|${subjName}`, `${lv}|${subjName}`, `공통|${subjName}`]) if (units?.[k]) return k;
  return '';
}

export function buildStdIep(st, ctx) {
  const s = student(st.sid);
  const { subj, hit, guide } = ctx;
  if (!st.grade || !subj || !hit) return null;
  const std = hit.std, isEl = !!std.el;
  const lv = Number(st.level) || 2;
  const part = st.part || (lv === 1 ? 'alt' : lv === 2 ? 'partial' : 'indep');
  const respNames = st.resp.map((k) => (RESP.find(([v]) => v === k) || [])[1]).filter(Boolean);
  const resp = respNames.length ? respNames.join('이나 ') : '학생이 쓰는 반응 방식';
  const respRo = respNames.length ? resp.slice(0, resp.length - respNames[respNames.length - 1].length) + ro(respNames[respNames.length - 1]) : '학생이 쓰는 반응 방식으로';
  const unit = st.unit && st.unit !== '__free' ? st.unit : st.unitFree;
  const lesson = st.lesson && st.lesson !== '__free' ? st.lesson : st.lessonFree;
  const act = lessonCore(lesson) || (unit ? `${unit} 단원 활동` : `${subj.name} 수업 활동`);
  const scene = SCENE_G(st.grade);
  const stdLabel = isEl ? `「${std.t}」 내용 요소` : `[${std.c}] 「${noDot(std.t)}」`;
  const relate = isEl ? `「${std.t}」 관련 과제` : `「${noDot(std.t)}」 관련 과제`;
  const crit = '10회 기회 중 8회 이상(80%)을 3회기 연속';
  const base = st.base === '' || st.base == null ? null : Number(st.base);
  const period = st.period === 'year' ? '학년 말' : '학기 말';
  const dis = st.dis.map((k) => DISABILITIES[k]).filter(Boolean);
  const supports = [...new Set(dis.flatMap(([, list]) => list))];
  const tiers = [
    ['indep', '기본(독립 수행)', `「${act}」 활동에서 ${relate}를 스스로 ${respRo} 수행한다.`],
    ['partial', '수정(부분 참여)', `같은 활동에서 그림 단서나 언어 촉구를 받아 ${relate}의 핵심 단계를 ${respRo} 수행한다.`],
    ['alt', '대안(같은 주제·다른 과제)', `같은 주제로 선택하기·짝 맞추기·눈 응시나 스위치로 반응하기 등 대안 과제에 ${respRo} 참여한다.`]
  ];
  const sevPick = guide.sev.slice(0, 3).map((x) => (x.l ? `${x.l}: ` : '') + x.x);
  return {
    title: `${s?.alias || ''} · ${st.grade} · ${subj.name}${unit ? ` · ${unit}` : ''}${lesson ? ` · ${lessonCore(lesson)}` : ''}`,
    stdLine: `${isEl ? '내용 요소' : '성취기준'}: ${isEl ? `${hit.area.name} 영역 「${std.t}」` : `[${std.c}] ${std.t}`}`,
    present: `${subj.name} ${hit.area.name || ''} 영역의 ${relate}를 ${lv === 1 ? '대부분 시범이나 신체 도움을 받아' : lv === 2 ? '언어 촉구나 그림 단서가 있을 때 일부' : '대체로 혼자 하지만 정확도가 일정하지 않게'} 수행한다${base != null ? `(현재 정반응 약 ${base}%)` : ''}.${respNames.length ? ` 주로 ${respRo} 반응한다.` : ''} [관찰한 사실·자료로 고쳐 쓰기]`,
    tiers, part,
    long: `${period}까지 ${scene} 교사의 도움 없이 ${relate}를 ${respRo} ${crit} 수행한다.`,
    shorts: [
      `${scene} 교사가 시범을 보이고 언어 촉구를 주면 ${relate}를 ${respRo} 5회 기회 중 3회 이상 수행한다.`,
      `${scene} 언어 촉구나 그림 단서만 주면 ${relate}를 ${respRo} 5회 기회 중 4회 이상 수행한다.`,
      `${scene} 도움 없이 ${relate}를 ${respRo} ${crit} 수행한다.`
    ],
    eval: `수행 관찰 체크리스트와 작품·기록(포트폴리오)으로 평가한다. 측정: 정반응률(%). 2주마다 진전도를 기록하고 3회 연속 목표선 아래면 교수 방법을 조정한다.${part !== 'indep' ? ' 부분 참여·대안 과제는 참여한 단계와 촉구 수준을 함께 적는다.' : ''}`,
    supports, sevPick,
    udl: [
      `표상: ${subj.name} 내용을 실물·그림·영상·음성 등 여러 방식으로 제시`,
      `표현: ${resp} 등 학생이 할 수 있는 방식으로 답하게 함`,
      '참여: 관심사 소재 활용, 선택 기회, 짧은 목표와 즉각적인 피드백'
    ],
    goal: { domain: `${subj.name}·${isEl ? std.t : std.c}`, condition: `${scene} 교사의 도움 없이`, behavior: `${relate}를 ${respRo} 수행한다`, criterion: crit, measure: '정반응률(%)', direction: 'up', baseline: base ?? 0, target: 80,
      std: { code: isEl ? '' : std.c, text: std.t, band: bandOf(st.grade), subject: subj.name, area: hit.area.name || '' }, unit: unit || '', lesson: lesson || '' }
  };
}

export function stdIepText(o) {
  return [
    `IEP 초안 — ${o.title}`,
    o.stdLine,
    `현행 수준: ${o.present}`,
    `차시 목표(수준별, ▶ 이 학생):\n${o.tiers.map(([k, l, t]) => ` ${k === o.part ? '▶' : '·'} ${l}: ${t}`).join('\n')}`,
    `장기 목표: ${o.long}`,
    `단기 목표:\n 1) ${o.shorts[0]}\n 2) ${o.shorts[1]}\n 3) ${o.shorts[2]}`,
    `평가 방법: ${o.eval}`,
    o.supports.length ? `지원과 조정:\n- ${o.supports.join('\n- ')}` : '',
    o.sevPick.length ? `교육과정 원문의 중도중복장애·장애 정도가 심한 학생 지도(성취기준 적용 시 고려 사항):\n- ${o.sevPick.join('\n- ')}` : '',
    `보편적 학습설계(UDL):\n- ${o.udl.join('\n- ')}`,
    '※ 성취기준·고려 사항은 2022 개정 특수교육 기본 교육과정 원문(국가교육위원회 고시 제2026-2호 일부개정 포함)에서 옮겼습니다. 목표 문장은 IEP 팀 협의용 초안입니다.'
  ].filter(Boolean).join('\n\n');
}

export function openIepGen(sid) {
  const s0 = student(sid);
  const st = { sid, mode: 'std', grade: gradeFromStudent(s0), subj: '', unit: '', unitFree: '', lesson: '', lessonFree: '', code: '', dis: [], level: '', part: '', resp: [], base: '', period: 'term',
    course: '', area: '', ed: {} };
  const D = { idx: null, units: null, subj: {}, err: '' };
  let modal = null;
  const paint = () => {
    if (!modal) return;
    const act = document.activeElement; const key = act?.dataset?.igin || act?.dataset?.ig;
    modal.querySelector('.ig-body').innerHTML = st.mode === 'life' ? lifeBody() : stdBody();
    modal.querySelectorAll('.ig-mode [data-mode]').forEach((b) => { const on = b.dataset.mode === st.mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    if (key) { const el = modal.querySelector(`[data-igin="${key}"]`); if (el && el.tagName !== 'BUTTON') el.focus(); }
  };
  Promise.all([loadIndex(), loadUnits()]).then(([i, u]) => { D.idx = i; D.units = u.units; paint(); }).catch(() => { D.err = '교육과정 자료를 불러오지 못했습니다. 새로 고침 뒤 다시 여세요.'; paint(); });
  const needSubj = (id) => { if (!id || D.subj[id]) return; D.subj[id] = 'loading'; loadSubject(id).then((x) => { D.subj[id] = x; paint(); }).catch(() => { D.subj[id] = null; D.err = '교과 자료를 불러오지 못했습니다.'; paint(); }); };

  const chips = (k, list, multi = false) => `<div class="nt-chips">${list.map(([v, l]) => { const on = multi ? st[k].includes(v) : st[k] === v; return `<button type="button" class="pr-chip sm ${on ? 'on' : ''}" aria-pressed="${on}" data-ig="${k}" data-v="${esc(v)}">${esc(l)}</button>`; }).join('')}</div>`;
  const ctxOf = () => {
    const band = bandOf(st.grade);
    const meta = D.idx?.subjects.find((x) => x.id === st.subj);
    const sd = D.subj[st.subj]; const subj = sd && sd !== 'loading' ? sd : null;
    const hit = subj && st.code ? findStd(subj, band, st.code) : null;
    return { band, meta, subj, hit, guide: guidanceOf(hit) };
  };

  // 편집 가능한 초안: 모드마다 {base(마지막으로 만든 초안), text(교사가 고친 글), g(목표 카드 조건·행동·기준)}
  const GF = [['condition', '조건(언제·어떤 상황에서)'], ['behavior', '행동(관찰 가능한 동사)'], ['criterion', '기준(얼마나·몇 번)']];
  const edOf = (o, gen) => {
    const cur = st.ed[st.mode];
    const g0 = { condition: o.goal.condition, behavior: o.goal.behavior, criterion: o.goal.criterion };
    if (!cur || (!cur.dirty && cur.base !== gen)) st.ed[st.mode] = { base: gen, text: gen, g: g0, g0, dirty: false };
    else if (cur.base !== gen) cur.next = { base: gen, g0 };
    else delete cur.next;
    return st.ed[st.mode];
  };
  function draftBox(o, gen, hint) {
    const e = edOf(o, gen);
    const rows = Math.min(28, Math.max(12, e.text.split('\n').length + 2));
    return `${e.next ? `<div class="alert warn small ig-stale" role="status">선택을 바꾸어 새 초안이 준비되었습니다. 지금 글상자에는 선생님이 고친 글이 그대로 있습니다.
        <button type="button" class="sm" data-ig-act="redraft">새 초안으로 바꾸기</button></div>` : ''}
      <div class="ig-edhead"><label for="ig-draft" class="small"><b>IEP 초안</b> <span class="tiny muted" data-ig-state>${e.dirty ? '· 고친 글' : '· 자동 초안'}</span></label><span class="grow"></span>
        <button type="button" class="ghost sm" data-ig-act="reset" ${e.dirty ? '' : 'hidden'}>처음 초안으로 되돌리기</button></div>
      <textarea id="ig-draft" class="ig-doc ig-edit" data-igin="draft" rows="${rows}" spellcheck="false" aria-describedby="ig-hint">${esc(e.text)}</textarea>
      <details class="ig-gf" ${e.gopen ? 'open' : ''}><summary class="small">목표 카드에 들어갈 조건·행동·기준 고치기 <small class="muted">(진전도 그래프·경고에 쓰임)</small></summary>
        ${GF.map(([k, l]) => `<label class="small">${l}<input data-iggf="${k}" value="${esc(e.g[k] || '')}"></label>`).join('')}
        <p class="tiny muted" data-ig-miss>${esc(missLine(e.g))}</p></details>
      <div class="bar"><button type="button" class="primary" data-ig-act="copy">복사</button><button type="button" class="ghost" data-ig-act="save">IEP 목표로 저장</button></div>
      <p class="tiny muted" id="ig-hint">${esc(hint)}</p>`;
  }
  const missLine = (g) => { const m = goalMissing(g); return m.length ? `아직 빠진 요소: ${m.join(', ')}` : '조건·행동·기준이 모두 들어 있습니다.'; };

  function stdBody() {
    if (D.err) return `<p class="alert">${esc(D.err)}</p>`;
    if (!D.idx) return '<p class="muted">교육과정 자료를 불러오는 중…</p>';
    const c = ctxOf(); const { band, subj, hit, guide } = c;
    const subjects = st.grade ? D.idx.subjects.filter((x) => (x.groups[band] || 0) > 0) : [];
    const uk = subj ? unitsKey(st.grade, subj.name, D.units) : '';
    const units = uk ? D.units[uk] : [];
    const unitObj = units.find((u) => u.u === st.unit);
    const lessonText = st.lesson && st.lesson !== '__free' ? st.lesson : st.lessonFree;
    const unitText = st.unit && st.unit !== '__free' ? st.unit : st.unitFree;
    const sugg = subj ? suggestStds(subj, band, `${unitText || ''} ${lessonText || ''}`) : [];
    const areas = subj?.groups?.[band] || [];
    const isEl = subj?.elements;
    const stdOpts = areas.map((a) => `<optgroup label="${esc(a.name || subj.name)}">${a.stds.map((x) => `<option value="${esc(x.c)}" ${x.c === st.code ? 'selected' : ''}>${isEl ? '' : `[${esc(x.c)}] `}${esc(x.t)}</option>`).join('')}</optgroup>`).join('');
    const o = subj && hit ? buildStdIep(st, c) : null;
    return `<div class="ig-cols"><div class="ig-pick">
      <h3 class="ig-h">1. 학년 <small class="muted">${st.grade ? `성취기준 ${esc(band)} 학년군` : ''}</small></h3>${chips('grade', GRADES.map(([g]) => [g, g]))}
      ${st.grade ? `<h3 class="ig-h">2. 교과</h3>${chips('subj', subjects.map((x) => [x.id, x.name]))}` : ''}
      ${st.subj && !subj ? '<p class="muted small">교과 자료를 불러오는 중…</p>' : ''}
      ${subj ? `<h3 class="ig-h">3. 단원</h3>
        ${units.length ? `<select data-igin="unit" aria-label="단원"><option value="">단원 고르기</option>${units.map((u) => `<option ${u.u === st.unit ? 'selected' : ''}>${esc(u.u)}</option>`).join('')}<option value="__free" ${st.unit === '__free' ? 'selected' : ''}>직접 입력</option></select>`
          : '<p class="tiny muted">이 학년·교과는 공개된 디지털 교과서 차례가 없어 학교 교과서를 보고 직접 적습니다.</p>'}
        ${!units.length || st.unit === '__free' ? `<input data-igin="unitFree" value="${esc(st.unitFree)}" placeholder="예: 3. 우리 동네" aria-label="단원 직접 입력">` : ''}
        <h3 class="ig-h">4. 차시·활동</h3>
        ${unitObj ? `<select data-igin="lesson" aria-label="차시·활동"><option value="">차시·활동 고르기</option>${unitObj.s.map((g) => `<optgroup label="${esc(g.t)}">${(g.l.length ? g.l : [g.t]).map((l) => `<option ${l === st.lesson ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}<option value="__free" ${st.lesson === '__free' ? 'selected' : ''}>직접 입력</option></select>` : ''}
        ${!unitObj || st.lesson === '__free' ? `<input data-igin="lessonFree" value="${esc(st.lessonFree)}" placeholder="예: 5차시 우리 동네 가게 알아보기" aria-label="차시 직접 입력">` : ''}
        <h3 class="ig-h">5. ${isEl ? '영역·내용 요소' : '성취기준'} <small class="muted">${esc(band)}</small></h3>
        ${sugg.length && !isEl ? `<div class="nt-chips ig-sugg"><span class="tiny muted">단원·차시와 낱말이 겹치는 성취기준(참고):</span>${sugg.map((c2) => `<button type="button" class="pr-chip sm ${c2 === st.code ? 'on' : ''}" data-ig="code" data-v="${esc(c2)}">${esc(c2)}</button>`).join('')}</div>` : ''}
        <select data-igin="code" aria-label="성취기준"><option value="">${isEl ? '내용 요소' : '성취기준'} 고르기</option>${stdOpts}</select>
        <h3 class="ig-h">6. 학생의 교육적 요구</h3>
        <p class="tiny muted ig-g">장애영역(여러 개)</p>${chips('dis', Object.entries(DISABILITIES).map(([k, [l]]) => [k, l]), true)}
        <p class="tiny muted ig-g">현행 수준</p>${chips('level', LEVELS)}
        <p class="tiny muted ig-g">참여 방식 <small>(고르지 않으면 현행 수준에 맞춤)</small></p>${chips('part', PARTS)}
        <p class="tiny muted ig-g">반응 양식(여러 개)</p>${chips('resp', RESP, true)}
        <div class="row2"><label>현재 정반응(%) <input type="number" min="0" max="100" data-igin="base" value="${esc(st.base)}" placeholder="예: 30"></label>
        <label>목표 기간<select data-igin="period"><option value="term" ${st.period === 'term' ? 'selected' : ''}>한 학기</option><option value="year" ${st.period === 'year' ? 'selected' : ''}>한 학년</option></select></label></div>` : ''}
    </div><div class="ig-out">
      ${hit ? `<section class="ig-std" aria-label="성취기준 원문">
        <p class="small"><span class="tag">${esc(subj.name)} · ${esc(hit.area.name || '')}</span> <b>${isEl ? '' : `[${esc(hit.std.c)}] `}${esc(hit.std.t)}</b></p>
        ${hit.std.exp.length ? `<details><summary class="small">성취기준 해설</summary>${hit.std.exp.map((x) => `<p class="small">${x.l ? `<b>${esc(x.l)}</b> ` : ''}${esc(x.x)}</p>`).join('')}</details>` : ''}
        ${guide.sev.length ? `<div class="ig-sev"><p class="small"><b>중도중복장애·장애 정도가 심한 학생 지도</b> <small class="muted">원문 「성취기준 적용 시 고려 사항」</small></p><ul>${guide.sev.map((x) => `<li class="small">${x.l ? `<b>${esc(x.l)}</b> ` : ''}${esc(x.x)}${x.own ? '' : ' <small class="muted">(영역 공통)</small>'}</li>`).join('')}</ul></div>`
          : isEl ? '' : '<p class="tiny muted">이 성취기준에는 중도중복장애 학생을 따로 언급한 고려 사항이 없습니다. 아래 일반 고려 사항을 참고하세요.</p>'}
        ${guide.other.length ? `<details><summary class="small">그 밖의 적용 시 고려 사항 ${guide.other.length}개</summary><ul>${guide.other.map((x) => `<li class="small">${x.l ? `<b>${esc(x.l)}</b> ` : ''}${esc(x.x)}${x.own ? '' : ' <small class="muted">(영역 공통)</small>'}</li>`).join('')}</ul></details>` : ''}
        <p class="tiny muted">${esc(sourceLine(D.idx))}</p></section>` : ''}
      ${o ? draftBox(o, stdIepText(o), '문장은 초안입니다. 글상자 안을 바로 고쳐 쓰면 복사·저장에 고친 글이 그대로 들어갑니다.')
      : `<p class="muted">왼쪽에서 학년 → 교과 → (단원·차시) → ${isEl ? '내용 요소' : '성취기준'}을 고르면 원문 안내와 IEP 초안이 나옵니다.</p>`}
    </div></div>`;
  }

  function lifeBody() {
    const subjGroups = st.course ? subjectsFor(st.course) : [];
    const areas = st.subj2 ? areasOf(st.course, st.subj2) : [];
    const o = buildIep({ ...st, subj: st.subj2 });
    return `<div class="ig-cols"><div class="ig-pick">
      <h3 class="ig-h">1. 과정</h3>${chips('course', COURSES.map(([k, l]) => [k, l]))}
      <h3 class="ig-h">2. 장애영역 <small class="muted">여러 개(중복장애)</small></h3>${chips('dis', Object.entries(DISABILITIES).map(([k, [l]]) => [k, l]), true)}
      ${st.course ? `<h3 class="ig-h">3. 교과·영역</h3>${subjGroups.map(([g, list]) => `<p class="tiny muted ig-g">${esc(g)}</p>${chips('subj2', list.map((x) => [x, x]))}`).join('')}` : ''}
      ${areas.length ? `<h3 class="ig-h">4. 하위 영역</h3>${chips('area', areas.map(([n]) => [n, n]))}` : ''}
      ${st.area ? `<h3 class="ig-h">5. 현행 수준</h3>${chips('level', LEVELS)}
        <div class="row2"><label>현재 정반응(%) <input type="number" min="0" max="100" data-igin="base" value="${esc(st.base)}" placeholder="예: 30"></label>
        <label>목표 기간<select data-igin="period"><option value="term" ${st.period === 'term' ? 'selected' : ''}>한 학기</option><option value="year" ${st.period === 'year' ? 'selected' : ''}>한 학년</option></select></label></div>` : ''}
    </div><div class="ig-out">${o ? draftBox(o, iepText(o), '수준을 고르지 않으면 과정에 맞는 기본 수준으로 만듭니다. 글상자 안을 바로 고쳐 쓰면 복사·저장에 고친 글이 그대로 들어갑니다.')
      : '<p class="muted">왼쪽에서 과정 → 교과·영역 → 하위 영역을 고르면 IEP 초안이 바로 만들어집니다.</p>'}</div></div>`;
  }

  modal = openModal(`<div class="ig"><div class="pr-top"><h2>IEP 생성기 <small class="muted">${esc(s0?.alias || '')}</small></h2><span class="grow"></span><button type="button" class="ghost" data-close>닫기</button></div>
    <div class="tabs ig-mode" role="tablist"><button type="button" role="tab" data-mode="std" class="on" aria-selected="true">교과·성취기준</button><button type="button" role="tab" data-mode="life" aria-selected="false">생활 기능 영역</button></div>
    <div class="ig-body"><p class="muted">교육과정 자료를 불러오는 중…</p></div></div>`, {
    wide: true,
    onOpen: (m) => {
      m.classList.add('xwide');
      m.addEventListener('click', async (e) => {
        const md = e.target.closest('[data-mode]'); if (md) { st.mode = md.dataset.mode; st.level = ''; return paint(); }
        const b = e.target.closest('[data-ig]');
        if (b) {
          const k = b.dataset.ig, v = b.dataset.v;
          if (['dis', 'resp'].includes(k)) st[k] = st[k].includes(v) ? st[k].filter((x) => x !== v) : [...st[k], v];
          else {
            st[k] = st[k] === v && k !== 'code' ? '' : v;
            if (k === 'grade') { st.subj = ''; st.unit = ''; st.lesson = ''; st.code = ''; }
            if (k === 'subj') { st.unit = ''; st.lesson = ''; st.code = ''; needSubj(st.subj); }
            if (k === 'course') { st.subj2 = ''; st.area = ''; }
            if (k === 'subj2') st.area = '';
          }
          return paint();
        }
        const a = e.target.closest('[data-ig-act]'); if (!a) return;
        const o = st.mode === 'life' ? buildIep({ ...st, subj: st.subj2 }) : buildStdIep(st, ctxOf());
        if (!o) return;
        const ed = st.ed[st.mode];
        const act = a.dataset.igAct;
        if (act === 'redraft' && ed?.next) { st.ed[st.mode] = { base: ed.next.base, text: ed.next.base, g: { ...ed.next.g0 }, g0: ed.next.g0, dirty: false }; return paint(); }
        if (act === 'reset' && ed) { if (!a.dataset.armed) { a.dataset.armed = '1'; a.textContent = '한 번 더 누르면 고친 글이 지워집니다'; setTimeout(() => { delete a.dataset.armed; a.textContent = '처음 초안으로 되돌리기'; }, 3000); return; } st.ed[st.mode] = { base: ed.next?.base || ed.base, text: ed.next?.base || ed.base, g: { ...(ed.next?.g0 || ed.g0) }, g0: ed.next?.g0 || ed.g0, dirty: false }; return paint(); }
        const box = m.querySelector('[data-igin="draft"]');
        const text = box ? box.value : (ed?.text || '');
        if (act === 'copy') { const ok = await copyText(text); toast(ok ? 'IEP 초안을 복사했습니다' : '복사하지 못했습니다'); }
        if (act === 'save') {
          const t = todayStr(); const g = ed?.g || {};
          await S.store.create('goals', { sid }, { ...o.goal, condition: g.condition ?? o.goal.condition, behavior: g.behavior ?? o.goal.behavior, criterion: g.criterion ?? o.goal.criterion,
            status: '진행', startDate: t, targetDate: addDays(t, st.period === 'year' ? 300 : 112), points: [], note: text, edited: !!ed?.dirty, createdBy: S.me.uid, updatedBy: S.me.uid, createdAt: Date.now(), updatedAt: Date.now() });
          toast('IEP 목표로 저장했습니다. 목표 카드에서 측정값을 넣고, 문서는 「IEP 문서」에서 다시 고칠 수 있습니다');
        }
      });
      m.addEventListener('change', (e) => {
        const k = e.target.dataset.igin; if (!k || k === 'draft') return;
        st[k] = e.target.value;
        if (k === 'unit') { st.lesson = ''; }
        paint();
      });
      m.addEventListener('input', (e) => {
        const k = e.target.dataset.igin;
        if (k && ['unitFree', 'lessonFree'].includes(k)) { st[k] = e.target.value; return; }
        const ed = st.ed[st.mode]; if (!ed) return;
        if (k === 'draft') {
          ed.text = e.target.value; ed.dirty = ed.text !== ed.base;
        } else if (e.target.dataset.iggf) {
          ed.g[e.target.dataset.iggf] = e.target.value; ed.gopen = true; ed.dirty = true;
          const mm = m.querySelector('[data-ig-miss]'); if (mm) mm.textContent = missLine(ed.g);
        } else return;
        const sEl = m.querySelector('[data-ig-state]'); if (sEl) sEl.textContent = ed.dirty ? '· 고친 글' : '· 자동 초안';
        const r = m.querySelector('[data-ig-act="reset"]'); if (r) r.hidden = !ed.dirty;
      });
      m.addEventListener('focusout', (e) => { const k = e.target.dataset?.igin; if (k && ['unitFree', 'lessonFree'].includes(k)) paint(); });
    }
  });
  if (st.grade) paint();
}

on('iep-gen', (el) => openIepGen(el.dataset.sid));
