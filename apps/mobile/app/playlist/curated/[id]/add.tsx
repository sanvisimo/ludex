import type { HomeGame } from '@repo/contracts';
import { Button, ClearableInput, Text, XStack, YStack } from '@repo/ui';
import { Check, Plus } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { FlatList } from 'react-native';
import { useTranslations } from 'use-intl';

import { Cover } from '../../../../components/backlog-card';
import { api, client } from '../../../../lib/orpc';

/**
 * Aggiungi giochi a una playlist scelta a mano: la ricerca del catalogo, prima
 * il tuo backlog e poi il resto di Ludex, come nel dialogo del sito. Resta
 * aperta per aggiungerne più d'uno.
 */
export default function AddGames() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations('playlists');
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const search = useDeferredValue(q.trim());
  const enabled = search.length >= 2;

  const mine = useQuery({
    ...api.games.find.queryOptions({
      input: { q: search, inBacklog: true, limit: 30 },
    }),
    enabled,
  });
  const others = useQuery({
    ...api.games.find.queryOptions({
      input: { q: search, inBacklog: false, limit: 30 },
    }),
    enabled,
  });
  const games: HomeGame[] = [
    ...(mine.data?.games ?? []),
    ...(others.data?.games ?? []),
  ];
  const positions = useQuery({
    ...api.curatedPlaylists.positions.queryOptions({
      input: { listId: id, gameIds: games.slice(0, 100).map((g) => g.id) },
    }),
    enabled: games.length > 0,
  });
  const placed = new Map(
    (positions.data ?? []).map((row) => [row.gameId, row.position]),
  );

  const add = useMutation({
    mutationFn: (gameId: string) =>
      client.curatedPlaylists.add({ listId: id, gameId }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: api.curatedPlaylists.positions.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: api.curatedPlaylists.get.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: api.curatedPlaylists.list.key(),
        }),
      ]),
  });

  return (
    <YStack flex={1} bg="background">
      <Stack.Screen options={{ title: t('addGames') }} />
      <YStack px={16} pt={8} pb={12}>
        <ClearableInput
          value={q}
          onChangeText={setQ}
          placeholder={t('searchCatalog')}
          clearLabel={t('clearSearch')}
          autoFocus
        />
      </YStack>
      <FlatList
        data={enabled ? games : []}
        keyExtractor={(game) => game.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 24,
          gap: 10,
        }}
        ListEmptyComponent={
          <Text color="color11">
            {enabled ? t('noResults') : t('searchHint')}
          </Text>
        }
        renderItem={({ item }) => {
          const position = placed.get(item.id);
          return (
            <XStack items="center" gap={12}>
              <Cover imageId={item.coverImageId} width={44} height={60} />
              <YStack flex={1} gap={2}>
                <Text fontWeight="600" color="color12" numberOfLines={2}>
                  {item.name}
                </Text>
                {item.firstReleaseDate ? (
                  <Text fontSize={12} color="color11">
                    {item.firstReleaseDate.getFullYear()}
                  </Text>
                ) : null}
              </YStack>
              {position !== undefined ? (
                <XStack items="center" gap={4}>
                  <Check size={16} color="color11" />
                  <Text fontSize={13} color="color11">
                    {t('alreadyAt', { position: position + 1 })}
                  </Text>
                </XStack>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={add.isPending}
                  onPress={() => add.mutate(item.id)}
                >
                  <Plus size={14} />
                  {t('add')}
                </Button>
              )}
            </XStack>
          );
        }}
      />
    </YStack>
  );
}
