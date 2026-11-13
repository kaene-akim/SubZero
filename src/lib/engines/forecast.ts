import { addDaysISO, addFrequency, daysBetween, type ISODate } from "@/lib/dates";
import { annualise, monthlyEquivalent, type CurrencyCode } from "@/lib/money";
import { convert, type RateTable } from "@/lib/engines/currency";
import {
  nextChargeDate,
  renewalAmount,
  type BillingFrequency,
  type SubscriptionLike,
} from "@/lib/engines/billing";

export type ForecastSubscription = SubscriptionLike & {
  providerName?: string | null;
  category: string;
};

export type ChargeEvent = {
  subscriptionId: string;
  serviceName: string;
  category: string;
  date: ISODate;
  amountMinor: number;
  currency: CurrencyCode;
  kind: "trial_conversion" | "renewal" | "first_charge";
  uncertain: boolean;
  convertedMinor: number | null;
  conversionNote: string | null;
};

export type ForecastSummary = {
  horizonDays: number;
  endDate: ISODate;
  totalMinor: number;
  byCurrency: Array<{ currency: CurrencyCode; amountMinor: number }>;
  unconvertedCurrencies: CurrencyCode[];
  events: ChargeEvent[];
  monthlyBuckets: Array<{ month: string; amountMinor: number; eventCount: number }>;
  rateNote: string;
};

export type ForecastResult = {
  from: ISODate;
  baseCurrency: CurrencyCode;
  periods: ForecastSummary[];
  annualisedRecurringMinor: number;
  issues: string[];
};

function monthlyEquivalentConverted(
  amountMinor: number,
  currency: CurrencyCode,
  frequency: BillingFrequency,
  table: RateTable,
): number | null {
  const annual = annualise(amountMinor, frequency);
  const converted = convert(annual, currency, table.baseCurrency, table);
  return converted.ok ? converted.amountMinor : null;
}

export function buildForecast(input: {
  subscriptions: ForecastSubscription[];
  from: ISODate;
  rateTable: RateTable;
  periods?: number[];
}): ForecastResult {
  const periods = input.periods ?? [30, 90, 365];
  const maxDays = Math.max(...periods);
  const issues: string[] = [];
  const events: ChargeEvent[] = [];
  const table = input.rateTable;

  for (const sub of input.subscriptions) {
    if (["cancelled", "expired", "paused"].includes(sub.status)) continue;

    const { amountMinor, currency } = renewalAmount(sub);
    if (amountMinor === null) {
      issues.push(`${sub.serviceName} has no known price; it is excluded from the forecast.`);
      continue;
    }

    let cursor = nextChargeDate(sub, input.from);
    if (!cursor) {
      if (sub.status === "trial" && sub.trialEndDate) {
        cursor = sub.trialEndDate < input.from ? null : sub.trialEndDate;
      }
      if (!cursor) {
        issues.push(`${sub.serviceName} has no billing date; it is excluded from the forecast.`);
        continue;
      }
    }

    const horizonEnd = addDaysISO(input.from, maxDays);
    const anchorDay = Number(cursor.slice(8, 10));
    let guard = 0;
    let first = true;
    while (cursor && cursor <= horizonEnd && guard < 400) {
      const converted = convert(amountMinor, currency, table.baseCurrency, table);
      events.push({
        subscriptionId: sub.id,
        serviceName: sub.serviceName,
        category: sub.category,
        date: cursor,
        amountMinor,
        currency,
        kind:
          sub.status === "trial" && first
            ? "trial_conversion"
            : first && sub.startDate && daysBetween(input.from, cursor) > 0
              ? "first_charge"
              : "renewal",
        uncertain: sub.status === "pending_cancellation" || sub.status === "payment_failed",
        convertedMinor: converted.ok ? converted.amountMinor : null,
        conversionNote: converted.ok ? null : converted.reason,
      });
      first = false;
      cursor = addFrequency(cursor, sub.billingFrequency, 1, anchorDay);
      guard++;
    }
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const summaries: ForecastSummary[] = periods.map((horizon) => {
    const endDate = addDaysISO(input.from, horizon);
    const periodEvents = events.filter((e) => e.date <= endDate);
    const byCurrency = new Map<CurrencyCode, number>();
    let totalMinor = 0;
    let unconverted = false;
    const monthly = new Map<string, { amountMinor: number; eventCount: number }>();

    for (const event of periodEvents) {
      byCurrency.set(event.currency, (byCurrency.get(event.currency) ?? 0) + event.amountMinor);
      if (event.convertedMinor !== null) {
        totalMinor += event.convertedMinor;
        const month = event.date.slice(0, 7);
        const bucket = monthly.get(month) ?? { amountMinor: 0, eventCount: 0 };
        bucket.amountMinor += event.convertedMinor;
        bucket.eventCount += 1;
        monthly.set(month, bucket);
      } else {
        unconverted = true;
      }
    }

    return {
      horizonDays: horizon,
      endDate,
      totalMinor,
      byCurrency: [...byCurrency.entries()].map(([currency, amountMinor]) => ({
        currency,
        amountMinor,
      })),
      unconvertedCurrencies: unconverted
        ? [...new Set(periodEvents.filter((e) => e.convertedMinor === null).map((e) => e.currency))]
        : [],
      events: periodEvents,
      monthlyBuckets: [...monthly.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([month, v]) => ({ month, ...v })),
      rateNote:
        periodEvents.some((e) => e.conversionNote)
          ? "Some amounts could not be converted and are excluded from the base-currency total."
          : "Converted using documented reference rates; indicative only.",
    };
  });

  const annualisedRecurringMinor = input.subscriptions.reduce((sum, sub) => {
    if (["cancelled", "expired", "paused"].includes(sub.status)) return sum;
    const { amountMinor, currency } = renewalAmount(sub);
    if (amountMinor === null) return sum;
    const converted = monthlyEquivalentConverted(amountMinor, currency, sub.billingFrequency, table);
    return sum + (converted ?? 0);
  }, 0);

  return {
    from: input.from,
    baseCurrency: table.baseCurrency,
    periods: summaries,
    annualisedRecurringMinor,
    issues,
  };
}

/** Monthly-equivalent spend grouped by category, converted where possible. */
export function spendByCategory(
  subscriptions: ForecastSubscription[],
  table: RateTable,
): Array<{ category: string; amountMinor: number; unconverted: boolean }> {
  const map = new Map<string, { amountMinor: number; unconverted: boolean }>();
  for (const sub of subscriptions) {
    if (["cancelled", "expired", "paused"].includes(sub.status)) continue;
    const { amountMinor, currency } = renewalAmount(sub);
    if (amountMinor === null) continue;
    const monthly = monthlyEquivalent(amountMinor, sub.billingFrequency);
    const converted = convert(monthly, currency, table.baseCurrency, table);
    const entry = map.get(sub.category) ?? { amountMinor: 0, unconverted: false };
    if (converted.ok) entry.amountMinor += converted.amountMinor;
    else entry.unconverted = true;
    map.set(sub.category, entry);
  }
  return [...map.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

export function spendByProvider(
  subscriptions: ForecastSubscription[],
  table: RateTable,
): Array<{ provider: string; amountMinor: number }> {
  const map = new Map<string, number>();
  for (const sub of subscriptions) {
    if (["cancelled", "expired", "paused"].includes(sub.status)) continue;
    const { amountMinor, currency } = renewalAmount(sub);
    if (amountMinor === null) continue;
    const monthly = monthlyEquivalent(amountMinor, sub.billingFrequency);
    const converted = convert(monthly, currency, table.baseCurrency, table);
    if (!converted.ok) continue;
    const name = sub.providerName ?? sub.serviceName;
    map.set(name, (map.get(name) ?? 0) + converted.amountMinor);
  }
  return [...map.entries()]
    .map(([provider, amountMinor]) => ({ provider, amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}
