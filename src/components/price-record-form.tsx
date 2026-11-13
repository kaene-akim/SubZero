"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { recordPriceAction, type SubscriptionFormState } from "@/app/actions/subscriptions";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";

const initial: SubscriptionFormState = {};

export function PriceRecordForm({
  id,
  currency,
  frequency,
  currentPrice,
}: {
  id: string;
  currency: string;
  frequency: string;
  currentPrice: string;
}) {
  const [state, formAction, pending] = useActionState(recordPriceAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[1fr_110px_150px_auto] sm:items-end">
        <Field label="Observed price" htmlFor="price">
          <Input
            id="price"
            name="price"
            inputMode="decimal"
            defaultValue={currentPrice}
            placeholder="12.99"
            required
          />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Select id="currency" name="currency" defaultValue={currency}>
            {["GBP", "EUR", "USD", "CAD", "AUD", "CHF", "SEK", "JPY"].map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Frequency" htmlFor="billingFrequency">
          <Select id="billingFrequency" name="billingFrequency" defaultValue={frequency}>
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="semiannual">Every six months</option>
            <option value="annual">Annual</option>
          </Select>
        </Field>
        <Button type="submit" disabled={pending} className="sm:mb-0">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {pending ? "Saving…" : "Record"}
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        This adds a timestamped observation to your price history. It is self-reported and used for price-increase
        detection; it is not a provider-verified price.
      </p>
    </form>
  );
}
