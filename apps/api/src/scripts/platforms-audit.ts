import "../env";

import { db, schema } from "@repo/db";
import { asc } from "@repo/db/orm";

import { fetchIgdbPlatforms, type IgdbPlatform } from "../external/igdb";

// Confronta la nostra tabella `platforms` (seedata da Playnite) con l'elenco vero
// di IGDB.
//
//   pnpm --filter api platforms:audit [--all]
//
// **Non scrive nulla.** Segnala, e le correzioni finiscono in una migration
// scritta a mano: se le scrivesse questo script, la mappatura non sarebbe
// riproducibile — chi clona il repo e fa `db:migrate` si ritroverebbe i dati
// sbagliati del seed 0002.
//
// L'abbinamento non è automatico di proposito. Su un centinaio di righe
// un'euristica sui nomi ("GCE Vectrex" contro "Vectrex", "Mattel Intellivision"
// contro "Intellivision") sbaglia più di quanto azzecchi, e sbaglia in silenzio.
// Qui si calcola solo una somiglianza per ordinare i candidati: chi decide legge.

const showAll = process.argv.includes("--all");

function tokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function normal(value: string) {
  return tokens(value).join(" ");
}

/**
 * Le tre risposte possibili su una mappatura già presente:
 *
 * - `=` i nomi coincidono a meno di punteggiatura e maiuscole
 * - `~` uno contiene l'altro: è il caso del prefisso del produttore, benigno
 * - `?` non si assomigliano: da guardare a mano, può essere un id sbagliato
 */
function verdict(ourName: string, igdbName: string): "=" | "~" | "?" {
  const a = normal(ourName);
  const b = normal(igdbName);
  if (a === b) return "=";
  if (a.includes(b) || b.includes(a)) return "~";
  return "?";
}

/** Quanti token in comune, sul totale di quelli del nome più corto. */
function similarity(ourName: string, candidate: IgdbPlatform) {
  const ours = tokens(ourName);
  // Anche il nome alternativo e la sigla: IGDB chiama "Family Computer" quello
  // che Playnite chiama "NES", e il ponte fra i due sta lì.
  const theirs = tokens(
    [candidate.name, candidate.alternativeName, candidate.abbreviation]
      .filter(Boolean)
      .join(" "),
  );

  const shared = ours.filter((token) => theirs.includes(token)).length;
  if (shared === 0) return 0;
  return shared / Math.min(ours.length, new Set(theirs).size);
}

const [ours, igdb] = await Promise.all([
  db
    .select({
      slug: schema.platforms.slug,
      name: schema.platforms.name,
      igdbId: schema.platforms.igdbId,
    })
    .from(schema.platforms)
    .orderBy(asc(schema.platforms.slug)),
  fetchIgdbPlatforms(),
]);

const igdbById = new Map(igdb.map((platform) => [platform.igdbId, platform]));

const mapped = ours.filter((row) => row.igdbId !== null);
const holes = ours.filter((row) => row.igdbId === null);

// Lo stesso id IGDB su due nostre righe: una delle due è sbagliata per forza.
// È il caso noto del 67 fra `vectrex` e `mattel_intellivision`.
const usage = new Map<number, string[]>();
for (const row of mapped) {
  const slugs = usage.get(row.igdbId!) ?? [];
  slugs.push(row.slug);
  usage.set(row.igdbId!, slugs);
}
const duplicates = [...usage.entries()].filter(([, slugs]) => slugs.length > 1);

const unknownIds = mapped.filter((row) => !igdbById.has(row.igdbId!));
const suspect = mapped.filter((row) => {
  const platform = igdbById.get(row.igdbId!);
  return platform && verdict(row.name, platform.name) === "?";
});

const line = (parts: string[], widths: number[]) =>
  parts.map((part, index) => part.padEnd(widths[index] ?? 0)).join("  ");

console.log(`\nIGDB conosce ${igdb.length} piattaforme. Noi ne abbiamo ${ours.length}.`);
console.log(`  mappate:               ${mapped.length}`);
console.log(`  senza igdb_id:         ${holes.length}`);
console.log(`  id duplicati fra noi:  ${duplicates.length}`);
console.log(`  id inesistenti su IGDB:${unknownIds.length}`);
console.log(`  nomi che non tornano:  ${suspect.length}`);

if (duplicates.length > 0) {
  console.log("\n=== id IGDB usato da più righe nostre ===");
  for (const [igdbId, slugs] of duplicates) {
    const platform = igdbById.get(igdbId);
    console.log(`  ${igdbId} = ${platform?.name ?? "(non esiste su IGDB)"}`);
    for (const slug of slugs) {
      const row = ours.find((candidate) => candidate.slug === slug)!;
      console.log(`      ${slug.padEnd(24)} ${row.name}`);
    }
  }
}

if (unknownIds.length > 0) {
  console.log("\n=== id che IGDB non conosce ===");
  for (const row of unknownIds) {
    console.log(line([row.slug, row.name, `-> ${row.igdbId}`], [24, 34]));
  }
}

if (suspect.length > 0) {
  console.log("\n=== nomi che non si assomigliano: id da verificare ===");
  for (const row of suspect) {
    const platform = igdbById.get(row.igdbId!)!;
    console.log(line([row.slug, row.name, `-> ${row.igdbId}`, platform.name], [24, 34, 8]));
  }
}

if (holes.length > 0) {
  console.log("\n=== senza igdb_id: candidati per somiglianza ===");
  for (const row of holes) {
    console.log(`\n  ${row.slug}  (${row.name})`);

    const candidates = igdb
      .map((platform) => ({ platform, score: similarity(row.name, platform) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (candidates.length === 0) {
      console.log("      nessun candidato: probabilmente IGDB non la ha");
      continue;
    }

    for (const { platform, score } of candidates) {
      const alias = platform.alternativeName ? ` (alias: ${platform.alternativeName})` : "";
      console.log(
        `      ${score.toFixed(2)}  ${String(platform.igdbId).padEnd(5)} ${platform.name}${alias}`,
      );
    }
  }
}

if (showAll) {
  console.log("\n=== tutte le mappature ===");
  for (const row of mapped) {
    const platform = igdbById.get(row.igdbId!);
    console.log(
      line(
        [
          platform ? verdict(row.name, platform.name) : "!",
          row.slug,
          row.name,
          `-> ${row.igdbId}`,
          platform?.name ?? "(inesistente)",
        ],
        [1, 24, 34, 8],
      ),
    );
  }

  const used = new Set(mapped.map((row) => row.igdbId));
  const unused = igdb.filter((platform) => !used.has(platform.igdbId));
  console.log(`\n=== piattaforme IGDB che non usiamo (${unused.length}) ===`);
  for (const platform of unused) {
    console.log(line([String(platform.igdbId), platform.name, platform.slug], [6, 40]));
  }
}

console.log();
process.exit(0);
