import { requireActor } from "@/lib/server/auth";
import { handleError, readJson, textField, throwDbError } from "@/lib/server/http";
import { allRows, chunks } from "@/lib/server/pagination";

export async function GET(request: Request) {
  try {
    const { db } = await requireActor(["teacher"]);
    const curricula = await allRows(async (from, to) => db.from("curricula")
      .select("id,title,active,created_at").eq("active", true).order("title").range(from, to));
    if (new URL(request.url).searchParams.get("summary") === "1") {
      return Response.json({ curricula: curricula.map(({ id, title }) => ({ id, title })) });
    }
    const ids = curricula.map((item) => item.id);
    if (ids.length === 0) return Response.json({ curricula: [] });
    const topicGroups = await Promise.all(chunks(ids).map((group) => allRows(async (from, to) => db.from("topics")
      .select("id,curriculum_id,title,description,pdf_url,pdf_visible,position").in("curriculum_id", group)
      .eq("active", true).order("curriculum_id").order("position").range(from, to))));
    const topics = topicGroups.flat();
    return Response.json({ curricula: curricula.map((item) => ({
      ...item, topics: topics.filter((topic) => topic.curriculum_id === item.id),
    })) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const body = await readJson(request);
    const title = textField(body, "title");
    const { data, error } = await db.from("curricula")
      .insert({ title, created_by: actor.id }).select("id,title,active,created_at").single();
    throwDbError(error);
    return Response.json({ curriculum: { ...data, topics: [] } }, { status: 201 });
  } catch (error) { return handleError(error); }
}
