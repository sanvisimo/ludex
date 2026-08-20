import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Cifratura a riposo dei credenziali di negozio (step 9a).
 *
 * Dal 9a `store_accounts.credentials` contiene un refresh token per utente: chi
 * lo legge può leggere la libreria di quella persona finché non lo revoca. Un
 * dump del database non deve bastare, e per questo la chiave sta fuori dal
 * database, in `STORE_TOKEN_KEY`.
 *
 * **AES-256-GCM e non CBC**: GCM autentica il testo cifrato, quindi un byte
 * cambiato nella colonna fa fallire la decifratura invece di restituire
 * spazzatura che poi qualcuno manderebbe a GOG come se fosse un token.
 *
 * Il formato sul disco è la concatenazione di tre pezzi a lunghezza nota:
 *
 *     [ IV, 12 byte ][ tag GCM, 16 byte ][ testo cifrato, il resto ]
 *
 * L'IV sta in chiaro accanto al dato perché è così che va usato — deve essere
 * irripetibile, non segreto — e dentro il record invece che in una colonna sua
 * perché non serve a nessuna query: chi decifra ha già la riga in mano.
 */

const ALGORITHM = 'aes-256-gcm';
// 96 bit: la lunghezza per cui GCM è specificato, e l'unica che non costringe
// l'implementazione a comprimere l'IV con GHASH.
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

let cachedKey: Buffer | null = null;

/**
 * La chiave, letta una volta sola.
 *
 * Si pretende **32 byte esatti in base64**, non una passphrase qualunque
 * derivata al volo: derivare in silenzio da una stringa corta darebbe una
 * chiave debole senza che nessuno se ne accorga. Meglio rifiutarsi di partire.
 *
 *     openssl rand -base64 32
 */
export function storeTokenKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.STORE_TOKEN_KEY;
  if (!raw) {
    throw new Error(
      'STORE_TOKEN_KEY non impostata nel .env: genera con `openssl rand -base64 32`',
    );
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `STORE_TOKEN_KEY deve essere 32 byte in base64 (ne ha ${key.length}): genera con \`openssl rand -base64 32\``,
    );
  }

  cachedKey = key;
  return key;
}

/** Solo per i test: la chiave viene riletta alla prossima chiamata. */
export function resetStoreTokenKey() {
  cachedKey = null;
}

export function encryptCredentials(value: unknown): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, storeTokenKey(), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

/**
 * Il contrario. Alza se il record è troncato, se la chiave è un'altra o se
 * qualcuno ha toccato i byte: sono tutti casi in cui l'unica risposta giusta è
 * chiedere all'utente di ricollegare l'account, non tirare avanti.
 */
export function decryptCredentials<T = unknown>(record: Buffer): T {
  if (record.length <= IV_LENGTH + TAG_LENGTH) {
    throw new Error('credenziale cifrata troncata');
  }

  const iv = record.subarray(0, IV_LENGTH);
  const tag = record.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const body = record.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, storeTokenKey(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(body), decipher.final()]);
  return JSON.parse(plain.toString('utf8')) as T;
}

/**
 * Se due record cifrano lo stesso segreto.
 *
 * Non si confrontano i byte cifrati — con un IV casuale sono diversi ogni
 * volta — ma i due testi in chiaro, a tempo costante. Serve a `store-accounts`
 * per non riscrivere la riga quando il negozio rende lo stesso refresh token.
 */
export function sameCredentials(a: Buffer | null, b: Buffer | null) {
  if (a === null || b === null) return a === b;
  const left = Buffer.from(JSON.stringify(decryptCredentials(a)));
  const right = Buffer.from(JSON.stringify(decryptCredentials(b)));
  return left.length === right.length && timingSafeEqual(left, right);
}
