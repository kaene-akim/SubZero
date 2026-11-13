import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  auditLogs,
  bundleItems,
  bundles,
  connectedAccounts,
  emailDetections,
  notifications,
  payments,
  priceHistory,
  pushSubscriptions,
  subscriptions,
  transactionRecords,
  users,
  watchedDiscounts,
} from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { todayInTimeZone } from "@/lib/dates";

export const dynamic = "force-dynamic";

const scopes = ["all", "subscriptions", "bundles", "detections", "transactions", "notifications", "price-history"] as const;
type Scope = (typeof scopes)[number];

function isScope(value: string | null): value is Scope {
  return value !== null && (scopes as readonly string[]).includes(value);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (value instanceof Date) text = value.toISOString();
  else if (typeof value === "object") text = JSON.stringify(value);
  else text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to export your data." }, { status: 401 });
  }

  const limit = rateLimit(`export:${user.id}`, 6, 10 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many export requests. Try again in a few minutes." }, { status: 429 });
  }

  const url = new URL(request.url);
  const rawScope = url.searchParams.get("scope");
  const scope: Scope = isScope(rawScope) ? rawScope : "all";
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  if (format === "csv" && scope === "all") {
    return NextResponse.json(
      { error: "Choose a single scope for CSV export (subscriptions, transactions, detections, notifications or price-history)." },
      { status: 400 },
    );
  }

  const db = await getDb();
  const date = todayInTimeZone(user.timezone);

  const subscriptionRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .orderBy(desc(subscriptions.createdAt));

  if (format === "csv") {
    let rows: Array<Record<string, unknown>> = [];
    if (scope === "subscriptions") rows = subscriptionRows;
    if (scope === "transactions") {
      rows = await db
        .select()
        .from(transactionRecords)
        .where(eq(transactionRecords.userId, user.id))
        .orderBy(desc(transactionRecords.transactionDate));
    }
    if (scope === "detections") {
      rows = await db
        .select()
        .from(emailDetections)
        .where(eq(emailDetections.userId, user.id))
        .orderBy(desc(emailDetections.detectedAt));
    }
    if (scope === "notifications") {
      rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, user.id))
        .orderBy(desc(notifications.scheduledAt));
    }
    if (scope === "price-history") {
      rows = await db
        .select()
        .from(priceHistory)
        .where(eq(priceHistory.userId, user.id))
        .orderBy(desc(priceHistory.recordedAt));
    }

    await recordAudit({
      userId: user.id,
      action: "data.exported",
      resourceType: "user",
      resourceId: user.id,
      metadata: { scope, format: "csv", rows: rows.length },
    });

    return new NextResponse(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="subzero-${scope}-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const [bundleRows, itemRows, detectionRows, transactionRows, notificationRows, accountRows, pushRows, watchRows, paymentRows, auditRows, historyRows] =
    await Promise.all([
      db.select().from(bundles).where(eq(bundles.userId, user.id)).orderBy(desc(bundles.createdAt)),
      db
        .select({ item: bundleItems, bundleId: bundles.id })
        .from(bundleItems)
        .innerJoin(bundles, eq(bundles.id, bundleItems.bundleId))
        .where(eq(bundles.userId, user.id)),
      db.select().from(emailDetections).where(eq(emailDetections.userId, user.id)).orderBy(desc(emailDetections.detectedAt)),
      db
        .select()
        .from(transactionRecords)
        .where(eq(transactionRecords.userId, user.id))
        .orderBy(desc(transactionRecords.transactionDate)),
      db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.scheduledAt)),
      db.select().from(connectedAccounts).where(eq(connectedAccounts.userId, user.id)),
      db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)),
      db.select().from(watchedDiscounts).where(eq(watchedDiscounts.userId, user.id)),
      db.select().from(payments).where(eq(payments.userId, user.id)).orderBy(desc(payments.createdAt)),
      db.select().from(auditLogs).where(eq(auditLogs.userId, user.id)).orderBy(desc(auditLogs.createdAt)).limit(1000),
      db.select().from(priceHistory).where(eq(priceHistory.userId, user.id)).orderBy(desc(priceHistory.recordedAt)),
    ]);

  const payload = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    scope,
    notice:
      "This export contains the data SubZero holds about you. Provider prices, offers and activation states are reference data recorded by you or from public catalog pages; they are not confirmations from a provider. Encrypted credentials, session tokens and password hashes are excluded.",
    account: profile
      ? {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          country: profile.country,
          timezone: profile.timezone,
          preferredCurrency: profile.preferredCurrency,
          monthlyBudget: profile.monthlyBudget,
          preferredBillingDay: profile.preferredBillingDay,
          preferredBillingFrequency: profile.preferredBillingFrequency,
          studentEligible: profile.studentEligible,
          interestedCategories: profile.interestedCategories,
          notifyEmail: profile.notifyEmail,
          notifyPush: profile.notifyPush,
          notifyInApp: profile.notifyInApp,
          trialReminderDays: profile.trialReminderDays,
          emailVerifiedAt: profile.emailVerifiedAt,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        }
      : null,
    data: {
      subscriptions: subscriptionRows,
      priceHistory: historyRows,
      bundles: bundleRows.map((bundle) => ({
        ...bundle,
        items: itemRows.filter((row) => row.bundleId === bundle.id).map((row) => row.item),
      })),
      emailDetections: detectionRows,
      transactions: transactionRows,
      notifications: notificationRows,
      connectedAccounts: accountRows.map((account) => ({
        id: account.id,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        accountLabel: account.accountLabel,
        permissions: account.permissions,
        connectionStatus: account.connectionStatus,
        lastSyncAt: account.lastSyncAt,
        lastError: account.lastError,
        consentExpiresAt: account.consentExpiresAt,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      })),
      pushSubscriptions: pushRows.map((row) => ({
        id: row.id,
        endpoint: row.endpoint,
        userAgent: row.userAgent,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
      })),
      watchedProviders: watchRows,
      payments: paymentRows,
      auditLog: auditRows,
    },
  };

  await recordAudit({
    userId: user.id,
    action: "data.exported",
    resourceType: "user",
    resourceId: user.id,
    metadata: { scope, format: "json" },
  });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="subzero-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
