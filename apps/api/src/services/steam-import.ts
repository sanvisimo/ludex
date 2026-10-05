import { db, schema } from '@repo/db';
import { and, eq, inArray } from '@repo/db/orm';

import {
  fetchSteamFamilyLibrary,
  fetchSteamLibrary,
  type SteamFamilyLibrary,
  type SteamLibraryEntry,
  SteamUnauthorizedError,
} from '../external/steam';
import { findGameIdsByExternalIds } from './games';
import {
  type ImportReport,
  importLibrary,
  type LibraryEntry,
} from './library-import';
import { hasPersonalData } from './personal-data';
import {
  requireReauth,
  type StoreAccountRow,
  storeAccessToken,
} from './store-accounts';

/**
 * Import della libreria Steam.
 *
 * Allo step 4 questo file conteneva tutto; al 9a il corpo è passato in
 * `library-import.ts`, che lo condivide con GOG, Epic e Amazon. Qui resta solo
 * ciò che è davvero di Steam.
 *
 * **Due modi, sulla stessa riga di `store_accounts`.** Chi ha incollato il
 * profilo non ha credenziale: la libreria si legge con la chiave
 * dell'applicazione, e basta che il profilo sia pubblico. Chi ha fatto il login
 * (9f) ha un refresh token, e l'import legge anche la **famiglia**: le app degli
 * altri membri, che entrano nel backlog come copie `steam_family`. Col login la
 * libreria propria si legge col token, che è l'utente stesso e non dipende da
 * quanto sia privato il profilo.
 */
export type SteamImportReport = ImportReport & {
  /** Solo col login: cosa è successo alle copie della famiglia. */
  family?: FamilyReport;
};

export type FamilyReport = {
  /**
   * Voci della famiglia passate all'import. Non tutte diventano un possesso: le
   * irrisolte finiscono fra gli scarti, come quelle proprie.
   */
  copies: number;
  /** Copie uscite dalla famiglia, e tolte. */
  removed: number;
  /** Uscite dalla famiglia ma rimaste, perché la riga ha dati dell'utente. */
  kept: number;
};

const storePage = (externalId: string) => `app/${externalId}`;

/**
 * Da quando una copia della famiglia è giocabile per l'utente, **stimato**.
 *
 * Non prima che il proprietario l'abbia presa, e non prima che l'utente sia
 * entrato nella famiglia: vale il più recente dei due. È una stima, con due
 * limiti dichiarati — non sappiamo da quando il proprietario è nella famiglia, né
 * se il gioco sia diventato condivisibile dopo — e può risultare **più vecchia**
 * del vero. Come ogni data d'acquisto si porta solo indietro, quindi un errore per
 * eccesso non si corregge più; l'utente ha scelto di accettarlo, perché il giorno
 * dell'import è meno vero.
 *
 * Senza la data d'ingresso non si stima niente: la sola data del proprietario è
 * quella che non va scritta.
 */
export function familyAvailableSince(
  ownerAcquiredAt: Date | null,
  joinedAt: Date | null,
): Date | null {
  if (!joinedAt) return null;
  return ownerAcquiredAt && ownerAcquiredAt > joinedAt
    ? ownerAcquiredAt
    : joinedAt;
}

/**
 * Da ciò che Steam restituisce alle voci di libreria: le proprie, più le copie
 * della famiglia.
 *
 * Funzione pura, ed è apposta: qui si decide cosa diventa un possesso, e
 * provarlo non deve voler dire parlare con Steam.
 *
 * **Le proprie vengono prima**, ed è l'ordine che conta. Due appid possono
 * puntare allo stesso gioco (445 giochi per 447 appid su una libreria vera), e
 * `ensureOwnerships` fonde le righe con la stessa chiave tenendo il
 * `subscription` della **prima**: con la famiglia davanti, una copia comprata
 * uscirebbe marcata `steam_family`, e il giorno che la famiglia la toglie la
 * potatura butterebbe un acquisto.
 *
 * Una copia è della famiglia solo se **nessuna** di queste è vera:
 * - l'utente è fra i proprietari (`ownerSteamIds`): è sua;
 * - è già nella sua libreria (`GetOwnedGames`): con `include_own=false` Steam
 *   toglieva l'utente dai proprietari senza togliere l'app, 70 su 343 sul
 *   primo account misurato, e `include_own=true` non dà quella garanzia sui
 *   casi di confine;
 * - Steam la dichiara non condivisibile (`excludeReason`). Sulla famiglia
 *   misurata non ne scarta nessuna, ma è la guardia di chi la legge male.
 */
export function buildSteamEntries(
  library: SteamLibraryEntry[],
  family: SteamFamilyLibrary,
  steamId: string,
): { entries: LibraryEntry[]; familyCount: number } {
  // La data d'acquisto Steam la dà solo la famiglia, e **solo per le app dove
  // l'utente è proprietario** vale la sua: per un'app in comune con un parente la
  // risposta con `include_own=true` rende la data dell'utente (misurato su
  // *Portal*: 2025-07-02 contro il 2011 del proprietario che la risposta senza
  // `include_own` mostrava, e la pagina delle licenze di Steam dà il 2025).
  // Mancano le poche app che la libreria propria ha e la famiglia no: restano
  // senza data, che è come stavano.
  const acquiredAt = new Map(
    family.apps
      .filter((app) => app.ownerSteamIds.includes(steamId))
      .map((app) => [app.externalId, app.acquiredAt]),
  );

  const own: LibraryEntry[] = library.map((entry) => ({
    ...entry,
    // La pagina del negozio è l'appid stesso: `storePageUrl` ci mette davanti il
    // dominio.
    storePage: storePage(entry.externalId),
    acquiredAt: acquiredAt.get(entry.externalId) ?? null,
  }));

  const ownIds = new Set(library.map((entry) => entry.externalId));

  const shared: LibraryEntry[] = family.apps
    .filter(
      (app) =>
        !app.ownerSteamIds.includes(steamId) &&
        !ownIds.has(app.externalId) &&
        app.excludeReason === null,
    )
    .map((app) => ({
      externalId: app.externalId,
      name: app.name,
      // Le ore e l'ultima partita sono dell'utente: `rt_playtime` coincide con
      // `playtime_forever` dove si può confrontare.
      playtimeMinutes: app.playtimeMinutes,
      lastPlayedAt: app.lastPlayedAt,
      // Una **stima**, non la data del proprietario: quella è del 2008 per un gioco
      // che l'utente ha in famiglia da settembre 2024, e farebbe arretrare per
      // sempre `backlog.added_at`, che si porta solo indietro.
      acquiredAt: familyAvailableSince(app.acquiredAt, family.joinedAt),
      subscription: 'steam_family',
      storePage: storePage(app.externalId),
    }));

  return { entries: [...own, ...shared], familyCount: shared.length };
}

/**
 * Toglie le copie della famiglia che la famiglia non ha più.
 *
 * `keepGameIds` sono i giochi che la famiglia **ha ancora**. Delle copie
 * `steam_family` di questo account, quelle su altri giochi sono uscite, e il
 * destino lo decide ciò che c'è sopra:
 *
 * - **c'è un'altra copia** dello stesso gioco (comprato su GOG, inserito a
 *   mano): esce solo questa;
 * - **non ce ne sono e la riga non ha niente dell'utente**: esce la copia e
 *   anche la riga di backlog, che era solo il riflesso della famiglia;
 * - **non ce ne sono e la riga ha dati dell'utente** (voto, note, tag, stato):
 *   **la copia resta**. Una riga di backlog senza nessun possesso non è uno stato
 *   legittimo — la piattaforma è il filtro hard di «cosa gioco adesso» — e
 *   cancellarla porterebbe via un voto perché un parente ha tolto la licenza.
 *
 * Scritta in modo che un fallimento non possa potare per errore: la chiama solo
 * chi ha letto la famiglia **per intero**. Una rete che cade non è un'uscita.
 */
export async function pruneFamilyCopies(
  account: StoreAccountRow,
  keepGameIds: Set<string>,
): Promise<Pick<FamilyReport, 'removed' | 'kept'>> {
  return db.transaction(async (tx) => {
    const copie = await tx
      .select({
        id: schema.ownerships.id,
        backlogId: schema.ownerships.backlogId,
        gameId: schema.backlog.gameId,
        personale: hasPersonalData,
      })
      .from(schema.ownerships)
      .innerJoin(
        schema.backlog,
        eq(schema.backlog.id, schema.ownerships.backlogId),
      )
      .where(
        and(
          eq(schema.ownerships.storeAccountId, account.id),
          eq(schema.ownerships.subscription, 'steam_family'),
        ),
      );

    const uscite = copie.filter((copia) => !keepGameIds.has(copia.gameId));
    if (uscite.length === 0) return { removed: 0, kept: 0 };

    const backlogIds = [...new Set(uscite.map((copia) => copia.backlogId))];
    const tutte = await tx
      .select({
        id: schema.ownerships.id,
        backlogId: schema.ownerships.backlogId,
      })
      .from(schema.ownerships)
      .where(inArray(schema.ownerships.backlogId, backlogIds));

    const idUscite = new Set(uscite.map((copia) => copia.id));
    const daTogliere: string[] = [];
    const righeOrfane: string[] = [];
    let kept = 0;

    for (const backlogId of backlogIds) {
      const dellaRiga = uscite.filter((copia) => copia.backlogId === backlogId);
      const restano = tutte.filter(
        (copia) => copia.backlogId === backlogId && !idUscite.has(copia.id),
      ).length;

      if (restano > 0) {
        daTogliere.push(...dellaRiga.map((copia) => copia.id));
      } else if (!dellaRiga[0]!.personale) {
        daTogliere.push(...dellaRiga.map((copia) => copia.id));
        righeOrfane.push(backlogId);
      } else {
        kept += dellaRiga.length;
      }
    }

    if (daTogliere.length > 0) {
      await tx
        .delete(schema.ownerships)
        .where(inArray(schema.ownerships.id, daTogliere));
    }
    if (righeOrfane.length > 0) {
      await tx
        .delete(schema.backlog)
        .where(
          and(
            eq(schema.backlog.userId, account.userId),
            inArray(schema.backlog.id, righeOrfane),
          ),
        );
    }

    return { removed: daTogliere.length, kept };
  });
}

export async function importSteamLibrary(
  account: StoreAccountRow,
): Promise<SteamImportReport> {
  // Senza credenziale: il profilo pubblico, come allo step 4.
  if (!account.credentials) {
    const library = await fetchSteamLibrary(account.externalAccountId);
    return importLibrary(
      account,
      library.map((entry) => ({
        ...entry,
        storePage: storePage(entry.externalId),
      })),
    );
  }

  const steamId = account.externalAccountId;
  const accessToken = await storeAccessToken(account);

  let library: SteamLibraryEntry[];
  let family: SteamFamilyLibrary;
  try {
    library = await fetchSteamLibrary(steamId, accessToken);
    family = await fetchSteamFamilyLibrary(accessToken, steamId);
  } catch (error) {
    // Il token era valido un istante fa e Steam lo rifiuta lo stesso: revocato
    // mentre giravamo. Stessa uscita del rinnovo fallito.
    if (error instanceof SteamUnauthorizedError) return requireReauth(account);
    throw error;
  }

  const { entries, familyCount } = buildSteamEntries(library, family, steamId);
  const report = await importLibrary(account, entries);

  // I giochi che la famiglia ha ancora: si risolvono dall'appid **dopo**
  // l'import, che è ciò che ha scritto le mappature dei giochi appena nati.
  const gameIds = await findGameIdsByExternalIds(
    'steam',
    entries
      .filter((entry) => entry.subscription === 'steam_family')
      .map((entry) => entry.externalId),
  );
  const { removed, kept } = await pruneFamilyCopies(
    account,
    new Set(gameIds.values()),
  );

  console.log(
    `[import] steam famiglia: ${familyCount} copie, ${removed} uscite e tolte` +
      (kept > 0 ? `, ${kept} rimaste perché hanno dati tuoi` : ''),
  );

  return { ...report, family: { copies: familyCount, removed, kept } };
}
