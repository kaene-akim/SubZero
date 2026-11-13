import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import {
  BellRing,
  CreditCard,
  Download,
  FileJson,
  FileSpreadsheet,
  Info,
  KeyRound,
  Landmark,
  Lock,
  Mail,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BankIntegrationPanel, GmailIntegrationPanel } from "@/components/integration-forms";
import { PushToggle } from "@/components/push-toggle";
import {
  DeleteAccountForm,
  NotificationSettingsForm,
  PasswordForm,
  ProfileForm,
} from "@/components/settings-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { pushSubscriptions, transactionRecords } from "@/lib/db/schema";
import { listConnectedAccounts } from "@/lib/data/queries";
import { formatDateTime, todayInTimeZone } from "@/lib/dates";
import {
  emailConfigured,
  env,
  gmailMockEnabled,
  googleOAuthConfigured,
  openBankingConfigured,
  pushConfigured,
  stripeConfigured,
} from "@/lib/env";

export const metadata: Metadata = { title: "Settings" };

const sections = [
  { href: "#profile", label: "Profile" },
  { href: "#notifications", label: "Notifications" },
  { href: "#integrations", label: "Integrations" },
  { href: "#data", label: "Data & privacy" },
  { href: "#security", label: "Security" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string; bank?: string; message?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const db = await getDb();
  const [accounts, pushRows, pendingRows] = await Promise.all([
    listConnectedAccounts(user.id),
    db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)),
    db
      .select({ id: transactionRecords.id })
      .from(transactionRecords)
      .where(and(eq(transactionRecords.userId, user.id), eq(transactionRecords.matchingStatus, "unmatched"))),
  ]);

  const gmailAccount = accounts.find((account) => account.provider === "google") ?? null;
  const bankAccount = accounts.find((account) => account.provider === "truelayer") ?? null;
  const today = todayInTimeZone(user.timezone);

  const integrationMessage =
    params.gmail === "connected"
      ? "Gmail connected. SubZero will read only messages needed to detect subscriptions, with read-only access."
      : params.gmail === "not_configured"
        ? "Google OAuth is not configured on this server. Use the explicit sandbox inbox for development, or set the Google credentials."
        : params.bank === "connected"
          ? "Bank feed connected. Transactions are imported only when you ask; nothing is turned into a subscription automatically."
          : params.bank === "not_configured"
            ? "Open Banking is not configured on this server. Use the explicit synthetic feed for development, or set TrueLayer credentials."
            : null;
  const integrationError =
    (params.gmail === "error" || params.bank === "error") && params.message
      ? params.message
      : params.gmail === "error" || params.bank === "error"
        ? "The connection could not be completed. Nothing was connected."
        : null;

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Your account, integrations and data"
        description={
          <>
            Preferences, connected accounts and the controls required to export or delete your data. Integrations are
            shown as configured or not configured — SubZero never implies a live connection that does not exist.
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/overview">
              <Settings2 className="h-3.5 w-3.5" /> Back to overview
            </Link>
          </Button>
        }
      />

      <nav aria-label="Settings sections" className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 shadow-card">
        {sections.map((section) => (
          <a
            key={section.href}
            href={section.href}
            className="flex h-8 shrink-0 items-center rounded-lg px-3 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {section.label}
          </a>
        ))}
      </nav>

      {integrationMessage && <Alert tone="success" className="mb-4">{integrationMessage}</Alert>}
      {integrationError && <Alert tone="danger" className="mb-4">{integrationError}</Alert>}

      <div className="space-y-5">
        <Card id="profile" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-primary" /> Profile & preferences
            </CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Your country, currency and time zone drive eligibility checks, totals and every date SubZero shows.
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <ProfileForm
              defaults={{
                name: user.name,
                email: user.email,
                country: user.country,
                timezone: user.timezone,
                preferredCurrency: user.preferredCurrency,
                monthlyBudget: user.monthlyBudget ?? "",
                preferredBillingDay: user.preferredBillingDay,
                preferredBillingFrequency: user.preferredBillingFrequency,
                studentEligible: user.studentEligible,
                interestedCategories: user.interestedCategories,
              }}
            />
          </CardContent>
        </Card>

        <Card id="notifications" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-primary" /> Notifications
            </CardTitle>
            <p className="text-[12px] text-muted-foreground">
              In-app reminders always work. Email and push are only delivered when this server has the required
              credentials — the labels below reflect the actual configuration.
            </p>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <ConfigPill label="In-app" configured detail="Always available" />
              <ConfigPill
                label="Email"
                configured={emailConfigured}
                detail={emailConfigured ? `From ${env.EMAIL_FROM}` : "RESEND_API_KEY not set"}
              />
              <ConfigPill
                label="Push"
                configured={pushConfigured}
                detail={pushConfigured ? "VAPID keys configured" : "VAPID keys not set"}
              />
            </div>

            <NotificationSettingsForm
              defaults={{
                notifyEmail: user.notifyEmail,
                notifyPush: user.notifyPush,
                notifyInApp: user.notifyInApp,
                trialReminderDays: user.trialReminderDays,
                emailConfigured,
                pushConfigured,
              }}
            />

            <div className="rounded-xl border border-border bg-muted/30 p-3.5">
              <p className="text-[13px] font-medium">Browser push</p>
              <p className="mt-0.5 mb-3 text-[11px] leading-relaxed text-muted-foreground">
                Push needs a service worker, browser permission and server VAPID keys. Storing a subscription does not
                guarantee delivery.
              </p>
              <PushToggle
                configured={pushConfigured}
                publicKey={env.VAPID_PUBLIC_KEY ?? null}
                initiallySubscribed={pushRows.length > 0}
              />
            </div>
          </CardContent>
        </Card>

        <Card id="integrations" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Integrations
            </CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Connections are read-only and revocable. Tokens are encrypted at rest with AES-256-GCM. Any sandbox or
              synthetic feed is explicitly labelled.
            </p>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            <GmailIntegrationPanel
              connected={Boolean(gmailAccount)}
              accountLabel={gmailAccount?.accountLabel ?? null}
              lastSyncAt={gmailAccount?.lastSyncAt ? formatDateTime(gmailAccount.lastSyncAt, user.timezone) : null}
              googleConfigured={googleOAuthConfigured}
              mockEnabled={gmailMockEnabled}
            />

            <div className="border-t border-border pt-5">
              <BankIntegrationPanel
                connected={Boolean(bankAccount)}
                accountLabel={bankAccount?.accountLabel ?? null}
                lastSyncAt={bankAccount?.lastSyncAt ? formatDateTime(bankAccount.lastSyncAt, user.timezone) : null}
                bankConfigured={openBankingConfigured}
                mockEnabled={env.BANK_MOCK === "true"}
                pendingTransactions={pendingRows.length}
              />
            </div>

            <div className="border-t border-border pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <CreditCard className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                    Payments
                    <Badge variant={stripeConfigured ? "info" : "muted"}>
                      {stripeConfigured ? "Stripe configured" : "Stripe not configured"}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                    SubZero does not process payments for third-party subscriptions. You pay each provider directly.
                    Stripe, when configured, is reserved for SubZero&apos;s own platform billing; no charge is created
                    for a provider plan.
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-[11px] leading-relaxed text-muted-foreground sm:grid-cols-2">
                <p className="flex items-start gap-1.5">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" /> Provider checkout happens on the provider&apos;s site.
                  SubZero records your confirmation, not a provider-verified activation.
                </p>
                <p className="flex items-start gap-1.5">
                  <Landmark className="mt-0.5 h-3 w-3 shrink-0" /> Bank and Gmail access can be revoked here at any
                  time. Revoking stops future syncs but does not delete records already imported.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card id="data" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" /> Data & privacy
            </CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Export everything SubZero holds about you, or delete your account. Credentials, session tokens and
              password hashes are never included in an export.
            </p>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-3.5">
                <p className="flex items-center gap-2 text-[13px] font-medium">
                  <FileJson className="h-4 w-4 text-primary" /> Full JSON export
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Profile, subscriptions, price history, bundles, detections, transactions, notifications, connected
                  account metadata and your audit log.
                </p>
                <Button asChild size="sm" className="mt-3">
                  <a href="/api/export?scope=all&format=json" download>
                    <Download className="h-3.5 w-3.5" /> Download JSON
                  </a>
                </Button>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3.5">
                <p className="flex items-center gap-2 text-[13px] font-medium">
                  <FileSpreadsheet className="h-4 w-4 text-primary" /> CSV exports
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  One table at a time, ready for a spreadsheet. A CSV cannot hold every entity, so choose a scope.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    ["subscriptions", "Subscriptions"],
                    ["transactions", "Transactions"],
                    ["detections", "Detections"],
                    ["notifications", "Notifications"],
                    ["price-history", "Price history"],
                  ].map(([scope, label]) => (
                    <Button key={scope} asChild size="sm" variant="outline">
                      <a href={`/api/export?scope=${scope}&format=csv`} download>
                        {label}
                      </a>
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-3.5">
              <p className="text-[13px] font-medium">What is not included</p>
              <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                <li>· Password hashes, session tokens and OAuth refresh tokens.</li>
                <li>· Public catalog reference data (offers, discounts and provider pages) — it is not personal data.</li>
                <li>· Provider-side records. SubZero cannot export what a provider holds; request that from the provider.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-danger/25 bg-danger-soft/30 p-3.5">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-danger">
                <Trash2 className="h-4 w-4" /> Delete account
              </p>
              <p className="mt-1 mb-3 text-[11px] leading-relaxed text-muted-foreground">
                Deletion is immediate and cascades through subscriptions, bundles, detections, transactions,
                notifications, connected accounts and push subscriptions. It does not cancel anything with a provider.
                Export first if you need a copy. Today is {today} in {user.timezone.replace(/_/g, " ")}.
              </p>
              <DeleteAccountForm />
            </div>
          </CardContent>
        </Card>

        <Card id="security" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" /> Security
            </CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Sessions are hashed server-side and cookies are httpOnly. Changing your password does not revoke existing
              sessions until they expire.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <PasswordForm />
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  <Mail className="h-3.5 w-3.5" /> Email verification
                </p>
                <p className="mt-1">
                  {user.emailVerifiedAt
                    ? `Verified ${formatDateTime(user.emailVerifiedAt, user.timezone)}.`
                    : "Not verified. Some integrations stay locked until you verify."}
                </p>
                {!user.emailVerifiedAt && (
                  <Link href="/verify-email?pending=1" className="mt-1.5 inline-block font-medium text-primary hover:underline">
                    Verify email
                  </Link>
                )}
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  <Info className="h-3.5 w-3.5" /> Account created
                </p>
                <p className="mt-1">{formatDateTime(user.createdAt, user.timezone)}</p>
                <p className="mt-1">Role: {user.role}. Sessions expire automatically.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        SubZero is a record-keeping and planning tool. It does not act as your agent with providers, does not charge
        provider subscriptions, and cannot guarantee a price, trial, activation or cancellation.
      </p>
    </>
  );
}

function ConfigPill({ label, configured, detail }: { label: string; configured: boolean; detail: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="flex items-center justify-between gap-2 text-[12px] font-medium">
        {label}
        <Badge variant={configured ? "success" : "muted"}>{configured ? "Ready" : "Not configured"}</Badge>
      </p>
      <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}
