import type { StoreAccount } from '@repo/contracts';
import { storeAccountName, wishlistStoreValues } from '@repo/contracts';
import { Badge, Spinner, Text, XStack, YStack } from '@repo/ui';
import { RefreshCw } from '@repo/ui/icons';
import { useTranslations } from 'use-intl';

import { useWishlistErrorText } from '@/components/use-wishlist-error';
import { useStoreLabels } from '@/lib/labels';
import { ButtonLink } from '@/src/components/button-link';

/**
 * In cima a `/wishlist`: quali account stanno importando la wishlist adesso, e
 * quali hanno fallito l'ultima volta (15e).
 *
 * Serve soprattutto al primo import, quando la lista ancora non esiste e la pagina
 * sarebbe vuota mentre il job gira — e, se fallisce, vuota per sempre senza dire
 * perché. Chi ha già la lista la vede comunque sotto: qui c'è solo lo stato.
 */
export function StoreImportNotices({ accounts }: { accounts: StoreAccount[] }) {
  const t = useTranslations('wishlist.store');
  const storeLabels = useStoreLabels();
  const errorText = useWishlistErrorText();

  const rows = accounts.filter(
    (account) =>
      (wishlistStoreValues as readonly string[]).includes(account.store) &&
      // L'import in corso vince sull'errore: un tentativo che BullMQ riprova ha
      // già scritto `failed`, e quello dopo può riuscire.
      (account.wishlistSyncing || account.wishlistError),
  );
  if (rows.length === 0) return null;

  return (
    <YStack gap={8}>
      {rows.map((account) => {
        const name = `${storeLabels[account.store]} · ${storeAccountName(account)}`;
        return (
          <XStack
            key={account.id}
            items="center"
            gap={12}
            flexWrap="wrap"
            p={12}
            rounded={8}
            bg="$color3"
          >
            {account.wishlistSyncing ? (
              <>
                <Spinner spinning>
                  <RefreshCw size={16} color="$color12" />
                </Spinner>
                <Text flex={1} minW={0} fontSize={14} color="$color12">
                  {t('importingNotice', { name })}
                </Text>
              </>
            ) : (
              <>
                <Badge variant="error">{t('errorBadge')}</Badge>
                <YStack flex={1} minW={0} gap={2}>
                  <Text fontSize={14} fontWeight="500" color="$color12">
                    {name}
                  </Text>
                  <Text fontSize={13} lineHeight={18} color="$color11">
                    {account.wishlistError
                      ? errorText(account.wishlistError)
                      : null}
                  </Text>
                </YStack>
                <ButtonLink
                  href="/account/libraries"
                  variant="outline"
                  size="sm"
                >
                  {t('openLibraries')}
                </ButtonLink>
              </>
            )}
          </XStack>
        );
      })}
    </YStack>
  );
}
