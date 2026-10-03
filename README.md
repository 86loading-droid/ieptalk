# IEP톡

현장 특수교사가 IEP 작성·진전도 점검·행동 기록을 한곳에서 하고, 교사끼리 메신저와 회의·전화 예약으로 협업하는 웹앱(시연판)입니다.

- 시연 주소: https://86loading-droid.github.io/ieptalk/
- 로그인 없이 둘러보기(가상 자료, 브라우저 안에서만 동작): https://86loading-droid.github.io/ieptalk/?demo=1
- 시연판에는 가명·가상 학생만 넣습니다. 실제 학생 정보는 학교 서버로 옮긴 뒤 학교의 심의를 거쳐 사용합니다.

## 누가 무엇을 하나

| 역할 | 할 수 있는 일 | 할 수 없는 일 |
| --- | --- | --- |
| 관리자(교사) | 교사가 하는 모든 일, 구글 계정 초대·역할 지정, 학사일정·경고 기준 설정 | |
| 교사 | 학생·IEP 목표·진전도, 표적행동 정의와 기초선, 행동 기록, 메신저, 회의·전화 예약, 공유 메모, 할 일 | |
| 보조인력 | 배정된 학생의 행동 즉시 기록(휴대폰), 자기가 저장한 기록 보기·수정·삭제 | 메신저, 일정, IEP 목표, 다른 사람이 남긴 기록 보기 |

보호자 채널은 이번 시연판에 넣지 않았습니다.

## 주요 기능

1. 한눈에 보기(첫 화면): 모든 기능을 패들릿 담벼락처럼 펼쳐 보여 주고, 칸 제목을 누르면 세부 화면으로 들어갑니다. IEP 법정 기한(팀 구성 2주, 계획 작성 30일, 학기 평가), 진전도 경고, 7일 안 일정, 응답할 초대, 할 일, 안 읽은 대화.
2. 학생·IEP: 조건·행동·기준 3요소 점검, 측정값 입력, 목표선 그래프, 최근 N회 연속 목표선 아래면 경고(기본 3회)와 「팀 회의 예약」.
3. 행동·기초선: 표적행동의 조작적 정의(해당·비해당 예), 빈도(한 번 누름)·지속시간(시작·끝) 즉시 기록 버튼, 「관찰했고 발생 없음」, 회기별 그래프, 평균·중앙값·범위·추세, 안정성 참고값, 선행사건·결과 집계(기능 가설 도움), 기초선 확정 후 중재(B) 단계 표시.
4. 메신저(교사 전용): 1:1·모둠·학생 IEP팀 대화, @이름 부르기, 읽음 표시, 메시지를 할 일로, 근무시간 외 「아침에 보내기」.
5. 알림 띠: 메신저에서 전화 예약, 긴급회의 공지, 일반 공지를 한 사람 또는 여러 사람에게 보내면 받는 사람 화면 맨 위에 깜박이며 뜹니다. 「확인」으로 깜박임을 끄고 「삭제」로 띠에서 지울 수 있으며, 메신저 대화방의 기록은 그대로 남습니다. 회의·전화 예약을 보내도 같은 알림이 뜹니다.
6. 일정·예약: 회의 예약, 전화 예약(연락 방법·내선), 교사 공유 달력, 참석자 수락·거절, 겹치는 일정 경고, 모두 비어 있는 시간 추천, 구글 캘린더에 추가, 대화방에 예약 카드 자동 전송.
7. 공유 메모: 소제목·문단·체크리스트 블록, 동시 편집, 회의 안건·행동 관찰 양식.

## 처음 쓰는 방법(시연)

1. 관리자(86loading@gmail.com 또는 hschoi@uu.ac.kr)로 로그인합니다.
2. 관리 → 구글 계정 초대에서 이메일, 이름, 역할(교사·보조인력), 직책을 넣습니다. 10명 정도 초대할 수 있습니다.
3. 관리 → 「가상 학생 예시 넣기」를 누르면 가상 학생 3명, 목표, 표적행동, 기초선 기록이 들어갑니다.
4. 초대받은 사람에게 시연 주소를 알려 줍니다. 처음 구글 로그인을 하면 초대한 역할로 들어옵니다.
5. 보조인력은 휴대폰에서 주소를 열고 「홈 화면에 추가」를 하면 앱처럼 쓸 수 있습니다.

## 디자인

Anthropic 공식 `frontend-design` 스킬(anthropics/skills)의 절차로 「햇살 드는 교실」 방향을 정했습니다.

- 색: 종이 바탕 #FFFDF7, 연필 글자 #2B2A26, 칠판 초록 #2E6A55(버튼·링크), 개나리 #F5C842(행동 기록 버튼과 지금 위치에만), 하늘 #2F5F9E(전화·중재 단계)
- 글꼴: 제목 고운돋움(Gowun Dodum), 본문 IBM Plex Sans KR
- 강조는 한 곳: 행동 기록 버튼을 눌러 붙이는 스티커처럼 크게. 나머지는 그림자 없이 얇은 선으로 조용하게
- 글자·배경 대비 4.5:1 이상, 키보드 초점 표시, 움직임 줄이기 설정 존중

## 파일 구성

```
index.html            앱 화면 틀
css/app.css           화면 스타일(휴대폰 우선, 밝은·어두운 화면)
js/config.js          서버 설정값, 학교 구분값, 관리자 이메일  ← 학교로 옮길 때 바꾸는 곳
js/store.js           자료 저장소(Firebase 또는 데모)        ← 학교 DB로 옮길 때 바꾸는 곳
js/app.js, state.js   시작·경로·전역 상태
js/views/*.js         화면별 코드(오늘, 학생, 행동, 메신저, 일정, 관리, 보조인력)
js/charts.js          진전도·기초선 그래프와 계산
js/vendor/firebase.js Firebase SDK(로컬 묶음)
firestore.rules       Firebase 보안 규칙(역할별 권한)
db/schema.sql         학교 DB 이식용 PostgreSQL 스키마 + 행 단위 보안
tools/                점검 스크립트(화면 점검, 권한 점검)
```

## 학교 DB 이식

화면 코드는 `js/store.js`의 공통 함수(`sub`, `create`, `update`, `remove`, `saveSchool`, `init`, `signIn`, `signOut`)만 씁니다. 학교 서버로 옮길 때는 다음 순서로 합니다.

1. `db/schema.sql`을 학교 PostgreSQL에 실행합니다. 역할별 권한은 행 단위 보안(RLS)으로 DB가 강제합니다.
2. 학교 서버의 API(또는 Supabase)를 붙이는 저장소 파일을 `js/store.js`와 같은 함수 모양으로 만듭니다. 로그인한 사용자 식별값은 요청마다 `SET LOCAL app.user_id = '<uid>'`로 넘깁니다.
3. `js/config.js`의 `SCHOOL_ID`, 관리자 이메일, 서버 주소를 학교 값으로 바꿉니다.
4. `node tools/rls-test.mjs`로 권한(보조인력은 자기 기록만 등)이 지켜지는지 확인합니다.

| Firestore 경로 | PostgreSQL 표 |
| --- | --- |
| schools/{학교} | schools |
| …/members, …/invites | members, invites |
| …/students (teamUids, aideUids) | students, student_team, student_aides |
| …/students/{id}/goals (points) | goals, goal_points |
| …/students/{id}/targets | targets |
| …/bevents | bevents |
| …/students/{id}/memos | memos |
| …/rooms (memberUids, readBy) | rooms, room_members |
| …/rooms/{id}/messages | messages |
| …/meetings (attendees) | meetings, meeting_attendees |
| …/tasks | tasks |
| …/alerts (to, ack, hidden) | alerts, alert_recipients |

## 학교 도입 전 확인할 것

- 「학습지원 소프트웨어 선정 기준」(초·중등교육법 제29조의2, 2026학년도부터) 필수기준 충족과 학교운영위원회 심의
- 장애·행동 정보는 민감정보로 다룹니다(개인정보 보호법 제23조). 보존·파기 기간은 학교·교육청 기준 확인
- 공식 IEP 기록은 나이스가 원본입니다. IEP톡은 협업·초안·진전도 작업 공간입니다.

## 점검

```
python3 -m http.server 8765        # 저장소 폴더에서
python3 tools/smoke.py             # 데모 모드 화면·실시간 메시지·예약·보조인력 기록 점검(Playwright)
node tools/rls-test.mjs            # schema.sql 권한 점검(@electric-sql/pglite 필요)
```
