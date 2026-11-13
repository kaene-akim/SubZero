import { createHash, randomBytes } from "node:crypto";
import { env, googleOAuthConfigured } from "@/lib/env";

export const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export function gmailRedirectUri(): string {
  return `${env.APP_URL.replace(/\/$/, "")}/api/integrations/gmail/callback`;
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildGoogleAuthUrl(input: {
  state: string;
  codeChallenge: string;
  loginHint?: string;
}): string | null {
  if (!googleOAuthConfigured) return null;
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: gmailRedirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  if (input.loginHint) params.set("login_hint", input.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<GoogleTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token endpoint returned ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as GoogleTokens;
}

export async function exchangeGoogleCode(input: {
  code: string;
  codeVerifier: string;
}): Promise<GoogleTokens> {
  if (!googleOAuthConfigured) throw new Error("Google OAuth is not configured.");
  return tokenRequest({
    code: input.code,
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: gmailRedirectUri(),
    grant_type: "authorization_code",
    code_verifier: input.codeVerifier,
  });
}

export async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokens> {
  if (!googleOAuthConfigured) throw new Error("Google OAuth is not configured.");
  return tokenRequest({
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{
  sub: string;
  email?: string;
  name?: string;
}> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo returned ${res.status}`);
  return (await res.json()) as { sub: string; email?: string; name?: string };
}

export function googleOAuthReady(): boolean {
  return googleOAuthConfigured;
}
