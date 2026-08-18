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
  "backlog",
  "playing",
  "played",
  "dropped",
  "excluded",
] as const;

export const storeValues = [
  "steam",
  "gog",
  "epic",
  "ea",
  "battlenet",
  "amazon",
  "psn",
  "xbox",
  "nintendo",
] as const;

export type BacklogStatus = (typeof backlogStatusValues)[number];
export type Store = (typeof storeValues)[number];
