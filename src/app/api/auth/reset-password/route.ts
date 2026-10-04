import { NextResponse } from "next/server";

import { clearSession, hashPassword } from "@/lib/auth";
import { consumePasswordResetToken } from "@/lib/db";
import { hashPasswordResetToken, isValidPassword } from "@/lib/password-reset";
import { isTrustedPostOrigin } from "@/lib/request-origin";

function getResetRedirect(request: Request, token: string, toast: string) {
  const url = new URL("/reset-password", request.url);

  if (token) {
    url.searchParams.set("token", token);
  }

  url.searchParams.set("toast", toast);
  url.searchParams.set("type", toast === "updated" ? "success" : "error");

  return url;
}

export async function POST(request: Request) {
  if (!isTrustedPostOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const formData = await request.formData();
  const token = formData.get("token")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const confirmPassword = formData.get("confirmPassword")?.toString() ?? "";

  if (!token) {
    const response = NextResponse.redirect(getResetRedirect(request, token, "invalid_link"), {
      status: 303,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  if (!isValidPassword(password) || password !== confirmPassword) {
    const response = NextResponse.redirect(getResetRedirect(request, token, "invalid_password"), {
      status: 303,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const consumeResult = await consumePasswordResetToken({
    tokenHash: hashPasswordResetToken(token),
    passwordHash: hashPassword(password),
  });

  if (!consumeResult.success) {
    const response = NextResponse.redirect(getResetRedirect(request, token, "invalid_or_expired"), {
      status: 303,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  await clearSession();

  const response = NextResponse.redirect(new URL("/login?toast=password_reset&type=success", request.url), {
    status: 303,
  });
  response.headers.set("Cache-Control", "no-store");

  return response;
}
