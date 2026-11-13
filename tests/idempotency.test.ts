import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { idempotencyKeys } from "@/lib/db/schema";
import { withIdempotency } from "@/lib/idempotency";
import { createUser } from "./helpers";

describe("withIdempotency", () => {
  it("runs the operation once and replays the stored result", async () => {
    const user = await createUser();
    let runs = 0;
    const key = randomUUID();

    const first = await withIdempotency({
      scope: "test.bundle",
      key,
      userId: user.id,
      run: async () => {
        runs += 1;
        return { ok: true, value: 42 };
      },
    });
    expect(first.replayed).toBe(false);
    expect(first.result.value).toBe(42);

    const second = await withIdempotency({
      scope: "test.bundle",
      key,
      userId: user.id,
      run: async () => {
        runs += 1;
        return { ok: true, value: 99 };
      },
    });
    expect(second.replayed).toBe(true);
    expect(second.result.value).toBe(42);
    expect(runs).toBe(1);
  });

  it("keeps scopes independent even with the same key", async () => {
    const user = await createUser();
    const key = randomUUID();
    let runs = 0;

    await withIdempotency({ scope: "scope.a", key, userId: user.id, run: async () => ({ n: (runs += 1) }) });
    const other = await withIdempotency({ scope: "scope.b", key, userId: user.id, run: async () => ({ n: (runs += 1) }) });

    expect(other.replayed).toBe(false);
    expect(runs).toBe(2);
  });

  it("releases the key when the operation fails so a retry can run", async () => {
    const user = await createUser();
    const key = randomUUID();

    await expect(
      withIdempotency({
        scope: "test.failure",
        key,
        userId: user.id,
        run: async () => {
          throw new Error("provider unavailable");
        },
      }),
    ).rejects.toThrow("provider unavailable");

    const db = await getDb();
    const rows = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
    expect(rows).toHaveLength(0);

    const retry = await withIdempotency({
      scope: "test.failure",
      key,
      userId: user.id,
      run: async () => ({ recovered: true }),
    });
    expect(retry.replayed).toBe(false);
    expect(retry.result.recovered).toBe(true);
  });
});
