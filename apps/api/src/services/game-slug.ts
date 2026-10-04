import { randomUUID } from 'node:crypto';

import { db, schema } from '@repo/db';
import { inArray } from '@repo/db/orm';

import { chunk } from '../lib/chunk';
import { isUniqueViolation } from '../lib/pg-error';

// Postgres regge 65535 parametri per istruzione: un import da qualche migliaio
// di giochi, con tre candidati l'uno, li sfonderebbe.
const READ_CHUNK = 1000;

// Abbastanza per qualunque titolo vero, e un URL che resta un URL.
const MAX_LENGTH = 80;

// Quante volte si riprova una scrittura che ha perso la corsa sullo slug. Per
// perderla due volte di fila servono tre import che creano nello stesso istante
// giochi con lo stesso nome.
const MAX_ATTEMPTS = 3;

/**
 * Il nome di un gioco come pezzo di URL: minuscole, senza accenti, parole
 * separate da trattini. «Assassin's Creed® Unity» → `assassins-creed-unity`.
 *
 * La stessa regola, in SQL, sta nella migration 0031 che ha dato lo slug ai
 * giochi che c'erano già. Non devono restare identiche: uno slug si calcola una
 * volta sola, quando il gioco nasce.
 */
export function slugify(name: string): string {
  const slug = name
    // NFD e non NFKD: NFKD fa di «™» due lettere, e «BioShock™» diventerebbe
    // `bioshocktm`.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // L'apostrofo non separa: `assassins-creed`, non `assassin-s-creed`.
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/, '');

  // Un titolo senza lettere latine (giapponese, coreano…) non ne lascia
  // nessuna: il suffisso dei doppioni lo distingue dagli altri.
  return slug || 'game';
}

export type SlugSource = {
  name: string;
  releaseYear?: number | null;
  igdbId?: number | null;
};

/**
 * Gli slug possibili, in ordine di preferenza: il nome; ai doppioni l'anno di
 * uscita (`god-of-war-2018`); se anche l'anno coincide, o manca, l'id IGDB.
 */
export function slugCandidates(game: SlugSource): string[] {
  const base = slugify(game.name);
  const candidates = [base];
  if (game.releaseYear) candidates.push(`${base}-${game.releaseYear}`);
  if (game.igdbId) candidates.push(`${base}-${game.igdbId}`);
  return candidates;
}

/**
 * Uno slug libero per ciascuno dei giochi che stanno per nascere, nello stesso
 * ordine: liberi in `games` **e** fra loro, perché un import può portare due
 * giochi omonimi nella stessa INSERT.
 *
 * Il primo arrivato tiene lo slug pulito. Quando tutti i candidati sono presi,
 * un suffisso casuale: è il gioco non risolto, che non ha un id IGDB, o un caso
 * che non si è mai visto.
 */
export async function pickSlugs(games: SlugSource[]): Promise<string[]> {
  const candidates = games.map(slugCandidates);

  const taken = new Set<string>();
  for (const page of chunk([...new Set(candidates.flat())], READ_CHUNK)) {
    const rows = await db
      .select({ slug: schema.games.slug })
      .from(schema.games)
      .where(inArray(schema.games.slug, page));
    for (const row of rows) if (row.slug) taken.add(row.slug);
  }

  return candidates.map((list) => {
    const slug =
      list.find((candidate) => !taken.has(candidate)) ??
      `${list[0]}-${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    taken.add(slug);
    return slug;
  });
}

/**
 * Riprova una scrittura che ha perso la corsa sullo slug: due import che, nello
 * stesso istante, creano due giochi diversi con lo stesso nome. Chi perde non
 * fallisce, rilegge gli slug presi e riscrive.
 *
 * La scrittura va ripetuta **per intero**, lettura degli slug compresa: per
 * questo si passa una funzione e non un valore.
 */
export async function retryOnSlugConflict<T>(
  write: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await write();
    } catch (error) {
      if (
        attempt >= MAX_ATTEMPTS ||
        !isUniqueViolation(error, 'games_slug_unique')
      )
        throw error;
    }
  }
}
