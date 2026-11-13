"use client";

import { useActionState, useState } from "react";
import { KeyRound, Loader2, Save, Trash2 } from "lucide-react";
import {
  changePasswordAction,
  updateNotificationSettingsAction,
  updateProfileAction,
  type SettingsFormState,
} from "@/app/actions/settings";
import { deleteAccountAction } from "@/app/actions/auth";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Switch } from "@/components/ui/input";
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

export type ProfileDefaults = {
  name: string;
  email: string;
  country: string;
  timezone: string;
  preferredCurrency: string;
  monthlyBudget: string;
  preferredBillingDay: number;
  preferredBillingFrequency: string;
  studentEligible: boolean;
  interestedCategories: string[];
};

export function ProfileForm({ defaults }: { defaults: ProfileDefaults }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initial);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(defaults.interestedCategories);

  function toggleCategory(category: string) {
    setSelectedCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" error={state.fieldErrors?.name?.[0]}>
          <Input id="name" name="name" defaultValue={defaults.name} autoComplete="name" required />
        </Field>
        <Field label="Email" htmlFor="email" hint="Contact support to change">
          <Input id="email" value={defaults.email} readOnly disabled />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Country" htmlFor="country" hint="ISO code">
          <Input id="country" name="country" defaultValue={defaults.country} maxLength={2} required />
        </Field>
        <Field label="Time zone" htmlFor="timezone">
          <Select id="timezone" name="timezone" defaultValue={defaults.timezone}>
            {[...new Set([defaults.timezone, ...timezones])].map((timezone) => (
              <option key={timezone} value={timezone}>
                {timezone.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reporting currency" htmlFor="preferredCurrency">
          <Select id="preferredCurrency" name="preferredCurrency" defaultValue={defaults.preferredCurrency}>
            {["GBP", "EUR", "USD", "CAD", "AUD", "CHF", "SEK", "JPY"].map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Monthly budget" htmlFor="monthlyBudget" hint="Optional">
          <Input
            id="monthlyBudget"
            name="monthlyBudget"
            inputMode="decimal"
            defaultValue={defaults.monthlyBudget}
            placeholder="e.g. 80"
          />
        </Field>
        <Field label="Preferred billing day" htmlFor="preferredBillingDay" hint="1–28">
          <Select
            id="preferredBillingDay"
            name="preferredBillingDay"
            defaultValue={String(defaults.preferredBillingDay)}
          >
            {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
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

      <div className="rounded-xl border border-border bg-muted/40 p-3.5">
        <p className="text-[13px] font-medium">Categories you care about</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Used to order discovery suggestions. Nothing is hidden permanently.
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

      <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
        <span>
          <span className="block text-[13px] font-medium">Student eligibility</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            Only affects which student discounts are shown. You still verify with each provider.
          </span>
        </span>
        <Checkbox name="studentEligible" defaultChecked={defaults.studentEligible} />
      </label>

      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}

export function NotificationSettingsForm({
  defaults,
}: {
  defaults: {
    notifyEmail: boolean;
    notifyPush: boolean;
    notifyInApp: boolean;
    trialReminderDays: number[];
    emailConfigured: boolean;
    pushConfigured: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState(updateNotificationSettingsAction, initial);
  const [emailOn, setEmailOn] = useState(defaults.notifyEmail);
  const [pushOn, setPushOn] = useState(defaults.notifyPush);
  const [inAppOn, setInAppOn] = useState(defaults.notifyInApp);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}

      <div className="space-y-2">
        <ToggleRow
          title="In-app notifications"
          description="Reminders appear in your SubZero inbox. Always available."
          checked={inAppOn}
          onChange={setInAppOn}
          name="notifyInApp"
        />
        <ToggleRow
          title="Email notifications"
          description={
            defaults.emailConfigured
              ? "Sent through the configured email provider."
              : "No email provider is configured on this server. Turning this on will not deliver email yet."
          }
          checked={emailOn}
          onChange={setEmailOn}
          name="notifyEmail"
          warning={!defaults.emailConfigured}
        />
        <ToggleRow
          title="Push notifications"
          description={
            defaults.pushConfigured
              ? "Delivered to browsers that grant permission and are subscribed below."
              : "Push is not configured on this server. You can still enable it here, but nothing will be delivered until VAPID keys are set."
          }
          checked={pushOn}
          onChange={setPushOn}
          name="notifyPush"
          warning={!defaults.pushConfigured}
        />
      </div>

      <div>
        <p className="text-[13px] font-medium">Remind me before trials end</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Choose one or more lead times, in days.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[14, 7, 3, 1, 0].map((day) => (
            <label
              key={day}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[12px]"
            >
              <Checkbox name="trialReminderDays" value={String(day)} defaultChecked={defaults.trialReminderDays.includes(day)} />
              {day === 0 ? "On the day" : `${day} day${day === 1 ? "" : "s"} before`}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {pending ? "Saving…" : "Save notifications"}
        </Button>
      </div>
    </form>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  name,
  warning,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  name: string;
  warning?: boolean;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium">{title}</span>
          {warning && (
            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning">
              Not configured
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <Switch
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 shrink-0"
      />
    </label>
  );
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Current password" htmlFor="currentPassword">
          <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" />
        </Field>
        <Field label="New password" htmlFor="newPassword" hint="At least 10 characters">
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {pending ? "Updating…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Type DELETE to confirm" htmlFor="confirmation">
        <Input id="confirmation" name="confirmation" placeholder="DELETE" autoComplete="off" required />
      </Field>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        This permanently removes your account, subscriptions, bundles, detections, connected accounts and encrypted
        tokens. Export your data first if you need a copy. It does not cancel anything with your providers.
      </p>
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        {pending ? "Deleting…" : "Delete my account permanently"}
      </Button>
    </form>
  );
}
