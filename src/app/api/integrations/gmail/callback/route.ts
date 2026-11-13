import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { oauthStates } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { connectOAuthAccount } from "@/lib/gmail/service";
import { exchangeGoogleCode, fetchGoogleUserInfo } from "@/lib/gmail/oauth";
import { googleOAuthConfigured } from "@/lib/env";
import { recordAudit } from "@/lib/audit";

function fail(message: string) {
  return NextResponse.redirect(
    `${process.env.APP_URL ?? "http://localhost:3000"}/settings?gmail=error&message=${encodeURIComponent(message)}`,
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return fail(`Google returned: ${error}`);
  if (!googleOAuthConfigured) return fail("Google OAuth is not configured in this environment.");

  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings");

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) return fail("The Google callback was missing its state or code.");

  const db = await getDb();
  const [stored] = await db
    .select()
    .from(oauthStates)
    .where(and(eq(oauthStates.state, state), eq(oauthStates.mode, "link_gmail")))
    .limit(1);
  if (!stored || stored.expiresAt < new Date() || stored.userId !== user.id) {
    return fail("This Google sign-in attempt expired or did not belong to your session. Try again.");
  }
  await db.delete(oauthStates).where(eq(oauthStates.state, state));

  try {
    const tokens = await exchangeGoogleCode({ code, codeVerifier: stored.codeVerifier });
    if (!tokens.refresh_token) {
      return fail(
        "Google did not return a refresh token. Remove SubZero from your Google account permissions and reconnect so offline access can be granted.",
      );
    }
    const info = await fetchGoogleUserInfo(tokens.access_token);
    await connectOAuthAccount({
      user,
      providerAccountId: info.sub,
      email: info.email ?? user.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
      tokenType: tokens.token_type,
    });
    await recordAudit({
      userId: user.id,
      action: "integration.gmail.connected",
      resourceType: "connected_account",
      metadata: { provider: "google" },
    });
    return NextResponse.redirect(
      `${process.env.APP_URL ?? "http://localhost:3000"}/settings?gmail=connected`,
    );
  } catch (err) {
    return fail((err as Error).message);
  }
}
