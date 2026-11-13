import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Gift,
  Info,
  Plus,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Progress, Stat } from "@/components/ui/feedback";
import { MoneyString } from "@/components/ui/money";
import { ProviderAvatar } from "@/components/ui/provider-avatar";
import { SubscriptionStatusBadge, VerificationBadge } from "@/components/ui/status";
import { requireUser } from "@/lib/auth/session";
import { listOffers, listSubscriptions } from "@/lib/data/queries";
import { daysBetween, formatDate, formatDateShort, todayInTimeZone } from "@/lib/dates";
import { addBundleItemAction } from "@/app/actions/bundles";
import { markOfferCheckedAction } from "@/app/actions/discovery";

export const metadata: Metadata = { title: "Free trials" };

export default async function TrialsPage({
  searchParams,
}: {
  searchParams: Promise<{ checked?: string; bundleError?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayInTimeZone(user.timezone);
  const [offers, subscriptions] = await Promise.all([listOffers(), listSubscriptions(user.id)]);

  const trialOffers = offers.filter(
    (offer) => (offer.trialDurationDays ?? 0) > 0 || offer.offerType === "free_trial",
  );
  const trackedTrials = subscriptions.filter((sub) => sub.status === "trial");
  const activeProviderIds = new Set(
    subscriptions
      .filter((sub) => ["active", "trial", "payment_failed", "pending_cancellation"].includes(sub.status))
      .map((sub) => sub.providerId)
      .filter((id): id is string => Boolean(id)),
  );

  const upcoming = trackedTrials
    .map((trial) => {
      const daysLeft = trial.trialEndDate ? daysBetween(today, trial.trialEndDate) : null;
      const start = trial.trialStartDate ?? trial.startDate;
      const total = start && trial.trialEndDate ? Math.max(1, daysBetween(start, trial.trialEndDate)) : null;
      const percent = total !== null && daysLeft !== null ? Math.min(100, Math.max(0, ((total - daysLeft) / total) * 100)) : 0;
      return { trial, daysLeft, percent };
    })
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

  const endingSoon = upcoming.filter((item) => item.daysLeft !== null && item.daysLeft <= 7).length;
  const noCardOffers = trialOffers.filter((offer) => !offer.paymentMethodRequired).length;

  return (
    <>
      <PageHeader
        eyebrow="Trials"
        title="Free trials, coordinated honestly"
        description={
          <>
            A trial is only real once you start it with the provider. SubZero prepares the timing and reminds you before
            conversion — it cannot start, extend or cancel a provider trial for you.
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/bundles">
              <CalendarClock className="h-3.5 w-3.5" /> Coordinate a bundle
            </Link>
          </Button>
        }
      />

      {params.checked && (
        <Alert tone="success" className="mb-4">
          Marked as checked by you. Self-reported; re-check the terms before starting the trial.
        </Alert>
      )}
      {params.bundleError && (
        <Alert tone="warning" className="mb-4">
          That offer could not be added to a bundle. It may already be included or the bundle may be scheduled.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Trials tracked" value={trackedTrials.length} sub="Records with trial status" icon={Gift} tone="primary" />
        <Stat label="Ending within 7 days" value={endingSoon} sub="Check each conversion date" icon={Timer} tone={endingSoon > 0 ? "warning" : "default"} />
        <Stat label="Catalog trial offers" value={trialOffers.length} sub="Reference listings, not verified" icon={CalendarClock} />
        <Stat label="No card required" value={noCardOffers} sub="As listed by the provider" icon={CreditCard} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Your tracked trials</CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Dates are what you recorded. Always confirm the exact conversion date in the provider account.
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            {upcoming.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-strong bg-muted/40 px-4 py-8 text-center text-[12.5px] text-muted-foreground">
                No trials tracked. When you start one, add it as a subscription with status “Free trial” so SubZero can
                remind you before it converts.
              </div>
            ) : (
              <ul className="space-y-4">
                {upcoming.map(({ trial, daysLeft, percent }) => (
                  <li key={trial.id} className="rounded-xl border border-border p-3.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <ProviderAvatar provider={trial.provider} name={trial.serviceName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/subscriptions/${trial.id}`} className="text-[13px] font-medium hover:underline">
                            {trial.serviceName}
                          </Link>
                          <SubscriptionStatusBadge status={trial.status} />
                        </div>
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                          {trial.trialEndDate ? `Converts ${formatDateShort(trial.trialEndDate)}` : "No end date recorded"}
                          {daysLeft !== null
                            ? daysLeft <= 0
                              ? " · expected today or overdue"
                              : ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
                            : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <MoneyString
                          amount={trial.renewalPrice ?? trial.price}
                          currency={trial.renewalCurrency || trial.currency}
                          className="text-[13px] font-semibold"
                        />
                        <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">after trial</p>
                      </div>
                    </div>
                    <Progress value={percent} className="mt-3" />
                    {trial.renewalPrice && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Recorded renewal price is{" "}
                        <MoneyString amount={trial.renewalPrice} currency={trial.renewalCurrency} /> — confirm with the
                        provider.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>How SubZero helps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4 text-[12px] leading-relaxed text-muted-foreground">
              {[
                "Add a trial to a bundle to plan when to start it relative to your preferred billing date.",
                "SubZero calculates the latest safe start date from the trial length you record.",
                "Reminders fire before conversion, using the dates in your own records.",
                "It never starts a trial, changes a provider billing date, or cancels on your behalf.",
              ].map((item) => (
                <p key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> {item}
                </p>
              ))}
            </CardContent>
          </Card>

          <Alert tone="warning" title="Trials can still charge you">
            Many providers require a payment method at signup and convert automatically. SubZero cannot prevent a charge
            you authorised with the provider. Diarise the cancellation deadline yourself.
          </Alert>
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[16px] font-semibold">Trial offers in the catalog</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {trialOffers.length} listings with a stated trial. All prices and durations are reference data.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/discover">
              Browse everything <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {trialOffers.length === 0 ? (
          <EmptyState
            icon={Gift}
            title="No trial offers listed"
            description="The catalog has no active trial listings. You can still record a trial manually once you start one."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {trialOffers.map((offer) => {
              const countryOk = offer.countryAvailability.length === 0 || offer.countryAvailability.includes(user.country);
              const alreadyUsing = activeProviderIds.has(offer.providerId);
              return (
                <Card key={offer.id} className="flex flex-col p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <ProviderAvatar provider={offer.provider} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{offer.provider.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">{offer.provider.category}</p>
                    </div>
                    <VerificationBadge status={offer.verificationStatus} showDot={false} />
                  </div>

                  <p className="mt-3 text-[13px] font-medium">{offer.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="info">
                      <Timer className="h-3 w-3" /> {offer.trialDurationDays ?? "Stated"} day trial
                    </Badge>
                    {!offer.paymentMethodRequired && <Badge variant="success">No card</Badge>}
                    {alreadyUsing && <Badge variant="muted">Already using</Badge>}
                    {!countryOk && <Badge variant="danger">Region may not be eligible</Badge>}
                  </div>

                  <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
                    {offer.description}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[12px]">
                    <div>
                      <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Trial price</p>
                      <p className="mt-0.5 font-medium">
                        {offer.initialPrice ? (
                          <MoneyString amount={offer.initialPrice} currency={offer.initialCurrency} />
                        ) : (
                          "No upfront charge listed"
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Then</p>
                      <p className="mt-0.5 font-medium">
                        <MoneyString amount={offer.renewalPrice} currency={offer.renewalCurrency} />
                      </p>
                    </div>
                  </div>

                  {offer.eligibility && (
                    <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">{offer.eligibility}</p>
                  )}
                  {offer.cancellationRequirements && (
                    <p className="mt-1 flex gap-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
                      <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" /> {offer.cancellationRequirements}
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    <form action={addBundleItemAction}>
                      <input type="hidden" name="offerId" value={offer.id} />
                      <input type="hidden" name="returnTo" value="/trials" />
                      <Button type="submit" size="sm">
                        <Plus className="h-3.5 w-3.5" /> Plan this trial
                      </Button>
                    </form>
                    <Button asChild size="sm" variant="outline">
                      <a href={offer.registrationUrl} target="_blank" rel="noreferrer noopener">
                        Provider <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </Button>
                  </div>
                  <form action={markOfferCheckedAction} className="mt-2">
                    <input type="hidden" name="offerId" value={offer.id} />
                    <input type="hidden" name="returnTo" value="/trials" />
                    <button
                      type="submit"
                      className="text-[10.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      I checked this trial on the provider&apos;s page
                    </button>
                  </form>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Trial lengths and prices are collected from public provider pages and may be out of date. SubZero does not
        guarantee eligibility, availability or the renewal price shown. Verify before signing up.
      </p>
    </>
  );
}
