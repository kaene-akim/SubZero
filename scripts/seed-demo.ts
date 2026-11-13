/**
 * Demo data seeder.
 *
 * Creates a clearly labelled demo account and synthetic records so the UI can be
 * explored without connecting a real inbox or bank. Every subscription is
 * written with source "demo" and a note that it is synthetic. These records are
 * NOT real subscriptions, do not represent money owed to any provider, and are
 * never created automatically for real users.
 *
 * Run with: npm run db:seed:demo
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { and, eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import {
  bundleItems,
  bundles,
  offers,
  priceHistory,
  providers,
  subscriptions,
  users,
} from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { addDaysISO, todayInTimeZone } from "../src/lib/dates";
import { generateNotificationsForUser } from "../src/lib/notifications";

const DEMO_EMAIL = "demo@subzero.local";
const DEMO_PASSWORD = "SubZeroDemo2026!";

const DEMO_NOTE =
  "DEMO DATA — synthetic record created by scripts/seed-demo.ts. Not a real subscription, not a real charge.";

type DemoSubscription = {
  serviceSlug: string;
  status: "active" | "trial" | "paused";
  price: string;
  currency: string;
  billingFrequency: "monthly" | "annual" | "quarterly";
  offsetDays: number;
  trialEndOffsetDays?: number;
  startOffsetDays?: number;
  notes?: string;
};

const demoSubscriptions: DemoSubscription[] = [
  {
    serviceSlug: "netflix",
    status: "active",
    price: "12.99",
    currency: "GBP",
    billingFrequency: "monthly",
    offsetDays: 9,
    startOffsetDays: -240,
  },
  {
    serviceSlug: "spotify",
    status: "trial",
    price: "11.99",
    currency: "GBP",
    billingFrequency: "monthly",
    offsetDays: 3,
    trialEndOffsetDays: 3,
    startOffsetDays: -27,
  },
  {
    serviceSlug: "adobe-acrobat",
    status: "active",
    price: "19.99",
    currency: "GBP",
    billingFrequency: "monthly",
    offsetDays: 17,
    startOffsetDays: -420,
    notes: "Annual commitment billed monthly. Synthetic demo record.",
  },
  {
    serviceSlug: "icloud-plus",
    status: "active",
    price: "2.99",
    currency: "GBP",
    billingFrequency: "monthly",
    offsetDays: 22,
    startOffsetDays: -600,
  },
  {
    serviceSlug: "notion",
    status: "active",
    price: "96.00",
    currency: "GBP",
    billingFrequency: "annual",
    offsetDays: 64,
    startOffsetDays: -300,
    notes: "Annual plan. Synthetic demo record.",
  },
];

async function main() {
  const db = await getDb();
  const today = todayInTimeZone("Europe/London");

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  let [user] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        name: "Demo Account",
        email: DEMO_EMAIL,
        passwordHash,
        emailVerifiedAt: new Date(),
        onboardingCompletedAt: new Date(),
        country: "GB",
        timezone: "Europe/London",
        preferredCurrency: "GBP",
        monthlyBudget: "120.00",
        preferredBillingDay: 1,
        trialReminderDays: [7, 3, 1, 0],
      })
      .returning();
    console.log(`Created demo user ${DEMO_EMAIL}`);
  } else {
    await db
      .update(users)
      .set({ passwordHash, onboardingCompletedAt: new Date(), emailVerifiedAt: new Date() })
      .where(eq(users.id, user.id));
    console.log(`Reusing demo user ${DEMO_EMAIL}`);
  }

  const providerRows = await db.select().from(providers);
  const bySlug = new Map(providerRows.map((row) => [row.slug, row]));

  let created = 0;
  for (const demo of demoSubscriptions) {
    const provider = bySlug.get(demo.serviceSlug);
    if (!provider) {
      console.warn(`Skipping ${demo.serviceSlug}: provider not in catalog. Run npm run db:seed first.`);
      continue;
    }
    const dedupeKey = `demo:${demo.serviceSlug}:${user.id}`;
    const existing = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.dedupeKey, dedupeKey)))
      .limit(1);
    if (existing[0]) continue;

    const isTrial = demo.status === "trial";
    const [row] = await db
      .insert(subscriptions)
      .values({
        userId: user.id,
        providerId: provider.id,
        serviceName: provider.name,
        category: provider.category,
        price: demo.price,
        currency: demo.currency,
        billingFrequency: demo.billingFrequency,
        status: demo.status,
        startDate: demo.startOffsetDays ? addDaysISO(today, demo.startOffsetDays) : null,
        nextBillingDate: isTrial ? null : addDaysISO(today, demo.offsetDays),
        trialStartDate: isTrial && demo.startOffsetDays ? addDaysISO(today, demo.startOffsetDays) : null,
        trialEndDate: isTrial && demo.trialEndOffsetDays ? addDaysISO(today, demo.trialEndOffsetDays) : null,
        renewalPrice: demo.price,
        renewalCurrency: demo.currency,
        autoRenew: true,
        managementUrl: provider.managementUrl,
        cancellationUrl: provider.cancellationUrl,
        source: "demo",
        dedupeKey,
        notes: demo.notes ? `${DEMO_NOTE} ${demo.notes}` : DEMO_NOTE,
      })
      .returning();

    await db.insert(priceHistory).values({
      userId: user.id,
      providerId: provider.id,
      subscriptionId: row.id,
      price: demo.price,
      currency: demo.currency,
      billingFrequency: demo.billingFrequency,
      source: "demo",
    });
    created += 1;
  }

  // A demo bundle assembled from real catalog offers, left in draft so nothing
  // is ever activated by seeding. The UI still shows each offer as unverified.
  const existingBundle = await db
    .select({ id: bundles.id })
    .from(bundles)
    .where(and(eq(bundles.userId, user.id), eq(bundles.name, "Demo entertainment bundle")))
    .limit(1);

  if (!existingBundle[0]) {
    const [bundle] = await db
      .insert(bundles)
      .values({
        userId: user.id,
        name: "Demo entertainment bundle",
        status: "draft",
        currency: "GBP",
        timezone: "Europe/London",
        targetBillingDate: addDaysISO(today, 30),
        notes: "DEMO BUNDLE — synthetic plan. No provider was contacted and nothing was activated.",
      })
      .returning();

    const bundleSlugs = ["netflix", "spotify", "youtube-premium"];
    for (const slug of bundleSlugs) {
      const provider = bySlug.get(slug);
      if (!provider) continue;
      const [offer] = await db
        .select({ id: offers.id })
        .from(offers)
        .where(eq(offers.providerId, provider.id))
        .limit(1);
      await db.insert(bundleItems).values({
        bundleId: bundle.id,
        providerId: provider.id,
        offerId: offer?.id ?? null,
        activationStatus: "awaiting_activation",
        activationMethod: "coordinated_checkout",
        scheduledActivationDate: addDaysISO(today, 23),
        expectedRenewalDate: addDaysISO(today, 30),
        scheduling: {
          alignment: "approximate",
          trialDurationDays: null,
          explanation:
            "Demo plan only. SubZero has not contacted the provider; activation requires your own checkout.",
          warnings: ["Synthetic demo bundle. Prices and dates are illustrative."],
        },
      });
    }
  }

  const notificationsCreated = await generateNotificationsForUser(user, today);

  console.log(
    `Demo seed complete: ${created} new synthetic subscription(s), ${notificationsCreated} reminder(s).`,
  );
  console.log(`Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log("All demo records are labelled synthetic and can be removed by deleting this account.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
