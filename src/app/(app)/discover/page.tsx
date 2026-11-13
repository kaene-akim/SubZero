import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Compass,
  Filter,
  Inbox,
  Info,
  Plus,
  RefreshCw,
  Search,
  ShieldQuestion,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/input";
import { MoneyString } from "@/components/ui/money";
import { ProviderAvatar } from "@/components/ui/provider-avatar";
import { VerificationBadge } from "@/components/ui/status";
import { requireUser } from "@/lib/auth/session";
import { listOffers, listPendingDetections, listSubscriptions } from "@/lib/data/queries";
import { formatDate, formatDateTime } from "@/lib/dates";
import { addBundleItemAction } from "@/app/actions/bundles";
import { markOfferCheckedAction } from "@/app/actions/discovery";
import {
  confirmDetectionAction,
  dismissAllDetectionsAction,
  mergeDetectionAction,
  rejectDetectionAction,
} from "@/app/actions/detections";

export const metadata: Metadata = { title: "Discover" };

const offerTypeLabels: Record<string, string> = {
  free_trial: "Free trial",
  introductory_price: "Introductory price",
  free_plan: "Free plan",
  standard_plan: "Standard plan",
  discount: "Discount",
};

const classificationTone: Record<string, "success" | "warning" | "danger" | "info" | "muted"> = {
  renewal: "info",
  receipt: "success",
  trial_started: "info",
  trial_ending: "warning",
  price_increase: "danger",
  cancelled: "muted",
  expired: "muted",
  unknown: "muted",
};

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    type?: string;
    checked?: string;
    bundleError?: string;
    detection?: string;
    message?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [offers, detections, subscriptions] = await Promise.all([
    listOffers(),
    listPendingDetections(user.id),
    listSubscriptions(user.id),
  ]);

  const query = (params.q ?? "").trim().toLowerCase();
  const category = params.category && params.category !== "all" ? params.category : null;
  const type = params.type && params.type !== "all" ? params.type : null;

  let filtered = offers;
  if (category) filtered = filtered.filter((offer) => offer.provider.category === category);
  if (type) filtered = filtered.filter((offer) => offer.offerType === type);
  if (query) {
    filtered = filtered.filter(
      (offer) =>
        offer.provider.name.toLowerCase().includes(query) ||
        offer.title.toLowerCase().includes(query) ||
        offer.description.toLowerCase().includes(query) ||
        offer.provider.category.toLowerCase().includes(query),
    );
  }

  const categories = [...new Set(offers.map((offer) => offer.provider.category))].sort();
  const activeSubscriptions = subscriptions.filter((sub) =>
    ["active", "trial", "payment_failed", "pending_cancellation"].includes(sub.status),
  );

  const bundleErrorMessages: Record<string, string> = {
    "missing-offer": "That offer could not be identified. Refresh the page and try again.",
    "offer-not-found": "That offer is no longer in the catalog.",
    "bundle-not-found": "The bundle could not be found in your workspace.",
    "bundle-locked": "This bundle has been scheduled and can no longer be changed.",
    "already-added": "That offer is already in this bundle.",
  };

  return (
    <>
      <PageHeader
        eyebrow="Discovery"
        title="Find what is worth paying for"
        description={
          <>
            Every listing is reference data compiled from a provider&apos;s public page. Prices, trials and eligibility
            change without notice — SubZero shows the verification state and the source before you act.
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/subscriptions/new">
              <Plus className="h-3.5 w-3.5" /> Add manually
            </Link>
          </Button>
        }
      />

      {params.checked && (
        <Alert tone="success" className="mb-4">
          Marked as checked by you. This is self-reported and does not mean SubZero independently verified the offer.
        </Alert>
      )}
      {params.bundleError && (
        <Alert tone="warning" className="mb-4">
          {bundleErrorMessages[params.bundleError] ?? "That action could not be completed."}
        </Alert>
      )}
      {params.detection && (
        <Alert
          tone={params.detection === "error" ? "danger" : params.detection === "confirmed" ? "success" : "info"}
          className="mb-4"
        >
          {params.message ?? "Detection review updated."}
        </Alert>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Catalog listings</p>
          <p className="tabular mt-2 text-2xl font-semibold">{offers.length}</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {offers.filter((o) => o.verificationStatus === "verified").length} verified ·{" "}
            {offers.filter((o) => o.verificationStatus !== "verified").length} awaiting verification
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Inbox detections</p>
          <p className="tabular mt-2 text-2xl font-semibold">{detections.length}</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">Nothing is added until you confirm it.</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Linked providers</p>
          <p className="tabular mt-2 text-2xl font-semibold">{activeSubscriptions.length}</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">Services you currently pay for.</p>
        </Card>
      </div>

      <section id="detections" className="mb-8 scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[16px] font-semibold">Inbox detections to review</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Parsed from connected email with a rules-first classifier. Confirm only what matches reality.
            </p>
          </div>
          {detections.length > 0 && (
            <form action={dismissAllDetectionsAction}>
              <Button type="submit" variant="ghost" size="sm">
                <X className="h-3.5 w-3.5" /> Dismiss all
              </Button>
            </form>
          )}
        </div>

        {detections.length === 0 ? (
          <Card className="p-5">
            <div className="flex flex-wrap items-start gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground">
                <Inbox className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">No detections waiting</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  Connect an inbox in Settings and run a sync to look for renewals, receipts and trial notices. In
                  development, the sandbox inbox uses explicitly synthetic messages.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/settings#integrations">
                  <RefreshCw className="h-3.5 w-3.5" /> Integrations
                </Link>
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {detections.map((detection) => {
              const extracted = detection.extractedData as Record<string, unknown>;
              const confidence = Math.round(Number(detection.confidenceScore) * 100);
              const reasons = (extracted.reasons as string[] | undefined) ?? detection.confidenceReasons;
              const evidence = (extracted.evidence as string[] | undefined) ?? [];
              const amount = extracted.price ?? extracted.amount ?? extracted.renewalPrice;
              const currency = String(extracted.currency ?? "GBP");
              const serviceName = String(extracted.serviceName ?? extracted.merchantName ?? detection.provider?.name ?? "Unknown service");
              const classification = detection.classification;
              return (
                <Card key={detection.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <ProviderAvatar provider={detection.provider} name={serviceName} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-semibold">{serviceName}</p>
                        <Badge variant={classificationTone[classification] ?? "muted"} className="capitalize">
                          {classification.replace(/_/g, " ")}
                        </Badge>
                        <Badge variant={confidence >= 80 ? "success" : confidence >= 55 ? "warning" : "muted"}>
                          {confidence}% confidence
                        </Badge>
                        {detection.provider && <VerificationBadge status="unverified" showDot={false} />}
                      </div>
                      <p className="mt-1 truncate text-[12px] text-muted-foreground">
                        {detection.subject} · {detection.sender}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Received {formatDateTime(detection.receivedAt)} · classifier {detection.classifierVersion}
                      </p>
                    </div>
                    {amount !== undefined && amount !== null && (
                      <div className="text-right">
                        <MoneyString amount={String(amount)} currency={currency} className="text-[14px] font-semibold" />
                        <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">extracted amount</p>
                      </div>
                    )}
                  </div>

                  {detection.snippet && (
                    <p className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
                      {detection.snippet}
                    </p>
                  )}

                  {(reasons.length > 0 || evidence.length > 0) && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {reasons.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            Why it matched
                          </p>
                          <ul className="mt-1.5 space-y-1">
                            {reasons.slice(0, 4).map((reason) => (
                              <li key={reason} className="flex gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" /> {reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {evidence.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            Evidence
                          </p>
                          <ul className="mt-1.5 space-y-1">
                            {evidence.slice(0, 4).map((item) => (
                              <li key={item} className="truncate text-[11.5px] text-muted-foreground">
                                “{item}”
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-3">
                    <form action={confirmDetectionAction}>
                      <input type="hidden" name="id" value={detection.id} />
                      <Button type="submit" size="sm">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
                      </Button>
                    </form>
                    {activeSubscriptions.length > 0 && (
                      <form action={mergeDetectionAction} className="flex items-end gap-2">
                        <input type="hidden" name="id" value={detection.id} />
                        <Select
                          name="subscriptionId"
                          aria-label="Merge into subscription"
                          className="h-8 w-auto min-w-40 text-[12px]"
                          required
                        >
                          <option value="">Merge into…</option>
                          {activeSubscriptions.map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              {sub.serviceName}
                            </option>
                          ))}
                        </Select>
                        <Button type="submit" size="sm" variant="secondary">
                          Merge
                        </Button>
                      </form>
                    )}
                    <form action={rejectDetectionAction}>
                      <input type="hidden" name="id" value={detection.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        <X className="h-3.5 w-3.5" /> Not a subscription
                      </Button>
                    </form>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section id="catalog" className="scroll-mt-24">
        <div className="mb-3">
          <h2 className="text-[16px] font-semibold">Catalog</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Reference pricing only. Add an offer to a bundle to prepare a coordinated checkout plan.
          </p>
        </div>

        <Card className="mb-4 p-3">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Search providers, plans or categories"
                className="pl-9"
                aria-label="Search the catalog"
              />
            </div>
            <Select name="category" defaultValue={category ?? "all"} aria-label="Filter by category" className="w-auto min-w-44">
              <option value="all">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select name="type" defaultValue={type ?? "all"} aria-label="Filter by offer type" className="w-auto min-w-40">
              <option value="all">All offer types</option>
              <option value="free_trial">Free trial</option>
              <option value="introductory_price">Introductory price</option>
              <option value="standard_plan">Standard plan</option>
              <option value="free_plan">Free plan</option>
            </Select>
            <Button type="submit" variant="secondary">
              <Filter className="h-3.5 w-3.5" /> Apply
            </Button>
          </form>
        </Card>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="No offers match these filters"
            description="Try a different search term or category. The catalog contains reference listings only; it never invents a promotion."
            action={
              <Button asChild variant="outline">
                <Link href="/discover">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((offer) => {
              const isWatched = subscriptions.some((sub) => sub.providerId === offer.providerId);
              return (
                <Card key={offer.id} className="flex flex-col p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <ProviderAvatar provider={offer.provider} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-[14px] font-semibold">{offer.provider.name}</p>
                        {isWatched && <Badge variant="muted">You use this</Badge>}
                      </div>
                      <p className="text-[11.5px] text-muted-foreground">{offer.provider.category}</p>
                    </div>
                    <VerificationBadge status={offer.verificationStatus} showDot={false} />
                  </div>

                  <p className="mt-3 text-[13px] font-medium leading-snug">{offer.title}</p>
                  <p className="mt-1 line-clamp-3 text-[11.5px] leading-relaxed text-muted-foreground">
                    {offer.description}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{offerTypeLabels[offer.offerType] ?? offer.offerType}</Badge>
                    {offer.trialDurationDays !== null && (
                      <Badge variant="info">
                        <CalendarClock className="h-3 w-3" /> {offer.trialDurationDays}-day trial
                      </Badge>
                    )}
                    {!offer.paymentMethodRequired && <Badge variant="success">No card required</Badge>}
                    {offer.isStudent && <Badge variant="accent">Student</Badge>}
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[12px]">
                    <div>
                      <dt className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Trial / upfront</dt>
                      <dd className="mt-0.5 font-medium">
                        {offer.initialPrice ? (
                          <MoneyString amount={offer.initialPrice} currency={offer.initialCurrency} />
                        ) : (
                          "None listed"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Renews at</dt>
                      <dd className="mt-0.5 font-medium">
                        <MoneyString amount={offer.renewalPrice} currency={offer.renewalCurrency} />
                        <span className="text-[10.5px] text-muted-foreground"> / {offer.billingFrequency}</span>
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
                    Available in {offer.countryAvailability.join(", ") || "selected regions"} ·{" "}
                    {offer.paymentMethodRequired ? "payment method required" : "no payment method required"} ·{" "}
                    {offer.lastVerifiedAt
                      ? `last checked ${formatDate(offer.lastVerifiedAt.toISOString().slice(0, 10))}`
                      : "never checked"}
                  </p>

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    <form action={addBundleItemAction}>
                      <input type="hidden" name="offerId" value={offer.id} />
                      <input type="hidden" name="returnTo" value="/discover" />
                      <Button type="submit" size="sm">
                        <Plus className="h-3.5 w-3.5" /> Add to bundle
                      </Button>
                    </form>
                    <Button asChild size="sm" variant="outline">
                      <a href={offer.registrationUrl} target="_blank" rel="noreferrer noopener">
                        Provider <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </Button>
                    <a
                      href={offer.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <ShieldQuestion className="h-3 w-3" /> Source
                    </a>
                  </div>

                  <form action={markOfferCheckedAction} className="mt-2">
                    <input type="hidden" name="offerId" value={offer.id} />
                    <input type="hidden" name="returnTo" value="/discover" />
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

      <Card id="verification" className="mt-8 scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4 text-info" /> How verification works
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 text-[12px] leading-relaxed text-muted-foreground sm:grid-cols-2">
          <p>
            <strong className="text-foreground">Unverified</strong> means the listing came from public reference data and
            has not been re-checked. Treat price, trial length and eligibility as indicative.
          </p>
          <p>
            <strong className="text-foreground">Recently checked</strong> means a signed-in user reported checking the
            provider page. It is self-reported evidence, not an independent audit.
          </p>
          <p>
            <strong className="text-foreground">Verified</strong> would mean a confirmed feed or manual verification
            recorded with a timestamp. No listing is marked verified unless that evidence exists.
          </p>
          <p>
            <strong className="text-foreground">Expired</strong> means the promotion is no longer considered active and
            should not be used for savings estimates.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
