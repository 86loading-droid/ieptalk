-- IEP톡 학교 DB 이식용 스키마 (PostgreSQL 14 이상)
-- Firebase(Firestore) 시연판의 자료 구조와 권한 규칙(firestore.rules)을 관계형 표로 옮긴 것이다.
-- 행 단위 보안(RLS)으로 역할별 권한을 DB에서 강제한다.
-- 앱 서버는 요청마다 로그인한 사용자 식별값을 넣는다:  SET LOCAL app.user_id = '<사용자 uid>';
-- (Supabase를 쓰면 app.current_uid()를 auth.uid()::text 로 바꾸면 된다.)

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_uid() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;

-- 학교와 구성원 ---------------------------------------------------------
CREATE TABLE schools (
  id            text PRIMARY KEY,                -- 예: 'demo-school'
  name          text NOT NULL,
  year_start    date, sem1_start date, sem1_end date, sem2_start date, sem2_end date,
  warn_run      int  NOT NULL DEFAULT 3 CHECK (warn_run BETWEEN 2 AND 6),  -- 진전도 경고 연속 횟수
  quiet_from    time NOT NULL DEFAULT '17:00',   -- 근무시간 외 시작
  quiet_to      time NOT NULL DEFAULT '08:00'
);

CREATE TABLE members (
  uid        text PRIMARY KEY,                   -- 로그인 계정 식별값
  school_id  text NOT NULL REFERENCES schools(id),
  email      text NOT NULL,
  name       text NOT NULL,
  role       text NOT NULL CHECK (role IN ('admin', 'teacher', 'aide')),
  title      text NOT NULL DEFAULT '',          -- 직책(통합학급 담임, 교감, 특수교육실무사 등)
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, email)
);

CREATE TABLE invites (
  school_id  text NOT NULL REFERENCES schools(id),
  email      text NOT NULL,                     -- 소문자
  name       text NOT NULL,
  role       text NOT NULL CHECK (role IN ('admin', 'teacher', 'aide')),
  title      text NOT NULL DEFAULT '',
  invited_by text REFERENCES members(uid),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, email)
);

-- 권한 확인 함수
CREATE OR REPLACE FUNCTION app.my_role(p_school text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM members WHERE uid = app.current_uid() AND school_id = p_school AND active $$;
CREATE OR REPLACE FUNCTION app.is_teacher(p_school text) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT coalesce(app.my_role(p_school) IN ('teacher', 'admin'), false) $$;
CREATE OR REPLACE FUNCTION app.is_admin(p_school text) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT coalesce(app.my_role(p_school) = 'admin', false) $$;
CREATE OR REPLACE FUNCTION app.is_aide(p_school text) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT coalesce(app.my_role(p_school) = 'aide', false) $$;

-- 학생·IEP --------------------------------------------------------------
CREATE TABLE students (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id    text NOT NULL REFERENCES schools(id),
  alias        text NOT NULL,                   -- 가명·별칭(실명 대신)
  grade        text NOT NULL DEFAULT '',
  note         text NOT NULL DEFAULT '',
  case_manager text REFERENCES members(uid),    -- IEP 담당 교사
  created_by   text REFERENCES members(uid),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE student_team  (student_id text REFERENCES students(id) ON DELETE CASCADE, member_uid text REFERENCES members(uid), PRIMARY KEY (student_id, member_uid));
CREATE TABLE student_aides (student_id text REFERENCES students(id) ON DELETE CASCADE, member_uid text REFERENCES members(uid), PRIMARY KEY (student_id, member_uid));

CREATE OR REPLACE FUNCTION app.assigned_aide(p_student text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM student_aides a JOIN students s ON s.id = a.student_id
                 WHERE a.student_id = p_student AND a.member_uid = app.current_uid() AND app.is_aide(s.school_id)) $$;

CREATE TABLE goals (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id  text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  domain      text NOT NULL,                    -- 영역
  condition   text NOT NULL DEFAULT '',         -- 조건
  behavior    text NOT NULL DEFAULT '',         -- 행동
  criterion   text NOT NULL DEFAULT '',         -- 기준
  measure     text NOT NULL DEFAULT '정반응률(%)',
  direction   text NOT NULL DEFAULT 'up' CHECK (direction IN ('up', 'down')),
  baseline    numeric, target numeric,
  start_date  date, target_date date,
  status      text NOT NULL DEFAULT '진행' CHECK (status IN ('진행', '수정 필요', '달성', '보류')),
  created_by  text REFERENCES members(uid), updated_by text REFERENCES members(uid),
  created_at  timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE goal_points (                      -- 진전도 측정값
  id        bigserial PRIMARY KEY,
  goal_id   text NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  d         date NOT NULL,
  v         numeric NOT NULL,
  by_uid    text REFERENCES members(uid)
);

-- 행동 기초선 ------------------------------------------------------------
CREATE TABLE targets (                          -- 표적행동(조작적 정의)
  id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id         text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  name               text NOT NULL,
  definition         text NOT NULL,
  examples           text NOT NULL DEFAULT '',
  non_examples       text NOT NULL DEFAULT '',
  method             text NOT NULL DEFAULT 'freq' CHECK (method IN ('freq', 'dur', 'int', 'lat')),  -- 빈도, 지속시간, 간격기록·순간표집, 잠재시간
  int_type           text CHECK (int_type IN ('partial', 'whole', 'momentary')),
  interval_sec       int,
  intervals          int,
  session_min        int  NOT NULL DEFAULT 40,
  baseline_start     date,
  intervention_start date,                      -- 비어 있으면 기초선(A), 있으면 이날부터 중재(B)
  intervention_memo  text NOT NULL DEFAULT '',
  created_by text REFERENCES members(uid), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bevents (                          -- 행동 기록(즉시 기록 버튼)
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id   text NOT NULL REFERENCES schools(id),
  student_id  text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  target_id   text NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('freq', 'dur', 'session', 'int', 'lat')),  -- session = 관찰했고 발생 없음
  ioa         boolean NOT NULL DEFAULT false,   -- 두 번째 관찰자(관찰자 간 일치도용) 기록. 그래프에서 뺀다
  results     boolean[],                        -- 간격기록: 간격별 발생 여부(null = 답하지 않음)
  interval_sec int,
  restraint   boolean NOT NULL DEFAULT false,   -- 물리적 제지가 있었음
  incident_id text,                             -- 연결된 위기행동 사후 기록
  at          timestamptz NOT NULL,
  end_at      timestamptz,                      -- 지속시간 기록의 끝
  d           date NOT NULL,                    -- 회기(날짜)
  intensity   smallint CHECK (intensity BETWEEN 1 AND 3),
  antecedent  text NOT NULL DEFAULT '',         -- 선행사건
  consequence text NOT NULL DEFAULT '',         -- 결과
  note        text NOT NULL DEFAULT '',
  created_by  text NOT NULL REFERENCES members(uid),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON bevents (student_id, target_id, d);
CREATE INDEX ON bevents (created_by);

CREATE TABLE memos (                            -- 공유 메모(블록 문서)
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT '',
  blocks     jsonb NOT NULL DEFAULT '[]',       -- [{t:'h'|'p'|'c', text, done}]
  created_by text REFERENCES members(uid), updated_by text REFERENCES members(uid),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- 메신저(교사 전용) ------------------------------------------------------
CREATE TABLE rooms (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id  text NOT NULL REFERENCES schools(id),
  type       text NOT NULL CHECK (type IN ('dm', 'group', 'student')),
  name       text NOT NULL DEFAULT '',
  student_id text REFERENCES students(id) ON DELETE SET NULL,
  created_by text REFERENCES members(uid),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_at    timestamptz, last_by text, last_text text
);
CREATE TABLE room_members (
  room_id    text REFERENCES rooms(id) ON DELETE CASCADE,
  member_uid text REFERENCES members(uid),
  read_at    timestamptz,                       -- 읽음 표시
  PRIMARY KEY (room_id, member_uid)
);
CREATE OR REPLACE FUNCTION app.in_room(p_room text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM room_members m JOIN rooms r ON r.id = m.room_id
                 WHERE m.room_id = p_room AND m.member_uid = app.current_uid() AND app.is_teacher(r.school_id)) $$;

CREATE TABLE messages (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id    text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  by_uid     text NOT NULL REFERENCES members(uid),
  at         timestamptz NOT NULL DEFAULT now(),   -- 미래 시각이면 예약 전송(그 시각부터 보임)
  kind       text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'booking', 'task')),
  text       text NOT NULL DEFAULT '',
  meeting_id text
);
CREATE INDEX ON messages (room_id, at);

-- 일정(회의·전화 예약) -----------------------------------------------------
CREATE TABLE meetings (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id  text NOT NULL REFERENCES schools(id),
  kind       text NOT NULL CHECK (kind IN ('meeting', 'call')),
  title      text NOT NULL,
  d          date NOT NULL,
  start_time time NOT NULL,
  minutes    int  NOT NULL DEFAULT 30,
  place      text NOT NULL DEFAULT '',          -- 장소 또는 연락 방법(내선 등)
  student_id text REFERENCES students(id) ON DELETE SET NULL,
  room_id    text REFERENCES rooms(id) ON DELETE SET NULL,
  memo       text NOT NULL DEFAULT '',
  organizer  text NOT NULL REFERENCES members(uid),
  canceled   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE meeting_attendees (
  meeting_id text REFERENCES meetings(id) ON DELETE CASCADE,
  member_uid text REFERENCES members(uid),
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  PRIMARY KEY (meeting_id, member_uid)
);
ALTER TABLE messages ADD FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL;

CREATE TABLE tasks (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id  text NOT NULL REFERENCES schools(id),
  title      text NOT NULL,
  assignee   text NOT NULL REFERENCES members(uid),
  due        date,
  done       boolean NOT NULL DEFAULT false,
  room_id    text REFERENCES rooms(id) ON DELETE SET NULL,
  message_id text REFERENCES messages(id) ON DELETE SET NULL,
  student_id text REFERENCES students(id) ON DELETE SET NULL,
  created_by text NOT NULL REFERENCES members(uid),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 알림 띠(전화 예약·긴급회의·공지) ------------------------------------------
CREATE TABLE alerts (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id  text NOT NULL REFERENCES schools(id),
  type       text NOT NULL CHECK (type IN ('urgent', 'call', 'meeting', 'notice')),
  title      text NOT NULL,
  text       text NOT NULL DEFAULT '',
  from_uid   text NOT NULL REFERENCES members(uid),
  at         timestamptz NOT NULL DEFAULT now(),
  room_id    text REFERENCES rooms(id) ON DELETE SET NULL,       -- 기록이 남는 대화방
  meeting_id text REFERENCES meetings(id) ON DELETE SET NULL
);
CREATE TABLE alert_recipients (
  alert_id   text REFERENCES alerts(id) ON DELETE CASCADE,
  member_uid text REFERENCES members(uid),
  ack_at     timestamptz,                       -- 확인(깜박임 끔)
  hidden_at  timestamptz,                       -- 띠에서 삭제(대화방 기록은 남음)
  PRIMARY KEY (alert_id, member_uid)
);

-- 학사일정(학교 전체)과 선생님들 간의 개인 약속 -------------------------------
-- 국가 공휴일은 js/holidays.js 목록(월력요항 기준)을 이 표에 넣어 쓴다.
CREATE TABLE holidays (
  d    date PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE acad_events (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id  text NOT NULL REFERENCES schools(id),
  title      text NOT NULL,
  cat        text NOT NULL DEFAULT 'event' CHECK (cat IN ('event', 'eval', 'meet', 'vac')),
  d          date NOT NULL,
  end_d      date NOT NULL,
  start_time time,
  end_time   time,
  place      text NOT NULL DEFAULT '',
  memo       text NOT NULL DEFAULT '',
  created_by text REFERENCES members(uid),
  CHECK (end_d >= d)
);
CREATE TABLE appointments (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id  text NOT NULL REFERENCES schools(id),
  title      text NOT NULL,
  d          date NOT NULL,
  start_time time NOT NULL,
  end_time   time NOT NULL,
  place      text NOT NULL DEFAULT '',
  memo       text NOT NULL DEFAULT '',
  created_by text NOT NULL REFERENCES members(uid),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE appointment_members (
  appt_id    text REFERENCES appointments(id) ON DELETE CASCADE,
  member_uid text REFERENCES members(uid),
  PRIMARY KEY (appt_id, member_uid)
);

-- 행 단위 보안 -------------------------------------------------------------
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_aides ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bevents ENABLE ROW LEVEL SECURITY;
ALTER TABLE memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_read  ON schools FOR SELECT USING (app.my_role(id) IS NOT NULL);
CREATE POLICY school_write ON schools FOR UPDATE USING (app.is_admin(id));

CREATE POLICY members_read  ON members FOR SELECT USING (app.my_role(school_id) IS NOT NULL OR uid = app.current_uid());
CREATE POLICY members_admin ON members FOR ALL USING (app.is_admin(school_id)) WITH CHECK (app.is_admin(school_id));
-- 첫 로그인: 초대와 같은 역할로 본인 행만 만든다
CREATE POLICY members_join ON members FOR INSERT WITH CHECK (
  uid = app.current_uid() AND EXISTS (SELECT 1 FROM invites i WHERE i.school_id = members.school_id AND i.email = lower(members.email) AND i.role = members.role));

CREATE POLICY invites_admin ON invites FOR ALL USING (app.is_admin(school_id)) WITH CHECK (app.is_admin(school_id));

-- 학생: 교사 전체, 보조인력은 배정 학생만 읽기
CREATE POLICY students_teacher ON students FOR ALL USING (app.is_teacher(school_id)) WITH CHECK (app.is_teacher(school_id));
CREATE POLICY students_aide    ON students FOR SELECT USING (app.assigned_aide(id));
CREATE POLICY team_teacher  ON student_team  FOR ALL USING (app.is_teacher((SELECT school_id FROM students WHERE id = student_id)));
CREATE POLICY aides_teacher ON student_aides FOR ALL USING (app.is_teacher((SELECT school_id FROM students WHERE id = student_id)));
CREATE POLICY aides_self    ON student_aides FOR SELECT USING (member_uid = app.current_uid());

-- IEP 목표·메모: 교사만
CREATE POLICY goals_teacher  ON goals       FOR ALL USING (app.is_teacher((SELECT school_id FROM students WHERE id = student_id)));
CREATE POLICY points_teacher ON goal_points FOR ALL USING (app.is_teacher((SELECT s.school_id FROM goals g JOIN students s ON s.id = g.student_id WHERE g.id = goal_id)));
CREATE POLICY memos_teacher  ON memos       FOR ALL USING (app.is_teacher((SELECT school_id FROM students WHERE id = student_id)));

-- 표적행동: 교사 쓰기, 배정 보조인력 읽기
CREATE POLICY targets_teacher ON targets FOR ALL USING (app.is_teacher((SELECT school_id FROM students WHERE id = student_id)));
CREATE POLICY targets_aide    ON targets FOR SELECT USING (app.assigned_aide(student_id));

-- 행동 기록: 교사는 모두, 보조인력은 자기가 저장한 것만 읽고 고친다
CREATE POLICY bev_teacher ON bevents FOR ALL USING (app.is_teacher(school_id)) WITH CHECK (app.is_teacher(school_id));
CREATE POLICY bev_aide_read   ON bevents FOR SELECT USING (app.is_aide(school_id) AND created_by = app.current_uid());
CREATE POLICY bev_aide_insert ON bevents FOR INSERT WITH CHECK (created_by = app.current_uid() AND app.assigned_aide(student_id));
CREATE POLICY bev_aide_update ON bevents FOR UPDATE USING (app.is_aide(school_id) AND created_by = app.current_uid()) WITH CHECK (created_by = app.current_uid());
CREATE POLICY bev_aide_delete ON bevents FOR DELETE USING (app.is_aide(school_id) AND created_by = app.current_uid());
-- 보조인력이 학생·표적행동을 바꾸지 못하게 막는다
CREATE OR REPLACE FUNCTION app.bev_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app.is_aide(OLD.school_id) AND (NEW.student_id <> OLD.student_id OR NEW.target_id <> OLD.target_id OR NEW.created_by <> OLD.created_by) THEN
    RAISE EXCEPTION '보조인력은 학생·행동·기록자를 바꿀 수 없습니다';
  END IF;
  NEW.updated_at := now(); RETURN NEW;
END $$;
CREATE TRIGGER bev_lock BEFORE UPDATE ON bevents FOR EACH ROW EXECUTE FUNCTION app.bev_lock();

-- 메신저: 교사이면서 방 참여자만
CREATE POLICY rooms_member  ON rooms FOR SELECT USING (app.in_room(id));
CREATE POLICY rooms_create  ON rooms FOR INSERT WITH CHECK (app.is_teacher(school_id) AND created_by = app.current_uid());
CREATE POLICY rooms_update  ON rooms FOR UPDATE USING (app.in_room(id));
CREATE POLICY rm_member     ON room_members FOR SELECT USING (app.in_room(room_id));
CREATE POLICY rm_add        ON room_members FOR INSERT WITH CHECK (app.in_room(room_id) OR (member_uid = app.current_uid() AND app.is_teacher((SELECT school_id FROM rooms WHERE id = room_id))));
CREATE POLICY rm_read_mark  ON room_members FOR UPDATE USING (member_uid = app.current_uid());
CREATE POLICY msg_read      ON messages FOR SELECT USING (app.in_room(room_id) AND (at <= now() OR by_uid = app.current_uid()));
CREATE POLICY msg_send      ON messages FOR INSERT WITH CHECK (app.in_room(room_id) AND by_uid = app.current_uid());
CREATE POLICY msg_own       ON messages FOR UPDATE USING (by_uid = app.current_uid());

-- 일정: 교사 공유 달력, 예약자는 전부, 참석자는 자기 응답만
CREATE POLICY mt_read    ON meetings FOR SELECT USING (app.is_teacher(school_id));
CREATE POLICY mt_create  ON meetings FOR INSERT WITH CHECK (app.is_teacher(school_id) AND organizer = app.current_uid());
CREATE POLICY mt_org     ON meetings FOR UPDATE USING (organizer = app.current_uid());
CREATE POLICY mt_del     ON meetings FOR DELETE USING (organizer = app.current_uid());
CREATE POLICY ma_read    ON meeting_attendees FOR SELECT USING (app.is_teacher((SELECT school_id FROM meetings WHERE id = meeting_id)));
CREATE POLICY ma_org     ON meeting_attendees FOR ALL USING ((SELECT organizer FROM meetings WHERE id = meeting_id) = app.current_uid());
CREATE POLICY ma_self    ON meeting_attendees FOR UPDATE USING (member_uid = app.current_uid());

-- 할 일
CREATE POLICY tasks_read   ON tasks FOR SELECT USING (app.is_teacher(school_id));
CREATE POLICY tasks_create ON tasks FOR INSERT WITH CHECK (app.is_teacher(school_id) AND created_by = app.current_uid());
CREATE POLICY tasks_edit   ON tasks FOR UPDATE USING (assignee = app.current_uid() OR created_by = app.current_uid());
CREATE POLICY tasks_del    ON tasks FOR DELETE USING (assignee = app.current_uid() OR created_by = app.current_uid());

-- 알림: 받는 사람은 자기 행의 확인·삭제 표시만, 보낸 사람은 전체
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_recipients ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION app.alert_recipient(p_alert text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM alert_recipients WHERE alert_id = p_alert AND member_uid = app.current_uid()) $$;
CREATE POLICY al_read   ON alerts FOR SELECT USING (app.is_teacher(school_id) AND (from_uid = app.current_uid() OR app.alert_recipient(id)));
CREATE POLICY al_create ON alerts FOR INSERT WITH CHECK (app.is_teacher(school_id) AND from_uid = app.current_uid());
CREATE POLICY al_delete ON alerts FOR DELETE USING (from_uid = app.current_uid());
CREATE POLICY ar_self   ON alert_recipients FOR SELECT USING (member_uid = app.current_uid());
CREATE POLICY ar_sender ON alert_recipients FOR ALL USING ((SELECT from_uid FROM alerts WHERE id = alert_id) = app.current_uid());
CREATE POLICY ar_mark   ON alert_recipients FOR UPDATE USING (member_uid = app.current_uid()) WITH CHECK (member_uid = app.current_uid());

-- 공휴일·학사일정: 교사는 읽고 관리자만 쓴다. 개인 약속: 함께하는 사람만 읽고 만든 사람만 고친다.
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE acad_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY hol_read   ON holidays FOR SELECT USING (true);
CREATE OR REPLACE FUNCTION app.appt_member(p_appt text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM appointment_members WHERE appt_id = p_appt AND member_uid = app.current_uid()) $$;
CREATE OR REPLACE FUNCTION app.appt_owner(p_appt text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM appointments WHERE id = p_appt AND created_by = app.current_uid()) $$;
CREATE POLICY acad_read  ON acad_events FOR SELECT USING (app.is_teacher(school_id));
CREATE POLICY acad_admin ON acad_events FOR ALL USING (app.is_admin(school_id)) WITH CHECK (app.is_admin(school_id));
CREATE POLICY ap_read    ON appointments FOR SELECT USING (app.is_teacher(school_id) AND (created_by = app.current_uid() OR app.appt_member(id)));
CREATE POLICY ap_create  ON appointments FOR INSERT WITH CHECK (app.is_teacher(school_id) AND created_by = app.current_uid());
CREATE POLICY ap_owner   ON appointments FOR UPDATE USING (created_by = app.current_uid());
CREATE POLICY ap_del     ON appointments FOR DELETE USING (created_by = app.current_uid());
CREATE POLICY apm_read   ON appointment_members FOR SELECT USING (member_uid = app.current_uid() OR app.appt_member(appt_id) OR app.appt_owner(appt_id));
CREATE POLICY apm_owner  ON appointment_members FOR ALL USING (app.appt_owner(appt_id)) WITH CHECK (app.appt_owner(appt_id));

-- 위기행동 사후 기록 ---------------------------------------------------
CREATE TABLE incidents (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id     text NOT NULL REFERENCES schools(id),
  student_id    text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  event_id      text REFERENCES bevents(id) ON DELETE SET NULL,
  d date NOT NULL, t time, place text NOT NULL DEFAULT '',
  antecedent text NOT NULL DEFAULT '', behavior text NOT NULL DEFAULT '', prevent text NOT NULL DEFAULT '',
  restraint boolean NOT NULL DEFAULT false, restraint_method text NOT NULL DEFAULT '', r_start time, r_end time,
  injury_student text NOT NULL DEFAULT '', injury_staff text NOT NULL DEFAULT '',
  reported_at timestamptz, reported_to text NOT NULL DEFAULT '', notified_at timestamptz, notify_method text NOT NULL DEFAULT '',
  debrief_date date, debrief_notes text NOT NULL DEFAULT '', hypothesis text NOT NULL DEFAULT '',
  bsp_change text CHECK (bsp_change IN ('', 'yes', 'no')), actions text NOT NULL DEFAULT '', closed boolean NOT NULL DEFAULT false,
  created_by text NOT NULL REFERENCES members(uid), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE incident_attendees (incident_id text REFERENCES incidents(id) ON DELETE CASCADE, member_uid text REFERENCES members(uid), PRIMARY KEY (incident_id, member_uid));
ALTER TABLE schools ADD COLUMN debrief_days int NOT NULL DEFAULT 2 CHECK (debrief_days BETWEEN 0 AND 10);  -- 팀 회고 기한(수업일). 법정 수치 아님
ALTER TABLE schools ADD COLUMN review_n int NOT NULL DEFAULT 3;
ALTER TABLE schools ADD COLUMN review_days int NOT NULL DEFAULT 30;

-- 평가조정 한 장 -----------------------------------------------------------
CREATE TABLE accommodations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject text NOT NULL,
  presentation text[] NOT NULL DEFAULT '{}', response text[] NOT NULL DEFAULT '{}', timing text[] NOT NULL DEFAULT '{}', setting text[] NOT NULL DEFAULT '{}', scheduling text[] NOT NULL DEFAULT '{}',
  other text NOT NULL DEFAULT '', modification boolean NOT NULL DEFAULT false, mod_note text NOT NULL DEFAULT '',
  created_by text REFERENCES members(uid), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE accommodation_shares (accom_id text REFERENCES accommodations(id) ON DELETE CASCADE, member_uid text REFERENCES members(uid), confirmed_at timestamptz, PRIMARY KEY (accom_id, member_uid));
CREATE TABLE accommodation_effects (id bigserial PRIMARY KEY, accom_id text REFERENCES accommodations(id) ON DELETE CASCADE, d date NOT NULL, by_uid text REFERENCES members(uid), note text NOT NULL);

-- 접근 기록(고치거나 지울 수 없음) ----------------------------------------
CREATE TABLE access_log (
  id bigserial PRIMARY KEY, school_id text NOT NULL REFERENCES schools(id),
  uid text NOT NULL REFERENCES members(uid), student_id text, action text NOT NULL CHECK (action IN ('view', 'create', 'edit', 'delete', 'print')),
  what text NOT NULL DEFAULT '', at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE accommodations ENABLE ROW LEVEL SECURITY;
ALTER TABLE accommodation_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE accommodation_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY ic_teacher ON incidents FOR SELECT USING (app.is_teacher(school_id));
CREATE POLICY ic_insert  ON incidents FOR INSERT WITH CHECK (app.is_teacher(school_id) AND created_by = app.current_uid());
CREATE POLICY ic_update  ON incidents FOR UPDATE USING (app.is_teacher(school_id));
CREATE POLICY ic_delete  ON incidents FOR DELETE USING (created_by = app.current_uid() OR app.is_admin(school_id));
CREATE POLICY ica_teacher ON incident_attendees FOR ALL USING (app.is_teacher((SELECT school_id FROM incidents WHERE id = incident_id)));
CREATE POLICY acc_teacher ON accommodations FOR ALL USING (app.is_teacher((SELECT school_id FROM students WHERE id = student_id)));
CREATE POLICY accs_teacher ON accommodation_shares FOR ALL USING (app.is_teacher((SELECT s.school_id FROM accommodations a JOIN students s ON s.id = a.student_id WHERE a.id = accom_id)));
CREATE POLICY acce_teacher ON accommodation_effects FOR ALL USING (app.is_teacher((SELECT s.school_id FROM accommodations a JOIN students s ON s.id = a.student_id WHERE a.id = accom_id)));
CREATE POLICY log_insert ON access_log FOR INSERT WITH CHECK (uid = app.current_uid() AND app.my_role(school_id) IS NOT NULL);
CREATE POLICY log_read   ON access_log FOR SELECT USING (app.is_admin(school_id));
-- 접근 기록에는 UPDATE·DELETE 정책을 두지 않는다(행 단위 보안이 켜져 있으면 정책이 없는 동작은 모두 거부된다).

-- 내 책상(교사 개인 시간표·메모·D-Day 별표) -----------------------------
CREATE TABLE teacher_desks (
  uid text PRIMARY KEY REFERENCES members(uid) ON DELETE CASCADE,
  periods jsonb NOT NULL DEFAULT '[]',   -- [["09:00","09:40"], ...]
  cells jsonb NOT NULL DEFAULT '{}',     -- {"요일-교시": "과목 학급"}, 요일 1=월
  lunch jsonb, memo text NOT NULL DEFAULT '', stars text[] NOT NULL DEFAULT '{}',  -- 별표한 학사일정 id
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE teacher_desks ENABLE ROW LEVEL SECURITY;
CREATE POLICY desk_own ON teacher_desks FOR ALL USING (uid = app.current_uid()) WITH CHECK (uid = app.current_uid());

-- 보존·파기: 졸업·전출 학생의 행동 기록 등은 학교 보존 기준에 맞춰 정기 삭제한다(기간은 학교·교육청 기준 확인).
