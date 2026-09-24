import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { hash } from "argon2";

if (process.env.ALLOW_LIVE_PHASE3_TEST !== "1") {
  throw new Error("Set ALLOW_LIVE_PHASE3_TEST=1 to run the isolated live Phase 3 check.");
}
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error("Supabase configuration is missing.");
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const base = process.env.PHASE3_TEST_URL ?? "http://localhost:3000";
const suffix = randomBytes(6).toString("hex");
const teacherName = `p3teacher_${suffix}`;
const studentName = `p3student_${suffix}`;
const className = `Phase 3 test class ${suffix}`;
const curriculumTitle = `Phase 3 test curriculum ${suffix}`;
const password = randomBytes(24).toString("base64url");

async function table(name, query) {
  const result = await query(db.from(name));
  if (result.error) throw result.error;
  return result.data;
}

function expect(result, status, label) {
  if (result.status !== status) throw new Error(`${label}: expected ${status}, got ${result.status}: ${JSON.stringify(result.body)}`);
}

async function request(method, path, body, cookie) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: { Origin: base, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({})),
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
  };
}

async function login(username) {
  const result = await request("POST", "/api/auth/login", { username, password });
  expect(result, 200, `login ${username}`);
  if (!result.cookie.startsWith("robotik_session=")) throw new Error("Session cookie missing");
  return result.cookie;
}

async function ids(name) {
  const rows = await table(name, (query) => query.select("id").order("id"));
  return rows.map((row) => row.id);
}

const baseline = { users: await ids("app_users"), classes: await ids("classes") };
const admins = await table("app_users", (query) => query.select("id").eq("role", "admin").eq("active", true));
if (admins.length !== 1) throw new Error("Expected exactly one active admin to own the disposable class.");
let failed;
try {
  const passwordHash = await hash(password);
  await table("app_users", (query) => query.insert({
    role: "teacher", username: teacherName, display_name: "Phase Three Teacher", password_hash: passwordHash,
  }).select("id"));
  const teacher = (await table("app_users", (query) => query.select("id").eq("username", teacherName).single()));
  const createdClass = await db.rpc("create_class_with_teachers", {
    p_name: className, p_created_by: admins[0].id, p_teacher_ids: [teacher.id],
  });
  if (createdClass.error) throw createdClass.error;
  const classId = createdClass.data.id;
  const cookie = await login(teacherName);
  expect(await request("GET", "/panel/curricula", undefined, cookie), 200, "teacher curriculum page");
  expect(await request("GET", `/panel/classes/${classId}`, undefined, cookie), 200, "teacher learning page");
  const existingClass = baseline.classes[0];
  if (existingClass) expect(await request("GET", `/api/classes/${existingClass}/learning-plan`, undefined, cookie), 403, "class boundary");

  const curriculumResult = await request("POST", "/api/curricula", { title: curriculumTitle }, cookie);
  expect(curriculumResult, 201, "create curriculum");
  const curriculumId = curriculumResult.body.curriculum.id;
  const pdfUrl = "https://drive.google.com/file/d/phase3-test/view";
  const topicResult = await request("POST", `/api/curricula/${curriculumId}/topics`, {
    title: "Sensor basics", description: "Learn sensor inputs.", pdfUrl,
  }, cookie);
  expect(topicResult, 201, "create topic");
  const topicId = topicResult.body.topic.id;
  if (topicResult.body.topic.pdf_visible) throw new Error("New topic PDF must start hidden");
  expect(await request("PATCH", `/api/curricula/${curriculumId}/topics/${topicId}`, { pdfUrl: "http://example.com/file.pdf" }, cookie), 400, "reject non-Drive PDF URL");

  const studentResult = await request("POST", `/api/classes/${classId}/students`, {
    mode: "new", displayName: "Phase Three Student", username: studentName, password,
  }, cookie);
  expect(studentResult, 201, "create student");
  const studentId = studentResult.body.student.id;
  const studentCookie = await login(studentName);
  expect(await request("GET", `/panel/classes/${classId}`, undefined, studentCookie), 200, "student learning page");
  const weekdayName = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Europe/Istanbul" }).format(new Date());
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekdayName) + 1;
  const today = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Istanbul" }).format(new Date());
  expect(await request("PATCH", `/api/classes/${classId}/learning-plan`, {
    curriculumId, weekday, startTime: "00:00", durationMinutes: 90,
  }, cookie), 200, "set learning plan");
  const lessonResult = await request("GET", `/api/classes/${classId}/lessons`, undefined, cookie);
  expect(lessonResult, 200, "list lessons");
  if (lessonResult.body.lessons.length < 20) throw new Error("Weekly lessons were not generated");
  const todayLesson = lessonResult.body.lessons.find((lesson) => lesson.scheduled_on === today);
  if (!todayLesson) throw new Error("Today's test lesson is missing");
  const futureLesson = lessonResult.body.lessons.find((lesson) => lesson.scheduled_on > today);
  if (!futureLesson) throw new Error("Future test lesson is missing");
  await table("enrollments", (query) => query.update({ joined_at: new Date(Date.now() - 86_400_000).toISOString() })
    .eq("class_id", classId).eq("student_id", studentId).is("left_at", null));

  const learningPath = `/api/classes/${classId}/students/${studentId}/learning`;
  const hiddenMaterial = await request("GET", learningPath, undefined, studentCookie);
  expect(hiddenMaterial, 200, "student learning view");
  if (hiddenMaterial.body.topics[0].pdf_url !== null || hiddenMaterial.body.topics[0].description !== "Learn sensor inputs.") {
    throw new Error("Student must see description but not hidden PDF URL");
  }
  expect(await request("PATCH", `/api/curricula/${curriculumId}/topics/${topicId}`, { pdfVisible: true }, studentCookie), 403, "student PDF visibility boundary");
  expect(await request("PATCH", `/api/curricula/${curriculumId}/topics/${topicId}`, { pdfVisible: true }, cookie), 200, "open PDF");
  const visibleMaterial = await request("GET", learningPath, undefined, studentCookie);
  if (visibleMaterial.body.topics[0].pdf_url !== pdfUrl) throw new Error("Opened PDF must be visible to student");
  expect(await request("PATCH", `/api/curricula/${curriculumId}/topics/${topicId}`, { pdfVisible: false }, cookie), 200, "close PDF");
  const closedMaterial = await request("GET", learningPath, undefined, studentCookie);
  if (closedMaterial.body.topics[0].pdf_url !== null) throw new Error("Closed PDF URL must be removed from student response");
  expect(await request("POST", `/api/classes/${classId}/students/${studentId}/topics/${topicId}`, { complete: true }, studentCookie), 403, "student write boundary");
  expect(await request("POST", `/api/classes/${classId}/students/${studentId}/topics/${topicId}`, { complete: true }, cookie), 200, "complete topic");
  expect(await request("POST", `/api/classes/${classId}/lessons/${todayLesson.id}/attendance`, { studentId, status: "var" }, cookie), 200, "mark attendance");
  expect(await request("POST", `/api/classes/${classId}/lessons/${todayLesson.id}/attendance`, { finalize: true }, cookie), 200, "finalize attendance");
  const learning = await request("GET", learningPath, undefined, studentCookie);
  expect(learning, 200, "student summary");
  const summary = learning.body.summary;
  if (Number(summary.total_topics) !== 1 || Number(summary.completed_topics) !== 1
    || Number(summary.completed_lessons) !== 1 || Number(summary.present_lessons) !== 1) {
    throw new Error(`Incorrect learning summary: ${JSON.stringify(summary)}`);
  }
  expect(await request("PATCH", `/api/classes/${classId}/lessons/${futureLesson.id}`, {
    cancelled: true, actualAt: null,
  }, cookie), 200, "cancel one lesson");
  expect(await request("GET", "/api/curricula", undefined, studentCookie), 403, "student curriculum boundary");
  console.log("Live Phase 3 checks passed: curriculum, weekly schedule, topic completion, attendance, summary, exception and role boundaries.");
} catch (error) {
  failed = error;
} finally {
  try {
    const classRows = await table("classes", (query) => query.select("id").eq("name", className));
    const curriculumRows = await table("curricula", (query) => query.select("id").eq("title", curriculumTitle));
    const classIds = classRows.map((row) => row.id);
    const curriculumIds = curriculumRows.map((row) => row.id);
    if (classIds.length) {
      const lessonRows = await table("lessons", (query) => query.select("id").in("class_id", classIds));
      const lessonIds = lessonRows.map((row) => row.id);
      if (lessonIds.length) await table("attendance", (query) => query.delete().in("lesson_id", lessonIds));
      await table("topic_completions", (query) => query.delete().in("class_id", classIds));
      await table("lessons", (query) => query.delete().in("class_id", classIds));
      await table("enrollments", (query) => query.delete().in("class_id", classIds));
      await table("class_teachers", (query) => query.delete().in("class_id", classIds));
      await table("classes", (query) => query.delete().in("id", classIds));
    }
    if (curriculumIds.length) {
      await table("topics", (query) => query.delete().in("curriculum_id", curriculumIds));
      await table("curricula", (query) => query.delete().in("id", curriculumIds));
    }
    await table("app_users", (query) => query.delete().in("username", [studentName, teacherName]));
    const after = { users: await ids("app_users"), classes: await ids("classes") };
    if (JSON.stringify(after) !== JSON.stringify(baseline)) throw new Error("Live test cleanup changed baseline accounts or classes.");
  } catch (error) {
    failed = new Error(`Cleanup failed: ${error.message}`, { cause: failed ?? error });
  }
}
if (failed) throw failed;
