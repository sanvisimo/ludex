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
export type ScoreSource = (typeof scoreSourceValues)[number];
