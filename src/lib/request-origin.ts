import "server-only";

function hasMatchingOrigin(rawValue: string, expectedOrigin: string) {
  try {
    return new URL(rawValue).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function isTrustedPostOrigin(request: Request) {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");

  if (origin) {
    return hasMatchingOrigin(origin, expectedOrigin);
  }

  const referer = request.headers.get("referer");

  if (referer) {
    return hasMatchingOrigin(referer, expectedOrigin);
  }

  return process.env.NODE_ENV !== "production";
}
