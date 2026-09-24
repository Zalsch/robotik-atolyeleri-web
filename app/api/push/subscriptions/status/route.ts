import { requireActor } from "@/lib/server/auth";
import { handleError, readJson, throwDbError } from "@/lib/server/http";
import { validatePushEndpoint } from "@/lib/server/push";

export async function POST(request: Request) {
  try {
    const { actor, db } = await requireActor(["student"]);
    const body = await readJson(request);
    const endpoint = validatePushEndpoint(body.endpoint);
    const { data, error } = await db.from("push_subscriptions")
      .select("id").eq("student_id", actor.id).eq("endpoint", endpoint)
      .eq("session_version", actor.session_version).eq("active", true).maybeSingle();
    throwDbError(error);
    return Response.json({ subscribed: Boolean(data) });
  } catch (error) { return handleError(error); }
}
