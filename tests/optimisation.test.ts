import { describe, expect, it } from "vitest";
import {
  detectDuplicateGroups,
  detectPriceIncreases,
  optimisePortfolio,
  type OptimisationSubscription,
} from "@/lib/engines/optimisation";
import type { DiscountLike } from "@/lib/engines/discounts";
import type { RateTable } from "@/lib/engines/currency";

const rateTable: RateTable = {
  baseCurrency: "GBP",
  rates: [{ base: "USD", quote: "GBP", rate: 0.8, source: "test", asOf: "2026-11-01" }],
};

function sub(overrides: Partial<OptimisationSubscription>): OptimisationSubscription {
  return {
    id: "s1",
    serviceName: "Spotify",
    providerId: "p1",
    providerName: "Spotify",
    serviceFamily: "music-streaming",
    category: "Entertainment and Streaming",
    priceMinor: 1199,
    currency: "GBP",
    billingFrequency: "monthly",
    status: "active",
    startDate: "2026-01-01",
    nextBillingDate: "2026-12-01",
    ...overrides,
  };
}

const subscriptions: OptimisationSubscription[] = [
  sub({ id: "s1" }),
  sub({ id: "s2" }),
  sub({
    id: "s3",
    serviceName: "Netflix",
    providerId: "p2",
    providerName: "Netflix",
    serviceFamily: "video-streaming",
    priceMinor: 1299,
  }),
  sub({
    id: "s4",
    serviceName: "Disney+",
    providerId: "p3",
    providerName: "Disney+",
    serviceFamily: "video-streaming",
    priceMinor: 499,
  }),
];

const discount: DiscountLike = {
  id: "d1",
  providerId: "p1",
  providerName: "Spotify",
  title: "Spotify Premium Student",
  originalPriceMinor: 1199,
  discountedPriceMinor: 599,
  currency: "GBP",
  discountPercentage: 50,
  billingFrequency: "monthly",
  durationMonths: 3,
  promotionalCode: null,
  eligibility: "New customers",
  isStudent: false,
  newCustomersOnly: false,
  existingCustomersOnly: false,
  verificationStatus: "unverified",
  expirationDate: "2027-01-01",
  redemptionUrl: "https://example.com",
};

describe("duplicate detection", () => {
  it("finds same-provider duplicates but not different services in the same category", () => {
    const groups = detectDuplicateGroups(subscriptions);
    expect(groups.sameProvider).toHaveLength(1);
    expect(groups.sameProvider[0].providerId).toBe("p1");
    expect(groups.sameProvider[0].subscriptions).toHaveLength(2);
    expect(groups.overlappingFamilies[0].serviceFamily).toBe("video-streaming");
    expect(groups.overlappingFamilies[0].subscriptions).toHaveLength(2);
  });

  it("ignores cancelled subscriptions", () => {
    const groups = detectDuplicateGroups([sub({ id: "a" }), sub({ id: "b", status: "cancelled" })]);
    expect(groups.sameProvider).toHaveLength(0);
  });
});

describe("price increase detection", () => {
  it("detects a higher latest recorded price", () => {
    const changes = detectPriceIncreases([
      {
        subscriptionId: "s1",
        serviceName: "Spotify",
        priceMinor: 999,
        currency: "GBP",
        billingFrequency: "monthly",
        recordedAt: new Date("2026-01-01"),
        source: "gmail",
      },
      {
        subscriptionId: "s1",
        serviceName: "Spotify",
        priceMinor: 1199,
        currency: "GBP",
        billingFrequency: "monthly",
        recordedAt: new Date("2026-06-01"),
        source: "gmail",
      },
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0].oldPriceMinor).toBe(999);
    expect(changes[0].newPriceMinor).toBe(1199);
  });

  it("ignores price decreases", () => {
    const changes = detectPriceIncreases([
      {
        subscriptionId: "s1",
        serviceName: "Spotify",
        priceMinor: 1299,
        currency: "GBP",
        billingFrequency: "monthly",
        recordedAt: new Date("2026-01-01"),
        source: "gmail",
      },
      {
        subscriptionId: "s1",
        serviceName: "Spotify",
        priceMinor: 999,
        currency: "GBP",
        billingFrequency: "monthly",
        recordedAt: new Date("2026-06-01"),
        source: "gmail",
      },
    ]);
    expect(changes).toHaveLength(0);
  });
});

describe("portfolio optimisation", () => {
  const result = optimisePortfolio({
    subscriptions,
    discounts: [discount],
    priceChanges: [
      {
        subscriptionId: "s1",
        serviceName: "Spotify",
        oldPriceMinor: 999,
        newPriceMinor: 1199,
        currency: "GBP",
        billingFrequency: "monthly",
        effectiveDate: "2026-06-01",
        source: "gmail",
      },
    ],
    rateTable,
    baseCurrency: "GBP",
    today: "2026-11-12",
    isStudent: false,
    monthlyBudgetMinor: 3000,
  });

  it("calculates current converted monthly spend", () => {
    expect(result.currentMonthlyMinor).toBe(1199 + 1199 + 1299 + 499);
  });

  it("produces a duplicate finding that requires confirmation", () => {
    const duplicate = result.findings.find((f) => f.type === "duplicate");
    expect(duplicate).toBeTruthy();
    expect(duplicate?.requiresConfirmation).toBe(true);
    expect(duplicate?.tradeoffs.length).toBeGreaterThan(0);
  });

  it("flags overlapping services without assuming they are interchangeable", () => {
    const overlap = result.findings.find((f) => f.type === "overlap");
    expect(overlap).toBeTruthy();
    expect(overlap?.estimatedAnnualSavingMinor).toBeNull();
    expect(overlap?.description).toMatch(/not necessarily interchangeable/i);
  });

  it("matches eligible discounts and reports estimated savings", () => {
    const discountFinding = result.findings.find((f) => f.type === "discount");
    expect(discountFinding).toBeTruthy();
    expect(discountFinding?.savingType).toBe("estimated");
    expect(discountFinding?.estimatedAnnualSavingMinor).toBeGreaterThan(0);
  });

  it("does not count price increases as savings", () => {
    const price = result.findings.find((f) => f.type === "price_increase");
    expect(price).toBeTruthy();
    expect(price?.estimatedAnnualSavingMinor).toBeNull();
  });

  it("flags budget overage without choosing a cancellation", () => {
    const budget = result.findings.find((f) => f.type === "budget");
    expect(budget).toBeTruthy();
    expect(budget?.estimatedAnnualSavingMinor).toBeNull();
  });

  it("caps potential savings and labels them as estimates", () => {
    expect(result.potentialMonthlySavingMinor).toBeLessThanOrEqual(result.currentMonthlyMinor);
    expect(result.potentialAnnualSavingMinor).toBeGreaterThan(0);
    expect(result.disclosure).toMatch(/estimates/i);
    expect(result.disclosure).toMatch(/never cancels/i);
  });

  it("does not claim usage data it does not have", () => {
    expect(result.dataGaps.join(" ")).toMatch(/usage data is not available/i);
  });
});
