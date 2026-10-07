import {
  EmptyState,
  Pagination,
  Skeleton,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import { ListFilter } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import {
  GRID_TEMPLATE,
  GridProbe,
  useGridColumns,
  useReanchorPage,
} from '@/components/grid-columns';
import { CARD_WIDTH, HomeCard } from '@/components/home-band';
import { PageSizeSelect } from '@/components/page-size-select';
import { hasErrorCode } from '@/lib/api-error';
import { playlistSearch, validatePagingSearch } from '@/lib/backlog-filter';
import { api } from '@/lib/orpc';
import {
  defaultPageSize,
  maxSharedPageSize,
  pageSizeOptions,
  snapPageSize,
} from '@/lib/page-size';
import { ButtonLink } from '@/src/components/button-link';
import { Page } from '@/src/components/page';
import { takeLinkClick } from '@/src/link-click';
import { useSession } from '@/src/use-session';

export const Route = createFileRoute('/_app/shared/$token')({
  // La pagina e quanti per pagina: chi apre non cerca né riordina, l'ordine è
  // quello salvato.
  validateSearch: validatePagingSearch,
  // Una pagina che chiunque può aprire e nessuno deve trovare per caso: è
  // raggiungibile solo da chi ha il link.
  head: () => ({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] }),
  component: SharedPlaylistPage,
});

/**
 * Una playlist condivisa (step 15d), vista da chi ha il link: **pubblica**, anche
 * da anonimi. Il nome della playlist e i giochi come li mostra il catalogo; di chi
 * l'ha scritta e dei suoi dati non c'è niente, e il server non li manda
 * nemmeno. Con un account, «Usa questi filtri sul mio backlog» apre `/backlog`
 * con gli stessi filtri (senza i tag, che sono di chi li ha scritti).
 */
function SharedPlaylistPage() {
  const t = useTranslations('playlists.shared');
  const tBacklog = useTranslations('backlog');
  const router = useRouter();
  const session = useSession();
  const { token } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // Un multiplo delle colonne che si vedono, come in `/backlog`; solo la griglia,
  // e dentro il tetto della rotta pubblica.
  const grid = useGridColumns();
  const step = grid.columns ?? 1;
  const sizeOptions = pageSizeOptions(step, maxSharedPageSize);
  const size = snapPageSize(
    search.size ?? defaultPageSize,
    step,
    maxSharedPageSize,
  );
  const sizeKnown = grid.columns !== null;
  const page = search.page ?? 1;

  useReanchorPage({
    size,
    ready: sizeKnown,
    page,
    onChange: (next) =>
      void navigate({
        search: () => validatePagingSearch({ ...search, page: next }),
        replace: true,
      }),
  });

  const shared = useQuery({
    ...api.sharedPlaylists.get.queryOptions({
      input: { token, limit: size, offset: (page - 1) * size },
    }),
    enabled: sizeKnown,
    placeholderData: (previous) => previous,
  });

  const data = shared.data;
  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / size);
  const goToPage = (next: number) =>
    void navigate({
      search: () => validatePagingSearch({ ...search, page: next }),
    });
  const pageHref = (next: number) =>
    router.buildLocation({
      to: '/shared/$token',
      params: { token },
      search: validatePagingSearch({ ...search, page: next }),
    }).href;

  if (shared.error) {
    return (
      <Page title={' '}>
        {hasErrorCode(shared.error, 'NOT_FOUND') ? (
          <EmptyState
            icon={<ListFilter size={24} color="$color11" />}
            title={t('notFoundTitle')}
            description={t('notFoundHint')}
          />
        ) : (
          <Text fontSize={14} color="$red11">
            {t('loadFailed')}
          </Text>
        )}
      </Page>
    );
  }

  // Il bottone dei filtri: da loggati porta al backlog, da anonimi all'accesso e
  // poi torna qui. Finché la sessione non è nota non si mostra, o lampeggia.
  const useFilters =
    data && !session.isPending ? (
      session.data ? (
        <ButtonLink
          href={
            router.buildLocation({
              to: '/backlog',
              search: playlistSearch(data.query),
            }).href
          }
        >
          {t('useFilters')}
        </ButtonLink>
      ) : (
        <ButtonLink
          variant="outline"
          href={`/login?next=${encodeURIComponent(`/shared/${token}`)}`}
        >
          {t('signInToUse')}
        </ButtonLink>
      )
    ) : null;

  return (
    <Page
      maxW={1280}
      title={data?.name ?? ' '}
      subtitle={data ? tBacklog('count', { count: total }) : ' '}
      actions={useFilters}
    >
      {data && data.droppedTags > 0 && (
        <YStack bg="$color3" rounded={8} px={12} py={8}>
          <Text fontSize={13} lineHeight={18} color="$color12">
            {t('droppedTags', { count: data.droppedTags })}
          </Text>
        </YStack>
      )}

      <YStack gap={16} position="relative">
        <GridProbe probeRef={grid.ref} />
        {shared.isPending ? (
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
        ) : data && data.games.length === 0 ? (
          <Text fontSize={14} color="$color11">
            {t('empty')}
          </Text>
        ) : (
          data && (
            <>
              <Cards>
                {data.games.map((game) => (
                  <HomeCard key={game.id} game={game} fill />
                ))}
              </Cards>
              {/* Quanti per pagina a sinistra, le pagine a destra; sul telefono
                  vanno a capo. La scelta c'è anche con una pagina sola, se i
                  giochi sono più della prima voce: chi ha scelto tanti deve
                  poter tornare indietro. */}
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
                        search: () =>
                          validatePagingSearch({ size: next, page: 1 }),
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

      <Text fontSize={13} color="$color11">
        {t('about')}
      </Text>
    </Page>
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
