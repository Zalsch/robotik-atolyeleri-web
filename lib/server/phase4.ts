import "server-only";
import type { Db } from "./db";
import { HttpError, throwDbError } from "./http";
import { requireAssignedTeacher } from "./auth";
import { allRows, chunks } from "./pagination";

export function driveUrlField(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) throw new HttpError(400, "Google Drive bağlantısı geçersiz.");
  let url: URL;
  try { url = new URL(value); } catch { throw new HttpError(400, "Google Drive bağlantısı geçersiz."); }
  if (url.protocol !== "https:" || !["drive.google.com", "docs.google.com"].includes(url.hostname)
    || !url.pathname.startsWith("/") || url.username || url.password) {
    throw new HttpError(400, "Yalnızca HTTPS Google Drive bağlantısı kullanılabilir.");
  }
  return url.toString();
}

export function dueAtField(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new HttpError(400, "Son tarih geçersiz.");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, "Son tarih geçersiz.");
  return date.toISOString();
}

export function descriptionField(value: unknown) {
  if (typeof value !== "string" || value.trim().length > 2000) throw new HttpError(400, "Ödev açıklaması geçersiz.");
  return value.trim();
}

export async function requireClassAssignment(db: Db, teacherId: string, classId: string, assignmentId: string) {
  await requireAssignedTeacher(db, teacherId, classId);
  const { data, error } = await db.from("assignments")
    .select("id,class_id,title,description,drive_url,due_at,active,created_at")
    .eq("id", assignmentId).eq("class_id", classId).eq("active", true).maybeSingle();
  throwDbError(error);
  if (!data) throw new HttpError(404, "Ödev bulunamadı.");
  return data;
}

export async function currentClassRoster(db: Db, classId: string) {
  const memberships = await allRows(async (from, to) => db.from("enrollments")
    .select("id,student_id").eq("class_id", classId).is("left_at", null)
    .order("id").range(from, to));
  const ids = [...new Set(memberships.map((row) => row.student_id))];
  if (ids.length === 0) return [];
  const groups = await Promise.all(chunks(ids).map(async (group) => {
    const { data, error } = await db.from("app_users")
      .select("id,username,display_name").in("id", group).eq("role", "student").eq("active", true);
    throwDbError(error);
    return data ?? [];
  }));
  return groups.flat().sort((a, b) => a.display_name.localeCompare(b.display_name, "tr"));
}
