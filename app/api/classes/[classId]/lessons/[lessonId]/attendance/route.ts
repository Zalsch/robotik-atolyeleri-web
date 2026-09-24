import { requireActor } from "@/lib/server/auth";
import { handleError, HttpError, readJson, throwDbError, uuidField } from "@/lib/server/http";
import { requireClassLesson } from "@/lib/server/phase3";
import { processAttendanceOutbox } from "@/lib/server/sheets";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function queueSheetsDelivery() {
  after(async () => {
    try { await processAttendanceOutbox(); }
    catch (error) {
      console.error("Attendance was saved but Sheets delivery is pending", error instanceof Error ? error.message : "unknown error");
    }
  });
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
      queueSheetsDelivery();
      return Response.json({ finalized: true, sheets: { queued: true } });
    }
    const studentId = uuidField(body.studentId, "Öğrenci kimliği");
    if (body.status !== "var" && body.status !== "yok") throw new HttpError(400, "Yoklama durumu geçersiz.");
    const { error } = await db.rpc("record_attendance", {
      p_teacher_id: actor.id, p_lesson_id: lessonId, p_student_id: studentId, p_status: body.status,
    });
    throwDbError(error);
    queueSheetsDelivery();
    return Response.json({ updated: true, sheets: { queued: true } });
  } catch (error) { return handleError(error); }
}
