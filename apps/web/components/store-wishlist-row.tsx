import type { StoreAccount, Wishlist } from '@repo/contracts';
import { Badge, Text, XStack, YStack } from '@repo/ui';
import { Link } from '@tanstack/react-router';
import { useFormatter, useNow, useTranslations } from 'use-intl';

import { useWishlistErrorText } from '@/components/use-wishlist-error';

/**
 * La wishlist di un account, sulla sua scheda (15e): in importazione, fallita —
 * e perché — oppure quanti giochi ha e quando è stata aggiornata, col link alla
 * lista. Niente, finché non è mai stata importata e non c'è niente da dire:
 * l'azione per farlo sta nel menu della scheda.
 *
 * L'importazione in corso vince sull'errore: un tentativo che BullMQ riprova ha
 * già scritto `failed`, e quello dopo può riuscire.
 */
export function StoreWishlistRow({
  account,
  list,
}: {
  account: StoreAccount;
  /** La lista di questo account, se l'import l'ha già creata. */
  list: Wishlist | undefined;
}) {
  const t = useTranslations('wishlist.store');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const errorText = useWishlistErrorText();

  if (account.wishlistSyncing) {
    return (
      <Badge variant="warning" self="flex-start">
        {t('syncing')}
      </Badge>
    );
  }

  if (account.wishlistError) {
    return (
      <YStack gap={4}>
        <Badge variant="error" self="flex-start">
          {t('errorBadge')}
        </Badge>
        <Text fontSize={13} lineHeight={18} color="$color11">
          {errorText(account.wishlistError)}
        </Text>
      </YStack>
    );
  }

  if (!list) return null;

  return (
    <YStack gap={2}>
      <XStack items="center" gap={6} flexWrap="wrap">
        <Link
          to="/wishlist/$id"
          params={{ id: list.id }}
          style={{ color: 'inherit' }}
        >
          <Text fontSize={13} lineHeight={18} color="$color12">
            {t('summary', { count: list.count })}
          </Text>
        </Link>
      </XStack>
      {account.wishlistSyncedAt && (
        <Text fontSize={13} lineHeight={18} color="$color11">
          {t('updated', {
            when: format.relativeTime(account.wishlistSyncedAt, now),
          })}
        </Text>
      )}
    </YStack>
  );
}
