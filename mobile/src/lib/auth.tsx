import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { DEFAULT_SERVER_URL, normalizeServerUrl } from "@/lib/config";
import type { User } from "@/lib/types";

const TOKEN_KEY = "thoughts.token";
const SERVER_KEY = "thoughts.server";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    // Set by the AI routes (e.g. "rate_limit"); a 401 with an errorType is the AI provider
    // refusing, not your sign-in expiring.
    readonly errorType?: string,
  ) {
    super(message);
  }

  get isSignedOut() {
    return this.status === 401 && !this.errorType;
  }
}

type RequestOptions = { method?: string; body?: unknown };

type AuthState = {
  ready: boolean;
  user: User | null;
  serverUrl: string;
  signIn: (serverUrl: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  request: <T>(path: string, options?: RequestOptions) => Promise<T>;
};

const AuthContext = createContext<AuthState | null>(null);

// `path` is relative to /api: "/v1/today" for mobile routes, "/anchor-notes" for shared web routes.
async function send<T>(serverUrl: string, token: string | null, path: string, options: RequestOptions = {}) {
  let response: Response;

  try {
    response = await fetch(`${serverUrl}/api${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your internet connection.", 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  // Non-JSON answers (CSV reports) come back as text.
  if (!(response.headers.get("content-type") ?? "").includes("json")) {
    const text = await response.text();

    if (!response.ok) {
      throw new ApiError(text.slice(0, 200) || `The server answered with an error (${response.status}).`, response.status);
    }

    return text as T;
  }

  const data = (await response.json().catch(() => null)) as (T & { error?: string; errorType?: string }) | null;

  if (!response.ok) {
    throw new ApiError(
      data?.error ?? `The server answered with an error (${response.status}).`,
      response.status,
      data?.errorType,
    );
  }

  return data as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);

  // On launch: restore the saved token and confirm it still works.
  useEffect(() => {
    (async () => {
      try {
        const savedServer = (await SecureStore.getItemAsync(SERVER_KEY)) ?? DEFAULT_SERVER_URL;
        const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        setServerUrl(savedServer);

        if (savedToken && savedServer) {
          const { user: me } = await send<{ user: User }>(savedServer, savedToken, "/v1/me");
          setToken(savedToken);
          setUser(me);
        }
      } catch (error) {
        // Only a rejected token signs you out; being offline keeps you on the sign-in screen
        // without deleting anything.
        if (error instanceof ApiError && error.isSignedOut) {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const signIn = useCallback(async (server: string, email: string, password: string) => {
    const url = normalizeServerUrl(server);
    const result = await send<{ token: string; user: User }>(url, null, "/v1/auth/login", {
      method: "POST",
      body: { email, password },
    });

    await SecureStore.setItemAsync(SERVER_KEY, url);
    await SecureStore.setItemAsync(TOKEN_KEY, result.token);
    setServerUrl(url);
    setToken(result.token);
    setUser(result.user);
  }, []);

  const request = useCallback(
    async <T,>(path: string, options?: RequestOptions) => {
      try {
        return await send<T>(serverUrl, token, path, options);
      } catch (error) {
        if (error instanceof ApiError && error.isSignedOut) {
          await signOut();
        }
        throw error;
      }
    },
    [serverUrl, token, signOut],
  );

  const value = useMemo(
    () => ({ ready, user, serverUrl, signIn, signOut, request }),
    [ready, user, serverUrl, signIn, signOut, request],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
