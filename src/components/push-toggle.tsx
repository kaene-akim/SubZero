"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff, Loader2, ShieldAlert } from "lucide-react";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }
  return output;
}

export function PushToggle({
  configured,
  publicKey,
  initiallySubscribed,
}: {
  configured: boolean;
  publicKey: string | null;
  initiallySubscribed: boolean;
}) {
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(initiallySubscribed);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    navigator.serviceWorker
      .getRegistration("/sw.js")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        if (subscription) setSubscribed(true);
      })
      .catch(() => {
        // No registration yet; the server value remains authoritative.
      });
  }, []);

  async function enable() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("This browser does not support push notifications.");
      }
      if (!publicKey) {
        throw new Error("Push is not configured on this server: no VAPID public key is available.");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notification permission was not granted. Change it in your browser settings.");
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = subscription.toJSON();
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The subscription could not be saved.");
      setSubscribed(true);
      setMessage("Push subscription saved. Delivery still depends on the server's VAPID configuration.");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage("Push subscription removed from this browser and from SubZero.");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12.5px]">
          {subscribed ? (
            <span className="inline-flex items-center gap-1.5 text-success">
              <BellRing className="h-3.5 w-3.5" /> This browser is subscribed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <BellOff className="h-3.5 w-3.5" /> This browser is not subscribed
            </span>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant={subscribed ? "outline" : "primary"}
          onClick={subscribed ? disable : enable}
          disabled={pending || !supported}
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Working…" : subscribed ? "Disable push" : "Enable push"}
        </Button>
      </div>

      {!supported && (
        <Alert tone="warning">
          Push notifications are not supported in this browser. In-app notifications and email (when configured) still
          work.
        </Alert>
      )}
      {!configured && (
        <Alert tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            VAPID keys are not configured on this server, so no push can be delivered. The subscription is stored so it
            works once keys are added.
          </span>
        </Alert>
      )}
      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
