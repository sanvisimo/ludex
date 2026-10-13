import '../env';

import { createInterface } from 'node:readline/promises';

import { chunk } from '../lib/chunk';
import type { ExternalGameLink } from '../services/games';
import { resolveByName } from '../services/library-import';

// Giro a vuoto dell'import EA (9c): legge la libreria, prova a risolverla,
// **non scrive niente**.
//
//   pnpm --filter api ea:probe [--query | --voci | --pagina]
//
// Con `--query` fa solo il secondo giro: la query della libreria per esteso, un
// pezzo alla volta, e la risoluzione con le regole nuove. Con `--voci` il terzo:
// tutte le voci della query per esteso, una per una. Con `--pagina` il quarto:
// dove la risposta dice la pagina del gioco su ea.com (vedi sotto).
//
// Chiede di incollare la risposta di `accounts.ea.com/connect/auth` (il JSON
// intero o il solo token), letta da stdin e non come argomento, così il token
// non resta nella cronologia della shell. Non lo stampa.
//
// **Parla con l'account EA di chi lo lancia**: una richiesta per l'identità, una
// o due pagine di libreria per ciascuno dei tre negozi (EA, Steam, Epic), le ore
// a blocchi di slug e una per le copertine. Un giro basta, non ripeterlo.
//
// Le domande, che decidono come sarà fatto il job (vedi `plans/9c-ea.md`):
//
//  1. **il token** incollato basta a interrogare l'API, e quanto dura;
//  2. **l'identità** dell'account: `pd`, che finirà in `external_account_id`;
//  3. **la query scritta per esteso** passa, o serve la persisted query;
//  4. **l'id esterno**: `originOfferId` è uno per edizione, `gameSlug` dovrebbe
//     essere uno per gioco — quante edizioni condividono uno slug;
//  5. **i campi**: `gameType`, `ownershipMethods` (EA Play), la data d'acquisto;
//  6. **le ore**: quante voci le hanno, e quelle dei giochi comprati su Steam;
//  7. **la risoluzione per nome** con il matcher vero dell'import.

const AUTH_URL =
  'https://accounts.ea.com/connect/auth?client_id=ORIGIN_JS_SDK&response_type=token&redirect_uri=nucleus:rest&prompt=none';
const GRAPHQL_URL = 'https://service-aggregation-layer.juno.ea.com/graphql';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// Gli hash delle persisted query che usa il sito, presi dal plugin EA di
// Jeshibu per Playnite. Solo il ripiego se la query per esteso viene rifiutata.
const OWNED_GAMES_HASH =
  '779f1cd1355699752e20c0b3877847f4e3010ef5de131c248e98f8eff84f0718';
const PLAY_TIMES_HASH =
  '3f09b35e06b75c74d8ec3e520a598ebb5e2992b1e1268b6dd3b8ed99b9fafb29';

const STOREFRONTS = ['EA', 'STEAM', 'EPIC'] as const;
type Storefront = (typeof STOREFRONTS)[number];

console.log(`
1. entra su https://www.ea.com/ con il browser
2. apri ${AUTH_URL}
3. copia la risposta (il JSON con access_token)
`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const incollato = (await rl.question('Incolla qui la risposta: ')).trim();
rl.close();

/** Il token dal JSON intero, o il token da solo. */
function parseToken(testo: string): {
  token: string | null;
  scade: number | null;
  errore: string | null;
} {
  try {
    const body = JSON.parse(testo) as Record<string, unknown>;
    if (typeof body.error === 'string') {
      return { token: null, scade: null, errore: body.error };
    }
    const token =
      typeof body.access_token === 'string' ? body.access_token : null;
    const scade = Number(body.expires_in);
    return {
      token,
      scade: Number.isFinite(scade) ? scade : null,
      errore: null,
    };
  } catch {
    const token = testo.replace(/^bearer\s+/i, '');
    return {
      token: /^[\w.-]{20,}$/.test(token) ? token : null,
      scade: null,
      errore: null,
    };
  }
}

const { token, scade, errore } = parseToken(incollato);
if (errore) {
  console.error(
    `\nEA ha risposto «${errore}»: di solito vuol dire che sul browser non sei entrato su ea.com. Entra e riapri l'indirizzo.`,
  );
  process.exit(1);
}
if (!token) {
  console.error(
    '\ntoken non riconosciuto: va bene il JSON intero {"access_token":"…"} o il solo valore',
  );
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'User-Agent': USER_AGENT,
};

let richieste = 0;

type GraphQlResult<T> = {
  status: number;
  data: T | null;
  errors: unknown[] | null;
};

/** Una query scritta per esteso, in POST. */
async function query<T>(
  testo: string,
  variables: Record<string, unknown> = {},
): Promise<GraphQlResult<T>> {
  richieste++;
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: testo, variables }),
  });
  return leggi<T>(response);
}

/** Una persisted query, in GET, come la fa il sito. */
async function persisted<T>(
  operationName: string,
  variables: Record<string, unknown>,
  sha256Hash: string,
): Promise<GraphQlResult<T>> {
  richieste++;
  const url = new URL(GRAPHQL_URL);
  url.searchParams.set('operationName', operationName);
  url.searchParams.set('variables', JSON.stringify(variables));
  url.searchParams.set(
    'extensions',
    JSON.stringify({ persistedQuery: { version: 1, sha256Hash } }),
  );
  const response = await fetch(url, { headers });
  return leggi<T>(response);
}

async function leggi<T>(response: Response): Promise<GraphQlResult<T>> {
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    errors?: unknown[];
  } | null;
  return {
    status: response.status,
    data: body?.data ?? null,
    errors: body?.errors ?? null,
  };
}

/** Gli errori in una riga, troncati: possono contenere dettagli lunghi. */
const inBreve = (errors: unknown[] | null) =>
  JSON.stringify(errors ?? []).slice(0, 300);

const conteggio = <T>(rows: T[], chiave: (row: T) => string) => {
  const mappa = new Map<string, number>();
  for (const row of rows) {
    mappa.set(chiave(row), (mappa.get(chiave(row)) ?? 0) + 1);
  }
  return [...mappa].sort((a, b) => b[1] - a[1]);
};

const elenco = (coppie: [string, number][]) =>
  coppie.map(([valore, n]) => `${valore} ${n}`).join(', ') || '—';

const percento = (parte: number, tutto: number) =>
  tutto === 0 ? '—' : `${Math.round((100 * parte) / tutto)}%`;

// --- 1. il token ---

console.log('\ntoken');
console.log(
  `  dura:                     ${scade === null ? '(non dichiarato: incollato il solo token)' : `${scade} s (${Math.round(scade / 60)} min)`}`,
);

// --- il secondo giro: solo la query per esteso (`--query`) ---
//
// Il primo giro (13/10/2026) ha visto la libreria per esteso rifiutata
// («Graphql validation error») e le ore per esteso accettate: l'errore era nella
// nostra query, non nel GraphQL. Il job non può poggiare sulla persisted query
// del sito — l'hash cambia quando EA aggiorna il sito, lo stesso motivo per cui
// PSN non usa `getUserGameList` — quindi si prova la forma di Lutris, coi negozi
// scritti nella query invece che in una variabile dal tipo inventato, e si
// aggiungono i campi un pezzo alla volta per sapere quale la fa cadere.
//
// Al più quattro richieste a EA, una pagina ciascuna. Poi la risoluzione per
// nome con le regole nuove, che parla solo con IGDB, in due versioni: con
// l'anno dalla data di uscita e senza, perché quella data potrebbe essere
// l'uscita su Origin e non quella del gioco, e allontanare giochi che oggi si
// agganciano.

if (process.argv.includes('--query')) {
  const pezzi: [string, string][] = [
    ["Lutris così com'è", 'baseItem { gameType }'],
    ['+ nome e slug', 'name gameSlug baseItem { gameType title }'],
    [
      '+ possesso e data',
      'name gameSlug baseItem { gameType title } gameProductUser { ownershipMethods initialEntitlementDate }',
    ],
    [
      '+ data di uscita',
      'name gameSlug baseItem { gameType title } gameProductUser { ownershipMethods initialEntitlementDate } lifecycleStatus { lifecycleType playableStartDate }',
    ],
  ];

  type Voce = {
    originOfferId: string | null;
    product: {
      name?: string | null;
      gameSlug?: string | null;
      baseItem: { gameType: string | null; title?: string | null } | null;
      lifecycleStatus?:
        | { lifecycleType: string | null; playableStartDate: string | null }[]
        | null;
    } | null;
  };

  console.log('\nquery per esteso, un pezzo alla volta');
  let voci: Voce[] | null = null;
  for (const [etichetta, campi] of pezzi) {
    const risposta = await query<{
      me: {
        ownedGameProducts: { next: string | null; items: Voce[] } | null;
      } | null;
    }>(
      `query owned($limit: Int, $next: String) {
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
            items { originOfferId product { ${campi} } }
          }
        }
      }`,
      { limit: 100, next: null },
    );
    const pagina = risposta.data?.me?.ownedGameProducts;
    if (!pagina) {
      console.log(
        `  ${etichetta.padEnd(20)} RIFIUTATA (HTTP ${risposta.status}): ${inBreve(risposta.errors)}`,
      );
      voci = null;
      break;
    }
    voci = pagina.items;
    console.log(
      `  ${etichetta.padEnd(20)} ok, ${pagina.items.length} voci${pagina.next ? ' (ci sono altre pagine, non lette)' : ''}`,
    );
  }
  console.log(`\nrichieste a EA:             ${richieste}`);

  if (!voci) process.exit(0);

  const uscite = voci.flatMap((voce) => voce.product?.lifecycleStatus ?? []);
  console.log('\ndata di uscita');
  console.log(
    `  lifecycleType:            ${elenco(conteggio(uscite, (riga) => riga.lifecycleType ?? '(nullo)'))}`,
  );
  console.log(
    `  voci con playableStartDate: ${voci.filter((voce) => voce.product?.lifecycleStatus?.some((riga) => riga.playableStartDate)).length} su ${voci.length}`,
  );

  // Le regole nuove, come le farebbe il client: uno per slug, il nome più corto
  // del gruppo, l'anno fra parentesi tolto dal nome e usato come anno. «Game of
  // the Year» → «GOTY» qui si applica solo al nostro nome; nel codice vero starà
  // in `normalizeTitle`, da tutte e due le parti.
  const ANNO = /\s*\((\d{4})\)\s*$/;
  const perSlugQ = new Map<string, Voce[]>();
  for (const voce of voci) {
    const chiave = voce.product?.gameSlug;
    if (!chiave || voce.product?.baseItem?.gameType !== 'BASE_GAME') continue;
    perSlugQ.set(chiave, [...(perSlugQ.get(chiave) ?? []), voce]);
  }

  const annoDiUscita = (gruppo: Voce[]) => {
    const anni = gruppo
      .flatMap((voce) => voce.product?.lifecycleStatus ?? [])
      .map((riga) => Number(riga.playableStartDate?.slice(0, 4)))
      .filter((anno) => Number.isFinite(anno) && anno > 1970);
    return anni.length > 0 ? Math.min(...anni) : null;
  };

  const righe = [...perSlugQ].map(([chiave, gruppo]) => {
    const nomi = gruppo
      .map((voce) => voce.product?.name ?? voce.product?.baseItem?.title ?? '')
      .filter(Boolean)
      .sort((a, b) => a.length - b.length);
    const grezzo = nomi[0] ?? chiave;
    const fraParentesi = grezzo.match(ANNO);
    const name = grezzo.replace(ANNO, '').replace(/game of the year/i, 'GOTY');
    return {
      chiave,
      name,
      annoNome: fraParentesi ? Number(fraParentesi[1]) : null,
      annoUscita: annoDiUscita(gruppo),
    };
  });

  console.log(`\ncerco su IGDB ${righe.length} giochi base, due volte…`);
  const senzaUscita = await resolveByName(
    righe.map((riga) => ({
      externalId: riga.chiave,
      name: riga.name,
      releaseYear: riga.annoNome,
    })),
  );
  const conUscita = await resolveByName(
    righe.map((riga) => ({
      externalId: riga.chiave,
      name: riga.name,
      releaseYear: riga.annoNome ?? riga.annoUscita,
    })),
  );
  const a = new Map(senzaUscita.map((link) => [link.externalId, link]));
  const b = new Map(conUscita.map((link) => [link.externalId, link]));

  console.log('\nrisoluzione (per nome, regole nuove)');
  console.log(
    `  senza l'anno di uscita:   ${a.size} su ${righe.length}  (${percento(a.size, righe.length)})`,
  );
  console.log(
    `  con l'anno di uscita:     ${b.size} su ${righe.length}  (${percento(b.size, righe.length)})`,
  );
  console.log(
    '\n  slug                                    anno nome/uscita  senza          con            nome cercato',
  );
  const esito = (link: ExternalGameLink | undefined) =>
    link ? `${link.igdbId} ${link.releaseYear ?? '—'}` : 'scarto';
  for (const riga of righe) {
    const diversi = esito(a.get(riga.chiave)) !== esito(b.get(riga.chiave));
    console.log(
      `  ${diversi ? '≠' : ' '} ${riga.chiave.padEnd(38)} ${String(riga.annoNome ?? '—').padStart(4)}/${String(riga.annoUscita ?? '—').padEnd(10)} ${esito(a.get(riga.chiave)).padEnd(14)} ${esito(b.get(riga.chiave)).padEnd(14)} ${riga.name}`,
    );
  }
  console.log();
  process.exit(0);
}

// --- il terzo giro: tutte le voci della query per esteso (`--voci`) ---
//
// Il secondo giro (13/10/2026) ha visto la query per esteso passare, ma rendere
// 74 voci più altre pagine contro le 57 della persisted, e solo 6 con nome, slug
// e `BASE_GAME`. Tre ipotesi, una richiesta o due ciascuna:
//
//  1. `locale`: la persisted chiedeva `en`, noi `DEFAULT`;
//  2. il prodotto vuoto è normale nella forma per esteso, e i dettagli si
//     chiedono dopo con `gameProducts(offerIds)`, come fa Lutris;
//  3. le voci in più sono diritti che la persisted escludeva col suo elenco di
//     `ownershipMethods`.
//
// Tutte le pagine con `DEFAULT`, la prima con `en`, e `gameProducts` per le voci
// senza prodotto: cinque o sei richieste a EA. Nessuna richiesta a IGDB.

if (process.argv.includes('--voci')) {
  type VoceV = {
    originOfferId: string | null;
    product: {
      name: string | null;
      gameSlug: string | null;
      baseItem: { gameType: string | null; title: string | null } | null;
      gameProductUser: {
        ownershipMethods: string[] | null;
        initialEntitlementDate: string | null;
      } | null;
    } | null;
  };

  const pagina = (locale: string, next: string | null) =>
    query<{
      me: {
        ownedGameProducts: { next: string | null; items: VoceV[] } | null;
      } | null;
    }>(
      `query owned($limit: Int, $next: String) {
        me {
          ownedGameProducts(
            locale: "${locale}"
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
                baseItem { gameType title }
                gameProductUser { ownershipMethods initialEntitlementDate }
              }
            }
          }
        }
      }`,
      { limit: 100, next },
    );

  // 1. tutte le pagine, con `DEFAULT`.
  const voci: VoceV[] = [];
  const perPagina: number[] = [];
  let next: string | null = null;
  // Un tetto contro un cursore che non finisce: venti pagine sono duemila voci.
  for (let n = 0; n < 20; n++) {
    const risposta = await pagina('DEFAULT', next);
    const risultato = risposta.data?.me?.ownedGameProducts;
    if (!risultato) {
      console.log(
        `\npagina ${n + 1} rifiutata (HTTP ${risposta.status}): ${inBreve(risposta.errors)}`,
      );
      break;
    }
    voci.push(...risultato.items);
    perPagina.push(risultato.items.length);
    next = risultato.next;
    if (!next || risultato.items.length === 0) break;
  }

  const conProdotto = voci.filter((voce) => voce.product);
  const senzaProdotto = voci.filter((voce) => !voce.product);

  console.log('\ntutte le pagine, locale DEFAULT');
  console.log(`  pagine:                   ${perPagina.join(' + ')}`);
  console.log(`  voci:                     ${voci.length}`);
  console.log(
    `  originOfferId distinti:   ${new Set(voci.map((voce) => voce.originOfferId)).size}`,
  );
  console.log(`  con prodotto:             ${conProdotto.length}`);
  console.log(`  senza prodotto:           ${senzaProdotto.length}`);
  console.log(
    `  con nome e slug:          ${voci.filter((voce) => voce.product?.name && voce.product.gameSlug).length}`,
  );
  console.log(
    `  gameType:                 ${elenco(conteggio(voci, (voce) => voce.product?.baseItem?.gameType ?? '(nullo)'))}`,
  );
  console.log(
    `  ownershipMethods:         ${elenco(conteggio(voci, (voce) => (voce.product?.gameProductUser?.ownershipMethods ?? ['(nullo)']).join('+')))}`,
  );

  console.log('\n  tutte le voci:');
  for (const voce of voci) {
    const prodotto = voce.product;
    console.log(
      `    ${(voce.originOfferId ?? '—').padEnd(24)} ${prodotto ? '■' : '·'} ${(prodotto?.baseItem?.gameType ?? '—').padEnd(16)} ${(prodotto?.gameSlug ?? '—').padEnd(32)} ${(prodotto?.gameProductUser?.ownershipMethods ?? []).join('+').padEnd(28)} ${prodotto?.name ?? prodotto?.baseItem?.title ?? '—'}`,
    );
  }

  // 2. la prima pagina con `en`, contro la prima con `DEFAULT`.
  const inglese = await pagina('en', null);
  const primaEn = inglese.data?.me?.ownedGameProducts;
  console.log('\nprima pagina, locale en');
  if (!primaEn) {
    console.log(
      `  rifiutata (HTTP ${inglese.status}): ${inBreve(inglese.errors)}`,
    );
  } else {
    const primaDefault = voci.slice(0, perPagina[0] ?? 0);
    const conNome = (righe: VoceV[]) =>
      righe.filter((voce) => voce.product?.name && voce.product.gameSlug)
        .length;
    console.log(
      `  voci:                     ${primaEn.items.length}  (DEFAULT ${primaDefault.length})`,
    );
    console.log(
      `  con prodotto:             ${primaEn.items.filter((voce) => voce.product).length}  (DEFAULT ${primaDefault.filter((voce) => voce.product).length})`,
    );
    console.log(
      `  con nome e slug:          ${conNome(primaEn.items)}  (DEFAULT ${conNome(primaDefault)})`,
    );
  }

  // 3. i dettagli delle voci senza prodotto, come fa Lutris.
  const offerte = senzaProdotto
    .map((voce) => voce.originOfferId)
    .filter((id): id is string => Boolean(id));
  if (offerte.length > 0) {
    type Dettaglio = {
      originOfferId: string | null;
      gameSlug: string | null;
      baseItem: { gameType: string | null; title: string | null } | null;
    };
    const trovati: Dettaglio[] = [];
    for (const blocco of chunk(offerte, 100)) {
      const risposta = await query<{
        gameProducts: { items: Dettaglio[] } | null;
      }>(
        `query details($offerIds: [String!]!) {
          gameProducts(offerIds: $offerIds, locale: "DEFAULT") {
            items { originOfferId gameSlug baseItem { gameType title } }
          }
        }`,
        { offerIds: blocco },
      );
      if (!risposta.data?.gameProducts) {
        console.log(
          `\ngameProducts rifiutata (HTTP ${risposta.status}): ${inBreve(risposta.errors)}`,
        );
        break;
      }
      trovati.push(...risposta.data.gameProducts.items);
    }
    console.log(`\ndettagli delle voci senza prodotto (gameProducts)`);
    console.log(`  chieste:                  ${offerte.length}`);
    console.log(`  trovate:                  ${trovati.length}`);
    console.log(
      `  gameType:                 ${elenco(conteggio(trovati, (riga) => riga.baseItem?.gameType ?? '(nullo)'))}`,
    );
    for (const riga of trovati) {
      console.log(
        `    ${(riga.originOfferId ?? '—').padEnd(24)} ${(riga.baseItem?.gameType ?? '—').padEnd(16)} ${(riga.gameSlug ?? '—').padEnd(32)} ${riga.baseItem?.title ?? '—'}`,
      );
    }
  }

  console.log(`\nrichieste a EA:             ${richieste}\n`);
  process.exit(0);
}

// --- il quarto giro: dove sta la pagina del gioco (`--pagina`) ---
//
// La pagina su ea.com non si compone dallo slug: i giochi del catalogo storico
// stanno a `/games/{slug}`, quelli delle serie grandi a `/games/{serie}/{slug}`
// (misurato il 13/10/2026 con richieste anonime). La domanda è se il GraphQL
// dica la serie, o l'indirizzo, da qualche parte.
//
// Prima l'introspezione dei due tipi che leggiamo (il prodotto e il suo
// `baseItem`): due richieste, e se EA la tiene accesa risponde a tutto. Se è
// spenta, pochi nomi di campo candidati, uno per richiesta perché un campo che
// non esiste fa cadere l'intera query. Poi, se un campo c'è, i suoi valori su
// tutta la libreria. Al più una quindicina di richieste a EA, nessuna a IGDB.

if (process.argv.includes('--pagina')) {
  const OWNED = (campi: string, limit: number) => `
    query owned($next: String) {
      me {
        ownedGameProducts(
          locale: "DEFAULT"
          entitlementEnabled: true
          storefronts: [EA, STEAM, EPIC]
          type: [DIGITAL_FULL_GAME, PACKAGED_FULL_GAME]
          platforms: [PC]
          paging: { limit: ${limit}, next: $next }
        ) {
          next
          items { originOfferId product { ${campi} } }
        }
      }
    }`;

  type Pagina = {
    me: {
      ownedGameProducts: {
        next: string | null;
        items: {
          originOfferId: string | null;
          product: Record<string, unknown> | null;
        }[];
      } | null;
    } | null;
  };

  // 1. i nomi dei tipi, dalla prima voce che ha un prodotto.
  const tipi = await query<Pagina>(
    OWNED('__typename gameSlug baseItem { __typename gameType }', 100),
    { next: null },
  );
  const conProdotto = tipi.data?.me?.ownedGameProducts?.items.find(
    (item) => item.product,
  )?.product as
    | { __typename?: string; baseItem?: { __typename?: string } | null }
    | undefined;
  const tipoProdotto = conProdotto?.__typename;
  const tipoBase = conProdotto?.baseItem?.__typename;

  console.log('\ntipi');
  console.log(`  prodotto:                 ${tipoProdotto ?? '(non trovato)'}`);
  console.log(`  baseItem:                 ${tipoBase ?? '(non trovato)'}`);
  if (!tipoProdotto) {
    console.log(`  HTTP ${tipi.status}: ${inBreve(tipi.errors)}`);
    process.exit(0);
  }

  // 2. l'introspezione dei due tipi.
  type Campo = {
    name: string;
    type: {
      kind: string;
      name: string | null;
      ofType: { kind: string; name: string | null } | null;
    };
  };
  const schemaTipo = (alias: string, nome: string) =>
    `${alias}: __type(name: "${nome}") { fields { name type { kind name ofType { kind name } } } }`;
  const intro = await query<{
    p: { fields: Campo[] | null } | null;
    b: { fields: Campo[] | null } | null;
  }>(
    `query { ${schemaTipo('p', tipoProdotto)} ${tipoBase ? schemaTipo('b', tipoBase) : ''} }`,
  );

  const INTERESSANTI = /url|slug|franchise|hub|pdp|link|path|page|series/i;
  const descrivi = (campo: Campo) =>
    `${campo.name}: ${campo.type.name ?? `${campo.type.kind} ${campo.type.ofType?.name ?? ''}`}`;

  const campiProdotto = intro.data?.p?.fields ?? null;
  const campiBase = intro.data?.b?.fields ?? null;

  console.log('\nintrospezione');
  if (!campiProdotto) {
    console.log(
      `  spenta o rifiutata (HTTP ${intro.status}): ${inBreve(intro.errors)}`,
    );
  } else {
    for (const [nome, campi] of [
      [tipoProdotto, campiProdotto],
      [tipoBase ?? '—', campiBase ?? []],
    ] as const) {
      console.log(`\n  ${nome}: ${campi.length} campi`);
      console.log(
        `    quelli che contano: ${
          campi
            .filter((campo) => INTERESSANTI.test(campo.name))
            .map(descrivi)
            .join(', ') || '—'
        }`,
      );
      console.log(`    tutti: ${campi.map((campo) => campo.name).join(', ')}`);
    }
  }

  // 3. senza introspezione, pochi candidati: scalari sul prodotto e sul
  //    `baseItem`, e la serie come oggetto con lo slug.
  const candidati = campiProdotto
    ? []
    : [
        'franchiseSlug',
        'pdpUrl',
        'storeUrl',
        'url',
        'baseItem { franchiseSlug }',
        'baseItem { gameHubUrl }',
        'franchise { slug }',
        'baseItem { franchise { slug } }',
      ];
  const trovati: string[] = [];
  if (candidati.length > 0) console.log('\ncandidati, uno per richiesta');
  for (const campo of candidati) {
    const prova = await query<Pagina>(OWNED(`gameSlug ${campo}`, 20), {
      next: null,
    });
    const ok = Boolean(prova.data?.me?.ownedGameProducts);
    console.log(`  ${campo.padEnd(34)} ${ok ? 'C’È' : 'no'}`);
    if (ok) trovati.push(campo);
  }

  // 4. i valori su tutta la libreria, per i campi interessanti che ci sono.
  const daLeggere = campiProdotto
    ? [
        ...campiProdotto
          .filter(
            (campo) =>
              INTERESSANTI.test(campo.name) &&
              (campo.type.kind === 'SCALAR' ||
                campo.type.ofType?.kind === 'SCALAR'),
          )
          .map((campo) => campo.name),
        ...(campiBase ?? [])
          .filter(
            (campo) =>
              INTERESSANTI.test(campo.name) &&
              (campo.type.kind === 'SCALAR' ||
                campo.type.ofType?.kind === 'SCALAR'),
          )
          .map((campo) => `baseItem { ${campo.name} }`),
      ]
    : trovati;

  console.log(`\nrichieste a EA finora:     ${richieste}`);
  if (daLeggere.length === 0) {
    console.log(
      '\nnessun campo da leggere: la pagina del gioco non sta nella risposta.\n',
    );
    process.exit(0);
  }

  // Si chiedono tutti insieme: esistono già, uno per uno.
  const valori: { slug: string; product: Record<string, unknown> }[] = [];
  let next: string | null = null;
  for (let n = 0; n < 20; n++) {
    const pagina: GraphQlResult<Pagina> = await query<Pagina>(
      OWNED(`gameSlug baseItem { gameType } ${daLeggere.join(' ')}`, 100),
      { next },
    );
    const risultato = pagina.data?.me?.ownedGameProducts;
    if (!risultato) {
      console.log(
        `\nla lettura dei valori è rifiutata (HTTP ${pagina.status}): ${inBreve(pagina.errors)}`,
      );
      break;
    }
    for (const item of risultato.items) {
      const product = item.product;
      if (!product || typeof product.gameSlug !== 'string') continue;
      valori.push({ slug: product.gameSlug, product });
    }
    next = risultato.next;
    if (!next || risultato.items.length === 0) break;
  }

  console.log(`\nvalori (${daLeggere.join(', ')})`);
  const visti = new Set<string>();
  for (const { slug, product } of valori) {
    if (visti.has(slug)) continue;
    visti.add(slug);
    // Solo i campi cercati: slug e tipo stanno già sulla riga, o non dicono niente.
    const baseItem = (product.baseItem ?? {}) as Record<string, unknown>;
    const senza = (oggetto: Record<string, unknown>, chiave: string) =>
      Object.fromEntries(Object.entries(oggetto).filter(([k]) => k !== chiave));
    const resto = senza(senza(product, 'gameSlug'), 'baseItem');
    const restoBase = senza(baseItem, 'gameType');
    console.log(
      `  ${slug.padEnd(40)} ${JSON.stringify({ ...resto, ...restoBase }).slice(0, 200)}`,
    );
  }
  console.log(`\nrichieste a EA:             ${richieste}\n`);
  process.exit(0);
}

// --- 2. l'identità ---

const identita = await query<{
  me: { player: { pd: string; psd: string; displayName: string } | null };
}>('query { me { player { pd psd displayName } } }');

console.log('\nidentità');
if (!identita.data?.me?.player) {
  console.log(`  HTTP ${identita.status}, errori: ${inBreve(identita.errors)}`);
  console.log(
    '  ← il token non basta a interrogare il GraphQL: il resto non ha senso.',
  );
  process.exit(1);
}
const player = identita.data.me.player;
console.log(`  pd (id dell'account):     ${player.pd}`);
console.log(`  psd (persona):            ${player.psd}`);
console.log(`  displayName (EA ID):      ${player.displayName}`);

// --- 3. la libreria, negozio per negozio ---
//
// Una query per negozio e non una sola con i tre insieme: la voce non dice da
// quale negozio venga (se non, forse, in `ownershipMethods`), e separarli qui è
// il modo di saperlo senza indovinare.

type OwnedItem = {
  originOfferId: string | null;
  status: string | null;
  product: {
    id: string | null;
    name: string | null;
    gameSlug: string | null;
    baseItem: {
      gameType: string | null;
      title: string | null;
      baseGameSlug: string | null;
    } | null;
    gameProductUser: {
      ownershipMethods: string[] | null;
      initialEntitlementDate: string | null;
      entitlementId: string | null;
      status: string | null;
    } | null;
  } | null;
};

type OwnedPage = {
  me: {
    ownedGameProducts: {
      next: string | null;
      totalCount?: number;
      items: OwnedItem[];
    } | null;
  } | null;
};

const OWNED_QUERY = `
  query getOwned($storefronts: [Storefront!], $limit: Int, $next: String) {
    me {
      ownedGameProducts(
        locale: "DEFAULT"
        entitlementEnabled: true
        storefronts: $storefronts
        type: [DIGITAL_FULL_GAME, PACKAGED_FULL_GAME]
        platforms: [PC]
        paging: { limit: $limit, next: $next }
      ) {
        next
        items {
          originOfferId
          status
          product {
            id
            name
            gameSlug
            baseItem { gameType title baseGameSlug }
            gameProductUser {
              ownershipMethods
              initialEntitlementDate
              entitlementId
              status
            }
          }
        }
      }
    }
  }`;

const OWNERSHIP_METHODS = [
  'UNKNOWN',
  'ASSOCIATION',
  'PURCHASE',
  'REDEMPTION',
  'GIFT_RECEIPT',
  'ENTITLEMENT_GRANT',
  'DIRECT_ENTITLEMENT',
  'PRE_ORDER_PURCHASE',
  'VAULT',
  'XGP_VAULT',
  'STEAM',
  'STEAM_VAULT',
  'STEAM_SUBSCRIPTION',
  'EPIC',
  'EPIC_VAULT',
  'EPIC_SUBSCRIPTION',
];

// Quale delle due strade ha funzionato, per dirlo in fondo. Si decide alla
// prima pagina e non si cambia: mescolarle renderebbe i numeri incomparabili.
let modo: 'per esteso' | 'persisted' | null = null;

async function paginaPosseduti(storefront: Storefront, next: string | null) {
  if (modo !== 'persisted') {
    // Il tipo dell'argomento `storefronts` non è documentato: se il nome
    // `Storefront` è sbagliato l'errore lo dice, e si ripiega.
    const risposta = await query<OwnedPage>(OWNED_QUERY, {
      storefronts: [storefront],
      limit: 100,
      next,
    });
    if (risposta.data?.me?.ownedGameProducts) {
      modo = 'per esteso';
      return risposta.data.me.ownedGameProducts;
    }
    if (modo === 'per esteso') {
      throw new Error(
        `pagina di ${storefront} rifiutata: HTTP ${risposta.status} ${inBreve(risposta.errors)}`,
      );
    }
    console.log(
      `  la query per esteso è rifiutata (HTTP ${risposta.status}): ${inBreve(risposta.errors)}`,
    );
    console.log('  ← ripiego sulla persisted query del sito');
  }

  const risposta = await persisted<OwnedPage>(
    'getPreloadedOwnedGames',
    {
      isMac: false,
      addFieldsToPreloadGames: true,
      locale: 'en',
      limit: 100,
      next: next ?? '0',
      type: ['DIGITAL_FULL_GAME', 'PACKAGED_FULL_GAME'],
      entitlementEnabled: true,
      storefronts: [storefront],
      ownershipMethods: OWNERSHIP_METHODS,
      platforms: ['PC'],
    },
    OWNED_GAMES_HASH,
  );
  if (!risposta.data?.me?.ownedGameProducts) {
    throw new Error(
      `anche la persisted query è rifiutata: HTTP ${risposta.status} ${inBreve(risposta.errors)}`,
    );
  }
  modo = 'persisted';
  return risposta.data.me.ownedGameProducts;
}

async function posseduti(storefront: Storefront) {
  const items: OwnedItem[] = [];
  let next: string | null = null;
  // Un tetto contro un cursore che non finisce: cento pagine sono diecimila voci.
  for (let pagina = 0; pagina < 100; pagina++) {
    const risultato = await paginaPosseduti(storefront, next);
    items.push(...risultato.items);
    next = risultato.next;
    if (!next || risultato.items.length === 0) break;
  }
  return items;
}

const perNegozio = new Map<Storefront, OwnedItem[]>();
console.log('\nlibreria');
for (const storefront of STOREFRONTS) {
  perNegozio.set(storefront, await posseduti(storefront));
}
console.log(`  query usata:              ${modo}`);

const nome = (item: OwnedItem) =>
  item.product?.name ?? item.product?.baseItem?.title ?? '(senza nome)';
const slug = (item: OwnedItem) => item.product?.gameSlug ?? null;

for (const storefront of STOREFRONTS) {
  const items = perNegozio.get(storefront)!;
  const offerte = new Set(items.map((item) => item.originOfferId));
  const slugs = new Set(items.map(slug).filter(Boolean));
  const prodotti = new Set(items.map((item) => item.product?.id));

  console.log(`\n  ${storefront}`);
  console.log(`    voci:                   ${items.length}`);
  console.log(`    originOfferId distinti: ${offerte.size}`);
  console.log(`    gameSlug distinti:      ${slugs.size}`);
  console.log(`    product.id distinti:    ${prodotti.size}`);
  console.log(
    `    senza product:          ${items.filter((item) => !item.product).length}`,
  );
  console.log(
    `    gameType:               ${elenco(conteggio(items, (item) => item.product?.baseItem?.gameType ?? '(nullo)'))}`,
  );
  console.log(
    `    ownershipMethods:       ${elenco(conteggio(items, (item) => (item.product?.gameProductUser?.ownershipMethods ?? ['(nullo)']).join('+')))}`,
  );
  console.log(
    `    status:                 ${elenco(conteggio(items, (item) => `${item.status ?? '—'}/${item.product?.gameProductUser?.status ?? '—'}`))}`,
  );
  console.log(
    `    con data d'acquisto:    ${items.filter((item) => item.product?.gameProductUser?.initialEntitlementDate).length}`,
  );
}

// Tutte le voci, e non un campione: decidono l'id esterno a occhio, e una
// libreria EA è di qualche decina di giochi.
const tutte = STOREFRONTS.flatMap((storefront) =>
  perNegozio.get(storefront)!.map((item) => ({ storefront, item })),
);

console.log('\n  tutte le voci:');
for (const { storefront, item } of tutte) {
  const utente = item.product?.gameProductUser;
  console.log(
    `    ${storefront.padEnd(5)} ${(item.product?.baseItem?.gameType ?? '—').padEnd(16)} ${(item.originOfferId ?? '—').padEnd(24)} ${(slug(item) ?? '—').padEnd(32)} ${(utente?.ownershipMethods ?? []).join('+').padEnd(18)} ${utente?.initialEntitlementDate?.slice(0, 10) ?? '—'.padEnd(10)}  ${nome(item)}`,
  );
}

// Le edizioni: più offerte sotto lo stesso slug. Se ci sono, l'id esterno per
// slug le fa diventare un gioco solo, come il `productId` di Epic.
const perSlug = new Map<string, typeof tutte>();
for (const voce of tutte) {
  const chiave = slug(voce.item);
  if (!chiave) continue;
  perSlug.set(chiave, [...(perSlug.get(chiave) ?? []), voce]);
}
const edizioni = [...perSlug].filter(
  ([, voci]) => new Set(voci.map((voce) => voce.item.originOfferId)).size > 1,
);
console.log(`\n  slug con più offerte:     ${edizioni.length}`);
for (const [chiave, voci] of edizioni) {
  console.log(`    ${chiave}`);
  for (const { storefront, item } of voci) {
    console.log(
      `      ${storefront.padEnd(5)} ${(item.originOfferId ?? '—').padEnd(24)} ${nome(item)}`,
    );
  }
}

// --- 4. le ore ---

type PlayTimeRow = {
  gameSlug: string;
  lastSessionEndDate: string | null;
  totalPlayTimeSeconds: number | null;
};

type PlayTimes = {
  me: { recentGames: { items: PlayTimeRow[] } | null } | null;
};

const PLAY_TIMES_QUERY = `
  query playTimes($gameSlugs: [String!]!) {
    me {
      recentGames(gameSlugs: $gameSlugs) {
        items { gameSlug lastSessionEndDate totalPlayTimeSeconds }
      }
    }
  }`;

let modoOre: 'per esteso' | 'persisted' | null = null;

async function ore(gameSlugs: string[]) {
  if (modoOre !== 'persisted') {
    const risposta = await query<PlayTimes>(PLAY_TIMES_QUERY, { gameSlugs });
    if (risposta.data?.me?.recentGames) {
      modoOre = 'per esteso';
      return risposta.data.me.recentGames.items;
    }
    console.log(
      `  la query delle ore per esteso è rifiutata (HTTP ${risposta.status}): ${inBreve(risposta.errors)}`,
    );
  }
  const risposta = await persisted<PlayTimes>(
    'GetGamePlayTimes',
    { gameSlugs },
    PLAY_TIMES_HASH,
  );
  modoOre = 'persisted';
  if (!risposta.data?.me?.recentGames) {
    console.log(
      `  anche la persisted delle ore è rifiutata (HTTP ${risposta.status}): ${inBreve(risposta.errors)}`,
    );
    return [];
  }
  return risposta.data.me.recentGames.items;
}

const tuttiGliSlug = [...perSlug.keys()];
const oreTrovate: PlayTimeRow[] = [];
console.log('\nore giocate');
for (const blocco of chunk(tuttiGliSlug, 100)) {
  oreTrovate.push(...(await ore(blocco)));
}
const oreDi = new Map(oreTrovate.map((riga) => [riga.gameSlug, riga]));
const conOre = oreTrovate.filter(
  (riga) => (riga.totalPlayTimeSeconds ?? 0) > 0,
);

console.log(`  query usata:              ${modoOre ?? '(nessuno slug)'}`);
console.log(`  slug chiesti:             ${tuttiGliSlug.length}`);
console.log(`  righe tornate:            ${oreTrovate.length}`);
console.log(`  con ore > 0:              ${conOre.length}`);
for (const storefront of STOREFRONTS) {
  const items = perNegozio.get(storefront)!;
  const conOreQui = items.filter(
    (item) => (oreDi.get(slug(item) ?? '')?.totalPlayTimeSeconds ?? 0) > 0,
  );
  console.log(
    `  di ${storefront.padEnd(5)} con ore:        ${conOreQui.length} su ${items.length}`,
  );
}

// I giochi comprati su Steam o Epic: le ore di EA da confrontare con quelle
// della copia Steam che Ludex ha già (Dragon Age: Origins - Ultimate Edition
// ha 9 minuti da Steam).
for (const storefront of ['STEAM', 'EPIC'] as const) {
  const items = perNegozio.get(storefront)!;
  if (items.length === 0) continue;
  console.log(`\n  ore EA dei giochi comprati su ${storefront}:`);
  for (const item of items) {
    const riga = oreDi.get(slug(item) ?? '');
    const minuti = Math.round((riga?.totalPlayTimeSeconds ?? 0) / 60);
    console.log(
      `    ${String(minuti).padStart(6)} min  ${riga?.lastSessionEndDate?.slice(0, 10) ?? '—'.padEnd(10)}  ${nome(item)}`,
    );
  }
}

// --- 5. la copertina, per gli scarti ---
//
// Una richiesta sola, sulle prime cinque offerte, con la query che usa Lutris:
// serve a sapere se l'indirizzo è pronto da mostrare, non a raccoglierle tutte.

const campione = tutte
  .map(({ item }) => item.originOfferId)
  .filter((id): id is string => Boolean(id))
  .slice(0, 5);

if (campione.length > 0) {
  const copertine = await query<{
    gameProducts: {
      items: {
        originOfferId: string;
        gameSlug: string;
        baseItem: {
          title: string;
          packArt: { largestImage: { path: string } | null } | null;
        };
      }[];
    } | null;
  }>(
    `query covers($offerIds: [String!]!) {
      gameProducts(offerIds: $offerIds, locale: "DEFAULT") {
        items {
          originOfferId
          gameSlug
          baseItem { title packArt { largestImage { path } } }
        }
      }
    }`,
    { offerIds: campione },
  );
  console.log('\ncopertine (prime cinque offerte)');
  if (!copertine.data?.gameProducts) {
    console.log(
      `  rifiutata (HTTP ${copertine.status}): ${inBreve(copertine.errors)}`,
    );
  } else {
    for (const item of copertine.data.gameProducts.items) {
      console.log(
        `  ${item.baseItem.title}\n    ${item.baseItem.packArt?.largestImage?.path ?? '(nessuna)'}`,
      );
    }
  }
}

console.log(`\nrichieste a EA:             ${richieste}`);

// --- 6. la risoluzione per nome ---
//
// Il matcher **dell'import**, non una sua copia. Si cercano i giochi base, uno
// per slug: le edizioni dello stesso gioco sarebbero la stessa ricerca.

const daRisolvere = [...perSlug]
  .map(([chiave, voci]) => ({ chiave, item: voci[0]!.item }))
  .filter(({ item }) => item.product?.baseItem?.gameType === 'BASE_GAME')
  .map(({ chiave, item }) => ({ externalId: chiave, name: nome(item) }));

console.log(
  `\ncerco su IGDB ${daRisolvere.length} giochi base, a 4 al secondo…`,
);
const links = await resolveByName(daRisolvere);
const agganciati = new Set(links.map((link) => link.externalId));

console.log('\nrisoluzione (per nome)');
console.log(
  `  agganciati:               ${links.length} su ${daRisolvere.length}  (${percento(links.length, daRisolvere.length)})`,
);
const irrisolti = daRisolvere.filter(
  (entry) => !agganciati.has(entry.externalId),
);
if (irrisolti.length > 0) {
  console.log(`\n  da sistemare a mano (${irrisolti.length}):`);
  for (const entry of irrisolti) {
    console.log(`    ${entry.externalId.padEnd(32)} ${entry.name}`);
  }
}

console.log();

process.exit(0);
