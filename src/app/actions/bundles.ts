"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  bundleItems,
  bundles,
  offers,
  providerIntegrations,
  subscriptions,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { addDaysISO, todayInTimeZone, isValidISODate } from "@/lib/dates";
import { scheduleBundle, type ScheduleItemInput } from "@/lib/engines/schedule";
import { getRateTable } from "@/lib/data/rates";
import { ensureDraftBundle, getBundleDetail } from "@/lib/data/queries";
import { toMinor } from "@/lib/money";
import { createNotification } from "@/lib/notifications";
import { withIdempotency } from "@/lib/idempotency";
import type { CurrencyCode } from "@/lib/money";

export type BundleFormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function clean(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

const bundleSchema = z.object({
  name: z.string().trim().min(1, "Give the bundle a name.").max(120),
  currency: z.string().trim().length(3).default("GBP"),
  targetBillingDate: z.string().optional(),
  preferredActivationDate: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function createBundleAction(
  _prev: BundleFormState,
  formData: FormData,
): Promise<BundleFormState> {
  const user = await requireUser();
  const parsed = bundleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the form.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }
  const data = parsed.data;
  if (data.targetBillingDate && !isValidISODate(data.targetBillingDate)) {
    return { error: "Choose a valid target billing date." };
  }
  const db = await getDb();
  const [bundle] = await db
    .insert(bundles)
    .values({
      userId: user.id,
      name: data.name,
      currency: data.currency.toUpperCase(),
      timezone: user.timezone,
      targetBillingDate: data.targetBillingDate || null,
      preferredActivationDate: data.preferredActivationDate || null,
      notes: data.notes || null,
    })
    .returning();
  await recordAudit({
    userId: user.id,
    action: "bundle.created",
    resourceType: "bundle",
    resourceId: bundle.id,
  });
  revalidatePath("/bundles");
  redirect(`/bundles/${bundle.id}`);
}

export async function addBundleItemAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const offerId = clean(formData.get("offerId"));
  const requestedBundleId = clean(formData.get("bundleId"));
  const returnTo = clean(formData.get("returnTo")) || "/bundles";
  if (!offerId) redirect(`${returnTo}?bundleError=missing-offer`);

  const db = await getDb();
  const [offer] = await db.select().from(offers).where(eq(offers.id, offerId)).limit(1);
  if (!offer) redirect(`${returnTo}?bundleError=offer-not-found`);

  const bundle = requestedBundleId
    ? (await db
        .select()
        .from(bundles)
        .where(and(eq(bundles.id, requestedBundleId), eq(bundles.userId, user.id)))
        .limit(1))[0]
    : await ensureDraftBundle(user.id, user.preferredCurrency);
  if (!bundle) redirect(`${returnTo}?bundleError=bundle-not-found`);
  if (bundle.status !== "draft") redirect(`${returnTo}?bundleError=bundle-locked`);

  const [existing] = await db
    .select()
    .from(bundleItems)
    .where(and(eq(bundleItems.bundleId, bundle.id), eq(bundleItems.offerId, offerId)))
    .limit(1);
  if (existing) redirect(`${returnTo}?bundleError=already-added`);

  await db.insert(bundleItems).values({
    bundleId: bundle.id,
    providerId: offer.providerId,
    offerId: offer.id,
    activationStatus: "awaiting_activation",
    activationMethod: "coordinated_checkout",
  });
  await db.update(bundles).set({ updatedAt: new Date() }).where(eq(bundles.id, bundle.id));
  await recordAudit({
    userId: user.id,
    action: "bundle.item_added",
    resourceType: "bundle",
    resourceId: bundle.id,
    metadata: { offerId },
  });
  revalidatePath("/bundles");
  revalidatePath(`/bundles/${bundle.id}`);
  redirect(requestedBundleId ? `${returnTo}?bundleAdded=1` : `/bundles/${bundle.id}?bundleAdded=1`);
}

export async function removeBundleItemAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const itemId = clean(formData.get("itemId"));
  const bundleId = clean(formData.get("bundleId"));
  const db = await getDb();
  const [bundle] = await db
    .select()
    .from(bundles)
    .where(and(eq(bundles.id, bundleId), eq(bundles.userId, user.id)))
    .limit(1);
  if (!bundle) redirect("/bundles");
  if (bundle.status !== "draft") redirect(`/bundles/${bundleId}?bundleError=bundle-locked`);
  await db.delete(bundleItems).where(and(eq(bundleItems.id, itemId), eq(bundleItems.bundleId, bundleId)));
  await db.update(bundles).set({ updatedAt: new Date() }).where(eq(bundles.id, bundleId));
  revalidatePath(`/bundles/${bundleId}`);
  redirect(`/bundles/${bundleId}?bundleRemoved=1`);
}

export async function updateBundleAction(
  _prev: BundleFormState,
  formData: FormData,
): Promise<BundleFormState> {
  const user = await requireUser();
  const id = clean(formData.get("id"));
  const parsed = bundleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Check the form.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }
  if (parsed.data.targetBillingDate && !isValidISODate(parsed.data.targetBillingDate)) {
    return { error: "Choose a valid target billing date." };
  }
  const db = await getDb();
  const [bundle] = await db
    .select()
    .from(bundles)
    .where(and(eq(bundles.id, id), eq(bundles.userId, user.id)))
    .limit(1);
  if (!bundle) return { error: "Bundle not found." };
  if (bundle.status !== "draft") return { error: "A scheduled bundle can no longer be edited. Create a new bundle to change the plan." };

  await db
    .update(bundles)
    .set({
      name: parsed.data.name,
      currency: parsed.data.currency.toUpperCase(),
      targetBillingDate: parsed.data.targetBillingDate || null,
      preferredActivationDate: parsed.data.preferredActivationDate || null,
      notes: parsed.data.notes || null,
      updatedAt: new Date(),
    })
    .where(eq(bundles.id, id));
  revalidatePath(`/bundles/${id}`);
  return { ok: true, message: "Bundle settings saved." };
}

export async function scheduleBundleAction(
  _prev: BundleFormState,
  formData: FormData,
): Promise<BundleFormState> {
  const user = await requireUser();
  const bundleId = clean(formData.get("id"));
  const consent = clean(formData.get("consent"));
  const target = clean(formData.get("targetBillingDate"));
  if (consent !== "on") {
    return {
      error:
        "Confirm that you understand SubZero cannot start provider trials for you and that renewal dates depend on completing each provider's checkout.",
    };
  }
  if (target && !isValidISODate(target)) return { error: "Choose a valid target billing date." };

  const detail = await getBundleDetail(user.id, bundleId);
  if (!detail) return { error: "Bundle not found." };
  if (detail.bundle.status !== "draft") return { error: "This bundle has already been scheduled." };
  if (detail.items.length === 0) return { error: "Add at least one offer before scheduling." };

  const today = todayInTimeZone(user.timezone);
  const targetDate = target || detail.bundle.targetBillingDate || addDaysISO(today, 30);
  const rateTable = await getRateTable(detail.bundle.currency as CurrencyCode);
  const db = await getDb();

  const offerIds = detail.items.map((i) => i.offerId).filter((v): v is string => Boolean(v));
  const offerRows = offerIds.length ? await db.select().from(offers).where(inArray(offers.id, offerIds)) : [];
  const offerMap = new Map(offerRows.map((o) => [o.id, o]));
  const integrationRows = await db.select().from(providerIntegrations);
  const integrationMap = new Map(integrationRows.map((i) => [i.providerId, i]));
  const activeSubs = await db
    .select({ providerId: subscriptions.providerId, status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id));
  const activeProviderIds = new Set(
    activeSubs
      .filter((s) => ["active", "trial", "payment_failed", "pending_cancellation"].includes(s.status))
      .map((s) => s.providerId)
      .filter((v): v is string => Boolean(v)),
  );

  const inputs: ScheduleItemInput[] = [];
  for (const item of detail.items) {
    if (!item.offer || !item.provider) continue;
    const offer = item.offer;
    inputs.push({
      offerId: offer.id,
      providerId: item.provider.id,
      providerName: item.provider.name,
      serviceName: offer.title,
      trialDurationDays: offer.trialDurationDays,
      renewalPriceMinor: toMinor(offer.renewalPrice, offer.renewalCurrency) ?? 0,
      currency: offer.renewalCurrency,
      billingFrequency: offer.billingFrequency,
      initialPriceMinor: toMinor(offer.initialPrice, offer.initialCurrency),
      capabilities: integrationMap.get(item.provider.id)?.capabilities ?? {},
      activationUrl: offer.registrationUrl,
      paymentMethodRequired: offer.paymentMethodRequired,
      countryAvailability: offer.countryAvailability,
      eligibility: offer.eligibility,
      cancellationRequirements: offer.cancellationRequirements,
      existingActiveProvider: activeProviderIds.has(item.provider.id),
    });
  }

  const schedule = scheduleBundle({
    items: inputs,
    context: {
      now: today,
      targetBillingDate: targetDate,
      timezone: user.timezone,
      leadTimeDays: 1,
      userCountry: user.country,
    },
    rateTable,
    currency: detail.bundle.currency as CurrencyCode,
  });

  const byOffer = new Map(schedule.items.map((i) => [i.offerId, i]));
  for (const item of detail.items) {
    const result = item.offerId ? byOffer.get(item.offerId) : null;
    if (!result) continue;
    await db
      .update(bundleItems)
      .set({
        activationStatus: result.status,
        activationMethod: result.activationMethod,
        scheduledActivationDate: result.activationDate,
        expectedRenewalDate: result.expectedRenewalDate,
        scheduling: {
          alignment: result.alignment,
          trialDurationDays: result.trialDurationDays,
          explanation: result.explanation,
          warnings: result.warnings,
          activationUrl: result.activationUrl,
          requiresImmediateActivation: result.requiresImmediateActivation,
          businessDayAdjusted: false,
        },
        statusReason: result.alignment === "unsupported"
          ? "The target renewal date is not achievable with this provider's activation model."
          : result.requiresUserCheckout
            ? "Waiting for you to complete the provider's official checkout."
            : "Scheduled.",
        updatedAt: new Date(),
      })
      .where(eq(bundleItems.id, item.id));
  }

  await db
    .update(bundles)
    .set({
      status: "scheduled",
      targetBillingDate: targetDate,
      activationStartedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bundles.id, bundleId));

  await createNotification({
    userId: user.id,
    bundleId,
    type: "bundle_scheduled",
    title: `${detail.bundle.name} schedule is ready`,
    body: schedule.summary.disclosure,
    href: `/bundles/${bundleId}`,
    dedupeKey: `bundle:scheduled:${bundleId}:${targetDate}`,
    metadata: { targetDate, itemCount: detail.items.length },
  });

  await recordAudit({
    userId: user.id,
    action: "bundle.scheduled",
    resourceType: "bundle",
    resourceId: bundleId,
    metadata: {
      targetDate,
      exact: schedule.summary.exactAlignmentCount,
      approximate: schedule.summary.approximateAlignmentCount,
      unsupported: schedule.summary.unsupportedAlignmentCount,
      providerActivation: false,
    },
  });

  revalidatePath(`/bundles/${bundleId}`);
  revalidatePath("/bundles");
  return {
    ok: true,
    message: `Schedule generated. ${schedule.summary.disclosure}`,
  };
}

export async function confirmBundleItemAction(
  _prev: BundleFormState,
  formData: FormData,
): Promise<BundleFormState> {
  const user = await requireUser();
  const itemId = clean(formData.get("itemId"));
  const bundleId = clean(formData.get("bundleId"));
  const confirmation = clean(formData.get("confirmation"));
  const actualRenewalDate = clean(formData.get("actualRenewalDate"));
  if (confirmation !== "on") {
    return { error: "Confirm that you completed the provider's official checkout and want to record the subscription." };
  }
  if (actualRenewalDate && !isValidISODate(actualRenewalDate)) {
    return { error: "Enter a valid renewal date, or leave it blank to use the expected date." };
  }

  try {
    const { result } = await withIdempotency({
      scope: "bundle.confirm_item",
      key: itemId,
      userId: user.id,
      run: async () => {
        const db = await getDb();
        const detail = await getBundleDetail(user.id, bundleId);
        if (!detail) throw new Error("Bundle not found.");
        const item = detail.items.find((i) => i.id === itemId);
        if (!item) throw new Error("Bundle item not found.");
        if (!item.offer || !item.provider) throw new Error("This bundle item is missing its offer.");
        if (item.activationStatus === "activated") {
          return { message: "This item has already been recorded as activated." };
        }
        if (!["scheduled", "ready_for_checkout", "awaiting_user_action"].includes(item.activationStatus)) {
          throw new Error("This item is not ready for activation confirmation.");
        }

        const offer = item.offer;
        const today = todayInTimeZone(user.timezone);
        const trialEnd = offer.trialDurationDays
          ? addDaysISO(actualRenewalDate || item.expectedRenewalDate || addDaysISO(today, offer.trialDurationDays), 0)
          : null;
        const renewalDate = actualRenewalDate || item.expectedRenewalDate || null;

        const [subscription] = await db
          .insert(subscriptions)
          .values({
            userId: user.id,
            providerId: item.provider!.id,
            serviceName: offer.title,
            category: item.provider!.category,
            price: offer.initialPrice,
            currency: offer.initialCurrency,
            billingFrequency: offer.billingFrequency,
            status: offer.trialDurationDays ? "trial" : "active",
            startDate: today,
            nextBillingDate: renewalDate,
            trialStartDate: offer.trialDurationDays ? today : null,
            trialEndDate: trialEnd,
            renewalPrice: offer.renewalPrice,
            renewalCurrency: offer.renewalCurrency,
            autoRenew: true,
            managementUrl: item.provider!.managementUrl,
            cancellationUrl: item.provider!.cancellationUrl,
            source: "bundle",
            lastVerifiedAt: new Date(),
          })
          .returning();

        await db
          .update(bundleItems)
          .set({
            activationStatus: "activated",
            subscriptionId: subscription.id,
            actualRenewalDate: renewalDate,
            activatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(bundleItems.id, itemId));

        const remaining = await db
          .select({ status: bundleItems.activationStatus })
          .from(bundleItems)
          .where(eq(bundleItems.bundleId, bundleId));
        const allActivated = remaining.every((r) => r.status === "activated" || r.status === "cancelled");
        const anyFailed = remaining.some((r) => r.status === "failed" || r.status === "requires_attention");
        await db
          .update(bundles)
          .set({
            status: allActivated ? "completed" : anyFailed ? "partially_failed" : "activating",
            completedAt: allActivated ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(bundles.id, bundleId));

        await recordAudit({
          userId: user.id,
          action: "bundle.item_confirmed_by_user",
          resourceType: "bundle_item",
          resourceId: itemId,
          metadata: {
            subscriptionId: subscription.id,
            selfReportedCheckout: true,
            providerAction: false,
          },
        });

        return {
          message: offer.trialDurationDays
            ? `${offer.title} recorded as a trial. Confirm the renewal date shown by the provider.`
            : `${offer.title} recorded as active.`,
          subscriptionId: subscription.id,
        };
      },
    });

    revalidatePath(`/bundles/${bundleId}`);
    revalidatePath("/subscriptions");
    revalidatePath("/overview");
    return { ok: true, message: result.message };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export async function markBundleItemFailedAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const itemId = clean(formData.get("itemId"));
  const bundleId = clean(formData.get("bundleId"));
  const db = await getDb();
  const [bundle] = await db
    .select()
    .from(bundles)
    .where(and(eq(bundles.id, bundleId), eq(bundles.userId, user.id)))
    .limit(1);
  if (!bundle) redirect("/bundles");
  await db
    .update(bundleItems)
    .set({
      activationStatus: "failed",
      lastError: "You reported that checkout could not be completed.",
      updatedAt: new Date(),
    })
    .where(and(eq(bundleItems.id, itemId), eq(bundleItems.bundleId, bundleId)));
  await db.update(bundles).set({ status: "partially_failed", updatedAt: new Date() }).where(eq(bundles.id, bundleId));
  revalidatePath(`/bundles/${bundleId}`);
  redirect(`/bundles/${bundleId}?bundleError=checkout-failed`);
}

export async function cancelBundleAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = clean(formData.get("id"));
  const db = await getDb();
  await db
    .update(bundles)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(bundles.id, id), eq(bundles.userId, user.id)));
  await recordAudit({ userId: user.id, action: "bundle.cancelled", resourceType: "bundle", resourceId: id });
  revalidatePath("/bundles");
  redirect(`/bundles/${id}`);
}

export async function deleteBundleAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = clean(formData.get("id"));
  const db = await getDb();
  await db.delete(bundles).where(and(eq(bundles.id, id), eq(bundles.userId, user.id)));
  await recordAudit({ userId: user.id, action: "bundle.deleted", resourceType: "bundle", resourceId: id });
  revalidatePath("/bundles");
  redirect("/bundles?updated=deleted");
}
