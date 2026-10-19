// IEP 생성기: 과정·장애영역·교과(생활 영역)·하위 영역·현행 수준을 버튼으로 고르면
// 현행수준·장기목표·단기목표(촉구를 줄여 가는 3단계)·평가 방법·지원과 조정 문장을 만든다.
// 「IEP 목표로 저장」을 누르면 조건·행동·기준을 갖춘 목표로 저장되어 진전도 그래프를 바로 쓸 수 있다.
// 성취기준 코드는 넣지 않는다(교사가 교육과정 원문에서 골라 연결). 생성 문장은 초안이며 학생 관찰 사실로 고쳐 쓴다.
import { esc, todayStr, addDays, openModal, toast } from '../util.js';
import { S, on, student } from '../state.js';
import { COURSES, DISABILITIES, SUBJECTS, SUBJECT_GROUPS, LEVELS } from './iepdata.js';
import { copyText } from './pireport.js';

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

export function openIepGen(sid) {
  const st = { sid, course: '', dis: [], subj: '', area: '', level: '', base: '', period: 'term' };
  const btns = (k, list, multi = false) => `<div class="nt-chips">${list.map(([v, l]) => { const on = multi ? st[k].includes(v) : st[k] === v; return `<button type="button" class="pr-chip sm ${on ? 'on' : ''}" aria-pressed="${on}" data-ig="${k}" data-v="${esc(v)}">${esc(l)}</button>`; }).join('')}</div>`;
  const body = () => {
    const subjGroups = st.course ? subjectsFor(st.course) : [];
    const areas = st.subj ? areasOf(st.course, st.subj) : [];
    const o = buildIep(st);
    return `<div class="ig-cols"><div class="ig-pick">
      <h3 class="ig-h">1. 과정</h3>${btns('course', COURSES.map(([k, l]) => [k, l]))}
      <h3 class="ig-h">2. 장애영역 <small class="muted">여러 개(중복장애)</small></h3>${btns('dis', Object.entries(DISABILITIES).map(([k, [l]]) => [k, l]), true)}
      ${st.course ? `<h3 class="ig-h">3. 교과·영역</h3>${subjGroups.map(([g, list]) => `<p class="tiny muted ig-g">${esc(g)}</p>${btns('subj', list.map((x) => [x, x]))}`).join('')}` : ''}
      ${areas.length ? `<h3 class="ig-h">4. 하위 영역</h3>${btns('area', areas.map(([n]) => [n, n]))}` : ''}
      ${st.area ? `<h3 class="ig-h">5. 현행 수준</h3>${btns('level', LEVELS)}
        <div class="row2"><label>현재 정반응(%) <input type="number" min="0" max="100" data-igin="base" value="${esc(st.base)}" placeholder="예: 30"></label>
        <label>목표 기간<select data-igin="period"><option value="term" ${st.period === 'term' ? 'selected' : ''}>한 학기</option><option value="year" ${st.period === 'year' ? 'selected' : ''}>한 학년</option></select></label></div>` : ''}
    </div><div class="ig-out">${o ? `<div class="ig-doc" tabindex="0">${esc(iepText(o))}</div>
      <div class="bar"><button type="button" class="primary" data-ig-act="copy">복사</button><button type="button" class="ghost" data-ig-act="save">IEP 목표로 저장</button></div>
      <p class="tiny muted">수준을 고르지 않으면 과정에 맞는 기본 수준으로 만듭니다. 문장은 초안이며 학생 관찰 사실로 고쳐 씁니다.</p>`
      : '<p class="muted">왼쪽에서 과정 → 교과·영역 → 하위 영역을 고르면 IEP 초안이 바로 만들어집니다.</p>'}</div></div>`;
  };
  openModal(`<div class="ig"><div class="pr-top"><h2>IEP 생성기 <small class="muted">${esc(student(sid)?.alias || '')}</small></h2><span class="grow"></span><button type="button" class="ghost" data-close>닫기</button></div><div class="ig-body">${body()}</div></div>`, {
    wide: true,
    onOpen: (m) => {
      m.classList.add('xwide');
      const paint = () => { m.querySelector('.ig-body').innerHTML = body(); };
      m.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-ig]');
        if (b) {
          const k = b.dataset.ig, v = b.dataset.v;
          if (k === 'dis') st.dis = st.dis.includes(v) ? st.dis.filter((x) => x !== v) : [...st.dis, v];
          else { st[k] = st[k] === v ? '' : v; if (k === 'course') { st.subj = ''; st.area = ''; } if (k === 'subj') st.area = ''; }
          return paint();
        }
        const a = e.target.closest('[data-ig-act]'); if (!a) return;
        const o = buildIep(st); if (!o) return;
        if (a.dataset.igAct === 'copy') { const ok = await copyText(iepText(o)); toast(ok ? 'IEP 초안을 복사했습니다' : '복사하지 못했습니다'); }
        if (a.dataset.igAct === 'save') {
          const t = todayStr();
          await S.store.create('goals', { sid }, { ...o.goal, status: '진행', startDate: t, targetDate: addDays(t, st.period === 'year' ? 300 : 112), points: [], note: iepText(o), createdBy: S.me.uid, updatedBy: S.me.uid, createdAt: Date.now(), updatedAt: Date.now() });
          toast('IEP 목표로 저장했습니다. 목표 카드에서 측정값을 넣으세요');
        }
      });
      m.addEventListener('change', (e) => { const k = e.target.dataset.igin; if (k) { st[k] = e.target.value; paint(); } });
    }
  });
}

on('iep-gen', (el) => openIepGen(el.dataset.sid));
