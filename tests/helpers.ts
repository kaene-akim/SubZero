import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { subscriptions, users, type Subscription, type User } from "@/lib/db/schema";

let counter = 0;

export async function createUser(overrides: Partial<typeof users.$inferInsert> = {}): Promise<User> {
  const db = await getDb();
  counter += 1;
  const [user] = await db
    .insert(users)
    .values({
      name: `Test User ${counter}`,
      email: `test-${counter}-${randomUUID()}@example.com`,
      passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      ...overrides,
    })
    .returning();
  return user;
}

export async function createSubscription(
  userId: string,
  overrides: Partial<typeof subscriptions.$inferInsert> = {},
): Promise<Subscription> {
  const db = await getDb();
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      userId,
      serviceName: "Test Service",
      category: "Software and Productivity",
      price: "9.99",
      currency: "GBP",
      billingFrequency: "monthly",
      status: "active",
      renewalPrice: "9.99",
      renewalCurrency: "GBP",
      source: "manual",
      ...overrides,
    })
    .returning();
  return subscription;
}
