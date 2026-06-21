import "server-only";

import { Pool } from "pg";

function normalizeDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get("sslmode");

  // pg warns that legacy sslmode aliases will change meaning in the next major release.
  // Normalize them now so local dev and production use the stricter current behavior.
  if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const globalForDb = globalThis as typeof globalThis & {
  thoughtsPool?: Pool;
};

export const pool =
  globalForDb.thoughtsPool ??
  new Pool({
    connectionString: normalizeDatabaseUrl(connectionString),
    ssl: {
      rejectUnauthorized: false,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.thoughtsPool = pool;
}
