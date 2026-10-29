import { Button, Text, YStack } from '@repo/ui';
import { Coffee } from '@repo/ui/icons';
import { useTranslations } from 'use-intl';

import { supportUrl } from '@/lib/credits';

/**
 * «Ti piace Ludex?»: la scheda delle donazioni, in fondo alla roadmap e sotto il
 * menu dell'account (rilascio). È nostra e non il widget della piattaforma: i
 * widget pronti caricano script e cookie di terzi, che l'informativa esclude e
 * che chiederebbero un banner di consenso. Il bottone porta fuori, alla pagina
 * della piattaforma; il resto lo decide la piattaforma scelta.
 *
 * `compact` è la forma stretta, per la colonna dell'account. Senza
 * `supportUrl` la scheda non c'è.
 */
export function SupportCard({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('support');
  if (!supportUrl) return null;

  return (
    <YStack
      gap={12}
      p={compact ? 16 : 20}
      rounded={12}
      bg="$color2"
      borderWidth={1}
      borderColor="$borderColor"
    >
      <YStack gap={4}>
        <Text
          render="h2"
          m={0}
          fontFamily="$heading"
          fontSize={compact ? 15 : 18}
          lineHeight={compact ? 22 : 26}
          fontWeight="600"
          color="$color12"
        >
          {t('title')}
        </Text>
        <Text
          fontSize={compact ? 13 : 15}
          lineHeight={compact ? 18 : 22}
          color="$color11"
          m={0}
        >
          {t(compact ? 'short' : 'text')}
        </Text>
      </YStack>
      <YStack items="flex-start">
        <Button
          variant="outline"
          render="a"
          // Come nell'invito della roadmap: `href` arriva all'`<a>`, ma i tipi
          // del Button non conoscono gli attributi del link.
          {...({
            href: supportUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
          } as object)}
        >
          <Coffee size={16} />
          {t('button')}
        </Button>
      </YStack>
    </YStack>
  );
}
