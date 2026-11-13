"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireUser, getRequestMeta } from "@/lib/auth/session";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

export type SettingsFormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  country: z.string().trim().length(2).default("GB"),
  timezone: z.string().trim().min(1).max(60),
  preferredCurrency: z.string().trim().length(3).default("GBP"),
  monthlyBudget: z.string().trim().optional(),
  preferredBillingDay: z.coerce.number().int().min(1).max(28),
  preferredBillingFrequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "semiannual", "annual"]),
  studentEligible: z.string().optional(),
});

function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function parseBudget(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const num = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num) || num < 0) return null;
  return num.toFixed(2);
}

export async function updateProfileAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the form.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }
  const data = parsed.data;
  if (!validTimeZone(data.timezone)) return { error: "Choose a valid IANA time zone, for example Europe/London." };
  if (data.monthlyBudget && parseBudget(data.monthlyBudget) === null) {
    return { error: "Enter a valid monthly budget, or leave it blank." };
  }

  const categories = formData.getAll("interestedCategories").map(String).filter(Boolean).slice(0, 20);
  const db = await getDb();
  await db
    .update(users)
    .set({
      name: data.name,
      country: data.country.toUpperCase(),
      timezone: data.timezone,
      preferredCurrency: data.preferredCurrency.toUpperCase(),
      monthlyBudget: parseBudget(data.monthlyBudget),
      preferredBillingDay: data.preferredBillingDay,
      preferredBillingFrequency: data.preferredBillingFrequency,
      studentEligible: data.studentEligible === "on",
      interestedCategories: categories,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  await recordAudit({ userId: user.id, action: "settings.profile_updated", resourceType: "user", resourceId: user.id });
  revalidatePath("/settings");
  revalidatePath("/overview");
  return { ok: true, message: "Profile and preferences saved." };
}

export async function updateNotificationSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireUser();
  const days = formData
    .getAll("trialReminderDays")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 30);
  const db = await getDb();
  await db
    .update(users)
    .set({
      notifyEmail: formData.get("notifyEmail") === "on",
      notifyPush: formData.get("notifyPush") === "on",
      notifyInApp: formData.get("notifyInApp") === "on",
      trialReminderDays: days.length ? [...new Set(days)].sort((a, b) => b - a) : [7, 3, 1],
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  await recordAudit({ userId: user.id, action: "settings.notifications_updated", resourceType: "user", resourceId: user.id });
  revalidatePath("/settings");
  return { ok: true, message: "Notification preferences saved." };
}

export async function changePasswordAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireUser();
  const meta = await getRequestMeta();
  const limit = rateLimit(`password-change:${user.id}:${meta.ipHash ?? "unknown"}`, 5, 15 * 60_000);
  if (!limit.allowed) return { error: "Too many attempts. Try again later." };

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const check = validatePassword(next);
  if (!check.ok) return { error: check.message ?? "Choose a stronger password." };

  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) return { error: "Account not found." };
  if (row.passwordHash) {
    const ok = await verifyPassword(current, row.passwordHash);
    if (!ok) return { error: "Your current password is incorrect." };
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await recordAudit({
    userId: user.id,
    action: "settings.password_changed",
    resourceType: "user",
    resourceId: user.id,
    ipHash: meta.ipHash,
  });
  return { ok: true, message: "Password updated. Other devices stay signed in until their sessions expire." };
}

const onboardingSchema = profileSchema.extend({
  name: z.string().trim().min(2, "Enter your name.").max(80),
});

export async function completeOnboardingAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireUser();
  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the form.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }
  const data = parsed.data;
  if (!validTimeZone(data.timezone)) return { error: "Choose a valid time zone." };
  const categories = formData.getAll("interestedCategories").map(String).filter(Boolean).slice(0, 20);
  const db = await getDb();
  await db
    .update(users)
    .set({
      name: data.name,
      country: data.country.toUpperCase(),
      timezone: data.timezone,
      preferredCurrency: data.preferredCurrency.toUpperCase(),
      monthlyBudget: parseBudget(data.monthlyBudget),
      preferredBillingDay: data.preferredBillingDay,
      preferredBillingFrequency: data.preferredBillingFrequency,
      studentEligible: data.studentEligible === "on",
      interestedCategories: categories,
      notifyEmail: formData.get("notifyEmail") === "on",
      notifyInApp: formData.get("notifyInApp") === "on",
      onboardingStep: "done",
      onboardingCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  await recordAudit({ userId: user.id, action: "onboarding.completed", resourceType: "user", resourceId: user.id });
  revalidatePath("/overview");
  redirect("/overview?welcome=1");
}
