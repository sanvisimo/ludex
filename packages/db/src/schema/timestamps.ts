import { timestamp } from "drizzle-orm/pg-core";

// Colonne di servizio da spargere su tutte le tabelle di dominio, con lo stesso
// pattern che @better-auth/cli genera in auth.ts.
//
// Attenzione: `$onUpdate` lo applica Drizzle in JS al momento della update, non
// è un trigger del database. Le scritture che non passano dal query builder
// (SQL a mano, Drizzle Studio, una ON CONFLICT DO UPDATE grezza) lasciano
// `updatedAt` fermo. Vale soprattutto per i worker BullMQ dello step 3.
export const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};
