import type { Game } from '@repo/contracts';
import { Text, XStack } from '@repo/ui';
import { Award } from '@repo/ui/icons';
import { useTranslations } from 'use-intl';

import { RatingValue } from '@/components/rating-value';

/**
 * Il voto sulla card: **il tuo se c'è, altrimenti quello della critica**, e se
 * non c'è nessuno dei due niente — nessun segno vuoto che chieda di essere
 * riempito.
 *
 * Due icone perché sono due scale: la stella è il tuo voto su 5, la coccarda
 * il voto della critica su 100. La coppa no: è del platinato.
 */
export function EntryScore({
  rating,
  game,
}: {
  rating: number | null;
  game: Pick<Game, 'criticScore' | 'criticScoreSource'>;
}) {
  if (rating !== null) return <RatingValue value={rating} />;
  return (
    <CriticValue score={game.criticScore} source={game.criticScoreSource} />
  );
}

/**
 * Il voto della critica, con la fonte nel nome e al passaggio del mouse
 * (`title`): senza fonte il numero non si legge, perché OpenCritic e
 * Metacritic non stanno sulla stessa scala. È quello scelto dal server per
 * precedenza, lo stesso su cui filtra e ordina il pannello.
 *
 * `title` e non il nostro `Tooltip`, che vuole un elemento che prende il
 * focus: un numero in sola lettura non deve essere una fermata del Tab, e ce
 * ne sarebbero 120 per pagina.
 */
function CriticValue({
  score,
  source,
}: {
  score: Game['criticScore'];
  source: Game['criticScoreSource'];
}) {
  const t = useTranslations('critic');
  if (score === null || source === null) return null;

  const value = Math.round(score);
  const label = t('scoreOf', { source: t(source), value });
  return (
    // `role="img"` come per `RatingValue`: senza, l'`aria-label` su un `div`
    // non vale.
    <XStack
      role="img"
      items="center"
      gap={4}
      aria-label={label}
      // `title` Tamagui lo passa al DOM ma non lo dichiara nei tipi.
      {...({ title: label } as object)}
    >
      <Award size={14} color="$color11" />
      <Text fontSize={14} lineHeight={20} color="$color11" aria-hidden>
        {value}
      </Text>
    </XStack>
  );
}
