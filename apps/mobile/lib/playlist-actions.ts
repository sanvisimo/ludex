import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, Share } from 'react-native';
import { useTranslations } from 'use-intl';

import { api } from './orpc';
import { sharedPlaylistUrl } from './playlist-links';

/**
 * Condividi ed elimina, uguali per le playlist a filtro e per quelle scelte a
 * mano: cambia solo la chiamata.
 */
export function usePlaylistActions({
  name,
  share,
  remove,
}: {
  name: string;
  share: () => Promise<{ token: string }>;
  remove: () => Promise<void>;
}) {
  const t = useTranslations('playlists');
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: api.playlists.list.key() }),
      queryClient.invalidateQueries({
        queryKey: api.curatedPlaylists.list.key(),
      }),
    ]);

  const shareMutation = useMutation({
    mutationFn: share,
    onSuccess: ({ token }) =>
      Share.share({ message: `${name} · ${sharedPlaylistUrl(token)}` }),
  });
  const removeMutation = useMutation({
    mutationFn: remove,
    onSuccess: async () => {
      await refresh();
      router.back();
    },
  });

  return {
    share: () => shareMutation.mutate(),
    remove: () =>
      Alert.alert(t('removeTitle', { name }), t('removeText'), [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('remove'),
          style: 'destructive',
          onPress: () => removeMutation.mutate(),
        },
      ]),
    refresh,
  };
}
