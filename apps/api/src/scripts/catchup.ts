import '../env';

import { db, schema } from '@repo/db';
import { and, eq, gte, sql } from '@repo/db/orm';

import { enqueueEnrichment, enrichmentQueue } from '../queue/enrichment';
import {
  ENRICHMENT_SOURCE_NAMES,
  findGamesNeedingSource,
} from '../services/enrichment';
import { resolveOpenCriticIds } from '../services/opencritic-resolve';

// Spende il budget OpenCritic di oggi in un colpo solo, e poi si ferma.
//
//   pnpm --filter api catchup
//
// È l'arnese dei giorni in cui il worker non sta acceso da solo: lo accendi,
// lanci questo, e quando il comando esce il budget del giorno è finito e puoi
// spegnere tutto. È il `backfill` fatto su misura per il budget OpenCritic, e
// le due differenze sono la ragione per cui esiste:
//
// - accoda **a blocchi** invece di 500 in un colpo. Con un budget da 200, i 300
//   di troppo si svegliano, trovano il muro e tornano `deferred`: righe di log
//   indistinguibili da un guasto vero.
// - sa quando fermarsi. Vedi `cicloOpenCritic`.
//
// L'aggancio Wikidata **non** fa parte del giro normale, e sta dietro
// `--resolve`. Non è pigrizia: quel passo si interroga in blocco e di rado, e
// mettendolo qui verrebbe chiamato ogni volta che si spende il budget — anche
// due volte al giorno — per una mappa che si muove al ritmo di chi la cura.
// Il giro periodico lo fa il worker una volta a settimana; il flag serve per
// quando si sa che c'è motivo, tipo dopo un import che ha portato giochi nuovi.
//
// Non fa il lavoro: lo mette in coda. A farlo è il worker, che è l'unico che
// parla con le fonti e l'unico che conosce il budget residuo.

/** Quanti giochi OpenCritic accodare per ciclo. */
const BLOCCO = 100;

/** Ogni quanto ricontrollare se la coda si è svuotata. */
const POLL_MS = 2_000;

/**
 * Quanto aspettare al massimo che un blocco venga smaltito.
 *
 * Generoso di proposito: cento ricerche per nome, serializzate dal rate limiter
 * del client, sono minuti veri. Serve a non restare appesi per sempre se il
 * worker muore a metà, non a mettere fretta.
 */
const ATTESA_MAX_MS = 15 * 60 * 1000;

const attendi = (ms: number) =>
  new Promise((risolvi) => setTimeout(risolvi, ms));

/**
 * Quanti giochi hanno davvero cambiato stato da un certo momento in poi.
 *
 * È il segnale su cui si decide di smettere, e funziona perché un budget
 * esaurito **non annota niente**: `enrichGameFromOpenCritic` restituisce
 * `deferred` senza toccare `game_sources`, così la spazzata di domani non crede
 * di aver già provato. Quindi "la coda si è svuotata e nessuna riga ha un
 * `attempted_at` nuovo" è la firma del muro, e non serve conoscere il budget —
 * che vive nella memoria del worker e da qui non si vede.
 */
async function tentativiDa(momento: Date) {
  const [riga] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.gameSources)
    .where(
      and(
        eq(schema.gameSources.source, 'opencritic'),
        gte(schema.gameSources.attemptedAt, momento),
      ),
    );

  return riga?.n ?? 0;
}

/**
 * Aspetta che la coda si svuoti, o che il worker sparisca.
 *
 * Guarda `wait` e `active` e non i `delayed`: lì dentro ci stanno anche i due
 * scheduler — spazzata e aggancio settimanale — che sono sempre in attesa del
 * loro turno e non si svuoteranno mai. Un job in ritentativo passa quindi
 * inosservato, e va bene: il ciclo dopo lo ripesca il predicato, che è
 * idempotente.
 */
async function attendiCoda() {
  const scadenza = Date.now() + ATTESA_MAX_MS;

  while (Date.now() < scadenza) {
    if ((await enrichmentQueue.getWorkersCount()) === 0) {
      console.log('il worker si è spento: quello che era in coda resta lì');
      return false;
    }

    const inCorso =
      (await enrichmentQueue.getWaitingCount()) +
      (await enrichmentQueue.getActiveCount());

    if (inCorso === 0) return true;
    await attendi(POLL_MS);
  }

  console.log('la coda non si è svuotata in quindici minuti: mi fermo qui');
  return false;
}

/**
 * Accoda un blocco per volta finché il budget regge.
 *
 * Il ciclo si ferma da sé in due casi, e sono diversi: `niente da fare` vuol
 * dire che OpenCritic è a posto, `budget finito` che è finito per oggi.
 */
async function cicloOpenCritic() {
  let totale = 0;

  for (;;) {
    const inizio = new Date();
    const giochi = await findGamesNeedingSource('opencritic', BLOCCO);

    if (giochi.length === 0) {
      console.log('opencritic: niente da fare, sono tutti aggiornati');
      return totale;
    }

    for (const gioco of giochi) await enqueueEnrichment('opencritic', gioco.id);
    console.log(`opencritic: accodati ${giochi.length}, aspetto…`);

    if (!(await attendiCoda())) return totale;

    const fatti = await tentativiDa(inizio);
    totale += fatti;
    console.log(`opencritic: ${fatti} giochi hanno risposto`);

    if (fatti === 0) {
      console.log('opencritic: budget finito per oggi');
      return totale;
    }
  }
}

if ((await enrichmentQueue.getWorkersCount()) === 0) {
  console.log(
    'nessun worker in ascolto: questo script accoda soltanto.\n' +
      'Accendilo con `pnpm --filter api dev:worker` e rilancia.',
  );
  process.exit(1);
}

// L'aggancio degli id, solo se richiesto. Non tocca OpenCritic e non spende
// budget: chiede a Wikidata, e ogni gioco che aggancia smette di costare una
// **ricerca** (25 al giorno) e passa a costare una **richiesta** (200).
//
// La finestra è il totale dei giochi e non un numero scritto a mano: `1345` era
// giusto un giorno e sbagliato il successivo, e una finestra corta è il modo in
// cui questo passo smette di scrivere senza dirlo — davanti alla coda stanno i
// giochi più vecchi, che sono anche quelli che Wikidata non collega.
if (process.argv.includes('--resolve')) {
  const [conteggio] = await db
    .select({ giochi: sql<number>`count(*)::int` })
    .from(schema.games);

  try {
    const report = await resolveOpenCriticIds(conteggio?.giochi ?? 0);
    console.log(
      `aggancio: ${report.candidati} da agganciare, ${report.conMappa} noti a ` +
        `Wikidata, ${report.agganciati} scritti` +
        (report.conflitti > 0 ? `, ${report.conflitti} in conflitto` : ''),
    );
  } catch (errore) {
    // Wikidata risponde 429 quando è in affanno, e siccome la mappa si
    // costruisce tutta prima di scrivere, il giro si perde intero. Non è un
    // motivo per non spendere il budget OpenCritic, che è la parte che scade a
    // mezzanotte: si dice e si tira avanti.
    console.log(
      `aggancio saltato: ${errore instanceof Error ? errore.message : errore}`,
    );
  }
}

// Le altre fonti non hanno un tetto giornaliero, solo un limite al secondo che
// il client rispetta da sé: si accodano e basta, senza cicli e senza attese.
for (const fonte of ENRICHMENT_SOURCE_NAMES) {
  if (fonte === 'opencritic') continue;
  const giochi = await findGamesNeedingSource(fonte, 500);
  for (const gioco of giochi) await enqueueEnrichment(fonte, gioco.id);
  if (giochi.length > 0) console.log(`${fonte}: accodati ${giochi.length}`);
}

const fatti = await cicloOpenCritic();
console.log(`\nfatto: ${fatti} giochi OpenCritic in questo giro`);

process.exit(0);
