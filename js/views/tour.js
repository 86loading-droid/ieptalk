// 둘러보기(투어) 링크: 계정이 없는 사람도 링크 하나로 가상 자료 시연판에 바로 들어가 주요 기능을 차례로 본다.
//   ?demo=1&tour=1            가상 특수교사(관리자)로 들어가 안내 띠 시작
//   ?demo=1&tour=1&as=teacher 통합학급 담임으로, &as=aide 보조인력으로
// 자료는 그 브라우저 안에만 있는 가상 자료다(서버에 저장되지 않음). 실제 학생 정보는 넣지 않는다.
import { esc } from '../util.js';
import { S } from '../state.js';

const AS = { admin: 'u-admin', teacher: 'u-t2', aide: 'u-a1' };
const KEY = 'ieptalk-tour';

const STEPS_T = [
  ['#/today', '한눈에', '첫 화면입니다. 법정 기한, 진전도 경고, 위기행동 사후 기록 요청, 평가조정 확인 요청이 담벼락처럼 모입니다.'],
  ['#/student/s1/now', '학생 지금 현황', '학생을 열면 가장 먼저 나오는 한 장입니다. 신호등 요약, IEP 단계 도식, 목표 진전 막대(기대 위치와 비교), 문제행동 그래프, 행동 기능 도식, 최근 30일 시간선, 다음 할 일이 모입니다.'],
  ['#/student/s1/flow', 'IEP 전체 흐름', '가상 학생 하람의 IEP를 학생 이해 → 평가 → 목표 → 교수·지원 → 행동 지원 → 진전도 → 학기말 평가의 일곱 단계로 이어 봅니다. 「전체 인쇄」로 한 문서가 됩니다.'],
  ['#/student/s1/goals', 'IEP 생성기', '학년 → 교과 → 단원 → 차시 → 성취기준을 고르면 2022 개정 기본 교육과정 원문과 중도중복장애 학생 지도 내용이 함께 나오고, 학생 요구에 맞춘 수준별 목표 초안이 만들어집니다. 초안은 글상자 안에서 바로 고쳐 쓰고 그대로 저장합니다.', '[data-act="iep-gen"]'],
  ['#/student/s1/behavior', '행동 기록과 기초선 분석', '버튼으로 모은 행동 자료를 그래프로 보고, 수준·추세·변동성·중첩 등 시각적 분석과 기능에 맞춘 중재 전략을 제안받습니다.'],
  ['#/student/s1/fba', '기능평가', 'ABC 관찰기록, 문제행동 동기평가, 의사소통기능평가를 합쳐 행동의 기능 가설을 세웁니다. 빈 서식도 인쇄할 수 있습니다.'],
  ['#/student/s1/flow', '행동지원 시각자료', '그림 일과표, 먼저-다음 판, 휴식 요청 카드처럼 행동 중재에 쓰는 그림을 골라 IEP에 넣고 큰 카드로 인쇄합니다. 기능평가 결과에 맞는 그림을 추천합니다.', '[data-act="vis-pick"]'],
  ['#/student/s1/crisis', '위기행동 사후 기록', '위기행동 뒤 기록, 보고, 보호자 통지, 사후 검토 회의를 단계별로 관리하고 신체적 개입 사후 보고서를 버튼으로 만듭니다.'],
  ['#/student/s1/note', '관찰 메모', '날짜·교과·상황·종류를 눌러 한두 줄로 적는 누가 기록입니다.'],
  ['#/student/s1/term', '학기말 종합', '한 학기 동안 쌓인 진전도·행동·기능평가·위기행동·관찰 메모·평가조정을 한 문서로 모으고 종합 의견 초안을 만듭니다.'],
  ['#/chat', '교사 협업', '교사끼리 메신저와 일정·예약을 씁니다. 다른 탭에서 다른 가상 교사로 들어가면 메시지가 실시간으로 오갑니다.']
];
const STEPS_A = [
  ['#/today', '보조인력 첫 화면', '배정된 학생의 행동 버튼이 있습니다. 행동이 일어나면 한 번 누르고, 필요하면 앞·뒤 상황을 덧붙입니다.'],
  ['#/mine', '내 기록', '내가 남긴 기록만 보이고 고칠 수 있습니다. 학생 IEP와 메모는 보이지 않습니다(권한 분리).']
];

// 부팅 전에: 투어 링크면 가상 사용자로 바로 들어가고 첫 안내 창은 건너뛴다
export function prepareTour() {
  const q = new URLSearchParams(location.search);
  if (!q.has('demo') || !(q.has('tour') || q.has('as'))) return;
  const uid = AS[q.get('as')] || AS.admin;
  if (sessionStorage.getItem('ieptalk-tour-init') === location.search) return; // 같은 링크로 새로 고침하면 진행 상태 유지
  sessionStorage.setItem('ieptalk-tour-init', location.search);
  sessionStorage.setItem('ieptalk-demo-user', uid);
  try { localStorage.setItem(`ieptalk-guide-done:${uid}`, '1'); } catch {}
  if (q.has('tour')) { sessionStorage.setItem(KEY, '0'); if (!location.hash) location.hash = (uid === AS.aide ? STEPS_A : STEPS_T)[0][0]; }
}

const steps = () => (S.me?.role === 'aide' ? STEPS_A : STEPS_T);
export function renderTour() {
  const raw = sessionStorage.getItem(KEY);
  let bar = document.getElementById('tour-bar');
  if (raw == null || !S.me) { bar?.remove(); document.body.classList.remove('touring'); return; }
  const list = steps(); const i = Math.min(Number(raw) || 0, list.length - 1); const [, title, body] = list[i];
  if (!bar) { bar = document.createElement('aside'); bar.id = 'tour-bar'; bar.setAttribute('aria-label', '둘러보기 안내'); document.body.appendChild(bar); bar.addEventListener('click', onClick); }
  document.body.classList.add('touring');
  bar.innerHTML = `<div class="tour-in"><p class="tour-c">둘러보기 ${i + 1} / ${list.length} <span class="muted">· 가상 학생 자료(이 브라우저 안에서만)</span></p>
    <h2>${esc(title)}</h2><p>${esc(body)}</p>
    <div class="tour-b"><button type="button" class="ghost sm" data-tour="end">끝내기</button><span class="grow"></span>
    ${i > 0 ? `<button type="button" class="ghost sm" data-tour="${i - 1}">이전</button>` : ''}
    ${i < list.length - 1 ? `<button type="button" class="primary sm" data-tour="${i + 1}">다음</button>` : '<button type="button" class="primary sm" data-tour="end">마치기</button>'}</div></div>`;
}
function go(i) {
  const list = steps(); const [hash, , , open] = list[i];
  sessionStorage.setItem(KEY, String(i));
  document.querySelector('.modal-back [data-close]')?.click();
  if (location.hash !== hash) location.hash = hash; else renderTour();
  renderTour();
  if (open) setTimeout(() => document.querySelector(`#main ${open}, ${open}`)?.click(), 700);
  window.scrollTo(0, 0);
}
function onClick(e) {
  const b = e.target.closest('[data-tour]'); if (!b) return;
  if (b.dataset.tour === 'end') { sessionStorage.removeItem(KEY); renderTour(); return; }
  go(Number(b.dataset.tour));
}
export const tourLinks = (base) => ({ admin: `${base}?demo=1&tour=1`, teacher: `${base}?demo=1&tour=1&as=teacher`, aide: `${base}?demo=1&tour=1&as=aide` });
