import type { Metadata } from "next";
import Link from "next/link";
import {
  Bell,
  BellRing,
  CalendarClock,
  Check,
  CheckCheck,
  CircleAlert,
  Info,
  Package,
  Percent,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth/session";
import { listNotifications } from "@/lib/data/queries";
import { formatDateTime } from "@/lib/dates";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/notifications";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

const typeConfig: Record<string, { icon: typeof Bell; label: string; tone: string }> = {
  renewal_reminder: { icon: CalendarClock, label: "Renewal", tone: "text-info" },
  trial_ending: { icon: CalendarClock, label: "Trial ending", tone: "text-warning" },
  price_increase: { icon: Percent, label: "Price change", tone: "text-danger" },
  bundle_scheduled: { icon: Package, label: "Bundle", tone: "text-primary" },
  discount_found: { icon: Sparkles, label: "Discount", tone: "text-success" },
  payment_failed: { icon: CircleAlert, label: "Payment", tone: "text-danger" },
  detection_ready: { icon: Info, label: "Detection", tone: "text-info" },
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await listNotifications(user.id, 100);
  const unread = notifications.filter((item) => !item.readAt && item.status === "sent");
  const read = notifications.filter((item) => item.readAt || item.status !== "sent");

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description={
          <>
            Reminders generated from your own records. In-app delivery always works; email and push depend on server
            credentials and are never claimed unless actually sent.
          </>
        }
        actions={
          unread.length > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <Button type="submit" variant="outline" size="sm">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </Button>
            </form>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Unread</p>
          <p className="tabular mt-1.5 text-2xl font-semibold">{unread.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Total</p>
          <p className="tabular mt-1.5 text-2xl font-semibold">{notifications.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Delivery</p>
          <p className="mt-1.5 text-[13px] font-medium">In-app</p>
          <p className="text-[10.5px] text-muted-foreground">
            {notifications.some((item) => item.channels.includes("email")) ? "Email requested where configured" : "Email off"}
          </p>
        </Card>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="No notifications yet"
          description="Renewal and trial reminders appear here once you add dated subscriptions. Change how far ahead reminders fire in Settings."
          action={
            <Button asChild>
              <Link href="/settings#notifications">Notification settings</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {unread.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Unread
              </h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {unread.map((item) => (
                    <NotificationRow key={item.id} item={item} unread />
                  ))}
                </ul>
              </Card>
            </section>
          )}

          {read.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Earlier
              </h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {read.map((item) => (
                    <NotificationRow key={item.id} item={item} />
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Notifications are generated by the reminder job from your recorded dates. They are not proof of a provider charge.
        Check the provider before acting.
      </p>
    </>
  );
}

function NotificationRow({
  item,
  unread,
}: {
  item: Awaited<ReturnType<typeof listNotifications>>[number];
  unread?: boolean;
}) {
  const config = typeConfig[item.notificationType] ?? { icon: Bell, label: "Update", tone: "text-muted-foreground" };
  const Icon = config.icon;
  return (
    <li className={cn("flex flex-wrap items-start gap-3 px-4 py-3.5 sm:px-5", unread && "bg-primary-soft/20")}>
      <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted", config.tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("text-[13px]", unread ? "font-semibold" : "font-medium")}>{item.title}</p>
          <Badge variant="outline">{config.label}</Badge>
          {item.status === "failed" && <Badge variant="danger">Delivery failed</Badge>}
          {item.status === "pending" && <Badge variant="muted">Scheduled</Badge>}
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{item.body}</p>
        <p className="mt-1 text-[10.5px] text-muted-foreground">
          {formatDateTime(item.sentAt ?? item.scheduledAt)} · via {item.channels.join(", ").replace(/_/g, " ")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.href && (
          <Button asChild variant="ghost" size="sm">
            <Link href={item.href}>Open</Link>
          </Button>
        )}
        {unread && (
          <form action={markNotificationReadAction}>
            <input type="hidden" name="id" value={item.id} />
            <Button type="submit" variant="ghost" size="icon-sm" aria-label="Mark as read">
              <Check className="h-4 w-4" />
            </Button>
          </form>
        )}
      </div>
    </li>
  );
}
