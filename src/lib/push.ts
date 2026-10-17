import "server-only";

import { forgetPushToken, getPushTokens } from "@/lib/db";
import {
  buildServiceJwt,
  GOOGLE_TOKEN_URL,
  isStaleTokenResponse,
  parseServiceAccount,
  type ServiceAccount,
} from "@/lib/push-auth";

// Push alerts through Firebase Cloud Messaging (HTTP v1), authenticated with a service account
// given as JSON in FIREBASE_SERVICE_ACCOUNT. Messages are data-only so the app's notification
// library presents them exactly like its own reminders (same channels, same tap handling).
// Without the env var, push is simply off and nothing is sent.

export type PushMessage = {
  title: string;
  message: string;
  // Screen to open when tapped, e.g. "/support".
  url: string;
  channelId: "care" | "reminders" | "thinking";
};

export type PushResult = { configured: boolean; devices: number; sent: number; failed: number };

let cachedAccess: { token: string; expiresAt: number } | null = null;

function readServiceAccount(): ServiceAccount | null {
  const account = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);

  if (process.env.FIREBASE_SERVICE_ACCOUNT && !account) {
    console.error("FIREBASE_SERVICE_ACCOUNT is set but isn't a valid service account JSON.");
  }

  return account;
}

export function isPushConfigured() {
  return readServiceAccount() !== null;
}

async function getAccessToken(account: ServiceAccount) {
  if (cachedAccess && cachedAccess.expiresAt > Date.now() + 60_000) {
    return cachedAccess.token;
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildServiceJwt(account),
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Google token request failed (${response.status}).`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedAccess = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };

  return data.access_token;
}

export async function sendPushToUser(userId: number, message: PushMessage): Promise<PushResult> {
  const account = readServiceAccount();
  const tokens = await getPushTokens(userId);

  if (!account || tokens.length === 0) {
    return { configured: Boolean(account), devices: tokens.length, sent: 0, failed: 0 };
  }

  const accessToken = await getAccessToken(account);
  let sent = 0;
  let failed = 0;

  for (const token of tokens) {
    try {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            // Data-only: the app shows it, so the channel, wording and tap target stay ours.
            data: {
              title: message.title,
              message: message.message,
              channelId: message.channelId,
              body: JSON.stringify({ url: message.url }),
            },
            android: { priority: "HIGH", ttl: "3600s" },
          },
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        sent += 1;
        continue;
      }

      const text = await response.text();
      failed += 1;

      if (isStaleTokenResponse(response.status, text)) {
        await forgetPushToken(token);
      } else {
        console.error(`Push to a device failed (${response.status}).`, text.slice(0, 300));
      }
    } catch (error) {
      failed += 1;
      console.error("Push to a device failed.", error);
    }
  }

  return { configured: true, devices: tokens.length, sent, failed };
}
