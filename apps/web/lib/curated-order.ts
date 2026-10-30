/**
 * L'ordine di una playlist aperta (15f), dalla parte del web: lo spostamento che
 * la pagina mostra subito, prima che il server risponda, e il numero di «Sposta
 * alla posizione…». Il server riscrive comunque tutta la lista (`moveGame`):
 * qui si indovina soltanto ciò che farà.
 */

/**
 * Sposta la card `from` al posto `to` dentro la pagina. I posti della pagina
 * restano quelli (`position` è nella lista intera): cambia chi ci sta. Rende la
 * pagina nuova e il posto, nella lista intera, a cui il server deve portare il
 * gioco.
 */
export function reorderPage<T extends { position: number }>(
  games: readonly T[],
  from: number,
  to: number,
): { games: T[]; target: number } | null {
  if (from === to || !games[from] || !games[to]) return null;
  const slots = games.map((game) => game.position);
  const moved = [...games];
  const [game] = moved.splice(from, 1);
  moved.splice(to, 0, game!);
  return {
    games: moved.map((row, index) => ({ ...row, position: slots[index]! })),
    target: slots[to]!,
  };
}

/**
 * Il posto scritto in «Sposta alla posizione…», da 1 come lo legge chi lo
 * scrive, nel posto da 0 del server. `null` se non è un intero fra 1 e `total`.
 */
export function parsePosition(text: string, total: number): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 && value <= total ? value - 1 : null;
}
