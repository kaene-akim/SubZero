import { cn } from "@/lib/utils";
import { formatMoney, formatMoneyString } from "@/lib/money";

/** Money rendered from minor units. Never use for estimated savings without a label. */
export function Money({
  minor,
  currency = "GBP",
  className,
  locale,
}: {
  minor: number | null | undefined;
  currency?: string;
  className?: string;
  locale?: string;
}) {
  return (
    <span className={cn("tabular", className)}>{formatMoney(minor, currency, locale)}</span>
  );
}

/** Money stored as a numeric string in the database. */
export function MoneyString({
  amount,
  currency = "GBP",
  className,
  locale,
}: {
  amount: string | number | null | undefined;
  currency?: string;
  className?: string;
  locale?: string;
}) {
  return (
    <span className={cn("tabular", className)}>
      {formatMoneyString(amount, currency, locale)}
    </span>
  );
}

export function CurrencyBadge({ currency }: { currency: string }) {
  return (
    <span className="tabular rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
      {currency.toUpperCase()}
    </span>
  );
}
