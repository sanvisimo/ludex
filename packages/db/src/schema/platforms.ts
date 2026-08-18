import { integer, pgTable, text } from "drizzle-orm/pg-core";

import { timestamps } from "./timestamps";

// Lista di riferimento presa da Playnite (source/Playnite/Emulation/Platforms.yaml),
// 96 voci, seedata dalla migration che crea la tabella. Lo slug di Playnite fa da
// chiave primaria: è stabile, leggibile, e tiene la nostra tabella confrontabile
// con la fonte se un domani la si riallinea.
//
// È una tabella e non un pgEnum perché da un enum Postgres non si possono
// togliere valori: con un centinaio di voci prese da fuori serve poter potare.
//
// `igdbId` arriva dallo stesso file ed è la mappatura già pronta verso IGDB per
// l'enrichment dello step 3. È nullable per due motivi: 17 piattaforme non ce
// l'hanno in Playnite, e `vectrex` è seedata senza perché Playnite le assegna il
// 67, che però risulta già su `mattel_intellivision`. Uno dei due è sbagliato e
// non lo si può stabilire senza credenziali IGDB: si corregge allo step 3.
export const platforms = pgTable("platforms", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  igdbId: integer("igdb_id").unique(),
  ...timestamps,
});
