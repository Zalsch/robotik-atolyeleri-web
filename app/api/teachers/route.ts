import { requireActor } from "@/lib/server/auth";
import { handleError, passwordField, readJson, textField, throwDbError, usernameField } from "@/lib/server/http";
import { hashPassword } from "@/lib/server/password";
import { allRows } from "@/lib/server/pagination";

export async function GET() {
  try {
    const { db } = await requireActor(["admin"]);
    const teachers = await allRows(async (from, to) => db.from("app_users")
      .select("id,username,display_name,active,created_at")
      .eq("role", "teacher").order("display_name").order("id").range(from, to));
    return Response.json({ teachers });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const { db } = await requireActor(["admin"]);
    const body = await readJson(request);
    const displayName = textField(body, "displayName");
    const username = usernameField(body);
    const password = passwordField(body);
    const { data: existing, error: lookupError } = await db.from("app_users")
      .select("id").eq("username", username).maybeSingle();
    throwDbError(lookupError);
    if (existing) return Response.json({ error: "Kullanıcı adı zaten kullanılıyor." }, { status: 409 });

    const passwordHash = await hashPassword(password);
    const { data, error } = await db.from("app_users")
      .insert({ password_hash: passwordHash, role: "teacher", username, display_name: displayName })
      .select("id,username,display_name,active").single();
    throwDbError(error);
    return Response.json({ teacher: data }, { status: 201 });
  } catch (error) { return handleError(error); }
}
