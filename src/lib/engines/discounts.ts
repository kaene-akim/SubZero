import { daysBetween, type ISODate } from "@/lib/dates";
import { convert, type RateTable } from "@/lib/engines/currency";
import { annualise, percentageSaved, type CurrencyCode } from "@/lib/money";
import type { BillingFrequency } from "@/lib/engines/billing";

export type DiscountLike = {
  id: string;
  providerId: string;
  providerName: string;
  title: string;
  originalPriceMinor: number;
  discountedPriceMinor: number;
  currency: CurrencyCode;
  discountPercentage: number;
  billingFrequency: BillingFrequency;
  durationMonths: number | null;
  promotionalCode: string | null;
  eligibility: string | null;
  isStudent: boolean;
  newCustomersOnly: boolean;
  existingCustomersOnly: boolean;
  verificationStatus: "verified" | "recently_checked" | "unverified" | "expired";
  expirationDate: ISODate | null;
  redemptionUrl: string;
};

export type DiscountUserContext = {
  isStudent: boolean;
  hasActiveProvider: boolean;
  today: ISODate;
};

export type DiscountEvaluation = {
  discountId: string;
  providerId: string;
  providerName: string;
  title: string;
  eligible: boolean;
  eligibilityNotes: string[];
  threeMonthCostMinor: number;
  sixMonthCostMinor: number;
  twelveMonthCostMinor: number;
  twelveMonthBaselineMinor: number;
  twelveMonthSavingMinor: number;
  monthlySavingMinor: number;
  effectiveMonthlyMinor: number;
  postPromoMonthlyMinor: number;
  effectivePercentage: number;
  durationMonths: number;
  codeUsable: boolean;
  codeNote: string | null;
  savingType: "actual" | "estimated";
  expiresInDays: number | null;
  rankScore: number;
  tradeoffs: string[];
};

function costOverMonths(
  originalMinor: number,
  discountedMinor: number,
  promoMonths: number,
  months: number,
): number {
  const discounted = Math.min(promoMonths, months);
  const full = Math.max(0, months - discounted);
  return discountedMinor * discounted + originalMinor * full;
}

export function evaluateDiscount(
  discount: DiscountLike,
  context: DiscountUserContext,
  options?: { rateTable?: RateTable; baseCurrency?: CurrencyCode },
): DiscountEvaluation {
  const notes: string[] = [];
  let eligible = true;

  if (discount.verificationStatus === "expired") {
    eligible = false;
    notes.push("This promotion is marked expired.");
  }
  if (discount.expirationDate && discount.expirationDate < context.today) {
    eligible = false;
    notes.push(`The promotion expired on ${discount.expirationDate}.`);
  }
  if (discount.isStudent && !context.isStudent) {
    eligible = false;
    notes.push("This is a student offer. Confirm student eligibility and verification requirements first.");
  }
  if (discount.newCustomersOnly && context.hasActiveProvider) {
    eligible = false;
    notes.push("New customers only — you already have a subscription with this provider.");
  }
  if (discount.existingCustomersOnly && !context.hasActiveProvider) {
    eligible = false;
    notes.push("This option is for existing subscribers of this provider.");
  }
  if (discount.verificationStatus === "unverified") {
    notes.push("Price and availability are unverified. Confirm the offer with the provider before acting.");
  }
  if (discount.promotionalCode && discount.verificationStatus !== "verified") {
    notes.push("The promotional code has not been verified as working. Test it at checkout; do not rely on the discount.");
  }

  const duration = discount.durationMonths ?? 12;
  if (discount.durationMonths === null) {
    notes.push("The promotional duration is not stated; calculations assume it lasts 12 months.");
  }

  const three = costOverMonths(
    discount.originalPriceMinor,
    discount.discountedPriceMinor,
    duration,
    3,
  );
  const six = costOverMonths(discount.originalPriceMinor, discount.discountedPriceMinor, duration, 6);
  const twelve = costOverMonths(
    discount.originalPriceMinor,
    discount.discountedPriceMinor,
    duration,
    12,
  );
  const baseline = discount.originalPriceMinor * 12;
  const saving = Math.max(0, baseline - twelve);
  const codeUsable = !discount.promotionalCode || discount.verificationStatus === "verified";
  const savingType: "actual" | "estimated" =
    discount.verificationStatus === "verified" && codeUsable ? "actual" : "estimated";

  let rankScore = saving;
  if (options?.rateTable) {
    const converted = convert(saving, discount.currency, options.baseCurrency ?? "GBP", options.rateTable);
    rankScore = converted.ok ? converted.amountMinor : 0;
  }

  const tradeoffs: string[] = [];
  if (duration < 12) {
    tradeoffs.push(`The promotional price ends after ${duration} month${duration === 1 ? "" : "s"}; the standard price applies afterwards.`);
  }
  if (discount.billingFrequency === "monthly" && discount.durationMonths === 12 && discount.existingCustomersOnly) {
    tradeoffs.push("Switching to annual billing usually means paying the full year upfront.");
  }
  if (discount.isStudent) {
    tradeoffs.push("Student pricing requires periodic re-verification and may have age or institution restrictions.");
  }

  return {
    discountId: discount.id,
    providerId: discount.providerId,
    providerName: discount.providerName,
    title: discount.title,
    eligible,
    eligibilityNotes: notes,
    threeMonthCostMinor: three,
    sixMonthCostMinor: six,
    twelveMonthCostMinor: twelve,
    twelveMonthBaselineMinor: baseline,
    twelveMonthSavingMinor: saving,
    monthlySavingMinor: Math.round(saving / 12),
    effectiveMonthlyMinor: Math.round(twelve / 12),
    postPromoMonthlyMinor: discount.originalPriceMinor,
    effectivePercentage: percentageSaved(baseline, twelve),
    durationMonths: duration,
    codeUsable,
    codeNote: discount.promotionalCode
      ? codeUsable
        ? "Code verified for this listing."
        : "Code unverified — test it at checkout before relying on the discount."
      : null,
    savingType,
    expiresInDays: discount.expirationDate
      ? Math.max(0, daysBetween(context.today, discount.expirationDate))
      : null,
    rankScore,
    tradeoffs,
  };
}

export function rankDiscounts(
  evaluations: DiscountEvaluation[],
): DiscountEvaluation[] {
  return [...evaluations].sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return b.rankScore - a.rankScore;
  });
}

export type PlanComparison = {
  monthlyAnnualisedMinor: number;
  annualPlanMinor: number | null;
  savingMinor: number | null;
  savingPercentage: number | null;
  effectiveMonthlyMinor: number | null;
  breakEvenMonths: number | null;
  note: string;
};

/** Compare paying monthly for a year with an annual plan. */
export function compareAnnualVsMonthly(input: {
  monthlyPriceMinor: number;
  annualPriceMinor: number | null;
  currency: CurrencyCode;
}): PlanComparison {
  const monthlyAnnualised = annualise(input.monthlyPriceMinor, "monthly");
  if (input.annualPriceMinor === null || input.annualPriceMinor <= 0) {
    return {
      monthlyAnnualisedMinor: monthlyAnnualised,
      annualPlanMinor: null,
      savingMinor: null,
      savingPercentage: null,
      effectiveMonthlyMinor: null,
      breakEvenMonths: null,
      note: "No documented annual price is available, so no comparison can be made.",
    };
  }
  const saving = Math.max(0, monthlyAnnualised - input.annualPriceMinor);
  const breakEven = input.monthlyPriceMinor > 0
    ? Math.ceil(input.annualPriceMinor / input.monthlyPriceMinor)
    : null;
  return {
    monthlyAnnualisedMinor: monthlyAnnualised,
    annualPlanMinor: input.annualPriceMinor,
    savingMinor: saving,
    savingPercentage: percentageSaved(monthlyAnnualised, input.annualPriceMinor),
    effectiveMonthlyMinor: Math.round(input.annualPriceMinor / 12),
    breakEvenMonths: breakEven,
    note:
      saving > 0
        ? `Annual billing saves money over 12 months in ${input.currency}, but requires paying the full year upfront.`
        : "Annual billing is not cheaper on the documented prices.",
  };
}


