/**
 * La data nel tag dell'import da CSV (10): «Importato il 19/10/2026»,
 * «Imported on 2026-10-19». In italiano come la si scrive; nelle altre lingue
 * in ISO, che non si confonde fra giorno e mese. L'ora è quella di chi carica:
 * il tag è il giorno in cui l'ha fatto lui.
 *
 * Il nome lo compone il client e il server lo prende com'è, e da lì è un tag
 * come gli altri: cambiare questa funzione non rinomina quelli già creati.
 */
export function importTagDate(date: Date, locale: string): string {
  const aaaa = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const gg = String(date.getDate()).padStart(2, '0');
  return locale.startsWith('it')
    ? `${gg}/${mm}/${aaaa}`
    : `${aaaa}-${mm}-${gg}`;
}
