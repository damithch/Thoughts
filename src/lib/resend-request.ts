export const RESEND_EMAILS_URL = "https://api.resend.com/emails";

type ResendEmail = {
  from: string;
  to: string[];
  subject: string;
  text: string;
};

// Resend authenticates with a Bearer token and rejects requests without a User-Agent (403, code 1010).
export function buildResendRequest(apiKey: string, email: ResendEmail): RequestInit {
  return {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "thoughts-app/1.0",
    },
    body: JSON.stringify(email),
  };
}
