import { storeAccountName } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { UnrecoverableError } from 'bullmq';

import { SteamWishlistNotVisibleError } from '../external/steam';
import {
  type StoreAccountRow,
  StoreReauthRequiredError,
} from './store-accounts';
import { importStoreWishlist } from './store-wishlist';

// Ciò che il worker degli import fa dentro un job, fuori da `worker.ts`: quel
// file apre i Worker e Redis appena lo si importa, e un test non può caricarlo.
// Qui restano le decisioni — chi si importa, cosa non si riprova — e al worker
// la sola colla.

/**
 * L'account di un job, riletto dal DB e **ancora collegato**.
 *
 * Si rilegge qui e non arriva dentro il job: fra l'accodamento e adesso può
 * essere stato scollegato, o il suo token rinnovato da qualcun altro. Un job che
 * porta con sé una copia della riga lavora su una verità vecchia di minuti.
 *
 * Scollegato mentre il job aspettava in coda: non è un guasto e riprovare non lo
 * aggiusta, l'utente ha detto che quell'account non lo vuole più.
 */
export async function findLinkedAccount(
  storeAccountId: string,
): Promise<StoreAccountRow> {
  const account = await db.query.storeAccounts.findFirst({
    where: eq(schema.storeAccounts.id, storeAccountId),
  });
  if (!account || account.status === 'unlinked') {
    throw new UnrecoverableError(
      `L'account ${storeAccountId} non è più collegato`,
    );
  }
  return account;
}

/**
 * Il job «importa la wishlist» (15e).
 *
 * Un credenziale morto e una wishlist Steam non visibile non cambiano
 * riprovando: i tre giri con backoff sono per le reti che cadono. Diventano
 * `UnrecoverableError`, che manda il job a fallito subito e libera la chiave di
 * deduplicazione. Ogni altro errore passa com'è, e BullMQ riprova.
 */
export async function runWishlistImportJob(storeAccountId: string) {
  const account = await findLinkedAccount(storeAccountId);
  try {
    const report = await importStoreWishlist(account);
    console.log(
      `[import] wishlist ${account.store} ${storeAccountName(account)}: ${report.total} voci, ` +
        `${report.inList} in lista (${report.resolvedByName} per nome, ` +
        `${report.newGames} giochi nuovi), ${report.unresolved} da sistemare`,
    );
    return report;
  } catch (error) {
    if (
      error instanceof StoreReauthRequiredError ||
      error instanceof SteamWishlistNotVisibleError
    ) {
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }
}
