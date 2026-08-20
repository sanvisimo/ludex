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
