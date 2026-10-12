// Misura `appdetails` di Steam (15e, passo 1): richieste anonime e pubbliche
// allo store, **una per appid diverso**, al ritmo dell'import (1500 ms).
//
//   pnpm --filter api steam:appdetails-probe [max]
//
// Si ferma al **primo 429** senza riprovare, o a `max` richieste (220 se non
// dato: la soglia dichiarata è 200 ogni 5 minuti, e a 1500 ms la richiesta 201
// è la prima oltre). Non usa chiavi, cookie né account, non scrive niente e
// non passa dal client dell'app: vuole i numeri grezzi. L'unico rischio è un 429
// temporaneo sull'IP di questa macchina, che per qualche minuto può valere
// anche per lo store nel browser.
//
// A fine corsa una richiesta in più con un appid che non esiste, per vedere la
// forma di «lo store non lo conosce».

const URL_BASE = 'https://store.steampowered.com/api/appdetails';
const PAUSE_MS = 1500;
const max = Number(process.argv[2] ?? 220);
if (!Number.isInteger(max) || max < 1 || max > 400) {
  console.error('il massimo dev’essere un intero fra 1 e 400');
  process.exit(1);
}

const ask = (appId: string) => {
  const url = new URL(URL_BASE);
  url.searchParams.set('appids', appId);
  url.searchParams.set('filters', 'basic');
  url.searchParams.set('l', 'english');
  return fetch(url, { headers: { 'User-Agent': 'Ludex/0.1' } });
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Una caduta di rete (reset, timeout, DNS) non è una risposta di Steam: si
// conta, si stampa la causa e si va avanti, ma tre di fila fermano la corsa.
const describe = (error: unknown) => {
  if (!(error instanceof Error)) return 'errore';
  const cause = error.cause as { code?: string; message?: string } | undefined;
  return `${error.name}: ${error.message}${cause ? ` (causa: ${cause.code ?? ''} ${cause.message ?? ''})` : ''}`;
};
const MAX_CONSECUTIVE_FAILURES = 3;

const statuses = new Map<number, number>();
let found = 0;
let unknown = 0;
let blockedAt: number | null = null;
let networkErrors = 0;
let consecutiveFailures = 0;
const started = Date.now();
const seconds = () => Math.round((Date.now() - started) / 1000);

for (let i = 1; i <= max; i++) {
  // 10, 20, 30…: appid dei primi anni di Steam, molti esistono e qualcuno no.
  let response: Response;
  try {
    response = await ask(String(i * 10));
    consecutiveFailures = 0;
  } catch (error) {
    networkErrors++;
    consecutiveFailures++;
    console.log(`  richiesta ${i} (${seconds()} s) caduta: ${describe(error)}`);
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log(`\n${MAX_CONSECUTIVE_FAILURES} cadute di fila: mi fermo`);
      break;
    }
    await sleep(PAUSE_MS);
    continue;
  }
  statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);

  if (response.status === 429) {
    blockedAt = i;
    console.log(`\n429 alla richiesta ${i}, dopo ${seconds()} s`);
    console.log(`  retry-after: ${response.headers.get('retry-after') ?? '—'}`);
    break;
  }
  if (!response.ok) {
    console.log(`\nstato ${response.status} alla richiesta ${i}: mi fermo`);
    break;
  }

  let body: Record<string, { success?: boolean } | undefined> = {};
  try {
    body = (await response.json()) as typeof body;
  } catch (error) {
    console.log(`  richiesta ${i}: corpo illeggibile: ${describe(error)}`);
  }
  if (body[String(i * 10)]?.success) found++;
  else unknown++;

  if (i % 20 === 0) {
    console.log(`  ${i} richieste, ${seconds()} s`);
  }
  await sleep(PAUSE_MS);
}

console.log('\nappdetails');
console.log(
  `  stati:         ${[...statuses].map(([s, n]) => `${s}: ${n}`).join(', ')}`,
);
console.log(`  success true:  ${found}`);
console.log(`  success false: ${unknown}`);
console.log(`  cadute di rete: ${networkErrors}`);
console.log(
  `  429:           ${blockedAt ? `alla richiesta ${blockedAt}` : 'mai'}`,
);

if (blockedAt === null && consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
  await sleep(PAUSE_MS);
  try {
    const response = await ask('999999999');
    const text = await response.text();
    console.log(`\nappid inesistente: stato ${response.status}`);
    console.log(`  corpo: ${text.slice(0, 200)}`);
  } catch (error) {
    console.log(`\nappid inesistente: richiesta caduta: ${describe(error)}`);
  }
}

console.log();
process.exit(0);
