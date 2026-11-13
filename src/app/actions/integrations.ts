"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  connectedAccounts,
  priceHistory,
  subscriptions,
  transactionRecords,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { encryptJson, decryptJson } from "@/lib/security/crypto";
import { addFrequency, isValidISODate, todayInTimeZone } from "@/lib/dates";
import {
  getBankProvider,
  inferRecurrence,
  MockBankProvider,
  type BankConnectionTokens,
  type BankTransaction,
} from "@/lib/bank/provider";
import { connectSandboxAccount, disconnectGmail, syncGmailAccount } from "@/lib/gmail/service";
import { env } from "@/lib/env";

export type IntegrationState = {
  ok?: boolean;
  message?: string;
  error?: string;
};

export async function connectSandboxInboxAction(
  _prev: IntegrationState,
  _formData: FormData,
): Promise<IntegrationState> {
  const user = await requireUser();
  try {
    await connectSandboxAccount(user);
    revalidatePath("/settings");
    revalidatePath("/discover");
    return { ok: true, message: "Sandbox inbox connected. It contains synthetic messages only — no real email was accessed." };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export async function syncGmailAction(
  _prev: IntegrationState,
  _formData: FormData,
): Promise<IntegrationState> {
  const user = await requireUser();
  const result = await syncGmailAccount(user);
  revalidatePath("/settings");
  revalidatePath("/discover");
  revalidatePath("/overview");
  return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.message };
}

export async function disconnectGmailAction(
  _prev: IntegrationState,
  _formData: FormData,
): Promise<IntegrationState> {
  const user = await requireUser();
  const result = await disconnectGmail(user);
  revalidatePath("/settings");
  return { ok: result.ok, message: result.message, error: result.ok ? undefined : result.message };
}

export async function connectMockBankAction(
  _prev: IntegrationState,
  _formData: FormData,
): Promise<IntegrationState> {
  const user = await requireUser();
  if (env.BANK_MOCK !== "true") {
    return { error: "The mock bank feed is disabled. Configure TrueLayer credentials for a real Open Banking connection." };
  }
  const db = await getDb();
  const existing = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, user.id), eq(connectedAccounts.provider, "truelayer")))
    .limit(1);
  if (existing[0]) {
    return { ok: true, message: "A bank feed is already connected." };
  }
  await db.insert(connectedAccounts).values({
    userId: user.id,
    provider: "truelayer",
    providerAccountId: "mock-bank",
    accountLabel: "Mock bank feed (synthetic transactions)",
    encryptedCredentials: encryptJson({ kind: "mock" }),
    permissions: ["accounts", "transactions"],
    connectionStatus: "connected",
  });
  await recordAudit({
    userId: user.id,
    action: "integration.bank.mock_connected",
    resourceType: "connected_account",
    metadata: { explicitMock: true },
  });
  revalidatePath("/settings");
  return { ok: true, message: "Mock bank feed connected. Imported transactions will be labelled as synthetic." };
}

export async function importBankTransactionsAction(
  _prev: IntegrationState,
  _formData: FormData,
): Promise<IntegrationState> {
  const user = await requireUser();
  const db = await getDb();
  const [account] = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, user.id), eq(connectedAccounts.provider, "truelayer")))
    .limit(1);
  if (!account) {
    return { error: "No bank feed is connected. Connect one in Settings first." };
  }

  let tokens: BankConnectionTokens = { accessToken: "" };
  let isMock = false;
  try {
    const creds = decryptJson<{ kind?: string; accessToken?: string; refreshToken?: string; expiresAt?: number }>(
      account.encryptedCredentials,
    );
    isMock = creds.kind === "mock";
    tokens = {
      accessToken: creds.accessToken ?? "mock-access-token",
      refreshToken: creds.refreshToken,
      expiresAt: creds.expiresAt,
    };
  } catch {
    return { error: "Stored bank credentials could not be decrypted. Disconnect and reconnect." };
  }

  const provider = isMock ? new MockBankProvider() : getBankProvider();
  let transactions: BankTransaction[];
  try {
    transactions = await provider.listTransactions(tokens);
  } catch (error) {
    await db
      .update(connectedAccounts)
      .set({ lastError: (error as Error).message.slice(0, 500), connectionStatus: "error", updatedAt: new Date() })
      .where(eq(connectedAccounts.id, account.id));
    return { error: `Bank sync failed: ${(error as Error).message}` };
  }

  const source = provider.mock ? "mock_bank" : "truelayer";
  let imported = 0;
  for (const tx of transactions) {
    const inserted = await db
      .insert(transactionRecords)
      .values({
        userId: user.id,
        externalId: tx.externalId,
        merchantName: tx.merchantName,
        merchantReference: tx.merchantReference,
        amount: tx.amount,
        currency: tx.currency,
        transactionDate: tx.transactionDate,
        frequencyGuess: tx.frequencyGuess,
        isRecurring: tx.isRecurring,
        source,
        matchingStatus: "unmatched",
      })
      .onConflictDoNothing()
      .returning({ id: transactionRecords.id });
    imported += inserted.length;
  }

  // Re-evaluate recurrence across all stored transactions for this user.
  const all = await db
    .select({
      id: transactionRecords.id,
      merchantName: transactionRecords.merchantName,
      amount: transactionRecords.amount,
      transactionDate: transactionRecords.transactionDate,
      currency: transactionRecords.currency,
    })
    .from(transactionRecords)
    .where(eq(transactionRecords.userId, user.id));
  const inferred = inferRecurrence(all);
  for (const [id, value] of inferred) {
    await db
      .update(transactionRecords)
      .set({ isRecurring: value.isRecurring, frequencyGuess: value.frequencyGuess })
      .where(eq(transactionRecords.id, id));
  }

  await db
    .update(connectedAccounts)
    .set({ lastSyncAt: new Date(), lastError: null, connectionStatus: "connected", updatedAt: new Date() })
    .where(eq(connectedAccounts.id, account.id));
  await recordAudit({
    userId: user.id,
    action: "integration.bank.imported",
    resourceType: "connected_account",
    resourceId: account.id,
    metadata: { source, imported, mock: provider.mock },
  });
  revalidatePath("/settings");
  revalidatePath("/subscriptions/imports");
  return {
    ok: true,
    message: `${imported} new transaction${imported === 1 ? "" : "s"} imported from ${provider.label}. Recurring charges are suggestions only — nothing was added to your subscriptions automatically.`,
  };
}

export async function matchTransactionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const transactionId = String(formData.get("transactionId") ?? "");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const db = await getDb();
  const [sub] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, user.id)))
    .limit(1);
  if (!sub) redirect("/subscriptions/imports?error=subscription-not-found");
  await db
    .update(transactionRecords)
    .set({ matchedSubscriptionId: subscriptionId, matchingStatus: "matched" })
    .where(and(eq(transactionRecords.id, transactionId), eq(transactionRecords.userId, user.id)));
  revalidatePath("/subscriptions/imports");
  redirect("/subscriptions/imports?updated=matched");
}

export async function createSubscriptionFromTransactionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const transactionId = String(formData.get("transactionId") ?? "");
  const db = await getDb();
  const [tx] = await db
    .select()
    .from(transactionRecords)
    .where(and(eq(transactionRecords.id, transactionId), eq(transactionRecords.userId, user.id)))
    .limit(1);
  if (!tx) redirect("/subscriptions/imports?error=transaction-not-found");

  const frequency = (tx.frequencyGuess ?? "monthly") as
    | "weekly"
    | "fortnightly"
    | "monthly"
    | "quarterly"
    | "semiannual"
    | "annual";
  const today = todayInTimeZone(user.timezone);
  const start = isValidISODate(tx.transactionDate) ? tx.transactionDate : today;
  const [created] = await db
    .insert(subscriptions)
    .values({
      userId: user.id,
      serviceName: tx.merchantName,
      category: "Other Services",
      price: tx.amount,
      currency: tx.currency,
      billingFrequency: frequency,
      status: "active",
      startDate: start,
      nextBillingDate: addFrequency(start, frequency),
      renewalPrice: tx.amount,
      renewalCurrency: tx.currency,
      source: "bank",
      notes: `Created from a bank transaction on ${start}. Confirm the service name, price and renewal date.`,
      lastVerifiedAt: new Date(),
    })
    .returning();

  await db.insert(priceHistory).values({
    userId: user.id,
    subscriptionId: created.id,
    price: tx.amount,
    currency: tx.currency,
    billingFrequency: frequency,
    source: "bank_import",
  });
  await db
    .update(transactionRecords)
    .set({ matchedSubscriptionId: created.id, matchingStatus: "matched" })
    .where(eq(transactionRecords.id, tx.id));
  await recordAudit({
    userId: user.id,
    action: "subscription.created_from_transaction",
    resourceType: "subscription",
    resourceId: created.id,
    metadata: { transactionId: tx.id, source: tx.source },
  });
  revalidatePath("/subscriptions");
  revalidatePath("/subscriptions/imports");
  redirect(`/subscriptions/${created.id}?created=bank`);
}

export async function dismissTransactionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const transactionId = String(formData.get("transactionId") ?? "");
  const db = await getDb();
  await db
    .update(transactionRecords)
    .set({ matchingStatus: "ignored" })
    .where(and(eq(transactionRecords.id, transactionId), eq(transactionRecords.userId, user.id)));
  revalidatePath("/subscriptions/imports");
  redirect("/subscriptions/imports?updated=dismissed");
}
