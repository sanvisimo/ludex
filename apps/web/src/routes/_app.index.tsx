import { Card, CardContent, Skeleton, Text, XStack, YStack } from '@repo/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { CARD_WIDTH, HomeBandRow } from '@/components/home-band';
import { api } from '@/lib/orpc';
import { Page } from '@/src/components/page';

// La home (12e): il catalogo a fasce, uguale per tutti. Da loggati le card
// dei giochi che hai portano lo stato; nient'altro cambia. Volutamente
// anonima: non dice chi ha aggiunto cosa, solo che esiste.
export const Route = createFileRoute('/_app/')({ component: HomePage });

function HomePage() {
  const t = useTranslations('catalog');
  const { data, isPending, error } = useQuery(api.games.home.queryOptions());

  return (
    // Larga come il backlog: le fasce vivono di card, e su uno schermo largo
    // se ne vedono di più.
    <Page title={t('title')} subtitle={t('subtitle')} maxW={1280}>
      {error ? (
        <Text fontSize={14} color="$red11">
          {t('error')}
        </Text>
      ) : isPending ? (
        <YStack gap={24}>
          {Array.from({ length: 3 }).map((_, band) => (
            <YStack key={band} gap={8}>
              <Skeleton height={24} width={160} rounded={6} />
              <XStack gap={12} overflow="hidden">
                {Array.from({ length: 8 }).map((_, card) => (
                  <Skeleton
                    key={card}
                    width={CARD_WIDTH}
                    height={(CARD_WIDTH * 374) / 264}
                    rounded={6}
                  />
                ))}
              </XStack>
            </YStack>
          ))}
        </YStack>
      ) : data.length === 0 ? (
        <Card>
          <CardContent>
            <Text color="$color11">{t('empty')}</Text>
          </CardContent>
        </Card>
      ) : (
        <YStack gap={24}>
          {data.map((band) => (
            <HomeBandRow
              key={
                band.kind === 'genre' ? `genre-${band.genre!.id}` : band.kind
              }
              band={band}
            />
          ))}
        </YStack>
      )}
    </Page>
  );
}
