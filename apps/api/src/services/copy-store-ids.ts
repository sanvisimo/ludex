/**
 * Da quale id del negozio è nata una copia.
 *
 * La copia non lo sa: gli id stanno su `external_ids`, per gioco e negozio, e
 * un gioco può averne più d'uno dello stesso negozio (su PSN la PS4, la PS5 e
 * il concept). Ma la pagina del negozio che l'import ha scritto sulla copia
 * (`ownerships.store_page`) lo contiene: `app/71163` su Steam,
 * `product/EP5360-PPSA10248_00-…` su PSN, `dragon-age/dragon-age-inquisition`
 * su EA. Vedi `plans/segnala-dettagli-copia.md`.
 *
 * La regola: l'id che compare fra i pezzi della pagina; senza, l'unico id del
 * negozio sul gioco; altrimenti sono tutti, e chi li mostra non sa quale. I
 * pezzi sono interi — separati da `/`, e anche da `-` — così `app/40990` non
 * prende l'id `4099`.
 */
export function idsOfCopy<T extends { externalId: string }>(
  storePage: string | null,
  candidates: T[],
): T[] {
  if (storePage) {
    const pezzi = new Set([
      ...storePage.split('/'),
      ...storePage.split(/[/-]/),
    ]);
    const dallaPagina = candidates.filter((c) => pezzi.has(c.externalId));
    if (dallaPagina.length === 1) return dallaPagina;
  }
  return candidates;
}
