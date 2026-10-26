import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** Node.js crypto scrypt. Passwords are never stored or returned. */
const KEY_LEN = 32;

export interface PasswordRecord {
  salt: string;
  hash: string;
}

export function hashPassword(password: string): PasswordRecord {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN, { N: 16384, r: 8, p: 1 });
  return { salt: salt.toString("base64"), hash: hash.toString("base64") };
}

export function verifyPassword(password: string, record: PasswordRecord): boolean {
  const salt = Buffer.from(record.salt, "base64");
  const expected = Buffer.from(record.hash, "base64");
  if (salt.length < 16 || expected.length !== KEY_LEN) return false;
  const actual = scryptSync(password, salt, KEY_LEN, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(actual, expected);
}
