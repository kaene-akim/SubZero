import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { addDaysISO, todayInTimeZone } from "@/lib/dates";
import { generateNotificationsForUser } from "@/lib/notifications";
import { createSubscription, createUser } from "./helpers";

const today = todayInTimeZone("Europe/London");

describe("notification generation", () => {
  it("creates a trial reminder once and dedupes on repeat runs", async () => {
    const user = await createUser({ trialReminderDays: [7, 3, 1, 0] });
    await createSubscription(user.id, {
      serviceName: "Trial Service",
      status: "trial",
      trialStartDate: addDaysISO(today, -23),
      trialEndDate: addDaysISO(today, 7),
      nextBillingDate: null,
    });

    expect(await generateNotificationsForUser(user, today)).toBe(1);
    expect(await generateNotificationsForUser(user, today)).toBe(0);

    const db = await getDb();
    const rows = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].notificationType).toBe("trial_ending");
    expect(rows[0].dedupeKey).toContain("trial:");
    expect(rows[0].channels).toContain("in_app");
  });

  it("creates a renewal reminder at a configured offset", async () => {
    const user = await createUser({ trialReminderDays: [7, 3, 1, 0] });
    await createSubscription(user.id, {
      serviceName: "Renewing Service",
      status: "active",
      nextBillingDate: addDaysISO(today, 3),
    });

    expect(await generateNotificationsForUser(user, today)).toBe(1);
    const db = await getDb();
    const [row] = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    expect(row.notificationType).toBe("renewal");
    expect(row.title).toContain("3 days");
    expect(row.body).toContain("estimate");
  });

  it("does not notify for cancelled, paused or expired plans", async () => {
    const user = await createUser();
    for (const status of ["cancelled", "paused", "expired"] as const) {
      await createSubscription(user.id, {
        serviceName: `${status} service`,
        status,
        nextBillingDate: addDaysISO(today, 3),
      });
    }
    expect(await generateNotificationsForUser(user, today)).toBe(0);
  });

  it("only creates reminders inside the user's chosen offsets", async () => {
    const user = await createUser({ trialReminderDays: [1] });
    await createSubscription(user.id, {
      serviceName: "Not Due",
      status: "active",
      nextBillingDate: addDaysISO(today, 5),
    });
    expect(await generateNotificationsForUser(user, today)).toBe(0);

    await createSubscription(user.id, {
      serviceName: "Due Tomorrow",
      status: "active",
      nextBillingDate: addDaysISO(today, 1),
    });
    expect(await generateNotificationsForUser(user, today)).toBe(1);
  });

  it("keeps users' notifications separate", async () => {
    const first = await createUser();
    const second = await createUser();
    await createSubscription(first.id, { nextBillingDate: addDaysISO(today, 7) });
    await createSubscription(second.id, { nextBillingDate: addDaysISO(today, 7) });

    expect(await generateNotificationsForUser(first, today)).toBe(1);
    expect(await generateNotificationsForUser(second, today)).toBe(1);

    const db = await getDb();
    const firstRows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, first.id)));
    expect(firstRows).toHaveLength(1);
  });
});
