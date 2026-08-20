import {
  fetchPsnLibrary,
  fetchPsnPlayedTitles,
  PsnAuthError,
  type PsnCredentials,
} from '../external/psn';
import { decryptCredentials } from '../lib/crypto';
import {
  type ImportReport,
  importLibrary,
  type LibraryEntry,
} from './library-import';
import { toPlatformSlug } from './psn-platforms';
import {
  requireReauth,
  type StoreAccountRow,
  storeAccessToken,
} from './store-accounts';

/**
 * Import della libreria PSN.
 *
 * Prima console, e porta con sé le due cose che nessun negozio PC aveva:
 *
 * - **la piattaforma la dice la riga**, non il negozio. La stessa libreria
 *   mescola PS4 e PS5, e lo stesso gioco comprato una volta sola in cross-buy
 *   arriva come due voci con lo stesso titolo. Sono due copie vere: a lanciarle
 *   si accende una console diversa, e restano due possessi.
 * - **l'abbonamento**. Su una libreria vera 274 righe su 336 vengono dal PS
 *   Plus, non da un acquisto. Entrano in backlog, ma il possesso se lo ricorda.
 *
 * Ciò che invece **non** ha, contro ogni aspettativa: un id che IGDB conosca.
 * La sorgente 36 di IGDB indicizza i `conceptId` numerici dello store, e Sony
 * quel campo lo manda nullo su ogni riga — 336 su 336, misurato. Quindi PSN si
 * risolve per nome come Epic e Amazon: 88% su 256 nomi distinti, e degli
 * irrisolti la metà sono Netflix, Spotify e YouTube, che giochi non sono.
 */

/** Da `PS5` allo slug nostro, scartando ciò che non sappiamo tradurre. */
function toEntry(
  raw: Awaited<ReturnType<typeof fetchPsnLibrary>>[number],
  oreDi: Map<string, { playtimeMinutes: number | null; lastPlayedAt: Date | null }>,
): LibraryEntry | null {
  const platformSlug = toPlatformSlug(raw.platform);
  // Senza piattaforma non si può scrivere il possesso: la colonna è NOT NULL e
  // ha una FK su `platforms`. Meglio perdere la riga con un log che indovinare
  // una console su cui poi si filtra — vedi `psn-platforms.ts`.
  if (!platformSlug) return null;

  // L'id esterno è il `titleId`, che è **per console**: il cross-buy PS4/PS5 dà
  // due id distinti per lo stesso gioco, ed è giusto così — sono le due copie.
  // Il concept sarebbe stato l'id del *gioco*, ma non arriva.
  const externalId = raw.titleId ?? raw.entitlementId;
  if (!externalId) return null;

  const ore = oreDi.get(externalId.toUpperCase());

  return {
    externalId,
    name: raw.name,
    platformSlug,
    playtimeMinutes: ore?.playtimeMinutes ?? null,
    lastPlayedAt: ore?.lastPlayedAt ?? null,
    subscription:
      raw.subscription && raw.subscription.toUpperCase() !== 'NONE'
        ? 'ps_plus'
        : null,
  };
}

export async function importPsnLibrary(
  account: StoreAccountRow,
): Promise<ImportReport> {
  const accessToken = await storeAccessToken(account);

  // L'`accountId` sta nel credenziale e non nella colonna: `externalAccountId`
  // ce l'ha uguale, ma leggerlo da lì vorrebbe dire fidarsi che le due cose non
  // abbiano mai divergiuto. Qui è quello con cui il token è stato emesso.
  const accountId = account.credentials
    ? decryptCredentials<PsnCredentials>(account.credentials).accountId
    : account.externalAccountId;

  let library;
  let giocati;
  try {
    library = await fetchPsnLibrary(accessToken);
    // Le ore stanno su un altro elenco, e **decorano soltanto**: qui dentro
    // c'è anche roba giocata e non posseduta, e `backlog` vuol dire possesso.
    // Un titolo giocato che la libreria non dichiara non entra da questa porta.
    giocati = await fetchPsnPlayedTitles(accessToken, accountId);
  } catch (error) {
    // Il token era valido un istante fa e Sony lo rifiuta lo stesso: revocato
    // mentre giravamo. Stessa uscita del rinnovo fallito.
    if (error instanceof PsnAuthError) return requireReauth(account);
    throw error;
  }

  // La chiave è il `titleId`, che l'elenco degli acquisti non dichiara come
  // campo suo: sta dentro l'`entitlementId`, e da lì lo estrae il client. È
  // l'aggancio esatto che evita un match per titolo fra due liste della stessa
  // persona — su una libreria vera 31 dei 49 giocati trovano il loro possesso,
  // e gli altri 18 sono roba non posseduta.
  const oreDi = new Map(
    giocati.map((title) => [
      title.titleId.toUpperCase(),
      {
        playtimeMinutes: title.playtimeMinutes,
        lastPlayedAt: title.lastPlayedAt,
      },
    ]),
  );

  const entries: LibraryEntry[] = [];
  const scartate: string[] = [];
  for (const raw of library) {
    const entry = toEntry(raw, oreDi);
    if (entry) entries.push(entry);
    else scartate.push(`${raw.name} [${raw.platform}]`);
  }

  if (scartate.length > 0) {
    console.log(
      `[import] psn: ${scartate.length} voci saltate, piattaforma sconosciuta: ${scartate.slice(0, 10).join(', ')}`,
    );
  }

  return importLibrary(account, entries);
}
