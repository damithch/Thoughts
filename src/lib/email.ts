import "server-only";

import { buildResendRequest, RESEND_EMAILS_URL } from "@/lib/resend-request";

type PasswordResetEmailInput = {
  email: string;
  resetLink: string;
};

function getFromAddress() {
  return process.env.RESET_EMAIL_FROM ?? "no-reply@thoughts.local";
}

async function sendWithResend({ email, resetLink }: PasswordResetEmailInput) {
  const resendKey = process.env.RESEND_API_KEY;

  if (!resendKey) {
    return false;
  }

  const response = await fetch(
    RESEND_EMAILS_URL,
    buildResendRequest(resendKey, {
      from: getFromAddress(),
      to: [email],
      subject: "Reset your Thoughts password",
      text: [
        "A password reset was requested for your Thoughts account.",
        "",
        `Use this link to reset your password: ${resetLink}`,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
    }),
  );

  if (!response.ok) {
    // The caller swallows errors to avoid account enumeration, so this log is the only trace.
    console.error(
      `Resend rejected the password reset email (HTTP ${response.status}): ${await response.text()}`,
    );
  }

  return response.ok;
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput) {
  const sent = await sendWithResend(input);

  if (sent) {
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[dev-only] Password reset link for ${input.email}: ${input.resetLink}`,
    );
  }
}
