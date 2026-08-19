import { db, schema, type Db } from '@repo/db';
import { and, eq, isNotNull, isNull, lt, ne, or, sql } from '@repo/db/orm';

/**
 * La pipeline di enrichment, per la parte che è uguale a tutte le fonti: quali
 * giochi sono dovuti, e come si annota l'esito di un tentativo.
 *
 * Ciò che invece **non** è uguale sta in un file per fonte (`igdb-enrichment`,
 * `hltb-enrichment`): è la regola del CLAUDE.md, e non è formale. Le fonti
 * arrivano in step diversi, si aggiornano a ritmi diversi e falliscono in modi
 * diversi; un job monolitico che le tocca tutte insieme le costringerebbe allo
 * stesso ritmo e le farebbe cadere insieme.
 */

export type EnrichmentSource =
  | 'igdb'
  | 'hltb'
  | 'opencritic'
  | 'metacritic';

/** Il `tx` che Drizzle passa dentro `db.transaction`, senza doverlo nominare. */
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

export const ENRICHMENT_SOURCES = {
  igdb: {
    // Voti, copertine e sommari si muovono, ma piano: sotto il mese si
    // spenderebbero chiamate per riscrivere le stesse righe.
    staleAfterDays: 30,
    retryAfterHours: 24,
    // Un gioco senza `igdbId` non è risolto: non c'è niente da chiedere.
    requires: 'igdbId',
  },
  opencritic: {
    // Tre mesi. Un voto della critica si muove nelle settimane dopo l'uscita,
    // mentre arrivano le recensioni, e poi si ferma per sempre: riprenderlo
    // più spesso vorrebbe dire spendere il budget giornaliero per riscrivere
    // lo stesso numero.
    staleAfterDays: 90,
    retryAfterHours: 24,
    // Come HLTB: serve il titolo canonico, e serve l'anno per verificare il
    // match. In più serve lo slug, che è quello che l'enrichment IGDB salva e
    // da cui passa l'aggancio via Wikidata.
    requires: 'igdbOk',
  },
  metacritic: {
    // Come OpenCritic: un voto della critica si assesta nelle settimane dopo
    // l'uscita e poi non si muove più. Qui però non c'è un budget giornaliero
    // da difendere, solo la buona educazione verso un endpoint che non è
    // un'API pubblica.
    staleAfterDays: 90,
    retryAfterHours: 24,
    // Serve il titolo canonico e l'anno: sono le due cose con cui si sceglie
    // fra i due "Resident Evil 4", che qui esistono davvero entrambi —
    // `resident-evil-4` è il remake del 2023, `resident-evil-4-2005` no.
    requires: 'igdbOk',
  },
  hltb: {
    // Sei mesi. I tempi di HLTB si muovono molto più piano dei dati IGDB: sono
    // medie su migliaia di segnalazioni, e mille in più non le spostano.
    staleAfterDays: 180,
    retryAfterHours: 24,
    // HLTB parte solo su un gioco che IGDB ha già arricchito, perché il match si
    // fa sul titolo canonico e sull'anno di uscita: senza quei due, scegliere
    // fra i due "Resident Evil 4" è un lancio di moneta. Costo accettato: un
    // gioco che IGDB non conosce non avrà mai una durata.
    requires: 'igdbOk',
  },
} as const satisfies Record<
  EnrichmentSource,
  { staleAfterDays: number; retryAfterHours: number; requires: string }
>;

export const ENRICHMENT_SOURCE_NAMES = Object.keys(
  ENRICHMENT_SOURCES,
) as EnrichmentSource[];

/**
 * Annota l'esito di un tentativo su una fonte.
 *
 * `externalId` ha tre stati e non due: assente vuol dire "non toccarlo" — un
 * fallimento temporaneo non deve far dimenticare l'aggancio già trovato — null
 * vuol dire "scollegalo", e una stringa lo scrive.
 *
 * Accetta un `executor` perché la fonte va segnata **nella stessa transazione**
 * in cui si scrivono i dati che ha portato: separarle lascerebbe la porta a un
 * gioco marcato sincronizzato e vuoto, che nessuna spazzata riproverebbe.
 */
export async function markSource(
  values: {
    gameId: string;
    source: EnrichmentSource;
    status: 'ok' | 'failed' | 'not_found';
    error?: string | null;
    externalId?: string | null;
  },
  executor: Db | Transaction = db,
) {
  const now = new Date();
  const { gameId, source, status } = values;
  const error = values.error ?? null;
  const touchesExternalId = values.externalId !== undefined;

  await executor
    .insert(schema.gameSources)
    .values({
      gameId,
      source,
      status,
      // `syncedAt` si muove solo sul successo: è il campo su cui si decide
      // cosa riaccodare, e un fallimento non deve far sembrare fresco un dato.
      syncedAt: status === 'ok' ? now : null,
      attemptedAt: now,
      error,
      externalId: values.externalId ?? null,
    })
    .onConflictDoUpdate({
      target: [schema.gameSources.gameId, schema.gameSources.source],
      set: {
        status,
        attemptedAt: now,
        error,
        updatedAt: now,
        ...(status === 'ok' ? { syncedAt: now } : {}),
        ...(touchesExternalId ? { externalId: values.externalId ?? null } : {}),
      },
    });
}

/** L'id del gioco sulla fonte, se l'abbiamo già trovato una volta. */
export async function findSourceExternalId(
  gameId: string,
  source: EnrichmentSource,
) {
  const row = await db.query.gameSources.findFirst({
    columns: { externalId: true },
    where: and(
      eq(schema.gameSources.gameId, gameId),
      eq(schema.gameSources.source, source),
    ),
  });
  return row?.externalId ?? null;
}

/**
 * Quello che una fonte pretende da un gioco prima ancora di provarci.
 *
 * `igdbOk` è una EXISTS e non una JOIN in più perché la JOIN che c'è già è sulla
 * fonte corrente: quando la fonte corrente *è* IGDB le due si sovrapporrebbero,
 * e servirebbe un alias per una condizione che qui si legge in una riga.
 */
function requirement(requires: 'igdbId' | 'igdbOk') {
  if (requires === 'igdbId') return isNotNull(schema.games.igdbId);
  return sql`exists (
    select 1 from game_sources igdb
    where igdb.game_id = ${schema.games.id} and igdb.source = 'igdb' and igdb.status = 'ok'
  )`;
}

/**
 * Giochi da (ri)arricchire con una fonte.
 *
 * «Da riarricchire» non è «mai arricchito»: un gioco sincronizzato mesi fa è un
 * candidato quanto uno mai visto, altrimenti la coda va in quiescenza appena il
 * primo giro finisce e i dati invecchiano senza che nessuno lo dica.
 *
 * Tre cose del predicato che non sono ovvie rileggendolo:
 *
 * - il ramo `game_sources.game_id IS NULL` è obbligatorio, non difensivo. Con la
 *   LEFT JOIN, su un gioco mai tentato tutte le colonne di `game_sources` sono
 *   NULL, e `status <> 'not_found'` vale NULL: senza questo ramo i giochi nuovi —
 *   quelli che servono di più — spariscono dal risultato.
 * - `attempted_at` governa i fallimenti temporanei. `synced_at` da solo non basta:
 *   su un gioco che fallisce resta indietro, e la spazzata lo riaccoderebbe ogni
 *   sei ore.
 * - l'ordinamento non è cosmetico. Se i candidati sono più del limite, senza
 *   ORDER BY Postgres può restituire le stesse righe a ogni giro e lasciarne
 *   altre a digiuno per sempre. `nulls first` mette davanti i mai sincronizzati.
 */
export function findGamesNeedingSource(source: EnrichmentSource, limit = 100) {
  const config = ENRICHMENT_SOURCES[source];

  return (
    db
      .select({ id: schema.games.id })
      .from(schema.games)
      .leftJoin(
        schema.gameSources,
        and(
          eq(schema.gameSources.gameId, schema.games.id),
          eq(schema.gameSources.source, source),
        ),
      )
      .where(
        and(
          requirement(config.requires),
          or(
            isNull(schema.gameSources.gameId),
            and(
              ne(schema.gameSources.status, 'not_found'),
              or(
                isNull(schema.gameSources.syncedAt),
                lt(
                  schema.gameSources.syncedAt,
                  sql`now() - ${config.staleAfterDays} * interval '1 day'`,
                ),
              ),
              or(
                isNull(schema.gameSources.attemptedAt),
                lt(
                  schema.gameSources.attemptedAt,
                  sql`now() - ${config.retryAfterHours} * interval '1 hour'`,
                ),
              ),
            ),
          ),
        ),
      )
      // `sql` grezzo e non `asc()`: quello avvolge l'espressione e produrrebbe
      // `synced_at nulls first asc`, che Postgres rifiuta.
      .orderBy(sql`${schema.gameSources.syncedAt} asc nulls first`)
      .limit(limit)
  );
}
