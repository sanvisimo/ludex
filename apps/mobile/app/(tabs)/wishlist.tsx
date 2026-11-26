import type { Wishlist } from '@repo/contracts';
import {
  BrandIcon,
  Button,
  EmptyState,
  ScrollView,
  Skeleton,
  YStack,
} from '@repo/ui';
import { Heart, Plus } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { Band, BandSection } from '../../components/bands';
import { GameCard } from '../../components/game-card';
import { NameSheet } from '../../components/name-sheet';
import { api, client } from '../../lib/orpc';

const BAND_SIZE = 20;

function WishlistBand({ list }: { list: Wishlist }) {
  const t = useTranslations('wishlists');
  const games = useQuery(
    api.wishlists.get.queryOptions({
      input: { id: list.id, limit: BAND_SIZE },
    }),
  );
  return (
    <Band
      title={list.name}
      count={list.count}
      icon={list.store ? <BrandIcon brand={list.store} size={20} /> : undefined}
      note={
        list.unresolved
          ? t('unresolved', { count: list.unresolved })
          : undefined
      }
      onOpen={() =>
        router.push({ pathname: '/wishlist/[id]', params: { id: list.id } })
      }
    >
      {(games.data?.games ?? []).map((game) => (
        <GameCard key={game.id} game={game} />
      ))}
    </Band>
  );
}

export default function Wishlists() {
  const t = useTranslations('wishlists');
  const queryClient = useQueryClient();
  const lists = useQuery(api.wishlists.list.queryOptions());
  const [creating, setCreating] = useState(false);
  const create = useMutation({
    mutationFn: (name: string) => client.wishlists.create({ name }),
    onSuccess: async (list) => {
      await queryClient.invalidateQueries({
        queryKey: api.wishlists.list.key(),
      });
      setCreating(false);
      router.push({ pathname: '/wishlist/[id]', params: { id: list.id } });
    },
  });

  const mine = (lists.data ?? []).filter((list) => !list.store);
  const stores = (lists.data ?? []).filter((list) => list.store);
  // Come sul sito: le due sezioni hanno un titolo solo se ci sono tutte e due.
  const both = mine.length > 0 && stores.length > 0;

  return (
    <YStack flex={1} bg="background">
      <ScrollView
        flex={1}
        contentContainerStyle={{ paddingVertical: 12, gap: 28 }}
      >
        <YStack px={16}>
          <Button onPress={() => setCreating(true)}>
            <Plus size={16} />
            {t('new')}
          </Button>
        </YStack>
        {lists.isPending ? (
          <YStack px={16} gap={12}>
            <Skeleton height={28} width="60%" />
            <Skeleton height={260} width="100%" rounded={12} />
          </YStack>
        ) : mine.length === 0 && stores.length === 0 ? (
          <EmptyState
            icon={<Heart size={24} color="color11" />}
            title={t('empty')}
            description={t('emptyHint')}
          />
        ) : (
          <>
            {mine.length > 0 ? (
              both ? (
                <BandSection title={t('mine')}>
                  {mine.map((list) => (
                    <WishlistBand key={list.id} list={list} />
                  ))}
                </BandSection>
              ) : (
                mine.map((list) => <WishlistBand key={list.id} list={list} />)
              )
            ) : null}
            {stores.length > 0 ? (
              both ? (
                <BandSection title={t('stores')}>
                  {stores.map((list) => (
                    <WishlistBand key={list.id} list={list} />
                  ))}
                </BandSection>
              ) : (
                stores.map((list) => <WishlistBand key={list.id} list={list} />)
              )
            ) : null}
          </>
        )}
      </ScrollView>
      <NameSheet
        open={creating}
        labels={{
          title: t('new'),
          placeholder: t('namePlaceholder'),
          save: t('create'),
          cancel: t('cancel'),
        }}
        pending={create.isPending}
        error={create.isError ? t('saveFailed') : null}
        onSave={(name) => create.mutate(name)}
        onClose={() => setCreating(false)}
      />
    </YStack>
  );
}
