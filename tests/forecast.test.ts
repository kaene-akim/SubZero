import { describe, expect, it } from "vitest";
import { buildForecast, spendByCategory } from "@/lib/engines/forecast";
import type { ForecastSubscription } from "@/lib/engines/forecast";
import type { RateTable } from "@/lib/engines/currency";

const rateTable: RateTable = {
  baseCurrency: "GBP",
  rates: [
    { base: "GBP", quote: "USD", rate: 1.25, source: "test", asOf: "2026-11-01" },
    { base: "USD", quote: "GBP", rate: 0.8, source: "test", asOf: "2026-11-01" },
  ],
};

const subs: ForecastSubscription[] = [
  {
    id: "spotify",
    serviceName: "Spotify",
    providerName: "Spotify",
    category: "Entertainment and Streaming",
    priceMinor: 1199,
    currency: "GBP",
    billingFrequency: "monthly",
    status: "trial",
    startDate: "2026-11-01",
    nextBillingDate: null,
    trialStartDate: "2026-11-01",
    trialEndDate: "2026-11-20",
    renewalPriceMinor: 1199,
  },
  {
    id: "netflix",
    serviceName: "Netflix",
    providerName: "Netflix",
    category: "Entertainment and Streaming",
    priceMinor: 1299,
    currency: "GBP",
    billingFrequency: "monthly",
    status: "active",
    startDate: "2026-01-01",
    nextBillingDate: "2026-12-01",
  },
  {
    id: "adobe",
    serviceName: "Adobe Acrobat",
    providerName: "Adobe",
    category: "Software and Productivity",
    priceMinor: 5999,
    currency: "GBP",
    billingFrequency: "annual",
    status: "active",
    startDate: "2026-01-10",
    nextBillingDate: "2027-01-10",
  },
  {
    id: "chatgpt",
    serviceName: "ChatGPT Plus",
    providerName: "OpenAI",
    category: "Artificial Intelligence",
    priceMinor: 2000,
    currency: "USD",
    billingFrequency: "monthly",
    status: "active",
    startDate: "2026-01-01",
    nextBillingDate: "2026-12-01",
  },
];

describe("forecast engine", () => {
  const forecast = buildForecast({ subscriptions: subs, from: "2026-11-12", rateTable });

  it("includes trial conversion at the trial end date", () => {
    const events = forecast.periods[0].events;
    const conversion = events.find((e) => e.subscriptionId === "spotify");
    expect(conversion?.kind).toBe("trial_conversion");
    expect(conversion?.date).toBe("2026-11-20");
  });

  it("calculates 30/90/365 day totals", () => {
    expect(forecast.periods.map((p) => p.horizonDays)).toEqual([30, 90, 365]);
    // 30 days: Spotify trial conversion 11.99 + Netflix 12.99 + ChatGPT $20 converted to £16
    expect(forecast.periods[0].totalMinor).toBe(1199 + 1299 + 1600);
    expect(forecast.periods[1].totalMinor).toBeGreaterThan(forecast.periods[0].totalMinor);
    expect(forecast.periods[2].totalMinor).toBeGreaterThan(forecast.periods[1].totalMinor);
  });

  it("keeps original currencies alongside converted totals", () => {
    const p30 = forecast.periods[0];
    expect(p30.byCurrency.find((c) => c.currency === "USD")?.amountMinor).toBe(2000);
    expect(p30.byCurrency.find((c) => c.currency === "GBP")?.amountMinor).toBe(1199 + 1299);
  });

  it("does not include cancelled subscriptions", () => {
    const result = buildForecast({
      subscriptions: [{ ...subs[1], status: "cancelled" }],
      from: "2026-11-12",
      rateTable,
    });
    expect(result.periods[0].totalMinor).toBe(0);
  });

  it("excludes unconvertible currencies and reports them", () => {
    const result = buildForecast({
      subscriptions: [
        {
          ...subs[1],
          id: "jpy",
          currency: "JPY",
          priceMinor: 1000,
        },
      ],
      from: "2026-11-12",
      rateTable,
    });
    expect(result.periods[0].totalMinor).toBe(0);
    expect(result.periods[0].unconvertedCurrencies).toContain("JPY");
  });

  it("groups spend by category in the reporting currency", () => {
    const categories = spendByCategory(subs, rateTable);
    const entertainment = categories.find((c) => c.category === "Entertainment and Streaming");
    expect(entertainment?.amountMinor).toBe(1199 + 1299);
  });

  it("flags subscriptions without prices or billing dates instead of guessing", () => {
    const result = buildForecast({
      subscriptions: [
        {
          ...subs[1],
          priceMinor: null,
          renewalPriceMinor: null,
        },
      ],
      from: "2026-11-12",
      rateTable,
    });
    expect(result.periods[0].totalMinor).toBe(0);
    expect(result.issues.join(" ")).toMatch(/no known price/i);
  });
});
