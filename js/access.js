// 접근 기록: 누가 언제 어느 학생 자료를 열람·수정·인쇄했는지 남긴다(관리자만 볼 수 있음).
// 학교 도입 시 학습지원 소프트웨어 필수기준 중 안전조치 점검에 대비한 장치다.
import { S } from './state.js';
import { newId } from './util.js';

const LOGGED = ['students', 'goals', 'targets', 'memos', 'incidents', 'accoms'];
const recent = new Map();

export function logAccess(sid, action, what = '') {
  if (!S.store || !S.me || !sid) return;
  const key = `${sid}:${action}:${what}`;
  const now = Date.now();
  const gap = action === 'view' ? 10 * 60000 : action === 'edit' ? 60000 : 0; // 같은 화면 열람은 10분, 같은 자료 수정은 1분에 한 번만
  if (gap && recent.get(key) > now - gap) return;
  recent.set(key, now);
  Promise.resolve(S.store.create('access', {}, { uid: S.me.uid, sid, action, what, at: now }, newId())).catch(() => {});
}

// 저장소의 쓰기 함수를 감싸 학생 자료 수정을 자동으로 남긴다
export function installAccessLog(store) {
  const wrap = (fnName, action) => {
    const orig = store[fnName].bind(store);
    store[fnName] = (kind, p = {}, ...rest) => {
      let sid = '';
      if (LOGGED.includes(kind)) {
        const data = fnName === 'create' ? rest[0] : null;
        sid = p.sid || data?.studentId || (kind === 'students' && fnName !== 'create' ? rest[0] : '') || (kind === 'incidents' && fnName !== 'create' ? S.incidents.find((x) => x.id === rest[0])?.studentId : '') || '';
      }
      const r = orig(kind, p, ...rest);
      if (LOGGED.includes(kind)) Promise.resolve(r).then((id) => logAccess(sid || (kind === 'students' ? id : ''), action, kind)).catch(() => {});
      return r;
    };
  };
  wrap('create', 'create'); wrap('update', 'edit'); wrap('remove', 'delete');
}

export const ACTION_LABEL = { view: '열람', create: '작성', edit: '수정', delete: '삭제', print: '인쇄' };
export const KIND_LABEL = { students: '학생 정보', goals: 'IEP 목표', targets: '표적행동', memos: '공유 메모', incidents: '위기행동 사후 기록', accoms: '평가조정', goals_tab: 'IEP 목표 화면', behavior: '행동·기초선 화면', memo: '공유 메모 화면', crisis: '사후 기록 화면', accom: '평가조정 화면' };
