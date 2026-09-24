import "server-only";
import { hash, verify } from "argon2";

// A valid hash keeps unknown usernames on the same verification path.
const UNKNOWN_USER_HASH = "$argon2id$v=19$m=65536,p=4,t=3$6+6NPdP2u/PY7wp5Pd6XVA$ALIcpsY7HRG+4c0rZB18ekeuvxzAtplxLMfnIgZY1t8";

export async function hashPassword(password: string) {
  return hash(password);
}

export async function verifyPassword(storedHash: string | null, password: string) {
  return verify(storedHash ?? UNKNOWN_USER_HASH, password);
}
