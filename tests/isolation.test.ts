import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { bundleItems, bundles, notifications, offers, providers } from "@/lib/db/schema";
import {
  getBundleDetail,
  getSubscription,
  listNotifications,
  listPendingDetections,
  listSubscriptions,
  unreadNotificationCount,
} from "@/lib/data/queries";
import { createSubscription, createUser } from "./helpers";

describe("user data isolation", () => {
  it("only lists the signed-in user's subscriptions", async () => {
    const first = await createUser();
    const second = await createUser();
    const firstSub = await createSubscription(first.id, { serviceName: "First Only" });
    await createSubscription(second.id, { serviceName: "Second Only" });

    const rows = await listSubscriptions(first.id);
    expect(rows.map((row) => row.id)).toEqual([firstSub.id]);
    expect(rows.some((row) => row.serviceName === "Second Only")).toBe(false);
  });

  it("refuses to read another user's subscription by id", async () => {
    const first = await createUser();
    const second = await createUser();
    const secondSub = await createSubscription(second.id);

    expect(await getSubscription(first.id, secondSub.id)).toBeNull();
    expect((await getSubscription(second.id, secondSub.id))?.id).toBe(secondSub.id);
  });

  it("refuses to read another user's bundle detail", async () => {
    const first = await createUser();
    const second = await createUser();
    const db = await getDb();
    const [bundle] = await db
      .insert(bundles)
      .values({ userId: second.id, name: "Second bundle", currency: "GBP" })
      .returning();

    expect(await getBundleDetail(first.id, bundle.id)).toBeNull();
    expect((await getBundleDetail(second.id, bundle.id))?.bundle.id).toBe(bundle.id);
  });

  it("scopes bundle items through the parent bundle", async () => {
    const first = await createUser();
    const second = await createUser();
    const db = await getDb();

    const [provider] = await db
      .insert(providers)
      .values({
        slug: `isolation-${Date.now()}`,
        name: "Isolation Provider",
        category: "Software and Productivity",
        website: "https://example.com",
      })
      .returning();
    const [offer] = await db
      .insert(offers)
      .values({
        providerId: provider.id,
        title: "Isolation offer",
        description: "Test offer",
        offerType: "standard_plan",
        renewalPrice: "9.99",
        renewalCurrency: "GBP",
        billingFrequency: "monthly",
        registrationUrl: "https://example.com/signup",
        source: "test",
        sourceUrl: "https://example.com/pricing",
        countryAvailability: ["GB"],
      })
      .returning();

    const [secondBundle] = await db
      .insert(bundles)
      .values({ userId: second.id, name: "Second bundle", currency: "GBP" })
      .returning();
    await db.insert(bundleItems).values({ bundleId: secondBundle.id, offerId: offer.id, providerId: provider.id });

    const detail = await getBundleDetail(first.id, secondBundle.id);
    expect(detail).toBeNull();
  });

  it("scopes detections and notifications to the owner", async () => {
    const first = await createUser();
    const second = await createUser();
    const db = await getDb();
    await db.insert(notifications).values({
      userId: second.id,
      notificationType: "renewal",
      title: "Second user reminder",
      body: "Private",
      scheduledAt: new Date(),
      dedupeKey: `isolation-${Date.now()}`,
      status: "sent",
    });

    expect(await listNotifications(first.id)).toHaveLength(0);
    expect(await unreadNotificationCount(first.id)).toBe(0);
    expect(await listPendingDetections(first.id)).toHaveLength(0);
    expect(await listNotifications(second.id)).toHaveLength(1);
  });
});
