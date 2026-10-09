import type { GameAdminDetail } from '@repo/contracts';
import {
  Badge,
  Button,
  EmptyState,
  Skeleton,
  Text,
  toast,
  Tooltip,
  XStack,
  YStack,
} from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import {
  AdminTable,
  CellText,
  type AdminColumn,
} from '@/components/admin/admin-table';
import { RepointDialog } from '@/components/admin/repoint-dialog';
import {
  SetSourceIdDialog,
  type SourceToSet,
} from '@/components/admin/set-source-id-dialog';
import { GameCover } from '@/components/game-cover';
import { useApiErrorMessage } from '@/lib/api-error';
import { useGameTypeLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';
import { ExternalLink } from '@/src/components/external-link';

// `giochi_` e non `giochi`: la scheda non sta dentro la lista, le sta accanto.
export const Route = createFileRoute('/_app/admin/giochi/$slug')({
  component: GameAdminPage,
});

type Link = GameAdminDetail['links'][number];
type Source = GameAdminDetail['sources'][number];
type Report = GameAdminDetail['reports'][number];

/**
 * La scheda admin di un gioco (11a, frame 5 del wireframe): tutto ciò che
 * l'admin può correggere su un gioco solo. I collegamenti dai negozi, con
 * «Non è questo gioco»; le fonti, con «Ritenta» e «Inserisci id», anche su una
 * fonte `ok` agganciata male; le segnalazioni aperte.
 */
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

/** Lo stato di una fonte, nel colore dello stato: ok, da guardare, rotto, in attesa. */
const STATUS_BADGE = {
  ok: 'success',
  not_found: 'warning',
  failed: 'error',
  pending: 'secondary',
} as const;

function GameAdmin({ detail }: { detail: GameAdminDetail }) {
  const t = useTranslations('admin');
  const tStore = useTranslations('store');
  const gameTypeLabels = useGameTypeLabels();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [repointing, setRepointing] = useState<Link | null>(null);
  const [setting, setSetting] = useState<SourceToSet | null>(null);
  const { game } = detail;

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
      : t(`source.${report.source!}`);

  const linkColumns: AdminColumn<Link>[] = [
    {
      key: 'store',
      header: t('game.store'),
      width: 160,
      render: (link) => <CellText>{tStore(link.source)}</CellText>,
    },
    {
      key: 'id',
      header: t('game.externalId'),
      flex: 2,
      // Il link alla pagina sul negozio, per controllare che sia il gioco
      // giusto: dove il negozio un link non lo dà, solo l'id.
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
      key: 'copies',
      header: t('game.copies'),
      flex: 1,
      render: (link) => (
        <CellText muted>
          {t('game.copiesCount', { users: link.users, copies: link.copies })}
        </CellText>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 170,
      render: (link) => (
        <Button size="sm" variant="outline" onPress={() => setRepointing(link)}>
          {t('game.notThis')}
        </Button>
      ),
    },
  ];

  const sourceColumns: AdminColumn<Source>[] = [
    {
      key: 'source',
      header: t('game.source'),
      width: 130,
      render: (row) => <CellText>{t(`source.${row.source}`)}</CellText>,
    },
    {
      key: 'state',
      header: t('game.state'),
      width: 110,
      // Lo stato è la cosa che l'occhio cerca: un `Badge` coi colori degli
      // stati del design system, non testo uguale al resto.
      render: (row) => (
        <Badge variant={STATUS_BADGE[row.status]}>
          {t(`status.${row.status}`)}
        </Badge>
      ),
    },
    {
      key: 'id',
      header: t('game.id'),
      flex: 1,
      minWidth: 120,
      // Il link alla scheda sulla fonte, per controllare che sia quella giusta.
      render: (row) => {
        const id =
          row.externalId ??
          (row.source === 'igdb' ? (game.igdbId ?? '—') : '—');
        const label = `${id}${row.manual ? ` · ${t('missing.manual')}` : ''}`;
        return row.url ? (
          <ExternalLink href={row.url}>
            <CellText wrap>{label} ↗</CellText>
          </ExternalLink>
        ) : (
          <CellText wrap>{label}</CellText>
        );
      },
    },
    {
      key: 'reason',
      header: t('game.reason'),
      flex: 2,
      minWidth: 160,
      render: (row) => (
        <YStack flex={1} minW={0} gap={2}>
          {row.reason ? (
            <Text
              fontSize={13}
              lineHeight={18}
              fontWeight="600"
              color="$color12"
            >
              {t(`reason.${row.reason}`)}
            </Text>
          ) : null}
          {row.error ? (
            <CellText muted wrap>
              {row.error}
            </CellText>
          ) : null}
        </YStack>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 196,
      render: (row) => (
        <>
          <Tooltip content={t('missing.retryHint')}>
            <Button
              size="sm"
              variant="outline"
              disabled={retry.isPending}
              onPress={() => retry.mutate(row)}
            >
              {t('missing.retry')}
            </Button>
          </Tooltip>
          {row.source !== 'igdb' ? (
            <Button
              size="sm"
              variant="outline"
              onPress={() =>
                setSetting({
                  gameId: game.id,
                  name: game.name,
                  coverImageId: game.coverImageId,
                  status: row.status,
                  reason: row.reason,
                  error: row.error,
                  source: row.source as SourceToSet['source'],
                })
              }
            >
              {t('missing.setId')}
            </Button>
          ) : null}
        </>
      ),
    },
  ];

  return (
    <YStack gap={24}>
      {/* Alla scheda si arriva da più posti — segnalati, dati mancanti, la
          ricerca — e «indietro» torna da dove si è venuti. */}
      <Text
        render="button"
        fontSize={13}
        color="$color11"
        cursor="pointer"
        self="flex-start"
        bg="transparent"
        borderWidth={0}
        p={0}
        onPress={() => router.history.back()}
      >
        ‹ {t('game.back')}
      </Text>

      <XStack gap={16} items="flex-start">
        <GameCover imageId={game.coverImageId} name={game.name} width={72} />
        <YStack flex={1} minW={0} gap={4}>
          <Text render="h2" fontSize={20} lineHeight={26} fontWeight="600">
            {game.name}
          </Text>
          <Text fontSize={13} color="$color11">
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
            <Text fontSize={13} color="$color11" textDecorationLine="underline">
              {t('game.publicPage')} ↗
            </Text>
          </Link>
        </YStack>
      </XStack>

      <YStack gap={8}>
        <Text render="h3" fontSize={16} fontWeight="600">
          {t('game.links')}
        </Text>
        {detail.links.length === 0 ? (
          <Text fontSize={13} color="$color11">
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
        <Text render="h3" fontSize={16} fontWeight="600">
          {t('game.reports')}
        </Text>
        {detail.reports.length === 0 ? (
          <Text fontSize={13} color="$color11">
            {t('game.noReports')}
          </Text>
        ) : (
          detail.reports.map((report) => (
            <XStack
              key={`${report.store ?? ''}-${report.source ?? ''}`}
              gap={12}
              items="center"
              p={10}
              rounded={8}
              borderWidth={1}
              borderColor="$borderColor"
            >
              <YStack flex={1} minW={0} gap={2}>
                <Text fontSize={13} fontWeight="500">
                  {what(report)} · {t('game.users', { count: report.users })}
                </Text>
                {report.suggestions.length > 0 ? (
                  <Text fontSize={12} color="$color11">
                    {t('games.suggested')}:{' '}
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
                  <Text key={index} fontSize={12} color="$color11">
                    «{note}»
                  </Text>
                ))}
              </YStack>
              {/* Il gesto che risolve la segnalazione, accanto a lei: sulla
                  copia si ripunta il collegamento di quel negozio, sulla fonte
                  si scrive l'id. Prima stava solo nelle tabelle sopra, e
                  sembrava che si potesse soltanto archiviare. */}
              <ReportFix
                report={report}
                detail={detail}
                onRepoint={setRepointing}
                onSetId={setSetting}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={archive.isPending}
                onPress={() => archive.mutate(report)}
              >
                {t('games.archive')}
              </Button>
            </XStack>
          ))
        )}
      </YStack>

      <RepointDialog
        link={repointing}
        gameName={game.name}
        suggestions={detail.reports
          .filter((report) => report.store === repointing?.source)
          .flatMap((report) => report.suggestions)}
        onOpenChange={(open) => {
          if (!open) setRepointing(null);
        }}
        onDone={refresh}
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

/** Il gesto che risolve una segnalazione: ripuntare la copia, o l'id della fonte. */
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
          name: detail.game.name,
          coverImageId: detail.game.coverImageId,
          status: source?.status ?? 'pending',
          reason: source?.reason ?? null,
          error: source?.error ?? null,
          source: report.source!,
        })
      }
    >
      {t('missing.setId')}
    </Button>
  );
}
