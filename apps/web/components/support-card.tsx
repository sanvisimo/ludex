import { Text, YStack } from '@repo/ui';
import { useTranslations } from 'use-intl';

import { supportUrl } from '@/lib/credits';

/**
 * «Ti piace Ludex?»: la scheda delle donazioni, in fondo alla roadmap e sotto il
 * menu dell'account (rilascio). È nostra e non il widget della piattaforma: i
 * widget pronti caricano script e cookie di terzi, che l'informativa esclude e
 * che chiederebbero un banner di consenso. Il bottone è quello ufficiale di
 * Ko-fi, beige, ma servito da noi (`public/support-kofi.png`): preso dal loro
 * CDN, ogni visita manderebbe a Ko-fi l'IP di chi guarda. Porta fuori, alla
 * pagina delle donazioni.
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
      {/* Un `<a>` con l'immagine e non il nostro `Button`: il bottone è
          l'immagine stessa, scritta in inglese («Support me on Ko-fi»), e
          `alt` lo dice nella lingua di chi guarda. Alto come i nostri
          bottoni; la larghezza la tiene l'immagine. */}
      <a
        href={supportUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start rounded-lg"
      >
        <img
          src="/support-kofi.png"
          alt={t('buttonAlt')}
          className={compact ? 'block h-8 w-auto' : 'block h-9 w-auto'}
        />
      </a>
    </YStack>
  );
}
