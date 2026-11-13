/**
 * Money helpers.
 *
 * All financial arithmetic in engines is performed on integer minor units to
 * avoid floating point drift. Database columns use numeric(14,2); values are
 * converted at the boundary. Original currencies are always preserved.
 */

export type CurrencyCode = string;

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF"]);
const THREE_DECIMAL = new Set(["BHD", "KWD", "OMR", "JOD", "TND"]);

export function currencyDigits(currency: CurrencyCode): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

export function minorUnitFactor(currency: CurrencyCode): number {
  return 10 ** currencyDigits(currency);
}

/** Parse a human/database amount ("12.99", 12.99, "£12.99") into minor units. */
export function toMinor(value: string | number | null | undefined, currency = "GBP"): number | null {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = typeof value === "number" ? String(value) : value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * minorUnitFactor(currency));
}

export function fromMinor(minor: number, currency = "GBP"): string {
  const digits = currencyDigits(currency);
  return (minor / minorUnitFactor(currency)).toFixed(digits);
}

export function fromMinorNumber(minor: number, currency = "GBP"): number {
  return Number(fromMinor(minor, currency));
}

export function formatMoney(
  minor: number | null | undefined,
  currency = "GBP",
  locale = "en-GB",
  options: Intl.NumberFormatOptions = {},
): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return "—";
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: options.minimumFractionDigits ?? digits,
    maximumFractionDigits: options.maximumFractionDigits ?? digits,
    ...options,
  }).format(minor / minorUnitFactor(currency));
}

export function formatMoneyString(
  amount: string | number | null | undefined,
  currency = "GBP",
  locale = "en-GB",
  options?: Intl.NumberFormatOptions,
): string {
  return formatMoney(toMinor(amount, currency), currency, locale, options);
}

/** Convert a minor-unit amount using a decimal exchange rate. */
export function convertMinor(
  minor: number,
  rate: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
): number {
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) return minor;
  const major = minor / minorUnitFactor(fromCurrency);
  const converted = major * rate;
  return Math.round(converted * minorUnitFactor(toCurrency));
}

/** Annualise a recurring charge, returning minor units per year. */
export function annualise(
  amountMinor: number,
  frequency: string,
  intervalCount = 1,
): number {
  const n = Math.max(1, intervalCount);
  switch (frequency) {
    case "weekly":
      return Math.round((amountMinor / n) * 52);
    case "fortnightly":
    case "biweekly":
      return Math.round((amountMinor / n) * 26);
    case "monthly":
      return Math.round((amountMinor / n) * 12);
    case "quarterly":
      return Math.round((amountMinor / n) * 4);
    case "semiannual":
      return Math.round((amountMinor / n) * 2);
    case "annual":
      return Math.round(amountMinor / n);
    default:
      return Math.round((amountMinor / n) * 12);
  }
}

export function monthlyEquivalent(amountMinor: number, frequency: string): number {
  return Math.round(annualise(amountMinor, frequency) / 12);
}

export function percentageSaved(originalMinor: number, discountedMinor: number): number {
  if (originalMinor <= 0) return 0;
  return Math.max(0, Math.round(((originalMinor - discountedMinor) / originalMinor) * 1000) / 10);
}

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}
