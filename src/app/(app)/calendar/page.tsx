import type { Metadata } from "next";
import Link from "next/link";
import { addMonths, format, getDay, parseISO } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Gift,
  Info,
  Layers,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Stat } from "@/components/ui/feedback";
import { MoneyString } from "@/components/ui/money";
import { ProviderAvatar } from "@/components/ui/provider-avatar";
import { SubscriptionStatusBadge } from "@/components/ui/status";
import { requireUser } from "@/lib/auth/session";
import { listRenewalsInRange, listSubscriptions } from "@/lib/data/queries";
import {
  daysBetween,
  formatDateShort,
  isValidISODate,
  monthRange,
  todayInTimeZone,
} from "@/lib/dates";
import { fromMinor, monthlyEquivalent, toMinor } from "@/lib/money";

export const metadata: Metadata = { title: "Calendar" };

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayInTimeZone(user.timezone);
  const currentMonth = today.slice(0, 7);
  const requested = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : currentMonth;
  const monthStart = `${requested}-01`;
  if (!isValidISODate(monthStart)) {
    return (
      <Alert tone="danger">That month could not be read. Use the navigation links below.</Alert>
    );
  }
  const range = monthRange(monthStart);
  const prevMonth = format(addMonths(parseISO(monthStart), -1), "yyyy-MM");
  const nextMonth = format(addMonths(parseISO(monthStart), 1), "yyyy-MM");

  const [renewals, allSubscriptions] = await Promise.all([
    listRenewalsInRange(user.id, range.start, range.end),
    listSubscriptions(user.id),
  ]);

  // A renewal can be a billing date or a trial end; show both, clearly labelled.
  const eventsByDay = new Map<string, Array<{ kind: "renewal" | "trial"; sub: (typeof renewals)[number] }>>();
  for (const sub of renewals) {
    if (sub.nextBillingDate && sub.nextBillingDate >= range.start && sub.nextBillingDate <= range.end) {
      const list = eventsByDay.get(sub.nextBillingDate) ?? [];
      list.push({ kind: "renewal", sub });
      eventsByDay.set(sub.nextBillingDate, list);
    }
    if (
      sub.trialEndDate &&
      sub.trialEndDate >= range.start &&
      sub.trialEndDate <= range.end &&
      sub.trialEndDate !== sub.nextBillingDate
    ) {
      const list = eventsByDay.get(sub.trialEndDate) ?? [];
      list.push({ kind: "trial", sub });
      eventsByDay.set(sub.trialEndDate, list);
    }
  }

  const leadingBlanks = (getDay(parseISO(range.start)) + 6) % 7;
  const cells: Array<string | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...range.days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const byCurrency = renewals.reduce<Record<string, number>>((acc, sub) => {
    if (sub.status === "trial") return acc;
    const amount = toMinor(sub.renewalPrice ?? sub.price, sub.renewalCurrency || sub.currency);
    if (amount === null) return acc;
    const currency = sub.renewalCurrency || sub.currency;
    acc[currency] = (acc[currency] ?? 0) + monthlyEquivalent(amount, sub.billingFrequency);
    return acc;
  }, {});

  const upcoming = allSubscriptions
    .filter((sub) => sub.nextBillingDate && sub.nextBillingDate >= today)
    .sort((a, b) => (a.nextBillingDate ?? "").localeCompare(b.nextBillingDate ?? ""))
    .slice(0, 8);

  const trialsThisMonth = renewals.filter((sub) => sub.status === "trial").length;
  const busyDays = new Set(
    renewals
      .flatMap((sub) => [sub.nextBillingDate, sub.trialEndDate])
      .filter((date): date is string => Boolean(date && date >= range.start && date <= range.end)),
  ).size;

  return (
    <>
      <PageHeader
        eyebrow="Calendar"
        title={format(parseISO(monthStart), "MMMM yyyy")}
        description={
          <>
            Renewals and trial conversions in {user.timezone.replace(/_/g, " ")}. Dates come from your records — confirm
            them with each provider before relying on them.
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/calendar?month=${prevMonth}`} aria-label="Previous month">
                <ArrowLeft className="h-3.5 w-3.5" /> {format(parseISO(`${prevMonth}-01`), "MMM")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/calendar?month=${nextMonth}`} aria-label="Next month">
                {format(parseISO(`${nextMonth}-01`), "MMM")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Dated events" value={renewals.length} sub="Billing dates and trial ends" icon={CalendarDays} tone="primary" />
        <Stat label="Busy days" value={busyDays} sub="Days with at least one event" icon={CalendarClock} />
        <Stat label="Trials this month" value={trialsThisMonth} sub="Expected conversions" icon={Gift} />
        <Stat
          label="Monthly equivalent"
          value={
            Object.keys(byCurrency).length === 0 ? (
              "—"
            ) : (
              <span className="flex flex-wrap gap-x-2 text-[20px]">
                {Object.entries(byCurrency).map(([currency, minor]) => (
                  <MoneyString key={currency} amount={fromMinor(minor, currency)} currency={currency} />
                ))}
              </span>
            )
          }
          sub="Excludes trials and cancelled plans"
          icon={Layers}
        />
      </div>

      <Card className="mt-5 overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-2 pb-4">
          <CardTitle>{format(parseISO(monthStart), "MMMM yyyy")}</CardTitle>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-primary" /> Renewal
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-warning" /> Trial ends
            </span>
          </div>
        </CardHeader>
        <div className="grid grid-cols-7 border-y border-border bg-muted/40 text-[10.5px] uppercase tracking-wide text-muted-foreground">
          {weekdayLabels.map((label) => (
            <div key={label} className="px-2 py-2 text-center font-medium">
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{label.slice(0, 1)}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, index) => {
            const events = day ? eventsByDay.get(day) ?? [] : [];
            const isToday = day === today;
            return (
              <div
                key={`${day ?? "blank"}-${index}`}
                className={
                  "min-h-20 border-b border-r border-border p-1.5 last:border-r-0 sm:min-h-24 sm:p-2 " +
                  (day ? "bg-card" : "bg-muted/20") +
                  (isToday ? " ring-1 ring-inset ring-primary/40" : "")
                }
              >
                {day && (
                  <>
                    <div className="flex items-center justify-between">
                      <span
                        className={
                          "tabular grid h-5 min-w-5 place-items-center rounded-full text-[11px] " +
                          (isToday ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground")
                        }
                      >
                        {Number(day.slice(8, 10))}
                      </span>
                      {events.length > 0 && (
                        <span className="tabular text-[9.5px] font-medium text-muted-foreground">{events.length}</span>
                      )}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {events.slice(0, 2).map(({ kind, sub }) => (
                        <Link
                          key={`${kind}-${sub.id}`}
                          href={`/subscriptions/${sub.id}`}
                          className={
                            "block truncate rounded px-1 py-0.5 text-[9.5px] font-medium leading-tight " +
                            (kind === "trial"
                              ? "bg-warning-soft text-warning hover:opacity-80"
                              : "bg-primary-soft text-primary hover:opacity-80")
                          }
                          title={`${sub.serviceName} · ${kind === "trial" ? "trial ends" : "renews"}`}
                        >
                          {sub.serviceName}
                        </Link>
                      ))}
                      {events.length > 2 && (
                        <p className="px-1 text-[9px] text-muted-foreground">+{events.length - 2} more</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Events this month</CardTitle>
            <p className="text-[12px] text-muted-foreground">
              {renewals.length === 0
                ? "Nothing dated in this month."
                : `${renewals.length} record${renewals.length === 1 ? "" : "s"} with a date in ${format(parseISO(monthStart), "MMMM")}.`}
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            {renewals.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-strong bg-muted/40 px-4 py-8 text-center text-[12.5px] text-muted-foreground">
                Add billing or trial dates to a subscription to see it here.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {[...renewals]
                  .sort((a, b) =>
                    (a.nextBillingDate ?? a.trialEndDate ?? "").localeCompare(
                      b.nextBillingDate ?? b.trialEndDate ?? "",
                    ),
                  )
                  .map((sub) => {
                    const date = sub.nextBillingDate ?? sub.trialEndDate;
                    return (
                      <li key={sub.id}>
                        <Link
                          href={`/subscriptions/${sub.id}`}
                          className="-mx-2 flex flex-wrap items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted"
                        >
                          <span className="tabular w-14 shrink-0 text-[11px] text-muted-foreground">
                            {formatDateShort(date)}
                          </span>
                          <ProviderAvatar provider={sub.provider} name={sub.serviceName} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium">{sub.serviceName}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {sub.status === "trial" && sub.trialEndDate
                                ? `Trial ends${sub.trialEndDate === date ? "" : ` ${formatDateShort(sub.trialEndDate)}`}`
                                : sub.nextBillingDate
                                  ? "Renewal"
                                  : "No billing date"}
                              {sub.autoRenew ? " · auto-renews" : ""}
                            </p>
                          </div>
                          <SubscriptionStatusBadge status={sub.status} />
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

        <Card>
          <CardHeader>
            <CardTitle>Next up</CardTitle>
            <p className="text-[12px] text-muted-foreground">The next recorded charges after today.</p>
          </CardHeader>
          <CardContent className="pt-4">
            {upcoming.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-strong bg-muted/40 px-4 py-8 text-center text-[12.5px] text-muted-foreground">
                No future billing dates recorded.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((sub) => {
                  const days = sub.nextBillingDate ? daysBetween(today, sub.nextBillingDate) : null;
                  return (
                    <li key={sub.id} className="flex items-center gap-3">
                      <ProviderAvatar provider={sub.provider} name={sub.serviceName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium">{sub.serviceName}</p>
                        <p className="text-[10.5px] text-muted-foreground">
                          {formatDateShort(sub.nextBillingDate)} ·{" "}
                          {days === null ? "—" : days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}
                        </p>
                      </div>
                      <MoneyString
                        amount={sub.renewalPrice ?? sub.price}
                        currency={sub.renewalCurrency || sub.currency}
                        className="text-[12px] font-medium"
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Renewals shown here are projections from the dates you recorded. A provider may charge on a different day, and
        failed payments are not visible until you mark them. Use the subscription page to correct a date.
      </p>
    </>
  );
}
