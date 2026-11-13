import { getDb } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

type AuditInput = {
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
};

/** Audit entries must never contain secrets, tokens or email bodies. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(auditLogs).values({
      userId: input.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata ?? {},
      ipHash: input.ipHash ?? null,
    });
  } catch (error) {
    // Auditing must not break the user-facing operation, but failures are logged.
    console.error("audit_log_failed", error);
  }
}
