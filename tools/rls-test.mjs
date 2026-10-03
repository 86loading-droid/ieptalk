import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const sql = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
await db.exec(sql);
// 역할 시험: 일반 역할로 RLS 확인
await db.exec(`
INSERT INTO schools(id,name) VALUES ('s','데모');
INSERT INTO members(uid,school_id,email,name,role) VALUES ('t1','s','t1@x','교사','teacher'),('a1','s','a1@x','실무사','aide'),('a2','s','a2@x','실무사2','aide');
INSERT INTO students(id,school_id,alias) VALUES ('st','s','하람');
INSERT INTO student_aides VALUES ('st','a1'),('st','a2');
INSERT INTO targets(id,student_id,name,definition) VALUES ('tg','st','소리','정의');
INSERT INTO bevents(id,school_id,student_id,target_id,type,at,d,created_by) VALUES ('e1','s','st','tg','freq',now(),current_date,'a1'),('e2','s','st','tg','freq',now(),current_date,'a2'),('e3','s','st','tg','freq',now(),current_date,'t1');
CREATE ROLE appuser; GRANT USAGE ON SCHEMA app TO appuser; GRANT ALL ON ALL TABLES IN SCHEMA public TO appuser; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO appuser;
`);
async function as(uid, q) { await db.exec(`RESET ROLE; SET app.user_id='${uid}'; SET ROLE appuser;`); try { return (await db.query(q)).rows; } catch (e) { return 'ERR ' + e.message; } }
console.log('a1 sees', await as('a1', 'SELECT id FROM bevents ORDER BY id'));
console.log('t1 sees', await as('t1', 'SELECT id FROM bevents ORDER BY id'));
console.log('a1 edit own', await as('a1', "UPDATE bevents SET note='수정' WHERE id='e1' RETURNING id"));
console.log('a1 edit other', await as('a1', "UPDATE bevents SET note='x' WHERE id='e2' RETURNING id"));
console.log('a1 rooms', await as('a1', 'SELECT * FROM rooms'));
console.log('a1 goals', await as('a1', 'SELECT * FROM goals'));
await db.exec(`RESET ROLE; INSERT INTO members(uid,school_id,email,name,role) VALUES ('t2','s','t2@x','교사2','teacher'),('t3','s','t3@x','교사3','teacher');
INSERT INTO alerts(id,school_id,type,title,from_uid) VALUES ('al','s','urgent','긴급회의','t1');
INSERT INTO alert_recipients(alert_id,member_uid) VALUES ('al','t2');`);
console.log('t2 sees alert', await as('t2', 'SELECT id FROM alerts'));
console.log('t3 sees alert(none)', await as('t3', 'SELECT id FROM alerts'));
console.log('t2 ack own', await as('t2', "UPDATE alert_recipients SET ack_at=now() WHERE alert_id='al' RETURNING member_uid"));
console.log('a1 sees alert(none)', await as('a1', 'SELECT id FROM alerts'));
console.log('a1 targets', await as('a1', 'SELECT id FROM targets'));

// 학사일정·개인 약속
await db.exec(`RESET ROLE; INSERT INTO acad_events(id,school_id,title,d,end_d) VALUES ('ac','s','학예회','2026-11-13','2026-11-13');
INSERT INTO appointments(id,school_id,title,d,start_time,end_time,created_by) VALUES ('ap','s','점심 약속','2026-10-06','12:30','13:10','t1');
INSERT INTO appointment_members VALUES ('ap','t1'),('ap','t2');`);
console.log('t3 sees acad', await as('t3', 'SELECT id FROM acad_events'));
console.log('a1 sees acad(none)', await as('a1', 'SELECT id FROM acad_events'));
console.log('t3 write acad(ERR or none)', await as('t3', "INSERT INTO acad_events(id,school_id,title,d,end_d) VALUES ('x','s','x','2026-01-01','2026-01-01') RETURNING id"));
console.log('t2 sees appt', await as('t2', 'SELECT id FROM appointments'));
console.log('t3 sees appt(none)', await as('t3', 'SELECT id FROM appointments'));
console.log('t2 edit appt(none)', await as('t2', "UPDATE appointments SET title='x' WHERE id='ap' RETURNING id"));
console.log('t1 edit appt', await as('t1', "UPDATE appointments SET title='점심' WHERE id='ap' RETURNING id"));
