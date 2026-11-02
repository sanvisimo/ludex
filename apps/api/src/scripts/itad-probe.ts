import '../env';

import { db, schema } from '@repo/db';
import { inArray } from '@repo/db/orm';

// Misure di IsThereAnyDeal prima di scrivere il client (plans/itad-prezzo.md):
// quanti giochi del catalogo trova, dove i negozi non concordano sull'identità,
// come si comporta l'overview coi voucher. Legge il database e **non scrive
// niente**.
//
//   pnpm --filter api itad:probe
//
// Usa la chiave vera, nell'header così non finisce negli URL, e non la stampa.
// Il tetto di richieste è una rete di sicurezza: ITAD ne concede 1000 ogni
// 5 minuti e bandisce chi aggira i limiti.

const API = 'https://api.isthereanydeal.com';
const MAX_RICHIESTE = 100;
const BLOCCO = 200;
const QUANTI_DISCORDI = 15;
const QUANTI_ASSENTI = 5;

// Gli id dei negozi vengono da `GET /service/shops/v1`. Il formato è provato:
// Steam vuole `app/<appid>`, GOG l'id nudo. Epic non trova niente coi nostri id
// (0 su 678), per questo qui non c'è.
const NEGOZI = [
  { store: 'steam', shopId: 61, daId: (id: string) => `app/${id}` },
  { store: 'gog', shopId: 35, daId: (id: string) => id },
] as const;
type Negozio = (typeof NEGOZI)[number]['store'];

const key = process.env.ITAD_API_KEY;
if (!key) {
  console.error('ITAD_API_KEY mancante nel .env');
  process.exit(1);
}

let richieste = 0;

async function chiedi<T>(path: string, body?: unknown): Promise<T> {
  if (++richieste > MAX_RICHIESTE)
    throw new Error(`Tetto di ${MAX_RICHIESTE} richieste raggiunto`);

  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'ITAD-API-Key': key!,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!res.ok) throw new Error(`${res.status} su ${path}: ${await res.text()}`);
  return (await res.json()) as T;
}

type Lookup = Record<string, string | null>;

async function lookup(shopId: number, ids: string[]): Promise<Lookup> {
  const out: Lookup = {};
  for (let i = 0; i < ids.length; i += BLOCCO)
    Object.assign(
      out,
      await chiedi<Lookup>(
        `/lookup/id/shop/${shopId}/v1`,
        ids.slice(i, i + BLOCCO),
      ),
    );
  return out;
}

type Info = { title: string; type: string | null; slug: string };

async function descrivi(uuid: string) {
  const info = await chiedi<Info>(`/games/info/v2?id=${uuid}`);
  return `${info.title} [${info.type ?? 'senza tipo'}] (${uuid})`;
}

// ─── Catalogo ────────────────────────────────────────────────────────────────

const giochi = await db
  .select({ id: schema.games.id, name: schema.games.name })
  .from(schema.games);
const nomeDi = new Map(giochi.map((g) => [g.id, g.name]));

const righe = await db
  .select({
    gameId: schema.externalIds.gameId,
    source: schema.externalIds.source,
    externalId: schema.externalIds.externalId,
  })
  .from(schema.externalIds)
  .where(inArray(schema.externalIds.source, ['steam', 'gog', 'epic']));

// ─── Lookup ──────────────────────────────────────────────────────────────────

type Aggancio = { store: Negozio; externalId: string; uuid: string };
const agganci = new Map<string, Aggancio[]>();

for (const { store, shopId, daId } of NEGOZI) {
  const mie = righe.filter((r) => r.source === store);
  const esito = await lookup(
    shopId,
    mie.map((r) => daId(r.externalId)),
  );
  let trovati = 0;
  for (const r of mie) {
    const uuid = esito[daId(r.externalId)];
    if (!uuid) continue;
    trovati++;
    const lista = agganci.get(r.gameId) ?? [];
    lista.push({ store, externalId: r.externalId, uuid });
    agganci.set(r.gameId, lista);
  }
  console.log(`${store}: ${trovati} id trovati su ${mie.length}`);
}

// ─── Copertura ───────────────────────────────────────────────────────────────

console.log('\n== Copertura ==');
console.log(`giochi con un id ITAD: ${agganci.size} su ${giochi.length}`);
const senza = giochi.filter((g) => !agganci.has(g.id));
const conEpic = new Set(
  righe.filter((r) => r.source === 'epic').map((r) => r.gameId),
);
console.log(
  `senza id ITAD: ${senza.length}, di cui con un id Epic: ${senza.filter((g) => conEpic.has(g.id)).length}`,
);

// ─── Identità ────────────────────────────────────────────────────────────────

const uuidUnici = (lista: Aggancio[]) => [...new Set(lista.map((a) => a.uuid))];

const discordi = [...agganci].filter(([, l]) => uuidUnici(l).length > 1);
const dentroNegozio = discordi.filter(([, l]) =>
  NEGOZI.some(
    ({ store }) => uuidUnici(l.filter((a) => a.store === store)).length > 1,
  ),
);
console.log('\n== Giochi con più uuid ==');
console.log(
  `${discordi.length} giochi, di cui ${dentroNegozio.length} con più uuid dentro lo stesso negozio`,
);

for (const [gameId, lista] of discordi
  .sort(() => Math.random() - 0.5)
  .slice(0, QUANTI_DISCORDI)) {
  console.log(`\n${nomeDi.get(gameId)}`);
  for (const uuid of uuidUnici(lista)) {
    const da = lista
      .filter((a) => a.uuid === uuid)
      .map((a) => `${a.store} ${a.externalId}`);
    console.log(`  ${da.join(', ')} → ${await descrivi(uuid)}`);
  }
}

console.log('\n== Uuid su più giochi nostri ==');
const giochiDi = new Map<string, Set<string>>();
for (const [gameId, lista] of agganci)
  for (const uuid of uuidUnici(lista))
    giochiDi.set(uuid, (giochiDi.get(uuid) ?? new Set()).add(gameId));

for (const [uuid, ids] of giochiDi) {
  if (ids.size < 2) continue;
  const nomi = [...ids].map((id) => {
    const da = agganci
      .get(id)!
      .filter((a) => a.uuid === uuid)
      .map((a) => `${a.store} ${a.externalId}`);
    return `${nomeDi.get(id)} (${da.join(', ')})`;
  });
  console.log(`${uuid}: ${nomi.join(' | ')}`);
}

// ─── Overview ────────────────────────────────────────────────────────────────

type Prezzo = { amountInt: number; currency: string };
type Voce = {
  id: string;
  current: { price: Prezzo; voucher: string | null } | null;
  lowest?: { price: Prezzo } | null;
};
type Overview = { prices: Voce[] };

const campione = [...giochiDi.keys()]
  .sort(() => Math.random() - 0.5)
  .slice(0, BLOCCO);

const conVoucher = (
  await chiedi<Overview>('/games/overview/v2?country=IT', campione)
).prices;
const senzaVoucher = (
  await chiedi<Overview>(
    '/games/overview/v2?country=IT&vouchers=false',
    campione,
  )
).prices;

function conta(voci: Voce[], titolo: string) {
  const conMinimo = voci.filter((v) => v.current && v.lowest);
  const a = (v: Voce) => v.current!.price.amountInt;
  const b = (v: Voce) => v.lowest!.price.amountInt;
  console.log(
    `${titolo}: ${voci.length} voci, senza offerta ${voci.filter((v) => !v.current).length}, senza minimo ${voci.filter((v) => !v.lowest).length}, uguali al minimo ${conMinimo.filter((v) => a(v) === b(v)).length}, sotto il minimo ${conMinimo.filter((v) => a(v) < b(v)).length}`,
  );
}

console.log(`\n== Overview, ${campione.length} uuid a caso, IT ==`);
conta(conVoucher, 'coi voucher');
conta(senzaVoucher, 'senza voucher');

const sotto = conVoucher.filter(
  (v) =>
    v.current &&
    v.lowest &&
    v.current.price.amountInt < v.lowest.price.amountInt,
);
console.log(
  `sotto il minimo coi voucher: ${sotto.length}, di cui col campo voucher: ${sotto.filter((v) => v.current!.voucher).length}`,
);

const senzaMinimo = conVoucher.find((v) => !v.lowest);
if (senzaMinimo)
  console.log('una voce senza minimo:', JSON.stringify(senzaMinimo, null, 2));

// Chi non torna nella risposta: nessuna offerta, o un gioco che ITAD non segue?
const tornati = new Set(conVoucher.map((v) => v.id));
const assenti = campione.filter((u) => !tornati.has(u));
console.log(`\nuuid assenti dalla risposta: ${assenti.length}`);
for (const uuid of assenti.slice(0, QUANTI_ASSENTI))
  console.log(`  ${await descrivi(uuid)}`);

console.log(`\nRichieste alla API: ${richieste}`);
process.exit(0);
