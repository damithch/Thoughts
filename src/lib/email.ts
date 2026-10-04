import "server-only";

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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Token " + resendKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
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
  });

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
