import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user) redirect("/overview");

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="hero-glow absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative">
          <Logo className="text-primary-foreground [&_span]:text-primary-foreground" />
        </div>
        <div className="relative max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-foreground/60">
            Subscription control
          </p>
          <h1 className="display mt-4 text-4xl leading-[1.1] text-primary-foreground">
            Every renewal, trial and price rise — in one calm view.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-primary-foreground/75">
            SubZero discovers what you pay for, coordinates free trials around your billing date, and shows
            exactly what a saving is worth before you act.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-primary-foreground/15 pt-6">
            {[
              ["37", "reference providers"],
              ["8", "connected systems"],
              ["0", "passwords shared"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="tabular text-2xl font-semibold text-primary-foreground">{value}</dt>
                <dd className="mt-1 text-[11px] leading-tight text-primary-foreground/60">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="relative text-[11px] leading-relaxed text-primary-foreground/55">
          Catalog prices are reference data and marked unverified until confirmed with the provider. SubZero
          never claims a subscription, trial or saving that it cannot evidence.
        </p>
      </aside>

      <main className="flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 lg:hidden">
          <Logo />
          <Link href="/" className="text-[13px] text-muted-foreground hover:text-foreground">
            Home
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[400px] animate-rise">{children}</div>
        </div>
        <footer className="px-5 pb-6 text-center text-[11px] text-muted-foreground">
          By continuing you agree that SubZero is a coordination tool, not a party to your provider contracts.
        </footer>
      </main>
    </div>
  );
}
