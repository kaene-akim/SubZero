# SubZero

SubZero is a subscription discovery, planning and optimisation platform. It helps you find what you are paying for, see what renews next, plan free trials around a billing date, evaluate offers, and record cancellations — without pretending to have access or authority it does not have.

It is built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Drizzle ORM, PostgreSQL (embedded PGlite in development), Recharts, and accessible Radix-based UI primitives.

> **Honesty first.** SubZero never fabricates a subscription, offer, activation, transaction, purchase, cancellation or successful third-party integration. Every price, trial, discount and activation state is labelled with its source and verification state. Integrations that need credentials show as "not configured" until they are actually configured.

---

## Quick start

Requirements: Node.js 20+, npm.

```bash
npm install
cp .env.example .env.local   # then fill AUTH_SECRET and ENCRYPTION_KEY
npm run db:seed              # catalog: 37 providers, 39 offers, 17 discounts, exchange rates
npm run dev                  # http://localhost:3000
```

Generate the two required secrets:

```bash
openssl rand -base64 48   # AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY (must decode to exactly 32 bytes)
```

No PostgreSQL server is required for local development. The app uses **PGlite**, an embedded PostgreSQL-compatible engine, and persists data in `.data/pg`. Delete `.data/` to start clean, then reseed.

For production, set `DATABASE_URL` to a PostgreSQL connection string. The app switches to the `pg` driver automatically and applies the migrations in `drizzle/`.

### Demo data

```bash
npm run db:seed:demo
```

Creates `demo@subzero.local` / `SubZeroDemo2026!` with clearly labelled synthetic subscriptions, a draft bundle and reminders. Every record has `source = "demo"` and a note saying it is synthetic. Nothing is activated or charged. Delete the demo account from Settings to remove it.

### Verify catalog URLs

```bash
npm run db:verify-offers
```

Checks each offer/discount URL, records HTTP status and reachability in `offer_verifications`, and prints a summary. It **does not** mark offers as verified: a reachable page does not prove that a price, trial length, eligibility rule or promo code is still valid. Only human review or an official partner feed can do that.

---

## Feature map

| Area | Route | What it does |
| --- | --- | --- |
| Overview | `/overview` | Monthly spend, upcoming renewals, budget progress, findings, forecast |
| Subscriptions | `/subscriptions` | Create, edit, pause, resume, cancel-record, price history |
| Imports | `/subscriptions/imports` | Review bank transactions; suggestions only, never auto-created |
| Discover | `/discover` | Gmail/sandbox detection inbox; confirm, reject or merge |
| Trials | `/trials` | Free-trial offers and trial-ending reminders |
| Discounts | `/discounts` | Catalog discounts, eligibility filters, estimated savings |
| Bundles | `/bundles` | Plan trials around a target billing date; explicit activation confirmation |
| Calendar | `/calendar` | Renewals and trial ends by month in your time zone |
| Analytics | `/analytics` | Forecast, category split, findings, actual vs estimated savings |
| Notifications | `/notifications` | In-app reminders generated from your records |
| Settings | `/settings` | Profile, notifications/push, integrations, export, deletion, security |

### Billing and forecasting engines

Pure TypeScript engines live in `src/lib/engines/`:

- `billing.ts` — normalises weekly/fortnightly/monthly/quarterly/semiannual/annual frequencies to monthly and annual equivalents.
- `currency.ts` — converts minor units using a rate table and preserves the original currency.
- `forecast.ts` — projects the next 12 months of charges from real recorded dates.
- `schedule.ts` — calculates trial activation dates relative to a target billing date, including unsupported/immediate-activation cases.
- `discounts.ts` — evaluates discount value, eligibility and effective annual cost.
- `optimisation.ts` — duplicate, price-increase, cheaper-plan, student, annual-plan and budget findings.

Money is stored and computed in **integer minor units** (pence/cents). Database `numeric` columns are handled as strings and converted at the boundary. Original currencies are preserved; converted totals are explicitly labelled as estimates.

Forecasts only project subscriptions with a known price and billing cadence. Missing prices are surfaced as unknown rather than guessed. Price-increase findings report the observed increase but leave the annual saving `null` when it cannot be known.

---

## Integrations and the honesty model

Every integration is implemented behind an explicit interface with a real implementation and an explicit mock/sandbox where appropriate. The UI states which one is active.

### Gmail subscription detection

- Real flow: Google OAuth 2.0 with PKCE, read-only Gmail scope, refresh token encrypted with AES-256-GCM.
- Redirect URI: `{APP_URL}/api/integrations/gmail/callback`.
- Enable by setting `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- Without credentials, the connect button is disabled and the UI says so.
- With `GMAIL_MOCK=true`, a **sandbox inbox** with synthetic messages can be connected. It is labelled "Sandbox inbox (synthetic messages)" everywhere.
- Classification is rules-first and deterministic. An optional OpenAI-compatible LLM (`LLM_API_KEY`) only augments ambiguous messages behind a strict JSON schema; its output is validated against the email evidence and never solely auto-confirms a subscription.
- Detections always require explicit user confirmation before a subscription is created.

### Bank feed (Open Banking)

- TrueLayer interface (`src/lib/bank/provider.ts`); enable with `TRUELAYER_CLIENT_ID` / `TRUELAYER_CLIENT_SECRET`.
- Redirect URI: `{APP_URL}/api/integrations/bank/callback` (or set `TRUELAYER_REDIRECT_URI`).
- With `BANK_MOCK=true`, a synthetic feed is available and clearly labelled. Imported rows carry `source = "mock_bank"`.
- Imported transactions never create subscriptions. Recurrence is a suggestion shown in `/subscriptions/imports`; the user decides.

### Payments

SubZero does **not** charge for third-party subscriptions. You pay each provider directly on the provider's own checkout. `STRIPE_SECRET_KEY` is reserved for SubZero's own platform billing, if enabled. Provider integrations are `coordinated_checkout`: SubZero can plan dates, open official checkout pages and record your confirmation, but cannot guarantee delayed activation or a changed billing date.

### Notifications

- In-app notifications are always generated from your records and are idempotent.
- Email requires `RESEND_API_KEY` and a verified sending domain (`EMAIL_FROM`).
- Push requires `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, browser permission and a service worker.
- Settings shows the actual configuration state. Storing a push subscription does not guarantee delivery.

### Background jobs

`/api/cron/tick` runs reminder generation and integration sync. Protect it with `CRON_SECRET`:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick
```

Without `CRON_SECRET`, the endpoint refuses requests in production and allows local development. `JOBS_INLINE=true` lets the dashboard trigger a tick in development; `npm run jobs:tick` runs it from the CLI.

---

## Security and privacy

- **Authentication:** email + password with scrypt hashing, hashed session tokens, httpOnly/SameSite cookies, session expiry, password reset with single-use hashed tokens, email verification.
- **Encryption:** OAuth access/refresh tokens are encrypted at rest with AES-256-GCM. `ENCRYPTION_KEY` is mandatory in production.
- **Authorisation:** every query is scoped by `user_id`; cross-user reads return `null`/empty. Row-level security policies are in `src/lib/db/rls.sql` as defence in depth. The embedded database owner bypasses RLS, so application-level scoping remains the primary control.
- **Rate limiting:** login, registration, password reset, export and push subscription endpoints are rate-limited in memory. For multi-instance production, replace `src/lib/rate-limit.ts` with a shared store (Redis).
- **CSRF:** mutations use server actions and same-origin form posts; cookies are `SameSite=Lax`.
- **Injection:** all database access goes through Drizzle's parameterised queries.
- **Audit log:** security-relevant actions (auth, exports, deletions, integrations, activation) are recorded in `audit_logs`.
- **GDPR:** `/api/export` returns a full JSON export or per-scope CSV. Account deletion requires typing `DELETE` and cascades through personal records. Exports exclude password hashes, session tokens and OAuth credentials.

Deletion does **not** cancel anything with a provider. SubZero is a record-keeping tool, not your agent.

---

## Data model

Core tables in `src/lib/db/schema.ts`:

- `users`, `sessions`, `auth_tokens`, `oauth_states`, `connected_accounts`, `push_subscriptions`
- `providers`, `offers`, `discounts`, `provider_integrations`, `offer_verifications`, `watched_discounts`
- `subscriptions`, `price_history`, `bundles`, `bundle_items`, `payments`
- `email_detections`, `transaction_records`, `notifications`
- `exchange_rates`, `audit_logs`, `idempotency_keys`, `job_runs`

Migrations are generated with Drizzle Kit:

```bash
npm run db:generate
```

The app applies migrations on startup. In production, run them as part of your deploy.

---

## Testing

```bash
npm test          # Vitest: engines, classifier, auth, idempotency, notifications, isolation, scheduling
npm run typecheck # tsc --noEmit
npm run build     # production build
```

Tests run against an **in-memory PGlite** instance when `VITEST=true`, so your development data in `.data/pg` is never touched. The suite covers:

- billing normalisation and money arithmetic
- currency conversion and rate handling
- forecasting with missing prices and mixed frequencies
- bundle scheduling, including unsupported/immediate-activation cases
- discount evaluation and eligibility
- optimisation findings (duplicates, price increases, budget, student, annual plans)
- email classification and conservative extraction
- password hashing/verification, email verification, password reset, account deletion
- idempotency replay and failure release
- notification deduplication and user isolation
- cross-user data isolation across subscriptions, bundles, detections and notifications

---

## Project layout

```
src/
  app/                 routes, server actions, API handlers
  components/          UI primitives and feature components
  lib/
    auth/              password, sessions, auth service
    bank/              Open Banking interface + TrueLayer + synthetic provider
    catalog/           reference catalog data
    data/              read queries, rate table, engine adapters
    db/                schema, client, RLS, migrations
    engines/           pure billing, forecast, scheduling, discount, optimisation logic
    gmail/             OAuth, sandbox inbox, extraction, classifier, service
    jobs/              background job runner
    security/          crypto helpers
    notifications.ts   reminder generation and delivery
    idempotency.ts     database-backed replay guard
scripts/
  seed.ts              catalog seeding
  seed-demo.ts         synthetic demo account
  verify-offers.ts     URL reachability checks
  jobs-tick.ts         CLI job runner
tests/                 Vitest suites
drizzle/               generated SQL migrations
```

---

## Limitations

These are deliberate, documented boundaries — not hidden failures:

- No real Gmail, Open Banking, Stripe, email or push delivery is possible without the corresponding credentials and commercial agreements. The UI says so.
- The catalog is **reference data**. Prices, trials and discounts are compiled from public pages, marked `unverified`, and may be out of date. Always confirm at the provider's checkout.
- SubZero cannot cancel a subscription on your behalf. It records the request, links to the provider's cancellation page and tracks confirmation.
- Coordinated checkout cannot guarantee delayed activation or a specific billing date; the scheduling engine explains when a provider does not support it.
- Converted totals use reference exchange rates and are indicative, not settlement amounts.
- In-memory rate limiting and the single-connection PGlite setup are suitable for development and a single instance. Production needs a shared rate-limit store and a managed PostgreSQL instance.
- The demo account and synthetic bank/Gmail data are clearly labelled and must never be presented as real activity.

---

## License

Private project. All provider names and trademarks belong to their respective owners.
