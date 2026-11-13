import { Badge, Dot } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const verification = {
  verified: { label: "Verified", variant: "success" as const },
  recently_checked: { label: "Recently checked", variant: "info" as const },
  unverified: { label: "Unverified", variant: "warning" as const },
  expired: { label: "Expired", variant: "danger" as const },
};

export function VerificationBadge({
  status,
  className,
  showDot = true,
}: {
  status: keyof typeof verification;
  className?: string;
  showDot?: boolean;
}) {
  const config = verification[status] ?? verification.unverified;
  return (
    <Badge variant={config.variant} className={className} title={verificationTitle(status)}>
      {showDot && <Dot />}
      {config.label}
    </Badge>
  );
}

function verificationTitle(status: keyof typeof verification) {
  switch (status) {
    case "verified":
      return "Confirmed against the provider by SubZero or a partner feed.";
    case "recently_checked":
      return "The listing was checked recently but pricing may still change.";
    case "expired":
      return "This promotion is no longer considered active.";
    default:
      return "Imported reference data. Confirm price, eligibility and renewal terms with the provider.";
  }
}

const subscriptionStatuses: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" | "muted" | "info" }> = {
  active: { label: "Active", variant: "success" },
  trial: { label: "Free trial", variant: "info" },
  paused: { label: "Paused", variant: "muted" },
  pending_cancellation: { label: "Cancellation pending", variant: "warning" },
  cancelled: { label: "Cancelled", variant: "muted" },
  expired: { label: "Expired", variant: "muted" },
  payment_failed: { label: "Payment failed", variant: "danger" },
};

export function SubscriptionStatusBadge({ status, className }: { status: string; className?: string }) {
  const config = subscriptionStatuses[status] ?? { label: status.replace(/_/g, " "), variant: "muted" as const };
  return (
    <Badge variant={config.variant} className={className}>
      <Dot />
      {config.label}
    </Badge>
  );
}

const activationStatuses: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" | "muted" | "info" }> = {
  awaiting_activation: { label: "Awaiting activation", variant: "muted" },
  scheduled: { label: "Scheduled", variant: "info" },
  ready_for_checkout: { label: "Ready for checkout", variant: "default" },
  awaiting_user_action: { label: "Awaiting your action", variant: "warning" },
  processing: { label: "Processing", variant: "info" },
  activated: { label: "Activated", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
  requires_attention: { label: "Requires attention", variant: "danger" },
  cannot_synchronize: { label: "Cannot synchronise", variant: "warning" },
  cancelled: { label: "Cancelled", variant: "muted" },
};

export function ActivationStatusBadge({ status, className }: { status: string; className?: string }) {
  const config = activationStatuses[status] ?? { label: status.replace(/_/g, " "), variant: "muted" as const };
  return (
    <Badge variant={config.variant} className={className}>
      <Dot />
      {config.label}
    </Badge>
  );
}

export function StatusText({ children, tone = "muted", className }: { children: React.ReactNode; tone?: "muted" | "success" | "warning" | "danger" | "primary"; className?: string }) {
  const toneClass = {
    muted: "text-muted-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    primary: "text-primary",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", toneClass, className)}>{children}</span>;
}
