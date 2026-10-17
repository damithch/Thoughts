import { createSign } from "node:crypto";

// Pure helpers for Firebase Cloud Messaging auth (kept separate so they can be unit-tested).

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export type ServiceAccount = { project_id: string; client_email: string; private_key: string };

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;

    return parsed.project_id && parsed.client_email && parsed.private_key
      ? { project_id: parsed.project_id, client_email: parsed.client_email, private_key: parsed.private_key }
      : null;
  } catch {
    return null;
  }
}

// The signed JWT a service account exchanges for an access token (RS256, valid for an hour).
export function buildServiceJwt(account: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: account.client_email,
    scope: FCM_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64url");

  return `${unsigned}.${signature}`;
}

// Firebase's way of saying a device token is dead (app uninstalled, data cleared, …).
export function isStaleTokenResponse(status: number, body: string) {
  return status === 404 || /UNREGISTERED|registration token is not a valid/i.test(body);
}
