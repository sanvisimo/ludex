import type { HomeGame, WishlistSort } from '@repo/contracts';
import { wishlistSortValues } from '@repo/contracts';
import {
  Button,
  EmptyState,
  Pagination,
  Skeleton,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { ChevronLeft, Heart, SearchX } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslations } from 'use-intl';

import { AddGameDialog } from '@/components/add-game-dialog';
import {
  GRID_TEMPLATE,
  GridProbe,
  useGridColumns,
  useReanchorPage,
} from '@/components/grid-columns';
import { CARD_WIDTH, HomeCard } from '@/components/home-band';
import { SearchInput, SortSelect } from '@/components/list-controls';
import { PageSizeSelect } from '@/components/page-size-select';
import { WishlistMenu } from '@/components/wishlist-menu';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-error';
import {
  validateWishlistSearch,
  type WishlistSearch,
} from '@/lib/backlog-filter';
import { api, client } from '@/lib/orpc';
import {
  defaultPageSize,
  pageSizeOptions,
  snapPageSize,
} from '@/lib/page-size';
import { ButtonLink } from '@/src/components/button-link';
import { Page } from '@/src/components/page';
import { takeLinkClick } from '@/src/link-click';

export const Route = createFileRoute('/_app/_private/wishlist/$id')({
  // La pagina, quanti per pagina, la ricerca e l'ordine: tutto nell'URL, come i
  // filtri del backlog. Il default è l'ultimo aggiunto per primo.
  validateSearch: validateWishlistSearch,
  component: WishlistPage,
});

const DEFAULT_SORT: WishlistSort = 'addedAt';

/**
 * Una lista aperta (step 15b): i giochi in griglia, con ricerca sul titolo,
 * ordine, e per ogni card «Ce l'ho» e «Togli». Niente pannello dei filtri, nel
 * primo giro.
 */
function WishlistPage() {
  const t = useTranslations('wishlist');
  const tBacklog = useTranslations('backlog');
  const router = useRouter();
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // Un multiplo delle colonne che si vedono, come in `/backlog`.
  const grid = useGridColumns();
  const step = grid.columns ?? 1;
  const sizeOptions = pageSizeOptions(step);
  const size = snapPageSize(search.size ?? defaultPageSize, step);
  const sizeKnown = grid.columns !== null;
  const page = search.page ?? 1;

  const sort = search.sort ?? DEFAULT_SORT;
  const direction = search.direction ?? 'desc';

  const list = useQuery({
    ...api.wishlists.get.queryOptions({
      input: {
        id,
        q: search.q,
        sort,
        direction,
        limit: size,
        offset: (page - 1) * size,
      },
    }),
    enabled: sizeKnown,
    // La pagina di prima resta a schermo mentre arriva la nuova, ma solo di
    // questa lista.
    placeholderData: (previous) => (previous?.id === id ? previous : undefined),
  });

  const data = list.data;
  const games = data?.games ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / size);

  const paging = (patch: Partial<WishlistSearch>) =>
    validateWishlistSearch({ ...search, ...patch });
  // Ricerca e ordine cambiano l'insieme: si torna alla prima pagina, senza
  // lasciare una voce nella cronologia a ogni tasto.
  const refine = (patch: Pick<WishlistSearch, 'q' | 'sort' | 'direction'>) =>
    void navigate({
      search: () => paging({ ...patch, page: undefined }),
      replace: true,
    });
  const goToPage = (next: number) =>
    void navigate({ search: () => paging({ page: next }) });
  const pageHref = (next: number) =>
    router.buildLocation({
      to: '/wishlist/$id',
      params: { id },
      search: paging({ page: next }),
    }).href;

  useReanchorPage({
    size,
    ready: sizeKnown,
    page,
    onChange: (next) =>
      void navigate({ search: () => paging({ page: next }), replace: true }),
  });

  // Come in `/backlog`: una pagina oltre l'ultima torna alla prima.
  const outOfRange =
    data !== undefined &&
    !list.isPlaceholderData &&
    games.length === 0 &&
    page > 1;
  useEffect(() => {
    if (outOfRange) void navigate({ search: () => paging({ page: 1 }) });
    // `paging` si ricrea a ogni render e non cambia ciò che fa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outOfRange, navigate]);

  const back = (
    <Link
      to="/wishlist"
      style={{
        color: 'inherit',
        textDecoration: 'none',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      <XStack items="center" gap={2}>
        <ChevronLeft size={14} color="$color11" />
        <Text fontSize={13} lineHeight={18} color="$color11">
          {t('back')}
        </Text>
      </XStack>
    </Link>
  );

  if (list.error) {
    return (
      <Page eyebrow={back} title={t('title')}>
        {hasErrorCode(list.error, 'NOT_FOUND') ? (
          <EmptyState
            icon={<Heart size={24} color="$color11" />}
            title={t('notFoundTitle')}
            description={t('notFoundHint')}
            action={<ButtonLink href="/wishlist">{t('back')}</ButtonLink>}
          />
        ) : (
          <Text fontSize={14} color="$red11">
            {t('loadFailed')}
          </Text>
        )}
      </Page>
    );
  }

  return (
    <Page
      maxW={1280}
      eyebrow={back}
      title={data?.name ?? ' '}
      subtitle={data ? tBacklog('count', { count: total }) : ' '}
      actions={
        data && (
          <WishlistMenu
            list={data}
            onDeleted={() => void navigate({ to: '/wishlist' })}
          />
        )
      }
    >
      {data && (
        // Una riga, che sul telefono va a capo: ricerca e ordine.
        <XStack items="center" flexWrap="wrap" gap={8}>
          <YStack flex={1} minW={140} maxW={320}>
            <SearchInput
              value={search.q ?? ''}
              onChange={(q) => refine({ q: q || undefined })}
            />
          </YStack>
          <YStack width={220}>
            <SortSelect
              keys={wishlistSortValues}
              sort={sort}
              direction={direction}
              onSortChange={(next) =>
                // Quello di default non si scrive nell'URL.
                refine({
                  sort:
                    next === DEFAULT_SORT ? undefined : (next as WishlistSort),
                })
              }
              onDirectionChange={(next) =>
                refine({ direction: next === 'desc' ? undefined : next })
              }
            />
          </YStack>
        </XStack>
      )}

      <YStack gap={16} position="relative">
        <GridProbe probeRef={grid.ref} />
        {list.isPending ? (
          <Cards>
            {Array.from({ length: 12 }).map((_, index) => (
              <Skeleton
                key={index}
                width="100%"
                height={(CARD_WIDTH * 374) / 264}
                rounded={6}
              />
            ))}
          </Cards>
        ) : data && games.length === 0 ? (
          <EmptyState
            icon={
              search.q ? (
                <SearchX size={24} color="$color11" />
              ) : (
                <Heart size={24} color="$color11" />
              )
            }
            title={search.q ? t('emptySearchTitle') : t('emptyList')}
            description={search.q ? undefined : t('emptyListHint')}
          />
        ) : (
          data && (
            <>
              <Cards>
                {games.map((game) => (
                  <WishlistCard key={game.id} game={game} listId={id} />
                ))}
              </Cards>
              <XStack
                flexWrap="wrap"
                items="center"
                justify="center"
                $sm={{ justify: 'space-between' }}
                gap={16}
              >
                {total > (sizeOptions[0] ?? 0) && (
                  <PageSizeSelect
                    value={size}
                    options={sizeOptions}
                    onChange={(next) =>
                      // Cambiare quanti per pagina riporta alla prima.
                      void navigate({
                        search: () => paging({ size: next, page: 1 }),
                      })
                    }
                  />
                )}
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  href={pageHref}
                  onNavigate={(next, event) => {
                    if (takeLinkClick(event)) goToPage(next);
                  }}
                  label={tBacklog('pages')}
                  previousLabel={tBacklog('previousPage')}
                  nextLabel={tBacklog('nextPage')}
                  goToLabel={tBacklog('goToPage')}
                  onGoTo={goToPage}
                />
              </XStack>
            </>
          )
        )}
      </YStack>
    </Page>
  );
}

/**
 * Una card della lista, con i due gesti sotto: «Ce l'ho» apre il dialogo del
 * backlog (che chiede la piattaforma, e toglie il gioco da tutte le liste), e
 * «Togli» lo toglie da questa lista, con «Annulla» nell'avviso.
 */
function WishlistCard({ game, listId }: { game: HomeGame; listId: string }) {
  const t = useTranslations('wishlist');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: api.wishlists.key() });

  const remove = useMutation({
    mutationFn: () => client.wishlists.removeGame({ listId, gameId: game.id }),
    onSuccess: async () => {
      await refresh();
      toast.success(t('removed', { name: game.name }), {
        action: {
          label: t('undo'),
          onClick: () =>
            void client.wishlists
              .add({ gameId: game.id, listId })
              .then(refresh),
        },
      });
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('removeFailed') })),
  });

  return (
    <YStack render="li" gap={6} style={{ listStyle: 'none' }}>
      <HomeCard game={game} fill showWishlist={false} />
      <XStack gap={4} flexWrap="wrap">
        <AddGameDialog
          game={game}
          trigger={
            <Button size="sm" variant="outline">
              {t('own')}
            </Button>
          }
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          {t('remove')}
        </Button>
      </XStack>
    </YStack>
  );
}

/** La griglia delle card: la stessa del backlog, che la sonda misura. */
function Cards({ children }: { children: React.ReactNode }) {
  return (
    <YStack
      render="ul"
      p={0}
      m={0}
      style={{
        display: 'grid',
        gridTemplateColumns: GRID_TEMPLATE,
        gap: 12,
        listStyle: 'none',
      }}
    >
      {children}
    </YStack>
  );
}
