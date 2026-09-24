import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { hash } from "argon2";

if (process.env.ALLOW_LIVE_PHASE4_TEST !== "1") {
  throw new Error("Set ALLOW_LIVE_PHASE4_TEST=1 to run the isolated live Phase 4 check.");
}
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error("Supabase configuration is missing.");
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const base = process.env.PHASE4_TEST_URL ?? "http://localhost:3000";
const suffix = randomBytes(6).toString("hex");
const teacherName = `p4teacher_${suffix}`;
const studentName = `p4student_${suffix}`;
const className = `Phase 4 test class ${suffix}`;
const password = randomBytes(24).toString("base64url");

async function table(name, query) {
  const result = await query(db.from(name));
  if (result.error) throw result.error;
  return result.data;
}
async function ids(name) {
  const rows = await table(name, (query) => query.select("id").order("id"));
  return rows.map((row) => row.id);
}
function expect(result, status, label) {
  if (result.status !== status) throw new Error(`${label}: expected ${status}, got ${result.status}: ${JSON.stringify(result.body)}`);
}
async function request(method, path, body, cookie) {
  const response = await fetch(new URL(path, base), {
    method, redirect: "manual",
    headers: { Origin: base, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})),
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" };
}
async function login(username) {
  const result = await request("POST", "/api/auth/login", { username, password });
  expect(result, 200, `login ${username}`);
  if (!result.cookie.startsWith("robotik_session=")) throw new Error("Session cookie missing");
  return result.cookie;
}

const baseline = { users: await ids("app_users"), classes: await ids("classes") };
const admins = await table("app_users", (query) => query.select("id").eq("role", "admin").eq("active", true));
if (admins.length !== 1) throw new Error("Expected exactly one active admin for disposable class.");
let failed;
try {
  const passwordHash = await hash(password);
  await table("app_users", (query) => query.insert({
    role: "teacher", username: teacherName, display_name: "Phase Four Teacher", password_hash: passwordHash,
  }));
  const teacher = await table("app_users", (query) => query.select("id").eq("username", teacherName).single());
  const createdClass = await db.rpc("create_class_with_teachers", {
    p_name: className, p_created_by: admins[0].id, p_teacher_ids: [teacher.id],
  });
  if (createdClass.error) throw createdClass.error;
  const classId = createdClass.data.id;
  const teacherCookie = await login(teacherName);
  const studentResult = await request("POST", `/api/classes/${classId}/students`, {
    mode: "new", displayName: "Phase Four Student", username: studentName, password,
  }, teacherCookie);
  expect(studentResult, 201, "create student");
  const studentId = studentResult.body.student.id;
  const studentCookie = await login(studentName);
  expect(await request("GET", `/panel/classes/${classId}`, undefined, studentCookie), 200, "student class page");
  const existingClass = baseline.classes[0];
  if (existingClass) expect(await request("GET", `/api/classes/${existingClass}/assignments`, undefined, teacherCookie), 403, "teacher class boundary");
  const assignmentPath = `/api/classes/${classId}/assignments`;
  const dueAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const invalid = await request("POST", assignmentPath, { title: "Devre ödevi", description: "PDF", driveUrl: "https://example.com/file.pdf", dueAt }, teacherCookie);
  expect(invalid, 400, "external URL rejection");
  expect(await request("POST", assignmentPath, { title: "Devre ödevi", description: "PDF", driveUrl: "https://drive.google.com/file/d/test/view", dueAt }, studentCookie), 403, "student assignment write boundary");
  const created = await request("POST", assignmentPath, { title: "Devre ödevi", description: "Çıktı getirin.", driveUrl: "https://drive.google.com/file/d/test/view", dueAt }, teacherCookie);
  expect(created, 201, "create assignment");
  const assignmentId = created.body.assignment.id;
  const studentAssignments = await request("GET", assignmentPath, undefined, studentCookie);
  expect(studentAssignments, 200, "student assignments");
  if (studentAssignments.body.assignments.length !== 1 || studentAssignments.body.assignments[0].status !== null) {
    throw new Error("Student assignment list or initial status is incorrect");
  }
  const statusPath = `${assignmentPath}/${assignmentId}/status`;
  expect(await request("POST", statusPath, { studentId, status: "getirdi" }, studentCookie), 403, "student status write boundary");
  expect(await request("POST", statusPath, { studentId, status: "bitti" }, teacherCookie), 400, "invalid status rejection");
  expect(await request("POST", statusPath, { studentId, status: "getirmedi" }, teacherCookie), 200, "mark not brought");
  expect(await request("POST", statusPath, { studentId, status: "getirdi" }, teacherCookie), 200, "mark brought");
  const updatedAssignments = await request("GET", assignmentPath, undefined, studentCookie);
  if (updatedAssignments.body.assignments[0].status !== "getirdi") throw new Error("Student does not see updated physical status");
  const detailPath = `${assignmentPath}/${assignmentId}`;
  const detail = await request("GET", detailPath, undefined, teacherCookie);
  expect(detail, 200, "teacher assignment detail");
  if (detail.body.students.length !== 1 || detail.body.students[0].status !== "getirdi") throw new Error("Teacher roster status is incorrect");
  expect(await request("GET", detailPath, undefined, studentCookie), 403, "student roster boundary");
  expect(await request("PATCH", detailPath, { title: "Güncel devre ödevi", description: "PDF yazdırın.", driveUrl: "https://drive.google.com/file/d/test/view", dueAt }, teacherCookie), 200, "edit assignment");
  const announcementPath = `/api/classes/${classId}/announcements`;
  expect(await request("POST", announcementPath, { title: "Ders duyurusu", body: "Gelecek hafta devre kurulacak." }, studentCookie), 403, "student announcement write boundary");
  expect(await request("POST", announcementPath, { title: "Ders duyurusu", body: "Gelecek hafta devre kurulacak." }, teacherCookie), 201, "create announcement");
  const studentAnnouncements = await request("GET", announcementPath, undefined, studentCookie);
  expect(studentAnnouncements, 200, "student announcements");
  if (studentAnnouncements.body.announcements.length !== 1) throw new Error("Student cannot see announcement");
  console.log("Live Phase 4 checks passed: Drive assignment, editing, physical delivery, announcements and role boundaries.");
} catch (error) {
  failed = error;
} finally {
  try {
    const classRows = await table("classes", (query) => query.select("id").eq("name", className));
    const classIds = classRows.map((row) => row.id);
    if (classIds.length) {
      const assignmentRows = await table("assignments", (query) => query.select("id").in("class_id", classIds));
      const assignmentIds = assignmentRows.map((row) => row.id);
      if (assignmentIds.length) await table("assignment_statuses", (query) => query.delete().in("assignment_id", assignmentIds));
      await table("assignments", (query) => query.delete().in("class_id", classIds));
      await table("announcements", (query) => query.delete().in("class_id", classIds));
      await table("enrollments", (query) => query.delete().in("class_id", classIds));
      await table("class_teachers", (query) => query.delete().in("class_id", classIds));
      await table("classes", (query) => query.delete().in("id", classIds));
    }
    await table("app_users", (query) => query.delete().in("username", [studentName, teacherName]));
    const after = { users: await ids("app_users"), classes: await ids("classes") };
    if (JSON.stringify(after) !== JSON.stringify(baseline)) throw new Error("Live test cleanup changed baseline accounts or classes.");
  } catch (error) {
    failed = new Error(`Cleanup failed: ${error.message}`, { cause: failed ?? error });
  }
}
if (failed) throw failed;
