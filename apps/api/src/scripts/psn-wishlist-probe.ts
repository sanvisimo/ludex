import '../env';

import {
  exchangeNpssoForCode,
  exchangePsnCode,
  parseNpsso,
} from '../external/psn';

// Misura la wishlist di PlayStation (15e, passo 1): **una** richiesta a
// `metGetStoreWishlist` con il Bearer del client mobile. Non scrive niente e
// non stampa token.
//
//   pnpm --filter api psn:wishlist-probe [npsso]
//
// Come `psn:probe`: senza argomento usa `PSN_TEST_NPSSO`. Lo scambio
// npsso → token è lo stesso del collegamento e dà una coppia **nuova**, che non
// passa dal DB: il token salvato in `store_accounts` non si rinnova qui.
//
// Il gateway è `m.np.playstation.com` (come per librerie e profilo), mentre il
// client della libreria acquisti usa `web.np.playstation.com`: la misura dice se
// la documentazione non ufficiale ha ragione. L'hash della query persistente è
// quello della documentazione e può non valere più (è la parte fragile): se
// Sony lo rifiuta lo dice nell'errore, e **non si riprova con altri**.

const HASH = '571149e8aa4d76af7dd33b92e1d6f8f828ebc5fa8f0f6bf51a8324a0e6d71324';

const pasted = process.argv[2] ?? process.env.PSN_TEST_NPSSO;
if (!pasted) {
  console.error(
    'manca l’npsso: passalo come argomento o metti PSN_TEST_NPSSO nel .env',
  );
  process.exit(1);
}
const npsso = parseNpsso(pasted);
if (!npsso) {
  console.error('npsso non riconosciuto');
  process.exit(1);
}

const credentials = await exchangePsnCode(await exchangeNpssoForCode(npsso));

const url = new URL('https://m.np.playstation.com/api/graphql/v1/op');
url.searchParams.set('operationName', 'metGetStoreWishlist');
url.searchParams.set('variables', '{}');
url.searchParams.set(
  'extensions',
  JSON.stringify({ persistedQuery: { version: 1, sha256Hash: HASH } }),
);

const response = await fetch(url, {
  headers: {
    Authorization: `Bearer ${credentials.accessToken}`,
    'content-type': 'application/json',
    'apollographql-client-name': 'PlayStationApp-Android',
    // Come il client della libreria: i titoli del negozio americano.
    'X-PSN-Store-Locale-Override': 'en-US',
    'Accept-Language': 'en-US',
  },
});

const text = await response.text();
console.log('\nmetGetStoreWishlist');
console.log(`  stato:         ${response.status}`);
console.log(`  content-type:  ${response.headers.get('content-type')}`);
console.log(`  byte:          ${text.length}`);

let body: {
  data?: { storeWishlist?: unknown };
  errors?: { message?: string }[];
} | null = null;
try {
  body = JSON.parse(text);
} catch {
  console.log(`  non è JSON, inizio del corpo:\n    ${text.slice(0, 400)}`);
  process.exit(0);
}

if (body?.errors?.length) {
  console.log(
    `  errori:        ${body.errors
      .map((e) => e.message)
      .join(' | ')
      .slice(0, 400)}`,
  );
}
console.log(`  chiavi in cima: ${Object.keys(body ?? {}).join(', ')}`);

const wishlist = body?.data?.storeWishlist;
const items = Array.isArray(wishlist)
  ? (wishlist as Record<string, unknown>[])
  : null;
if (!items) {
  console.log(
    `  storeWishlist non è un elenco: ${JSON.stringify(wishlist)?.slice(0, 400)}`,
  );
  process.exit(0);
}

console.log(`  elementi:      ${items.length}`);
const campi = new Set<string>();
for (const item of items) for (const name of Object.keys(item)) campi.add(name);
console.log(`  campi visti:   ${[...campi].join(', ')}`);

const conteggio = (chiave: (item: Record<string, unknown>) => string) => {
  const mappa = new Map<string, number>();
  for (const item of items)
    mappa.set(chiave(item), (mappa.get(chiave(item)) ?? 0) + 1);
  return [...mappa]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}: ${n}`)
    .join(', ');
};
console.log(
  `  per piattaforma: ${conteggio((item) => JSON.stringify(item.platforms ?? null))}`,
);
console.log(
  `  per classificazione: ${conteggio((item) => String(item.storeDisplayClassification ?? '—'))}`,
);

const boxArts = items.map((item) => item.boxArt);
console.log(
  `  boxArt assente o nullo: ${boxArts.filter((box) => box == null).length} su ${items.length}`,
);
const boxArtKeys = new Set<string>();
for (const box of boxArts) {
  if (box && typeof box === 'object') {
    for (const name of Object.keys(box)) boxArtKeys.add(name);
  }
}
console.log(`  chiavi di boxArt: ${[...boxArtKeys].join(', ') || '(nessuna)'}`);
console.log('  boxArt dei primi tre:');
for (const box of boxArts.slice(0, 3)) {
  console.log(`    ${JSON.stringify(box)}`);
}

console.log('  primi tre (senza prezzi):');
for (const item of items.slice(0, 3)) {
  const { id, name, platforms, storeDisplayClassification } = item;
  console.log(
    `    ${JSON.stringify({ id, name, platforms, storeDisplayClassification })}`,
  );
}

console.log();
process.exit(0);
