import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();

async function expectFailure(label, operation) {
  let failed = false;
  try { await operation(); } catch { failed = true; }
  if (!failed) throw new Error(`Expected failure: ${label}`);
}

try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  for (const name of migrationFiles) {
    await db.exec(await readFile(new URL(name, migrationDirectory), "utf8"));
  }
  const index = await db.query("select 1 from pg_indexes where schemaname='public' and indexname='classes_created_by_idx'");
  if (index.rows.length !== 1) throw new Error("Expected classes.created_by index");

  const admin = "00000000-0000-4000-8000-000000000001";
  const teacher1 = "00000000-0000-4000-8000-000000000002";
  const teacher2 = "00000000-0000-4000-8000-000000000003";
  const teacher3 = "00000000-0000-4000-8000-000000000004";
  const student = "00000000-0000-4000-8000-000000000005";
  const testHash = "$argon2id$v=19$m=65536,p=4,t=3$6+6NPdP2u/PY7wp5Pd6XVA$ALIcpsY7HRG+4c0rZB18ekeuvxzAtplxLMfnIgZY1t8";
  await db.exec(`
    insert into public.app_users(id,role,username,display_name,password_hash) values
    ('${admin}','admin','admin','Admin User','${testHash}'),
    ('${teacher1}','teacher','teacher1','Teacher One','${testHash}'),
    ('${teacher2}','teacher','teacher2','Teacher Two','${testHash}'),
    ('${teacher3}','teacher','teacher3','Teacher Three','${testHash}'),
    ('${student}','student','student1','Student One','${testHash}');
  `);

  const classResult = await db.query("select id from public.create_class_with_teachers($1,$2,$3::uuid[])", ["Robotik 101 A", admin, [teacher1, teacher2]]);
  const classId = classResult.rows[0].id;
  const count = await db.query("select count(*)::int as n from public.class_teachers where class_id=$1", [classId]);
  if (count.rows[0].n !== 2) throw new Error("Expected two teachers");
  await expectFailure("third teacher", () => db.query("insert into public.class_teachers(class_id,teacher_id) values ($1,$2)", [classId, teacher3]));
  await expectFailure("student as teacher", () => db.query("select public.set_class_teachers($1,$2::uuid[])", [classId, [student]]));

  await db.query("select public.create_student_with_enrollment($1,$2,$3,$4)", [testHash, "student2", "Student Two", classId]);
  const newStudent = await db.query("select id from public.app_users where username='student2'");
  const studentId = newStudent.rows[0].id;
  await expectFailure("duplicate active enrollment", () => db.query("select public.enroll_existing_student($1,$2)", [classId, studentId]));
  const removal = await db.query("select public.remove_student_from_class($1,$2) as still_active", [classId, studentId]);
  if (removal.rows[0].still_active !== false) throw new Error("Student should become inactive");
  const inactive = await db.query("select active from public.app_users where id=$1", [studentId]);
  if (inactive.rows[0].active !== false) throw new Error("Student account should be inactive");
  await db.query("select public.enroll_existing_student($1,$2)", [classId, studentId]);
  const active = await db.query("select active from public.app_users where id=$1", [studentId]);
  if (active.rows[0].active !== true) throw new Error("Student account should reactivate");

  const beforeReset = await db.query("select session_version from public.app_users where id=$1", [studentId]);
  await db.query("update public.app_users set password_hash=$1 where id=$2", [testHash + "x", studentId]);
  const afterReset = await db.query("select session_version from public.app_users where id=$1", [studentId]);
  if (afterReset.rows[0].session_version !== beforeReset.rows[0].session_version + 1) {
    throw new Error("Password reset must invalidate existing sessions");
  }
  const beforeDisable = await db.query("select session_version from public.app_users where id=$1", [teacher3]);
  await db.query("update public.app_users set active=false where id=$1", [teacher3]);
  const afterDisable = await db.query("select session_version from public.app_users where id=$1", [teacher3]);
  if (afterDisable.rows[0].session_version !== beforeDisable.rows[0].session_version + 1) {
    throw new Error("Deactivation must invalidate existing sessions");
  }

  const bucket = "a".repeat(64);
  for (let attempt = 1; attempt <= 6; attempt++) {
    const limited = await db.query("select public.consume_login_attempt($1,$2) as allowed", [bucket, 5]);
    if (limited.rows[0].allowed !== (attempt <= 5)) throw new Error("Login limit did not apply");
  }
  await db.query("select public.clear_login_attempt($1)", [bucket]);
  const cleared = await db.query("select public.consume_login_attempt($1,$2) as allowed", [bucket, 5]);
  if (!cleared.rows[0].allowed) throw new Error("Login limit did not clear");

  const curriculum = await db.query(
    "insert into public.curricula(title,created_by) values ($1,$2) returning id",
    ["Robotik Temelleri", teacher1],
  );
  const curriculumId = curriculum.rows[0].id;
  const topic = await db.query(
    "insert into public.topics(curriculum_id,title,position) values ($1,$2,1) returning id",
    [curriculumId, "Devreler"],
  );
  const topicId = topic.rows[0].id;
  const initialMaterial = await db.query("select description,pdf_url,pdf_visible from public.topics where id=$1", [topicId]);
  if (initialMaterial.rows[0].description !== "" || initialMaterial.rows[0].pdf_url !== null || initialMaterial.rows[0].pdf_visible !== false) {
    throw new Error("Existing topics must start without a visible PDF");
  }
  await expectFailure("visible topic without PDF", () => db.query("update public.topics set pdf_visible=true where id=$1", [topicId]));
  await db.query("update public.topics set description='Devre kurmayı öğrenir.',pdf_url='https://drive.google.com/file/d/test/view',pdf_visible=true where id=$1", [topicId]);
  const material = await db.query("select description,pdf_url,pdf_visible from public.topics where id=$1", [topicId]);
  if (material.rows[0].description !== "Devre kurmayı öğrenir." || !material.rows[0].pdf_visible || !material.rows[0].pdf_url) {
    throw new Error("Topic material update failed");
  }
  const weekday = await db.query("select extract(isodow from now() at time zone 'Europe/Istanbul')::int as weekday");
  await db.query(
    "select public.set_class_learning_plan($1,$2,$3,$4::smallint,$5::time,$6::smallint)",
    [teacher1, classId, curriculumId, weekday.rows[0].weekday, "00:01", 90],
  );
  const lessons = await db.query("select id,scheduled_at from public.lessons where class_id=$1 order by scheduled_at", [classId]);
  if (lessons.rows.length < 20) throw new Error("Expected weekly lessons");
  const firstLesson = lessons.rows[0].id;
  const secondLesson = lessons.rows[1].id;
  await db.query("update public.enrollments set joined_at=now()-interval '1 day' where student_id=$1 and class_id=$2 and left_at is null", [studentId, classId]);
  await db.query("update public.lessons set scheduled_at=now()-interval '1 hour' where id=$1", [firstLesson]);
  await expectFailure("unassigned teacher marks topic", () => db.query(
    "select public.set_topic_completion($1,$2,$3,$4,true)", [teacher3, classId, studentId, topicId],
  ));
  await db.query("select public.set_topic_completion($1,$2,$3,$4,true)", [teacher1, classId, studentId, topicId]);
  await expectFailure("future lesson attendance", () => db.query(
    "select public.record_attendance($1,$2,$3,'var')", [teacher1, secondLesson, studentId],
  ));
  await db.query("select public.record_attendance($1,$2,$3,'var')", [teacher1, firstLesson, studentId]);
  await db.query("select public.finalize_lesson_attendance($1,$2)", [teacher1, firstLesson]);
  const summary = await db.query("select * from public.student_learning_summary($1,$2)", [studentId, classId]);
  if (Number(summary.rows[0].total_topics) !== 1 || Number(summary.rows[0].completed_topics) !== 1
      || Number(summary.rows[0].completed_lessons) !== 1 || Number(summary.rows[0].present_lessons) !== 1) {
    throw new Error("Learning summary is incorrect");
  }
  const absentLesson = await db.query("insert into public.lessons(class_id,scheduled_on,scheduled_at,duration_minutes) values ($1,current_date - 1,now()-interval '2 hours',90) returning id", [classId]);
  const absentLessonId = absentLesson.rows[0].id;
  await db.query("select public.record_attendance($1,$2,$3,'yok')", [teacher1, absentLessonId, studentId]);
  await db.query("select public.finalize_lesson_attendance($1,$2)", [teacher1, absentLessonId]);
  const absentSummary = await db.query("select * from public.student_learning_summary($1,$2)", [studentId, classId]);
  if (Number(absentSummary.rows[0].completed_lessons) !== 2 || Number(absentSummary.rows[0].present_lessons) !== 1) {
    throw new Error("Absence must count in denominator but not numerator");
  }
  const activeEnrollment = await db.query("select id from public.enrollments where class_id=$1 and student_id=$2 and left_at is null", [classId, studentId]);
  await db.query("update public.enrollments set left_at=now()-interval '30 minutes' where id=$1", [activeEnrollment.rows[0].id]);
  const outsideLesson = await db.query("insert into public.lessons(class_id,scheduled_on,scheduled_at,duration_minutes,attendance_completed_at) values ($1,current_date - 2,now()-interval '10 minutes',90,now()) returning id", [classId]);
  await db.query("insert into public.attendance(lesson_id,student_id,status,marked_by) values ($1,$2,'var',$3)", [outsideLesson.rows[0].id, studentId, teacher1]);
  const cutoffSummary = await db.query("select * from public.student_learning_summary($1,$2)", [studentId, classId]);
  if (Number(cutoffSummary.rows[0].completed_lessons) !== 2 || Number(cutoffSummary.rows[0].present_lessons) !== 1) {
    throw new Error("Lessons after leaving a class must not count");
  }
  await expectFailure("completed lesson exception", () => db.query(
    "select public.set_lesson_exception($1,$2,true,null)", [teacher1, firstLesson],
  ));
  await db.query("select public.set_lesson_exception($1,$2,true,null)", [teacher1, secondLesson]);
  await expectFailure("cancelled lesson attendance", () => db.query(
    "select public.record_attendance($1,$2,$3,'yok')", [teacher1, secondLesson, studentId],
  ));
  await db.query("update public.enrollments set left_at=null where id=$1", [activeEnrollment.rows[0].id]);
  await db.query("select public.set_topic_completion($1,$2,$3,$4,false)", [teacher1, classId, studentId, topicId]);
  const clearedTopics = await db.query("select completed_topics from public.student_learning_summary($1,$2)", [studentId, classId]);
  if (Number(clearedTopics.rows[0].completed_topics) !== 0) throw new Error("Topic completion did not clear");

  const legacyRls = await db.query("select relrowsecurity from pg_class where oid='app_private.legacy_identity_links'::regclass");
  if (!legacyRls.rows[0].relrowsecurity) throw new Error("Legacy identity mapping must have RLS enabled");
  const assignment = await db.query(
    "insert into public.assignments(class_id,title,description,drive_url,due_at,created_by) values ($1,'Devre Çalışması','PDF çıktısı','https://drive.google.com/file/d/example/view',now()+interval '7 days',$2) returning id",
    [classId, teacher1],
  );
  const assignmentId = assignment.rows[0].id;
  await expectFailure("unassigned teacher marks assignment", () => db.query(
    "select public.mark_assignment_status($1,$2,$3,'getirdi')", [teacher3, assignmentId, studentId],
  ));
  await expectFailure("student outside class gets assignment status", () => db.query(
    "select public.mark_assignment_status($1,$2,$3,'getirdi')", [teacher1, assignmentId, student],
  ));
  await expectFailure("invalid assignment status", () => db.query(
    "select public.mark_assignment_status($1,$2,$3,'bitti')", [teacher1, assignmentId, studentId],
  ));
  await db.query("select public.mark_assignment_status($1,$2,$3,'getirmedi')", [teacher1, assignmentId, studentId]);
  await db.query("select public.mark_assignment_status($1,$2,$3,'getirdi')", [teacher2, assignmentId, studentId]);
  const assignmentStatus = await db.query(
    "select status,marked_by from public.assignment_statuses where assignment_id=$1 and student_id=$2", [assignmentId, studentId],
  );
  if (assignmentStatus.rows[0].status !== "getirdi" || assignmentStatus.rows[0].marked_by !== teacher2) {
    throw new Error("Equal teacher rights or assignment status update failed");
  }
  const rewardId = "00000000-0000-4000-8000-000000000021";
  await expectFailure("unassigned teacher awards aquarium points", () => db.query(
    "select * from public.award_aquarium_points($1,$2,$3,3,$4)", [teacher3, classId, studentId, rewardId]));
  await expectFailure("student awards aquarium points", () => db.query(
    "select * from public.award_aquarium_points($1,$2,$3,3,$4)", [studentId, classId, studentId, rewardId]));
  await expectFailure("student outside class gets aquarium points", () => db.query(
    "select * from public.award_aquarium_points($1,$2,$3,3,$4)", [teacher1, classId, student, rewardId]));
  await expectFailure("invalid aquarium points", () => db.query(
    "select * from public.award_aquarium_points($1,$2,$3,11,$4)", [teacher1, classId, studentId, rewardId]));
  const reward = await db.query("select * from public.award_aquarium_points($1,$2,$3,3,$4)", [teacher1, classId, studentId, rewardId]);
  const retry = await db.query("select * from public.award_aquarium_points($1,$2,$3,3,$4)", [teacher1, classId, studentId, rewardId]);
  if (Number(reward.rows[0].total_points) !== 3 || Number(retry.rows[0].total_points) !== 3) throw new Error("Aquarium retry awarded twice");
  await expectFailure("request id reused with different amount", () => db.query(
    "select * from public.award_aquarium_points($1,$2,$3,4,$4)", [teacher1, classId, studentId, rewardId]));
  const secondReward = await db.query("select * from public.award_aquarium_points($1,$2,$3,2,$4)", [teacher2, classId, studentId, "00000000-0000-4000-8000-000000000022"]);
  if (Number(secondReward.rows[0].total_points) !== 5) throw new Error("Co-teacher award lost points");
  const aquariumRls = await db.query("select relrowsecurity from pg_class where oid in ('public.aquarium_scores'::regclass,'public.aquarium_rewards'::regclass)");
  if (aquariumRls.rows.some(row => !row.relrowsecurity)) throw new Error("Aquarium tables require RLS");

  const subscription = await db.query(
    "insert into public.push_subscriptions(student_id,endpoint,p256dh,auth,session_version) values ($1,'https://fcm.googleapis.com/fcm/send/test','abcdefghijklmnopqrstuvwxyz0123456789','abcdefghijklmnop',(select session_version from public.app_users where id=$1)) returning id",
    [studentId],
  );
  await db.query(
    "insert into public.announcements(class_id,title,body,created_by) values ($1,'Ders duyurusu','Gelecek hafta hazırlık yapın.',$2)",
    [classId, teacher1],
  );
  const pushQueued = await db.query("select count(*)::int as n from public.push_delivery_outbox");
  if (pushQueued.rows[0].n !== 1) throw new Error("Announcement must queue one current student subscription");
  const lock = await db.query("select public.acquire_delivery_lock('attendance',30) as token");
  if (!lock.rows[0].token) throw new Error("Attendance worker lock was not acquired");
  const duplicateLock = await db.query("select public.acquire_delivery_lock('attendance',30) as token");
  if (duplicateLock.rows[0].token) throw new Error("Attendance worker lock allowed overlap");
  await db.query("select public.release_delivery_lock('attendance',$1)", [lock.rows[0].token]);
  const claimedAttendance = await db.query("select * from public.claim_attendance_sync(10)");
  const claimedFirst = claimedAttendance.rows.find((row) => row.lesson_id === firstLesson && row.student_id === studentId);
  if (!claimedFirst || claimedFirst.status !== "var") throw new Error("Attendance outbox claim failed");
  await db.query("update public.attendance set status='yok' where lesson_id=$1 and student_id=$2", [firstLesson, studentId]);
  const staleAck = await db.query("select public.finish_attendance_sync($1,$2,$3,$4,true,null) as accepted",
    [firstLesson, studentId, claimedFirst.change_version, claimedFirst.lease_token]);
  if (staleAck.rows[0].accepted) throw new Error("Stale Sheets delivery must not acknowledge a newer attendance value");
  const refreshedClaim = await db.query("select * from public.claim_attendance_sync(10)");
  const freshFirst = refreshedClaim.rows.find((row) => row.lesson_id === firstLesson && row.student_id === studentId);
  if (!freshFirst || freshFirst.status !== "yok") throw new Error("Changed attendance did not requeue");
  const freshAck = await db.query("select public.finish_attendance_sync($1,$2,$3,$4,true,null) as accepted",
    [firstLesson, studentId, freshFirst.change_version, freshFirst.lease_token]);
  if (!freshAck.rows[0].accepted) throw new Error("Current Sheets delivery acknowledgement failed");
  const claimedPush = await db.query("select * from public.claim_push_delivery(10)");
  if (claimedPush.rows.length !== 1 || !claimedPush.rows[0].eligible || claimedPush.rows[0].title !== "Ders duyurusu") {
    throw new Error("Announcement push claim or eligibility failed");
  }
  await db.query("insert into public.announcements(class_id,title,body,created_by) values ($1,'Bekleyen duyuru','Şifre değişecek.',$2)", [classId, teacher1]);
  await db.query("update public.app_users set password_hash=$1 where id=$2", [testHash, studentId]);
  const stalePush = await db.query("select * from public.claim_push_delivery(10)");
  if (stalePush.rows.length !== 1 || stalePush.rows[0].eligible) throw new Error("Password reset must invalidate queued push");
  const staleEligibility = await db.query("select sub.session_version = u.session_version as eligible from public.push_subscriptions sub join public.app_users u on u.id=sub.student_id where sub.id=$1", [subscription.rows[0].id]);
  if (staleEligibility.rows[0].eligible) throw new Error("Password reset must invalidate push subscription");
  const pushAck = await db.query("select public.finish_push_delivery($1,$2,'discard','Session changed') as accepted",
    [claimedPush.rows[0].id, claimedPush.rows[0].lease_token]);
  if (!pushAck.rows[0].accepted) throw new Error("Stale push delivery discard failed");
  await db.query("insert into public.announcements(class_id,title,body,created_by) values ($1,'Yeni duyuru','Eski cihaz görmemeli.',$2)", [classId, teacher1]);
  const staleQueued = await db.query("select count(*)::int as n from public.push_delivery_outbox");
  if (staleQueued.rows[0].n !== 2) throw new Error("Old device should not be queued after password reset");
  await db.query("update public.push_subscriptions set session_version=(select session_version from public.app_users where id=$1) where id=$2", [studentId, subscription.rows[0].id]);
  await db.query("insert into public.announcements(class_id,title,body,created_by) values ($1,'Üçüncü duyuru','Yeniden açıldı.',$2)", [classId, teacher1]);
  const reenabled = await db.query("select * from public.claim_push_delivery(10)");
  if (reenabled.rows.length !== 1 || !reenabled.rows[0].eligible) throw new Error("Current device should receive push after opting in again");
  await db.query("update public.app_users set active=false where id=$1", [studentId]);
  await db.query("insert into public.announcements(class_id,title,body,created_by) values ($1,'Pasif hesap duyurusu','Eski cihaz görmemeli.',$2)", [classId, teacher1]);
  const inactiveQueued = await db.query("select count(*)::int as n from public.push_delivery_outbox");
  if (inactiveQueued.rows[0].n !== 3) throw new Error("Deactivated student must not receive newly queued push");

  await db.exec("set role anon");
  await expectFailure("anonymous table read", () => db.query("select * from public.app_users"));
  await expectFailure("anonymous RPC", () => db.query("select public.set_class_teachers($1,$2::uuid[])", [classId, []]));
  await expectFailure("anonymous login limiter", () => db.query("select public.consume_login_attempt($1,$2)", [bucket, 5]));
  await expectFailure("anonymous attempts read", () => db.query("select * from app_private.login_attempts"));
  await expectFailure("anonymous lesson read", () => db.query("select * from public.lessons"));
  await expectFailure("anonymous learning summary", () => db.query("select * from public.student_learning_summary($1,$2)", [studentId, classId]));
  await expectFailure("anonymous assignment read", () => db.query("select * from public.assignments"));
  await expectFailure("anonymous announcement read", () => db.query("select * from public.announcements"));
  await expectFailure("anonymous assignment status RPC", () => db.query(
    "select public.mark_assignment_status($1,$2,$3,'getirdi')", [teacher1, assignmentId, studentId],
  ));
  await expectFailure("anonymous legacy identity read", () => db.query("select * from app_private.legacy_identity_links"));
  await expectFailure("anonymous push subscription read", () => db.query("select * from public.push_subscriptions"));
  await expectFailure("anonymous push RPC", () => db.query("select * from public.claim_push_delivery(1)"));
  await expectFailure("anonymous aquarium score read", () => db.query("select * from public.aquarium_scores"));
  await expectFailure("anonymous aquarium award", () => db.query(
    "select * from public.award_aquarium_points($1,$2,$3,3,$4)", [teacher1, classId, studentId, rewardId]));
  await db.exec("reset role");

  console.log("Schema checks passed: accounts, learning, outbox retry/version, push eligibility, role boundaries and anonymous denial.");
} finally {
  await db.close();
}
