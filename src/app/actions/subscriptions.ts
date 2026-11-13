"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { priceHistory, providers, subscriptions } from "@/lib/db/schema";
import { requireUser, getRequestMeta } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { isValidISODate } from "@/lib/dates";
import { validateSubscriptionDates } from "@/lib/engines/billing";
import { generateNotificationsForUser } from "@/lib/notifications";
import { todayInTimeZone } from "@/lib/dates";
import { rateLimit } from "@/lib/rate-limit";

export type SubscriptionFormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const frequency = z.enum(["weekly", "fortnightly", "monthly", "quarterly", "semiannual", "annual"]);
const status = z.enum([
  "trial",
  "active",
  "paused",
  "pending_cancellation",
  "cancelled",
  "expired",
  "payment_failed",
]);

const baseSchema = z.object({
  serviceName: z.string().trim().min(1, "Enter the service name.").max(120),
  providerId: z.string().uuid().optional().or(z.literal("")),
  category: z.string().trim().max(80).optional(),
  price: z.string().trim().max(24).optional(),
  currency: z.string().trim().length(3).default("GBP"),
  billingFrequency: frequency.default("monthly"),
  status: status.default("active"),
  startDate: z.string().optional(),
  nextBillingDate: z.string().optional(),
  trialStartDate: z.string().optional(),
  trialEndDate: z.string().optional(),
  renewalPrice: z.string().trim().max(24).optional(),
  renewalCurrency: z.string().trim().length(3).optional(),
  autoRenew: z.string().optional(),
  managementUrl: z.string().trim().max(500).optional(),
  cancellationUrl: z.string().trim().max(500).optional(),
  cancellationInstructions: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

function clean(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function emptyToNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

function parseMoney(value: string, currency: string): string | null {
  if (!value.trim()) return null;
  const cleaned = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) return null;
  return num.toFixed(2);
}

function normaliseUrl(value: string): string | null {
  if (!value.trim()) return null;
  if (!/^https?:\/\//i.test(value.trim())) return null;
  return value.trim();
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

export async function createSubscriptionAction(
  _prev: SubscriptionFormState,
  formData: FormData,
): Promise<SubscriptionFormState> {
  const user = await requireUser();
  const meta = await getRequestMeta();
  const limit = rateLimit(`subscription:create:${user.id}`, 60, 60 * 60_000);
  if (!limit.allowed) return { error: "Too many subscription changes. Try again later." };

  const parsed = baseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the form.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const data = parsed.data;

  const dateErrors = validateSubscriptionDates({
    status: data.status,
    startDate: data.startDate,
    nextBillingDate: data.nextBillingDate,
    trialStartDate: data.trialStartDate,
    trialEndDate: data.trialEndDate,
  });
  if (dateErrors.length) return { error: dateErrors.join(" ") };

  for (const value of [data.startDate, data.nextBillingDate, data.trialStartDate, data.trialEndDate]) {
    if (value && !isValidISODate(value)) return { error: "One of the dates is not a valid calendar date." };
  }

  const db = await getDb();
  let provider = null;
  if (data.providerId) {
    const [row] = await db.select().from(providers).where(eq(providers.id, data.providerId)).limit(1);
    provider = row ?? null;
  }
  const price = parseMoney(data.price ?? "", data.currency);
  const renewalPrice = parseMoney(data.renewalPrice ?? "", data.renewalCurrency ?? data.currency);

  const [created] = await db
    .insert(subscriptions)
    .values({
      userId: user.id,
      providerId: provider?.id ?? null,
      serviceName: data.serviceName,
      category: provider?.category ?? data.category ?? "Other Services",
      price,
      currency: data.currency.toUpperCase(),
      billingFrequency: data.billingFrequency,
      status: data.status,
      startDate: emptyToNull(data.startDate ?? ""),
      nextBillingDate: emptyToNull(data.nextBillingDate ?? ""),
      trialStartDate: emptyToNull(data.trialStartDate ?? ""),
      trialEndDate: emptyToNull(data.trialEndDate ?? ""),
      renewalPrice,
      renewalCurrency: (data.renewalCurrency ?? data.currency).toUpperCase(),
      autoRenew: data.autoRenew === "on",
      managementUrl: normaliseUrl(data.managementUrl ?? "") ?? provider?.managementUrl ?? null,
      cancellationUrl: normaliseUrl(data.cancellationUrl ?? "") ?? provider?.cancellationUrl ?? null,
      cancellationInstructions: emptyToNull(data.cancellationInstructions ?? ""),
      source: "manual",
      notes: emptyToNull(data.notes ?? ""),
      lastVerifiedAt: new Date(),
    })
    .returning();

  if (price) {
    await db.insert(priceHistory).values({
      userId: user.id,
      subscriptionId: created.id,
      providerId: provider?.id ?? null,
      price,
      currency: data.currency.toUpperCase(),
      billingFrequency: data.billingFrequency,
      source: "manual_entry",
    });
  }

  await recordAudit({
    userId: user.id,
    action: "subscription.created",
    resourceType: "subscription",
    resourceId: created.id,
    ipHash: meta.ipHash,
    metadata: { source: "manual", hasPrice: Boolean(price) },
  });

  await generateNotificationsForUser(user, todayInTimeZone(user.timezone));
  revalidatePath("/subscriptions");
  revalidatePath("/overview");
  redirect(`/subscriptions/${created.id}?created=1`);
}

export async function updateSubscriptionAction(
  _prev: SubscriptionFormState,
  formData: FormData,
): Promise<SubscriptionFormState> {
  const user = await requireUser();
  const id = clean(formData.get("id"));
  const parsed = baseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the form.", fieldErrors: fieldErrorsFrom(parsed.error) };
  if (!id) return { error: "Missing subscription." };
  const data = parsed.data;

  const dateErrors = validateSubscriptionDates({
    status: data.status,
    startDate: data.startDate,
    nextBillingDate: data.nextBillingDate,
    trialStartDate: data.trialStartDate,
    trialEndDate: data.trialEndDate,
  });
  if (dateErrors.length) return { error: dateErrors.join(" ") };

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, user.id)))
    .limit(1);
  if (!existing) return { error: "Subscription not found." };

  let provider = null;
  if (data.providerId) {
    const [row] = await db.select().from(providers).where(eq(providers.id, data.providerId)).limit(1);
    provider = row ?? null;
  }

  const price = parseMoney(data.price ?? "", data.currency);
  const renewalPrice = parseMoney(data.renewalPrice ?? "", data.renewalCurrency ?? data.currency);

  await db
    .update(subscriptions)
    .set({
      providerId: provider?.id ?? null,
      serviceName: data.serviceName,
      category: provider?.category ?? data.category ?? existing.category,
      price,
      currency: data.currency.toUpperCase(),
      billingFrequency: data.billingFrequency,
      status: data.status,
      startDate: emptyToNull(data.startDate ?? ""),
      nextBillingDate: emptyToNull(data.nextBillingDate ?? ""),
      trialStartDate: emptyToNull(data.trialStartDate ?? ""),
      trialEndDate: emptyToNull(data.trialEndDate ?? ""),
      renewalPrice,
      renewalCurrency: (data.renewalCurrency ?? data.currency).toUpperCase(),
      autoRenew: data.autoRenew === "on",
      managementUrl: normaliseUrl(data.managementUrl ?? "") ?? provider?.managementUrl ?? null,
      cancellationUrl: normaliseUrl(data.cancellationUrl ?? "") ?? provider?.cancellationUrl ?? null,
      cancellationInstructions: emptyToNull(data.cancellationInstructions ?? ""),
      notes: emptyToNull(data.notes ?? ""),
      lastVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, id));

  if (price && price !== existing.price) {
    await db.insert(priceHistory).values({
      userId: user.id,
      subscriptionId: id,
      providerId: provider?.id ?? null,
      price,
      currency: data.currency.toUpperCase(),
      billingFrequency: data.billingFrequency,
      source: "manual_update",
    });
  }

  await recordAudit({
    userId: user.id,
    action: "subscription.updated",
    resourceType: "subscription",
    resourceId: id,
    metadata: { priceChanged: price !== existing.price },
  });

  await generateNotificationsForUser(user, todayInTimeZone(user.timezone));
  revalidatePath(`/subscriptions/${id}`);
  revalidatePath("/subscriptions");
  revalidatePath("/overview");
  return { ok: true, message: "Subscription updated." };
}

/** Simple status transitions triggered from a form. Never claims provider action. */
export async function subscriptionStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = clean(formData.get("id"));
  const intent = clean(formData.get("intent"));
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, user.id)))
    .limit(1);
  if (!existing) redirect("/subscriptions?error=not-found");

  const now = new Date();
  const base = { updatedAt: now };
  if (intent === "pause") {
    await db.update(subscriptions).set({ status: "paused", ...base }).where(eq(subscriptions.id, id));
    await recordAudit({ userId: user.id, action: "subscription.paused", resourceType: "subscription", resourceId: id });
    revalidatePath("/subscriptions");
    redirect(`/subscriptions/${id}?updated=paused`);
  }
  if (intent === "resume") {
    await db.update(subscriptions).set({ status: "active", ...base }).where(eq(subscriptions.id, id));
    await recordAudit({ userId: user.id, action: "subscription.resumed", resourceType: "subscription", resourceId: id });
    revalidatePath("/subscriptions");
    redirect(`/subscriptions/${id}?updated=resumed`);
  }
  if (intent === "request_cancellation") {
    // This records intent and starts the user's own cancellation process. It is
    // not a cancellation with the provider and the UI must say so.
    await db
      .update(subscriptions)
      .set({
        status: "pending_cancellation",
        cancellationStatus: "requested",
        cancellationRequestedAt: now,
        ...base,
      })
      .where(eq(subscriptions.id, id));
    await recordAudit({
      userId: user.id,
      action: "subscription.cancellation_requested",
      resourceType: "subscription",
      resourceId: id,
      metadata: { providerAction: false },
    });
    revalidatePath("/subscriptions");
    redirect(`/subscriptions/${id}?updated=requested`);
  }
  if (intent === "confirm_cancellation") {
    await db
      .update(subscriptions)
      .set({
        status: "cancelled",
        cancellationStatus: "confirmed",
        cancelledAt: now,
        cancellationConfirmedAt: now,
        ...base,
      })
      .where(eq(subscriptions.id, id));
    await recordAudit({
      userId: user.id,
      action: "subscription.cancellation_confirmed_by_user",
      resourceType: "subscription",
      resourceId: id,
      metadata: { providerAction: false, selfReported: true },
    });
    revalidatePath("/subscriptions");
    redirect(`/subscriptions/${id}?updated=cancelled`);
  }
  if (intent === "mark_failed") {
    await db.update(subscriptions).set({ status: "payment_failed", ...base }).where(eq(subscriptions.id, id));
    revalidatePath("/subscriptions");
    redirect(`/subscriptions/${id}?updated=failed`);
  }
  if (intent === "reactivate") {
    await db
      .update(subscriptions)
      .set({ status: "active", cancellationStatus: "none", cancellationRequestedAt: null, cancelledAt: null, cancellationConfirmedAt: null, ...base })
      .where(eq(subscriptions.id, id));
    revalidatePath("/subscriptions");
    redirect(`/subscriptions/${id}?updated=reactivated`);
  }
  if (intent === "delete") {
    await db.delete(subscriptions).where(eq(subscriptions.id, id));
    await recordAudit({
      userId: user.id,
      action: "subscription.deleted",
      resourceType: "subscription",
      resourceId: id,
    });
    revalidatePath("/subscriptions");
    revalidatePath("/overview");
    redirect("/subscriptions?updated=deleted");
  }
  redirect(`/subscriptions/${id}`);
}

export async function recordPriceAction(
  _prev: SubscriptionFormState,
  formData: FormData,
): Promise<SubscriptionFormState> {
  const user = await requireUser();
  const id = clean(formData.get("id"));
  const price = parseMoney(clean(formData.get("price")), clean(formData.get("currency")) || "GBP");
  const currency = (clean(formData.get("currency")) || "GBP").toUpperCase();
  const frequencyValue = clean(formData.get("billingFrequency")) || "monthly";
  if (!id) return { error: "Missing subscription." };
  if (!price) return { error: "Enter a valid price." };

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, user.id)))
    .limit(1);
  if (!existing) return { error: "Subscription not found." };

  await db.insert(priceHistory).values({
    userId: user.id,
    subscriptionId: id,
    providerId: existing.providerId,
    price,
    currency,
    billingFrequency: frequencyValue as typeof existing.billingFrequency,
    source: "manual_price_check",
  });
  await db
    .update(subscriptions)
    .set({ price, currency, renewalPrice: price, renewalCurrency: currency, lastVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(subscriptions.id, id));
  await recordAudit({
    userId: user.id,
    action: "subscription.price_recorded",
    resourceType: "subscription",
    resourceId: id,
    metadata: { source: "manual_price_check" },
  });
  revalidatePath(`/subscriptions/${id}`);
  return { ok: true, message: "Price recorded. Price-increase detection will use this history." };
}
