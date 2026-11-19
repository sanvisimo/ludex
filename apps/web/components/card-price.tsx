import type { GamePrice, HomeGame } from '@repo/contracts';
import { Badge, BrandIcon, brandTitle, Text, Tooltip, XStack } from '@repo/ui';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'use-intl';

import { api } from '@/lib/orpc';

/**
 * I prezzi ITAD delle card di una lista, in una chiamata sola. Un gioco che hai
 * già nel backlog non ha bisogno di un prezzo, come nella pagina del gioco.
 */
export function useCardPrices(games: HomeGame[]) {
  const gameIds = games.filter((game) => !game.status).map((game) => game.id);
  const { data } = useQuery({
    ...api.games.prices.queryOptions({ input: { gameIds } }),
    enabled: gameIds.length > 0,
  });
  return (game: HomeGame) =>
    data?.[game.id] ? <CardPrice price={data[game.id]!} /> : undefined;
}

/**
 * Una riga sola e mai a capo, o le card vicine perdono l'allineamento di anno e
 * voto. Il negozio sta nel suggerimento: sul telefono, dove non compare, è a un
 * tocco, nella pagina ITAD.
 */
function CardPrice({ price }: { price: GamePrice }) {
  const t = useTranslations('game');
  const format = useFormatter();
  const name = brandTitle('itad');
  const { current } = price;

  const amount =
    current &&
    (current.amount === 0
      ? t('itadFree')
      : format.number(current.amount, {
          style: 'currency',
          currency: current.currency,
        }));
  const hint = [
    current
      ? t('itadOffer', { price: amount!, shop: current.shop })
      : t('itadNoOffer'),
    current?.historicalLow ? t('itadHistoricalLow') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const label = `${hint} — ${t('openOn', { name })}`;

  return (
    <Tooltip content={label}>
      <a
        href={price.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
      >
        <XStack
          items="center"
          gap={6}
          height={29}
          pt={8}
          borderTopWidth={1}
          borderColor="border-color"
        >
          <BrandIcon brand="itad" size={14} />
          <Text
            flex={1}
            minW={0}
            numberOfLines={1}
            fontSize={13}
            lineHeight="20px"
            fontWeight={current ? '600' : '400'}
            color={current ? 'color12' : 'color11'}
          >
            {amount ?? name}
          </Text>
          {current?.historicalLow && (
            <Badge variant="success">{t('itadLowShort')}</Badge>
          )}
        </XStack>
      </a>
    </Tooltip>
  );
}
