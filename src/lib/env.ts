import { z } from "zod";
import { createHash } from "node:crypto";

const isProduction = process.env.NODE_ENV === "production";

const devAuthSecret = "subzero-development-only-auth-secret-do-not-use-in-production";
const devEncryptionSeed = "subzero-development-only-encryption-seed";

const schema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional(),
  AUTH_SECRET: z.string().min(32).default(devAuthSecret),
  ENCRYPTION_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GMAIL_MOCK: z.enum(["true", "false"]).default("false"),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().default("https://api.openai.com/v1"),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  OPEN_BANKING_PROVIDER: z.string().default("truelayer"),
  TRUELAYER_CLIENT_ID: z.string().optional(),
  TRUELAYER_CLIENT_SECRET: z.string().optional(),
  TRUELAYER_REDIRECT_URI: z.string().optional(),
  BANK_MOCK: z.enum(["true", "false"]).default("false"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("SubZero <notifications@subzero.local>"),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:security@subzero.local"),
  CRON_SECRET: z.string().optional(),
  JOBS_INLINE: z.enum(["true", "false"]).default("true"),
  EXCHANGE_RATE_API_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;

if (isProduction && env.AUTH_SECRET === devAuthSecret) {
  throw new Error("AUTH_SECRET must be set to a strong random value in production.");
}

/**
 * Encryption key resolution. In production ENCRYPTION_KEY is mandatory.
 * In development we derive a stable key from the dev auth secret so that
 * encrypted OAuth tokens survive restarts. This is never used in production.
 */
export function getEncryptionKey(): Buffer {
  if (env.ENCRYPTION_KEY) {
    const raw = env.ENCRYPTION_KEY;
    const buf = /^[A-Za-z0-9+/=]{43,44}$/.test(raw)
      ? Buffer.from(raw, "base64")
      : Buffer.from(raw, "utf8");
    if (buf.length !== 32) {
      throw new Error("ENCRYPTION_KEY must be 32 bytes (base64 encoded or 32 ASCII chars).");
    }
    return buf;
  }
  if (isProduction) throw new Error("ENCRYPTION_KEY is required in production.");
  return createHash("sha256").update(devEncryptionSeed).digest();
}

export const googleOAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const gmailMockEnabled = env.GMAIL_MOCK === "true";
export const llmConfigured = Boolean(env.LLM_API_KEY);
export const openBankingConfigured = Boolean(
  env.TRUELAYER_CLIENT_ID && env.TRUELAYER_CLIENT_SECRET,
);
export const emailConfigured = Boolean(env.RESEND_API_KEY);
export const pushConfigured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
export const stripeConfigured = Boolean(env.STRIPE_SECRET_KEY);
export const isProductionBuild = isProduction;
