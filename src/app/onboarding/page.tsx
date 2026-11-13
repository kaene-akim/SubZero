import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { OnboardingForm } from "@/components/onboarding-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboardingCompletedAt) redirect("/overview");

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <ThemeToggle compact />
      </header>
      <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-4 sm:px-8">
        <div className="mb-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Welcome</p>
          <h1 className="display mt-2 text-3xl leading-tight sm:text-4xl">
            Let&apos;s set up an honest baseline.
          </h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
            These preferences shape totals, reminders and which discounts are worth showing you. You can change
            everything later in Settings.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-7">
          <OnboardingForm
            defaults={{
              name: user.name,
              country: user.country,
              timezone: user.timezone,
              preferredCurrency: user.preferredCurrency,
              monthlyBudget: user.monthlyBudget ?? "",
              preferredBillingDay: user.preferredBillingDay,
              preferredBillingFrequency: user.preferredBillingFrequency,
              studentEligible: user.studentEligible,
              interestedCategories: user.interestedCategories,
              notifyEmail: user.notifyEmail,
              notifyInApp: user.notifyInApp,
            }}
          />
        </div>
        <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
          SubZero coordinates your subscriptions. It does not act as a party to your provider contracts and never starts
          a paid subscription on your behalf.
        </p>
      </main>
    </div>
  );
}
