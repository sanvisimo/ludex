'use client';

import type { GameType } from '@repo/contracts';
import { Badge } from '@repo/ui';

import { useGameTypeLabels } from '@/lib/labels';

/**
 * «DLC», «Bundle», «Remaster»: che cos'è la scheda, quando non è un gioco.
 *
 * Non compare su un gioco principale né su un gioco non ancora arricchito, che
 * sono i due casi in cui non c'è niente da dire: il primo è la normalità, il
 * secondo è «non lo sappiamo» e un badge lo farebbe sembrare un'informazione.
 *
 * Serve perché un DLC agganciato per sbaglio dall'import sta in lista identico a
 * un gioco, e da fuori non c'è modo di accorgersene.
 */
export function GameTypeBadge({ type }: { type: GameType | null }) {
  const labels = useGameTypeLabels();
  if (type === null || type === 'main_game') return null;
  return <Badge variant="secondary">{labels[type]}</Badge>;
}
