// Liste di valori condivise fra lo schema Drizzle e i client.
//
// Stanno qui e non in `packages/db` per un motivo di confine: `apps/mobile` non
// può importare `packages/db` (ci finirebbe dentro il driver Postgres), ma ha
// bisogno di sapere quali stati esistono per disegnare la UI. Questo file è dato
// puro, zero dipendenze, importabile da chiunque.
//
// `packages/db` le importa per costruire i pgEnum, così i valori restano scritti
// una volta sola: se si aggiunge uno stato qui, la migration lo vede.

export const backlogStatusValues = [
  'backlog',
  'playing',
  'played',
  'dropped',
  'excluded',
] as const;

export const storeValues = [
  'steam',
  'gog',
  'epic',
  'ea',
  'battlenet',
  'amazon',
  'psn',
  'xbox',
  'nintendo',
] as const;

// I negozi che si possono collegare **oggi**, in ordine di comparsa.
//
// Sottoinsieme di `storeValues`, che è invece l'elenco dei posti da cui un gioco
// può provenire — compresi quelli che l'utente scrive a mano su un possesso e
// quelli che non si collegheranno mai (Ubisoft e Battle.net leggono un file del
// client installato, non una API).
//
// Sta nel vocabolario e non solo nel router perché è la UI ad averne bisogno:
// `/account` disegna una scheda per ciascuno, e senza questa lista dovrebbe
// tenersene una sua che si scorderebbe di aggiornare.
export const linkableStoreValues = [
  'steam',
  'gog',
  'epic',
  'amazon',
  'psn',
] as const;

// Lo stato del collegamento a un negozio (step 9).
//
// Esiste perché dal 9a il credenziale è un token che scade e si rinnova da sé,
// e il rinnovo può fallire per sempre — password cambiata, accesso revocato,
// refresh token invalidato dal negozio. Quando succede **non fallisce il job,
// fallisce l'utente**: nessun reimport lo rimette a posto, e l'unica via
// d'uscita è che rifaccia il gesto del collegamento. Senza questo campo
// `/account` mostrerebbe un account collegato che smette e basta di
// aggiornarsi, il che è il modo peggiore di rompersi.
//
// `unlinked` è l'account che l'utente ha scollegato **tenendosi i giochi**. La
// riga sopravvive senza credenziali per una ragione sola: i possessi puntano a
// lei, e cancellarla vorrebbe dire che il backlog smette di sapere da quale dei
// due account Amazon veniva un gioco — che è esattamente il buco per cui gli
// account sono diventati più d'uno. Chi sceglie di cancellare i giochi invece
// non ha più niente da ricordare, e lì la riga sparisce davvero.
//
// Steam resta sempre `ok`: non ha credenziali che scadano.
export const storeAccountStatusValues = [
  'ok',
  'needs_reauth',
  'unlinked',
] as const;

// Gli abbonamenti da cui può arrivare il diritto di giocare a un gioco.
//
// Nasce col 9b, perché PSN è il primo negozio in cui la distinzione si vede: su
// una libreria vera **274 voci su 336 vengono da PS Plus** e 62 sono acquisti.
// Sony le manda nello stesso elenco e le marca, e buttare via quella marcatura
// vorrebbe dire non sapere più — fra sei mesi, o il giorno che l'abbonamento
// scade — quali di quei giochi erano davvero tuoi.
//
// Sta su `ownerships` e non su `backlog` per la stessa ragione delle ore: è una
// proprietà di **quella copia**. Lo stesso gioco comprato su Steam non diventa
// «da abbonamento» perché su PS5 ce l'hai col Plus. Nullo = comprato, che è il
// caso normale e non merita un valore.
//
// Cosa farne quando l'abbonamento finisce è lo **step 14**, non qui: questa
// colonna è ciò che rende quello step possibile, non la sua risposta.
//
// Un avvertimento misurato: il campo di Sony vale `PS_PLUS` sia per il gioco
// mensile riscattato — che resta tuo finché sei abbonato — sia per il catalogo
// Extra/Premium, che tuo non è mai stato. **Quella distinzione l'API non la
// fa**, e nessun valore qui può inventarla.
export const subscriptionValues = ['ps_plus'] as const;

// Le fonti di un voto della critica. Sottoinsieme delle fonti di dati: HLTB e
// SteamGridDB non danno voti.
//
// L'ordine qui è quello del tipo Postgres e **non** è una precedenza: cambiarlo
// vorrebbe dire ricreare l'enum nel database. Quale voto vince quando ce n'è
// più d'uno lo decide `CRITIC_PRECEDENCE` in
// `apps/api/src/services/scores.ts`, che è una lista sua proprio per non legare
// una scelta di prodotto alla forma di un tipo SQL.
export const scoreSourceValues = ['igdb', 'opencritic', 'metacritic'] as const;

// Tipi di attributo IGDB: generi, temi, modalita di gioco, prospettive.
export const attributeKindValues = [
  'genre',
  'theme',
  'game_mode',
  'player_perspective',
] as const;

// Tag e categorie personali dell'utente. Sono due tipi della stessa cosa — una
// parola che l'utente attacca a un gioco suo — e per questo stanno in una
// tabella sola distinta da `kind`, come `igdb_attributes` fa con generi e temi.
//
// La distinzione è d'uso, non di forma: la categoria raggruppa ("GDR lunghi"),
// il tag qualifica ("quando sono stanco"). Tenerle separate serve allo step 7,
// dove filtrare per categoria e filtrare per tag sono due gesti diversi.
export const userTagKindValues = ['tag', 'category'] as const;

// Le chiavi di ordinamento del backlog (step 7). Stanno nel vocabolario e non
// solo nello schema Zod perché il client deve poterle enumerare per costruire la
// tendina, e perché i parser dell'URL vogliono la lista, non il tipo.
export const backlogSortValues = [
  'addedAt',
  'name',
  'released',
  'duration',
  'rating',
  'criticRating',
  'lastPlayed',
] as const;

export const sortDirectionValues = ['asc', 'desc'] as const;

export type BacklogStatus = (typeof backlogStatusValues)[number];
export type UserTagKind = (typeof userTagKindValues)[number];
export type AttributeKind = (typeof attributeKindValues)[number];
export type Store = (typeof storeValues)[number];
export type LinkableStore = (typeof linkableStoreValues)[number];
export type StoreAccountStatus = (typeof storeAccountStatusValues)[number];
export type ScoreSource = (typeof scoreSourceValues)[number];
export type Subscription = (typeof subscriptionValues)[number];
