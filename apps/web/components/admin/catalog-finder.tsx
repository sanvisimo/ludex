import { Input, Text, XStack, YStack } from '@repo/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';

import { GameCover } from '@/components/game-cover';
import { api } from '@/lib/orpc';

/** «Apri un gioco»: la ricerca del catalogo, che porta alla scheda admin. */
export function CatalogFinder() {
  const t = useTranslations('admin.games');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const found = useQuery({
    ...api.games.find.queryOptions({ input: { q, limit: 8 } }),
    enabled: q.length >= 2,
  });

  return (
    <YStack width={320} position="relative">
      <Input
        value={text}
        onChangeText={setText}
        placeholder={t('find')}
        aria-label={t('find')}
      />
      {q.length >= 2 && found.data ? (
        <YStack
          position="absolute"
          t={40}
          l={0}
          r={0}
          z={10}
          bg="$background"
          rounded={8}
          borderWidth={1}
          borderColor="$borderColor"
          p={4}
          gap={2}
        >
          {found.data.games.length === 0 ? (
            <Text p={8} fontSize={13} color="$color11">
              {t('findEmpty')}
            </Text>
          ) : (
            found.data.games.map((game) => (
              <Link
                key={game.id}
                to="/admin/giochi/$slug"
                params={{ slug: game.slug }}
              >
                <XStack
                  items="center"
                  gap={8}
                  px={8}
                  py={4}
                  rounded={6}
                  hoverStyle={{ bg: '$color3' }}
                >
                  <GameCover
                    imageId={game.coverImageId}
                    name={game.name}
                    width={24}
                  />
                  <Text fontSize={13} numberOfLines={1} flex={1} minW={0}>
                    {game.name}
                    {game.firstReleaseDate
                      ? ` (${game.firstReleaseDate.getFullYear()})`
                      : ''}
                  </Text>
                </XStack>
              </Link>
            ))
          )}
        </YStack>
      ) : null}
    </YStack>
  );
}
