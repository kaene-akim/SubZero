"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  CalendarDays,
  Compass,
  Gift,
  LayoutDashboard,
  Layers,
  MoreHorizontal,
  Package,
  Percent,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const navItems = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/subscriptions", label: "My Subscriptions", icon: Layers },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/trials", label: "Free Trials", icon: Gift },
  { href: "/discounts", label: "Discounts", icon: Percent },
  { href: "/bundles", label: "Bundles", icon: Package },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

const mobileItems = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/subscriptions", label: "Subscriptions", icon: Layers },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/bundles", label: "Bundles", icon: Package },
  { href: "/more", label: "More", icon: MoreHorizontal },
];

function isActive(pathname: string, href: string) {
  if (href === "/overview") return pathname === "/overview";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ badges }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        const badge = badges?.[item.href];
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors",
              active
                ? "bg-primary-soft text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className={cn("h-[17px] w-[17px]", active ? "text-primary" : "text-muted-foreground/80")} />
            <span className="flex-1">{item.label}</span>
            {badge ? (
              <span className="tabular grid min-w-5 place-items-center rounded-full bg-card px-1.5 text-[11px] font-semibold text-primary ring-1 ring-border">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href) || (item.href === "/more" && ["/trials", "/discounts", "/calendar", "/analytics", "/settings", "/notifications"].some((p) => pathname.startsWith(p)));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.2]")} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function PageTitle() {
  const pathname = usePathname();
  const match = [...navItems]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isActive(pathname, item.href));
  if (match) return <span>{match.label}</span>;
  if (pathname.startsWith("/subscriptions/")) return <span>Subscription</span>;
  if (pathname.startsWith("/bundles/")) return <span>Bundle</span>;
  if (pathname.startsWith("/notifications")) return <span>Notifications</span>;
  if (pathname.startsWith("/more")) return <span>More</span>;
  return <span>SubZero</span>;
}
