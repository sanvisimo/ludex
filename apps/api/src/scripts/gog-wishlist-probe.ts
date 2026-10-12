import '../env';

import {
  exchangeGogCode,
  gogLoginUrl,
  parseGogAuthCode,
} from '../external/gog';
import { findGameIdsByExternalIds } from '../services/games';

// Misura la wishlist di GOG (15e, passo 1): **una** richiesta a
// `embed.gog.com/user/wishlist.json` con il Bearer di `auth.gog.com`. Non
// scrive niente e non stampa token.
//
//   pnpm --filter api gog:wishlist-probe [indirizzo-o-codice]
//
// Senza argomento stampa l'indirizzo del login. Poi si incolla l'indirizzo su
// cui si atterra (come nel collegamento dall'app) o il solo codice.
//
// **Non usa il token salvato in `store_accounts`**: rinnovarlo ruoterebbe il
// refresh token, e se lo stesso account è collegato anche sul mini PC quello
// smetterebbe di valere. Il codice nuovo dà una coppia di token a parte, che
// non tocca il DB.
//
// Domande a cui risponde: il Bearer basta o servono i cookie del sito? che
// forma ha la risposta? gli id sono quelli delle copie che abbiamo già? La
// richiesta è senza redirect: se GOG rimanda a una pagina di login si vede.

const pasted = process.argv[2];
if (!pasted) {
  console.log(
    `\napri questo indirizzo, fai il login e incolla qui l'indirizzo su cui atterri:\n\n  ${gogLoginUrl()}\n\n` +
      '  pnpm --filter api gog:wishlist-probe "<indirizzo>"\n',
  );
  process.exit(0);
}

const code = parseGogAuthCode(pasted);
if (!code) {
  console.error(
    'codice non riconosciuto: va bene l’indirizzo intero o il solo codice',
  );
  process.exit(1);
}

const credentials = await exchangeGogCode(code);

const response = await fetch('https://embed.gog.com/user/wishlist.json', {
  headers: { Authorization: `Bearer ${credentials.accessToken}` },
  redirect: 'manual',
});

const text = await response.text();
console.log('\nuser/wishlist.json');
console.log(`  stato:         ${response.status}`);
console.log(`  content-type:  ${response.headers.get('content-type')}`);
const dove = response.headers.get('location');
if (dove)
  console.log(
    `  rimanda a:     ${new URL(dove, 'https://embed.gog.com').origin}${new URL(dove, 'https://embed.gog.com').pathname}`,
  );
console.log(`  byte:          ${text.length}`);

let body: { wishlist?: Record<string, unknown>; checksum?: string } | null =
  null;
try {
  body = JSON.parse(text);
} catch {
  console.log(`  non è JSON, inizio del corpo:\n    ${text.slice(0, 300)}`);
  process.exit(0);
}

console.log(`  chiavi in cima: ${Object.keys(body ?? {}).join(', ')}`);
const ids = Object.keys(body?.wishlist ?? {});
console.log(`  elementi:      ${ids.length}`);
console.log(
  `  valori:        ${[...new Set(Object.values(body?.wishlist ?? {}).map((v) => JSON.stringify(v)))].join(', ')}`,
);
console.log(`  primi id:      ${ids.slice(0, 5).join(', ')}`);

// Sola lettura sul DB di sviluppo: quanti id sono già giochi che Ludex conosce.
if (ids.length > 0) {
  const known = await findGameIdsByExternalIds('gog', ids);
  console.log(
    `  già noti a Ludex (external_ids gog): ${known.size} su ${ids.length}`,
  );
}

console.log();
process.exit(0);
