import { createClient } from "@supabase/supabase-js";
import { hash } from "argon2";

const [username, displayName] = process.argv.slice(2);
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!username || !displayName || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Usage: npm run bootstrap:admin -- <username> "<display name>"');
  process.exit(1);
}
if (!/^[a-z0-9._-]{3,32}$/.test(username) || displayName.trim().length < 2 || displayName.trim().length > 120) {
  throw new Error("Invalid username or display name.");
}

async function readPassword() {
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk.toString();
      if (input.length > 512) throw new Error("Password input is too long.");
    }
    return input.replace(/\r?\n$/, "");
  }
  process.stdout.write("Initial admin password: ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk) => {
      for (const char of chunk.toString()) {
        if (char === "\u0003") return finish(new Error("Cancelled."));
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u007f") value = Array.from(value).slice(0, -1).join("");
        else if (value.length < 128) value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { count, error: countError } = await db.from("app_users")
  .select("id", { count: "exact", head: true }).eq("role", "admin");
if (countError) throw countError;
if (count !== 0) throw new Error("An admin already exists. Bootstrap can only create the first one.");

const password = await readPassword();
if (password.length < 12 || password.length > 128) throw new Error("Password must be 12–128 characters.");
const passwordHash = await hash(password);
const { error } = await db.from("app_users").insert({
  role: "admin", username, display_name: displayName.trim(), password_hash: passwordHash,
});
if (error) throw error;
console.log(`Admin account created: ${username}`);
