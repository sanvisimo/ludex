import '../env';

import { createHash, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

// Misura per il 9d: la pagina «Virtual Game Cards» di Nintendo, cioè l'elenco
// delle licenze digitali dell'account **anche mai avviate**. È la fonte che usa
// l'estensione Nintendo di Playnite (XenorPLxx/playnite-library-nintendo), e
// quella che lo storico di gioco non può dare. **Non scrive niente**.
//
//   pnpm --filter api nintendo:vgc-probe [--hidden | --schema] [--find=testo] [--app-token] [--with-cookies] [--limit=300] [--names]
//
// **ATTENZIONE: manda UNA richiesta a Nintendo con un token del tuo account**
// (**tre** con `--app-token`, vedi sotto), dalla tua macchina. Lo stesso avvertimento di `nintendo:probe`: non lanciarlo
// senza averlo concordato, e non ripeterlo «per sicurezza». Vedi «Il rischio» in
// plans/9d-nintendo.md.
//
// Come si prepara, nel browser dove sei già dentro l'account:
//
//  1. apri https://accounts.nintendo.com/portal/vgcs/ con gli strumenti di
//     sviluppo aperti sulla scheda «Rete» (Network);
//  2. nell'elenco delle richieste trova la **POST** verso il GraphQL (si chiama
//     `graphql` o simile, e nel corpo c'è `getVgcs`);
//  3. clic destro → Copia → **Copia come cURL (bash)**;
//  4. lancia il comando e incolla il cURL, poi Invio e Ctrl+D.
//
// Cosa fa del cURL:
//
//  - **rifà la richiesta com'è**, con l'unica modifica `variables.limit`
//    (300 di default, come Playnite) e `offset` a 0: una pagina sola;
//  - **non manda i cookie**, e questo è lo scopo: la domanda è se il solo
//    `idToken` e l'header `x-nintendo-savanna-client-id` bastano. I cookie sono
//    l'intera sessione web dell'account, pagamenti compresi, e non vogliamo
//    saperne. Se la risposta è 401/403 il probe si ferma e lo dice; con
//    `--with-cookies` si può rifare **con una seconda richiesta, scelta da te**;
//  - **manda solo a host `*.nintendo.com` o `*.nintendo.net`**, perché nel cURL
//    c'è un token e non deve uscire altrove;
//  - **non stampa mai** token, cookie, header né l'`idToken`: dell'`idToken` si
//    legge solo la scadenza dal payload del JWT.
//
// Risponde a: (1) il GraphQL accetta il solo `idToken`? (2) quanti titoli rende,
// e di che piattaforma (`NX`, `OUNCE`…)? (3) quanto vive l'`idToken`?
//
// **`--hidden`** (06/10/2026): la query del portale manda `isHidden: false`, quindi
// esclude le licenze che l'utente ha nascosto dall'elenco dei download. *Tetris 99*
// compare nello storico e non fra le licenze, e il sospetto è che sia nascosto. Il
// flag rifà la **stessa richiesta con `isHidden: true`** (una sola richiesta, e si
// ferma se la query non contiene `isHidden: false`) e `--find=tetris` stampa le voci
// il cui nome contiene quel testo. Non si sa se `true` renda **solo** i nascosti o
// tutto: lo dice la riga «nascosti / in prestito».
//
// **`--schema`** (06/10/2026): c'è una data d'acquisto? La query non ne riceve, ma
// il portale ordina per `ACTIVATED_DATE`, quindi esiste. Il flag manda
// **un'introspezione GraphQL**, **senza `idToken`** (non serve, e meno token
// escono meglio è), e stampa solo i tipi che si chiamano «Vgc…» con i loro campi, e
// i campi che sembrano una data. **Un tipo di richiesta che l'app non fa mai**:
// rischio basso, non nullo; e il server può averla spenta (lo dirà). Una richiesta.
//
// Nota: la query del portale usa `hasReleased*` (`hasApplication` e simili sono quelli
// di Playnite e qui valgono sempre falso: il primo giro li aveva letti così).
//
// Misurato il 06/10/2026 (senza `--app-token`): sì, il solo `idToken` basta (HTTP
// 200 senza cookie); 19 titoli, tutti `NX`; l'`idToken` del portale vive **14
// minuti** e lo si ricava dalla pagina del portale, che vuole i cookie.
//
// **`--app-token`: la domanda che resta.** Il GraphQL accetta anche l'`id_token`
// che dà **il nostro login** (quello dell'app, con il session token da 730 giorni)
// al posto di quello del portale? Se sì, la libreria digitale si legge con le
// credenziali che già gestiamo, senza cookie. Come si fa, **tre richieste**:
//
//  1. il probe stampa un indirizzo di login (come `nintendo:probe`): aprilo, entra,
//     e alla pagina «Link an account» fai clic destro su «Select this account» →
//     «Copia indirizzo del link»;
//  2. incolla quell'indirizzo come **prima riga**, poi, sulle righe dopo, **lo
//     stesso cURL** di prima (serve per indirizzo, header e query: l'`idToken` al
//     suo interno è già scaduto e viene sostituito col nostro); Invio e Ctrl+D;
//  3. richieste a Nintendo: `session_token`, `token` e il GraphQL. Prima di
//     qualunque richiesta si controlla tutto in locale (indirizzo del link, state,
//     dominio del cURL, forma della query): se qualcosa non torna non parte niente.
//
// L'id_token dell'app non si stampa e non si salva: se ne legge solo la scadenza.

const flag = (name: string) =>
  process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const withCookies = Boolean(flag('with-cookies'));
const listNames = Boolean(flag('names'));
const limit = Number(flag('limit')?.split('=')[1] ?? 300);
const appToken = Boolean(flag('app-token'));
const hiddenMode = Boolean(flag('hidden'));
const schemaMode = Boolean(flag('schema'));
const find = flag('find')?.split('=')[1]?.toLowerCase();

if (hiddenMode && schemaMode) {
  console.error('--hidden e --schema sono due misure: una per volta.');
  process.exit(1);
}
if (schemaMode && appToken) {
  console.error('--schema non manda nessun token: non serve --app-token.');
  process.exit(1);
}
let requests = 0;

// --- Il login dell'app (solo con `--app-token`): gli stessi valori di `nintendo:probe` ---

const CLIENT_ID = '5c38e31cd085304b';
const ACCOUNTS_URL = 'https://accounts.nintendo.com';
const USER_AGENT = 'com.nintendo.znej/3.0.3 (iOS/26.0.1)';
const SCOPE = 'openid user user.mii user.email user.links[].id';
const loginState = randomBytes(36).toString('base64url');
const loginVerifier = randomBytes(32).toString('base64url');
const loginUrl = `${ACCOUNTS_URL}/connect/1.0.0/authorize?${new URLSearchParams(
  {
    client_id: CLIENT_ID,
    redirect_uri: `npf${CLIENT_ID}://auth`,
    response_type: 'session_token_code',
    scope: SCOPE,
    session_token_code_challenge: createHash('sha256')
      .update(loginVerifier)
      .digest('base64url'),
    session_token_code_challenge_method: 'S256',
    state: loginState,
    theme: 'login_form',
  },
)}`;

/** Una POST a Nintendo, senza ritentativi: se risponde male si legge e ci si ferma. */
async function accountsPost(label: string, path: string, init: RequestInit) {
  requests += 1;
  console.log(`  → richiesta ${requests}: ${label}`);
  const response = await fetch(`${ACCOUNTS_URL}${path}`, {
    method: 'POST',
    ...init,
    headers: { 'User-Agent': USER_AGENT, ...init.headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    console.error(
      `\n${label}: HTTP ${response.status}. Mi fermo qui, senza ritentare.\n${(await response.text()).slice(0, 300)}`,
    );
    process.exit(1);
  }
  return (await response.json()) as Record<string, unknown>;
}

// --- Un cURL «Copia come bash» di Chrome o Firefox, ridotto a token ---

/**
 * Spezza un comando shell nei suoi argomenti. Gestisce quello che i browser
 * producono: apici singoli, apici doppi, `$'…'` con le sequenze di escape, e la
 * barra rovesciata a fine riga.
 */
function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inToken = false;
  let i = 0;

  const push = () => {
    if (inToken) tokens.push(current);
    current = '';
    inToken = false;
  };

  while (i < command.length) {
    const c = command[i]!;

    if (c === '\\' && command[i + 1] === '\n') {
      i += 2;
    } else if (c === '\\' && command[i + 1] === '\r') {
      i += command[i + 2] === '\n' ? 3 : 2;
    } else if (/\s/.test(c)) {
      push();
      i++;
    } else if (c === "'") {
      inToken = true;
      const end = command.indexOf("'", i + 1);
      if (end < 0) throw new Error('apice singolo non chiuso');
      current += command.slice(i + 1, end);
      i = end + 1;
    } else if (c === '$' && command[i + 1] === "'") {
      inToken = true;
      i += 2;
      while (i < command.length && command[i] !== "'") {
        if (command[i] === '\\') {
          const n = command[i + 1]!;
          if (n === 'n') current += '\n';
          else if (n === 't') current += '\t';
          else if (n === 'r') current += '\r';
          else if (n === 'u') {
            current += String.fromCharCode(
              parseInt(command.slice(i + 2, i + 6), 16),
            );
            i += 4;
          } else if (n === 'x') {
            current += String.fromCharCode(
              parseInt(command.slice(i + 2, i + 4), 16),
            );
            i += 2;
          } else current += n;
          i += 2;
        } else {
          current += command[i++];
        }
      }
      i++;
    } else if (c === '"') {
      inToken = true;
      i++;
      while (i < command.length && command[i] !== '"') {
        if (command[i] === '\\' && '"\\$`'.includes(command[i + 1] ?? '')) {
          current += command[i + 1];
          i += 2;
        } else {
          current += command[i++];
        }
      }
      i++;
    } else {
      inToken = true;
      current += c;
      i++;
    }
  }
  push();
  return tokens;
}

type Parsed = {
  url: string;
  headers: Record<string, string>;
  body: string;
  /** Il valore dei cookie del cURL. Si legge sempre, si manda solo con `--with-cookies`. */
  cookie: string;
};

function parseCurl(command: string): Parsed {
  const tokens = tokenize(command.trim());
  if (tokens[0] !== 'curl') throw new Error('non è un comando curl');

  let url = '';
  let body = '';
  let cookie = '';
  const headers: Record<string, string> = {};

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === '-H' || t === '--header') {
      const raw = tokens[++i] ?? '';
      const at = raw.indexOf(':');
      const name = raw.slice(0, at).trim().toLowerCase();
      const value = raw.slice(at + 1).trim();
      if (name === 'cookie') cookie = value;
      else if (name) headers[name] = value;
    } else if (t === '-b' || t === '--cookie') {
      cookie = tokens[++i] ?? '';
    } else if (
      t === '--data-raw' ||
      t === '--data' ||
      t === '--data-binary' ||
      t === '-d'
    ) {
      body = tokens[++i] ?? '';
    } else if (!t.startsWith('-') && !url) {
      url = t;
    }
  }

  if (!url) throw new Error('nel cURL non trovo l’indirizzo');
  return { url, headers, body, cookie };
}

/** La scadenza dal payload di un JWT, mai il token. */
const scadenza = (jwt: unknown): string => {
  if (typeof jwt !== 'string') return '(assente)';
  try {
    const exp = JSON.parse(
      Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString(),
    ).exp;
    if (typeof exp !== 'number') return '(exp assente)';
    const minuti = Math.round((exp * 1000 - Date.now()) / 60_000);
    return minuti > 2880
      ? `${Math.round(minuti / 1440)} giorni`
      : `${minuti} minuti`;
  } catch {
    return '(non è un JWT)';
  }
};

const conteggio = <T>(rows: T[], chiave: (row: T) => string) => {
  const mappa = new Map<string, number>();
  for (const row of rows) {
    mappa.set(chiave(row), (mappa.get(chiave(row)) ?? 0) + 1);
  }
  return [...mappa].sort((a, b) => b[1] - a[1]);
};

// --- 1. il cURL incollato ---

if (appToken) {
  console.log(
    '\nApri questo indirizzo nel browser e accedi. Alla pagina «Link an account»\n' +
      'NON cliccare «Select this account»: clic destro → «Copia indirizzo del link».\n',
  );
  console.log(`  ${loginUrl}\n`);
  console.log(
    "Poi incolla qui, **prima riga**, quell'indirizzo; **sulle righe dopo** il cURL\n" +
      'della POST GraphQL (Copia come cURL, bash). Infine Invio e Ctrl+D:\n',
  );
} else {
  console.log(
    '\nIncolla il cURL della POST GraphQL (Copia come cURL, bash), poi Invio e Ctrl+D:\n',
  );
}
const lines: string[] = [];
for await (const line of createInterface({ input: process.stdin })) {
  lines.push(line);
}

// Con `--app-token` la prima riga non vuota è l'indirizzo del login, il resto il cURL.
let pastedCode: { code: string; state: string } | null = null;
if (appToken) {
  const first = lines.findIndex((line) => line.trim() !== '');
  const link = first >= 0 ? lines.splice(0, first + 1).pop()! : '';
  const code = /session_token_code=([^&\s]+)/.exec(link)?.[1];
  const state = /[#&?]state=([^&\s]+)/.exec(link)?.[1];
  if (!code || !state) {
    console.error(
      "La prima riga non è l'indirizzo del link (manca session_token_code o state). Nessuna richiesta fatta.",
    );
    process.exit(1);
  }
  if (state !== loginState) {
    console.error(
      "Lo state non combacia: l'indirizzo viene da un altro giro del probe (ogni esecuzione ne ha uno suo). Apri l'URL stampato in QUESTA esecuzione. Nessuna richiesta fatta.",
    );
    process.exit(1);
  }
  pastedCode = { code, state };
}

let parsed: Parsed;
try {
  parsed = parseCurl(lines.join('\n'));
} catch (error) {
  console.error(
    `cURL non leggibile: ${(error as Error).message}. Nessuna richiesta fatta.`,
  );
  process.exit(1);
}

const target = new URL(parsed.url);
// Il punto davanti conta: `evilnintendo.net` non finisce con `.nintendo.net`.
// Il GraphQL delle Virtual Game Cards sta su `*.srv.nintendo.net`
// (`wb.lp1.savanna.srv.nintendo.net`), non su nintendo.com: il primo giro si è
// fermato qui, senza richieste, per un controllo troppo stretto.
const NINTENDO_DOMAINS = ['.nintendo.com', '.nintendo.net'];
if (
  target.protocol !== 'https:' ||
  !NINTENDO_DOMAINS.some((domain) => target.hostname.endsWith(domain))
) {
  console.error(
    `L'indirizzo (${target.hostname}) non è un dominio Nintendo (nintendo.com o nintendo.net): non mando un token altrove. Nessuna richiesta fatta.`,
  );
  process.exit(1);
}

let payload: {
  query?: string;
  variables?: Record<string, unknown>;
  operationName?: string;
};
try {
  payload = JSON.parse(parsed.body);
} catch {
  console.error(
    'Il corpo del cURL non è JSON: forse non è la POST giusta. Nessuna richiesta fatta.',
  );
  process.exit(1);
}
if (!payload.query?.includes('vgc')) {
  console.error(
    'Il corpo non sembra la query delle Virtual Game Cards (manca «vgc»). Nessuna richiesta fatta.',
  );
  process.exit(1);
}

if (hiddenMode) {
  // Il filtro sta nel testo della query, non fra le variabili: una sostituzione
  // sola, e se non c'è si ferma invece di mandare una richiesta diversa da quella
  // che si pensava.
  if (!payload.query.includes('isHidden: false')) {
    console.error(
      'Nella query non trovo «isHidden: false»: non so cosa cambiare. Nessuna richiesta fatta.',
    );
    process.exit(1);
  }
  payload.query = payload.query.replace('isHidden: false', 'isHidden: true');
}

const variables = payload.variables ?? {};
console.log('\nrichiesta');
if (hiddenMode) {
  console.log('  modo:                     --hidden (isHidden: true)');
}
if (schemaMode) {
  console.log(
    '  modo:                     --schema (introspezione, senza idToken)',
  );
}
console.log(`  host:                     ${target.hostname}${target.pathname}`);
console.log(
  `  idToken del cURL scade fra: ${scadenza(variables.idToken)}${appToken ? ' (viene sostituito)' : ''}`,
);

// --- 1b. con `--app-token`: i token del nostro login, prima del GraphQL ---
//
// Tutti i controlli locali sono già passati: da qui si parla con Nintendo.

if (appToken && pastedCode) {
  console.log("\nlogin dell'app");
  const session = await accountsPost(
    'session_token',
    '/connect/1.0.0/api/session_token',
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        session_token_code: pastedCode.code,
        session_token_code_verifier: loginVerifier,
      }),
    },
  );
  const sessionToken = session.session_token;
  if (typeof sessionToken !== 'string') {
    console.error('La risposta non ha session_token. Mi fermo.');
    process.exit(1);
  }
  const tokens = await accountsPost('token', '/connect/1.0.0/api/token', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      session_token: sessionToken,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token',
    }),
  });
  if (typeof tokens.id_token !== 'string') {
    console.error('La risposta non ha id_token. Mi fermo.');
    process.exit(1);
  }
  console.log(
    `  id_token dell'app scade fra: ${scadenza(tokens.id_token)}  (è quello che mandiamo al GraphQL)`,
  );
  variables.idToken = tokens.id_token;
}
console.log(
  `  cookie nel cURL:          ${parsed.cookie ? 'presenti' : 'assenti'}, ${withCookies ? 'MANDATI (--with-cookies)' : 'non mandati'}`,
);
console.log(
  `  limit / offset:           ${limit} / 0 (nel cURL: ${String(variables.limit)} / ${String(variables.offset)})`,
);

// --- 2. una richiesta, nessun ritentativo ---

requests += 1;
console.log(`  → richiesta ${requests}: GraphQL`);
/** Solo nomi: tipi e campi, senza descrizioni. */
const INTROSPECTION =
  '{ __schema { types { name kind fields { name type { name kind ofType { name kind ofType { name kind } } } } } } }';

const response = await fetch(parsed.url, {
  method: 'POST',
  headers: {
    ...parsed.headers,
    ...(withCookies && parsed.cookie ? { cookie: parsed.cookie } : {}),
    'content-type': 'application/json',
  },
  body: JSON.stringify(
    schemaMode
      ? { query: INTROSPECTION }
      : { ...payload, variables: { ...variables, limit, offset: 0 } },
  ),
  signal: AbortSignal.timeout(20_000),
});

console.log(`\n  → HTTP ${response.status}`);
if (!response.ok) {
  console.error(
    `Nintendo ha risposto ${response.status}: mi fermo, senza ritentare.` +
      (appToken && (response.status === 401 || response.status === 403)
        ? "\nIl GraphQL **non accetta l'id_token dell'app**: serve quello del portale, che si ricava dalla pagina con la sessione web."
        : !withCookies && (response.status === 401 || response.status === 403)
          ? '\nSenza cookie non basta il solo token. Con --with-cookies si può rifare una volta, ma i cookie sono l’intera sessione web: decidi tu.'
          : ''),
  );
  process.exit(1);
}

if (schemaMode) {
  const introspection = (await response.json()) as {
    errors?: Array<{ message?: string }>;
    data?: {
      __schema?: {
        types?: Array<{
          name: string;
          kind: string;
          fields?: Array<{
            name: string;
            type?: {
              name?: string | null;
              kind?: string;
              ofType?: {
                name?: string | null;
                ofType?: { name?: string | null } | null;
              } | null;
            };
          }> | null;
        }>;
      };
    };
  };

  if (introspection.errors?.length || !introspection.data?.__schema?.types) {
    console.error(
      `Introspezione non disponibile: ${introspection.errors?.map((e) => e.message).join('; ') ?? 'risposta senza schema'}. Il server può averla spenta: è una risposta, non un guasto.`,
    );
    process.exit(1);
  }

  const typeName = (
    t:
      | {
          name?: string | null;
          ofType?: {
            name?: string | null;
            ofType?: { name?: string | null } | null;
          } | null;
        }
      | undefined,
  ) => t?.name ?? t?.ofType?.name ?? t?.ofType?.ofType?.name ?? '?';

  const types = introspection.data.__schema.types;
  console.log(`\nschema: ${types.length} tipi`);

  console.log('\n  tipi «Vgc…» e i loro campi:');
  for (const type of types.filter((t) => /vgc/i.test(t.name) && t.fields)) {
    console.log(`    ${type.name}`);
    for (const field of type.fields ?? []) {
      console.log(`      ${field.name}: ${typeName(field.type)}`);
    }
  }

  const DATE_LIKE =
    /date|time|activat|acqui|purchas|redeem|registered|inserted/i;
  console.log('\n  campi che sembrano una data, ovunque nello schema:');
  const found: string[] = [];
  for (const type of types) {
    if (type.name.startsWith('__')) continue;
    for (const field of type.fields ?? []) {
      if (DATE_LIKE.test(field.name) || DATE_LIKE.test(typeName(field.type))) {
        found.push(`${type.name}.${field.name}: ${typeName(field.type)}`);
      }
    }
  }
  for (const line of found.slice(0, 60)) console.log(`    ${line}`);
  if (found.length > 60) console.log(`    … e altri ${found.length - 60}`);

  console.log(`\nrichieste a Nintendo in tutto: ${requests}`);
  process.exit(0);
}

const result = (await response.json()) as {
  errors?: Array<{ message?: string }>;
  data?: {
    account?: {
      vgc?: {
        vgcViews?: {
          offsetInfo?: { total?: number };
          views?: Array<{
            applicationId?: string;
            applicationName?: string;
            apparentPlatform?: string;
            hasReleasedApplication?: boolean;
            hasReleasedAddOnContents?: boolean;
            hasReleasedNxApplication?: boolean;
            hasReleasedOunceApplication?: boolean;
            isHidden?: boolean;
            isLending?: boolean;
            insertedNsDeviceId?: string | null;
          }>;
        };
      };
    };
  };
};

if (result.errors?.length) {
  console.error(
    `GraphQL ha risposto con errori${appToken ? " (con l'id_token dell'app)" : ''}: ${result.errors.map((e) => e.message).join('; ')}`,
  );
  process.exit(1);
}

const views = result.data?.account?.vgc?.vgcViews?.views ?? [];
const total = result.data?.account?.vgc?.vgcViews?.offsetInfo?.total;

console.log('\nlibreria (Virtual Game Cards)');
console.log(`  totale dichiarato:        ${total ?? '(assente)'}`);
console.log(`  righe in questa pagina:   ${views.length}`);
if (total !== undefined && total > views.length) {
  console.log(
    `  ATTENZIONE: ne mancano ${total - views.length}, serve un'altra pagina.`,
  );
}

console.log('\n  per apparentPlatform:');
for (const [valore, n] of conteggio(
  views,
  (v) => v.apparentPlatform ?? '(assente)',
)) {
  console.log(`    ${valore.padEnd(14)} ${n}`);
}
console.log(
  `  con applicazione:         ${views.filter((v) => v.hasReleasedApplication).length}`,
);
console.log(
  `  solo contenuti aggiuntivi: ${views.filter((v) => !v.hasReleasedApplication && v.hasReleasedAddOnContents).length}`,
);
console.log(
  `  hasNx / hasOunce:         ${views.filter((v) => v.hasReleasedNxApplication).length} / ${views.filter((v) => v.hasReleasedOunceApplication).length}`,
);
console.log(
  `  nascosti / in prestito:   ${views.filter((v) => v.isHidden).length} / ${views.filter((v) => v.isLending).length}`,
);
console.log(
  `  inseriti in una console:  ${views.filter((v) => v.insertedNsDeviceId).length}`,
);
console.log(
  `  id applicazione:          ${views.filter((v) => v.applicationId).length} su ${views.length}`,
);

const shown = listNames ? views : views.slice(0, 15);
console.log(`\n  ${listNames ? 'tutti' : 'i primi 15'}:`);
for (const v of shown) {
  console.log(
    `    ${(v.applicationName ?? '?').slice(0, 52).padEnd(52)} ${(v.apparentPlatform ?? '').padEnd(6)} ${v.applicationId ?? ''}`,
  );
}

if (find) {
  const matches = views.filter((v) =>
    (v.applicationName ?? '').toLowerCase().includes(find),
  );
  console.log(`\n  nomi che contengono «${find}»: ${matches.length}`);
  for (const v of matches) {
    console.log(
      `    ${(v.applicationName ?? '?').slice(0, 52).padEnd(52)} ${(v.apparentPlatform ?? '').padEnd(6)} ${v.applicationId ?? ''}  nascosto: ${String(v.isHidden)}`,
    );
  }
}

console.log(
  `\n${appToken ? "con l'id_token dell'app: il GraphQL ha risposto.\n" : ''}richieste a Nintendo in tutto: ${requests}`,
);
process.exit(0);
