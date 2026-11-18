import {
  SearchField,
  SearchFieldItem,
  SearchFieldMessage,
  Text,
  YStack,
} from '@repo/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { GameCover } from '@/components/game-cover';
import { api } from '@/lib/orpc';
import { useDebouncedValue } from '@/lib/use-debounced-value';

// Invio senza selezione apre il primo risultato perché l’admin non ha una pagina dei risultati.
export function CatalogFinder() {
  const t = useTranslations('admin.games');
  const tSearch = useTranslations('search');
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim(), 300);

  const found = useQuery({
    ...api.games.find.queryOptions({ input: { q, limit: 8 } }),
    enabled: q.length >= 2,
  });
  const games =
    q.length >= 2 && q === text.trim() ? (found.data?.games ?? []) : [];

  const open = (slug: string) => {
    setText('');
    void navigate({ to: '/admin/games/$slug', params: { slug } });
  };

  return (
    <YStack width={320} maxW="100%" gap={4}>
      <Text fontSize={12} lineHeight="16px" fontWeight="600" color="color11">
        {t('findLabel')}
      </Text>
      <SearchField
        aria-label={t('findLabel')}
        placeholder={t('find')}
        clearLabel={tSearch('clear')}
        value={text}
        onValueChange={setText}
        options={games.map((game) => game.slug)}
        onSelect={open}
        onSubmit={() => {
          if (games[0]) open(games[0].slug);
        }}
        minLength={2}
      >
        {games.map((game) => (
          <SearchFieldItem key={game.id} value={game.slug}>
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
          </SearchFieldItem>
        ))}
        {games.length === 0 && (
          <SearchFieldMessage>
            {q !== text.trim() || found.isPending
              ? tSearch('searching')
              : t('findEmpty')}
          </SearchFieldMessage>
        )}
      </SearchField>
    </YStack>
  );
}
