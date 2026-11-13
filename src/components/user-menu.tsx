"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { cn, initials } from "@/lib/utils";

export function UserMenu({
  name,
  email,
  verified,
}: {
  name: string;
  email: string;
  verified: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl border border-transparent p-1 pr-2 transition-colors hover:border-border hover:bg-muted"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-soft text-[12px] font-semibold text-primary">
          {initials(name)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-32 truncate text-[13px] font-medium leading-tight">{name}</span>
          <span className="block max-w-32 truncate text-[11px] leading-tight text-muted-foreground">{email}</span>
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lift animate-fade"
        >
          <div className="px-3 py-2">
            <p className="truncate text-[13px] font-medium">{name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{email}</p>
            <p className={cn("mt-1 inline-flex items-center gap-1 text-[11px]", verified ? "text-success" : "text-warning")}>
              <ShieldCheck className="h-3 w-3" />
              {verified ? "Email verified" : "Email not verified"}
            </p>
          </div>
          <div className="my-1 h-px bg-border" />
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Settings className="h-4 w-4" /> Settings
          </Link>
          <Link
            href="/settings#data"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <UserRound className="h-4 w-4" /> Account & data
          </Link>
          <div className="my-1 h-px bg-border" />
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-danger hover:bg-danger-soft disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
