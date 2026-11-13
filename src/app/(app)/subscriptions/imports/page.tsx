import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, Banknote, CircleAlert, Link2, Plus, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ServerActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { MoneyString } from "@/components/ui/money";
import { Select } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { connectedAccounts, transactionRecords } from "@/lib/db/schema";
import { listSubscriptions } from "@/lib/data/queries";
import { formatDate } from "@/lib/dates";
import {
  createSubscriptionFromTransactionAction,
  dismissTransactionAction,
  importBankTransactionsAction,
  matchTransactionAction,
} from "@/app/actions/integrations";

export const metadata: Metadata = { title: "Imports" };

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; error?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const db = await getDb();
  const [transactions, subscriptions, accounts] = await Promise.all([
    db
      .select()
      .from(transactionRecords)
      .where(eq(transactionRecords.userId, user.id))
      .orderBy(desc(transactionRecords.transactionDate))
      .limit(200),
    listSubscriptions(user.id),
    db.select().from(connectedAccounts).where(eq(connectedAccounts.userId, user.id)),
  ]);

  const bankAccount = accounts.find((a) => a.provider === "truelayer");
  const mock = transactions.some((t) => t.source === "mock_bank");
  const suggestions = transactions.filter(
    (t) => t.isRecurring && t.matchingStatus === "unmatched",
  );
  const activeSubscriptions = subscriptions.filter((s) => !["cancelled", "expired"].includes(s.status));

  return (
    <>
      <PageHeader
        eyebrow="Discovery"
        title="Imports and matching"
        description="Recurring bank charges are suggestions, never subscriptions. You decide what to create, link or ignore."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/subscriptions">Back to inventory</Link>
            </Button>
            {bankAccount && (
              <ServerActionButton
                action={importBankTransactionsAction}
                label="Sync transactions"
                pendingLabel="Syncing…"
                icon={<Upload className="h-3.5 w-3.5" />}
                size="sm"
              />
            )}
          </>
        }
      />

      {query.updated === "matched" && (
        <Alert tone="success" className="mb-4">Transaction linked to a subscription.</Alert>
      )}
      {query.updated === "dismissed" && (
        <Alert tone="info" className="mb-4">Transaction ignored. It will stay out of suggestions.</Alert>
      )}
      {query.error && (
        <Alert tone="danger" className="mb-4">That transaction could not be found in your account.</Alert>
      )}

      {!bankAccount ? (
        <EmptyState
          icon={Banknote}
          title="No bank feed connected"
          description="Connect a bank feed in Settings to import transactions. Open Banking requires commercial provider credentials; in development an explicitly labelled synthetic feed may be available."
          action={
            <Button asChild>
              <Link href="/settings#integrations">Go to integrations</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {mock && (
            <Alert tone="warning" title="Synthetic bank data">
              This workspace is using the mock bank feed. Every imported row is labelled <strong>mock_bank</strong> and
              does not represent a real account. Do not use it to make financial decisions.
            </Alert>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>Recurring suggestions</CardTitle>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Heuristic matches based on repeated amounts and intervals. Amounts and dates can be wrong.
                  </p>
                </div>
                <Badge variant="muted">{suggestions.length}</Badge>
              </CardHeader>
              <CardContent className="pt-4">
                {suggestions.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border-strong bg-muted/40 px-4 py-8 text-center text-[12.5px] text-muted-foreground">
                    No recurring patterns detected yet. Sync more transactions or add subscriptions manually.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {suggestions.map((tx) => (
                      <li key={tx.id} className="rounded-xl border border-border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-[13px] font-medium">{tx.merchantName}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatDate(tx.transactionDate)} · {tx.frequencyGuess ?? "irregular"} ·{" "}
                              {tx.source === "mock_bank" ? "synthetic" : tx.source}
                            </p>
                          </div>
                          <MoneyString amount={tx.amount} currency={tx.currency} className="text-[13px] font-semibold" />
                        </div>
                        <div className="mt-3 flex flex-wrap items-end gap-2">
                          <form action={createSubscriptionFromTransactionAction} className="flex items-end gap-2">
                            <input type="hidden" name="transactionId" value={tx.id} />
                            <Button type="submit" size="sm">
                              <Plus className="h-3.5 w-3.5" /> Create subscription
                            </Button>
                          </form>
                          {activeSubscriptions.length > 0 && (
                            <form action={matchTransactionAction} className="flex items-end gap-2">
                              <input type="hidden" name="transactionId" value={tx.id} />
                              <Select name="subscriptionId" aria-label="Match to subscription" className="h-8 w-auto min-w-40 text-[12px]">
                                <option value="">Link to…</option>
                                {activeSubscriptions.map((sub) => (
                                  <option key={sub.id} value={sub.id}>
                                    {sub.serviceName}
                                  </option>
                                ))}
                              </Select>
                              <Button type="submit" size="sm" variant="secondary">
                                <Link2 className="h-3.5 w-3.5" /> Link
                              </Button>
                            </form>
                          )}
                          <form action={dismissTransactionAction}>
                            <input type="hidden" name="transactionId" value={tx.id} />
                            <Button type="submit" size="sm" variant="ghost">
                              <Trash2 className="h-3.5 w-3.5" /> Ignore
                            </Button>
                          </form>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>How matching works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4 text-[12px] leading-relaxed text-muted-foreground">
                <p>
                  A transaction is suggested when the same merchant has at least two charges with a stable amount and a
                  regular interval (weekly, fortnightly, monthly, quarterly or annual).
                </p>
                <p>
                  <strong className="text-foreground">Creating a subscription</strong> copies the observed amount and
                  guesses the next date from the interval. You must confirm the details.
                </p>
                <p>
                  <strong className="text-foreground">Linking</strong> attaches the charge to an existing record without
                  changing its price or dates.
                </p>
                <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5">
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  SubZero cannot tell whether a charge is a subscription, a bill or a repeat purchase. The decision is
                  always yours.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle>All imported transactions</CardTitle>
              <p className="text-[12px] text-muted-foreground">
                {transactions.length} row{transactions.length === 1 ? "" : "s"} from{" "}
                {bankAccount.accountLabel ?? bankAccount.provider}.
              </p>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[12.5px]">
                <thead className="border-y border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Merchant</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 font-medium">Pattern</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDate(tx.transactionDate)}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{tx.merchantName}</p>
                        {tx.merchantReference && (
                          <p className="text-[10.5px] text-muted-foreground">{tx.merchantReference}</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <MoneyString amount={tx.amount} currency={tx.currency} />
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {tx.isRecurring ? tx.frequencyGuess ?? "recurring" : "one-off"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={
                            tx.matchingStatus === "matched"
                              ? "success"
                              : tx.matchingStatus === "ignored"
                                ? "muted"
                                : "warning"
                          }
                        >
                          {tx.matchingStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline">{tx.source}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Imported transactions are retained only in your workspace and are included in your data export. Deleting your
            account removes them.{" "}
            <Link href="/settings#data" className="text-primary hover:underline">
              Manage your data
            </Link>
            .
          </p>
        </div>
      )}
    </>
  );
}
