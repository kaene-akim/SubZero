/**
 * Offer URL verification checker.
 *
 * This script checks whether each catalog registration/redemption URL responds.
 * It records the result in offer_verifications and NEVER marks an offer as
 * "verified": a reachable URL only proves the page exists, not that a price,
 * trial, eligibility rule or promotional code is still valid. Only a human
 * review or an official partner feed may change an offer to "verified".
 *
 * Run with: npm run db:verify-offers
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { getDb } from "../src/lib/db";
import { discounts, offers, offerVerifications, providers } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

const TIMEOUT_MS = 10_000;
const DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type CheckResult = {
  httpStatus: number | null;
  reachable: boolean;
  detail: string;
};

async function checkUrl(url: string): Promise<CheckResult> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent":
          "SubZeroOfferVerifier/1.0 (+https://github.com/subzero; checks public pricing pages only)",
        accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const status = response.status;
    // Drain a small part of the body so the socket can be reused, but never
    // store page content.
    await response.body?.cancel();
    const reachable = status >= 200 && status < 400;
    return {
      httpStatus: status,
      reachable,
      detail: reachable
        ? "URL responded. Page existence only — price, trial length, eligibility and code validity are NOT confirmed."
        : `URL responded with HTTP ${status}. Offer terms could not be checked.`,
    };
  } catch (error) {
    return {
      httpStatus: null,
      reachable: false,
      detail: `Request failed: ${(error as Error).message.slice(0, 300)}`,
    };
  }
}

async function main() {
  const db = await getDb();
  const offerRows = await db
    .select({
      id: offers.id,
      title: offers.title,
      url: offers.registrationUrl,
      provider: providers.name,
    })
    .from(offers)
    .innerJoin(providers, eq(providers.id, offers.providerId))
    .where(eq(offers.isActive, true));

  const discountRows = await db
    .select({
      id: discounts.id,
      title: discounts.title,
      url: discounts.redemptionUrl,
      provider: providers.name,
    })
    .from(discounts)
    .innerJoin(providers, eq(providers.id, discounts.providerId))
    .where(eq(discounts.isActive, true));

  console.log(
    `Checking ${offerRows.length} offer URL(s) and ${discountRows.length} discount URL(s). ` +
      "This records reachability only; it does not verify prices or terms.",
  );

  let reachableCount = 0;
  let failedCount = 0;

  for (const row of offerRows) {
    const result = await checkUrl(row.url);
    if (result.reachable) reachableCount += 1;
    else failedCount += 1;
    await db.insert(offerVerifications).values({
      offerId: row.id,
      httpStatus: result.httpStatus,
      status: result.reachable ? "recently_checked" : "unverified",
      detail: `${row.provider} — ${row.title}: ${result.detail}`,
    });
    console.log(
      `${result.reachable ? "OK  " : "FAIL"} ${row.provider} — ${row.title} (${result.httpStatus ?? "no response"})`,
    );
    await sleep(DELAY_MS);
  }

  for (const row of discountRows) {
    const result = await checkUrl(row.url);
    if (result.reachable) reachableCount += 1;
    else failedCount += 1;
    await db.insert(offerVerifications).values({
      discountId: row.id,
      httpStatus: result.httpStatus,
      status: result.reachable ? "recently_checked" : "unverified",
      detail: `${row.provider} — ${row.title}: ${result.detail}`,
    });
    console.log(
      `${result.reachable ? "OK  " : "FAIL"} ${row.provider} — ${row.title} (${result.httpStatus ?? "no response"})`,
    );
    await sleep(DELAY_MS);
  }

  console.log(
    `\nDone. ${reachableCount} URL(s) responded, ${failedCount} failed. ` +
      "No offer or discount was marked verified. Review results in offer_verifications before relying on any terms.",
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
