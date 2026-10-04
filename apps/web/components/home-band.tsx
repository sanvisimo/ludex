import type { HomeBand, HomeGame } from '@repo/contracts';
import { CornerLabel, Text, XStack, YStack } from '@repo/ui';
import { Link } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { CriticValue } from '@/components/entry-score';
import { GameCover } from '@/components/game-cover';
import { GameDuration } from '@/components/game-duration';
import { ScrollRow } from '@/components/scroll-row';
import { statusIcons } from '@/components/status-icon';
import { useStatusLabels } from '@/lib/labels';

/**
 * I pezzi della home (12e), sul wireframe approvato in
 * `plans/12e-home.excalidraw`: fasce di card che scorrono di lato.
 */

/** Larga uguale ovunque: sul telefono ne stanno due e mezza, e la mezza dice che la fila continua. */
export const CARD_WIDTH = 136;

/**
 * Una card: la copertina con lo stato in alto a sinistra — solo se il gioco
 * è tuo — e il voto in alto a destra; sotto il titolo, e anno e durata. Tutta
 * la card è il link alla pagina del gioco.
 *
 * Larga `CARD_WIDTH` nelle fasce; con `fill` riempie la cella di una griglia,
 * come nei risultati della ricerca (12f).
 */
export function HomeCard({
  game,
  fill = false,
}: {
  game: HomeGame;
  fill?: boolean;
}) {
  const statusLabels = useStatusLabels();

  return (
    <Link
      to="/games/$slug"
      params={{ slug: game.slug }}
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      <YStack width={fill ? '100%' : CARD_WIDTH} gap={6}>
        <YStack position="relative" overflow="hidden" rounded={6}>
          <GameCover
            imageId={game.coverImageId}
            name={game.name}
            size="cover_big"
            width={CARD_WIDTH}
            fill={fill}
          />
          {game.status && (
            <CornerLabel
              icon={statusIcons[game.status]}
              // Lo spazio per il voto a destra, che è largo al più così.
              maxW={fill ? ('calc(100% - 44px)' as never) : CARD_WIDTH - 44}
            >
              {statusLabels[game.status]}
            </CornerLabel>
          )}
          {game.criticScore !== null && (
            // Il fondo della pagina e non l'accento: su una copertina deve
            // distinguersi dallo stato, e il numero si legge su qualunque
            // immagine. Stessa misura e stessi raggi di `CornerLabel`,
            // specchiati.
            <XStack
              position="absolute"
              t={0}
              r={0}
              height={20}
              px={6}
              items="center"
              bg="$background"
              borderBottomLeftRadius={6}
            >
              <CriticValue
                score={game.criticScore}
                source={game.criticScoreSource}
                compact
              />
            </XStack>
          )}
        </YStack>
        <Text fontSize={14} lineHeight={20} color="$color12" numberOfLines={2}>
          {game.name}
        </Text>
        <XStack flexWrap="wrap" items="center" columnGap={8}>
          {game.firstReleaseDate && (
            <Text fontSize={14} lineHeight={20} color="$color11">
              {game.firstReleaseDate.getFullYear()}
            </Text>
          )}
          <GameDuration game={game} short />
        </XStack>
      </YStack>
    </Link>
  );
}

export function HomeBandRow({ band }: { band: HomeBand }) {
  const t = useTranslations('home');
  const title = band.kind === 'genre' ? band.genre!.name : t(band.kind);

  return (
    <ScrollRow
      title={
        <Text
          render="h2"
          fontFamily="$heading"
          fontSize={18}
          lineHeight={24}
          fontWeight="600"
          color="$color12"
          m={0}
        >
          {title}
        </Text>
      }
      itemCount={band.games.length}
      arrowsFromMd
    >
      {band.games.map((game) => (
        <HomeCard key={game.id} game={game} />
      ))}
    </ScrollRow>
  );
}
