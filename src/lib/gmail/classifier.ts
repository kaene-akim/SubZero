import { clampConfidence, type CurrencyCode } from "@/lib/money";
import type { ISODate } from "@/lib/dates";
import {
  extractSubscriptionDetails,
  type EmailLink,
  type ExtractionResult,
} from "@/lib/gmail/extract";
import {
  matchMerchant,
  type MerchantMatch,
  type MerchantRecord,
} from "@/lib/gmail/merchant-db";

export const CLASSIFIER_VERSION = "rules-v1.2";

export type EmailClassification =
  | "active_subscription"
  | "free_trial"
  | "cancelled"
  | "expired"
  | "one_time_purchase"
  | "failed_payment"
  | "payment_receipt"
  | "renewal_notification"
  | "promotional"
  | "price_change"
  | "unknown";

export type EmailInput = {
  from: string;
  subject: string;
  text: string;
  snippet?: string;
  links?: EmailLink[];
  receivedAt?: Date;
  userEmail?: string;
};

export type ExtractedSubscription = {
  providerName: string | null;
  serviceName: string | null;
  category: string | null;
  priceMinor: number | null;
  renewalPriceMinor: number | null;
  currency: CurrencyCode | null;
  billingFrequency: ExtractionResult["billingFrequency"];
  nextBillingDate: ISODate | null;
  trialStartDate: ISODate | null;
  trialEndDate: ISODate | null;
  startDate: ISODate | null;
  cancellationUrl: string | null;
  managementUrl: string | null;
};

export type ClassifierOutput = {
  classification: EmailClassification;
  confidence: number;
  reasons: string[];
  merchant: MerchantMatch;
  extracted: ExtractedSubscription;
  evidence: string[];
  missing: string[];
  requiresReview: boolean;
  autoConfirmEligible: boolean;
  signals: string[];
  classifierVersion: string;
  llmUsed: boolean;
};

type PatternGroup = { key: string; patterns: RegExp[] };

const SIGNALS: PatternGroup[] = [
  {
    key: "cancellation",
    patterns: [
      /cancel(?:l)?(?:ed|ation) (?:is )?(?:confirmed|complete|successful|processed)/i,
      /your subscription (?:has been|was|is) cancel(?:l)?ed/i,
      /(?:will not|won't) (?:automatically )?renew/i,
      /auto-?renew(?:al)? (?:has been|is) (?:turned off|disabled|cancelled)/i,
    ],
  },
  {
    key: "failed_payment",
    patterns: [
      /payment (?:failed|declined|unsuccessful|was not successful)/i,
      /could not (?:process|charge|collect)/i,
      /(?:account|subscription) is past due/i,
      /update (?:your )?(?:payment|billing) (?:method|details|information)/i,
    ],
  },
  {
    key: "price_change",
    patterns: [
      /price (?:increase|change|update|adjustment)/i,
      /new price/i,
      /price (?:is|will be) (?:changing|increasing)/i,
      /(?:will|is going to) increase to/i,
    ],
  },
  {
    key: "expired",
    patterns: [
      /(?:your|the) (?:free )?trial (?:has )?(?:expired|ended)/i,
      /subscription (?:has )?expired/i,
      /membership (?:has )?expired/i,
    ],
  },
  {
    key: "trial_activation",
    patterns: [
      /(?:your|the) (?:free )?trial (?:has )?(?:started|begun|activated)/i,
      /welcome to (?:your )?(?:free )?trial/i,
      /(?:your|the) (?:free )?trial (?:ends|expires|is valid until)/i,
      /free trial (?:is )?(?:active|confirmed)/i,
    ],
  },
  {
    key: "active_subscription",
    patterns: [
      /subscription (?:is |has been )?(?:confirmed|active|activated)/i,
      /(?:thanks|thank you) for (?:subscribing|your subscription|joining)/i,
      /you(?:'re| are) (?:now )?(?:subscribed|a member|on the .{0,30} plan)/i,
      /welcome to .{0,40}(?:premium|plus|pro\b|membership)/i,
      /membership (?:is )?(?:active|confirmed)/i,
    ],
  },
  {
    key: "renewal",
    patterns: [
      /will (?:automatically )?renew/i,
      /renews? on/i,
      /upcoming (?:payment|renewal|charge)/i,
      /next (?:billing|payment) (?:date|on)/i,
      /auto-?renewal (?:notice|reminder)/i,
    ],
  },
  {
    key: "receipt",
    patterns: [
      /\breceipt\b/i,
      /\binvoice\b/i,
      /payment (?:received|successful|confirmed|processed)/i,
      /\bcharged\b/i,
      /billing statement/i,
    ],
  },
  {
    key: "one_time",
    patterns: [
      /order (?:confirmed|shipped|delivered|dispatched)/i,
      /(?:shipping|tracking) (?:confirmation|number)/i,
      /one-?time (?:purchase|payment)/i,
      /thanks for your (?:order|purchase)/i,
      /out for delivery/i,
    ],
  },
  {
    key: "promotional",
    patterns: [
      /%\s*off/i,
      /\bsave \d/i,
      /limited[- ]time/i,
      /\bdeal\b/i,
      /offer ends/i,
      /upgrade now/i,
      /exclusive (?:offer|deal)/i,
      /student discount/i,
      /promo(?:tional)? code/i,
      /(?:start|claim|unlock|try) (?:your )?(?:\d+[- ]day )?free trial/i,
    ],
  },
  {
    key: "account_specific",
    patterns: [
      /\byour (?:account|subscription|membership|plan|payment|invoice|receipt|trial)\b/i,
      /\byou(?:'ve| have) been charged\b/i,
      /account (?:number|ending|email)/i,
    ],
  },
];

function findSignals(text: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const group of SIGNALS) {
    const matches: string[] = [];
    for (const pattern of group.patterns) {
      const match = text.match(pattern);
      if (match) matches.push(match[0].slice(0, 120));
    }
    if (matches.length) result[group.key] = matches;
  }
  return result;
}

function baseConfidence(classification: EmailClassification): number {
  switch (classification) {
    case "cancelled": return 0.72;
    case "failed_payment": return 0.7;
    case "price_change": return 0.64;
    case "free_trial": return 0.64;
    case "active_subscription": return 0.62;
    case "expired": return 0.62;
    case "renewal_notification": return 0.58;
    case "payment_receipt": return 0.55;
    case "one_time_purchase": return 0.52;
    case "promotional": return 0.5;
    default: return 0.18;
  }
}

function merchantDomains(merchant: MerchantRecord | null): string[] {
  if (!merchant) return [];
  const domains = new Set<string>();
  const add = (value: string) => {
    try {
      const host = new URL(value.startsWith("http") ? value : `https://${value}`).hostname
        .replace(/^www\./, "")
        .toLowerCase();
      if (host) domains.add(host);
    } catch {
      // ignore
    }
  };
  add(merchant.website);
  for (const alias of merchant.aliases) if (alias.includes(".")) add(alias);
  return [...domains];
}

/**
 * Deterministic classifier. It deliberately prefers "promotional" or
 * "unknown" over guessing an activated subscription, and never creates a
 * subscription without provider + billing evidence.
 */
export function classifyEmail(
  email: EmailInput,
  options: { merchants: MerchantRecord[]; userEmail?: string },
): ClassifierOutput {
  const text = `${email.subject}\n${email.text}`.slice(0, 60_000);
  const signals = findSignals(text);
  const merchant = matchMerchant({
    from: email.from,
    subject: email.subject,
    text: email.text,
    merchants: options.merchants,
  });

  const providerConfirmed = merchant.providerId !== null && merchant.serviceConfirmed;
  const providerDomains = merchantDomains(merchant.merchant);
  const extraction = extractSubscriptionDetails({
    text,
    links: email.links,
    providerDomains,
    providerName: merchant.merchant?.name ?? merchant.inferredName,
  });

  const userEmail = (email.userEmail ?? options.userEmail ?? "").toLowerCase();
  const mentionsUserEmail = userEmail.length > 3 && text.toLowerCase().includes(userEmail);
  const accountSpecific = Boolean(signals.account_specific) || mentionsUserEmail;
  const promoOverlap = Boolean(signals.promotional);
  const hasAmount = extraction.amountMinor !== null;
  const hasDate = Boolean(extraction.nextBillingDate || extraction.trialEndDate);
  const hasFrequency = extraction.billingFrequency !== null;

  let classification: EmailClassification = "unknown";
  const reasons: string[] = [];

  if (signals.cancellation) {
    classification = "cancelled";
    reasons.push("Explicit cancellation confirmation language.");
  } else if (signals.failed_payment) {
    classification = "failed_payment";
    reasons.push("Payment failure language.");
  } else if (signals.price_change) {
    classification = "price_change";
    reasons.push("Price-change language.");
  } else if (signals.expired) {
    classification = "expired";
    reasons.push("Trial or subscription expiry language.");
  } else if (signals.trial_activation) {
    classification = "free_trial";
    reasons.push("Trial activation or trial-end language.");
  } else if (signals.active_subscription) {
    classification = "active_subscription";
    reasons.push("Subscription activation/confirmation language.");
  } else if (signals.renewal) {
    classification = "renewal_notification";
    reasons.push("Renewal reminder language.");
  } else if (promoOverlap && !signals.receipt && !signals.one_time) {
    classification = "promotional";
    reasons.push("Marketing language without proof that the user activated anything.");
  } else if (signals.receipt) {
    classification = "payment_receipt";
    reasons.push("Receipt or invoice language.");
  } else if (signals.one_time) {
    classification = "one_time_purchase";
    reasons.push("One-time order or delivery language.");
  } else if (promoOverlap) {
    classification = "promotional";
    reasons.push("Promotional language.");
  }

  if (!providerConfirmed) {
    if (classification === "active_subscription" || classification === "free_trial") {
      reasons.push(
        merchant.merchant
          ? "The sender brand is known, but the email does not confirm the specific subscription product."
          : "The provider could not be identified with confidence.",
      );
      if (!accountSpecific) {
        classification = promoOverlap ? "promotional" : "unknown";
        reasons.push("No account-specific evidence was found, so no subscription record is created.");
      }
    }
  }

  if (promoOverlap && classification === "payment_receipt" && !accountSpecific && !hasAmount) {
    classification = "promotional";
    reasons.push("Promotional email without an account-specific receipt.");
  }

  if (signals.one_time && !signals.active_subscription && !signals.renewal && !signals.trial_activation) {
    classification = "one_time_purchase";
    reasons.push("Order/shipping signals take precedence over generic payment language.");
  }

  let confidence = baseConfidence(classification);
  if (merchant.matchedOn === "domain") confidence += 0.2;
  else if (merchant.matchedOn === "alias") confidence += 0.12;
  else if (merchant.matchedOn === "body") confidence += 0.05;
  if (providerConfirmed) confidence += 0.05;
  if (accountSpecific) confidence += 0.06;
  if (hasAmount) confidence += 0.05;
  if (hasDate) confidence += 0.04;
  if (hasFrequency) confidence += 0.02;
  if (mentionsUserEmail) confidence += 0.04;
  if (promoOverlap && classification !== "promotional") confidence -= 0.12;
  if (merchant.merchant && !merchant.serviceConfirmed) confidence -= 0.2;
  if (!merchant.merchant) confidence -= 0.05;
  if (classification === "unknown") confidence = Math.min(confidence, 0.35);
  confidence = clampConfidence(confidence);

  const autoConfirmEligible =
    providerConfirmed &&
    (classification === "active_subscription" || classification === "free_trial") &&
    confidence >= 0.8 &&
    !promoOverlap &&
    (classification === "free_trial" ? Boolean(extraction.trialEndDate) : hasAmount && hasFrequency);

  if (classification === "free_trial" && !extraction.trialEndDate) {
    reasons.push("The trial end date is missing; user confirmation is required.");
  }
  if (classification === "active_subscription" && (!hasAmount || !hasFrequency)) {
    reasons.push("Price or billing frequency is missing; user confirmation is required.");
  }

  const confirmedMerchant = providerConfirmed ? merchant.merchant : null;
  const extracted: ExtractedSubscription = {
    providerName: confirmedMerchant?.name ?? merchant.inferredName,
    serviceName: confirmedMerchant?.name ?? merchant.inferredName,
    category: confirmedMerchant?.category ?? null,
    priceMinor: classification === "free_trial" ? null : extraction.amountMinor,
    renewalPriceMinor:
      classification === "free_trial"
        ? extraction.amountMinor
        : classification === "renewal_notification" || classification === "price_change"
          ? extraction.amountMinor
          : null,
    currency: extraction.currency,
    billingFrequency: extraction.billingFrequency,
    nextBillingDate: extraction.nextBillingDate,
    trialStartDate: extraction.trialStartDate,
    trialEndDate: extraction.trialEndDate,
    startDate: extraction.startDate,
    cancellationUrl: extraction.cancellationUrl,
    managementUrl: extraction.managementUrl,
  };

  const evidence = [
    ...extraction.evidence,
    ...Object.entries(signals).flatMap(([key, matches]) =>
      matches.map((m) => `Signal ${key}: "${m}"`),
    ),
    merchant.matchedOn === "none"
      ? "No catalog merchant matched."
      : `Merchant matched by ${merchant.matchedOn}: ${merchant.merchant?.name ?? merchant.inferredName}.`,
  ];

  return {
    classification,
    confidence,
    reasons: [...new Set(reasons)],
    merchant,
    extracted,
    evidence: evidence.slice(0, 20),
    missing: extraction.missing,
    requiresReview: !autoConfirmEligible,
    autoConfirmEligible,
    signals: Object.keys(signals),
    classifierVersion: CLASSIFIER_VERSION,
    llmUsed: false,
  };
}

export function shouldPersistDetection(output: ClassifierOutput): boolean {
  return [
    "active_subscription",
    "free_trial",
    "cancelled",
    "expired",
    "failed_payment",
    "price_change",
    "renewal_notification",
    "payment_receipt",
  ].includes(output.classification);
}
