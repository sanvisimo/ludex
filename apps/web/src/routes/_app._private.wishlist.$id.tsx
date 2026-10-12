import type { HomeGame, Store, WishlistSort } from '@repo/contracts';
import { wishlistSortValues } from '@repo/contracts';
import {
  Button,
  BrandIcon,
  EmptyState,
  Pagination,
  Skeleton,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { ChevronLeft, Heart, RefreshCw, SearchX } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
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
import { StoreListStatus } from '@/components/store-list-status';
import { useSyncWishlist } from '@/components/use-sync-wishlist';
import { WishlistUnresolvedDialog } from '@/components/wishlist-unresolved-dialog';
import { WishlistMenu } from '@/components/wishlist-menu';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-error';
import {
  validateWishlistSearch,
  type WishlistSearch,
} from '@/lib/backlog-filter';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';
import { STORE_BRAND } from '@/lib/store-brand';
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
          <XStack items="center" gap={8}>
            {data.store && data.storeAccountId && (
              <RefreshStoreList accountId={data.storeAccountId} />
            )}
            <WishlistMenu
              list={data}
              onDeleted={() => void navigate({ to: '/wishlist' })}
            />
          </XStack>
        )
      }
    >
      {data?.store && data.storeAccountId && (
        <StoreListStatus accountId={data.storeAccountId} />
      )}
      {data?.store && <UnresolvedBar listId={data.id} store={data.store} />}
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
            title={
              search.q
                ? t('emptySearchTitle')
                : data.store
                  ? t('store.emptyList')
                  : t('emptyList')
            }
            description={
              search.q || data.store ? undefined : t('emptyListHint')
            }
          />
        ) : (
          data && (
            <>
              <Cards>
                {games.map((game) => (
                  <WishlistCard
                    key={game.id}
                    game={game}
                    listId={id}
                    readOnly={data.store !== undefined}
                  />
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
function WishlistCard({
  game,
  listId,
  readOnly,
}: {
  game: HomeGame;
  listId: string;
  /** Una lista di negozio (15e): si allinea al negozio, non si toglie a mano. */
  readOnly: boolean;
}) {
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
      {/* In una lista di negozio un gioco già nel backlog porta la sua
          etichetta di stato sulla card, e non ha niente da aggiungere. */}
      {!(readOnly && game.status) && (
        <XStack gap={4} flexWrap="wrap">
          <AddGameDialog
            game={game}
            trigger={
              <Button size="sm" variant="outline">
                {t('own')}
              </Button>
            }
          />
          {!readOnly && (
            <Button
              size="sm"
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {t('remove')}
            </Button>
          )}
        </XStack>
      )}
    </YStack>
  );
}

/**
 * «Aggiorna wishlist» sulla lista di un negozio (15e): la stessa azione della
 * scheda dell'account, accodata dal punto in cui la lista si guarda.
 */
function RefreshStoreList({ accountId }: { accountId: string }) {
  const t = useTranslations('wishlist.store');
  const sync = useSyncWishlist(accountId);
  const accounts = useQuery(api.accounts.list.queryOptions());
  const account = accounts.data?.find((row) => row.id === accountId);
  const syncing = account?.wishlistSyncing ?? false;

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={syncing || sync.isPending || account?.status === 'needs_reauth'}
      onClick={() => sync.mutate()}
    >
      <RefreshCw size={14} color="$color12" />
      {syncing ? t('syncing') : t('refresh')}
    </Button>
  );
}

/**
 * Sopra la lista di un negozio: quante voci l'import non ha saputo legare a un
 * gioco, e il modo di sistemarle. Non c'è se non c'è niente, nemmeno di nascosto;
 * se restano solo le nascoste dice così, perché senza questo non si potrebbero
 * più rimettere fra quelle da sistemare.
 */
function UnresolvedBar({ listId, store }: { listId: string; store: Store }) {
  const t = useTranslations('wishlist.store');
  const storeLabels = useStoreLabels();
  const [open, setOpen] = useState(false);
  const entries = useQuery(
    api.wishlists.unresolved.list.queryOptions({ input: { listId } }),
  );
  const rows = entries.data ?? [];
  const pending = rows.filter((row) => !row.hiddenAt).length;
  const hidden = rows.length - pending;
  const brand = STORE_BRAND[store];
  if (rows.length === 0) return null;

  return (
    <>
      <XStack
        items="center"
        justify="space-between"
        gap={12}
        flexWrap="wrap"
        p={12}
        rounded={8}
        bg="$color3"
      >
        <XStack items="center" gap={8} shrink={1} minW={0}>
          {brand && (
            <BrandIcon brand={brand} size={16} label={storeLabels[store]} />
          )}
          <Text fontSize={14} lineHeight={20} color="$color12">
            {pending > 0
              ? t('unresolvedBar', { count: pending })
              : t('unresolvedOnlyHidden', { count: hidden })}
          </Text>
        </XStack>
        <Button size="sm" onClick={() => setOpen(true)}>
          {pending > 0 ? t('fix') : t('seeHidden')}
        </Button>
      </XStack>
      <WishlistUnresolvedDialog
        listId={listId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
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
