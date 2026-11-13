"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/feedback";
import { Button, type ButtonProps } from "@/components/ui/button";

type State = { ok?: boolean; message?: string; error?: string };

/**
 * Runs a server action that uses the (prevState, formData) signature and shows
 * its honest result. The action decides what is actually possible; this button
 * never implies success before the server confirms it.
 */
export function ServerActionButton({
  action,
  label,
  pendingLabel = "Working…",
  icon,
  variant = "primary",
  size = "md",
  className,
  confirmText,
  showResult = true,
}: {
  action: (state: State, formData: FormData) => Promise<State>;
  label: string;
  pendingLabel?: string;
  icon?: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  confirmText?: string;
  showResult?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className={className}>
      <form
        action={formAction}
        onSubmit={(event) => {
          if (confirmText && !window.confirm(confirmText)) event.preventDefault();
        }}
      >
        <Button type="submit" variant={variant} size={size} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
          {pending ? pendingLabel : label}
        </Button>
      </form>
      {showResult && state.error && (
        <Alert tone="danger" className="mt-3">
          {state.error}
        </Alert>
      )}
      {showResult && state.ok && state.message && (
        <Alert tone="success" className="mt-3">
          {state.message}
        </Alert>
      )}
      {showResult && !state.ok && state.message && !state.error && (
        <Alert tone="warning" className="mt-3">
          {state.message}
        </Alert>
      )}
    </div>
  );
}
