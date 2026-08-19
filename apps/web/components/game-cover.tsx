'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';

import { igdbCoverUrl, type CoverSize } from '@/lib/igdb-image';
import { cn } from '@/lib/utils';

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
 */
export function GameCover({
  imageId,
  name,
  size = 'cover_small',
  className,
}: {
  imageId: string | null;
  name: string;
  size?: CoverSize;
  className?: string;
}) {
  const t = useTranslations('game');
  const { width, height } = DIMENSIONS[size];

  if (!imageId) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground',
          className,
        )}
        style={{ width, height }}
        aria-hidden
      >
        <span className="text-xs">—</span>
      </div>
    );
  }

  return (
    <Image
      src={igdbCoverUrl(imageId, size)}
      alt={t('coverAlt', { name })}
      width={width}
      height={height}
      className={cn('shrink-0 rounded-md object-cover', className)}
    />
  );
}
