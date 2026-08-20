import { EpicAuthError, fetchEpicLibrary } from '../external/epic';
import { type ImportReport, importLibrary } from './library-import';
import { epicAccessToken, requireReauth } from './store-accounts';

/**
 * Import della libreria Epic.
 *
 * Nella forma è identico a GOG — un token dell'utente, un elenco, e poi
 * `importLibrary` — ma il costo è di un altro ordine, e la ragione è scritta in
 * cima a `external/epic.ts`: **nessun id del launcher combacia con IGDB**,
 * quindi ogni voce passa dalla ricerca per nome. Su una libreria vera sono 705
 * ricerche, circa tre minuti di coda al primo import. Al secondo sono zero: le
 * mappature stanno in `external_ids` e le riconosce il passo 1.
 *
 * **Niente ore giocate**, come GOG.
 */
export async function importEpicLibrary(userId: string): Promise<ImportReport> {
  const accessToken = await epicAccessToken(userId);

  try {
    const library = await fetchEpicLibrary(accessToken);
    return await importLibrary('epic', userId, library);
  } catch (error) {
    // Il token era valido un istante fa ed Epic lo rifiuta lo stesso: revocato
    // mentre giravamo. Va scritto, o l'account resterebbe «ok» pur avendo
    // smesso di funzionare.
    if (error instanceof EpicAuthError) return requireReauth(userId, 'epic');
    throw error;
  }
}
