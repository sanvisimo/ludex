import '../env';

import { randomUUID } from 'node:crypto';

// Misure per il 9e (Xbox). **Non scrive niente**: né sul DB né su disco.
//
// **ATTENZIONE: parla con Microsoft usando l'account di chi lo lancia**, con
// l'identità di un client non nostro: il `client_id` di xbox.com, preso da
// Unifideck (stores/microsoft, misurato da loro il 02/10/2026). Non sappiamo
// come Microsoft reagisca a un account che entra da un indirizzo nuovo. Il
// 05/10/2026 Steam ha bloccato temporaneamente l'account dell'utente dopo prove
// simili: vedi «Il blocco dell'account» in docs/negozi.md. **Non lanciarlo senza
// averlo concordato, e non ripeterlo «per sicurezza»**: un giro basta.
//
//   pnpm --filter api xbox:probe [--market=IT] [--no-backcompat] [--no-igdb]
//
// Il login è un **device code**: il probe stampa un codice e un indirizzo,
// l'utente lo conferma su microsoft.com/link da qualunque dispositivo (anche il
// telefono), e il probe aspetta. Il `device_code` vive solo in questo processo.
//
// Cosa manda a Microsoft, e basta:
//
//  1. POST login.microsoftonline.com/consumers/oauth2/v2.0/devicecode
//  2. POST …/oauth2/v2.0/token, una volta ogni `interval` secondi (5) finché
//     l'utente non conferma, rifiuta, o il codice scade (15 minuti)
//  3. POST …/oauth2/v2.0/token col refresh token: il rinnovo funziona? cambia?
//  4. POST user.auth.xboxlive.com/user/authenticate (`d=`; se rifiutato, una
//     volta con `t=`, che è l'ordine di Unifideck per questo client)
//  5. POST xsts.auth.xboxlive.com/xsts/authorize per `http://xboxlive.com`
//  6. la stessa per `http://mp.microsoft.com/`
//  7. POST collections.mp.microsoft.com/v7.0/collections/query, una per pagina
//     da 100 (al più 30 pagine)
//  8. GET titlehub.xboxlive.com/users/xuid(…)/titles/titlehistory/decoration/detail
//  9. GET purchase.mp.microsoft.com/v7.0/users/me/orders, una per pagina
// 10. GET emerald.xboxservices.com/xboxcomfd/productActions/{id}, al più 30
//     (solo per i candidati Xbox 360; `--no-backcompat` salta la 9 e la 10)
// 11. POST userstats.xboxlive.com/batch (`MinutesPlayed`), una, per ultima
//
// Senza credenziali dell'utente, e quindi senza rischio per l'account:
// displaycatalog.mp.microsoft.com (titoli e piattaforme, 20 prodotti a
// richiesta), catalog.gamepass.com/sigls (gli elenchi pubblici del Game Pass,
// cinque richieste) e IGDB (la sorgente 11, se ci sono IGDB_CLIENT_ID e
// IGDB_CLIENT_SECRET; `--no-igdb` la salta).
//
// Al primo errore si ferma, senza ritentare. **Nessun token si stampa mai**,
// nemmeno in parte: dell'access token si legge solo la scadenza dichiarata.
//
// Risponde alle domande che il piano (plans/9e-xbox.md) non può chiudere a
// tavolino:
//
//  a. il device code col client di xbox.com funziona da qui? il rinnovo
//     funziona, e il refresh token cambia a ogni rinnovo?
//  b. quante voci dà Collections, e di che tipo? c'è una data d'acquisto?
//     ci sono i free-to-play?
//  c. quanti giocati, quanti non in Collections, quanti di questi nel Game Pass
//     (cioè quanti diventerebbero «fisici»)?
//  d. le ore arrivano?
//  e. cosa dice il catalogo: PC, Xbox, Play Anywhere, One contro Series?
//  f. quanti Xbox 360 retrocompatibili fuori da Collections?
//  g. gli uid della sorgente IGDB 11 sono i productId? quanti ne trova?

const CLIENT_ID = '1f907974-e22b-4810-a9de-d9647380c97e';
const SCOPE = 'XboxLive.signin offline_access';
const LOGIN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const XBL_URL = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const COLLECTIONS_URL =
  'https://collections.mp.microsoft.com/v7.0/collections/query';
const ORDERS_URL = 'https://purchase.mp.microsoft.com/v7.0/users/me/orders';
const CATALOG_URL = 'https://displaycatalog.mp.microsoft.com/v7.0/products';
const SIGLS_URL = 'https://catalog.gamepass.com/sigls/v2';
// Gli header che Unifideck manda su user.auth e XSTS (microsoft_auth.py,
// microsoft_config.py): un giro solo, quindi le stesse richieste che loro hanno
// misurato su account veri, non le nostre.
const XBL_HEADERS = {
  'User-Agent': 'XboxReplay; XboxLiveAuth/3.0',
  'Accept-Language': 'en-US',
};
// Gli elenchi pubblici del Game Pass: console, PC, tutti, EA Play console e PC.
// Da Unifideck (game_pass.py).
const GAME_PASS_LISTS = [
  'f6f1f99f-9b49-4ccd-b3bf-4d9767a77f5e',
  'fdd9e2a7-0fee-49f6-ad69-4354098401ff',
  '29a81209-df6f-41fd-a528-2ae6b91f719c',
  'b8900d09-a491-44cc-916e-32b5acae621b',
  '1d33fbb9-b895-4732-a8ca-a55c8b99fa2c',
];
// Gli abbonamenti, non giochi: Game Pass, Gold.
const PASS_PREFIX = 'CFQ7TTC0';
// I «Game» che sono DLC, secondo il titolo (Unifideck, catalog_platforms.py).
const EXTRA_TITLE =
  /\b(?:add-?on|upgrade|soundtrack|artbook|season pass|expansion pass|friend'?s pass|dlc|demo)\b/i;

const argomento = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const market = (argomento('market') ?? 'IT').toUpperCase();
const backcompat = !process.argv.includes('--no-backcompat');
const igdb = !process.argv.includes('--no-igdb');

const MAX_COLLECTION_PAGES = 30;
const MAX_ORDER_PAGES = 20;
const MAX_ACTIONS = 30;

let richieste = 0;
let interrogazioni = 0;
let pubbliche = 0;

type Json = Record<string, unknown>;

// Una richiesta all'account, nessun ritentativo: se Microsoft risponde male si
// legge e ci si ferma, non si insiste. `accetta` sono gli stati che il chiamante
// gestisce da sé (il 400 dell'interrogazione del device code, il primo rifiuto
// di user.auth).
const chiama = async (
  etichetta: string,
  url: string,
  init: RequestInit,
  accetta: number[] = [],
) => {
  richieste += 1;
  console.log(`  → richiesta ${richieste}: ${etichetta}`);
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok && !accetta.includes(response.status)) {
    const corpo = (await response.text()).slice(0, 300);
    console.error(
      `\n${etichetta}: HTTP ${response.status}. Mi fermo qui, senza ritentare.\n${corpo}`,
    );
    process.exit(1);
  }
  return response;
};

// Le richieste senza le credenziali dell'utente. Un errore qui non è un motivo
// per fermarsi: si dice e si va avanti senza quel dato.
const pubblica = async (url: string): Promise<unknown> => {
  pubbliche += 1;
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      console.log(
        `  (pubblica: HTTP ${response.status} su ${url.slice(0, 80)})`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.log(
      `  (pubblica: ${(error as Error).name} su ${url.slice(0, 80)})`,
    );
    return null;
  }
};

const form = (body: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(body),
});

const conteggio = <T>(rows: T[], chiave: (row: T) => string) => {
  const mappa = new Map<string, number>();
  for (const row of rows) {
    mappa.set(chiave(row), (mappa.get(chiave(row)) ?? 0) + 1);
  }
  return [...mappa].sort((a, b) => b[1] - a[1]);
};

const stampaConteggio = (titolo: string, righe: [string, number][]) => {
  console.log(`  ${titolo}:`);
  for (const [valore, n] of righe) {
    console.log(`    ${valore.padEnd(30)} ${n}`);
  }
};

const chunk = <T>(rows: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

const asString = (value: unknown) =>
  typeof value === 'string' ? value : undefined;

// --- 1. il device code ---

console.log(`\nmarket: ${market}`);
console.log('\nrichieste a Microsoft (account)');

type DeviceCode = {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  expires_in?: number;
  interval?: number;
};
const device = (await (
  await chiama(
    'devicecode',
    `${LOGIN_URL}/devicecode`,
    form({ client_id: CLIENT_ID, scope: SCOPE }),
  )
).json()) as DeviceCode;

if (!device.device_code || !device.user_code) {
  console.error('la risposta non ha device_code o user_code. Mi fermo.');
  process.exit(1);
}

const verifica = device.verification_uri ?? 'https://www.microsoft.com/link';
console.log(
  `\nApri ${verifica} (anche dal telefono), accedi con l'account Xbox e\n` +
    `scrivi questo codice:\n\n    ${device.user_code}\n\n` +
    `Poi premi «Consenti». Il codice vale ${Math.round((device.expires_in ?? 900) / 60)} minuti; aspetto.\n`,
);

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
};

let intervallo = (device.interval ?? 5) * 1000;
const scadenza = Date.now() + (device.expires_in ?? 900) * 1000;
let token: TokenResponse | null = null;

while (Date.now() < scadenza) {
  await pausa(intervallo);
  interrogazioni += 1;
  const response = await fetch(`${LOGIN_URL}/token`, {
    ...form({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: CLIENT_ID,
      device_code: device.device_code,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json()) as TokenResponse;
  if (response.ok && body.access_token) {
    token = body;
    break;
  }
  if (body.error === 'authorization_pending') continue;
  if (body.error === 'slow_down') {
    intervallo += 5000;
    continue;
  }
  console.error(
    `\ntoken (device code): HTTP ${response.status}, ${body.error ?? 'nessun errore dichiarato'}. Mi fermo.`,
  );
  process.exit(1);
}

if (!token?.access_token) {
  console.error('\nil codice è scaduto senza conferma. Mi fermo.');
  process.exit(1);
}

console.log(`  confermato dopo ${interrogazioni} interrogazioni`);

// --- 2. il rinnovo ---

// Senza refresh token il rinnovo sarebbe un 400 sicuro: non si manda.
const rinnovo: TokenResponse = token.refresh_token
  ? ((await (
      await chiama(
        'token (refresh)',
        `${LOGIN_URL}/token`,
        form({
          grant_type: 'refresh_token',
          client_id: CLIENT_ID,
          refresh_token: token.refresh_token,
          scope: SCOPE,
        }),
      )
    ).json()) as TokenResponse)
  : {};

const accessToken = rinnovo.access_token ?? token.access_token;

console.log('\ncredenziali');
console.log(`  scope:                    ${token.scope ?? '(non dichiarato)'}`);
console.log(`  access token vale:        ${token.expires_in ?? '?'} s`);
console.log(
  `  refresh token:            ${token.refresh_token ? 'presente' : 'ASSENTE'}`,
);
console.log(
  `  rinnovo riuscito:         ${
    !token.refresh_token ? '(non provato)' : rinnovo.access_token ? 'sì' : 'no'
  }`,
);
console.log(
  `  il refresh token cambia:  ${
    !rinnovo.refresh_token
      ? '(il rinnovo non ne rende uno)'
      : rinnovo.refresh_token === token.refresh_token
        ? 'no'
        : 'sì'
  }`,
);
console.log(
  '  durata del refresh token: non dichiarata da Microsoft, si vedrà nel tempo',
);

// --- 3. Xbox Live: user token e i due XSTS ---

type XboxToken = {
  Token?: string;
  NotAfter?: string;
  DisplayClaims?: {
    xui?: { uhs?: string; xid?: string; gtg?: string; agg?: string }[];
  };
  XErr?: number;
};

const userToken = async (prefisso: 'd' | 't', contratto: string) =>
  chiama(
    `user.auth (${prefisso}=)`,
    XBL_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-xbl-contract-version': contratto,
        ...XBL_HEADERS,
      },
      body: JSON.stringify({
        Properties: {
          AuthMethod: 'RPS',
          SiteName: 'user.auth.xboxlive.com',
          RpsTicket: `${prefisso}=${accessToken}`,
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT',
      }),
    },
    prefisso === 'd' ? [400, 401] : [],
  );

let xblResponse = await userToken('d', '1');
let prefissoUsato = 'd=';
if (!xblResponse.ok) {
  console.log(`  user.auth con d= rifiutato (${xblResponse.status}): provo t=`);
  xblResponse = await userToken('t', '2');
  prefissoUsato = 't=';
}
const xbl = (await xblResponse.json()) as XboxToken;
if (!xbl.Token) {
  console.error('user.auth non ha reso un token. Mi fermo.');
  process.exit(1);
}

const xsts = async (relyingParty: string) => {
  const response = await chiama(
    `xsts (${relyingParty})`,
    XSTS_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-xbl-contract-version': '1',
        ...XBL_HEADERS,
      },
      body: JSON.stringify({
        Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
        RelyingParty: relyingParty,
        TokenType: 'JWT',
      }),
    },
    [401],
  );
  const body = (await response.json()) as XboxToken;
  if (!response.ok || !body.Token) {
    // 2148916233 nessun profilo Xbox, 2148916235 paese, 2148916238 minore.
    console.error(
      `\nxsts (${relyingParty}): HTTP ${response.status}, XErr ${body.XErr ?? '?'}. Mi fermo.`,
    );
    process.exit(1);
  }
  return body;
};

const live = await xsts('http://xboxlive.com');
const negozio = await xsts('http://mp.microsoft.com/');

const claims = live.DisplayClaims?.xui?.[0] ?? {};
const xuid = claims.xid;
if (!xuid || !claims.uhs || !negozio.DisplayClaims?.xui?.[0]?.uhs) {
  console.error("l'XSTS non ha xuid o user hash. Mi fermo.");
  process.exit(1);
}
const authLive = `XBL3.0 x=${claims.uhs};${live.Token}`;
const authNegozio = `XBL3.0 x=${negozio.DisplayClaims.xui[0].uhs};${negozio.Token}`;

console.log('\nXbox Live');
console.log(`  RpsTicket che funziona:   ${prefissoUsato}`);
console.log(`  gamertag:                 ${claims.gtg ?? '(assente)'}`);
console.log(`  xuid presente:            sì`);
console.log(`  fascia d'età (agg):       ${claims.agg ?? '(assente)'}`);
console.log(`  XSTS scade:               ${live.NotAfter ?? '?'}`);

// --- 4. Collections: i posseduti ---

const items: Json[] = [];
let continuationToken: string | undefined;
for (let pagina = 1; pagina <= MAX_COLLECTION_PAGES; pagina += 1) {
  const response = await chiama(
    `collections, pagina ${pagina}`,
    COLLECTIONS_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: authNegozio,
        // Un id di correlazione nuovo a ogni richiesta, come Unifideck.
        'MS-CV': `${randomUUID().replaceAll('-', '').toUpperCase()}.0`,
      },
      body: JSON.stringify({
        maxPageSize: 100,
        excludeDuplicates: true,
        market,
        validityType: 'All',
        beneficiaries: [
          {
            identityType: 'xuid',
            identityValue: xuid,
            localTicketReference: 'ludex',
          },
        ],
        ...(continuationToken ? { continuationToken } : {}),
      }),
    },
  );
  const body = (await response.json()) as {
    items?: Json[];
    continuationToken?: string;
  };
  const got = body.items ?? [];
  items.push(...got);
  continuationToken = body.continuationToken;
  if (!continuationToken || got.length === 0) break;
}

type Tipo = 'pass' | 'non gioco' | 'inattivo' | 'trial' | 'gold' | 'posseduto';
const tipo = (item: Json): Tipo => {
  const pid = asString(item.productId)?.toUpperCase() ?? '';
  if (pid.startsWith(PASS_PREFIX) || item.productKind === 'Pass') return 'pass';
  if (item.productKind !== 'Game') return 'non gioco';
  if (item.status !== 'Active') return 'inattivo';
  if (item.isTrial === true || item.skuType === 'Trial') return 'trial';
  if (item.licensingRequired === true) return 'gold';
  return 'posseduto';
};

console.log('\nCollections');
console.log(`  voci:                     ${items.length}`);
stampaConteggio(
  'per tipo (regole di Unifideck)',
  conteggio(items, (i) => tipo(i)),
);
stampaConteggio(
  'per productKind',
  conteggio(items, (i) => asString(i.productKind) ?? '(assente)'),
);
stampaConteggio(
  'per acquisitionType',
  conteggio(items, (i) => asString(i.acquisitionType) ?? '(nullo)'),
);
stampaConteggio(
  'campi presenti (su quante voci)',
  conteggio(
    items.flatMap((i) => Object.keys(i)),
    (k) => k,
  ),
);
const date = items
  .map((i) => asString(i.acquiredDate))
  .filter((d): d is string => Boolean(d))
  .sort();
console.log(
  `  acquiredDate:             su ${date.length} voci, dal ${date[0]?.slice(0, 10) ?? '—'} al ${date.at(-1)?.slice(0, 10) ?? '—'}`,
);
console.log(
  `  date ripetute (top 3):    ${conteggio(date, (d) => d.slice(0, 10))
    .slice(0, 3)
    .map(([d, n]) => `${d} ×${n}`)
    .join(', ')}`,
);

const giochi = new Map<string, Tipo>();
for (const item of items) {
  const kind = tipo(item);
  const pid = asString(item.productId)?.toUpperCase();
  if (pid && (kind === 'posseduto' || kind === 'gold')) giochi.set(pid, kind);
}

// --- 5. lo storico (titlehub) ---

type Titolo = {
  titleId?: string;
  pfn?: string;
  name?: string;
  type?: string;
  devices?: string[];
  mediaItemType?: string;
  detail?: { availabilities?: { ProductId?: string }[] };
  titleHistory?: { lastTimePlayed?: string };
};

const storico = (await (
  await chiama(
    'titlehub (storico)',
    `https://titlehub.xboxlive.com/users/xuid(${xuid})/titles/titlehistory/decoration/detail?maxItems=5000`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: authLive,
        'x-xbl-contract-version': '2',
        'Accept-Language': 'en-US',
      },
    },
  )
).json()) as { titles?: Titolo[] };
const titoli = storico.titles ?? [];
const titoliGioco = titoli.filter((t) => t.type === 'Game');

const productIdsDi = (t: Titolo) =>
  (t.detail?.availabilities ?? [])
    .map((a) => a.ProductId?.toUpperCase())
    .filter((p): p is string => Boolean(p));

console.log('\nstorico (titlehub)');
console.log(`  titoli:                   ${titoli.length}`);
stampaConteggio(
  'per type',
  conteggio(titoli, (t) => t.type ?? '(assente)'),
);
stampaConteggio(
  'per devices (dei Game)',
  conteggio(
    titoliGioco,
    (t) => (t.devices ?? []).sort().join('+') || '(nessuno)',
  ),
);
stampaConteggio(
  'per mediaItemType (dei Game)',
  conteggio(titoliGioco, (t) => t.mediaItemType ?? '(assente)'),
);
stampaConteggio(
  'productId da detail.availabilities (dei Game)',
  conteggio(titoliGioco, (t) => {
    const n = new Set(productIdsDi(t)).size;
    return n === 0 ? 'nessuno' : n === 1 ? 'uno' : 'più di uno';
  }),
);

// --- 6. il Game Pass (elenchi pubblici) ---

console.log("\nrichieste pubbliche (senza l'account)");
const gamePass = new Set<string>();
let elenchiLetti = 0;
for (const id of GAME_PASS_LISTS) {
  const lista = await pubblica(
    `${SIGLS_URL}?${new URLSearchParams({ id, language: 'en-us', market })}`,
  );
  if (!Array.isArray(lista)) continue;
  elenchiLetti += 1;
  for (const row of lista as Json[]) {
    const pid = asString(row.id);
    if (pid) gamePass.add(pid.toUpperCase());
  }
}
console.log(
  `  Game Pass: ${gamePass.size} prodotti da ${elenchiLetti} elenchi su ${GAME_PASS_LISTS.length}`,
);

// --- 7. il catalogo ---

type Prodotto = Json & {
  ProductId?: string;
  LocalizedProperties?: { ProductTitle?: string }[];
  Properties?: Json;
  DisplaySkuAvailabilities?: { Sku?: { Properties?: Json } }[];
};

const catalogo = new Map<string, Prodotto>();
const leggiCatalogo = async (ids: string[]) => {
  for (const pagina of chunk(ids, 20)) {
    const body = (await pubblica(
      `${CATALOG_URL}?${new URLSearchParams({
        bigIds: pagina.join(','),
        market,
        languages: 'en-US',
      })}`,
    )) as { Products?: Prodotto[] } | null;
    for (const p of body?.Products ?? []) {
      if (p.ProductId) catalogo.set(p.ProductId.toUpperCase(), p);
    }
  }
};

type Piattaforme = {
  pc: boolean;
  xbox: boolean;
  xpa: boolean;
  demo: boolean;
  gen: string;
};
const piattaforme = (p: Prodotto | undefined): Piattaforme => {
  const nomi = new Set<string>();
  let xpa = false;
  for (const a of p?.DisplaySkuAvailabilities ?? []) {
    const sku = a.Sku?.Properties ?? {};
    if (sku.XboxXPA === true) xpa = true;
    for (const pkg of (sku.Packages as Json[] | undefined) ?? []) {
      for (const dep of (pkg.PlatformDependencies as Json[] | undefined) ??
        []) {
        const nome = asString(dep.PlatformName);
        if (nome) nomi.add(nome);
      }
    }
  }
  const props = p?.Properties ?? {};
  const gen = props.XboxConsoleGenCompatible;
  const attributi = ((props.Attributes as Json[] | undefined) ?? []).map(
    (a) => a.Name,
  );
  return {
    pc: nomi.has('Windows.Desktop') || nomi.has('Windows.Universal'),
    xbox: nomi.has('Windows.Xbox') || Boolean(gen),
    xpa: xpa || attributi.includes('XPA'),
    demo: props.IsDemo === true,
    gen: Array.isArray(gen)
      ? [...gen].sort().join('+')
      : gen
        ? String(gen)
        : '(assente)',
  };
};
const titoloDi = (p: Prodotto | undefined) =>
  p?.LocalizedProperties?.[0]?.ProductTitle ?? '';

await leggiCatalogo([...giochi.keys()]);
console.log(`  catalogo: ${catalogo.size} prodotti su ${giochi.size} chiesti`);

const posseduti = [...giochi].map(([pid, kind]) => {
  const p = catalogo.get(pid);
  return { pid, kind, titolo: titoloDi(p), ...piattaforme(p) };
});
const veri = posseduti.filter((g) => !g.demo && !EXTRA_TITLE.test(g.titolo));

console.log('\nposseduti (Collections + catalogo)');
console.log(`  giochi e Gold:            ${posseduti.length}`);
console.log(
  `  tolti come demo o DLC:    ${posseduti.length - veri.length}  (${posseduti
    .filter((g) => !veri.includes(g))
    .slice(0, 8)
    .map((g) => g.titolo || g.pid)
    .join(' · ')})`,
);
stampaConteggio(
  'piattaforme',
  conteggio(
    veri,
    (g) =>
      [g.pc && 'PC', g.xbox && 'Xbox', g.xpa && 'Play Anywhere']
        .filter(Boolean)
        .join(' + ') || '(nessuna: senza catalogo o bundle)',
  ),
);
stampaConteggio(
  'XboxConsoleGenCompatible (dei giochi Xbox)',
  conteggio(
    veri.filter((g) => g.xbox),
    (g) => g.gen,
  ),
);
console.log(
  `  di questi oggi nel Game Pass: ${veri.filter((g) => gamePass.has(g.pid)).length}`,
);
console.log('  i primi 15:');
for (const g of veri.slice(0, 15)) {
  console.log(
    `    ${(g.titolo || '?').slice(0, 44).padEnd(44)} ${g.pid} ${g.kind.padEnd(9)} ${[g.pc && 'PC', g.xbox && 'Xbox', g.xpa && 'XPA'].filter(Boolean).join('+')}`,
  );
}

// --- 8. i giocati che Collections non ha ---

const fuori = titoliGioco.filter(
  (t) => !productIdsDi(t).some((pid) => giochi.has(pid)),
);
const nelGamePass = fuori.filter((t) =>
  productIdsDi(t).some((pid) => gamePass.has(pid)),
);
const fisici = fuori.filter((t) => !nelGamePass.includes(t));

console.log('\ngiocati che Collections non ha');
console.log(
  `  in tutto:                 ${fuori.length} su ${titoliGioco.length} Game`,
);
console.log(`  oggi nel Game Pass:       ${nelGamePass.length}  → game_pass`);
console.log(
  `  gli altri:                ${fisici.length}  → «fisico», secondo il piano`,
);
console.log('  gli altri, i primi 25 (sono i candidati ai falsi «fisici»):');
for (const t of fisici.slice(0, 25)) {
  console.log(
    `    ${(t.name ?? '?').slice(0, 44).padEnd(44)} ${(t.devices ?? []).join('+')}`,
  );
}

// --- 9. gli Xbox 360 retrocompatibili ---

if (backcompat) {
  const candidati = new Map<string, string>();
  for (const t of titoliGioco) {
    if (!t.devices?.includes('Xbox360')) continue;
    for (const pid of productIdsDi(t)) {
      if (!candidati.has(pid)) candidati.set(pid, t.name ?? '');
    }
  }

  let ordini = 0;
  let url: string | undefined = ORDERS_URL; // niente market=: è un 400
  for (let pagina = 1; url && pagina <= MAX_ORDER_PAGES; pagina += 1) {
    const body = (await (
      await chiama(`orders, pagina ${pagina}`, url, {
        headers: { Accept: 'application/json', Authorization: authNegozio },
      })
    ).json()) as { items?: Json[]; '@nextLink'?: string };
    for (const order of body.items ?? []) {
      ordini += 1;
      if (order.orderState !== 'Purchased' && order.orderState !== 'Refunded') {
        continue;
      }
      for (const line of (order.orderLineItems as Json[] | undefined) ?? []) {
        const pid = asString(line.productId)?.toUpperCase();
        const kind = (asString(line.productType) ?? 'Game').toLowerCase();
        if (pid && line.billingState === 'Charged' && kind === 'game') {
          if (!candidati.has(pid))
            candidati.set(pid, asString(line.title) ?? '');
        }
      }
    }
    url = body['@nextLink'] || undefined;
  }

  const daControllare = [...candidati].filter(([pid]) => !giochi.has(pid));
  console.log('\nXbox 360 retrocompatibili');
  console.log(`  ordini letti:             ${ordini}`);
  console.log(
    `  candidati fuori da Collections: ${daControllare.length} (ne controllo al più ${MAX_ACTIONS})`,
  );

  const trovati: string[] = [];
  for (const [pid, nome] of daControllare.slice(0, MAX_ACTIONS)) {
    const response = await chiama(
      `productActions ${pid}`,
      `https://emerald.xboxservices.com/xboxcomfd/productActions/${pid}?locale=en-US`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: authNegozio,
          'x-ms-api-version': '1.0',
          // Senza, 400 «Header MS-CV is missing» (misurato il 19/10/2026;
          // Unifideck non lo manda).
          'MS-CV': `${randomUUID().replaceAll('-', '').toUpperCase()}.0`,
        },
      },
      [404],
    );
    if (response.ok) {
      const body = (await response.json()) as { productActions?: Json[] };
      const entry = body.productActions?.[0] ?? {};
      const azioni = new Set<unknown>(
        ((entry.productActions as Json[] | undefined) ?? []).map(
          (a) => a.actionType,
        ),
      );
      for (const lista of Object.values(
        (entry.skuActionsBySkuId as Record<string, Json[]> | undefined) ?? {},
      )) {
        for (const a of lista ?? []) azioni.add(a.actionType);
      }
      if (
        azioni.has('Install') &&
        !azioni.has('BuyToOwn') &&
        !azioni.has('NotSoldSeparately')
      ) {
        trovati.push(nome || pid);
      }
    }
    await pausa(300);
  }
  console.log(`  posseduti fuori da Collections: ${trovati.length}`);
  for (const nome of trovati) console.log(`    ${nome}`);
}

// --- 10. l'identità su IGDB, sorgente 11 ---
//
// Non parla con Microsoft. Si chiedono gli id in maiuscolo e in minuscolo,
// perché la forma degli uid della sorgente 11 non è nota.

if (igdb && veri.length > 0) {
  if (!process.env.IGDB_CLIENT_ID || !process.env.IGDB_CLIENT_SECRET) {
    console.log('\nIGDB: credenziali assenti, salto la sorgente 11.');
    console.log(`  gli id da provare altrove (${veri.length}):`);
    console.log(`    ${veri.map((g) => g.pid).join(' ')}`);
  } else {
    const { findIgdbGamesBySource } = await import('../external/igdb');
    const ids = veri.flatMap((g) => [g.pid, g.pid.toLowerCase()]);
    const trovati = await findIgdbGamesBySource(11, ids);
    const agganciati = veri.filter(
      (g) => trovati.has(g.pid) || trovati.has(g.pid.toLowerCase()),
    );
    console.log('\nIGDB, sorgente 11');
    console.log(
      `  agganciati:               ${agganciati.length} su ${veri.length}  (${Math.round((100 * agganciati.length) / veri.length)}%)`,
    );
    console.log(
      `  in maiuscolo / minuscolo: ${veri.filter((g) => trovati.has(g.pid)).length} / ${veri.filter((g) => trovati.has(g.pid.toLowerCase())).length}`,
    );
    console.log('  irrisolti, i primi 20:');
    for (const g of veri.filter((v) => !agganciati.includes(v)).slice(0, 20)) {
      console.log(`    ${(g.titolo || '?').slice(0, 44).padEnd(44)} ${g.pid}`);
    }
  }
}

// --- 11. le ore (userstats) ---
//
// Per ultima: è la richiesta meno provata (Unifideck non la usa, e Playnite
// dice che per alcuni torna vuota), e se fallisce si perdono solo le ore.

if (titoliGioco.length > 0) {
  const stats = (await (
    await chiama(
      'userstats (MinutesPlayed)',
      'https://userstats.xboxlive.com/batch',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authLive,
          'x-xbl-contract-version': '2',
        },
        body: JSON.stringify({
          arrangebyfield: 'xuid',
          stats: titoliGioco
            .filter((t) => t.titleId)
            .map((t) => ({ name: 'MinutesPlayed', titleid: t.titleId })),
          xuids: [xuid],
        }),
      },
    )
  ).json()) as {
    statlistscollection?: { stats?: { titleid?: string; value?: string }[] }[];
  };
  const minuti = new Map(
    (stats.statlistscollection?.[0]?.stats ?? [])
      .filter((s) => s.titleid && Number(s.value) > 0)
      .map((s) => [s.titleid as string, Number(s.value)]),
  );
  console.log('\nore (userstats)');
  console.log(
    `  con minuti > 0:           ${minuti.size} su ${titoliGioco.length} Game`,
  );
  console.log('  i candidati ai falsi «fisici», i primi 25:');
  for (const t of fisici.slice(0, 25)) {
    console.log(
      `    ${(t.name ?? '?').slice(0, 44).padEnd(44)} ${String(minuti.get(t.titleId ?? '') ?? 0).padStart(6)} min`,
    );
  }
}

console.log(
  `\nrichieste a Microsoft con l'account: ${richieste}, più ${interrogazioni} interrogazioni del device code`,
);
console.log(`richieste pubbliche: ${pubbliche}`);
process.exit(0);
