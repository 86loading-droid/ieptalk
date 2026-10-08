// 자료 저장소: Firebase(실제 다중 사용자) 또는 데모(브라우저 안 가상 자료) 중 하나로 동작한다.
// 화면 코드는 이 파일의 공통 함수만 쓰므로, 학교 서버로 옮길 때는 이 파일만 바꾸면 된다.
import { FIREBASE_CONFIG, SCHOOL_ID, OWNER_EMAILS, USE_EMULATOR } from './config.js';
import { newId, todayStr, addDays } from './util.js';
import { acadExamples, apptExamples } from './calExamples.js';

const S = SCHOOL_ID;
const pathOf = (kind, p = {}) => ({
  members: `schools/${S}/members`,
  invites: `schools/${S}/invites`,
  students: `schools/${S}/students`,
  goals: `schools/${S}/students/${p.sid}/goals`,
  targets: `schools/${S}/students/${p.sid}/targets`,
  memos: `schools/${S}/students/${p.sid}/memos`,
  accoms: `schools/${S}/students/${p.sid}/accoms`,
  incidents: `schools/${S}/incidents`,
  access: `schools/${S}/access`,
  desks: `schools/${S}/desks`,
  bevents: `schools/${S}/bevents`,
  rooms: `schools/${S}/rooms`,
  messages: `schools/${S}/rooms/${p.rid}/messages`,
  meetings: `schools/${S}/meetings`,
  tasks: `schools/${S}/tasks`,
  alerts: `schools/${S}/alerts`,
  acad: `schools/${S}/acad`,
  appts: `schools/${S}/appts`
}[kind]);

// 질의 조건: 보조인력은 자기에게 배정된 학생과 자기가 저장한 기록만 읽는다(서버 규칙과 같은 조건).
function filtersFor(kind, p, me) {
  if (kind === 'students' && me?.role === 'aide') return [['aideUids', 'array-contains', me.uid]];
  if (kind === 'bevents') {
    if (p.mine || me?.role === 'aide') return [['createdBy', '==', me.uid]];
    if (p.sid) return [['studentId', '==', p.sid]];
  }
  if (kind === 'rooms') return [['memberUids', 'array-contains', me.uid]];
  if (kind === 'alerts') return [['to', 'array-contains', me.uid]];
  if (kind === 'appts') return [['memberUids', 'array-contains', me.uid]];
  if (kind === 'desks') return [['owner', '==', me.uid]];
  return [];
}

export const isDemo = () => !FIREBASE_CONFIG.apiKey || new URLSearchParams(location.search).has('demo');

/* ---------------- Firebase ---------------- */
async function makeFirebaseStore() {
  const fb = await import('./vendor/firebase.js');
  const app = fb.initializeApp(FIREBASE_CONFIG);
  const auth = fb.getAuth(app);
  let db;
  try { db = fb.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) }); }
  catch { db = fb.initializeFirestore(app, { ignoreUndefinedProperties: true }); }
  if (USE_EMULATOR) { fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); fb.connectFirestoreEmulator(db, '127.0.0.1', 8080); }
  const store = { mode: 'firebase', me: null, user: null };
  const col = (kind, p) => fb.collection(db, pathOf(kind, p));
  const ref = (kind, p, id) => fb.doc(db, pathOf(kind, p), id);
  const schoolRef = () => fb.doc(db, `schools/${S}`);
  const snapList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  store.init = (cb) => {
    fb.getRedirectResult(auth).catch(() => {});
    fb.onAuthStateChanged(auth, async (user) => {
      store.user = user; store.me = null;
      if (!user) return cb('signedOut');
      try {
        const email = (user.email || '').toLowerCase();
        const mref = ref('members', {}, user.uid);
        let m = await fb.getDoc(mref);
        if (!m.exists()) {
          if (OWNER_EMAILS.includes(email)) {
            await fb.setDoc(mref, { email, name: user.displayName || email, role: 'admin', title: '관리자', active: true, createdAt: Date.now() });
            const sc = await fb.getDoc(schoolRef()).catch(() => null);
            if (!sc || !sc.exists()) await fb.setDoc(schoolRef(), defaultSchool());
          } else {
            const inv = await fb.getDoc(ref('invites', {}, email)).catch(() => null);
            if (!inv || !inv.exists()) return cb('noInvite');
            const v = inv.data();
            await fb.setDoc(mref, { email, name: v.name || user.displayName || email, role: v.role, title: v.title || '', active: true, createdAt: Date.now() });
          }
          m = await fb.getDoc(mref);
        }
        const data = m.data();
        if (!data.active) return cb('inactive');
        store.me = { uid: user.uid, ...data };
        cb('ok');
      } catch (e) { console.error(e); cb('error', e); }
    });
  };
  store.signIn = async () => {
    const prov = new fb.GoogleAuthProvider();
    prov.setCustomParameters({ prompt: 'select_account' });
    try { await fb.signInWithPopup(auth, prov); }
    catch (e) { if (String(e.code).includes('popup')) await fb.signInWithRedirect(auth, prov); else throw e; }
  };
  store.signOut = () => fb.signOut(auth);
  store.sub = (kind, p, cb) => {
    if (kind === 'school') return fb.onSnapshot(schoolRef(), (d) => cb(d.exists() ? d.data() : defaultSchool()), (e) => console.warn(kind, e));
    const conds = filtersFor(kind, p, store.me).map(([f, o, v]) => fb.where(f, o, v));
    const q = conds.length ? fb.query(col(kind, p), ...conds) : col(kind, p);
    return fb.onSnapshot(q, (s) => cb(snapList(s)), (e) => { console.warn(kind, e); cb([]); });
  };
  store.create = async (kind, p, data, id) => { id = id || newId(); await fb.setDoc(ref(kind, p, id), data); return id; };
  store.update = (kind, p, id, patch) => fb.updateDoc(ref(kind, p, id), patch);
  store.remove = (kind, p, id) => fb.deleteDoc(ref(kind, p, id));
  store.saveSchool = (patch) => fb.setDoc(schoolRef(), patch, { merge: true });
  return store;
}

/* ---------------- 데모(브라우저 안 가상 자료) ---------------- */
const DEMO_KEY = 'ieptalk-demo-v1';
const DEMO_USERS = [
  { uid: 'u-admin', email: 'kim.teacher@demo', name: '김하늘', role: 'admin', title: '특수학급 담임(관리자)' },
  { uid: 'u-t2', email: 'lee.teacher@demo', name: '이서준', role: 'teacher', title: '통합학급 담임(옆반)' },
  { uid: 'u-t3', email: 'park.head@demo', name: '박지민', role: 'teacher', title: '특수교육 부장' },
  { uid: 'u-t4', email: 'choi.vp@demo', name: '최윤호', role: 'teacher', title: '교감' },
  { uid: 'u-a1', email: 'jung.aide@demo', name: '정소라', role: 'aide', title: '특수교육실무사' },
  { uid: 'u-a2', email: 'han.aide@demo', name: '한도윤', role: 'aide', title: '사회복무요원' }
];

export function defaultSchool() {
  const y = new Date().getFullYear();
  return { name: '데모초등학교', yearStart: `${y}-03-02`, sem1Start: `${y}-03-02`, sem1End: `${y}-07-18`, sem2Start: `${y}-08-18`, sem2End: `${y}-12-31`, warnRun: 3, quietFrom: '17:00', quietTo: '08:00', debriefDays: 2, reviewN: 3, reviewDays: 30 };
}

export function demoSeed(uids) {
  // uids: { cm, t2, t3, t4, a1, a2 } — 실제 계정에도 같은 가상 학생을 넣을 수 있게 분리
  const t = todayStr();
  const base = -12;
  const students = [
    { id: 's1', alias: '하람(가명)', grade: '4학년', caseManager: uids.cm, teamUids: [uids.cm, uids.t2].filter(Boolean), aideUids: [uids.a1].filter(Boolean), note: '가상 학생 · 자폐성장애 · 통합학급 4-2' },
    { id: 's2', alias: '도담(가명)', grade: '5학년', caseManager: uids.cm, teamUids: [uids.cm, uids.t3].filter(Boolean), aideUids: [uids.a2].filter(Boolean), note: '가상 학생 · 지적장애 · 통합학급 5-1' },
    { id: 's3', alias: '이든(가명)', grade: '3학년', caseManager: uids.t3 || uids.cm, teamUids: [uids.cm, uids.t3].filter(Boolean), aideUids: [uids.a1].filter(Boolean), note: '가상 학생 · 지체장애 · 특수학급 시간제' }
  ];
  const goals = {
    s1: [
      { id: 'g1', domain: '의사소통', condition: '쉬는 시간에 그림카드 3장이 제시되면', behavior: '원하는 활동 카드를 골라 교사에게 건넨다', criterion: '10회 기회 중 8회 이상, 3회기 연속', measure: '정반응률(%)', direction: 'up', baseline: 20, target: 80, startDate: addDays(t, -28), targetDate: addDays(t, 42), status: '진행',
        points: [-28, -21, -14, -10, -7, -3].map((d, i) => ({ d: addDays(t, d), v: [20, 30, 30, 25, 30, 30][i] })) },
      { id: 'g2', domain: '사회성', condition: '모둠 활동에서', behavior: '친구에게 차례를 넘겨 준다', criterion: '', measure: '횟수', direction: 'up', baseline: 1, target: 5, startDate: addDays(t, -21), targetDate: addDays(t, 49), status: '진행',
        points: [-21, -14, -7].map((d, i) => ({ d: addDays(t, d), v: [1, 2, 3][i] })) }
    ],
    s2: [
      { id: 'g3', domain: '수학', condition: '받아올림이 없는 두 자리 덧셈 10문항이 주어지면', behavior: '세로셈으로 답을 쓴다', criterion: '10문항 중 9문항 이상 정답', measure: '정답 수', direction: 'up', baseline: 3, target: 9, startDate: addDays(t, -30), targetDate: addDays(t, 40), status: '진행',
        points: [-30, -23, -16, -9, -2].map((d, i) => ({ d: addDays(t, d), v: [3, 4, 5, 6, 7][i] })) }
    ],
    s3: []
  };
  const targets = {
    s1: [{ id: 'b1', name: '소리 지르기', definition: '수업 중 교실 안 다른 사람이 들을 수 있을 만큼 큰 소리로 1초 이상 소리를 내는 행동', examples: '과제 제시 후 「아아」 하고 크게 소리 냄', nonExamples: '노래 시간에 함께 노래함, 놀이 중 웃음', method: 'freq', sessionMin: 40, phase: 'baseline', baselineStart: addDays(t, base), interventionStart: '' }],
    s2: [{ id: 'b2', name: '자리 이탈', definition: '수업 중 허락 없이 엉덩이가 의자에서 떨어져 자리를 벗어나는 행동', examples: '활동 중 일어나 교실 뒤로 걸어감', nonExamples: '교사가 불러 앞으로 나옴', method: 'dur', sessionMin: 40, phase: 'baseline', baselineStart: addDays(t, -8), interventionStart: '' }],
    s3: [{ id: 'b3', name: '과제 참여', definition: '교사가 제시한 과제 자료를 보거나 손으로 다루고 있는 상태', examples: '활동지에 글씨를 씀, 교구를 손으로 옮김', nonExamples: '창밖을 봄, 책상에 엎드림', method: 'int', intType: 'momentary', intervalSec: 30, intervals: 20, sessionMin: 10, phase: 'baseline', baselineStart: addDays(t, -10), interventionStart: '' }]
  };
  targets.s2.push({ id: 'b4', name: '지시 따르기 시작', definition: '교사가 한 단계 지시를 한 뒤 학생이 지시한 행동을 시작하기까지 걸린 시간', examples: '「책 펴세요」 뒤 책을 잡음', nonExamples: '지시 전에 이미 책을 폄', method: 'lat', sessionMin: 20, phase: 'baseline', baselineStart: addDays(t, -6), interventionStart: '' });
  const bevents = [];
  const counts = [5, 7, 4, 6, 5, 6];
  counts.forEach((c, i) => {
    const day = addDays(t, base + i * 2);
    for (let k = 0; k < c; k++) {
      const at = new Date(day + 'T09:10:00').getTime() + k * 37 * 60000;
      bevents.push({ id: `e1-${i}-${k}`, studentId: 's1', targetId: 'b1', type: 'freq', at, intensity: 1 + (k % 3), antecedent: ['과제 제시', '활동 전환', '요구 거절'][k % 3], consequence: ['교사 관심', '과제 중단', '무시'][k % 3], note: '', createdBy: i % 2 ? uids.a1 || uids.cm : uids.cm, createdAt: at, updatedAt: at, date: day });
    }
  });
  [180, 240, 150].forEach((sec, i) => {
    const day = addDays(t, -8 + i * 3); const at = new Date(day + 'T10:00:00').getTime();
    bevents.push({ id: `e2-${i}`, studentId: 's2', targetId: 'b2', type: 'dur', at, end: at + sec * 1000, intensity: 2, antecedent: '대기', consequence: '교사 관심', note: '', createdBy: uids.a2 || uids.cm, createdAt: at, updatedAt: at, date: day });
  });
  // 순간표집(30초 × 20칸) 4회기, 마지막 회기에는 두 번째 관찰자(일치도) 기록
  const pattern = [[1,0,1,1,0,0,1,0,1,1,0,1,0,0,1,1,0,1,0,1], [0,0,1,1,1,0,1,0,0,1,1,1,0,0,1,0,0,1,1,0], [1,1,0,1,0,0,1,1,0,1,0,1,1,0,0,1,0,1,0,1], [0,1,1,0,1,0,1,1,0,0,1,1,0,1,0,1,1,0,1,0]];
  pattern.forEach((r, i) => {
    const day = addDays(t, -9 + i * 2); const at = new Date(day + 'T11:00:00').getTime();
    bevents.push({ id: `e3-${i}`, studentId: 's3', targetId: 'b3', type: 'int', at, end: at + 600000, intType: 'momentary', intervalSec: 30, results: r.map(Boolean), intensity: null, antecedent: '', consequence: '', note: '', createdBy: uids.cm, createdAt: at, updatedAt: at, date: day });
    if (i === 3) { const r2 = r.map((v, k) => (k === 4 || k === 13 ? !v : !!v)); bevents.push({ id: 'e3-ioa', studentId: 's3', targetId: 'b3', type: 'int', ioa: true, at, end: at + 600000, intType: 'momentary', intervalSec: 30, results: r2, intensity: null, antecedent: '', consequence: '', note: '', createdBy: uids.t3 || uids.cm, createdAt: at, updatedAt: at, date: day }); }
  });
  // 잠재시간(초) 3회기 × 3번 지시
  [[42, 35, 50], [38, 30, 33], [25, 40, 28]].forEach((secs, i) => secs.forEach((sec, k) => {
    const day = addDays(t, -6 + i * 2); const at = new Date(day + 'T09:20:00').getTime() + k * 600000;
    bevents.push({ id: `e4-${i}-${k}`, studentId: 's2', targetId: 'b4', type: 'lat', at, end: at + sec * 1000, intensity: null, antecedent: '', consequence: '', note: '', createdBy: uids.cm, createdAt: at, updatedAt: at, date: day });
  }));
  // 하람 소리 지르기: 두 번째 관찰자(일치도) 기록 한 회기
  { const day = addDays(t, base + 10); for (let k = 0; k < 5; k++) { const at = new Date(day + 'T09:12:00').getTime() + k * 37 * 60000; bevents.push({ id: `e1-ioa-${k}`, studentId: 's1', targetId: 'b1', type: 'freq', ioa: true, at, intensity: null, antecedent: '', consequence: '', note: '', createdBy: uids.t2 || uids.cm, createdAt: at, updatedAt: at, date: day }); } }
  // 위기행동 사후 기록 예시(보고·통지 끝, 팀 회고 남음)
  const iday = addDays(t, -1);
  const incidents = [{ id: 'ic1', studentId: 's1', date: iday, time: '10:40', place: '통합학급 4-2 교실', antecedent: '받아쓰기 시작 안내 직후', behavior: '책상을 밀고 옆 친구 쪽으로 몸을 던지며 소리 지름', prevent: '1) 언어적 안내와 선택 제시 2) 쉬는 자리 안내 3) 주변 학생 이동', restraint: true, restraintMethod: '양 팔을 잡아 자리로 안내(서서)', rStart: '10:42', rEnd: '10:45', injuryStudent: '없음', injuryStaff: '없음', reportedAt: `${iday}T11:00`, reportedTo: '교장', notifiedAt: `${iday}T13:30`, notifyMethod: '전화', debriefDate: '', debriefAttendees: [], debriefNotes: '', hypothesis: '', bspChange: '', actions: '', closed: false, createdBy: uids.cm, createdAt: Date.now(), updatedAt: Date.now(), sample: true,
    pir: { grade: '초 4-2', staff: '통합학급 담임, 특수교사', staffN: '2', peersN: '22', handsN: '1',
      src: [{ id: 'src2', l: '보호자 전달', t: '보호자에게서 전해 들었습니다.' }],
      bg: [{ id: 'bg0', l: '수면 부족/피로', t: '전날 수면이 부족하였다는 정보가 있었습니다.' }], bgDetail: '보호자가 아침 알림장에 「어젯밤 늦게 잠듦」이라고 적음',
      ante: [{ id: 'ante0', l: '과제/지시 제시', t: '교사가 과제를 제시하거나 지시를 하였습니다.' }], anteDetail: '10:38 받아쓰기 공책을 펴도록 안내',
      beh: [{ id: 'beh0', l: '신체적 공격행동', t: '다른 사람을 주먹으로 치거나, 발로 차거나, 밀거나, 옷깃(멱살)을 잡는 행동을 하였습니다.' }], behDetail: '10:40 책상을 앞으로 두 차례 밀고, 오른쪽 짝 쪽으로 몸을 던지며 소리를 지름',
      risk: [{ id: 'risk1', l: '고위험(자·타해 임박)', t: '자신이나 다른 사람의 신체에 위해가 곧 일어날 상황이었습니다.' }], riskWhy: '짝과의 거리가 50cm 이내였고, 오른팔을 짝 얼굴 쪽으로 휘두름',
      reason: [{ id: 'reason1', l: '다른 학생 신체 보호', t: '다른 학생의 신체에 대한 위해를 막기 위해서였습니다.' }],
      pre: [{ id: 'pre0', l: '언어적 안내', t: '차분하고 짧은 말로 멈추도록 안내하였습니다.' }, { id: 'pre2', l: '선택 제시', t: '할 수 있는 선택지 두 가지를 제시하였습니다.' }, { id: 'pre4', l: '주변 학생 대피', t: '주변 학생들을 안전한 곳으로 이동시켰습니다.' }], preDetail: '',
      tech: [{ id: 'tech1', l: '팔 안내(에스코트)', t: '학생의 아래팔을 가볍게 잡아 안전한 곳으로 함께 이동하였습니다.' }], body: [{ id: 'body1', l: '아래팔', t: '아래팔' }], pose: [{ id: 'pose0', l: '선 자세', t: '선 자세' }], techDetail: '',
      safe: { neck: true, chest: true, prone: true, floor: true, joint: true, pain: true, mouth: true, tool: true },
      dur: [], endWhy: [{ id: 'endWhy0', l: '공격·자해 멈춤', t: '공격·자해 행동이 멈추었습니다.' }, { id: 'endWhy1', l: '호흡이 고르게 돌아옴', t: '학생의 호흡이 고르게 돌아왔습니다.' }], endDetail: '',
      after: [{ id: 'after1', l: '안정 공간으로 이동', t: '학생이 완충 매트 등 안정 공간으로 이동하였습니다.' }],
      stu: [{ id: 'stu0', l: '이상 없음', t: '학생에게 눈에 보이는 상처나 신체 이상이 없음을 확인하였습니다.' }], staffSt: [{ id: 'staffSt0', l: '이상 없음', t: '교직원에게 부상이 없음을 확인하였습니다.' }], injDetail: '',
      rep: [{ id: 'rep1', l: '구두 보고', t: '학교장(관리자)에게 구두로 보고하였습니다.' }], par: [{ id: 'par1', l: '유선 고지', t: '보호자에게 전화로 알렸습니다.' }], parBy: '',
      deb: [{ id: 'deb1', l: '진행 예정', t: '학생의 정서가 회복된 뒤 회복 대화를 할 예정입니다.' }], video: 'no', videoWhere: '', confirmer: '', extra: '' } }];
  // 평가조정 한 장 예시
  const accoms = { s1: [{ id: 'ac1', subject: '국어', presentation: ['문항 읽어 주기', '글자 확대(14pt 이상)'], response: ['구두로 답하기'], timing: ['시간 1.5배'], setting: ['별도 공간'], scheduling: [], other: '', modification: false, modNote: '', sharedWith: [uids.t2].filter(Boolean), confirms: {}, effects: [], createdBy: uids.cm, updatedBy: uids.cm, createdAt: Date.now(), updatedAt: Date.now(), sample: true }],
    s2: [{ id: 'ac2', subject: '수학', presentation: ['한 쪽에 문항 수 줄이기'], response: ['계산기 허용(연산 외 문항)'], timing: ['나눠 보기(2회)'], setting: [], scheduling: ['오전 시행'], other: '', modification: true, modNote: '수학 성취기준을 받아올림 없는 두 자리 덧셈 범위로 낮춤', sharedWith: [uids.t3].filter(Boolean), confirms: uids.t3 ? { [uids.t3]: Date.now() - 86400e3 } : {}, effects: [{ d: addDays(t, -3), by: uids.cm, text: '나눠 보기 후 미응답 문항이 줄어듦' }], createdBy: uids.cm, updatedBy: uids.cm, createdAt: Date.now(), updatedAt: Date.now(), sample: true }] };
  return { students, goals, targets, bevents, incidents, accoms };
}

function makeDemoStore() {
  const store = { mode: 'demo', me: null };
  let db = load();
  const listeners = new Set();
  function load() {
    try { const j = JSON.parse(localStorage.getItem(DEMO_KEY)); if (j && j.v === 5) return j; } catch {}
    return seedDb();
  }
  function seedDb() {
    const u = Object.fromEntries(DEMO_USERS.map((x) => [x.uid, x]));
    const sd = demoSeed({ cm: 'u-admin', t2: 'u-t2', t3: 'u-t3', t4: 'u-t4', a1: 'u-a1', a2: 'u-a2' });
    const d = { v: 5, school: defaultSchool(), c: {} };
    const put = (path, row) => { (d.c[path] ||= {})[row.id] = row; };
    DEMO_USERS.forEach((x) => put(pathOf('members'), { id: x.uid, ...x, active: true }));
    sd.students.forEach((s) => put(pathOf('students'), s));
    Object.entries(sd.goals).forEach(([sid, gs]) => gs.forEach((g) => put(pathOf('goals', { sid }), g)));
    Object.entries(sd.targets).forEach(([sid, ts]) => ts.forEach((x) => put(pathOf('targets', { sid }), x)));
    sd.bevents.forEach((e) => put(pathOf('bevents'), e));
    sd.incidents.forEach((x) => put(pathOf('incidents'), x));
    Object.entries(sd.accoms).forEach(([sid, as]) => as.forEach((x) => put(pathOf('accoms', { sid }), x)));
    const now = Date.now();
    put(pathOf('rooms'), { id: 'r-s1', type: 'student', studentId: 's1', name: '하람(가명) IEP팀', memberUids: ['u-admin', 'u-t2'], lastAt: now - 3600e3, lastBy: 'u-t2', lastText: '오늘 국어 시간에 카드 교환이 두 번 있었어요.', readBy: { 'u-admin': now - 7200e3, 'u-t2': now } });
    put(pathOf('messages', { rid: 'r-s1' }), { id: 'm1', by: 'u-admin', at: now - 7300e3, kind: 'text', text: '하람이 소리 지르기 기초선 6회기째입니다. 이번 주 안에 중재 시작을 논의하면 좋겠습니다.' });
    put(pathOf('messages', { rid: 'r-s1' }), { id: 'm2', by: 'u-t2', at: now - 3600e3, kind: 'text', text: '오늘 국어 시간에 카드 교환이 두 번 있었어요.' });
    put(pathOf('rooms'), { id: 'r-all', type: 'group', name: '특수교육 협의회', memberUids: ['u-admin', 'u-t2', 'u-t3', 'u-t4'], lastAt: now - 86400e3, lastBy: 'u-t3', lastText: '다음 주 수요일 협의회 안건 올려 주세요.', readBy: {} });
    put(pathOf('messages', { rid: 'r-all' }), { id: 'm3', by: 'u-t3', at: now - 86400e3, kind: 'text', text: '다음 주 수요일 협의회 안건 올려 주세요. @김하늘 선생님 IEP 중간 점검 일정도 부탁드립니다.' });
    const t = todayStr();
    put(pathOf('meetings'), { id: 'mt1', kind: 'meeting', title: '하람 행동지원 협의', date: addDays(t, 2), start: '15:00', minutes: 40, organizer: 'u-admin', attendees: { 'u-admin': 'accepted', 'u-t2': 'pending', 'u-t3': 'accepted' }, attendeeUids: ['u-admin', 'u-t2', 'u-t3'], studentId: 's1', place: '특수학급 교실', memo: '기초선 자료 검토, 중재 시작일 결정', createdAt: now });
    put(pathOf('meetings'), { id: 'mt2', kind: 'call', title: '도담 수학 조정 통화', date: addDays(t, 1), start: '16:10', minutes: 10, organizer: 'u-t3', attendees: { 'u-t3': 'accepted', 'u-admin': 'pending' }, attendeeUids: ['u-t3', 'u-admin'], studentId: 's2', place: '내선 214', memo: '평가 조정 범위 확인', createdAt: now });
    put(pathOf('alerts'), { id: 'al1', type: 'urgent', title: '하람 위기행동 긴급 협의', text: `오늘 15:30 · 특수학급 교실 · 오늘 3교시 사건 공유`, from: 'u-t3', to: ['u-admin', 'u-t2', 'u-t4'], at: now - 600e3, roomId: 'r-all', meetingId: '', ack: {}, hidden: {} });
    put(pathOf('messages', { rid: 'r-all' }), { id: 'm4', by: 'u-t3', at: now - 600e3, kind: 'notice', noticeType: 'urgent', text: `[긴급회의] 하람 위기행동 긴급 협의 · 오늘 15:30 · 특수학급 교실\n오늘 3교시 사건 공유` });
    acadExamples().forEach((x, i) => put(pathOf('acad'), { id: `ac${i}`, ...x, createdBy: 'u-admin' }));
    // 시연용 개인 시간표·메모·D-Day 별표(김하늘 선생님)
    const tt = { '1-1': '국어 4-2', '1-2': '수학 특수', '1-3': '사회 특수', '1-5': '창체', '2-1': '수학 특수', '2-2': '국어 3-1', '2-3': '통합 지원 4-2', '2-4': '체육', '3-1': '국어 특수', '3-2': '수학 4-2', '3-3': '음악', '4-1': '사회 특수', '4-2': '국어 특수', '4-3': '과학 4-2', '4-5': '사회성 기술', '5-1': '수학 특수', '5-2': '미술', '5-3': '미술', '5-4': '통합 지원 3-1' };
    put(pathOf('desks'), { id: 'u-admin', owner: 'u-admin', cells: tt, memo: '하람 보호자 상담 전 행동 그래프 출력\n10/28 협의회 안건: 평가조정 확인율', stars: ['ac4', 'ac5', 'ac7'], updatedAt: Date.now() });
    apptExamples('u-admin', ['u-t2', 'u-t3']).forEach((x, i) => put(pathOf('appts'), { id: `ap${i}`, ...x, createdAt: now }));
    put(pathOf('tasks'), { id: 'tk1', title: '하람 그림카드 세트 교체', assignee: 'u-admin', due: addDays(t, 3), done: false, createdBy: 'u-t2', createdAt: now, studentId: 's1' });
    void u;
    return d;
  }
  const save = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch {} };
  const emit = () => listeners.forEach((l) => l());
  window.addEventListener('storage', (e) => { if (e.key === DEMO_KEY) { db = load(); emit(); } });
  const rows = (path) => Object.values(db.c[path] || {});
  const match = (row, [f, o, v]) => (o === 'array-contains' ? (row[f] || []).includes(v) : row[f] === v);

  store.users = DEMO_USERS;
  store.init = (cb) => {
    const uid = sessionStorage.getItem('ieptalk-demo-user');
    const m = uid && rows(pathOf('members')).find((x) => x.id === uid);
    if (!m) return cb('signedOut');
    store.me = { ...m, uid: m.id };
    cb('ok');
  };
  store.demoLogin = (uid) => { sessionStorage.setItem('ieptalk-demo-user', uid); };
  store.signIn = () => {};
  store.signOut = () => { sessionStorage.removeItem('ieptalk-demo-user'); location.reload(); };
  store.resetDemo = () => { db = seedDb(); save(); emit(); };
  store.sub = (kind, p, cb) => {
    const run = () => {
      if (kind === 'school') return cb({ ...db.school });
      const conds = filtersFor(kind, p, store.me);
      cb(rows(pathOf(kind, p)).filter((r) => conds.every((c) => match(r, c))).map((r) => structuredClone(r)));
    };
    listeners.add(run); queueMicrotask(run);
    return () => listeners.delete(run);
  };
  const setDeep = (obj, key, val) => { const ks = key.split('.'); let o = obj; ks.slice(0, -1).forEach((k) => (o = o[k] ||= {})); o[ks.at(-1)] = val; };
  store.create = async (kind, p, data, id) => { id = id || newId(); (db.c[pathOf(kind, p)] ||= {})[id] = { id, ...structuredClone(data) }; save(); emit(); return id; };
  store.update = async (kind, p, id, patch) => {
    const r = (db.c[pathOf(kind, p)] || {})[id]; if (!r) throw new Error('없는 자료');
    Object.entries(patch).forEach(([k, v]) => setDeep(r, k, structuredClone(v))); save(); emit();
  };
  store.remove = async (kind, p, id) => { delete (db.c[pathOf(kind, p)] || {})[id]; save(); emit(); };
  store.saveSchool = async (patch) => { db.school = { ...db.school, ...patch }; save(); emit(); };
  return store;
}

export async function makeStore() {
  return isDemo() ? makeDemoStore() : makeFirebaseStore();
}
