import { addFrequency, type ISODate } from "@/lib/dates";
import { annualise, formatMoney, monthlyEquivalent, type CurrencyCode } from "@/lib/money";
import { convert, type RateTable } from "@/lib/engines/currency";
import type { BillingFrequency, SubscriptionLike } from "@/lib/engines/billing";
import {
  evaluateDiscount,
  type DiscountEvaluation,
  type DiscountLike,
  type DiscountUserContext,
} from "@/lib/engines/discounts";

export type OptimisationSubscription = SubscriptionLike & {
  serviceFamily: string | null;
  providerName: string | null;
};

export type PriceChange = {
  subscriptionId: string;
  serviceName: string;
  oldPriceMinor: number;
  newPriceMinor: number;
  currency: CurrencyCode;
  billingFrequency: BillingFrequency;
  effectiveDate: ISODate;
  source: string;
};

export type OptimisationFinding = {
  id: string;
  type:
    | "duplicate"
    | "overlap"
    | "price_increase"
    | "discount"
    | "student_discount"
    | "annual_plan"
    | "budget"
    | "trial_ending"
    | "payment_failed";
  severity: "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  subscriptionId: string | null;
  providerId: string | null;
  providerName: string | null;
  estimatedMonthlySavingMinor: number | null;
  estimatedAnnualSavingMinor: number | null;
  currency: CurrencyCode;
  savingType: "estimated" | "actual";
  confidence: "high" | "medium" | "low";
  requiresConfirmation: boolean;
  eligibility: string[];
  tradeoffs: string[];
  evidence: string[];
  action: {
    kind: "review_discount" | "review_subscription" | "confirm_duplicate" | "change_plan" | "cancel";
    label: string;
    href: string;
    externalUrl?: string;
  };
};

export type OptimisationResult = {
  currentMonthlyMinor: number;
  recommendedMonthlyMinor: number;
  potentialMonthlySavingMinor: number;
  potentialAnnualSavingMinor: number;
  currency: CurrencyCode;
  findings: OptimisationFinding[];
  dataGaps: string[];
  unconvertedCurrencies: CurrencyCode[];
  disclosure: string;
};

const ACTIVE = new Set(["active", "trial", "payment_failed", "pending_cancellation"]);

function monthlyConverted(
  sub: OptimisationSubscription,
  table: RateTable,
  baseCurrency: CurrencyCode,
): number | null {
  const amount = sub.renewalPriceMinor ?? sub.priceMinor;
  if (amount === null) return null;
  const monthly = monthlyEquivalent(amount, sub.billingFrequency);
  const converted = convert(monthly, sub.currency, baseCurrency, table);
  return converted.ok ? converted.amountMinor : null;
}

export function detectDuplicateGroups(subscriptions: OptimisationSubscription[]): {
  sameProvider: Array<{ providerId: string; providerName: string; subscriptions: OptimisationSubscription[] }>;
  overlappingFamilies: Array<{ serviceFamily: string; subscriptions: OptimisationSubscription[] }>;
} {
  const active = subscriptions.filter((s) => ACTIVE.has(s.status));

  const byProvider = new Map<string, OptimisationSubscription[]>();
  for (const sub of active) {
    if (!sub.providerId) continue;
    const list = byProvider.get(sub.providerId) ?? [];
    list.push(sub);
    byProvider.set(sub.providerId, list);
  }
  const sameProvider = [...byProvider.entries()]
    .filter(([, subs]) => subs.length > 1)
    .map(([providerId, subs]) => ({
      providerId,
      providerName: subs[0].providerName ?? subs[0].serviceName,
      subscriptions: subs,
    }));

  const byFamily = new Map<string, OptimisationSubscription[]>();
  for (const sub of active) {
    if (!sub.serviceFamily) continue;
    const list = byFamily.get(sub.serviceFamily) ?? [];
    list.push(sub);
    byFamily.set(sub.serviceFamily, list);
  }
  const overlappingFamilies = [...byFamily.entries()]
    .filter(([, subs]) => {
      const providers = new Set(subs.map((s) => s.providerId ?? s.serviceName));
      return providers.size > 1;
    })
    .map(([serviceFamily, subs]) => ({ serviceFamily, subscriptions: subs }));

  return { sameProvider, overlappingFamilies };
}

export function detectPriceIncreases(
  history: Array<{
    subscriptionId: string;
    serviceName: string;
    priceMinor: number;
    currency: CurrencyCode;
    billingFrequency: BillingFrequency;
    recordedAt: Date;
    source: string;
  }>,
): PriceChange[] {
  const bySub = new Map<string, typeof history>();
  for (const row of history) {
    const list = bySub.get(row.subscriptionId) ?? [];
    list.push(row);
    bySub.set(row.subscriptionId, list);
  }
  const changes: PriceChange[] = [];
  for (const [subscriptionId, rows] of bySub) {
    const sorted = [...rows].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    if (sorted.length < 2) continue;
    const previous = sorted[sorted.length - 2];
    const latest = sorted[sorted.length - 1];
    if (latest.priceMinor > previous.priceMinor) {
      changes.push({
        subscriptionId,
        serviceName: latest.serviceName,
        oldPriceMinor: previous.priceMinor,
        newPriceMinor: latest.priceMinor,
        currency: latest.currency,
        billingFrequency: latest.billingFrequency,
        effectiveDate: latest.recordedAt.toISOString().slice(0, 10),
        source: latest.source,
      });
    }
  }
  return changes;
}

function findingId(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}

export function optimisePortfolio(input: {
  subscriptions: OptimisationSubscription[];
  discounts: DiscountLike[];
  priceChanges: PriceChange[];
  rateTable: RateTable;
  baseCurrency: CurrencyCode;
  today: ISODate;
  isStudent: boolean;
  monthlyBudgetMinor: number | null;
}): OptimisationResult {
  const findings: OptimisationFinding[] = [];
  const dataGaps: string[] = [];
  const unconverted = new Set<CurrencyCode>();
  const active = input.subscriptions.filter((s) => ACTIVE.has(s.status));

  const currentMonthly = active.reduce((sum, sub) => {
    const monthly = monthlyConverted(sub, input.rateTable, input.baseCurrency);
    if (monthly === null) {
      unconverted.add(sub.currency);
      return sum;
    }
    return sum + monthly;
  }, 0);

  // Duplicates at the same provider — high confidence but never auto-cancelled.
  const duplicates = detectDuplicateGroups(active);
  for (const group of duplicates.sameProvider) {
    const costs = group.subscriptions
      .map((s) => ({
        sub: s,
        monthly: monthlyConverted(s, input.rateTable, input.baseCurrency),
      }))
      .filter((c) => c.monthly !== null)
      .sort((a, b) => (a.monthly ?? 0) - (b.monthly ?? 0));
    const cheapest = costs[0];
    if (!cheapest) continue;
    const annual = (cheapest.monthly ?? 0) * 12;
    findings.push({
      id: findingId("duplicate", group.providerId),
      type: "duplicate",
      severity: "high",
      title: `Possible duplicate ${group.providerName} subscriptions`,
      description: `You have ${group.subscriptions.length} active ${group.providerName} subscriptions. If they are the same plan, cancelling the cheapest duplicate could save about ${formatMoney(annual, input.baseCurrency)} a year.`,
      subscriptionId: cheapest.sub.id,
      providerId: group.providerId,
      providerName: group.providerName,
      estimatedMonthlySavingMinor: cheapest.monthly,
      estimatedAnnualSavingMinor: annual,
      currency: input.baseCurrency,
      savingType: "estimated",
      confidence: "high",
      requiresConfirmation: true,
      eligibility: [],
      tradeoffs: [
        "Separate accounts may be intentional (family members, work use, different regions).",
        "Cancelling the wrong account could remove access or data you still need.",
      ],
      evidence: group.subscriptions.map(
        (s) => `${s.serviceName}: ${s.status}, ${formatMoney(s.renewalPriceMinor ?? s.priceMinor ?? 0, s.currency)} ${s.billingFrequency}`,
      ),
      action: {
        kind: "confirm_duplicate",
        label: "Review duplicates",
        href: "/subscriptions",
      },
    });
  }

  // Overlapping services — explicitly not assumed interchangeable.
  for (const family of duplicates.overlappingFamilies) {
    findings.push({
      id: findingId("overlap", family.serviceFamily),
      type: "overlap",
      severity: "low",
      title: "Overlapping services to review",
      description: `You pay for ${family.subscriptions.length} services in the same category (${family.serviceFamily.replace(/-/g, " ")}). They are not necessarily interchangeable, so no savings are assumed.`,
      subscriptionId: null,
      providerId: null,
      providerName: null,
      estimatedMonthlySavingMinor: null,
      estimatedAnnualSavingMinor: null,
      currency: input.baseCurrency,
      savingType: "estimated",
      confidence: "low",
      requiresConfirmation: true,
      eligibility: [],
      tradeoffs: ["Catalogues, features and terms differ between providers; review what you actually use before cancelling."],
      evidence: family.subscriptions.map((s) => s.serviceName),
      action: { kind: "review_subscription", label: "Compare subscriptions", href: "/subscriptions" },
    });
  }

  // Discounts matched to the user's portfolio. Only eligible offers produce a saving.
  const bestBySubscription = new Map<string, { evaluation: DiscountEvaluation; sub: OptimisationSubscription }>();
  for (const sub of active) {
    if (!sub.providerId) continue;
    const providerDiscounts = input.discounts.filter((d) => d.providerId === sub.providerId);
    for (const discount of providerDiscounts) {
      const context: DiscountUserContext = {
        isStudent: input.isStudent,
        hasActiveProvider: true,
        today: input.today,
      };
      const evaluation = evaluateDiscount(discount, context, {
        rateTable: input.rateTable,
        baseCurrency: input.baseCurrency,
      });
      if (!evaluation.eligible || evaluation.twelveMonthSavingMinor <= 0) continue;
      const existing = bestBySubscription.get(sub.id);
      if (!existing || evaluation.rankScore > existing.evaluation.rankScore) {
        bestBySubscription.set(sub.id, { evaluation, sub });
      }
    }
  }

  for (const { evaluation, sub } of bestBySubscription.values()) {
    const isAnnual = evaluation.durationMonths === 12 && evaluation.title.toLowerCase().includes("annual");
    findings.push({
      id: findingId("discount", evaluation.discountId),
      type: evaluation.discountId && input.discounts.find((d) => d.id === evaluation.discountId)?.isStudent
        ? "student_discount"
        : isAnnual
          ? "annual_plan"
          : "discount",
      severity: evaluation.rankScore > 2000 ? "high" : "medium",
      title: evaluation.title,
      description: `${sub.serviceName} could cost less with this option. Estimated 12-month saving: ${formatMoney(evaluation.rankScore, input.baseCurrency)}.`,
      subscriptionId: sub.id,
      providerId: sub.providerId ?? null,
      providerName: sub.providerName ?? null,
      estimatedMonthlySavingMinor: Math.round(evaluation.rankScore / 12),
      estimatedAnnualSavingMinor: evaluation.rankScore,
      currency: input.baseCurrency,
      savingType: evaluation.savingType,
      confidence: evaluation.savingType === "actual" ? "high" : "medium",
      requiresConfirmation: true,
      eligibility: evaluation.eligibilityNotes,
      tradeoffs: evaluation.tradeoffs,
      evidence: [
        `Standard price: ${formatMoney(evaluation.twelveMonthBaselineMinor, sub.currency)} per year`,
        `Promotional price: ${formatMoney(evaluation.twelveMonthCostMinor, sub.currency)} per year`,
        `Offer verification: ${input.discounts.find((d) => d.id === evaluation.discountId)?.verificationStatus ?? "unknown"}`,
      ],
      action: {
        kind: isAnnual ? "change_plan" : "review_discount",
        label: isAnnual ? "Compare plan" : "View discount",
        href: "/discounts",
        externalUrl: evaluation.discountId
          ? input.discounts.find((d) => d.id === evaluation.discountId)?.redemptionUrl
          : undefined,
      },
    });
  }

  for (const change of input.priceChanges) {
    const annualDelta = annualise(change.newPriceMinor - change.oldPriceMinor, change.billingFrequency);
    const converted = convert(annualDelta, change.currency, input.baseCurrency, input.rateTable);
    findings.push({
      id: findingId("price", `${change.subscriptionId}:${change.effectiveDate}`),
      type: "price_increase",
      severity: "high",
      title: `Price increase: ${change.serviceName}`,
      description: `The recorded price increased from ${formatMoney(change.oldPriceMinor, change.currency)} to ${formatMoney(change.newPriceMinor, change.currency)}. This adds about ${formatMoney(annualDelta, change.currency)} per year if unchanged.`,
      subscriptionId: change.subscriptionId,
      providerId: null,
      providerName: change.serviceName,
      estimatedMonthlySavingMinor: null,
      estimatedAnnualSavingMinor: null,
      currency: input.baseCurrency,
      savingType: "estimated",
      confidence: "medium",
      requiresConfirmation: true,
      eligibility: [],
      tradeoffs: ["The new price may reflect a plan change, tax change or promotional period ending. Verify with the provider."],
      evidence: [`Detected via ${change.source} on ${change.effectiveDate}`],
      action: { kind: "review_subscription", label: "Review price", href: "/subscriptions" },
    });
  }

  if (input.monthlyBudgetMinor !== null && currentMonthly > input.monthlyBudgetMinor) {
    findings.push({
      id: "budget:over",
      type: "budget",
      severity: "medium",
      title: "You are above your monthly subscription budget",
      description: `Your converted monthly commitment is ${formatMoney(currentMonthly, input.baseCurrency)}, above your ${formatMoney(input.monthlyBudgetMinor, input.baseCurrency)} budget.`,
      subscriptionId: null,
      providerId: null,
      providerName: null,
      estimatedMonthlySavingMinor: null,
      estimatedAnnualSavingMinor: null,
      currency: input.baseCurrency,
      savingType: "estimated",
      confidence: "high",
      requiresConfirmation: true,
      eligibility: [],
      tradeoffs: ["Budget overage alone does not identify which subscription to cancel."],
      evidence: [`Converted monthly commitment: ${formatMoney(currentMonthly, input.baseCurrency)}`],
      action: { kind: "review_subscription", label: "Review spending", href: "/analytics" },
    });
  }

  for (const sub of active) {
    if (sub.status === "trial" && sub.trialEndDate) {
      findings.push({
        id: findingId("trial", sub.id),
        type: "trial_ending",
        severity: "medium",
        title: `${sub.serviceName} trial ends ${sub.trialEndDate}`,
        description: `The trial converts automatically unless cancelled before the renewal date.`,
        subscriptionId: sub.id,
        providerId: sub.providerId ?? null,
        providerName: sub.providerName,
        estimatedMonthlySavingMinor: null,
        estimatedAnnualSavingMinor: null,
        currency: sub.currency,
        savingType: "estimated",
        confidence: "high",
        requiresConfirmation: true,
        eligibility: [],
        tradeoffs: [],
        evidence: [`Trial end date recorded from ${sub.id}`],
        action: { kind: "review_subscription", label: "Review trial", href: `/subscriptions/${sub.id}` },
      });
    }
    if (sub.status === "payment_failed") {
      findings.push({
        id: findingId("failed", sub.id),
        type: "payment_failed",
        severity: "high",
        title: `Payment failed: ${sub.serviceName}`,
        description: "A failed payment can interrupt access. Check the provider's billing settings.",
        subscriptionId: sub.id,
        providerId: sub.providerId ?? null,
        providerName: sub.providerName,
        estimatedMonthlySavingMinor: null,
        estimatedAnnualSavingMinor: null,
        currency: sub.currency,
        savingType: "estimated",
        confidence: "high",
        requiresConfirmation: true,
        eligibility: [],
        tradeoffs: [],
        evidence: [],
        action: { kind: "review_subscription", label: "Review payment", href: `/subscriptions/${sub.id}` },
      });
    }
  }

  // Deduplicate saving findings by subscription, keeping the largest documented saving.
  const bestSaving = new Map<string, OptimisationFinding>();
  for (const finding of findings) {
    if (finding.estimatedAnnualSavingMinor === null || finding.estimatedAnnualSavingMinor <= 0) continue;
    const key = finding.subscriptionId ?? finding.id;
    const existing = bestSaving.get(key);
    if (!existing || (existing.estimatedAnnualSavingMinor ?? 0) < finding.estimatedAnnualSavingMinor) {
      bestSaving.set(key, finding);
    }
  }
  const savingKeys = new Set([...bestSaving.values()].map((f) => f.id));
  const dedupedFindings = findings.filter(
    (f) =>
      f.estimatedAnnualSavingMinor === null ||
      f.estimatedAnnualSavingMinor <= 0 ||
      savingKeys.has(f.id),
  );

  const potentialAnnual = [...bestSaving.values()].reduce(
    (sum, f) => sum + (f.estimatedAnnualSavingMinor ?? 0),
    0,
  );
  const potentialMonthly = Math.min(currentMonthly, Math.round(potentialAnnual / 12));

  dataGaps.push(
    "Usage data is not available from providers, so SubZero does not classify subscriptions as unused.",
  );
  dataGaps.push(
    "Savings are estimates based on catalog data. Unverified prices, codes and eligibility must be confirmed with the provider.",
  );
  if (unconverted.size > 0) {
    dataGaps.push(
      `No documented exchange rate for ${[...unconverted].join(", ")}; those subscriptions are excluded from converted totals.`,
    );
  }

  dedupedFindings.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2, info: 3 } as const;
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    return (b.estimatedAnnualSavingMinor ?? 0) - (a.estimatedAnnualSavingMinor ?? 0);
  });

  return {
    currentMonthlyMinor: currentMonthly,
    recommendedMonthlyMinor: Math.max(0, currentMonthly - potentialMonthly),
    potentialMonthlySavingMinor: potentialMonthly,
    potentialAnnualSavingMinor: potentialAnnual,
    currency: input.baseCurrency,
    findings: dedupedFindings,
    dataGaps,
    unconvertedCurrencies: [...unconverted],
    disclosure:
      "Potential savings are estimates, not guaranteed. SubZero never cancels or changes a subscription without your explicit approval.",
  };
}

export { addFrequency };
