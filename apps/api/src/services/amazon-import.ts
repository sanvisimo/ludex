import { AmazonAuthError, fetchAmazonLibrary } from '../external/amazon';
import { type ImportReport, importLibrary } from './library-import';
import {
  amazonAccess,
  requireReauth,
  type StoreAccountRow,
} from './store-accounts';

/**
 * Import della libreria Amazon Games.
 *
 * Come Epic, si risolve tutto per nome: la sorgente «Amazon ADG» di IGDB ha 678
 * righe in tutto e su una libreria vera non ne aggancia nessuna. A differenza di
 * Epic però i titoli arrivano già buoni con gli entitlement, quindi non c'è
 * nessun catalogo da interrogare — e le librerie Amazon sono piccole, un
 * centinaio di voci contro settecento.
 *
 * **Niente ore giocate.**
 */
export async function importAmazonLibrary(
  account: StoreAccountRow,
): Promise<ImportReport> {
  const { accessToken, serial } = await amazonAccess(account);

  try {
    const library = await fetchAmazonLibrary(accessToken, serial);
    return await importLibrary(account, library);
  } catch (error) {
    if (error instanceof AmazonAuthError) return requireReauth(account);
    throw error;
  }
}
