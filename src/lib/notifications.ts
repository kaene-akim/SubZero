import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  notifications,
  pushSubscriptions,
  subscriptions,
  users,
  type Notification,
  type User,
} from "@/lib/db/schema";
import { addDaysISO, daysBetween, formatDate, todayInTimeZone, type ISODate } from "@/lib/dates";
import { formatMoneyString } from "@/lib/money";
import { env, emailConfigured, pushConfigured } from "@/lib/env";
import { sendEmail, renewalReminderEmail, trialReminderEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";

const REMINDER_OFFSETS = [7, 3, 1, 0];

function dedupe(parts: Array<string | number>): string {
  return parts.join(":");
}

/**
 * Create due reminders for one user. Insert-only with a unique dedupe key, so
 * running the job repeatedly never spams the user. Nothing is sent here; a
 * separate delivery step marks rows sent only after a channel accepted them.
 */
export async function generateNotificationsForUser(user: User, today: ISODate): Promise<number> {
  const db = await getDb();
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
  const candidates: Array<typeof notifications.$inferInsert> = [];
  const offsets = user.trialReminderDays.length ? user.trialReminderDays : REMINDER_OFFSETS;

  for (const sub of rows) {
    if (["cancelled", "expired", "paused"].includes(sub.status)) continue;

    if (sub.status === "trial" && sub.trialEndDate) {
      const remaining = daysBetween(today, sub.trialEndDate);
      if (offsets.includes(remaining)) {
        const price = sub.renewalPrice
          ? formatMoneyString(sub.renewalPrice, sub.renewalCurrency)
          : "the provider's renewal price";
        candidates.push({
          userId: user.id,
          subscriptionId: sub.id,
          notificationType: "trial_ending",
          title:
            remaining === 0
              ? `${sub.serviceName} trial ends today`
              : `${sub.serviceName} trial ends in ${remaining} day${remaining === 1 ? "" : "s"}`,
          body: `The trial is expected to renew on ${formatDate(sub.trialEndDate)} at ${price}. Cancel with the provider before the deadline if you do not want to continue.`,
          href: `/subscriptions/${sub.id}`,
          channels: ["in_app", ...(user.notifyEmail ? ["email"] : []), ...(user.notifyPush ? ["push"] : [])],
          scheduledAt: new Date(),
          dedupeKey: dedupe(["trial", sub.id, sub.trialEndDate, remaining]),
          metadata: { trialEndDate: sub.trialEndDate, remaining },
        });
      }
    }

    if (sub.nextBillingDate && sub.status !== "trial") {
      const remaining = daysBetween(today, sub.nextBillingDate);
      if (REMINDER_OFFSETS.includes(remaining)) {
        const price = sub.price
          ? formatMoneyString(sub.renewalPrice ?? sub.price, sub.renewalCurrency || sub.currency)
          : "an unknown amount";
        candidates.push({
          userId: user.id,
          subscriptionId: sub.id,
          notificationType: "renewal",
          title:
            remaining === 0
              ? `${sub.serviceName} renews today`
              : `${sub.serviceName} renews in ${remaining} day${remaining === 1 ? "" : "s"}`,
          body: `Expected renewal on ${formatDate(sub.nextBillingDate)} for ${price}. This is an estimate based on the billing details you recorded.`,
          href: `/subscriptions/${sub.id}`,
          channels: ["in_app", ...(user.notifyEmail ? ["email"] : []), ...(user.notifyPush ? ["push"] : [])],
          scheduledAt: new Date(),
          dedupeKey: dedupe(["renewal", sub.id, sub.nextBillingDate, remaining]),
          metadata: { nextBillingDate: sub.nextBillingDate, remaining },
        });
      }
    }

    if (sub.status === "payment_failed") {
      candidates.push({
        userId: user.id,
        subscriptionId: sub.id,
        notificationType: "payment_failed",
        title: `${sub.serviceName} payment failed`,
        body: "The provider reported a failed payment. Update the payment method with the provider to avoid losing access.",
        href: `/subscriptions/${sub.id}`,
        channels: ["in_app", ...(user.notifyEmail ? ["email"] : [])],
        scheduledAt: new Date(),
        dedupeKey: dedupe(["payment_failed", sub.id, today]),
        metadata: {},
      });
    }
  }

  if (candidates.length === 0) return 0;
  const inserted = await db
    .insert(notifications)
    .values(candidates)
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return inserted.length;
}

export async function generateNotificationsForAllUsers(today?: ISODate): Promise<number> {
  const db = await getDb();
  const all = await db.select().from(users).where(eq(users.isDemo, false));
  let total = 0;
  for (const user of all) {
    if (user.deletedAt) continue;
    total += await generateNotificationsForUser(user, today ?? todayInTimeZone(user.timezone));
  }
  return total;
}

async function sendPush(notification: Notification, user: User): Promise<boolean> {
  if (!pushConfigured) return false;
  try {
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    const db = await getDb();
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, user.id));
    let delivered = false;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: notification.title,
            body: notification.body,
            url: notification.href ?? "/notifications",
            tag: notification.dedupeKey,
          }),
        );
        delivered = true;
      } catch (error) {
        console.warn("push_delivery_failed", (error as Error).message);
      }
    }
    return delivered;
  } catch (error) {
    console.warn("push_not_configured", (error as Error).message);
    return false;
  }
}

/**
 * Deliver pending notifications that are due. The in-app inbox is always
 * written; email and push are attempted only when configured, and the row is
 * marked sent only when at least one configured channel accepted it.
 */
export async function deliverDueNotifications(limit = 100): Promise<{ delivered: number; failed: number }> {
  const db = await getDb();
  const due = await db
    .select({ notification: notifications, user: users })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(and(eq(notifications.status, "pending"), lte(notifications.scheduledAt, new Date())))
    .limit(limit);

  let delivered = 0;
  let failed = 0;
  for (const { notification, user } of due) {
    let accepted = true;
    if (notification.channels.includes("email") && user.notifyEmail) {
      const mail = notification.notificationType === "trial_ending"
        ? trialReminderEmail(
            user.name,
            notification.title.replace(/ trial.*/i, ""),
            formatDate(String(notification.metadata?.trialEndDate ?? "")),
            notification.body,
            `${env.APP_URL}${notification.href ?? "/notifications"}`,
          )
        : renewalReminderEmail(
            user.name,
            notification.title.replace(/ renews.*/i, ""),
            formatDate(String(notification.metadata?.nextBillingDate ?? "")),
            notification.body,
            `${env.APP_URL}${notification.href ?? "/notifications"}`,
          );
      const result = await sendEmail({ to: user.email, ...mail });
      // If email is configured and fails, retry later rather than claiming success.
      if (emailConfigured && !result.delivered) accepted = false;
    }
    if (notification.channels.includes("push") && user.notifyPush) {
      const pushed = await sendPush(notification, user);
      if (!pushed && pushConfigured) accepted = false;
    }

    if (accepted) {
      await db
        .update(notifications)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(notifications.id, notification.id));
      delivered++;
    } else {
      await db.update(notifications).set({ status: "failed" }).where(eq(notifications.id, notification.id));
      failed++;
    }
  }
  return { delivered, failed };
}

/** Create a single notification, e.g. after a bundle schedule is generated. */
export async function createNotification(input: {
  userId: string;
  subscriptionId?: string | null;
  bundleId?: string | null;
  type: string;
  title: string;
  body: string;
  href?: string;
  dedupeKey: string;
  channels?: string[];
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  await db
    .insert(notifications)
    .values({
      userId: input.userId,
      subscriptionId: input.subscriptionId ?? null,
      bundleId: input.bundleId ?? null,
      notificationType: input.type,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      channels: input.channels ?? ["in_app"],
      scheduledAt: new Date(),
      dedupeKey: input.dedupeKey,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing();
  await recordAudit({
    userId: input.userId,
    action: "notification.created",
    resourceType: "notification",
    metadata: { type: input.type, dedupeKey: input.dedupeKey },
  });
}
