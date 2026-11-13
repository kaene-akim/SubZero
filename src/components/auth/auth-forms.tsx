"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import {
  forgotPasswordAction,
  loginAction,
  registerAction,
  resetPasswordAction,
  verifyEmailAction,
  type AuthFormState,
} from "@/app/actions/auth";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

const initial: AuthFormState = {};

function Submit({ label, pending, icon }: { label: string; pending: boolean; icon?: React.ReactNode }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {pending ? "Working…" : label}
    </Button>
  );
}

function DevLink({ href }: { href?: string }) {
  if (!href) return null;
  return (
    <Alert tone="neutral" title="Development link">
      Email delivery is not configured. Use this one-time link:{" "}
      <Link href={href} className="font-medium text-primary underline underline-offset-2 break-all">
        {href}
      </Link>
    </Alert>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  return (
    <div>
      <h1 className="display text-3xl">Welcome back</h1>
      <p className="mt-2 text-sm text-muted-foreground">Sign in to review renewals and pick up where you left off.</p>
      <form action={formAction} className="mt-7 space-y-4">
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email?.[0]}>
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
        </Field>
        <Field label="Password" htmlFor="password" error={state.fieldErrors?.password?.[0]}>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-[13px] font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Submit label="Sign in" pending={pending} icon={<ArrowRight className="h-4 w-4" />} />
      </form>
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        New to SubZero?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initial);
  return (
    <div>
      <h1 className="display text-3xl">Create your account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Start with an honest inventory of what you pay for. No card details, no provider passwords.
      </p>
      <form action={formAction} className="mt-7 space-y-4">
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <Field label="Name" htmlFor="name" error={state.fieldErrors?.name?.[0]}>
          <Input id="name" name="name" autoComplete="name" placeholder="Alex Morgan" required />
        </Field>
        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email?.[0]}>
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 10 characters" error={state.fieldErrors?.password?.[0]}>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </Field>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Passwords are hashed with scrypt. Sessions use an httpOnly cookie; SubZero never stores your bank or
          provider password.
        </p>
        <Submit label="Create account" pending={pending} icon={<ArrowRight className="h-4 w-4" />} />
      </form>
      {state.ok && state.devLink && (
        <div className="mt-4">
          <DevLink href={state.devLink} />
        </div>
      )}
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initial);
  return (
    <div>
      <h1 className="display text-3xl">Reset your password</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter your email and we will send a single-use reset link if an account exists.
      </p>
      <form action={formAction} className="mt-7 space-y-4">
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {state.ok && state.message && (
          <Alert tone="success" title="Request received">
            {state.message}
          </Alert>
        )}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
        </Field>
        <Submit label="Send reset link" pending={pending} icon={<MailCheck className="h-4 w-4" />} />
      </form>
      {state.devLink && (
        <div className="mt-4">
          <DevLink href={state.devLink} />
        </div>
      )}
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initial);
  return (
    <div>
      <h1 className="display text-3xl">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted-foreground">This link can be used once and expires after an hour.</p>
      <form action={formAction} className="mt-7 space-y-4">
        <input type="hidden" name="token" value={token} />
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
        <Field label="New password" htmlFor="password" hint="At least 10 characters">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </Field>
        <Submit label="Update password" pending={pending} />
      </form>
      {state.ok && (
        <p className="mt-5 text-center text-[13px]">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Continue to sign in
          </Link>
        </p>
      )}
    </div>
  );
}

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(verifyEmailAction, initial);
  const hasToken = token.length > 0;
  return (
    <div>
      <h1 className="display text-3xl">Verify your email</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Confirming your email secures account recovery and unlocks connected integrations.
      </p>
      <form action={formAction} className="mt-7 space-y-4">
        <input type="hidden" name="token" value={token} />
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
        {hasToken ? (
          <Submit label="Verify email" pending={pending} />
        ) : (
          <Alert tone="warning" title="No verification token">
            Open the link from your verification email, or request a new one from Settings.
          </Alert>
        )}
      </form>
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        <Link href="/overview" className="font-medium text-primary hover:underline">
          Go to your workspace
        </Link>
      </p>
    </div>
  );
}
