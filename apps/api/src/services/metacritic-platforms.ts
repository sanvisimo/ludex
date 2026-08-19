/**
 * Le piattaforme di Metacritic tradotte nelle nostre.
 *
 * Serve perché il voto Metacritic è **per piattaforma**, e per scrivere quelle
 * righe bisogna dire di quale piattaforma si parla nel vocabolario nostro — che
 * è la tabella `platforms`, 96 voci prese da Playnite e riconciliate con IGDB.
 *
 * È una tabella scritta a mano e non una riconciliazione automatica perché il
 * vocabolario di Metacritic è **chiuso e piccolo**: una ventina di voci, che si
 * muovono quando esce una console. Indovinarle per somiglianza di nome
 * costerebbe più di scriverle, e sbaglierebbe proprio dove conta.
 *
 * Due cose che questa mappa dice e che non sono simmetriche:
 *
 * - **`pc` è una voce sola per loro e tre per noi** (Windows, DOS, Linux). Va a
 *   Windows, che è ciò che intendono: Metacritic recensisce giochi usciti su
 *   Windows, non port DOS.
 * - **iOS e Meta Quest non hanno un nostro slug**, e non è un buco da tappare:
 *   la nostra lista è quella delle piattaforme che si possono possedere in
 *   libreria. Quelle righe di voto si saltano, e chi le salta lo dice.
 */
const MAP: Record<string, string> = {
  pc: 'pc_windows',

  playstation: 'sony_playstation',
  'playstation-2': 'sony_playstation2',
  'playstation-3': 'sony_playstation3',
  'playstation-4': 'sony_playstation4',
  'playstation-5': 'sony_playstation5',
  'playstation-vita': 'sony_vita',
  psp: 'sony_psp',

  xbox: 'xbox',
  'xbox-360': 'xbox360',
  'xbox-one': 'xbox_one',
  'xbox-series-x': 'xbox_series',

  'nintendo-64': 'nintendo_64',
  gamecube: 'nintendo_gamecube',
  wii: 'nintendo_wii',
  'wii-u': 'nintendo_wiiu',
  'nintendo-switch': 'nintendo_switch',
  'nintendo-switch-2': 'nintendo_switch2',
  ds: 'nintendo_ds',
  '3ds': 'nintendo_3ds',
  'game-boy-advance': 'nintendo_gameboyadvance',

  dreamcast: 'sega_dreamcast',
};

/** Il nostro slug per una piattaforma Metacritic, o null se non ne abbiamo uno. */
export function toPlatformSlug(metacriticSlug: string): string | null {
  return MAP[metacriticSlug] ?? null;
}
