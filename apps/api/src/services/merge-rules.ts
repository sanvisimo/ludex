import type { BacklogStatus } from '@repo/contracts/vocabulary';

// Le regole della fusione di due giochi (11b), senza database: ciò che si
// decide quando lo stesso utente ha **entrambe** le righe di backlog. Stanno a
// parte perché sono le cose che si discutono, e si testano da sole.

/** Quanto è avanti uno stato: il più alto vince. `excluded` sta sopra a tutto. */
const STATUS_RANK: Record<BacklogStatus, number> = {
  backlog: 0,
  dropped: 1,
  playing: 2,
  played: 3,
  completed: 4,
  excluded: 5,
};

/**
 * `excluded` se una delle due lo è: è un giudizio esplicito dell'utente, e una
 * fusione non deve farlo sparire in silenzio — riportarlo a `backlog` è un
 * clic, il contrario è un giudizio perso. Altrimenti il più avanzato:
 * `completed > played > playing > dropped > backlog`.
 */
export function mergeStatus(a: BacklogStatus, b: BacklogStatus): BacklogStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

type Row = { createdAt: Date; updatedAt: Date };

/**
 * Se ce n'è uno solo, quello. Se sono due, quello della riga modificata per
 * ultima: è l'opinione più recente. A parità vince `a`.
 */
export function mergeRating(
  a: Row & { rating: number | null },
  b: Row & { rating: number | null },
): number | null {
  if (a.rating === null) return b.rating;
  if (b.rating === null) return a.rating;
  return b.updatedAt > a.updatedAt ? b.rating : a.rating;
}

/**
 * Le note sono l'unico testo dell'utente: si concatenano, la più vecchia per
 * prima, separate da una riga vuota. Se sono uguali ne resta una.
 */
export function mergeNotes(
  a: Row & { notes: string | null },
  b: Row & { notes: string | null },
): string | null {
  const [prima, dopo] = a.createdAt <= b.createdAt ? [a, b] : [b, a];
  const testi = [prima.notes, dopo.notes].filter(
    (testo): testo is string => testo !== null && testo.trim() !== '',
  );
  if (testi.length === 0) return a.notes ?? b.notes;
  if (testi.length === 2 && testi[0]!.trim() === testi[1]!.trim())
    return testi[0]!;
  return testi.join('\n\n');
}

/** Nascosto solo se lo sono entrambe: basta una a dire che lo vuole vedere. */
export function mergeHiddenAt(a: Date | null, b: Date | null): Date | null {
  return a === null || b === null ? null : a < b ? a : b;
}

/** Il più vecchio: il gioco è entrato nella libreria la prima volta. */
export function mergeAddedAt(a: Date, b: Date): Date {
  return a < b ? a : b;
}

/**
 * Quale dei due giochi sopravvive: quello con `igdbId`; se nessuno, il più
 * vecchio. Se **entrambi** ce l'hanno sono due giochi IGDB distinti e non si
 * fondono — chi chiama lo rifiuta.
 */
export function pickSurvivor<
  T extends { igdbId: number | null; createdAt: Date },
>(a: T, b: T): { survivor: T; absorbed: T } | null {
  if (a.igdbId !== null && b.igdbId !== null) return null;
  if (a.igdbId !== null) return { survivor: a, absorbed: b };
  if (b.igdbId !== null) return { survivor: b, absorbed: a };
  return a.createdAt <= b.createdAt
    ? { survivor: a, absorbed: b }
    : { survivor: b, absorbed: a };
}
