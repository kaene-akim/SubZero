import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import {
  bundleItems,
  bundles,
  offers,
  providerIntegrations,
  providers,
  subscriptions,
} from "@/lib/db/schema";
import { getBundleDetail } from "@/lib/data/queries";
import { scheduleBundle, type ScheduleItemInput } from "@/lib/engines/schedule";
import type { RateTable } from "@/lib/engines/currency";
import { createUser } from "./helpers";

const rateTable: RateTable = { baseCurrency: "GBP", rates: [] };

async function seedBundle() {
  const db = await getDb();
  const user = await createUser();
  const [provider] = await db
    .insert(providers)
    .values({
      slug: `schedule-${randomUUID()}`,
      name: "Coordinated Provider",
      category: "Software and Productivity",
      website: "https://example.com",
      integrationType: "coordinated_checkout",
    })
    .returning();
  const [offer] = await db
    .insert(offers)
    .values({
      providerId: provider.id,
      title: "30-day trial plan",
      description: "Reference offer",
      offerType: "free_trial",
      trialDurationDays: 30,
      renewalPrice: "12.00",
      renewalCurrency: "GBP",
      billingFrequency: "monthly",
      registrationUrl: "https://example.com/signup",
      source: "test",
      sourceUrl: "https://example.com/pricing",
      countryAvailability: ["GB"],
    })
    .returning();
  await db.insert(providerIntegrations).values({
    providerId: provider.id,
    integrationType: "coordinated_checkout",
    capabilities: { delayedActivation: false, billingDateChange: false, immediateActivationRequired: true },
    configurationStatus: "not_configured",
    supportedOperations: [],
  });
  const [bundle] = await db
    .insert(bundles)
    .values({
      userId: user.id,
      name: "Scheduling bundle",
      currency: "GBP",
      targetBillingDate: "2026-12-01",
      status: "draft",
    })
    .returning();
  const [item] = await db
    .insert(bundleItems)
    .values({ bundleId: bundle.id, providerId: provider.id, offerId: offer.id })
    .returning();
  return { user, provider, offer, bundle, item };
}

describe("bundle scheduling integration", () => {
  it("plans without activating or creating subscriptions", async () => {
    const { user, provider, offer, bundle, item } = await seedBundle();

    const detail = await getBundleDetail(user.id, bundle.id);
    expect(detail?.items[0].activationStatus).toBe("awaiting_activation");
    expect(detail?.items[0].activatedAt).toBeNull();

    const input: ScheduleItemInput = {
      offerId: offer.id,
      providerId: provider.id,
      providerName: provider.name,
      serviceName: offer.title,
      trialDurationDays: offer.trialDurationDays,
      renewalPriceMinor: 1200,
      currency: "GBP",
      billingFrequency: "monthly",
      capabilities: { delayedActivation: false, billingDateChange: false, immediateActivationRequired: true },
      activationUrl: offer.registrationUrl,
      paymentMethodRequired: true,
      countryAvailability: offer.countryAvailability,
    };

    const plan = scheduleBundle({
      items: [input],
      context: {
        now: "2026-11-12",
        targetBillingDate: "2026-12-01",
        timezone: "Europe/London",
        userCountry: "GB",
        leadTimeDays: 0,
      },
      rateTable,
      currency: "GBP",
    });

    expect(plan.items[0].alignment).toBe("unsupported");
    expect(plan.items[0].requiresUserCheckout).toBe(true);
    expect(plan.summary.disclosure).toMatch(/provider|not synchronised|checkout/i);

    const db = await getDb();
    const [storedItem] = await db.select().from(bundleItems).where(eq(bundleItems.id, item.id));
    expect(storedItem.activationStatus).toBe("awaiting_activation");
    expect(storedItem.activatedAt).toBeNull();

    const created = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    expect(created).toHaveLength(0);
  });

  it("refuses another user's bundle when mapping a schedule", async () => {
    const { bundle } = await seedBundle();
    const intruder = await createUser();
    expect(await getBundleDetail(intruder.id, bundle.id)).toBeNull();
  });
});
