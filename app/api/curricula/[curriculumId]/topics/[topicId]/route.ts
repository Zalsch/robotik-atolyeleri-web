import { requireActor } from "@/lib/server/auth";
import { handleError, HttpError, readJson, textField, throwDbError, uuidField } from "@/lib/server/http";
import { topicDescriptionField, topicPdfUrlField } from "@/lib/server/topic-materials";

export async function PATCH(request: Request, context: RouteContext<"/api/curricula/[curriculumId]/topics/[topicId]">) {
  try {
    const { db } = await requireActor(["teacher"]);
    const { curriculumId, topicId } = await context.params;
    uuidField(curriculumId, "Müfredat kimliği");
    uuidField(topicId, "Konu kimliği");
    const body = await readJson(request);
    const changes: Record<string, unknown> = {};
    if (body.title !== undefined) changes.title = textField(body, "title");
    if (body.description !== undefined) changes.description = topicDescriptionField(body.description);
    if (body.pdfUrl !== undefined) {
      changes.pdf_url = topicPdfUrlField(body.pdfUrl);
      if (changes.pdf_url === null) changes.pdf_visible = false;
    }
    if (body.pdfVisible !== undefined) {
      if (typeof body.pdfVisible !== "boolean") throw new HttpError(400, "PDF görünürlüğü geçersiz.");
      changes.pdf_visible = body.pdfVisible;
    }
    if (Object.keys(changes).length === 0) throw new HttpError(400, "Güncellenecek alan bulunamadı.");
    const { data, error } = await db.from("topics")
      .update(changes).eq("id", topicId).eq("curriculum_id", curriculumId).eq("active", true)
      .select("id,title,description,pdf_url,pdf_visible,position").maybeSingle();
    throwDbError(error);
    if (!data) throw new HttpError(404, "Konu bulunamadı.");
    return Response.json({ topic: data });
  } catch (error) { return handleError(error); }
}
