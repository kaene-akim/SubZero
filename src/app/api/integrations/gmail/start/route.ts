import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { oauthStates } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { buildGoogleAuthUrl, createPkcePair } from "@/lib/gmail/oauth";
import { googleOAuthConfigured } from "@/lib/env";
import { randomToken } from "@/lib/security/crypto";

export async function GET() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings");

  if (!googleOAuthConfigured) {
    redirect("/settings?gmail=not_configured");
  }

  const { verifier, challenge } = createPkcePair();
  const state = randomToken(24);
  const db = await getDb();
  await db.insert(oauthStates).values({
    state,
    codeVerifier: verifier,
    mode: "link_gmail",
    userId: user.id,
    redirectTo: "/settings",
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });

  const url = buildGoogleAuthUrl({
    state,
    codeChallenge: challenge,
    loginHint: user.email,
  });
  if (!url) {
    return NextResponse.json({ error: "Google OAuth is not configured." }, { status: 503 });
  }
  return NextResponse.redirect(url);
}
