import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getEncryptionKey, env } from "@/lib/env";

export type EncryptedPayload = {
  v: 1;
  iv: string;
  tag: string;
  data: string;
};

export function encryptJson(value: unknown): EncryptedPayload {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
}

export function decryptJson<T>(payload: unknown): T {
  if (!payload || typeof payload !== "object") throw new Error("Invalid encrypted payload");
  const p = payload as EncryptedPayload;
  if (p.v !== 1 || !p.iv || !p.tag || !p.data) throw new Error("Unsupported encrypted payload");
  const key = getEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(p.iv, "base64"));
  decipher.setAuthTag(Buffer.from(p.tag, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(p.data, "base64")), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmac(value: string, key = env.AUTH_SECRET): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Hash an IP for audit purposes without retaining the raw address. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return hmac(ip).slice(0, 32);
}

export function generateIdempotencyKey(prefix: string): string {
  return `${prefix}_${randomToken(18)}`;
}
