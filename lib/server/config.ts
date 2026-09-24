import "server-only";

export function hasDatabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function hasPhaseTwoConfig() {
  return hasDatabaseConfig() && Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32);
}
