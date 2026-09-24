import "server-only";
import { getDb, type AppUser, type Db, type Role } from "./db";
import { hasPhaseTwoConfig } from "./config";
import { HttpError } from "./http";
import { getSession } from "./session";

export async function requireActor(roles?: Role[]): Promise<{ actor: AppUser; db: Db }> {
  if (!hasPhaseTwoConfig()) throw new HttpError(503, "Hesap bağlantısı henüz yapılandırılmadı.");
  const session = await getSession();
  if (typeof session.userId !== "string" || !Number.isInteger(session.version)) {
    throw new HttpError(401, "Giriş yapmanız gerekiyor.");
  }
  const db = getDb();
  const { data, error } = await db.from("app_users")
    .select("id,role,username,display_name,active,session_version")
    .eq("id", session.userId).maybeSingle();
  if (error) throw error;
  const actor = data as AppUser | null;
  if (!actor || !actor.active || actor.session_version !== session.version) {
    throw new HttpError(401, "Oturum sona erdi. Yeniden giriş yapın.");
  }
  if (roles && !roles.includes(actor.role)) throw new HttpError(403, "Bu işlem için yetkiniz yok.");
  return { actor, db };
}

export async function requireAssignedTeacher(db: Db, teacherId: string, classId: string) {
  const { data: assignment, error } = await db.from("class_teachers")
    .select("class_id").eq("class_id", classId).eq("teacher_id", teacherId).maybeSingle();
  if (error) throw error;
  if (!assignment) throw new HttpError(403, "Bu sınıfa erişim yetkiniz yok.");
  const { data: schoolClass, error: classError } = await db.from("classes")
    .select("id,active").eq("id", classId).maybeSingle();
  if (classError) throw classError;
  if (!schoolClass?.active) throw new HttpError(404, "Sınıf bulunamadı.");
}
