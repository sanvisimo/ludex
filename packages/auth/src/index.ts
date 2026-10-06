import { db, schema } from '@repo/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error(
    'BETTER_AUTH_SECRET non impostata: copia .env.example in .env',
  );
}

export const auth = betterAuth({
  secret,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3005',
  // Il web gira su un'origine diversa dall'API, quindi va dichiarata esplicitamente.
  trustedOrigins: [process.env.WEB_URL ?? 'http://localhost:8085'],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  session: {
    // Spento il controllo di freschezza. `freshAge` si misura da `createdAt`,
    // che non si rinnova: una sessione usata ogni giorno vive all'infinito e
    // prima o poi supera qualunque soglia, e `list-sessions` (la pagina delle
    // sessioni attive) risponde 403 SESSION_NOT_FRESH. Il resto delle
    // operazioni sensibili (revoca, cambio password) non lo controlla comunque.
    // Conseguenza: `delete-user` senza password passerebbe su qualunque sessione,
    // quindi lo step 16 deve chiedere la password lui.
    freshAge: 0,
  },
  emailAndPassword: {
    enabled: true,
    // Nessuna infrastruttura email allo step 1: verifica e reset password
    // arriveranno quando ci sarà un sender configurato.
    requireEmailVerification: false,
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
