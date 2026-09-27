import { Text, YStack } from '@repo/ui';
import { useTranslations } from 'use-intl';

import { igdbCoverUrl, type CoverSize } from '@/lib/igdb-image';

const DIMENSIONS: Record<CoverSize, { width: number; height: number }> = {
  cover_small: { width: 90, height: 128 },
  cover_big: { width: 264, height: 374 },
  '720p': { width: 1280, height: 720 },
};

/**
 * Copertina di un gioco, con il segnaposto per quando manca.
 *
 * Manca in due casi che l'utente non deve distinguere: gioco non ancora
 * arricchito, o gioco che su IGDB non ha copertina. In entrambi resta il titolo.
 *
 * `size` sceglie il file della CDN, `width` quanto è largo a schermo: la
 * vista compatta del backlog mostra un `cover_small` largo 32. Con `fill`
 * riempie la larghezza di chi la contiene, come nella griglia. L'altezza
 * segue sempre le proporzioni del file.
 */
export function GameCover({
  imageId,
  name,
  size = 'cover_small',
  width,
  fill = false,
}: {
  imageId: string | null;
  name: string;
  size?: CoverSize;
  width?: number;
  fill?: boolean;
}) {
  const t = useTranslations('game');
  const natural = DIMENSIONS[size];
  const shown = fill ? '100%' : (width ?? natural.width);
  const aspectRatio = `${natural.width} / ${natural.height}`;
  const radius = typeof shown === 'number' && shown < 48 ? 4 : 6;

  if (!imageId) {
    return (
      <YStack
        width={shown}
        aspectRatio={natural.width / natural.height}
        shrink={0}
        items="center"
        justify="center"
        rounded={radius}
        bg="$color4"
        aria-hidden
      >
        <Text fontSize={12} color="$color11">
          —
        </Text>
      </YStack>
    );
  }

  // Un `<img>` e basta: le taglie le fissa già la CDN di IGDB, e larghezza e
  // proporzioni dichiarate tengono il posto finché l'immagine non arriva.
  return (
    <img
      src={igdbCoverUrl(imageId, size)}
      alt={t('coverAlt', { name })}
      width={natural.width}
      height={natural.height}
      loading="lazy"
      decoding="async"
      style={{
        width: shown,
        height: 'auto',
        aspectRatio,
        flexShrink: 0,
        objectFit: 'cover',
        borderRadius: radius,
        display: 'block',
      }}
    />
  );
}
