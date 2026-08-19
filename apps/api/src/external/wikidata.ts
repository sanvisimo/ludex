import { chunk } from '../lib/chunk';

// Wikidata come **anagrafe di identificativi**, non come fonte di dati.
//
// Il problema che risolve: OpenCritic dà 25 ricerche al giorno, e agganciare
// per nome una libreria di qualche centinaio di giochi le brucerebbe tutte per
// settimane. Wikidata tiene, su molti giochi, sia lo slug IGDB (P5794) sia
// l'id OpenCritic (P2864): incrociarli è un aggancio per **identità**, gratis,
// e in una richiesta sola per centinaia di giochi.
//
// Misurato sulla libreria di prova (446 giochi): 262 agganciati, e sui giochi
// dal 2016 in poi — l'era in cui OpenCritic ha davvero dei dati, è nato nel
// 2015 — 180 su 228. Il resto passa dalla ricerca, che a quel punto è un
// residuo e non il lavoro.
//
// Si usa lo **slug IGDB** e non l'appid Steam, che pure Wikidata mappa e che
// aggancia altrettanto (263 contro 262, con appena 5 giochi di differenza):
// l'appid ce l'hanno solo i giochi comprati su Steam, lo slug ce l'hanno tutti.

const ENDPOINT = 'https://query.wikidata.org/sparql';

// Le buone maniere di WDQS: ci si dichiara, e non si martella. Il servizio è
// gratuito e ogni tanto è in affanno — durante l'analisi ha risposto
// "Aggressively rate-limiting to 1 req / min - active wdqs outage" — quindi
// questa funzione va chiamata di rado e in blocco, mai dentro un job per gioco.
const USER_AGENT = 'Ludex/0.1 (game library manager)';

// Quanti slug per query. Il limite vero è la lunghezza dell'URL — che qui non
// c'è, perché si manda in POST — e il tempo di esecuzione: 300 valori stanno
// largamente sotto il timeout di sessanta secondi di WDQS.
const CHUNK = 300;

type SparqlBinding = { slug: { value: string }; oc: { value: string } };

/**
 * Da slug IGDB a id OpenCritic, per i giochi che Wikidata conosce.
 *
 * Restituisce solo quello che ha trovato: uno slug assente dalla mappa non è un
 * errore, è un gioco che nessuno ha ancora collegato là — e che quindi passerà
 * dalla ricerca.
 */
export async function fetchOpenCriticIdsBySlug(
  slugs: string[],
): Promise<Map<string, number>> {
  const mappa = new Map<string, number>();

  for (const gruppo of chunk(slugs, CHUNK)) {
    // I valori vanno in una VALUES: è la forma che fa scegliere a WDQS
    // l'indice sugli identificativi invece di scandire i giochi.
    const valori = gruppo
      .map((slug) => `"${slug.replace(/["\\]/g, '')}"`)
      .join(' ');
    const query = `SELECT ?slug ?oc WHERE { VALUES ?slug { ${valori} } ?item wdt:P5794 ?slug ; wdt:P2864 ?oc }`;

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ query, format: 'json' }),
    });

    if (!response.ok) {
      throw new Error(
        `Wikidata: ${response.status} ${(await response.text()).slice(0, 200)}`,
      );
    }

    const body = (await response.json()) as {
      results?: { bindings?: SparqlBinding[] };
    };

    for (const riga of body.results?.bindings ?? []) {
      const id = Number(riga.oc.value);
      // Gli id di Wikidata sono stringhe scritte a mano da chi cura la voce:
      // uno non numerico è un refuso là, non un caso da propagare qui.
      if (Number.isInteger(id) && id > 0) mappa.set(riga.slug.value, id);
    }
  }

  return mappa;
}
