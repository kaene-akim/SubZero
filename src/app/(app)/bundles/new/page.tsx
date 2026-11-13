import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BundleForm } from "@/components/bundle-forms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { todayInTimeZone } from "@/lib/dates";

export const metadata: Metadata = { title: "New bundle" };

export default async function NewBundlePage() {
  const user = await requireUser();
  const today = todayInTimeZone(user.timezone);

  return (
    <>
      <PageHeader
        eyebrow="New bundle"
        title="Plan a coordinated set of services"
        description="Name the bundle and set a target billing date. You will add offers and prepare the schedule next."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/bundles">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
          </Button>
        }
      />
      <Card className="p-5 sm:p-7">
        <BundleForm
          mode="create"
          defaults={{
            name: "",
            currency: user.preferredCurrency,
            targetBillingDate: "",
            preferredActivationDate: today,
            notes: "",
          }}
        />
      </Card>
    </>
  );
}
