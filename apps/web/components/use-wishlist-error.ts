import type { WishlistError } from '@repo/contracts';
import { useTranslations } from 'use-intl';

/**
 * Il perché di un import della wishlist fallito, in parole (15e). In un punto
 * solo: lo dicono la scheda dell'account, le pagine delle liste e l'avviso di
 * fine.
 */
export function useWishlistErrorText() {
  const t = useTranslations('wishlist.store.errors');
  return (code: WishlistError) =>
    code === 'not_visible'
      ? t('not_visible')
      : code === 'reauth'
        ? t('reauth')
        : t('failed');
}
