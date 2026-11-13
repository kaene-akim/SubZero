import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  ExternalLink,
  History,
  Info,
  Pencil,
  ShieldAlert,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PriceHistoryChart } from "@/components/charts";
import { PriceRecordForm } from "@/components/price-record-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Stat } from "@/components/ui/feedback";
import { Money, MoneyString } from "@/components/ui/money";
import { ProviderAvatar } from "@/components/ui/provider-avatar";
import { StatusText, SubscriptionStatusBadge } from "@/components/ui/status";
import { requireUser } from "@/lib/auth/session";
import { getPriceHistory, getSubscription } from "@/lib/data/queries";
import { daysBetween, formatDate, formatDateShort, formatDateTime, todayInTimeZone } from "@/lib/dates";
import { annualise, monthlyEquivalent, toMinor } from "@/lib/money";
import { subscriptionStatusAction } from "@/app/actions/subscriptions";

export const metadata: Metadata = { title: "Subscription" };

const sourceLabels: Record<string, string> = {
  manual: "Added manually",
  gmail: "Confirmed from an email",
  bank: "Created from a bank transaction",
  bundle: "Recorded after a bundle checkout",
  demo: "Demo record",
};

export default async function SubscriptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; updated?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const subscription = await getSubscription(user.id, id);
  if (!subscription) notFound();

  const history = await getPriceHistory(user.id, subscription.id);
  const today = todayInTimeZone(user.timezone);
  const currency = subscription.renewalCurrency || subscription.currency;
  const renewalMinor = toMinor(subscription.renewalPrice ?? subscription.price, currency);
  const annualMinor = renewalMinor === null ? null : annualise(renewalMinor, subscription.billingFrequency);
  const monthlyMinor = renewalMinor === null ? null : monthlyEquivalent(renewalMinor, subscription.billingFrequency);
  const nextDays =
    subscription.status === "trial" && subscription.trialEndDate
      ? daysBetween(today, subscription.trialEndDate)
      : subscription.nextBillingDate
        ? daysBetween(today, subscription.nextBillingDate)
        : null;

  const pricePoints = history
    .map((row) => ({
      date: formatDateShort(row.recordedAt.toISOString().slice(0, 10)),
      priceMinor: toMinor(row.price, row.currency) ?? 0,
    }))
    .filter((row) => row.priceMinor > 0);

  const isTrial = subscription.status === "trial";
  const isCancelled = ["cancelled", "expired"].includes(subscription.status);
  const isPending = subscription.status === "pending_cancellation";

  const notices: Record<string, { tone: "success" | "warning" | "info"; text: string }> = {
    created: { tone: "success", text: "Subscription added. Review the dates and price before relying on the forecast." },
    "created-bank": { tone: "warning", text: "Created from a transaction. Confirm the service name, price and renewal date with the provider." },
    paused: { tone: "info", text: "Marked as paused in your records. The provider may still charge you — verify with them." },
    resumed: { tone: "info", text: "Marked as active in your records. Confirm the provider agrees." },
    requested: { tone: "warning", text: "Cancellation intent recorded. SubZero has not contacted the provider — complete the cancellation yourself." },
    cancelled: { tone: "success", text: "Cancellation confirmed by you. Keep any provider confirmation for your records." },
    failed: { tone: "warning", text: "Marked as payment failed. Update the payment method with the provider." },
    reactivated: { tone: "info", text: "Marked as active again. Check the provider's billing date." },
  };
  const notice = query.created ? notices[query.created] ?? notices[query.updated ?? ""] : notices[query.updated ?? ""];

  return (
    <>
      <PageHeader
        eyebrow={subscription.category}
        title={subscription.serviceName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <SubscriptionStatusBadge status={subscription.status} />
            <Badge variant="outline">{sourceLabels[subscription.source] ?? subscription.source}</Badge>
            {subscription.provider && (
              <a
                href={subscription.provider.website}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {subscription.provider.name} <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
          </span>
        }
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/subscriptions">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/subscriptions/${subscription.id}/edit`}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Link>
            </Button>
          </>
        }
      />

      {notice && (
        <Alert tone={notice.tone} className="mb-5">
          {notice.text}
        </Alert>
      )}

      {isTrial && subscription.trialEndDate && (
        <Alert tone={nextDays !== null && nextDays <= 3 ? "warning" : "info"} className="mb-5" title="Trial conversion">
          This trial is expected to convert on {formatDate(subscription.trialEndDate)}
          {nextDays !== null ? ` (${nextDays <= 0 ? "today" : `${nextDays} day${nextDays === 1 ? "" : "s"}`})` : ""}. The
          renewal price is{" "}
          {subscription.renewalPrice ? (
            <MoneyString amount={subscription.renewalPrice} currency={currency} />
          ) : (
            "not recorded"
          )}
          . Confirm the exact terms with the provider.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={isTrial ? "Price after trial" : "Current price"}
          value={<MoneyString amount={subscription.renewalPrice ?? subscription.price} currency={currency} />}
          sub={`per ${subscription.billingFrequency === "semiannual" ? "6 months" : subscription.billingFrequency.replace("ly", "")}`}
          icon={CircleDollarSign}
          tone="primary"
        />
        <Stat
          label="Monthly equivalent"
          value={<Money minor={monthlyMinor} currency={currency} />}
          sub="Simple annualisation"
        />
        <Stat
          label="Annual equivalent"
          value={<Money minor={annualMinor} currency={currency} />}
          sub="If the price and cadence stay unchanged"
        />
        <Stat
          label={isTrial ? "Trial ends" : "Next charge"}
          value={formatDateShort(isTrial ? subscription.trialEndDate : subscription.nextBillingDate)}
          sub={nextDays !== null && nextDays >= 0 ? (nextDays === 0 ? "Today" : `In ${nextDays} days`) : "No date recorded"}
          icon={CalendarClock}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Price history</CardTitle>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Observations recorded from your entries and confirmed emails. Price-increase findings use this history.
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <PriceHistoryChart data={pricePoints} currency={currency} />
            <div className="mt-4 border-t border-border pt-4">
              <PriceRecordForm
                id={subscription.id}
                currency={currency}
                frequency={subscription.billingFrequency}
                currentPrice={subscription.renewalPrice ?? subscription.price ?? ""}
              />
            </div>
            {history.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {[...history].reverse().slice(0, 6).map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 text-[11.5px]">
                    <span className="text-muted-foreground">
                      {formatDateTime(row.recordedAt)} · {row.source.replace(/_/g, " ")}
                    </span>
                    <MoneyString amount={row.price} currency={row.currency} className="font-medium" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Record details</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <dl className="space-y-2.5 text-[12.5px]">
                <Row label="Status">
                  <SubscriptionStatusBadge status={subscription.status} />
                </Row>
                <Row label="Category">{subscription.category}</Row>
                <Row label="Billing">{subscription.billingFrequency}</Row>
                <Row label="Auto-renew">{subscription.autoRenew ? "Yes" : "No"}</Row>
                <Row label="Start date">{formatDate(subscription.startDate)}</Row>
                {subscription.trialStartDate && <Row label="Trial start">{formatDate(subscription.trialStartDate)}</Row>}
                {subscription.trialEndDate && <Row label="Trial end">{formatDate(subscription.trialEndDate)}</Row>}
                <Row label="Next billing">{formatDate(subscription.nextBillingDate)}</Row>
                <Row label="Source">{sourceLabels[subscription.source] ?? subscription.source}</Row>
                {subscription.confidenceScore && (
                  <Row label="Detection confidence">
                    {Math.round(Number(subscription.confidenceScore) * 100)}% · review the evidence
                  </Row>
                )}
                <Row label="Last verified by you">{formatDateTime(subscription.lastVerifiedAt)}</Row>
              </dl>
              {subscription.notes && (
                <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-[12px] leading-relaxed text-muted-foreground">
                  <p className="mb-1 font-medium text-foreground">Notes</p>
                  {subscription.notes}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cancellation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between gap-2">
                <StatusText tone={isCancelled ? "success" : isPending ? "warning" : "muted"}>
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {isCancelled
                    ? "Confirmed by you"
                    : isPending
                      ? "Cancellation requested"
                      : "No cancellation recorded"}
                </StatusText>
                <Badge variant="outline" className="capitalize">
                  {subscription.cancellationStatus.replace(/_/g, " ")}
                </Badge>
              </div>

              {subscription.cancellationRequestedAt && (
                <p className="text-[11.5px] text-muted-foreground">
                  Requested {formatDateTime(subscription.cancellationRequestedAt)}
                </p>
              )}
              {subscription.cancellationConfirmedAt && (
                <p className="text-[11.5px] text-muted-foreground">
                  Confirmed {formatDateTime(subscription.cancellationConfirmedAt)}
                </p>
              )}

              {subscription.cancellationInstructions && (
                <p className="rounded-xl border border-border bg-muted/40 p-3 text-[12px] leading-relaxed text-muted-foreground">
                  {subscription.cancellationInstructions}
                </p>
              )}

              {subscription.cancellationUrl && (
                <Button asChild variant="outline" className="w-full">
                  <a href={subscription.cancellationUrl} target="_blank" rel="noreferrer noopener">
                    <ExternalLink className="h-3.5 w-3.5" /> Open provider cancellation page
                  </a>
                </Button>
              )}

              {!isCancelled && (
                <form action={subscriptionStatusAction}>
                  <input type="hidden" name="id" value={subscription.id} />
                  <input type="hidden" name="intent" value={isPending ? "confirm_cancellation" : "request_cancellation"} />
                  <Button type="submit" variant={isPending ? "primary" : "secondary"} className="w-full">
                    {isPending ? "I cancelled it with the provider" : "Start cancellation"}
                  </Button>
                </form>
              )}

              {isCancelled && (
                <form action={subscriptionStatusAction}>
                  <input type="hidden" name="id" value={subscription.id} />
                  <input type="hidden" name="intent" value="reactivate" />
                  <Button type="submit" variant="outline" className="w-full">
                    Mark as active again
                  </Button>
                </form>
              )}

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                SubZero does not cancel with providers. It records your intent and confirmation so reminders and
                forecasts reflect reality. Always keep the provider&apos;s confirmation.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardContent className="flex flex-wrap items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <div className="min-w-0 flex-1 text-[12px] leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">Managing this subscription</p>
            <p className="mt-1">
              Changes to price, plan or payment method happen with the provider. Use their management page, then record
              the observed price here so your history stays accurate.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {subscription.managementUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={subscription.managementUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="h-3.5 w-3.5" /> Manage with provider
                </a>
              </Button>
            )}
            <Button asChild size="sm" variant="ghost">
              <Link href={`/analytics#findings`}>
                <History className="h-3.5 w-3.5" /> Related findings
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <details className="mt-4 rounded-2xl border border-danger/25 bg-danger-soft/40 p-4">
        <summary className="flex items-center gap-2 text-[13px] font-medium text-danger">
          <TriangleAlert className="h-4 w-4" /> Delete this record
        </summary>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-xl text-[11.5px] leading-relaxed text-muted-foreground">
            Deleting removes the subscription, its price history and related reminders from SubZero. It does not cancel
            anything with the provider. Export your data first if you need a copy.
          </p>
          <form action={subscriptionStatusAction}>
            <input type="hidden" name="id" value={subscription.id} />
            <input type="hidden" name="intent" value="delete" />
            <Button type="submit" variant="danger" size="sm">
              <Trash2 className="h-3.5 w-3.5" /> Delete permanently
            </Button>
          </form>
        </div>
      </details>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
