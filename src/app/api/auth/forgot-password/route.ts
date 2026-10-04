import { NextResponse } from "next/server";

import { createPasswordResetToken, getUserByEmail } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import {
  enforceForgotPasswordResponseDelay,
  generatePasswordResetToken,
  getPasswordResetExpiryDate,
  hashPasswordResetToken,
  isLikelyValidEmail,
} from "@/lib/password-reset";
import { consumePasswordResetAttempt } from "@/lib/reset-rate-limit";
import { isTrustedPostOrigin } from "@/lib/request-origin";

function getGenericRedirectUrl(request: Request) {
  return new URL("/forgot-password?toast=requested&type=info", request.url);
}

function getRequestIdentity(request: Request, email: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return hashPasswordResetToken(`${forwardedFor || realIp || "unknown"}:${email}`);
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  if (!isTrustedPostOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const formData = await request.formData();
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";

  if (isLikelyValidEmail(email)) {
    const rateLimitResult = consumePasswordResetAttempt(getRequestIdentity(request, email));

    if (rateLimitResult.allowed) {
      try {
        const user = await getUserByEmail(email);

        if (user) {
          const resetToken = generatePasswordResetToken();
          const resetTokenHash = hashPasswordResetToken(resetToken);

          await createPasswordResetToken({
            userId: user.id,
            tokenHash: resetTokenHash,
            expiresAt: getPasswordResetExpiryDate(),
          });

          const requestUrl = new URL(request.url);
          const appBaseUrl = process.env.APP_BASE_URL?.trim() || requestUrl.origin;
          const resetLink = new URL(`/reset-password?token=${encodeURIComponent(resetToken)}`, appBaseUrl);

          await sendPasswordResetEmail({
            email,
            resetLink: resetLink.toString(),
          });
        }
      } catch {
        // Intentionally swallow errors to avoid user enumeration details.
      }
    }
  }

  await enforceForgotPasswordResponseDelay(startedAt);

  const response = NextResponse.redirect(getGenericRedirectUrl(request), { status: 303 });
  response.headers.set("Cache-Control", "no-store");

  return response;
}
