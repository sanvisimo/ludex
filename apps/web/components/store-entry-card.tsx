import { storeCoverFallbackUrl, storeCoverUrl } from '@repo/contracts';
import type { Store } from '@repo/contracts/vocabulary';
import {
  BrandIcon,
  Button,
  Text,
  toast,
  Tooltip,
  XStack,
  YStack,
} from '@repo/ui';
import { Copy } from '@repo/ui/icons';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { CoverPreview } from '@/components/cover-preview';
import { useStoreLabels } from '@/lib/labels';
import { STORE_BRAND } from '@/lib/store-brand';
import { ExternalLink } from '@/src/components/external-link';

import './game-match.css';

export function StoreEntryCard({
  store,
  externalIds,
  imageUrl,
  title,
  releaseYear = null,
  subtitle,
  facts,
  pageUrl,
  reference = false,
  children,
}: {
  store: Store;
  externalIds: string[];
  imageUrl: string | null;
  title: string | null;
  releaseYear?: number | null;
  subtitle: string;
  facts: string[];
  pageUrl: string | null;
  reference?: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations('account.unresolved');
  const tMatch = useTranslations('gameMatch');
  const storeLabels = useStoreLabels();
  const externalId = externalIds.length === 1 ? externalIds[0]! : null;
  const brand = STORE_BRAND[store];
  // Con più id non sappiamo a quale prodotto appartenga la copertina.
  const sources =
    externalId === null
      ? []
      : [
          storeCoverUrl(store, externalId, imageUrl),
          storeCoverFallbackUrl(store, externalId),
        ].filter((url): url is string => url !== null);

  return (
    <YStack
      className={reference ? 'game-match-reference' : undefined}
      {...(!reference ? { flexDirection: 'row', gap: 16 } : {})}
      minW={0}
    >
      <CoverPreview
        key={`${store}-${externalIds.join(',')}-${imageUrl}`}
        sources={sources}
        name={title ?? storeLabels[store]}
        width={90}
        desktopWidth={reference ? 160 : 90}
        fallback={brand ? <BrandIcon brand={brand} size={44} /> : undefined}
      />
      <YStack flex={1} minW={0} gap={6}>
        {title ? (
          <Text
            fontSize={reference ? 16 : 14}
            lineHeight={22}
            fontWeight="600"
            color="$color12"
            style={{ overflowWrap: 'anywhere' }}
          >
            {releaseYear ? `${title} (${releaseYear})` : title}
          </Text>
        ) : null}
        <Text fontSize={13} color="$color11">
          {subtitle}
        </Text>
        {children}
        {externalIds.length > 0 || facts.length > 0 ? (
          <details className="game-match-details">
            <summary>{tMatch('storeDetails')}</summary>
            <YStack gap={8} pt={8}>
              {externalIds.length > 0 ? (
                <YStack gap={4}>
                  <Text fontSize={12} color="$color11">
                    {t('externalId')}
                  </Text>
                  <XStack gap={4} items="center" minW={0}>
                    <Text
                      shrink={1}
                      minW={0}
                      fontSize={13}
                      color="$color12"
                      {...({
                        style: { wordBreak: 'break-all', userSelect: 'text' },
                      } as object)}
                    >
                      {externalIds.join(', ')}
                    </Text>
                    <Tooltip content={tMatch('copyId')}>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        shrink={0}
                        aria-label={tMatch('copyId')}
                        onPress={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              externalIds.join(', '),
                            );
                            toast.success(tMatch('idCopied'));
                          } catch {
                            toast.error(tMatch('copyFailed'));
                          }
                        }}
                      >
                        <Copy size={14} />
                      </Button>
                    </Tooltip>
                  </XStack>
                </YStack>
              ) : null}
              {facts.length > 0 ? (
                <Text fontSize={13} color="$color11">
                  {facts.join(' · ')}
                </Text>
              ) : null}
            </YStack>
          </details>
        ) : null}
        {pageUrl ? (
          <Text fontSize={13}>
            <ExternalLink href={pageUrl}>
              {t('openOn', { store: storeLabels[store] })} ↗
            </ExternalLink>
          </Text>
        ) : null}
      </YStack>
    </YStack>
  );
}
