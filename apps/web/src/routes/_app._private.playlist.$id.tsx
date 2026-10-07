import {
  EmptyState,
  Pagination,
  Skeleton,
  Text,
  ToggleGroup,
  ToggleGroupItem,
  XStack,
  YStack,
} from '@repo/ui';
import {
  ChevronLeft,
  LayoutGrid,
  List,
  ListFilter,
  Rows3,
  SearchX,
} from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslations } from 'use-intl';

import { PlaylistChips } from '@/components/backlog-filters';
import { ManagedEntries } from '@/components/entry-list';
import { SearchInput, SortSelect } from '@/components/list-controls';
import { PageSizeSelect } from '@/components/page-size-select';
import { PlaylistMenu } from '@/components/playlist-menu';
import { hasErrorCode } from '@/lib/api-error';
import {
  type BacklogView,
  type PageSize,
  pageSizeValues,
  type PlaylistSearch,
  playlistSearch,
  validatePlaylistSearch,
} from '@/lib/backlog-filter';
import { api } from '@/lib/orpc';
import { ButtonLink } from '@/src/components/button-link';
import { Page } from '@/src/components/page';
import { takeLinkClick } from '@/src/link-click';

export const Route = createFileRoute('/_app/_private/playlist/$id')({
  // La vista, la pagina, quanti per pagina e la vista di chi guarda — ricerca e
  // ordinamento, che coprono quelli salvati senza cambiarli. I filtri sono
  // quelli salvati, e per cambiarli si passa da `/backlog`.
  validateSearch: validatePlaylistSearch,
  component: PlaylistPage,
});

/**
 * Una playlist aperta (step 15a): la sua query eseguita a ogni apertura, con
 * le card e le azioni di `/backlog`.
 */
function PlaylistPage() {
  const t = useTranslations('playlists');
  const tBacklog = useTranslations('backlog');
  const router = useRouter();
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const view: BacklogView = search.view ?? 'grid';
  const page = search.page ?? 1;
  const size: PageSize = search.size ?? pageSizeValues[1];

  const playlist = useQuery({
    ...api.playlists.get.queryOptions({
      input: {
        id,
        limit: size,
        offset: (page - 1) * size,
        q: search.q,
        sort: search.sort,
        direction: search.direction,
      },
    }),
    // La pagina di prima resta a schermo mentre arriva la nuova, ma solo di
    // questa playlist: aprirne un'altra non deve mostrare i giochi della prima.
    placeholderData: (previous) => (previous?.id === id ? previous : undefined),
  });

  const entries = playlist.data?.entries ?? [];
  const total = playlist.data?.total ?? 0;
  const pageCount = Math.ceil(total / size);

  const paging = (patch: Partial<PlaylistSearch>) =>
    validatePlaylistSearch({ ...search, ...patch });
  // Ricerca e ordine cambiano l'insieme: si torna alla prima pagina e, come
  // nei filtri di `/backlog`, senza lasciare una voce nella cronologia a ogni
  // tasto.
  const refine = (patch: Pick<PlaylistSearch, 'q' | 'sort' | 'direction'>) =>
    void navigate({
      search: () => paging({ ...patch, page: undefined }),
      replace: true,
    });
  const goToPage = (next: number) =>
    void navigate({ search: () => paging({ page: next }) });
  const pageHref = (next: number) =>
    router.buildLocation({
      to: '/playlist/$id',
      params: { id },
      search: paging({ page: next }),
    }).href;

  // Come in `/backlog`: una pagina oltre l'ultima torna alla prima.
  const outOfRange =
    playlist.data !== undefined &&
    !playlist.isPlaceholderData &&
    entries.length === 0 &&
    page > 1;
  useEffect(() => {
    if (outOfRange) void navigate({ search: () => paging({ page: 1 }) });
    // `paging` si ricrea a ogni render e non cambia ciò che fa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outOfRange, navigate]);

  const back = (
    <Link
      to="/playlist"
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

  if (playlist.error) {
    return (
      <Page eyebrow={back} title={t('title')}>
        {hasErrorCode(playlist.error, 'NOT_FOUND') ? (
          <EmptyState
            icon={<ListFilter size={24} color="$color11" />}
            title={t('notFoundTitle')}
            description={t('notFoundHint')}
            action={<ButtonLink href="/playlist">{t('back')}</ButtonLink>}
          />
        ) : (
          <Text fontSize={14} color="$red11">
            {t('loadFailed')}
          </Text>
        )}
      </Page>
    );
  }

  const data = playlist.data;
  // L'ordine in uso: quello scelto da chi guarda, altrimenti quello salvato.
  const sort = search.sort ?? data?.query.sort ?? 'addedAt';
  const direction = search.direction ?? data?.query.direction ?? 'desc';

  return (
    <Page
      // Larga come `/backlog`: stesse viste, stesse colonne.
      maxW={1280}
      eyebrow={back}
      title={data?.name ?? ' '}
      subtitle={data ? tBacklog('count', { count: total }) : ' '}
      actions={
        data && (
          <>
            <ButtonLink
              variant="outline"
              href={
                router.buildLocation({
                  to: '/backlog',
                  search: playlistSearch(data.query, data.id),
                }).href
              }
            >
              {t('editFilters')}
            </ButtonLink>
            <PlaylistMenu
              playlist={data}
              onDeleted={() => void navigate({ to: '/playlist' })}
            />
          </>
        )
      }
    >
      {data && data.missingTags > 0 && (
        // Il tag mancante si ignora invece di svuotare la lista, e senza
        // questo avviso la playlist mostrerebbe più giochi del previsto senza
        // dire perché.
        <YStack bg="$color3" rounded={8} px={12} py={8}>
          <Text fontSize={13} lineHeight={18} color="$color12">
            {t('missingTags', { count: data.missingTags })}
          </Text>
        </YStack>
      )}

      {data && (
        <YStack gap={12}>
          {/* Una riga, che sul telefono va a capo: ricerca, ordine, e a destra
              le viste. Ricerca e ordine sono la vista di chi guarda e non si
              salvano: il default è quello della playlist. */}
          <XStack items="center" flexWrap="wrap" gap={8}>
            <YStack flex={1} minW={140} maxW={320}>
              <SearchInput
                value={search.q ?? ''}
                onChange={(q) => refine({ q: q || undefined })}
              />
            </YStack>
            <YStack width={220}>
              <SortSelect
                sort={sort}
                direction={direction}
                onSortChange={(next) =>
                  // Quello salvato non si scrive nell'URL: tornare all'ordine
                  // della playlist è scegliere di nuovo il suo.
                  refine({ sort: next === data.query.sort ? undefined : next })
                }
                onDirectionChange={(next) =>
                  refine({
                    direction: next === data.query.direction ? undefined : next,
                  })
                }
              />
            </YStack>
            <XStack ml="auto">
              <ToggleGroup
                label={tBacklog('view')}
                value={view}
                // La pagina resta: le viste mostrano gli stessi giochi.
                onValueChange={(next) =>
                  void navigate({
                    search: () => paging({ view: next as BacklogView }),
                  })
                }
              >
                <ToggleGroupItem value="grid" aria-label={tBacklog('viewGrid')}>
                  <LayoutGrid size={16} color="$color12" />
                </ToggleGroupItem>
                <ToggleGroupItem value="rows" aria-label={tBacklog('viewRows')}>
                  <Rows3 size={16} color="$color12" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="compact"
                  aria-label={tBacklog('viewCompact')}
                >
                  <List size={16} color="$color12" />
                </ToggleGroupItem>
              </ToggleGroup>
            </XStack>
          </XStack>

          <PlaylistChips query={data.query} />
        </YStack>
      )}

      <YStack gap={16}>
        {playlist.isPending ? (
          <YStack gap={8}>
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} height={96} width="100%" rounded={12} />
            ))}
          </YStack>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<SearchX size={24} color="$color11" />}
            // Vuota per via della ricerca di chi guarda, o vuota di suo: la
            // prima ha una via d'uscita nel campo qui sopra.
            title={search.q ? t('emptySearchTitle') : t('emptyTitle')}
            description={search.q ? undefined : t('emptyHint')}
          />
        ) : (
          <>
            <ManagedEntries view={view} entries={entries} />

            <XStack
              flexWrap="wrap"
              items="center"
              justify="center"
              $sm={{ justify: 'space-between' }}
              gap={16}
            >
              {total > pageSizeValues[0] && (
                <PageSizeSelect
                  value={size}
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
        )}
      </YStack>
    </Page>
  );
}
