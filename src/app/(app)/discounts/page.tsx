import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  BellRing,
  CheckCircle2,
  Clock,
  Info,
  Percent,
  ShieldQuestion,
  Sparkles,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Stat } from "@/components/ui/feedback";
import { Money } from "@/components/ui/money";
import { ProviderAvatar } from "@/components/ui/provider-avatar";
import { VerificationBadge } from "@/components/ui/status";
import { requireUser } from "@/lib/auth/session";
import { getRateTable } from "@/lib/data/rates";
import {
  getWatchedProviderIds,
  listDiscounts,
  listSubscriptions,
  toDiscountLike,
} from "@/lib/data/queries";
import { evaluateDiscount, rankDiscounts } from "@/lib/engines/discounts";
import { formatDate, todayInTimeZone } from "@/lib/dates";
import {
  markDiscountCheckedAction,
  toggleWatchedProviderAction,
} from "@/app/actions/discovery";

export const metadata: Metadata = { title: "Discounts" };

const ACTIVE = new Set(["active", "trial", "payment_failed", "pending_cancellation"]);

export default async function DiscountsPage({
  searchParams,
}: {
  searchParams: Promise<{ checked?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayInTimeZone(user.timezone);
  const [discounts, subscriptions, watchedIds, rateTable] = await Promise.all([
    listDiscounts(),
    listSubscriptions(user.id),
    getWatchedProviderIds(user.id),
    getRateTable(user.preferredCurrency),
  ]);

  const activeProviderIds = new Set(
    subscriptions
      .filter((sub) => ACTIVE.has(sub.status))
      .map((sub) => sub.providerId)
      .filter((id): id is string => Boolean(id)),
  );

  const evaluations = rankDiscounts(
    discounts.map((discount) =>
      evaluateDiscount(toDiscountLike(discount), {
        isStudent: user.studentEligible,
        hasActiveProvider: activeProviderIds.has(discount.providerId),
        today,
      }, { rateTable, baseCurrency: user.preferredCurrency }),
    ),
  );

  const byId = new Map(discounts.map((discount) => [discount.id, discount]));
  const eligible = evaluations.filter((evaluation) => evaluation.eligible);
  const ineligible = evaluations.filter((evaluation) => !evaluation.eligible);
  const estimatedAnnual = eligible.reduce((sum, evaluation) => sum + evaluation.rankScore, 0);
  const actualAnnual = eligible
    .filter((evaluation) => evaluation.savingType === "actual")
    .reduce((sum, evaluation) => sum + evaluation.rankScore, 0);
  const watched = discounts.filter((discount) => watchedIds.includes(discount.providerId));
  const watchedNames = [...new Map(watched.map((d) => [d.providerId, d.provider.name])).values()];

  return (
    <>
      <PageHeader
        eyebrow="Discounts"
        title="Offers, with the caveats attached"
        description={
          <>
            Savings are calculated against the price in your records or the listing&apos;s standard price. They are
            estimated unless the offer is verified and any code is known to work.
          </>
        }
      />

      {params.checked && (
        <Alert tone="success" className="mb-4">
          Marked as checked by you. Codes and eligibility still need testing at checkout.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Eligible offers"
          value={eligible.length}
          sub={`${ineligible.length} not eligible for you`}
          icon={Percent}
          tone="primary"
        />
        <Stat
          label="Potential annual saving"
          value={<Money minor={estimatedAnnual} currency={user.preferredCurrency} />}
          sub="Estimated across eligible offers"
          icon={Sparkles}
          tone="success"
        />
        <Stat
          label="Verified saving"
          value={<Money minor={actualAnnual} currency={user.preferredCurrency} />}
          sub="Only verified offers count as actual"
          icon={CheckCircle2}
        />
        <Stat
          label="Watching"
          value={watchedNames.length}
          sub="Providers you asked SubZero to track"
          icon={BellRing}
        />
      </div>

      <Alert tone="info" className="mt-5" title="How the saving is calculated">
        Each estimate compares the promotional cost over 12 months with the standard price over the same period, using
        the offer&apos;s own billing cadence. Currency conversion uses reference rates and is indicative. An offer marked{" "}
        <em>estimated</em> has not been independently verified, so the saving may not be realisable.
      </Alert>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[16px] font-semibold">Eligible offers</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Ranked by converted 12-month saving. Eligibility is based on your profile and current subscriptions.
            </p>
          </div>
          <Badge variant="muted">{eligible.length}</Badge>
        </div>

        {eligible.length === 0 ? (
          <EmptyState
            icon={Percent}
            title="No eligible offers right now"
            description="Offers may be limited to new customers, students, or regions. Check the ineligible list below for the reason, or browse the catalog."
            action={
              <Button asChild variant="outline">
                <Link href="/discover">Browse the catalog</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {eligible.map((evaluation) => {
              const discount = byId.get(evaluation.discountId);
              if (!discount) return null;
              const isWatched = watchedIds.includes(discount.providerId);
              return (
                <Card key={evaluation.discountId} className="flex flex-col p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <ProviderAvatar provider={discount.provider} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{discount.provider.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">{discount.provider.category}</p>
                    </div>
                    <VerificationBadge status={discount.verificationStatus} showDot={false} />
                  </div>

                  <p className="mt-3 text-[13px] font-medium">{discount.title}</p>
                  <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
                    {discount.description}
                  </p>

                  <div className="mt-3 rounded-xl border border-success/25 bg-success-soft/60 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-success">
                        {evaluation.savingType === "actual" ? "Actual 12-month saving" : "Estimated 12-month saving"}
                      </p>
                      <Badge variant={evaluation.savingType === "actual" ? "success" : "warning"}>
                        {evaluation.savingType}
                      </Badge>
                    </div>
                    <p className="tabular mt-1 text-xl font-semibold text-success">
                      <Money minor={evaluation.twelveMonthSavingMinor} currency={discount.currency} />
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {evaluation.effectivePercentage}% effective discount ·{" "}
                      <Money minor={evaluation.effectiveMonthlyMinor} currency={discount.currency} /> / month over 12
                      months
                    </p>
                  </div>

                  <dl className="mt-3 grid grid-cols-3 gap-2 text-[11.5px]">
                    {[
                      ["3 months", evaluation.threeMonthCostMinor],
                      ["6 months", evaluation.sixMonthCostMinor],
                      ["12 months", evaluation.twelveMonthCostMinor],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                        <dd className="mt-0.5 font-medium">
                          <Money minor={Number(value)} currency={discount.currency} />
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {discount.promotionalCode && (
                      <Badge variant={evaluation.codeUsable ? "success" : "warning"} className="font-mono">
                        {discount.promotionalCode}
                      </Badge>
                    )}
                    {discount.isStudent && <Badge variant="accent">Student</Badge>}
                    {discount.newCustomersOnly && <Badge variant="outline">New customers</Badge>}
                    {discount.existingCustomersOnly && <Badge variant="outline">Existing customers</Badge>}
                    {discount.expirationDate && (
                      <Badge variant={evaluation.expiresInDays !== null && evaluation.expiresInDays <= 14 ? "danger" : "muted"}>
                        <Clock className="h-3 w-3" /> Ends {formatDate(discount.expirationDate)}
                      </Badge>
                    )}
                  </div>

                  {evaluation.eligibilityNotes.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {evaluation.eligibilityNotes.slice(0, 3).map((note) => (
                        <li key={note} className="flex gap-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
                          <Info className="mt-0.5 h-3 w-3 shrink-0" /> {note}
                        </li>
                      ))}
                    </ul>
                  )}
                  {evaluation.tradeoffs.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {evaluation.tradeoffs.map((tradeoff) => (
                        <li key={tradeoff} className="flex gap-1.5 text-[10.5px] leading-relaxed text-warning">
                          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {tradeoff}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    <Button asChild size="sm">
                      <a href={discount.redemptionUrl} target="_blank" rel="noreferrer noopener">
                        View offer <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </Button>
                    <form action={toggleWatchedProviderAction}>
                      <input type="hidden" name="providerId" value={discount.providerId} />
                      <input type="hidden" name="returnTo" value="/discounts" />
                      <Button type="submit" size="sm" variant={isWatched ? "subtle" : "outline"}>
                        <BellRing className="h-3.5 w-3.5" /> {isWatched ? "Watching" : "Watch"}
                      </Button>
                    </form>
                    <a
                      href={discount.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground"
                    >
                      <ShieldQuestion className="h-3 w-3" /> Source
                    </a>
                  </div>
                  <form action={markDiscountCheckedAction} className="mt-2">
                    <input type="hidden" name="discountId" value={discount.id} />
                    <input type="hidden" name="returnTo" value="/discounts" />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      <BadgeCheck className="h-3 w-3" /> I checked this offer on the provider&apos;s page
                    </button>
                  </form>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {ineligible.length > 0 && (
        <section className="mt-8">
          <div className="mb-3">
            <h2 className="text-[16px] font-semibold">Not eligible for your profile</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              These are kept visible so the eligibility reason is explicit rather than silently filtered.
            </p>
          </div>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {ineligible.map((evaluation) => {
                const discount = byId.get(evaluation.discountId);
                if (!discount) return null;
                return (
                  <li key={evaluation.discountId} className="flex flex-wrap items-start gap-3 px-4 py-3.5 sm:px-5">
                    <ProviderAvatar provider={discount.provider} name={discount.provider.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{discount.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {discount.provider.name} · {discount.billingFrequency}
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {evaluation.eligibilityNotes.map((note) => (
                          <li key={note} className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                            <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-danger/70" /> {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <VerificationBadge status={discount.verificationStatus} showDot={false} />
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-primary" /> Watching
              </CardTitle>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Watched providers are checked for new offers when the verification job runs. No notification is sent
                unless a change is actually detected.
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {watchedNames.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-strong bg-muted/40 px-4 py-6 text-center text-[12px] text-muted-foreground">
                You are not watching any providers yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {watchedNames.map((name) => (
                  <li key={name} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-[12.5px]">
                    <span>{name}</span>
                    <Badge variant="muted">Watching</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Why some offers are marked estimated</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-[12px] leading-relaxed text-muted-foreground">
            <p>
              A saving is only <strong className="text-foreground">actual</strong> when the offer has been verified and
              any promotional code is known to work. Everything else is an estimate based on published prices.
            </p>
            <p>
              Codes are not tested by SubZero. If a code fails at checkout, the standard price applies — budget for that
              possibility.
            </p>
            <p>
              Eligibility depends on the provider&apos;s own checks, not on SubZero. Student status, region, prior
              subscriptions and payment method all matter.
            </p>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
