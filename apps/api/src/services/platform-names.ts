/**
 * I nomi delle piattaforme IGDB che la tabella `platforms` non ha: è presa da
 * Playnite, che i telefoni e il browser non li emula. Sono le più frequenti
 * fra le smentite (_Monument Valley 2+_ solo iOS); le altre restano col numero.
 */
const FUORI_TABELLA: Record<number, string> = {
  34: 'Android',
  39: 'iOS',
  55: 'Mobile',
  82: 'Web browser',
};

/**
 * Il nome da mostrare per un id di piattaforma IGDB: il nostro, dalla tabella
 * `platforms`; poi quelli fuori tabella; poi l'id com'è, che è comunque
 * un'informazione. Una traduzione sola, così la lista delle piattaforme
 * sbagliate e i risultati della ricerca IGDB dicono le stesse parole.
 *
 * Le righe di `platforms` si passano e non si leggono qui: chi le ha già lette
 * non le rilegge, e la funzione resta pura.
 */
export function igdbPlatformNamer(
  piattaforme: { igdbId: number | null; name: string }[],
): (igdbId: number) => string {
  const nomeByIgdbId = new Map(
    piattaforme.flatMap((p) => (p.igdbId ? [[p.igdbId, p.name] as const] : [])),
  );
  return (igdbId) =>
    nomeByIgdbId.get(igdbId) ?? FUORI_TABELLA[igdbId] ?? `IGDB ${igdbId}`;
}
