import {
  addDaysISO,
  addFrequency,
  daysBetween,
  isWeekendISO,
  maxISO,
  previousBusinessDay,
  nextBusinessDay,
  type ISODate,
} from "@/lib/dates";
import { convert, type RateTable } from "@/lib/engines/currency";
import { annualise, monthlyEquivalent, type CurrencyCode } from "@/lib/money";
import type { BillingFrequency } from "@/lib/engines/billing";

export type ProviderCapabilities = {
  unifiedCheckout?: boolean;
  apiActivation?: boolean;
  cancellationApi?: boolean;
  delayedActivation?: boolean;
  billingDateChange?: boolean;
  immediateActivationRequired?: boolean;
  businessDaysOnly?: boolean;
  supportsTrials?: boolean;
};

export type ActivationStatus =
  | "awaiting_activation"
  | "scheduled"
  | "ready_for_checkout"
  | "awaiting_user_action"
  | "processing"
  | "activated"
  | "failed"
  | "requires_attention"
  | "cannot_synchronize"
  | "cancelled";

export type ScheduleItemInput = {
  offerId: string;
  providerId: string;
  providerName: string;
  serviceName: string;
  trialDurationDays: number | null;
  renewalPriceMinor: number;
  currency: CurrencyCode;
  billingFrequency: BillingFrequency;
  initialPriceMinor?: number | null;
  capabilities: ProviderCapabilities;
  activationUrl: string;
  paymentMethodRequired: boolean;
  paymentMethodRequiredLabel?: string;
  countryAvailability: string[];
  eligibility?: string | null;
  cancellationRequirements?: string | null;
  existingActiveProvider?: boolean;
  userHasProviderDiscount?: boolean;
};

export type ScheduleContext = {
  now: ISODate;
  targetBillingDate: ISODate;
  timezone: string;
  leadTimeDays?: number;
  userCountry: string;
};

export type ScheduleItemResult = {
  offerId: string;
  providerId: string;
  providerName: string;
  serviceName: string;
  activationDate: ISODate;
  expectedRenewalDate: ISODate | null;
  cancellationDeadline: ISODate | null;
  alignment: "exact" | "approximate" | "unsupported";
  status: ActivationStatus;
  canAutoSchedule: boolean;
  requiresImmediateActivation: boolean;
  requiresUserCheckout: boolean;
  duplicateWarning: boolean;
  eligible: boolean;
  paymentMethodRequired: boolean;
  trialDurationDays: number | null;
  renewalPriceMinor: number;
  currency: CurrencyCode;
  billingFrequency: BillingFrequency;
  activationUrl: string;
  explanation: string;
  warnings: string[];
  daysUntilActivation: number;
  activationMethod: "coordinated_checkout" | "provider_api";
};

function calculateOne(item: ScheduleItemInput, ctx: ScheduleContext): ScheduleItemResult {
  const lead = ctx.leadTimeDays ?? 1;
  const warnings: string[] = [];
  const caps = item.capabilities ?? {};
  const trialDays = item.trialDurationDays ?? 0;
  const isTrial = trialDays > 0;
  const earliestAction = addDaysISO(ctx.now, lead);
  const target = ctx.targetBillingDate;

  const eligibleCountry =
    item.countryAvailability.length === 0 || item.countryAvailability.includes(ctx.userCountry);

  let activationDate: ISODate;
  let expectedRenewalDate: ISODate | null;
  let alignment: ScheduleItemResult["alignment"] = "unsupported";
  let status: ActivationStatus = "awaiting_activation";
  let requiresImmediateActivation = false;
  let requiresUserCheckout = true;
  let canAutoSchedule = false;
  let explanation = "";

  if (!isTrial) {
    activationDate = ctx.now;
    expectedRenewalDate = addFrequency(activationDate, item.billingFrequency);
    requiresImmediateActivation = true;
    status = activationDate <= addDaysISO(ctx.now, lead) ? "ready_for_checkout" : "awaiting_user_action";
    alignment = expectedRenewalDate === target ? "exact" : "unsupported";
    warnings.push(
      "This plan has no free trial. Billing begins at checkout and the provider sets the renewal date; it cannot be aligned to your target date without the provider's billing-date controls.",
    );
    explanation = `Activation begins immediately. First renewal is expected ${expectedRenewalDate}, based on ${item.billingFrequency} billing.`;
    if (caps.billingDateChange) {
      warnings.push(
        "The provider supports changing the billing date after purchase — use their official setting to move the renewal date.",
      );
    }
  } else {
    const idealActivation = addDaysISO(target, -trialDays);
    const targetUnreachable = idealActivation < earliestAction;

    if (targetUnreachable) {
      requiresImmediateActivation = true;
      activationDate = earliestAction;
      warnings.push(
        `A ${trialDays}-day trial started today would renew before your target date. The earliest achievable renewal is ${addDaysISO(activationDate, trialDays)}.`,
      );
    } else {
      activationDate = idealActivation;
    }

    if (caps.businessDaysOnly && isWeekendISO(activationDate)) {
      activationDate = previousBusinessDay(activationDate);
      warnings.push(
        "The provider activates on business days only, so the activation date was moved to the previous weekday. This shifts the expected renewal date.",
      );
    }

    expectedRenewalDate = addDaysISO(activationDate, trialDays);

    const immediateRequired = caps.immediateActivationRequired === true;
    const supportsDelay = caps.delayedActivation === true;

    if (supportsDelay && !immediateRequired) {
      canAutoSchedule = true;
      status = activationDate <= addDaysISO(ctx.now, lead) ? "ready_for_checkout" : "scheduled";
      alignment = expectedRenewalDate === target ? "exact" : "approximate";
      requiresUserCheckout = false;
      explanation = `Delayed activation is supported. The trial is scheduled to start ${activationDate} and the first charge is expected ${expectedRenewalDate}.`;
    } else {
      status =
        activationDate <= addDaysISO(ctx.now, lead) ? "ready_for_checkout" : "awaiting_user_action";
      requiresImmediateActivation = immediateRequired;
      requiresUserCheckout = true;
      // If the trial cannot start early enough, the target renewal date is not
      // achievable and we say so rather than presenting a close-enough plan.
      alignment = targetUnreachable ? "unsupported" : "approximate";
      explanation = `The provider starts the trial at checkout and does not expose delayed activation. Complete the official checkout on ${activationDate} to aim for a ${expectedRenewalDate} renewal. SubZero can remind you but cannot start the trial remotely.`;
      warnings.push(
        "Renewal alignment depends on you completing checkout on the recommended date; the provider's checkout sets the actual date.",
      );
    }

    if (!supportsDelay && !caps.billingDateChange) {
      warnings.push(
        "This provider does not offer a documented billing-date change, so alignment is a plan rather than a guarantee.",
      );
    }
  }

  if (expectedRenewalDate && isWeekendISO(expectedRenewalDate)) {
    warnings.push(
      "The expected renewal falls on a weekend. Providers may process the charge on the next business day.",
    );
    if (caps.businessDaysOnly) expectedRenewalDate = nextBusinessDay(expectedRenewalDate);
  }

  if (activationDate < ctx.now) {
    activationDate = ctx.now;
    warnings.push("The calculated activation date was in the past and has been moved to today.");
  }

  if (expectedRenewalDate && expectedRenewalDate < activationDate) {
    expectedRenewalDate = addDaysISO(activationDate, Math.max(1, trialDays));
    alignment = "unsupported";
    warnings.push("The calculated renewal date was invalid and has been corrected to the earliest possible date.");
  }

  if (!eligibleCountry) {
    warnings.push(
      `This offer is listed for ${item.countryAvailability.join(", ")} and may not be available in ${ctx.userCountry}.`,
    );
  }
  if (item.eligibility) warnings.push(`Eligibility: ${item.eligibility}`);
  if (item.paymentMethodRequired) {
    warnings.push("A payment method is required at checkout. The trial converts automatically unless cancelled.");
  } else {
    warnings.push("No payment method is required at checkout according to the listing — confirm with the provider.");
  }
  if (item.existingActiveProvider) {
    warnings.push(
      "You already have an active subscription with this provider. Confirm this is a separate account before activating another one.",
    );
  }
  if (item.cancellationRequirements) warnings.push(item.cancellationRequirements);

  const cancellationDeadline = expectedRenewalDate ? addDaysISO(expectedRenewalDate, -1) : null;

  const blocked = !eligibleCountry || item.existingActiveProvider;
  if (blocked) status = "requires_attention";
  if (alignment === "unsupported" && status !== "requires_attention") {
    // Keep an actionable status; alignment is reported separately.
    if (status === "scheduled") status = "awaiting_user_action";
  }

  return {
    offerId: item.offerId,
    providerId: item.providerId,
    providerName: item.providerName,
    serviceName: item.serviceName,
    activationDate,
    expectedRenewalDate,
    cancellationDeadline,
    alignment,
    status,
    canAutoSchedule,
    requiresImmediateActivation,
    requiresUserCheckout,
    duplicateWarning: Boolean(item.existingActiveProvider),
    eligible: eligibleCountry,
    paymentMethodRequired: item.paymentMethodRequired,
    trialDurationDays: item.trialDurationDays,
    renewalPriceMinor: item.renewalPriceMinor,
    currency: item.currency,
    billingFrequency: item.billingFrequency,
    activationUrl: item.activationUrl,
    explanation,
    warnings,
    daysUntilActivation: daysBetween(ctx.now, activationDate),
    activationMethod: caps.apiActivation ? "provider_api" : "coordinated_checkout",
  };
}

export type BundleSummary = {
  itemCount: number;
  trialCount: number;
  noCardRequiredCount: number;
  immediateMinor: number;
  monthlyMinor: number;
  annualMinor: number;
  currency: CurrencyCode;
  byCurrency: Array<{ currency: CurrencyCode; immediateMinor: number; monthlyMinor: number }>;
  earliestRenewal: ISODate | null;
  latestRenewal: ISODate | null;
  earliestCancellationDeadline: ISODate | null;
  exactAlignmentCount: number;
  approximateAlignmentCount: number;
  unsupportedAlignmentCount: number;
  duplicateWarnings: number;
  ineligibleCount: number;
  unconvertedCurrencies: CurrencyCode[];
  disclosure: string;
};

export function summariseBundle(
  items: ScheduleItemResult[],
  table: RateTable,
  currency: CurrencyCode,
): BundleSummary {
  let immediateMinor = 0;
  let monthlyMinor = 0;
  let annualMinor = 0;
  let exact = 0;
  let approximate = 0;
  let unsupported = 0;
  let duplicates = 0;
  let ineligible = 0;
  const byCurrencyMap = new Map<CurrencyCode, { immediateMinor: number; monthlyMinor: number }>();
  const unconverted = new Set<CurrencyCode>();
  const renewals: ISODate[] = [];
  const deadlines: ISODate[] = [];

  for (const item of items) {
    const entry = byCurrencyMap.get(item.currency) ?? { immediateMinor: 0, monthlyMinor: 0 };
    const monthly = monthlyEquivalent(item.renewalPriceMinor, item.billingFrequency);
    const annual = annualise(item.renewalPriceMinor, item.billingFrequency);
    // Immediate expenditure only exists for non-trial plans; a trial's upfront
    // charge is normally zero (verification fees are excluded).
    const immediateForItem = (item.trialDurationDays ?? 0) === 0 ? item.renewalPriceMinor : 0;
    entry.monthlyMinor += monthly;
    entry.immediateMinor += immediateForItem;
    byCurrencyMap.set(item.currency, entry);

    const immediateConv = convert(immediateForItem, item.currency, currency, table);
    const monthlyConv = convert(monthly, item.currency, currency, table);
    const annualConv = convert(annual, item.currency, currency, table);
    if (immediateConv.ok && monthlyConv.ok && annualConv.ok) {
      immediateMinor += immediateConv.amountMinor;
      monthlyMinor += monthlyConv.amountMinor;
      annualMinor += annualConv.amountMinor;
    } else {
      unconverted.add(item.currency);
    }

    if (item.expectedRenewalDate) renewals.push(item.expectedRenewalDate);
    if (item.cancellationDeadline) deadlines.push(item.cancellationDeadline);
    if (item.alignment === "exact") exact++;
    else if (item.alignment === "approximate") approximate++;
    else unsupported++;
    if (item.duplicateWarning) duplicates++;
    if (!item.eligible) ineligible++;
  }

  const trialCount = items.filter((i) => (i.trialDurationDays ?? 0) > 0).length;
  const noCardRequiredCount = items.filter((i) => !i.paymentMethodRequired).length;

  const disclosure =
    exact === items.length && items.length > 0
      ? "All items support delayed activation; the schedule below is provider-confirmed."
      : approximate > 0
        ? `${exact} of ${items.length} items can be scheduled exactly. ${approximate} depend on you completing checkout on the recommended date.`
        : "None of these providers expose delayed activation. The dates below are a coordinated checkout plan, not synchronised billing.";

  return {
    itemCount: items.length,
    trialCount,
    noCardRequiredCount,
    immediateMinor,
    monthlyMinor,
    annualMinor,
    currency,
    byCurrency: [...byCurrencyMap.entries()].map(([c, v]) => ({ currency: c, ...v })),
    earliestRenewal: renewals.length ? renewals.reduce((a, b) => (a < b ? a : b)) : null,
    latestRenewal: renewals.length ? renewals.reduce((a, b) => (a > b ? a : b)) : null,
    earliestCancellationDeadline: deadlines.length ? deadlines.reduce((a, b) => (a < b ? a : b)) : null,
    exactAlignmentCount: exact,
    approximateAlignmentCount: approximate,
    unsupportedAlignmentCount: unsupported,
    duplicateWarnings: duplicates,
    ineligibleCount: ineligible,
    unconvertedCurrencies: [...unconverted],
    disclosure,
  };
}

export function scheduleBundle(input: {
  items: ScheduleItemInput[];
  context: ScheduleContext;
  rateTable: RateTable;
  currency: CurrencyCode;
}): { items: ScheduleItemResult[]; summary: BundleSummary } {
  const items = input.items.map((item) => calculateOne(item, input.context));
  return { items, summary: summariseBundle(items, input.rateTable, input.currency) };
}

/** Validate a requested target billing date and return actionable issues. */
export function validateTargetBillingDate(
  target: ISODate,
  now: ISODate,
  maxTrialDays: number,
): string[] {
  const issues: string[] = [];
  if (target < now) issues.push("Choose a target billing date in the future.");
  const latestUseful = addDaysISO(now, 365);
  if (target > latestUseful) issues.push("Target dates more than a year ahead are not supported.");
  if (maxTrialDays === 0) {
    issues.push("None of the selected offers include a trial, so billing cannot be aligned.");
  }
  return issues;
}
