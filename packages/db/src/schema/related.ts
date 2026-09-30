import { relatedKindValues } from '@repo/contracts/vocabulary';
import {
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { games } from './games';
import { timestamps } from './timestamps';

export const relatedKind = pgEnum('related_kind', relatedKindValues);

// I giochi legati a questo secondo IGDB: remake, remaster e simili.
//
// Una tabella e non un array su `games`, perché il gioco legato **può non
// essere in `games`**: la riga tiene il suo `igdbId` con nome e copertina, e
// basta quello per mostrarlo. Se un giorno quel gioco entra in `games` — lo
// importa qualcuno, o lo aggiunge la wishlist dello step 15 — la JOIN su
// `igdbId` lo trova da sola, e con lui il link alla sua pagina e il «ce l'hai»
// di chi guarda. Per questo niente FK verso `games` su `igdbId`: una FK verso
// una riga che può non esserci impedirebbe di scrivere questa.
//
// Popolare `games` con i giochi legati è stato scartato: una decina di simili
// per gioco sono migliaia di righe che nessuno possiede, ciascuna col suo
// enrichment e il budget OpenCritic che si porta via, e una riga di `games`
// non si cancella.
//
// L'enrichment IGDB la riscrive intera a ogni giro, come gli attributi.
export const gameRelated = pgTable(
  'game_related',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    kind: relatedKind('kind').notNull(),
    igdbId: integer('igdb_id').notNull(),
    name: text('name').notNull(),
    coverImageId: text('cover_image_id'),
    // L'ordine in cui IGDB li elenca, che per i simili è quello che dà lui.
    position: integer('position').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.kind, table.igdbId] }),
  ],
);
