import type { HomeGame, IgdbSearchHit } from '@repo/contracts';
import {
  SearchField,
  SearchFieldGroup,
  SearchFieldItem,
  SearchFieldMessage,
  Text,
  YStack,
  toast,
} from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { GameCover } from '@/components/game-cover';
import { api, client } from '@/lib/orpc';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useSession } from '@/src/use-session';

/**
 * La ricerca globale (12f): prima i giochi di Ludex, poi — solo da loggati —
 * quelli IGDB che Ludex non ha ancora. Qui i pezzi che servono alla tendina
 * nella barra e alla pagina `/cerca`.
 */

/** Da quanti caratteri si cerca: sotto, il server rifiuta la richiesta. */
export const MIN_QUERY = 2;

/** Quanti giochi per gruppo nella tendina: il resto sta nella pagina. */
const DROPDOWN_LIMIT = 5;

/**
 * Il ritardo sulla scrittura. IGDB regge quattro richieste al secondo per
 * tutto il server: una per tasto la consumerebbe chi scrive veloce.
 */
const DEBOUNCE_MS = 300;

/**
 * Le due metà della ricerca, per lo stesso testo. IGDB parte solo da loggati,
 * perché consuma il rate limit delle nostre credenziali.
 *
 * `delay: 0` per un testo che arriva già ritardato, come quello della pagina,
 * che lo legge dall'URL.
 */
export function useGameSearch(
  query: string,
  {
    limit,
    offset = 0,
    delay = DEBOUNCE_MS,
  }: { limit: number; offset?: number; delay?: number },
) {
  const { data: session } = useSession();
  const debounced = useDebouncedValue(query.trim(), delay);
  const q = delay === 0 ? query.trim() : debounced;
  const enabled = q.length >= MIN_QUERY;

  const local = useQuery({
    ...api.games.find.queryOptions({ input: { q, limit, offset } }),
    enabled,
  });
  const igdb = useQuery({
    ...api.games.findOnIgdb.queryOptions({ input: { query: q } }),
    enabled: enabled && !!session,
  });

  return {
    q,
    // Il testo scritto e quello cercato non coincidono per i 300 ms del
    // ritardo: in quel tempo i risultati sono quelli di prima.
    settled: q === query.trim(),
    local,
    igdb: session ? igdb : null,
  };
}

/**
 * Apre un risultato IGDB: la riga in `games` nasce qui, al clic, e non mentre
 * si cerca. `fromIgdb` la riusa se c'è già, o la crea e accoda l'enrichment.
 */
export function useOpenIgdbHit() {
  const t = useTranslations('search');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (igdbId: number) => client.games.fromIgdb({ igdbId }),
    onSuccess: async (game) => {
      // Da adesso il gioco è di Ludex: una nuova ricerca lo trova lì.
      void queryClient.invalidateQueries({ queryKey: api.games.key() });
      await navigate({ to: '/games/$slug', params: { slug: game.slug } });
    },
    onError: () => toast.error(t('openFailed')),
  });
}

/** Copertina piccola, titolo e anno: una voce della tendina. */
function ResultRow({
  cover,
  name,
  year,
}: {
  cover: string | null;
  name: string;
  year: number | null;
}) {
  return (
    <>
      <GameCover imageId={cover} name={name} size="cover_small" width={28} />
      <YStack flex={1} minW={0}>
        <Text fontSize={14} lineHeight={20} color="$color12" numberOfLines={1}>
          {name}
        </Text>
        {year !== null && (
          <Text fontSize={12} lineHeight={16} color="$color11">
            {year}
          </Text>
        )}
      </YStack>
    </>
  );
}

const yearOf = (game: HomeGame) => game.firstReleaseDate?.getFullYear() ?? null;

/**
 * Il campo nella barra, con la tendina. Invio senza aver scelto una voce, o
 * l'ultima voce, porta alla pagina con tutti i risultati.
 */
export function GameSearchBox() {
  const t = useTranslations('search');
  const navigate = useNavigate();
  const openIgdb = useOpenIgdbHit();
  const [query, setQuery] = useState('');
  const { q, settled, local, igdb } = useGameSearch(query, {
    limit: DROPDOWN_LIMIT,
  });

  const games = local.data?.games ?? [];
  const hits = (igdb?.data ?? []).slice(0, DROPDOWN_LIMIT);
  const options = [
    ...games.map((game) => `game:${game.slug}`),
    ...hits.map((hit) => `igdb:${hit.igdbId}`),
    'all',
  ];

  const goToResults = (value: string) => {
    setQuery('');
    void navigate({ to: '/cerca', search: { q: value } });
  };

  const onSelect = (option: string) => {
    if (option === 'all') return goToResults(query.trim());
    const [kind, key] = option.split(':') as [string, string];
    setQuery('');
    if (kind === 'game')
      void navigate({ to: '/games/$slug', params: { slug: key } });
    else openIgdb.mutate(Number(key));
  };

  const loading =
    !settled || local.isPending || (igdb !== null && igdb.isPending);
  const empty = games.length === 0 && hits.length === 0;

  return (
    <SearchField
      aria-label={t('placeholder')}
      placeholder={t('placeholder')}
      clearLabel={t('clear')}
      value={query}
      onValueChange={setQuery}
      options={options}
      onSelect={onSelect}
      onSubmit={goToResults}
      minLength={MIN_QUERY}
    >
      {games.length > 0 && (
        <SearchFieldGroup label={t('inLudex')}>
          {games.map((game) => (
            <SearchFieldItem key={game.id} value={`game:${game.slug}`}>
              <ResultRow
                cover={game.coverImageId}
                name={game.name}
                year={yearOf(game)}
              />
            </SearchFieldItem>
          ))}
        </SearchFieldGroup>
      )}
      {hits.length > 0 && (
        <SearchFieldGroup label={t('onIgdb')}>
          {hits.map((hit) => (
            <SearchFieldItem key={hit.igdbId} value={`igdb:${hit.igdbId}`}>
              <ResultRow
                cover={hit.cover}
                name={hit.name}
                year={hit.releaseYear}
              />
            </SearchFieldItem>
          ))}
        </SearchFieldGroup>
      )}
      {empty && (
        <SearchFieldMessage>
          {loading ? t('searching') : t('noResults')}
        </SearchFieldMessage>
      )}
      <SearchFieldItem value="all">
        <Text flex={1} fontSize={14} lineHeight={20} color="$accent11">
          {t('allResults', { query: q || query.trim() })}
        </Text>
      </SearchFieldItem>
    </SearchField>
  );
}

/**
 * Un risultato IGDB nella griglia della pagina: copertina, titolo e anno,
 * come la card della home ma senza stato né voto, che un gioco non ancora in
 * Ludex non ha. È un bottone e non un link: prima di aprirlo, la riga in
 * `games` va creata.
 */
export function IgdbCard({
  hit,
  onOpen,
  disabled,
}: {
  hit: IgdbSearchHit;
  onOpen: () => void;
  disabled: boolean;
}) {
  return (
    <YStack
      render="button"
      width="100%"
      gap={6}
      p={0}
      bg="transparent"
      borderWidth={0}
      items="stretch"
      cursor="pointer"
      opacity={disabled ? 0.6 : 1}
      focusVisibleStyle={{
        outlineColor: '$outlineColor',
        outlineStyle: 'solid',
        outlineWidth: 2,
        rounded: 6,
      }}
      {...({ type: 'button', disabled } as object)}
      onPress={onOpen}
    >
      <GameCover imageId={hit.cover} name={hit.name} size="cover_big" fill />
      <Text
        fontSize={14}
        lineHeight={20}
        color="$color12"
        numberOfLines={2}
        text="left"
      >
        {hit.name}
      </Text>
      {hit.releaseYear !== null && (
        <Text fontSize={14} lineHeight={20} color="$color11" text="left">
          {hit.releaseYear}
        </Text>
      )}
    </YStack>
  );
}
