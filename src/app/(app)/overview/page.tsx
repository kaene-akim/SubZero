import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  CreditCard,
  Gift,
  Inbox,
  Plus,
  Sparkles,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ForecastChart } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, SectionHeading } from "@/components/ui/card";
import { Alert, EmptyState, Progress, Stat } from "@/components/ui/feedback";
import { Money, MoneyString } from "@/components/ui/money";
import { ProviderAvatar } from "@/components/ui/provider-avatar";
import { SubscriptionStatusBadge } from "@/components/ui/status";
import { requireUser } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/data/queries";
import { daysBetween, formatDate, formatDateShort } from "@/lib/dates";
import { formatMoney, toMinor } from "@/lib/money";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const user = await requireUser();
  const { welcome } = await searchParams;
  const data = await getDashboardData(user);
  const currency = user.preferredCurrency;
  const ninetyDay = data.forecast.periods.find((p) => p.horizonDays === 90) ?? data.forecast.periods[0];

  const upcoming = data.active
    .filter((s) => s.nextBillingDate && daysBetween(data.today, s.nextBillingDate) >= 0)
    .slice(0, 5);

  const topFindings = data.optimisation.findings
    .filter((f) => ["duplicate", "price_increase", "discount", "student_discount", "annual_plan", "budget"].includes(f.type))
    .slice(0, 3);

  const trialProgress = data.trials.length
    ? data.trials.map((trial) => {
        const start = trial.trialStartDate ?? trial.startDate;
        const total = start && trial.trialEndDate ? Math.max(1, daysBetween(start, trial.trialEndDate)) : 30;
        const left = trial.trialEndDate ? Math.max(0, daysBetween(data.today, trial.trialEndDate)) : 0;
        return { trial, percent: Math.min(100, Math.round(((total - left) / total) * 100)), left };
      })
    : [];

  const budgetMinor =
    user.monthlyBudget === null ? null : toMinor(user.monthlyBudget, user.preferredCurrency);

  return (
    <>
      <PageHeader
        eyebrow={welcome ? "Workspace ready" : "Overview"}
        title={`Hello, ${user.name.split(" ")[0]}.`}
        description={
          <>
            Today is {formatDate(data.today)} in {user.timezone.replace(/_/g, " ")}. Totals are converted to{" "}
            {currency} for reporting; original currencies stay intact on every record.
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/discover">
                <Sparkles className="h-3.5 w-3.5" /> Discover
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/subscriptions/new">
                <Plus className="h-3.5 w-3.5" /> Add subscription
              </Link>
            </Button>
          </>
        }
      />

      {welcome && (
        <Alert tone="success" className="mb-5" title="Your baseline is ready">
          Add what you already pay for, then review catalog suggestions. Nothing is assumed to be active until you
          record it or confirm a provider email.
        </Alert>
      )}

      {data.rows.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No subscriptions recorded yet"
          description="Start with one you know: a streaming plan, a software tool, a gym. You can add it manually, confirm a detection from an inbox, or import a bank transaction."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/subscriptions/new">
                  <Plus className="h-4 w-4" /> Add your first subscription
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/discover">Browse the catalog</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Monthly commitment"
              value={<Money minor={data.monthlyMinor} currency={currency} />}
              sub={budgetMinor !== null ? `Budget ${formatMoney(budgetMinor, user.preferredCurrency)}` : "Converted estimate"}
              icon={CreditCard}
              tone="primary"
            />
            <Stat
              label="Annualised"
              value={<Money minor={data.annualMinor} currency={currency} />}
              sub="Recurring charges at current prices"
              icon={TrendingUp}
            />
            <Stat
              label="Active services"
              value={data.active.length}
              sub={`${data.trials.length} trial${data.trials.length === 1 ? "" : "s"} running`}
              icon={CalendarClock}
            />
            <Stat
              label="Potential annual saving"
              value={
                <Money minor={data.optimisation.potentialAnnualSavingMinor} currency={currency} />
              }
              sub={
                data.optimisation.potentialAnnualSavingMinor > 0
                  ? "Estimated — review each finding"
                  : "No eligible savings found"
              }
              icon={Sparkles}
              tone={data.optimisation.potentialAnnualSavingMinor > 0 ? "success" : "default"}
            />
          </div>

          {budgetMinor !== null && (
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Monthly budget
                  </p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    <Money minor={data.monthlyMinor} currency={currency} /> of{" "}
                    <Money minor={budgetMinor} currency={currency} /> used
                  </p>
                </div>
                <Badge variant={data.monthlyMinor > budgetMinor ? "danger" : "success"}>
                  {data.monthlyMinor > budgetMinor ? "Over budget" : "Within budget"}
                </Badge>
              </div>
              <Progress value={(data.monthlyMinor / Math.max(1, budgetMinor)) * 100} className="mt-3" />
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>Next 90 days</CardTitle>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Scheduled charges, converted for reporting. Trials are shown as uncertain until they convert.
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/analytics">
                    Analytics <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="tabular text-2xl font-semibold">
                    <Money minor={ninetyDay?.totalMinor ?? 0} currency={currency} />
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    across {ninetyDay?.events.length ?? 0} charge{(ninetyDay?.events.length ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>
                <ForecastChart data={ninetyDay?.monthlyBuckets ?? []} currency={currency} />
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{data.rateNote}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <CardTitle>Upcoming renewals</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/calendar">Calendar</Link>
                </Button>
              </CardHeader>
              <CardContent className="pt-4">
                {upcoming.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border-strong bg-muted/40 px-4 py-8 text-center text-[12.5px] text-muted-foreground">
                    No dated renewals. Add billing dates to see what is next.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {upcoming.map((sub) => {
                      const days = daysBetween(data.today, sub.nextBillingDate ?? data.today);
                      return (
                        <li key={sub.id}>
                          <Link
                            href={`/subscriptions/${sub.id}`}
                            className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted"
                          >
                            <ProviderAvatar provider={sub.provider} name={sub.serviceName} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-medium">{sub.serviceName}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {formatDateShort(sub.nextBillingDate)} ·{" "}
                                {days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}
                              </p>
                            </div>
                            <MoneyString
                              amount={sub.renewalPrice ?? sub.price}
                              currency={sub.renewalCurrency || sub.currency}
                              className="text-[13px] font-medium"
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>Trials in progress</CardTitle>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Renewal dates are what you recorded; confirm them with the provider.
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/trials">View trials</Link>
                </Button>
              </CardHeader>
              <CardContent className="pt-4">
                {trialProgress.length === 0 ? (
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
                    <Gift className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                      No trials are being tracked. Browse free trials and coordinate them around your billing date.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {trialProgress.map(({ trial, percent, left }) => (
                      <li key={trial.id}>
                        <div className="flex items-center gap-3">
                          <ProviderAvatar provider={trial.provider} name={trial.serviceName} size="sm" />
                          <div className="min-w-0 flex-1">
                            <Link href={`/subscriptions/${trial.id}`} className="truncate text-[13px] font-medium hover:underline">
                              {trial.serviceName}
                            </Link>
                            <p className="text-[11px] text-muted-foreground">
                              {left === 0 ? "Ends today" : `${left} day${left === 1 ? "" : "s"} left`} ·{" "}
                              {formatDateShort(trial.trialEndDate)}
                            </p>
                          </div>
                          <SubscriptionStatusBadge status={trial.status} />
                        </div>
                        <Progress value={percent} className="mt-2" />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>Needs your attention</CardTitle>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Findings are suggestions. Savings stay estimated until you confirm the change.
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/analytics#findings">All findings</Link>
                </Button>
              </CardHeader>
              <CardContent className="pt-4">
                {topFindings.length === 0 && data.pendingDetections.length === 0 ? (
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                      Nothing needs attention right now. SubZero will surface duplicates, price rises and eligible
                      discounts as your records change.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {data.pendingDetections.length > 0 && (
                      <li>
                        <Link
                          href="/discover#detections"
                          className="flex items-start gap-3 rounded-xl border border-info/25 bg-info-soft/60 p-3 transition-colors hover:bg-info-soft"
                        >
                          <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] font-medium">
                              {data.pendingDetections.length} inbox detection
                              {data.pendingDetections.length === 1 ? "" : "s"} to review
                            </span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              Nothing is added until you confirm it.
                            </span>
                          </span>
                          <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-info" />
                        </Link>
                      </li>
                    )}
                    {topFindings.map((finding) => (
                      <li key={finding.id}>
                        <Link
                          href={finding.action.href}
                          className="flex items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted"
                        >
                          <span
                            className={
                              finding.severity === "high"
                                ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger"
                                : finding.severity === "medium"
                                  ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warning"
                                  : "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-info"
                            }
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-medium">{finding.title}</span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {finding.estimatedAnnualSavingMinor !== null ? (
                                <>
                                  Estimated annual saving{" "}
                                  <Money minor={finding.estimatedAnnualSavingMinor} currency={finding.currency} />
                                  {finding.savingType === "estimated" ? " (estimated)" : ""}
                                </>
                              ) : (
                                "Review required"
                              )}
                            </span>
                          </span>
                          <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <QuickAction
              href="/subscriptions"
              icon={CreditCard}
              title="Manage subscriptions"
              body={`${data.rows.length} record${data.rows.length === 1 ? "" : "s"} in your inventory.`}
            />
            <QuickAction
              href="/bundles"
              icon={CalendarClock}
              title="Coordinate a bundle"
              body="Plan trials and renewals around one billing date."
            />
            <QuickAction
              href="/notifications"
              icon={BellRing}
              title="Review reminders"
              body={
                data.notifications.filter((n) => !n.readAt).length > 0
                  ? `${data.notifications.filter((n) => !n.readAt).length} unread reminder${
                      data.notifications.filter((n) => !n.readAt).length === 1 ? "" : "s"
                    }.`
                  : "No unread reminders."
              }
            />
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Estimated totals use exchange rates supplied by {data.rateNote.replace(/^Converted at /, "")} Savings are
            labelled estimated unless an offer is verified and usable. SubZero does not charge your payment method for
            third-party subscriptions.
          </p>
        </div>
      )}
    </>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  body,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full p-4 transition-shadow group-hover:shadow-lift sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
        <p className="mt-3 text-[13.5px] font-semibold">{title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
      </Card>
    </Link>
  );
}
