import type { HomeBand, HomeGame } from '@repo/contracts';
import {
  COVER_CARD_SMALL_WIDTH,
  COVER_CARD_WIDTH,
  CornerLabel,
  CoverCard,
  RankLabel,
  Text,
  XStack,
} from '@repo/ui';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { CriticValue } from '@/components/entry-score';
import { GameCover } from '@/components/game-cover';
import { GameDuration } from '@/components/game-duration';
import { GameTitleLink } from '@/components/game-title-link';
import { ScrollRow } from '@/components/scroll-row';
import { statusIcons } from '@/components/status-icon';
import { WishlistHeart } from '@/components/wishlist-heart';
import { useStatusLabels } from '@/lib/labels';

/**
 * I pezzi della home (12e), sul wireframe approvato in
 * `plans/12e-home.excalidraw`: fasce di card che scorrono di lato.
 */

/** Le fasce privilegiano la copertina; sotto `$sm` ne restano visibili due. */
export const CARD_WIDTH = COVER_CARD_WIDTH;
export const SMALL_CARD_WIDTH = COVER_CARD_SMALL_WIDTH;

/**
 * Una card: la copertina con lo stato in alto a sinistra — solo se il gioco
 * è tuo; sotto il titolo su due righe, anno, durata e voto della critica.
 * Copertina e titolo sono il link alla pagina del gioco.
 *
 * Larga `CARD_WIDTH` nelle fasce; con `fill` riempie la cella di una griglia,
 * come nei risultati della ricerca (12f).
 */
export function HomeCard({
  game,
  fill = false,
  showWishlist = true,
  rank,
  footer,
}: {
  game: HomeGame;
  fill?: boolean;
  /**
   * Il posto nella playlist aperta (15f), da 1: in basso a sinistra sulla
   * copertina, dove il cuore sta a destra.
   */
  rank?: number;
  /**
   * Il cuore della wishlist. Si spegne dove i giochi sono già tutti in lista
   * (la lista aperta, le fasce di `/wishlist`): lì il cuore sarebbe sempre pieno.
   */
  showWishlist?: boolean;
  footer?: ReactNode;
}) {
  const statusLabels = useStatusLabels();
  const tCurated = useTranslations('curated');

  // A blocco: un `<a>` è in riga, e attorno a un'immagine lascia lo spazio
  // della linea di testo sotto la copertina.
  const linkStyle = {
    color: 'inherit',
    textDecoration: 'none',
    display: 'block',
  } as const;

  return (
    <CoverCard
      fill={fill}
      cover={
        <Link
          to="/games/$slug"
          params={{ slug: game.slug }}
          style={linkStyle}
          // Il titolo qui sotto è già il link per la tastiera e i lettori di
          // schermo; la copertina serve al mouse e al dito.
          tabIndex={-1}
          aria-hidden
        >
          <GameCover
            imageId={game.coverImageId}
            name={game.name}
            size="cover_big"
            width={COVER_CARD_WIDTH}
            fill
            rounded={0}
          />
          {game.status && (
            <CornerLabel
              floating
              icon={statusIcons[game.status]}
              maxW={'calc(100% - 16px)' as never}
            >
              {statusLabels[game.status]}
            </CornerLabel>
          )}
        </Link>
      }
      overlay={
        <>
          {rank !== undefined && (
            <RankLabel
              rank={rank}
              label={tCurated('rank', { position: rank })}
            />
          )}
          {showWishlist && <WishlistHeart game={game} />}
        </>
      }
      title={<GameTitleLink game={game} lines={2} />}
      meta={
        <>
          <XStack flexWrap="wrap" items="center" gap={8} flex={1} minW={0}>
            {game.firstReleaseDate && (
              <Text fontSize={12} lineHeight="20px" color="color11">
                {game.firstReleaseDate.getFullYear()}
              </Text>
            )}
            <GameDuration game={game} short variant="card" />
          </XStack>
          <CriticValue
            score={game.criticScore}
            source={game.criticScoreSource}
            badge
          />
        </>
      }
      footer={footer}
    />
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
          fontFamily="heading"
          fontSize={18}
          lineHeight="24px"
          fontWeight="600"
          color="color12"
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
