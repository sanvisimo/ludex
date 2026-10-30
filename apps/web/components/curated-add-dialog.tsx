import type { CuratedPlaylistGames, HomeGame } from '@repo/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ClearableInput,
  Spinner,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { Check, Plus } from '@repo/ui/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { GameCover } from '@/components/game-cover';
import { MIN_QUERY, useGameSearch } from '@/components/game-search';
import { useApiErrorMessage } from '@/lib/api-error';
import { useStatusLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';

/** Quanti risultati per blocco: è un dialogo, non la pagina della ricerca. */
const LIMIT = 10;

type Playlist = Pick<CuratedPlaylistGames, 'id' | 'name'>;

/**
 * «Aggiungi giochi» (15f): la ricerca della barra in alto dentro la playlist —
 * prima i tuoi giochi, poi gli altri di Ludex, poi quelli IGDB che Ludex non ha
 * ancora — e un «Aggiungi» per riga. **Resta aperto**: un top 20 si fa di fila,
 * non aprendo venti schede. Ogni gioco va in fondo, e la riga dice a che numero.
 */
export function CuratedAddDialog({
  open,
  onOpenChange,
  playlist,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlist: Playlist;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <AddForm playlist={playlist} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddForm({
  playlist,
  onDone,
}: {
  playlist: Playlist;
  onDone: () => void;
}) {
  const t = useTranslations('curated.addDialog');
  const tSearch = useTranslations('search');
  const errorMessage = useApiErrorMessage();
  const [query, setQuery] = useState('');
  // I giochi aggiunti da questo dialogo, col numero a cui sono finiti: per id
  // del gioco, o per id IGDB quelli che Ludex ancora non aveva.
  const [added, setAdded] = useState<Map<string, number>>(new Map());
  const { q, mine, local, igdb } = useGameSearch(query, {
    limit: LIMIT,
    mineLimit: LIMIT,
    igdbFillsUpTo: LIMIT,
  });
  const owned = mine.data?.games ?? [];
  const others = local.data?.games ?? [];
  const hits = igdb?.data ?? [];

  // Dove sta già, nella playlist, ciascuno dei giochi trovati.
  const ids = [...owned, ...others].map((game) => game.id);
  const positions = useQuery({
    ...api.curatedPlaylists.positions.queryOptions({
      input: { listId: playlist.id, gameIds: ids },
    }),
    enabled: ids.length > 0,
  });
  const placeOf = new Map(
    (positions.data ?? []).map((row) => [row.gameId, row.position + 1]),
  );

  const add = useMutation({
    mutationFn: async (target: {
      key: string;
      gameId?: string;
      igdbId?: number;
    }) => {
      // Un risultato IGDB diventa un gioco di Ludex solo adesso, al clic.
      const gameId =
        target.gameId ??
        (await client.games.fromIgdb({ igdbId: target.igdbId! })).id;
      return client.curatedPlaylists.add({ listId: playlist.id, gameId });
    },
    // In fondo: il suo numero è quanti giochi ha adesso la playlist.
    onSuccess: (list, target) =>
      setAdded((previous) => new Map(previous).set(target.key, list.count)),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  const action = (
    key: string,
    target: { gameId?: string; igdbId?: number },
  ) => {
    const done = added.get(key);
    if (done !== undefined)
      return <Done>{t('added', { position: done })}</Done>;
    const already = target.gameId ? placeOf.get(target.gameId) : undefined;
    if (already !== undefined)
      return <Done>{t('already', { position: already })}</Done>;
    const busy = add.isPending && add.variables?.key === key;
    return (
      <Button
        size="sm"
        disabled={busy}
        onClick={() => add.mutate({ key, ...target })}
      >
        {busy ? <Spinner /> : <Plus size={14} color="$color1" />}
        {t('add')}
      </Button>
    );
  };

  const searched = q.length >= MIN_QUERY;
  // «Nessun gioco» solo quando hanno risposto tutti quelli chiesti.
  const empty =
    searched &&
    !local.isPending &&
    !igdb?.isPending &&
    owned.length + others.length + hits.length === 0;

  return (
    <YStack gap={16}>
      <DialogHeader>
        <DialogTitle>{t('title', { name: playlist.name })}</DialogTitle>
      </DialogHeader>

      <ClearableInput
        value={query}
        onChangeText={setQuery}
        clearLabel={tSearch('clear')}
        placeholder={t('placeholder')}
        aria-label={t('placeholder')}
        autoFocus
      />

      <YStack gap={16} maxH={420} overflow="scroll">
        {!searched ? (
          <Text fontSize={13} lineHeight={18} color="$color11">
            {t('hint')}
          </Text>
        ) : empty ? (
          <Text fontSize={14} lineHeight={20} color="$color11">
            {t('none')}
          </Text>
        ) : (
          <>
            {owned.length > 0 && (
              <Group title={t('mine')}>
                {owned.map((game) => (
                  <GameRow key={game.id} game={game}>
                    {action(game.id, { gameId: game.id })}
                  </GameRow>
                ))}
              </Group>
            )}
            {others.length > 0 && (
              <Group title={t('local')}>
                {others.map((game) => (
                  <GameRow key={game.id} game={game}>
                    {action(game.id, { gameId: game.id })}
                  </GameRow>
                ))}
              </Group>
            )}
            {hits.length > 0 && (
              <Group title={t('igdb')}>
                {hits.map((hit) => (
                  <Row
                    key={hit.igdbId}
                    cover={hit.cover}
                    name={hit.name}
                    meta={
                      hit.releaseYear === null ? null : String(hit.releaseYear)
                    }
                  >
                    {action(`igdb:${hit.igdbId}`, { igdbId: hit.igdbId })}
                  </Row>
                ))}
              </Group>
            )}
          </>
        )}
      </YStack>

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          {t('done')}
        </Button>
      </DialogFooter>
    </YStack>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack gap={8}>
      <Text fontSize={13} lineHeight={18} color="$color11">
        {title}
      </Text>
      <YStack render="ul" gap={8} p={0} m={0} style={{ listStyle: 'none' }}>
        {children}
      </YStack>
    </YStack>
  );
}

function GameRow({ game, children }: { game: HomeGame; children: ReactNode }) {
  const statusLabels = useStatusLabels();
  const year = game.firstReleaseDate?.getFullYear();
  const meta = [year, game.status && statusLabels[game.status]]
    .filter(Boolean)
    .join(' · ');
  return (
    <Row cover={game.coverImageId} name={game.name} meta={meta || null}>
      {children}
    </Row>
  );
}

function Row({
  cover,
  name,
  meta,
  children,
}: {
  cover: string | null;
  name: string;
  meta: string | null;
  children: ReactNode;
}) {
  return (
    <XStack render="li" items="center" gap={12}>
      <GameCover imageId={cover} name={name} size="cover_small" width={36} />
      <YStack flex={1} minW={0}>
        <Text fontSize={14} lineHeight={20} color="$color12" numberOfLines={1}>
          {name}
        </Text>
        {meta && (
          <Text fontSize={12} lineHeight={16} color="$color11">
            {meta}
          </Text>
        )}
      </YStack>
      {children}
    </XStack>
  );
}

/** Il gioco c'è già: il suo numero al posto del bottone. */
function Done({ children }: { children: ReactNode }) {
  return (
    <XStack items="center" gap={4} px={8} height={32}>
      <Check size={14} color="$color11" />
      <Text fontSize={13} lineHeight={18} color="$color11">
        {children}
      </Text>
    </XStack>
  );
}
