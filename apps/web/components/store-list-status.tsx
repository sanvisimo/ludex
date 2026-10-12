import { Badge, Spinner, Text, XStack } from '@repo/ui';
import { RefreshCw } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useNow, useTranslations } from 'use-intl';

import { useWishlistErrorText } from '@/components/use-wishlist-error';
import { api } from '@/lib/orpc';

/**
 * Lo stato dell'ultimo import, sotto il titolo di una lista di negozio (15e):
 * «in importazione…», perché è fallito, oppure quando è stata aggiornata.
 *
 * Lo legge dall'account, che porta tutte e tre le cose. Un tentativo che BullMQ
 * riprova resta «in importazione»: l'errore si dice solo quando ha finito.
 */
export function StoreListStatus({ accountId }: { accountId: string }) {
  const t = useTranslations('wishlist.store');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const errorText = useWishlistErrorText();
  const accounts = useQuery(api.accounts.list.queryOptions());
  const account = accounts.data?.find((row) => row.id === accountId);
  if (!account) return null;

  if (account.wishlistSyncing) {
    return (
      <XStack items="center" gap={8}>
        <Spinner spinning>
          <RefreshCw size={14} color="$color11" />
        </Spinner>
        <Text fontSize={13} lineHeight={18} color="$color11">
          {t('syncing')}
        </Text>
      </XStack>
    );
  }

  if (account.wishlistError) {
    return (
      <XStack items="center" gap={8} flexWrap="wrap">
        <Badge variant="error">{t('errorBadge')}</Badge>
        <Text fontSize={13} lineHeight={18} color="$color11" flex={1} minW={0}>
          {errorText(account.wishlistError)}
        </Text>
      </XStack>
    );
  }

  return account.wishlistSyncedAt ? (
    <Text fontSize={13} lineHeight={18} color="$color11">
      {t('updated', {
        when: format.relativeTime(account.wishlistSyncedAt, now),
      })}
    </Text>
  ) : null;
}
