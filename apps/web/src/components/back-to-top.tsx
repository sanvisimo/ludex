import { Button, XStack } from '@repo/ui';
import { ArrowUp } from '@repo/ui/icons';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';

/**
 * La freccia che riporta in cima: fissa in basso a destra, compare dopo
 * un'altezza di finestra di scorrimento.
 *
 * Parte nascosta, quindi il server e il primo render del browser coincidono e
 * l'idratazione non si rompe. `bottomOffset` è l'altezza della barra del guscio,
 * che sul telefono sta in basso e la freccia deve starle sopra: la media query
 * sta sullo `XStack`, non sul bottone, come per ogni componente di `@repo/ui`.
 */
export function BackToTop({ bottomOffset }: { bottomOffset: number }) {
  const t = useTranslations('nav');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > window.innerHeight);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  if (!visible) return null;

  return (
    <XStack
      position="fixed"
      r={16}
      b={16}
      z={9}
      $max-md={{ b: bottomOffset + 16 }}
    >
      <Button
        variant="outline"
        size="icon"
        aria-label={t('backToTop')}
        onPress={() => {
          const reduced = window.matchMedia(
            '(prefers-reduced-motion: reduce)',
          ).matches;
          window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
        }}
      >
        <ArrowUp size={16} />
      </Button>
    </XStack>
  );
}
