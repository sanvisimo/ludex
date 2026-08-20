import type { HltbGameDetail, HltbSearchHit } from '../src/external/hltb';
import type { IgdbGameMetadata } from '../src/external/igdb';
import type { MetacriticGame } from '../src/external/metacritic';
import type { OpenCriticGame } from '../src/external/opencritic';
import type { SteamLibraryEntry } from '../src/external/steam';
import { db, schema } from '@repo/db';

// Fixture minime: scrivono la riga e restituiscono l'id. Niente builder
// generalizzati — quando serviranno più campi si allargano queste.

let counter = 0;
const unique = () => ++counter;

export async function createUser() {
  const n = unique();
  const [row] = await db
    .insert(schema.user)
    .values({
      id: `user-${n}`,
      name: `Utente ${n}`,
      email: `utente${n}@esempio.test`,
    })
    .returning({ id: schema.user.id });
  return row!.id;
}

export async function createGame(
  values: {
    igdbId?: number | null;
    name?: string;
    firstReleaseDate?: Date | null;
    // Campi dell'enrichment, per i casi del filtraggio. Restano nulli di
    // default: un gioco appena creato non è arricchito, ed è proprio il caso
    // che i filtri devono trattare bene.
    hltbMainMinutes?: number | null;
    hltbHasSolo?: boolean | null;
    // Il voto denormalizzato, scritto dritto: qui interessa il filtro dello
    // step 7, non la strada che il numero fa per arrivare in colonna. Chi
    // testa quella strada passa da `saveScores`.
    criticScore?: number | null;
  } = {},
) {
  const n = unique();
  const [row] = await db
    .insert(schema.games)
    .values({
      name: values.name ?? `Gioco ${n}`,
      // `undefined` vuol dire "dammene uno qualunque", `null` vuol dire
      // "non risolto": sono due casi diversi e i test usano entrambi.
      igdbId: values.igdbId === undefined ? 100_000 + n : values.igdbId,
      firstReleaseDate: values.firstReleaseDate ?? null,
      hltbMainMinutes: values.hltbMainMinutes ?? null,
      hltbHasSolo: values.hltbHasSolo ?? null,
      criticScore: values.criticScore ?? null,
    })
    .returning({ id: schema.games.id, igdbId: schema.games.igdbId });
  return row!;
}

/**
 * Scrive a mano lo stato di una fonte, per costruire i casi della spazzata.
 * Upsert e non insert: i casi che intrecciano due fonti riscrivono la stessa
 * riga più volte.
 */
export function setSource(values: {
  gameId: string;
  source?: 'igdb' | 'hltb' | 'opencritic' | 'metacritic';
  status: 'pending' | 'ok' | 'failed' | 'not_found';
  syncedAt?: Date | null;
  attemptedAt?: Date | null;
  externalId?: string | null;
}) {
  const source = values.source ?? 'igdb';
  const row = {
    gameId: values.gameId,
    source,
    status: values.status,
    syncedAt: values.syncedAt ?? null,
    attemptedAt: values.attemptedAt ?? null,
    externalId: values.externalId ?? null,
  };

  return db
    .insert(schema.gameSources)
    .values(row)
    .onConflictDoUpdate({
      target: [schema.gameSources.gameId, schema.gameSources.source],
      set: row,
    });
}

/** Metadati IGDB completi di default, così ogni test dichiara solo ciò che conta. */
export function igdbMetadata(
  over: Partial<IgdbGameMetadata> = {},
): IgdbGameMetadata {
  return {
    igdbId: 100_001,
    name: 'Nome da IGDB',
    storeIds: [],
    summary: null,
    firstReleaseDate: null,
    coverImageId: null,
    coverWidth: null,
    coverHeight: null,
    slug: null,
    aggregatedRating: null,
    aggregatedRatingCount: null,
    attributes: [],
    ...over,
  };
}

/** Scheda OpenCritic di default: i test dichiarano solo il campo che li riguarda. */
export function openCriticGame(
  over: Partial<OpenCriticGame> = {},
): OpenCriticGame {
  return {
    id: 4002,
    name: 'Hollow Knight',
    topCriticScore: 89.5,
    medianScore: 90,
    percentRecommended: 97.2,
    numReviews: 74,
    tier: 'Mighty',
    releaseYear: 2017,
    ...over,
  };
}

/**
 * Scheda Metacritic di default, con la forma che conta: un voto complessivo
 * più i voti per piattaforma, di cui uno che noi non sappiamo tradurre.
 */
export function metacriticGame(
  over: Partial<MetacriticGame> = {},
): MetacriticGame {
  return {
    slug: 'hollow-knight',
    name: 'Hollow Knight',
    releaseYear: 2017,
    overall: {
      score: 90,
      reviewCount: 30,
      positiveCount: 28,
      neutralCount: 0,
      negativeCount: 0,
      sentiment: 'Universal acclaim',
    },
    platforms: [
      {
        slug: 'pc',
        name: 'PC',
        score: {
          score: 87,
          reviewCount: 27,
          positiveCount: 26,
          neutralCount: 1,
          negativeCount: 0,
          sentiment: 'Generally favorable',
        },
      },
      {
        slug: 'ios-iphoneipad',
        name: 'iOS (iPhone/iPad)',
        score: {
          score: 80,
          reviewCount: 4,
          positiveCount: 3,
          neutralCount: 1,
          negativeCount: 0,
          sentiment: 'Generally favorable',
        },
      },
    ],
    ...over,
  };
}

/** Un possesso Steam, che è ciò che dà al gioco un appid con cui verificarsi. */
export async function linkSteamAppId(gameId: string, appId: string) {
  await db
    .insert(schema.externalIds)
    .values({ gameId, source: 'steam', externalId: appId });
  return appId;
}

/** Una voce della ricerca HLTB, di cui ogni test dichiara solo ciò che conta. */
export function hltbHit(over: Partial<HltbSearchHit> = {}): HltbSearchHit {
  return {
    hltbId: 26286,
    name: 'Hollow Knight',
    alias: null,
    type: 'game',
    releaseYear: 2017,
    ...over,
  };
}

/** La pagina di un gioco su HLTB, con i tempi. */
export function hltbDetail(over: Partial<HltbGameDetail> = {}): HltbGameDetail {
  return {
    hltbId: 26286,
    name: 'Hollow Knight',
    mainMinutes: 1621,
    plusMinutes: 2495,
    completionistMinutes: 3936,
    allStylesMinutes: 2509,
    mainCount: 2739,
    plusCount: 4659,
    completionistCount: 2020,
    allStylesCount: 9418,
    hasSolo: true,
    hasCoop: false,
    hasVersus: false,
    steamAppIds: [],
    ...over,
  };
}

export const ago = {
  hours: (n: number) => new Date(Date.now() - n * 3_600_000),
  days: (n: number) => new Date(Date.now() - n * 86_400_000),
};

export async function linkSteamAccount(
  userId: string,
  steamId = '76561190000000000',
) {
  await db.insert(schema.storeAccounts).values({
    userId,
    store: 'steam',
    externalAccountId: steamId,
  });
  return steamId;
}

/** Una voce di libreria Steam come la restituisce il client. */
export function steamEntry(
  over: Partial<SteamLibraryEntry> = {},
): SteamLibraryEntry {
  const n = unique();
  return {
    externalId: String(200_000 + n),
    name: `Gioco Steam ${n}`,
    playtimeMinutes: 0,
    lastPlayedAt: null,
    ...over,
  };
}
