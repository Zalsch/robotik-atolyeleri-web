import { requireActor } from "@/lib/server/auth";
import { handleError, HttpError, readJson, throwDbError } from "@/lib/server/http";
import { pushConfigured, validatePushEndpoint, validatePushKey } from "@/lib/server/push";

export async function POST(request: Request) {
  try {
    const { actor, db } = await requireActor(["student"]);
    if (!pushConfigured()) throw new HttpError(503, "Bildirimler henüz yapılandırılmadı.");
    const { data: enrollment, error: enrollmentError } = await db.from("enrollments")
      .select("id").eq("student_id", actor.id).is("left_at", null).limit(1);
    throwDbError(enrollmentError);
    if (!enrollment?.length) throw new HttpError(403, "Etkin sınıf kaydı bulunamadı.");
    const body = await readJson(request);
    const endpoint = validatePushEndpoint(body.endpoint);
    const p256dh = validatePushKey(body.p256dh, "Bildirim anahtarı");
    const auth = validatePushKey(body.auth, "Bildirim doğrulaması");
    const { error } = await db.from("push_subscriptions")
      .upsert({ endpoint, p256dh, auth, student_id: actor.id, session_version: actor.session_version, active: true,
        last_seen_at: new Date().toISOString() }, { onConflict: "endpoint" });
    throwDbError(error);
    return Response.json({ subscribed: true });
  } catch (error) { return handleError(error); }
}

export async function DELETE(request: Request) {
  try {
    const { actor, db } = await requireActor(["student"]);
    const body = await readJson(request);
    const endpoint = validatePushEndpoint(body.endpoint);
    const { error } = await db.from("push_subscriptions")
      .update({ active: false, last_seen_at: new Date().toISOString() })
      .eq("student_id", actor.id).eq("endpoint", endpoint);
    throwDbError(error);
    return Response.json({ subscribed: false });
  } catch (error) { return handleError(error); }
}
