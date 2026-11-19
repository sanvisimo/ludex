import type { GamePrice, HomeGame } from '@repo/contracts';
import { BrandIcon, brandTitle, Tooltip } from '@repo/ui';
import { ArrowUpRight } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'use-intl';

import { api } from '@/lib/orpc';

import './card-price.css';

export function useCardPrices(games: HomeGame[]) {
  const gameIds = games.filter((game) => !game.status).map((game) => game.id);
  const { data } = useQuery({
    ...api.games.prices.queryOptions({ input: { gameIds } }),
    enabled: gameIds.length > 0,
  });
  return (game: HomeGame) => (
    <CardPrice price={game.status ? null : (data?.[game.id] ?? null)} />
  );
}

function CardPrice({ price }: { price: GamePrice | null }) {
  const t = useTranslations('game');
  const format = useFormatter();
  if (!price) return <div className="wishlist-price-slot" aria-hidden="true" />;

  const { current } = price;
  const priceText = current
    ? current.amount === 0
      ? t('itadFree')
      : format.number(current.amount, {
          style: 'currency',
          currency: current.currency,
        })
    : t('itadPriceUnavailable');
  const hint = [
    current
      ? t('itadOffer', { price: priceText, shop: current.shop })
      : priceText,
    current?.historicalLow ? t('itadHistoricalLow') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const label = `${hint} — ${t('openOn', { name: brandTitle('itad') })}`;

  return (
    <div className="wishlist-price-slot">
      <Tooltip content={label}>
        <a
          className="wishlist-price"
          href={price.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
        >
          <span className="wishlist-price-line">
            <span
              className={
                current ? 'wishlist-price-amount' : 'wishlist-price-shop'
              }
            >
              {priceText}
            </span>
            {current?.historicalLow && (
              <span className="wishlist-price-minimum">
                <span className="wishlist-price-minimum-full">
                  {t('itadHistoricalLow')}
                </span>
                <span className="wishlist-price-minimum-short">
                  {t('itadLowShort')}
                </span>
              </span>
            )}
          </span>
          <span className="wishlist-price-line wishlist-price-shop">
            <BrandIcon brand="itad" size={12} />
            <span className="wishlist-price-store">
              {current?.shop ?? 'ITAD'}
            </span>
            <ArrowUpRight size={13} aria-hidden />
          </span>
        </a>
      </Tooltip>
    </div>
  );
}
