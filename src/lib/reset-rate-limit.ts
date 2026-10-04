import "server-only";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const RESET_WINDOW_MS = 1000 * 60 * 15;
const RESET_MAX_ATTEMPTS = 5;

const resetAttempts = new Map<string, RateLimitEntry>();

function pruneExpiredAttempts(now: number) {
  for (const [key, value] of resetAttempts.entries()) {
    if (value.resetAt <= now) {
      resetAttempts.delete(key);
    }
  }
}

export function consumePasswordResetAttempt(key: string, now = Date.now()) {
  if (resetAttempts.size > 1000) {
    pruneExpiredAttempts(now);
  }

  const existing = resetAttempts.get(key);

  if (!existing || existing.resetAt <= now) {
    resetAttempts.set(key, {
      count: 1,
      resetAt: now + RESET_WINDOW_MS,
    });

    return { allowed: true };
  }

  if (existing.count >= RESET_MAX_ATTEMPTS) {
    return { allowed: false };
  }

  existing.count += 1;
  resetAttempts.set(key, existing);

  return { allowed: true };
}
