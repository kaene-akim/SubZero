import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronRight,
  Gift,
  LogOut,
  Percent,
  Settings,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { unreadNotificationCount } from "@/lib/data/queries";
import { logoutAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "More" };

export default async function MorePage() {
  const user = await requireUser();
  const unread = await unreadNotificationCount(user.id);

  const items = [
    { href: "/trials", label: "Free trials", description: "Track conversions and plan trial timing.", icon: Gift },
    { href: "/discounts", label: "Discounts", description: "Eligible offers and estimated savings.", icon: Percent },
    { href: "/calendar", label: "Calendar", description: "Renewals and trial ends by month.", icon: CalendarDays },
    { href: "/analytics", label: "Analytics", description: "Forecasts, spend and findings.", icon: BarChart3 },
    {
      href: "/notifications",
      label: "Notifications",
      description: "Reminders generated from your records.",
      icon: Bell,
      badge: unread > 0 ? unread : undefined,
    },
    { href: "/settings", label: "Settings", description: "Profile, integrations, export and deletion.", icon: Settings },
  ];

  return (
    <>
      <PageHeader
        eyebrow="More"
        title="Everything else"
        description="The mobile menu keeps the five most-used areas close. These sections are one tap away."
      />

      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/60 sm:px-5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[13.5px] font-medium">
                      {item.label}
                      {item.badge ? <Badge variant="danger">{item.badge}</Badge> : null}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{item.description}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-[13px] font-semibold text-primary">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="truncate text-[11.5px] text-muted-foreground">{user.email}</p>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </form>
        </div>
      </Card>

      <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
        SubZero records what you tell it and what public catalog pages state. It does not act with providers on your
        behalf or guarantee any price, trial, activation or cancellation.
      </p>
    </>
  );
}
