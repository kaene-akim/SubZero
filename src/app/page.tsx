import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Compass,
  Layers,
  Lock,
  Percent,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Own your subscriptions",
};

const systems = [
  {
    icon: Compass,
    title: "Discovery",
    body: "Find subscriptions and trials across your inbox and bank feed — with every detection shown for review before it becomes a record.",
  },
  {
    icon: CalendarClock,
    title: "Coordination",
    body: "Line trials up with the billing date you choose, and see honestly where a provider's activation model cannot align.",
  },
  {
    icon: Layers,
    title: "Bundles",
    body: "Plan a set of services together. SubZero prepares the schedule and walks you through each provider's official checkout.",
  },
  {
    icon: Percent,
    title: "Discounts",
    body: "Compare eligible promotions against what you already pay, with verification state and trade-offs on every offer.",
  },
  {
    icon: BarChart3,
    title: "Forecasting",
    body: "See the next 30, 90 and 365 days of charges, split by category and currency, with actual and estimated savings kept apart.",
  },
  {
    icon: ShieldCheck,
    title: "Control",
    body: "Export or delete everything. Encrypted credentials, scoped sessions, audit logs and no provider passwords.",
  },
];

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/overview");
  const { deleted } = await searchParams;

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-1.5">
          <ThemeToggle compact />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">
              Get started <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      {deleted && (
        <div className="mx-auto max-w-6xl px-5 pt-2 sm:px-8">
          <Alert tone="success" title="Account deleted">
            Your sessions have ended and SubZero removed your records. Anything you pay a provider is unaffected — cancel
            directly with the provider if needed.
          </Alert>
        </div>
      )}

      <main>
        <section className="relative overflow-hidden">
          <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-16">
            <div className="max-w-3xl">
              <Badge variant="outline" className="mb-5 gap-2 bg-card/70 backdrop-blur">
                <Sparkles className="h-3 w-3 text-accent" />
                Subscription control, without the guesswork
              </Badge>
              <h1 className="display text-[38px] leading-[1.05] sm:text-[60px]">
                Every renewal, trial and price rise — in one calm view.
              </h1>
              <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-[17px]">
                SubZero discovers what you actually pay for, coordinates free trials around your billing date, and
                shows exactly what a saving is worth before you act. No fabricated offers. No invented savings. No
                provider passwords.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link href="/register">
                    Create your workspace <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
              <p className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                You can export or delete all of your data at any time.
              </p>
            </div>

            <div className="mt-14 grid gap-3 sm:grid-cols-3">
              {[
                ["37", "reference providers", "Prices compiled from public pricing pages and marked unverified until checked."],
                ["3", "forecast horizons", "30, 90 and 365 days, with original currencies preserved."],
                ["0", "provider passwords", "Connections use OAuth or Open Banking consent, never your login."],
              ].map(([value, label, note]) => (
                <Card key={label} className="p-5">
                  <p className="tabular text-3xl font-semibold tracking-tight text-primary">{value}</p>
                  <p className="mt-1 text-[13px] font-medium">{label}</p>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{note}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card/50">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Eight connected systems
            </p>
            <h2 className="display mt-3 max-w-2xl text-3xl leading-tight sm:text-4xl">
              Built around evidence, not optimistic assumptions.
            </h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {systems.map((system) => {
                const Icon = system.icon;
                return (
                  <Card key={system.title} className="p-5 transition-shadow hover:shadow-lift">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <h3 className="mt-4 text-[15px] font-semibold">{system.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{system.body}</p>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="display text-3xl leading-tight sm:text-4xl">Honest by design.</h2>
              <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
                Subscription tools are easy to make look clever by inventing numbers. SubZero does the opposite: it
                labels reference data, distinguishes estimated from confirmed savings, and tells you when an
                integration is unavailable instead of pretending.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Catalog prices are reference data with a source link and verification badge.",
                  "Trial scheduling is a plan for you to execute at each provider — never an automatic activation.",
                  "Bank and inbox imports never create subscriptions without your confirmation.",
                  "Savings are shown as estimated unless an offer is verified and usable.",
                ].map((item) => (
                  <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span className="text-foreground/85">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Card className="p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                A typical week
              </p>
              <div className="mt-4 space-y-3">
                {[
                  ["Mon", "Spotify trial ends in 3 days", "warning"],
                  ["Wed", "Adobe price rose from £19.99 to £22.99", "danger"],
                  ["Fri", "Netflix renews — £10.99", "info"],
                  ["Sun", "Bundle target date reached — 4 checkouts ready", "success"],
                ].map(([day, text, tone]) => (
                  <div key={text} className="flex items-center gap-3 rounded-xl border border-border bg-card-elevated px-3.5 py-3">
                    <span className="tabular grid h-8 w-8 place-items-center rounded-lg bg-muted text-[11px] font-semibold text-muted-foreground">
                      {day}
                    </span>
                    <span className="flex-1 text-[13px]">{text}</span>
                    <span
                      className={
                        tone === "danger"
                          ? "h-2 w-2 rounded-full bg-danger"
                          : tone === "warning"
                            ? "h-2 w-2 rounded-full bg-warning"
                            : tone === "success"
                              ? "h-2 w-2 rounded-full bg-success"
                              : "h-2 w-2 rounded-full bg-info"
                      }
                      aria-hidden="true"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                Illustrative events. Your workspace shows only evidence from your own records and connected accounts.
              </p>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-[11.5px] text-muted-foreground">
          <p>© {new Date().getFullYear()} SubZero. A coordination tool, not a party to your provider contracts.</p>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <Link href="/register" className="hover:text-foreground">Create account</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
