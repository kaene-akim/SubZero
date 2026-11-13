import { describe, expect, it } from "vitest";
import {
  cancellationDeadline,
  monthlyCost,
  annualCost,
  nextChargeDate,
  renewalAmount,
  trialDaysRemaining,
  type SubscriptionLike,
} from "@/lib/engines/billing";

const base: SubscriptionLike = {
  id: "s1",
  serviceName: "Spotify",
  category: "Entertainment and Streaming",
  priceMinor: 1199,
  currency: "GBP",
  billingFrequency: "monthly",
  status: "active",
  startDate: "2026-01-15",
  nextBillingDate: "2026-12-15",
};

describe("billing engine", () => {
  it("returns the next charge on or after a date", () => {
    expect(nextChargeDate(base, "2026-11-01")).toBe("2026-12-15");
    expect(nextChargeDate(base, "2026-12-15")).toBe("2026-12-15");
    expect(nextChargeDate(base, "2027-01-01")).toBe("2027-01-15");
  });

  it("advances stale billing dates without losing cadence", () => {
    expect(nextChargeDate({ ...base, nextBillingDate: "2025-01-31" }, "2026-03-01")).toBe("2026-03-31");
  });

  it("handles trials and cancellation deadlines", () => {
    const trial: SubscriptionLike = {
      ...base,
      status: "trial",
      priceMinor: null,
      trialEndDate: "2026-12-01",
      renewalPriceMinor: 1299,
    };
    expect(nextChargeDate(trial, "2026-11-12")).toBe("2026-12-01");
    expect(trialDaysRemaining(trial, "2026-11-12")).toBe(19);
    expect(cancellationDeadline(trial)).toBe("2026-11-30");
    expect(renewalAmount(trial)).toEqual({ amountMinor: 1299, currency: "GBP" });
    expect(monthlyCost(trial)).toBe(1299);
  });

  it("does not charge cancelled, expired or paused subscriptions", () => {
    expect(nextChargeDate({ ...base, status: "cancelled" }, "2026-01-01")).toBeNull();
    expect(nextChargeDate({ ...base, status: "paused" }, "2026-01-01")).toBeNull();
    expect(nextChargeDate({ ...base, status: "expired" }, "2026-01-01")).toBeNull();
  });

  it("annualises different billing frequencies", () => {
    expect(annualCost({ ...base, priceMinor: 1200, billingFrequency: "monthly" })).toBe(14400);
    expect(annualCost({ ...base, priceMinor: 12000, billingFrequency: "annual" })).toBe(12000);
    expect(annualCost({ ...base, priceMinor: 3000, billingFrequency: "quarterly" })).toBe(12000);
    expect(annualCost({ ...base, priceMinor: 300, billingFrequency: "weekly" })).toBe(15600);
  });

  it("never invents an amount when price is missing", () => {
    expect(monthlyCost({ ...base, priceMinor: null })).toBeNull();
    expect(annualCost({ ...base, priceMinor: null })).toBeNull();
  });
});
