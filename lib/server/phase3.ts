import "server-only";
import { requireAssignedTeacher } from "./auth";
import type { AppUser, Db } from "./db";
import { HttpError, throwDbError } from "./http";
import { allRows, chunks } from "./pagination";

export async function requireClassReader(db: Db, actor: AppUser, classId: string) {
  if (actor.role === "teacher") return requireAssignedTeacher(db, actor.id, classId);
  if (actor.role !== "student") throw new HttpError(403, "Bu sınıfa erişim yetkiniz yok.");
  const { data: membership, error } = await db.from("enrollments")
    .select("id").eq("class_id", classId).eq("student_id", actor.id).is("left_at", null).limit(1);
  throwDbError(error);
  if (!membership?.length) throw new HttpError(403, "Bu sınıfa erişim yetkiniz yok.");
  const { data: schoolClass, error: classError } = await db.from("classes")
    .select("active").eq("id", classId).maybeSingle();
  throwDbError(classError);
  if (!schoolClass?.active) throw new HttpError(404, "Sınıf bulunamadı.");
}

export async function requireClassLesson(db: Db, teacherId: string, classId: string, lessonId: string) {
  await requireAssignedTeacher(db, teacherId, classId);
  const { data: lesson, error } = await db.from("lessons")
    .select("id,class_id,scheduled_on,scheduled_at,actual_at,duration_minutes,status,attendance_completed_at")
    .eq("id", lessonId).eq("class_id", classId).maybeSingle();
  throwDbError(error);
  if (!lesson) throw new HttpError(404, "Ders bulunamadı.");
  return lesson;
}

export async function lessonRoster(db: Db, classId: string, lessonId: string, startsAt: string) {
  const memberships = await allRows(async (from, to) => db.from("enrollments")
    .select("id,student_id,joined_at,left_at").eq("class_id", classId)
    .order("id").range(from, to));
  const start = Date.parse(startsAt);
  const studentIds = [...new Set(memberships
    .filter((row) => Date.parse(row.joined_at) <= start && (!row.left_at || Date.parse(row.left_at) > start))
    .map((row) => row.student_id))];
  if (studentIds.length === 0) return [];
  const [studentGroups, attendance] = await Promise.all([
    Promise.all(chunks(studentIds).map(async (ids) => {
      const { data, error } = await db.from("app_users")
        .select("id,username,display_name").in("id", ids).eq("role", "student");
      throwDbError(error);
      return data ?? [];
    })),
    allRows(async (from, to) => db.from("attendance")
      .select("student_id,status").eq("lesson_id", lessonId).order("student_id").range(from, to)),
  ]);
  return studentGroups.flat().map((student) => ({
    ...student,
    status: attendance.find((item) => item.student_id === student.id)?.status ?? null,
  })).sort((a, b) => a.display_name.localeCompare(b.display_name, "tr"));
}
