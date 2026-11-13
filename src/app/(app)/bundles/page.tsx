import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, Layers, Package, Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/session";
import { listBundles } from "@/lib/data/queries";
import { formatDate, todayInTimeZone } from "@/lib/dates";

export const metadata: Metadata = { title: "Bundles" };

const statusTone: Record<string, "muted" | "info" | "warning" | "success" | "danger" | "default"> = {
  draft: "muted",
  scheduled: "info",
  activating: "warning",
  completed: "success",
  partially_failed: "danger",
  cancelled: "muted",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  activating: "In progress",
  completed: "Completed",
  partially_failed: "Partially failed",
  cancelled: "Cancelled",
};

export default async function BundlesPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const bundles = await listBundles(user.id);
  const today = todayInTimeZone(user.timezone);
  const draft = bundles.find((bundle) => bundle.status === "draft");

  return (
    <>
      <PageHeader
        eyebrow="Bundles"
        title="Coordinate a set of services"
        description={
          <>
            A bundle aligns trials and renewals around one target date. It is a plan you execute with each provider, not
            an automatic activation. SubZero records what you confirm.
          </>
        }
        actions={
          <Button asChild size="sm">
            <Link href="/bundles/new">
              <Plus className="h-3.5 w-3.5" /> New bundle
            </Link>
          </Button>
        }
      />

      {params.updated === "deleted" && (
        <Alert tone="info" className="mb-4">
          Bundle deleted. Any subscriptions recorded from it remain in your inventory.
        </Alert>
      )}

      <Alert tone="info" className="mb-5" title="What a bundle can and cannot do">
        SubZero calculates when to start each trial so it ends near your target billing date, based on the trial length
        recorded in the catalog. It cannot delay a provider charge, change a billing date, or start a trial. Providers
        whose activation model cannot align are labelled unsupported rather than forced.
      </Alert>

      {bundles.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No bundles yet"
          description="Create a bundle, add offers from the catalog, then prepare an activation schedule. You can keep it as a draft until you are ready."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/bundles/new">
                  <Plus className="h-4 w-4" /> Create a bundle
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/discover">Browse offers</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {draft && (
            <Card className="border-primary/25 bg-primary-soft/40 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">You have a draft: {draft.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {draft.itemCount} item{draft.itemCount === 1 ? "" : "s"} · target{" "}
                    {draft.targetBillingDate ? formatDate(draft.targetBillingDate) : "not set"}
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link href={`/bundles/${draft.id}`}>
                    Continue <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </Card>
          )}

          {bundles.map((bundle) => (
            <Card key={bundle.id} className="p-4 transition-shadow hover:shadow-lift sm:p-5">
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <Layers className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/bundles/${bundle.id}`} className="text-[14px] font-semibold hover:underline">
                      {bundle.name}
                    </Link>
                    <Badge variant={statusTone[bundle.status] ?? "muted"}>
                      {statusLabels[bundle.status] ?? bundle.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {bundle.itemCount} item{bundle.itemCount === 1 ? "" : "s"} · {bundle.currency} ·{" "}
                    {bundle.targetBillingDate ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" /> target {formatDate(bundle.targetBillingDate)}
                        {bundle.targetBillingDate < today && bundle.status === "draft" ? " (past)" : ""}
                      </span>
                    ) : (
                      "no target date"
                    )}
                  </p>
                  {bundle.notes && (
                    <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{bundle.notes}</p>
                  )}
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/bundles/${bundle.id}`}>
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </Card>
          ))}

          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            Completed bundles stay visible for reference. Subscriptions recorded from them are managed individually in
            your inventory.
          </p>
        </div>
      )}
    </>
  );
}
