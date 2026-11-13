import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Logo } from "@/components/logo";
import { MobileNav, PageTitle, SidebarNav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { unreadNotificationCount } from "@/lib/data/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await unreadNotificationCount(user.id);

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:shadow-lift"
      >
        Skip to content
      </a>

      <div className="lg:grid lg:min-h-dvh lg:grid-cols-[248px_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-card/60 px-4 py-5 lg:flex">
          <div className="px-2">
            <Logo />
          </div>
          <div className="mt-8 flex-1 overflow-y-auto">
            <SidebarNav badges={unread > 0 ? { "/notifications": unread } : undefined} />
          </div>
          <div className="mt-4 rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Data honesty
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Catalog prices are reference data. Every offer shows its verification state before you act.
            </p>
            <Link href="/discover#verification" className="mt-2 inline-block text-[11px] font-medium text-primary hover:underline">
              How verification works
            </Link>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-lg">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
              <div className="lg:hidden">
                <Logo compact />
              </div>
              <div className="hidden min-w-0 flex-1 lg:block">
                <p className="truncate text-[15px] font-semibold tracking-tight">
                  <PageTitle />
                </p>
              </div>
              <div className="flex flex-1 items-center justify-end gap-1.5 lg:flex-none">
                <Link
                  href="/discover"
                  className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground sm:flex"
                >
                  <Search className="h-3.5 w-3.5" />
                  Find a service
                </Link>
                <Link
                  href="/notifications"
                  aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                  className="relative grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Bell className="h-4 w-4" />
                  {unread > 0 && (
                    <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-semibold leading-4 text-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Link>
                <ThemeToggle compact />
                <div className="ml-1 hidden sm:block">
                  <UserMenu name={user.name} email={user.email} verified={Boolean(user.emailVerifiedAt)} />
                </div>
                <Button asChild variant="ghost" size="icon-sm" className="sm:hidden" aria-label="Settings">
                  <Link href="/settings">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-soft text-[11px] font-semibold text-primary">
                      {user.name.slice(0, 1).toUpperCase()}
                    </span>
                  </Link>
                </Button>
              </div>
            </div>
          </header>

          <main id="main" className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-16">
            {!user.emailVerifiedAt && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning-soft px-4 py-2.5 text-[12.5px] text-warning">
                <span>Your email is not verified. Some integrations stay locked until you confirm it.</span>
                <Link href="/verify-email?pending=1" className="font-semibold underline underline-offset-2">
                  Verify now
                </Link>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>

      <MobileNav />
    </div>
  );
}
