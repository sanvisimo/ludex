import { db, schema } from '@repo/db';
import { asc, inArray } from '@repo/db/orm';

// I servizi contengono la logica e non sanno nulla di HTTP: sono le funzioni che
// server.ts e worker.ts importano entrambi.

export function listPlatforms() {
  return db
    .select({
      slug: schema.platforms.slug,
      name: schema.platforms.name,
      igdbId: schema.platforms.igdbId,
    })
    .from(schema.platforms)
    .orderBy(asc(schema.platforms.name));
}

/** Slug che esistono davvero, per validare un inserimento prima di scriverlo. */
export async function findExistingPlatformSlugs(slugs: string[]) {
  if (slugs.length === 0) return new Set<string>();
  const rows = await db
    .select({ slug: schema.platforms.slug })
    .from(schema.platforms)
    .where(inArray(schema.platforms.slug, slugs));
  return new Set(rows.map((row) => row.slug));
}
