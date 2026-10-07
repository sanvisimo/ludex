import type { Ownership } from '@repo/contracts';
import { Text, XStack } from '@repo/ui';
import { Clock } from '@repo/ui/icons';
import { useTranslations } from 'use-intl';

import { useDuration } from '@/lib/duration';
import { latestPlaytime } from '@/lib/playtime';

/**
 * Le ore giocate nel backlog, con l'orologio: quelle della copia giocata più di
 * recente (`latestPlaytime`). Niente data: tutte le copie, con le loro date,
 * stanno nella scheda del gioco.
 */
export function PlayedTime({
  ownerships,
}: {
  ownerships: Pick<Ownership, 'playtimeMinutes' | 'lastPlayedAt'>[];
}) {
  const t = useTranslations('backlog');
  const duration = useDuration();
  const minutes = latestPlaytime(ownerships);
  if (minutes === null) return null;

  return (
    // Un'immagine sola per un lettore di schermo: l'orologio da solo non dice
    // niente, e il numero senza l'orologio non dice cosa conta.
    <XStack
      items="center"
      gap={4}
      role="img"
      aria-label={t('playedLabel', { duration: duration(minutes) })}
    >
      <Clock size={14} color="$color11" aria-hidden />
      <Text fontSize={14} lineHeight={20} color="$color11">
        {duration(minutes)}
      </Text>
    </XStack>
  );
}
