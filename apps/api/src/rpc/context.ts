import { ORPCError, implement } from '@orpc/server';
import { auth, type Session } from '@repo/auth';
import { contract } from '@repo/contracts';

// Il contesto iniziale è solo quello che l'adapter HTTP può dare: gli header
// grezzi. La sessione la risolvono i middleware qui sotto, così i handler
// ricevono già l'utente e non sanno nulla di Better Auth.
export type RpcContext = { headers: Headers };

export const os = implement(contract).$context<RpcContext>();

/** Sessione obbligatoria: tutto ciò che tocca il backlog di qualcuno. */
export const authed = os.middleware(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  if (!session)
    throw new ORPCError('UNAUTHORIZED', { message: 'Devi accedere' });
  return next({ context: { user: session.user } });
});

/**
 * Sessione facoltativa: la scheda gioco si vede da sloggati e si arricchisce
 * dello stato personale se la sessione c'è.
 */
export const maybeAuthed = os.middleware(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  return next({ context: { user: session?.user ?? null } });
});

/**
 * Solo admin (step 11a): va **dopo** `authed`, che mette l'utente nel contesto.
 * È qui la sicurezza vera: che il web nasconda il link `/admin` è comodità.
 */
export const admin = os
  .$context<RpcContext & { user: Session['user'] }>()
  .middleware(async ({ context, next }) => {
    if (context.user.role !== 'admin')
      throw new ORPCError('FORBIDDEN', { message: 'Solo per gli admin' });
    return next();
  });
