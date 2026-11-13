import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/auth-forms";
import { safeNextPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return <LoginForm next={safeNextPath(params.next)} />;
}
