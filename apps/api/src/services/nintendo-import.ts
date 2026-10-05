import {
  fetchNintendoPlayHistory,
  fetchNintendoVgc,
  NintendoAuthError,
  type NintendoPlayedTitle,
  type NintendoVgcEntry,
} from '../external/nintendo';
import {
  type ImportReport,
  importLibrary,
  type LibraryEntry,
} from './library-import';
import {
  nintendoCredentials,
  requireReauth,
  type StoreAccountRow,
} from './store-accounts';

/**
 * Import della libreria Nintendo.
 *
 * **Due fonti che si completano**, e nessuna basta da sola (misurato il
 * 06/10/2026 su un account con 19 licenze digitali e 37 giochi giocati):
 *
 * - le **Virtual Game Cards** sono la libreria digitale, **anche mai avviata**
 *   (*Hyrule Warriors: Age of Calamity* e *Blanc* sono lì e non hanno una sola
 *   ora di gioco), ma non hanno le cartucce;
 * - lo **storico di gioco** ha ciò che si è avviato, **cartucce comprese**
 *   (*Zelda: Tears of the Kingdom* e *Super Mario Bros. Wonder* sono solo qui),
 *   ma non ciò che non si è mai avviato.
 *
 * È la stessa forma dei dischi PSN: un titolo **nello storico e senza una
 * licenza digitale** è con ogni probabilità una cartuccia, e il possesso lo dice
 * (`medium: physical`). Su un account vero regge su **quattro casi su cinque**:
 * *Bayonetta* (il codice incluso con la cartuccia di *Bayonetta 2* è un diritto
 * digitale ed è nelle Virtual Game Cards) e le cartucce vere vanno bene; ***Tetris
 * 99* sbaglia**. È digitale, è nello storico, e **non è fra le licenze né visibili né
 * nascoste** (misurato il 06/10/2026, `isHidden: true` rende zero voci): quindi
 * risulta «fisico». La classe che sbaglia è quella dei giochi gratuiti o legati
 * all'abbonamento, che si risolvono su IGDB e **entrano come possesso**, e
 * l'utente non può correggere il supporto di una copia: **scelto così dall'utente
 * il 06/10/2026**, per non perdere il «Fisico» sulle cartucce vere. **Una cartuccia mai avviata
 * non lascia traccia da nessuna parte**, come un disco PSN mai avviato: resta
 * l'inserimento a mano.
 *
 * **Le voci con solo contenuti aggiuntivi non sono una copia del gioco.** *Zelda:
 * Breath of the Wild* è una voce delle Virtual Game Cards con
 * `hasReleasedApplication: false`: è l'aggiornamento gratuito, e il gioco è la
 * cartuccia, che viene dallo storico. Importarla come digitale darebbe un doppione
 * falso. Si saltano, come i DLC di Epic che collassano sul gioco.
 *
 * L'id esterno è l'`applicationId` / `titleId`, **in minuscolo da tutte e due le
 * parti**: sono 16 esadecimali e dovrebbero coincidere (stessa forma, ed è l'id
 * canonico dei titoli Switch), ma **la coincidenza non è verificata** su un titolo
 * in comune. Se non coincidessero lo si vedrebbe subito: ogni gioco giocato e
 * digitale comparirebbe due volte.
 *
 * Il match con IGDB è **per nome**, come Epic, Amazon e PSN.
 */

/**
 * Il codice di piattaforma di Nintendo → la nostra piattaforma.
 *
 * Come `psn-platforms.ts`, e scritta a mano per la stessa ragione: sulla
 * piattaforma si decide **su cosa l'utente possiede il gioco**, il filtro hard
 * del motore decisionale. Davanti a un codice che non conosciamo non si ripiega
 * su Switch 1, e si salta con un log.
 *
 * `HAC` è dello storico e `NX` delle Virtual Game Cards, e sono tutte e due
 * misurate. `OUNCE` — la Switch 2 — viene dal codice di Playnite (l'estensione
 * Nintendo di XenorPLxx), **non è misurato**: l'account di prova non ha giochi
 * Switch 2. Il codice dello **storico** per la Switch 2 non si conosce, e finché
 * non compare in un log quei giochi, lì, non entrano.
 */
const PLATFORMS: Record<string, string> = {
  HAC: 'nintendo_switch',
  NX: 'nintendo_switch',
  OUNCE: 'nintendo_switch2',
};

export function toPlatformSlug(code: string | null): string | null {
  return code ? (PLATFORMS[code.trim().toUpperCase()] ?? null) : null;
}

/**
 * Dalle due fonti alle voci di libreria.
 *
 * Funzione pura, ed è apposta: qui si decide cosa diventa un possesso, e
 * provarlo non deve voler dire parlare con Nintendo.
 *
 * `vgc` è `null` quando non si sono lette le Virtual Game Cards (paese
 * sconosciuto). Allora **non si può dire** se un titolo dello storico è fisico o
 * digitale, e `medium` resta non dichiarato: dire «fisico» sarebbe falso per
 * quasi tutta la libreria digitale che si è giocata.
 *
 * Il primo avvio **non** è la data d'acquisto e non va in `acquiredAt`: dice
 * quando si è cominciato a giocare, e scriverlo lì farebbe arretrare
 * `backlog.added_at` su un'informazione che non è quella.
 */
export function buildNintendoEntries(
  history: NintendoPlayedTitle[],
  vgc: NintendoVgcEntry[] | null,
): {
  entries: LibraryEntry[];
  scartate: string[];
  digitali: number;
  fisici: number;
  soloContenuti: number;
  nonTue: number;
} {
  const entries: LibraryEntry[] = [];
  const scartate: string[] = [];
  const giocati = new Map(
    history.map((title) => [title.titleId.toLowerCase(), title]),
  );
  const digitali = new Set<string>();
  let soloContenuti = 0;
  let nonTue = 0;
  let fisici = 0;

  for (const card of vgc ?? []) {
    // L'aggiornamento o i DLC di un gioco che si ha altrove: non è una copia.
    if (!card.hasApplication) {
      soloContenuti += 1;
      continue;
    }
    const platformSlug = toPlatformSlug(card.platform);
    if (!platformSlug) {
      scartate.push(`${card.name} [${card.platform ?? 'senza piattaforma'}]`);
      continue;
    }
    // Un gioco che sta sull'account di un altro e si può usare in prestito: non
    // lo si tratta, ma si conta, perché non è misurato come si presenta.
    if (
      card.isLending ||
      (card.ownerNaId && card.userNaId && card.ownerNaId !== card.userNaId)
    ) {
      nonTue += 1;
    }

    const giocato = giocati.get(card.applicationId);
    digitali.add(card.applicationId);
    entries.push({
      externalId: card.applicationId,
      name: card.name,
      platformSlug,
      playtimeMinutes: giocato?.playtimeMinutes ?? null,
      lastPlayedAt: giocato?.lastPlayedAt ?? null,
      medium: 'digital',
      imageUrl: card.imageUrl,
    });
  }

  for (const title of history) {
    const externalId = title.titleId.toLowerCase();
    if (digitali.has(externalId)) continue;

    const platformSlug = toPlatformSlug(title.platform);
    if (!platformSlug) {
      scartate.push(`${title.name} [${title.platform ?? 'senza piattaforma'}]`);
      continue;
    }
    if (vgc) fisici += 1;
    entries.push({
      externalId,
      name: title.name,
      platformSlug,
      playtimeMinutes: title.playtimeMinutes,
      lastPlayedAt: title.lastPlayedAt,
      ...(vgc ? { medium: 'physical' as const } : {}),
    });
  }

  return {
    entries,
    scartate,
    digitali: digitali.size,
    fisici,
    soloContenuti,
    nonTue,
  };
}

export async function importNintendoLibrary(
  account: StoreAccountRow,
): Promise<ImportReport> {
  // L'access token, e con lui l'`id_token` e il paese, già rinnovati.
  const credentials = await nintendoCredentials(account);

  let history;
  let vgc: NintendoVgcEntry[] | null = null;
  try {
    history = await fetchNintendoPlayHistory(credentials.accessToken);
    if (credentials.country) {
      vgc = await fetchNintendoVgc(credentials.idToken, credentials.country);
    } else {
      // Non si indovina un paese. Lo storico entra lo stesso; le Virtual Game
      // Cards no, e di conseguenza nessun titolo è dichiarato fisico o digitale.
      console.log(
        '[import] nintendo: paese dell’account sconosciuto, salto le Virtual Game Cards: ricollega l’account per riprovare a leggerlo dal profilo',
      );
    }
  } catch (error) {
    // Il token era valido un istante fa e Nintendo lo rifiuta lo stesso:
    // revocato mentre giravamo. Stessa uscita del rinnovo fallito.
    if (error instanceof NintendoAuthError) return requireReauth(account);
    // Un errore delle Virtual Game Cards **non** degrada allo storico: senza di
    // loro l'import direbbe «fisico» di giochi che sono digitali. Il job riprova.
    throw error;
  }

  const { entries, scartate, digitali, fisici, soloContenuti, nonTue } =
    buildNintendoEntries(history, vgc);

  if (vgc) {
    console.log(
      `[import] nintendo: ${digitali} digitali, ${fisici} fisici (nello storico e non fra le Virtual Game Cards), ${soloContenuti} voci di soli contenuti aggiuntivi saltate`,
    );
  }
  if (nonTue > 0) {
    console.log(
      `[import] nintendo: ${nonTue} voci in prestito o di un altro account, importate come le altre`,
    );
  }
  if (scartate.length > 0) {
    console.log(
      `[import] nintendo: ${scartate.length} voci saltate, piattaforma sconosciuta: ${scartate.slice(0, 10).join(', ')}`,
    );
  }

  return importLibrary(account, entries);
}
