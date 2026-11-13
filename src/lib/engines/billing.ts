import { addDaysISO, addFrequency, daysBetween, isValidISODate, type ISODate } from "@/lib/dates";
import { annualise, monthlyEquivalent, type CurrencyCode } from "@/lib/money";

export type BillingFrequency =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

export type SubscriptionLike = {
  id: string;
  serviceName: string;
  category: string;
  priceMinor: number | null;
  currency: CurrencyCode;
  billingFrequency: BillingFrequency;
  status: string;
  startDate: ISODate | null;
  nextBillingDate: ISODate | null;
  trialStartDate?: ISODate | null;
  trialEndDate?: ISODate | null;
  renewalPriceMinor?: number | null;
  renewalCurrency?: CurrencyCode | null;
  providerId?: string | null;
  providerName?: string | null;
};

/** The next charge date on or after `from` for a subscription. */
export function nextChargeDate(sub: SubscriptionLike, from: ISODate): ISODate | null {
  if (["cancelled", "expired", "paused"].includes(sub.status)) return null;

  if (sub.status === "trial") {
    if (!sub.trialEndDate) return null;
    return sub.trialEndDate >= from ? sub.trialEndDate : null;
  }

  if (!sub.nextBillingDate) {
    if (!sub.startDate) return null;
    return addFrequency(sub.startDate, sub.billingFrequency, 1, Number(sub.startDate.slice(8, 10)));
  }

  const anchorDay = Number(sub.nextBillingDate.slice(8, 10));
  let next = sub.nextBillingDate;
  let guard = 0;
  while (next < from && guard < 400) {
    next = addFrequency(next, sub.billingFrequency, 1, anchorDay);
    guard++;
  }
  return next;
}

/** Amount that will actually be charged at renewal. Never guesses: falls back to current price. */
export function renewalAmount(sub: SubscriptionLike): { amountMinor: number | null; currency: CurrencyCode } {
  const currency = sub.renewalCurrency ?? sub.currency;
  const amount = sub.renewalPriceMinor ?? sub.priceMinor;
  return { amountMinor: amount, currency };
}

export function monthlyCost(sub: SubscriptionLike): number | null {
  const { amountMinor } = renewalAmount(sub);
  if (amountMinor === null) return null;
  return monthlyEquivalent(amountMinor, sub.billingFrequency);
}

export function annualCost(sub: SubscriptionLike): number | null {
  const { amountMinor } = renewalAmount(sub);
  if (amountMinor === null) return null;
  return annualise(amountMinor, sub.billingFrequency);
}

export function trialDaysRemaining(sub: SubscriptionLike, today: ISODate): number | null {
  if (!sub.trialEndDate) return null;
  return Math.max(0, daysBetween(today, sub.trialEndDate));
}

/**
 * Cancellation deadline is the last calendar day before the renewal charge.
 * Providers generally require cancellation at least 24 hours before renewal.
 */
export function cancellationDeadline(sub: SubscriptionLike): ISODate | null {
  if (sub.status === "trial" && sub.trialEndDate) return addDaysISO(sub.trialEndDate, -1);
  if (sub.nextBillingDate) return addDaysISO(sub.nextBillingDate, -1);
  return null;
}

export function isTrial(sub: SubscriptionLike): boolean {
  return sub.status === "trial";
}

export function validateSubscriptionDates(input: {
  status: string;
  startDate?: string | null;
  nextBillingDate?: string | null;
  trialStartDate?: string | null;
  trialEndDate?: string | null;
}): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (key.endsWith("Date") && value && !isValidISODate(value)) {
      errors.push(`${key} is not a valid date.`);
    }
  }
  if (input.trialStartDate && input.trialEndDate && input.trialEndDate < input.trialStartDate) {
    errors.push("Trial end date must be after the trial start date.");
  }
  if (input.startDate && input.nextBillingDate && input.nextBillingDate < input.startDate) {
    errors.push("Next billing date cannot be before the start date.");
  }
  if (input.status === "trial" && !input.trialEndDate) {
    errors.push("A trial subscription requires a trial end date.");
  }
  return errors;
}

/** Status derived from dates, used by the daily reconciliation job. */
export function reconcileStatus(
  sub: SubscriptionLike & { trialEndDate?: ISODate | null },
  today: ISODate,
): string {
  if (["cancelled", "expired", "paused", "pending_cancellation"].includes(sub.status)) return sub.status;
  if (sub.status === "trial" && sub.trialEndDate && sub.trialEndDate < today) {
    return "active";
  }
  return sub.status;
}
