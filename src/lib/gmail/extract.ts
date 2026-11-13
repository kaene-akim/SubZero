import { format, isValid, parse } from "date-fns";
import { toMinor, type CurrencyCode } from "@/lib/money";
import { isValidISODate, type ISODate } from "@/lib/dates";

export type EmailLink = { url: string; text?: string };

export type ExtractionResult = {
  amountMinor: number | null;
  currency: CurrencyCode | null;
  billingFrequency: "weekly" | "fortnightly" | "monthly" | "quarterly" | "semiannual" | "annual" | null;
  nextBillingDate: ISODate | null;
  trialStartDate: ISODate | null;
  trialEndDate: ISODate | null;
  startDate: ISODate | null;
  cancellationUrl: string | null;
  managementUrl: string | null;
  evidence: string[];
  missing: string[];
};

const SYMBOL_CURRENCY: Record<string, CurrencyCode> = {
  "£": "GBP",
  $: "USD",
  "€": "EUR",
  "₹": "INR",
};

const ISO_CODES = ["GBP", "USD", "EUR", "CAD", "AUD", "NZD", "SGD", "JPY", "INR", "CHF", "SEK", "NOK", "DKK"];

function contextAround(text: string, index: number, length: number, window = 110): string {
  const start = Math.max(0, index - window);
  const end = Math.min(text.length, index + length + window);
  return text.slice(start, end);
}

type AmountHit = {
  minor: number;
  currency: CurrencyCode;
  raw: string;
  index: number;
  score: number;
  context: string;
};

function detectCurrencyNear(context: string, symbol: string | null, code: string | null): CurrencyCode {
  if (code && ISO_CODES.includes(code.toUpperCase())) return code.toUpperCase();
  if (symbol) {
    if (symbol === "$") {
      const explicit = context.match(/\b(CAD|AUD|NZD|SGD|USD)\b/i);
      return explicit ? explicit[1].toUpperCase() : "USD";
    }
    return SYMBOL_CURRENCY[symbol] ?? "GBP";
  }
  const explicit = context.match(/\b(GBP|USD|EUR|CAD|AUD|JPY|INR)\b/i);
  return explicit ? explicit[1].toUpperCase() : "GBP";
}

function scoreAmountContext(context: string): number {
  let score = 0;
  if (/\b(renew|renews|renewal|charged|charge|billing|next payment|price|per month|\/month|\/mo|per year|annually|yearly)\b/i.test(context)) score += 4;
  if (/\b(total|amount|paid|payment|invoice|receipt)\b/i.test(context)) score += 2;
  if (/\b(save|saved|saving|discount|coupon|promo|credit|refund|gift|off)\b/i.test(context)) score -= 5;
  if (/\b(tax|vat|shipping|delivery)\b/i.test(context)) score -= 2;
  if (/\bfree\b/i.test(context)) score -= 2;
  return score;
}

export function findAmounts(text: string): AmountHit[] {
  const hits: AmountHit[] = [];
  const seen = new Set<string>();

  // Symbol-prefixed amounts, e.g. £12.99, $1,299.00
  const symbolRe = /([£$€₹])\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
  for (const match of text.matchAll(symbolRe)) {
    const raw = match[0];
    const symbol = match[1];
    const value = match[2].replace(/,/g, "");
    const index = match.index ?? 0;
    const context = contextAround(text, index, raw.length);
    const scoreContext = contextAround(text, index, raw.length, 20);
    const currency = detectCurrencyNear(context, symbol, null);
    const minor = toMinor(value, currency);
    if (minor === null || minor < 50 || minor > 10_000_000) continue;
    const key = `${currency}:${minor}:${index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ minor, currency, raw, index, score: scoreAmountContext(scoreContext), context });
  }

  // ISO-code amounts, e.g. GBP 11.99 or 11.99 GBP
  const codeRe = /\b(GBP|USD|EUR|CAD|AUD|NZD|SGD|JPY|INR|CHF)\b\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)|(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s?\b(GBP|USD|EUR|CAD|AUD|NZD|SGD|JPY|INR|CHF)\b/g;
  for (const match of text.matchAll(codeRe)) {
    const raw = match[0];
    const code = (match[1] ?? match[4]).toUpperCase();
    const value = (match[2] ?? match[3]).replace(/,/g, "");
    const index = match.index ?? 0;
    const context = contextAround(text, index, raw.length);
    const scoreContext = contextAround(text, index, raw.length, 20);
    const minor = toMinor(value, code);
    if (minor === null || minor < 50 || minor > 10_000_000) continue;
    const key = `${code}:${minor}:${index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ minor, currency: code, raw, index, score: scoreAmountContext(scoreContext), context });
  }

  return hits.sort((a, b) => b.score - a.score || a.index - b.index);
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

type DateHit = { iso: ISODate; index: number; context: string; raw: string };

function parseDateText(raw: string): ISODate | null {
  const cleaned = raw.replace(/(\d+)(st|nd|rd|th)/i, "$1").replace(/,/g, "").trim();
  const formats = [
    "d MMMM yyyy", "d MMM yyyy", "MMMM d yyyy", "MMM d yyyy",
    "yyyy-MM-dd", "d/M/yyyy", "d-M-yyyy",
  ];
  for (const fmt of formats) {
    const d = parse(cleaned, fmt, new Date());
    if (isValid(d)) {
      const iso = format(d, "yyyy-MM-dd");
      if (isValidISODate(iso)) return iso;
    }
  }
  return null;
}

export function findDates(text: string): DateHit[] {
  const hits: DateHit[] = [];
  const seen = new Set<string>();

  const patterns = [
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec),?\s+\d{4}\b/gi,
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/gi,
    /\b\d{4}-\d{2}-\d{2}\b/g,
  ];

  for (const re of patterns) {
    for (const match of text.matchAll(re)) {
      const raw = match[0];
      const iso = parseDateText(raw);
      if (!iso) continue;
      const index = match.index ?? 0;
      const key = `${iso}:${index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ iso, index, context: contextAround(text, index, raw.length, 120), raw });
    }
  }

  // Numeric dates are only accepted when unambiguous (day > 12) to avoid
  // silently swapping day/month.
  const numericRe = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g;
  for (const match of text.matchAll(numericRe)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    if (day > 12 || month > 12) {
      const iso = `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (isValidISODate(iso)) {
        const index = match.index ?? 0;
        const key = `${iso}:${index}`;
        if (!seen.has(key)) {
          seen.add(key);
          hits.push({ iso, index, context: contextAround(text, index, match[0].length, 120), raw: match[0] });
        }
      }
    }
  }

  return hits.sort((a, b) => a.index - b.index);
}

function classifyDateContext(context: string): "trial_end" | "trial_start" | "next_billing" | "start" | null {
  const lower = context.toLowerCase();
  if (/(free\s+trial|trial).{0,60}(end|expire|until|conclude)/i.test(lower)) return "trial_end";
  if (/(end|expire|until).{0,60}(free\s+trial|trial)/i.test(lower)) return "trial_end";
  if (/(free\s+trial|trial).{0,60}(start|begin|activat)/i.test(lower)) return "trial_start";
  if (/(renew|renewal|next\s+(payment|billing|charge)|will\s+be\s+charged|billing\s+date|auto-?renew)/i.test(lower)) return "next_billing";
  if (/(started|began|member\s+since|joined|sign-?up)/i.test(lower)) return "start";
  return null;
}

export function detectFrequency(text: string): ExtractionResult["billingFrequency"] {
  const t = text.toLowerCase();
  if (/(\bper\s+month\b|\bmonthly\b|\/month\b|\/mo\b|\beach\s+month\b|\ba\s+month\b)/i.test(t)) return "monthly";
  if (/(\bper\s+year\b|\bannual(ly)?\b|\byearly\b|\/year\b|\/yr\b|\beach\s+year\b|\ba\s+year\b)/i.test(t)) return "annual";
  if (/(\bper\s+quarter\b|\bquarterly\b|\bevery\s+3\s+months\b)/i.test(t)) return "quarterly";
  if (/(\bper\s+week\b|\bweekly\b|\bevery\s+week\b)/i.test(t)) return "weekly";
  if (/(\bevery\s+2\s+weeks\b|\bfortnightly\b|\bbiweekly\b)/i.test(t)) return "fortnightly";
  if (/(\bevery\s+6\s+months\b|\bsemi-?annual\b)/i.test(t)) return "semiannual";
  return null;
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // Strip common tracking parameters; never keep credentials.
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|gclid|fbclid|mc_|ref|source)/i.test(key)) url.searchParams.delete(key);
    }
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function findLinks(
  links: EmailLink[],
  text: string,
  providerDomains: string[],
): { cancellationUrl: string | null; managementUrl: string | null } {
  const candidates: EmailLink[] = [...links];
  const urlRe = /https?:\/\/[^\s<>"')\]]+/g;
  for (const match of text.matchAll(urlRe)) candidates.push({ url: match[0] });

  let cancellationUrl: string | null = null;
  let managementUrl: string | null = null;
  for (const link of candidates) {
    const safe = safeUrl(link.url);
    if (!safe) continue;
    const host = new URL(safe).hostname.replace(/^www\./, "").toLowerCase();
    const isProvider = providerDomains.some((d) => host === d || host.endsWith(`.${d}`));
    // Never trust a third-party link for cancellation or account management.
    if (!isProvider) continue;
    const label = `${link.text ?? ""} ${safe}`.toLowerCase();
    if (/cancel/.test(label) && !cancellationUrl) cancellationUrl = safe;
    if (/(manage|account|billing|subscription)/.test(label) && !managementUrl) managementUrl = safe;
    if (cancellationUrl && managementUrl) break;
  }
  return { cancellationUrl, managementUrl };
}

/**
 * Extract only facts that are explicitly present. Missing values stay null so
 * the UI can ask the user instead of inventing a price or renewal date.
 */
export function extractSubscriptionDetails(input: {
  text: string;
  links?: EmailLink[];
  providerDomains?: string[];
  providerName?: string | null;
}): ExtractionResult {
  const text = input.text.slice(0, 60_000);
  const evidence: string[] = [];
  const missing: string[] = [];

  const amounts = findAmounts(text);
  const bestAmount = amounts.find((a) => a.score > 0) ?? null;
  if (bestAmount) {
    evidence.push(`Amount "${bestAmount.raw}" in context: "${bestAmount.context.slice(0, 160).trim()}"`);
  } else {
    missing.push("price");
  }

  const frequency = detectFrequency(text);
  if (frequency) evidence.push(`Billing frequency: ${frequency}`);

  const dates = findDates(text);
  let trialEndDate: ISODate | null = null;
  let trialStartDate: ISODate | null = null;
  let nextBillingDate: ISODate | null = null;
  let startDate: ISODate | null = null;

  for (const date of dates) {
    const kind = classifyDateContext(date.context);
    if (kind === "trial_end" && !trialEndDate) {
      trialEndDate = date.iso;
      evidence.push(`Trial end date "${date.raw}" from context: "${date.context.slice(0, 160).trim()}"`);
    } else if (kind === "trial_start" && !trialStartDate) {
      trialStartDate = date.iso;
    } else if (kind === "next_billing" && !nextBillingDate) {
      nextBillingDate = date.iso;
      evidence.push(`Next billing date "${date.raw}" from context: "${date.context.slice(0, 160).trim()}"`);
    } else if (kind === "start" && !startDate) {
      startDate = date.iso;
    }
  }

  // A trial's first charge is normally the trial end date when the email says
  // the subscription converts automatically.
  if (!nextBillingDate && trialEndDate && /(charged|renews|convert|billed)/i.test(text)) {
    nextBillingDate = trialEndDate;
    evidence.push("Trial end date also treated as the first charge date because the email states automatic conversion.");
  }
  if (!trialEndDate) missing.push("trial end date");
  if (!nextBillingDate) missing.push("next billing date");
  if (!frequency) missing.push("billing frequency");

  const providerDomains = input.providerDomains ?? [];
  const { cancellationUrl, managementUrl } = findLinks(input.links ?? [], text, providerDomains);
  if (cancellationUrl) evidence.push("Cancellation link found in the email.");
  if (managementUrl) evidence.push("Subscription management link found in the email.");

  return {
    amountMinor: bestAmount?.minor ?? null,
    currency: bestAmount?.currency ?? null,
    billingFrequency: frequency,
    nextBillingDate,
    trialStartDate,
    trialEndDate,
    startDate,
    cancellationUrl,
    managementUrl,
    evidence,
    missing: [...new Set(missing)],
  };
}
