import "server-only";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function ensureSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new HttpError(403, "İstek kaynağı doğrulanamadı.");
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  ensureSameOrigin(request);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "JSON içerik bekleniyor.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 16_384) throw new HttpError(413, "İstek çok büyük.");
  let body: unknown;
  try { body = await request.json(); } catch { throw new HttpError(400, "Geçersiz JSON."); }
  if (!body || Array.isArray(body) || typeof body !== "object") throw new HttpError(400, "Geçersiz istek.");
  return body as Record<string, unknown>;
}

export function textField(body: Record<string, unknown>, key: string, max = 120) {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > max) {
    throw new HttpError(400, `${key} alanı geçersiz.`);
  }
  return value.trim();
}

export function usernameField(body: Record<string, unknown>) {
  const username = textField(body, "username", 32).toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new HttpError(400, "Kullanıcı adı 3–32 Latin harf, rakam, nokta, tire veya alt çizgiden oluşmalı.");
  }
  return username;
}

export function passwordField(body: Record<string, unknown>) {
  const value = body.password;
  if (typeof value !== "string" || value.length < 12 || value.length > 128) {
    throw new HttpError(400, "Şifre 12–128 karakter olmalı.");
  }
  return value;
}

export function uuidField(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, `${label} geçersiz.`);
  }
  return value;
}

export function handleError(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  console.error("API operation failed", error instanceof Error ? error.message : "unknown error");
  return Response.json({ error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." }, { status: 500 });
}

export function throwDbError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "23505") throw new HttpError(409, "Bu kayıt zaten mevcut.");
  if (error.code === "23503" || error.code === "23514" || error.code === "P0001") {
    throw new HttpError(400, "İşlem veri kurallarıyla uyuşmuyor.");
  }
  throw error;
}
