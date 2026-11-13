import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubscriptionForm } from "@/components/subscription-form";
import { requireUser } from "@/lib/auth/session";
import { getSubscription, listCatalogProviders } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Edit subscription" };

export default async function EditSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const [subscription, providers] = await Promise.all([
    getSubscription(user.id, id),
    listCatalogProviders(),
  ]);
  if (!subscription) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Edit record"
        title={subscription.serviceName}
        description="Changes update your own record and the price history used for increase detection. They do not contact the provider."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href={`/subscriptions/${subscription.id}`}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
          </Button>
        }
      />
      <Card className="p-5 sm:p-7">
        <SubscriptionForm
          mode="edit"
          providers={providers.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            managementUrl: p.managementUrl,
            cancellationUrl: p.cancellationUrl,
          }))}
          defaults={{
            id: subscription.id,
            serviceName: subscription.serviceName,
            providerId: subscription.providerId ?? "",
            category: subscription.category,
            price: subscription.price ?? "",
            currency: subscription.currency,
            billingFrequency: subscription.billingFrequency,
            status: subscription.status,
            startDate: subscription.startDate ?? "",
            nextBillingDate: subscription.nextBillingDate ?? "",
            trialStartDate: subscription.trialStartDate ?? "",
            trialEndDate: subscription.trialEndDate ?? "",
            renewalPrice: subscription.renewalPrice ?? "",
            renewalCurrency: subscription.renewalCurrency,
            autoRenew: subscription.autoRenew,
            managementUrl: subscription.managementUrl ?? "",
            cancellationUrl: subscription.cancellationUrl ?? "",
            cancellationInstructions: subscription.cancellationInstructions ?? "",
            notes: subscription.notes ?? "",
          }}
        />
      </Card>
    </>
  );
}
