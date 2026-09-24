import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { hash } from "argon2";

if (process.env.ALLOW_LIVE_AUTH_TEST !== "1") {
  throw new Error("Set ALLOW_LIVE_AUTH_TEST=1 to run the disposable live auth check.");
}
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error("Supabase configuration is missing.");
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const base = process.env.AUTH_TEST_URL ?? "http://localhost:3000";
const suffix = randomBytes(5).toString("hex");
const names = {
  admin: `test_admin_${suffix}`,
  teacher: `test_teacher_${suffix}`,
  student: `test_student_${suffix}`,
  unknown: `test_unknown_${suffix}`,
};
const password = randomBytes(24).toString("base64url");
const changedPassword = randomBytes(24).toString("base64url");
let adminId;

function expectStatus(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${result.status}: ${JSON.stringify(result.body)}`);
  }
}

async function request(method, path, body, cookie) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      Origin: base,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const data = await response.json().catch(() => ({}));
  const setCookie = response.headers.get("set-cookie") ?? "";
  return { status: response.status, body: data, cookie: setCookie.split(";")[0] };
}

async function login(username, loginPassword, expected = 200) {
  const result = await request("POST", "/api/auth/login", { username, password: loginPassword });
  expectStatus(result, expected, `login ${username}`);
  if (expected === 200 && !result.cookie.startsWith("robotik_session=")) {
    throw new Error("Login did not set the session cookie.");
  }
  return result.cookie;
}

async function cleanup() {
  if (!adminId) return;
  const { data: classes, error: classLookupError } = await db.from("classes")
    .select("id").eq("created_by", adminId);
  if (classLookupError) throw classLookupError;
  const classIds = (classes ?? []).map((item) => item.id);
  for (const table of ["enrollments", "class_teachers", "classes"]) {
    if (classIds.length === 0) break;
    const { error } = await db.from(table).delete().in(table === "classes" ? "id" : "class_id", classIds);
    if (error) throw error;
  }
  const { error: userError } = await db.from("app_users").delete()
    .in("username", [names.student, names.teacher, names.admin]);
  if (userError) throw userError;
}

const { count, error: countError } = await db.from("app_users")
  .select("id", { count: "exact", head: true });
if (countError) throw countError;
if (count !== 0) throw new Error("Live auth check only runs when the application has no users.");

let failed;
try {
  const { data: admin, error: adminError } = await db.from("app_users")
    .insert({ role: "admin", username: names.admin, display_name: "Disposable Admin", password_hash: await hash(password) })
    .select("id").single();
  if (adminError) throw adminError;
  adminId = admin.id;

  expectStatus(await request("GET", "/api/me"), 401, "anonymous access");
  await login(names.admin, changedPassword, 401);
  const adminCookie = await login(names.admin, password);
  expectStatus(await request("GET", "/api/me", undefined, adminCookie), 200, "admin session");

  const teacherResult = await request("POST", "/api/teachers", {
    displayName: "Disposable Teacher", username: names.teacher, password,
  }, adminCookie);
  expectStatus(teacherResult, 201, "create teacher");
  const teacherId = teacherResult.body.teacher.id;

  const classResult = await request("POST", "/api/classes", {
    name: "Disposable Class", teacherIds: [teacherId],
  }, adminCookie);
  expectStatus(classResult, 201, "create class");
  const classId = classResult.body.class.id;
  const otherClassResult = await request("POST", "/api/classes", {
    name: "Other Disposable Class", teacherIds: [],
  }, adminCookie);
  expectStatus(otherClassResult, 201, "create other class");
  const otherClassId = otherClassResult.body.class.id;

  const teacherCookie = await login(names.teacher, password);
  expectStatus(await request("GET", `/api/classes/${otherClassId}/students`, undefined, teacherCookie), 403, "teacher class boundary");
  expectStatus(await request("POST", `/api/classes/${classId}/students`, {
    mode: "new", displayName: "Disposable Student", username: names.student, password,
  }, adminCookie), 403, "admin student boundary");

  const studentResult = await request("POST", `/api/classes/${classId}/students`, {
    mode: "new", displayName: "Disposable Student", username: names.student, password,
  }, teacherCookie);
  expectStatus(studentResult, 201, "create student");
  const studentId = studentResult.body.student.id;
  const studentCookie = await login(names.student, password);
  expectStatus(await request("GET", "/api/classes", undefined, studentCookie), 200, "student classes");
  expectStatus(await request("GET", "/api/teachers", undefined, studentCookie), 403, "student role boundary");

  expectStatus(await request("POST", `/api/users/${studentId}/password`, {
    password: changedPassword,
  }, teacherCookie), 200, "reset student password");
  expectStatus(await request("GET", "/api/me", undefined, studentCookie), 401, "old session after password reset");
  await login(names.student, password, 401);
  const renewedStudentCookie = await login(names.student, changedPassword);

  expectStatus(await request("PATCH", `/api/teachers/${teacherId}`, { active: false }, adminCookie), 200, "disable teacher");
  expectStatus(await request("GET", "/api/me", undefined, teacherCookie), 401, "old session after deactivation");
  await login(names.teacher, password, 401);
  expectStatus(await request("PATCH", `/api/teachers/${teacherId}`, { active: true }, adminCookie), 200, "enable teacher");
  const reenabledTeacherCookie = await login(names.teacher, password);

  expectStatus(await request("DELETE", `/api/classes/${classId}/students/${studentId}`, undefined, reenabledTeacherCookie), 200, "remove student");
  expectStatus(await request("GET", "/api/me", undefined, renewedStudentCookie), 401, "student session after removal");
  await login(names.student, changedPassword, 401);
  expectStatus(await request("POST", `/api/classes/${classId}/students`, {
    mode: "existing", username: names.student,
  }, reenabledTeacherCookie), 200, "reenroll student");
  await login(names.student, changedPassword);

  for (let attempt = 1; attempt <= 6; attempt++) {
    await login(names.unknown, password, attempt <= 5 ? 401 : 429);
  }
  console.log("Live auth checks passed: credentials, roles, class boundary, password reset, deactivation, reenrollment, rate limit.");
} catch (error) {
  failed = error;
} finally {
  try { await cleanup(); } catch (error) { failed = new Error(`Cleanup failed: ${error.message}`, { cause: failed ?? error }); }
}
if (failed) throw failed;
