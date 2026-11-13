import type { MissingRow } from '@repo/contracts';
import type { ManualSource } from '@repo/contracts/vocabulary';
import {
  Alert,
  AlertDescription,
  Button,
  ClearableInput,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Skeleton,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { Check, Search } from '@repo/ui/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import { CoverPreview } from '@/components/cover-preview';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-error';
import { igdbCoverUrl } from '@/lib/igdb-image';
import { useGameTypeLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';
import { ExternalLink } from '@/src/components/external-link';

import '../game-match.css';

export type SourceToSet = Pick<
  MissingRow,
  'gameId' | 'slug' | 'name' | 'coverImageId' | 'status' | 'reason' | 'error'
> & { source: ManualSource };

type SourceHit = {
  id: string;
  name: string;
  releaseYear: number | null;
  image: string | null;
  score?: string;
};

// Il match salva i candidati nell'errore testuale; se il formato cambia,
// l'inserimento manuale deve restare disponibile senza candidati suggeriti.
export function rejectedCandidates(error: string | null) {
  const elenco = error?.split('": ').slice(1).join('": ');
  if (!elenco) return [];
  return elenco
    .split('; ')
    .map((voce) => voce.match(/^(.*) \((\d+)(?:, ([\d.]+))?\)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map(([, name, id, score]) => ({ name: name!, id: id!, score }));
}

export function SetSourceIdDialog({
  row,
  onOpenChange,
  onSaved,
}: {
  row: SourceToSet | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<unknown>;
}) {
  const t = useTranslations('gameMatch');
  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent size="wide" $lg={{ maxW: 960 }} closeLabel={t('close')}>
        {row ? (
          <SourceIdForm
            key={`${row.gameId}-${row.source}`}
            row={row}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SourceIdForm({
  row,
  onClose,
  onSaved,
}: {
  row: SourceToSet;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const t = useTranslations('admin');
  const tMatch = useTranslations('gameMatch');
  const tStore = useTranslations('store');
  const tSearch = useTranslations('search');
  const inputId = useId();
  const gameTypeLabels = useGameTypeLabels();
  const errorMessage = useApiErrorMessage();
  const [value, setValue] = useState(row.name);
  const [selected, setSelected] = useState<SourceHit | null>(null);
  const [asked, setAsked] = useState('');
  const [invalid, setInvalid] = useState(false);
  const proposed = selected?.id ?? value.trim();

  useEffect(() => {
    const timer = setTimeout(() => setAsked(proposed), 300);
    return () => clearTimeout(timer);
  }, [proposed]);

  const lookup = useQuery({
    ...api.admin.sources.lookup.queryOptions({
      input: {
        gameId: row.gameId,
        source: row.source,
        externalId: asked,
      },
    }),
    enabled: asked !== '',
    retry: false,
  });
  const checked = asked === proposed;
  const validId = checked && lookup.isSuccess ? lookup.data.externalId : null;
  const owner = checked ? lookup.data?.owner : null;
  const lookupFailed =
    checked && lookup.isError && !hasErrorCode(lookup.error, 'BAD_REQUEST');

  const detail = useQuery(
    api.admin.games.detail.queryOptions({ input: { slug: row.slug } }),
  );
  const game = detail.data?.game;
  const current = detail.data?.sources.find(
    (source) => source.source === row.source,
  );
  const search = useMutation({
    mutationFn: (query: string) =>
      client.admin.sources.search({ source: row.source, query }),
  });
  const save = useMutation({
    mutationFn: (externalId: string) =>
      client.admin.sources.setExternalId({
        gameId: row.gameId,
        source: row.source,
        externalId,
      }),
    onSuccess: async () => {
      await onSaved();
      toast.success(t('setId.saved'));
      onClose();
    },
    onError: (error) => {
      if (hasErrorCode(error, 'BAD_REQUEST')) setInvalid(true);
      else toast.error(errorMessage(error, { fallback: t('setId.failed') }));
    },
  });
  const sourceName = t(`source.${row.source}`);
  const candidates = rejectedCandidates(row.error);
  const canSearch =
    value.trim().length >= 2 &&
    value.trim().length <= 100 &&
    !search.isPending &&
    !save.isPending;
  const submit = () => {
    if (!canSearch) return;
    setSelected(null);
    setInvalid(false);
    search.mutate(value.trim());
  };
  const select = (hit: SourceHit) => {
    setSelected(hit);
    setInvalid(false);
  };
  const searchError = search.error
    ? hasErrorCode(search.error, 'TOO_MANY_REQUESTS')
      ? t('setId.quota')
      : hasErrorCode(search.error, 'PRECONDITION_FAILED')
        ? t('setId.disabled')
        : t('setId.searchFailed')
    : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('setId.title', { source: sourceName })}</DialogTitle>
      </DialogHeader>
      <YStack className="game-match-layout">
        <YStack className="game-match-source" gap={16}>
          <YStack className="game-match-reference">
            <CoverPreview
              sources={row.coverImageId ? [igdbCoverUrl(row.coverImageId)] : []}
              name={row.name}
              width={90}
              desktopWidth={160}
            />
            <YStack minW={0} gap={8}>
              <Text
                fontSize={16}
                lineHeight={22}
                fontWeight="600"
                style={{ overflowWrap: 'anywhere' }}
              >
                {row.name}
              </Text>
              <Text fontSize={13} lineHeight={20} color="$color11">
                {t('setId.state', {
                  status: row.reason
                    ? `${t(`status.${row.status}`)} · ${t(`reason.${row.reason}`)}`
                    : t(`status.${row.status}`),
                })}
              </Text>
              {game ? (
                <Text fontSize={12} lineHeight={18} color="$color11">
                  {[
                    game.firstReleaseDate?.getFullYear(),
                    game.gameType ? gameTypeLabels[game.gameType] : null,
                    game.igdbId ? null : t('game.noIgdb'),
                    t('game.users', { count: game.users }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              ) : null}
              <details className="game-match-details">
                <summary>{t('setId.gameDetails')}</summary>
                <YStack gap={8} pt={8}>
                  {detail.isPending ? (
                    <Skeleton height={48} />
                  ) : detail.isError ? (
                    <Text fontSize={12} color="$red11">
                      {t('game.notFound')}
                    </Text>
                  ) : null}
                  {game?.igdbId && game.igdbSlug ? (
                    <Text fontSize={12} lineHeight={18}>
                      IGDB {game.igdbId} ·{' '}
                      <ExternalLink
                        href={`https://www.igdb.com/games/${game.igdbSlug}`}
                      >
                        {game.igdbSlug} ↗
                      </ExternalLink>
                    </Text>
                  ) : null}
                  {detail.data?.links.map((link) => (
                    <Text
                      key={link.id}
                      fontSize={12}
                      lineHeight={18}
                      color="$color11"
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {tStore(link.source)} ·{' '}
                      {link.url ? (
                        <ExternalLink href={link.url}>
                          {link.externalId} ↗
                        </ExternalLink>
                      ) : (
                        link.externalId
                      )}{' '}
                      ·{' '}
                      {t('game.copiesCount', {
                        users: link.users,
                        copies: link.copies,
                      })}
                    </Text>
                  ))}
                  {current?.externalId ? (
                    <Text
                      fontSize={12}
                      lineHeight={18}
                      color="$color11"
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {sourceName} ·{' '}
                      {current.url ? (
                        <ExternalLink href={current.url}>
                          {current.externalId} ↗
                        </ExternalLink>
                      ) : (
                        current.externalId
                      )}
                      {current.manual ? ` · ${t('missing.manual')}` : ''}
                    </Text>
                  ) : null}
                </YStack>
              </details>
            </YStack>
          </YStack>
        </YStack>
        <YStack gap={16} minW={0}>
          <YStack gap={8}>
            <Label htmlFor={inputId}>{t('setId.label')}</Label>
            <XStack gap={8} items="center">
              <YStack flex={1} minW={0}>
                <ClearableInput
                  id={inputId}
                  value={value}
                  onChangeText={(next) => {
                    setValue(next);
                    setSelected(null);
                    setInvalid(false);
                  }}
                  onSubmitEditing={submit}
                  clearLabel={tSearch('clear')}
                  disabled={save.isPending}
                  autoFocus
                />
              </YStack>
              <Button
                variant="outline"
                shrink={0}
                disabled={!canSearch}
                onPress={submit}
              >
                <Search size={16} />
                {t('setId.search')}
              </Button>
            </XStack>
            <Text fontSize={12} lineHeight={18} color="$color11">
              {t('setId.manualHint')}
            </Text>
          </YStack>
          {row.source === 'opencritic' ? (
            <Alert>
              <AlertDescription>
                {t('setId.cost')}
                {search.data?.searchesLeft != null
                  ? ` ${t('setId.left', { count: search.data.searchesLeft })}`
                  : ''}
              </AlertDescription>
            </Alert>
          ) : null}
          {invalid ? (
            <Text fontSize={13} color="$red11" role="alert">
              {t('setId.invalid')}
            </Text>
          ) : owner ? (
            <Alert>
              <AlertDescription>
                {t('setId.taken', {
                  id: lookup.data!.externalId,
                  game: owner.name,
                })}
              </AlertDescription>
            </Alert>
          ) : null}
          {lookupFailed ? (
            <YStack gap={8}>
              <Text fontSize={13} color="$red11" role="alert">
                {t('setId.lookupFailed')}
              </Text>
              <Button
                variant="outline"
                self="flex-start"
                onPress={() => void lookup.refetch()}
                disabled={save.isPending}
              >
                {tMatch('retry')}
              </Button>
            </YStack>
          ) : null}
          {candidates.length > 0 ? (
            <details className="game-match-details">
              <summary>{t('setId.candidates')}</summary>
              <YStack className="game-match-results" gap={4} pt={8}>
                {candidates.map((candidate) => (
                  <SourceResult
                    key={candidate.id}
                    hit={{ ...candidate, releaseYear: null, image: null }}
                    active={selected?.id === candidate.id}
                    pending={save.isPending}
                    onSelect={select}
                  />
                ))}
              </YStack>
            </details>
          ) : null}
          <YStack gap={8}>
            <Text fontSize={12} color="$color11" role="status">
              {search.isPending
                ? tMatch('searching')
                : search.data
                  ? tMatch('results', { count: search.data.hits.length })
                  : t('setId.results')}
            </Text>
            <YStack
              className="game-match-results"
              p={4}
              gap={4}
              rounded={12}
              borderWidth={1}
              borderColor="$borderColor"
              aria-busy={search.isPending}
            >
              {search.isPending ? (
                [0, 1, 2].map((i) => (
                  <Skeleton key={i} height={112} rounded={8} />
                ))
              ) : searchError ? (
                <YStack p={16} gap={12} role="alert">
                  <Text fontSize={13} color="$red11">
                    {searchError}
                  </Text>
                  {hasErrorCode(search.error, 'TOO_MANY_REQUESTS') ||
                  hasErrorCode(search.error, 'PRECONDITION_FAILED') ? null : (
                    <Button
                      variant="outline"
                      self="flex-start"
                      onPress={submit}
                      disabled={!canSearch}
                    >
                      {tMatch('retry')}
                    </Button>
                  )}
                </YStack>
              ) : search.data ? (
                search.data.hits.length === 0 ? (
                  <YStack p={16} gap={8}>
                    <Text fontSize={14} fontWeight="600">
                      {tMatch('noResultsFor', {
                        query: search.variables ?? '',
                      })}
                    </Text>
                    <Text fontSize={13} lineHeight={20} color="$color11">
                      {t('setId.emptyHint')}
                    </Text>
                  </YStack>
                ) : (
                  search.data.hits.map((hit) => (
                    <SourceResult
                      key={hit.id}
                      hit={hit}
                      active={selected?.id === hit.id}
                      pending={save.isPending}
                      onSelect={select}
                    />
                  ))
                )
              ) : (
                <Text p={16} fontSize={13} lineHeight={20} color="$color11">
                  {t('setId.searchHint')}
                </Text>
              )}
            </YStack>
          </YStack>
        </YStack>
      </YStack>
      <DialogFooter
        flexWrap="wrap"
        items="center"
        $max-sm={{ flexDirection: 'column', items: 'stretch' }}
      >
        <YStack
          flex={1}
          minW={0}
          gap={4}
          $max-sm={{ grow: 0, shrink: 0, flexBasis: 'auto' }}
          role="status"
        >
          <Text
            fontSize={13}
            lineHeight={20}
            fontWeight={selected || validId ? '600' : '400'}
            color={selected || validId ? '$color12' : '$color11'}
            style={{ overflowWrap: 'anywhere' }}
          >
            {selected
              ? `${selected.name}${selected.releaseYear ? ` (${selected.releaseYear})` : ''}`
              : validId
                ? t('setId.manualSelection')
                : t('setId.selectionHint')}
          </Text>
          {selected || validId ? (
            <Text
              fontSize={12}
              color="$color11"
              style={{ overflowWrap: 'anywhere' }}
            >
              {sourceName} · {validId ?? proposed}
            </Text>
          ) : null}
        </YStack>
        <XStack
          gap={8}
          shrink={0}
          $max-sm={{ justify: 'flex-end', flexWrap: 'wrap' }}
        >
          <Button variant="outline" onPress={onClose} disabled={save.isPending}>
            {tMatch('cancel')}
          </Button>
          <Button
            disabled={
              !validId ||
              lookup.isFetching ||
              save.isPending ||
              search.isPending
            }
            onPress={() => {
              if (validId) save.mutate(validId);
            }}
          >
            <Check size={16} />
            {save.isPending ? t('setId.saving') : t('setId.save')}
          </Button>
        </XStack>
      </DialogFooter>
    </>
  );
}

function SourceResult({
  hit,
  active,
  pending,
  onSelect,
}: {
  hit: SourceHit;
  active: boolean;
  pending: boolean;
  onSelect: (hit: SourceHit) => void;
}) {
  const t = useTranslations('admin.setId');
  const tMatch = useTranslations('gameMatch');
  return (
    <YStack
      className="game-match-result"
      p={10}
      rounded={8}
      borderWidth={1}
      borderColor={active ? '$selectionBorder' : 'transparent'}
      bg={active ? '$selectionBackground' : 'transparent'}
      hoverStyle={{ bg: active ? '$selectionBackground' : '$color3' }}
    >
      <CoverPreview
        key={hit.image}
        sources={hit.image ? [hit.image] : []}
        name={hit.name}
      />
      <YStack minW={0} gap={4}>
        <Text
          fontSize={14}
          lineHeight={20}
          fontWeight="600"
          style={{ overflowWrap: 'anywhere' }}
        >
          {hit.name}
        </Text>
        {hit.releaseYear ? (
          <Text fontSize={12} color="$color11">
            {hit.releaseYear}
          </Text>
        ) : null}
        <Text
          fontSize={12}
          color="$color11"
          style={{ overflowWrap: 'anywhere' }}
        >
          {hit.id}
          {hit.score ? ` · ${hit.score}` : ''}
        </Text>
      </YStack>
      <YStack className="game-match-result-action">
        <Button
          size="sm"
          variant={active ? 'selection' : 'outline'}
          disabled={pending}
          aria-pressed={active}
          aria-label={tMatch('selectGame', { name: hit.name })}
          onPress={() => onSelect(hit)}
        >
          {active ? <Check size={14} /> : null}
          {active ? tMatch('selected') : t('choose')}
        </Button>
      </YStack>
    </YStack>
  );
}
