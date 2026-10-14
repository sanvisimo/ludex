import type { Store, UnresolvedImport } from '@repo/contracts';
import { Button, Text, XStack, YStack } from '@repo/ui';
import { Link2 } from '@repo/ui/icons';
import { Link } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { HideMenu, useHideUnresolved } from '@/components/unresolved-imports';
import { UnresolvedCover, UnresolvedRow } from '@/components/unresolved-row';
import { useStoreLabels } from '@/lib/labels';
import { ExternalLink } from '@/src/components/external-link';

/**
 * Dove cercare un titolo sul negozio, per i negozi che non danno l'indirizzo
 * della pagina. Solo Epic: né la libreria né il catalogo lo portano. Il link
 * vero arriverà da IGDB, con i link della pagina del gioco.
 */
function storeSearchUrl(store: Store, title: string) {
  return store === 'epic'
    ? `https://store.epicgames.com/browse?q=${encodeURIComponent(title)}`
    : null;
}

type Product = {
  key: string;
  main: NonNullable<UnresolvedImport['sameProduct']>;
  store: Store;
  storeName: string;
  entries: UnresolvedImport[];
};

/** Le voci in più, raggruppate per il prodotto da cui vengono. */
function byProduct(entries: UnresolvedImport[]): Product[] {
  const products = new Map<string, Product>();
  for (const entry of entries) {
    if (!entry.sameProduct) continue;
    const key = `${entry.store}:${entry.sameProduct.externalId}`;
    const product = products.get(key) ?? {
      key,
      main: entry.sameProduct,
      store: entry.store,
      storeName: entry.storeName,
      entries: [],
    };
    product.entries.push(entry);
    products.set(key, product);
  }
  return [...products.values()].sort((a, b) =>
    a.main.name.localeCompare(b.main.name),
  );
}

/**
 * I **possibili doppioni** (9a): le voci che Epic mette nello stesso prodotto
 * di un gioco già importato. Possono essere un secondo gioco — Delores dentro
 * Thimbleweed Park — o una beta, un DLC, un extra, e il catalogo non li
 * distingue: lo decide l'utente, guardando il negozio.
 *
 * Una scheda per prodotto: in testa il gioco che ludex ha preso, sotto le altre
 * voci, ciascuna con «È un gioco a sé» (il collegamento di sempre) e
 * «Nascondi». «Nascondi tutte» le nasconde con un motivo solo. Sistemate tutte,
 * la scheda non c'è più.
 */
export function PossibleDuplicates({
  entries,
  onResolve,
}: {
  /** Già filtrate: da sistemare, e voci in più di un prodotto. */
  entries: UnresolvedImport[];
  onResolve: (entry: UnresolvedImport) => void;
}) {
  const t = useTranslations('account.duplicates');
  const tHidden = useTranslations('hidden');
  const storeLabels = useStoreLabels();
  const setHidden = useHideUnresolved(t('hideFailed'));

  const products = byProduct(entries);
  if (products.length === 0) return null;

  return (
    <YStack gap={12}>
      <Text fontSize={14} lineHeight={20} color="$color11">
        {t('description')}
      </Text>

      {products.map((product) => {
        const storeName = storeLabels[product.store];
        const searchUrl = storeSearchUrl(product.store, product.main.name);

        return (
          <YStack
            key={product.key}
            gap={12}
            p={12}
            rounded={12}
            borderWidth={1}
            borderColor="$borderColor"
          >
            <XStack gap={12} items="flex-start" flexWrap="wrap">
              <UnresolvedCover
                entry={{
                  store: product.store,
                  externalId: product.main.externalId,
                  imageUrl: product.main.imageUrl,
                }}
                width={44}
                height={64}
              />
              <YStack gap={4} flex={1} minW={200}>
                {product.main.gameSlug ? (
                  <Link
                    to="/games/$slug"
                    params={{ slug: product.main.gameSlug }}
                    style={{ color: 'inherit' }}
                  >
                    <Text fontWeight="600" color="$color12">
                      {product.main.name}
                    </Text>
                  </Link>
                ) : (
                  <Text fontWeight="600" color="$color12">
                    {product.main.name}
                  </Text>
                )}
                <Text fontSize={13} lineHeight={18} color="$color11">
                  {product.main.gameSlug
                    ? t('alsoInProduct', {
                        store: storeName,
                        account: product.storeName,
                      })
                    : t('mainNotLinked', {
                        store: storeName,
                        account: product.storeName,
                      })}
                </Text>
              </YStack>
              <XStack gap={8} items="center" flexWrap="wrap">
                {searchUrl ? (
                  <ExternalLink href={searchUrl}>
                    {t('searchOn', { store: storeName })}
                  </ExternalLink>
                ) : null}
                <HideMenu
                  label={t('hideAll')}
                  disabled={setHidden.isPending}
                  onPick={(kind) =>
                    setHidden.mutate({
                      ids: product.entries.map((entry) => entry.id),
                      kind,
                    })
                  }
                />
              </XStack>
            </XStack>

            <ul style={{ display: 'grid', gap: 8, margin: 0, padding: 0 }}>
              {product.entries.map((entry) => (
                <UnresolvedRow key={entry.id} entry={entry}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onResolve(entry)}
                  >
                    <Link2 size={16} color="$color12" />
                    {t('standalone')}
                  </Button>
                  <HideMenu
                    label={tHidden('hide')}
                    disabled={setHidden.isPending}
                    onPick={(kind) =>
                      setHidden.mutate({ ids: [entry.id], kind })
                    }
                  />
                </UnresolvedRow>
              ))}
            </ul>
          </YStack>
        );
      })}
    </YStack>
  );
}
