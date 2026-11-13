import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { idempotencyKeys } from "@/lib/db/schema";

/**
 * Execute an operation at most once for a given scope/key pair.
 *
 * This is a database-backed guard, not a lock: concurrent requests on the same
 * key may both run when using the embedded database in development. For
 * payment-critical operations the provider's own idempotency key is the
 * authoritative protection; this table prevents double submissions from the UI.
 */
export async function withIdempotency<T>(input: {
  scope: string;
  key: string;
  userId: string | null;
  requestHash?: string;
  run: () => Promise<T>;
}): Promise<{ replayed: boolean; result: T }> {
  const db = await getDb();
  const existing = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.scope, input.scope), eq(idempotencyKeys.key, input.key)))
    .limit(1);

  if (existing[0]?.response) {
    return { replayed: true, result: existing[0].response as T };
  }

  const inserted = await db
    .insert(idempotencyKeys)
    .values({
      scope: input.scope,
      key: input.key,
      userId: input.userId,
      requestHash: input.requestHash ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeys.id });

  if (inserted.length === 0) {
    const [row] = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.scope, input.scope), eq(idempotencyKeys.key, input.key)))
      .limit(1);
    if (row?.response) return { replayed: true, result: row.response as T };
    // Another request is mid-flight; refuse rather than duplicating the effect.
    throw new Error("This action is already being processed. Refresh to see the result.");
  }

  try {
    const result = await input.run();
    await db
      .update(idempotencyKeys)
      .set({ response: result as Record<string, unknown> })
      .where(eq(idempotencyKeys.id, inserted[0].id));
    return { replayed: false, result };
  } catch (error) {
    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, inserted[0].id));
    throw error;
  }
}
