import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Info,
  Package,
  Plus,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BundleForm, BundleConsentNote, ConfirmBundleItemForm, ScheduleBundleForm } from "@/components/bundle-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Stat } from "@/components/ui/feedback";
import { Money, MoneyString } from "@/components/ui/money";
import { ProviderAvatar } from "@/components/ui/provider-avatar";
import { ActivationStatusBadge, VerificationBadge } from "@/components/ui/status";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { providerIntegrations } from "@/lib/db/schema";
import { getRateTable } from "@/lib/data/rates";
import { getBundleDetail, listOffers, listSubscriptions } from "@/lib/data/queries";
import { addDaysISO, formatDate, formatDateShort, todayInTimeZone } from "@/lib/dates";
import { toMinor, type CurrencyCode } from "@/lib/money";
import { scheduleBundle, type ScheduleItemInput } from "@/lib/engines/schedule";
import {
  addBundleItemAction,
  cancelBundleAction,
  deleteBundleAction,
  markBundleItemFailedAction,
  removeBundleItemAction,
} from "@/app/actions/bundles";

export const metadata: Metadata = { title: "Bundle" };

const bundleStatusLabels: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  activating: "In progress",
  completed: "Completed",
  partially_failed: "Partially failed",
  cancelled: "Cancelled",
};

const bundleErrorMessages: Record<string, string> = {
  "bundle-locked": "This bundle is no longer editable.",
  "checkout-failed": "Marked as not completed. You can retry with the provider at any time.",
};

const alignmentTone: Record<string, "success" | "warning" | "danger"> = {
  exact: "success",
  approximate: "warning",
  unsupported: "danger",
};

export default async function BundleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bundleAdded?: string; bundleRemoved?: string; bundleError?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const detail = await getBundleDetail(user.id, id);
  if (!detail) notFound();

  const { bundle, items } = detail;
  const today = todayInTimeZone(user.timezone);
  const [offers, subscriptions, integrationRows, rateTable] = await Promise.all([
    listOffers(),
    listSubscriptions(user.id),
    (await getDb()).select().from(providerIntegrations),
    getRateTable(bundle.currency as CurrencyCode),
  ]);

  const integrationMap = new Map(integrationRows.map((row) => [row.providerId, row]));
  const activeProviderIds = new Set(
    subscriptions
      .filter((sub) => ["active", "trial", "payment_failed", "pending_cancellation"].includes(sub.status))
      .map((sub) => sub.providerId)
      .filter((value): value is string => Boolean(value)),
  );

  const targetDate = bundle.targetBillingDate ?? addDaysISO(today, 30);
  const inputs: ScheduleItemInput[] = [];
  for (const item of items) {
    if (!item.offer || !item.provider) continue;
    inputs.push({
      offerId: item.offer.id,
      providerId: item.provider.id,
      providerName: item.provider.name,
      serviceName: item.offer.title,
      trialDurationDays: item.offer.trialDurationDays,
      renewalPriceMinor: toMinor(item.offer.renewalPrice, item.offer.renewalCurrency) ?? 0,
      currency: item.offer.renewalCurrency,
      billingFrequency: item.offer.billingFrequency,
      initialPriceMinor: toMinor(item.offer.initialPrice, item.offer.initialCurrency),
      capabilities: integrationMap.get(item.provider.id)?.capabilities ?? {},
      activationUrl: item.offer.registrationUrl,
      paymentMethodRequired: item.offer.paymentMethodRequired,
      countryAvailability: item.offer.countryAvailability,
      eligibility: item.offer.eligibility,
      cancellationRequirements: item.offer.cancellationRequirements,
      existingActiveProvider: activeProviderIds.has(item.provider.id),
    });
  }
  const preview =
    inputs.length > 0
      ? scheduleBundle({
          items: inputs,
          context: {
            now: today,
            targetBillingDate: targetDate,
            timezone: user.timezone,
            leadTimeDays: 1,
            userCountry: user.country,
          },
          rateTable,
          currency: bundle.currency as CurrencyCode,
        })
      : null;

  const includedOfferIds = new Set(items.map((item) => item.offerId).filter(Boolean));
  const availableOffers = offers.filter((offer) => !includedOfferIds.has(offer.id));
  const isDraft = bundle.status === "draft";
  const isCancelled = bundle.status === "cancelled";
  const canConfirm = ["scheduled", "ready_for_checkout", "awaiting_user_action"].includes(bundle.status);
  const activatedCount = items.filter((item) => item.activationStatus === "activated").length;

  return (
    <>
      <PageHeader
        eyebrow={`Bundle · ${bundle.currency}`}
        title={bundle.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{bundleStatusLabels[bundle.status] ?? bundle.status}</Badge>
            <span>
              {items.length} item{items.length === 1 ? "" : "s"} ·{" "}
              {bundle.targetBillingDate ? `target ${formatDate(bundle.targetBillingDate)}` : "no target date"}
            </span>
          </span>
        }
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/bundles">
                <ArrowLeft className="h-3.5 w-3.5" /> All bundles
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/discover">
                <Plus className="h-3.5 w-3.5" /> Add offers
              </Link>
            </Button>
          </>
        }
      />

      {query.bundleAdded && <Alert tone="success" className="mb-4">Offer added to the bundle.</Alert>}
      {query.bundleRemoved && <Alert tone="info" className="mb-4">Offer removed from the bundle.</Alert>}
      {query.bundleError && (
        <Alert tone="warning" className="mb-4">
          {bundleErrorMessages[query.bundleError] ?? "That action could not be completed."}
        </Alert>
      )}
      {isCancelled && (
        <Alert tone="warning" className="mb-4">
          This bundle was cancelled. It is kept for your records; create a new bundle to plan again.
        </Alert>
      )}

      {preview && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Upfront cost"
            value={<Money minor={preview.summary.immediateMinor} currency={bundle.currency} />}
            sub="Non-trial plans only"
            icon={Package}
            tone="primary"
          />
          <Stat
            label="Monthly after trials"
            value={<Money minor={preview.summary.monthlyMinor} currency={bundle.currency} />}
            sub="Converted estimate"
          />
          <Stat
            label="Annualised"
            value={<Money minor={preview.summary.annualMinor} currency={bundle.currency} />}
            sub="If prices and cadence hold"
          />
          <Stat
            label="Alignment"
            value={`${preview.summary.exactAlignmentCount}/${inputs.length}`}
            sub={`${preview.summary.approximateAlignmentCount} approximate · ${preview.summary.unsupportedAlignmentCount} unsupported`}
            icon={CalendarClock}
            tone={preview.summary.unsupportedAlignmentCount > 0 ? "warning" : "success"}
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Offers in this bundle</CardTitle>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Prices are catalog reference data. The schedule uses the trial length recorded for each offer.
                </p>
              </div>
              <Badge variant="muted">{items.length}</Badge>
            </CardHeader>
            <CardContent className="pt-4">
              {items.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="This bundle is empty"
                  description="Add offers from the catalog. You can add a trial, an introductory price or a standard plan."
                  action={
                    <Button asChild>
                      <Link href="/discover">Browse offers</Link>
                    </Button>
                  }
                  className="py-8"
                />
              ) : (
                <ul className="space-y-3">
                  {items.map((item) => {
                    const result = preview?.items.find((entry) => entry.offerId === item.offerId);
                    const scheduled = item.scheduling as
                      | { alignment?: string; explanation?: string; warnings?: string[]; activationUrl?: string }
                      | null;
                    return (
                      <li key={item.id} className="rounded-xl border border-border p-3.5">
                        <div className="flex flex-wrap items-start gap-3">
                          <ProviderAvatar provider={item.provider} name={item.offer?.title} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[13px] font-medium">{item.offer?.title ?? item.provider?.name ?? "Offer"}</p>
                              <ActivationStatusBadge status={item.activationStatus} />
                              {item.offer && <VerificationBadge status={item.offer.verificationStatus} showDot={false} />}
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {item.provider?.name ?? "Unknown provider"}
                              {item.offer?.trialDurationDays
                                ? ` · ${item.offer.trialDurationDays}-day trial`
                                : " · no trial"}
                              {item.offer ? ` · renews ${item.offer.billingFrequency}` : ""}
                            </p>
                          </div>
                          {item.offer && (
                            <div className="text-right">
                              <MoneyString
                                amount={item.offer.renewalPrice}
                                currency={item.offer.renewalCurrency}
                                className="text-[13px] font-semibold"
                              />
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">after trial</p>
                            </div>
                          )}
                        </div>

                        {isDraft && item.offer && (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
                            <p className="text-[10.5px] text-muted-foreground">
                              {item.offer.paymentMethodRequired ? "Payment method required at checkout." : "No payment method listed."}
                            </p>
                            <form action={removeBundleItemAction}>
                              <input type="hidden" name="itemId" value={item.id} />
                              <input type="hidden" name="bundleId" value={bundle.id} />
                              <Button type="submit" size="sm" variant="ghost">
                                <X className="h-3.5 w-3.5" /> Remove
                              </Button>
                            </form>
                          </div>
                        )}

                        {!isDraft && (
                          <div className="mt-3 space-y-2 border-t border-border pt-3">
                            {scheduled?.explanation && (
                              <p className="text-[11.5px] leading-relaxed text-muted-foreground">{scheduled.explanation}</p>
                            )}
                            <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
                              <div>
                                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Activate</dt>
                                <dd className="mt-0.5 font-medium">{formatDateShort(item.scheduledActivationDate)}</dd>
                              </div>
                              <div>
                                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {item.offer?.trialDurationDays ? "Trial ends" : "Next charge"}
                                </dt>
                                <dd className="mt-0.5 font-medium">{formatDateShort(item.expectedRenewalDate)}</dd>
                              </div>
                              <div>
                                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Alignment</dt>
                                <dd className="mt-0.5">
                                  {scheduled?.alignment ? (
                                    <Badge variant={alignmentTone[scheduled.alignment] ?? "muted"} className="capitalize">
                                      {scheduled.alignment}
                                    </Badge>
                                  ) : (
                                    "—"
                                  )}
                                </dd>
                              </div>
                            </dl>
                            {scheduled?.warnings && scheduled.warnings.length > 0 && (
                              <ul className="space-y-1">
                                {scheduled.warnings.map((warning) => (
                                  <li key={warning} className="flex gap-1.5 text-[10.5px] leading-relaxed text-warning">
                                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {warning}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {item.statusReason && (
                              <p className="text-[10.5px] leading-relaxed text-muted-foreground">{item.statusReason}</p>
                            )}
                            {item.lastError && (
                              <p className="rounded-lg border border-danger/25 bg-danger-soft px-2.5 py-1.5 text-[10.5px] text-danger">
                                {item.lastError}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {item.offer && (
                                <Button asChild size="sm" variant="outline">
                                  <a href={item.offer.registrationUrl} target="_blank" rel="noreferrer noopener">
                                    <ExternalLink className="h-3.5 w-3.5" /> Provider checkout
                                  </a>
                                </Button>
                              )}
                              {item.subscriptionId && (
                                <Button asChild size="sm" variant="subtle">
                                  <Link href={`/subscriptions/${item.subscriptionId}`}>Open subscription</Link>
                                </Button>
                              )}
                            </div>
                            {item.activationStatus === "activated" && (
                              <p className="flex items-center gap-1.5 text-[11px] font-medium text-success">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Recorded as activated by you
                              </p>
                            )}
                            {canConfirm &&
                              item.activationStatus !== "activated" &&
                              item.activationStatus !== "failed" && (
                                <ConfirmBundleItemForm
                                  itemId={item.id}
                                  bundleId={bundle.id}
                                  expectedRenewalDate={item.expectedRenewalDate ?? ""}
                                  isTrial={Boolean(item.offer?.trialDurationDays)}
                                />
                              )}
                            {canConfirm && item.activationStatus !== "activated" && (
                              <form action={markBundleItemFailedAction}>
                                <input type="hidden" name="itemId" value={item.id} />
                                <input type="hidden" name="bundleId" value={bundle.id} />
                                <Button type="submit" size="sm" variant="ghost">
                                  <ShieldAlert className="h-3.5 w-3.5" /> I could not complete checkout
                                </Button>
                              </form>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {isDraft && (
            <Card>
              <CardHeader>
                <CardTitle>Add an offer</CardTitle>
                <p className="text-[12px] text-muted-foreground">
                  Choose from the catalog. Adding an offer does not start anything with the provider.
                </p>
              </CardHeader>
              <CardContent className="pt-4">
                {availableOffers.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border-strong bg-muted/40 px-4 py-5 text-center text-[12px] text-muted-foreground">
                    Every catalog offer is already in this bundle.
                  </p>
                ) : (
                  <form action={addBundleItemAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="bundleId" value={bundle.id} />
                    <input type="hidden" name="returnTo" value={`/bundles/${bundle.id}`} />
                    <div className="min-w-56 flex-1">
                      <label htmlFor="offerId" className="mb-1.5 block text-[12px] font-medium">
                        Offer
                      </label>
                      <select
                        id="offerId"
                        name="offerId"
                        required
                        className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
                      >
                        <option value="">Select an offer…</option>
                        {availableOffers.map((offer) => (
                          <option key={offer.id} value={offer.id}>
                            {offer.provider.name} — {offer.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button type="submit">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {isDraft ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Bundle settings</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <BundleForm
                    mode="edit"
                    defaults={{
                      id: bundle.id,
                      name: bundle.name,
                      currency: bundle.currency,
                      targetBillingDate: bundle.targetBillingDate ?? "",
                      preferredActivationDate: bundle.preferredActivationDate ?? "",
                      notes: bundle.notes ?? "",
                    }}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Prepare the schedule</CardTitle>
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    This works backwards from your target billing date using each offer&apos;s trial length. It produces a
                    plan, not an activation.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  {preview && preview.summary.disclosure && (
                    <Alert tone="neutral">{preview.summary.disclosure}</Alert>
                  )}
                  {preview && preview.summary.unsupportedAlignmentCount > 0 && (
                    <Alert tone="warning">
                      {preview.summary.unsupportedAlignmentCount} item
                      {preview.summary.unsupportedAlignmentCount === 1 ? "" : "s"} cannot align to the target date with
                      the provider&apos;s activation model. You can still proceed; those dates are shown honestly.
                    </Alert>
                  )}
                  <ScheduleBundleForm
                    bundleId={bundle.id}
                    targetBillingDate={targetDate}
                    itemCount={items.length}
                  />
                  <BundleConsentNote />
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Plan details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 pt-4 text-[12.5px]">
                  <Row label="Status">{bundleStatusLabels[bundle.status] ?? bundle.status}</Row>
                  <Row label="Target billing date">{formatDate(bundle.targetBillingDate)}</Row>
                  <Row label="Preferred activation">{formatDate(bundle.preferredActivationDate)}</Row>
                  <Row label="Activated">{`${activatedCount} of ${items.length}`}</Row>
                  <Row label="Scheduled at">{formatDate(bundle.activationStartedAt?.toISOString().slice(0, 10))}</Row>
                  <Row label="Completed at">{formatDate(bundle.completedAt?.toISOString().slice(0, 10))}</Row>
                  {bundle.notes && (
                    <div className="rounded-xl border border-border bg-muted/40 p-3 text-[11.5px] leading-relaxed text-muted-foreground">
                      {bundle.notes}
                    </div>
                  )}
                </CardContent>
              </Card>

              {preview && (
                <Card>
                  <CardHeader>
                    <CardTitle>What happens next</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-4 text-[12px] leading-relaxed text-muted-foreground">
                    <p>
                      Complete each provider checkout using the links above. Return here and record the actual renewal
                      date once you have it.
                    </p>
                    <p>
                      {preview.summary.earliestCancellationDeadline
                        ? `The earliest cancellation deadline in this plan is ${formatDate(preview.summary.earliestCancellationDeadline)}. Diarise it — SubZero cannot cancel for you.`
                        : "No cancellation deadline can be derived for this plan. Check each provider's terms directly."}
                    </p>
                    {preview.summary.unconvertedCurrencies.length > 0 && (
                      <p className="text-warning">
                        Some prices could not be converted to {bundle.currency}:{" "}
                        {preview.summary.unconvertedCurrencies.join(", ")}.
                      </p>
                    )}
                    <p className="flex items-start gap-1.5">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Provider capabilities are recorded honestly. Where a provider cannot delay activation or change a
                      billing date, the plan says so instead of pretending.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {!isCancelled && bundle.status !== "completed" && (
            <Card className="border-danger/20">
              <CardHeader>
                <CardTitle className="text-[13px] text-danger">Stop this plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-3">
                <form action={cancelBundleAction}>
                  <input type="hidden" name="id" value={bundle.id} />
                  <Button type="submit" variant="outline" size="sm" className="w-full">
                    Cancel bundle
                  </Button>
                </form>
                <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                  Cancelling the bundle does not cancel any subscription or trial you started with a provider.
                </p>
              </CardContent>
            </Card>
          )}

          <details className="rounded-2xl border border-danger/25 bg-danger-soft/30 p-4">
            <summary className="flex items-center gap-2 text-[12.5px] font-medium text-danger">
              <Trash2 className="h-3.5 w-3.5" /> Delete bundle
            </summary>
            <div className="mt-3 space-y-2">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Deleting removes the bundle and its plan. Subscriptions already recorded from it remain in your
                inventory.
              </p>
              <form action={deleteBundleAction}>
                <input type="hidden" name="id" value={bundle.id} />
                <Button type="submit" variant="danger" size="sm">
                  Delete permanently
                </Button>
              </form>
            </div>
          </details>

          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/discover">
              Browse more offers <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
        SubZero is not a party to your provider contracts. It does not charge your payment method, start a trial or
        change a provider billing date. All dates are derived from the trial lengths and prices in the catalog and your
        own records.
      </p>
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
