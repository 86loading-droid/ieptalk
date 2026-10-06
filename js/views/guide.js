// 첫 로그인 안내: 역할별로 세 장. 처음 한 번 저절로 뜨고, 위쪽 「도움말」로 다시 볼 수 있다.
import { esc, openModal, closeModal } from '../util.js';
import { S, on, isAide, isAdmin } from '../state.js';

const KEY = (uid) => `ieptalk-guide-done:${uid}`;

function pages() {
  if (isAide()) return [
    ['기록은 버튼 한 번', '배정된 학생의 행동 버튼이 첫 화면에 있습니다. 행동이 일어나면 한 번 누르세요(빈도). 「누르면 시작」 버튼은 시작과 끝을 누르는 지속시간, 「간격」 버튼은 신호에 맞춰 예·아니오를 고르는 간격기록입니다.'],
    ['상황은 나중에 덧붙여도 됩니다', '기록 뒤 아래에 뜨는 「상황 덧붙이기」로 강도, 바로 앞·뒤 상황을 고릅니다. 물리적 제지가 있었다면 꼭 체크해 주세요. 담당 선생님 화면에 사후 기록 요청이 뜹니다.'],
    ['내 기록만 보이고 고칠 수 있습니다', '「내 기록」에서 내가 남긴 기록만 보고 고칠 수 있습니다. 와이파이가 끊겨도 기록은 휴대폰에 먼저 저장되고, 연결되면 저절로 올라갑니다. 학생 실명은 적지 마세요.']
  ];
  const p = [
    ['한눈에 보기에서 시작합니다', '첫 화면은 모든 기능을 담벼락처럼 펼친 「한눈에」입니다. 칸 제목을 누르면 세부 화면으로 들어갑니다. 법정 기한, 진전도 경고, 사후 기록, 평가조정 확인 요청이 여기에 모입니다.'],
    ['학생 화면의 다섯 칸', 'IEP 목표(조건·행동·기준과 목표선 그래프), 행동·기초선(빈도·지속시간·간격기록·잠재시간, 관찰자 간 일치도), 위기행동 사후 기록, 평가조정 한 장, 공유 메모가 학생마다 있습니다.'],
    ['협업은 교사끼리', '메신저와 일정·예약은 교사만 씁니다. 전화 예약, 긴급회의 공지를 보내면 받는 선생님 화면 위에 알림 띠가 깜박입니다. 시연판에는 가명·가상 학생만 넣습니다.']
  ];
  if (isAdmin()) p.push(['관리자가 할 일', '관리에서 구글 이메일로 선생님과 보조인력을 초대하고, 학사일정·진전도 경고 기준·사후 기록 회고 기한을 정합니다. 접근 기록에서 누가 어느 학생 자료를 열람·수정했는지 볼 수 있습니다.']);
  return p;
}

export function openGuide(i = 0) {
  const ps = pages();
  const [t, body] = ps[i];
  const m = openModal(`<div class="guide"><p class="guide-count" aria-live="polite">${i + 1} / ${ps.length}</p><h2>${esc(t)}</h2><p>${esc(body)}</p>
    <div class="guide-dots" aria-hidden="true">${ps.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
    <div class="actions">${i > 0 ? `<button type="button" class="ghost" data-g="${i - 1}">이전</button>` : '<button type="button" class="ghost" data-g="skip">건너뛰기</button>'}<span class="grow"></span>
    ${i < ps.length - 1 ? `<button type="button" class="primary" data-g="${i + 1}">다음</button>` : '<button type="button" class="primary" data-g="done">시작하기</button>'}</div></div>`);
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    const g = b.dataset.g;
    if (g === 'skip' || g === 'done') { try { localStorage.setItem(KEY(S.me.uid), '1'); } catch {} closeModal(); return; }
    openGuide(Number(g));
  });
}

export function maybeShowGuide() {
  let seen = false; try { seen = !!localStorage.getItem(KEY(S.me.uid)); } catch {}
  if (!seen && !document.querySelector('.modal-back')) setTimeout(() => openGuide(0), 400);
}

on('guide-open', () => openGuide(0));
