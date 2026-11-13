import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { authTokens, sessions, users } from "@/lib/db/schema";
import { hashPassword, verifyPassword, validatePassword } from "@/lib/auth/password";
import { randomToken, sha256 } from "@/lib/security/crypto";
import { env } from "@/lib/env";
import { sendEmail, passwordResetEmail, verificationEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestMeta, issueSession, setSessionCookie } from "@/lib/auth/session";

export type AuthResult =
  | { ok: true; message?: string; devLink?: string; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: emailSchema,
  password: z.string().min(10, "Use at least 10 characters.").max(200),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

function isDevLinkAllowed() {
  return process.env.NODE_ENV !== "production";
}

async function createToken(userId: string, type: "email_verify" | "password_reset", ttlMs: number) {
  const db = await getDb();
  const token = randomToken(32);
  await db.insert(authTokens).values({
    userId,
    type,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  ip: string;
}): Promise<AuthResult> {
  const limit = rateLimit(`register:${input.ip}`, 5, 15 * 60_000);
  if (!limit.allowed) return { ok: false, error: "Too many attempts. Try again later." };

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const pw = validatePassword(parsed.data.password);
  if (!pw.ok) return { ok: false, error: pw.message ?? "Choose a stronger password." };

  const db = await getDb();
  const email = normaliseEmail(parsed.data.email);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return { ok: false, error: "An account with this email already exists. Try signing in." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(users)
    .values({ name: parsed.data.name, email, passwordHash })
    .returning();

  const token = await createToken(user.id, "email_verify", 24 * 60 * 60_000);
  const url = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const mail = verificationEmail(user.name, url);
  const result = await sendEmail({ to: user.email, ...mail });

  const meta = await getRequestMeta();
  const session = await issueSession(user.id, meta);
  await setSessionCookie(session.token, session.expiresAt);
  await recordAudit({
    userId: user.id,
    action: "auth.register",
    resourceType: "user",
    resourceId: user.id,
    ipHash: meta.ipHash,
  });

  return {
    ok: true,
    message: result.delivered
      ? "Account created. Check your inbox to verify your email."
      : "Account created. Email delivery is not configured in this environment — see the server logs for the verification link.",
    devLink: !result.delivered && isDevLinkAllowed() ? url : undefined,
    redirectTo: "/onboarding",
  };
}

export async function loginUser(input: { email: string; password: string; ip: string }): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email and password." };
  const email = normaliseEmail(parsed.data.email);
  const limit = rateLimit(`login:${input.ip}:${email}`, 8, 15 * 60_000);
  if (!limit.allowed) {
    return { ok: false, error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.` };
  }

  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !ok || user.deletedAt) {
    return { ok: false, error: "Email or password is incorrect." };
  }

  const meta = await getRequestMeta();
  const session = await issueSession(user.id, meta);
  await setSessionCookie(session.token, session.expiresAt);
  await recordAudit({
    userId: user.id,
    action: "auth.login",
    resourceType: "user",
    resourceId: user.id,
    ipHash: meta.ipHash,
  });

  return {
    ok: true,
    redirectTo: user.onboardingCompletedAt ? "/overview" : "/onboarding",
  };
}

export async function requestPasswordReset(input: { email: string; ip: string }): Promise<AuthResult> {
  const limit = rateLimit(`reset:${input.ip}`, 5, 15 * 60_000);
  if (!limit.allowed) return { ok: false, error: "Too many attempts. Try again later." };
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };

  const db = await getDb();
  const email = normaliseEmail(parsed.data);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let devLink: string | undefined;
  if (user && !user.deletedAt) {
    const token = await createToken(user.id, "password_reset", 60 * 60_000);
    const url = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    const result = await sendEmail({ to: user.email, ...passwordResetEmail(user.name, url) });
    if (!result.delivered && isDevLinkAllowed()) devLink = url;
    await recordAudit({
      userId: user.id,
      action: "auth.password_reset_requested",
      resourceType: "user",
      resourceId: user.id,
    });
  }
  return {
    ok: true,
    message: "If an account exists for that email, a reset link is on its way.",
    devLink,
  };
}

export async function resetPassword(input: {
  token: string;
  password: string;
  ip: string;
}): Promise<AuthResult> {
  const limit = rateLimit(`reset-confirm:${input.ip}`, 10, 15 * 60_000);
  if (!limit.allowed) return { ok: false, error: "Too many attempts. Try again later." };
  const pw = validatePassword(input.password);
  if (!pw.ok) return { ok: false, error: pw.message ?? "Choose a stronger password." };
  if (!input.token) return { ok: false, error: "This reset link is invalid." };

  const db = await getDb();
  const [row] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, sha256(input.token)),
        eq(authTokens.type, "password_reset"),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, error: "This reset link is invalid or has expired." };

  const passwordHash = await hashPassword(input.password);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, row.userId));
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
  });
  await recordAudit({
    userId: row.userId,
    action: "auth.password_reset_completed",
    resourceType: "user",
    resourceId: row.userId,
  });
  return { ok: true, message: "Password updated. Sign in with your new password.", redirectTo: "/login" };
}

export async function verifyEmailToken(token: string): Promise<AuthResult> {
  if (!token) return { ok: false, error: "This verification link is invalid." };
  const db = await getDb();
  const [row] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, sha256(token)),
        eq(authTokens.type, "email_verify"),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, error: "This verification link is invalid or has expired." };
  await db.transaction(async (tx) => {
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
  });
  await recordAudit({
    userId: row.userId,
    action: "auth.email_verified",
    resourceType: "user",
    resourceId: row.userId,
  });
  return { ok: true, message: "Email verified. You can now connect integrations." };
}

export async function resendVerificationEmail(userId: string): Promise<AuthResult> {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { ok: false, error: "Account not found." };
  if (user.emailVerifiedAt) return { ok: true, message: "Your email is already verified." };
  const recent = await db
    .select({ id: authTokens.id })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.type, "email_verify"),
        gt(authTokens.createdAt, new Date(Date.now() - 60_000)),
      ),
    )
    .limit(1);
  if (recent.length > 0) return { ok: false, error: "Please wait a minute before requesting another email." };

  const token = await createToken(userId, "email_verify", 24 * 60 * 60_000);
  const url = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const result = await sendEmail({ to: user.email, ...verificationEmail(user.name, url) });
  return {
    ok: true,
    message: result.delivered ? "Verification email sent." : "Email delivery is not configured; the link is in the server logs.",
    devLink: !result.delivered && isDevLinkAllowed() ? url : undefined,
  };
}

export async function deleteUserAccount(userId: string, confirmation: string): Promise<AuthResult> {
  if (confirmation !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
  const db = await getDb();
  await recordAudit({
    userId,
    action: "account.deleted",
    resourceType: "user",
    resourceId: userId,
  });
  // Cascades remove subscriptions, bundles, detections, connected accounts,
  // encrypted credentials, notifications and sessions.
  await db.delete(users).where(eq(users.id, userId));
  return { ok: true, message: "Account deleted." };
}

export async function countUsers(): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  return row?.count ?? 0;
}
