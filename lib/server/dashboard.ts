import "server-only";
import type { AppUser, Db } from "./db";
import { allRows, chunks } from "./pagination";
import { throwDbError } from "./http";

type Summary = { total_topics: number; completed_topics: number; completed_lessons: number; present_lessons: number };
export type DashboardClass = { id: string; name: string; weekday: number | null; start_time: string | null; studentCount: number; summary?: Summary };
type Lesson = { id: string; class_id: string; scheduled_at: string; actual_at: string | null; duration_minutes: number };
type Announcement = { id: string; class_id: string; title: string; body: string; created_at: string };
type Assignment = { id: string; class_id: string; title: string; due_at: string };
export type DashboardData = {
  classes: DashboardClass[]; teachers: number; students: number; completedLessons: number;
  assignmentCount: number; broughtAssignments: number; pendingAssignments: Assignment[];
  upcoming: Lesson[]; announcements: Announcement[]; summary: Summary;
};

async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const result = await query;
  throwDbError(result.error);
  return result.count ?? 0;
}

// Resolve membership before querying any class data; students only receive their own summaries.
export async function loadDashboard(db: Db, actor: AppUser): Promise<DashboardData> {
  let permittedIds: string[] | null = null;
  if (actor.role === "teacher") {
    const rows = await allRows(async (from, to) => db.from("class_teachers").select("class_id")
      .eq("teacher_id", actor.id).order("class_id").range(from, to));
    permittedIds = rows.map((row) => row.class_id);
  } else if (actor.role === "student") {
    const rows = await allRows(async (from, to) => db.from("enrollments").select("class_id")
      .eq("student_id", actor.id).is("left_at", null).order("class_id").range(from, to));
    permittedIds = [...new Set(rows.map((row) => row.class_id))];
  }
  const groups = permittedIds === null ? [null] : chunks(permittedIds);
  const schoolClasses = (await Promise.all(groups.map((ids) => allRows(async (from, to) => {
    let query = db.from("classes").select("id,name,weekday,start_time").eq("active", true);
    if (ids) query = query.in("id", ids);
    return query.order("name").order("id").range(from, to);
  })))).flat().sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const classGroups = chunks(schoolClasses.map((row) => row.id));
  const now = new Date().toISOString();
  const [members, upcomingGroups, completedCounts, announcementsGroups, assignmentGroups, teachers, adminStudents, summaries] = await Promise.all([
    actor.role !== "student" ? Promise.all(classGroups.map((ids) => allRows(async (from, to) => db.from("enrollments")
      .select("class_id,student_id").in("class_id", ids).is("left_at", null).order("id").range(from, to)))) : Promise.resolve([]),
    Promise.all(classGroups.map((ids) => allRows(async (from, to) => db.from("lessons")
      .select("id,class_id,scheduled_at,actual_at,duration_minutes").in("class_id", ids).eq("status", "planned")
      .or(`and(actual_at.is.null,scheduled_at.gte.${now}),actual_at.gte.${now}`).order("id").range(from, to)))),
    actor.role !== "student" ? Promise.all(classGroups.map((ids) => count(db.from("lessons")
      .select("id", { count: "exact", head: true }).in("class_id", ids).eq("status", "planned").not("attendance_completed_at", "is", null)))) : Promise.resolve([]),
    actor.role !== "admin" ? Promise.all(classGroups.map(async (ids) => {
      const result = await db.from("announcements").select("id,class_id,title,body,created_at")
        .in("class_id", ids).order("created_at", { ascending: false }).order("id").limit(6);
      throwDbError(result.error); return result.data ?? [];
    })) : Promise.resolve([]),
    Promise.all(classGroups.map((ids) => allRows(async (from, to) => db.from("assignments")
      .select("id,class_id,title,due_at").in("class_id", ids).eq("active", true).order("id").range(from, to)))),
    actor.role === "admin" ? count(db.from("app_users").select("id", { count: "exact", head: true }).eq("role", "teacher").eq("active", true)) : Promise.resolve(0),
    actor.role === "admin" ? count(db.from("app_users").select("id", { count: "exact", head: true }).eq("role", "student").eq("active", true)) : Promise.resolve(0),
    actor.role === "student" ? Promise.all(schoolClasses.map(async (schoolClass) => {
      const result = await db.rpc("student_learning_summary", { p_student_id: actor.id, p_class_id: schoolClass.id });
      throwDbError(result.error);
      const row = result.data?.[0];
      return { total_topics: Number(row?.total_topics ?? 0), completed_topics: Number(row?.completed_topics ?? 0),
        completed_lessons: Number(row?.completed_lessons ?? 0), present_lessons: Number(row?.present_lessons ?? 0) };
    })) : Promise.resolve([]),
  ]);
  const memberships = members.flat();
  const studentIds = [...new Set(memberships.map((row) => row.student_id))];
  const assignments = assignmentGroups.flat();
  const [activeStudentGroups, statusGroups] = await Promise.all([
    actor.role === "teacher" ? Promise.all(chunks(studentIds).map((ids) => allRows(async (from, to) => db.from("app_users")
      .select("id").in("id", ids).eq("role", "student").eq("active", true).order("id").range(from, to)))) : Promise.resolve([]),
    actor.role === "student" ? Promise.all(chunks(assignments.map((row) => row.id)).map((ids) => allRows(async (from, to) => db.from("assignment_statuses")
      .select("assignment_id,status").eq("student_id", actor.id).in("assignment_id", ids).order("assignment_id").range(from, to)))) : Promise.resolve([]),
  ]);
  const activeIds = new Set(activeStudentGroups.flat().map((row) => row.id));
  const broughtIds = new Set(statusGroups.flat().filter((row) => row.status === "getirdi").map((row) => row.assignment_id));
  const summary = summaries.reduce((total, row) => ({
    total_topics: total.total_topics + row.total_topics, completed_topics: total.completed_topics + row.completed_topics,
    completed_lessons: total.completed_lessons + row.completed_lessons, present_lessons: total.present_lessons + row.present_lessons,
  }), { total_topics: 0, completed_topics: 0, completed_lessons: 0, present_lessons: 0 });
  return {
    classes: schoolClasses.map((row, index) => ({ ...row,
      studentCount: new Set(memberships.filter((member) => member.class_id === row.id && (actor.role !== "teacher" || activeIds.has(member.student_id))).map((member) => member.student_id)).size,
      ...(actor.role === "student" ? { summary: summaries[index] } : {}),
    })),
    teachers, students: actor.role === "admin" ? adminStudents : activeIds.size,
    completedLessons: actor.role === "student" ? summary.completed_lessons : completedCounts.reduce((sum, value) => sum + value, 0),
    assignmentCount: assignments.length, broughtAssignments: broughtIds.size,
    pendingAssignments: actor.role === "student" ? assignments.filter((row) => !broughtIds.has(row.id)).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at)) : [],
    upcoming: upcomingGroups.flat().sort((a, b) => Date.parse(a.actual_at ?? a.scheduled_at) - Date.parse(b.actual_at ?? b.scheduled_at)).slice(0, 4),
    announcements: announcementsGroups.flat().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 6), summary,
  };
}
