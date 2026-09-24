import { requireActor } from "@/lib/server/auth";
import { handleError, HttpError, throwDbError, uuidField } from "@/lib/server/http";
import { requireClassReader } from "@/lib/server/phase3";
import { allRows, chunks } from "@/lib/server/pagination";

export async function GET(_request: Request, context: RouteContext<"/api/classes/[classId]/students/[studentId]/learning">) {
  try {
    const { actor, db } = await requireActor(["teacher", "student"]);
    const { classId, studentId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    uuidField(studentId, "Öğrenci kimliği");
    if (actor.role === "student" && actor.id !== studentId) throw new HttpError(403, "Bu öğrenciye erişim yetkiniz yok.");
    await requireClassReader(db, actor, classId);
    const membership = await allRows(async (from, to) => db.from("enrollments")
      .select("id,joined_at,left_at").eq("class_id", classId).eq("student_id", studentId)
      .order("joined_at").order("id").range(from, to));
    if (!membership.some((row) => row.left_at === null)) throw new HttpError(403, "Bu öğrenciye erişim yetkiniz yok.");
    const { data: schoolClass, error: classError } = await db.from("classes")
      .select("id,name,curriculum_id,weekday,start_time,duration_minutes")
      .eq("id", classId).single();
    throwDbError(classError);
    if (!schoolClass) throw new HttpError(404, "Sınıf bulunamadı.");
    const [summaryResult, curriculumResult, ensureResult] = await Promise.all([
      db.rpc("student_learning_summary", { p_student_id: studentId, p_class_id: classId }),
      schoolClass.curriculum_id
        ? db.from("curricula").select("id,title").eq("id", schoolClass.curriculum_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db.rpc("ensure_class_lessons", {
        p_class_id: classId,
        p_through: new Date(Date.now() + 182 * 86_400_000).toISOString().slice(0, 10),
      }),
    ]);
    throwDbError(summaryResult.error);
    throwDbError(curriculumResult.error);
    throwDbError(ensureResult.error);
    const topics = schoolClass.curriculum_id
      ? await allRows(async (from, to) => db.from("topics").select("id,title,description,pdf_url,pdf_visible,position")
        .eq("curriculum_id", schoolClass.curriculum_id!).eq("active", true)
        .order("position").range(from, to))
      : [];
    const topicIds = topics.map((topic) => topic.id);
    const completionGroups = await Promise.all(chunks(topicIds).map(async (ids) => {
      const { data, error } = await db.from("topic_completions").select("topic_id,completed_at")
        .eq("student_id", studentId).in("topic_id", ids);
      throwDbError(error);
      return data ?? [];
    }));
    const completions = completionGroups.flat();
    const lessons = await allRows(async (from, to) => db.from("lessons")
      .select("id,scheduled_on,scheduled_at,actual_at,duration_minutes,status,attendance_completed_at")
      .eq("class_id", classId).order("scheduled_at").range(from, to));
    const visibleLessons = lessons.filter((lesson) => {
      const startsAt = Date.parse(lesson.actual_at ?? lesson.scheduled_at);
      return membership.some((row) => Date.parse(row.joined_at) <= startsAt
        && (!row.left_at || Date.parse(row.left_at) > startsAt));
    });
    const lessonIds = visibleLessons.map((lesson) => lesson.id);
    const attendanceGroups = await Promise.all(chunks(lessonIds).map(async (ids) => {
      const { data, error } = await db.from("attendance").select("lesson_id,status")
        .eq("student_id", studentId).in("lesson_id", ids);
      throwDbError(error);
      return data ?? [];
    }));
    const attendance = attendanceGroups.flat();
    return Response.json({
      class: schoolClass,
      curriculum: curriculumResult.data,
      topics: topics.map((topic) => ({
        ...topic,
        pdf_url: actor.role === "teacher" || topic.pdf_visible ? topic.pdf_url : null,
        completedAt: completions.find((item) => item.topic_id === topic.id)?.completed_at ?? null,
      })),
      summary: summaryResult.data?.[0] ?? { total_topics: 0, completed_topics: 0, completed_lessons: 0, present_lessons: 0 },
      lessons: visibleLessons.map((lesson) => ({
        ...lesson, attendance: attendance.find((item) => item.lesson_id === lesson.id)?.status ?? null,
      })),
    });
  } catch (error) { return handleError(error); }
}
