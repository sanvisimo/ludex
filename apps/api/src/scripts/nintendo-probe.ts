import '../env';

import { createHash, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

import { type LibraryEntry, resolveByName } from '../services/library-import';

// Misure per il 9d (Nintendo). **Non scrive niente**: né sul DB né su disco.
//
// **ATTENZIONE: parla con Nintendo usando l'account di chi lo lancia**, con
// l'identità di un'app ufficiale (client_id e User-Agent di `com.nintendo.znej`,
// presi dal client open source nintendo-go: non sono nostri).
// Un client non ufficiale può violare il contratto Nintendo, e non sappiamo
// come reagisca a un account che entra da un indirizzo nuovo. Il 05/10/2026
// Steam ha bloccato temporaneamente l'account dell'utente dopo prove simili:
// vedi «Il blocco dell'account» in docs/negozi.md. **Non lanciarlo senza
// averlo concordato, e non ripeterlo «per sicurezza»**: un giro basta.
//
//   pnpm --filter api nintendo:probe [--locale=en-GB] [--no-resolve]
//
// Cosa manda a Nintendo, e basta:
//
//  1. POST /connect/1.0.0/api/session_token  — scambia il codice incollato
//  2. POST /connect/1.0.0/api/token          — l'access token dal session token
//  3. GET  app-api.znej.nintendo.com/api/v2.0/users/me/play_histories
//  4. (solo se la 3 risponde 401) la stessa GET con l'id_token, che è ciò che fa
//     anche il client di riferimento. Non ci sono altri tentativi.
//
// Il login lo fa l'utente **nel suo browser**: il probe stampa l'indirizzo da
// aprire e aspetta che si incolli l'URL `npf…://auth#session_token_code=…`.
// **Il pulsante «Select this account» non fa niente se lo si clicca**: porta a
// un indirizzo `npf…://` che il browser non sa aprire. Va fatto clic destro →
// «Copia indirizzo del link». Il codice di verifica PKCE vive solo in questo
// processo.
//
// Al primo errore si ferma, senza ritentare: né sulla rete né con un token
// diverso. **Nessun token si stampa mai**, nemmeno in parte: del session token
// e dell'id_token si legge solo la scadenza dal payload del JWT.
//
// Risponde alle domande che il piano (plans/9d-nintendo.md) non può chiudere a
// tavolino:
//
//  a. il client_id e i path del README terzo reggono?
//  b. quali valori hanno `platform` e `deviceType`, e quindi come si distingue
//     Switch da Switch 2?
//  c. la libreria ha un titleId di forma nota, e le cartucce ci sono?
//  d. quanti nomi si risolvono su IGDB (`resolveByName`, cioè il matcher vero;
//     parla con IGDB, non con Nintendo)?

const CLIENT_ID = '5c38e31cd085304b';
const REDIRECT_URI = `npf${CLIENT_ID}://auth`;
const ACCOUNTS_URL = 'https://accounts.nintendo.com';
const APP_URL = 'https://app-api.znej.nintendo.com';
const USER_AGENT = 'com.nintendo.znej/3.0.3 (iOS/26.0.1)';
const SCOPE = 'openid user user.mii user.email user.links[].id';

const locale =
  process.argv.find((a) => a.startsWith('--locale='))?.slice(9) ?? 'en-GB';
const resolve = !process.argv.includes('--no-resolve');

const base64url = (buffer: Buffer) => buffer.toString('base64url');

const state = base64url(randomBytes(36));
const verifier = base64url(randomBytes(32));
const challenge = base64url(createHash('sha256').update(verifier).digest());

const loginUrl = `${ACCOUNTS_URL}/connect/1.0.0/authorize?${new URLSearchParams(
  {
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'session_token_code',
    scope: SCOPE,
    session_token_code_challenge: challenge,
    session_token_code_challenge_method: 'S256',
    state,
    theme: 'login_form',
  },
)}`;

let richieste = 0;

// Una richiesta, nessun ritentativo: se Nintendo risponde male si legge e ci si
// ferma, non si insiste.
const chiama = async (
  etichetta: string,
  url: string,
  init: RequestInit,
  { fermatiSe401 = true } = {},
) => {
  richieste += 1;
  console.log(`  → richiesta ${richieste}: ${etichetta}`);
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok && !(response.status === 401 && !fermatiSe401)) {
    const corpo = (await response.text()).slice(0, 300);
    console.error(
      `\n${etichetta}: HTTP ${response.status}. Mi fermo qui, senza ritentare.\n${corpo}`,
    );
    process.exit(1);
  }
  return response;
};

// La scadenza dal payload di un JWT; mai il token.
const scadenzaGiorni = (jwt: string): string => {
  try {
    const exp = JSON.parse(
      Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString(),
    ).exp;
    return typeof exp === 'number'
      ? `${Math.round((exp * 1000 - Date.now()) / 86_400_000)} giorni`
      : '(exp assente)';
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

// --- 1. il login, nel browser dell'utente ---

console.log(
  '\nApri questo indirizzo nel browser e accedi. Alla pagina «Link an account»\n' +
    'NON cliccare «Select this account» (non succede niente): clic destro sul\n' +
    'pulsante → «Copia indirizzo del link», e incollalo qui sotto:\n',
);
console.log(`  ${loginUrl}\n`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const incollato = await rl.question("Incolla qui l'indirizzo copiato: ");
rl.close();

const code = /session_token_code=([^&\s]+)/.exec(incollato)?.[1];
const stateRicevuto = /state=([^&\s]+)/.exec(incollato)?.[1];
if (!code) {
  console.error('non ho trovato session_token_code: nessuna richiesta fatta.');
  process.exit(1);
}
if (stateRicevuto !== state) {
  console.error(
    "lo state non combacia: l'indirizzo viene da un altro giro del probe " +
      "(ogni esecuzione ne ha uno suo). Apri l'URL stampato in QUESTA " +
      'esecuzione e incolla una volta sola. Nessuna richiesta fatta.',
  );
  process.exit(1);
}

// --- 2. i token ---

console.log('\nrichieste a Nintendo');
const sessione = (await (
  await chiama(
    'session_token',
    `${ACCOUNTS_URL}/connect/1.0.0/api/session_token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        session_token_code: code,
        session_token_code_verifier: verifier,
      }),
    },
  )
).json()) as { session_token?: string };

if (!sessione.session_token) {
  console.error('la risposta non ha session_token. Mi fermo.');
  process.exit(1);
}

const token = (await (
  await chiama('token', `${ACCOUNTS_URL}/connect/1.0.0/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      session_token: sessione.session_token,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token',
    }),
  })
).json()) as { access_token?: string; id_token?: string; expires_in?: number };

if (!token.access_token) {
  console.error('la risposta non ha access_token. Mi fermo.');
  process.exit(1);
}

console.log('\ncredenziali');
console.log(
  `  session token scade fra:  ${scadenzaGiorni(sessione.session_token)}`,
);
console.log(
  `  access token vale:        ${token.expires_in ?? '(non dichiarato)'} s`,
);
console.log(
  `  id_token scade fra:       ${token.id_token ? scadenzaGiorni(token.id_token) : '(assente)'}`,
);

// --- 3. lo storico di gioco ---

type Titolo = {
  titleId?: string;
  titleName?: string;
  platform?: string;
  deviceType?: string;
  firstPlayedAt?: string;
  lastPlayedAt?: string;
  totalPlayedDays?: number;
  totalPlayedMinutes?: number;
};
type Storico = {
  playHistories?: Titolo[];
  hiddenTitleList?: unknown[];
  lastUpdatedAt?: string;
};

const leggiStorico = (bearer: string, nota: string, fermati: boolean) =>
  chiama(
    nota,
    `${APP_URL}/api/v2.0/users/me/play_histories`,
    {
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Gentry-Locale': locale,
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    },
    { fermatiSe401: fermati },
  );

let risposta = await leggiStorico(
  token.access_token,
  'play_histories (access token)',
  !token.id_token,
);
let bearerUsato = 'access token';
if (risposta.status === 401 && token.id_token) {
  console.log("  401 con l'access token: provo una volta con l'id_token.");
  risposta = await leggiStorico(
    token.id_token,
    'play_histories (id_token)',
    true,
  );
  bearerUsato = 'id_token';
}

const storico = (await risposta.json()) as Storico;
const titoli = storico.playHistories ?? [];

console.log(`\nstorico (bearer: ${bearerUsato}, locale: ${locale})`);
console.log(`  titoli:                   ${titoli.length}`);
console.log(
  `  nascosti (hidden):        ${storico.hiddenTitleList?.length ?? 0}`,
);
console.log(
  `  aggiornato il:            ${storico.lastUpdatedAt ?? '(assente)'}`,
);

console.log('\n  per deviceType:');
for (const [valore, n] of conteggio(
  titoli,
  (t) => t.deviceType ?? '(assente)',
)) {
  console.log(`    ${valore.padEnd(14)} ${n}`);
}
console.log('  per platform:');
for (const [valore, n] of conteggio(titoli, (t) => t.platform ?? '(assente)')) {
  console.log(`    ${valore.padEnd(14)} ${n}`);
}

const forme = conteggio(titoli, (t) =>
  (t.titleId ?? '').replace(/[0-9a-f]/gi, 'x'),
);
console.log('  forma del titleId:');
for (const [forma, n] of forme.slice(0, 5)) {
  console.log(`    ${(forma || '(assente)').padEnd(20)} ${n}`);
}

const conMinuti = titoli.filter((t) => (t.totalPlayedMinutes ?? 0) > 0);
console.log(
  `  con minuti > 0:           ${conMinuti.length} su ${titoli.length}`,
);
console.log(
  `  con primo avvio:          ${titoli.filter((t) => t.firstPlayedAt).length} su ${titoli.length}`,
);
const nomiPerTitolo = conteggio(titoli, (t) =>
  (t.titleName ?? '').toLowerCase(),
);
console.log(
  `  nomi ripetuti:            ${nomiPerTitolo.filter(([, n]) => n > 1).length}`,
);

console.log('\n  i primi 15:');
for (const t of titoli.slice(0, 15)) {
  console.log(
    `    ${(t.titleName ?? '?').slice(0, 42).padEnd(42)} ${(t.deviceType ?? '').padEnd(10)} ${String(t.totalPlayedMinutes ?? 0).padStart(6)} min  ${t.firstPlayedAt?.slice(0, 10) ?? '—'} → ${t.lastPlayedAt?.slice(0, 10) ?? '—'}`,
  );
}

// --- 4. l'identità su IGDB, per nome ---
//
// Non parla con Nintendo. Il titleId Nintendo non è in nessuna sorgente IGDB
// che conosciamo, quindi si va per nome come su Epic, Amazon e PSN.

if (resolve && titoli.length > 0) {
  const voci: LibraryEntry[] = titoli
    .filter((t) => t.titleId && t.titleName)
    .map((t) => ({
      externalId: t.titleId as string,
      name: t.titleName as string,
      platformSlug: t.deviceType ?? t.platform ?? null,
    }));

  console.log(`\n  cerco su IGDB ${voci.length} nomi, a 4 al secondo…`);
  const links = await resolveByName(voci);
  const agganciati = new Set(links.map((link) => link.externalId));
  console.log('\nrisoluzione (per nome)');
  console.log(
    `  agganciati:               ${links.length} su ${voci.length}  (${Math.round((100 * links.length) / voci.length)}%)`,
  );
  const irrisolti = voci.filter((v) => !agganciati.has(v.externalId));
  console.log(`  irrisolti:                ${irrisolti.length}`);
  for (const v of irrisolti.slice(0, 20)) {
    console.log(`    ${v.name}`);
  }
}

console.log(`\nrichieste a Nintendo in tutto: ${richieste}`);
process.exit(0);
