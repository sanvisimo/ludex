import {
  integer,
  pgTable,
  real,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { scoreSource } from './data-source';
import { games } from './games';
import { platforms } from './platforms';
import { timestamps } from './timestamps';

/**
 * I voti della critica, una riga per (gioco, fonte, piattaforma).
 *
 * Non sono colonne su `games` come le durate HLTB, e la ragione è un dato:
 * **il voto Metacritic dipende dalla piattaforma**, e il numero che pubblicano
 * come "voto del gioco" è quello della piattaforma capofila, non una media.
 *
 *     mafia   titolo 66   PC 88 (27 rec.)   Xbox 66 (33 rec., capofila)
 *
 * Il gioco che hai su PC vale 88 e il numero di testa dice 66. Una colonna sola
 * su `games` — che è condivisa fra tutti gli utenti e non sa su cosa giochi —
 * avrebbe dovuto scegliere quale delle due bugie raccontare.
 *
 * `platformSlug` nullo è quindi un valore vero e non un buco: è **il punteggio
 * complessivo del gioco**. OpenCritic produce solo quello (il loro
 * `topCriticScore` è uno per gioco, non per piattaforma), IGDB pure; Metacritic
 * scrive quella riga più una per ciascuna piattaforma che sappiamo mappare.
 *
 * Le colonne sono l'unione di quello che danno le tre fonti, non
 * l'intersezione: `tier` e `percentRecommended` esistono solo su OpenCritic, i
 * tre conteggi e `sentiment` solo su Metacritic, e restano nulli sulle altre
 * righe. Tenere solo ciò che hanno in comune avrebbe buttato via il segnale più
 * utile che c'è qui — "il 97% dei critici lo consiglia" dice una cosa che "vale
 * 89" non dice, e allo step 12 pesa.
 */
export const gameScores = pgTable(
  'game_scores',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    source: scoreSource('source').notNull(),
    /** Nullo = il punteggio complessivo del gioco. Vedi il commento sopra. */
    platformSlug: text('platform_slug').references(() => platforms.slug),

    // --- quello che danno tutte e tre ---
    //
    // `score` è notNull perché una riga senza punteggio non è un'informazione:
    // Metacritic elenca fra le piattaforme anche quelle uscite senza recensioni
    // (Hollow Knight su Wii U, PS5, Switch 2), e quelle non si scrivono.
    score: real('score').notNull(),
    reviewCount: integer('review_count'),

    // --- solo OpenCritic ---
    /** La mediana, che con `score` (media dei top critic) non sempre coincide. */
    medianScore: real('median_score'),
    /** Quanti critici lo consigliano, in percentuale. */
    percentRecommended: real('percent_recommended'),
    /** "Mighty", "Strong", "Fair", "Weak": il loro vocabolario, non il nostro. */
    tier: text('tier'),

    // --- solo Metacritic ---
    // I tre conteggi grezzi invece di una percentuale calcolata da noi: la
    // percentuale si ricava, i conteggi no. Stessa regola dei conteggi HLTB.
    positiveCount: integer('positive_count'),
    neutralCount: integer('neutral_count'),
    negativeCount: integer('negative_count'),
    /** "Universal acclaim", "Generally favorable"… vocabolario loro. */
    sentiment: text('sentiment'),

    ...timestamps,
  },
  (table) => [
    // `nullsNotDistinct` è obbligatorio, non rifinitura: senza, Postgres
    // considera due NULL diversi fra loro e lo stesso gioco potrebbe accumulare
    // infinite righe "punteggio complessivo" della stessa fonte, che è
    // esattamente ciò che l'upsert dell'enrichment deve poter sovrascrivere.
    unique('game_scores_game_source_platform_key')
      .on(table.gameId, table.source, table.platformSlug)
      .nullsNotDistinct(),
  ],
);
