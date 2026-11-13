import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { getDb } from "../src/lib/db";
import {
  providers,
  offers,
  discounts,
  providerIntegrations,
  exchangeRates,
} from "../src/lib/db/schema";
import {
  catalogProviders,
  catalogOffers,
  catalogDiscounts,
  catalogIntegrations,
  exchangeRateSeed,
  exchangeRateMeta,
} from "../src/lib/catalog/seed-data";

async function main() {
  const db = await getDb();
  console.log(`Seeding catalog: ${catalogProviders.length} providers`);

  for (const p of catalogProviders) {
    await db
      .insert(providers)
      .values({
        slug: p.slug,
        name: p.name,
        category: p.category,
        serviceFamily: p.serviceFamily ?? null,
        description: p.description,
        website: p.website,
        brandColor: p.brandColor,
        cancellationUrl: p.cancellationUrl ?? null,
        managementUrl: p.managementUrl ?? null,
        aliases: p.aliases,
        integrationType: "coordinated_checkout",
      })
      .onConflictDoUpdate({
        target: providers.slug,
        set: {
          name: p.name,
          category: p.category,
          serviceFamily: p.serviceFamily ?? null,
          description: p.description,
          website: p.website,
          brandColor: p.brandColor,
          cancellationUrl: p.cancellationUrl ?? null,
          managementUrl: p.managementUrl ?? null,
          aliases: p.aliases,
          updatedAt: new Date(),
        },
      });
  }

  const providerRows = await db.select().from(providers);
  const bySlug = new Map(providerRows.map((p) => [p.slug, p]));

  for (const o of catalogOffers) {
    const provider = bySlug.get(o.providerSlug);
    if (!provider) throw new Error(`Unknown provider slug: ${o.providerSlug}`);
    await db
      .insert(offers)
      .values({
        providerId: provider.id,
        title: o.title,
        description: o.description,
        offerType: o.offerType,
        trialDurationDays: o.trialDurationDays ?? null,
        initialPrice: o.initialPrice ?? null,
        initialCurrency: o.initialCurrency ?? o.renewalCurrency ?? "GBP",
        renewalPrice: o.renewalPrice,
        renewalCurrency: o.renewalCurrency ?? "GBP",
        billingFrequency: o.billingFrequency ?? "monthly",
        paymentMethodRequired: o.paymentMethodRequired ?? true,
        cancellationRequirements: o.cancellationRequirements ?? null,
        eligibility: o.eligibility ?? null,
        countryAvailability: o.countryAvailability ?? ["GB"],
        registrationUrl: o.registrationUrl,
        source: "curated_reference",
        sourceUrl: o.sourceUrl,
        verificationStatus: "unverified",
        verificationNote: o.verificationNote,
        lastVerifiedAt: null,
        isStudent: o.isStudent ?? false,
        isExclusive: o.isExclusive ?? false,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [offers.providerId, offers.title],
        set: {
          description: o.description,
          trialDurationDays: o.trialDurationDays ?? null,
          renewalPrice: o.renewalPrice,
          renewalCurrency: o.renewalCurrency ?? "GBP",
          billingFrequency: o.billingFrequency ?? "monthly",
          cancellationRequirements: o.cancellationRequirements ?? null,
          eligibility: o.eligibility ?? null,
          countryAvailability: o.countryAvailability ?? ["GB"],
          registrationUrl: o.registrationUrl,
          sourceUrl: o.sourceUrl,
          verificationNote: o.verificationNote,
          updatedAt: new Date(),
        },
      });
  }

  for (const d of catalogDiscounts) {
    const provider = bySlug.get(d.providerSlug);
    if (!provider) throw new Error(`Unknown provider slug: ${d.providerSlug}`);
    await db
      .insert(discounts)
      .values({
        providerId: provider.id,
        title: d.title,
        description: d.description,
        originalPrice: d.originalPrice,
        discountedPrice: d.discountedPrice,
        currency: d.currency ?? "GBP",
        discountPercentage: d.discountPercentage,
        billingFrequency: d.billingFrequency ?? "monthly",
        promotionalCode: d.promotionalCode ?? null,
        eligibility: d.eligibility ?? null,
        durationMonths: d.durationMonths ?? null,
        redemptionUrl: d.redemptionUrl,
        verificationStatus: "unverified",
        verificationNote: d.verificationNote,
        lastVerifiedAt: null,
        isStudent: d.isStudent ?? false,
        newCustomersOnly: d.newCustomersOnly ?? false,
        existingCustomersOnly: d.existingCustomersOnly ?? false,
        source: "curated_reference",
        sourceUrl: d.sourceUrl,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [discounts.providerId, discounts.title],
        set: {
          description: d.description,
          originalPrice: d.originalPrice,
          discountedPrice: d.discountedPrice,
          discountPercentage: d.discountPercentage,
          eligibility: d.eligibility ?? null,
          durationMonths: d.durationMonths ?? null,
          redemptionUrl: d.redemptionUrl,
          verificationNote: d.verificationNote,
          updatedAt: new Date(),
        },
      });
  }

  for (const p of providerRows) {
    const integration = catalogIntegrations[p.slug];
    await db
      .insert(providerIntegrations)
      .values({
        providerId: p.id,
        integrationType: "coordinated_checkout",
        capabilities: integration?.capabilities ?? {},
        configurationStatus: "not_configured",
        supportedOperations: ["open_official_checkout", "user_confirms_activation"],
        notes: integration?.notes ?? null,
        docsUrl: null,
      })
      .onConflictDoUpdate({
        target: providerIntegrations.providerId,
        set: {
          capabilities: integration?.capabilities ?? {},
          notes: integration?.notes ?? null,
          updatedAt: new Date(),
        },
      });
  }

  for (const rate of exchangeRateSeed) {
    await db
      .insert(exchangeRates)
      .values({
        base: rate.base,
        quote: rate.quote,
        rate: rate.rate,
        source: exchangeRateMeta.source,
        asOf: exchangeRateMeta.asOf,
      })
      .onConflictDoUpdate({
        target: [exchangeRates.base, exchangeRates.quote, exchangeRates.asOf],
        set: { rate: rate.rate, source: exchangeRateMeta.source },
      });
  }

  console.log(
    `Seeded ${providerRows.length} providers, ${catalogOffers.length} offers, ${catalogDiscounts.length} discounts, ${exchangeRateSeed.length} exchange rates.`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
