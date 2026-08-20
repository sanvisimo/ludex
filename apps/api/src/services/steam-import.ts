import { fetchSteamLibrary } from '../external/steam';
import { type ImportReport, importLibrary } from './library-import';
import type { StoreAccountRow } from './store-accounts';

/**
 * Import della libreria Steam.
 *
 * Allo step 4 questo file conteneva tutto; al 9a il corpo è passato in
 * `library-import.ts`, che lo condivide con GOG, Epic e Amazon. Qui resta solo
 * ciò che è davvero di Steam, e non è molto — che è il punto.
 *
 * Steam è l'unico negozio senza credenziale dell'utente: la chiave è
 * dell'applicazione e identifica noi, per leggere una libreria basta che quel
 * profilo sia pubblico. Per questo non passa da `store-accounts` a farsi dare un
 * token: lo SteamID64 che gli serve è l'identità pubblica sulla riga.
 */
export type SteamImportReport = ImportReport;

export async function importSteamLibrary(
  account: StoreAccountRow,
): Promise<SteamImportReport> {
  const library = await fetchSteamLibrary(account.externalAccountId);
  return importLibrary(account, library);
}
