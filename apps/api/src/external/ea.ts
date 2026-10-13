import type { Subscription } from '@repo/contracts/vocabulary';

import { chunk } from '../lib/chunk';

// Client EA (9c). Come gli altri sta fuori da `services/`.
//
// **Non è un collegamento ma un'importazione una tantum**, e la ragione sta nel
// credenziale: il token lo dà `accounts.ea.com/connect/auth` aperto dal browser
// già entrato su ea.com, che con i cookie della sessione risponde con una
// pagina JSON. Dura **quattro ore** (misurato: `expires_in` 14399) e non ha un
// refresh token: rinnovarlo vorrebbe i cookie di ea.com, che il server non ha.
// Quattro ore bastano a un import, non a un aggiornamento automatico.
//
// Tutto il resto è un GraphQL solo, `service-aggregation-layer.juno.ea.com`, lo
// stesso che usano Lutris e il plugin EA di Playnite. Le API di Origin
// (`api1.origin.com`) sono morte con Origin, ad aprile 2025.
//
// Misurato il 13/10/2026 su una libreria vera, in tre giri di `ea:probe` (vedi
// `plans/9c-ea.md`). Quattro cose che si pagano se si scoprono tardi:
//
// - **la query per esteso, coi negozi scritti dentro.** Con `storefronts`
//   passato in una variabile il GraphQL risponde «Graphql validation error»,
//   perché il tipo della variabile non è quello che si indovina. Il sito usa
//   una *persisted query*, ma il suo hash cambia quando EA aggiorna il sito, e
//   un job non si appoggia a una cosa del genere (è la ragione per cui PSN non
//   usa `getUserGameList`).
// - **il filtro `type` non toglie i DLC.** Arrivano col prodotto nullo, e sono
//   quasi tutto: 272 voci su 327. Il prodotto nullo vuol dire «non è un gioco»
//   (`gameProducts` li dà come `MICRO_CONTENT`, `BUNDLE_PACK`, `EXPANSION_PACK`,
//   `CURRENCY`): si scartano senza chiedere altro.
// - **un gioco è più offerte.** _Dragon Age: Origins_ sono quattro offerte sotto
//   lo stesso `gameSlug`, comprate fra il 2009 e il 2023, e tre si chiamano
//   identiche. Per offerta finirebbero tutte nella regola dei nomi ripetuti
//   dell'import; per slug sono un gioco solo, come i `productId` di Epic.
// - **le ore ci sono solo per i giochi avviati di recente.** `recentGames` su 44
//   slug ne rende uno. Dove non c'è niente la voce non ne porta: non è «zero».
//
// IGDB non ha una sorgente EA: si risolve tutto per nome.

const GRAPHQL_URL = 'https://service-aggregation-layer.juno.ea.com/graphql';

/**
 * Dove l'utente prende il token: col browser già entrato su ea.com mostra una
 * pagina JSON con `access_token`. Non un login, e non un redirect verso di noi:
 * `nucleus:rest` è l'indirizzo che il `client_id` di EA si aspetta.
 */
export const EA_TOKEN_URL =
  'https://accounts.ea.com/connect/auth?client_id=ORIGIN_JS_SDK&response_type=token&redirect_uri=nucleus:rest&prompt=none';

// Il sito si presenta così; il GraphQL non è stato provato con altro.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// Si chiede la pagina da cento; EA ne rende fra 70 e 90 lo stesso.
const PAGE_SIZE = 100;
// Un tetto contro un cursore che non finisce: cinquanta pagine sono quattromila
// voci, e la libreria misurata ne aveva cinque.
const MAX_PAGES = 50;
// Le offerte per `gameProducts` e gli slug per `recentGames`, per richiesta.
const BATCH = 100;

/** Il token è scaduto o rifiutato: serve un JSON nuovo dal browser. */
export class EaAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EaAuthError';
  }
}

export type EaToken = {
  accessToken: string;
  /** Epoch in millisecondi, con un minuto di margine. */
  expiresAt: number;
};

/**
 * Da ciò che l'utente incolla al token.
 *
 * Solo il JSON intero: è ciò che si vede a schermo, e la scadenza sta lì
 * dentro. Un token nudo non direbbe quando muore, e per un import che parte in
 * coda è proprio ciò che serve sapere.
 *
 * `not_logged_in` è la risposta di EA quando il browser non è entrato su
 * ea.com (`{"error":"login_required"}`): va distinta da un testo illeggibile,
 * perché il rimedio non è lo stesso.
 */
export function parseEaToken(input: string): EaToken | 'not_logged_in' | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('{')) return null;

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (typeof body.error === 'string') return 'not_logged_in';
  if (typeof body.access_token !== 'string' || !body.access_token) return null;

  // EA lo manda come stringa («"expires_in":"14399"»).
  const secondi = Number(body.expires_in);
  if (!Number.isFinite(secondi) || secondi <= 0) return null;

  return {
    accessToken: body.access_token,
    expiresAt: Date.now() + (secondi - 60) * 1000,
  };
}

type GraphQlBody<T> = {
  data?: T | null;
  errors?: { message?: string; extensions?: { code?: string } }[];
};

/**
 * Una query per esteso. **Come si presenta un token scaduto non è misurato**:
 * si prende per tale un 401 o 403, o un errore GraphQL che lo dica
 * (`UNAUTHENTICATED`, o un messaggio che parla di token). Tutto il resto è un
 * errore qualunque, che BullMQ riprova.
 */
async function graphql<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new EaAuthError(`EA ha rifiutato il token (${response.status})`);
  }

  const body = (await response
    .json()
    .catch(() => null)) as GraphQlBody<T> | null;

  const errori = body?.errors ?? [];
  if (
    errori.some(
      (errore) =>
        errore.extensions?.code === 'UNAUTHENTICATED' ||
        /token|unauthori[sz]ed|authenticat/i.test(errore.message ?? ''),
    )
  ) {
    throw new EaAuthError(`EA ha rifiutato il token: ${errori[0]?.message}`);
  }
  if (!response.ok || !body?.data) {
    throw new Error(
      `EA GraphQL: ${response.status} ${JSON.stringify(errori).slice(0, 300)}`,
    );
  }
  return body.data;
}

export type EaIdentity = {
  /** `pd`: l'id dell'account, che non cambia. */
  accountId: string;
  /** L'EA ID, che l'utente può cambiare: è solo il nome da mostrare. */
  displayName: string | null;
};

export async function fetchEaIdentity(
  accessToken: string,
): Promise<EaIdentity> {
  const data = await graphql<{
    me: { player: { pd: string; displayName: string | null } | null } | null;
  }>(accessToken, 'query { me { player { pd displayName } } }');

  const player = data.me?.player;
  if (!player?.pd) throw new Error('EA: identità senza pd');
  return { accountId: String(player.pd), displayName: player.displayName };
}

/** Una voce di `ownedGameProducts`, coi soli campi che si chiedono. */
export type EaOwnedItem = {
  originOfferId: string | null;
  product: {
    name: string | null;
    gameSlug: string | null;
    baseItem: {
      gameType: string | null;
      title: string | null;
      /** La serie, che la pagina di ea.com vuole davanti allo slug. */
      franchise?: { slug: string | null } | null;
    } | null;
    gameProductUser: {
      ownershipMethods: string[] | null;
      initialEntitlementDate: string | null;
    } | null;
  } | null;
};

// I tre negozi insieme: un gioco comprato su Steam o Epic e legato all'account
// EA entra anche come copia EA (decisione 2 del piano), e qui è una voce sola
// coi modi di possesso uniti, non due.
const OWNED_QUERY = `
  query owned($limit: Int, $next: String) {
    me {
      ownedGameProducts(
        locale: "DEFAULT"
        entitlementEnabled: true
        storefronts: [EA, STEAM, EPIC]
        type: [DIGITAL_FULL_GAME, PACKAGED_FULL_GAME]
        platforms: [PC]
        paging: { limit: $limit, next: $next }
      ) {
        next
        items {
          originOfferId
          product {
            name
            gameSlug
            baseItem { gameType title franchise { slug } }
            gameProductUser { ownershipMethods initialEntitlementDate }
          }
        }
      }
    }
  }`;

async function fetchEaOwnedItems(accessToken: string) {
  const items: EaOwnedItem[] = [];
  let next: string | null = null;

  for (let pagina = 0; pagina < MAX_PAGES; pagina++) {
    const data: {
      me: {
        ownedGameProducts: { next: string | null; items: EaOwnedItem[] } | null;
      } | null;
    } = await graphql(accessToken, OWNED_QUERY, { limit: PAGE_SIZE, next });

    const risultato = data.me?.ownedGameProducts;
    if (!risultato) throw new Error('EA: libreria senza ownedGameProducts');

    items.push(...risultato.items);
    next = risultato.next;
    if (!next || risultato.items.length === 0) break;
  }
  return items;
}

/** La copertina verticale (9:16) di ogni offerta, dove c'è. */
async function fetchEaCovers(accessToken: string, offerIds: string[]) {
  const covers = new Map<string, string>();

  for (const blocco of chunk(offerIds, BATCH)) {
    const data = await graphql<{
      gameProducts: {
        items: {
          originOfferId: string | null;
          baseItem: {
            packArt: { largestImage: { path: string | null } | null } | null;
          } | null;
        }[];
      } | null;
    }>(
      accessToken,
      `
        query covers($offerIds: [String!]!) {
          gameProducts(offerIds: $offerIds, locale: "DEFAULT") {
            items {
              originOfferId
              baseItem {
                packArt {
                  largestImage {
                    path
                  }
                }
              }
            }
          }
        }
      `,
      { offerIds: blocco },
    );

    for (const item of data.gameProducts?.items ?? []) {
      const path = item.baseItem?.packArt?.largestImage?.path;
      if (item.originOfferId && path) covers.set(item.originOfferId, path);
    }
  }
  return covers;
}

export type EaPlayTime = { seconds: number; lastPlayedAt: Date | null };

/** Le ore per slug: solo i giochi avviati di recente rispondono. */
async function fetchEaPlayTimes(accessToken: string, slugs: string[]) {
  const ore = new Map<string, EaPlayTime>();

  for (const blocco of chunk(slugs, BATCH)) {
    const data = await graphql<{
      me: {
        recentGames: {
          items: {
            gameSlug: string;
            lastSessionEndDate: string | null;
            totalPlayTimeSeconds: number | null;
          }[];
        } | null;
      } | null;
    }>(
      accessToken,
      `
        query playTimes($gameSlugs: [String!]!) {
          me {
            recentGames(gameSlugs: $gameSlugs) {
              items {
                gameSlug
                lastSessionEndDate
                totalPlayTimeSeconds
              }
            }
          }
        }
      `,
      { gameSlugs: blocco },
    );

    for (const riga of data.me?.recentGames?.items ?? []) {
      if (riga.totalPlayTimeSeconds === null) continue;
      ore.set(riga.gameSlug, {
        seconds: riga.totalPlayTimeSeconds,
        lastPlayedAt: toDate(riga.lastSessionEndDate),
      });
    }
  }
  return ore;
}

/**
 * Una voce di libreria EA, già nella forma di `LibraryEntry`: un gioco per
 * `gameSlug`, con tutto ciò che le sue offerte dicono messo insieme.
 */
export type EaLibraryEntry = {
  /** Il `gameSlug`: uno per gioco, quante che siano le offerte. */
  externalId: string;
  name: string;
  /** Dall'anno fra parentesi nel nome, quando EA ce lo mette. */
  releaseYear: number | null;
  /** La più vecchia fra le date d'acquisto delle offerte. */
  acquiredAt: Date | null;
  subscription: Subscription | null;
  /**
   * `{serie}/{slug}`, o il solo slug se EA non dice la serie. Ne escono due
   * pagine (`@repo/contracts`, `store-links.ts`): quella della **copia** sul
   * catalogo di EA, che vuole solo lo slug e dice «posseduto», e quella della
   * card «Links» su ea.com, `/games/{serie}/{slug}`, che senza la serie non si
   * compone. Misurate il 13/10/2026: 44 giochi su 44 la prima, 41 la seconda.
   */
  storePage: string;
  imageUrl: string | null;
  /** Null dove EA non le dà, cioè su tutto ciò che non si è avviato di recente. */
  playtimeMinutes: number | null;
  lastPlayedAt: Date | null;
};

/**
 * I modi di possesso che vogliono dire «EA Play»: da solo, dentro Game Pass, e
 * comprato tramite Steam o Epic. Nella libreria misurata non ce n'era nessuno,
 * quindi i nomi vengono dal plugin EA di Playnite e non da una risposta vista.
 */
const EA_PLAY_METHODS = new Set([
  'VAULT',
  'XGP_VAULT',
  'STEAM_VAULT',
  'STEAM_SUBSCRIPTION',
  'EPIC_VAULT',
  'EPIC_SUBSCRIPTION',
]);

// «Mass Effect™ (2007)», «Syndicate™ (1993)»: EA distingue così le riedizioni,
// e IGDB con l'anno nel titolo non trova niente.
const YEAR_SUFFIX = /\s*\((\d{4})\)\s*$/;

const toDate = (value: string | null | undefined) => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
};

/** Un gioco, cioè un'offerta col prodotto, di tipo `BASE_GAME` e con lo slug. */
function isGame(item: EaOwnedItem) {
  return (
    item.product?.baseItem?.gameType === 'BASE_GAME' &&
    Boolean(item.product.gameSlug)
  );
}

/**
 * Le offerte ridotte a una voce per gioco. **Pura**: le richieste stanno in
 * `fetchEaLibrary`, qui c'è solo cosa farne.
 *
 * - **il nome** è il più corto del gruppo, tolto l'anno fra parentesi:
 *   «Dragon Age™ II» e non «Dragon Age II: Ultimate Edition». L'edizione non
 *   aiuta la ricerca, e IGDB tiene il gioco col nome nudo;
 * - **l'anno** viene da quelle parentesi, se un nome del gruppo le ha. Non dalla
 *   data di uscita del prodotto, che è quella della riedizione: _Mass Effect 3_
 *   vale 2023, e con quell'anno il matcher sceglieva un altro gioco;
 * - **EA Play** solo se **tutti** i modi di possesso del gruppo lo sono: un
 *   gioco che si ha anche comprato non dipende dall'abbonamento;
 * - **le ore** sono quelle dello slug, dove EA le dà.
 */
export function reduceEaLibrary(
  items: EaOwnedItem[],
  covers: Map<string, string>,
  playTimes: Map<string, EaPlayTime>,
): EaLibraryEntry[] {
  const perSlug = new Map<string, EaOwnedItem[]>();
  for (const item of items.filter(isGame)) {
    const slug = item.product!.gameSlug!;
    perSlug.set(slug, [...(perSlug.get(slug) ?? []), item]);
  }

  return [...perSlug].map(([slug, gruppo]) => {
    const nomi = gruppo
      .map((item) => ({
        item,
        grezzo: item.product?.name ?? item.product?.baseItem?.title ?? '',
      }))
      .filter(({ grezzo }) => grezzo.trim())
      .map(({ item, grezzo }) => ({
        item,
        nome: grezzo.replace(YEAR_SUFFIX, '').trim(),
        anno: grezzo.match(YEAR_SUFFIX)?.[1] ?? null,
      }))
      .sort((a, b) => a.nome.length - b.nome.length);

    const scelto = nomi[0];
    const anno = nomi.find(({ anno }) => anno)?.anno ?? null;

    const date = gruppo
      .map((item) =>
        toDate(item.product?.gameProductUser?.initialEntitlementDate),
      )
      .filter((data): data is Date => data !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    const modi = gruppo.flatMap(
      (item) => item.product?.gameProductUser?.ownershipMethods ?? [],
    );
    const daAbbonamento =
      modi.length > 0 && modi.every((modo) => EA_PLAY_METHODS.has(modo));

    // La copertina dell'offerta da cui viene il nome, o di una qualunque.
    const offerte = [
      scelto?.item.originOfferId,
      ...gruppo.map((item) => item.originOfferId),
    ];
    const imageUrl =
      offerte
        .map((offerta) => (offerta ? covers.get(offerta) : undefined))
        .find((url) => url !== undefined) ?? null;

    const ore = playTimes.get(slug);
    const serie = gruppo
      .map((item) => item.product?.baseItem?.franchise?.slug)
      .find((valore): valore is string => Boolean(valore));

    return {
      externalId: slug,
      name: scelto?.nome ?? slug,
      releaseYear: anno ? Number(anno) : null,
      acquiredAt: date[0] ?? null,
      subscription: daAbbonamento ? 'ea_play' : null,
      storePage: serie ? `${serie}/${slug}` : slug,
      imageUrl,
      playtimeMinutes: ore ? Math.round(ore.seconds / 60) : null,
      lastPlayedAt: ore?.lastPlayedAt ?? null,
    };
  });
}

/**
 * La libreria EA, ridotta a una voce per gioco.
 *
 * Su quella misurata sono una decina di richieste: le pagine della libreria
 * (cinque), le copertine e le ore a blocchi di cento.
 */
export async function fetchEaLibrary(
  accessToken: string,
): Promise<EaLibraryEntry[]> {
  const items = await fetchEaOwnedItems(accessToken);
  const giochi = items.filter(isGame);

  const offerte = [
    ...new Set(
      giochi
        .map((item) => item.originOfferId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const slugs = [...new Set(giochi.map((item) => item.product!.gameSlug!))];

  const covers = await fetchEaCovers(accessToken, offerte);
  const playTimes = await fetchEaPlayTimes(accessToken, slugs);

  return reduceEaLibrary(items, covers, playTimes);
}
