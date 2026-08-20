import { fetchGogLibrary, GogAuthError } from '../external/gog';
import { type ImportReport, importLibrary } from './library-import';
import { gogAccessToken, requireReauth } from './store-accounts';

/**
 * Import della libreria GOG.
 *
 * Come per Steam, qui resta solo ciò che è di GOG: procurarsi un token valido e
 * scaricare l'elenco. Il resto lo fa `importLibrary`.
 *
 * La differenza con Steam è tutta nel credenziale. Steam legge un profilo
 * pubblico con una chiave nostra; qui c'è un refresh token dell'utente, che
 * `gogAccessToken` rinnova da sé e che un giorno potrà essere revocato. Quel
 * giorno il job non deve riprovare: `StoreReauthRequiredError` è definitivo e va
 * lasciato passare fino al worker, che lo tratta come tale.
 *
 * **Niente ore giocate**: l'API dell'account GOG non le espone, quindi i possessi
 * nascono senza. È il motivo per cui `ensureOwnerships` aggiorna le ore in
 * COALESCE — un import che non le porta non deve cancellare quelle che c'erano.
 */
export async function importGogLibrary(userId: string): Promise<ImportReport> {
  const accessToken = await gogAccessToken(userId);

  let library;
  try {
    library = await fetchGogLibrary(accessToken);
  } catch (error) {
    // Il token era valido un istante fa e GOG lo rifiuta lo stesso: revocato
    // mentre giravamo. Stessa uscita del rinnovo fallito — e va scritta, o
    // l'account resterebbe «ok» pur avendo smesso di funzionare.
    if (error instanceof GogAuthError) return requireReauth(userId, 'gog');
    throw error;
  }

  return importLibrary('gog', userId, library);
}
