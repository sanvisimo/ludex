import type { Store } from '@repo/contracts/vocabulary';
import { Text, XStack, YStack } from '@repo/ui';
import { useTranslations } from 'use-intl';

import { UnresolvedCover } from '@/components/unresolved-row';
import { useStoreLabels } from '@/lib/labels';
import { ExternalLink } from '@/src/components/external-link';

/**
 * Una voce vista dal negozio: copertina del negozio, il nome e l'anno che le
 * dà, da dove viene, l'id, i fatti e il link alla sua pagina. È la testa di «Collega
 * al gioco giusto» e il dettaglio della copia in «Segnala un errore»: in tutti
 * e due si sceglie il gioco giusto confrontando con i risultati di IGDB, e la
 * copertina ha la loro misura.
 *
 * Più id vuol dire che non si sa quale sia: si elencano tutti, e copertina e
 * titolo non ci sono. Chi la usa la rimonta con una `key` quando cambia voce,
 * perché la copertina rotta si ricorda.
 */
export function StoreEntryCard({
  store,
  externalIds,
  imageUrl,
  title,
  releaseYear = null,
  subtitle,
  facts,
  pageUrl,
}: {
  store: Store;
  externalIds: string[];
  imageUrl: string | null;
  title: string | null;
  /** Come nei risultati di IGDB, «(2018)»: si confronta con quelli. */
  releaseYear?: number | null;
  subtitle: string;
  facts: string[];
  pageUrl: string | null;
}) {
  const t = useTranslations('account.unresolved');
  const storeLabels = useStoreLabels();
  const externalId = externalIds.length === 1 ? externalIds[0]! : null;

  return (
    <XStack gap={16} items="flex-start">
      <UnresolvedCover
        entry={{ store, externalId, imageUrl }}
        width={90}
        height={128}
      />
      <YStack flex={1} minW={0} gap={6}>
        {title ? (
          <Text fontSize={14} fontWeight="500" color="$color12">
            {releaseYear ? `${title} (${releaseYear})` : title}
          </Text>
        ) : null}
        <Text fontSize={13} color="$color11">
          {subtitle}
        </Text>
        {externalIds.length > 0 ? (
          <YStack>
            <Text fontSize={12} color="$color11">
              {t('externalId')}
            </Text>
            {/* Intero, e selezionabile: è ciò che si copia per cercarlo. */}
            <Text
              fontSize={13}
              color="$color12"
              {...({
                style: { wordBreak: 'break-all', userSelect: 'text' },
              } as object)}
            >
              {externalIds.join(', ')}
            </Text>
          </YStack>
        ) : null}
        {facts.length > 0 ? (
          <Text fontSize={13} color="$color11">
            {facts.join(' · ')}
          </Text>
        ) : null}
        {pageUrl ? (
          <Text fontSize={13}>
            <ExternalLink href={pageUrl}>
              {t('openOn', { store: storeLabels[store] })} ↗
            </ExternalLink>
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
}
