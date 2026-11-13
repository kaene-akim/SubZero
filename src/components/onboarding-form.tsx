"use client";

import { useActionState, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { completeOnboardingAction, type SettingsFormState } from "@/app/actions/settings";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const initial: SettingsFormState = {};

const categories = [
  "Artificial Intelligence",
  "Software and Productivity",
  "Entertainment and Streaming",
  "Education",
  "Cloud Storage",
  "Gaming",
  "Fitness",
  "News and Publications",
  "Finance",
  "Other Services",
];

const timezones = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
  "Asia/Singapore",
  "Asia/Tokyo",
  "UTC",
];

export function OnboardingForm({
  defaults,
}: {
  defaults: {
    name: string;
    country: string;
    timezone: string;
    preferredCurrency: string;
    monthlyBudget: string;
    preferredBillingDay: number;
    preferredBillingFrequency: string;
    studentEligible: boolean;
    interestedCategories: string[];
    notifyEmail: boolean;
    notifyInApp: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState(completeOnboardingAction, initial);
  const [step, setStep] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(defaults.interestedCategories);

  const steps = ["About you", "Money", "Alerts"];

  function toggleCategory(category: string) {
    setSelectedCategories((current) =>
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category],
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <ol className="flex items-center gap-2" aria-label="Onboarding progress">
        {steps.map((label, index) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition-colors",
                index < step
                  ? "bg-primary text-primary-foreground"
                  : index === step
                    ? "bg-primary-soft text-primary ring-1 ring-primary/30"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span className={cn("hidden text-[12px] font-medium sm:block", index === step ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
            {index < steps.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <div className={cn("space-y-4", step !== 0 && "hidden")}>
        <Field label="Your name" htmlFor="name" error={state.fieldErrors?.name?.[0]}>
          <Input id="name" name="name" defaultValue={defaults.name} autoComplete="name" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Country" htmlFor="country" hint="ISO country code">
            <Input id="country" name="country" defaultValue={defaults.country} maxLength={2} required />
          </Field>
          <Field label="Time zone" htmlFor="timezone">
            <Select id="timezone" name="timezone" defaultValue={defaults.timezone}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/50 px-3.5 py-3">
          <Checkbox id="studentEligible" name="studentEligible" defaultChecked={defaults.studentEligible} />
          <label htmlFor="studentEligible" className="text-[12.5px] leading-relaxed text-muted-foreground">
            I may be eligible for student pricing. This only affects which discounts are suggested — you still verify
            eligibility with each provider.
          </label>
        </div>
      </div>

      <div className={cn("space-y-4", step !== 1 && "hidden")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reporting currency" htmlFor="preferredCurrency" hint="Used for totals only">
            <Select id="preferredCurrency" name="preferredCurrency" defaultValue={defaults.preferredCurrency}>
              {["GBP", "EUR", "USD", "CAD", "AUD", "CHF", "SEK", "JPY"].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Monthly budget" htmlFor="monthlyBudget" hint="Optional">
            <Input
              id="monthlyBudget"
              name="monthlyBudget"
              inputMode="decimal"
              placeholder="e.g. 80"
              defaultValue={defaults.monthlyBudget}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred billing day" htmlFor="preferredBillingDay" hint="1–28">
            <Select id="preferredBillingDay" name="preferredBillingDay" defaultValue={String(defaults.preferredBillingDay)}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Preferred frequency" htmlFor="preferredBillingFrequency">
            <Select
              id="preferredBillingFrequency"
              name="preferredBillingFrequency"
              defaultValue={defaults.preferredBillingFrequency}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="semiannual">Every six months</option>
              <option value="annual">Annual</option>
            </Select>
          </Field>
        </div>
        <div>
          <p className="text-[13px] font-medium">Categories you care about</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Used to order discovery suggestions. Nothing is filtered out permanently.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((category) => {
              const selected = selectedCategories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCategory(category)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors",
                    selected
                      ? "border-primary/30 bg-primary-soft text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
                  )}
                >
                  {category}
                </button>
              );
            })}
          </div>
          {selectedCategories.map((category) => (
            <input key={category} type="hidden" name="interestedCategories" value={category} />
          ))}
        </div>
      </div>

      <div className={cn("space-y-4", step !== 2 && "hidden")}>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[13px] font-semibold">Renewal and trial alerts</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
            In-app alerts are always available. Email delivery requires the server to have an email provider
            configured; SubZero never claims an email was sent when it was not.
          </p>
          <div className="mt-4 space-y-3">
            <label className="flex items-center justify-between gap-3 text-[13px]">
              <span>
                In-app notifications
                <span className="mt-0.5 block text-[11px] text-muted-foreground">Reminders appear in your inbox here.</span>
              </span>
              <Checkbox name="notifyInApp" defaultChecked={defaults.notifyInApp} />
            </label>
            <label className="flex items-center justify-between gap-3 text-[13px]">
              <span>
                Email notifications
                <span className="mt-0.5 block text-[11px] text-muted-foreground">Sent only if an email provider is configured.</span>
              </span>
              <Checkbox name="notifyEmail" defaultChecked={defaults.notifyEmail} />
            </label>
          </div>
        </div>
        <Alert tone="neutral" title="What happens next">
          You start with an empty, honest inventory. Add subscriptions manually, review catalog suggestions, or connect
          an inbox. No subscription, trial or saving is created without evidence and your confirmation.
        </Alert>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {step < 2 ? (
          <Button type="button" onClick={() => setStep((s) => Math.min(2, s + 1))}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {pending ? "Setting up…" : "Enter SubZero"}
          </Button>
        )}
      </div>
    </form>
  );
}
