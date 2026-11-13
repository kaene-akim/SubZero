import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { oauthStates } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { TrueLayerProvider } from "@/lib/bank/provider";
import { openBankingConfigured } from "@/lib/env";
import { randomToken } from "@/lib/security/crypto";

export async function GET() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings");
  if (!openBankingConfigured) redirect("/settings?bank=not_configured");

  const state = randomToken(24);
  const db = await getDb();
  await db.insert(oauthStates).values({
    state,
    codeVerifier: "bank",
    mode: "link_bank",
    userId: user.id,
    redirectTo: "/settings",
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });

  const provider = new TrueLayerProvider();
  const url = provider.consentUrl({ state });
  if (!url) {
    return NextResponse.json({ error: "Open Banking is not configured." }, { status: 503 });
  }
  return NextResponse.redirect(url);
}
