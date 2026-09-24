import { requireActor } from "@/lib/server/auth";
import { handleError, HttpError, readJson, textField, throwDbError, uuidField } from "@/lib/server/http";
import { topicDescriptionField, topicPdfUrlField } from "@/lib/server/topic-materials";

export async function POST(request: Request, context: RouteContext<"/api/curricula/[curriculumId]/topics">) {
  try {
    const { db } = await requireActor(["teacher"]);
    const { curriculumId } = await context.params;
    uuidField(curriculumId, "Müfredat kimliği");
    const body = await readJson(request);
    const title = textField(body, "title");
    const description = topicDescriptionField(body.description ?? "");
    const pdfUrl = topicPdfUrlField(body.pdfUrl ?? null);
    const { data: curriculum, error: curriculumError } = await db.from("curricula")
      .select("id").eq("id", curriculumId).eq("active", true).maybeSingle();
    throwDbError(curriculumError);
    if (!curriculum) throw new HttpError(404, "Müfredat bulunamadı.");
    const { data: last, error: lastError } = await db.from("topics")
      .select("position").eq("curriculum_id", curriculumId).order("position", { ascending: false }).limit(1);
    throwDbError(lastError);
    const { data, error } = await db.from("topics")
      .insert({ curriculum_id: curriculumId, title, description, pdf_url: pdfUrl,
        position: (last?.[0]?.position ?? 0) + 1 })
      .select("id,curriculum_id,title,description,pdf_url,pdf_visible,position").single();
    throwDbError(error);
    return Response.json({ topic: data }, { status: 201 });
  } catch (error) { return handleError(error); }
}
