"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  deleteUserAccount,
  loginUser,
  registerUser,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  verifyEmailToken,
  type AuthResult,
} from "@/lib/auth/service";
import {
  clearSessionCookie,
  getRequestMeta,
  getSessionUser,
  revokeCurrentSession,
} from "@/lib/auth/session";

export type AuthFormState = {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  devLink?: string;
  redirectTo?: string;
  ok?: boolean;
};

function fromResult(result: AuthResult): AuthFormState {
  if (result.ok) {
    return { ok: true, message: result.message, devLink: result.devLink, redirectTo: result.redirectTo };
  }
  return { error: result.error, fieldErrors: result.fieldErrors, ok: false };
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const meta = await getRequestMeta();
  const result = await registerUser({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    ip: meta.ipHash ?? "unknown",
  });
  return fromResult(result);
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const meta = await getRequestMeta();
  const result = await loginUser({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    ip: meta.ipHash ?? "unknown",
  });
  if (result.ok && result.redirectTo) {
    redirect(result.redirectTo);
  }
  return fromResult(result);
}

export async function forgotPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const meta = await getRequestMeta();
  const result = await requestPasswordReset({
    email: String(formData.get("email") ?? ""),
    ip: meta.ipHash ?? "unknown",
  });
  return fromResult(result);
}

export async function resetPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const meta = await getRequestMeta();
  const result = await resetPassword({
    token: String(formData.get("token") ?? ""),
    password: String(formData.get("password") ?? ""),
    ip: meta.ipHash ?? "unknown",
  });
  return fromResult(result);
}

export async function verifyEmailAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const result = await verifyEmailToken(String(formData.get("token") ?? ""));
  revalidatePath("/overview");
  return fromResult(result);
}

export async function resendVerificationAction(): Promise<AuthFormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to resend the verification email." };
  const result = await resendVerificationEmail(user.id);
  return fromResult(result);
}

export async function logoutAction(): Promise<void> {
  await revokeCurrentSession();
  redirect("/login");
}

export async function deleteAccountAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to delete your account." };
  const result = await deleteUserAccount(user.id, String(formData.get("confirmation") ?? ""));
  if (!result.ok) return fromResult(result);
  await clearSessionCookie();
  redirect("/?deleted=1");
}
