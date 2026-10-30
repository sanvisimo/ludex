import type { Wishlist } from '@repo/contracts';
import {
  Badge,
  BrandIcon,
  Button,
  EmptyState,
  Skeleton,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import { Heart, Plus } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { CARD_WIDTH, HomeCard } from '@/components/home-band';
import { ScrollRow } from '@/components/scroll-row';
import { type BandDrag, SortableBands } from '@/components/sortable-bands';
import { StoreImportNotices } from '@/components/store-import-notices';
import { NewListDialog, WishlistMenu } from '@/components/wishlist-menu';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';
import { STORE_BRAND } from '@/lib/store-brand';
import { Page } from '@/src/components/page';

export const Route = createFileRoute('/_app/_private/wishlist/')({
  component: WishlistsPage,
});

/** Quante card per fascia: il resto sta nella lista aperta. */
const BAND_SIZE = 20;

/**
 * Le liste a mano (step 15b): come le playlist, una fascia per lista che scorre
 * di lato, e si riordinano trascinando l'intestazione; il nome porta alla lista
 * aperta, dove ci sono la ricerca, l'ordine e
 * le azioni sulle card. Qui si crea una lista vuota; un gioco ci arriva dalla sua
 * scheda.
 */
function WishlistsPage() {
  const t = useTranslations('wishlist');
  const [creating, setCreating] = useState(false);
  const lists = useQuery(api.wishlists.list.queryOptions());
  const rows = lists.data ?? [];
  // Gli account dicono se una wishlist si sta importando: al primo import la
  // lista non esiste ancora, e senza questo la pagina resterebbe vuota.
  const accounts = useQuery(api.accounts.list.queryOptions());
  const importing = accounts.data?.some((row) => row.wishlistSyncing) ?? false;
  // Le liste a mano e quelle dei negozi (15e), nell'ordine in cui arrivano.
  const mine = rows.filter((list) => !list.store);
  const fromStores = rows.filter((list) => list.store);

  const newList = (
    <Button variant="outline" onClick={() => setCreating(true)}>
      <Plus size={16} color="$color12" />
      {t('newList')}
    </Button>
  );

  return (
    // Larga come la home: le fasce vivono di card.
    <Page
      maxW={1280}
      title={t('title')}
      subtitle={lists.data ? t('count', { count: rows.length }) : ' '}
      actions={newList}
    >
      {accounts.data && <StoreImportNotices accounts={accounts.data} />}

      {lists.error ? (
        <Text fontSize={14} color="$red11">
          {t('error')}
        </Text>
      ) : lists.isPending ? (
        <BandSkeleton />
      ) : rows.length === 0 && importing ? null : rows.length === 0 ? (
        <EmptyState
          icon={<Heart size={24} color="$color11" />}
          title={t('emptyTitle')}
          description={t('emptyHint')}
          action={newList}
        />
      ) : (
        <YStack gap={24}>
          {/* Due sezioni solo se ci sono tutte e due: spostare su e giù vale
              dentro il proprio gruppo, e il server le ordina così. */}
          {[
            { key: 'mine', rows: mine },
            { key: 'stores', rows: fromStores },
          ].map((group) =>
            group.rows.length === 0 ? null : (
              <YStack key={group.key} gap={24}>
                {mine.length > 0 && fromStores.length > 0 && (
                  <Text
                    render="h2"
                    fontFamily="$heading"
                    fontSize={14}
                    lineHeight={20}
                    fontWeight="600"
                    color="$color11"
                    m={0}
                  >
                    {group.key === 'mine'
                      ? t('store.sections.mine')
                      : t('store.sections.stores')}
                  </Text>
                )}
                {/* Si trascina dentro il gruppo: l'elenco della query li tiene
                    tutti e due, e il server ordina per tipo. */}
                <SortableBands
                  items={group.rows}
                  queryKey={api.wishlists.list.queryKey()}
                  move={(id, position) =>
                    client.wishlists.move({ id, position })
                  }
                >
                  {(list, index, drag) => (
                    <WishlistBand
                      list={list}
                      position={{ index, count: group.rows.length }}
                      drag={drag}
                    />
                  )}
                </SortableBands>
              </YStack>
            ),
          )}
        </YStack>
      )}

      <NewListDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
}

/**
 * Una lista: nome (il link alla lista aperta), quanti giochi, il menu, e le
 * prime card. Una lista vuota resta in elenco con la sua riga: senza, non si
 * potrebbe né rinominare né eliminare. Una query per fascia, in parallelo.
 */
function WishlistBand({
  list,
  position,
  drag,
}: {
  list: Wishlist;
  position: { index: number; count: number };
  drag: BandDrag;
}) {
  const t = useTranslations('wishlist');
  const tBacklog = useTranslations('backlog');
  const storeLabels = useStoreLabels();
  const brand = list.store ? STORE_BRAND[list.store] : undefined;
  const band = useQuery(
    api.wishlists.get.queryOptions({
      input: { id: list.id, limit: BAND_SIZE, offset: 0 },
    }),
  );
  const games = band.data?.games ?? [];

  return (
    <ScrollRow
      title={drag.header(
        <XStack items="center" gap={8} shrink={1} minW={0}>
          {brand && list.store && (
            <BrandIcon
              brand={brand}
              size={20}
              label={storeLabels[list.store]}
            />
          )}
          <Link
            to="/wishlist/$id"
            params={{ id: list.id }}
            style={{ color: 'inherit', textDecoration: 'none', minWidth: 0 }}
          >
            <Text
              render="h2"
              fontFamily="$heading"
              fontSize={18}
              lineHeight={24}
              fontWeight="600"
              color="$color12"
              numberOfLines={1}
              m={0}
            >
              {list.name}
            </Text>
          </Link>
          {band.data && (
            <Text fontSize={14} lineHeight={20} color="$color11">
              {tBacklog('count', { count: band.data.total })}
            </Text>
          )}
          {list.unresolved ? (
            <Link
              to="/wishlist/$id"
              params={{ id: list.id }}
              style={{ textDecoration: 'none' }}
            >
              <Badge variant="warning">
                {t('store.unresolvedChip', { count: list.unresolved })}
              </Badge>
            </Link>
          ) : null}
          <WishlistMenu list={list} position={position} />
        </XStack>,
      )}
      itemCount={games.length}
      arrowsFromMd
    >
      {band.error ? (
        <Text fontSize={14} color="$red11">
          {t('loadFailed')}
        </Text>
      ) : band.isPending ? (
        <CardSkeletons />
      ) : games.length === 0 ? (
        <Text fontSize={14} lineHeight={20} color="$color11">
          {list.store ? t('store.emptyList') : t('emptyList')}
        </Text>
      ) : (
        games.map((game) => (
          <HomeCard key={game.id} game={game} showWishlist={false} />
        ))
      )}
    </ScrollRow>
  );
}

function CardSkeletons() {
  return Array.from({ length: 8 }).map((_, card) => (
    <Skeleton
      key={card}
      width={CARD_WIDTH}
      height={(CARD_WIDTH * 374) / 264}
      rounded={6}
    />
  ));
}

function BandSkeleton() {
  return (
    <YStack gap={24}>
      {Array.from({ length: 3 }).map((_, band) => (
        <YStack key={band} gap={8}>
          <Skeleton height={24} width={160} rounded={6} />
          <XStack gap={12} overflow="hidden">
            <CardSkeletons />
          </XStack>
        </YStack>
      ))}
    </YStack>
  );
}
