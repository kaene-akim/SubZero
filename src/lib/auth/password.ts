import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export type PasswordCheck = { ok: boolean; message?: string };

export function validatePassword(password: string): PasswordCheck {
  if (password.length < 10) return { ok: false, message: "Use at least 10 characters." };
  if (password.length > 200) return { ok: false, message: "Password is too long." };
  if (!/[a-zA-Z]/.test(password)) return { ok: false, message: "Include at least one letter." };
  if (!/[0-9]/.test(password)) return { ok: false, message: "Include at least one number." };
  const common = new Set([
    "password123",
    "1234567890",
    "qwertyuiop",
    "letmein123",
    "subscription",
  ]);
  if (common.has(password.toLowerCase())) return { ok: false, message: "This password is too common." };
  return { ok: true };
}
