import type { Metadata } from "next";
import { VerifyEmailForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; pending?: string }>;
}) {
  const { token } = await searchParams;
  return <VerifyEmailForm token={token ?? ""} />;
}
