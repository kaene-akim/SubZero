import { describe, expect, it } from "vitest";
import {
  compareAnnualVsMonthly,
  evaluateDiscount,
  rankDiscounts,
  type DiscountLike,
} from "@/lib/engines/discounts";

const discount: DiscountLike = {
  id: "d1",
  providerId: "p1",
  providerName: "Spotify",
  title: "50% off for three months",
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

const context = { isStudent: false, hasActiveProvider: true, today: "2026-11-12" };

describe("discount engine", () => {
  it("calculates 3/6/12 month costs across the promotional period", () => {
    const result = evaluateDiscount(discount, context);
    expect(result.threeMonthCostMinor).toBe(599 * 3);
    expect(result.sixMonthCostMinor).toBe(599 * 3 + 1199 * 3);
    expect(result.twelveMonthCostMinor).toBe(599 * 3 + 1199 * 9);
    expect(result.twelveMonthBaselineMinor).toBe(1199 * 12);
    expect(result.twelveMonthSavingMinor).toBe(1800);
    expect(result.effectiveMonthlyMinor).toBe(Math.round((599 * 3 + 1199 * 9) / 12));
    expect(result.postPromoMonthlyMinor).toBe(1199);
  });

  it("labels unverified offers as estimates, not actual savings", () => {
    const result = evaluateDiscount(discount, context);
    expect(result.savingType).toBe("estimated");
    expect(result.eligibilityNotes.join(" ")).toMatch(/unverified/i);
  });

  it("does not assume student eligibility", () => {
    const student = { ...discount, isStudent: true };
    const notStudent = evaluateDiscount(student, context);
    expect(notStudent.eligible).toBe(false);
    expect(notStudent.eligibilityNotes.join(" ")).toMatch(/student/i);

    const studentUser = evaluateDiscount(student, { ...context, isStudent: true });
    expect(studentUser.eligible).toBe(true);
  });

  it("respects new-customer and existing-customer restrictions", () => {
    const newOnly = evaluateDiscount({ ...discount, newCustomersOnly: true }, context);
    expect(newOnly.eligible).toBe(false);

    const existingOnly = evaluateDiscount(
      { ...discount, existingCustomersOnly: true },
      { ...context, hasActiveProvider: false },
    );
    expect(existingOnly.eligible).toBe(false);
  });

  it("does not present an unverified promotional code as working", () => {
    const withCode = evaluateDiscount({ ...discount, promotionalCode: "SAVE50" }, context);
    expect(withCode.codeUsable).toBe(false);
    expect(withCode.codeNote).toMatch(/unverified/i);

    const verified = evaluateDiscount(
      { ...discount, promotionalCode: "SAVE50", verificationStatus: "verified" },
      context,
    );
    expect(verified.codeUsable).toBe(true);
    expect(verified.savingType).toBe("actual");
  });

  it("marks expired offers ineligible", () => {
    const expired = evaluateDiscount(
      { ...discount, expirationDate: "2026-01-01", verificationStatus: "expired" },
      context,
    );
    expect(expired.eligible).toBe(false);
  });

  it("ranks by monetary value rather than percentage", () => {
    const small = evaluateDiscount({ ...discount, id: "small" }, context);
    const big = evaluateDiscount(
      { ...discount, id: "big", originalPriceMinor: 5000, discountedPriceMinor: 2500, durationMonths: 6 },
      context,
    );
    const ranked = rankDiscounts([small, big]);
    expect(ranked[0].discountId).toBe("big");
  });

  it("compares annual and monthly plans without assuming an annual price", () => {
    const comparison = compareAnnualVsMonthly({
      monthlyPriceMinor: 849,
      annualPriceMinor: 6000,
      currency: "GBP",
    });
    expect(comparison.monthlyAnnualisedMinor).toBe(10188);
    expect(comparison.savingMinor).toBe(4188);
    expect(comparison.effectiveMonthlyMinor).toBe(500);
    expect(comparison.breakEvenMonths).toBe(8);

    const unavailable = compareAnnualVsMonthly({
      monthlyPriceMinor: 849,
      annualPriceMinor: null,
      currency: "GBP",
    });
    expect(unavailable.savingMinor).toBeNull();
    expect(unavailable.note).toMatch(/no documented annual price/i);
  });
});
