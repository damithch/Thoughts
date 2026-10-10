import { createMobileToken, verifyPassword } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db";
import { apiError, readJsonObject, readString, toPublicUser } from "@/lib/mobile-api";
import { consumePasswordResetAttempt } from "@/lib/reset-rate-limit";

export const dynamic = "force-dynamic";

// POST /api/v1/auth/login  { email, password } -> { token, expiresAt, user }
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const email = readString(body?.email, 320).toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return apiError("Enter your email and password.", 400);
  }

  // Same in-memory limiter as password resets, in its own key space: 5 tries per 15 minutes.
  if (!consumePasswordResetAttempt(`mobile-login:${email}`).allowed) {
    return apiError("Too many sign-in attempts. Wait a few minutes and try again.", 429);
  }

  let user = null;

  try {
    user = await getUserByEmail(email);
  } catch (error) {
    console.error("Mobile login lookup failed.", error);
    return apiError("The server could not reach the database.", 503);
  }

  if (!user || !verifyPassword(password, user.password_hash)) {
    return apiError("That email and password don't match.", 401);
  }

  const { token, expiresAt } = createMobileToken(user.id);

  return Response.json({ token, expiresAt, user: toPublicUser(user) });
}
