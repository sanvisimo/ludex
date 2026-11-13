import type {
  BacklogEntry,
  GameDetail,
  IgdbSearchHit,
  ReportTarget,
} from '@repo/contracts';
import { storePageUrl } from '@repo/contracts';
import type { ManualSource, Store } from '@repo/contracts/vocabulary';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
  Textarea,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { Flag } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import { IgdbPicker } from '@/components/admin/igdb-pick-dialog';
import { StoreEntryCard } from '@/components/store-entry-card';
import { useApiErrorMessage } from '@/lib/api-error';
import { useDuration } from '@/lib/duration';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';

const SOURCES: ManualSource[] = ['hltb', 'opencritic', 'metacritic'];

const keyOf = (target: ReportTarget) =>
  'store' in target ? `store:${target.store}` : `source:${target.source}`;

export function ReportError({
  game,
  entry,
}: {
  game: GameDetail;
  entry: BacklogEntry | null;
}) {
  const t = useTranslations('game.report');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const reports = useQuery(
    api.reports.openForGame.queryOptions({ input: { gameId: game.id } }),
  );
  const last = reports.data?.at(-1);

  return (
    <>
      <XStack gap={8} items="center" flexWrap="wrap">
        {last ? (
          <Text fontSize={13} color="$color11">
            {t('sent', {
              date: format.dateTime(last.updatedAt, {
                day: '2-digit',
                month: '2-digit',
              }),
            })}
          </Text>
        ) : null}
        <Button size="sm" variant="ghost" onPress={() => setOpen(true)}>
          <Flag size={14} color="$color11" />
          {last ? t('again') : t('open')}
        </Button>
      </XStack>
      {open ? (
        <ReportDialog
          game={game}
          entry={entry}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ReportDialog({
  game,
  entry,
  onClose,
}: {
  game: GameDetail;
  entry: BacklogEntry | null;
  onClose: () => void;
}) {
  const t = useTranslations('game.report');
  const tMatch = useTranslations('gameMatch');
  const tGame = useTranslations('game');
  const format = useFormatter();
  const duration = useDuration();
  const storeLabels = useStoreLabels();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [suggested, setSuggested] = useState<IgdbSearchHit | null>(null);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  const stores = [
    ...new Set(
      (entry?.ownerships ?? [])
        .map((ownership) => ownership.store)
        .filter((store): store is Store => store !== null),
    ),
  ];

  const myCopies = useQuery({
    ...api.reports.myCopies.queryOptions({ input: { gameId: game.id } }),
    enabled: stores.length > 0,
  });
  const platforms = useQuery({
    ...api.platforms.list.queryOptions(),
    staleTime: Infinity,
  });
  const copiesOf = (store: Store) =>
    (entry?.ownerships ?? []).flatMap((ownership) => {
      const detail = myCopies.data?.find(
        (copy) => copy.ownershipId === ownership.id,
      );
      return ownership.store === store && detail ? [{ ownership, detail }] : [];
    });

  const storeTitle = stores
    .filter((store) => checked.has(keyOf({ store })))
    .flatMap(copiesOf)
    .map(({ detail }) => detail.storeTitle)
    .find((title) => title !== null);

  const targets: { target: ReportTarget; label: string }[] = [
    ...stores.map((store) => ({
      target: { store },
      label: t('copy', { store: storeLabels[store] }),
    })),
    ...SOURCES.filter(
      (source) => source !== 'opencritic' || game.showOpenCritic,
    ).map((source) => ({
      target: { source },
      label: t(source),
    })),
  ];

  const send = useMutation({
    mutationFn: () =>
      client.reports.create({
        gameId: game.id,
        targets: targets
          .filter(({ target }) => checked.has(keyOf(target)))
          .map(({ target }) => target),
        suggestedIgdbId: suggested?.igdbId,
        suggestedName: suggested ? suggested.name : name.trim() || undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: api.reports.openForGame.key(),
      });
      toast.success(t('thanks'));
      onClose();
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  // Una data e non «3 mesi fa»: server e browser scriverebbero due testi diversi.
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'medium' });
  const copyFacts = (ownership: BacklogEntry['ownerships'][number]) =>
    [
      ownership.playtimeMinutes
        ? tGame('played', { duration: duration(ownership.playtimeMinutes) })
        : null,
      ownership.lastPlayedAt
        ? tGame('lastPlayed', { date: date(ownership.lastPlayedAt) })
        : null,
      ownership.acquiredAt
        ? tGame('acquired', { date: date(ownership.acquiredAt) })
        : null,
    ].filter((fact) => fact !== null);

  const toggle = (key: string, on: boolean) => {
    if (key.startsWith('store:')) setSuggested(null);
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent
        size="wide"
        $lg={{ maxW: 960 }}
        closeLabel={tMatch('close')}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <YStack className="game-match-layout">
          <YStack className="game-match-source" gap={12}>
            <Text fontSize={13} fontWeight="500">
              {t('what')}
            </Text>
            {targets.map(({ target, label }) => {
              const key = keyOf(target);
              return (
                <YStack key={key} gap={8}>
                  <XStack gap={8} items="center">
                    <Checkbox
                      id={`report-${key}`}
                      checked={checked.has(key)}
                      onCheckedChange={(value) => toggle(key, value === true)}
                    />
                    <Label htmlFor={`report-${key}`}>{label}</Label>
                  </XStack>
                  {'store' in target && checked.has(key) ? (
                    <YStack gap={12} pb={4}>
                      {copiesOf(target.store).map(({ ownership, detail }) => (
                        <StoreEntryCard
                          reference
                          key={ownership.id}
                          store={target.store}
                          externalIds={detail.externalIds}
                          imageUrl={detail.storeImageUrl}
                          title={detail.storeTitle}
                          releaseYear={detail.storeReleaseYear}
                          subtitle={[
                            storeLabels[target.store],
                            platforms.data?.find(
                              (p) => p.slug === ownership.platformSlug,
                            )?.name ?? ownership.platformSlug,
                            ownership.storeAccount?.label,
                            ownership.storeAccount?.displayName,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          facts={copyFacts(ownership)}
                          pageUrl={storePageUrl(
                            ownership.store,
                            ownership.storePage,
                          )}
                        />
                      ))}
                    </YStack>
                  ) : null}
                </YStack>
              );
            })}
          </YStack>

          <YStack gap={16} minW={0}>
            <YStack gap={8}>
              <Text fontSize={13} fontWeight="500">
                {t('suggest')}
              </Text>
              {searching ? (
                <YStack gap={12}>
                  <IgdbPicker
                    key={storeTitle ?? game.name}
                    initialQuery={storeTitle ?? game.name}
                    selected={suggested}
                    pending={send.isPending}
                    onSelect={setSuggested}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    self="flex-start"
                    disabled={send.isPending}
                    onPress={() => {
                      setSuggested(null);
                      setSearching(false);
                    }}
                  >
                    {t('orName')}
                  </Button>
                </YStack>
              ) : (
                <>
                  <Button
                    variant="outline"
                    self="flex-start"
                    onPress={() => setSearching(true)}
                  >
                    {t('searchIgdb')}
                  </Button>
                  <YStack gap={6}>
                    <Label htmlFor="report-name">{t('orName')}</Label>
                    <Input
                      id="report-name"
                      value={name}
                      onChangeText={setName}
                      maxLength={200}
                    />
                  </YStack>
                </>
              )}
            </YStack>

            <YStack gap={6}>
              <Label htmlFor="report-note">{t('note')}</Label>
              <Textarea
                id="report-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t('notePlaceholder')}
                maxLength={1000}
              />
            </YStack>
          </YStack>
        </YStack>

        <DialogFooter
          flexWrap="wrap"
          $max-sm={{ flexDirection: 'column', items: 'stretch' }}
        >
          {suggested ? (
            <Text
              flex={1}
              $max-sm={{ grow: 0, shrink: 0, flexBasis: 'auto' }}
              minW={0}
              fontSize={13}
              style={{ overflowWrap: 'anywhere' }}
              role="status"
            >
              {t('chosen', {
                name: `${suggested.name}${suggested.releaseYear ? ` (${suggested.releaseYear})` : ''}`,
                id: suggested.igdbId,
              })}
            </Text>
          ) : null}
          <Button variant="outline" onPress={onClose} disabled={send.isPending}>
            {t('cancel')}
          </Button>
          <Button
            onPress={() => send.mutate()}
            disabled={checked.size === 0 || send.isPending}
          >
            {t('send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
