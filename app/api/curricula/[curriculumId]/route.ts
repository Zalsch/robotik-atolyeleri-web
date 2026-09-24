import { requireActor } from "@/lib/server/auth";
import { handleError, HttpError, readJson, textField, throwDbError, uuidField } from "@/lib/server/http";

export async function PATCH(request: Request, context: RouteContext<"/api/curricula/[curriculumId]">) {
  try {
    const { db } = await requireActor(["teacher"]);
    const { curriculumId } = await context.params;
    uuidField(curriculumId, "Müfredat kimliği");
    const body = await readJson(request);
    const title = textField(body, "title");
    const { data, error } = await db.from("curricula")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", curriculumId).eq("active", true).select("id,title").maybeSingle();
    throwDbError(error);
    if (!data) throw new HttpError(404, "Müfredat bulunamadı.");
    return Response.json({ curriculum: data });
  } catch (error) { return handleError(error); }
}
