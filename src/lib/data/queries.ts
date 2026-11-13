import { and, asc, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  bundleItems,
  bundles,
  connectedAccounts,
  discounts,
  emailDetections,
  notifications,
  offers,
  priceHistory,
  providerIntegrations,
  providers,
  subscriptions,
  watchedDiscounts,
  type Bundle,
  type BundleItem,
  type Discount,
  type Offer,
  type Provider,
  type ProviderIntegration,
  type User,
} from "@/lib/db/schema";
import { todayInTimeZone } from "@/lib/dates";
import { toMinor } from "@/lib/money";
import type { DiscountLike } from "@/lib/engines/discounts";
import { buildForecast } from "@/lib/engines/forecast";
import {
  optimisePortfolio,
  detectPriceIncreases,
  type PriceChange,
} from "@/lib/engines/optimisation";
import {
  getRateTable,
  toEngineSubscription,
  toBillingSubscription,
  type SubscriptionRow,
} from "@/lib/data/rates";

export type OfferWithProvider = Offer & { provider: Provider; integration: ProviderIntegration | null };
export type DiscountWithProvider = Discount & { provider: Provider };

const ACTIVE_STATUSES = ["active", "trial", "payment_failed", "pending_cancellation"] as const;

export async function listSubscriptions(userId: string): Promise<SubscriptionRow[]> {
  const db = await getDb();
  const rows = await db
    .select({ subscription: subscriptions, provider: providers })
    .from(subscriptions)
    .leftJoin(providers, eq(providers.id, subscriptions.providerId))
    .where(eq(subscriptions.userId, userId))
    .orderBy(asc(subscriptions.nextBillingDate), asc(subscriptions.serviceName));
  return rows.map((row) => ({ ...row.subscription, provider: row.provider }));
}

export async function getSubscription(
  userId: string,
  id: string,
): Promise<SubscriptionRow | null> {
  const db = await getDb();
  const rows = await db
    .select({ subscription: subscriptions, provider: providers })
    .from(subscriptions)
    .leftJoin(providers, eq(providers.id, subscriptions.providerId))
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
    .limit(1);
  const row = rows[0];
  return row ? { ...row.subscription, provider: row.provider } : null;
}

export async function listCatalogProviders(): Promise<Provider[]> {
  const db = await getDb();
  return db.select().from(providers).orderBy(asc(providers.name));
}

export async function listOffers(options?: {
  includeInactive?: boolean;
}): Promise<OfferWithProvider[]> {
  const db = await getDb();
  const rows = await db
    .select({ offer: offers, provider: providers, integration: providerIntegrations })
    .from(offers)
    .innerJoin(providers, eq(providers.id, offers.providerId))
    .leftJoin(providerIntegrations, eq(providerIntegrations.providerId, providers.id))
    .where(options?.includeInactive ? undefined : eq(offers.isActive, true))
    .orderBy(asc(providers.name), asc(offers.trialDurationDays));
  return rows.map((row) => ({ ...row.offer, provider: row.provider, integration: row.integration }));
}

export async function getOffer(id: string): Promise<OfferWithProvider | null> {
  const db = await getDb();
  const rows = await db
    .select({ offer: offers, provider: providers, integration: providerIntegrations })
    .from(offers)
    .innerJoin(providers, eq(providers.id, offers.providerId))
    .leftJoin(providerIntegrations, eq(providerIntegrations.providerId, providers.id))
    .where(eq(offers.id, id))
    .limit(1);
  const row = rows[0];
  return row ? { ...row.offer, provider: row.provider, integration: row.integration } : null;
}

export async function listDiscounts(): Promise<DiscountWithProvider[]> {
  const db = await getDb();
  const rows = await db
    .select({ discount: discounts, provider: providers })
    .from(discounts)
    .innerJoin(providers, eq(providers.id, discounts.providerId))
    .where(eq(discounts.isActive, true))
    .orderBy(asc(providers.name), asc(discounts.title));
  return rows.map((row) => ({ ...row.discount, provider: row.provider }));
}

export function toDiscountLike(row: DiscountWithProvider): DiscountLike {
  return {
    id: row.id,
    providerId: row.providerId,
    providerName: row.provider.name,
    title: row.title,
    originalPriceMinor: toMinor(row.originalPrice, row.currency) ?? 0,
    discountedPriceMinor: toMinor(row.discountedPrice, row.currency) ?? 0,
    currency: row.currency,
    discountPercentage: Number(row.discountPercentage),
    billingFrequency: row.billingFrequency,
    durationMonths: row.durationMonths,
    promotionalCode: row.promotionalCode,
    eligibility: row.eligibility,
    isStudent: row.isStudent,
    newCustomersOnly: row.newCustomersOnly,
    existingCustomersOnly: row.existingCustomersOnly,
    verificationStatus: row.verificationStatus,
    expirationDate: row.expirationDate,
    redemptionUrl: row.redemptionUrl,
  };
}

export async function listConnectedAccounts(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.userId, userId))
    .orderBy(asc(connectedAccounts.createdAt));
}

export async function getGmailConnection(userId: string) {
  const accounts = await listConnectedAccounts(userId);
  return accounts.find((a) => a.provider === "google") ?? null;
}

export async function listPendingDetections(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({ detection: emailDetections, provider: providers })
    .from(emailDetections)
    .leftJoin(providers, eq(providers.id, emailDetections.providerId))
    .where(
      and(
        eq(emailDetections.userId, userId),
        inArray(emailDetections.reviewStatus, ["pending", "auto_confirmed"]),
      ),
    )
    .orderBy(desc(emailDetections.detectedAt))
    .limit(100);
  return rows.map((row) => ({ ...row.detection, provider: row.provider }));
}

export async function listRecentDetections(userId: string, limit = 20) {
  const db = await getDb();
  const rows = await db
    .select({ detection: emailDetections, provider: providers })
    .from(emailDetections)
    .leftJoin(providers, eq(providers.id, emailDetections.providerId))
    .where(eq(emailDetections.userId, userId))
    .orderBy(desc(emailDetections.detectedAt))
    .limit(limit);
  return rows.map((row) => ({ ...row.detection, provider: row.provider }));
}

export async function listNotifications(userId: string, limit = 50) {
  const db = await getDb();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.scheduledAt))
    .limit(limit);
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.status, "sent"),
        sql`${notifications.readAt} is null`,
      ),
    );
  return row?.count ?? 0;
}

export async function getWatchedProviderIds(userId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ providerId: watchedDiscounts.providerId })
    .from(watchedDiscounts)
    .where(eq(watchedDiscounts.userId, userId));
  return rows.map((r) => r.providerId);
}

export async function getPriceHistory(userId: string, subscriptionId: string) {
  const db = await getDb();
  return db
    .select()
    .from(priceHistory)
    .where(
      and(eq(priceHistory.userId, userId), eq(priceHistory.subscriptionId, subscriptionId)),
    )
    .orderBy(asc(priceHistory.recordedAt));
}

async function getPriceChanges(userId: string): Promise<PriceChange[]> {
  const db = await getDb();
  const rows = await db
    .select({
      subscriptionId: priceHistory.subscriptionId,
      serviceName: subscriptions.serviceName,
      price: priceHistory.price,
      currency: priceHistory.currency,
      billingFrequency: priceHistory.billingFrequency,
      recordedAt: priceHistory.recordedAt,
      source: priceHistory.source,
    })
    .from(priceHistory)
    .innerJoin(subscriptions, eq(subscriptions.id, priceHistory.subscriptionId))
    .where(eq(priceHistory.userId, userId))
    .orderBy(asc(priceHistory.recordedAt));
  return detectPriceIncreases(
    rows.map((row) => ({
      subscriptionId: row.subscriptionId ?? "",
      serviceName: row.serviceName,
      priceMinor: toMinor(row.price, row.currency) ?? 0,
      currency: row.currency,
      billingFrequency: row.billingFrequency,
      recordedAt: row.recordedAt,
      source: row.source,
    })),
  );
}

export type DashboardData = {
  today: string;
  rows: SubscriptionRow[];
  active: SubscriptionRow[];
  trials: SubscriptionRow[];
  monthlyMinor: number;
  annualMinor: number;
  forecast: ReturnType<typeof buildForecast>;
  optimisation: ReturnType<typeof optimisePortfolio>;
  pendingDetections: Awaited<ReturnType<typeof listPendingDetections>>;
  notifications: Awaited<ReturnType<typeof listNotifications>>;
  rateNote: string;
};

export async function getDashboardData(user: User): Promise<DashboardData> {
  const today = todayInTimeZone(user.timezone);
  const [rows, rateTable, discountRows, pendingDetections, notificationRows] = await Promise.all([
    listSubscriptions(user.id),
    getRateTable(user.preferredCurrency),
    listDiscounts(),
    listPendingDetections(user.id),
    listNotifications(user.id, 8),
  ]);

  const active = rows.filter((r) => ACTIVE_STATUSES.includes(r.status as (typeof ACTIVE_STATUSES)[number]));
  const engineSubs = active.map(toEngineSubscription);
  const forecast = buildForecast({
    subscriptions: engineSubs,
    from: today,
    rateTable,
  });
  const priceChanges = await getPriceChanges(user.id);
  const optimisation = optimisePortfolio({
    subscriptions: rows.map(toEngineSubscription),
    discounts: discountRows.map(toDiscountLike),
    priceChanges,
    rateTable,
    baseCurrency: user.preferredCurrency,
    today,
    isStudent: user.studentEligible,
    monthlyBudgetMinor: user.monthlyBudget === null ? null : toMinor(user.monthlyBudget, user.preferredCurrency),
  });

  return {
    today,
    rows,
    active,
    trials: rows.filter((r) => r.status === "trial"),
    monthlyMinor: Math.round(optimisation.currentMonthlyMinor),
    annualMinor: forecast.annualisedRecurringMinor,
    forecast,
    optimisation,
    pendingDetections,
    notifications: notificationRows,
    rateNote: rateTable.rates.length
      ? `Converted at ${rateTable.rates[0]?.source ?? "reference rates"} (${rateTable.rates[0]?.asOf ?? "unknown date"}). Indicative only.`
      : "No exchange rates configured; totals are shown per currency.",
  };
}

export async function getDraftBundle(userId: string): Promise<Bundle | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(bundles)
    .where(and(eq(bundles.userId, userId), eq(bundles.status, "draft")))
    .orderBy(desc(bundles.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function ensureDraftBundle(userId: string, currency: string): Promise<Bundle> {
  const existing = await getDraftBundle(userId);
  if (existing) return existing;
  const db = await getDb();
  const [created] = await db
    .insert(bundles)
    .values({ userId, name: "My bundle", currency, status: "draft" })
    .returning();
  return created;
}

export type BundleItemWithOffer = BundleItem & { offer: Offer | null; provider: Provider | null };

export async function getBundleDetail(
  userId: string,
  bundleId: string,
): Promise<{ bundle: Bundle; items: BundleItemWithOffer[] } | null> {
  const db = await getDb();
  const [bundle] = await db
    .select()
    .from(bundles)
    .where(and(eq(bundles.id, bundleId), eq(bundles.userId, userId)))
    .limit(1);
  if (!bundle) return null;
  const rows = await db
    .select({ item: bundleItems, offer: offers, provider: providers })
    .from(bundleItems)
    .leftJoin(offers, eq(offers.id, bundleItems.offerId))
    .leftJoin(providers, eq(providers.id, bundleItems.providerId))
    .where(eq(bundleItems.bundleId, bundleId))
    .orderBy(asc(bundleItems.createdAt));
  return {
    bundle,
    items: rows.map((row) => ({ ...row.item, offer: row.offer, provider: row.provider })),
  };
}

export async function listBundles(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({ bundle: bundles, itemCount: count(bundleItems.id) })
    .from(bundles)
    .leftJoin(bundleItems, eq(bundleItems.bundleId, bundles.id))
    .where(eq(bundles.userId, userId))
    .groupBy(bundles.id)
    .orderBy(desc(bundles.updatedAt));
  return rows.map((row) => ({ ...row.bundle, itemCount: Number(row.itemCount) }));
}

export async function getPortfolioForDiscounts(user: User) {
  const rows = await listSubscriptions(user.id);
  return rows.map(toBillingSubscription);
}

export async function listRenewalsInRange(userId: string, start: string, end: string) {
  const db = await getDb();
  const rows = await db
    .select({ subscription: subscriptions, provider: providers })
    .from(subscriptions)
    .leftJoin(providers, eq(providers.id, subscriptions.providerId))
    .where(
      and(
        eq(subscriptions.userId, userId),
        or(
          and(gte(subscriptions.nextBillingDate, start), lte(subscriptions.nextBillingDate, end)),
          and(gte(subscriptions.trialEndDate, start), lte(subscriptions.trialEndDate, end)),
        ),
      ),
    )
    .orderBy(asc(subscriptions.nextBillingDate));
  return rows.map((row) => ({ ...row.subscription, provider: row.provider }));
}

export async function getActiveSubscriptionCounts(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({ status: subscriptions.status, count: count() })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .groupBy(subscriptions.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}
