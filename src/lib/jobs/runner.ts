import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  connectedAccounts,
  jobRuns,
  subscriptions,
  users,
  type User,
} from "@/lib/db/schema";
import { addFrequency, todayInTimeZone } from "@/lib/dates";
import { reconcileStatus } from "@/lib/engines/billing";
import { decryptJson } from "@/lib/security/crypto";
import { generateNotificationsForAllUsers, deliverDueNotifications } from "@/lib/notifications";
import { syncGmailAccount } from "@/lib/gmail/service";
import { recordAudit } from "@/lib/audit";

export type TickSummary = {
  jobRunId: string;
  reconciled: number;
  notificationsCreated: number;
  notificationsDelivered: number;
  notificationsFailed: number;
  inboxesSynced: number;
  errors: string[];
};

async function reconcileBillingDates(): Promise<number> {
  const db = await getDb();
  const allUsers = await db.select().from(users);
  const tzByUser = new Map(allUsers.map((u) => [u.id, u.timezone]));
  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      or(
        eq(subscriptions.status, "active"),
        eq(subscriptions.status, "trial"),
        eq(subscriptions.status, "payment_failed"),
        eq(subscriptions.status, "pending_cancellation"),
      ),
    );

  let changed = 0;
  for (const sub of rows) {
    const today = todayInTimeZone(tzByUser.get(sub.userId) ?? "Europe/London");
    const nextStatus = reconcileStatus(
      {
        id: sub.id,
        serviceName: sub.serviceName,
        category: sub.category,
        priceMinor: null,
        currency: sub.currency,
        billingFrequency: sub.billingFrequency,
        status: sub.status,
        startDate: sub.startDate,
        nextBillingDate: sub.nextBillingDate,
        trialEndDate: sub.trialEndDate,
      },
      today,
    );

    let nextBilling = sub.nextBillingDate;
    if (sub.status === "trial" && sub.trialEndDate && nextStatus === "active" && !nextBilling) {
      nextBilling = sub.trialEndDate;
    }
    if (nextBilling && nextStatus !== "trial") {
      const anchorDay = Number(nextBilling.slice(8, 10));
      let guard = 0;
      while (nextBilling < today && guard < 400) {
        nextBilling = addFrequency(nextBilling, sub.billingFrequency, 1, anchorDay);
        guard++;
      }
    }

    if (nextStatus !== sub.status || nextBilling !== sub.nextBillingDate) {
      await db
        .update(subscriptions)
        .set({
          status: nextStatus as typeof sub.status,
          nextBillingDate: nextBilling,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, sub.id));
      changed++;
    }
  }
  return changed;
}

async function syncDueInboxes(): Promise<{ count: number; errors: string[] }> {
  const db = await getDb();
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60_000);
  const accounts = await db
    .select({ account: connectedAccounts, user: users })
    .from(connectedAccounts)
    .innerJoin(users, eq(users.id, connectedAccounts.userId))
    .where(
      and(
        eq(connectedAccounts.provider, "google"),
        eq(connectedAccounts.connectionStatus, "connected"),
        or(isNull(connectedAccounts.lastSyncAt), lt(connectedAccounts.lastSyncAt, sixHoursAgo)),
      ),
    );

  let count = 0;
  const errors: string[] = [];
  for (const { account, user } of accounts) {
    try {
      const creds = decryptJson<{ kind?: string }>(account.encryptedCredentials);
      // Sandbox inboxes are only synced on explicit user action.
      if (creds.kind === "sandbox") continue;
      const result = await syncGmailAccount(user as User);
      if (result.ok) count++;
      else errors.push(result.message);
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  return { count, errors };
}

/**
 * One idempotent tick of the background pipeline. It is safe to run more often
 * than necessary: notification dedupe keys and per-message detection keys stop
 * duplicate work.
 */
export async function runTick(trigger = "cron"): Promise<TickSummary> {
  const db = await getDb();
  const [run] = await db
    .insert(jobRuns)
    .values({ name: "tick", status: "running", summary: { trigger } })
    .returning();

  const errors: string[] = [];
  let reconciled = 0;
  let notificationsCreated = 0;
  let delivered = 0;
  let failed = 0;
  let inboxesSynced = 0;

  try {
    reconciled = await reconcileBillingDates();
    notificationsCreated = await generateNotificationsForAllUsers();
    const delivery = await deliverDueNotifications();
    delivered = delivery.delivered;
    failed = delivery.failed;
    const inboxes = await syncDueInboxes();
    inboxesSynced = inboxes.count;
    errors.push(...inboxes.errors);

    const summary = {
      trigger,
      reconciled,
      notificationsCreated,
      notificationsDelivered: delivered,
      notificationsFailed: failed,
      inboxesSynced,
      errors: errors.slice(0, 20),
    };
    await db
      .update(jobRuns)
      .set({ status: "succeeded", finishedAt: new Date(), summary })
      .where(eq(jobRuns.id, run.id));
    await recordAudit({
      userId: null,
      action: "jobs.tick",
      resourceType: "job_run",
      resourceId: run.id,
      metadata: summary,
    });
    return {
      jobRunId: run.id,
      reconciled,
      notificationsCreated,
      notificationsDelivered: delivered,
      notificationsFailed: failed,
      inboxesSynced,
      errors,
    };
  } catch (error) {
    errors.push((error as Error).message);
    await db
      .update(jobRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: (error as Error).message.slice(0, 1000),
        summary: { trigger, errors: errors.slice(0, 20) },
      })
      .where(eq(jobRuns.id, run.id));
    return {
      jobRunId: run.id,
      reconciled,
      notificationsCreated,
      notificationsDelivered: delivered,
      notificationsFailed: failed,
      inboxesSynced,
      errors,
    };
  }
}
