import { describe, expect, it } from "vitest";
import { classifyEmail, shouldPersistDetection } from "@/lib/gmail/classifier";
import { extractSubscriptionDetails, findAmounts } from "@/lib/gmail/extract";
import type { MerchantRecord } from "@/lib/gmail/merchant-db";
import { catalogProviders } from "@/lib/catalog/seed-data";

const merchants: MerchantRecord[] = catalogProviders.map((p, index) => ({
  id: `provider-${index}`,
  slug: p.slug,
  name: p.name,
  category: p.category,
  website: p.website,
  aliases: p.aliases,
  serviceFamily: p.serviceFamily ?? null,
}));

function classify(input: { from: string; subject: string; text: string; links?: { url: string; text?: string }[] }) {
  return classifyEmail(
    { ...input, userEmail: "alex@example.com" },
    { merchants, userEmail: "alex@example.com" },
  );
}

describe("email extraction", () => {
  it("extracts an explicit price in a billing context", () => {
    const result = extractSubscriptionDetails({
      text: "Your plan renews at £11.99 per month on 12 December 2026.",
      providerDomains: ["spotify.com"],
    });
    expect(result.amountMinor).toBe(1199);
    expect(result.currency).toBe("GBP");
    expect(result.billingFrequency).toBe("monthly");
    expect(result.nextBillingDate).toBe("2026-12-12");
  });

  it("ignores discount amounts when no billing price is present", () => {
    const result = extractSubscriptionDetails({
      text: "Save £20 today with this exclusive offer. Get 50% off your next month.",
    });
    expect(result.amountMinor).toBeNull();
    expect(result.currency).toBeNull();
  });

  it("never invents a billing date when no explicit date is present", () => {
    const result = extractSubscriptionDetails({ text: "Your subscription is active. Thanks for subscribing." });
    expect(result.nextBillingDate).toBeNull();
    expect(result.trialEndDate).toBeNull();
    expect(result.missing).toContain("next billing date");
  });

  it("only accepts unambiguous numeric dates", () => {
    const ambiguous = extractSubscriptionDetails({ text: "Renews on 03/04/2027 for £9.99 per month." });
    expect(ambiguous.nextBillingDate).toBeNull();
    const unambiguous = extractSubscriptionDetails({ text: "Renews on 25/04/2027 for £9.99 per month." });
    expect(unambiguous.nextBillingDate).toBe("2027-04-25");
  });

  it("extracts a cancellation link only from provider domains", () => {
    const result = extractSubscriptionDetails({
      text: "Manage your subscription.",
      links: [
        { url: "https://evil.example/cancel", text: "Cancel subscription" },
        { url: "https://www.netflix.com/cancelplan", text: "Cancel membership" },
      ],
      providerDomains: ["netflix.com"],
    });
    expect(result.cancellationUrl).toBe("https://www.netflix.com/cancelplan");
  });

  it("finds only plausible currency amounts", () => {
    const hits = findAmounts("Your total is £12.99. Order 123456. Discount of £5.");
    expect(hits.map((h) => h.minor)).toContain(1299);
    expect(hits.find((h) => h.minor === 1299)?.score).toBeGreaterThan(0);
    expect(hits.find((h) => h.minor === 500)?.score ?? 0).toBeLessThan(0);
  });
});

describe("email classification", () => {
  it("detects an activated free trial with high confidence", () => {
    const result = classify({
      from: "Spotify <no-reply@spotify.com>",
      subject: "Your free trial has started",
      text: "Hi Alex, your Spotify Premium free trial has started. It ends on 12 December 2026. After that you'll be charged £11.99 per month.",
    });
    expect(result.classification).toBe("free_trial");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.extracted.trialEndDate).toBe("2026-12-12");
    expect(result.extracted.renewalPriceMinor).toBe(1199);
    expect(result.autoConfirmEligible).toBe(true);
    expect(result.requiresReview).toBe(false);
  });

  it("does not turn an Amazon order into an Amazon Prime subscription", () => {
    const result = classify({
      from: "Amazon.co.uk <shipment-tracking@amazon.co.uk>",
      subject: "Your Amazon.co.uk order has been dispatched",
      text: "Your order #123-456 has been dispatched. Total: £24.99. Thanks for your order.",
    });
    expect(result.classification).toBe("one_time_purchase");
    expect(result.extracted.providerName).not.toBe("Amazon Prime");
    expect(result.autoConfirmEligible).toBe(false);
  });

  it("recognises an Amazon Prime renewal when Prime is explicitly mentioned", () => {
    const result = classify({
      from: "Amazon.co.uk <auto-confirm@amazon.co.uk>",
      subject: "Your Prime membership will renew on 15 December 2026",
      text: "Your Amazon Prime membership will automatically renew at £8.99 per month on 15 December 2026.",
    });
    expect(result.classification).toBe("renewal_notification");
    expect(result.merchant.merchant?.slug).toBe("amazon-prime");
    expect(result.extracted.nextBillingDate).toBe("2026-12-15");
  });

  it("does not treat a free-trial promotion as an activation", () => {
    const result = classify({
      from: "Adobe <offers@adobe.com>",
      subject: "Start your free trial — 50% off",
      text: "Try Acrobat Pro free for 7 days. Start your free trial today. Then £19.99 per month. Limited time offer.",
    });
    expect(result.classification).toBe("promotional");
    expect(result.autoConfirmEligible).toBe(false);
    expect(result.requiresReview).toBe(true);
  });

  it("classifies a payment receipt but does not auto-create a subscription", () => {
    const result = classify({
      from: "Netflix <info@netflix.com>",
      subject: "Your payment receipt",
      text: "Payment receipt for £12.99. Invoice number 12345. Thank you for your payment.",
    });
    expect(result.classification).toBe("payment_receipt");
    expect(result.autoConfirmEligible).toBe(false);
    expect(shouldPersistDetection(result)).toBe(true);
  });

  it("detects cancellation confirmations", () => {
    const result = classify({
      from: "Dropbox <no-reply@dropbox.com>",
      subject: "Your subscription has been cancelled",
      text: "Your Dropbox Plus subscription has been cancelled and will not renew. You have access until the end of the period.",
    });
    expect(result.classification).toBe("cancelled");
    expect(result.merchant.merchant?.slug).toBe("dropbox");
  });

  it("detects price increases", () => {
    const result = classify({
      from: "Netflix <info@netflix.com>",
      subject: "A change to your Netflix price",
      text: "We're writing to let you know about a price change. The new price will be £14.99 per month from 1 January 2027.",
    });
    expect(result.classification).toBe("price_change");
    expect(result.extracted.currency).toBe("GBP");
  });

  it("detects failed payments", () => {
    const result = classify({
      from: "Spotify <no-reply@spotify.com>",
      subject: "We couldn't process your payment",
      text: "Payment failed. We could not process your payment. Please update your payment method to keep your subscription.",
    });
    expect(result.classification).toBe("failed_payment");
  });

  it("requires review for a plausible subscription from an unknown provider", () => {
    const result = classify({
      from: "Acme Cloud <billing@acme-cloud.example>",
      subject: "Your subscription is now active",
      text: "Thanks for subscribing. Your subscription is now active at £5.00 per month.",
    });
    expect(result.classification).toBe("active_subscription");
    expect(result.extracted.providerName).toBeTruthy();
    expect(result.autoConfirmEligible).toBe(false);
    expect(result.requiresReview).toBe(true);
  });

  it("does not auto-confirm a subscription confirmation without a price", () => {
    const result = classify({
      from: "Netflix <info@netflix.com>",
      subject: "Your subscription is active",
      text: "Your Netflix subscription is now active. Welcome to Netflix.",
    });
    expect(result.classification).toBe("active_subscription");
    expect(result.autoConfirmEligible).toBe(false);
    expect(result.requiresReview).toBe(true);
  });

  it("does not persist pure marketing as a detection", () => {
    const result = classify({
      from: "Netflix <marketing@netflix.com>",
      subject: "New releases this week",
      text: "Watch the latest films. Upgrade now for more.",
    });
    expect(shouldPersistDetection(result)).toBe(false);
  });
});
