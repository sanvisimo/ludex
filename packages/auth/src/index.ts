import { db, schema } from '@repo/db';
import { and, count, eq, ne } from '@repo/db/orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api';
import { captcha } from 'better-auth/plugins';
import { admin } from 'better-auth/plugins/admin';

import { requestTypeOf, withCallback, withStep } from './email-links';
import {
  addressTaken,
  confirmEmailChange,
  existingAccount,
  localeOf,
  resetPassword,
  verifyEmail,
  verifyNewAddress,
} from './emails';
import { sendInBackground } from './mailer';

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error(
    'BETTER_AUTH_SECRET non impostata: copia .env.example in .env',
  );
}

const webUrl = process.env.WEB_URL ?? 'http://localhost:8085';
const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;

export const auth = betterAuth({
  secret,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3005',
  // Il web gira su un'origine diversa dall'API, quindi va dichiarata esplicitamente.
  trustedOrigins: [webUrl],
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

      // Il cambio verso un indirizzo che ha già un account: Better Auth
      // risponde 200 e non spedisce niente, per non dire chi è iscritto, e
      // chi l'ha chiesto aspetterebbe un link che non arriva. L'avviso va
      // all'indirizzo di adesso; la risposta resta quella di Better Auth.
      if (ctx.path === '/change-email') {
        const newEmail = String(ctx.body?.newEmail ?? '').toLowerCase();
        const session = await getSessionFromCtx(ctx);
        if (!session || !newEmail || newEmail === session.user.email) return;
        const [taken] = await db
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(eq(schema.user.email, newEmail));
        if (taken)
          sendInBackground(
            addressTaken(session.user, newEmail, localeOf(ctx.request)),
          );
      }
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
    // Il cambio email (rilascio): il link va prima all'indirizzo di adesso,
    // che conferma; poi Better Auth scrive a quello nuovo per verificarlo, e
    // solo allora l'email cambia. Un indirizzo già usato da un altro account
    // risponde come gli altri, senza spedire niente.
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }, request) =>
        sendInBackground(
          confirmEmailChange(user, newEmail, url, localeOf(request)),
        ),
    },
  },
  emailAndPassword: {
    enabled: true,
    // Senza email verificata non si entra (rilascio): senza Cloudflare Access
    // davanti, è ciò che tiene fuori gli account con l'indirizzo di un altro.
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }, request) =>
      sendInBackground(resetPassword(user, url, localeOf(request))),
    // Chi reimposta la password perché qualcuno la conosce vuole buttare
    // fuori anche lui: come il cambio password, che lo spunta di default.
    revokeSessionsOnPasswordReset: true,
    // Con la verifica accesa, registrarsi con un indirizzo già iscritto
    // risponde come con uno nuovo: l'avviso va per email, a chi ce l'ha.
    onExistingUserSignUp: async ({ user }, request) =>
      sendInBackground(
        existingAccount(user, `${webUrl}/forgot-password`, localeOf(request)),
      ),
  },
  emailVerification: {
    // La stessa funzione spedisce la conferma della registrazione e il
    // secondo link del cambio email, al nuovo indirizzo: li separa il tipo
    // scritto nel token. Il secondo ha il suo testo, e torna alla pagina dei
    // link col passo finale (`email-links.ts`). La conferma della registrazione
    // torna alla stessa pagina anche quando parte da un accesso tentato, che
    // un ritorno suo non ce l'ha.
    sendVerificationEmail: async ({ user, url, token }, request) =>
      sendInBackground(
        requestTypeOf(token) === 'change-email-verification'
          ? verifyNewAddress(
              user,
              withStep(url, 'change-done'),
              localeOf(request),
            )
          : verifyEmail(
              user,
              withCallback(url, `${webUrl}/email-link?step=signup`),
              localeOf(request),
            ),
      ),
    sendOnSignUp: true,
    // Chi prova ad accedere senza aver verificato riceve un link nuovo: quello
    // della registrazione vale un'ora, e così non serve un pulsante apposta.
    // Parte solo con la password giusta, che Better Auth controlla prima.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },
  // I limiti di frequenza di Better Auth (rilascio): 3 tentativi ogni 10
  // secondi su accesso, registrazione e cambi di password ed email, 3 al
  // minuto su recupero e rinvio del link. Di suo li accende solo con
  // `NODE_ENV=production`, che l'immagine non imposta; nei test restano
  // spenti, perché le chiamate di più casi arriverebbero dallo stesso IP.
  rateLimit: { enabled: process.env.NODE_ENV !== 'test' },
  advanced: {
    ipAddress: {
      // Dietro Cloudflare Tunnel ogni richiesta arriva dal tunnel: l'IP vero
      // sta in questa intestazione, e senza i limiti di uno fermerebbero
      // tutti. Vale solo se l'API non è raggiungibile se non dal tunnel, o
      // chiunque potrebbe scriverla a mano.
      ipAddressHeaders: ['cf-connecting-ip'],
    },
  },
  // Il ruolo admin (step 11a): `role`, `banned`, `banReason`, `banExpires` su
  // `user`, `impersonatedBy` su `session`, e le chiamate per elencare utenti,
  // cambiare ruolo, bannare e chiudere le sessioni. Il primo admin lo nomina
  // `pnpm --filter api admin:grant`.
  //
  // Il CAPTCHA (rilascio) è Cloudflare Turnstile, su accesso, registrazione e
  // recupero password. Si accende con la chiave segreta: senza, in sviluppo e
  // nei test, i form passano senza. Il web mostra il widget se ha la chiave
  // pubblica (`PUBLIC_TURNSTILE_SITE_KEY`), quindi le due vanno messe insieme,
  // o l'accesso risponde sempre «CAPTCHA mancante».
  plugins: [
    admin(),
    ...(turnstileSecret
      ? [
          captcha({
            provider: 'cloudflare-turnstile',
            secretKey: turnstileSecret,
          }),
        ]
      : []),
  ],
});

export type Auth = typeof auth;
// Gli errori delle API di Better Auth, per chi le chiama dal server (la
// sezione Utenti dell'admin) e deve tradurli: così `apps/api` non dipende da
// `better-auth` direttamente.
export { APIError } from 'better-auth/api';
export type Session = typeof auth.$Infer.Session;
