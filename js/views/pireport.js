// 신체적 개입(물리적 제지) 사후 보고서: 버튼을 눌러 사실을 고르면 문장·문단 보고서가 자동으로 만들어진다.
// 바탕: 최현석 「NICB 체계 물리적 개입(신체적 블로킹) 서면 보고서」(ABC 원리, 2026) + 퀸 「사후보고서 서식 일곱 칸 개정 초안」(2026-10-05).
// 법적 검증을 전제로 한 작성 원칙
//  1) 본 것(관찰)과 판단(위험 수준·이유)과 전해 들은 것(출처)을 문장에서 나눈다.
//  2) 원인 단정 대신 시간 순서로 쓴다(「~로 유발됨」 대신 「~ 뒤에 행동이 시작됨」).
//  3) 빈칸은 숨기지 않고 [적지 않음: 칸 이름]으로 드러낸다.
//  4) 금지 행위 확인은 표시한 것만 「없었음」으로 쓰고, 표시하지 않은 것은 「확인 표시 없음」으로 남긴다.
//  5) 확정할 때마다 본문의 SHA-256 확인값과 작성자·시각을 남기고, 확정 뒤 고친 것은 정정 이력으로 쌓는다.
// 버튼(이름·문장)은 교사마다 고칠 수 있으며 내 책상(desks/{uid}.pirChips)에 저장된다. 기록에는 고른 순간의 문장이 그대로 복사되어 남는다.
import { esc, todayStr, timeStr, parseDate, openModal, closeModal, toast, newId } from '../util.js';
import { S, on, student, nameOf, member } from '../state.js';
import { desk, saveDesk } from './desk.js';
import { logAccess } from '../access.js';
import { EX } from './pirexamples.js';

// [이름, 보고서 문장]
const DEF = {
  src: [['직접 관찰', '작성자가 직접 보았습니다.'], ['다른 교직원 전달', '다른 교직원에게서 전해 들었습니다.'], ['보호자 전달', '보호자에게서 전해 들었습니다.'], ['기록 확인', '학교 기록(알림장·건강 기록 등)으로 확인하였습니다.']],
  bg: [
    ['수면 부족/피로', '전날 수면이 부족하였다는 정보가 있었습니다.'],
    ['약물 복용 변화', '복용 시간이 바뀌었거나 복용하지 않았다는 정보가 있었습니다(약 이름은 적지 않음).'],
    ['건강 이상/통증', '두통·치통 등 통증을 말하거나 통증이 있다는 정보가 있었습니다.'],
    ['가정 내 특이사항', '등교 전 가정에서 평소와 다른 일이 있었다는 정보가 있었습니다.'],
    ['날씨/환경 변화', '날씨·기온이나 교실 환경(자리, 담당 인력 등)에 평소와 다른 변화가 있었습니다.'],
    ['일과 변경', '예정된 일과나 담당 교사가 바뀌었습니다.'],
    ['해당없음', '확인된 배경사건은 없었습니다.']
  ],
  ante: [
    ['과제/지시 제시', '교사가 과제를 제시하거나 지시를 하였습니다.'],
    ['요구 거절', '학생이 원하는 활동이나 물건에 대한 요구가 제한되거나 거절되었습니다.'],
    ['특정 소음/시각 자극', '주변에서 큰 소리나 강한 시각 자극이 있었습니다.'],
    ['또래와의 마찰', '또래 학생과 말이나 몸이 닿는 일로 마찰이 있었습니다.'],
    ['활동 전환 시점', '하던 활동을 끝내고 다음 활동으로 옮기도록 안내받았습니다.'],
    ['관심이 다른 곳에', '주변 어른의 관심이 다른 학생에게 향해 있었습니다.'],
    ['확인되지 않음', '행동 직전의 특별한 상황은 확인되지 않았습니다.']
  ],
  beh: [
    ['신체적 공격행동', '다른 사람을 주먹으로 치거나, 발로 차거나, 밀거나, 옷깃(멱살)을 잡는 행동을 하였습니다.'],
    ['자해행동', '자신의 머리를 벽·책상 등에 부딪히거나 자신의 몸을 때리거나 뜯는 행동을 하였습니다.'],
    ['기물 파손/던지기', '의자, 책상, 교구 등 물건을 던지거나 부수었습니다.'],
    ['위험한 물건 휘두름', '가위·연필 등 다칠 수 있는 물건을 손에 쥐고 휘둘렀습니다.'],
    ['무단 이탈(교실·교외)', '교사의 안내 없이 교실이나 학교 밖으로 나가려 하였습니다.'],
    ['언어적 폭언/소란', '큰 소리로 욕설이나 위협하는 말을 하였습니다.'],
    ['기타', '그 밖의 위기행동을 하였습니다.']
  ],
  risk: [
    ['치명적 위험', '자신이나 다른 사람의 신체에 직접적인 위해가 일어나고 있었습니다.'],
    ['고위험(자·타해 임박)', '자신이나 다른 사람의 신체에 위해가 곧 일어날 상황이었습니다.'],
    ['중위험(위협 지속)', '위협하는 말이나 물건 파손이 계속되었으나 신체 위해는 일어나지 않았습니다.'],
    ['저위험', '거부 표현과 소란이 있었으나 위해 위험은 낮았습니다.']
  ],
  reason: [
    ['학생 본인 신체 보호', '학생 본인의 신체에 대한 위해를 막기 위해서였습니다.'],
    ['다른 학생 신체 보호', '다른 학생의 신체에 대한 위해를 막기 위해서였습니다.'],
    ['교직원 신체 보호', '교직원의 신체에 대한 위해를 막기 위해서였습니다.'],
    ['위험한 곳으로 이탈 방지', '도로·계단 등 위험한 곳으로 나가는 것을 막기 위해서였습니다.'],
    ['재산의 중대한 손해 방지', '재산에 중대한 손해가 생기는 것을 막기 위해서였습니다.']
  ],
  pre: [
    ['언어적 안내', '차분하고 짧은 말로 멈추도록 안내하였습니다.'],
    ['개인 공간 확보(1~1.5m)', '학생과 1~1.5m 정도 거리를 두었습니다.'],
    ['선택 제시', '할 수 있는 선택지 두 가지를 제시하였습니다.'],
    ['휴식·진정 공간 안내', '휴식 카드나 진정 공간 이용을 안내하였습니다.'],
    ['주변 학생 대피', '주변 학생들을 안전한 곳으로 이동시켰습니다.'],
    ['위험 물건 치우기', '주변의 다칠 수 있는 물건을 치웠습니다.'],
    ['공간 자극 차단', '소음·조명 등 주변 자극을 줄였습니다.'],
    ['지원 인력 요청', '다른 교직원에게 도움을 요청하였습니다.'],
    ['시도하지 못함', '신체적 개입 전에 다른 조치를 할 시간이 없었습니다.']
  ],
  tech: [
    ['몸으로 막기(접촉 최소)', '교직원의 몸이나 쿠션으로 학생과 위험 물건·다른 사람 사이를 막았습니다(학생 몸에 직접 힘을 주지 않음).'],
    ['팔 안내(에스코트)', '학생의 아래팔을 가볍게 잡아 안전한 곳으로 함께 이동하였습니다.'],
    ['전방 밀기/타격성 공격 이탈', '교직원이 학생의 팔 아래쪽으로 들어가 어깨를 붙여 공격을 막은 뒤 떨어져 거리를 두었습니다.'],
    ['전방 멱살 잡힘 이탈', '옷깃을 잡은 학생의 손목을 축으로 돌려 잡힌 곳에서 벗어났습니다.'],
    ['후방 머리/어깨 잡힘 이탈', '잡은 손의 힘이 약한 방향으로 몸을 돌려 벗어났습니다.'],
    ['후방 머리카락 잡힘 이탈', '교직원의 머리와 학생의 손을 함께 눌러 고정한 뒤 몸을 낮추어 벗어났습니다.'],
    ['후방 안김/목 결박 이탈', '턱을 당겨 목이 눌리지 않게 한 뒤 아래쪽 빈 공간으로 빠져나왔습니다.'],
    ['3단계 신체 정렬(안전 다운→정렬→고정)', '학생을 안전 매트 위로 천천히 낮추고 몸을 바르게 한 뒤 움직임을 고정하였습니다.']
  ],
  body: [['손목', '손목'], ['아래팔', '아래팔'], ['위팔', '위팔'], ['어깨', '어깨'], ['등 위쪽', '등 위쪽'], ['손', '손'], ['접촉 없음', '학생 몸에 닿지 않음']],
  pose: [['선 자세', '선 자세'], ['앉은 자세', '앉은 자세'], ['옆으로 누운 자세', '옆으로 누운 자세'], ['바로 누운 자세(매트)', '매트 위에 바로 누운 자세']],
  dur: [['1분 이내', '1분 이내였습니다.'], ['1분~3분', '1분에서 3분 사이였습니다.'], ['3분~5분', '3분에서 5분 사이였습니다(추가 인력 지원).'], ['5분 넘음', '5분을 넘었습니다.']],
  endWhy: [
    ['공격·자해 멈춤', '공격·자해 행동이 멈추었습니다.'],
    ['호흡이 고르게 돌아옴', '학생의 호흡이 고르게 돌아왔습니다.'],
    ['위험 물건 치워짐', '위험한 물건이 치워졌습니다.'],
    ['말로 하는 안내에 응함', '학생이 말로 하는 안내에 응하였습니다.'],
    ['지원 인력 도착', '지원 인력이 도착하여 안전이 확보되었습니다.'],
    ['불편·통증 호소로 즉시 놓음', '학생이 불편이나 통증을 말하여 바로 놓았습니다.']
  ],
  after: [
    ['위험 차단·거리 확보', '자·타해 위험이 멈추었고 안전거리를 확보하였습니다.'],
    ['안정 공간으로 이동', '학생이 완충 매트 등 안정 공간으로 이동하였습니다.'],
    ['지원 인력 추가 투입', '추가 인력이 현장 정리와 학생 안정을 도왔습니다.'],
    ['수업 복귀', '학생이 학급 일과로 돌아갔습니다.']
  ],
  stu: [
    ['이상 없음', '학생에게 눈에 보이는 상처나 신체 이상이 없음을 확인하였습니다.'],
    ['호흡·안색 확인', '개입 직후 학생의 호흡과 얼굴빛을 확인하였습니다.'],
    ['경미한 부상(찰과상/멍)', '학생에게 가벼운 찰과상이나 멍이 있어 보건실 처치를 받았습니다.'],
    ['보건교사 확인', '보건교사가 학생 상태를 확인하였습니다.'],
    ['의료기관 진료', '학생이 의료기관 진료를 받았습니다.']
  ],
  staffSt: [
    ['이상 없음', '교직원에게 부상이 없음을 확인하였습니다.'],
    ['경미한 부상', '교직원에게 가벼운 멍이나 긁힘이 있어 보건실 처치를 받았습니다.'],
    ['병원 진료', '교직원이 의료기관 진료를 받았습니다.']
  ],
  rep: [['구두 및 서면 보고', '학교장(관리자)에게 구두와 서면으로 보고하였습니다.'], ['구두 보고', '학교장(관리자)에게 구두로 보고하였습니다.'], ['서면 보고 예정', '서면 보고는 아직 하지 않았습니다(예정).']],
  par: [['유선 및 서면 고지', '보호자에게 전화와 서면으로 알렸습니다.'], ['유선 고지', '보호자에게 전화로 알렸습니다.'], ['면담 고지', '보호자와 만나 알렸습니다.'], ['연락 시도 중', '보호자에게 연락을 시도하였으나 아직 닿지 않았습니다.']],
  deb: [
    ['실시 완료(정황-분석-약속)', '학생과 정황 확인, 원인 분석, 대안 행동 약속 순서로 회복 대화를 하였습니다.'],
    ['진행 예정', '학생의 정서가 회복된 뒤 회복 대화를 할 예정입니다.'],
    ['교직원 회고 실시', '참여한 교직원이 함께 상황을 돌아보았습니다.']
  ]
};

const GROUPS = {
  src: { t: '배경사건을 어떻게 알았나', multi: true },
  bg: { t: '배경사건', multi: true },
  ante: { t: '바로 앞 상황(선행 자극)', multi: true },
  beh: { t: '행동 유형', multi: true },
  risk: { t: '위험 수준(작성자 판단)', multi: false },
  reason: { t: '개입한 이유(무엇을 막으려고)', multi: true },
  pre: { t: '먼저 해 본 조치(누른 순서 = 실시 순서)', multi: true, order: true },
  tech: { t: '개입 방법', multi: true },
  body: { t: '접촉 부위', multi: true },
  pose: { t: '학생 자세', multi: false },
  dur: { t: '지속 시간(시각을 모를 때만)', multi: false },
  endWhy: { t: '놓은 근거', multi: true },
  after: { t: '개입 직후', multi: true },
  stu: { t: '학생 상태', multi: true },
  staffSt: { t: '교직원 상태', multi: true },
  rep: { t: '학교장 보고 방법', multi: false },
  par: { t: '보호자 통지 방법', multi: false },
  deb: { t: '회복 대화', multi: true }
};

// 표시해야 「없었음」으로 쓰는 금지·위험 행위(퀸 초안 칸 4의 제1층 항목 + 첨부 양식의 안전 원칙)
export const SAFE = [
  ['neck', '목·기도 압박'], ['chest', '흉부·복부 압박'], ['prone', '엎드린 자세로 누르기'], ['floor', '바닥에 눕혀 체중으로 누르기'],
  ['joint', '관절 꺾기·과신전'], ['pain', '통증을 이용한 방법'], ['mouth', '입·코 가리기'], ['tool', '끈·도구로 묶기']
];

// 해석·평가가 섞인 낱말: 보이는 동작으로 바꾸도록 안내
const SUBJ = ['흥분', '난동', '폭력적', '공격적인', '화가 나', '화를 내', '분노', '짜증', '일부러', '고의', '반항', '못된', '이상한', '심하게', '과격', '발작', '미친', '통제 불능', '난리', '떼를', '버릇', '악의', '유발되'];

const SHARED = ['date', 'time', 'place', 'rStart', 'rEnd', 'reportedAt', 'reportedTo', 'notifiedAt', 'notifyMethod', 'debriefDate'];
const TEXTS = ['grade', 'staff', 'staffN', 'peersN', 'handsN', 'bgDetail', 'anteDetail', 'behDetail', 'riskWhy', 'preDetail', 'techDetail', 'endDetail', 'injDetail', 'video', 'videoWhere', 'confirmer', 'extra', 'parBy'];

// 교사가 고친 버튼 목록(없으면 기본값)
export function chipsOf(cat) {
  const mine = desk().pirChips?.[cat];
  if (Array.isArray(mine)) return mine.map((c) => ({ ...c, ex: Array.isArray(c.ex) ? c.ex : EX[c.id] || [] }));
  return (DEF[cat] || []).map(([l, t], i) => ({ id: `${cat}${i}`, l, t, ex: EX[`${cat}${i}`] || [] }));
}

// ---------- 보고서 문장 만들기 ----------
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const longDate = (d) => { if (!d) return ''; const x = parseDate(d); return `${x.getFullYear()}년 ${x.getMonth() + 1}월 ${x.getDate()}일(${WD[x.getDay()]})`; };
const dt = (v) => { if (!v) return ''; const [d, t] = String(v).split('T'); return `${longDate(d)} ${t || ''}`.trim(); };
const end = (s) => { s = String(s || '').trim(); return !s ? '' : /[.!?。)]$/.test(s) ? s : s + '.'; };
const miss = (label) => `[적지 않음: ${label}]`;
const labels = (arr) => (arr || []).map((c) => `‘${c.l}’`).join(', ');
const ct = (c) => { const d = String(c.d || '').trim(); return d ? `${end(c.t)} (${d.replace(/[.。]$/, '')})` : end(c.t); };
const texts = (arr) => (arr || []).map(ct).join(' ');
const part = (c) => String(c.d || '').trim() || c.t; // 부위·자세처럼 낱말 자리에 들어가는 묶음
const has = (arr) => Array.isArray(arr) && arr.length > 0;
const num = (v) => (v === '' || v == null ? '' : String(v));
export function minutesBetween(a, b) {
  if (!a || !b) return null;
  const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number);
  let d = h2 * 60 + m2 - (h1 * 60 + m1); if (d < 0) d += 1440; return d;
}

export function missingOf(r) {
  const m = [];
  if (!r.date) m.push('날짜'); if (!r.time) m.push('시각'); if (!r.place) m.push('장소'); if (!r.staff) m.push('현장 교직원');
  if (!has(r.beh) && !r.behDetail) m.push('행동'); if (!r.behDetail) m.push('관찰한 행동(구체)');
  if (!has(r.risk)) m.push('위험 수준'); if (!has(r.reason)) m.push('개입한 이유');
  if (!has(r.pre)) m.push('먼저 해 본 조치'); else if (r.pre.some((c) => c.l === '시도하지 못함') && !r.preDetail) m.push('조치를 못 한 이유');
  if (!has(r.tech)) m.push('개입 방법'); if (!has(r.body)) m.push('접촉 부위');
  if (!(r.rStart && r.rEnd) && !has(r.dur)) m.push('시작·끝 시각'); if (!has(r.endWhy)) m.push('놓은 근거');
  if (!has(r.stu)) m.push('학생 상태'); if (!has(r.staffSt)) m.push('교직원 상태');
  if (!r.reportedAt) m.push('학교장 보고 일시'); if (!r.notifiedAt) m.push('보호자 통지 일시');
  return m;
}

export function warningsOf(r) {
  const w = [];
  const risk = r.risk?.[0]?.l || '';
  if (/중위험|저위험/.test(risk)) w.push('위험 수준을 「중위험·저위험」으로 고르셨습니다. 물리적 제지는 신체 위해가 임박한 긴급한 경우에 한정되므로, 판단 근거를 구체적인 동작으로 적어 주세요.');
  if ((r.tech || []).some((c) => /3단계|고정/.test(c.l)) || (r.pose || []).some((c) => /누운/.test(c.l))) w.push('바닥에 낮추어 고정하는 방법이나 누운 자세가 들어 있습니다. 위험성이 높은 방법이므로 자세, 접촉 부위, 체중을 싣지 않았는지, 호흡 확인 시각을 반드시 적어 주세요.');
  if (has(r.beh) && r.beh.every((c) => /언어|폭언|소란/.test(c.l))) w.push('행동 유형이 말(폭언·소란)뿐입니다. 말로 하는 위협만으로는 물리적 제지의 근거가 약할 수 있으니, 신체 위해가 임박했다고 본 동작을 적어 주세요.');
  const mins = minutesBetween(r.rStart, r.rEnd);
  if (mins != null && mins > 5) w.push(`접촉 시간이 ${mins}분입니다. 5분을 넘긴 이유(놓으려 한 시도, 지원 요청 시각)를 「놓은 근거」 상세에 적어 주세요.`);
  const free = TEXTS.map((k) => r[k]).concat(Object.keys(GROUPS).flatMap((k) => (r[k] || []).map((c) => `${c.t} ${c.d || ''}`))).join(' ');
  const hit = SUBJ.filter((wd) => free.includes(wd));
  if (hit.length) w.push(`해석이 섞인 낱말이 있습니다: ${hit.map((x) => `「${x}」`).join(' ')}. 보고 들은 동작으로 바꿔 주세요(예: 「흥분함」 → 「소리를 지르며 책상을 두 차례 침」).`);
  return w;
}

export function buildReport(r, ctx = {}) {
  const P = [];
  const who = ctx.writer || '';
  P.push('신체적 개입(물리적 제지) 사후 보고서');
  P.push([
    `학생: ${ctx.alias || miss('학생')}${r.grade ? `(${r.grade})` : ''}`,
    `발생: ${r.date ? longDate(r.date) : miss('날짜')} ${r.time || miss('시각')}`,
    `장소: ${r.place || miss('장소')}`,
    `작성자: ${who || miss('작성자')}`
  ].join('\n'));

  const staffTxt = r.staff ? `${num(r.staffN) ? `${r.staffN}명(${r.staff})` : r.staff}` : `${num(r.staffN) ? `${r.staffN}명 ` : ''}${miss('현장 교직원')}`;
  const peersTxt = num(r.peersN) === '' ? `그 밖의 학생 수는 ${miss('인원')}` : r.peersN === '0' ? '그 밖의 학생은 없었습니다' : `그 밖에 학생 ${r.peersN}명이 있었습니다`;
  P.push(`1. 일어난 때와 곳\n${r.date ? longDate(r.date) : miss('날짜')} ${r.time || miss('시각')} 무렵 ${r.place || miss('장소')}에서 일어난 일입니다. 현장 교직원: ${staffTxt}. ${peersTxt}.`);

  const bg = r.bg || [], none = bg.length && bg.every((c) => c.l === '해당없음');
  const s2 = [];
  if (!bg.length) s2.push(`행동 전 배경사건: ${miss('배경사건')}`);
  else if (none) s2.push(texts(bg));
  else s2.push(`행동 전에 확인된 배경사건은 ${labels(bg)}입니다. ${texts(bg)}`);
  if (r.bgDetail) s2.push(end(r.bgDetail));
  if (bg.length && !none) s2.push(has(r.src) ? `이 정보는 다음과 같이 확인하였습니다. ${texts(r.src)}` : '이 정보의 출처는 적지 않았습니다.');
  if (has(r.ante)) s2.push(`행동 바로 앞에는 ${labels(r.ante)} 상황이 있었습니다. ${texts(r.ante)}`); else s2.push(`행동 바로 앞 상황: ${miss('선행 자극')}`);
  if (r.anteDetail) s2.push(end(r.anteDetail));
  if (has(r.ante)) s2.push('이 상황 뒤에 아래 행동이 시작되었습니다.');
  P.push(`2. 행동 전 상황(배경사건·선행 자극)\n${s2.join(' ')}`);

  const s3 = [];
  s3.push(r.behDetail ? `관찰한 동작: ${end(r.behDetail)}` : `관찰한 동작: ${miss('관찰한 행동(구체)')}`);
  if (has(r.beh)) s3.push(`작성자는 이 행동을 ${labels(r.beh)} 유형으로 분류하였습니다(유형 설명: ${r.beh.map(ct).join(' ')})`);
  if (has(r.risk)) s3.push(`작성자는 당시 위험 수준을 ${labels(r.risk)}(으)로 판단하였습니다. ${texts(r.risk)}`); else s3.push(`위험 수준 판단: ${miss('위험 수준')}`);
  if (r.riskWhy) s3.push(`판단 근거: ${end(r.riskWhy)}`);
  P.push(`3. 학생이 한 행동(보고 들은 그대로)과 위험 판단\n${s3.join(' ')}`);

  const pre = r.pre || [];
  let s4;
  if (!pre.length) s4 = `신체적 개입 전 조치: ${miss('먼저 해 본 조치')}`;
  else if (pre.length === 1 && pre[0].l === '시도하지 못함') s4 = `${ct(pre[0])} 그 이유: ${r.preDetail ? end(r.preDetail) : miss('조치를 못 한 이유')}`;
  else s4 = `신체적 개입 전에 다음 조치를 순서대로 하였습니다. ${pre.filter((c) => c.l !== '시도하지 못함').map((c, i) => `${i + 1}) ${ct(c)}`).join(' ')}${r.preDetail ? ` ${end(r.preDetail)}` : ''} 이 조치 뒤에도 위험한 행동이 계속되었습니다.`;
  P.push(`4. 신체적 개입 전에 해 본 조치\n${s4}`);

  P.push(`5. 신체적 개입을 한 이유\n${has(r.reason) ? `신체적 개입은 ${r.reason.map(ct).join(' 또한 ')}` : `개입한 이유: ${miss('개입한 이유')}`} 작성자는 이 상황을 「초·중등교육법」과 「교원의 학생생활지도에 관한 고시」에서 정한 긴급한 경우의 물리적 제지가 필요한 상황으로 판단하였습니다.`);

  const s6 = [];
  s6.push(has(r.tech) ? `개입 방법은 ${labels(r.tech)}입니다. ${texts(r.tech)}` : `개입 방법: ${miss('개입 방법')}`);
  s6.push(has(r.body) ? `접촉 부위는 ${r.body.map(part).join(', ')}입니다.` : `접촉 부위: ${miss('접촉 부위')}`);
  if (has(r.pose)) s6.push(`학생은 ${part(r.pose[0])}였습니다.`);
  if (num(r.handsN)) s6.push(`개입에는 교직원 ${r.handsN}명이 참여하였습니다.`);
  if (r.techDetail) s6.push(end(r.techDetail));
  const safe = r.safe || {};
  const yes = SAFE.filter(([k]) => safe[k]).map(([, l]) => l), no = SAFE.filter(([k]) => !safe[k]).map(([, l]) => l);
  if (yes.length) s6.push(`개입하는 동안 다음 행위는 없었음을 작성자가 확인하였습니다: ${yes.join(', ')}.`);
  if (no.length) s6.push(`다음 항목은 확인 표시가 없습니다: ${no.join(', ')}.`);
  P.push(`6. 신체적 개입 방법\n${s6.join(' ')}`);

  const s7 = [];
  const mins = minutesBetween(r.rStart, r.rEnd);
  if (mins != null) s7.push(`신체적 개입은 ${r.rStart}에 시작하여 ${r.rEnd}에 끝났습니다(접촉 시간 ${mins === 0 ? '1분 미만' : `약 ${mins}분`}).`);
  else if (has(r.dur)) s7.push(`시작·끝 시각은 기록하지 못하였고, 지속 시간은 ${ct(r.dur[0])}`);
  else s7.push(`시작·끝 시각: ${miss('시작·끝 시각')}`);
  s7.push(has(r.endWhy) ? `개입을 끝낸 근거: ${texts(r.endWhy)}` : `개입을 끝낸 근거: ${miss('놓은 근거')}`);
  if (r.endDetail) s7.push(end(r.endDetail));
  if (has(r.after)) s7.push(`개입 직후: ${texts(r.after)}`);
  P.push(`7. 시작·끝 시각과 놓은 이유\n${s7.join(' ')}`);

  P.push(`8. 다친 곳 확인과 조치\n학생: ${has(r.stu) ? texts(r.stu) : miss('학생 상태')} 교직원: ${has(r.staffSt) ? texts(r.staffSt) : miss('교직원 상태')}${r.injDetail ? ` ${end(r.injDetail)}` : ''}`);

  P.push(`9. 보고와 통지\n학교장 보고: ${r.reportedAt ? dt(r.reportedAt) : miss('학교장 보고 일시')}${r.reportedTo ? `, 보고받은 사람 ${r.reportedTo}` : ''}. ${has(r.rep) ? texts(r.rep) : ''} 보호자 통지: ${r.notifiedAt ? dt(r.notifiedAt) : miss('보호자 통지 일시')}${r.notifyMethod ? `, ${r.notifyMethod}` : ''}${r.parBy ? `, 통지한 사람 ${r.parBy}` : ''}. ${has(r.par) ? texts(r.par) : ''}`.replace(/ +/g, ' ').trim());

  const s10 = [];
  if (has(r.deb)) s10.push(`회복 대화: ${texts(r.deb)}${r.debriefDate ? ` (날짜: ${longDate(r.debriefDate)})` : ''}`);
  s10.push(r.video === 'yes' ? `영상 기록: 있음(보관 위치: ${r.videoWhere || miss('보관 위치')}). 영상 내용은 이 보고서에 옮겨 적지 않았습니다.` : r.video === 'no' ? '영상 기록: 없음.' : `영상 기록: ${miss('영상 유무')}`);
  if (r.extra) s10.push(end(r.extra));
  P.push(`10. 사후 조치와 기록 보관\n${s10.join(' ')}`);

  P.push('이 보고서는 작성자가 직접 보고 들은 사실과 전해 들은 사실을 나누어 적었으며, 작성자의 판단은 「판단」으로 따로 밝혔습니다. 위와 같이 보고합니다.');
  P.push([
    `작성 일시: ${ctx.writtenAt || ''}`,
    `작성자: ${who}   (서명)`,
    `확인자(학교장·교감): ${r.confirmer || '　　　　'}   (서명)`,
    ctx.hash ? `문서 확인값(SHA-256 앞 16자리): ${ctx.hash.slice(0, 16)}` : ''
  ].filter(Boolean).join('\n'));
  return P.join('\n\n');
}

export async function sha256(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return ''; }
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch {}
  ta.remove(); return ok;
}

// ---------- 화면 ----------
const writerOf = (uid = S.me.uid) => { const m = member(uid); const n = uid === S.me.uid ? (S.me.name || nameOf(uid)) : nameOf(uid); return `${n}${m?.title ? ` · ${m.title}` : ''}`; };
const nowStamp = (ms = Date.now()) => { const d = new Date(ms); return `${longDate(todayStr(d))} ${timeStr(d)}`; };

export function pirStatus(ic) {
  const p = ic?.pir;
  if (!p) return { label: '보고서 없음', cls: '' };
  if (p.final?.hash) return { label: `보고서 확정${(p.history || []).length > 1 ? ` · 정정 ${(p.history || []).length - 1}` : ''}`, cls: 'ok' };
  return { label: '보고서 작성 중', cls: 'warn' };
}

function groupHtml(cat, st, editing) {
  const g = GROUPS[cat], list = chipsOf(cat), sel = st[cat] || [];
  const head = `<div class="pr-head"><span class="pr-gt">${esc(g.t)}</span><small class="muted">${g.multi ? '여러 개' : '하나'}</small><span class="grow"></span><button type="button" class="ghost chip-btn" data-pr="edit" data-cat="${cat}" aria-expanded="${editing ? 'true' : 'false'}">${editing ? '고치기 끝' : '버튼 고치기'}</button></div>`;
  if (editing) {
    return `<div class="pr-group editing" data-cat="${cat}">${head}<ul class="pr-edit">${list.map((c, i) => `<li data-id="${esc(c.id)}"><input data-pe="l" value="${esc(c.l)}" aria-label="버튼 이름"><textarea data-pe="t" rows="2" aria-label="보고서 문장">${esc(c.t)}</textarea><textarea data-pe="x" rows="3" class="pr-ex-edit" aria-label="상세 예시(줄마다 하나)" placeholder="상세 예시(줄마다 하나)">${esc((c.ex || []).join('\n'))}</textarea><span class="pr-ebtn"><button type="button" class="ghost chip-btn" data-pr="up" ${i ? '' : 'disabled'} aria-label="위로">↑</button><button type="button" class="ghost chip-btn danger" data-pr="del" aria-label="${esc(c.l)} 지우기">지우기</button></span></li>`).join('')}</ul>
      <div class="bar"><button type="button" class="chip-btn" data-pr="add">＋ 새 버튼</button><button type="button" class="ghost chip-btn" data-pr="reset">기본 버튼으로</button><span class="muted tiny">이름은 버튼에, 문장은 보고서에 들어갑니다. 상세 예시는 줄마다 하나씩 적으면 드롭다운에 나옵니다. 내 계정에만 저장됩니다.</span></div></div>`;
  }
  return `<div class="pr-group" data-cat="${cat}">${head}<div class="pr-chips">${list.map((c) => { const k = sel.findIndex((x) => x.id === c.id); return `<button type="button" class="pr-chip ${k >= 0 ? 'on' : ''}" aria-pressed="${k >= 0}" data-pr="tog" data-id="${esc(c.id)}" title="${esc(c.t)}">${g.order && k >= 0 ? `<b class="pr-n">${k + 1}</b>` : ''}${esc(c.l)}</button>`; }).join('')}</div>${detsHtml(cat, list, sel)}</div>`;
}

// 고른 버튼마다 상세 예시 드롭다운과 상세 칸
function detsHtml(cat, list, sel) {
  if (!sel.length) return '';
  return `<div class="pr-dets">${sel.map((x) => {
    const c = list.find((y) => y.id === x.id) || x;
    const ex = c.ex || [];
    const d = x.d || '';
    const inList = ex.includes(d);
    return `<div class="pr-det" data-id="${esc(x.id)}"><span class="pr-det-l">${esc(x.l)}</span>
      <select data-pd="sel" aria-label="${esc(x.l)} 상세 예시 고르기"><option value="">${ex.length ? `상세 예시 ${ex.length}개에서 고르기` : '상세 예시 없음'}</option>${ex.map((e) => `<option ${e === d ? 'selected' : ''}>${esc(e)}</option>`).join('')}${d && !inList ? '<option value="__own" selected>직접 쓴 상세</option>' : ''}</select>
      <input data-pd="d" value="${esc(d)}" placeholder="상세(고른 뒤 사실대로 고치세요)" aria-label="${esc(x.l)} 상세"></div>`;
  }).join('')}</div>`;
}

const inp = (st, name, label, type = 'text', ph = '', cls = '') => `<label class="${cls}">${label}<input type="${type}" name="${name}" value="${esc(st[name] || '')}" placeholder="${esc(ph)}"></label>`;
const tx = (st, name, label, ph = '', rows = 2) => `<label>${label}<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(st[name] || '')}</textarea></label>`;

function formHtml(st, editing) {
  const G = (c) => groupHtml(c, st, editing.has(c));
  return `<div class="pr-form">
    <fieldset><legend>1. 일어난 때와 곳</legend>
      <div class="row3">${inp(st, 'date', '날짜', 'date')}${inp(st, 'time', '시각(분 단위)', 'time')}${inp(st, 'place', '장소', 'text', '예: 특수학급 교실')}</div>
      <div class="row3">${inp(st, 'grade', '학년/반', 'text', '예: 중 2-1')}${inp(st, 'staffN', '현장 교직원 수', 'number')}${inp(st, 'peersN', '그 밖의 학생 수', 'number', '이름은 적지 않음')}</div>
      ${inp(st, 'staff', '현장 교직원(이름·역할)', 'text', '예: 김OO(담임), 이OO(특수교육실무원)')}
    </fieldset>
    <fieldset><legend>2. 행동 전 상황</legend>${G('bg')}${G('src')}${tx(st, 'bgDetail', '배경사건 상세(사실만)', '예: 보호자가 아침 8시 알림장에 「어젯밤 2시에 잠듦」이라고 적음')}${G('ante')}${tx(st, 'anteDetail', '바로 앞 상황 상세', '예: 10:28 수학 학습지 2쪽 제시, 「다 하면 쉬는 시간」이라고 안내')}</fieldset>
    <fieldset><legend>3. 학생이 한 행동과 위험 판단</legend>${G('beh')}${tx(st, 'behDetail', '관찰한 동작(보고 들은 그대로, 횟수·대상·부위)', '예: 10:30 교사의 옷깃을 오른손으로 잡고 왼손 주먹으로 교사 턱을 두 차례 침')}${G('risk')}${tx(st, 'riskWhy', '판단 근거', '예: 주먹이 교사 얼굴로 계속 향했고, 옆 1m에 다른 학생이 있었음')}</fieldset>
    <fieldset><legend>4. 먼저 해 본 조치</legend>${G('pre')}${tx(st, 'preDetail', '조치 상세(시각과 함께) 또는 못 한 이유', '예: 10:29 거리 1.5m 확보 → 10:30 주변 학생 2명 복도로 이동')}</fieldset>
    <fieldset><legend>5. 개입한 이유</legend>${G('reason')}</fieldset>
    <fieldset><legend>6. 개입 방법</legend>${G('tech')}${G('body')}${G('pose')}
      <div class="row2">${inp(st, 'handsN', '개입에 참여한 교직원 수', 'number')}</div>
      ${tx(st, 'techDetail', '방법 상세', '예: 교사 2명이 학생 양옆에서 아래팔을 잡고 매트로 이동, 체중을 싣지 않음')}
      <div class="pr-safe"><p class="small"><b>없었음을 확인한 것만 표시</b> <span class="muted">표시하지 않으면 보고서에 「확인 표시 없음」으로 남습니다.</span></p>
        <div class="chk-list">${SAFE.map(([k, l]) => `<label class="chk"><input type="checkbox" data-safe="${k}" ${st.safe?.[k] ? 'checked' : ''}> ${l} 없음</label>`).join('')}</div></div>
    </fieldset>
    <fieldset><legend>7. 시작·끝 시각과 놓은 이유</legend>
      <div class="row3">${inp(st, 'rStart', '개입 시작', 'time')}${inp(st, 'rEnd', '개입 끝', 'time')}<p class="small muted pr-min" aria-live="polite"></p></div>
      ${G('dur')}${G('endWhy')}${tx(st, 'endDetail', '놓은 근거 상세', '예: 10:32 주먹을 펴고 「놓아 주세요」라고 말함, 호흡 고름 확인 후 놓음')}${G('after')}</fieldset>
    <fieldset><legend>8. 다친 곳 확인</legend>${G('stu')}${G('staffSt')}${tx(st, 'injDetail', '부상·처치 상세', '예: 10:40 보건교사가 학생 왼쪽 아래팔 확인, 붉은 자국 없음')}</fieldset>
    <fieldset><legend>9. 보고와 통지</legend>
      <div class="row2">${inp(st, 'reportedAt', '학교장 보고 일시', 'datetime-local')}${inp(st, 'reportedTo', '보고받은 사람', 'text', '예: 교장, 교감')}</div>${G('rep')}
      <div class="row3">${inp(st, 'notifiedAt', '보호자 통지 일시', 'datetime-local')}<label>통지 수단<select name="notifyMethod">${['', '전화', '문자', '면담', '서면'].map((x) => `<option ${st.notifyMethod === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>${inp(st, 'parBy', '통지한 사람', 'text', '예: 교감')}</div>${G('par')}
    </fieldset>
    <fieldset><legend>10. 사후 조치와 기록 보관</legend>${G('deb')}${inp(st, 'debriefDate', '회복 대화 날짜', 'date')}
      <div class="row2"><label>영상 기록<select name="video">${[['', '선택'], ['no', '없음'], ['yes', '있음']].map(([v, l]) => `<option value="${v}" ${st.video === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${inp(st, 'videoWhere', '영상 보관 위치', 'text', '내용은 옮겨 적지 않음')}</div>
      ${tx(st, 'extra', '그 밖에 남길 사실', '')}
      ${inp(st, 'confirmer', '확인자(학교장·교감) 이름', 'text')}
    </fieldset>
    <p class="small muted">진단명·약 이름·다른 학생 이름은 적지 않습니다. 가능하면 당일에 작성합니다. 이 보고서는 제지의 정당성을 미리 보장하지 않으며, 사실을 빠짐없이 남기는 도구입니다.</p>
  </div>`;
}

function previewHtml() {
  return `<aside class="pr-side"><div class="pr-side-in">
    <div class="pr-tools"><button type="button" class="primary" data-pr="copy">보고서 복사</button><button type="button" class="ghost" data-pr="print">인쇄</button><span class="grow"></span><button type="button" class="ghost" data-pr="save">저장</button><button type="button" class="ghost" data-pr="final">확정</button></div>
    <div class="pr-status small" aria-live="polite"></div>
    <div class="pr-warn" aria-live="polite"></div>
    <div class="pr-doc" tabindex="0" aria-label="자동 생성된 보고서 본문"></div>
    <details class="pr-hist small"><summary>확정·정정 이력</summary><ol></ol></details>
  </div></aside>`;
}

// 기록(incident)과 보고서 초안을 하나의 편집 상태로 합친다
function stateFrom(ic) {
  const p = JSON.parse(JSON.stringify(ic.pir || {}));
  const st = { ...p };
  SHARED.forEach((k) => { st[k] = ic[k] || ''; });
  if (!st.writer && ic.createdBy) st.writer = writerOf(ic.createdBy);
  if (!ic.pir) {
    // 처음 열 때: 기존 사후 기록 칸에서 옮겨 온다
    st.behDetail = ic.behavior || ''; st.anteDetail = ic.antecedent || ''; st.preDetail = ic.prevent || ''; st.techDetail = ic.restraintMethod || '';
    st.injDetail = [ic.injuryStudent && `학생 부상: ${ic.injuryStudent}`, ic.injuryStaff && `교직원 부상: ${ic.injuryStaff}`].filter(Boolean).join(' / ');
    st.safe = {};
  }
  return st;
}

export function openPir(id, sid, eventId = '') {
  let ic = id ? S.incidents.find((x) => x.id === id) : null;
  if (id && !ic) return toast('기록을 아직 불러오지 못했습니다');
  if (!ic) {
    const ev = eventId ? (S.eventsBy[sid] || []).find((e) => e.id === eventId) : null;
    ic = { studentId: sid, date: ev?.date || todayStr(), time: ev ? timeStr(new Date(ev.at)) : timeStr(), antecedent: ev?.antecedent || '', restraint: true, eventId: eventId || '' };
  }
  sid = sid || ic.studentId;
  const s = student(sid);
  const st = stateFrom(ic);
  const editing = new Set();
  let icId = ic.id || '';
  let dirty = false;

  const html = `<div class="pr-wrap"><div class="pr-top"><h2>신체적 개입 사후 보고서 <small class="muted">${esc(s?.alias || '')}</small></h2><span class="grow"></span><button type="button" class="ghost sm pr-jump" data-pr="jump">보고서 보기 ↓</button><button type="button" class="ghost" data-close>닫기</button></div>
    <p class="small muted">버튼을 누르면 사실 문장이 보고서에 들어가고, 오른쪽(좁은 화면은 아래)에 문단 보고서가 바로 만들어집니다. 버튼 이름과 문장은 「버튼 고치기」로 바꿀 수 있습니다.</p>
    <div class="pr-cols"><div class="pr-main">${formHtml(st, editing)}</div>${previewHtml()}</div></div>`;

  const ctx = () => {
    const ms = st.final?.at || Date.now();
    return { alias: s?.alias || '', writer: st.writer || writerOf(), writtenAt: nowStamp(ms), hash: st.final?.hash && st.final.text === currentBody() ? st.final.hash : '' };
  };
  const currentBody = () => buildReport(st, { alias: s?.alias || '', writer: st.writer || writerOf(), writtenAt: '', hash: '' });

  openModal(html, {
    wide: true,
    onOpen: (m) => {
      m.classList.add('xwide');
      const main = m.querySelector('.pr-main');
      const doc = m.querySelector('.pr-doc');
      const warnBox = m.querySelector('.pr-warn');
      const status = m.querySelector('.pr-status');
      const minBox = m.querySelector('.pr-min');
      const hist = m.querySelector('.pr-hist ol');

      const refresh = () => {
        const text = buildReport(st, ctx());
        doc.textContent = text;
        const ms = missingOf(st), ws = warningsOf(st);
        warnBox.innerHTML = (ms.length ? `<p class="pr-miss"><b>빈 칸 ${ms.length}</b> ${ms.map((x) => `<span class="tag">${esc(x)}</span>`).join(' ')}</p>` : '<p class="pr-ok">필수 칸을 모두 채웠습니다.</p>') + ws.map((w) => `<p class="pr-w">${esc(w)}</p>`).join('');
        const mins = minutesBetween(st.rStart, st.rEnd);
        if (minBox) minBox.textContent = mins == null ? '' : `접촉 시간 ${mins === 0 ? '1분 미만' : `약 ${mins}분`}`;
        const changed = st.final?.text && st.final.text !== currentBody();
        status.innerHTML = st.final?.hash
          ? `<span class="tag ${changed ? 'warn' : 'ok'}">${changed ? '확정 뒤 고침 · 다시 확정하면 정정 이력이 남습니다' : '확정됨'}</span> ${esc(nameOf(st.final.by))} · ${esc(nowStamp(st.final.at))} · 확인값 <code>${esc(st.final.hash.slice(0, 16))}</code>`
          : `<span class="tag">${icId ? '저장됨 · 확정 전' : '아직 저장 안 됨'}</span>${dirty ? ' <span class="muted">고친 내용이 있습니다</span>' : ''}`;
        hist.innerHTML = (st.history || []).map((h, i) => `<li>${i ? '정정' : '첫 확정'} · ${esc(nowStamp(h.at))} · ${esc(nameOf(h.by))} · <code>${esc((h.hash || '').slice(0, 16))}</code>${h.note ? ` · ${esc(h.note)}` : ''}</li>`).join('') || '<li class="muted">아직 확정하지 않았습니다.</li>';
      };
      const repaintGroup = (cat) => {
        const old = main.querySelector(`.pr-group[data-cat="${cat}"]`);
        if (old) old.outerHTML = groupHtml(cat, st, editing.has(cat));
      };

      const detOf = (t) => { const row = t.closest('.pr-det'); const cat = t.closest('.pr-group')?.dataset.cat; const x = (st[cat] || []).find((y) => y.id === row?.dataset.id); return { row, x }; };
      main.addEventListener('input', (e) => {
        const t = e.target;
        if (t.dataset.pd === 'd') { const { x } = detOf(t); if (x) { x.d = t.value; dirty = true; refresh(); } return; }
        if (t.name && (TEXTS.includes(t.name) || SHARED.includes(t.name))) { st[t.name] = t.value; dirty = true; refresh(); }
      });
      main.addEventListener('change', (e) => {
        const t = e.target;
        if (t.dataset.pd === 'sel') {
          const { row, x } = detOf(t);
          if (x && t.value !== '__own') { x.d = t.value; const box = row.querySelector('[data-pd=d]'); box.value = t.value; dirty = true; refresh(); if (t.value) box.focus(); }
          return;
        }
        if (t.dataset.pd) return;
        if (t.dataset.safe) { st.safe = { ...(st.safe || {}), [t.dataset.safe]: t.checked }; dirty = true; refresh(); }
        else if (t.name) { st[t.name] = t.value; dirty = true; refresh(); }
      });

      const readEdits = (cat) => {
        const box = main.querySelector(`.pr-group[data-cat="${cat}"]`);
        return [...box.querySelectorAll('.pr-edit li')].map((li) => ({ id: li.dataset.id, l: li.querySelector('[data-pe=l]').value.trim(), t: li.querySelector('[data-pe=t]').value.trim(), ex: (li.querySelector('[data-pe=x]')?.value || '').split('\n').map((x) => x.trim()).filter(Boolean) })).filter((c) => c.l);
      };
      const saveChips = (cat, list) => {
        saveDesk({ pirChips: { ...(desk().pirChips || {}), [cat]: list } });
        // 지금 고른 버튼의 문장도 고친 대로 바꾼다(지운 버튼은 고른 목록에서도 뺀다)
        if (st[cat]) st[cat] = st[cat].map((x) => { const c = list.find((y) => y.id === x.id); return c ? { id: c.id, l: c.l, t: c.t, d: x.d || '' } : null; }).filter(Boolean);
      };

      m.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-pr]');
        if (!b) return;
        e.preventDefault();
        const act = b.dataset.pr;
        const grp = b.closest('.pr-group');
        const cat = grp?.dataset.cat;
        if (act === 'tog') {
          const c = chipsOf(cat).find((x) => x.id === b.dataset.id); if (!c) return;
          const cur = st[cat] || [];
          const k = cur.findIndex((x) => x.id === c.id);
          if (GROUPS[cat].multi) st[cat] = k >= 0 ? cur.filter((x) => x.id !== c.id) : [...cur, { id: c.id, l: c.l, t: c.t, d: '' }];
          else st[cat] = k >= 0 ? [] : [{ id: c.id, l: c.l, t: c.t, d: cur[0]?.d && cur[0].id === c.id ? cur[0].d : '' }];
          dirty = true; repaintGroup(cat); main.querySelector(`.pr-group[data-cat="${cat}"] [data-id="${CSS.escape(c.id)}"]`)?.focus(); refresh();
        } else if (act === 'edit') {
          if (editing.has(cat)) { saveChips(cat, readEdits(cat)); editing.delete(cat); toast('버튼을 저장했습니다'); }
          else editing.add(cat);
          repaintGroup(cat); main.querySelector(`.pr-group[data-cat="${cat}"] [data-pr="edit"]`)?.focus(); refresh();
        } else if (act === 'add') {
          const list = readEdits(cat); list.push({ id: `${cat}-${newId()}`, l: '새 버튼', t: '', ex: [] });
          saveChips(cat, list); repaintGroup(cat);
          const last = [...main.querySelectorAll(`.pr-group[data-cat="${cat}"] .pr-edit li`)].pop();
          last?.querySelector('[data-pe=l]')?.select();
        } else if (act === 'del' || act === 'up') {
          const id = b.closest('li').dataset.id; const list = readEdits(cat); const i = list.findIndex((c) => c.id === id);
          if (act === 'del') list.splice(i, 1); else if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
          saveChips(cat, list); repaintGroup(cat); refresh();
        } else if (act === 'reset') {
          const pc = { ...(desk().pirChips || {}) }; delete pc[cat]; saveDesk({ pirChips: pc });
          editing.delete(cat); repaintGroup(cat); toast('기본 버튼으로 되돌렸습니다'); refresh();
        } else if (act === 'copy') {
          const ok = await copyText(doc.textContent);
          toast(ok ? '보고서를 복사했습니다. 한글·워드·메신저에 붙여 넣으세요' : '복사하지 못했습니다. 본문을 길게 눌러 직접 복사해 주세요');
          if (ok && icId) logAccess(sid, 'print', '신체적 개입 보고서 복사');
        } else if (act === 'print') {
          printReport(doc.textContent); if (icId) logAccess(sid, 'print', '신체적 개입 보고서 인쇄');
        } else if (act === 'jump') {
          m.querySelector('.pr-side')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); doc.focus({ preventScroll: true });
        } else if (act === 'save') {
          await save(); refresh();
        } else if (act === 'final') {
          const ms = missingOf(st);
          if (ms.length && b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = `빈 칸 ${ms.length}개인 채로 확정`; setTimeout(() => { b.dataset.sure = ''; b.textContent = '확정'; }, 4000); return; }
          b.dataset.sure = ''; b.textContent = '확정';
          const body = currentBody();
          const hash = await sha256(body);
          const at = Date.now();
          const wasFinal = !!st.final?.hash;
          if (wasFinal && st.final.text === body) return toast('확정본과 달라진 내용이 없습니다');
          st.writer = st.writer || writerOf();
          st.final = { text: body, hash, at, by: S.me.uid };
          st.history = [...(st.history || []), { at, by: S.me.uid, hash, text: body, note: wasFinal ? '확정 뒤 정정' : '' }];
          await save(); refresh();
          toast(wasFinal ? '정정본을 확정했습니다(이전 확정본은 이력에 남습니다)' : '보고서를 확정했습니다');
        }
      });

      const save = async () => {
        const pir = {};
        Object.keys(GROUPS).forEach((k) => { pir[k] = st[k] || []; });
        TEXTS.forEach((k) => { pir[k] = st[k] ?? ''; });
        pir.safe = st.safe || {}; pir.writer = st.writer || writerOf();
        if (st.final) pir.final = st.final;
        if (st.history) pir.history = st.history;
        pir.updatedBy = S.me.uid; pir.updatedAt = Date.now();
        const shared = {}; SHARED.forEach((k) => { shared[k] = st[k] || ''; });
        const data = { ...shared, restraint: true, pir, updatedBy: S.me.uid, updatedAt: Date.now() };
        // 사후 기록 칸이 비어 있으면 보고서 내용으로 채운다
        const cur = icId ? S.incidents.find((x) => x.id === icId) || ic : ic;
        if (!cur.behavior && st.behDetail) data.behavior = st.behDetail;
        if (!cur.antecedent && st.anteDetail) data.antecedent = st.anteDetail;
        if (!cur.restraintMethod && has(st.tech)) data.restraintMethod = st.tech.map((c) => c.l).join(', ');
        try {
          if (icId) await S.store.update('incidents', {}, icId, data);
          else {
            icId = await S.store.create('incidents', {}, { ...data, studentId: sid, eventId: ic.eventId || '', antecedent: data.antecedent || '', behavior: data.behavior || '', prevent: st.preDetail || '', injuryStudent: '', injuryStaff: '', debriefAttendees: [], closed: false, createdBy: S.me.uid, createdAt: Date.now() });
            if (ic.eventId) S.store.update('bevents', {}, ic.eventId, { incidentId: icId }).catch(() => {});
          }
          dirty = false; toast('보고서를 저장했습니다');
        } catch (err) { console.error(err); toast('저장하지 못했습니다: ' + (err.message || err)); }
      };
      refresh();
    }
  });
}

function printReport(text) {
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = `<pre class="pr-print">${esc(text)}</pre>`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 500); }, 50);
}

on('pir-new', (el) => { closeModal(); openPir(null, el.dataset.sid, el.dataset.eid || ''); });
on('pir-open', (el) => { const ic = S.incidents.find((x) => x.id === el.dataset.id); closeModal(); openPir(el.dataset.id, ic?.studentId); });
