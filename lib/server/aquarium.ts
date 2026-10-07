import "server-only";
import type { AppUser, Db } from "./db";
import { requireClassReader } from "./phase3";
import { HttpError, throwDbError } from "./http";
import { allRows, chunks } from "./pagination";

export async function aquariumClass(db: Db, actor: AppUser, classId: string) {
  if (actor.role !== "admin") await requireClassReader(db, actor, classId);
  const result = await db.from("classes").select("name").eq("id", classId).eq("active", true).maybeSingle();
  throwDbError(result.error);
  if (!result.data) throw new HttpError(404, "Sınıf bulunamadı.");
  return result.data.name as string;
}

export async function loadAquarium(db: Db, actor: AppUser, classId: string) {
  const className = await aquariumClass(db, actor, classId);
  const enrollments = await allRows(async (from, to) => db.from("enrollments").select("student_id")
    .eq("class_id", classId).is("left_at", null).order("id").range(from, to));
  const ids = [...new Set(enrollments.map((row) => row.student_id))];
  const [studentGroups, scores, rewardsResult] = await Promise.all([
    Promise.all(chunks(ids).map((group) => allRows(async (from, to) => db.from("app_users").select("id,display_name")
      .in("id", group).eq("role", "student").eq("active", true).order("id").range(from, to)))),
    allRows(async (from, to) => db.from("aquarium_scores").select("student_id,points").eq("class_id", classId)
      .order("student_id").range(from, to)),
    db.from("aquarium_rewards").select("id,student_id,points,created_at").eq("class_id", classId)
      .order("created_at", { ascending: false }).order("id").limit(100),
  ]);
  throwDbError(rewardsResult.error);
  const points = new Map(scores.map((row) => [row.student_id, Number(row.points)]));
  const colors = ["#ff8d7e", "#72d9c3", "#ffd27b", "#9bafff", "#ff9cce", "#b9a2ff"];
  const types = ["classic", "round", "striped"];
  const students = studentGroups.flat().sort((a, b) => a.display_name.localeCompare(b.display_name, "tr")).map((student) => {
    const seed = [...student.id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);
    return { id: student.id, name: actor.role === "student" ? student.display_name.split(" ")[0] : student.display_name,
      points: points.get(student.id) ?? 0, type: types[seed % types.length], color: colors[seed % colors.length] };
  });
  const activeIds = new Set(students.map((student) => student.id));
  return { className, students, rewards: (rewardsResult.data ?? []).filter((row) => activeIds.has(row.student_id))
    .reverse().map((row) => ({ id: row.id, studentId: row.student_id, points: row.points, createdAt: row.created_at })),
    viewerStudentId: actor.role === "student" ? actor.id : null, canAward: actor.role === "teacher" };
}
