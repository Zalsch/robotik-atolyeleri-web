import { requireActor, requireAssignedTeacher } from "@/lib/server/auth";
import { handleError, readJson, textField, throwDbError, uuidField } from "@/lib/server/http";
import { allRows } from "@/lib/server/pagination";
import { requireClassReader } from "@/lib/server/phase3";
import { processPushOutbox } from "@/lib/server/push";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_request: Request, context: RouteContext<"/api/classes/[classId]/announcements">) {
  try {
    const { actor, db } = await requireActor(["teacher", "student"]);
    const { classId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    await requireClassReader(db, actor, classId);
    const announcements = await allRows(async (from, to) => db.from("announcements")
      .select("id,class_id,title,body,created_at")
      .eq("class_id", classId).order("created_at", { ascending: false })
      .order("id", { ascending: false }).range(from, to));
    return Response.json({ announcements });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request, context: RouteContext<"/api/classes/[classId]/announcements">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    await requireAssignedTeacher(db, actor.id, classId);
    const body = await readJson(request);
    const title = textField(body, "title");
    const announcementBody = textField(body, "body", 4000);
    const { data, error } = await db.from("announcements")
      .insert({ class_id: classId, title, body: announcementBody, created_by: actor.id })
      .select("id,class_id,title,body,created_at").single();
    throwDbError(error);
    after(async () => {
      try { await processPushOutbox(); }
      catch (cause) {
        console.error("Announcement was saved but push delivery is pending", cause instanceof Error ? cause.message : "unknown error");
      }
    });
    return Response.json({ announcement: data, delivery: { queued: true } }, { status: 201 });
  } catch (error) { return handleError(error); }
}
