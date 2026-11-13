"use client";

import { useActionState } from "react";
import { CalendarClock, CheckCircle2, Loader2, Save, ShieldCheck } from "lucide-react";
import {
  confirmBundleItemAction,
  createBundleAction,
  scheduleBundleAction,
  updateBundleAction,
  type BundleFormState,
} from "@/app/actions/bundles";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";

const initial: BundleFormState = {};

export type BundleDefaults = {
  id?: string;
  name: string;
  currency: string;
  targetBillingDate: string;
  preferredActivationDate: string;
  notes: string;
};

export function BundleForm({ mode, defaults }: { mode: "create" | "edit"; defaults: BundleDefaults }) {
  const action = mode === "edit" ? updateBundleAction : createBundleAction;
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-5">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Field label="Bundle name" htmlFor="name" error={state.fieldErrors?.name?.[0]}>
          <Input id="name" name="name" defaultValue={defaults.name} placeholder="e.g. Work tools" required />
        </Field>
        <Field label="Reporting currency" htmlFor="currency">
          <Select id="currency" name="currency" defaultValue={defaults.currency}>
            {["GBP", "EUR", "USD", "CAD", "AUD", "CHF", "SEK", "JPY"].map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Target billing date"
          htmlFor="targetBillingDate"
          hint="Optional"
          error={state.fieldErrors?.targetBillingDate?.[0]}
        >
          <Input
            id="targetBillingDate"
            name="targetBillingDate"
            type="date"
            defaultValue={defaults.targetBillingDate}
          />
        </Field>
        <Field label="Preferred activation date" htmlFor="preferredActivationDate" hint="Optional">
          <Input
            id="preferredActivationDate"
            name="preferredActivationDate"
            type="date"
            defaultValue={defaults.preferredActivationDate}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes" hint="Optional, private">
        <Textarea id="notes" name="notes" defaultValue={defaults.notes} placeholder="What this bundle is for" />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="max-w-md text-[11px] leading-relaxed text-muted-foreground">
          A bundle is a plan. SubZero does not start trials or paid plans with providers; it prepares the timing and
          records what you confirm.
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {pending ? "Saving…" : mode === "edit" ? "Save bundle" : "Create bundle"}
        </Button>
      </div>
    </form>
  );
}

export function ScheduleBundleForm({
  bundleId,
  targetBillingDate,
  itemCount,
  disabled,
}: {
  bundleId: string;
  targetBillingDate: string;
  itemCount: number;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(scheduleBundleAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={bundleId} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}

      <Field label="Target billing date" htmlFor="targetBillingDate" hint="Used to work backwards">
        <Input
          id="targetBillingDate"
          name="targetBillingDate"
          type="date"
          defaultValue={targetBillingDate}
          disabled={disabled}
        />
      </Field>

      <label className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft/60 px-3.5 py-3">
        <Checkbox name="consent" value="on" className="mt-0.5" required disabled={disabled} />
        <span className="text-[11.5px] leading-relaxed text-muted-foreground">
          I understand SubZero cannot start provider trials, change a provider&apos;s billing date, or guarantee the
          renewal date. I will complete each provider&apos;s official checkout myself and confirm what happened.
        </span>
      </label>

      <Button type="submit" disabled={pending || disabled || itemCount === 0} className="w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
        {pending ? "Preparing schedule…" : "Prepare activation schedule"}
      </Button>
      {itemCount === 0 && (
        <p className="text-center text-[11px] text-muted-foreground">Add at least one offer to schedule this bundle.</p>
      )}
    </form>
  );
}

export function ConfirmBundleItemForm({
  itemId,
  bundleId,
  expectedRenewalDate,
  isTrial,
}: {
  itemId: string;
  bundleId: string;
  expectedRenewalDate: string;
  isTrial: boolean;
}) {
  const [state, formAction, pending] = useActionState(confirmBundleItemAction, initial);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-muted/30 p-3.5">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="bundleId" value={bundleId} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}

      <Field
        label={isTrial ? "Actual trial end date" : "Actual next billing date"}
        htmlFor={`actualRenewalDate-${itemId}`}
        hint="Use the provider's date"
      >
        <Input
          id={`actualRenewalDate-${itemId}`}
          name="actualRenewalDate"
          type="date"
          defaultValue={expectedRenewalDate}
        />
      </Field>

      <label className="flex items-start gap-2.5">
        <Checkbox name="confirmation" value="on" className="mt-0.5" required />
        <span className="text-[11px] leading-relaxed text-muted-foreground">
          I completed the provider&apos;s official checkout and want SubZero to record this subscription. I understand
          this is my confirmation, not a provider-verified activation.
        </span>
      </label>

      <Button type="submit" size="sm" disabled={pending} className="w-full">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        {pending ? "Recording…" : "Record activation"}
      </Button>
    </form>
  );
}

export function BundleConsentNote() {
  return (
    <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
      SubZero prepares a plan and records your confirmations. It never performs a provider checkout, starts a trial or
      charges a payment method on your behalf.
    </p>
  );
}
