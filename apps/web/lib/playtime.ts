import type { Ownership } from '@repo/contracts';

/**
 * Le ore giocate da mostrare nel backlog: quelle della copia giocata più di
 * recente.
 *
 * Le ore stanno sui possessi, una copia per negozio, e il gioco ne può avere
 * più d'una. Una card ha posto per un numero solo: si prende la copia con
 * l'ultima partita più recente, fra quelle che hanno ore. Senza date, quella con
 * più ore. Tutte le copie, con le loro date, stanno nella scheda del gioco.
 *
 * Zero ore e «non lo so» (le ore di un inserimento a mano sono `null`) non si
 * mostrano: una riga «0 h» direbbe una cosa che nessuno ha misurato.
 */
export function latestPlaytime(
  ownerships: Pick<Ownership, 'playtimeMinutes' | 'lastPlayedAt'>[],
) {
  let best: { minutes: number; at: number } | null = null;
  for (const ownership of ownerships) {
    const minutes = ownership.playtimeMinutes ?? 0;
    if (minutes <= 0) continue;
    // Senza data vale meno di qualunque data, e fra due senza data decidono le ore.
    const at = ownership.lastPlayedAt?.getTime() ?? -Infinity;
    if (
      best === null ||
      at > best.at ||
      (at === best.at && minutes > best.minutes)
    )
      best = { minutes, at };
  }
  return best?.minutes ?? null;
}
