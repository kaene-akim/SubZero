import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { exchangeRates, subscriptions } from "@/lib/db/schema";
import type { RateTable } from "@/lib/engines/currency";
import { toMinor, type CurrencyCode } from "@/lib/money";
import type { SubscriptionLike } from "@/lib/engines/billing";
import type { OptimisationSubscription } from "@/lib/engines/optimisation";
import type { Subscription, Provider } from "@/lib/db/schema";

export async function getRateTable(baseCurrency: CurrencyCode = "GBP"): Promise<RateTable> {
  const db = await getDb();
  const rows = await db.select().from(exchangeRates);
  return {
    baseCurrency,
    rates: rows.map((row) => ({
      base: row.base,
      quote: row.quote,
      rate: Number(row.rate),
      source: row.source,
      asOf: row.asOf,
    })),
  };
}

export type SubscriptionRow = Subscription & { provider: Provider | null };

export function toEngineSubscription(row: SubscriptionRow): OptimisationSubscription {
  const priceMinor = row.price === null ? null : toMinor(row.price, row.currency);
  const renewalPriceMinor =
    row.renewalPrice === null ? null : toMinor(row.renewalPrice, row.renewalCurrency);
  return {
    id: row.id,
    serviceName: row.serviceName,
    providerId: row.providerId,
    providerName: row.provider?.name ?? null,
    serviceFamily: row.provider?.serviceFamily ?? null,
    category: row.category,
    priceMinor,
    currency: row.currency,
    billingFrequency: row.billingFrequency,
    status: row.status,
    startDate: row.startDate,
    nextBillingDate: row.nextBillingDate,
    trialStartDate: row.trialStartDate,
    trialEndDate: row.trialEndDate,
    renewalPriceMinor,
    renewalCurrency: row.renewalCurrency,
  };
}

export function toBillingSubscription(row: SubscriptionRow): SubscriptionLike {
  return toEngineSubscription(row);
}

/** Basic ownership check used by every mutation. */
export async function userOwnsSubscription(
  userId: string,
  subscriptionId: string,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId)))
    .limit(1);
  return rows.length > 0;
}
