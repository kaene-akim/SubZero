"use client";

import { useActionState, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  createSubscriptionAction,
  updateSubscriptionAction,
  type SubscriptionFormState,
} from "@/app/actions/subscriptions";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";

const initial: SubscriptionFormState = {};

type ProviderOption = {
  id: string;
  name: string;
  category: string;
  managementUrl: string | null;
  cancellationUrl: string | null;
};

export type SubscriptionDefaults = {
  id?: string;
  serviceName: string;
  providerId: string;
  category: string;
  price: string;
  currency: string;
  billingFrequency: string;
  status: string;
  startDate: string;
  nextBillingDate: string;
  trialStartDate: string;
  trialEndDate: string;
  renewalPrice: string;
  renewalCurrency: string;
  autoRenew: boolean;
  managementUrl: string;
  cancellationUrl: string;
  cancellationInstructions: string;
  notes: string;
};

export function SubscriptionForm({
  mode,
  providers,
  defaults,
}: {
  mode: "create" | "edit";
  providers: ProviderOption[];
  defaults: SubscriptionDefaults;
}) {
  const action = mode === "edit" ? updateSubscriptionAction : createSubscriptionAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const [status, setStatus] = useState(defaults.status);
  const [providerId, setProviderId] = useState(defaults.providerId);
  const provider = providers.find((p) => p.id === providerId);

  return (
    <form action={formAction} className="space-y-6">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}

      <section className="space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold">Service</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Link a catalog provider to inherit its cancellation and management links. The catalog price is reference
            data; the price you enter is your own record.
          </p>
        </div>
        <Field label="Service name" htmlFor="serviceName" error={state.fieldErrors?.serviceName?.[0]}>
          <Input
            id="serviceName"
            name="serviceName"
            defaultValue={defaults.serviceName}
            placeholder="e.g. Netflix Standard"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Catalog provider" htmlFor="providerId" hint="Optional">
            <Select
              id="providerId"
              name="providerId"
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
            >
              <option value="">Not linked</option>
              {providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category" htmlFor="category" hint="Defaults from provider">
            <Input
              id="category"
              name="category"
              defaultValue={provider?.category ?? defaults.category}
              key={provider?.category ?? defaults.category}
              placeholder="Other Services"
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-[15px] font-semibold">Price and cadence</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Enter the amount actually charged, in its original currency. SubZero keeps that currency for the record.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current price" htmlFor="price" hint="Optional if unknown">
            <Input id="price" name="price" inputMode="decimal" defaultValue={defaults.price} placeholder="10.99" />
          </Field>
          <Field label="Currency" htmlFor="currency">
            <Select id="currency" name="currency" defaultValue={defaults.currency}>
              {["GBP", "EUR", "USD", "CAD", "AUD", "CHF", "SEK", "JPY"].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Billing frequency" htmlFor="billingFrequency">
            <Select id="billingFrequency" name="billingFrequency" defaultValue={defaults.billingFrequency}>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="semiannual">Every six months</option>
              <option value="annual">Annual</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Renewal price" htmlFor="renewalPrice" hint="If different from current">
            <Input id="renewalPrice" name="renewalPrice" inputMode="decimal" defaultValue={defaults.renewalPrice} placeholder="12.99" />
          </Field>
          <Field label="Renewal currency" htmlFor="renewalCurrency">
            <Select id="renewalCurrency" name="renewalCurrency" defaultValue={defaults.renewalCurrency}>
              {["GBP", "EUR", "USD", "CAD", "AUD", "CHF", "SEK", "JPY"].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
          <Checkbox name="autoRenew" defaultChecked={defaults.autoRenew} className="mt-0.5" />
          <span className="text-[12.5px] leading-relaxed text-muted-foreground">
            This subscription renews automatically. SubZero uses this only for forecasting and reminders — it cannot
            cancel or renew with the provider.
          </span>
        </label>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-[15px] font-semibold">Dates and status</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Dates are calendar dates in {defaults.currency ? "your account" : "your account"} time zone. A trial needs
            an end date so the renewal can be surfaced before it converts.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status" htmlFor="status">
            <Select
              id="status"
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="active">Active</option>
              <option value="trial">Free trial</option>
              <option value="paused">Paused</option>
              <option value="pending_cancellation">Cancellation pending</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
              <option value="payment_failed">Payment failed</option>
            </Select>
          </Field>
          <Field label="Start date" htmlFor="startDate" error={state.fieldErrors?.startDate?.[0]}>
            <Input id="startDate" name="startDate" type="date" defaultValue={defaults.startDate} />
          </Field>
        </div>
        {status === "trial" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Trial start" htmlFor="trialStartDate">
              <Input id="trialStartDate" name="trialStartDate" type="date" defaultValue={defaults.trialStartDate} />
            </Field>
            <Field label="Trial end" htmlFor="trialEndDate" error={state.fieldErrors?.trialEndDate?.[0]}>
              <Input id="trialEndDate" name="trialEndDate" type="date" defaultValue={defaults.trialEndDate} required />
            </Field>
          </div>
        ) : (
          <Field label="Next billing date" htmlFor="nextBillingDate" hint="Used for reminders and forecasts">
            <Input id="nextBillingDate" name="nextBillingDate" type="date" defaultValue={defaults.nextBillingDate} />
          </Field>
        )}
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-[15px] font-semibold">Managing and cancelling</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            SubZero stores links and instructions. Cancellation always happens with the provider or their official
            process.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Management URL" htmlFor="managementUrl">
            <Input
              id="managementUrl"
              name="managementUrl"
              type="url"
              defaultValue={defaults.managementUrl || provider?.managementUrl || ""}
              key={provider?.managementUrl ?? defaults.managementUrl}
              placeholder="https://"
            />
          </Field>
          <Field label="Cancellation URL" htmlFor="cancellationUrl">
            <Input
              id="cancellationUrl"
              name="cancellationUrl"
              type="url"
              defaultValue={defaults.cancellationUrl || provider?.cancellationUrl || ""}
              key={provider?.cancellationUrl ?? defaults.cancellationUrl}
              placeholder="https://"
            />
          </Field>
        </div>
        <Field label="Cancellation instructions" htmlFor="cancellationInstructions">
          <Textarea
            id="cancellationInstructions"
            name="cancellationInstructions"
            defaultValue={defaults.cancellationInstructions}
            placeholder="Where to click, what to expect, notice periods…"
          />
        </Field>
        <Field label="Private notes" htmlFor="notes">
          <Textarea id="notes" name="notes" defaultValue={defaults.notes} placeholder="Anything you want to remember" />
        </Field>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="max-w-md text-[11px] leading-relaxed text-muted-foreground">
          Saving this form records your own entry. It does not change anything with the provider.
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {pending ? "Saving…" : mode === "edit" ? "Save changes" : "Add subscription"}
        </Button>
      </div>
    </form>
  );
}
