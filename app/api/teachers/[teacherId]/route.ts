import { requireActor } from "@/lib/server/auth";
import { handleError, HttpError, readJson, throwDbError, uuidField } from "@/lib/server/http";

export async function PATCH(request: Request, context: RouteContext<"/api/teachers/[teacherId]">) {
  try {
    const { db } = await requireActor(["admin"]);
    const { teacherId } = await context.params;
    uuidField(teacherId, "Öğretmen kimliği");
    const body = await readJson(request);
    if (typeof body.active !== "boolean") throw new HttpError(400, "Etkinlik durumu geçersiz.");
    const { data: teacher, error: lookupError } = await db.from("app_users")
      .select("id,active").eq("id", teacherId).eq("role", "teacher").maybeSingle();
    throwDbError(lookupError);
    if (!teacher) throw new HttpError(404, "Öğretmen bulunamadı.");
    if (teacher.active === body.active) return Response.json({ teacher: { id: teacher.id, active: teacher.active } });

    const { error } = await db.from("app_users").update({ active: body.active, updated_at: new Date().toISOString() }).eq("id", teacherId);
    throwDbError(error);
    return Response.json({ teacher: { id: teacher.id, active: body.active } });
  } catch (error) { return handleError(error); }
}
