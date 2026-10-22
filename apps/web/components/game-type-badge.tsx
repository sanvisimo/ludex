import type { GameType } from '@repo/contracts';
import { Badge, type BadgeProps } from '@repo/ui';

import { BadgeLink } from '@/components/badge-link';
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
 *
 * Con `href` è un link (la pagina del gioco, verso `/backlog` filtrato per tipo).
 */
export function GameTypeBadge({
  type,
  href,
  ...props
}: { type: GameType | null; href?: string } & Omit<
  BadgeProps,
  'children' | 'render' | 'onPress'
>) {
  const labels = useGameTypeLabels();
  if (type === null || type === 'main_game') return null;
  return href ? (
    <BadgeLink variant="secondary" href={href} {...props}>
      {labels[type]}
    </BadgeLink>
  ) : (
    <Badge variant="secondary" {...props}>
      {labels[type]}
    </Badge>
  );
}
