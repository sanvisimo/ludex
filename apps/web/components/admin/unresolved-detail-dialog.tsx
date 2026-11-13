import {
  storePageUrl,
  type IgdbSearchHit,
  type UnresolvedGroup,
} from '@repo/contracts';
import { hiddenKindValues } from '@repo/contracts/vocabulary';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import { ChevronDown, EyeOff, Link2 } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';

import { IgdbMatch } from '@/components/admin/igdb-pick-dialog';
import { StoreEntryCard } from '@/components/store-entry-card';
import { api } from '@/lib/orpc';

export const globalKinds = hiddenKindValues.filter(
  (kind) => kind !== 'unwanted',
);
export type GlobalKind = (typeof globalKinds)[number];

export function useHiddenSummary() {
  const t = useTranslations('admin.unresolved');
  const tKind = useTranslations('account.hiddenTab.tabs');
  return (row: UnresolvedGroup, separator = ' · ') =>
    hiddenKindValues
      .filter((kind) => (row.hidden[kind] ?? 0) > 0)
      .map((kind) =>
        t('hiddenShort', { count: row.hidden[kind]!, kind: tKind(kind) }),
      )
      .join(separator);
}

export function UnresolvedDetailDialog({
  row,
  searching,
  onOpenChange,
  linkPending,
  hidePending,
  onLink,
  onHide,
}: {
  row: UnresolvedGroup | null;
  searching: boolean;
  onOpenChange: (open: boolean) => void;
  linkPending: boolean;
  hidePending: boolean;
  onLink: (row: UnresolvedGroup, hit: IgdbSearchHit) => void;
  onHide: (row: UnresolvedGroup, kind: GlobalKind) => void;
}) {
  const t = useTranslations('admin.unresolved');
  const tMatch = useTranslations('gameMatch');
  const tStore = useTranslations('store');
  const tKind = useTranslations('account.hiddenTab.tabs');
  const hiddenSummary = useHiddenSummary();
  const platforms = useQuery(api.platforms.list.queryOptions());
  const [search, setSearch] = useState(searching);

  useEffect(() => setSearch(searching), [row, searching]);

  const platform = row?.platformSlug
    ? (platforms.data?.find((p) => p.slug === row.platformSlug)?.name ??
      row.platformSlug)
    : null;
  const pageUrl = row ? storePageUrl(row.store, row.storePage) : null;
  const hidden = row ? hiddenSummary(row, ', ') : '';

  const reference = row ? (
    <>
      <StoreEntryCard
        reference
        store={row.store}
        externalIds={[row.externalId]}
        imageUrl={row.imageUrl}
        title={row.name}
        subtitle={[tStore(row.store), platform].filter(Boolean).join(' · ')}
        facts={[
          hidden ? t('detail.hidden', { list: hidden }) : t('detail.notHidden'),
        ]}
        pageUrl={pageUrl}
      >
        <Text fontSize={13} lineHeight={20}>
          {t('detail.libraries', {
            count: row.libraries,
            visible: row.visible,
          })}
        </Text>
      </StoreEntryCard>
      <XStack gap={8} flexWrap="wrap">
        {!search ? (
          <Button onPress={() => setSearch(true)}>
            <Link2 size={16} />
            {t('link')}
          </Button>
        ) : null}
        <DropdownMenu align="start">
          <DropdownMenuTrigger
            render={
              <Button variant="outline" disabled={hidePending || linkPending}>
                <EyeOff size={16} />
                {t('hide')}
                <ChevronDown size={14} />
              </Button>
            }
          />
          <DropdownMenuContent>
            {globalKinds.map((kind) => (
              <DropdownMenuItem key={kind} onClick={() => onHide(row, kind)}>
                {t('hideAs', { kind: tKind(kind) })}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </XStack>
    </>
  ) : null;

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent
        size={search ? 'wide' : 'default'}
        $lg={{ maxW: search ? 960 : 560 }}
        closeLabel={tMatch('close')}
      >
        <DialogHeader>
          <DialogTitle>{row?.name ?? ''}</DialogTitle>
        </DialogHeader>
        {row ? (
          search ? (
            <IgdbMatch
              key={`${row.store}-${row.externalId}`}
              initialQuery={row.name}
              pending={linkPending || hidePending}
              onConfirm={(hit) => onLink(row, hit)}
              onCancel={() => onOpenChange(false)}
              confirmLabel={t('link')}
              hint={t('detail.linkHint')}
              reference={reference}
            />
          ) : (
            <YStack gap={16}>{reference}</YStack>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
