import '../env';

import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';

import { decryptCredentials, encryptCredentials } from '../lib/crypto';

// Si può avere da EA un token che si rinnova da sé? (vedi
// `plans/9c-ea-rinnovo.md`). Giro a vuoto: **non scrive nel database** e non
// stampa nessun token.
//
//   pnpm --filter api ea:login-probe            il primo giro
//   pnpm --filter api ea:login-probe --rinnova  il rinnovo, giorni dopo
//
// Il 9c importa con il token di `connect/auth` (`response_type=token`,
// `redirect_uri=nucleus:rest`), che arriva come pagina JSON e dura quattro ore.
// Il primo giro (13/10/2026) ha provato la stessa pagina con
// `response_type=code`, e non c'è: `ORIGIN_JS_SDK` risponde «response_type is
// invalid», `JUNO_PC_CLIENT` «redirect_uri is invalid».
//
// Questo giro prova quindi il login dell'**app desktop EA** com'è:
// `JUNO_PC_CLIENT`, col suo segreto (scritto nel plugin EA di GOG Galaxy, come
// quelli di GOG ed Epic nei loro launcher), PKCE, e il suo indirizzo di ritorno,
// `qrc:///html/login_successful.html`, che il browser non apre. **Senza
// `pc_sign`**, la firma dell'hardware che l'app manda: se EA la pretende,
// l'errore lo dice. La domanda è anche dove si veda il codice: nella barra di
// Firefox, o solo negli strumenti per sviluppatori.
//
// **Parla con l'account EA di chi lo lancia**: uno scambio di codice, un
// rinnovo e un'identità. Il refresh token, se arriva, si salva
// **cifrato** con `STORE_TOKEN_KEY` fuori dal repo, per rinnovarlo giorni dopo
// con `--rinnova` e sapere se dura e se EA accetta un rinnovo da qui.

const AUTH_URL = 'https://accounts.ea.com/connect/auth';
const TOKEN_URL = 'https://accounts.ea.com/connect/token';
const GRAPHQL_URL = 'https://service-aggregation-layer.juno.ea.com/graphql';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const JUNO_CLIENT_ID = 'JUNO_PC_CLIENT';
const JUNO_CLIENT_SECRET =
  '4mRLtYMb6vq9qglomWEaT4ChxsXWcyqbQpuBNfMPOYOiDmYYQmjuaBsF2Zp0RyVeWkfqhE9TuGgAw7te';

// Il refresh token fra un giro e l'altro: cifrato, e fuori dal repo.
const SAVED = join(homedir(), '.cache', 'ludex', 'ea-login-probe.bin');

type Client = {
  id: string;
  secret: string | null;
  pkce: boolean;
  redirectUri: string;
  /** Gli altri parametri del login, come li manda il client vero. */
  extra: Record<string, string>;
};

const CLIENTS: Client[] = [
  {
    id: JUNO_CLIENT_ID,
    secret: JUNO_CLIENT_SECRET,
    pkce: true,
    redirectUri: 'qrc:///html/login_successful.html',
    extra: { display: 'junoClient/login', locale: 'en_US' },
  },
];

type Saved = { clientId: string; refreshToken: string; savedAt: string };

const rl = createInterface({ input: process.stdin, output: process.stdout });

/** Le chiavi della risposta, e dei valori solo ciò che non è un segreto. */
function describe(body: Record<string, unknown> | null) {
  if (!body) return '(nessun JSON)';
  const segreti = /token|code|secret/i;
  return Object.entries(body)
    .map(([chiave, valore]) =>
      segreti.test(chiave) && chiave !== 'token_type'
        ? `${chiave}: (${typeof valore === 'string' ? `${valore.length} caratteri` : typeof valore})`
        : `${chiave}: ${JSON.stringify(valore)}`,
    )
    .join('\n    ');
}

async function tokenRequest(params: Record<string, string>, client: Client) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': USER_AGENT,
  };
  const body = new URLSearchParams({ ...params, client_id: client.id });
  if (client.secret) body.set('client_secret', client.secret);

  const response = await fetch(TOKEN_URL, { method: 'POST', headers, body });
  const json = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return { status: response.status, json };
}

async function identity(accessToken: string) {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ query: 'query { me { player { pd } } }' }),
  });
  const json = (await response.json().catch(() => null)) as {
    data?: { me?: { player?: { pd?: string } } };
  } | null;
  return (
    json?.data?.me?.player?.pd ?? `(nessuna identità, HTTP ${response.status})`
  );
}

const inGiorni = (secondi: unknown) =>
  typeof secondi === 'number' || typeof secondi === 'string'
    ? `${secondi} s (${(Number(secondi) / 86_400).toFixed(1)} giorni)`
    : '(non dichiarato)';

/** Rinnova, verifica l'identità col token nuovo, e salva il refresh token. */
async function refreshAndSave(client: Client, refreshToken: string) {
  const rinnovo = await tokenRequest(
    { grant_type: 'refresh_token', refresh_token: refreshToken },
    client,
  );
  console.log(`\n  rinnovo: HTTP ${rinnovo.status}`);
  console.log(`    ${describe(rinnovo.json)}`);

  const accessToken = rinnovo.json?.access_token;
  if (typeof accessToken !== 'string') return false;

  const nuovo = rinnovo.json?.refresh_token;
  console.log(
    `  il refresh token ${typeof nuovo !== 'string' ? 'non torna' : nuovo === refreshToken ? 'è lo stesso (non ruota)' : 'è nuovo (ruota)'}`,
  );
  console.log(
    `  identità col token rinnovato: pd ${await identity(accessToken)}`,
  );

  const daSalvare: Saved = {
    clientId: client.id,
    refreshToken: typeof nuovo === 'string' ? nuovo : refreshToken,
    savedAt: new Date().toISOString(),
  };
  await mkdir(dirname(SAVED), { recursive: true });
  await writeFile(SAVED, encryptCredentials(daSalvare));
  console.log(`  salvato, cifrato, in ${SAVED}`);
  return true;
}

// --- `--rinnova`: giorni dopo, sullo stesso refresh token ---

if (process.argv.includes('--rinnova')) {
  const saved = decryptCredentials<Saved>(await readFile(SAVED));
  const client = CLIENTS.find((c) => c.id === saved.clientId);
  if (!client) throw new Error(`client sconosciuto: ${saved.clientId}`);

  const giorni = (Date.now() - Date.parse(saved.savedAt)) / 86_400_000;
  console.log(
    `\n${client.id}: refresh token salvato il ${saved.savedAt} (${giorni.toFixed(1)} giorni fa)`,
  );
  const ok = await refreshAndSave(client, saved.refreshToken);
  console.log(ok ? '\n← il rinnovo da qui regge.\n' : '\n← rifiutato.\n');
  rl.close();
  process.exit(0);
}

// --- il primo giro: un client alla volta ---

for (const client of CLIENTS) {
  const verifier = randomBytes(48).toString('base64url');
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', client.id);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', client.redirectUri);
  for (const [chiave, valore] of Object.entries(client.extra)) {
    url.searchParams.set(chiave, valore);
  }
  if (client.pkce) {
    url.searchParams.set(
      'code_challenge',
      createHash('sha256').update(verifier).digest('base64url'),
    );
    url.searchParams.set('code_challenge_method', 'S256');
  }

  console.log(`\n=== ${client.id}`);
  console.log(
    '  1. in Firefox, entrato su ea.com, apri (se chiede il login, fallo):',
  );
  console.log(`     ${url}`);
  console.log(
    '  2. EA rimanda a qrc:///html/login_successful.html?code=…, che il browser non apre.',
  );
  console.log(
    '     Se la barra mostra quell’indirizzo, copialo; se no prendilo da F12 → Rete,',
  );
  console.log(
    '     dalla risposta di connect/auth (intestazione Location). Annota dove l’hai trovato.',
  );
  console.log('  3. incollalo qui (invio vuoto per saltare)');

  const incollato = (await rl.question('\n  > ')).trim();
  if (!incollato) continue;

  // Quello che EA mostra: un JSON, si spera con `code`. Le chiavi si stampano
  // comunque, perché anche un errore dice qualcosa.
  let pagina: Record<string, unknown> | null = null;
  try {
    pagina = JSON.parse(incollato) as Record<string, unknown>;
  } catch {
    pagina = null;
  }
  console.log(`\n  la pagina:\n    ${describe(pagina)}`);
  const code =
    typeof pagina?.code === 'string'
      ? pagina.code
      : (incollato.match(/[?&#]code=([^&\s#"]+)/)?.[1] ?? null);
  if (!code) {
    console.log('  ← nessun codice: questo client non lo dà così.');
    continue;
  }

  const scambio = await tokenRequest(
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: client.redirectUri,
      ...(client.pkce ? { code_verifier: verifier } : {}),
    },
    client,
  );
  console.log(`\n  scambio del codice: HTTP ${scambio.status}`);
  console.log(`    ${describe(scambio.json)}`);
  console.log(
    `  l'access token dura:      ${inGiorni(scambio.json?.expires_in)}`,
  );
  console.log(
    `  il refresh token dura:    ${inGiorni(scambio.json?.refresh_token_expires_in)}`,
  );

  const refreshToken = scambio.json?.refresh_token;
  if (typeof refreshToken !== 'string') {
    console.log('  ← nessun refresh token da questo client.');
    continue;
  }

  if (typeof scambio.json?.access_token === 'string') {
    console.log(
      `  identità:                 pd ${await identity(scambio.json.access_token)}`,
    );
  }

  if (await refreshAndSave(client, refreshToken)) {
    console.log(
      `\n← ${client.id} dà un refresh token che si rinnova. Fra qualche giorno:\n` +
        '   pnpm --filter api ea:login-probe --rinnova\n',
    );
    break;
  }
}

rl.close();
process.exit(0);
