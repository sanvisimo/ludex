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
  Separator,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import { ChevronDown } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';

import { IgdbPicker } from '@/components/admin/igdb-pick-dialog';
import { UnresolvedCover } from '@/components/unresolved-row';
import { api } from '@/lib/orpc';
import { ExternalLink } from '@/src/components/external-link';

/** I tipi che si nascondono per tutti: `unwanted` è una preferenza. */
export const globalKinds = hiddenKindValues.filter(
  (kind) => kind !== 'unwanted',
);
export type GlobalKind = (typeof globalKinds)[number];

/** «7 App · 2 DLC», la forma corta per la cella della tabella. */
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

/**
 * Il dettaglio di uno scarto (11a): la voce com'è, con la copertina grande e
 * tutti i dati, e i due gesti per tutti. Nella tabella i testi si tagliano e
 * non si capisce cosa si sta collegando: qui no.
 *
 * «Collega per tutti» non apre un secondo dialogo: apre la ricerca IGDB qui
 * sotto, così si sceglie il gioco con la voce sotto gli occhi. Dalla tabella
 * il dialogo si apre con la ricerca già aperta (`searching`).
 */
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
  const tStore = useTranslations('store');
  const tKind = useTranslations('account.hiddenTab.tabs');
  const hiddenSummary = useHiddenSummary();
  const platforms = useQuery(api.platforms.list.queryOptions());
  const [search, setSearch] = useState(searching);

  // Ogni voce si apre come la chiede chi la apre.
  useEffect(() => setSearch(searching), [row, searching]);

  const platform = row?.platformSlug
    ? (platforms.data?.find((p) => p.slug === row.platformSlug)?.name ??
      row.platformSlug)
    : null;
  const pageUrl = row ? storePageUrl(row.store, row.storePage) : null;
  const hidden = row ? hiddenSummary(row, ', ') : '';

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent maxW={600}>
        <DialogHeader>
          <DialogTitle>{row?.name ?? ''}</DialogTitle>
        </DialogHeader>

        {row ? (
          <YStack gap={16}>
            <XStack gap={16} items="flex-start">
              <UnresolvedCover
                key={`${row.store}-${row.externalId}`}
                entry={row}
                width={90}
                height={128}
              />
              <YStack flex={1} minW={0} gap={6}>
                <Text fontSize={14} color="$color12">
                  {[tStore(row.store), platform].filter(Boolean).join(' · ')}
                </Text>
                <YStack>
                  <Text fontSize={12} color="$color11">
                    {t('detail.externalId')}
                  </Text>
                  {/* Intero, e selezionabile: è ciò che si copia per cercarlo. */}
                  <Text
                    fontSize={13}
                    color="$color12"
                    {...({
                      style: { wordBreak: 'break-all', userSelect: 'text' },
                    } as object)}
                  >
                    {row.externalId}
                  </Text>
                </YStack>
                <Text fontSize={13} color="$color12">
                  {t('detail.libraries', {
                    count: row.libraries,
                    visible: row.visible,
                  })}
                </Text>
                <Text fontSize={13} color="$color11">
                  {hidden
                    ? t('detail.hidden', { list: hidden })
                    : t('detail.notHidden')}
                </Text>
                {pageUrl ? (
                  <Text fontSize={13}>
                    <ExternalLink href={pageUrl}>
                      {t('detail.openOn', { store: tStore(row.store) })}
                    </ExternalLink>
                  </Text>
                ) : null}
              </YStack>
            </XStack>

            <XStack gap={8} flexWrap="wrap">
              <Button
                variant={search ? 'secondary' : 'default'}
                onPress={() => setSearch(true)}
              >
                {t('link')}
              </Button>
              <DropdownMenu align="start">
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" disabled={hidePending}>
                      {t('hide')}
                      <ChevronDown size={14} />
                    </Button>
                  }
                />
                <DropdownMenuContent>
                  {globalKinds.map((kind) => (
                    <DropdownMenuItem
                      key={kind}
                      onClick={() => onHide(row, kind)}
                    >
                      {t('hideAs', { kind: tKind(kind) })}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </XStack>

            {search ? (
              <>
                <Separator />
                <Text fontSize={13} color="$color11">
                  {t('detail.linkHint')}
                </Text>
                <IgdbPicker
                  key={`${row.store}-${row.externalId}`}
                  initialQuery={row.name}
                  pending={linkPending}
                  onPick={(hit) => onLink(row, hit)}
                />
              </>
            ) : null}
          </YStack>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
