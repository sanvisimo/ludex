import type { BacklogQuery } from '@repo/contracts';
import type { Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import {
  and,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  notExists,
  sql,
} from '@repo/db/orm';
import type { SQL } from '@repo/db/orm';

import { entryQuery, toEntry } from './backlog';

/**
 * Ricerca e filtraggio del backlog (step 7).
 *
 * Sta in un file suo e non in `backlog.ts` perché è l'unica lettura composta del
 * progetto: tutto il resto legge una riga o le legge tutte.
 *
 * La regola dell'architettura vale qui alla lettera: **i filtri hard li fa SQL**.
 * Niente si carica in memoria per poi scartarlo, e il conteggio totale arriva
 * dal database e non da un `.length` su una lista già tagliata.
 */

// I caratteri jolly di LIKE. Chi cerca "50%" cerca quella stringa, non "50" più
// qualunque cosa, e senza questo un `_` in un titolo diventerebbe "un carattere
// qualsiasi". La backslash va per prima o raddoppierebbe le proprie fughe.
function escapeLike(term: string) {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Il gioco ha una fine, o quel numero non è una durata.
 *
 * `IS NOT FALSE` e non `IS TRUE`: `hltbHasSolo` è nullo su tutto ciò che HLTB
 * non ha ancora visto, e "non lo so" non è "non ha una campagna". Escludere i
 * NULL qui vorrebbe dire che il filtro durata non trova nulla finché
 * l'enrichment non è passato su tutta la libreria.
 */
const haUnaFine = sql`${schema.games.hltbHasSolo} is not false`;

/**
 * Un `EXISTS` correlato per ogni valore selezionato, tutti in AND.
 *
 * È la forma dell'AND sui multi-valore, e la ragione per cui non si usano JOIN:
 * un gioco con tre tag uscirebbe tre volte dalla stessa query, e il `LIMIT`
 * conterebbe righe di join invece che giochi.
 */
function tuttiPresenti<T>(valori: T[], predicato: (valore: T) => SQL): SQL[] {
  return valori.map(predicato);
}

function buildConditions(userId: string, input: BacklogQuery): SQL[] {
  const conditions: SQL[] = [eq(schema.backlog.userId, userId)];

  if (input.q) {
    conditions.push(ilike(schema.games.name, `%${escapeLike(input.q)}%`));
  }

  // In OR, al contrario di tutto il resto: una riga ha esattamente uno stato,
  // quindi l'AND darebbe zero risultati sempre.
  if (input.status?.length) {
    conditions.push(inArray(schema.backlog.status, input.status));
  }

  if (input.platforms?.length) {
    conditions.push(
      ...tuttiPresenti(input.platforms, (slug) =>
        exists(
          db
            .select({ uno: sql`1` })
            .from(schema.ownerships)
            .where(
              and(
                eq(schema.ownerships.backlogId, schema.backlog.id),
                eq(schema.ownerships.platformSlug, slug),
              ),
            ),
        ),
      ),
    );
  }

  if (input.stores?.length) {
    conditions.push(
      ...tuttiPresenti(input.stores, (store) =>
        exists(
          db
            .select({ uno: sql`1` })
            .from(schema.ownerships)
            .where(
              and(
                eq(schema.ownerships.backlogId, schema.backlog.id),
                eq(schema.ownerships.store, store),
              ),
            ),
        ),
      ),
    );
  }

  // Parte da `games` e non da `backlog`: generi e temi sono attributi del gioco,
  // condivisi fra tutti gli utenti. Sono l'altra tassonomia, non i tag.
  if (input.attributes?.length) {
    conditions.push(
      ...tuttiPresenti(input.attributes, (attributeId) =>
        exists(
          db
            .select({ uno: sql`1` })
            .from(schema.gameAttributes)
            .where(
              and(
                eq(schema.gameAttributes.gameId, schema.backlog.gameId),
                eq(schema.gameAttributes.attributeId, attributeId),
              ),
            ),
        ),
      ),
    );
  }

  // Un id di un altro utente non ha bisogno di essere respinto: `backlog_tags`
  // lega solo righe di backlog di chi possiede il tag, e la query è già scoped
  // sullo userId. Un id altrui semplicemente non trova nulla.
  if (input.tags?.length) {
    conditions.push(
      ...tuttiPresenti(input.tags, (tagId) =>
        exists(
          db
            .select({ uno: sql`1` })
            .from(schema.backlogTags)
            .where(
              and(
                eq(schema.backlogTags.backlogId, schema.backlog.id),
                eq(schema.backlogTags.tagId, tagId),
              ),
            ),
        ),
      ),
    );
  }

  // I confronti escludono i NULL da soli — in SQL `null <= 120` non è vero — e
  // va bene così: un gioco senza durata non è un gioco corto. Il guard sulla
  // fine invece va aggiunto, o le 143 ore di Counter-Strike 2 entrerebbero fra
  // i giochi lunghi.
  if (input.durationMin !== undefined) {
    conditions.push(
      gte(schema.games.hltbMainMinutes, input.durationMin),
      haUnaFine,
    );
  }
  if (input.durationMax !== undefined) {
    conditions.push(
      lte(schema.games.hltbMainMinutes, input.durationMax),
      haUnaFine,
    );
  }

  if (input.ratingMin !== undefined) {
    conditions.push(gte(schema.backlog.rating, input.ratingMin));
  }
  if (input.ratingMax !== undefined) {
    conditions.push(lte(schema.backlog.rating, input.ratingMax));
  }

  // Il voto della critica è `games.criticScore`: il migliore che abbiamo per
  // quel gioco secondo la precedenza fra le fonti, non più il solo IGDB. La
  // colonna è denormalizzata apposta — qui serviva un confronto su una colonna,
  // non tre sottoquery correlate dentro la query più complessa del progetto.
  if (input.criticMin !== undefined) {
    conditions.push(gte(schema.games.criticScore, input.criticMin));
  }

  // L'anno arriva come numero e la colonna è un timestamp: il confronto si fa
  // sugli estremi dell'anno, non estraendo l'anno da ogni riga — così l'indice
  // sulla colonna resta utilizzabile il giorno che servirà.
  if (input.releasedFrom !== undefined) {
    conditions.push(
      gte(
        schema.games.firstReleaseDate,
        new Date(Date.UTC(input.releasedFrom, 0, 1)),
      ),
    );
  }
  if (input.releasedTo !== undefined) {
    conditions.push(
      lt(
        schema.games.firstReleaseDate,
        new Date(Date.UTC(input.releasedTo + 1, 0, 1)),
      ),
    );
  }

  // "Mai lanciato" e "non lo so" sono la stessa cosa qui, ed è voluto: sugli
  // inserimenti manuali le ore sono NULL perché nessuno le ha mai scritte, e
  // quei giochi devono comparire fra quelli che non hai ancora cominciato.
  if (input.neverPlayed) {
    conditions.push(
      notExists(
        db
          .select({ uno: sql`1` })
          .from(schema.ownerships)
          .where(
            and(
              eq(schema.ownerships.backlogId, schema.backlog.id),
              sql`coalesce(${schema.ownerships.playtimeMinutes}, 0) > 0`,
            ),
          ),
      ),
    );
  }

  return conditions;
}

/**
 * La chiave di ordinamento, come espressione SQL.
 *
 * `lastPlayed` è una sottoquery e non una colonna perché le ore stanno sui
 * possessi: lo stesso gioco su Steam e su GOG ha due "ultima partita", e quella
 * che conta è la più recente.
 */
function sortExpression(sort: BacklogQuery['sort']): SQL {
  switch (sort) {
    case 'name':
      // `lower()` o "Zelda" verrebbe prima di "abzu": in Postgres le maiuscole
      // ordinano per prime.
      return sql`lower(${schema.games.name})`;
    case 'released':
      return sql`${schema.games.firstReleaseDate}`;
    case 'duration':
      return sql`${schema.games.hltbMainMinutes}`;
    case 'rating':
      return sql`${schema.backlog.rating}`;
    case 'criticRating':
      return sql`${schema.games.criticScore}`;
    case 'lastPlayed':
      return sql`(select max(${schema.ownerships.lastPlayedAt}) from ${schema.ownerships} where ${schema.ownerships.backlogId} = ${schema.backlog.id})`;
    case 'addedAt':
      return sql`${schema.backlog.createdAt}`;
  }
}

export async function searchBacklog(userId: string, input: BacklogQuery) {
  const conditions = buildConditions(userId, input);

  // `sql.raw` su un valore che viene da un enum Zod: sono le due sole stringhe
  // possibili, e non c'è modo di passarle come parametro in una ORDER BY.
  const direction = sql.raw(input.direction === 'asc' ? 'asc' : 'desc');

  /**
   * Fase 1: **solo gli id**, già filtrati, ordinati e paginati.
   *
   * Il conteggio totale viene da una window function nella stessa query: è il
   * numero prima di `LIMIT`, e prenderlo così evita un secondo giro al database
   * con gli stessi identici filtri da tenere allineati a mano.
   */
  const rows = await db
    .select({
      id: schema.backlog.id,
      total: sql<number>`count(*) over()`.mapWith(Number),
    })
    .from(schema.backlog)
    .innerJoin(schema.games, eq(schema.games.id, schema.backlog.gameId))
    .where(and(...conditions))
    .orderBy(
      sql`${sortExpression(input.sort)} ${direction} nulls last`,
      // Spareggio obbligatorio, non rifinitura: su `rating` o `duration` i
      // pareggi sono la norma (tutti i non votati valgono uguale), e senza un
      // secondo criterio stabile Postgres è libero di rendere lo stesso insieme
      // in ordine diverso a ogni pagina — con righe che compaiono due volte e
      // altre che non compaiono mai.
      sql`${schema.backlog.id} asc`,
    )
    .limit(input.limit)
    .offset(input.offset);

  if (rows.length === 0) {
    // Zero righe non vuol dire zero risultati: può essere una pagina oltre la
    // fine. Il totale però non c'è — la window function non rende niente su un
    // insieme vuoto — e ricalcolarlo qui costerebbe una query per un caso che
    // la UI non produce. Chi pagina oltre la fine sa già quanti sono.
    return { entries: [], total: 0 };
  }

  const ids = rows.map((row) => row.id);
  const total = rows[0]?.total ?? 0;

  // Fase 2: idratazione con la forma condivisa. La query relazionale di Drizzle
  // non sa filtrare su colonne di `games` né sui raccordi, ed è tutta la ragione
  // per cui questa lettura è in due fasi.
  const entries = await db.query.backlog.findMany({
    ...entryQuery,
    where: inArray(schema.backlog.id, ids),
  });

  // `IN` non conserva l'ordine: senza questo riordino l'ordinamento funziona in
  // SQL e sparisce nella risposta, che è il modo peggiore di sbagliarlo.
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  return {
    entries: ids
      .map((id) => byId.get(id))
      .filter((entry) => entry !== undefined)
      .map(toEntry),
    total,
  };
}

/**
 * Di che cosa si compone il pannello dei filtri per questo utente.
 *
 * Solo i valori che compaiono nel suo backlog: una tendina con 96 piattaforme di
 * cui ne possiedi tre nasconde le tre che contano. Il costo è una query per
 * elenco, tutte su indici che ci sono già.
 */
export async function listBacklogFilterOptions(userId: string) {
  const platforms = await db
    .selectDistinct({
      slug: schema.platforms.slug,
      name: schema.platforms.name,
      igdbId: schema.platforms.igdbId,
    })
    .from(schema.ownerships)
    .innerJoin(
      schema.backlog,
      eq(schema.backlog.id, schema.ownerships.backlogId),
    )
    .innerJoin(
      schema.platforms,
      eq(schema.platforms.slug, schema.ownerships.platformSlug),
    )
    .where(eq(schema.backlog.userId, userId))
    .orderBy(schema.platforms.name);

  const storeRows = await db
    .selectDistinct({ store: schema.ownerships.store })
    .from(schema.ownerships)
    .innerJoin(
      schema.backlog,
      eq(schema.backlog.id, schema.ownerships.backlogId),
    )
    .where(
      and(
        eq(schema.backlog.userId, userId),
        // Nullo sugli inserimenti manuali: "nessuno store" non è uno store da
        // offrire come filtro.
        sql`${schema.ownerships.store} is not null`,
      ),
    )
    .orderBy(schema.ownerships.store);

  const attributes = await db
    .selectDistinct({
      id: schema.igdbAttributes.id,
      kind: schema.igdbAttributes.kind,
      name: schema.igdbAttributes.name,
    })
    .from(schema.gameAttributes)
    .innerJoin(
      schema.backlog,
      eq(schema.backlog.gameId, schema.gameAttributes.gameId),
    )
    .innerJoin(
      schema.igdbAttributes,
      eq(schema.igdbAttributes.id, schema.gameAttributes.attributeId),
    )
    .where(eq(schema.backlog.userId, userId))
    .orderBy(schema.igdbAttributes.kind, schema.igdbAttributes.name);

  return {
    platforms,
    stores: storeRows
      .map((row) => row.store)
      .filter((store): store is Store => store !== null),
    attributes,
  };
}
