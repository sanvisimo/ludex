/**
 * Quanti giochi per pagina, in funzione delle colonne che si vedono.
 *
 * Con 7 colonne e 15 giochi per pagina ogni pagina finisce con una riga a metà,
 * non solo l'ultima. Quindi il numero per pagina è un multiplo delle colonne, e
 * le colonne le decide il CSS della griglia: vedi `useGridColumns`.
 */

/** Le righe che il menu offre. I giochi sono righe × colonne. */
export const pageRows = [1, 2, 5, 10, 15, 20] as const;

/** Quanti giochi chiede chi non ha scelto: si porta al multiplo più vicino. */
export const defaultPageSize = 14;

/** Il tetto del contratto (`limit` di `BacklogQuerySchema`). */
export const maxPageSize = 200;

/**
 * Le viste che non sono la griglia hanno una colonna sola, e un multiplo di uno
 * è qualunque numero: usano il passo di una griglia larga, così il menu offre gli
 * stessi numeri e chi cambia vista non trova pagine di un'altra misura.
 */
const LIST_STEP = 7;

/** Di quanto devono essere multipli i giochi per pagina. */
export const pageStep = (isGrid: boolean, columns: number) =>
  isGrid ? Math.max(1, columns) : LIST_STEP;

/** I numeri che il menu offre per quel passo. */
export const pageSizeOptions = (step: number) => pageRows.map((r) => r * step);

/**
 * Il numero richiesto, portato al multiplo del passo più vicino. Un link con
 * `size=14` aperto su uno schermo a 3 colonne chiede 15; mai meno di una riga e
 * mai più del tetto del contratto.
 */
export function snapPageSize(size: number, step: number) {
  const snapped = Math.round(size / step) * step;
  return Math.min(
    Math.max(step, snapped),
    Math.floor(maxPageSize / step) * step,
  );
}

/**
 * La pagina che tiene in vista il primo gioco di quella in cui si era, dopo che
 * il numero per pagina è cambiato da solo (le colonne sono cambiate perché la
 * finestra è cambiata). Senza, la pagina 3 da 14 e la pagina 3 da 15 non
 * mostrano gli stessi giochi.
 */
export function reanchorPage(page: number, oldSize: number, newSize: number) {
  return Math.floor(((page - 1) * oldSize) / newSize) + 1;
}
