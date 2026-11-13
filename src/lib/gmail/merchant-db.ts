export type MerchantRecord = {
  id: string;
  slug: string;
  name: string;
  category: string;
  website: string;
  aliases: string[];
  serviceFamily: string | null;
};

export type MerchantMatch = {
  merchant: MerchantRecord | null;
  providerId: string | null;
  matchedOn: "domain" | "alias" | "display_name" | "body" | "none";
  matchConfidence: number;
  senderDomain: string | null;
  senderName: string | null;
  senderEmail: string | null;
  serviceConfirmed: boolean;
  inferredName: string | null;
};

/**
 * Some brands send mail for many unrelated products. Matching the brand alone
 * must never create a subscription (an Amazon order is not Prime).
 */
const SERVICE_TERMS: Record<string, RegExp> = {
  amazon: /\b(prime|prime video|kindle unlimited|audible|music unlimited)\b/i,
  "amazon-prime": /\b(prime|prime video)\b/i,
  "amazon-music": /\b(music unlimited|amazon music)\b/i,
  apple: /\b(apple tv\+?|apple music|icloud|apple one)\b/i,
  "apple-tv-plus": /\b(apple tv\+?|tv\+)\b/i,
  "apple-music": /\b(apple music)\b/i,
  "icloud-plus": /\b(icloud)\b/i,
  google: /\b(google one|youtube premium|youtube music|google storage)\b/i,
  "google-one": /\b(google one|google storage|storage plan)\b/i,
  "youtube-premium": /\b(youtube premium|premium membership|youtube music premium)\b/i,
  microsoft: /\b(microsoft 365|office 365|xbox game pass|game pass)\b/i,
  "microsoft-365": /\b(microsoft 365|office 365)\b/i,
  "xbox-game-pass": /\b(xbox|game pass)\b/i,
  adobe: /\b(acrobat|creative cloud|photoshop|adobe pro)\b/i,
  "adobe-acrobat": /\b(acrobat)\b/i,
  playstation: /\b(playstation plus|ps plus|psn)\b/i,
  "playstation-plus": /\b(playstation plus|ps plus)\b/i,
  nintendo: /\b(nintendo switch online|switch online)\b/i,
  "nintendo-switch-online": /\b(switch online|nintendo switch online)\b/i,
};

export function parseSender(from: string): {
  email: string | null;
  domain: string | null;
  name: string | null;
} {
  const trimmed = from.trim();
  const angle = trimmed.match(/^(.*?)<([^>]+)>$/);
  const email = (angle ? angle[2] : trimmed).trim().toLowerCase();
  const name = angle ? angle[1].trim().replace(/^["']|["']$/g, "") : null;
  const at = email.lastIndexOf("@");
  const domain = at > -1 ? email.slice(at + 1).replace(/[>,;]+$/, "") : null;
  return { email: email.includes("@") ? email : null, domain, name: name || null };
}

function normaliseDomain(website: string): string | null {
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function merchantDomains(merchant: MerchantRecord): string[] {
  const domains = new Set<string>();
  const site = normaliseDomain(merchant.website);
  if (site) domains.add(site);
  for (const alias of merchant.aliases) {
    if (alias.includes(".")) {
      const host = normaliseDomain(alias);
      if (host) domains.add(host);
    }
  }
  return [...domains];
}

function merchantNames(merchant: MerchantRecord): string[] {
  const names = new Set<string>();
  names.add(merchant.name);
  for (const alias of merchant.aliases) {
    if (!alias.includes(".") && alias.length > 2) names.add(alias);
  }
  return [...names];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(haystack: string, term: string): boolean {
  if (term.length < 3) return false;
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(term)}([^a-z0-9]|$)`, "i");
  return re.test(haystack);
}

function inferName(senderName: string | null, domain: string | null): string | null {
  if (senderName) {
    const cleaned = senderName
      .replace(/\b(billing|receipts?|invoices?|no-?reply|notifications?|support|team|payments?|accounts?)\b/gi, "")
      .replace(/[|•·-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 2) return cleaned;
  }
  if (!domain) return null;
  const root = domain.split(".").slice(-2, -1)[0] ?? domain.split(".")[0];
  if (!root) return null;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

/**
 * Deterministic merchant resolution. No AI is needed for this step; domain
 * matching is stronger evidence than a name mentioned in the body.
 */
export function matchMerchant(input: {
  from: string;
  subject: string;
  text: string;
  merchants: MerchantRecord[];
}): MerchantMatch {
  const sender = parseSender(input.from);
  const haystack = `${input.subject}\n${input.text}`.slice(0, 40_000);
  const displayHaystack = `${sender.name ?? ""}\n${input.subject}`;

  let best: MerchantMatch | null = null;
  for (const merchant of input.merchants) {
    const domains = merchantDomains(merchant);
    const names = merchantNames(merchant);
    let matchedOn: MerchantMatch["matchedOn"] = "none";
    let score = 0;

    if (sender.domain) {
      const domainHit = domains.find(
        (d) => sender.domain === d || sender.domain!.endsWith(`.${d}`),
      );
      if (domainHit) {
        matchedOn = "domain";
        score = 1;
      }
    }
    if (!score) {
      const aliasHit = names.find((name) => containsTerm(displayHaystack, name));
      if (aliasHit) {
        matchedOn = "alias";
        score = 0.72;
      }
    }
    if (!score) {
      const bodyHit = names.find((name) => containsTerm(haystack, name));
      if (bodyHit) {
        matchedOn = "body";
        score = 0.55;
      }
    }

    if (score > (best?.matchConfidence ?? 0)) {
      const serviceTerm = SERVICE_TERMS[merchant.slug] ?? SERVICE_TERMS[merchant.aliases[0] ?? ""];
      const serviceConfirmed = serviceTerm ? serviceTerm.test(haystack) || serviceTerm.test(displayHaystack) : true;
      best = {
        merchant,
        providerId: serviceConfirmed ? merchant.id : null,
        matchedOn,
        matchConfidence: score,
        senderDomain: sender.domain,
        senderName: sender.name,
        senderEmail: sender.email,
        serviceConfirmed,
        inferredName: inferName(sender.name, sender.domain),
      };
    }
  }

  if (best) return best;
  return {
    merchant: null,
    providerId: null,
    matchedOn: "none",
    matchConfidence: 0,
    senderDomain: sender.domain,
    senderName: sender.name,
    senderEmail: sender.email,
    serviceConfirmed: false,
    inferredName: inferName(sender.name, sender.domain),
  };
}
