import { Input, Pagination, Skeleton, Text, YStack } from '@repo/ui';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import {
  IgdbCard,
  MIN_QUERY,
  useGameSearch,
  useOpenIgdbHit,
} from '@/components/game-search';
import { CARD_WIDTH, HomeCard } from '@/components/home-band';
import { takeLinkClick } from '@/src/link-click';
import { Page } from '@/src/components/page';

/** Quanti giochi di Ludex per pagina: cinque file da sei sul desktop. */
const PAGE_SIZE = 30;

type SearchParams = { q?: string; page?: number };

// La ricerca globale (12f): tutti i giochi di Ludex che corrispondono, a
// pagine, e sotto — da loggati — quelli IGDB che Ludex non ha ancora. Il
// testo e la pagina stanno nell'URL, come i filtri del backlog: un link a una
// ricerca la riapre uguale.
export const Route = createFileRoute('/_app/cerca')({
  validateSearch: (raw: Record<string, unknown>): SearchParams => {
    // `?q=1942` scritto a mano arriva come numero: il parser dell'URL è JSON.
    const q =
      typeof raw.q === 'string' || typeof raw.q === 'number'
        ? String(raw.q).slice(0, 100)
        : '';
    const page = Number(raw.page);
    return {
      q: q || undefined,
      page: Number.isInteger(page) && page > 1 ? page : undefined,
    };
  },
  component: SearchPage,
});

function SearchPage() {
  const t = useTranslations('search');
  const tBacklog = useTranslations('backlog');
  const router = useRouter();
  const navigate = Route.useNavigate();
  const { q = '', page = 1 } = Route.useSearch();
  const [text, setText] = useState(q);

  // Riallinea quando la ricerca cambia da fuori: un link, «indietro».
  useEffect(() => setText(q), [q]);

  // Il ritardo è sulla scrittura, come nel backlog: la query segue l'URL.
  // `replace`, perché ogni lettera non è una pagina da ritrovare con
  // «indietro»; e una ricerca nuova riparte dalla prima pagina.
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(
      () =>
        void navigate({
          search: { q: text.trim() || undefined },
          replace: true,
        }),
      350,
    );
    return () => clearTimeout(timer);
  }, [text, q, navigate]);

  const { local, igdb } = useGameSearch(q, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    delay: 0,
  });
  const openIgdb = useOpenIgdbHit();

  const total = local.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hits = igdb?.data ?? [];
  const searching = q.length >= MIN_QUERY;
  // IGDB che non risponde non tiene la pagina in sospeso: conta come finito,
  // e i giochi di Ludex restano quelli che sono.
  const nothing =
    local.isSuccess &&
    total === 0 &&
    (igdb === null || !igdb.isPending) &&
    hits.length === 0;

  const pageHref = (target: number) =>
    router.buildLocation({
      to: '/cerca',
      search: { q, page: target > 1 ? target : undefined },
    }).href;
  // Cambiare pagina lascia una voce nella cronologia: «indietro» torna alla
  // pagina di prima.
  const goToPage = (target: number) =>
    void navigate({
      search: { q, page: target > 1 ? target : undefined },
    });

  return (
    <Page title={t('title')} maxW={1280}>
      <YStack maxW={560} width="100%">
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          maxLength={100}
          autoFocus
          width="100%"
        />
      </YStack>

      {!searching ? (
        <Text fontSize={14} color="$color11">
          {t('hint')}
        </Text>
      ) : local.isError ? (
        <Text fontSize={14} color="$red11">
          {t('error')}
        </Text>
      ) : nothing ? (
        <Text fontSize={14} color="$color11">
          {t('noResults')}
        </Text>
      ) : (
        <>
          {(local.isPending || total > 0) && (
            <Section
              title={t('inLudex')}
              subtitle={local.data && t('count', { count: total })}
            >
              <Grid>
                {local.isPending
                  ? Array.from({ length: 12 }).map((_, index) => (
                      <Skeleton
                        key={index}
                        width="100%"
                        height={(CARD_WIDTH * 374) / 264}
                        rounded={6}
                      />
                    ))
                  : local.data.games.map((game) => (
                      <HomeCard key={game.id} game={game} fill />
                    ))}
              </Grid>
              {pageCount > 1 && (
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  href={pageHref}
                  onNavigate={(target, event) => {
                    if (takeLinkClick(event)) goToPage(target);
                  }}
                  label={tBacklog('pages')}
                  previousLabel={tBacklog('previousPage')}
                  nextLabel={tBacklog('nextPage')}
                  goToLabel={tBacklog('goToPage')}
                  onGoTo={goToPage}
                />
              )}
            </Section>
          )}

          {hits.length > 0 && (
            <Section title={t('onIgdb')} subtitle={t('igdbSubtitle')}>
              <Grid>
                {hits.map((hit) => (
                  <IgdbCard
                    key={hit.igdbId}
                    hit={hit}
                    disabled={openIgdb.isPending}
                    onOpen={() => openIgdb.mutate(hit.igdbId)}
                  />
                ))}
              </Grid>
            </Section>
          )}
        </>
      )}
    </Page>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <YStack render="section" gap={12}>
      <YStack gap={2}>
        <Text
          render="h2"
          fontFamily="$heading"
          fontSize={18}
          lineHeight={24}
          fontWeight="600"
          color="$color12"
          m={0}
        >
          {title}
        </Text>
        {subtitle && (
          <Text fontSize={14} lineHeight={20} color="$color11">
            {subtitle}
          </Text>
        )}
      </YStack>
      {children}
    </YStack>
  );
}

/** La griglia del backlog: tante colonne quante ne stanno. */
function Grid({ children }: { children: ReactNode }) {
  return (
    <YStack
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(152px, 1fr))',
        gap: 12,
      }}
    >
      {children}
    </YStack>
  );
}
