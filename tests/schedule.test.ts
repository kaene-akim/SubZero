import { describe, expect, it } from "vitest";
import {
  scheduleBundle,
  validateTargetBillingDate,
  type ScheduleItemInput,
} from "@/lib/engines/schedule";
import type { RateTable } from "@/lib/engines/currency";

const rateTable: RateTable = {
  baseCurrency: "GBP",
  rates: [
    { base: "GBP", quote: "USD", rate: 1.25, source: "test", asOf: "2026-11-01" },
    { base: "USD", quote: "GBP", rate: 0.8, source: "test", asOf: "2026-11-01" },
  ],
};

const baseItem: ScheduleItemInput = {
  offerId: "o1",
  providerId: "p1",
  providerName: "Spotify",
  serviceName: "Spotify",
  trialDurationDays: 30,
  renewalPriceMinor: 1199,
  currency: "GBP",
  billingFrequency: "monthly",
  capabilities: { immediateActivationRequired: true, delayedActivation: false },
  activationUrl: "https://example.com/checkout",
  paymentMethodRequired: true,
  countryAvailability: ["GB"],
};

const context = {
  now: "2026-11-12",
  targetBillingDate: "2026-12-01",
  timezone: "Europe/London",
  userCountry: "GB",
  leadTimeDays: 0,
};

describe("bundle scheduling", () => {
  it("calculates the recommended activation date for a 30-day trial", () => {
    const result = scheduleBundle({
      items: [baseItem],
      context,
      rateTable,
      currency: "GBP",
    });
    const item = result.items[0];
    expect(item.activationDate).toBe("2026-11-12"); // ideal is in the past → moved to now
    expect(item.expectedRenewalDate).toBe("2026-12-12");
    expect(item.alignment).toBe("unsupported");
    expect(item.warnings.join(" ")).toMatch(/earliest achievable renewal/i);
  });

  it("plans 30, 14 and 7 day trials backwards from the target date", () => {
    const result = scheduleBundle({
      items: [
        { ...baseItem, offerId: "o30", trialDurationDays: 30 },
        { ...baseItem, offerId: "o14", trialDurationDays: 14, providerId: "p2" },
        { ...baseItem, offerId: "o7", trialDurationDays: 7, providerId: "p3" },
      ],
      context: { ...context, now: "2026-10-01", targetBillingDate: "2026-12-01" },
      rateTable,
      currency: "GBP",
    });
    const dates = Object.fromEntries(result.items.map((i) => [i.offerId, i.activationDate]));
    expect(dates.o30).toBe("2026-11-01");
    expect(dates.o14).toBe("2026-11-17");
    expect(dates.o7).toBe("2026-11-24");
    expect(result.items.every((i) => i.expectedRenewalDate === "2026-12-01")).toBe(true);
    expect(result.items.every((i) => i.requiresUserCheckout)).toBe(true);
    expect(result.summary.exactAlignmentCount).toBe(0);
    expect(result.summary.approximateAlignmentCount).toBe(3);
    expect(result.summary.disclosure).toMatch(/not synchronised billing|depend on you/i);
  });

  it("supports exact scheduling only when the provider offers delayed activation", () => {
    const result = scheduleBundle({
      items: [
        {
          ...baseItem,
          capabilities: { delayedActivation: true, immediateActivationRequired: false },
        },
      ],
      context: { ...context, now: "2026-10-01" },
      rateTable,
      currency: "GBP",
    });
    expect(result.items[0].alignment).toBe("exact");
    expect(result.items[0].status).toBe("scheduled");
    expect(result.items[0].canAutoSchedule).toBe(true);
    expect(result.summary.exactAlignmentCount).toBe(1);
  });

  it("marks plans without a trial as unsupported for billing alignment", () => {
    const result = scheduleBundle({
      items: [{ ...baseItem, trialDurationDays: null }],
      context,
      rateTable,
      currency: "GBP",
    });
    expect(result.items[0].alignment).toBe("unsupported");
    expect(result.items[0].requiresImmediateActivation).toBe(true);
    expect(result.items[0].warnings.join(" ")).toMatch(/no free trial/i);
  });

  it("shifts activation off weekends when the provider is business-days only", () => {
    const result = scheduleBundle({
      items: [
        {
          ...baseItem,
          trialDurationDays: 30,
          capabilities: { businessDaysOnly: true, immediateActivationRequired: true },
        },
      ],
      context: { ...context, now: "2026-10-01", targetBillingDate: "2026-12-01" },
      rateTable,
      currency: "GBP",
    });
    // 1 Nov 2026 is a Sunday, so activation moves back to Friday 30 October.
    expect(result.items[0].activationDate).toBe("2026-10-30");
    expect(result.items[0].alignment).toBe("approximate");
    expect(result.items[0].warnings.join(" ")).toMatch(/business days only/i);
  });

  it("flags duplicates and ineligible countries", () => {
    const result = scheduleBundle({
      items: [
        { ...baseItem, existingActiveProvider: true },
        { ...baseItem, offerId: "o2", providerId: "p2", countryAvailability: ["US"] },
      ],
      context: { ...context, now: "2026-10-01" },
      rateTable,
      currency: "GBP",
    });
    expect(result.items[0].duplicateWarning).toBe(true);
    expect(result.items[0].status).toBe("requires_attention");
    expect(result.items[1].eligible).toBe(false);
    expect(result.summary.duplicateWarnings).toBe(1);
    expect(result.summary.ineligibleCount).toBe(1);
  });

  it("computes immediate and future expenditure separately", () => {
    const result = scheduleBundle({
      items: [
        baseItem,
        {
          ...baseItem,
          offerId: "paid",
          providerId: "p2",
          trialDurationDays: null,
          renewalPriceMinor: 2000,
          billingFrequency: "annual",
        },
      ],
      context: { ...context, now: "2026-10-01" },
      rateTable,
      currency: "GBP",
    });
    expect(result.summary.immediateMinor).toBe(2000);
    expect(result.summary.monthlyMinor).toBe(1199 + Math.round(2000 / 12));
    expect(result.summary.trialCount).toBe(1);
  });

  it("converts mixed currencies and reports missing rates", () => {
    const result = scheduleBundle({
      items: [
        baseItem,
        {
          ...baseItem,
          offerId: "usd",
          providerId: "p3",
          currency: "USD",
          renewalPriceMinor: 2000,
        },
        {
          ...baseItem,
          offerId: "jpy",
          providerId: "p4",
          currency: "JPY",
          renewalPriceMinor: 1000,
        },
      ],
      context: { ...context, now: "2026-10-01" },
      rateTable,
      currency: "GBP",
    });
    expect(result.summary.byCurrency.find((c) => c.currency === "USD")?.monthlyMinor).toBe(2000);
    expect(result.summary.unconvertedCurrencies).toContain("JPY");
  });

  it("validates target dates", () => {
    expect(validateTargetBillingDate("2026-10-01", "2026-11-12", 30).length).toBeGreaterThan(0);
    expect(validateTargetBillingDate("2027-12-01", "2026-11-12", 30).length).toBeGreaterThan(0);
    expect(validateTargetBillingDate("2026-12-01", "2026-11-12", 0).length).toBeGreaterThan(0);
  });
});
