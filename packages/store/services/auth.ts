import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import type { DatabaseSync } from "node:sqlite";

export async function createAuth(
  database: DatabaseSync,
  origin: string,
  secret: string,
) {
  if (secret.length < 32)
    throw new Error(
      "Set BETTER_AUTH_SECRET to a random value of at least 32 characters. Run pnpm setup:creem first.",
    );
  const options = {
    database,
    baseURL: origin,
    secret,
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
    trustedOrigins: [origin],
    rateLimit: { enabled: true, storage: "database" },
    advanced: { useSecureCookies: origin.startsWith("https:") },
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions;
  const migrations = await getMigrations(options);
  await migrations.runMigrations();
  return betterAuth(options);
}

export type StoreAuth = Awaited<ReturnType<typeof createAuth>>;
