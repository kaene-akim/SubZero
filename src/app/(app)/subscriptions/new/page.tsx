import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubscriptionForm } from "@/components/subscription-form";
import { requireUser } from "@/lib/auth/session";
import { listCatalogProviders } from "@/lib/data/queries";
import { todayInTimeZone } from "@/lib/dates";

export const metadata: Metadata = { title: "Add subscription" };

export default async function NewSubscriptionPage() {
  const user = await requireUser();
  const providers = await listCatalogProviders();
  const today = todayInTimeZone(user.timezone);

  return (
    <>
      <PageHeader
        eyebrow="New record"
        title="Add a subscription"
        description="Record a service you already pay for. Nothing is sent to the provider and no payment is taken."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/subscriptions">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
          </Button>
        }
      />
      <Card className="p-5 sm:p-7">
        <SubscriptionForm
          mode="create"
          providers={providers.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            managementUrl: p.managementUrl,
            cancellationUrl: p.cancellationUrl,
          }))}
          defaults={{
            serviceName: "",
            providerId: "",
            category: "",
            price: "",
            currency: user.preferredCurrency,
            billingFrequency: user.preferredBillingFrequency,
            status: "active",
            startDate: "",
            nextBillingDate: today,
            trialStartDate: "",
            trialEndDate: "",
            renewalPrice: "",
            renewalCurrency: user.preferredCurrency,
            autoRenew: true,
            managementUrl: "",
            cancellationUrl: "",
            cancellationInstructions: "",
            notes: "",
          }}
        />
      </Card>
    </>
  );
}
