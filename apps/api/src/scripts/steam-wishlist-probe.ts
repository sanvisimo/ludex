import '../env';

import { db, schema } from '@repo/db';
import { and, eq } from '@repo/db/orm';

import { decryptCredentials } from '../lib/crypto';

// Misura la wishlist di Steam (15e, passo 1): **una** richiesta a
// `IWishlistService/GetWishlist`. Non scrive niente e non stampa né la chiave
// né il token.
//
//   pnpm --filter api steam:wishlist-probe [steamid64] [--account]
//
// Senza `--account` usa la chiave dell'applicazione (`STEAM_API_KEY`). Lo
// SteamID64 viene dall'argomento o da `STEAM_TEST_USER_ID`: **sul .env di
// sviluppo può essere l'account principale**, quindi controlla di quale si
// tratta, e la misura va fatta su quello di prova (`sanvitest`). La chiave non
// apre nessuna sessione, ma Steam ha già bloccato l'account dell'utente tre
// volte: una richiesta basta, non ripeterla.
//
// Con `--account` manda invece l'**access token già salvato** in
// `store_accounts` di quell'account (il login di 9f), al posto della chiave: la
// domanda è se la wishlist si legge anche coi dettagli dei giochi privati. È
// **una richiesta con un token che l'import manda comunque a ogni
// sincronizzazione**, non un login. Il token **non si rinnova mai** qui, e il DB
// non si scrive: se è scaduto lo script si ferma prima di fare qualunque
// richiesta. Va lanciato dove l'account è collegato (il mini PC), con il suo
// `.env` e la sua `STORE_TOKEN_KEY`. Per dire qualcosa di vero, i dettagli dei
// giochi dell'account devono essere **privati** (non «solo amici», che per un
// token non è diverso da pubblico: provare con la chiave prima, rende vuoto).
//
// Domande a cui risponde: com'è fatta la risposta (appid, priorità, data di
// aggiunta?), se vuole il profilo pubblico, se il token la apre comunque, e
// quanti elementi porta.

const useAccount = process.argv.includes('--account');
const steamId =
  process.argv.slice(2).find((arg) => !arg.startsWith('--')) ??
  process.env.STEAM_TEST_USER_ID;
if (!steamId || !/^\d{17}$/.test(steamId)) {
  console.error(
    'serve uno SteamID64 (17 cifre), quello dell’account di prova:\n' +
      '  pnpm --filter api steam:wishlist-probe 7656119XXXXXXXXXX',
  );
  process.exit(1);
}

const url = new URL(
  'https://api.steampowered.com/IWishlistService/GetWishlist/v1',
);
url.searchParams.set('steamid', steamId);

if (useAccount) {
  const [account] = await db
    .select({ credentials: schema.storeAccounts.credentials })
    .from(schema.storeAccounts)
    .where(
      and(
        eq(schema.storeAccounts.store, 'steam'),
        eq(schema.storeAccounts.externalAccountId, steamId),
      ),
    )
    .limit(1);
  if (!account?.credentials) {
    console.error(`nessun account Steam ${steamId} con un credenziale, qui`);
    process.exit(1);
  }

  const stored = decryptCredentials<{
    accessToken?: string;
    expiresAt?: number;
  }>(account.credentials);
  const minuti = Math.round(((stored.expiresAt ?? 0) - Date.now()) / 60_000);
  if (!stored.accessToken || minuti <= 0) {
    console.error(
      `l'access token è scaduto (${stored.accessToken ? `da ${-minuti} minuti` : 'assente'}): ` +
        'nessuna richiesta fatta, e non lo rinnovo. Fai un import dalla scheda dell’account (↻) e riprova.',
    );
    process.exit(1);
  }
  console.log(`\naccess token valido ancora ${minuti} minuti`);
  url.searchParams.set('access_token', stored.accessToken);
} else {
  const key = process.env.STEAM_API_KEY;
  if (!key) {
    console.error('STEAM_API_KEY non impostata nel .env');
    process.exit(1);
  }
  url.searchParams.set('key', key);
}

// Mai l'URL né l'eccezione intera: contengono la chiave o il token.
const response = await fetch(url).catch((error: unknown) => {
  console.error(
    `richiesta fallita: ${error instanceof Error ? error.name : 'errore'}`,
  );
  process.exit(1);
});

const text = await response.text();
console.log(
  `\nGetWishlist per ${steamId}, ${useAccount ? 'con il token salvato' : 'con la chiave'}`,
);
console.log(`  stato:         ${response.status}`);
console.log(`  content-type:  ${response.headers.get('content-type')}`);
console.log(`  byte:          ${text.length}`);

let body: unknown;
try {
  body = JSON.parse(text);
} catch {
  console.log(`  non è JSON, inizio del corpo:\n    ${text.slice(0, 400)}`);
  process.exit(0);
}

// Cerca il primo array dentro la risposta: il nome del campo non è documentato.
const findArray = (
  value: unknown,
  path = '',
): { path: string; items: unknown[] } | null => {
  if (Array.isArray(value)) return { path: path || '(radice)', items: value };
  if (value && typeof value === 'object') {
    for (const [name, inner] of Object.entries(value)) {
      const found = findArray(inner, path ? `${path}.${name}` : name);
      if (found) return found;
    }
  }
  return null;
};

const top = body && typeof body === 'object' ? Object.keys(body as object) : [];
console.log(`  chiavi in cima: ${top.join(', ') || '(nessuna)'}`);

const list = findArray(body);
if (!list) {
  console.log(`  nessun elenco; corpo: ${JSON.stringify(body).slice(0, 600)}`);
  process.exit(0);
}

console.log(`  elenco in:     ${list.path}`);
console.log(`  elementi:      ${list.items.length}`);
const campi = new Set<string>();
for (const item of list.items) {
  if (item && typeof item === 'object') {
    for (const name of Object.keys(item)) campi.add(name);
  }
}
console.log(
  `  campi visti:   ${[...campi].join(', ') || '(elementi scalari)'}`,
);
console.log('  primi tre:');
for (const item of list.items.slice(0, 3)) {
  console.log(`    ${JSON.stringify(item)}`);
}

console.log();
process.exit(0);
