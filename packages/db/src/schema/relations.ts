import { relations } from "drizzle-orm";

import { gameAttributes, igdbAttributes } from "./attributes";
import { backlog, ownerships } from "./backlog";
import { externalIds, games } from "./games";
import { platforms } from "./platforms";
import { gameSources } from "./sources";
import { user } from "./auth";

// Le relations stanno in un file a parte per non far importare backlog.ts a
// games.ts e viceversa: sono definizioni ORM, non toccano le migration.
// Nota: non si aggiunge il lato `user → backlog` perché auth.ts è generato e
// verrebbe sovrascritto da `pnpm auth:generate`. Il lato `one` qui sotto basta
// per le query che ci servono.

export const gamesRelations = relations(games, ({ many }) => ({
  externalIds: many(externalIds),
  backlogEntries: many(backlog),
  attributes: many(gameAttributes),
  sources: many(gameSources),
}));

export const igdbAttributesRelations = relations(igdbAttributes, ({ many }) => ({
  games: many(gameAttributes),
}));

export const gameAttributesRelations = relations(gameAttributes, ({ one }) => ({
  game: one(games, { fields: [gameAttributes.gameId], references: [games.id] }),
  attribute: one(igdbAttributes, {
    fields: [gameAttributes.attributeId],
    references: [igdbAttributes.id],
  }),
}));

export const gameSourcesRelations = relations(gameSources, ({ one }) => ({
  game: one(games, { fields: [gameSources.gameId], references: [games.id] }),
}));

export const externalIdsRelations = relations(externalIds, ({ one }) => ({
  game: one(games, { fields: [externalIds.gameId], references: [games.id] }),
}));

export const backlogRelations = relations(backlog, ({ one, many }) => ({
  user: one(user, { fields: [backlog.userId], references: [user.id] }),
  game: one(games, { fields: [backlog.gameId], references: [games.id] }),
  ownerships: many(ownerships),
}));

export const ownershipsRelations = relations(ownerships, ({ one }) => ({
  entry: one(backlog, { fields: [ownerships.backlogId], references: [backlog.id] }),
  platform: one(platforms, { fields: [ownerships.platformSlug], references: [platforms.slug] }),
}));

export const platformsRelations = relations(platforms, ({ many }) => ({
  ownerships: many(ownerships),
}));
