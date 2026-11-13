import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  Info,
  Layers,
  PieChart,
  Sparkles,
  TriangleAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CategoryChart, ForecastChart, SpendBarChart } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Stat } from "@/components/ui/feedback";
import { Money } from "@/components/ui/money";
import { requireUser } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/data/queries";
import { getRateTable, toEngineSubscription } from "@/lib/data/rates";
import { spendByCategory, spendByProvider } from "@/lib/engines/forecast";
import type { OptimisationFinding } from "@/lib/engines/optimisation";

export const metadata: Metadata = { title: "Analytics" };

const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };

const severityTone: Record<string, "danger" | "warning" | "info" | "muted"> = {
  high: "danger",
  medium: "warning",
  low: "info",
  info: "muted",
};

const typeLabels: Record<string, string> = {
  duplicate: "Duplicate",
  overlap: "Overlap",
  price_increase: "Price increase",
  discount: "Discount",
  student_discount: "Student discount",
  annual_plan: "Annual plan",
  budget: "Budget",
  trial_ending: "Trial ending",
  payment_failed: "Payment failed",
};

export default async function AnalyticsPage() {
  const user = await requireUser();
  const data = await getDashboardData(user);
  const rateTable = await getRateTable(user.preferredCurrency);
  const engineSubs = data.active.map(toEngineSubscription);
  const categories = spendByCategory(engineSubs, rateTable);
  const providers = spendByProvider(engineSubs, rateTable);
  const currency = user.preferredCurrency;

  const yearPeriod = data.forecast.periods.find((period) => period.horizonDays === 365) ?? data.forecast.periods.at(-1);
  const ninetyDay = data.forecast.periods.find((period) => period.horizonDays === 90) ?? data.forecast.periods[0];

  const findings = [...data.optimisation.findings].sort((a, b) => {
    const severity = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
    if (severity !== 0) return severity;
    return (b.estimatedAnnualSavingMinor ?? 0) - (a.estimatedAnnualSavingMinor ?? 0);
  });

  const actualSavings = findings
    .filter((finding) => finding.savingType === "actual" && finding.estimatedAnnualSavingMinor !== null)
    .reduce((sum, finding) => sum + (finding.estimatedAnnualSavingMinor ?? 0), 0);
  const estimatedSavings = findings
    .filter((finding) => finding.savingType === "estimated" && finding.estimatedAnnualSavingMinor !== null)
    .reduce((sum, finding) => sum + (finding.estimatedAnnualSavingMinor ?? 0), 0);
  const actionable = findings.filter((finding) => finding.estimatedAnnualSavingMinor !== null);

  const categoryData = categories.map((row) => ({ name: row.category, valueMinor: row.amountMinor }));
  const providerData = providers.slice(0, 8).map((row) => ({ name: row.provider, valueMinor: row.amountMinor }));

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title="What the numbers actually mean"
        description={
          <>
            Totals convert to {currency} using reference rates. Every saving is labelled estimated unless the offer is
            verified. Forecasts assume recorded prices and dates stay unchanged.
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/calendar">
              <BarChart3 className="h-3.5 w-3.5" /> Calendar
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Monthly commitment"
          value={<Money minor={data.monthlyMinor} currency={currency} />}
          sub="Active plans, converted"
          icon={Wallet}
          tone="primary"
        />
        <Stat
          label="Annualised recurring"
          value={<Money minor={data.annualMinor} currency={currency} />}
          sub="Current prices and cadence"
          icon={TrendingUp}
        />
        <Stat
          label="Next 12 months forecast"
          value={<Money minor={yearPeriod?.totalMinor ?? 0} currency={currency} />}
          sub={`${yearPeriod?.events.length ?? 0} scheduled charges`}
          icon={CircleDollarSign}
        />
        <Stat
          label="Potential annual saving"
          value={<Money minor={data.optimisation.potentialAnnualSavingMinor} currency={currency} />}
          sub="Estimated — review each finding"
          icon={Sparkles}
          tone={data.optimisation.potentialAnnualSavingMinor > 0 ? "success" : "default"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>12-month charge forecast</CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Monthly buckets converted to {currency}. Trials appear as uncertain until their recorded end date.
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <ForecastChart data={yearPeriod?.monthlyBuckets ?? []} currency={currency} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11.5px] text-muted-foreground">
              <span>{data.rateNote}</span>
              {yearPeriod && yearPeriod.unconvertedCurrencies.length > 0 && (
                <Badge variant="warning">
                  Not converted: {yearPeriod.unconvertedCurrencies.join(", ")}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-success" /> Actual vs estimated
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div className="rounded-xl border border-success/25 bg-success-soft/60 p-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-success">
                  Actual saving from verified offers
                </p>
                <p className="tabular mt-1 text-xl font-semibold text-success">
                  <Money minor={actualSavings} currency={currency} />
                </p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                  Only verified offers with usable codes count here.
                </p>
              </div>
              <div className="rounded-xl border border-warning/25 bg-warning-soft/50 p-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-warning">
                  Estimated saving to review
                </p>
                <p className="tabular mt-1 text-xl font-semibold text-warning">
                  <Money minor={estimatedSavings} currency={currency} />
                </p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                  Not banked. Eligibility, codes and prices still need checking.
                </p>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                A saving becomes real only after you change a plan or cancel a service and the provider confirms it.
                SubZero does not track realised savings automatically.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>90-day outlook</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="tabular text-2xl font-semibold">
                <Money minor={ninetyDay?.totalMinor ?? 0} currency={currency} />
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                across {ninetyDay?.events.length ?? 0} charge{(ninetyDay?.events.length ?? 0) === 1 ? "" : "s"} until{" "}
                {ninetyDay?.endDate ?? "—"}
              </p>
              <Button asChild variant="ghost" size="sm" className="mt-2 -ml-2">
                <Link href="/calendar">
                  View dates <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" /> Spend by category
            </CardTitle>
            <p className="text-[12px] text-muted-foreground">Monthly equivalent, converted where a rate exists.</p>
          </CardHeader>
          <CardContent className="pt-4">
            <CategoryChart data={categoryData} currency={currency} />
            <ul className="mt-3 space-y-1.5">
              {categories.slice(0, 5).map((row) => (
                <li key={row.category} className="flex items-center justify-between gap-2 text-[11.5px]">
                  <span className="text-muted-foreground">{row.category}</span>
                  <span className="flex items-center gap-2">
                    <Money minor={row.amountMinor} currency={currency} className="font-medium" />
                    {row.unconverted && <Badge variant="warning">Partial</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Largest providers
            </CardTitle>
            <p className="text-[12px] text-muted-foreground">Monthly equivalent per provider, top eight.</p>
          </CardHeader>
          <CardContent className="pt-4">
            <SpendBarChart data={providerData} currency={currency} />
          </CardContent>
        </Card>
      </div>

      <section id="findings" className="mt-8 scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[16px] font-semibold">Findings</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {findings.length} observation{findings.length === 1 ? "" : "s"}. {actionable.length} include a quantified
              saving.
            </p>
          </div>
          <Badge variant="muted">{findings.length}</Badge>
        </div>

        {findings.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-[13px] font-medium">Nothing to flag yet</p>
            <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
              Add subscriptions and price observations. SubZero looks for duplicates, overlaps, price rises, eligible
              discounts, budget overruns and trials ending soon.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {findings.map((finding) => (
              <FindingCard key={finding.id} finding={finding} />
            ))}
          </div>
        )}
      </section>

      {(data.optimisation.dataGaps.length > 0 || data.optimisation.unconvertedCurrencies.length > 0) && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-4 w-4 text-info" /> What SubZero could not calculate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-4 text-[12px] leading-relaxed text-muted-foreground">
            {data.optimisation.unconvertedCurrencies.length > 0 && (
              <p className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                No exchange rate was available for {data.optimisation.unconvertedCurrencies.join(", ")}. Those records are
                excluded from converted totals rather than guessed.
              </p>
            )}
            {data.optimisation.dataGaps.map((gap) => (
              <p key={gap} className="flex items-start gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {gap}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
        {data.optimisation.disclosure} Forecasts are projections, not statements of what a provider will charge. Currency
        conversion uses reference rates and is indicative only.
      </p>
    </>
  );
}

function FindingCard({ finding }: { finding: OptimisationFinding }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={
            "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full " +
            (finding.severity === "high"
              ? "bg-danger"
              : finding.severity === "medium"
                ? "bg-warning"
                : "bg-info")
          }
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13.5px] font-semibold">{finding.title}</p>
            <Badge variant={severityTone[finding.severity] ?? "muted"} className="capitalize">
              {finding.severity}
            </Badge>
            <Badge variant="outline">{typeLabels[finding.type] ?? finding.type}</Badge>
            {finding.savingType === "estimated" && finding.estimatedAnnualSavingMinor !== null && (
              <Badge variant="warning">Estimated</Badge>
            )}
            {finding.savingType === "actual" && <Badge variant="success">Verified</Badge>}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{finding.description}</p>

          {finding.estimatedAnnualSavingMinor !== null && (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="tabular text-[15px] font-semibold text-success">
                <Money minor={finding.estimatedAnnualSavingMinor} currency={finding.currency} />
                <span className="text-[11px] font-normal text-muted-foreground"> / year</span>
              </span>
              {finding.estimatedMonthlySavingMinor !== null && (
                <span className="text-[11px] text-muted-foreground">
                  ≈ <Money minor={finding.estimatedMonthlySavingMinor} currency={finding.currency} /> / month ·{" "}
                  {finding.savingType}
                </span>
              )}
            </div>
          )}

          {finding.evidence.length > 0 && (
            <ul className="mt-2 space-y-1">
              {finding.evidence.slice(0, 3).map((item) => (
                <li key={item} className="text-[11px] text-muted-foreground">
                  · {item}
                </li>
              ))}
            </ul>
          )}
          {finding.eligibility.length > 0 && (
            <ul className="mt-2 space-y-1">
              {finding.eligibility.slice(0, 2).map((item) => (
                <li key={item} className="flex gap-1.5 text-[11px] leading-relaxed text-warning">
                  <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {item}
                </li>
              ))}
            </ul>
          )}
          {finding.tradeoffs.length > 0 && (
            <ul className="mt-1 space-y-1">
              {finding.tradeoffs.slice(0, 2).map((item) => (
                <li key={item} className="text-[11px] leading-relaxed text-muted-foreground">
                  Trade-off: {item}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {finding.action.externalUrl ? (
            <Button asChild size="sm" variant="outline">
              <a href={finding.action.externalUrl} target="_blank" rel="noreferrer noopener">
                {finding.action.label} <ArrowUpRight className="h-3 w-3" />
              </a>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href={finding.action.href}>
                {finding.action.label} <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
