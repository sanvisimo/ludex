import type { HiddenKind, Store } from '@repo/contracts/vocabulary';
import { db, schema } from '@repo/db';
import { and, asc, count, desc, eq, ilike, isNull, sql } from '@repo/db/orm';

import { reopenSourcesForNewExternalIds } from './enrichment';
import { resolveGameFromIgdb } from './games';
import { resolveUnresolvedImport } from './unresolved-imports';

// La sezione «Scarti» dell'admin (11a, passo 5): gli scarti d'import di tutti
// gli utenti, una riga per negozio e id esterno, e i due gesti che valgono per
// tutti — collegare e nascondere.

const ui = schema.unresolvedImports;

/** I tipi che si nascondono per tutti: `unwanted` è una preferenza, non un fatto. */
export type GlobalHiddenKind = Exclude<HiddenKind, 'unwanted'>;

/**
 * Gli scarti di tutti, raggruppati per chiave: lo stesso Netflix su PSN è una
 * riga per ogni utente, e all'admin interessa una volta sola.
 *
 * Solo le chiavi con almeno uno scarto ancora visibile: quelle che qualcuno ha
 * davanti come «da sistemare». Prima le chiavi con più librerie.
 */
export async function listUnresolvedGroups(input: {
  store?: Store;
  q?: string;
  limit: number;
  offset: number;
}) {
  const where = and(
    input.store ? eq(ui.store, input.store) : undefined,
    input.q ? ilike(ui.name, `%${input.q}%`) : undefined,
  );
  const visibili = sql<number>`count(*) filter (where ${ui.hiddenAt} is null)::int`;
  const nascostiCome = (kind: HiddenKind) =>
    sql<number>`count(*) filter (where ${ui.hiddenKind} = ${kind})::int`;

  const groups = db
    .select({
      store: ui.store,
      externalId: ui.externalId,
      // I negozi rinominano: fra più librerie vince un nome qualunque, ed è
      // comunque quello che il negozio dice oggi a qualcuno.
      name: sql<string>`max(${ui.name})`.as('name'),
      platformSlug: sql<string | null>`max(${ui.platformSlug})`.as(
        'platform_slug',
      ),
      imageUrl: sql<string | null>`max(${ui.imageUrl})`.as('image_url'),
      libraries: sql<number>`count(*)::int`.as('libraries'),
      visible: visibili.as('visible'),
      hiddenApp: nascostiCome('app').as('hidden_app'),
      hiddenDlc: nascostiCome('dlc').as('hidden_dlc'),
      hiddenExtra: nascostiCome('extra').as('hidden_extra'),
      hiddenPrerelease: nascostiCome('prerelease').as('hidden_prerelease'),
      hiddenUnwanted: nascostiCome('unwanted').as('hidden_unwanted'),
    })
    .from(ui)
    .where(where)
    .groupBy(ui.store, ui.externalId)
    .having(sql`count(*) filter (where ${ui.hiddenAt} is null) > 0`)
    .as('groups');

  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(groups)
      .orderBy(desc(groups.libraries), asc(groups.name))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ n: count() }).from(groups),
  ]);

  return {
    rows: rows.map((row) => ({
      store: row.store,
      externalId: row.externalId,
      name: row.name,
      platformSlug: row.platformSlug,
      imageUrl: row.imageUrl,
      libraries: row.libraries,
      visible: row.visible,
      hidden: {
        app: row.hiddenApp,
        dlc: row.hiddenDlc,
        extra: row.hiddenExtra,
        prerelease: row.hiddenPrerelease,
        unwanted: row.hiddenUnwanted,
      },
    })),
    total: total?.n ?? 0,
  };
}

/** La vista «Nascosti per tutti»: le regole, con quante librerie hanno ancora la voce. */
export async function listGlobalHidden() {
  const ghi = schema.globalHiddenImports;
  const rows = await db
    .select({
      store: ghi.store,
      externalId: ghi.externalId,
      name: ghi.name,
      hiddenKind: ghi.hiddenKind,
      decidedBy: schema.user.name,
      createdAt: ghi.createdAt,
      libraries: sql<number>`(
        select count(*)::int from unresolved_imports u
        where u.store = ${ghi.store} and u.external_id = ${ghi.externalId}
      )`,
    })
    .from(ghi)
    .leftJoin(schema.user, eq(schema.user.id, ghi.decidedBy))
    .orderBy(desc(ghi.createdAt));
  // Il tipo della colonna è `hidden_kind` intero; `unwanted` lo esclude il
  // CHECK `global_hidden_imports_not_unwanted`, che Drizzle non vede.
  return rows.map((row) => ({
    ...row,
    hiddenKind: row.hiddenKind as GlobalHiddenKind,
  }));
}

/**
 * «Collega per tutti»: la chiave diventa quel gioco, per chiunque la importi
 * da qui in avanti, e gli scarti che ci sono si risolvono adesso.
 *
 * Tutti gli scarti con quella chiave, **anche quelli nascosti**: il prossimo
 * import li risolverebbe comunque, e lì il nascondere segue la voce — il gioco
 * entra nel backlog già nascosto. Qui succede lo stesso, subito.
 *
 * Se la chiave è già collegata a un **altro** gioco si ferma: quello è
 * ripuntare un collegamento, e sta nella scheda admin del gioco (passo 6).
 * Collegata allo stesso gioco invece va avanti, ed è ciò che rende il gesto
 * ripetibile: la seconda volta non trova scarti e non cambia niente.
 */
export async function resolveUnresolvedForAll(
  store: Store,
  externalId: string,
  igdbId: number,
) {
  const [esistente] = await db
    .select({ igdbId: schema.games.igdbId, name: schema.games.name })
    .from(schema.externalIds)
    .innerJoin(schema.games, eq(schema.games.id, schema.externalIds.gameId))
    .where(
      and(
        eq(schema.externalIds.source, store),
        eq(schema.externalIds.externalId, externalId),
      ),
    );
  if (esistente && esistente.igdbId !== igdbId)
    return { status: 'linked_elsewhere' as const, game: esistente.name };

  const righe = await db
    .select({ id: ui.id, userId: ui.userId })
    .from(ui)
    .where(and(eq(ui.store, store), eq(ui.externalId, externalId)));

  let resolved = 0;
  for (const riga of righe) {
    const esito = await resolveUnresolvedImport(riga.userId, riga.id, igdbId, {
      keepHidden: true,
    });
    if (esito.status === 'unknown_igdb_id')
      return { status: 'unknown_igdb_id' as const };
    if (esito.status === 'ok') resolved++;
  }

  // Senza scarti la mappatura non l'ha scritta nessuno: la si scrive qui, così
  // il gesto vale anche per chi la importerà domani.
  if (righe.length === 0 && !esistente) {
    const game = await resolveGameFromIgdb(igdbId);
    if (!game) return { status: 'unknown_igdb_id' as const };
    const inserted = await db
      .insert(schema.externalIds)
      .values({ gameId: game.id, source: store, externalId })
      .onConflictDoNothing({
        target: [schema.externalIds.source, schema.externalIds.externalId],
      })
      .returning({
        gameId: schema.externalIds.gameId,
        source: schema.externalIds.source,
      });
    await reopenSourcesForNewExternalIds(inserted);
  }

  return { status: 'ok' as const, resolved };
}

/**
 * «Nascondi per tutti»: la regola, e gli scarti ancora visibili con quella
 * chiave nascosti con quel tipo. Quelli che l'utente aveva già nascosto — anche
 * con un altro tipo — restano come li ha messi lui.
 *
 * Ridirlo con un altro tipo corregge la regola, non la data.
 */
export async function hideUnresolvedForAll(
  decidedBy: string,
  store: Store,
  externalId: string,
  kind: GlobalHiddenKind,
) {
  const [voce] = await db
    .select({ name: sql<string | null>`max(${ui.name})` })
    .from(ui)
    .where(and(eq(ui.store, store), eq(ui.externalId, externalId)));

  await db
    .insert(schema.globalHiddenImports)
    .values({
      store,
      externalId,
      name: voce?.name ?? externalId,
      hiddenKind: kind,
      decidedBy,
    })
    .onConflictDoUpdate({
      target: [
        schema.globalHiddenImports.store,
        schema.globalHiddenImports.externalId,
      ],
      set: { hiddenKind: kind, decidedBy, updatedAt: new Date() },
    });

  const nascosti = await db
    .update(ui)
    .set({ hiddenAt: new Date(), hiddenKind: kind })
    .where(
      and(
        eq(ui.store, store),
        eq(ui.externalId, externalId),
        isNull(ui.hiddenAt),
      ),
    )
    .returning({ id: ui.id });

  return { hidden: nascosti.length };
}

/**
 * Toglie la regola: le righe nuove con quella chiave torneranno a nascere
 * visibili. Quelle già scritte restano nascoste — da lì in poi sono di chi le
 * ha, e ciascuno le rimette fra i «da sistemare» se vuole.
 */
export async function unhideUnresolvedForAll(store: Store, externalId: string) {
  const tolte = await db
    .delete(schema.globalHiddenImports)
    .where(
      and(
        eq(schema.globalHiddenImports.store, store),
        eq(schema.globalHiddenImports.externalId, externalId),
      ),
    )
    .returning({ store: schema.globalHiddenImports.store });
  return tolte.length > 0;
}
