import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  connectedAccounts,
  emailDetections,
  providers,
  subscriptions,
  type ConnectedAccount,
  type User,
} from "@/lib/db/schema";
import { gmailMockEnabled, googleOAuthConfigured, llmConfigured } from "@/lib/env";
import { encryptJson, decryptJson } from "@/lib/security/crypto";
import { classifyEmail, shouldPersistDetection, type ClassifierOutput } from "@/lib/gmail/classifier";
import { classifyWithLlm } from "@/lib/gmail/llm";
import type { MerchantRecord } from "@/lib/gmail/merchant-db";
import { sandboxMessages } from "@/lib/gmail/mock-inbox";
import { refreshGoogleToken, revokeGoogleToken, fetchGoogleUserInfo } from "@/lib/gmail/oauth";
import { recordAudit } from "@/lib/audit";
import { fromMinor } from "@/lib/money";
import { todayInTimeZone } from "@/lib/dates";

type StoredCredentials = {
  kind?: "oauth" | "sandbox";
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
  email?: string;
};

type NormalisedMessage = {
  id: string;
  threadId: string | null;
  from: string;
  subject: string;
  text: string;
  receivedAt: Date;
  links: Array<{ url: string; text?: string }>;
};

export type SyncResult = {
  ok: boolean;
  mode: "sandbox" | "gmail";
  processed: number;
  detections: number;
  skipped: number;
  message: string;
  errors: string[];
};

async function merchantRecords(): Promise<MerchantRecord[]> {
  const db = await getDb();
  const rows = await db.select().from(providers);
  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    website: p.website,
    aliases: p.aliases,
    serviceFamily: p.serviceFamily,
  }));
}

export async function connectSandboxAccount(user: User): Promise<ConnectedAccount> {
  if (!gmailMockEnabled) {
    throw new Error("The sandbox inbox is disabled. Set GMAIL_MOCK=true to use it in development.");
  }
  const db = await getDb();
  const existing = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, user.id), eq(connectedAccounts.provider, "google")))
    .limit(1);
  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(connectedAccounts)
    .values({
      userId: user.id,
      provider: "google",
      providerAccountId: "sandbox",
      accountLabel: "Sandbox inbox (synthetic messages)",
      encryptedCredentials: encryptJson({ kind: "sandbox" }),
      permissions: ["gmail.readonly"],
      connectionStatus: "connected",
    })
    .returning();
  await recordAudit({
    userId: user.id,
    action: "integration.gmail.sandbox_connected",
    resourceType: "connected_account",
    resourceId: created.id,
    metadata: { explicitSandbox: true },
  });
  return created;
}

export async function disconnectGmail(user: User): Promise<{ ok: boolean; message: string }> {
  const db = await getDb();
  const [account] = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, user.id), eq(connectedAccounts.provider, "google")))
    .limit(1);
  if (!account) return { ok: false, message: "No Gmail account is connected." };

  try {
    const creds = decryptJson<StoredCredentials>(account.encryptedCredentials);
    const token = creds.refreshToken ?? creds.accessToken;
    if (token) await revokeGoogleToken(token);
  } catch (error) {
    console.warn("gmail_revoke_failed", (error as Error).message);
  }

  await db.delete(connectedAccounts).where(eq(connectedAccounts.id, account.id));
  await recordAudit({
    userId: user.id,
    action: "integration.gmail.disconnected",
    resourceType: "connected_account",
    resourceId: account.id,
  });
  return { ok: true, message: "Gmail disconnected and the stored token was revoked." };
}

function decodeBody(data: string): string {
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMessageText(payload: GmailPayload | undefined): string {
  if (!payload) return "";
  if (payload.body?.data) {
    const decoded = decodeBody(payload.body.data);
    return payload.mimeType === "text/html" ? stripHtml(decoded) : decoded;
  }
  if (!payload.parts) return "";
  const plain: string[] = [];
  const html: string[] = [];
  for (const part of payload.parts) {
    if (part.mimeType === "text/plain" && part.body?.data) plain.push(decodeBody(part.body.data));
    else if (part.mimeType === "text/html" && part.body?.data) html.push(decodeBody(part.body.data));
    else if (part.parts) {
      const nested = extractMessageText(part);
      if (nested) plain.push(nested);
    }
  }
  if (plain.length) return plain.join("\n");
  return html.map(stripHtml).join("\n");
}

type GmailPayload = {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string };
  parts?: GmailPayload[];
};

type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  payload?: GmailPayload;
};

function header(payload: GmailPayload | undefined, name: string): string {
  return payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function normaliseGmailMessage(message: GmailMessage): NormalisedMessage {
  const text = extractMessageText(message.payload);
  const links = [...text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)]
    .slice(0, 30)
    .map((m) => ({ url: m[0] }));
  return {
    id: message.id,
    threadId: message.threadId ?? null,
    from: header(message.payload, "From"),
    subject: header(message.payload, "Subject") || "(no subject)",
    text,
    receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date(),
    links,
  };
}

async function googleFetch<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function ensureAccessToken(account: ConnectedAccount): Promise<string> {
  const creds = decryptJson<StoredCredentials>(account.encryptedCredentials);
  if (creds.kind === "sandbox") throw new Error("Sandbox account has no Google access token.");
  if (creds.accessToken && creds.expiresAt && creds.expiresAt > Date.now() + 60_000) {
    return creds.accessToken;
  }
  if (!creds.refreshToken) throw new Error("The Gmail connection has no refresh token. Reconnect Gmail.");
  const refreshed = await refreshGoogleToken(creds.refreshToken);
  const db = await getDb();
  const next: StoredCredentials = {
    kind: "oauth",
    accessToken: refreshed.access_token,
    refreshToken: creds.refreshToken,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
    scope: refreshed.scope,
    tokenType: refreshed.token_type,
    email: creds.email,
  };
  await db
    .update(connectedAccounts)
    .set({ encryptedCredentials: encryptJson(next), updatedAt: new Date() })
    .where(eq(connectedAccounts.id, account.id));
  return refreshed.access_token;
}

const GMAIL_QUERY =
  "newer_than:365d (receipt OR invoice OR subscription OR trial OR renewal OR billing OR payment OR cancelled OR canceled)";

async function fetchGmailMessages(account: ConnectedAccount): Promise<{
  messages: NormalisedMessage[];
  cursor: string | null;
}> {
  const accessToken = await ensureAccessToken(account);
  const ids = new Set<string>();

  if (account.syncCursor) {
    try {
      const history = await googleFetch<{
        history?: Array<{ messagesAdded?: Array<{ message?: { id: string } }> }>;
      }>(
        `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(account.syncCursor)}&historyTypes=messageAdded&maxResults=100`,
        accessToken,
      );
      for (const h of history.history ?? []) {
        for (const m of h.messagesAdded ?? []) if (m.message?.id) ids.add(m.message.id);
      }
    } catch (error) {
      console.warn("gmail_history_unavailable", (error as Error).message);
    }
  }

  if (ids.size === 0) {
    const list = await googleFetch<{ messages?: Array<{ id: string }> }>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(GMAIL_QUERY)}&maxResults=50`,
      accessToken,
    );
    for (const m of list.messages ?? []) ids.add(m.id);
  }

  const messages: NormalisedMessage[] = [];
  for (const id of ids) {
    try {
      const full = await googleFetch<GmailMessage>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        accessToken,
      );
      messages.push(normaliseGmailMessage(full));
    } catch (error) {
      console.warn("gmail_message_failed", id, (error as Error).message);
    }
  }

  let cursor: string | null = null;
  try {
    const profile = await googleFetch<{ historyId?: string }>(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      accessToken,
    );
    cursor = profile.historyId ?? null;
  } catch {
    cursor = null;
  }

  return { messages, cursor };
}

async function persistDetection(
  user: User,
  accountId: string,
  message: NormalisedMessage,
  output: ClassifierOutput,
): Promise<boolean> {
  const db = await getDb();
  const inserted = await db
    .insert(emailDetections)
    .values({
      userId: user.id,
      connectedAccountId: accountId,
      providerId: output.merchant.providerId,
      gmailMessageId: message.id,
      threadId: message.threadId,
      subject: message.subject,
      sender: message.from,
      snippet: message.text.replace(/\s+/g, " ").slice(0, 240),
      receivedAt: message.receivedAt,
      classification: output.classification,
      extractedData: {
        ...output.extracted,
        evidence: output.evidence,
        missing: output.missing,
        reasons: output.reasons,
        signals: output.signals,
        merchantName: output.merchant.merchant?.name ?? output.merchant.inferredName,
        matchedOn: output.merchant.matchedOn,
      },
      confidenceScore: output.confidence.toFixed(2),
      confidenceReasons: output.reasons.slice(0, 20),
      classifierVersion: output.classifierVersion,
      reviewStatus: "pending",
    })
    .onConflictDoNothing()
    .returning({ id: emailDetections.id });
  return inserted.length > 0;
}

export async function syncGmailAccount(user: User): Promise<SyncResult> {
  const db = await getDb();
  const [account] = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, user.id), eq(connectedAccounts.provider, "google")))
    .limit(1);

  if (!account) {
    return {
      ok: false,
      mode: gmailMockEnabled ? "sandbox" : "gmail",
      processed: 0,
      detections: 0,
      skipped: 0,
      message: gmailMockEnabled
        ? "No inbox connected. Connect the explicit sandbox inbox first — it contains synthetic messages, not your email."
        : "No Gmail account connected. Connect Gmail from Settings to scan for subscription emails.",
      errors: [],
    };
  }

  let creds: StoredCredentials;
  try {
    creds = decryptJson<StoredCredentials>(account.encryptedCredentials);
  } catch {
    return {
      ok: false,
      mode: "gmail",
      processed: 0,
      detections: 0,
      skipped: 0,
      message: "Stored credentials could not be decrypted. Disconnect and reconnect Gmail.",
      errors: ["credential_decryption_failed"],
    };
  }

  const isSandbox = creds.kind === "sandbox";
  if (!isSandbox && !googleOAuthConfigured) {
    return {
      ok: false,
      mode: "gmail",
      processed: 0,
      detections: 0,
      skipped: 0,
      message: "Google OAuth is not configured in this environment. Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or use the sandbox inbox.",
      errors: ["oauth_not_configured"],
    };
  }

  let messages: NormalisedMessage[];
  let cursor: string | null = null;
  try {
    if (isSandbox) {
      messages = sandboxMessages(user.timezone).map((m) => ({
        id: m.id,
        threadId: m.threadId,
        from: m.from,
        subject: m.subject,
        text: m.text,
        receivedAt: m.receivedAt,
        links: [...m.text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)].map((x) => ({ url: x[0] })),
      }));
    } else {
      const fetched = await fetchGmailMessages(account);
      messages = fetched.messages;
      cursor = fetched.cursor;
    }
  } catch (error) {
    const message = (error as Error).message;
    await db
      .update(connectedAccounts)
      .set({ lastError: message.slice(0, 500), connectionStatus: "error", updatedAt: new Date() })
      .where(eq(connectedAccounts.id, account.id));
    return {
      ok: false,
      mode: isSandbox ? "sandbox" : "gmail",
      processed: 0,
      detections: 0,
      skipped: 0,
      message: `Inbox sync failed: ${message}`,
      errors: [message],
    };
  }

  const merchants = await merchantRecords();
  let processed = 0;
  let detections = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const message of messages) {
    try {
      const base = classifyEmail(
        {
          from: message.from,
          subject: message.subject,
          text: message.text,
          links: message.links,
          receivedAt: message.receivedAt,
          userEmail: user.email,
        },
        { merchants, userEmail: user.email },
      );
      const output = llmConfigured ? await classifyWithLlm({ ...message, links: message.links, userEmail: user.email }, base, merchants) : base;
      processed++;
      if (!shouldPersistDetection(output)) {
        skipped++;
        continue;
      }
      const created = await persistDetection(user, account.id, message, output);
      if (created) detections++;
    } catch (error) {
      errors.push(`${message.id}: ${(error as Error).message}`);
    }
  }

  await db
    .update(connectedAccounts)
    .set({
      lastSyncAt: new Date(),
      syncCursor: cursor ?? account.syncCursor,
      lastError: errors.length ? errors[0].slice(0, 500) : null,
      connectionStatus: errors.length && processed === 0 ? "error" : "connected",
      updatedAt: new Date(),
    })
    .where(eq(connectedAccounts.id, account.id));

  await recordAudit({
    userId: user.id,
    action: "integration.gmail.synced",
    resourceType: "connected_account",
    resourceId: account.id,
    metadata: { mode: isSandbox ? "sandbox" : "gmail", processed, detections, skipped, errors: errors.length },
  });

  return {
    ok: true,
    mode: isSandbox ? "sandbox" : "gmail",
    processed,
    detections,
    skipped,
    message: isSandbox
      ? `Sandbox sync complete: ${processed} synthetic messages reviewed, ${detections} new detection${detections === 1 ? "" : "s"}. No real email was accessed.`
      : `Gmail sync complete: ${processed} messages reviewed, ${detections} new detection${detections === 1 ? "" : "s"}.`,
    errors,
  };
}

export async function confirmDetection(user: User, detectionId: string): Promise<{ ok: boolean; message: string; subscriptionId?: string }> {
  const db = await getDb();
  const [row] = await db
    .select({ detection: emailDetections, provider: providers })
    .from(emailDetections)
    .leftJoin(providers, eq(providers.id, emailDetections.providerId))
    .where(and(eq(emailDetections.id, detectionId), eq(emailDetections.userId, user.id)))
    .limit(1);
  if (!row) return { ok: false, message: "Detection not found." };
  if (row.detection.reviewStatus === "confirmed" || row.detection.reviewStatus === "merged") {
    return { ok: false, message: "This detection has already been reviewed." };
  }

  const extracted = row.detection.extractedData as Record<string, unknown>;
  const classification = row.detection.classification;

  if (classification === "cancelled" || classification === "expired") {
    const [match] = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, user.id),
          row.provider?.id
            ? eq(subscriptions.providerId, row.provider.id)
            : eq(subscriptions.serviceName, String(extracted.serviceName ?? row.provider?.name ?? "")),
        ),
      )
      .limit(1);
    if (match) {
      await db
        .update(subscriptions)
        .set({
          status: classification === "cancelled" ? "cancelled" : "expired",
          cancellationStatus: classification === "cancelled" ? "confirmed" : match.cancellationStatus,
          cancelledAt: classification === "cancelled" ? new Date() : match.cancelledAt,
          cancellationConfirmedAt: classification === "cancelled" ? new Date() : match.cancellationConfirmedAt,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, match.id));
      await db
        .update(emailDetections)
        .set({ reviewStatus: "confirmed", reviewedAt: new Date(), subscriptionId: match.id })
        .where(eq(emailDetections.id, detectionId));
      await recordAudit({
        userId: user.id,
        action: "detection.confirmed",
        resourceType: "email_detection",
        resourceId: detectionId,
        metadata: { applied: classification, subscriptionId: match.id },
      });
      return {
        ok: true,
        message: `Marked ${match.serviceName} as ${classification} based on the provider email.`,
        subscriptionId: match.id,
      };
    }
    await db
      .update(emailDetections)
      .set({ reviewStatus: "confirmed", reviewedAt: new Date() })
      .where(eq(emailDetections.id, detectionId));
    return {
      ok: true,
      message: "Confirmed, but no matching subscription existed. Add the subscription manually if you still need to track it.",
    };
  }

  const serviceName =
    String(extracted.serviceName ?? "") ||
    row.provider?.name ||
    String(extracted.merchantName ?? "Unknown service");
  const priceMinor = typeof extracted.priceMinor === "number" ? extracted.priceMinor : null;
  const currency = String(extracted.currency ?? "GBP");
  const status =
    classification === "free_trial"
      ? "trial"
      : classification === "failed_payment"
        ? "payment_failed"
        : "active";
  const frequency = (extracted.billingFrequency as string | null) ?? "monthly";

  const existing = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, user.id),
        row.provider?.id
          ? eq(subscriptions.providerId, row.provider.id)
          : eq(subscriptions.serviceName, serviceName),
      ),
    )
    .limit(1);

  let subscriptionId: string;
  if (existing[0]) {
    const [updated] = await db
      .update(subscriptions)
      .set({
        serviceName,
        status,
        price: priceMinor === null ? existing[0].price : fromMinor(priceMinor, String(currency)),
        currency: String(currency),
        billingFrequency: frequency as typeof subscriptions.$inferSelect.billingFrequency,
        trialEndDate: (extracted.trialEndDate as string | null) ?? existing[0].trialEndDate,
        trialStartDate: (extracted.trialStartDate as string | null) ?? existing[0].trialStartDate,
        nextBillingDate: (extracted.nextBillingDate as string | null) ?? existing[0].nextBillingDate,
        source: "gmail",
        confidenceScore: row.detection.confidenceScore,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, existing[0].id))
      .returning({ id: subscriptions.id });
    subscriptionId = updated.id;
  } else {
    const [created] = await db
      .insert(subscriptions)
      .values({
        userId: user.id,
        providerId: row.provider?.id ?? null,
        serviceName,
        category: row.provider?.category ?? "Other Services",
        price: priceMinor === null ? null : fromMinor(priceMinor, String(currency)),
        currency: String(currency),
        billingFrequency: frequency as typeof subscriptions.$inferSelect.billingFrequency,
        status,
        startDate: (extracted.startDate as string | null) ?? null,
        nextBillingDate: (extracted.nextBillingDate as string | null) ?? null,
        trialStartDate: (extracted.trialStartDate as string | null) ?? null,
        trialEndDate: (extracted.trialEndDate as string | null) ?? null,
        renewalPrice: priceMinor === null ? null : fromMinor(priceMinor, String(currency)),
        renewalCurrency: String(currency),
        managementUrl: (extracted.managementUrl as string | null) ?? row.provider?.managementUrl ?? null,
        cancellationUrl: (extracted.cancellationUrl as string | null) ?? row.provider?.cancellationUrl ?? null,
        source: "gmail",
        confidenceScore: row.detection.confidenceScore,
      })
      .returning({ id: subscriptions.id });
    subscriptionId = created.id;
  }

  if (priceMinor !== null) {
    const { priceHistory } = await import("@/lib/db/schema");
    await db.insert(priceHistory).values({
      userId: user.id,
      subscriptionId,
      providerId: row.provider?.id ?? null,
      price: fromMinor(priceMinor, String(currency)),
      currency: String(currency),
      billingFrequency: frequency as typeof subscriptions.$inferSelect.billingFrequency,
      source: "gmail_detection",
    });
  }

  await db
    .update(emailDetections)
    .set({ reviewStatus: "confirmed", reviewedAt: new Date(), subscriptionId })
    .where(eq(emailDetections.id, detectionId));

  await recordAudit({
    userId: user.id,
    action: "detection.confirmed",
    resourceType: "email_detection",
    resourceId: detectionId,
    metadata: { subscriptionId, classification, mode: gmailMockEnabled ? "sandbox" : "gmail" },
  });

  return {
    ok: true,
    message: existing[0]
      ? `Updated the existing ${serviceName} subscription from this email.`
      : `Added ${serviceName} from this email. Review the price and dates before relying on them.`,
    subscriptionId,
  };
}

export async function rejectDetection(user: User, detectionId: string): Promise<{ ok: boolean; message: string }> {
  const db = await getDb();
  const updated = await db
    .update(emailDetections)
    .set({ reviewStatus: "rejected", reviewedAt: new Date() })
    .where(and(eq(emailDetections.id, detectionId), eq(emailDetections.userId, user.id)))
    .returning({ id: emailDetections.id });
  if (!updated[0]) return { ok: false, message: "Detection not found." };
  await recordAudit({
    userId: user.id,
    action: "detection.rejected",
    resourceType: "email_detection",
    resourceId: detectionId,
  });
  return { ok: true, message: "Detection dismissed. No subscription was created." };
}

export async function mergeDetection(
  user: User,
  detectionId: string,
  subscriptionId: string,
): Promise<{ ok: boolean; message: string }> {
  const db = await getDb();
  const [sub] = await db
    .select({ id: subscriptions.id, name: subscriptions.serviceName })
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, user.id)))
    .limit(1);
  if (!sub) return { ok: false, message: "Choose one of your existing subscriptions." };
  const updated = await db
    .update(emailDetections)
    .set({ reviewStatus: "merged", reviewedAt: new Date(), subscriptionId })
    .where(and(eq(emailDetections.id, detectionId), eq(emailDetections.userId, user.id)))
    .returning({ id: emailDetections.id });
  if (!updated[0]) return { ok: false, message: "Detection not found." };
  await recordAudit({
    userId: user.id,
    action: "detection.merged",
    resourceType: "email_detection",
    resourceId: detectionId,
    metadata: { subscriptionId },
  });
  return { ok: true, message: `Linked this email to ${sub.name}.` };
}

export async function gmailConnectionStatus(userId: string): Promise<{
  connected: boolean;
  sandbox: boolean;
  label: string | null;
  lastSyncAt: Date | null;
  lastError: string | null;
  canUseSandbox: boolean;
  oauthConfigured: boolean;
}> {
  const db = await getDb();
  const [account] = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, userId), eq(connectedAccounts.provider, "google")))
    .limit(1);
  let sandbox = false;
  if (account) {
    try {
      sandbox = decryptJson<StoredCredentials>(account.encryptedCredentials).kind === "sandbox";
    } catch {
      sandbox = false;
    }
  }
  return {
    connected: Boolean(account),
    sandbox,
    label: account?.accountLabel ?? null,
    lastSyncAt: account?.lastSyncAt ?? null,
    lastError: account?.lastError ?? null,
    canUseSandbox: gmailMockEnabled,
    oauthConfigured: googleOAuthConfigured,
  };
}

export async function connectOAuthAccount(input: {
  user: User;
  providerAccountId: string;
  email: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope: string;
  tokenType: string;
}): Promise<ConnectedAccount> {
  const db = await getDb();
  const encrypted = encryptJson({
    kind: "oauth",
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: Date.now() + input.expiresIn * 1000,
    scope: input.scope,
    tokenType: input.tokenType,
    email: input.email,
  } satisfies StoredCredentials);

  const existing = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, input.user.id), eq(connectedAccounts.provider, "google")))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(connectedAccounts)
      .set({
        providerAccountId: input.providerAccountId,
        accountLabel: input.email,
        encryptedCredentials: encrypted,
        permissions: ["gmail.readonly"],
        connectionStatus: "connected",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(connectedAccounts.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(connectedAccounts)
    .values({
      userId: input.user.id,
      provider: "google",
      providerAccountId: input.providerAccountId,
      accountLabel: input.email,
      encryptedCredentials: encrypted,
      permissions: ["gmail.readonly"],
      connectionStatus: "connected",
    })
    .returning();
  return created;
}

export async function profileEmailFromToken(accessToken: string): Promise<string> {
  const info = await fetchGoogleUserInfo(accessToken);
  return info.email ?? info.sub;
}

export function todayForUser(user: User): string {
  return todayInTimeZone(user.timezone);
}
