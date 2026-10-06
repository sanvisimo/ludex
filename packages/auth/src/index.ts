import { db, schema } from '@repo/db';
import { and, count, eq, ne } from '@repo/db/orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { admin } from 'better-auth/plugins/admin';

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
    // ed è per questo che l'hook qui sotto la pretende.
    freshAge: 0,
  },
  hooks: {
    // La conferma della cancellazione è la password (step 16). Better Auth la
    // chiede solo se la sessione non è fresca, e con `freshAge: 0` non lo è mai
    // stata: senza questo, una sessione rubata cancellerebbe l'account.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/delete-user' && !ctx.body?.password)
        throw new APIError('BAD_REQUEST', {
          code: 'PASSWORD_REQUIRED',
          message: 'Per cancellare l’account serve la password',
        });
    }),
  },
  user: {
    // La cancellazione dell'account (step 16). Le FK verso `user` sono tutte in
    // cascade, e `games` non ha `userId`: i giochi condivisi restano.
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        // L'ultimo admin non si cancella: senza nessuno, scarti e segnalazioni
        // restano senza chi li gestisce, e si riparte da `admin:grant`. Il
        // ruolo si legge dal database e non dalla sessione che arriva qui.
        const [row] = await db
          .select({ role: schema.user.role })
          .from(schema.user)
          .where(eq(schema.user.id, user.id));
        if (row?.role === 'admin') {
          const [others] = await db
            .select({ n: count() })
            .from(schema.user)
            .where(
              and(eq(schema.user.role, 'admin'), ne(schema.user.id, user.id)),
            );
          if (!others?.n)
            throw new APIError('BAD_REQUEST', {
              code: 'LAST_ADMIN',
              message: 'Sei l’ultimo admin: nomina prima qualcun altro',
            });
        }

        // Prima il backlog, e con lui i possessi. `ownerships.store_account_id`
        // è `restrict` e `store_accounts` cade nella stessa cascata dell'utente:
        // misurato, passa, ma solo perché Postgres percorre le FK nell'ordine in
        // cui sono state create. Su un database ricostruito da un dump potrebbe
        // cambiare, e la cancellazione fallirebbe a metà.
        await db
          .delete(schema.backlog)
          .where(eq(schema.backlog.userId, user.id));
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    // Nessuna infrastruttura email allo step 1: verifica e reset password
    // arriveranno quando ci sarà un sender configurato.
    requireEmailVerification: false,
  },
  // Il ruolo admin (step 11a): `role`, `banned`, `banReason`, `banExpires` su
  // `user`, `impersonatedBy` su `session`, e le chiamate per elencare utenti,
  // cambiare ruolo, bannare e chiudere le sessioni. Il primo admin lo nomina
  // `pnpm --filter api admin:grant`.
  plugins: [admin()],
});

export type Auth = typeof auth;
// Gli errori delle API di Better Auth, per chi le chiama dal server (la
// sezione Utenti dell'admin) e deve tradurli: così `apps/api` non dipende da
// `better-auth` direttamente.
export { APIError } from 'better-auth/api';
export type Session = typeof auth.$Infer.Session;
