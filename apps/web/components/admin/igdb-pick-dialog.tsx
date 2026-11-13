import type { IgdbSearchHit } from '@repo/contracts';
import {
  Badge,
  Button,
  ClearableInput,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Skeleton,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import { Check, Search } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { CoverPreview } from '@/components/cover-preview';
import { PlatformCombobox } from '@/components/platform-combobox';
import { igdbCoverUrl } from '@/lib/igdb-image';
import { useGameTypeLabels } from '@/lib/labels';
import { api } from '@/lib/orpc';

import '../game-match.css';

// Ricerca esplicita: IGDB consente quattro richieste al secondo per server.
// Il filtro va inviato a IGDB, altrimenti la scheda giusta può restare fuori
// dai primi venti risultati prima ancora di filtrare.
export function IgdbPicker({
  initialQuery,
  selected,
  currentIgdbId,
  pending = false,
  onSelect,
}: {
  initialQuery: string;
  selected: IgdbSearchHit | null;
  currentIgdbId?: number | null;
  pending?: boolean;
  onSelect: (hit: IgdbSearchHit | null) => void;
}) {
  const t = useTranslations('admin.igdbPick');
  const tMatch = useTranslations('gameMatch');
  const tSearch = useTranslations('search');
  const inputId = useId();
  const gameTypeLabels = useGameTypeLabels();
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState<string | null>(
    initialQuery.trim().length >= 2 ? initialQuery.trim() : null,
  );
  const [platform, setPlatform] = useState<string | null>(null);
  const search = useQuery({
    ...api.games.search.queryOptions({
      input: { query: submitted ?? '', platform: platform ?? undefined },
    }),
    enabled: submitted !== null,
  });
  const platforms = useQuery(api.platforms.list.queryOptions());
  const filterable = useMemo(
    () => platforms.data?.filter((p) => p.igdbId !== null) ?? [],
    [platforms.data],
  );
  const submit = () => {
    if (query.trim().length < 2 || pending || search.isFetching) return;
    onSelect(null);
    if (submitted === query.trim()) void search.refetch();
    else setSubmitted(query.trim());
  };
  const changePlatform = (value: string | null) => {
    setPlatform(value);
    onSelect(null);
  };

  return (
    <YStack gap={16} minW={0}>
      <YStack gap={8}>
        <Label htmlFor={inputId}>{t('label')}</Label>
        <XStack gap={8} items="center">
          <YStack flex={1} minW={0}>
            <ClearableInput
              id={inputId}
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                onSelect(null);
              }}
              onSubmitEditing={submit}
              clearLabel={tSearch('clear')}
              placeholder={tMatch('searchPlaceholder')}
              disabled={pending}
              autoFocus
            />
          </YStack>
          <Button
            variant="outline"
            shrink={0}
            disabled={pending || query.trim().length < 2 || search.isFetching}
            onPress={submit}
          >
            <Search size={16} />
            {t('search')}
          </Button>
        </XStack>
        <Text fontSize={12} color="$color11">
          {t('hint')}
        </Text>
        <YStack
          maxW={260}
          width="100%"
          pointerEvents={pending ? 'none' : 'auto'}
          opacity={pending ? 0.5 : 1}
        >
          <PlatformCombobox
            aria-label={t('platform')}
            platforms={filterable}
            value={platform}
            onValueChange={(value) => {
              if (!pending) changePlatform(value);
            }}
            placeholder={t('allPlatforms')}
            clearLabel={t('clearPlatform')}
          />
        </YStack>
      </YStack>

      <YStack gap={8}>
        <Text fontSize={12} color="$color11" role="status">
          {search.isFetching
            ? tMatch('searching')
            : submitted === null
              ? tMatch('startSearch')
              : tMatch('results', { count: search.data?.length ?? 0 })}
        </Text>
        <YStack
          className="game-match-results"
          rounded={12}
          borderWidth={1}
          borderColor="$borderColor"
          p={4}
          gap={4}
          aria-busy={search.isFetching}
        >
          {search.isFetching ? (
            [0, 1, 2].map((index) => (
              <Skeleton key={index} height={112} width="100%" rounded={8} />
            ))
          ) : search.isError ? (
            <YStack p={16} gap={12} role="alert">
              <Text fontSize={13} color="$red11">
                {t('searchFailed')}
              </Text>
              <Button
                variant="outline"
                self="flex-start"
                onPress={() => void search.refetch()}
                disabled={pending}
              >
                {tMatch('retry')}
              </Button>
            </YStack>
          ) : submitted === null ? (
            <Text p={16} fontSize={13} color="$color11">
              {tMatch('startSearch')}
            </Text>
          ) : search.data?.length === 0 ? (
            <YStack p={16} gap={8}>
              <Text fontSize={14} fontWeight="600">
                {tMatch('noResultsFor', { query: submitted })}
              </Text>
              <Text fontSize={13} lineHeight={20} color="$color11">
                {tMatch('noResultsHint')}
              </Text>
              {platform ? (
                <Button
                  variant="outline"
                  self="flex-start"
                  onPress={() => changePlatform(null)}
                  disabled={pending}
                >
                  {t('clearPlatform')}
                </Button>
              ) : null}
            </YStack>
          ) : (
            search.data?.map((hit) => {
              const active = selected?.igdbId === hit.igdbId;
              const current = currentIgdbId === hit.igdbId;
              return (
                <YStack
                  key={hit.igdbId}
                  className="game-match-result"
                  p={10}
                  rounded={8}
                  borderWidth={1}
                  borderColor={
                    current
                      ? '$blue8'
                      : active
                        ? '$selectionBorder'
                        : 'transparent'
                  }
                  bg={
                    current
                      ? '$blue2'
                      : active
                        ? '$selectionBackground'
                        : 'transparent'
                  }
                  hoverStyle={{
                    bg: current
                      ? '$blue2'
                      : active
                        ? '$selectionBackground'
                        : '$color3',
                  }}
                >
                  <CoverPreview
                    sources={hit.cover ? [igdbCoverUrl(hit.cover)] : []}
                    name={hit.name}
                  />
                  <YStack minW={0} gap={4}>
                    {current ? (
                      <Badge bg="$blue3" borderColor="$blue8" self="flex-start">
                        <Text fontSize={12} color="$blue12">
                          {tMatch('alreadyLinked')}
                        </Text>
                      </Badge>
                    ) : null}
                    <Text
                      fontSize={14}
                      lineHeight={20}
                      fontWeight="600"
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {hit.name}
                    </Text>
                    <Text fontSize={12} color="$color11">
                      {[
                        hit.releaseYear,
                        hit.gameType && hit.gameType !== 'main_game'
                          ? gameTypeLabels[hit.gameType]
                          : null,
                        hit.developer,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    {hit.platforms.length > 0 ? (
                      <Text fontSize={12} lineHeight={18} color="$color11">
                        {hit.platforms.join(', ')}
                      </Text>
                    ) : null}
                    <Text fontSize={11} color="$color11">
                      IGDB {hit.igdbId}
                    </Text>
                  </YStack>
                  <YStack className="game-match-result-action">
                    <Button
                      size="sm"
                      variant={active ? 'selection' : 'outline'}
                      disabled={pending || current}
                      aria-pressed={active}
                      aria-label={
                        current
                          ? tMatch('alreadyLinkedGame', { name: hit.name })
                          : tMatch('selectGame', { name: hit.name })
                      }
                      onPress={() => {
                        if (!current) onSelect(hit);
                      }}
                    >
                      {active ? <Check size={14} /> : null}
                      {active ? tMatch('selected') : t('choose')}
                    </Button>
                  </YStack>
                </YStack>
              );
            })
          )}
        </YStack>
      </YStack>
    </YStack>
  );
}

export function IgdbSelectionFooter({
  selected,
  pending = false,
  confirmLabel,
  hint,
  onConfirm,
  onCancel,
}: {
  selected: IgdbSearchHit | null;
  pending?: boolean;
  confirmLabel?: string;
  hint?: string;
  onConfirm: (hit: IgdbSearchHit) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('gameMatch');
  return (
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
          fontWeight={selected ? '600' : '400'}
          color={selected ? '$color12' : '$color11'}
          style={{ overflowWrap: 'anywhere' }}
        >
          {selected
            ? `${selected.name}${selected.releaseYear ? ` (${selected.releaseYear})` : ''}`
            : t('selectHint')}
        </Text>
        {hint ? (
          <Text fontSize={12} lineHeight={18} color="$color11">
            {hint}
          </Text>
        ) : null}
      </YStack>
      <XStack
        gap={8}
        shrink={0}
        $max-sm={{ justify: 'flex-end', flexWrap: 'wrap' }}
      >
        <Button variant="outline" onPress={onCancel} disabled={pending}>
          {t('cancel')}
        </Button>
        <Button
          onPress={() => selected && onConfirm(selected)}
          disabled={!selected || pending}
        >
          <Check size={16} />
          {pending ? t('saving') : (confirmLabel ?? t('link'))}
        </Button>
      </XStack>
    </DialogFooter>
  );
}

export function IgdbPickDialog({
  open,
  onOpenChange,
  title,
  description,
  initialQuery,
  pending = false,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  initialQuery: string;
  pending?: boolean;
  onPick: (hit: IgdbSearchHit) => void;
}) {
  const t = useTranslations('gameMatch');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" closeLabel={t('close')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {open ? (
          <IgdbMatch
            key={initialQuery}
            initialQuery={initialQuery}
            pending={pending}
            onConfirm={onPick}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function IgdbMatch({
  initialQuery,
  pending = false,
  onConfirm,
  onCancel,
  reference,
  confirmLabel,
  hint,
}: {
  initialQuery: string;
  pending?: boolean;
  onConfirm: (hit: IgdbSearchHit) => void;
  onCancel: () => void;
  reference?: ReactNode;
  confirmLabel?: string;
  hint?: string;
}) {
  const [selected, setSelected] = useState<IgdbSearchHit | null>(null);
  return (
    <>
      <YStack className={reference ? 'game-match-layout' : undefined}>
        {reference ? (
          <YStack className="game-match-source" gap={16}>
            {reference}
          </YStack>
        ) : null}
        <IgdbPicker
          initialQuery={initialQuery}
          selected={selected}
          onSelect={setSelected}
          pending={pending}
        />
      </YStack>
      <IgdbSelectionFooter
        selected={selected}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmLabel={confirmLabel}
        hint={hint}
      />
    </>
  );
}
