import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { connectedAccounts, oauthStates } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { TrueLayerProvider } from "@/lib/bank/provider";
import { encryptJson } from "@/lib/security/crypto";
import { openBankingConfigured } from "@/lib/env";
import { recordAudit } from "@/lib/audit";

function fail(message: string) {
  return NextResponse.redirect(
    `${process.env.APP_URL ?? "http://localhost:3000"}/settings?bank=error&message=${encodeURIComponent(message)}`,
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return fail(`The bank returned: ${error}`);
  if (!openBankingConfigured) return fail("Open Banking is not configured in this environment.");

  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings");

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) return fail("The bank callback was missing its state or code.");

  const db = await getDb();
  const [stored] = await db
    .select()
    .from(oauthStates)
    .where(and(eq(oauthStates.state, state), eq(oauthStates.mode, "link_bank")))
    .limit(1);
  if (!stored || stored.expiresAt < new Date() || stored.userId !== user.id) {
    return fail("This bank connection attempt expired or did not belong to your session.");
  }
  await db.delete(oauthStates).where(eq(oauthStates.state, state));

  try {
    const provider = new TrueLayerProvider();
    const tokens = await provider.exchangeCode(code);
    const encrypted = encryptJson({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });
    const existing = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.userId, user.id), eq(connectedAccounts.provider, "truelayer")))
      .limit(1);
    if (existing[0]) {
      await db
        .update(connectedAccounts)
        .set({
          accountLabel: "Open Banking (TrueLayer)",
          encryptedCredentials: encrypted,
          connectionStatus: "connected",
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, existing[0].id));
    } else {
      await db.insert(connectedAccounts).values({
        userId: user.id,
        provider: "truelayer",
        providerAccountId: "truelayer-primary",
        accountLabel: "Open Banking (TrueLayer)",
        encryptedCredentials: encrypted,
        permissions: ["accounts", "transactions"],
        connectionStatus: "connected",
      });
    }
    await recordAudit({
      userId: user.id,
      action: "integration.bank.connected",
      resourceType: "connected_account",
      metadata: { provider: "truelayer" },
    });
    return NextResponse.redirect(
      `${process.env.APP_URL ?? "http://localhost:3000"}/settings?bank=connected`,
    );
  } catch (err) {
    return fail((err as Error).message);
  }
}
