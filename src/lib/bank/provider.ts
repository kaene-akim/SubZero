import { addDaysISO, todayInTimeZone } from "@/lib/dates";
import { env, openBankingConfigured } from "@/lib/env";

export type BankTransaction = {
  externalId: string;
  merchantName: string;
  merchantReference: string | null;
  amount: string;
  currency: string;
  transactionDate: string;
  isRecurring: boolean;
  frequencyGuess: "weekly" | "fortnightly" | "monthly" | "quarterly" | "annual" | null;
};

export type BankConnectionTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};

export interface BankProvider {
  id: string;
  label: string;
  configured: boolean;
  mock: boolean;
  consentUrl(input: { state: string }): string | null;
  exchangeCode(code: string): Promise<BankConnectionTokens>;
  listTransactions(tokens: BankConnectionTokens): Promise<BankTransaction[]>;
}

/** TrueLayer Open Banking implementation. Requires commercial credentials. */
export class TrueLayerProvider implements BankProvider {
  id = "truelayer";
  label = "TrueLayer (Open Banking)";
  configured = openBankingConfigured;
  mock = false;

  private redirectUri() {
    return env.TRUELAYER_REDIRECT_URI ?? `${env.APP_URL.replace(/\/$/, "")}/api/integrations/bank/callback`;
  }

  consentUrl(input: { state: string }): string | null {
    if (!this.configured) return null;
    const params = new URLSearchParams({
      response_type: "code",
      client_id: env.TRUELAYER_CLIENT_ID!,
      redirect_uri: this.redirectUri(),
      scope: "info accounts balance cards transactions",
      providers: "uk-ob-all uk-oauth-all",
      state: input.state,
    });
    return `https://auth.truelayer.com/?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<BankConnectionTokens> {
    if (!this.configured) throw new Error("Open Banking is not configured.");
    const res = await fetch("https://auth.truelayer.com/connect/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: env.TRUELAYER_CLIENT_ID!,
        client_secret: env.TRUELAYER_CLIENT_SECRET!,
        redirect_uri: this.redirectUri(),
        code,
      }).toString(),
    });
    if (!res.ok) throw new Error(`TrueLayer token exchange failed (${res.status}).`);
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
    };
  }

  async listTransactions(tokens: BankConnectionTokens): Promise<BankTransaction[]> {
    const headers = { Authorization: `Bearer ${tokens.accessToken}` };
    const accountsRes = await fetch("https://api.truelayer.com/data/v1/accounts", { headers });
    if (!accountsRes.ok) throw new Error(`TrueLayer accounts request failed (${accountsRes.status}).`);
    const accounts = (await accountsRes.json()) as {
      results?: Array<{ account_id: string; display_name?: string }>;
    };
    const today = todayInTimeZone("Europe/London");
    const from = addDaysISO(today, -365);
    const out: BankTransaction[] = [];
    for (const account of accounts.results ?? []) {
      const txRes = await fetch(
        `https://api.truelayer.com/data/v1/accounts/${encodeURIComponent(account.account_id)}/transactions?from=${from}&to=${today}`,
        { headers },
      );
      if (!txRes.ok) continue;
      const tx = (await txRes.json()) as {
        results?: Array<{
          transaction_id: string;
          timestamp: string;
          description: string;
          merchant_name?: string;
          amount: number;
          currency: string;
        }>;
      };
      for (const t of tx.results ?? []) {
        // Open Banking debits are negative; SubZero records the positive charge amount.
        if (t.amount >= 0) continue;
        out.push({
          externalId: t.transaction_id,
          merchantName: t.merchant_name || t.description,
          merchantReference: t.description,
          amount: Math.abs(t.amount).toFixed(2),
          currency: t.currency,
          transactionDate: t.timestamp.slice(0, 10),
          isRecurring: false,
          frequencyGuess: null,
        });
      }
    }
    return out;
  }
}

/**
 * Deterministic mock bank feed. It is only available when BANK_MOCK=true and
 * every imported row is labelled source "mock_bank" so it can never be mistaken
 * for a real bank transaction.
 */
export class MockBankProvider implements BankProvider {
  id = "mock_bank";
  label = "Mock bank feed (synthetic)";
  configured = true;
  mock = true;

  consentUrl(): string | null {
    return null;
  }

  async exchangeCode(): Promise<BankConnectionTokens> {
    return { accessToken: "mock-access-token" };
  }

  async listTransactions(): Promise<BankTransaction[]> {
    const today = todayInTimeZone("Europe/London");
    const rows: Array<[string, string, number, number, string]> = [
      ["Netflix", "NETFLIX.COM", 10.99, 0, "GBP"],
      ["Netflix", "NETFLIX.COM", 10.99, 30, "GBP"],
      ["Netflix", "NETFLIX.COM", 10.99, 60, "GBP"],
      ["Spotify", "SPOTIFY AB", 11.99, 2, "GBP"],
      ["Spotify", "SPOTIFY AB", 11.99, 32, "GBP"],
      ["Adobe", "ADOBE SYSTEMS", 19.99, 5, "GBP"],
      ["Adobe", "ADOBE SYSTEMS", 22.99, 35, "GBP"],
      ["Amazon.co.uk", "AMAZON UK MARKETPLACE", 12.99, 3, "GBP"],
      ["Tesco", "TESCO STORES", 43.12, 4, "GBP"],
    ];
    return rows.map(([merchant, reference, amount, daysAgo, currency], index) => ({
      externalId: `mock-bank-${index + 1}`,
      merchantName: merchant,
      merchantReference: reference,
      amount: amount.toFixed(2),
      currency,
      transactionDate: addDaysISO(today, -daysAgo),
      isRecurring: false,
      frequencyGuess: null,
    }));
  }
}

export function getBankProvider(): BankProvider {
  return env.BANK_MOCK === "true" ? new MockBankProvider() : new TrueLayerProvider();
}

/**
 * Mark likely recurring charges. This is a heuristic used only to suggest
 * subscriptions; it never creates a subscription without explicit user action.
 */
export function inferRecurrence(
  rows: Array<{
    id: string;
    merchantName: string;
    amount: string;
    transactionDate: string;
    currency: string;
  }>,
): Map<string, { isRecurring: boolean; frequencyGuess: BankTransaction["frequencyGuess"] }> {
  const byMerchant = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.merchantName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const list = byMerchant.get(key) ?? [];
    list.push(row);
    byMerchant.set(key, list);
  }
  const result = new Map<string, { isRecurring: boolean; frequencyGuess: BankTransaction["frequencyGuess"] }>();
  for (const list of byMerchant.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => (a.transactionDate < b.transactionDate ? -1 : 1));
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const a = new Date(`${sorted[i - 1].transactionDate}T12:00:00Z`).getTime();
      const b = new Date(`${sorted[i].transactionDate}T12:00:00Z`).getTime();
      intervals.push(Math.round((b - a) / 86_400_000));
    }
    const average = intervals.reduce((sum, n) => sum + n, 0) / intervals.length;
    const amounts = sorted.map((r) => Number(r.amount));
    const amountStable = Math.max(...amounts) <= Math.min(...amounts) * 1.15;
    if (!amountStable) continue;
    let frequencyGuess: BankTransaction["frequencyGuess"] = null;
    if (average >= 5 && average <= 9) frequencyGuess = "weekly";
    else if (average >= 12 && average <= 16) frequencyGuess = "fortnightly";
    else if (average >= 26 && average <= 35) frequencyGuess = "monthly";
    else if (average >= 80 && average <= 100) frequencyGuess = "quarterly";
    else if (average >= 350 && average <= 380) frequencyGuess = "annual";
    if (!frequencyGuess) continue;
    for (const row of sorted) result.set(row.id, { isRecurring: true, frequencyGuess });
  }
  return result;
}
