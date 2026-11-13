import { z } from "zod";
import { env, llmConfigured } from "@/lib/env";
import { clampConfidence } from "@/lib/money";
import { isValidISODate } from "@/lib/dates";
import type { ClassifierOutput, EmailClassification, EmailInput } from "@/lib/gmail/classifier";
import type { MerchantRecord } from "@/lib/gmail/merchant-db";

const CLASSIFICATIONS: EmailClassification[] = [
  "active_subscription",
  "free_trial",
  "cancelled",
  "expired",
  "one_time_purchase",
  "failed_payment",
  "payment_receipt",
  "renewal_notification",
  "promotional",
  "price_change",
  "unknown",
];

const llmSchema = z.object({
  classification: z.enum(CLASSIFICATIONS as [EmailClassification, ...EmailClassification[]]),
  confidence: z.number().min(0).max(1),
  providerName: z.string().max(120).nullable(),
  serviceName: z.string().max(120).nullable(),
  price: z.string().max(40).nullable(),
  currency: z.string().max(3).nullable(),
  billingFrequency: z
    .enum(["weekly", "fortnightly", "monthly", "quarterly", "semiannual", "annual"])
    .nullable(),
  trialEndDate: z.string().nullable(),
  nextBillingDate: z.string().nullable(),
  evidenceQuotes: z.array(z.string().max(240)).max(6),
  rationale: z.string().max(400),
});

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "classification",
    "confidence",
    "providerName",
    "serviceName",
    "price",
    "currency",
    "billingFrequency",
    "trialEndDate",
    "nextBillingDate",
    "evidenceQuotes",
    "rationale",
  ],
  properties: {
    classification: { type: "string", enum: CLASSIFICATIONS },
    confidence: { type: "number" },
    providerName: { type: ["string", "null"] },
    serviceName: { type: ["string", "null"] },
    price: { type: ["string", "null"] },
    currency: { type: ["string", "null"] },
    billingFrequency: {
      type: ["string", "null"],
      enum: ["weekly", "fortnightly", "monthly", "quarterly", "semiannual", "annual", null],
    },
    trialEndDate: { type: ["string", "null"] },
    nextBillingDate: { type: ["string", "null"] },
    evidenceQuotes: { type: "array", items: { type: "string" } },
    rationale: { type: "string" },
  },
};

function normaliseForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function quoteExists(text: string, quote: string): boolean {
  if (quote.trim().length < 8) return false;
  return normaliseForMatch(text).includes(normaliseForMatch(quote).slice(0, 80));
}

function priceAppears(text: string, price: string): boolean {
  const digits = price.replace(/[^0-9.]/g, "");
  if (!digits) return false;
  return text.includes(digits) || text.includes(digits.replace(/\.00$/, ""));
}

function findMerchantByName(name: string | null, merchants: MerchantRecord[]): MerchantRecord | null {
  if (!name) return null;
  const n = normaliseForMatch(name);
  if (n.length < 3) return null;
  return (
    merchants.find((m) => {
      const candidates = [m.name, ...m.aliases].map(normaliseForMatch).filter((c) => c.length >= 3);
      return candidates.some((c) => c === n || n.includes(c) || c.includes(n));
    }) ?? null
  );
}

/**
 * Ask an LLM for structured evidence on ambiguous emails. The response is
 * strictly validated: every quote must appear in the email, every date must be
 * a real ISO date, and a provider is only accepted if it matches the catalog.
 */
export async function classifyWithLlm(
  email: EmailInput,
  base: ClassifierOutput,
  merchants: MerchantRecord[],
): Promise<ClassifierOutput> {
  if (!llmConfigured) return base;
  if (base.confidence >= 0.82) return base;
  if (!["unknown", "promotional", "payment_receipt", "renewal_notification", "one_time_purchase"].includes(base.classification)) {
    return base;
  }

  const prompt = `You classify billing-related emails for a subscription manager. Be conservative: a promotional email is not proof of activation. An order confirmation is not a subscription. Only return "active_subscription" or "free_trial" when the email clearly confirms an activated subscription or trial for the specific product. Extract a price only if it appears verbatim. Dates must be YYYY-MM-DD and must appear in the email. Return short verbatim evidence quotes.

Sender: ${email.from}
Subject: ${email.subject}
Body:
${email.text.slice(0, 12_000)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(`${env.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LLM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.LLM_MODEL,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are a precise email classification component. Never invent data. Output only valid JSON matching the schema.",
          },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "email_classification", strict: true, schema: JSON_SCHEMA },
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn("LLM classification failed", res.status);
      return base;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return base;
    const parsed = llmSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      console.warn("LLM response failed schema validation", parsed.error.flatten());
      return base;
    }
    const data = parsed.data;
    const validQuotes = data.evidenceQuotes.filter((q) => quoteExists(email.text, q));
    if (validQuotes.length === 0) {
      return { ...base, reasons: [...base.reasons, "LLM response rejected: no verifiable evidence quotes."] };
    }

    const merchant = findMerchantByName(data.providerName, merchants) ?? base.merchant.merchant;
    const providerId = merchant?.id ?? base.merchant.providerId;
    const providerConfirmed = Boolean(providerId);
    const trialEndValid = data.trialEndDate && isValidISODate(data.trialEndDate) && email.text.includes(data.trialEndDate)
      ? data.trialEndDate
      : null;
    const nextBillingValid =
      data.nextBillingDate && isValidISODate(data.nextBillingDate) && email.text.includes(data.nextBillingDate)
        ? data.nextBillingDate
        : null;
    const priceValid = data.price && priceAppears(email.text, data.price) ? data.price : null;

    const llmConfidence = clampConfidence(data.confidence);
    const merged: ClassifierOutput = {
      ...base,
      classification: data.classification,
      confidence: clampConfidence(Math.max(base.confidence, llmConfidence) - 0.05),
      reasons: [
        ...base.reasons,
        `LLM (${env.LLM_MODEL}) evidence: ${data.rationale.slice(0, 200)}`,
      ],
      merchant: {
        ...base.merchant,
        merchant,
        providerId,
        serviceConfirmed: Boolean(merchant),
      },
      extracted: {
        ...base.extracted,
        providerName: merchant?.name ?? base.extracted.providerName,
        serviceName: data.serviceName ?? merchant?.name ?? base.extracted.serviceName,
        category: merchant?.category ?? base.extracted.category,
        renewalPriceMinor:
          data.classification === "free_trial" && priceValid
            ? base.extracted.renewalPriceMinor
            : base.extracted.renewalPriceMinor,
        trialEndDate: trialEndValid ?? base.extracted.trialEndDate,
        nextBillingDate: nextBillingValid ?? base.extracted.nextBillingDate,
        billingFrequency: data.billingFrequency ?? base.extracted.billingFrequency,
        currency: data.currency
          ? (data.currency.toUpperCase() as ClassifierOutput["extracted"]["currency"])
          : base.extracted.currency,
      },
      evidence: [...base.evidence, ...validQuotes.map((q) => `LLM quote: "${q}"`)].slice(0, 24),
      classifierVersion: `${base.classifierVersion}+llm`,
      llmUsed: true,
    };

    // An LLM may refine classification, but never alone triggers automatic
    // creation of a subscription without provider and amount/date evidence.
    const strong =
      providerConfirmed &&
      (merged.classification === "active_subscription" || merged.classification === "free_trial") &&
      merged.confidence >= 0.8 &&
      (merged.extracted.trialEndDate !== null ||
        (merged.extracted.priceMinor !== null && merged.extracted.billingFrequency !== null));
    merged.autoConfirmEligible = strong && base.autoConfirmEligible;
    merged.requiresReview = !merged.autoConfirmEligible;
    return merged;
  } catch (error) {
    console.warn("LLM classification error", error);
    return { ...base, reasons: [...base.reasons, "LLM fallback failed; deterministic classification retained."] };
  }
}
