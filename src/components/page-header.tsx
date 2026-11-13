import { cn } from "@/lib/utils";

/**
 * Consistent page heading. Every operational page states what the data does and
 * does not represent, so a number is never presented without its provenance.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-col gap-4 sm:mb-8", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h1 className="display text-[26px] leading-tight sm:text-[32px]">{title}</h1>
          {description && (
            <div className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
              {description}
            </div>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function SubNav({
  items,
  active,
  className,
}: {
  items: Array<{ href: string; label: string; count?: number }>;
  active: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Section"
      className={cn(
        "mb-5 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 shadow-card",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.href === active;
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium transition-colors",
              isActive
                ? "bg-primary-soft text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
            {typeof item.count === "number" && (
              <span className="tabular rounded-full bg-card px-1.5 text-[10.5px] font-semibold ring-1 ring-border">
                {item.count}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}
