import { createHmac } from "node:crypto";
import { getDb } from "@/lib/server/db";
import { hasPhaseTwoConfig } from "@/lib/server/config";
import { HttpError, handleError, readJson, throwDbError, usernameField } from "@/lib/server/http";
import { verifyPassword } from "@/lib/server/password";
import { getSession } from "@/lib/server/session";

function bucket(value: string) {
  return createHmac("sha256", process.env.SESSION_SECRET!).update(value).digest("hex");
}

export async function POST(request: Request) {
  try {
    if (!hasPhaseTwoConfig()) throw new HttpError(503, "Hesap bağlantısı henüz yapılandırılmadı.");
    const body = await readJson(request);
    const username = usernameField(body);
    const password = body.password;
    if (typeof password !== "string" || password.length < 1 || password.length > 128) {
      throw new HttpError(401, "Kullanıcı adı veya şifre hatalı.");
    }

    const db = getDb();
    const usernameBucket = bucket(`user:${username}`);
    const clientIp = (request.headers.get("x-forwarded-for")?.split(",")[0]
      ?? request.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 100);
    const networkBucket = bucket(`network:${clientIp}`);
    const [userLimit, networkLimit] = await Promise.all([
      db.rpc("consume_login_attempt", { p_bucket: usernameBucket, p_limit: 5 }),
      db.rpc("consume_login_attempt", { p_bucket: networkBucket, p_limit: 30 }),
    ]);
    throwDbError(userLimit.error);
    throwDbError(networkLimit.error);
    if (!userLimit.data || !networkLimit.data) {
      throw new HttpError(429, "Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.");
    }

    const { data: user, error } = await db.from("app_users")
      .select("id,password_hash,active,session_version")
      .eq("username", username).maybeSingle();
    throwDbError(error);
    const matches = await verifyPassword(user?.password_hash ?? null, password);
    if (!user?.active || !user.password_hash || !matches) {
      throw new HttpError(401, "Kullanıcı adı veya şifre hatalı.");
    }

    const { error: clearError } = await db.rpc("clear_login_attempt", { p_bucket: usernameBucket });
    throwDbError(clearError);
    const session = await getSession();
    session.userId = user.id;
    session.version = user.session_version;
    await session.save();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return handleError(error); }
}
