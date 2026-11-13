"use client";

import { useActionState } from "react";
import {
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Landmark,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import {
  connectMockBankAction,
  connectSandboxInboxAction,
  disconnectGmailAction,
  importBankTransactionsAction,
  syncGmailAction,
  type IntegrationState,
} from "@/app/actions/integrations";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const initial: IntegrationState = {};

export function GmailIntegrationPanel({
  connected,
  accountLabel,
  lastSyncAt,
  googleConfigured,
  mockEnabled,
}: {
  connected: boolean;
  accountLabel: string | null;
  lastSyncAt: string | null;
  googleConfigured: boolean;
  mockEnabled: boolean;
}) {
  const [sandboxState, sandboxAction, sandboxPending] = useActionState(connectSandboxInboxAction, initial);
  const [syncState, syncAction, syncPending] = useActionState(syncGmailAction, initial);
  const [disconnectState, disconnectAction, disconnectPending] = useActionState(disconnectGmailAction, initial);

  const state = sandboxState.error || sandboxState.ok ? sandboxState : syncState.error || syncState.ok ? syncState : disconnectState;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Mail className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
            Gmail subscription detection
            {connected ? (
              <Badge variant="success">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="muted">Not connected</Badge>
            )}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
            {connected
              ? `${accountLabel ?? "Connected inbox"}${lastSyncAt ? ` · last synced ${lastSyncAt}` : " · never synced"}`
              : "Read-only access to renewal, receipt and trial emails. Nothing is added without your confirmation."}
          </p>
        </div>
      </div>

      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}

      {connected ? (
        <div className="flex flex-wrap items-center gap-2">
          <form action={syncAction}>
            <Button type="submit" size="sm" disabled={syncPending}>
              {syncPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {syncPending ? "Syncing…" : "Sync now"}
            </Button>
          </form>
          <form action={disconnectAction}>
            <Button type="submit" size="sm" variant="outline" disabled={disconnectPending}>
              {disconnectPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
              {disconnectPending ? "Disconnecting…" : "Disconnect"}
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {googleConfigured ? (
            <Button asChild size="sm">
              <a href="/api/integrations/gmail/start">
                Connect Gmail <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : (
            <Button type="button" size="sm" disabled title="Google OAuth credentials are not configured on this server">
              Connect Gmail
            </Button>
          )}
          {mockEnabled && (
            <form action={sandboxAction}>
              <Button type="submit" size="sm" variant="outline" disabled={sandboxPending}>
                {sandboxPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {sandboxPending ? "Connecting…" : "Use sandbox inbox"}
              </Button>
            </form>
          )}
        </div>
      )}

      {!googleConfigured && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Real Gmail OAuth is not configured: set <code className="font-mono">GOOGLE_CLIENT_ID</code> and{" "}
          <code className="font-mono">GOOGLE_CLIENT_SECRET</code>.{" "}
          {mockEnabled
            ? "The sandbox inbox below is explicitly synthetic and never reads real email."
            : "No mock inbox is enabled either, so email detection is unavailable on this server."}
        </p>
      )}
    </div>
  );
}

export function BankIntegrationPanel({
  connected,
  accountLabel,
  lastSyncAt,
  bankConfigured,
  mockEnabled,
  pendingTransactions,
}: {
  connected: boolean;
  accountLabel: string | null;
  lastSyncAt: string | null;
  bankConfigured: boolean;
  mockEnabled: boolean;
  pendingTransactions: number;
}) {
  const [mockState, mockAction, mockPending] = useActionState(connectMockBankAction, initial);
  const [importState, importAction, importPending] = useActionState(importBankTransactionsAction, initial);
  const state = mockState.error || mockState.ok ? mockState : importState;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Landmark className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
            Bank feed (Open Banking)
            {connected ? (
              <Badge variant="success">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="muted">Not connected</Badge>
            )}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
            {connected
              ? `${accountLabel ?? "Connected account"}${lastSyncAt ? ` · last imported ${lastSyncAt}` : " · never imported"}`
              : "Read-only transaction access. Recurring charges are suggestions; subscriptions are never created automatically."}
          </p>
        </div>
      </div>

      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        {connected ? (
          <form action={importAction}>
            <Button type="submit" size="sm" disabled={importPending}>
              {importPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {importPending ? "Importing…" : "Import transactions"}
            </Button>
          </form>
        ) : bankConfigured ? (
          <Button asChild size="sm">
            <a href="/api/integrations/bank/start">
              Connect bank <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        ) : (
          <Button type="button" size="sm" disabled title="Open Banking credentials are not configured on this server">
            Connect bank
          </Button>
        )}

        {!connected && mockEnabled && (
          <form action={mockAction}>
            <Button type="submit" size="sm" variant="outline" disabled={mockPending}>
              {mockPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="h-3.5 w-3.5" />}
              {mockPending ? "Connecting…" : "Use synthetic feed"}
            </Button>
          </form>
        )}

        {connected && (
          <Button asChild size="sm" variant="outline">
            <a href="/subscriptions/imports">
              Review {pendingTransactions > 0 ? `${pendingTransactions} ` : ""}imports
            </a>
          </Button>
        )}
      </div>

      {!bankConfigured && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Real Open Banking is not configured: set <code className="font-mono">TRUELAYER_CLIENT_ID</code> and{" "}
          <code className="font-mono">TRUELAYER_CLIENT_SECRET</code>.{" "}
          {mockEnabled
            ? "The synthetic feed is clearly labelled and never represents a real account."
            : "No synthetic feed is enabled either, so bank import is unavailable on this server."}
        </p>
      )}
    </div>
  );
}
