import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  info: {
    wrap: "border-info/25 bg-info-soft text-info",
    icon: Info,
  },
  success: {
    wrap: "border-success/25 bg-success-soft text-success",
    icon: CheckCircle2,
  },
  warning: {
    wrap: "border-warning/30 bg-warning-soft text-warning",
    icon: AlertTriangle,
  },
  danger: {
    wrap: "border-danger/30 bg-danger-soft text-danger",
    icon: ShieldAlert,
  },
  neutral: {
    wrap: "border-border bg-muted text-muted-foreground",
    icon: Sparkles,
  },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const config = tones[tone];
  const Icon = config.icon;
  return (
    <div className={cn("flex gap-3 rounded-xl border p-3.5 text-[13px] leading-relaxed", config.wrap, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-foreground/80")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-card/50 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-[15px] font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "primary" | "warning" | "success" | "danger";
  className?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    primary: "text-primary",
    warning: "text-warning",
    success: "text-success",
    danger: "text-danger",
  }[tone];
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        {Icon && (
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <p className={cn("tabular mt-3 text-2xl font-semibold tracking-tight sm:text-[26px]", toneClass)}>{value}</p>
      {sub && <div className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{sub}</div>}
    </div>
  );
}
