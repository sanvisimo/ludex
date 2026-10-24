/**
 * Su quali piattaforme di IGDB si gioca una copia (9b PSN).
 *
 * Serve a una domanda sola: «IGDB dà questo gioco sulla console della copia?».
 * Se no, il collegamento è quasi certamente sbagliato: _Harry Potter:
 * Campioni di Quidditch_ su PS5 agganciato all'_Harry Potter_ del 2001, che su
 * PS5 non è mai uscito. Vedi `plans/9b-psn-nomi-tagliati.md`.
 *
 * La piattaforma della copia non cambia: cambia solo cosa conta come «sì».
 *
 * - **Il visore è una piattaforma a sé, per IGDB.** _Moss_ è «PlayStation VR»
 *   e non «PlayStation 4», anche se si gioca su una PS4: senza, ogni gioco VR
 *   sarebbe un falso allarme.
 * - **Il PC sono quattro piattaforme, più il VR.** I negozi PC non dicono la
 *   piattaforma della voce, e la copia è sempre Windows; ma IGDB mette molti
 *   classici della GOG solo su DOS (_Pools of Darkness_ gira con DOSBox), e
 *   qualche gioco solo su Mac o Linux.
 * - **Le console Xbox fanno girare le precedenti** (9e). Un gioco Xbox One
 *   giocato su Series ha la copia `xbox_series`, e IGDB lo dà solo su «Xbox
 *   One»: senza, finirebbe fra i «da sistemare». La Series vale anche per One,
 *   360 e la prima Xbox; la One per 360 e prima Xbox.
 * - **La Switch 2 fa girare i giochi Switch.** _Zelda: Breath of the Wild –
 *   Nintendo Switch 2 Edition_, tolta la coda, è il gioco del 2017, che IGDB
 *   dà su Switch e Wii U: senza, la copia Switch 2 andrebbe fra gli scarti.
 */

const PC = [
  6, // Windows
  13, // DOS
  3, // Linux
  14, // Mac
  163, // SteamVR
  162, // Oculus VR
];

/** Oltre alla sua, le piattaforme IGDB che valgono per una copia. */
const ANCHE: Record<string, number[]> = {
  sony_playstation4: [165], // PlayStation VR
  sony_playstation5: [390], // PlayStation VR2
  pc_windows: PC,
  xbox_series: [49, 12, 11], // Xbox One, Xbox 360, Xbox
  xbox_one: [12, 11], // Xbox 360, Xbox
  nintendo_switch2: [130], // Nintendo Switch
};

/**
 * Le piattaforme IGDB su cui si gioca una copia di `platformSlug`.
 *
 * `slugByIgdbId` è la tabella `platforms` girata, da id IGDB a nostro slug: è
 * lei a dire che `sony_playstation4` è il 48. Si passa e non si legge qui, così
 * la funzione resta pura e chi la chiama in un ciclo legge la tabella una volta.
 */
export function igdbPlatformsOfCopy(
  platformSlug: string,
  slugByIgdbId: Map<number, string>,
): Set<number> {
  const ids = new Set(ANCHE[platformSlug] ?? []);
  for (const [igdbId, slug] of slugByIgdbId) {
    if (slug === platformSlug) ids.add(igdbId);
  }
  return ids;
}

/**
 * IGDB dà il gioco sulla piattaforma della copia?
 *
 * Un gioco di cui IGDB non dice nessuna piattaforma **non è una smentita**: si
 * risponde sì. Un dato che manca non è un dato contrario, e scartare per un
 * buco di IGDB butterebbe giochi giusti.
 */
export function playsOn(
  gamePlatformIds: number[],
  platformSlug: string,
  slugByIgdbId: Map<number, string>,
): boolean {
  if (gamePlatformIds.length === 0) return true;
  const valide = igdbPlatformsOfCopy(platformSlug, slugByIgdbId);
  return gamePlatformIds.some((id) => valide.has(id));
}
