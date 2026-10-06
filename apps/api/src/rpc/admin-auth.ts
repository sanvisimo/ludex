import { ORPCError } from '@orpc/server';
import { APIError } from '@repo/auth';

// Le API del plugin `admin` di Better Auth rispondono con un `APIError` dal
// messaggio inglese e un codice stabile. Qui diventano errori oRPC, con un
// messaggio che il web può mostrare.
const messaggi: Record<string, string> = {
  YOU_CANNOT_BAN_YOURSELF: 'Non puoi bannarti da solo',
  USER_NOT_FOUND: 'Utente inesistente',
};

/** Una chiamata alle API admin di Better Auth, con gli errori tradotti in oRPC. */
export async function asAdminAuthCall<T>(call: () => Promise<T>) {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    const code = (error.body as { code?: string } | undefined)?.code;
    // Lo status è già un nome HTTP (`BAD_REQUEST`, `NOT_FOUND`…), che è
    // anche un codice oRPC.
    throw new ORPCError(String(error.status), {
      message: (code && messaggi[code]) ?? error.message,
    });
  }
}
