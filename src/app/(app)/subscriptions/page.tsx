import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Download, Filter, Layers, Plus, Search, Upload } from "lucide-react";
import { PageHeader, SubNav } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/input";
import { MoneyString } from "@/components/ui/money";
import { ProviderAvatar } from "@/components/ui/provider-avatar";
import { SubscriptionStatusBadge } from "@/components/ui/status";
import { requireUser } from "@/lib/auth/session";
import { listSubscriptions } from "@/lib/data/queries";
import { daysBetween, formatDateShort, todayInTimeZone } from "@/lib/dates";
import { fromMinor, monthlyEquivalent, toMinor } from "@/lib/money";

export const metadata: Metadata = { title: "My subscriptions" };

const statusLabels: Record<string, string> = {
  active: "Active",
  trial: "Trials",
  paused: "Paused",
  pending_cancellation: "Cancelling",
  cancelled: "Cancelled",
  expired: "Expired",
  payment_failed: "Payment failed",
};

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; category?: string; sort?: string; updated?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayInTimeZone(user.timezone);
  const all = await listSubscriptions(user.id);

  const status = params.status && params.status !== "all" ? params.status : null;
  const query = (params.q ?? "").trim().toLowerCase();
  const category = params.category && params.category !== "all" ? params.category : null;
  const sort = params.sort ?? "renewal";

  let rows = all;
  if (status) rows = rows.filter((row) => row.status === status);
  if (category) rows = rows.filter((row) => row.category === category);
  if (query) {
    rows = rows.filter(
      (row) =>
        row.serviceName.toLowerCase().includes(query) ||
        (row.provider?.name ?? "").toLowerCase().includes(query) ||
        row.category.toLowerCase().includes(query),
    );
  }
  rows = [...rows].sort((a, b) => {
    if (sort === "price") {
      const aMinor = toMinor(a.renewalPrice ?? a.price, a.renewalCurrency || a.currency) ?? 0;
      const bMinor = toMinor(b.renewalPrice ?? b.price, b.renewalCurrency || b.currency) ?? 0;
      return bMinor - aMinor;
    }
    if (sort === "name") return a.serviceName.localeCompare(b.serviceName);
    if (sort === "added") return b.createdAt.getTime() - a.createdAt.getTime();
    const aDate = a.nextBillingDate ?? a.trialEndDate ?? "9999-12-31";
    const bDate = b.nextBillingDate ?? b.trialEndDate ?? "9999-12-31";
    return aDate.localeCompare(bDate);
  });

  const counts = all.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const categories = [...new Set(all.map((row) => row.category))].sort();
  const monthlyByCurrency = rows.reduce<Record<string, number>>((acc, row) => {
    const amount = toMinor(row.renewalPrice ?? row.price, row.renewalCurrency || row.currency);
    if (amount === null) return acc;
    const currency = row.renewalCurrency || row.currency;
    acc[currency] = (acc[currency] ?? 0) + monthlyEquivalent(amount, row.billingFrequency);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="My subscriptions"
        description="Every record states where it came from and how confident SubZero is. Catalog-linked records show the catalog verification state; manual records are your own entries."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/subscriptions/imports">
                <Upload className="h-3.5 w-3.5" /> Imports
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/subscriptions/new">
                <Plus className="h-3.5 w-3.5" /> Add
              </Link>
            </Button>
          </>
        }
      />

      {params.updated === "deleted" && (
        <div className="mb-4 rounded-xl border border-success/25 bg-success-soft px-4 py-2.5 text-[12.5px] text-success">
          Subscription deleted.
        </div>
      )}

      <SubNav
        active={status ? `/subscriptions?status=${status}` : "/subscriptions"}
        items={[
          { href: "/subscriptions", label: "All", count: all.length },
          { href: "/subscriptions?status=active", label: "Active", count: counts.active ?? 0 },
          { href: "/subscriptions?status=trial", label: "Trials", count: counts.trial ?? 0 },
          { href: "/subscriptions?status=payment_failed", label: "Failed", count: counts.payment_failed ?? 0 },
          { href: "/subscriptions?status=pending_cancellation", label: "Cancelling", count: counts.pending_cancellation ?? 0 },
          { href: "/subscriptions?status=cancelled", label: "Cancelled", count: (counts.cancelled ?? 0) + (counts.expired ?? 0) },
        ]}
      />

      <Card className="mb-4 p-3">
        <form method="get" className="flex flex-wrap items-end gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Search service, provider or category"
              className="pl-9"
              aria-label="Search subscriptions"
            />
          </div>
          <Select name="category" defaultValue={category ?? "all"} aria-label="Filter by category" className="w-auto min-w-40">
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
          <Select name="sort" defaultValue={sort} aria-label="Sort subscriptions" className="w-auto min-w-36">
            <option value="renewal">Next renewal</option>
            <option value="price">Highest price</option>
            <option value="name">Name</option>
            <option value="added">Recently added</option>
          </Select>
          <Button type="submit" variant="secondary">
            <Filter className="h-3.5 w-3.5" /> Apply
          </Button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={all.length === 0 ? "Your inventory is empty" : "No subscriptions match these filters"}
          description={
            all.length === 0
              ? "Add a subscription you already pay for. SubZero never invents records — everything starts with your entry, a confirmed email, or an imported transaction you approve."
              : "Try a different status, category or search term."
          }
          action={
            all.length === 0 ? (
              <Button asChild>
                <Link href="/subscriptions/new">
                  <Plus className="h-4 w-4" /> Add subscription
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/subscriptions">Clear filters</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-[12px] text-muted-foreground">
              {rows.length} record{rows.length === 1 ? "" : "s"}
              {status ? ` · ${statusLabels[status] ?? status}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(monthlyByCurrency).map(([currency, minor]) => (
                <Badge key={currency} variant="muted">
                  <MoneyString amount={fromMinor(minor, currency)} currency={currency} /> / month equivalent
                </Badge>
              ))}
            </div>
          </div>

          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {rows.map((sub) => {
                const days = sub.nextBillingDate ? daysBetween(today, sub.nextBillingDate) : null;
                const due =
                  sub.status === "trial" && sub.trialEndDate ? daysBetween(today, sub.trialEndDate) : null;
                return (
                  <li key={sub.id}>
                    <Link
                      href={`/subscriptions/${sub.id}`}
                      className="flex flex-wrap items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/60 sm:px-5"
                    >
                      <ProviderAvatar provider={sub.provider} name={sub.serviceName} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[14px] font-medium">{sub.serviceName}</span>
                          <SubscriptionStatusBadge status={sub.status} />
                          {sub.source !== "manual" && (
                            <Badge variant="outline" className="capitalize">
                              {sub.source}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                          {sub.provider?.name ?? sub.category} · {sub.billingFrequency}
                          {sub.status === "trial" && sub.trialEndDate
                            ? ` · trial ends ${formatDateShort(sub.trialEndDate)}${due !== null ? ` (${due <= 0 ? "today" : `${due} days`})` : ""}`
                            : sub.nextBillingDate
                              ? ` · renews ${formatDateShort(sub.nextBillingDate)}${days !== null && days >= 0 ? ` (${days === 0 ? "today" : `${days} days`})` : ""}`
                              : " · no billing date"}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <MoneyString
                            amount={sub.renewalPrice ?? sub.price}
                            currency={sub.renewalCurrency || sub.currency}
                            className="text-[14px] font-semibold"
                          />
                          <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
                            per {sub.billingFrequency === "semiannual" ? "6 months" : sub.billingFrequency.replace("ly", "")}
                          </p>
                        </div>
                        <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-[11px] text-muted-foreground">
              Prices are per record in their original currency. The monthly equivalents above use simple annualisation
              and do not account for mid-cycle price changes.
            </p>
            <Button asChild variant="ghost" size="sm">
              <a href="/api/export?format=csv&scope=subscriptions">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </a>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
