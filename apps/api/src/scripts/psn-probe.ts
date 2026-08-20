import '../env';

import {
  exchangeNpssoForCode,
  exchangePsnCode,
  fetchPsnLibrary,
  fetchPsnLibraryRawPage,
  fetchPsnPlayedTitles,
  fetchPsnProfile,
  parseNpsso,
  type PsnLibraryEntry,
  refreshPsnTokens,
} from '../external/psn';
import { resolveByName } from '../services/library-import';
import { toPlatformSlug } from '../services/psn-platforms';

// Giro a vuoto dell'import PSN: legge la libreria, prova a risolverla, **non
// scrive niente**.
//
//   pnpm --filter api psn:probe [npsso]
//
// Come `steam:probe`, ma con tre domande in più che su PSN non si possono
// rispondere a tavolino, e che decidono come sarà fatto il job:
//
//  1. **l'identità dell'account** — l'`id_token` porta davvero l'`accountId`
//     numerico? È quello che finisce in `external_account_id`, e sbagliarlo
//     significa che un utente che si rinomina si ritrova due account.
//  2. **l'identità dei giochi** — quante righe portano il `conceptId`, che è
//     l'unica cosa che IGDB conosca di PSN. Le altre andranno risolte per nome
//     come su Epic e Amazon, o non andranno risolte affatto.
//  3. **le ore** — la libreria e l'elenco dei giocati condividono una chiave?
//
// Senza argomento usa PSN_TEST_NPSSO.

const pasted = process.argv[2] ?? process.env.PSN_TEST_NPSSO;
if (!pasted) {
  console.error(
    "manca l'npsso: passalo come argomento o metti PSN_TEST_NPSSO nel .env\n" +
      '  1. entra su https://www.playstation.com/ con il browser\n' +
      '  2. apri https://ca.account.sony.com/api/v1/ssocookie e copia la risposta',
  );
  process.exit(1);
}

const npsso = parseNpsso(pasted);
if (!npsso) {
  console.error(
    'npsso non riconosciuto: va bene il JSON intero {"npsso":"…"} o il solo valore',
  );
  process.exit(1);
}

const conteggio = <T>(rows: T[], chiave: (row: T) => string) => {
  const mappa = new Map<string, number>();
  for (const row of rows) {
    mappa.set(chiave(row), (mappa.get(chiave(row)) ?? 0) + 1);
  }
  return [...mappa].sort((a, b) => b[1] - a[1]);
};

const percento = (parte: number, tutto: number) =>
  tutto === 0 ? '—' : `${Math.round((100 * parte) / tutto)}%`;

// --- 1. identità ---

const code = await exchangeNpssoForCode(npsso);
const credentials = await exchangePsnCode(code);

console.log('\nidentità');
console.log(
  `  accountId dall'id_token:  ${credentials.accountId || '(assente!)'}`,
);
console.log(
  `  onlineId dall'id_token:   ${credentials.onlineId ?? '(assente)'}`,
);

// La verifica che conta: chiedere il profilo **con l'id letto dalla claim** e
// riavere lo stesso PSN ID che il token dichiara. Se combaciano, quell'id è
// davvero l'account e può fare da `external_account_id`.
const profilo = credentials.accountId
  ? await fetchPsnProfile(credentials.accessToken, credentials.accountId)
  : null;

const verificata =
  profilo?.onlineId != null &&
  (credentials.onlineId === null || profilo.onlineId === credentials.onlineId);

console.log(
  `  profilo per accountId:    ${profilo?.onlineId ?? '(non risponde)'}` +
    (verificata
      ? '  ← identità verificata'
      : "  ← NON verificata: la claim non è l'accountId"),
);
console.log(
  `  abbonamento attivo:       ${profilo?.isPlus ?? '(non dichiarato)'}`,
);

const inGiorni = (epoch: number) =>
  Math.round((epoch - Date.now()) / 86_400_000);

console.log(
  `  il refresh token dura:    ${credentials.refreshExpiresAt ? `${inGiorni(credentials.refreshExpiresAt)} giorni (${Math.round((credentials.refreshExpiresAt - Date.now()) / 1000)}s)` : '(non dichiarato)'}`,
);

// **La finestra si sposta o è fissa?** Decide se PSN è un collegamento come gli
// altri o un account da rifare a scadenza.
//
// E non si decide in un colpo solo: rinnovando *adesso*, una finestra che si
// sposta e una fissa danno lo stesso numero, perché fra i due token è passato
// un secondo. La differenza si vede **rilanciando il probe fra qualche giorno**
// con lo stesso account già collegato: se la scadenza è ancora piena la
// finestra rotola, se è calata dei giorni passati è fissa. Qui si stampa il
// dato grezzo, che è tutto ciò che una misura sola può dire onestamente.
const rinnovato = await refreshPsnTokens(credentials.refreshToken);
const inSecondi = (epoch: number) => Math.round((epoch - Date.now()) / 1000);
console.log(
  `  dopo un rinnovo:          ${rinnovato.refreshExpiresAt ? `${inGiorni(rinnovato.refreshExpiresAt)} giorni (${inSecondi(rinnovato.refreshExpiresAt)}s)` : '(non dichiarato)'}`,
);
console.log(
  '  ← con una misura sola non si distingue una finestra che rotola da una fissa:',
);
console.log(
  '    rilancia il probe fra qualche giorno e guarda se questo numero è ancora pieno.',
);

// Da qui in poi si usa il token rinnovato: è quello che l'import avrebbe in
// mano, e il precedente Sony l'ha appena invalidato.
const accessToken = rinnovato.accessToken;
const accountId = rinnovato.accountId || credentials.accountId;

// --- 2. la libreria ---

const library = await fetchPsnLibrary(accessToken);

const perPiattaforma = conteggio(
  library,
  (entry) => entry.platform || '(vuota)',
);
const ignote = perPiattaforma.filter(([platform]) => !toPlatformSlug(platform));
const conConcept = library.filter((entry) => entry.conceptId);
const conTitleId = library.filter((entry) => entry.titleId);
const daAbbonamento = library.filter(
  (entry) => entry.subscription && entry.subscription.toUpperCase() !== 'NONE',
);
const distinti = new Set(conConcept.map((entry) => entry.conceptId!));

console.log('\nlibreria');
console.log(`  voci:                     ${library.length}`);
console.log(
  `  con conceptId:            ${conConcept.length}  (${percento(conConcept.length, library.length)})`,
);
console.log(`  conceptId distinti:       ${distinti.size}`);
console.log(
  `  con titleId ricavabile:   ${conTitleId.length}  (${percento(conTitleId.length, library.length)})`,
);
console.log(
  `  da abbonamento:           ${daAbbonamento.length}  (${conteggio(library, (entry) => entry.subscription ?? '(nullo)')
    .map(([valore, n]) => `${valore} ${n}`)
    .join(', ')})`,
);
console.log(
  `  senza nome:               ${library.filter((entry) => !entry.name).length}`,
);
console.log(
  `  per piattaforma:          ${perPiattaforma.map(([p, n]) => `${p} ${n}`).join(', ')}`,
);
if (ignote.length > 0) {
  console.log(
    `  che non so tradurre:      ${ignote.map(([p, n]) => `${p} (${n})`).join(', ')}`,
  );
}

// I campi veri della risposta, non quelli che il nostro tipo si aspetta: un
// campo che Sony smette di mandare, letto attraverso un tipo, sembra solo nullo.
const grezze = await fetchPsnLibraryRawPage(accessToken);
console.log(
  `  campi di ogni riga:       ${Object.keys(grezze[0] ?? {}).join(', ')}`,
);

console.log('\n  un campione:');
for (const entry of library.slice(0, 5)) {
  console.log(
    `    ${(entry.conceptId ?? '—').padEnd(10)} ${(entry.titleId ?? '—').padEnd(13)} ${entry.platform.padEnd(6)} ${entry.name}`,
  );
}

// Le voci senza concept: sono quelle su cui si dovrà decidere qualcosa.
const senzaConcept = library.filter((entry) => !entry.conceptId);
if (senzaConcept.length > 0) {
  console.log(`\n  senza conceptId (${senzaConcept.length}), le prime dieci:`);
  for (const entry of senzaConcept.slice(0, 10)) {
    console.log(
      `    ${(entry.titleId ?? '—').padEnd(13)} ${entry.platform.padEnd(6)} ${entry.name}`,
    );
  }
}

// --- 3. la risoluzione: per nome, come Epic e Amazon ---
//
// Non per id, e non è una scelta: il `conceptId` — l'unica cosa che IGDB
// conosca di PSN, sorgente 36 — Sony lo manda nullo su ogni riga, e gli uid di
// quella sorgente sono proprio concept numerici, non `CUSA…`. Verificato su
// IGDB, non supposto.
//
// **Il cross-buy va sciolto prima.** Lo stesso gioco comprato su PS4 e su PS5
// sono due righe con lo stesso identico nome, e `resolveByName` scarta i nomi
// ripetuti — la rete tesa dopo i 266 «Live» di Epic. Quella regola parla di due
// *prodotti diversi* che si chiamano uguale; due console per lo stesso gioco
// sono un'altra cosa, e vanno raggruppate qui invece di essere buttate lì.
const perNome = new Map<string, PsnLibraryEntry[]>();
for (const entry of library) {
  const chiave = entry.name.trim().toLowerCase();
  perNome.set(chiave, [...(perNome.get(chiave) ?? []), entry]);
}

// Il caso che la regola di Epic vuole davvero prendere: lo stesso nome due
// volte **sulla stessa piattaforma**, cioè due prodotti distinti.
const ambigui = [...perNome.values()].filter((gruppo) => {
  const piattaforme = new Set(gruppo.map((entry) => entry.platform));
  return gruppo.length > piattaforme.size;
});

const crossBuy = [...perNome.values()].filter(
  (gruppo) => gruppo.length > 1 && new Set(gruppo.map((e) => e.platform)).size > 1,
);

console.log('\nnomi');
console.log(`  nomi distinti:            ${perNome.size}`);
console.log(`  di cui cross-buy:         ${crossBuy.length}  (stesso gioco su due console)`);
console.log(`  ambigui davvero:          ${ambigui.length}  (stesso nome, stessa console)`);

// Il matcher **dell'import**, non una sua copia: se questi numeri differissero
// da quelli del job, l'arnese non servirebbe a niente.
const daRisolvere = [...perNome.values()].map((gruppo) => ({
  // Il titleId fa da id esterno: il concept non c'è, e questo è l'unico
  // identificativo stabile che la riga porti.
  externalId: gruppo[0]!.titleId ?? gruppo[0]!.entitlementId ?? gruppo[0]!.name,
  name: gruppo[0]!.name,
}));

console.log(`\n  cerco su IGDB ${daRisolvere.length} nomi, a 4 al secondo…`);
const links = await resolveByName(daRisolvere);
const agganciatiPerNome = new Set(links.map((link) => link.externalId));

console.log('\nrisoluzione (per nome)');
console.log(
  `  agganciati:               ${links.length} su ${daRisolvere.length}  (${percento(links.length, daRisolvere.length)})`,
);
console.log(
  `  possessi che ne uscirebbero: ${library.filter((entry) => agganciatiPerNome.has(entry.titleId ?? '')).length} su ${library.length}`,
);

const irrisolti = daRisolvere.filter(
  (entry) => !agganciatiPerNome.has(entry.externalId),
);

// --- 4. le ore, e se si agganciano ---

const giocati = await fetchPsnPlayedTitles(accessToken, accountId);
const titleIdInLibreria = new Set(
  conTitleId.map((entry) => entry.titleId!.toUpperCase()),
);
const agganciati = giocati.filter((title) =>
  titleIdInLibreria.has(title.titleId.toUpperCase()),
);
const conOre = giocati.filter((title) => (title.playtimeMinutes ?? 0) > 0);

console.log('\nore giocate');
console.log(`  titoli giocati:           ${giocati.length}`);
console.log(`  di quelli, con ore:       ${conOre.length}`);
console.log(
  `  agganciati per titleId:   ${agganciati.length}  (${percento(agganciati.length, giocati.length)} dei giocati)`,
);
for (const title of giocati.slice(0, 8)) {
  const trovato = titleIdInLibreria.has(title.titleId.toUpperCase());
  console.log(
    `    ${title.titleId.padEnd(13)} ${(title.playtimeMinutes ?? 0).toString().padStart(6)} min  ${trovato ? '✓' : '·'} ${title.name}`,
  );
}
if (giocati.length > 0 && agganciati.length === 0) {
  console.log(
    '  ← nessun aggancio: la libreria e i giocati non condividono il titleId,\n' +
      '    quindi le ore costerebbero un match per titolo. Da decidere.',
  );
}

if (irrisolti.length > 0) {
  console.log(`\n  da sistemare a mano (${irrisolti.length}):`);
  for (const entry of irrisolti.slice(0, 40)) {
    console.log(`    ${entry.externalId.padEnd(14)} ${entry.name}`);
  }
}

console.log();

process.exit(0);
