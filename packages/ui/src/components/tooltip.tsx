import type { ReactElement, ReactNode } from 'react';
import { isWeb, Paragraph, Tooltip as TooltipBase } from 'tamagui';

export type TooltipProps = {
  /**
   * Il testo del suggerimento, o un contenuto composto: in quel caso il colore
   * del testo lo sceglie chi lo passa (`color1`, sul fondo `color12`).
   */
  content: ReactNode;
  /** Il bottone a cui si attacca: uno solo, e deve poter prendere il focus. */
  children: ReactElement;
  /** Da che parte compare. */
  placement?: 'top' | 'right' | 'bottom' | 'left';
};

/**
 * Il suggerimento al passaggio del mouse o al focus da tastiera: il nome di un
 * bottone di sola icona.
 *
 * **Non è l'etichetta accessibile.** Un bottone di sola icona porta comunque il
 * suo `aria-label`: il suggerimento è per chi vede, e su un telefono, dove il
 * passaggio del mouse non esiste, non compare affatto.
 *
 * Serve anche al titolo di un gioco, col nome intero come contenuto: per
 * questo il contenuto ha una larghezza massima e va a capo.
 */
export function Tooltip({
  content,
  children,
  placement = 'top',
}: TooltipProps) {
  return (
    <TooltipBase placement={placement} delay={{ open: 400, close: 0 }}>
      <TooltipBase.Trigger asChild={isWeb ? 'web' : true}>
        {children}
      </TooltipBase.Trigger>
      <TooltipBase.Content
        px={8}
        py={4}
        rounded={6}
        maxW={280}
        bg="color12"
        transition="quick"
        opacity="1 enter:0 exit:0"
      >
        {typeof content === 'string' ? (
          <Paragraph fontSize={12} lineHeight="16px" color="color1">
            {content}
          </Paragraph>
        ) : (
          content
        )}
      </TooltipBase.Content>
    </TooltipBase>
  );
}
