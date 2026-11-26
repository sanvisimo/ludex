import type { HomeGame, Medium, Store } from '@repo/contracts';
import { mediumValues, storeValues } from '@repo/contracts';
import { Button, ScrollView, Sheet, Text, XStack, YStack } from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { api, client } from '../lib/orpc';
import { useBackToClose } from '../lib/use-back-to-close';

function Chips({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack gap={8}>
      <Text fontSize={14} fontWeight="600" color="color12">
        {title}
      </Text>
      <XStack flexWrap="wrap" gap={8}>
        {children}
      </XStack>
    </YStack>
  );
}

/**
 * «Ce l'ho»: il gioco entra nel backlog con una copia, come il dialogo del
 * sito (piattaforma, negozio, supporto). Solo scelte a chip, niente campi di
 * testo: dentro un foglio di Tamagui la tastiera di Android lo chiude. I testi
 * si calcolano qui, fuori dal foglio, dove il contesto di use-intl c'è.
 */
export function OwnItSheet({
  game,
  onClose,
}: {
  game: HomeGame | null;
  onClose: () => void;
}) {
  const t = useTranslations('ownIt');
  const tStore = useTranslations('store');
  const tMedium = useTranslations('medium');
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const options = useQuery(api.backlog.filterOptions.queryOptions());
  const all = useQuery(api.platforms.list.queryOptions());
  const [platform, setPlatform] = useState<string | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [medium, setMedium] = useState<Medium | null>(null);
  const [allPlatforms, setAllPlatforms] = useState(false);
  useBackToClose(game !== null, onClose);
  useEffect(() => {
    setPlatform(null);
    setStore(null);
    setMedium(null);
    setAllPlatforms(false);
  }, [game?.id]);

  // Prima le piattaforme che hai già; le altre a richiesta, sono più di cento.
  const platforms = allPlatforms
    ? (all.data ?? [])
    : (options.data?.platforms ?? []);
  const add = useMutation({
    mutationFn: (gameId: string) =>
      client.backlog.add({
        gameId,
        ownerships: [{ platformSlug: platform!, store, medium }],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      onClose();
    },
  });

  return (
    <Sheet
      open={game !== null}
      onOpenChange={(open) => !open && onClose()}
      label={t('title')}
    >
      <Text fontSize={18} fontWeight="700" color="color12" numberOfLines={2}>
        {t('title')} · {game?.name}
      </Text>
      <ScrollView maxH={460}>
        <YStack gap={18} pb={8}>
          <Chips title={t('platform')}>
            {platforms.map((item) => (
              <Button
                key={item.slug}
                size="sm"
                variant={platform === item.slug ? 'selection' : 'outline'}
                aria-pressed={platform === item.slug}
                onPress={() => setPlatform(item.slug)}
              >
                {item.name}
              </Button>
            ))}
            {!allPlatforms ? (
              <Button
                size="sm"
                variant="ghost"
                onPress={() => setAllPlatforms(true)}
              >
                {t('otherPlatforms')}
              </Button>
            ) : null}
          </Chips>
          <Chips title={t('store')}>
            {storeValues.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={store === value ? 'selection' : 'outline'}
                aria-pressed={store === value}
                onPress={() => setStore(store === value ? null : value)}
              >
                {tStore(value)}
              </Button>
            ))}
          </Chips>
          <Chips title={t('medium')}>
            {mediumValues.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={medium === value ? 'selection' : 'outline'}
                aria-pressed={medium === value}
                onPress={() => setMedium(medium === value ? null : value)}
              >
                {tMedium(value)}
              </Button>
            ))}
          </Chips>
        </YStack>
      </ScrollView>
      {add.isError ? (
        <Text fontSize={13} color="red11">
          {t('failed')}
        </Text>
      ) : null}
      <XStack gap={12} pt={8} pb={insets.bottom}>
        <Button variant="outline" onPress={onClose}>
          {t('cancel')}
        </Button>
        <Button
          flex={1}
          disabled={!platform || add.isPending}
          onPress={() => game && add.mutate(game.id)}
        >
          {t('confirm')}
        </Button>
      </XStack>
    </Sheet>
  );
}
