import "server-only";

import { randomBytes, scryptSync } from "node:crypto";

export const PASSWORD_RESET_TOKEN_TTL_MS = 1000 * 60 * 30;
const MIN_FORGOT_PASSWORD_RESPONSE_MS = 400;

function getResetTokenSecret() {
  const secret = process.env.RESET_TOKEN_SECRET ?? process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("RESET_TOKEN_SECRET or AUTH_SECRET must be configured.");
  }

  return secret;
}

export function generatePasswordResetToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(token: string) {
  return scryptSync(token, getResetTokenSecret(), 64).toString("hex");
}

export function getPasswordResetExpiryDate(now = Date.now()) {
  return new Date(now + PASSWORD_RESET_TOKEN_TTL_MS);
}

export function isValidPassword(value: string) {
  return value.length >= 8;
}

export function isLikelyValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function enforceForgotPasswordResponseDelay(startedAt: number) {
  const elapsed = Date.now() - startedAt;

  if (elapsed >= MIN_FORGOT_PASSWORD_RESPONSE_MS) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, MIN_FORGOT_PASSWORD_RESPONSE_MS - elapsed);
  });
}
