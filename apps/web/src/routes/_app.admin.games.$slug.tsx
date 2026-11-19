import type { GameAdminDetail } from '@repo/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Skeleton,
  Text,
  toast,
  Tooltip,
  XStack,
  YStack,
} from '@repo/ui';
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  CircleCheck,
  Hash,
  Link2Off,
  RotateCw,
  SearchX,
  Unlink,
} from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  useCanGoBack,
  useLocation,
  useRouter,
} from '@tanstack/react-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useTranslations } from 'use-intl';

import {
  AdminTable,
  CellText,
  type AdminColumn,
} from '@/components/admin/admin-table';
import { MergeDialog } from '@/components/admin/merge-dialog';
import { RepointDialog } from '@/components/admin/repoint-dialog';
import {
  SetSourceIdDialog,
  type SourceToSet,
} from '@/components/admin/set-source-id-dialog';
import { StatusBadge } from '@/components/admin/status-badge';
import { UnlinkLinkDialog } from '@/components/admin/unlink-link-dialog';
import { GameCover } from '@/components/game-cover';
import { UnresolvedCover } from '@/components/unresolved-row';
import { useApiErrorMessage } from '@/lib/api-error';
import { useGameTypeLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';
import { ExternalLink } from '@/src/components/external-link';

export const Route = createFileRoute('/_app/admin/games/$slug')({
  component: GameAdminPage,
});

type Link = GameAdminDetail['links'][number];
type Source = GameAdminDetail['sources'][number];
type Report = GameAdminDetail['reports'][number];

function GameAdminPage() {
  const t = useTranslations('admin');
  const { slug } = Route.useParams();
  const detail = useQuery(
    api.admin.games.detail.queryOptions({ input: { slug } }),
  );

  if (detail.isPending)
    return <Skeleton height={320} width="100%" rounded={12} />;
  if (detail.isError) return <EmptyState title={t('game.notFound')} />;
  return <GameAdmin detail={detail.data} />;
}

function GameAdmin({ detail }: { detail: GameAdminDetail }) {
  const t = useTranslations('admin');
  const tStore = useTranslations('store');
  const gameTypeLabels = useGameTypeLabels();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const section = useLocation({ select: ({ hash }) => hash });

  const [repointing, setRepointing] = useState<Link | null>(null);
  const [unlinking, setUnlinking] = useState<Link | null>(null);
  const [setting, setSetting] = useState<SourceToSet | null>(null);
  const [merging, setMerging] = useState(false);
  const maintenanceTrigger = useRef<ComponentRef<typeof Button>>(null);
  const { game } = detail;

  useEffect(() => {
    if (section !== 'links' && section !== 'reports') return;
    // La destinazione si monta dopo la risposta della query di dettaglio.
    const heading = document.getElementById(section);
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start' });
  }, [game.slug, section]);

  function goBack() {
    if (canGoBack) {
      router.history.back();
      return;
    }
    void router.navigate({
      to:
        section === 'reports'
          ? '/admin/reported'
          : section === 'links'
            ? '/admin/platforms'
            : '/admin/missing',
      replace: true,
    });
  }

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: api.admin.key() }),
      queryClient.invalidateQueries({ queryKey: api.games.bySlug.key() }),
    ]);

  const retry = useMutation({
    mutationFn: (source: Source) =>
      client.admin.sources.retry({ gameId: game.id, source: source.source }),
    onSuccess: async () => {
      await refresh();
      toast.success(t('missing.retried'));
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('missing.retryFailed') })),
  });

  const markAbsent = useMutation({
    mutationFn: (source: Source) =>
      client.admin.sources.markAbsent({
        gameId: game.id,
        source: source.source as SourceToSet['source'],
      }),
    onSuccess: async () => {
      await refresh();
      toast.success(t('missing.markedAbsent'));
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, { fallback: t('missing.markAbsentFailed') }),
      ),
  });

  const acceptEmpty = useMutation({
    mutationFn: (source: Source) =>
      client.admin.sources.acceptEmpty({
        gameId: game.id,
        source: source.source as SourceToSet['source'],
      }),
    onSuccess: async () => {
      await refresh();
      toast.success(t('missing.acceptedEmpty'));
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, { fallback: t('missing.markAbsentFailed') }),
      ),
  });

  const archive = useMutation({
    mutationFn: (report: Report) =>
      client.admin.reports.archive({
        gameId: game.id,
        target: report.store
          ? { store: report.store }
          : { source: report.source! },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success(t('games.archived'));
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('games.archiveFailed') })),
  });

  const what = (report: Report) =>
    report.store
      ? t('games.copyOf', { store: tStore(report.store) })
      : t('reported.sourceData', { source: t(`source.${report.source!}`) });

  const linkColumns: AdminColumn<Link>[] = [
    {
      key: 'store',
      header: t('game.store'),
      sortValue: (link) => tStore(link.source),
      width: 160,
      render: (link) => <CellText>{tStore(link.source)}</CellText>,
    },
    {
      key: 'id',
      header: t('game.externalId'),
      sortValue: (link) => link.externalId,
      flex: 2,
      minWidth: 120,
      render: (link) =>
        link.url ? (
          <ExternalLink href={link.url}>
            <CellText>{link.externalId} ↗</CellText>
          </ExternalLink>
        ) : (
          <CellText>{link.externalId}</CellText>
        ),
    },
    {
      key: 'storeTitle',
      header: t('game.storeTitle'),
      sortValue: (link) => link.storeTitle,
      flex: 2,
      minWidth: 180,
      // Due id Epic sullo stesso gioco si distinguono solo così: Epic una
      // pagina da aprire non la dà. Il titolo può ingannare (Aiko's Choice ha
      // quello del gioco base), la copertina no.
      render: (link) => (
        <XStack gap={10} items="center" minW={0}>
          <UnresolvedCover
            key={link.id}
            entry={{
              store: link.source,
              externalId: link.externalId,
              imageUrl: link.storeImageUrl,
            }}
            width={30}
            height={42}
          />
          <YStack flex={1} minW={0}>
            <CellText muted>{link.storeTitle ?? '—'}</CellText>
          </YStack>
        </XStack>
      ),
    },
    {
      key: 'copies',
      header: t('game.copies'),
      sortValue: (link) => link.copies,
      flex: 1,
      minWidth: 130,
      render: (link) => (
        <CellText muted>
          {[
            t('game.copiesCount', { users: link.users, copies: link.copies }),
            link.platforms.join(', '),
          ]
            .filter(Boolean)
            .join(' · ')}
        </CellText>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 290,
      render: (link) => (
        <XStack gap={8}>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => setRepointing(link)}
          >
            <Unlink size={14} />
            {t('game.notThis')}
          </Button>
          <Button size="sm" variant="ghost" onPress={() => setUnlinking(link)}>
            <Link2Off size={14} />
            {t('game.unlink')}
          </Button>
        </XStack>
      ),
    },
  ];

  const sourceColumns: AdminColumn<Source>[] = [
    {
      key: 'source',
      header: t('game.source'),
      sortValue: (row) => t(`source.${row.source}`),
      width: 130,
      render: (row) => <CellText>{t(`source.${row.source}`)}</CellText>,
    },
    {
      key: 'state',
      header: t('game.state'),
      sortValue: (row) => t(`status.${row.status}`),
      width: 110,
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'id',
      header: t('game.id'),
      sortValue: (row) =>
        row.externalId ??
        (row.source === 'igdb' && game.igdbId != null
          ? String(game.igdbId)
          : null),
      flex: 1,
      minWidth: 120,
      render: (row) => {
        const id =
          row.externalId ??
          (row.source === 'igdb' ? (game.igdbId ?? '—') : '—');
        const label = `${id}${row.manual ? ` · ${t('missing.manual')}` : ''}`;
        return row.url ? (
          <ExternalLink href={row.url}>
            <CellText>{label} ↗</CellText>
          </ExternalLink>
        ) : (
          <CellText>{label}</CellText>
        );
      },
    },
    {
      key: 'reason',
      header: t('game.reason'),
      sortValue: (row) => (row.reason ? t(`reason.${row.reason}`) : null),
      flex: 2,
      minWidth: 160,
      render: (row) => (
        <YStack flex={1} minW={0} gap={2}>
          {row.reason ? (
            <Text
              fontSize={13}
              lineHeight="18px"
              fontWeight="600"
              color="color12"
            >
              {t(`reason.${row.reason}`)}
            </Text>
          ) : null}
          {row.error ? <CellText muted>{row.error}</CellText> : null}
        </YStack>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 300,
      render: (row) => (
        <>
          <Tooltip
            content={
              row.reason === 'absent' || row.emptyAccepted
                ? t('missing.undoHint')
                : t('missing.retryHint')
            }
          >
            <Button
              size="sm"
              variant={row.source === 'igdb' ? 'secondary' : 'ghost'}
              disabled={retry.isPending}
              onPress={() => retry.mutate(row)}
            >
              <RotateCw size={14} />
              {t('missing.retry')}
            </Button>
          </Tooltip>
          {row.source !== 'igdb' &&
          row.status === 'not_found' &&
          row.reason !== 'too_old' &&
          row.reason !== 'absent' ? (
            <Tooltip content={t('missing.markAbsentHint')}>
              <Button
                size="sm"
                variant="ghost"
                disabled={markAbsent.isPending}
                onPress={() => markAbsent.mutate(row)}
              >
                <SearchX size={14} />
                {t('missing.markAbsent')}
              </Button>
            </Tooltip>
          ) : null}
          {row.source !== 'igdb' && row.empty && !row.emptyAccepted ? (
            <Tooltip content={t('missing.acceptEmptyHint')}>
              <Button
                size="sm"
                variant="ghost"
                disabled={acceptEmpty.isPending}
                onPress={() => acceptEmpty.mutate(row)}
              >
                <CircleCheck size={14} />
                {t('missing.acceptEmpty')}
              </Button>
            </Tooltip>
          ) : null}
          {row.source !== 'igdb' ? (
            <Button
              size="sm"
              variant="secondary"
              onPress={() =>
                setSetting({
                  gameId: game.id,
                  slug: game.slug,
                  name: game.name,
                  coverImageId: game.coverImageId,
                  status: row.status,
                  reason: row.reason,
                  error: row.error,
                  source: row.source as SourceToSet['source'],
                })
              }
            >
              <Hash size={14} />
              {t('missing.setId')}
            </Button>
          ) : null}
        </>
      ),
    },
  ];

  return (
    <YStack gap={24}>
      <XStack justify="space-between" items="center" gap={8} flexWrap="wrap">
        <Button size="sm" variant="ghost" onPress={goBack}>
          <ChevronLeft size={14} />
          {t('game.back')}
        </Button>
        <DropdownMenu align="end">
          <DropdownMenuTrigger
            render={
              <Button ref={maintenanceTrigger} size="sm" variant="outline">
                {t('game.maintenance')}
                <ChevronDown size={14} />
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setMerging(true)}>
              {t('game.merge')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </XStack>

      <XStack gap={16} items="flex-start">
        <GameCover imageId={game.coverImageId} name={game.name} width={72} />
        <YStack flex={1} minW={0} gap={4}>
          <Text render="h2" fontSize={20} lineHeight="26px" fontWeight="600">
            {game.name}
          </Text>
          <Text fontSize={13} color="color11">
            {[
              game.igdbId ? `IGDB ${game.igdbId}` : t('game.noIgdb'),
              game.firstReleaseDate?.getFullYear(),
              game.gameType ? gameTypeLabels[game.gameType] : null,
              t('game.users', { count: game.users }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Link to="/games/$slug" params={{ slug: game.slug }}>
            <Text fontSize={13} color="color11" textDecorationLine="underline">
              {t('game.publicPage')} ↗
            </Text>
          </Link>
        </YStack>
      </XStack>

      <YStack gap={8}>
        <Text
          id="links"
          render="h3"
          tabIndex={-1}
          className="scroll-mt-24 max-md:scroll-mt-4"
          fontSize={16}
          fontWeight="600"
        >
          {t('game.links')}
        </Text>
        <Text
          fontSize={13}
          color="color11"
          style={{ overflowWrap: 'anywhere' }}
        >
          {game.igdbPlatforms.length > 0
            ? t('game.igdbPlatforms', {
                platforms: game.igdbPlatforms.join(', '),
              })
            : t('game.noIgdbPlatforms')}
        </Text>
        {detail.links.length === 0 ? (
          <Text fontSize={13} color="color11">
            {t('game.noLinks')}
          </Text>
        ) : (
          <AdminTable
            label={t('game.links')}
            columns={linkColumns}
            rows={detail.links}
            rowKey={(link) => link.id}
          />
        )}
      </YStack>

      <YStack gap={8}>
        <Text render="h3" fontSize={16} fontWeight="600">
          {t('game.sources')}
        </Text>
        <AdminTable
          label={t('game.sources')}
          columns={sourceColumns}
          rows={detail.sources}
          rowKey={(row) => row.source}
        />
      </YStack>

      <YStack gap={8}>
        <Text
          id="reports"
          render="h3"
          tabIndex={-1}
          className="scroll-mt-24 max-md:scroll-mt-4"
          fontSize={16}
          fontWeight="600"
        >
          {t('game.reports')}
        </Text>
        {detail.reports.length === 0 ? (
          <Text fontSize={13} color="color11">
            {t('game.noReports')}
          </Text>
        ) : (
          detail.reports.map((report) => (
            <XStack
              key={`${report.store ?? ''}-${report.source ?? ''}`}
              gap={12}
              items="flex-start"
              flexWrap="wrap"
              p={12}
              rounded={8}
              borderWidth={1}
              borderColor="border-color"
            >
              <YStack flex={1} minW={0} flexBasis="max-sm:100%" gap={4}>
                <Text fontSize={14} fontWeight="600">
                  {what(report)}
                </Text>
                <Text fontSize={12} color="color11">
                  {t('game.users', { count: report.users })}
                </Text>
                {report.suggestions.length > 0 ? (
                  <Text
                    fontSize={13}
                    color="color12"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {t('reported.suggestedFix')}:{' '}
                    {report.suggestions
                      .map((s) =>
                        [s.name, s.igdbId ? `IGDB ${s.igdbId}` : null]
                          .filter(Boolean)
                          .join(' · '),
                      )
                      .join('; ')}
                  </Text>
                ) : null}
                {report.notes.map((note, index) => (
                  <Text
                    key={index}
                    fontSize={12}
                    color="color11"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    «{note}»
                  </Text>
                ))}
              </YStack>
              <XStack gap={8} items="center" flexWrap="wrap">
                <ReportFix
                  report={report}
                  detail={detail}
                  onRepoint={setRepointing}
                  onSetId={setSetting}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={archive.isPending}
                  onPress={() => archive.mutate(report)}
                >
                  <Archive size={14} />
                  {t('games.archive')}
                </Button>
              </XStack>
            </XStack>
          ))
        )}
      </YStack>

      <RepointDialog
        link={repointing}
        gameName={game.name}
        gameIgdbId={game.igdbId}
        suggestions={detail.reports
          .filter((report) => report.store === repointing?.source)
          .flatMap((report) => report.suggestions)}
        onOpenChange={(open) => {
          if (!open) setRepointing(null);
        }}
        onDone={refresh}
      />
      <UnlinkLinkDialog
        link={unlinking}
        gameName={game.name}
        onOpenChange={(open) => {
          if (!open) setUnlinking(null);
        }}
        onRepoint={setRepointing}
        onDone={refresh}
      />
      <MergeDialog
        open={merging}
        game={game}
        onOpenChange={setMerging}
        onCloseAutoFocus={(event) => {
          // La voce di menu che apre il dialogo è già smontata alla chiusura.
          if (!maintenanceTrigger.current) return;
          event.cancel();
          maintenanceTrigger.current.focus();
        }}
        onDone={async (survivor) => {
          await refresh();
          // Se questo era l'assorbito il suo indirizzo non c'è più: si va al
          // gioco che resta.
          await router.navigate({
            to: '/admin/games/$slug',
            params: { slug: survivor.slug },
            replace: true,
          });
        }}
      />
      <SetSourceIdDialog
        row={setting}
        onOpenChange={(open) => {
          if (!open) setSetting(null);
        }}
        onSaved={refresh}
      />
    </YStack>
  );
}

function ReportFix({
  report,
  detail,
  onRepoint,
  onSetId,
}: {
  report: Report;
  detail: GameAdminDetail;
  onRepoint: (link: Link) => void;
  onSetId: (row: SourceToSet) => void;
}) {
  const t = useTranslations('admin');
  if (report.store) {
    const link = detail.links.find((row) => row.source === report.store);
    if (!link) return null;
    return (
      <Button size="sm" onPress={() => onRepoint(link)}>
        <Unlink size={14} />
        {t('game.notThis')}
      </Button>
    );
  }
  const source = detail.sources.find((row) => row.source === report.source);
  if (!report.source) return null;
  return (
    <Button
      size="sm"
      onPress={() =>
        onSetId({
          gameId: detail.game.id,
          slug: detail.game.slug,
          name: detail.game.name,
          coverImageId: detail.game.coverImageId,
          status: source?.status ?? 'pending',
          reason: source?.reason ?? null,
          error: source?.error ?? null,
          source: report.source!,
        })
      }
    >
      <Hash size={14} />
      {t('missing.setId')}
    </Button>
  );
}
