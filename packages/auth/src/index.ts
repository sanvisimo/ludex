import { db, schema } from "@repo/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error("BETTER_AUTH_SECRET non impostata: copia .env.example in .env");
}

export const auth = betterAuth({
  secret,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  // Il web gira su un'origine diversa dall'API, quindi va dichiarata esplicitamente.
  trustedOrigins: [process.env.WEB_URL ?? "http://localhost:3000"],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    // Nessuna infrastruttura email allo step 1: verifica e reset password
    // arriveranno quando ci sarà un sender configurato.
    requireEmailVerification: false,
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
