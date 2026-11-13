"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { discounts, offers, providers, watchedDiscounts } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

export async function toggleWatchedProviderAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const providerId = String(formData.get("providerId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/discounts");
  if (!providerId) redirect(returnTo);
  const db = await getDb();
  const [provider] = await db.select({ id: providers.id }).from(providers).where(eq(providers.id, providerId)).limit(1);
  if (!provider) redirect(returnTo);

  const [existing] = await db
    .select()
    .from(watchedDiscounts)
    .where(and(eq(watchedDiscounts.userId, user.id), eq(watchedDiscounts.providerId, providerId)))
    .limit(1);

  if (existing) {
    await db.delete(watchedDiscounts).where(eq(watchedDiscounts.id, existing.id));
    await recordAudit({ userId: user.id, action: "discount.watch_removed", resourceType: "provider", resourceId: providerId });
  } else {
    await db.insert(watchedDiscounts).values({ userId: user.id, providerId }).onConflictDoNothing();
    await recordAudit({ userId: user.id, action: "discount.watch_added", resourceType: "provider", resourceId: providerId });
  }
  revalidatePath("/discounts");
  revalidatePath("/overview");
  redirect(returnTo);
}

/**
 * The user confirms they checked the offer on the provider's site. This is
 * self-reported evidence, not independent verification, so the status becomes
 * "recently_checked" and the note records the provenance.
 */
export async function markOfferCheckedAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const offerId = String(formData.get("offerId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/discover");
  if (!offerId) redirect(returnTo);
  const db = await getDb();
  const [offer] = await db.select().from(offers).where(eq(offers.id, offerId)).limit(1);
  if (!offer) redirect(returnTo);
  await db
    .update(offers)
    .set({
      verificationStatus: "recently_checked",
      lastVerifiedAt: new Date(),
      verificationNote:
        "Checked by the signed-in user against the provider's official page. Self-reported; re-check before relying on price or eligibility.",
      updatedAt: new Date(),
    })
    .where(eq(offers.id, offerId));
  await recordAudit({
    userId: user.id,
    action: "offer.checked_by_user",
    resourceType: "offer",
    resourceId: offerId,
    metadata: { selfReported: true },
  });
  revalidatePath("/discover");
  revalidatePath("/trials");
  redirect(`${returnTo}?checked=1`);
}

export async function markDiscountCheckedAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const discountId = String(formData.get("discountId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/discounts");
  if (!discountId) redirect(returnTo);
  const db = await getDb();
  const [discount] = await db.select().from(discounts).where(eq(discounts.id, discountId)).limit(1);
  if (!discount) redirect(returnTo);
  await db
    .update(discounts)
    .set({
      verificationStatus: "recently_checked",
      lastVerifiedAt: new Date(),
      verificationNote:
        "Checked by the signed-in user against the provider's official page. Self-reported; promotional codes still need testing at checkout.",
      updatedAt: new Date(),
    })
    .where(eq(discounts.id, discountId));
  await recordAudit({
    userId: user.id,
    action: "discount.checked_by_user",
    resourceType: "discount",
    resourceId: discountId,
    metadata: { selfReported: true },
  });
  revalidatePath("/discounts");
  redirect(`${returnTo}?checked=1`);
}
