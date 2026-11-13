import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("h-8 w-8", className)}>
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path
        d="M21.5 11.4c-1.2-1.1-2.9-1.8-4.8-1.8-2.8 0-4.6 1.2-4.6 3.1 0 1.8 1.5 2.6 4.2 3.1 3.6.7 5.5 2 5.5 4.6 0 2.9-2.5 4.8-6.3 4.8-2.4 0-4.6-.8-6.1-2.3"
        stroke="var(--primary-foreground)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="13" stroke="var(--primary-foreground)" strokeOpacity="0.18" strokeWidth="1" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="SubZero home"
      className={cn("inline-flex items-center gap-2.5 text-primary", className)}
    >
      <LogoMark className="h-8 w-8" />
      {!compact && (
        <span className="display text-[19px] text-foreground">
          Sub<span className="text-primary">Zero</span>
        </span>
      )}
    </Link>
  );
}
