import type { BacklogStatus, GameDetail } from '@repo/contracts';
import {
  Button,
  Skeleton,
  Spinner,
  Text,
  XStack,
  YStack,
  toast,
} from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { AddGameDialog } from '@/components/add-game-dialog';
import { Muted } from '@/components/detail-text';
import { EditEntryDialog } from '@/components/edit-entry-dialog';
import {
  BacklogPanel,
  DurationAndCritics,
  GAME_PAGE_WIDTH,
  GameGallery,
  GameHero,
  RelatedRow,
} from '@/components/game-page';
import { WishlistControl } from '@/components/wishlist-control';
import { useApiErrorMessage } from '@/lib/api-error';
import { useSetEntryHidden } from '@/lib/hide-entry';
import { api, client } from '@/lib/orpc';
import { ButtonLink } from '@/src/components/button-link';
import { Page } from '@/src/components/page';
import { ReportError } from '@/components/report-error';
import { useSession } from '@/src/use-session';

/**
 * Quanto si aspetta l'enrichment di un gioco appena nato prima di arrendersi
 * e mostrare la pagina com'è. Di solito bastano pochi secondi; oltre, la coda
 * è ferma o IGDB non risponde, e uno skeleton per sempre sarebbe peggio.
 */
const ENRICHING_WINDOW_MS = 2 * 60_000;

/** Ogni quanto si rilegge la scheda mentre si aspetta, se l'evento non arriva. */
const ENRICHING_REFETCH_MS = 5_000;

/**
 * Un gioco appena entrato in Ludex, dalla ricerca o da un simile (12f): ha un
 * id IGDB, i dati non sono ancora arrivati, ed è nato da poco. Al posto della
 * pagina vuota, che sembrava rotta, lo skeleton. Un gioco importato e mai
 * arricchito non è questo caso: è vecchio, e la sua pagina lo dice.
 */
function isEnriching(game: GameDetail) {
  return (
    game.igdbId !== null &&
    game.igdbSyncedAt === null &&
    Date.now() - game.createdAt.getTime() < ENRICHING_WINDOW_MS
  );
}

// Pagina auth/no-auth: il gioco si vede sempre, `entry` arriva popolata solo se
// chi guarda è autenticato e ce l'ha nel backlog.
export const Route = createFileRoute('/_app/games/$slug')({
  component: GamePage,
});

/**
 * La hero mentre si aspetta: alta quanto quella vera di `GameHero`, 500 da
 * `$md` e 240 sotto. La media query sta sullo `YStack` e non sullo
 * `Skeleton`: su un componente di `@repo/ui` l'idratazione non torna.
 */
function HeroSkeleton() {
  return (
    <YStack width="100%" height={500} $max-md={{ height: 240 }}>
      <Skeleton height="100%" width="100%" rounded={0} />
    </YStack>
  );
}

function GamePage() {
  const t = useTranslations('game');
  const tHidden = useTranslations('hidden');
  const tBacklog = useTranslations('backlog');
  const tReport = useTranslations('game.report');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const setHidden = useSetEntryHidden();
  const session = useSession();

  const { slug } = Route.useParams();
  const { data, isPending, error } = useQuery({
    ...api.games.bySlug.queryOptions({ input: { slug } }),
    // I dati arrivano con l'evento in push dell'enrichment; questa è la
    // riserva, e scandisce anche la fine dell'attesa.
    refetchInterval: (query) =>
      query.state.data && isEnriching(query.state.data.game)
        ? ENRICHING_REFETCH_MS
        : false,
  });

  // Solo un interruttore: la riga da passare al dialog è sempre quella fresca
  // della query, non una copia congelata al momento del click.
  const [editing, setEditing] = useState(false);

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: BacklogStatus }) =>
      client.backlog.setStatus(input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: api.games.bySlug.key() }),
        queryClient.invalidateQueries({ queryKey: api.backlog.list.key() }),
      ]),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: tBacklog('statusFailed') })),
  });

  if (isPending) {
    return (
      <Page maxW={GAME_PAGE_WIDTH} hero={<HeroSkeleton />}>
        <Skeleton height={320} width="100%" rounded={12} />
      </Page>
    );
  }

  if (error) {
    return (
      <Page maxW={768} title={t('notFoundTitle')} subtitle={t('notFoundHint')}>
        <ButtonLink variant="outline" width="max-content" href="/">
          {t('backToCatalog')}
        </ButtonLink>
      </Page>
    );
  }

  const { game, entry } = data;

  if (isEnriching(game)) {
    return (
      <Page maxW={GAME_PAGE_WIDTH} hero={<HeroSkeleton />} title={game.name}>
        <XStack items="center" gap={8} role="status">
          <Spinner />
          <Text fontSize={14} color="$color11">
            {t('enriching')}
          </Text>
        </XStack>
        <Skeleton height={320} width="100%" rounded={12} />
      </Page>
    );
  }

  const remakes = game.related.filter((row) => row.kind !== 'similar');
  const similar = game.related.filter((row) => row.kind === 'similar');

  return (
    <Page maxW={GAME_PAGE_WIDTH} hero={<GameHero game={game} />}>
      {/* Il campo distingue "non ha metadati" da "non ancora arricchito": senza,
          una pagina vuota sembrerebbe un gioco senza niente da dire. */}
      {game.igdbSyncedAt === null && (
        <Muted>
          {game.igdbId === null ? t('notLinked') : t('notEnriched')}
        </Muted>
      )}

      {/* La laterale sta **prima** nell'HTML, ed è l'ordine del telefono:
          durata, critica e stato sono ciò che serve a decidere. Da `$lg` le
          due colonne si affiancano, e `row-reverse` porta la principale a
          sinistra. */}
      <XStack
        gap={24}
        items="flex-start"
        flexDirection="row-reverse"
        $max-lg={{ flexDirection: 'column', items: 'stretch' }}
      >
        <YStack width={360} shrink={0} gap={16} $max-lg={{ width: '100%' }}>
          <DurationAndCritics game={game} entry={entry} />
          {entry ? (
            <BacklogPanel
              entry={entry}
              onStatus={(row, status) =>
                setStatus.mutate({ id: row.id, status })
              }
              hiddenNotice={
                // Ci si arriva da una ricerca o da un link: senza, il gioco
                // sembrerebbe in lista e in lista non si trova.
                entry.hiddenAt && <Muted>{t('hiddenNotice')}</Muted>
              }
              actions={
                <>
                  <Button variant="outline" onPress={() => setEditing(true)}>
                    {t('edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    onPress={() =>
                      setHidden.mutate({
                        id: entry.id,
                        hidden: entry.hiddenAt === null,
                      })
                    }
                    disabled={setHidden.isPending}
                  >
                    {entry.hiddenAt === null
                      ? tHidden('hide')
                      : tHidden('unhide')}
                  </Button>
                </>
              }
            />
          ) : (
            session.data && (
              // Il gioco non è tuo: o lo metti da parte in una lista, o ce l'hai.
              <XStack gap={8} items="center" flexWrap="wrap">
                <AddGameDialog game={game} />
                <WishlistControl game={game} />
              </XStack>
            )
          )}
          {/* In fondo alla colonna: sotto il pannello del backlog se il gioco
              è tuo, sotto durata e critica se no. Solo da loggati: la
              segnalazione è di qualcuno. */}
          {session.data ? (
            <XStack gap={8} items="center" flexWrap="wrap">
              <ReportError game={game} entry={entry} />
              {/* Per l'admin, la scheda dove si corregge. È comodità: la
                  sezione la protegge il server. */}
              {session.data.user.role === 'admin' ? (
                <ButtonLink
                  size="sm"
                  variant="ghost"
                  href={`/admin/giochi/${game.slug}`}
                >
                  {tReport('admin')}
                </ButtonLink>
              ) : null}
            </XStack>
          ) : null}
        </YStack>

        {/* Sotto `$lg` le colonne sono impilate, e la base 0 di `flex`
            darebbe a questa un'altezza zero: il contenuto ne uscirebbe e
            coprirebbe ciò che viene dopo. */}
        <YStack
          flex={1}
          minW={0}
          gap={24}
          $max-lg={{ width: '100%', flexBasis: 'auto' }}
        >
          <GameGallery game={game} />

          {game.summary && (
            <YStack gap={8} render="section">
              <Text
                render="h2"
                fontFamily="$heading"
                fontSize={16}
                lineHeight={22}
                fontWeight="600"
                color="$color12"
                m={0}
              >
                {t('description')}
              </Text>
              <Text
                fontSize={15}
                lineHeight={24}
                color="$color12"
                style={{ whiteSpace: 'pre-line' }}
              >
                {game.summary}
              </Text>
            </YStack>
          )}

          <RelatedRow title={t('remakes')} games={remakes} />
          <RelatedRow title={t('similar')} games={similar} />
        </YStack>
      </XStack>

      {entry && (
        <XStack>
          <ButtonLink variant="ghost" href="/backlog">
            {t('goToBacklog')}
          </ButtonLink>
        </XStack>
      )}

      <EditEntryDialog
        entry={editing ? entry : null}
        onOpenChange={setEditing}
      />
    </Page>
  );
}
