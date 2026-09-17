import {
  fetchPsnLibrary,
  fetchPsnPlayedTitles,
  PsnAuthError,
  type PsnCredentials,
  type PsnLibraryEntry,
  type PsnPlayedTitle,
} from '../external/psn';
import { IGDB_PS_STORE_SOURCE } from '../external/igdb';
import { decryptCredentials } from '../lib/crypto';
import {
  type ImportReport,
  importLibrary,
  type LibraryEntry,
} from './library-import';
import { toPlatformSlug, toPlayedPlatformSlug } from './psn-platforms';
import {
  requireReauth,
  type StoreAccountRow,
  storeAccessToken,
} from './store-accounts';

/**
 * Import della libreria PSN.
 *
 * Prima console, e porta con sé le cose che nessun negozio PC aveva:
 *
 * - **la piattaforma la dice la riga**, non il negozio. La stessa libreria
 *   mescola PS4 e PS5, e lo stesso gioco comprato una volta sola in cross-buy
 *   arriva come due voci con lo stesso titolo. Sono due copie vere: a lanciarle
 *   si accende una console diversa, e restano due possessi.
 * - **l'abbonamento**. Su una libreria vera 274 righe su 336 vengono dal PS
 *   Plus, non da un acquisto. Entrano in backlog, ma il possesso se lo ricorda.
 * - **i dischi**, che fra gli acquisti non ci sono. Arrivano dall'elenco dei
 *   giocati, e solo se li si è avviati.
 *
 * L'identità dei giochi viaggia su due elenchi. Gli acquisti non hanno un id che
 * IGDB conosca — il `conceptId` lo dichiarano e lo mandano nullo, 336 su 336 —
 * e si risolvono per nome come Epic e Amazon. I giocati il concept lo portano, e
 * i dischi si risolvono per quello.
 *
 * **Gli acquisti no, nemmeno quando il concept ci sarebbe**, ed è misurato. Il
 * concept è la *scheda del negozio*, non il gioco: la *Master Collection* di Metal
 * Gear sono cinque acquisti — MGS 1, 2, 3, Metal Gear 1 e 2, i contenuti bonus —
 * che si installano e si giocano uno per uno, e fra i giocati stanno tutti sotto
 * lo stesso concept, che su IGDB è la raccolta. Per nome ciascuno trova il suo
 * gioco, con la sua durata; per concept diventerebbero una voce sola. Lo stesso
 * concept di *Horizon Zero Dawn* elenca anche il suo artbook. E in cambio, sulla
 * libreria vera, il concept non recuperava nessun acquisto che il nome
 * perdesse.
 *
 * Su un disco invece il concept è tutto ciò che c'è: la riga dei giocati porta
 * già il nome del concept, e cercarlo per nome non direbbe niente di più. Un
 * disco di una raccolta finisce sulla raccolta, che è ciò che si è inserito.
 */

type Ore = { playtimeMinutes: number | null; lastPlayedAt: Date | null };

/**
 * Da ciò che Sony restituisce alle voci di libreria: gli acquisti, più i dischi.
 *
 * Funzione pura, ed è apposta: qui si decide cosa diventa un possesso, e
 * provarlo non deve voler dire parlare con Sony.
 */
export function buildPsnEntries(
  library: PsnLibraryEntry[],
  giocati: PsnPlayedTitle[],
): { entries: LibraryEntry[]; scartate: string[]; dischi: number } {
  // La chiave è il `titleId`, che l'elenco degli acquisti non dichiara come
  // campo suo: sta dentro l'`entitlementId`, e da lì lo estrae il client. È
  // l'aggancio esatto che evita un match per titolo fra due liste della stessa
  // persona.
  const oreDi = new Map<string, Ore>();
  for (const title of giocati) {
    oreDi.set(title.titleId.toUpperCase(), {
      playtimeMinutes: title.playtimeMinutes,
      lastPlayedAt: title.lastPlayedAt,
    });
  }

  const entries: LibraryEntry[] = [];
  const scartate: string[] = [];
  const acquistati = new Set<string>();

  for (const raw of library) {
    // Senza piattaforma non si può scrivere il possesso: la colonna è NOT NULL
    // e ha una FK su `platforms`. Meglio perdere la riga con un log che
    // indovinare una console su cui poi si filtra — vedi `psn-platforms.ts`.
    const platformSlug = toPlatformSlug(raw.platform);
    // L'id esterno è il `titleId`, che è **per console**: il cross-buy PS4/PS5
    // dà due id distinti per lo stesso gioco, ed è giusto così — sono le due
    // copie.
    const externalId = raw.titleId ?? raw.entitlementId;
    if (!platformSlug || !externalId) {
      scartate.push(`${raw.name} [${raw.platform}]`);
      continue;
    }
    acquistati.add(externalId.toUpperCase());

    const ore = oreDi.get(externalId.toUpperCase());
    entries.push({
      externalId,
      name: raw.name,
      platformSlug,
      playtimeMinutes: ore?.playtimeMinutes ?? null,
      lastPlayedAt: ore?.lastPlayedAt ?? null,
      subscription:
        raw.subscription && raw.subscription.toUpperCase() !== 'NONE'
          ? 'ps_plus'
          : null,
      medium: 'digital',
    });
  }

  // I dischi: giocati **senza nessun diritto digitale** sull'account. Solo
  // `other`, e non per prudenza: gli altri giocati assenti dagli acquisti sono
  // Plus scaduti e acquisti spariti dal negozio, che di tuo non hanno niente o
  // di cui non sappiamo abbastanza. Il prezzo noto è che un disco prestato entra
  // come fosse tuo, e un gioco preinstallato come Astro's Playroom pure — che
  // però sulla console c'è davvero.
  //
  // Se il `titleId` è anche fra gli acquisti la voce c'è già: un diritto
  // digitale copre il disco.
  let dischi = 0;
  for (const title of giocati) {
    if (title.service !== 'other') continue;
    if (acquistati.has(title.titleId.toUpperCase())) continue;

    const platformSlug = toPlayedPlatformSlug(title.category, title.titleId);
    if (!platformSlug) {
      scartate.push(`${title.name} [${title.category ?? 'senza categoria'}]`);
      continue;
    }

    dischi += 1;
    entries.push({
      externalId: title.titleId,
      name: title.name,
      platformSlug,
      playtimeMinutes: title.playtimeMinutes,
      lastPlayedAt: title.lastPlayedAt,
      subscription: null,
      medium: 'physical',
      igdbLookup: title.conceptId
        ? { source: IGDB_PS_STORE_SOURCE, uid: title.conceptId }
        : null,
    });
  }

  return { entries, scartate, dischi };
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
    // L'altro elenco: le ore, i concept e i dischi. Cosa ne entra lo decide
    // `buildPsnEntries`.
    giocati = await fetchPsnPlayedTitles(accessToken, accountId);
  } catch (error) {
    // Il token era valido un istante fa e Sony lo rifiuta lo stesso: revocato
    // mentre giravamo. Stessa uscita del rinnovo fallito.
    if (error instanceof PsnAuthError) return requireReauth(account);
    throw error;
  }

  const { entries, scartate, dischi } = buildPsnEntries(library, giocati);

  if (scartate.length > 0) {
    console.log(
      `[import] psn: ${scartate.length} voci saltate, piattaforma sconosciuta: ${scartate.slice(0, 10).join(', ')}`,
    );
  }
  if (dischi > 0) {
    console.log(`[import] psn: ${dischi} dischi dall'elenco dei giocati`);
  }

  return importLibrary(account, entries);
}
