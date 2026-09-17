/**
 * Le piattaforme di PSN tradotte nelle nostre.
 *
 * Gemella di `metacritic-platforms.ts`, e scritta a mano per la stessa ragione:
 * il vocabolario dall'altra parte è **chiuso e piccolo**, e indovinarlo per
 * somiglianza di nome costerebbe più che scriverlo.
 *
 * Ma serve a una cosa diversa, e più delicata. Lì si sceglieva a quale
 * piattaforma appendere un voto; qui si decide **su cosa l'utente possiede il
 * gioco**, che è il filtro hard del motore decisionale — «stasera ho la PS5
 * accesa». Sbagliare qui vuol dire proporgli un gioco che non può avviare.
 *
 * Per questo davanti a un valore sconosciuto non si ripiega su PS4: si rende
 * null e chi chiama lo dice. Vedi `platformFor` in `library-import.ts`, che sui
 * negozi PC alza invece di indovinare — è la stessa regola vista dall'altro
 * lato, dove la piattaforma la porta la riga e non il negozio.
 */
const MAP: Record<string, string> = {
  PS5: 'sony_playstation5',
  PS4: 'sony_playstation4',
  PS3: 'sony_playstation3',
  PS2: 'sony_playstation2',
  PS1: 'sony_playstation',
  PSONE: 'sony_playstation',
  // Sony la scrive attaccata nella libreria e staccata altrove.
  PSVITA: 'sony_vita',
  'PS VITA': 'sony_vita',
  VITA: 'sony_vita',
  PSP: 'sony_psp',
};

/** Il nostro slug per una piattaforma PSN, o null se non ne abbiamo uno. */
export function toPlatformSlug(psnPlatform: string): string | null {
  return MAP[psnPlatform.trim().toUpperCase()] ?? null;
}

/** Le `category` dell'elenco dei giocati, che non sono le piattaforme della libreria. */
const PLAYED_CATEGORY: Record<string, string> = {
  ps5_native_game: 'sony_playstation5',
  ps4_game: 'sony_playstation4',
};

/**
 * La piattaforma di un titolo **giocato**, dove Sony non scrive `PS5` ma una
 * categoria.
 *
 * Le righe più vecchie portano `unknown`, e lì decide il prefisso del
 * `titleId`. Non è un'ipotesi sul gioco ma la forma dell'identificativo: `CUSA`
 * è lo spazio dei titoli PS4 e `PPSA` quello dei PS5, e un disco PS4 avviato su
 * PS5 resta `CUSA` — che è giusto, perché è la copia PS4 quella che hai.
 * Tutto il resto rende null, con la stessa regola di `toPlatformSlug`.
 */
export function toPlayedPlatformSlug(
  category: string | null,
  titleId: string,
): string | null {
  const daCategoria = category ? PLAYED_CATEGORY[category] : undefined;
  if (daCategoria) return daCategoria;
  if (/^PPSA/i.test(titleId)) return 'sony_playstation5';
  if (/^CUSA/i.test(titleId)) return 'sony_playstation4';
  return null;
}
