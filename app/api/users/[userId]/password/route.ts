import { requireActor } from "@/lib/server/auth";
import { handleError, HttpError, passwordField, readJson, throwDbError, uuidField } from "@/lib/server/http";
import { hashPassword } from "@/lib/server/password";

export async function POST(request: Request, context: RouteContext<"/api/users/[userId]/password">) {
  try {
    const { actor, db } = await requireActor(["admin", "teacher"]);
    const { userId } = await context.params;
    uuidField(userId, "Kullanıcı kimliği");
    const body = await readJson(request);
    const password = passwordField(body);
    const { data: target, error: lookupError } = await db.from("app_users")
      .select("id,role,active").eq("id", userId).maybeSingle();
    throwDbError(lookupError);
    if (!target) throw new HttpError(404, "Kullanıcı bulunamadı.");
    if (actor.role === "admin" && target.role !== "teacher") throw new HttpError(403, "Bu hesabın şifresini yenileme yetkiniz yok.");
    if (actor.role === "teacher") {
      if (target.role !== "student" || !target.active) throw new HttpError(403, "Bu hesabın şifresini yenileme yetkiniz yok.");
      const { data: memberships, error: membershipError } = await db.from("enrollments")
        .select("class_id").eq("student_id", target.id).is("left_at", null);
      throwDbError(membershipError);
      const classIds = (memberships ?? []).map((row) => row.class_id);
      if (classIds.length === 0) throw new HttpError(403, "Bu öğrenciye erişim yetkiniz yok.");
      const { data: assignment, error: assignmentError } = await db.from("class_teachers")
        .select("class_id").eq("teacher_id", actor.id).in("class_id", classIds).limit(1);
      throwDbError(assignmentError);
      if (!assignment?.length) throw new HttpError(403, "Bu öğrenciye erişim yetkiniz yok.");
    }
    const passwordHash = await hashPassword(password);
    const { error } = await db.from("app_users")
      .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
      .eq("id", target.id);
    throwDbError(error);
    return Response.json({ updated: true });
  } catch (error) { return handleError(error); }
}
