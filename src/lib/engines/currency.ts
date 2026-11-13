import type { CurrencyCode } from "@/lib/money";
import { currencyDigits, convertMinor, minorUnitFactor } from "@/lib/money";

export type RateQuote = {
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: number;
  source: string;
  asOf: string;
};

export type RateTable = {
  rates: RateQuote[];
  /** Currency used for aggregated reporting. */
  baseCurrency: CurrencyCode;
};

export type ConversionResult =
  | { ok: true; amountMinor: number; rate: number; source: string; asOf: string; direct: boolean }
  | { ok: false; reason: string };

export function findRate(table: RateTable, from: CurrencyCode, to: CurrencyCode): RateQuote | null {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) {
    return { base: f, quote: t, rate: 1, source: "identity", asOf: "" };
  }
  const direct = table.rates.find((r) => r.base.toUpperCase() === f && r.quote.toUpperCase() === t);
  if (direct) return direct;
  // Derive through the reporting base currency when a direct pair is absent.
  const toBase = table.rates.find(
    (r) => r.base.toUpperCase() === f && r.quote.toUpperCase() === table.baseCurrency.toUpperCase(),
  );
  const fromBase = table.rates.find(
    (r) => r.base.toUpperCase() === table.baseCurrency.toUpperCase() && r.quote.toUpperCase() === t,
  );
  if (toBase && fromBase) {
    return {
      base: f,
      quote: t,
      rate: toBase.rate * fromBase.rate,
      source: `${toBase.source} (cross via ${table.baseCurrency})`,
      asOf: toBase.asOf < fromBase.asOf ? toBase.asOf : fromBase.asOf,
    };
  }
  return null;
}

export function convert(
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  table: RateTable,
): ConversionResult {
  if (from.toUpperCase() === to.toUpperCase()) {
    return { ok: true, amountMinor, rate: 1, source: "identity", asOf: "", direct: true };
  }
  const quote = findRate(table, from, to);
  if (!quote) {
    return { ok: false, reason: `No documented ${from}→${to} rate available.` };
  }
  // Re-scale when the currencies have different minor-unit exponents.
  const fromFactor = minorUnitFactor(from);
  const toFactor = minorUnitFactor(to);
  const major = amountMinor / fromFactor;
  const converted = Math.round(major * quote.rate * toFactor);
  return {
    ok: true,
    amountMinor: converted,
    rate: quote.rate,
    source: quote.source,
    asOf: quote.asOf,
    direct: quote.base === quote.quote ? true : quote.source === "identity" ? true : quote.base !== quote.quote,
  };
}

/** Format a rate for display with sensible precision. */
export function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  if (rate >= 100) return rate.toFixed(2);
  if (rate >= 1) return rate.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return rate.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

export function conversionNote(table: RateTable): string {
  const quotes = table.rates.filter((r) => r.source !== "identity");
  if (quotes.length === 0) return "No exchange rates configured; totals are shown per currency.";
  const asOf = quotes.reduce((oldest, r) => (r.asOf < oldest ? r.asOf : oldest), quotes[0].asOf);
  const source = quotes[0].source;
  return `Converted at ${source}, reference date ${asOf}. Indicative only — not a settlement rate.`;
}

export function sumByCurrency(
  items: Array<{ amountMinor: number; currency: CurrencyCode }>,
): Map<CurrencyCode, number> {
  const map = new Map<CurrencyCode, number>();
  for (const item of items) {
    map.set(item.currency, (map.get(item.currency) ?? 0) + item.amountMinor);
  }
  return map;
}

export function digitsFor(currency: CurrencyCode): number {
  return currencyDigits(currency);
}

export { convertMinor };
