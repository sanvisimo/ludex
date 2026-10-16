import { Button } from '@repo/ui';
import { ArrowUp } from '@repo/ui/icons';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';

/**
 * La freccia che riporta in cima: compare dopo un'altezza di finestra di
 * scorrimento. La posizione fissa è del guscio, che la mette sopra il dado.
 *
 * Parte nascosta, quindi il server e il primo render del browser coincidono e
 * l'idratazione non si rompe.
 */
export function BackToTop() {
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
  );
}
