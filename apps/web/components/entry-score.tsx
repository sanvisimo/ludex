import type { CardGame } from '@repo/contracts';
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
  game: Pick<CardGame, 'cardScore' | 'cardScoreSource'>;
}) {
  if (rating !== null) return <RatingValue value={rating} />;
  return <CriticValue score={game.cardScore} source={game.cardScoreSource} />;
}

/**
 * Il voto della critica, con la fonte nel nome e al passaggio del mouse
 * (`title`): senza fonte il numero non si legge, perché Metacritic e IGDB non
 * stanno sulla stessa scala. È il voto da card che sceglie il server
 * (`cardScore`): Metacritic, poi IGDB, mai OpenCritic, che vuole accanto al
 * voto il suo nome e un link, e su una card non c'è posto. Il pannello filtra
 * e ordina invece su `criticScore`, che OpenCritic lo usa.
 *
 * `title` e non il nostro `Tooltip`, che vuole un elemento che prende il
 * focus: un numero in sola lettura non deve essere una fermata del Tab, e ce
 * ne sarebbero 120 per pagina.
 *
 * `compact` è la misura dell'angolo di una copertina, quella di `CornerLabel`.
 */
export function CriticValue({
  score,
  source,
  compact = false,
}: {
  score: CardGame['cardScore'];
  source: CardGame['cardScoreSource'];
  compact?: boolean;
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
      <Award
        size={compact ? 12 : 14}
        color={compact ? '$color12' : '$color11'}
      />
      <Text
        fontSize={compact ? 11 : 14}
        lineHeight={compact ? 16 : 20}
        fontWeight={compact ? '600' : undefined}
        color={compact ? '$color12' : '$color11'}
        aria-hidden
      >
        {value}
      </Text>
    </XStack>
  );
}
