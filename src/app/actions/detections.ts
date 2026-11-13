"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailDetections } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { confirmDetection, mergeDetection, rejectDetection } from "@/lib/gmail/service";

export async function confirmDetectionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const result = await confirmDetection(user, id);
  revalidatePath("/discover");
  revalidatePath("/subscriptions");
  revalidatePath("/overview");
  redirect(`/discover?detection=${result.ok ? "confirmed" : "error"}&message=${encodeURIComponent(result.message)}`);
}

export async function rejectDetectionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const result = await rejectDetection(user, id);
  revalidatePath("/discover");
  redirect(`/discover?detection=${result.ok ? "rejected" : "error"}&message=${encodeURIComponent(result.message)}`);
}

export async function mergeDetectionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const result = await mergeDetection(user, id, subscriptionId);
  revalidatePath("/discover");
  redirect(`/discover?detection=${result.ok ? "merged" : "error"}&message=${encodeURIComponent(result.message)}`);
}

export async function dismissAllDetectionsAction(): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  await db
    .update(emailDetections)
    .set({ reviewStatus: "rejected", reviewedAt: new Date() })
    .where(and(eq(emailDetections.userId, user.id), eq(emailDetections.reviewStatus, "pending")));
  revalidatePath("/discover");
  redirect("/discover?detection=rejected&message=All%20pending%20detections%20were%20dismissed.");
}
