import { requireActor } from "@/lib/server/auth";
import { handleError, HttpError, readJson, throwDbError, uuidField } from "@/lib/server/http";
import { requireClassLesson } from "@/lib/server/phase3";
import { processAttendanceOutbox } from "@/lib/server/sheets";

export const runtime = "nodejs";

async function trySheetsDelivery() {
  try { return await processAttendanceOutbox(); }
  catch (error) {
    console.error("Attendance was saved but Sheets delivery is pending", error instanceof Error ? error.message : "unknown error");
    return { configured: true, processed: 0, failed: 1, busy: false };
  }
}

export async function POST(request: Request, context: RouteContext<"/api/classes/[classId]/lessons/[lessonId]/attendance">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId, lessonId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    uuidField(lessonId, "Ders kimliği");
    await requireClassLesson(db, actor.id, classId, lessonId);
    const body = await readJson(request);
    if (body.finalize === true) {
      const { error } = await db.rpc("finalize_lesson_attendance", {
        p_teacher_id: actor.id, p_lesson_id: lessonId,
      });
      throwDbError(error);
      return Response.json({ finalized: true, sheets: await trySheetsDelivery() });
    }
    const studentId = uuidField(body.studentId, "Öğrenci kimliği");
    if (body.status !== "var" && body.status !== "yok") throw new HttpError(400, "Yoklama durumu geçersiz.");
    const { error } = await db.rpc("record_attendance", {
      p_teacher_id: actor.id, p_lesson_id: lessonId, p_student_id: studentId, p_status: body.status,
    });
    throwDbError(error);
    return Response.json({ updated: true, sheets: await trySheetsDelivery() });
  } catch (error) { return handleError(error); }
}
