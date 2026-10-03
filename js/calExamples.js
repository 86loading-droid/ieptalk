// 일정 예시: 학사일정(학교 전체)과 선생님들 간의 개인 약속. 모두 시연용 가상 일정이다.
// 학사일정 분류: event(학교 행사), eval(평가), meet(연수·협의회), vac(방학·휴업)

export function acadExamples() {
  const a = (date, title, cat, extra = {}) => ({ date, endDate: extra.endDate || date, title, cat, start: extra.start || '', end: extra.end || '', place: extra.place || '', memo: extra.memo || '', sample: 'example-cal' });
  return [
    a('2026-08-18', '2학기 개학식', 'event'),
    a('2026-09-16', '2학기 학부모 공개수업', 'event', { memo: '통합학급 수업 참관 후 특수학급 상담 연계' }),
    a('2026-10-07', '교직원 연수: 장애학생 인권 보호와 위기행동 대응', 'meet', { start: '15:00', end: '16:30', place: '시청각실' }),
    a('2026-10-12', '2학기 학부모 상담 주간', 'event', { endDate: '2026-10-16', memo: '개별화교육 2학기 진행 상황 안내' }),
    a('2026-10-21', '현장체험학습(전 학년)', 'event', { memo: '특수교육대상학생 지원인력 배치 확인' }),
    a('2026-10-28', '2학기 개별화교육지원팀 협의회(중간 점검)', 'meet', { start: '15:00', end: '16:00', place: '특수학급 교실' }),
    a('2026-11-02', '장애이해교육 주간', 'event', { endDate: '2026-11-06' }),
    a('2026-11-13', '학예회', 'event', { place: '강당' }),
    a('2026-11-25', '수업 나눔의 날', 'meet', { start: '14:40', end: '16:30' }),
    a('2026-12-07', '2학기 학업성취 평가 주간', 'eval', { endDate: '2026-12-11', memo: '특수교육대상학생 평가 조정 사전 협의' }),
    a('2026-12-16', '2학기 개별화교육 평가회', 'meet', { start: '15:00', end: '16:30', place: '특수학급 교실' }),
    a('2027-01-07', '졸업식·종업식', 'event'),
    a('2027-01-08', '겨울방학 시작', 'vac'),
    a('2027-02-22', '신학년 준비 기간', 'meet', { endDate: '2027-02-26', memo: '2027학년도 개별화교육지원팀 구성 준비' }),
    a('2027-03-02', '2027학년도 입학식·개학식', 'event')
  ];
}

// me: 내 uid, others: 다른 교사 uid 목록(앞에서부터 사용)
export function apptExamples(me, others = []) {
  const o1 = others[0], o2 = others[1] || others[0];
  const p = (date, start, end, title, with_, extra = {}) => ({ date, start, end, title, place: extra.place || '', memo: extra.memo || '', memberUids: [...new Set([me, ...with_.filter(Boolean)])], createdBy: extra.by || me, sample: 'example-cal' });
  if (!o1) return [p('2026-10-14', '16:40', '17:30', '연구회 발표 자료 정리', [], { memo: '혼자 정리하는 시간' })];
  return [
    p('2026-10-06', '12:30', '13:10', '점심 약속', [o1], { place: '학교 앞 칼국수집', memo: '통합학급 수업 이야기 겸' }),
    p('2026-10-08', '16:50', '18:30', '동학년 선생님들 저녁 모임', [o1, o2], { place: '학교 앞 식당' }),
    p('2026-10-13', '08:10', '08:30', '아침 커피', [o2], { place: '교무실 옆 휴게실', by: o2 }),
    p('2026-10-20', '16:40', '17:40', '특수교육 연구회 발표 준비', [o2], { place: '특수학급 교실', memo: '행동 기록 사례 정리' }),
    p('2026-10-23', '17:00', '18:00', '퇴근 후 배드민턴', [o1], { place: '학교 체육관', by: o1 }),
    p('2026-11-03', '12:30', '13:10', '점심 약속', [o1, o2], { place: '교내 카페' }),
    p('2026-11-18', '16:40', '17:20', '연수 후기 나누기', [o2], { place: '도서관' })
  ];
}
