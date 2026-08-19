import { integer, pgTable, text } from 'drizzle-orm/pg-core';

import { timestamps } from './timestamps';

// Lista di riferimento presa da Playnite (source/Playnite/Emulation/Platforms.yaml),
// 96 voci, seedata dalla migration che crea la tabella. Lo slug di Playnite fa da
// chiave primaria: è stabile, leggibile, e tiene la nostra tabella confrontabile
// con la fonte se un domani la si riallinea.
//
// È una tabella e non un pgEnum perché da un enum Postgres non si possono
// togliere valori: con un centinaio di voci prese da fuori serve poter potare.
//
// `igdbId` è la mappatura verso IGDB. Arrivava dal file di Playnite preso sulla
// fiducia; la migration 0004 l'ha riconciliata contro /v4/platforms e le 78
// mappature esistenti si sono rivelate tutte corrette. L'arnese che fa il
// confronto è `pnpm --filter api platforms:audit`, da rilanciare se IGDB cambia.
//
// È `unique` perché la direzione che serve è **IGDB → noi**: dato un gioco che
// IGDB dice girare sulla piattaforma 26, quale nostro slug è? Con due righe sul
// 26 quella domanda non ha risposta.
//
// Resta nullable, e un NULL vuol dire una di due cose diverse:
//
// - IGDB non ha quella piattaforma (`tic_80`, `wasm4`, `thomson_to7`…). Sono 8.
// - IGDB non la distingue: `sinclair_zxspectrum3` è lo ZX Spectrum +3, che su
//   IGDB sta dentro il 26 insieme allo Spectrum liscio, già assegnato. Qui il
//   NULL è una scelta, non un buco da tappare — mapparlo sul 26 romperebbe
//   l'unique, ed è giusto che lo rompa.
//
// La relazione Playnite → IGDB è quindi N:1 in generale. Finora `+3` è l'unico
// caso su 96 righe, quindi non vale un modello diverso; se diventassero cinque,
// sì.
export const platforms = pgTable('platforms', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  igdbId: integer('igdb_id').unique(),
  ...timestamps,
});
