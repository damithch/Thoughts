// No built-in server address: the sign-in screen asks for your Thoughts web app's address the
// first time, then remembers it on the phone. (A guessed default could send a password to a site
// that isn't yours.)
export const DEFAULT_SERVER_URL = "";

export function normalizeServerUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return "";
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
