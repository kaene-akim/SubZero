import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { authTokens, sessions, subscriptions, users } from "@/lib/db/schema";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";
import { deleteUserAccount, resetPassword, verifyEmailToken } from "@/lib/auth/service";
import { sha256 } from "@/lib/security/crypto";
import { createSubscription, createUser } from "./helpers";

async function issueToken(userId: string, type: "email_verify" | "password_reset", ttlMs = 60_000) {
  const db = await getDb();
  const token = randomUUID();
  await db.insert(authTokens).values({
    userId,
    type,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

describe("password hashing", () => {
  it("verifies the correct password and rejects the wrong one", async () => {
    const hash = await hashPassword("correct horse 42");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse 42", hash)).toBe(true);
    expect(await verifyPassword("wrong horse 42", hash)).toBe(false);
  });

  it("salts every hash so identical passwords do not collide", async () => {
    const first = await hashPassword("same-password-1");
    const second = await hashPassword("same-password-1");
    expect(first).not.toBe(second);
    expect(await verifyPassword("same-password-1", first)).toBe(true);
    expect(await verifyPassword("same-password-1", second)).toBe(true);
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "plaintext")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$1$2$3$bad")).toBe(false);
  });

  it("enforces password strength rules", () => {
    expect(validatePassword("short1").ok).toBe(false);
    expect(validatePassword("alllettersonly").ok).toBe(false);
    expect(validatePassword("1234567890").ok).toBe(false);
    expect(validatePassword("password123").ok).toBe(false);
    expect(validatePassword("longenough42").ok).toBe(true);
  });
});

describe("email verification", () => {
  it("verifies once and refuses a replayed token", async () => {
    const user = await createUser({ emailVerifiedAt: null });
    const token = await issueToken(user.id, "email_verify");

    const first = await verifyEmailToken(token);
    expect(first.ok).toBe(true);

    const db = await getDb();
    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(row.emailVerifiedAt).toBeInstanceOf(Date);

    const replay = await verifyEmailToken(token);
    expect(replay.ok).toBe(false);
  });

  it("rejects expired tokens", async () => {
    const user = await createUser({ emailVerifiedAt: null });
    const token = await issueToken(user.id, "email_verify", -1_000);
    const result = await verifyEmailToken(token);
    expect(result.ok).toBe(false);
  });
});

describe("password reset", () => {
  it("replaces the password, consumes the token and revokes sessions", async () => {
    const user = await createUser();
    const db = await getDb();
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: sha256("existing-session"),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const token = await issueToken(user.id, "password_reset");

    const result = await resetPassword({ token, password: "brand-new-pass9", ip: "198.51.100.7" });
    expect(result.ok).toBe(true);

    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(await verifyPassword("brand-new-pass9", row.passwordHash)).toBe(true);
    expect(await verifyPassword("old-password-1", row.passwordHash)).toBe(false);

    const remainingSessions = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(remainingSessions).toHaveLength(0);

    const [tokenRow] = await db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.userId, user.id), eq(authTokens.type, "password_reset")))
      .limit(1);
    expect(tokenRow.usedAt).toBeInstanceOf(Date);
  });

  it("does not accept a token that was already used", async () => {
    const user = await createUser();
    const token = await issueToken(user.id, "password_reset");
    expect((await resetPassword({ token, password: "brand-new-pass9", ip: "198.51.100.8" })).ok).toBe(true);
    expect((await resetPassword({ token, password: "another-pass99", ip: "198.51.100.9" })).ok).toBe(false);
  });
});

describe("account deletion", () => {
  it("requires explicit confirmation and cascades personal records", async () => {
    const user = await createUser();
    const sub = await createSubscription(user.id);

    const refused = await deleteUserAccount(user.id, "delete");
    expect(refused.ok).toBe(false);

    const result = await deleteUserAccount(user.id, "DELETE");
    expect(result.ok).toBe(true);

    const db = await getDb();
    expect(await db.select().from(users).where(eq(users.id, user.id))).toHaveLength(0);
    expect(await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id))).toHaveLength(0);
  });
});
