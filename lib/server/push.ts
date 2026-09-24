import "server-only";
import * as webpush from "web-push";
import { getDb } from "./db";
import { HttpError, throwDbError } from "./http";

type PushRow = {
  id: string; lease_token: string; endpoint: string; p256dh: string; auth: string;
  title: string; body: string; class_id: string; eligible: boolean;
};

function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  if (!/^https:\/\//.test(subject) && !/^mailto:[^@\s]+@[^@\s]+$/.test(subject)) {
    throw new Error("VAPID_SUBJECT must be an HTTPS URL or mailto address");
  }
  return { publicKey, privateKey, subject };
}

export function pushConfigured() {
  try { return Boolean(pushConfig()); } catch { return false; }
}

export function pushPublicKey() {
  return pushConfig()?.publicKey ?? null;
}

export function validatePushEndpoint(value: unknown) {
  if (typeof value !== "string" || value.length < 20 || value.length > 2048) {
    throw new HttpError(400, "Bildirim aboneliği geçersiz.");
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new HttpError(400, "Bildirim aboneliği geçersiz."); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash
    || !(host === "fcm.googleapis.com" || host.endsWith(".push.services.mozilla.com")
      || host.endsWith(".push.apple.com"))) {
    throw new HttpError(400, "Bildirim servisinin adresi desteklenmiyor.");
  }
  return url.toString();
}

export function validatePushKey(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{10,300}$/.test(value)) {
    throw new HttpError(400, `${label} geçersiz.`);
  }
  return value;
}

export async function processPushOutbox() {
  const config = pushConfig();
  if (!config) return { configured: false, sent: 0, failed: 0, discarded: 0, busy: false };
  const db = getDb();
  const { data: token, error: lockError } = await db.rpc("acquire_delivery_lock", { p_name: "push", p_seconds: 300 });
  throwDbError(lockError);
  if (!token) return { configured: true, sent: 0, failed: 0, discarded: 0, busy: true };
  let sent = 0;
  let failed = 0;
  let discarded = 0;
  try {
    for (let batch = 0; batch < 5; batch++) {
      const { data, error } = await db.rpc("claim_push_delivery", { p_limit: 20 });
      throwDbError(error);
      const rows = (data ?? []) as PushRow[];
      if (rows.length === 0) break;
      const outcomes = await Promise.all(rows.map(async (row) => {
        let result: "sent" | "retry" | "discard" = "sent";
        let reason: string | null = null;
        if (!row.eligible) { result = "discard"; reason = "Subscription no longer belongs to an active class student"; }
        else {
          try {
            validatePushEndpoint(row.endpoint);
            await webpush.sendNotification(
              { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
              JSON.stringify({ title: row.title, body: row.body.slice(0, 180), url: `/panel/classes/${row.class_id}#class-content`, tag: row.id }),
              { vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
                TTL: 86_400, timeout: 10_000 },
            );
          } catch (cause) {
            const status = typeof cause === "object" && cause !== null && "statusCode" in cause
              ? Number(cause.statusCode) : null;
            result = cause instanceof HttpError || status === 404 || status === 410 || (status !== null && status >= 400 && status < 500 && status !== 429)
              ? "discard" : "retry";
            reason = status ? `Push service returned ${status}` : cause instanceof HttpError ? cause.message : "Push delivery failed";
            if (status === 404 || status === 410) {
              const { error: disableError } = await db.from("push_subscriptions")
                .update({ active: false }).eq("endpoint", row.endpoint);
              if (disableError) console.error("Expired push subscription could not be disabled", disableError.message);
            }
          }
        }
        const { data: acknowledged, error: finishError } = await db.rpc("finish_push_delivery", {
          p_id: row.id, p_lease_token: row.lease_token, p_result: result, p_error: reason,
        });
        throwDbError(finishError);
        return acknowledged ? result : null;
      }));
      for (const outcome of outcomes) {
        if (outcome === "sent") sent++;
        else if (outcome === "retry") failed++;
        else if (outcome === "discard") discarded++;
      }
      if (failed) break;
    }
  } finally {
    const { error } = await db.rpc("release_delivery_lock", { p_name: "push", p_token: token });
    if (error) console.error("Push delivery lock release failed", error.message);
  }
  return { configured: true, sent, failed, discarded, busy: false };
}
