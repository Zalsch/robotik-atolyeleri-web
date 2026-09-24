import "server-only";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

type SessionData = { userId: string; version: number };

function sessionOptions() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return {
    password,
    cookieName: "robotik_session",
    ttl: 7 * 24 * 60 * 60,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}
