import { env, emailConfigured } from "@/lib/env";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendEmailResult = { delivered: boolean; provider: "resend" | "log"; error?: string };

/**
 * Transactional email. When RESEND_API_KEY is absent we log a redacted notice
 * and return delivered:false. The UI never claims an email was sent when it was
 * not. In development the caller may surface the link in server logs only.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!emailConfigured) {
    console.info(
      `[email:not-configured] Would send "${input.subject}" to ${input.to}. Configure RESEND_API_KEY to deliver mail.`,
    );
    return { delivered: false, provider: "log" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("Email delivery failed", res.status, body.slice(0, 300));
      return { delivered: false, provider: "resend", error: `Email provider returned ${res.status}` };
    }
    return { delivered: true, provider: "resend" };
  } catch (error) {
    console.error("Email delivery error", error);
    return { delivered: false, provider: "resend", error: "Email delivery failed" };
  }
}

function shell(title: string, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f6f6f3;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#101413">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #e6e6e0;border-radius:16px;padding:36px">
        <tr><td style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#0f5c4c;font-weight:600">SubZero</td></tr>
        <tr><td style="padding-top:18px;font-size:24px;font-weight:600;letter-spacing:-.02em">${title}</td></tr>
        <tr><td style="padding-top:14px;font-size:15px;line-height:1.6;color:#3f4844">${body}</td></tr>
        ${
          cta
            ? `<tr><td style="padding-top:26px"><a href="${cta.url}" style="display:inline-block;background:#0f5c4c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">${cta.label}</a></td></tr>
               <tr><td style="padding-top:18px;font-size:12px;color:#7a8580;word-break:break-all">${cta.url}</td></tr>`
            : ""
        }
        <tr><td style="padding-top:28px;border-top:1px solid #ecece6;font-size:12px;color:#7a8580;line-height:1.5">You received this because you have a SubZero account. SubZero never asks for your provider passwords.</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export function verificationEmail(name: string, url: string) {
  return {
    subject: "Verify your SubZero email",
    html: shell(
      "Confirm your email",
      `Hi ${name}, welcome to SubZero. Confirm your email address to secure your account and finish setting up your subscription workspace. This link expires in 24 hours.`,
      { label: "Verify email", url },
    ),
    text: `Verify your SubZero email (expires in 24 hours): ${url}`,
  };
}

export function passwordResetEmail(name: string, url: string) {
  return {
    subject: "Reset your SubZero password",
    html: shell(
      "Reset your password",
      `Hi ${name}, we received a request to reset your password. This link expires in 60 minutes and can only be used once. If you did not request it, you can ignore this email.`,
      { label: "Reset password", url },
    ),
    text: `Reset your SubZero password (expires in 60 minutes): ${url}`,
  };
}

export function trialReminderEmail(name: string, service: string, endDate: string, price: string, url: string) {
  return {
    subject: `${service} trial ends ${endDate}`,
    html: shell(
      `Your ${service} trial ends soon`,
      `Hi ${name}, your ${service} free trial ends on ${endDate}. After that the subscription renews at ${price}. If you do not want to continue, cancel with the provider before the renewal date.`,
      { label: "Review subscription", url },
    ),
    text: `${service} trial ends ${endDate}; renewal price ${price}. Review: ${url}`,
  };
}

export function renewalReminderEmail(name: string, service: string, date: string, price: string, url: string) {
  return {
    subject: `${service} renews ${date}`,
    html: shell(
      `Upcoming payment: ${service}`,
      `Hi ${name}, ${service} is due to renew on ${date} for ${price}. Review the subscription or its cancellation options in SubZero.`,
      { label: "Open subscription", url },
    ),
    text: `${service} renews ${date} for ${price}. Review: ${url}`,
  };
}
