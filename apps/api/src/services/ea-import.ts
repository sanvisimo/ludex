import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';

import { EaAuthError, type EaToken, fetchEaLibrary } from '../external/ea';
import { decryptCredentials } from '../lib/crypto';
import { type ImportReport, importLibrary } from './library-import';
import type { StoreAccountRow } from './store-accounts';

/**
 * Il token EA non c'è più, o EA non lo accetta: serve un JSON nuovo.
 *
 * **Non è `needs_reauth`**, ed è il punto: su EA scadere è la regola, non un
 * guasto. L'account resta `ok`, con la sua libreria; il job fallisce e basta,
 * senza riprovare, e la scheda dice di incollare di nuovo.
 */
export class EaTokenExpiredError extends Error {
  constructor() {
    super(
      'Il token EA è scaduto: apri di nuovo la pagina del token e incolla il JSON',
    );
    this.name = 'EaTokenExpiredError';
  }
}

/** Il token non serve più a niente, e non si tiene: vedi `linkEaAccount`. */
function forgetToken(account: StoreAccountRow) {
  return db
    .update(schema.storeAccounts)
    .set({
      credentials: null,
      credentialsExpireAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.storeAccounts.id, account.id));
}

/**
 * Import della libreria EA (9c), **una volta sola** per token.
 *
 * Come Epic e Amazon si risolve tutto per nome: IGDB non ha una sorgente EA. La
 * libreria arriva già ridotta a una voce per gioco (`reduceEaLibrary`), coi DLC
 * scartati e le offerte dello stesso gioco messe insieme.
 *
 * Il token si cancella appena l'import finisce, bene o con un rifiuto di EA: non
 * rinnova niente e scade in quattro ore, e tenerlo vorrebbe dire custodire un
 * credenziale che non serve. Un errore di rete invece lo lascia, perché BullMQ
 * riprova e il tentativo dopo ne ha bisogno.
 */
export async function importEaLibrary(
  account: StoreAccountRow,
): Promise<ImportReport> {
  let token: EaToken | null = null;
  try {
    token = account.credentials
      ? decryptCredentials<EaToken>(account.credentials)
      : null;
  } catch {
    token = null;
  }
  if (!token || token.expiresAt <= Date.now()) {
    await forgetToken(account);
    throw new EaTokenExpiredError();
  }

  let library;
  try {
    library = await fetchEaLibrary(token.accessToken);
  } catch (error) {
    if (error instanceof EaAuthError) {
      await forgetToken(account);
      throw new EaTokenExpiredError();
    }
    throw error;
  }

  const report = await importLibrary(account, library);
  await forgetToken(account);
  return report;
}
