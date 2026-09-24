import "server-only";
import { createClient } from "@supabase/supabase-js";

export function getDb() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Supabase server configuration is missing");
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type Db = ReturnType<typeof getDb>;

export type Role = "admin" | "teacher" | "student";
export type AppUser = {
  id: string;
  role: Role;
  username: string;
  display_name: string;
  active: boolean;
  session_version: number;
};
