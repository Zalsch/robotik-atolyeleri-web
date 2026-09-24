import { requireActor, requireAssignedTeacher } from "@/lib/server/auth";
import { handleError, HttpError, passwordField, readJson, textField, throwDbError, usernameField, uuidField } from "@/lib/server/http";
import { hashPassword } from "@/lib/server/password";
import { allRows, chunks } from "@/lib/server/pagination";

export async function GET(_request: Request, context: RouteContext<"/api/classes/[classId]/students">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    await requireAssignedTeacher(db, actor.id, classId);
    const enrollments = await allRows(async (from, to) => db.from("enrollments")
      .select("id,student_id,joined_at").eq("class_id", classId).is("left_at", null)
      .order("joined_at").order("id").range(from, to));
    const ids = enrollments.map((row) => row.student_id);
    if (ids.length === 0) return Response.json({ students: [] });
    const groups = await Promise.all(chunks(ids).map(async (group) => {
      const { data, error } = await db.from("app_users")
        .select("id,username,display_name,active").in("id", group).eq("role", "student");
      throwDbError(error);
      return data ?? [];
    }));
    return Response.json({ students: groups.flat().sort((a, b) => a.display_name.localeCompare(b.display_name, "tr")) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request, context: RouteContext<"/api/classes/[classId]/students">) {
  try {
    const { actor, db } = await requireActor(["teacher"]);
    const { classId } = await context.params;
    uuidField(classId, "Sınıf kimliği");
    await requireAssignedTeacher(db, actor.id, classId);
    const body = await readJson(request);
    const mode = body.mode;
    if (mode !== "new" && mode !== "existing") throw new HttpError(400, "Öğrenci ekleme türü geçersiz.");
    const username = usernameField(body);

    if (mode === "existing") {
      const { data: student, error: lookupError } = await db.from("app_users")
        .select("id,active,username,display_name")
        .eq("username", username).eq("role", "student").maybeSingle();
      throwDbError(lookupError);
      if (!student) throw new HttpError(404, "Öğrenci hesabı bulunamadı.");
      const { error } = await db.rpc("enroll_existing_student", { p_class_id: classId, p_student_id: student.id });
      throwDbError(error);
      return Response.json({ student: { id: student.id, username: student.username, display_name: student.display_name, active: true } });
    }

    const displayName = textField(body, "displayName");
    const password = passwordField(body);
    const { data: existing, error: lookupError } = await db.from("app_users")
      .select("id").eq("username", username).maybeSingle();
    throwDbError(lookupError);
    if (existing) throw new HttpError(409, "Kullanıcı adı zaten kullanılıyor. Mevcut öğrenci ekleme seçeneğini kullanın.");
    const passwordHash = await hashPassword(password);
    const { data, error } = await db.rpc("create_student_with_enrollment", {
      p_password_hash: passwordHash, p_username: username,
      p_display_name: displayName, p_class_id: classId,
    });
    throwDbError(error);
    return Response.json({ student: { id: data.id, username: data.username, display_name: data.display_name, active: data.active } }, { status: 201 });
  } catch (error) { return handleError(error); }
}
